# Phaser Migration, Plan 2: Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make level 1 playable on Phaser — running, jumping and stomping one enemy — drawn as flat coloured rectangles, and prove it moves identically to the live game by driving both headlessly and comparing frame by frame.

**Architecture:** The game's physics ports as **pure functions**, not Arcade Physics bodies (see below). A Phaser scene owns rendering, input and the 60Hz accumulator; it calls `stepWorld(world, input)` once per tick and draws the result. That split is what makes the physics drivable headlessly, which is what makes golden traces possible.

**Tech Stack:** Phaser 4.2.1, Vite, TypeScript (strict), Vitest.

**Read first:** `docs/superpowers/specs/2026-09-20-phaser-migration-design.md`, and the Plan 1 foundation in `next/`.

---

## Why this plan exists, and what "done" means

This is the **validation gate** for the whole migration. Everything after it is refinement;
if this fails, walking away is still cheap.

It is deliberately ugly. No sprites, no felt, no parallax, no HUD, no menus, no sound, no
gamepad, no touch. Coloured rectangles on a dark background. The only question it answers
is whether the game *moves* the same, and every hour spent making it look right is an hour
spent not answering that.

**Done means both of these, not either:**

1. **Golden traces match.** The live game and the port take an identical input script and
   their player and enemy state agree frame by frame, to the decimal.
2. **The kids play it and say it feels the same.** Numbers cannot detect that Phaser's
   input latency or presentation feels different in a real browser. Children can.

## Why not Arcade Physics

The spec originally said the player and ground-patrol enemies would get real Arcade bodies.
They do not, and the reason is worth stating plainly because it narrows what Phaser buys.

The live collision is a hand-rolled X-then-Y sweep against the tile grid with specific
probe insets and specific snap formulas:

```js
if(p.vx>0){ if(isSolid(getTile(pR,pT))||isSolid(getTile(pR,pB))||isSolid(getTile(pR,pT+(pB-pT)/2)))
  { p.x=Math.floor(pR/TILE)*TILE-p.w+1; p.vx=0; } }
```

Note the `+1`. Arcade Physics separates bodies with its own logic and would produce
*approximately* the same motion. Approximately is fine for "feels about right"; it is not
fine for "traces match to the decimal", which is the bar this plan is held to.

So: **Phaser renders, runs scenes, owns the camera and reads input. The game keeps its own
physics.** That is less than the spec promised, and it is the honest consequence of
bug-compatibility. Arcade Physics remains available later for anything new the kids ask
for, where there is no old behaviour to match.

## The headless-driving discovery this plan depends on

The live game's real player physics **can be driven in a Node VM**. This was verified, not
assumed: the whole inline script evaluates under the same shim `scripts/run-tests.js` uses,
`initLevel(0)` runs, and `update()` can be stepped with key state injected into the live
`keys` / `justPressed` objects. A 70-frame run produced real numbers — acceleration to
`vx 2.5` (matching `playerSpeed` on normal), a jump opening at `vy -7.1` (`jumpForce -7.5`
plus one frame of gravity), and a landing at frame 60.

That is the instrument. Without it this plan would be "play it and see".

Two things the driver must control for:

- **`Math.random`** is called by landing dust and particles. It does not touch player
  position, but stub it on both sides anyway so a trace is reproducible.
- **`justPressed` is cleared by `update()`** via `clearJP()`, so the driver must set press
  flags fresh on each frame they apply to, not once.

---

## File structure

```
next/src/
  game/
    types.ts            PlayerState, EnemyState, World, InputState — plain data
    tiles.ts            getTile / isSolid over a TileMap
    player.ts           stepPlayer(player, input, world) — pure, no Phaser
    enemy.ts            stepEnemy(enemy, player, world) + resolveStomp — pure
    world.ts            createWorld(levelIndex, difficulty), stepWorld(world, input)
  input/
    actions.ts          Action union + InputState + emptyInput()
    keyboard.ts         Phaser keyboard -> InputState  (the only Phaser-aware input code)
  scenes/
    SliceScene.ts       60Hz accumulator, rectangle rendering, camera
next/tests/
  helpers/liveGame.ts   drives the LIVE index.html headlessly, returns traces
  helpers/inputScript.ts  shared input scripts, used by both sides
  tiles.test.ts
  player.test.ts
  enemy.test.ts
  trace.test.ts         THE gate: live vs port, frame by frame
```

