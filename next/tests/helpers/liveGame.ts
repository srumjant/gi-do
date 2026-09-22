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
  /**
   * Held fire. The live game only ever reads the four fire keys through `justPressed`
   * (index.html:1392), so this is turned into a press on its rising edge below and
   * holding it down fires exactly one arrow — the same treatment `jump` gets, and the
   * same rule the port's own `firePressed` follows.
   */
  fire: boolean;
}

/** Every field the live cat companion carries (index.html:1452). */
export interface CatSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  frame: number;
  frameTimer: number;
  scratchTimer: number;
  scratchTarget: { x: number; y: number } | null;
  hitsLeft: number;
  bounceDir: number;
  baseY: number;
  onGround: boolean;
}

/** Just the five fields a live `arrows` entry carries (index.html:1394). */
export interface ArrowSample {
  x: number;
  y: number;
  vx: number;
  life: number;
  isChicken: boolean;
}

/** Just the fields this port's EnemyState tracks — see the note on Driver.getEnemies. */
export interface EnemySample {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** Patrol frame (0/1), flipped every 15 frames — index.html:1215, 1540. */
  frame: number;
  frameTimer: number;
  /** Counts down from 30 (45 with big-head, out of scope) after a stomp — index.html:1215, 1525, 1545. */
  squashTimer: number;
}

export interface Sample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Walk-cycle frame: 0 stand, 1 run, 2 jump — index.html:1168, 1424-1429. */
  frame: number;
  frameTimer: number;
  /** The live game's top-level animFrame, read AFTER update() — index.html:995, 1275. */
  animFrame: number;
  camera: { x: number; y: number };
  enemies: EnemySample[];
  /**
   * The live game's top-level `score` (index.html:988). A run-level global like
   * animFrame above, not a per-actor field — which is why it is in the standard shape
   * rather than pulled out through `onFrame` by the one trace that cares: award sites
   * are scattered across stomps, stars, arrows, the cat, the boss and the rescue, and
   * every trace that touches any of them should be comparing this for free.
   */
  score: number;
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
  /**
   * Empties `enemies` and `pendingEnemies` right after `initLevel`, so no enemy ever
   * spawns for the rest of the run. Needed while contact damage (`playerHit`) was out
   * of the slice — without it, level 0's doll@15 killed the player by contact (frame
   * 60 running right, frame ~240 standing still — both measured), well inside any
   * player-focused trace window. Contact damage is implemented now (player.ts,
   * enemy.ts), and trace.test.ts's player-focused scripts have moved on to driving
   * WITH enemies live — dying there deliberately, in several cases — rather than
   * suppressing them, so nothing currently passes `true` here. Left in place as a
   * still-functional escape hatch for a future test that wants a player-only trace
   * genuinely isolated from enemy interference, not as a sign anything still needs it.
   */
  suppressEnemies?: boolean;
  /**
   * Optional hook run once, after initLevel/mutateMap and before the frame loop
   * starts — for setup none of the other hooks cover, such as forcing the camera or
   * the player straight to a specific spot so a scenario deep in the level (a bat or
   * bouncer streamed in far from spawn, the rescue 113 tiles away) does not need a
   * script that actually walks the player there. Receives the same driver the loop
   * itself drives, so anything `getCamera`/`getPlayer` expose can be mutated in
   * place, exactly like `mutateMap` already does for the tile grid — both `camera`
   * and `player` are live references to the script's own top-level bindings, not
   * copies (see `getCamera`'s own comment on the Driver interface below).
   */
  beforeRun?: (d: Driver) => void;
  /**
   * Optional hook run every frame, right after `update()` — for recording fields the
   * standard `Sample` shape does not carry (e.g. gameState) into the caller's own
   * side channel, without growing that shape for every trace that does not need them.
   */
  onFrame?: (d: Driver, frame: number) => void;
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

