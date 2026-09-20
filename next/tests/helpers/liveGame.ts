// Drives the LIVE game's real physics in a Node VM, so the port can be compared against
// the running original rather than against a description of it. The whole inline script
// evaluates under a DOM shim (the same trick scripts/run-tests.js uses), initLevel() sets
// up a level, and update() can then be stepped with key state injected.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const LEGACY_HTML = path.resolve(here, '../../../index.html');

export interface FrameInput {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/** Just the fields this port's EnemyState tracks — see the note on Driver.getEnemies. */
export interface EnemySample {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

export interface Sample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  camera: { x: number; y: number };
  enemies: EnemySample[];
}

export interface DriveOptions {
  level: number;
  difficulty: 'super_easy' | 'easy' | 'normal' | 'hard';
  character: 'gigi' | 'dodo';
  frames: number;
  /** Held state for each frame. Presses are derived from the rising edge. */
  input: (frame: number) => FrameInput;
  /**
   * Optional hook to edit the live game's tile map after the level is built, so
   * scenarios the stock levels do not contain can still be driven against the real
   * implementation rather than only unit-tested. No level has a vertical wall at player
   * height, for instance — makeGround writes two bottom rows and addPlats writes single
   * rows, so nothing stacks.
   */
  mutateMap?: (map: number[][]) => void;
}

const noop = (): void => {};

function makeCanvasCtx(): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      if (p === 'getImageData' || p === 'createImageData') {
        return () => ({ data: new Uint8ClampedArray(4) });
      }
      if (p in t) return t[p as string];
      return noop;
    },
    set(t, p, v) { t[p as string] = v; return true; },
  });
}

function makeEl(): Record<string, unknown> {
  return {
    width: 640, height: 400, textContent: '', title: '', style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop,
    focus: noop, click: noop, toDataURL: () => 'data:,',
    getContext: () => makeCanvasCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
  };
}

/** A silent AudioContext. initLevel calls startBGM, so this must not throw. */
function makeAudioCtx(): unknown {
  const param = () => ({
    setValueAtTime: noop, linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop, value: 0,
  });
  return {
    currentTime: 0, destination: {},
    createOscillator: () => ({
      type: '', frequency: param(), connect: noop, start: noop, stop: noop,
    }),
    createGain: () => ({ gain: param(), connect: noop }),
  };
}

interface Driver {
  initLevel: (i: number) => void;
  setLevel: (i: number) => void;
  getLevelIndex: () => number;
  getMap: () => number[][];
  update: () => void;
  keys: Record<string, boolean>;
  justPressed: Record<string, boolean>;
  getPlayer: () => Sample & Record<string, unknown>;
  getCamera: () => { x: number; y: number };
  // The live enemy objects carry extra fields depending on type (originY, sineOffset,
  // shootTimer, ...) that this port does not model — hence the same
  // `& Record<string, unknown>` widening getPlayer uses, and the explicit field-by-field
  // projection down to EnemySample in driveLiveGame below.
  getEnemies: () => Array<EnemySample & Record<string, unknown>>;
  setDifficulty: (d: string) => void;
  setChar: (c: string) => void;
}

let cachedSource: string | null = null;

function legacySource(): string {
  if (cachedSource === null) {
    const html = fs.readFileSync(LEGACY_HTML, 'utf8');
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`No inline <script> in ${LEGACY_HTML}`);
    cachedSource = m[1];
  }
  return cachedSource;
}

function bootLiveGame(): Driver {
  const sandbox: Record<string, unknown> = {
    document: {
      getElementById: () => makeEl(), createElement: () => makeEl(),
      body: makeEl(), documentElement: makeEl(), addEventListener: noop,
      exitFullscreen: noop, fullscreenElement: null,
    },
    window: {
      addEventListener: noop, innerWidth: 1280, innerHeight: 800,
      devicePixelRatio: 1, AudioContext: function () { return makeAudioCtx(); },
    },
    localStorage: { getItem: () => null, setItem: noop },
    navigator: { getGamepads: () => [] },
    screen: { orientation: { lock: noop } },
    location: { search: '' },
    requestAnimationFrame: noop, setTimeout: noop, clearTimeout: noop,
    console: { log: noop, error: noop, warn: noop },
    // Deterministic: landing dust and particles call Math.random. They do not move the
    // player, but a fixed source keeps traces byte-reproducible.
    Math: Object.create(Math, { random: { value: () => 0.5 } }),
    Date, JSON, Object, Array, String, Number, Boolean, Map, Set, WeakMap,
    Infinity, NaN, parseInt, parseFloat, isNaN,
  };
  vm.createContext(sandbox);

  // Top-level const/let do not attach to the sandbox global, so the handles are exported
  // from inside the same script.
  const expose = `
;this.__drive = {
  initLevel, update, keys, justPressed,
  getPlayer: () => player,
  getCamera: () => camera,
  getEnemies: () => enemies,
  setDifficulty: (d) => { selectedDifficulty = d; },
  setChar: (c) => { selectedChar = c; },
  setLevel: (i) => { currentLevel = i; },
  getLevelIndex: () => currentLevel,
  getMap: () => map,
};`;
  vm.runInContext(legacySource() + expose, sandbox, { filename: 'live-game' });
  return sandbox.__drive as Driver;
}

/**
 * The level index the live game is actually collided against, after a drive is set up.
 * Exists because `initLevel(idx)` builds the map from LEVELS[idx] but does not set
 * `currentLevel` — the live game's own callers do that separately, and getTile,
 * findGroundY and the pit check all read LEVELS[currentLevel].
 */
export function levelIndexAfterSetup(level: number): number {
  const d = bootLiveGame();
  d.setChar('gigi');
  d.setDifficulty('normal');
  d.setLevel(level);
  d.initLevel(level);
  return d.getLevelIndex();
}

/** Runs an input script against the live game and returns one sample per frame. */
export function driveLiveGame(opts: DriveOptions): Sample[] {
  const d = bootLiveGame();
  d.setChar(opts.character);
  d.setDifficulty(opts.difficulty);
  // initLevel(idx) builds the map from LEVELS[idx] but does NOT set currentLevel — the
  // live game's callers do that separately. getTile, findGroundY and the pit check all
  // read LEVELS[currentLevel], so without this the driver would collide one level's map
  // against another level's dimensions. Invisible at level 0; wrong everywhere else.
  d.setLevel(opts.level);
  d.initLevel(opts.level);
  // After initLevel, because initLevel is what builds the map.
  opts.mutateMap?.(d.getMap());

  const trace: Sample[] = [];
  let prev: FrameInput = { left: false, right: false, jump: false };

  for (let f = 0; f < opts.frames; f++) {
    const held = opts.input(f);

    d.keys.ArrowLeft = held.left;
    d.keys.ArrowRight = held.right;
    d.keys.Space = held.jump;
    // update() calls clearJP() at the end of every branch, so a press flag must be set
    // on the exact frame it applies to. Rising edge only.
    if (held.jump && !prev.jump) d.justPressed.Space = true;

    d.update();
    prev = held;

    const p = d.getPlayer();
    const cam = d.getCamera();
    const enemies = d.getEnemies().map((e) => ({
      type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: !!e.alive,
    }));
    trace.push({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: !!p.onGround,
      camera: { x: cam.x, y: cam.y },
      enemies,
    });
  }
  return trace;
}