`src/game/` must not import Phaser. That is not a style preference — it is what lets the
same code run in a VM next to the live game. A test enforces it.

---

## Task 1: Drive the live game headlessly

**Files:**
- Create: `next/tests/helpers/liveGame.ts`
- Test: `next/tests/helpers/liveGame.test.ts`

Everything downstream depends on this. It productises the probe that proved the approach.

- [ ] **Step 1: Write the failing test**

Create `next/tests/helpers/liveGame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './liveGame';

describe('live game driver', () => {
  it('runs a level and returns one sample per frame', () => {
    const trace = driveLiveGame({
      level: 0,
      difficulty: 'normal',
      character: 'gigi',
      frames: 20,
      input: () => ({ left: false, right: true, jump: false }),
    });
    expect(trace.length).toBe(20);
    expect(trace[0]).toHaveProperty('x');
    expect(trace[0]).toHaveProperty('vy');
  });

  it('accelerates right up to the difficulty speed cap', () => {
    const trace = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: 30,
      input: () => ({ left: false, right: true, jump: false }),
    });
    expect(trace[29].vx).toBeCloseTo(2.5, 5); // DIFFICULTY_CONFIG.normal.playerSpeed
    expect(trace[29].x).toBeGreaterThan(trace[0].x);
  });

  it('is deterministic — the same script twice gives the same trace', () => {
    const script = {
      level: 0, difficulty: 'normal' as const, character: 'gigi' as const, frames: 60,
      input: (f: number) => ({ left: false, right: true, jump: f >= 20 && f < 30 }),
    };
    expect(driveLiveGame(script)).toEqual(driveLiveGame(script));
  });

  it('jumps when told to, and comes back down', () => {
    const trace = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: 60,
      input: (f) => ({ left: false, right: false, jump: f >= 10 && f < 25 }),
    });
    const apex = Math.min(...trace.map((s) => s.y));
    expect(apex).toBeLessThan(trace[0].y);            // it went up
    expect(trace[59].y).toBeGreaterThan(apex);        // and came back down
    expect(trace[59].onGround).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, see it fail**

Run: `cd next && npx vitest run tests/helpers/liveGame.test.ts`
Expected: FAIL — `Cannot find module './liveGame'`.

- [ ] **Step 3: Write the driver**

Create `next/tests/helpers/liveGame.ts`:

```ts
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

export interface Sample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface DriveOptions {
  level: number;
  difficulty: 'super_easy' | 'easy' | 'normal' | 'hard';
  character: 'gigi' | 'dodo';
  frames: number;
  /** Held state for each frame. Presses are derived from the rising edge. */
  input: (frame: number) => FrameInput;
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
  update: () => void;
  keys: Record<string, boolean>;
  justPressed: Record<string, boolean>;
  getPlayer: () => Sample & Record<string, unknown>;
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
  setDifficulty: (d) => { selectedDifficulty = d; },
  setChar: (c) => { selectedChar = c; },
};`;
  vm.runInContext(legacySource() + expose, sandbox, { filename: 'live-game' });
  return sandbox.__drive as Driver;
}

/** Runs an input script against the live game and returns one sample per frame. */
export function driveLiveGame(opts: DriveOptions): Sample[] {
  const d = bootLiveGame();
  d.setChar(opts.character);
  d.setDifficulty(opts.difficulty);
  d.initLevel(opts.level);

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
    trace.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: !!p.onGround });
  }
  return trace;
}
```

- [ ] **Step 4: Run the test**

Run: `cd next && npx vitest run tests/helpers/liveGame.test.ts`
Expected: PASS, 4 tests.

If `initLevel` throws, read the error: the shim is missing something. Add the minimum to
the sandbox, do not weaken the test, and never edit `index.html`.

- [ ] **Step 5: Verify the build and whole suite**

Run: `cd next && npm run build && npm test`
Expected: clean, and every existing test still passing.

- [ ] **Step 6: Commit**

```bash
git add next/tests/helpers/liveGame.ts next/tests/helpers/liveGame.test.ts
git commit -m "test: drive the live game's real physics headlessly

The whole inline script evaluates in a VM, initLevel sets up a level, and
update() steps with key state injected — so the port can be compared
against the running original frame by frame rather than against a
description of it. Math.random is stubbed so traces are reproducible, and
press flags are set on the rising edge because update() clears them."
```

