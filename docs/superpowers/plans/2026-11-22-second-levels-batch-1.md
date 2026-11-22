# Second Levels, Batch 1: Doll Garden II and Dinosaur Canyon II — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a run order of stages in place of "level 0 to 5", and add the first two second
levels, Doll Garden II (the bow) and Dinosaur Canyon II (the fart jump), built on the obstacle
course's pieces plus a new one: gates opened by a target.

**Architecture:** The six classic level records stay untouched. `data/stages.ts` lists the run
as stages `{ theme, level, nameKey }`; `game/run.ts` walks stages instead of `LEVELS`, and the
scenes take the THEME for hills, music and kidnapper and the STAGE for the level and its name.
Second levels are ASCII sections built by `courseLevel()` in `data/course.ts`, which borrows
the theme's colours. Rules stay pure in `src/game/` (Vitest); Phaser draws and collides.

**Tech Stack:** Phaser 4.2.1, TypeScript (strict, `noUnusedLocals`), Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-extra-levels-design.md`, batch 1.

---

## Ground rules

- Worktree `/Users/sergei/Work/gi-do/.claude/worktrees/demo`, branch `demo-level`. Run
  commands from `next/`. `npm run build` runs `tsc --noEmit`; Vitest does not type-check, so
  run both before calling a task done.
- Nothing under `src/game/` or `src/data/` may import a Phaser value.
- **No commits unless the owner asks** (their standing rule). Each task ends with tests and
  types green instead.
- The owner's direction: Phaser features for engine work; the pure rules are pure so they can
  be tested.

## File structure

| File | Responsibility |
|---|---|
| `src/data/levels.ts` (modify) | `TILE_GATE`; `CourseDef.targets` as a list of cells each target changes |
| `src/data/course.ts` (modify) | the ASCII legend and parser, gates, target-to-mechanism by proximity, `courseLevel()`; the demo leaves |
| `src/game/course.ts` (modify) | targets apply their cells one at a time (planks laid, bars lifted) |
| `src/gfx/course.ts` (modify) | the gate's tile frame and its effect |
| `src/data/stages.ts` (create) | `Stage`, `buildStages`, `STAGES` |
| `src/game/run.ts` (modify) | the run walks `STAGES`; `getCurrentStage`; `startRun(firstStage)` |
| `src/scenes/startStage.ts` (create) | `?level=N` |
| `src/scenes/courseDemo.ts` (delete) | replaced by `?level=N` |
| `src/scenes/SliceScene.ts`, `BetweenScene.ts`, `CharacterScene.ts` (modify) | theme from the stage, level from the stage |
| `src/data/levels2/dollGarden2.ts` (create) | Doll Garden II |
| `src/data/levels2/dinoCanyon2.ts` (create) | Dinosaur Canyon II |
| `src/config/i18n.ts` (modify) | `level_1_2`, `level_2_2`; `level_course` goes |
| `tests/helpers/demoCourse.ts` (create) | the demo course, kept as a fixture for the mechanics' tests |
| `tests/helpers/courseRuns.ts` (create) | shared helpers: a quiet world, standing, stepping, jump reach |
| `tests/course.test.ts`, `tests/run.test.ts`, `tests/tiles.test.ts`, `tests/i18n.test.ts` (modify) | |
| `tests/stages.test.ts`, `tests/levels2.test.ts` (create) | |

---

### Task 1: Course levels from sections, with a theme's look; the demo becomes a fixture

**Files:** Modify `src/data/course.ts`. Create `tests/helpers/demoCourse.ts`, `tests/helpers/courseRuns.ts`. Modify `tests/course.test.ts`, `src/scenes/SliceScene.ts` (import only, until Task 4).

- [ ] **Step 1: Write the fixture and helpers**

`tests/helpers/demoCourse.ts`:

```ts
import { courseLevel } from '../../src/data/course';

/**
 * The obstacle-course demo the owner's child played on 2026-11-22. No longer in the game (its
 * ideas went into the second levels), kept here because it has every course piece in one
 * level — cracked walls, the giant, guards, a drawbridge, springs — for the mechanics' tests.
 */
export const DEMO_COURSE = courseLevel({
  name: 'Obstacle Course',
  theme: 0,
  look: { groundColor: '#9a6a3c', groundTop: '#3fa53a' },
  sections: [
    // steps and a pit
    [
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '.........................?a.................',
      '............................................',
      '....................?.......................',
      '..................................n.........',
      '.......................#####....####........',
      '..P..............##....#####....####........',
      '............##...##...######....#####.......',
      '........#...##.d.##...######....#####.....F.',
      '############################....############',
      '############################....############',
    ],
    // the bow lowers a drawbridge
    [
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..b..........T..............F.',
      '######==================######',
      '######..................######',
    ],
    // a tunnel too low to jump over anyone
    [
      '..................................',
      '..................................',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '....b.########################...F',
      '#####..........................###',
      '#####.......D......N......D....###',
      '##################################',
      '##################################',
    ],
    // a cliff only a fart jump clears
    [
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '...........?....?.............',
      '..............................',
      '..............................',
      '..............d...............',
      '........############..........',
      '........############..........',
      '........############..........',
      '........##############........',
      '........##############........',
      '........################......',
      '...f....################...F..',
      '##############################',
      '##############################',
    ],
    // a cracked wall only a big head smashes
    [
      '..........................',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........###..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '.........CCC..............',
      '...h.....CCC........F.....',
      '##########################',
      '##########################',
    ],
    // a giant only the chicken ray moves
    [
      '..............................',
      '..............................',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '........BBBBBBBBBBBBBBBB......',
      '..............................',
      '..............................',
      '..............................',
      '...k...........g...........F..',
      '##############################',
      '##############################',
    ],
    // a spring up to the sibling
    [
      '........................',
      '........................',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '...................R...B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '#########SS#############',
      '########################',
    ],
  ],
});
```

`tests/helpers/courseRuns.ts`:

```ts
import { testEnemyMove, testMove } from './testMove';
import { TILE } from '../../src/config/constants';
import { DIFFICULTY_CONFIG, type DifficultyKey } from '../../src/config/difficulty';
import type { Level } from '../../src/data/levels';
import { createPlayer, stepMotion, type Character } from '../../src/game/player';
import { createWorld, stepWorld } from '../../src/game/world';
import type { World } from '../../src/game/types';
import { emptyInput, type InputState } from '../../src/input/actions';