/** Exported so a DriveOptions.beforeRun/onFrame hook can be typed against it. */
export interface Driver {
  initLevel: (i: number) => void;
  setLevel: (i: number) => void;
  getLevelIndex: () => number;
  getMap: () => number[][];
  update: () => void;
  keys: Record<string, boolean>;
  justPressed: Record<string, boolean>;
  /** A live reference to the script's own top-level `player`, not a copy — mutating
   * a field on the returned object (`d.getPlayer().x = ...`) moves the live player,
   * exactly like `getCamera` below. */
  getPlayer: () => Sample & Record<string, unknown>;
  /** A live reference to the script's own top-level `camera`, not a copy — see getPlayer's own comment. */
  getCamera: () => { x: number; y: number };
  getAnimFrame: () => number;
  /** The live game's own top-level `score` (index.html:988). */
  getScore: () => number;
  /**
   * Live references to the six collections `initLevel` derives from the level record
   * and the freshly generated map (index.html:1180-1191) — the pickup tables, the
   * empty star list, and the question/rainbow block scans.
   *
   * Exists for world.test.ts's spawn-parity check, which is the only cover the
   * `dc.enemySkipChance` extra-pickup branch has: that branch fires on super_easy
   * alone, and every frame trace in this suite runs at `normal`, so no trace reaches
   * it. Reading the tables directly is the only way to compare it against the real
   * index.html. Test-helper surface only — nothing in src/ has or needs an equivalent.
   */
  getLevelSpawn: () => {
    bowPickups: unknown[];
    superPickups: unknown[];
    catPickup: unknown;
    stars: unknown[];
    questionBlocks: unknown[];
    rainbowBlocks: unknown[];
  };
  /** The live game's own `gameState` string (e.g. 'playing', 'dead', 'levelcomplete'). */
  getGameState: () => string;
  /**
   * The arrows currently in flight, as a fresh snapshot rather than a live reference —
   * unlike every other getter here. The live arrow pass REASSIGNS the top-level
   * `arrows` binding every frame (index.html:1517's `arrows=arrows.filter(...)`), so a
   * reference captured once would go stale the first time an arrow was spent; reading
   * the binding through this closure re-resolves it each call.
   */
  getArrows: () => ArrowSample[];
  /**
   * The cat companion, or null while there is none — a fresh snapshot rather than a live
   * reference, for the same reason `getArrows` above is one: the live `cat` binding is
   * REASSIGNED (index.html:1183, 1452, 1500), so a reference captured once would go
   * stale the moment the pickup spawned one or the third scratch took it away. Reading
   * the binding through this closure re-resolves it every call.
   */
  getCat: () => CatSample | null;
  /**
   * Zeroes the live script's top-level `animFrame` IN PLACE. `initLevel` never resets
   * it (its one direct assignment in the whole file is the top-level declaration
   * `animFrame=0` — every other reference is either `animFrame++` or a read), so
   * without this it carries whatever the script's own bootstrap left in it: the
   * live source's last line calls `gameLoop()` unconditionally, which runs one
   * synchronous `update()` (and so one `animFrame++`) the moment the script loads —
   * before `bootLiveGame` even calls `initLevel` — since `requestAnimationFrame` is a
   * no-op here rather than a real scheduler. That leftover +1 is real code executing
   * exactly as written, but it is an artifact of where this harness's setup calls
   * land relative to that one bootstrap frame, not a fact about the physics under
   * test, so it is zeroed here, at the same point `createWorld`'s `animFrame: 0`
   * starts the port's side — mirroring how `clearEnemies` above resets other state
   * `initLevel` does not own, in place, right after `initLevel` runs.
   */
  resetAnimFrame: () => void;
  // The live enemy objects carry extra fields depending on type (originY, sineOffset,
  // bounceTimer, shootTimer, ...) that this port does not carry over into this
  // comparison shape — hence the same `& Record<string, unknown>` widening getPlayer
  // uses, and the explicit field-by-field projection down to EnemySample in
  // driveLiveGame below. See the note on `vy` in enemy.test.ts's own bat/bouncer
  // trace comparison for why originY/sineOffset/bounceTimer specifically stay out of
  // EnemySample even though this port now has them on its own EnemyState.
  getEnemies: () => Array<EnemySample & Record<string, unknown>>;
  setDifficulty: (d: string) => void;
  setChar: (c: string) => void;
  /**
   * Empties `pendingEnemies` and `enemies` IN PLACE. `initLevel` has already bound
   * those two arrays by the time this runs (it reassigns them itself: `enemies=[];
   * pendingEnemies=lvl.enemyDefs.map(...)`), so truncating with `.length = 0` clears
   * the very arrays every closure in the live script — `update`'s spawn window and
   * its enemy step — already holds, rather than handing them a new array under a
   * reassignment that (being a top-level `let`) could sever from what those other
   * closures still reference.
   */
  clearEnemies: () => void;
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
  getAnimFrame: () => animFrame,
  getScore: () => score,
  getLevelSpawn: () => ({ bowPickups, superPickups, catPickup, stars, questionBlocks, rainbowBlocks }),
  getGameState: () => gameState,
  getArrows: () => arrows.map(a => ({ x: a.x, y: a.y, vx: a.vx, life: a.life, isChicken: !!a.isChicken })),
  getCat: () => cat && ({ x: cat.x, y: cat.y, vx: cat.vx, vy: cat.vy, facing: cat.facing,
    frame: cat.frame, frameTimer: cat.frameTimer, scratchTimer: cat.scratchTimer,
    scratchTarget: cat.scratchTarget && ({ x: cat.scratchTarget.x, y: cat.scratchTarget.y }),
    hitsLeft: cat.hitsLeft, bounceDir: cat.bounceDir, baseY: cat.baseY, onGround: !!cat.onGround }),
  resetAnimFrame: () => { animFrame = 0; },
  getEnemies: () => enemies,
  clearEnemies: () => { pendingEnemies.length = 0; enemies.length = 0; },
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
  // Also after initLevel, though initLevel itself never touches animFrame (see
  // resetAnimFrame's own comment) — this just puts it at the same starting point,
  // zero, that createWorld gives the port, undoing the one bootstrap `update()` call
  // the live script's own trailing `gameLoop();` already made before initLevel ran.
  d.resetAnimFrame();
  // After initLevel: initLevel is what (re)builds enemies/pendingEnemies in the first
  // place, so clearing any earlier would just be overwritten.
  if (opts.suppressEnemies) d.clearEnemies();
  // After initLevel, because initLevel is what builds the map.
  opts.mutateMap?.(d.getMap());
  // After everything above: whatever setup this run needs beyond a map edit (forcing
  // the camera or the player to a specific spot — see the option's own comment).
  opts.beforeRun?.(d);