---

## Task 2: Tile queries

**Files:**
- Create: `next/src/game/types.ts`
- Create: `next/src/game/tiles.ts`
- Test: `next/tests/tiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `next/tests/tiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { LEVELS } from '../src/data/levels';
import { getTile, isSolid } from '../src/game/tiles';

const legacy = loadLegacySection({
  from: '//  LEVELS',
  to: '//  GAME STATE',
  expose: ['LEVELS'],
});

const map = LEVELS[0].generate(DIFFICULTY_CONFIG.normal);

describe('isSolid matches the live game', () => {
  // The live rule is an explicit list of four codes (index.html:1138), not "non-zero".
  it.each([[0, false], [1, true], [2, true], [3, true], [4, false], [5, true], [6, false]])(
    'tile %i solid = %s', (code, expected) => {
      expect(isSolid(code)).toBe(expected);
    },
  );
});

describe('getTile matches the live game', () => {
  it('reads by pixel coordinate, flooring to the tile grid', () => {
    // Bottom two rows of every level are ground.
    const groundY = (LEVELS[0].height - 1) * 16;
    expect(getTile(map, 32, groundY)).toBe(1);
    expect(getTile(map, 47, groundY)).toBe(1); // same tile, right edge
    expect(getTile(map, 48, groundY)).toBe(1); // next tile
  });

  it('returns a solid value outside the map so the player cannot leave sideways', () => {
    // index.html:1137 — out of bounds reads as 1, not 0.
    expect(getTile(map, -8, 0)).toBe(1);
    expect(getTile(map, LEVELS[0].width * 16 + 8, 0)).toBe(1);
  });

  it('agrees with the live implementation across a dense sample of the level', () => {
    const live = legacy.LEVELS[0].generate(DIFFICULTY_CONFIG.normal);
    for (let ty = 0; ty < LEVELS[0].height; ty++) {
      for (let tx = 0; tx < LEVELS[0].width; tx++) {
        expect(getTile(map, tx * 16 + 8, ty * 16 + 8)).toBe(live[ty][tx]);
      }
    }
  });
});
```

Before writing the module, **read `index.html`'s `getTile` and `isSolid`** (search for
`function getTile`). If out-of-bounds does not return 1, fix the test to match the live
behaviour — the live game is the specification.

- [ ] **Step 2: Run it, see it fail**

Run: `cd next && npx vitest run tests/tiles.test.ts`
Expected: FAIL — `Cannot find module '../src/game/tiles'`.

- [ ] **Step 3: Write the modules**

Create `next/src/game/types.ts`:

```ts
import type { TileMap } from '../data/levels';
import type { DifficultyRecord } from '../config/difficulty';
import type { Level } from '../data/levels';

/**
 * Plain data, no methods, no Phaser. Everything in src/game/ operates on these so the
 * same code can run inside a Phaser scene and inside a Node VM next to the live game.
 */
export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  facing: 1 | -1;
  coyoteTime: number;
  jumpBuffer: number;
}

export interface EnemyState {
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  alive: boolean;
}

export interface World {
  level: Level;
  map: TileMap;
  dc: DifficultyRecord;
  player: PlayerState;
  enemies: EnemyState[];
  /** Frames since the level started. Everything here is frame-counted, not seconds. */
  frame: number;
}
```

Create `next/src/game/tiles.ts` as a port of the live `getTile`/`isSolid` — read them
first and reproduce them exactly, including the out-of-bounds behaviour.

- [ ] **Step 4: Run the test** → PASS.

- [ ] **Step 5: Build and commit**

```bash
cd next && npm run build && npm test
git add next/src/game/ next/tests/tiles.test.ts
git commit -m "feat: port the tile queries