/** A world on `level` with every enemy already used up, so a test sees only its own piece. */
export function quietWorld(level: Level, difficulty: DifficultyKey = 'super_easy', character: Character = 'gigi'): World {
  const world = createWorld(0, difficulty, character, undefined, level);
  for (const d of world.pending) d.spawned = true;
  return world;
}

export function step(world: World, input: Partial<InputState> = {}, times = 1): void {
  for (let i = 0; i < times; i++) stepWorld(world, { ...emptyInput(), ...input }, testMove, testEnemyMove);
}

/** Stand the player on the floor whose top is tile row `floorRow`, at column `tx`. */
export function standAt(world: World, tx: number, floorRow: number): void {
  const p = world.player;
  p.x = tx * TILE;
  p.y = floorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
}

/** How high a held jump lifts the feet, in pixels, on a difficulty (and with a fart). */
export function jumpRise(difficulty: DifficultyKey, fart = false): number {
  const dc = DIFFICULTY_CONFIG[difficulty];
  const p = createPlayer({ playerStart: [0, 0] } as Level, dc, 'gigi');
  p.onGround = true;
  p.fartTimer = fart ? 900 : 0;
  const input = { ...emptyInput(), jump: true, jumpPressed: true };
  let y = 0;
  let top = 0;
  stepMotion(p, input, dc, { push: () => 0 });
  p.onGround = false;
  for (let i = 0; i < 200 && p.vy < 0; i++) {
    y += p.vy;
    top = Math.min(top, y);
    stepMotion(p, { ...input, jumpPressed: false }, dc, { push: () => 0 });
  }
  return -top;
}

/** The y an arrow flies at for a player whose top is `playerY` (player.ts's fireArrow). */
export function arrowY(playerY: number, h: number): number {
  return playerY + h / 2 - 2;
}
```

- [ ] **Step 2: Point the mechanics' tests at the fixture**

In `tests/course.test.ts` replace the import line

```ts
import { COURSE_LEVEL, joinSections, parseCourse } from '../src/data/course';
```

with

```ts
import { joinSections, parseCourse } from '../src/data/course';
import { DEMO_COURSE as COURSE_LEVEL } from './helpers/demoCourse';
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/course.test.ts`
Expected: FAIL — `courseLevel` is not exported by `src/data/course.ts`.

- [ ] **Step 4: Add `courseLevel` and remove the demo from `src/data/course.ts`**

Replace everything from `const PARSED = parseCourse(joinSections(SECTIONS));` to the end of the
file with:

```ts
/** What a second level is made of: its sections and which theme it belongs to. */
export interface CourseLevelSpec {
  /** The English name it was authored under (the screens use its translation key). */
  name: string;
  /** 0-5: the classic level whose colours and clouds it borrows. */
  theme: number;
  sections: readonly (readonly string[])[];
  /** Colours instead of the theme's, for a ground that stands out against its hills. */
  look?: Partial<Pick<Level, 'bg' | 'groundColor' | 'brickColor' | 'groundTop'>>;
}

/**
 * A level record from ASCII sections. The map is handed out fresh on every build, because a
 * World writes to it (blocks bumped, walls smashed, bridges laid) and a respawn must get the
 * original back. The difficulty does not reshape it: a course's gaps are its puzzles.
 */