  const trace: Sample[] = [];
  let prev: FrameInput = { left: false, right: false, jump: false, fire: false };

  for (let f = 0; f < opts.frames; f++) {
    const held = opts.input(f);

    d.keys.ArrowLeft = held.left;
    d.keys.ArrowRight = held.right;
    d.keys.Space = held.jump;
    // update() calls clearJP() at the end of every branch, so a press flag must be set
    // on the exact frame it applies to. Rising edge only.
    if (held.jump && !prev.jump) d.justPressed.Space = true;
    // The four fire keys (KeyX, KeyZ, ShiftRight, ControlRight) are interchangeable —
    // index.html:1392 ORs them — so driving one is driving all four, and KeyX is the
    // one on the on-screen instructions (index.html:175). `keys` is deliberately NOT
    // set for it: the live game never reads the fire keys held, and setting it would
    // hide a port that wrongly did.
    if (held.fire && !prev.fire) d.justPressed.KeyX = true;

    d.update();
    prev = held;
    opts.onFrame?.(d, f);

    const p = d.getPlayer();
    const cam = d.getCamera();
    const anim = d.getAnimFrame();
    const enemies = d.getEnemies().map((e) => ({
      type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: !!e.alive,
      frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
    }));
    trace.push({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: !!p.onGround,
      frame: p.frame, frameTimer: p.frameTimer, animFrame: anim,
      camera: { x: cam.x, y: cam.y },
      enemies,
      score: d.getScore(),
    });
  }
  return trace;
}