isSolid is an explicit list of four codes, not 'non-zero' — they coincide
only because tile 4 is never written. Out-of-bounds reads as solid, which
is what stops the player walking off the side."
```

---

## Task 3: The player controller

**Files:**
- Create: `next/src/input/actions.ts`
- Create: `next/src/game/player.ts`
- Test: `next/tests/player.test.ts`

This is the feel-critical code. **Read `index.html` lines 1361–1423 before writing
anything** — the order of operations matters as much as the numbers.

Details that are easy to get wrong and that the traces will catch:

- The jump buffer is set to 8 on the press frame and then **decremented in the same
  frame**, so it is 7 by the time the jump check runs.
- Apex hang applies **only while rising**: `gMul = vy > 0 ? 1.2 : (isApex ? 0.6 : 1.0)`,
  so a slow *fall* takes the 1.2 branch even though `|vy| < 1.5`.
- Horizontal is a clamped add (`Math.min(vx + accel, speed)`), and deceleration is
  multiplicative with a snap to zero below 0.12.
- The variable jump cut clamps to `jumpForce * 0.4`, which is negative.
- X resolution snaps to `Math.floor(edge / TILE) * TILE - w + 1` going right — the `+1`
  is real.
- X probes inset by 2 and use three points (top, bottom, middle); Y probes inset by 3 and
  use two.
- `p.x` is clamped to `>= 0`; there is no right-hand clamp.

- [ ] **Step 1: Write the input type**

Create `next/src/input/actions.ts`:

```ts
/**
 * What the game can be told to do, independent of how. The live game synthesises fake
 * KeyboardEvent codes from three sources and clears them by hand on every early return;
 * this replaces that with one value rebuilt per step.
 */
export interface InputState {
  /** Held this step. */
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Rising edge — true only on the step the button went down. */
  jumpPressed: boolean;
}

export function emptyInput(): InputState {
  return { left: false, right: false, jump: false, jumpPressed: false };
}
```

- [ ] **Step 2: Write the failing test**

Create `next/tests/player.test.ts`. These are unit tests of individual behaviours; the
frame-exact comparison lives in Task 7. Cover at minimum:

```ts
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { LEVELS } from '../src/data/levels';
import { emptyInput } from '../src/input/actions';
import { createPlayer, stepPlayer } from '../src/game/player';
import type { World } from '../src/game/types';

function world(): World {
  const level = LEVELS[0];
  const dc = DIFFICULTY_CONFIG.normal;
  return { level, map: level.generate(dc), dc, player: createPlayer(level), enemies: [], frame: 0 };
}

describe('horizontal movement', () => {
  it('accelerates to the difficulty speed cap and no further', () => {
    const w = world();
    const input = { ...emptyInput(), right: true };
    for (let i = 0; i < 60; i++) stepPlayer(w, input);
    expect(w.player.vx).toBeCloseTo(DIFFICULTY_CONFIG.normal.playerSpeed, 5);
  });

  it('decelerates multiplicatively and snaps to zero below 0.12', () => {
    const w = world();
    const right = { ...emptyInput(), right: true };
    for (let i = 0; i < 30; i++) stepPlayer(w, right);
    const idle = emptyInput();
    for (let i = 0; i < 60; i++) stepPlayer(w, idle);
    expect(w.player.vx).toBe(0);
  });
});