export function courseLevel(spec: CourseLevelSpec): Level {
  const parsed = parseCourse(joinSections(spec.sections));
  const theme = LEVELS[spec.theme];
  return {
    name: spec.name,
    bg: theme.bg,
    groundColor: theme.groundColor,
    brickColor: theme.brickColor,
    groundTop: theme.groundTop,
    ...spec.look,
    width: parsed.map[0].length,
    height: parsed.map.length,
    playerStart: parsed.playerStart,
    rescuePos: parsed.rescuePos,
    generate: () => parsed.map.map((row) => [...row]),
    enemyDefs: parsed.enemyDefs,
    bowPositions: [],
    superPositions: [],
    // No cat: it scratches enemies for you, and these levels are about doing that yourself.
    catPosition: null,
    clouds: theme.clouds,
    course: parsed.course,
  };
}
```

Delete the `SECTIONS` constant and its comment block's last paragraph about sizing (keep the
legend). Change the file's first comment line to say the file is the ASCII format for second
levels. Update the imports at the top:

```ts
import type { CourseDef, EnemyDef, Level, StationKind, TileMap } from './levels';
import {
  isSolid, LEVELS, TILE_BRICK, TILE_CRACKED, TILE_EMPTY, TILE_GROUND, TILE_QUESTION, TILE_SPRING,
} from './levels';
```

In `src/scenes/SliceScene.ts` the demo import goes in Task 4; for now change

```ts
import { COURSE_LEVEL } from '../data/course';
```

to nothing, and the `createWorld` call's last argument from `isCourseDemo() ? COURSE_LEVEL : undefined` to `undefined` (and delete the `isCourseDemo` import), so the file still compiles.

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass; no type errors.

---

### Task 2: Gates, and every target opens what is nearest it

**Files:** Modify `src/data/levels.ts`, `src/data/course.ts`, `src/game/course.ts`, `src/gfx/course.ts`, `tests/course.test.ts`, `tests/tiles.test.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/tiles.test.ts` change the `it.each` table to:

```ts
  it.each([
    [0, false], [1, true], [2, true], [3, true], [4, false], [5, true],
    [6, true], [7, true], [8, true], [9, true], [10, false],
  ])(
```

and its comment's "three more (cracked 6, spring 7, plank 8" to "four more (cracked 6, spring 7, plank 8, gate 9".

In `tests/course.test.ts`, add `TILE_GATE` to the `../src/data/levels` import and `courseLevel` to the `../src/data/course` import, and add inside `describe('the course map', ...)`:

```ts
  const TINY = [
    'P....T.......T....R',
    '......|............',
    '......|............',
    '#########====######',
    '###################',
  ];

  it('gives each bridge or gate to the target nearest it', () => {
    const { map, course } = parseCourse(TINY);
    const [gateTarget, bridgeTarget] = course.targets;
    expect(map[1][6]).toBe(TILE_GATE);
    expect(map[3][9]).toBe(TILE_EMPTY);
    // Bars lift from the bottom up; planks are laid from the far side back.
    expect(gateTarget.cells).toEqual([
      { x: 6, y: 2, to: TILE_EMPTY }, { x: 6, y: 1, to: TILE_EMPTY },
    ]);
    expect(bridgeTarget.cells.map((c) => c.x)).toEqual([12, 11, 10, 9]);
    expect(bridgeTarget.cells.every((c) => c.y === 3 && c.to === TILE_PLANK)).toBe(true);
  });

  it('refuses a target that opens nothing', () => {
    expect(() => parseCourse(['P.T..T..R', '#########'])).toThrow(/opens nothing/);
  });

  it('opens a gate a bar at a time once its target is shot', () => {
    const world = quietWorld(courseLevel({ name: 'tiny', theme: 0, sections: [TINY] }));
    const t = world.course!.targets[0];
    world.arrows.push({ x: t.box.x - 8, y: t.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(t.hit).toBe(true);
    let bottomFirst = false;
    for (let i = 0; i < 40; i++) {
      step(world);
      if (world.map[2][6] === TILE_EMPTY && world.map[1][6] === TILE_GATE) bottomFirst = true;
    }
    expect(bottomFirst).toBe(true);
    expect(world.map[1][6]).toBe(TILE_EMPTY);
  });
```

Replace this file's local `quietCourse`/`step`/`standAt` helpers with the shared ones: delete
the three local functions and add

```ts
import { quietWorld, standAt, step } from './helpers/courseRuns';

function quietCourse(difficulty: DifficultyKey = 'super_easy'): World {
  return quietWorld(COURSE_LEVEL, difficulty);
}
```

Replace the bridge-shaped assertions (the target's `bridge` no longer exists):

```ts
  it('links its one target, in view from the edge, to an 18-tile drawbridge', () => {
    const [target] = COURSE_LEVEL.course!.targets;
    expect(target.cells).toHaveLength(18);
    expect(target.cells.every((c) => c.y === 23 && c.to === TILE_PLANK)).toBe(true);
    const x0 = Math.min(...target.cells.map((c) => c.x));
    // In view from the edge, where a child stands to shoot: the camera shows ~13 tiles ahead.
    expect(target.x - (x0 - 1)).toBeLessThanOrEqual(10);
    expect(target.x).toBeGreaterThan(x0 + 3); // and not touchable from the edge
  });
```

and in `describe('the drawbridge')` and `describe('the cape')` use
`const x0 = Math.min(...t.cells.map((c) => c.x));` where they used `t.bridge.x0`, and

```ts
    step(world, {}, PLANK_INTERVAL * (t.cells.length + 3));
    for (const c of t.cells) expect(world.map[c.y][c.x]).toBe(TILE_PLANK);
```

where they checked the planks.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/course.test.ts tests/tiles.test.ts`
Expected: FAIL — `TILE_GATE` is not exported; `cells` is undefined.

- [ ] **Step 3: The gate tile and the new target shape, in `src/data/levels.ts`**

Below `TILE_PLANK`:

```ts
/** A gate's bars: solid until the target nearest them is shot, then they lift away. */
export const TILE_GATE = 9;
```

`isSolid` gains `|| tile === TILE_GATE`. The header comment's "6, 7 and 8 exist only on" becomes
"6 to 9 exist only on", and names "a gate's bars" too. `CourseDef.targets` becomes:

```ts
  /**
   * A target to shoot, and what the shot changes: each cell gets `to` written into it, in
   * order, one at a time — planks laid across a chasm, or a gate's bars taken away.
   */
  targets: Array<{ x: number; y: number; cells: Array<{ x: number; y: number; to: number }> }>;
```

- [ ] **Step 4: Parse gates and link by proximity, in `src/data/course.ts`**

Add `TILE_GATE, TILE_PLANK` to the `./levels` import, and `'|': TILE_GATE` to `TILE_LETTERS`.
In the legend, replace the `=` and `T` lines with:

```ts
 *   =  drawbridge: empty until its target is shot, then planks are laid across
 *   |  gate: bars until its target is shot, then they lift away
 *   T  target: shoot it with the bow. It opens every = and | run nearer to it than to any
 *      other target, so put a target next to what it opens. Keep it within about 10 tiles of
 *      where the player stands to shoot: the camera shows ~13 ahead.
```

Replace `parseCourse` with:

```ts
type Cell = { x: number; y: number; to: number };

/** Every run of = (a row) and of | (a column), each as the cells it changes, in order. */
function mechanisms(rows: readonly string[]): Cell[][] {
  const runs: Cell[][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '=' || row[x - 1] === '=') continue;
      const run: Cell[] = [];
      for (let x1 = x; row[x1] === '='; x1++) run.push({ x: x1, y, to: TILE_PLANK });
      runs.push(run.reverse()); // laid from the far side back towards the player
    }
  });
  for (let x = 0; x < rows[0].length; x++) {
    for (let y = 0; y < rows.length; y++) {
      if (rows[y][x] !== '|' || rows[y - 1]?.[x] === '|') continue;
      const run: Cell[] = [];
      for (let y1 = y; rows[y1]?.[x] === '|'; y1++) run.push({ x, y: y1, to: TILE_EMPTY });
      runs.push(run.reverse()); // lifted from the bottom up
    }
  }
  return runs;
}

/** How far a target is from a run: the nearest cell, counting a diagonal step as one. */
function distance(t: { x: number; y: number }, run: Cell[]): number {
  return Math.min(...run.map((c) => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y))));
}

export function parseCourse(rows: readonly string[]): ParsedCourse {
  const map: TileMap = rows.map((row) => [...row].map((ch) => TILE_LETTERS[ch] ?? TILE_EMPTY));
  let playerStart: [number, number] | null = null;
  let rescuePos: [number, number] | null = null;
  const enemyDefs: EnemyDef[] = [];
  const targets: Array<{ x: number; y: number }> = [];
  const stations: CourseDef['stations'] = [];
  const flags: CourseDef['flags'] = [];

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'P') playerStart = [x, y];
      else if (ch === 'R') rescuePos = [x, y];
      else if (ch === 'T') targets.push({ x, y });
      else if (ch === 'F') flags.push({ x, y: floorBelow(map, x, y) });
      else if (ch in STATION_LETTERS) stations.push({ kind: STATION_LETTERS[ch], x, y });
      else if (ch in ENEMY_LETTERS) {
        enemyDefs.push({ type: ENEMY_LETTERS[ch], x, floorRow: floorBelow(map, x, y) });
      } else if (ch in GUARD_LETTERS) {
        enemyDefs.push({ type: GUARD_LETTERS[ch], x, floorRow: floorBelow(map, x, y), guard: true });
      }
    }
  });

  if (!playerStart || !rescuePos) throw new Error('a course needs a P and an R');
  // Left to right, the order a child meets them in (and the order tests list them in).
  enemyDefs.sort((a, b) => a.x - b.x);
  targets.sort((a, b) => a.x - b.x);
  stations.sort((a, b) => a.x - b.x);
  flags.sort((a, b) => a.x - b.x);

  const owned: Cell[][] = targets.map(() => []);
  for (const run of mechanisms(rows)) {
    if (targets.length === 0) throw new Error('a bridge or gate with no target to open it');
    let best = 0;
    targets.forEach((t, i) => { if (distance(t, run) < distance(targets[best], run)) best = i; });
    owned[best].push(...run);
  }
  targets.forEach((t, i) => {
    if (owned[i].length === 0) throw new Error(`the target at ${t.x},${t.y} opens nothing`);
  });

  return {
    map, playerStart, rescuePos, enemyDefs,
    course: { targets: targets.map((t, i) => ({ ...t, cells: owned[i] })), stations, flags },
  };
}
```

- [ ] **Step 5: Targets apply their cells, in `src/game/course.ts`**

Replace `TargetState`'s `bridge` and `built` fields:

```ts
export interface TargetState {
  /** The target's box, in pixels. */
  box: Rect;
  hit: boolean;
  /** What the shot changes, in order (data/levels.ts's CourseDef). */
  cells: Array<{ x: number; y: number; to: number }>;
  /** Cells changed so far. */
  done: number;
  /** Frames until the next one. */
  timer: number;
}
```

In `buildCourse`, the target literal's `bridge: { ...t.bridge }, built: 0,` becomes
`cells: t.cells.map((c) => ({ ...c })), done: 0,`. `CourseFx`'s `kind` gains `'gate'`. In
`stepTargets`, replace the second loop with:

```ts
  for (const t of course.targets) {
    if (!t.hit || t.done >= t.cells.length) continue;
    if (--t.timer > 0) continue;
    t.timer = PLANK_INTERVAL;
    const cell = t.cells[t.done++];
    world.map[cell.y][cell.x] = cell.to;
    course.mapVersion++;
    world.sounds.push('block');
    pushFx(course, {
      kind: cell.to === TILE_PLANK ? 'plank' : 'gate',
      x: cell.x * TILE + TILE / 2,
      y: cell.y * TILE + TILE / 2,
    });
  }
```

Remove `TILE_EMPTY` from this file's imports only if `tsc` reports it unused.

- [ ] **Step 6: Draw the gate, in `src/gfx/course.ts`**

Add `TILE_GATE` to the `../data/levels` import. `FRAMES` becomes `TILE_GATE + 1`. Add:

```ts
const GATE_BAR = 0x555566;
const GATE_SHINE = 0x9a9ab0;

function drawGate(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(0x000000, 0.25).fillRect(x, 0, TILE, TILE);
  for (const bx of [2, 7, 12]) {
    g.fillStyle(GATE_BAR).fillRect(x + bx, 0, 3, TILE);
    g.fillStyle(GATE_SHINE).fillRect(x + bx, 0, 1, TILE);
  }
  g.fillStyle(GATE_BAR).fillRect(x, 6, TILE, 2);
}
```

call `drawGate(g, TILE_GATE * TILE);` in the tileset bake, let `courseOnly` keep `TILE_GATE`
(`code === TILE_CRACKED || code === TILE_SPRING || code === TILE_PLANK || code === TILE_GATE`),
and in `playFx` add `case 'gate': this.chunks.explode(4, fx.x, fx.y); break;`.

- [ ] **Step 7: Run the tests and types**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 3: The run order

**Files:** Create `src/data/stages.ts`, `tests/stages.test.ts`. Modify `src/game/run.ts`, `tests/run.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/stages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_NAME_KEYS } from '../src/data/levels';
import { buildStages, STAGES } from '../src/data/stages';

const named = (name: string) => ({ ...LEVELS[0], name });

describe('the run order', () => {
  it('is the six classic levels when no theme has a second one', () => {
    expect(buildStages({}).map((s) => [s.theme, s.level])).toEqual(LEVELS.map((l, i) => [i, l]));
  });

  it('plays a theme\'s second level right after its classic one', () => {
    const second = { level: named('Doll Garden II'), nameKey: 'level_1_2' };
    const stages = buildStages({ 0: second });
    expect(stages.map((s) => s.level.name)).toEqual([
      'Doll Garden', 'Doll Garden II', 'Dinosaur Canyon', 'Tallinn Old Town',
      'Palermo Piazza', 'Winter Wonderland', 'Toy Castle',
    ]);
    expect(stages[1]).toEqual({ theme: 0, level: second.level, nameKey: 'level_1_2' });
  });

  it('puts Toy Castle\'s second level before the boss, so the boss stays the finale', () => {
    const stages = buildStages({ 5: { level: named('Toy Castle II'), nameKey: 'level_6_2' } });
    expect(stages.slice(-2).map((s) => s.level.name)).toEqual(['Toy Castle II', 'Toy Castle']);
  });

  it('names every classic stage by its classic key, and ends on the boss', () => {
    for (const s of STAGES) if (LEVELS.includes(s.level)) expect(s.nameKey).toBe(LEVEL_NAME_KEYS[s.theme]);
    expect(STAGES[STAGES.length - 1].level).toBe(LEVELS[LEVELS.length - 1]);
  });
});
```

In `tests/run.test.ts`: add `getCurrentStage` to the `../src/game/run` import and
`import { STAGES } from '../src/data/stages';`. In "the run loop" replace both
`createWorld(getCurrentLevel(), 'normal', 'gigi', getRunTotals())` calls with

```ts
createWorld(getCurrentStage().theme, 'normal', 'gigi', getRunTotals(), getCurrentStage().level)
```

and the `expect(played).toEqual([...six rows...])` with

```ts
    expect(played).toEqual(STAGES.map((_, i) => ({
      level: i,
      livesIn: 3 - (i > 1 ? 1 : 0) - (i > 3 ? 1 : 0),
      scoreIn: 100 * i,
      outcome: i === STAGES.length - 1 ? 'game-won' : 'next-level',
    })));
```

and `expect(getCurrentLevel()).toBe(LEVELS.length);` with `toBe(STAGES.length)`. Replace
"knows which level is the last one" with:

```ts
  it('knows which stage is the last one', () => {
    expect(STAGES.map((_, i) => isLastLevel(i))).toEqual(STAGES.map((_, i) => i === STAGES.length - 1));
  });

  it('can start a run partway, for a playtest, but never past the end', () => {
    startRun(2);
    expect(getCurrentLevel()).toBe(2);
    startRun(999);
    expect(getCurrentLevel()).toBe(STAGES.length - 1);
  });
```

Remove `LEVELS` from this file's imports if it becomes unused (the kidnapper tests still use it).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/stages.test.ts tests/run.test.ts`
Expected: FAIL — `src/data/stages.ts` does not exist.

- [ ] **Step 3: `src/data/stages.ts`**

```ts
import { LEVELS, LEVEL_NAME_KEYS, type Level } from './levels';

/** One level of the run: which theme it belongs to, the level itself, and its name's key. */
export interface Stage {
  /** 0-5. Whose hills, music, kidnapper and colours: the classic level's index. */
  theme: number;
  level: Level;
  nameKey: string;
}

/** A theme's second level (docs/superpowers/specs/2026-11-22-extra-levels-design.md). */
export interface SecondLevel {
  level: Level;
  nameKey: string;
}

/**
 * The run: every theme's classic level, then its second one. Toy Castle's second level comes
 * BEFORE its classic one, because the classic Toy Castle has the boss and the boss is the end
 * (game/boss.ts's isFinalLevel). A theme with no second level yet just has the one.
 */
export function buildStages(seconds: Partial<Record<number, SecondLevel>>): Stage[] {
  const last = LEVELS.length - 1;
  return LEVELS.flatMap((level, theme) => {
    const classic: Stage = { theme, level, nameKey: LEVEL_NAME_KEYS[theme] };
    const second = seconds[theme];
    if (!second) return [classic];
    const extra: Stage = { theme, level: second.level, nameKey: second.nameKey };
    return theme === last ? [extra, classic] : [classic, extra];
  });
}

export const STAGES: readonly Stage[] = buildStages({});
```

- [ ] **Step 4: `src/game/run.ts` walks stages**

Replace `import { LEVELS } from '../data/levels';` with
`import { STAGES, type Stage } from '../data/stages';`. Below `getCurrentLevel`:

```ts
/** The stage being played, or about to be: its theme and its level (data/stages.ts). */
export function getCurrentStage(): Stage {
  return STAGES[currentLevel] ?? STAGES[0];
}
```

`startRun` becomes:

```ts
export function startRun(firstStage = 0): void {
  // A playtest can start partway (scenes/startStage.ts's `?level=N`); never past the end.
  currentLevel = Math.max(0, Math.min(firstStage, STAGES.length - 1));
  lives = DC().lives;
  score = 0;
}
```

In `finishLevel`, `currentLevel >= LEVELS.length` becomes `currentLevel >= STAGES.length`; in
`isLastLevel`, `levelIndex === LEVELS.length - 1` becomes `levelIndex === STAGES.length - 1`.
Add one line to each of their comments: "`currentLevel` counts STAGES now, not LEVELS: the run
has a second level per theme as they are built."

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 4: The scenes follow the stage; `?level=N`

**Files:** Create `src/scenes/startStage.ts`. Delete `src/scenes/courseDemo.ts`. Modify `src/scenes/SliceScene.ts`, `src/scenes/BetweenScene.ts`, `src/scenes/CharacterScene.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`.

- [ ] **Step 1: `src/scenes/startStage.ts`**

```ts
/**
 * Where a run starts: the first stage, unless the address says `?level=N` — counted from 1, as
 * a person counts — to playtest one level without playing those before it. For example
 * `http://localhost:5173/gi-do/next/?level=2` is Doll Garden II. game/run.ts's startRun clamps it.
 */
export function requestedStage(): number {
  const n = Number(new URLSearchParams(window.location.search).get('level'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}
```

Delete `src/scenes/courseDemo.ts`.

- [ ] **Step 2: `CharacterScene` starts the run where asked**

Add `import { requestedStage } from './startStage';` and change `startRun();` in `confirm()`
to `startRun(requestedStage());`.

- [ ] **Step 3: `SliceScene` takes the theme and the level from the stage**

Add `getCurrentStage` to the `../game/run` import. In `create()` replace

```ts
    const levelIndex = getCurrentLevel();
    this.levelIndex = levelIndex;
```

with

```ts
    // The stage is the level; its THEME is everything a level borrows from its world — the
    // hills, the music, the kidnapper. A classic level's theme is its own old index.
    const stageIndex = getCurrentLevel();
    const stage = getCurrentStage();
    const levelIndex = stage.theme;
    this.levelIndex = levelIndex;
```

the `createWorld(...)` call's last argument `undefined` with `stage.level`, the HUD launch's
`levelNameKey: this.world.course ? 'level_course' : undefined,` with `levelNameKey: stage.nameKey,`,
and the level overlay launch's `levelIndex,` with `levelIndex: stageIndex,` (the overlay asks
`isLastLevel` with it). In `leaveIfRunOver` delete the whole
`if (won && stateTimer <= 0 && this.world.course) { ... }` block: a second level goes on to the
next stage like any other.

- [ ] **Step 4: `BetweenScene` previews the stage**

Replace the `LEVELS, LEVEL_NAME_KEYS` import with nothing (delete the line), add
`getCurrentStage` to its `../game/run` import, and `import type { Stage } from '../data/stages';`.
Add a field below `levelIndex`:

```ts
  /** The stage being walked INTO: its theme picks the kidnapper, its level the colours. */
  private stage!: Stage;
```

In `create`:

```ts
    this.levelIndex = getCurrentLevel();
    this.stage = getCurrentStage();
    this.kidnapper = getKidnapper(this.stage.theme);
```

`kidnapperTextureKey(kidnapperIndex(this.levelIndex))` becomes
`kidnapperTextureKey(kidnapperIndex(this.stage.theme))`; in `drawBackdrop`,
`const level = LEVELS[this.levelIndex];` becomes `const level = this.stage.level;`; in
`buildHeadline`, `TStr(LEVEL_NAME_KEYS[this.levelIndex] ?? LEVEL_NAME_KEYS[0])` becomes
`TStr(this.stage.nameKey)`.

- [ ] **Step 5: Names, in `src/config/i18n.ts`**

Replace the `level_course` line with:

```ts
  level_1_2:          {et:'Nukuaed II',               en:'Doll Garden II'},
  level_2_2:          {et:'Dinosauruse kanjon II',    en:'Dinosaur Canyon II'},
```

In `tests/i18n.test.ts`'s `PORT_ONLY_KEYS`, replace `'level_course',` with `'level_1_2', 'level_2_2',`.

- [ ] **Step 6: Run the tests, types and build**

Run: `npx vitest run && npm run build`
Expected: all pass; build succeeds.

---

### Task 5: Doll Garden II — the bow

**Files:** Create `src/data/levels2/dollGarden2.ts`, `tests/levels2.test.ts`. Modify `src/data/stages.ts`.

The level, 170 tiles, five sections each ending in a flag:

1. Warm-up: steps of 1, 2 and 3, a 4-high plateau, a real 4-wide pit, `?` blocks, a doll, a dino and a bat.
2. The drawbridge: bow station, an 18-wide chasm, the target on its post in the chasm 8 tiles out, a car on the far side.
3. Jump and shoot: bow station, a bouncer, a portcullis (a brick wall to the top of the screen with two columns of bars under it), and its target hanging at row 18 — too high for a standing shot, hit by jumping and firing.
4. The guard tunnel, as in the demo.
5. The finish: a spring up a 7-tall tower to the sibling. (A bonus spring before it was tried and removed: it threw a child holding right over the tower's spring.)

- [ ] **Step 1: Write the failing tests**

`tests/levels2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { quietWorld, standAt, step, jumpRise, arrowY } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, type DifficultyKey } from '../src/config/difficulty';
import { TILE_EMPTY, TILE_GATE, TILE_PLANK, TILE_SPRING, type Level } from '../src/data/levels';
import { DOLL_GARDEN_2 } from '../src/data/levels2/dollGarden2';
import { STAGES } from '../src/data/stages';
import { playerSize, type Character } from '../src/game/player';
import type { TargetState } from '../src/game/course';

const HEROES: Character[] = ['gigi', 'dodo'];
const GROUND_TOP = 23 * TILE;

/** The lowest an arrow flies, from the floor at row `floorRow`, in a held jump (or standing). */
function arrowRange(key: DifficultyKey, hero: Character, floorRow: number, fart = false) {
  const { h } = playerSize(hero);
  const standing = arrowY(floorRow * TILE - h, h);
  return { standing, highest: standing - jumpRise(key, fart) };
}

function hits(t: TargetState, y: number): boolean {
  return y < t.box.y + t.box.h && y + 4 > t.box.y;
}

function reachesTower(level: Level, key: DifficultyKey, fromSpring: boolean, towerTopRow = 16): boolean {
  const world = quietWorld(level, key);
  const spring = world.map[23].lastIndexOf(TILE_SPRING);
  if (fromSpring) standAt(world, spring - 3, 23);
  else standAt(world, spring + 1, 23);
  for (let i = 0; i < 240; i++) {
    const p = world.player;
    if (world.won) return true;
    step(world, { right: true, jump: !fromSpring, jumpPressed: !fromSpring && p.onGround });
    if (!fromSpring) world.map[23] = world.map[23].map((c) => (c === TILE_SPRING ? 1 : c));
    if (p.onGround && p.y + p.h <= towerTopRow * TILE) return true;
  }
  return world.won;
}

describe('Doll Garden II', () => {
  const level = DOLL_GARDEN_2;
  const [bridge, gate] = level.course!.targets;

  it('is in the run, right after Doll Garden', () => {
    expect(STAGES[1]).toEqual({ theme: 0, level, nameKey: 'level_1_2' });
  });

  it('is all about the bow', () => {
    expect(level.course!.stations.map((s) => s.kind)).toEqual(['bow', 'bow', 'bow']);
    expect(level.course!.flags).toHaveLength(5);
  });

  it('has a drawbridge whose target is in view from the edge', () => {
    expect(bridge.cells.every((c) => c.to === TILE_PLANK)).toBe(true);
    expect(bridge.cells).toHaveLength(18);
    const x0 = Math.min(...bridge.cells.map((c) => c.x));
    expect(bridge.x - (x0 - 1)).toBeLessThanOrEqual(10);
  });

  it('has a gate whose target is out of reach of a standing shot, but not of a jumping one', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[1];
    expect(gate.cells.every((c) => c.to === TILE_EMPTY)).toBe(true);
    expect(world.map[gate.cells[0].y][gate.cells[0].x]).toBe(TILE_GATE);
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(t, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < t.box.y + t.box.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });

  it('has a portcullis nobody jumps: its wall goes to the top of the screen', () => {
    const map = level.generate({} as never);
    const x = gate.cells[0].x;
    for (let y = 2; y <= 22; y++) expect(map[y][x]).not.toBe(TILE_EMPTY);
  });

  it('lifts the portcullis when the target is shot', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[1];
    world.arrows.push({ x: t.box.x - 8, y: t.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 80);
    for (const c of t.cells) expect(world.map[c.y][c.x]).toBe(TILE_EMPTY);
  });

  it('has three guards in its tunnel', () => {
    expect(level.enemyDefs.filter((d) => d.guard)).toHaveLength(3);
  });

  it('puts the sibling on a tower only the spring reaches, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, jump: reachesTower(level, key, false) }).toEqual({ key, jump: false });
      expect({ key, spring: reachesTower(level, key, true) }).toEqual({ key, spring: true });
    }
  });
});
```

(`GROUND_TOP` is used by Task 6's tests in this file; if `tsc` objects before then, leave it out
until Task 6.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/levels2.test.ts`
Expected: FAIL — `src/data/levels2/dollGarden2.ts` does not exist.

- [ ] **Step 3: `src/data/levels2/dollGarden2.ts`**

```ts
import { courseLevel } from '../course';

/**
 * Doll Garden's second level: the bow, and everything it can do besides kill — lower a
 * drawbridge, lift a portcullis, clear a tunnel of guards. The child has met no other tool
 * yet. docs/superpowers/specs/2026-11-22-extra-levels-design.md.
 */
export const DOLL_GARDEN_2 = courseLevel({
  name: 'Doll Garden II',
  theme: 0,
  // Earth-brown ground, not the hills' green, so every step and wall stands out against them.
  look: { groundColor: '#9a6a3c', groundTop: '#3fa53a' },
  sections: [
    // warm-up: steps and a pit
    [
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '.........................?a.................',
      '............................................',
      '....................?.......................',
      '..................................n.........',
      '.......................#####....####........',
      '..P..............##....#####....####........',
      '............##...##...######....#####.......',
      '........#...##.d.##...######....#####.....F.',
      '############################....############',
      '############################....############',
    ],
    // the drawbridge: shoot the target on its post
    [
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..b..........T.............xF.',
      '######==================######',
      '######..................######',
    ],
    // a gate: its target is up high, so jump and shoot
    [
      '..............................',
      '..............................',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '................BB............',
      '...........T....||............',
      '................||............',
      '................||............',
      '................||............',
      '..b....u........||.........F..',
      '##############################',
      '##############################',
    ],
    // the guard tunnel: guards bounce you back, so shoot them
    [
      '..................................',
      '..................................',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '......########################....',
      '....b.########################...F',
      '#####..........................###',
      '#####.......D......N......D....###',
      '##################################',
      '##################################',
    ],
    // the finish: a spring up the tower
    [
      '................................',
      '................................',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...............................B',
      '...........................R...B',
      '.......................########B',
      '.......................########B',
      '.......................########B',
      '.......................########B',
      '.......................########B',
      '.......................########B',
      '.......................########B',
      '#################SS#############',
      '################################',
    ],
  ],
});
```

- [ ] **Step 4: Put it in the run, in `src/data/stages.ts`**

```ts
import { DOLL_GARDEN_2 } from './levels2/dollGarden2';
...
export const STAGES: readonly Stage[] = buildStages({
  0: { level: DOLL_GARDEN_2, nameKey: 'level_1_2' },
});
```

- [ ] **Step 5: Run the tests and types**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass.

---

### Task 6: Dinosaur Canyon II — the fart jump

**Files:** Create `src/data/levels2/dinoCanyon2.ts`. Modify `src/data/stages.ts`, `tests/levels2.test.ts`.

The level, 190 tiles:

1. Canyon ledges: ledges 2, 4 and 5 high with 2- and 4-wide pits between, the landings sized to super easy's 8.6-tile jump, a step before the 5, a dino on a ledge, a bat, a doll, a `?` block over the start (never over a jump-off point, where a bonk drops a child short into a pit). Plain jumping only, on every difficulty.
2. The canyon wall: a fart station, a 7-high step, a spare fart station on top of it, a second 7-high step to row 9, a flag up there, and brick platforms down the far side.
3. Two tools: a fart station and a bow station; an 8-high ledge under a rock overhang; a 26-wide chasm; its target hanging over the chasm at row 14 — only a shot from the ledge (or from a fart jump) reaches it. The overhang caps any jump from the ledge, so the chasm cannot be jumped either.
4. Cannons: a bow station, a cannon on the ground and one on a 2-high block, a bouncer.
5. The finish: a spring up the mesa to the sibling.

- [ ] **Step 1: Write the failing tests**

Append to `tests/levels2.test.ts` (and add `import { DINO_CANYON_2 } from '../src/data/levels2/dinoCanyon2';`):

```ts
/** Run right, jumping at every wall or gap ahead, until column `untilX` or `frames` run out. */
function runRight(world: ReturnType<typeof quietWorld>, untilX: number, frames = 900): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => (world.map[r]?.[tx + 1] ?? 0) !== 0);
    const gap = world.map[23][tx + 1] === 0 || world.map[23][tx + 2] === 0;
    const start = p.onGround && holding === 0 && (wall || gap);
    if (start) holding = 20;
    step(world, { right: true, jump: holding > 0, jumpPressed: start });
    if (holding > 0) holding--;
    world.player.hasCape = false;
    if (p.x / TILE >= untilX) return true;
  }
  return false;
}

/** From standing at `tx` on the floor at `floorRow`, does a held jump end up on `topRow` or higher? */
function climbs(level: Level, key: DifficultyKey, tx: number, floorRow: number, topRow: number, fart: boolean): boolean {
  const world = quietWorld(level, key);
  world.course!.stations.forEach((s) => { s.cooldown = 99999; });
  standAt(world, tx, floorRow);
  for (let i = 0; i < 240; i++) {
    const p = world.player;
    if (fart) p.fartTimer = 900;
    step(world, { right: true, jump: true, jumpPressed: p.onGround });
    if (p.onGround && p.y + p.h <= topRow * TILE) return true;
  }
  return false;
}

describe('Dinosaur Canyon II', () => {
  const level = DINO_CANYON_2;
  const [target] = level.course!.targets;

  it('is in the run, right after Dinosaur Canyon', () => {
    expect(STAGES[3]).toEqual({ theme: 1, level, nameKey: 'level_2_2' });
  });

  it('teaches the fart jump, then mixes in the bow', () => {
    expect(level.course!.stations.map((s) => s.kind)).toEqual(['fart', 'fart', 'fart', 'bow', 'bow']);
  });

  it('has canyon ledges a plain jump gets over, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      expect({ key, over: runRight(world, 39) }).toEqual({ key, over: true });
    }
  });

  it('has a canyon wall of two steps, each needing a fart, on every difficulty', () => {
    // The first step: cols 48-64, top row 16. The second, on top of it: cols 60-74, top row 9.
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, 45, 23, 16, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, 45, 23, 16, true) }).toEqual({ key, fart: true });
      expect({ key, plain2: climbs(level, key, 56, 16, 9, false) }).toEqual({ key, plain2: false });
      expect({ key, fart2: climbs(level, key, 56, 16, 9, true) }).toEqual({ key, fart2: true });
    }
  });

  it('hangs its target where only a shot from the high ledge, or a fart jump, reaches it', () => {
    const world = quietWorld(level);
    const t = world.course!.targets[0];
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const ground = arrowRange(key, hero, 23);
        expect({ key, hero, fromGround: ground.highest < t.box.y + t.box.h }).toEqual({ key, hero, fromGround: false });
        const ledge = arrowRange(key, hero, 15);
        expect({ key, hero, fromLedge: hits(t, ledge.standing) }).toEqual({ key, hero, fromLedge: true });
      }
    }
    expect(target.cells).toHaveLength(26);
  });

  it('needs a fart to get onto the ledge, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(level, key, 92, 23, 15, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(level, key, 92, 23, 15, true) }).toEqual({ key, fart: true });
    }
  });

  it('cannot be crossed by a fart jump off the ledge: the overhang caps it', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      standAt(world, 98, 15);
      world.player.hasCape = false;
      for (let i = 0; i < 200 && !world.dead; i++) {
        world.player.fartTimer = 900;
        step(world, { right: true, jump: true, jumpPressed: world.player.onGround });
      }
      expect({ key, fell: world.dead }).toEqual({ key, fell: true });
    }
  });

  it('puts the sibling on a mesa only the spring reaches, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, jump: reachesTower(level, key, false) }).toEqual({ key, jump: false });
      expect({ key, spring: reachesTower(level, key, true) }).toEqual({ key, spring: true });
    }
  });
});
```

Delete `GROUND_TOP` if `tsc` reports it unused.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/levels2.test.ts`
Expected: FAIL — `src/data/levels2/dinoCanyon2.ts` does not exist.

- [ ] **Step 3: `src/data/levels2/dinoCanyon2.ts`**

```ts
import { courseLevel } from '../course';

/**
 * Dinosaur Canyon's second level: the fart jump, up the canyon's walls, and then the fart and
 * the bow together — a target only seen from a ledge only a fart reaches.
 * docs/superpowers/specs/2026-11-22-extra-levels-design.md.
 */
export const DINO_CANYON_2 = courseLevel({
  name: 'Dinosaur Canyon II',
  theme: 1,
  sections: [
    // canyon ledges and pits
    [
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '.................................a..............',
      '................................................',
      '................................................',
      '................................................',
      '................................................',
      '.....?................n........#####............',
      '...................#######.....#####............',
      '..P................#######.....#####............',
      '........#########..#######....######............',
      '........#########..#######....######........d..F',
      '#################..#################....########',
      '#################..#################....########',
    ],
    // the canyon wall: two fart jumps up, a spare fart on the first step
    [
      '..................................................',
      '..................................................',
      '..................................................',
      '..................................................',
      '..................................................',
      '..................................................',
      '..................................................',
      '..................................................',
      '...............................F......?...........',
      '....................###############...............',
      '....................###############...............',
      '.................a..###############...............',
      '....................###############..BBB..........',
      '....................###############...............',
      '....................###############...............',
      '.............f......###############......BBB......',
      '........###########################...............',
      '........###########################...............',
      '........###########################..........BBB..',
      '........###########################...............',
      '........###########################...............',
      '........###########################...............',
      '...f....###########################...............',
      '##################################################',
      '##################################################',
    ],
    // two tools: fart up to the ledge, shoot the target from there
    [
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '..............................................',
      '.....###########..............................',
      '.....###########..............................',
      '..............................................',
      '..............................................',
      '..............................................',
      '...............T..............................',
      '.....#####....................................',
      '.....#####....................................',
      '.....#####....................................',
      '.....#####....................................',
      '.....#####....................................',
      '.....#####....................................',
      '.....#####....................................',
      '.f.b.#####..................................F.',
      '##########==========================##########',
      '##########..........................##########',
    ],
    // cannons: jump their fireballs, or shoot them
    [
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '....................o.........',
      '...................###........',
      '..b.......o........###...u..F.',
      '##############################',
      '##############################',
    ],
    // the finish: a spring up the mesa
    [
      '........................',
      '........................',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '.......................B',
      '...................R...B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '...............########B',
      '#########SS#############',
      '########################',
    ],
  ],
});
```

- [ ] **Step 4: Put it in the run**

In `src/data/stages.ts`, import it and add `1: { level: DINO_CANYON_2, nameKey: 'level_2_2' },`
to the `buildStages` argument.

- [ ] **Step 5: Run the tests, types and build**

Run: `npx vitest run && npm run build`
Expected: all pass; build succeeds.

---

### Task 7: Play both in the browser, with real physics

Unit tests move the player with a simple tile mover; Arcade is what ships, and it found the
demo's real bugs. **Files:** Modify `next/PLAYTEST.md` only.

- [ ] **Step 1:** `npm run dev -- --port 5175 --strictPort`, open `http://localhost:5175/gi-do/next/?level=2` in an automated tab, and drive it as in the memory note "Hidden-tab browser checks": keyCode on key events, `game.loop.sleep()`, the harness in `sessionStorage`.
- [ ] **Step 2:** Doll Garden II on Super Easy: run each section to its flag — shoot the drawbridge target from the edge; at the portcullis, check a standing shot passes under the target and a jumping one hits it; shoot the three guards; walk onto the second spring and land on the tower. Screenshot: the portcullis with its target, and the tower.
- [ ] **Step 3:** The same on Hard (difficulty card 4).
- [ ] **Step 4:** `?level=4`, Dinosaur Canyon II, on Super Easy and Hard: the ledges by plain jumping; both canyon-wall steps by fart; the ledge, then the shot from it, then across the bridge; past the cannons; the spring to the mesa. Screenshot: the ledge with the target in view, and the canyon wall. Check the canyon's ground stands out against its hills; if it does not, give the level a `look` with a darker ground and re-check.
- [ ] **Step 5:** Play the run from the start into stage 2, then from stage 3 into 4, to see the cutscene name the second levels and show their colours.
- [ ] **Step 6:** Add to `next/PLAYTEST.md` a section "Second levels, batch 1" with what to watch: where the child gets stuck for more than a minute, where they die more than three or four times in one section, whether they find jump-and-shoot on their own, and whether the two-tool puzzle in Dinosaur Canyon II makes sense without help.
- [ ] **Step 7:** `npx vitest run && npm run build` once more.

---

## Self-review against the spec

- Run order with seconds after classics and Toy Castle II before the boss: Task 3 (`buildStages`, tested for theme 5 too).
- Skipped themes: `buildStages` with no entry yields only the classic.
- Theme decides hills, music, kidnapper and colours; stage decides level and name: Tasks 1 (`courseLevel` borrows colours) and 4.
- Names in both languages: Task 4 step 5.
- `?level=N`, demo `?course` removed: Task 4.
- Gates and proximity: Task 2.
- Targets anywhere, same look: Task 2 keeps `gfx/course.ts`'s target; the high target is Task 5.
- Doll Garden II and Dinosaur Canyon II as specified: Tasks 5 and 6, every obstacle tested on all four difficulties.
- Browser runs on Super Easy and Hard, and PLAYTEST notes: Task 7.
- The six classic levels untouched: no task edits `LEVELS`; the legacy parity tests keep running.