describe('jumping', () => {
  it('opens the jump at the difficulty jump force, less one frame of gravity', () => {
    const w = world();
    const idle = emptyInput();
    for (let i = 0; i < 10; i++) stepPlayer(w, idle); // settle on the ground
    stepPlayer(w, { ...emptyInput(), jump: true, jumpPressed: true });
    expect(w.player.vy).toBeCloseTo(DIFFICULTY_CONFIG.normal.jumpForce + 0.4, 5);
    expect(w.player.onGround).toBe(false);
  });

  it('cuts the jump short when the button is released while rising', () => {
    const w = world();
    const idle = emptyInput();
    for (let i = 0; i < 10; i++) stepPlayer(w, idle);
    stepPlayer(w, { ...emptyInput(), jump: true, jumpPressed: true });
    stepPlayer(w, idle); // released
    expect(w.player.vy).toBeGreaterThanOrEqual(DIFFICULTY_CONFIG.normal.jumpForce * 0.4);
  });

  // Level 1's ground has a gap at tile x 20-22 (verified against the generated map).
  // The player starts at tile x 2, so running right walks off that ledge.
  function runRightUntilAirborne(w: World, limit = 400): number {
    const right = { ...emptyInput(), right: true };
    for (let f = 0; f < limit; f++) {
      stepPlayer(w, right);
      if (!w.player.onGround) return f;
    }
    throw new Error('never left the ground — level geometry changed?');
  }

  it('allows a jump within coyote time after leaving the ground', () => {
    const w = world();
    runRightUntilAirborne(w);
    expect(w.player.onGround).toBe(false);
    const fallingVy = w.player.vy;
    // Coyote time is 6 frames; jump on the 3rd frame after leaving the ledge.
    stepPlayer(w, { ...emptyInput(), right: true });
    stepPlayer(w, { ...emptyInput(), right: true });
    stepPlayer(w, { ...emptyInput(), right: true, jump: true, jumpPressed: true });
    expect(w.player.vy).toBeLessThan(fallingVy); // went upward instead of continuing to fall
    expect(w.player.vy).toBeLessThan(0);
  });

  it('does not allow a jump once coyote time has run out', () => {
    const w = world();
    runRightUntilAirborne(w);
    const right = { ...emptyInput(), right: true };
    for (let i = 0; i < 10; i++) stepPlayer(w, right); // well past 6 frames
    const before = w.player.vy;
    stepPlayer(w, { ...right, jump: true, jumpPressed: true });
    expect(w.player.vy).toBeGreaterThan(before); // still falling, gravity only
  });

  it('buffers a jump pressed just before landing', () => {
    const w = world();
    const idle = emptyInput();
    for (let i = 0; i < 10; i++) stepPlayer(w, idle);
    stepPlayer(w, { ...idle, jump: true, jumpPressed: true });

    // Fall back down, pressing jump again while still airborne but close to the ground.
    let pressedAt = -1;
    for (let i = 0; i < 120; i++) {
      const aboutToLand = w.player.vy > 0 && !w.player.onGround;
      const press = aboutToLand && pressedAt < 0 && i > 20;
      if (press) pressedAt = i;
      stepPlayer(w, press ? { ...idle, jump: true, jumpPressed: true } : idle);
      if (pressedAt >= 0 && i > pressedAt && w.player.vy < 0) {
        // The buffered press fired on landing, within the 8-frame window.
        expect(i - pressedAt).toBeLessThanOrEqual(8);
        return;
      }
    }
    throw new Error('buffered jump never fired');
  });
});

describe('collision', () => {
  // Level 1 has no vertical wall at player height — makeGround writes two bottom rows
  // and addPlats writes single-row platforms, so nothing stacks. X resolution is
  // therefore unit-tested against a synthetic map; the trace suite exercises whatever
  // the real levels actually offer (see Task 7).
  it('stops at a wall instead of passing through it', () => {
    const w = world();
    const groundRow = w.level.height - 2;
    const startTx = Math.floor(w.player.x / 16);
    // Build a solid column a few tiles to the right, spanning the player's full height.
    const wallTx = startTx + 4;
    for (let ty = groundRow - 3; ty < groundRow; ty++) w.map[ty][wallTx] = 1;

    const right = { ...emptyInput(), right: true };
    for (let i = 0; i < 120; i++) stepPlayer(w, right);

    expect(w.player.vx).toBe(0);
    expect(w.player.x + w.player.w).toBeLessThanOrEqual(wallTx * 16 + 1);
  });

  it('cannot walk off the left edge of the world', () => {
    const w = world();
    const left = { ...emptyInput(), left: true };
    for (let i = 0; i < 200; i++) stepPlayer(w, left);
    expect(w.player.x).toBeGreaterThanOrEqual(0);
  });
});
```

`runRightUntilAirborne` deliberately throws rather than returning a sentinel if the player
never leaves the ground: that would mean the level geometry moved under the test, and a
silent pass would be worse than a failure. The wall test is the one place a synthetic map
is used, and the comment above it says why.

- [ ] **Step 3: Run it, see it fail.**

- [ ] **Step 4: Write `next/src/game/player.ts`**

Port lines 1361–1423, minus the parts that are out of scope for the slice: no shooting, no
fart/bighead power-ups, no landing dust particles, no question/rainbow block bumps, no pit
death yet (Task 5 adds the enemy; pit death is Task 6). Keep everything that moves the
player.

Export `createPlayer(level)` building the state the live `initLevel` builds
(`index.html:1167` — `w = spriteW - 4`, `h = spriteH - 4`, positioned from
`level.playerStart`), and `stepPlayer(world, input)` doing one tick.

**Do not reorder the operations.** Horizontal, then coyote, then buffer, then jump, then
the variable cut, then gravity, then X move and resolve, then Y move and resolve.

- [ ] **Step 5: Run the test** → PASS.

- [ ] **Step 6: Build and commit**

```bash
cd next && npm run build && npm test
git add next/src/input/actions.ts next/src/game/player.ts next/tests/player.test.ts
git commit -m "feat: port the player controller as pure functions

Not Arcade Physics: the live collision is a hand-rolled X-then-Y sweep with
specific probe insets and snap formulas, and Arcade would reproduce it
approximately rather than exactly. Approximately fails the frame-by-frame
comparison this migration is held to.

Order of operations is load-bearing — the jump buffer is set to 8 and
decremented in the same frame, and apex hang applies only while rising."
```

---

## Task 4: The world and the fixed step

**Files:**
- Create: `next/src/game/world.ts`
- Test: extend `next/tests/player.test.ts` or add `next/tests/world.test.ts`

- [ ] **Step 1: Write `createWorld` and `stepWorld`**

```ts
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../config/difficulty';
import { LEVELS } from '../data/levels';
import type { InputState } from '../input/actions';
import { createPlayer, stepPlayer } from './player';
import type { World } from './types';

export function createWorld(levelIndex: number, difficulty: DifficultyKey): World {
  const level = LEVELS[levelIndex];
  const dc = DIFFICULTY_CONFIG[difficulty];
  return {
    level,
    map: level.generate(dc),
    dc,
    player: createPlayer(level),
    enemies: [],
    frame: 0,
  };
}

/** One simulation tick. Called at exactly STEP_HZ regardless of display refresh. */
export function stepWorld(world: World, input: InputState): void {
  stepPlayer(world, input);
  world.frame++;
}
```

Enemies are added to `stepWorld` in Task 5.

- [ ] **Step 2: Write a test that `src/game/` never imports Phaser**

Add to a test file:

```ts
import fs from 'node:fs';
import path from 'node:path';

it('src/game stays free of Phaser so it can run headlessly', () => {
  const dir = path.resolve(__dirname, '../src/game');
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(source, `${file} imports Phaser`).not.toMatch(/from ['"]phaser['"]/);
  }
});
```

This is not pedantry. The moment `src/game/` imports Phaser, it stops being drivable in a
VM and the golden traces — the whole validation instrument — stop working.

- [ ] **Step 3: Build, test, commit.**

---

## Task 5: The patrolling enemy and stomping

**Files:**
- Create: `next/src/game/enemy.ts`
- Modify: `next/src/game/world.ts` (spawn and step enemies)
- Test: `next/tests/enemy.test.ts`

**Read `index.html` lines 1524–1547 first.** The relevant parts:

Gravity and floor, for enemies without `noGravity`:
```js
e.vy+=GRAVITY; if(e.vy>8)e.vy=8; e.y+=e.vy;
const eF=e.y+e.h;
if(isSolid(getTile(e.x+e.w/2,eF))||isSolid(getTile(e.x+2,eF))||isSolid(getTile(e.x+e.w-2,eF)))
  { e.y=Math.floor(eF/TILE)*TILE-e.h; e.vy=0; }
```

Ground patrol — note there is **no horizontal tile resolution at all**, only a direction
flip:
```js
e.x+=e.vx;
const ef2=e.y+e.h+2, ef=e.vx>0?e.x+e.w:e.x;
if(isSolid(getTile(ef,e.y+e.h/2))) e.vx*=-1;                              // wall
const gA=getTile(ef,ef2);
if(!isSolid(gA)&&isSolid(getTile(e.x+e.w/2,ef2))) e.vx*=-1;               // ledge
```

Stomp, which uses a **different player box** from tile collision:
```js
const shm=(dc.stompHitbox||1)*(p.bigHeadTimer>0?1.5:1);
if(p.invincible<=0&&rectOverlap({x:p.x+2,y:p.y,w:p.w-4,h:p.h},{x:e.x,y:e.y,w:e.w,h:e.h})){
  if(!e.noStomp&&p.vy>0&&p.y+p.h-4<e.y+e.h*shm/2){ e.alive=false; p.vy=-5; ... }
  else { playerHit(); }
}
```

For the slice: no big-head, no invincibility frames, no score. Stomp kills the enemy and
bounces the player to `-5`. Contact from the side does nothing yet — **do not implement
`playerHit`**; a hit is out of scope and a half-implemented death is worse than none.
Note that clearly in a comment.

Also read `spawnEnemy` (`index.html` ~line 1212) for `w`, `h` and the initial `vx`, and
`findGroundY` for the spawn row.

- [ ] **Step 1: Write failing tests** covering: falls to the ground and stops; patrols;
  turns at a wall; turns at a ledge rather than walking off; is killed by a falling player
  overlapping its top half; is NOT killed by a rising player; the killing player bounces
  to `vy === -5`.

- [ ] **Step 2: See them fail. Step 3: implement. Step 4: see them pass.**

- [ ] **Step 5: Spawn one enemy in `createWorld`** — the first `enemyDefs` entry of level 1
  whose type is a ground patroller (`doll`, `car`, `dino`, `penguin`).

- [ ] **Step 6: Build, test, commit.**

---

## Task 6: The scene

**Files:**
- Create: `next/src/input/keyboard.ts`
- Create: `next/src/scenes/SliceScene.ts`
- Modify: `next/src/main.ts`

- [ ] **Step 1: Keyboard input**

`next/src/input/keyboard.ts` reads a Phaser scene's keyboard and produces an `InputState`.
Bind the same keys the live game accepts: left is `ArrowLeft` or `A`, right is `ArrowRight`
or `D`, jump is `Space`, `ArrowUp` or `W`. Track the rising edge for `jumpPressed`.

This is the only Phaser-aware input code. `src/game/` never sees a key.

- [ ] **Step 2: The scene**

`SliceScene` does four things and nothing else:

1. `create()` — build the world, draw the tile map **once** into a `Phaser.GameObjects.Graphics`
   as filled rectangles using the level's `groundColor` and `brickColor`, create a
   rectangle for the player and one for the enemy, set the camera bounds to the level size
   and make it follow the player.
2. `update(time, delta)` — accumulate `delta` and call `stepWorld` exactly once per
   `STEP_MS`, capped at a handful of catch-up steps so a background tab does not spiral.
3. Copy `world.player.x/y` onto the player rectangle, same for the enemy, and hide the
   enemy rectangle when it is not `alive`.
4. Nothing else. No sprites, no parallax, no HUD, no text beyond a small frame counter if
   it helps debugging.

The accumulator is the fixed-step mechanism the spec calls for:

```ts
private accumulator = 0;

update(_time: number, delta: number): void {
  // Clamp so a backgrounded tab does not produce a hundred catch-up steps at once.
  this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
  while (this.accumulator >= STEP_MS) {
    stepWorld(this.world, readKeyboard(this));
    this.accumulator -= STEP_MS;
  }
  this.syncSprites();
}
```

This is what fixes the 120Hz double-speed bug, which is the one deliberate break from
bug-compatibility in the whole migration.

- [ ] **Step 3: Register it in `main.ts`** in place of `BootScene`, or after it.

- [ ] **Step 4: Verify in a browser.** `npm run dev`, then check: the level draws, the
  player runs and jumps, the camera follows, the enemy patrols and turns at ledges,
  jumping on it kills it and bounces you, and **no console errors**.

- [ ] **Step 5: Commit.**

---

## Task 7: The golden trace suite — the gate

**Files:**
- Create: `next/tests/helpers/inputScript.ts`
- Test: `next/tests/trace.test.ts`

This is what the plan exists for.

- [ ] **Step 1: Shared input scripts**

`next/tests/helpers/inputScript.ts` exports named scripts, each a
`(frame: number) => FrameInput` plus a frame count. At minimum:

| Script | What it exercises |
|---|---|
| `standStill` | gravity settle, nothing else |
| `runRight` | acceleration to cap |
| `runAndStop` | multiplicative decel and the 0.12 snap |
| `singleJump` | full jump arc, apex hang, landing |
| `shortHop` | the variable jump cut |
| `runningJump` | horizontal carry through an arc |
| `walkOffLedge` | falling off the gap at tile x 20 |
| `coyoteJump` | jump 3 frames after leaving that ledge |
| `bufferedJump` | jump pressed while falling, fires on landing |
| `landOnPlatform` | downward Y resolution onto a raised tile |
| `longRun` | 600 frames, to catch slow numerical drift |

**Do not hardcode geometry into these scripts beyond what is verified.** What is verified
about level 1 (`Doll Garden`, 120×25, player starts at tile 2,20): the ground occupies the
bottom two rows, with gaps at tile x 20-22, 45-46, 75-77 and 98-99 at `gapWidth` 1.0 —
and those gap positions **shift with difficulty**, because `addGaps` scales them. Pin the
scripts to `normal` and derive any tile position you need from the generated map at test
time rather than writing a number in.

Two things deliberately absent from the table:

- **No wall script.** `makeGround` writes two bottom rows and `addPlats` writes single-row
  platforms, so no level has a vertical face at player height. X resolution is unit-tested
  against a synthetic map in Task 3 instead. If you find real geometry that triggers it —
  a `?` block or rainbow block is solid too, and those sit at various heights — add a
  script for it and say where.
- **No ceiling script** until you confirm the player can actually reach an overhang. The
  jump rise is around 45px from standing; check against the real map before writing a
  script that silently exercises nothing.

- [ ] **Step 2: The comparison test**

```ts
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { SCRIPTS } from './helpers/inputScript';
import { createWorld, stepWorld } from '../src/game/world';

describe.each(Object.entries(SCRIPTS))('%s matches the live game', (name, script) => {
  it('agrees on the player every frame', () => {
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: script.frames, input: script.input,
    });

    const world = createWorld(0, 'normal');
    const port: typeof live = [];
    let prevJump = false;
    for (let f = 0; f < script.frames; f++) {
      const held = script.input(f);
      stepWorld(world, {
        left: held.left, right: held.right, jump: held.jump,
        jumpPressed: held.jump && !prevJump,
      });
      prevJump = held.jump;
      const p = world.player;
      port.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround });
    }

    // Compare whole traces, not summaries: the first differing frame is the bug.
    expect(port).toEqual(live);
  });
});
```

- [ ] **Step 3: Make them pass.**

When a trace diverges, find the **first** differing frame and fix the port to match the
live game. Print it:

```ts
const i = port.findIndex((s, k) => JSON.stringify(s) !== JSON.stringify(live[k]));
console.log('first divergence at frame', i, '\n live:', live[i], '\n port:', port[i]);
```

**The live game is the specification.** If the port disagrees, the port is wrong — unless
you can show the live behaviour depends on something deliberately excluded from the slice
(particles, power-ups, score). If so, say which, and narrow the script rather than
loosening the assertion.

Do **not** switch to `toBeCloseTo` to make a trace pass. Both sides are the same IEEE
doubles doing the same arithmetic in the same order; if they differ, the arithmetic
differs, and that is the finding.

- [ ] **Step 4: Prove the suite can fail.** Change one constant in `player.ts` (e.g. ground
  acceleration 0.6 → 0.61), run the suite, confirm traces go red, revert, confirm green.
  Report the actual output. A comparison that cannot fail is worse than no comparison.

- [ ] **Step 5: Add an enemy trace** comparing enemy `x`, `y`, `vx` and `alive` across a
  script that walks into the enemy and stomps it.

- [ ] **Step 6: Commit.**

---

## Task 8: Ship it for the kids

**Files:**
- Modify: `README` of the slice, or a short note in `next/`

- [ ] **Step 1: Confirm the whole suite and build are green.**

- [ ] **Step 2: Check the live game is still untouched.**

```bash
git diff --stat origin/main -- index.html
```
Expected: empty.

- [ ] **Step 3: Push, and confirm `/gi-do/next/` serves the slice.**

- [ ] **Step 4: Write down what to ask the kids.** Not "is it good" — they will say yes.
  Ask them to play the same bit of level 1 in both and say which one feels floatier, which
  one is easier to land on the enemy, and whether the jump goes where they expect. Write
  their answers down verbatim; that is the validation record.

---

## Done when

- [ ] Every golden trace matches the live game frame by frame, and the suite has been
      proven able to fail.
- [ ] `cd next && npm test` and `npm run build` are green.
- [ ] `src/game/` imports no Phaser, enforced by a test.
- [ ] Level 1 is playable at `/gi-do/next/` — run, jump, stomp the enemy.
- [ ] `index.html` is untouched.
- [ ] The kids have played both and their reaction is written down.

## What Plan 3 picks up

Only after the gate passes: textures and the felt shader, then the rest of the world. If
the gate fails, Plan 3 is instead a decision about whether to continue at all — which is
the point of putting this first.
