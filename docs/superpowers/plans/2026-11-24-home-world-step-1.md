# Home World, Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** World 7, KODU, in the run after the T-Rex: the story into it, its tune, its map stop, the sock, the fly and the hairbrush, potties for flags, furniture pictures, the dripping tap, and its first level HOMMIK, with today's bathroom fight as the world's last level until ÕHTU exists.

**Architecture:** Theme 6 is the first theme with no classic level behind it: `HOME_THEME` in `data/levels.ts`, appended to the run by `buildStages`, its colours from its levels' own `look`, its tune outside the legacy `BGM_THEMES` list. The new enemies reuse existing behaviours (bat, doll, zombie). The tap is a course part like the lava vent; its drops are enemy projectiles of type `drop`. Furniture is plain level data drawn by a new `gfx/furniture.ts`.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4. All commands run in `next/` of the worktree `.claude/worktrees/home-world` (branch `home-world`).

**Spec:** `docs/superpowers/specs/2026-11-24-home-world-design.md`.

**Owner's rules:** commit only when the owner asks (no commit steps below); no Co-Authored-By lines; every word a child reads in capitals; Phaser built-ins first; `src/game` stays free of Phaser.

---

## File structure

| File | What changes |
|---|---|
| `src/data/levels.ts` | `HOME_THEME`, `Furniture` and its kinds, `Level.furniture`, `Level.potty`, `CourseDef.taps` |
| `src/data/course.ts` | letters `w` (tap), `s` (sock), `y` (fly), `H` (hairbrush); a theme with no classic level; furniture by section; `potty` |
| `src/data/stages.ts` | `buildStages` appends themes past the classic six; theme 6 in `STAGES` |
| `src/data/levels2/hommik.ts` | new: HOMMIK |
| `src/data/sprites.ts` | `SOCK_S/P`, `HOUSEFLY_S/P`, `HAIRBRUSH_S/P`, `DROP_S/P` |
| `src/data/bgmThemes.ts` | `HOME_BGM`, `BGM_HOME`, `bgmTheme`, `levelMusic` |
| `src/game/enemy.ts` | the three types; `FLYERS` |
| `src/game/run.ts` | sprite info for the three types |
| `src/game/course.ts` | the tap: state, step, drops, splash |
| `src/game/story.ts` | the T-Rex's beaten line, the poo's grab line |
| `src/game/types.ts` | sound cue `drip` |
| `src/audio/sfx.ts`, `src/audio/cues.ts`, `src/audio/bgm.ts` | `sfxDrip`; the drip cue; the level's tune by theme |
| `src/config/i18n.ts` | `world_7`, `level_7_1`, `story_tiny_now`, `story_poo_grab`, `story_good_night`; `story_trex_tiny` goes |
| `src/gfx/textures.ts` | enemy and zombie textures for the three types; `DROP_TEXTURE` |
| `src/gfx/furniture.ts` | new: furniture pictures |
| `src/gfx/course.ts` | potties, taps and their hanging drops, the drip splash |
| `src/gfx/worldMap.ts` | seven stops, a house for the home world, the villain's trip ends at the castle |
| `src/scenes/SliceScene.ts` | furniture; drops; the level's tune by theme |
| `src/scenes/BetweenScene.ts` | the cut from the castle to home, the poo out of the toilet |
| `src/scenes/WinScene.ts` | the run ends on the poo flushed away, and good night |
| tests | `tests/home.test.ts` (new); `course`, `stages`, `story`, `i18n`, `bgmThemes`, `ledges`, `softlocks` |
| `next/PLAYTEST.md`, the spec | the home world's section; step 1 done |

---

### Task 1: Theme 6 and the home pieces in the level format

**Files:**
- Modify: `src/data/levels.ts`, `src/data/course.ts`, `src/data/stages.ts`
- Test: `tests/course.test.ts`, `tests/stages.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/course.test.ts` (add `HOME_THEME`, `TILE_EMPTY` to the levels import if missing):

```ts
/** A 25-row section `w` wide, ground in the bottom two rows, with `rows` written in by row number. */
function sectionOf(w: number, rows: Record<number, string>): string[] {
  return Array.from({ length: 25 }, (_, y) => rows[y] ?? (y >= 23 ? '#'.repeat(w) : '.'.repeat(w)));
}

describe('the home world in the level format', () => {
  it('reads a tap (w), a sock (s), a fly (y) and a hairbrush (H, only ever a zombie)', () => {
    const parsed = parseCourse(joinSections([sectionOf(12, {
      18: '.....w......',
      20: '..P.........',
      22: '...s.y.H..R.',
    })]));
    expect(parsed.course.taps).toEqual([{ x: 5, y: 18 }]);
    expect(parsed.map[18][5]).toBe(TILE_EMPTY);
    expect(parsed.enemyDefs).toEqual([
      { type: 'sock', x: 3, floorRow: 23 },
      { type: 'fly', x: 5, floorRow: 23 },
      { type: 'hairbrush', x: 7, floorRow: 23, zombie: true },
    ]);
  });

  it('leaves taps out of a course that has none', () => {
    const parsed = parseCourse(joinSections([sectionOf(6, { 20: '.P....', 22: '....R.' })]));
    expect(parsed.course.taps).toBeUndefined();
  });

  it('wants the whole look for a theme with no classic level behind it, and gives it no clouds', () => {
    const sections = [sectionOf(6, { 20: '.P....', 22: '....R.' })];
    expect(() => courseLevel({ name: 'Bare', theme: HOME_THEME, sections })).toThrow(/whole look/);
    const look = { bg: '#111111', groundColor: '#222222', brickColor: '#333333', groundTop: '#444444' };
    const level = courseLevel({ name: 'Home', theme: HOME_THEME, sections, look });
    expect(level).toMatchObject(look);
    expect(level.clouds).toEqual([]);
  });

  it('counts a piece of furniture\'s column from the start of its section, and draws potties for flags when asked', () => {
    const sections = [sectionOf(10, { 20: '.P........' }), sectionOf(12, { 22: '.........R..' })];
    const level = courseLevel({
      name: 'Rooms', theme: 0, sections, potty: true,
      furniture: [{ kind: 'stool', section: 1, x: 2, y: 22, w: 2, h: 2 }],
    });
    expect(level.furniture).toEqual([{ kind: 'stool', x: 12, y: 22, w: 2, h: 2 }]);
    expect(level.potty).toBe(true);
    expect(courseLevel({ name: 'Plain', theme: 0, sections }).potty).toBeUndefined();
  });
});
```

Append to `tests/stages.test.ts` (add `HOME_THEME` to the levels import):

```ts
describe('a theme past the classic six', () => {
  it('is played after them, in its own order', () => {
    const a = named('A');
    const b = named('B');
    const stages = buildStages({ [HOME_THEME]: [{ level: a, nameKey: 'x' }, { level: b, nameKey: 'y' }] });
    expect(stages.slice(-2)).toEqual([
      { theme: HOME_THEME, level: a, nameKey: 'x' },
      { theme: HOME_THEME, level: b, nameKey: 'y' },
    ]);
    expect(stages.slice(0, -2).map((s) => s.level)).toEqual(LEVELS);
  });

  it('is the first theme with no classic level', () => {
    expect(HOME_THEME).toBe(LEVELS.length);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/course.test.ts tests/stages.test.ts`
Expected: FAIL (`HOME_THEME` is not exported; `taps`, `furniture`, `potty` unknown).

- [ ] **Step 3: Write the level format**

In `src/data/levels.ts`, after `TILE_WATER`:

```ts
/**
 * The home world's theme (docs/superpowers/specs/2026-11-24-home-world-design.md): world 7,
 * after the T-Rex, and the first theme with no classic level behind it, so `LEVELS[6]` is
 * undefined. Its levels carry their own look and its tune is not one of the original game's.
 */
export const HOME_THEME = 6;
```

In the `Level` interface, after `indoors?: boolean;`:

```ts
  /** Pictures of furniture over the level (gfx/furniture.ts). They have no rules of their own. */
  furniture?: Furniture[];
  /** Its checkpoints are drawn as potties, not flags: the home world's. */
  potty?: boolean;
```

After the `Level` interface:

```ts
export type FurnitureKind =
  | 'bed' | 'window' | 'door' | 'toyBlocks' | 'stool' | 'counter' | 'mirror' | 'basin' | 'toilet';

/**
 * A piece of furniture, in tiles: `x` its left column, `y` its bottom row, `w` by `h` tiles.
 * Over blocks it makes them look like furniture (a stool, a counter); over air it is a
 * picture on the wall (a window, a mirror). The toilet is drawn at its own size.
 */
export interface Furniture {
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  h: number;
}
```

In `CourseDef`, after `vents`:

```ts
  /** Taps (`w`), each a cell that lets go of a drop straight down now and then. */
  taps?: Array<{ x: number; y: number }>;
```

- [ ] **Step 4: Parse and build them**

In `src/data/course.ts`:

Add to the doc comment's letter table, after the `g  giant` paragraph:

```
 *   w  a dripping tap: now and then a drop falls straight down from it (the home world)
 *   s  smelly sock (walks, like a doll)    y  fly (flies, like a bat)
 *   H  hairbrush: only ever a zombie, since nobody stomps on a hairbrush
```

Change the letter tables:

```ts
const ENEMY_LETTERS: Record<string, string> = {
  d: 'doll', n: 'dino', a: 'bat', x: 'car', o: 'cannon', u: 'bouncer', p: 'penguin', g: 'giant',
  i: 'icebat', s: 'sock', y: 'fly',
};
/** Upper case is the same walker as a zombie (EnemyState.zombie). */
const ZOMBIE_LETTERS: Record<string, string> = {
  D: 'doll', N: 'dino', K: 'knight', Z: 'cook', W: 'penguin', L: 'soldier', H: 'hairbrush',
};
```

In `parseCourse`, beside `const vents: CourseDef['vents'] = [];`:

```ts
  const taps: Array<{ x: number; y: number }> = [];
```

and in the letter loop, after `else if (ch === 'v') vents.push({ x, y });`:

```ts
      else if (ch === 'w') taps.push({ x, y });
```

and in the returned `course`, after `vents,`:

```ts
      ...(taps.length > 0 ? { taps } : {}),
```

Replace `CourseLevelSpec` and `courseLevel`:

```ts
/** A piece of furniture as a level file writes it: `x` counted from the start of `section`. */
export interface FurnitureSpec extends Furniture {
  section: number;
}

/** What a second level is made of: its sections and which theme it belongs to. */
export interface CourseLevelSpec {
  /** The English name it was authored under (the screens use its translation key). */
  name: string;
  /** 0-5: the classic level whose colours and clouds it borrows; HOME_THEME has none. */
  theme: number;
  sections: readonly (readonly string[])[];
  /**
   * Colours instead of the theme's, for a ground that stands out against its hills. A theme
   * with no classic level behind it (HOME_THEME) must give all four.
   */
  look?: Partial<Pick<Level, 'bg' | 'groundColor' | 'brickColor' | 'groundTop'>>;
  ending?: LevelEnding;
  villain?: Villain;
  indoors?: boolean;
  /** Which boss the level's Q is (the Doll Queen if it does not say). */
  boss?: BossKind;
  furniture?: readonly FurnitureSpec[];
  /** Potties for flags (the home world). */
  potty?: boolean;
}

/**
 * A level record from ASCII sections. The map is handed out fresh on every build, because a
 * World writes to it (blocks bumped, walls smashed, bridges laid) and a respawn must get the
 * original back. The difficulty does not reshape it: a course's gaps are its puzzles.
 */
export function courseLevel(spec: CourseLevelSpec): Level {
  const parsed = parseCourse(joinSections(spec.sections));
  const theme: Level | undefined = LEVELS[spec.theme];
  const look = spec.look ?? {};
  if (!theme && !(look.bg && look.groundColor && look.brickColor && look.groundTop)) {
    throw new Error(`theme ${spec.theme} has no classic level to borrow from: give ${spec.name} its whole look`);
  }
  // Where each section starts, for the furniture counted from its own section.
  const starts = spec.sections.map((_, i) => spec.sections.slice(0, i).reduce((sum, s) => sum + s[0].length, 0));
  return {
    name: spec.name,
    bg: theme?.bg ?? '',
    groundColor: theme?.groundColor ?? '',
    brickColor: theme?.brickColor ?? '',
    groundTop: theme?.groundTop ?? '',
    ...look,
    width: parsed.map[0].length,
    height: parsed.map.length,
    playerStart: parsed.playerStart,
    rescuePos: parsed.rescuePos,
    generate: () => parsed.map.map((row) => [...row]),
    enemyDefs: parsed.enemyDefs,
    bowPositions: [],
    superPositions: [],
    // The cat, where the level puts one (@).
    catPosition: parsed.cat,
    clouds: theme?.clouds ?? [],
    course: spec.boss && parsed.course.boss
      ? { ...parsed.course, boss: { ...parsed.course.boss, kind: spec.boss } }
      : parsed.course,
    ...(spec.ending ? { ending: spec.ending } : {}),
    ...(spec.villain ? { villain: spec.villain } : {}),
    ...(spec.indoors ? { indoors: true } : {}),
    ...(spec.furniture
      ? { furniture: spec.furniture.map(({ section, ...piece }) => ({ ...piece, x: piece.x + starts[section] })) }
      : {}),
    ...(spec.potty ? { potty: true } : {}),
  };
}
```

Add `Furniture` to the `import type` from `./levels` at the top.

- [ ] **Step 5: Append themes past the classic six**

In `src/data/stages.ts`, replace `buildStages`:

```ts
export function buildStages(themes: Partial<Record<number, readonly LevelEntry[]>>): Stage[] {
  const classic = LEVELS.flatMap((level, theme) => {
    const listed = themes[theme];
    if (!listed) return [{ theme, level, nameKey: LEVEL_NAME_KEYS[theme] }];
    return listed.map((entry) => ({ theme, level: entry.level, nameKey: entry.nameKey }));
  });
  // A theme with no classic level (the home world, HOME_THEME) comes after them all.
  const extra = Object.keys(themes).map(Number).filter((theme) => theme >= LEVELS.length).sort((a, b) => a - b)
    .flatMap((theme) => (themes[theme] ?? []).map((entry) => ({ theme, level: entry.level, nameKey: entry.nameKey })));
  return [...classic, ...extra];
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/course.test.ts tests/stages.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

---

### Task 2: The sock, the fly and the hairbrush

**Files:**
- Modify: `src/data/sprites.ts`, `src/game/enemy.ts`, `src/game/run.ts`, `src/gfx/textures.ts`
- Test: `tests/home.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/home.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { makeGround } from '../src/data/levels';
import { HAIRBRUSH_S, HOUSEFLY_S, SOCK_S } from '../src/data/sprites';
import { isGroundPatrol, spawnEnemy } from '../src/game/enemy';
import { getEnemySpriteInfo } from '../src/game/run';

const dc = DIFFICULTY_CONFIG.normal;

describe('the home\'s enemies', () => {
  it('has a fly that flies like a bat: no gravity, as high up, as quick', () => {
    const map = makeGround(40, 25);
    const fly = spawnEnemy(map, dc, { type: 'fly', x: 10 })!;
    const bat = spawnEnemy(map, dc, { type: 'bat', x: 10 })!;
    expect(fly.noGravity).toBe(true);
    expect(fly.y + fly.h).toBe(bat.y + bat.h);
    expect(fly.vx).toBe(bat.vx);
    expect(isGroundPatrol(fly)).toBe(false);
    expect(getEnemySpriteInfo('fly').sprite).toBe(HOUSEFLY_S);
  });

  it('has a smelly sock that walks like a doll and can be stomped', () => {
    const map = makeGround(40, 25);
    const sock = spawnEnemy(map, dc, { type: 'sock', x: 10 })!;
    const doll = spawnEnemy(map, dc, { type: 'doll', x: 10 })!;
    expect(isGroundPatrol(sock)).toBe(true);
    expect(sock.vx).toBe(doll.vx);
    expect(sock.noStomp).toBe(false);
    expect(getEnemySpriteInfo('sock').sprite).toBe(SOCK_S);
  });

  it('has a hairbrush, only ever a zombie: nobody stomps on a hairbrush', () => {
    const map = makeGround(40, 25);
    const brush = spawnEnemy(map, dc, { type: 'hairbrush', x: 10, zombie: true })!;
    expect(brush.zombie).toBe(true);
    expect(isGroundPatrol(brush)).toBe(true);
    expect(getEnemySpriteInfo('hairbrush').sprite).toBe(HAIRBRUSH_S);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/home.test.ts`
Expected: FAIL (the sprites are not exported).

- [ ] **Step 3: Draw them**

Append to `src/data/sprites.ts`:

```ts
// The home world (docs/superpowers/specs/2026-11-24-home-world-design.md). A smelly sock with
// a red stripe and eyes, its toe forward (enemies face left as drawn), a whiff of stink
// over it; a house fly, bigger than Härra Kaka's buzzing ones, with red eyes; a pink
// hairbrush on two little feet, its bristles up: nobody stomps on that.
export const SOCK_S=[[0,3,0,1,1,1,1,0],[3,0,0,2,2,2,2,0],[0,3,0,1,4,1,4,0],[0,0,0,1,1,1,1,0],[0,0,0,2,2,2,2,0],[0,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,0],[1,1,1,1,1,1,5,0],[0,5,5,5,5,5,0,0]];
export const SOCK_P={1:'#f2f2f2',2:'#e04040',3:'#8fcf4a',4:'#222222',5:'#c8c8c8'};
export const HOUSEFLY_S=[[0,2,2,0,2,2,0],[2,2,2,0,2,2,2],[0,2,1,1,1,2,0],[0,1,3,1,3,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]];
export const HOUSEFLY_P={1:'#2a2a2a',2:'#cfe8ff',3:'#ff3333'};
export const HAIRBRUSH_S=[[6,0,6,0,6,0,6,0],[6,6,6,6,6,6,6,0],[1,1,1,1,1,1,1,0],[1,4,1,1,1,4,1,0],[1,1,1,1,1,1,1,0],[0,1,1,1,1,1,0,0],[0,0,2,2,2,0,0,0],[0,0,2,2,2,0,0,0],[0,0,3,0,3,0,0,0]];
export const HAIRBRUSH_P={1:'#ff8fc0',2:'#c05a90',3:'#5a2a40',4:'#222222',6:'#333333'};
// A drop from a dripping tap.
export const DROP_S=[[0,0,1,0],[0,1,1,0],[1,2,1,1],[1,1,1,1],[0,1,1,0]];
export const DROP_P={1:'#5ab8f0',2:'#e8f8ff'};
```

- [ ] **Step 4: Give them behaviours**

In `src/game/enemy.ts`:

Add `HAIRBRUSH_S, HOUSEFLY_S, SOCK_S` to the sprites import.

Add to `ENEMY_SPRITES`, after `poolet: POOLET_S,`:

```ts
  // The home world: a sock walks like a doll, a fly flies like a bat, a hairbrush is a zombie.
  sock: SOCK_S,
  fly: HOUSEFLY_S,
  hairbrush: HAIRBRUSH_S,
```

Above `isGroundPatrol`:

```ts
/** The fixed-height flyers: the bat, the ice bat and the home world's fly. */
const FLYERS: ReadonlySet<string> = new Set(['bat', 'icebat', 'fly']);
```

In `isGroundPatrol`, replace `e.type !== 'bat' && e.type !== 'icebat'` with `!FLYERS.has(e.type)`.
In `spawnEnemy`, replace `} else if (def.type === 'bat' || def.type === 'icebat') {` with `} else if (FLYERS.has(def.type)) {`.
In `stepEnemy`, replace `} else if (e.type === 'bat' || e.type === 'icebat') {` with `} else if (FLYERS.has(e.type)) {`.

In `src/game/run.ts`'s `getEnemySpriteInfo`, after the `poolet` case (and add the six names to its sprites import):

```ts
    case 'sock': return { sprite: SOCK_S, palette: SOCK_P };
    case 'fly': return { sprite: HOUSEFLY_S, palette: HOUSEFLY_P };
    case 'hairbrush': return { sprite: HAIRBRUSH_S, palette: HAIRBRUSH_P };
```

In `src/gfx/textures.ts`: add `'sock', 'fly', 'hairbrush'` to `ENEMY_TYPES`; add `hairbrush: { sprite: HAIRBRUSH_S, palette: HAIRBRUSH_P },` to `ZOMBIE_KINDS` (its own colours: it is a hairbrush, not a green zombie); add `HAIRBRUSH_P, HAIRBRUSH_S` to the sprites import.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/home.test.ts tests/enemy.test.ts && npx tsc --noEmit`
Expected: PASS.

---

### Task 3: The dripping tap

**Files:**
- Modify: `src/game/course.ts`, `src/game/types.ts`, `src/audio/sfx.ts`, `src/audio/cues.ts`
- Test: `tests/home.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/home.test.ts` (merge the imports with those already at the top):

```ts
import { TILE } from '../src/config/constants';
import { DIFF_KEYS } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import { DROP_W, TAP_REACH, TAP_WARN_FRAMES, tapInterval, tapWarning } from '../src/game/course';
import { quietWorld, standAt, step } from './helpers/courseRuns';

/** A 25-row section `w` wide, ground in the bottom two rows, with `rows` written in by row number. */
function sectionOf(w: number, rows: Record<number, string>): string[] {
  return Array.from({ length: 25 }, (_, y) => rows[y] ?? (y >= 23 ? '#'.repeat(w) : '.'.repeat(w)));
}

/** A floor 60 wide with one tap over it at column 40, six tiles up. */
const TAP_LEVEL = courseLevel({
  name: 'Tap', theme: 0,
  sections: [sectionOf(60, { 17: `${'.'.repeat(40)}w${'.'.repeat(19)}`, 20: `..P${'.'.repeat(57)}`, 22: `${'.'.repeat(58)}R.` })],
});

/** Steps until the tap lets go of a drop; returns it. */
function untilDrop(world: ReturnType<typeof quietWorld>, frames = 400) {
  for (let i = 0; i < frames; i++) {
    step(world);
    const drop = world.enemyProjectiles.find((s) => s.type === 'drop');
    if (drop) return drop;
  }
  return undefined;
}

describe('the dripping tap', () => {
  it('wobbles, then lets go of a drop that falls straight down and splashes on the floor', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    standAt(world, 30, 23);
    const tap = world.course!.taps[0];
    tap.timer = TAP_WARN_FRAMES;
    step(world);
    expect(tapWarning(tap)).toBe(true);
    const drop = untilDrop(world)!;
    expect(drop.vx).toBe(0);
    expect(drop.x + DROP_W / 2).toBe(40 * TILE + TILE / 2);
    let splash;
    for (let i = 0; i < 80 && !splash; i++) {
      step(world);
      splash = world.course!.fx.find((f) => f.kind === 'drip');
    }
    expect(splash?.y).toBe(23 * TILE);
    expect(world.enemyProjectiles.filter((s) => s.type === 'drop')).toHaveLength(0);
    expect(world.dead).toBe(false);
  });

  it('hurts the hero standing under it', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    world.player.hasCape = false;
    standAt(world, 40, 23);
    world.course!.taps[0].timer = 2;
    for (let i = 0; i < 80 && !world.dead; i++) step(world);
    expect(world.dead).toBe(true);
  });

  it('leaves time to run under it after a drop, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(TAP_LEVEL, key);
      world.player.hasCape = false;
      standAt(world, 36, 23);
      world.course!.taps[0].timer = 2;
      // Wait for the splash, then run.
      for (let i = 0; i < 200 && !world.course!.fx.some((f) => f.kind === 'drip'); i++) step(world);
      for (let i = 0; i < 200 && world.player.x < 44 * TILE; i++) step(world, { right: true });
      expect({ key, dead: world.dead, past: world.player.x >= 44 * TILE }).toEqual({ key, dead: false, past: true });
    }
  });

  it('drips only near the hero, and slower on Super Easy than on Hard', () => {
    const world = quietWorld(TAP_LEVEL, 'normal');
    standAt(world, 2, 23);
    expect(40 * TILE - 2 * TILE).toBeGreaterThan(TAP_REACH);
    expect(untilDrop(world, 600)).toBeUndefined();
    expect(tapInterval(DIFFICULTY_CONFIG.super_easy)).toBeGreaterThan(tapInterval(DIFFICULTY_CONFIG.hard));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/home.test.ts`
Expected: FAIL (`TAP_WARN_FRAMES` and friends are not exported; `world.course.taps` undefined).

- [ ] **Step 3: The drip sound**

In `src/game/types.ts`, add `| 'drip'` to `SoundCue` after `| 'groan'`, and a line to the cue list's doc comment: `` *   - `drip` is a dripping tap letting go of a drop (the home world). ``

In `src/audio/sfx.ts`:

```ts
/** A tap letting go of a drop: a little high plip. */
export function sfxDrip(): void {
  playTone(1500, 0.05, 'sine', 0.07, 900);
  setTimeout(() => playTone(1100, 0.06, 'sine', 0.04, 700), 50);
}
```

In `src/audio/cues.ts`'s `playEffect`, beside `case 'boing'`: `case 'drip': sfxDrip(); break;` (and import it).

- [ ] **Step 4: The tap's rules**

In `src/game/course.ts`:

Add `'drip'` to `CourseFx['kind']`. Add to `CourseState`, after `vents`:

```ts
  /** Taps over the floor, each counting down to its next drop. */
  taps: Array<{ x: number; y: number; timer: number }>;
```

In `buildCourse`, after `vents`:

```ts
    taps: (def.taps ?? []).map((t) => ({ ...t, timer: 60 + ((t.x * 37) % 90) })),
```

After `stepVents`:

```ts
/** Frames a tap wobbles, a drop swelling at its spout, before it lets go. */
export const TAP_WARN_FRAMES = 45;
/** A drop's box (the enemy projectiles' 8px square) and how fast it falls. */
export const DROP_W = 8;
export const DROP_H = 8;
export const DROP_SPEED = 3;
/** How near the hero a tap has to be to drip: as a vent, so far-off taps make no sound. */
export const TAP_REACH = VENT_REACH;

/** Frames between a tap's drops: slow on super easy, quick on hard, as a vent's. */
export function tapInterval(dc: { enemyShootInterval: number }): number {
  return ventInterval(dc);
}

/** Whether a tap is about to let go: the scene swells a drop at its spout. */
export function tapWarning(tap: { timer: number }): boolean {
  return tap.timer <= TAP_WARN_FRAMES;
}

/**
 * Each tap near the hero counts down and lets go of a drop, which falls straight down; a drop
 * about to reach whatever is under it splashes there and is gone. Touching one on the way
 * down is a hit (world.ts's stepEnemyProjectiles, as any enemy shot).
 */
function stepTaps(world: World, course: CourseState): void {
  const p = world.player;
  for (const tap of course.taps) {
    if (Math.abs(tap.x * TILE + TILE / 2 - (p.x + p.w / 2)) > TAP_REACH) continue;
    if (--tap.timer > 0) continue;
    tap.timer = tapInterval(world.dc);
    world.enemyProjectiles.push({
      x: tap.x * TILE + (TILE - DROP_W) / 2,
      y: (tap.y + 1) * TILE,
      vx: 0,
      vy: DROP_SPEED,
      life: 300,
      type: 'drop',
    });
    world.sounds.push('drip');
  }
  const landed = world.enemyProjectiles.filter((ep) => ep.type === 'drop'
    && isSolid(getTile(world.map, ep.x + DROP_W / 2, ep.y + DROP_H + ep.vy)));
  if (landed.length === 0) return;
  for (const ep of landed) {
    pushFx(course, { kind: 'drip', x: ep.x + DROP_W / 2, y: Math.floor((ep.y + DROP_H + ep.vy) / TILE) * TILE });
  }
  world.enemyProjectiles = world.enemyProjectiles.filter((ep) => !landed.includes(ep));
}
```

Add `stepTaps(world, course);` to `stepCourse` after `stepVents(world, course);`. Make sure `isSolid` and `getTile` are imported from `./tiles` (add what is missing).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/home.test.ts tests/course.test.ts tests/sounds.test.ts tests/sfx.test.ts && npx tsc --noEmit`
Expected: PASS.

---

### Task 4: HOMMIK, and the home world in the run

**Files:**
- Create: `src/data/levels2/hommik.ts`
- Modify: `src/data/stages.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`, `tests/ledges.test.ts`, `tests/softlocks.test.ts`
- Test: `tests/home.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/home.test.ts` (merge imports):

```ts
import { HOME_THEME, TILE_QUESTION, isSolid } from '../src/data/levels';
import { HOMMIK } from '../src/data/levels2/hommik';
import { TROONISAAL } from '../src/data/levels2/troonisaal';
import { STAGES } from '../src/data/stages';
import { arrowY, jumpRise } from './helpers/courseRuns';
import type { World } from '../src/game/types';

const mapOf = () => HOMMIK.generate({} as never);

/** Only the zombies come, and the taps are quiet: a runner sees only the level's shape. */
function guardedWorld(key: (typeof DIFF_KEYS)[number]): World {
  const world = quietWorld(HOMMIK, key);
  for (const d of world.pending) d.spawned = !d.zombie;
  for (const t of world.course!.taps) t.timer = 1e9;
  return world;
}

/** Runs right, jumping at every wall, shooting a zombie in the way. */
function playRight(world: World, frames = 6000): boolean {
  let holding = 0;
  for (let i = 0; i < frames && !world.dead && !world.won; i++) {
    const p = world.player;
    const tx = Math.floor((p.x + p.w / 2) / TILE);
    const rows = [Math.floor((p.y + 2) / TILE), Math.floor((p.y + p.h - 2) / TILE)];
    const wall = rows.some((r) => isSolid(world.map[r]?.[tx + 1]));
    const start = p.onGround && holding === 0 && wall;
    if (start) holding = 20;
    const shotY = arrowY(p.y, p.h);
    const zombie = world.enemies.some((e) => e.alive && e.zombie && e.x > p.x && e.x - p.x < 8 * TILE
      && e.y < shotY + 4 && e.y + e.h > shotY);
    step(world, { right: true, jump: holding > 0, jumpPressed: start, firePressed: p.arrowCooldown === 0 && zombie });
    if (holding > 0) holding--;
  }
  return world.won;
}

describe('HOMMIK, the morning', () => {
  it('comes right after the T-Rex, the first level of the home world, and ends with Härra Kaka running off', () => {
    const at = STAGES.findIndex((s) => s.level === HOMMIK);
    expect(STAGES[at - 1].level).toBe(TROONISAAL);
    expect(STAGES[at]).toEqual({ theme: HOME_THEME, level: HOMMIK, nameKey: 'level_7_1' });
    expect(HOMMIK.ending).toBe('chase');
    expect(HOMMIK.villain).toBe('poo');
    expect(HOMMIK.potty).toBe(true);
  });

  it('starts on the bed, and bouncing on it bumps the ? block over it, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(HOMMIK, key);
      for (let i = 0; i < 200 && world.map[14][4] === TILE_QUESTION; i++) step(world);
      expect({ key, bumped: world.map[14][4] !== TILE_QUESTION }).toEqual({ key, bumped: true });
    }
  });

  it('needs the step stool to get onto the counter on Hard, not on Super Easy', () => {
    // The counter runs from column 82 (the sink's section starts at 74); its top is its first solid row.
    const top = mapOf().findIndex((row) => isSolid(row[90]));
    const tall = (23 - top) * TILE;
    expect(jumpRise('hard')).toBeLessThan(tall);
    expect(jumpRise('super_easy')).toBeGreaterThan(tall);
    expect(jumpRise('hard')).toBeGreaterThan(2 * TILE);
  });

  it('hangs its taps over the counter, with room to see a drop fall', () => {
    const map = mapOf();
    const taps = quietWorld(HOMMIK).course!.taps;
    expect(taps).toHaveLength(3);
    for (const t of taps) {
      let y = t.y + 1;
      while (!isSolid(map[y][t.x])) y++;
      expect(y - t.y).toBeGreaterThanOrEqual(4);
    }
  });

  it('hands over the bow after the last potty before the hairbrush', () => {
    const bow = HOMMIK.course!.stations.find((s) => s.kind === 'bow')!;
    const brush = HOMMIK.enemyDefs.find((d) => d.type === 'hairbrush')!;
    const potties = HOMMIK.course!.flags.filter((f) => f.x < brush.x);
    expect(bow.x).toBeGreaterThan(Math.max(...potties.map((f) => f.x)));
    expect(bow.x).toBeLessThan(brush.x);
  });

  it('runs through to Härra Kaka running off, shooting the hairbrush, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, won: playRight(guardedWorld(key)) }).toEqual({ key, won: true });
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/home.test.ts`
Expected: FAIL (no `hommik.ts`).

- [ ] **Step 3: Write the level**

Create `src/data/levels2/hommik.ts`:

```ts
import { courseLevel } from '../course';
import { HOME_THEME } from '../levels';

/**
 * Home, level 1: the morning (docs/superpowers/specs/2026-11-24-home-world-design.md). Out of
 * bed (a bed of springs, a ? block over it), toy-block steps, a fly; the hallway's smelly socks,
 * the bow and a hairbrush nobody stomps; the step stool up onto the counter, toothpaste puddles
 * (ice) and three dripping taps; Härra Kaka with the sibling, by the toilet, hops off.
 */
export const HOMMIK = courseLevel({
  name: 'Morning',
  theme: HOME_THEME,
  ending: 'chase',
  villain: 'poo',
  indoors: true,
  potty: true,
  // A warm morning wallpaper, a wooden floor, white tiles for the counter's top.
  look: { bg: '#f3dfa0', groundColor: '#c8935a', groundTop: '#e2b27a', brickColor: '#eef2f6' },
  sections: [
    // the bedroom: a bed of springs, toy-block steps with the rainbow block over them, a fly
    [
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '....?.?...........................',
      '..................................',
      '.....................!............',
      '..................................',
      '....P.............................',
      '..................................',
      '....................BBB...........',
      '...................BBBBB..........',
      '..SSSSS...........BBBBBBB....y....',
      '##################################',
      '##################################',
    ],
    // the hallway: smelly socks, a potty, the bow, a hairbrush
    [
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '....F.....s.....s...F..b.........H......',
      '########################################',
      '########################################',
    ],
    // the sink: the step stool, the counter, toothpaste puddles, three dripping taps
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
      '...........w.....w.....w....................',
      '............................................',
      '............................................',
      '............................................',
      '............................................',
      '........BBBBBIIIBBBIIIBBBBBBBB..............',
      '........BBBBBBBBBBBBBBBBBBBBBB..............',
      '......BBBBBBBBBBBBBBBBBBBBBBBB..............',
      '..F...BBBBBBBBBBBBBBBBBBBBBBBB......s.......',
      '############################################',
      '############################################',
    ],
    // the toilet: Härra Kaka with the sibling, who hops off as you come
    [
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '..........................',
      '........?.?...............',
      '..........................',
      '..........................',
      '..........................',
      '..F.............R.........',
      '##########################',
      '##########################',
    ],
  ],
  furniture: [
    { kind: 'bed', section: 0, x: 2, y: 22, w: 5, h: 3 },
    { kind: 'window', section: 0, x: 9, y: 17, w: 4, h: 4 },
    { kind: 'toyBlocks', section: 0, x: 18, y: 22, w: 1, h: 1 },
    { kind: 'toyBlocks', section: 0, x: 19, y: 22, w: 1, h: 2 },
    { kind: 'toyBlocks', section: 0, x: 20, y: 22, w: 3, h: 3 },
    { kind: 'toyBlocks', section: 0, x: 23, y: 22, w: 1, h: 2 },
    { kind: 'toyBlocks', section: 0, x: 24, y: 22, w: 1, h: 1 },
    { kind: 'door', section: 0, x: 31, y: 22, w: 2, h: 4 },
    { kind: 'window', section: 1, x: 12, y: 17, w: 3, h: 3 },
    { kind: 'door', section: 1, x: 37, y: 22, w: 2, h: 4 },
    { kind: 'stool', section: 2, x: 6, y: 22, w: 2, h: 2 },
    { kind: 'counter', section: 2, x: 8, y: 22, w: 22, h: 3 },
    { kind: 'mirror', section: 2, x: 9, y: 13, w: 20, h: 3 },
    { kind: 'basin', section: 2, x: 10, y: 18, w: 3, h: 1 },
    { kind: 'basin', section: 2, x: 16, y: 18, w: 3, h: 1 },
    { kind: 'basin', section: 2, x: 22, y: 18, w: 3, h: 1 },
    { kind: 'window', section: 3, x: 5, y: 17, w: 3, h: 3 },
    { kind: 'toilet', section: 3, x: 18, y: 22, w: 3, h: 4 },
  ],
});
```

- [ ] **Step 4: Put the world in the run**

In `src/data/stages.ts`, import `HOME_THEME` from `./levels`, `HOMMIK` from `./levels2/hommik` and `VANNITUBA` from `./levels2/vannituba`, and add to the `buildStages({...})` call after theme 5:

```ts
  // The home world (docs/superpowers/specs/2026-11-24-home-world-design.md): a normal day after
  // the T-Rex. Until ÕHTU is built, its last level is the bathroom fight (?boss=poo's).
  [HOME_THEME]: [
    { level: HOMMIK, nameKey: 'level_7_1' },
    { level: VANNITUBA, nameKey: 'level_poo' },
  ],
```

Update the comment above `buildStages` to say the run ends on the home world now.

In `src/config/i18n.ts`, after `world_6`:

```ts
  world_7:            {et:'KODU',                     en:'HOME'},
```

and after `level_poo`:

```ts
  level_7_1:                {et:'HOMMIK', en:'MORNING'},
```

In `tests/i18n.test.ts`, add `'world_7', 'level_7_1'` to `PORT_ONLY_KEYS`.

- [ ] **Step 5: Run each hand-built level's checks once**

`VANNITUBA` is now in `STAGES` and in `DEMOS`. In `tests/ledges.test.ts` and `tests/softlocks.test.ts`, replace the loop header

```ts
  for (const { level } of [...STAGES, ...Object.values(DEMOS)].filter((s) => !LEVELS.includes(s.level))) {
```

with

```ts
  for (const level of new Set([...STAGES, ...Object.values(DEMOS)].map((s) => s.level).filter((l) => !LEVELS.includes(l)))) {
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/home.test.ts tests/i18n.test.ts tests/ledges.test.ts tests/softlocks.test.ts tests/stages.test.ts tests/run.test.ts`
Expected: PASS, except the two `stages.test.ts`/`story.test.ts` expectations that the run ends on the T-Rex, which Task 5 rewrites. If the bed test fails because the bump lands on another column, check `game/player.ts`'s head-hit column and move the `?` over P to match; if a ledge or dead-end check fails, fix the map, not the check.

---

### Task 5: The story into the home world, and its end

**Files:**
- Modify: `src/game/story.ts`, `src/config/i18n.ts`, `src/scenes/WinScene.ts`
- Test: `tests/story.test.ts`, `tests/stages.test.ts`, `tests/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/story.test.ts` (import `HOME_THEME` from `../src/data/levels`):

Replace the first test's expectation with:

```ts
    expect(worlds().map(villainOf)).toEqual(['dollQueen', 'pterodactyl', 'vanaToomas', 'pizzaChef', 'yeti', 'tRex', 'poo']);
```

(and its name with `'has a villain for every world, the T-Rex, then Härra Kaka at home'`).

In the T-Rex test, change `finalWorld: true` to `finalWorld: false`, and its name to `'has the T-Rex come for the sibling himself before his castle'`.

Add:

```ts
  it('takes the kids home after the T-Rex: he is tiny now, Härra Kaka snatches the sibling, the map shows home', () => {
    const t = transitionInto(STAGES.findIndex((s) => s.theme === HOME_THEME))!;
    expect(t).toEqual({ kind: 'worldChange', beaten: 'tRex', villain: 'poo', world: 6, finalWorld: true });
    expect(scriptFor(t)).toMatchObject({
      beaten: { key: 'story_tiny_now' },
      grab: { key: 'story_poo_grab' },
      headline: { key: 'story_took', villainKey: 'villain_poo' },
      mapTitle: { key: 'story_world', worldNumber: 7, worldKey: 'world_7' },
    });
  });
```

In `tests/stages.test.ts`, the test `'names every classic stage by its classic key, and ends on the T-Rex'` becomes `'... and ends on Härra Kaka at home'`, with `expect(last.course?.boss?.kind).toBe('poo');` and its comment saying the run ends at home.

In `tests/i18n.test.ts`'s `PORT_ONLY_KEYS`: remove `'story_trex_tiny'`; add `'story_tiny_now', 'story_poo_grab', 'story_good_night'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/story.test.ts tests/stages.test.ts tests/i18n.test.ts`
Expected: FAIL on the new lines' keys.

- [ ] **Step 3: The lines**

In `src/config/i18n.ts`, replace the `story_trex_tiny` line with:

```ts
  story_tiny_now:     {et:'MA OLEN NÜÜD PISIKE...',   en:"I'M TINY NOW..."},
  story_poo_grab:     {et:'HIHII! %S ON NÜÜD MINU!',  en:'HEE HEE! %S IS MINE NOW!'},
  story_good_night:   {et:'HEAD ÖÖD!',                en:'GOOD NIGHT!'},
```

In `src/game/story.ts`'s `scriptFor`, the `worldChange` case:

```ts
    case 'worldChange':
      return {
        // The T-Rex was behind it all, so nobody sent him: he owns up he is tiny now.
        beaten: { key: t.beaten === 'tRex' ? 'story_tiny_now' : 'story_sent_me' },
        grab: { key: t.villain === 'tRex' ? 'story_now_me' : t.villain === 'poo' ? 'story_poo_grab' : 'story_wants' },
        headline: { key: 'story_took', villainKey: villainKey(t.villain) },
        mapTitle: { key: 'story_world', worldNumber: t.world + 1, worldKey: worldKey(t.world) },
        mapSub: { key: 'story_save' },
      };
```

Update the file's doc comment: after the T-Rex, the home world, where Härra Kaka is the last villain.

In `src/scenes/WinScene.ts`, replace the story line:

```ts
    // The story's end (game/story.ts): the run ends at home, Härra Kaka flushed away, and bed.
    this.line(TINY_Y, TINY_FONT, `${TStr('story_poo_flushed')} ${TStr('story_good_night')}`);
```

Remove `inDemo` from its import if nothing else uses it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/story.test.ts tests/stages.test.ts tests/i18n.test.ts && npx tsc --noEmit`
Expected: PASS.

---

### Task 6: The home world's tune

**Files:**
- Modify: `src/data/bgmThemes.ts`, `src/audio/bgm.ts`, `src/audio/cues.ts`, `src/scenes/SliceScene.ts`
- Test: `tests/bgmThemes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/bgmThemes.test.ts` (merge imports: `BGM_HOME, HOME_BGM, bgmTheme, levelMusic` from bgmThemes, `HOME_THEME` from levels):

```ts
describe('the home world\'s tune', () => {
  it('is its own, outside the original game\'s list, and the home levels play it', () => {
    expect(BGM_HOME).toBeGreaterThanOrEqual(BGM_THEMES.length);
    expect(bgmTheme(BGM_HOME)).toBe(HOME_BGM);
    expect(levelMusic(HOME_THEME)).toBe(BGM_HOME);
    LEVELS.forEach((_, i) => expect(levelMusic(i)).toBe(i));
    expect(bgmTheme(0)).toBe(BGM_THEMES[0]);
  });

  it('is a playable tune: a tempo, and its parts the same length', () => {
    expect(HOME_BGM.bpm).toBeGreaterThan(0);
    expect(HOME_BGM.bassN).toHaveLength(HOME_BGM.notes.length);
    expect(HOME_BGM.harmN).toHaveLength(HOME_BGM.notes.length);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/bgmThemes.test.ts`
Expected: FAIL (no `HOME_BGM`).

- [ ] **Step 3: Write the tune**

Append to `src/data/bgmThemes.ts` (and `import { HOME_THEME } from './levels';` at the top):

```ts
/**
 * The home world's tune (docs/superpowers/specs/2026-11-24-home-world-design.md): playful and
 * bouncy, bath time. Not in BGM_THEMES, which is the original game's list and stays its own;
 * it is played by its own number, BGM_HOME, past the end of that list.
 */
export const HOME_BGM: BgmTheme = {
  bpm: 150, wave: 'square', vol: 0.03, bass: 'triangle', bassVol: 0.025, harm: 'sine', harmVol: 0.016,
  notes: [262,0,330,0,392,330,262,0, 294,0,349,0,440,349,294,0,
          262,330,392,523,392,330,262,0, 294,262,247,262,294,0,262,0],
  bassN: [131,131,196,196,131,131,196,196, 147,147,220,220,147,147,220,220,
          131,131,196,196,131,131,196,196, 196,196,147,147,196,196,131,131],
  harmN: [330,330,392,392,330,330,392,392, 349,349,440,440,349,349,440,440,
          330,330,392,392,330,330,392,392, 392,392,349,349,392,392,330,330],
  perc: [1,0,2,0,1,0,2,2,1,0,2,0,1,2,2,0],
};
export const BGM_HOME = BGM_THEMES.length;

/** A tune by its number: one of the original game's, or the home world's. */
export function bgmTheme(index: number): BgmTheme | undefined {
  return index === BGM_HOME ? HOME_BGM : BGM_THEMES[index];
}

/** A level's tune by its theme: the classic six are their own index (index.html:1209). */
export function levelMusic(theme: number): number {
  return theme === HOME_THEME ? BGM_HOME : theme;
}
```

In `src/audio/bgm.ts`, import `bgmTheme` instead of `BGM_THEMES` and replace `const theme = BGM_THEMES[themeIndex];` with `const theme = bgmTheme(themeIndex);`.

In `src/audio/cues.ts`: `case 'music-level': startBGM(levelMusic(levelIndex)); break;` (import `levelMusic`).
In `src/scenes/SliceScene.ts`: `startBGM(levelMusic(levelIndex));` (import `levelMusic`), and in the comment above it: "theme 0-5 IS the level index; the home world has a tune of its own".

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/bgmThemes.test.ts tests/bgm.test.ts && npx tsc --noEmit`
Expected: PASS.

---

### Task 7: Furniture, potties, taps and drops on screen

**Files:**
- Create: `src/gfx/furniture.ts`
- Modify: `src/gfx/course.ts`, `src/gfx/textures.ts`, `src/scenes/SliceScene.ts`

No unit tests (Phaser); checked in the browser in Task 9.

- [ ] **Step 1: The furniture**

Create `src/gfx/furniture.ts`:

```ts
import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { Furniture, FurnitureKind, Level } from '../data/levels';
import { spriteScale, TOILET_TEXTURE } from './textures';

/**
 * The home world's furniture (docs/superpowers/specs/2026-11-24-home-world-design.md): a
 * picture per piece, over the level's tiles (depth 0, the course's at 1) and under anything
 * that moves. Each is drawn once into a texture per kind and size; the toilet is Härra Kaka's.
 */
export const DEPTH_FURNITURE = 2;

const WOOD = 0xa8714a;
const WOOD_DARK = 0x7a4a2a;
const WHITE = 0xf4f4f8;
const SHADE = 0xc8ccd8;
const LINE = 0x7a8090;
const TOY_COLOURS = [0xff5a5a, 0x5ab0ff, 0xffd23f, 0x6ad06a, 0xc07aff];

type Draw = (g: Phaser.GameObjects.Graphics, W: number, H: number, w: number, h: number) => void;

const DRAW: Record<Exclude<FurnitureKind, 'toilet'>, Draw> = {
  // A headboard at the left, the mattress's top level with the top of the bottom row (the
  // springs under it), a blue blanket, a pillow, a low footboard.
  bed: (g, W, H) => {
    const top = H - TILE;
    g.fillStyle(WOOD_DARK).fillRect(0, 0, 8, H);
    g.fillStyle(WOOD).fillRect(2, 2, 4, H - 4);
    g.fillStyle(WOOD_DARK).fillRect(W - 6, top - 6, 6, H - top + 6);
    g.fillStyle(WHITE).fillRect(8, top, W - 14, 5);
    g.fillStyle(0x5b8fe0).fillRect(22, top, W - 28, 6);
    g.fillStyle(0x8fb8ff).fillRect(22, top, W - 28, 1);
    g.fillStyle(WOOD_DARK).fillRect(8, top + 6, W - 14, 6);
    g.fillStyle(0x5a3a22).fillRect(10, H - 4, 3, 4).fillRect(W - 10, H - 4, 3, 4);
    g.fillStyle(0xfff6e0).fillRoundedRect(10, top - 6, 12, 7, 3);
  },
  // A morning sky with the sun in it, white bars, pink curtains.
  window: (g, W, H) => {
    g.fillStyle(0xffffff).fillRect(0, 0, W, H);
    g.fillStyle(0x9fd8ff).fillRect(3, 3, W - 6, H - 6);
    g.fillStyle(0xffe14a).fillCircle(W * 0.68, H * 0.38, Math.min(W, H) * 0.16);
    g.fillStyle(0xffffff).fillRect(W / 2 - 1, 0, 2, H).fillRect(0, H / 2 - 1, W, 2);
    g.fillStyle(0xff8fb0).fillRect(0, 0, 5, H).fillRect(W - 5, 0, 5, H);
  },
  // An open door into the next room.
  door: (g, W, H) => {
    g.fillStyle(0xffffff).fillRect(0, 0, W, H);
    g.fillStyle(0x5a3a22).fillRect(3, 3, W - 6, H - 3);
    g.fillStyle(WOOD).fillRect(3, 3, 7, H - 3);
    g.fillStyle(0xffd23f).fillCircle(8, H / 2, 1.5);
  },
  // Toy blocks, a tile each, in turn red, blue, yellow, green, purple, a white square on each.
  toyBlocks: (g, _W, _H, w, h) => {
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const c = TOY_COLOURS[(tx + ty * 2) % TOY_COLOURS.length];
        const x = tx * TILE;
        const y = ty * TILE;
        g.fillStyle(c).fillRect(x, y, TILE, TILE);
        g.fillStyle(0xffffff, 0.35).fillRect(x, y, TILE, 2).fillRect(x, y, 2, TILE);
        g.fillStyle(0x000000, 0.2).fillRect(x, y + TILE - 2, TILE, 2).fillRect(x + TILE - 2, y, 2, TILE);
        g.fillStyle(0xffffff).fillRect(x + 5, y + 5, 6, 6);
        g.fillStyle(c).fillRect(x + 7, y + 7, 2, 2);
      }
    }
  },
  // A green box step with a handle hole.
  stool: (g, W, H) => {
    g.fillStyle(0x6ad06a).fillRect(0, 0, W, H);
    g.fillStyle(0x9ff09f).fillRect(0, 0, W, 3);
    g.fillStyle(0x3a9a3a).fillRect(0, H - 3, W, 3);
    g.fillStyle(0x3a9a3a).fillRoundedRect(W / 2 - 6, H / 2 - 2, 12, 5, 2);
  },
  // White cupboards under the counter's top, a door every two tiles.
  counter: (g, W, H) => {
    g.fillStyle(WHITE).fillRect(0, 0, W, H);
    g.fillStyle(SHADE).fillRect(0, H - 3, W, 3);
    for (let x = 0; x + 2 * TILE <= W; x += 2 * TILE) {
      g.lineStyle(1, LINE).strokeRect(x + 2, 3, 2 * TILE - 4, H - 8);
      g.fillStyle(LINE).fillRect(x + TILE - 1, H / 2 - 3, 2, 6);
    }
  },
  // A long mirror with a silver edge and a few shines.
  mirror: (g, W, H) => {
    g.fillStyle(SHADE).fillRect(0, 0, W, H);
    g.fillStyle(0xcfefff).fillRect(2, 2, W - 4, H - 4);
    g.lineStyle(2, 0xffffff, 0.7);
    for (let x = 12; x < W - 14; x += 44) g.lineBetween(x, H - 5, x + 10, 5);
  },
  // A white basin on the counter.
  basin: (g, W, H) => {
    g.fillStyle(WHITE).fillRoundedRect(1, H - 10, W - 2, 10, { tl: 2, tr: 2, bl: 6, br: 6 });
    g.fillStyle(SHADE).fillRect(4, H - 9, W - 8, 2);
  },
};

function textureFor(scene: Phaser.Scene, f: Furniture): string {
  if (f.kind === 'toilet') return TOILET_TEXTURE;
  const key = `furniture-${f.kind}-${f.w}x${f.h}`;
  if (scene.textures.exists(key)) return key;
  const W = f.w * TILE;
  const H = f.h * TILE;
  const g = scene.make.graphics({}, false);
  DRAW[f.kind](g, W, H, f.w, f.h);
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
}

/** Every piece of the level's furniture, standing on its bottom row. Static: drawn once. */
export function drawFurniture(scene: Phaser.Scene, level: Level): Phaser.GameObjects.Image[] {
  return (level.furniture ?? []).map((f) => {
    const image = scene.add
      .image(f.x * TILE, (f.y + 1) * TILE, textureFor(scene, f))
      .setOrigin(0, 1)
      .setDepth(DEPTH_FURNITURE);
    // The toilet is a palette sprite, baked at the render scale.
    if (f.kind === 'toilet') image.setScale(spriteScale(image));
    return image;
  });
}
```

In `src/scenes/SliceScene.ts`, after `this.questionBlocks = drawStaticTiles(this, this.world);` add `drawFurniture(this, this.world.level);` (import it).

- [ ] **Step 2: The drop's picture**

In `src/gfx/textures.ts`: `export const DROP_TEXTURE = 'drop';` beside `STINK_TEXTURE`, `addSprite(scene, DROP_TEXTURE, DROP_S, DROP_P, 2);` beside the stink's `addSprite`, and `DROP_P, DROP_S` in the sprites import.

In `SliceScene.syncEnemyProjectiles`: add `const drop = shot.type === 'drop';`; in the texture choice put `drop ? DROP_TEXTURE :` first; in `setPosition` use `drop ? shot.y - 2 :` first for y; add `drop ||` to the `setAlpha(... ? 1 : ...)` list; add `!drop &&` to the trail condition; update the comment ("a dripping tap's drops fall straight down").

- [ ] **Step 3: Potties, taps and splashes in the course view**

In `src/gfx/course.ts`:

```ts
const COURSE_POTTY_TEXTURE = 'course-potty';
const COURSE_TAP_TEXTURE = 'course-tap';
```

In `registerCourseTextures`:

```ts
  // The home world's checkpoint: a little pink potty.
  bake(scene, COURSE_POTTY_TEXTURE, 16, 12, (g) => {
    g.fillStyle(0xff8fc0).fillRoundedRect(2, 3, 12, 9, { tl: 1, tr: 1, bl: 4, br: 4 });
    g.fillStyle(0xffd0e6).fillRect(0, 2, 16, 3);
    g.fillStyle(0xc05a90).fillRect(14, 4, 2, 4);
    g.fillStyle(0xffffff, 0.6).fillRect(4, 6, 2, 4);
  });
  // A tap out of the wall, its spout over the middle of the tile, a blue cold-water handle.
  bake(scene, COURSE_TAP_TEXTURE, TILE, TILE, (g) => {
    g.fillStyle(0xb8c0c8).fillRect(0, 5, 10, 4).fillRect(6, 9, 4, 6);
    g.fillStyle(0xeef2f6).fillRect(0, 5, 10, 1).fillRect(6, 9, 1, 6);
    g.fillStyle(0x5ab0ff).fillRect(2, 1, 6, 3);
    g.fillStyle(LINE_GREY).fillRect(4, 3, 2, 2);
  });
```

with `const LINE_GREY = 0x7a8090;` among the colours.

`FlagView` gains `readonly potty: boolean;`. In the constructor's `this.flags = ...`:

```ts
    this.flags = course.flags.map((f) => {
      const x = f.x * TILE + TILE / 2;
      const groundY = f.y * TILE;
      if (world.level.potty) {
        // The home world's checkpoints are potties: grey until reached.
        const potty = scene.add.image(x, groundY, COURSE_POTTY_TEXTURE).setOrigin(0.5, 1)
          .setTint(FLAG_DOWN).setDepth(DEPTH_COURSE_THINGS);
        return { x: f.x, cloth: potty, top: groundY, raised: false, potty: true };
      }
      scene.add.image(x, groundY, COURSE_POLE_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH_COURSE_THINGS);
      const cloth = scene.add
        .image(x + 1, groundY - 4, COURSE_FLAG_TEXTURE)
        .setOrigin(0, 1)
        .setTint(FLAG_DOWN)
        .setDepth(DEPTH_COURSE_THINGS);
      return { x: f.x, cloth, top: groundY - TILE * 3 + 10, raised: false, potty: false };
    });
```

In `syncFlags`, replace the tint-and-tween lines:

```ts
      if (view.potty) {
        // A potty reached: its own colours, and a hop.
        if (raised) {
          view.cloth.clearTint();
          this.scene.tweens.add({ targets: view.cloth, y: view.top - 6, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        } else {
          view.cloth.setTint(FLAG_DOWN).setY(view.top);
        }
        continue;
      }
      view.cloth.setTint(raised ? FLAG_UP : FLAG_DOWN);
      if (raised) {
        this.scene.tweens.add({ targets: view.cloth, y: view.top, duration: 700, ease: 'Cubic.easeOut' });
      }
```

(keeping `this.scene.tweens.killTweensOf(view.cloth);` before it).

Taps: a field `private readonly taps: Array<{ x: number; y: number; drop: Phaser.GameObjects.Image }> = [];`, built in the constructor:

```ts
    for (const t of course.taps) {
      scene.add.image(t.x * TILE, t.y * TILE, COURSE_TAP_TEXTURE).setOrigin(0, 0).setDepth(DEPTH_COURSE_THINGS);
      const drop = scene.add.image(t.x * TILE + TILE / 2, (t.y + 1) * TILE - 1, DROP_TEXTURE)
        .setOrigin(0.5, 0).setDepth(DEPTH_COURSE_THINGS).setVisible(false);
      this.taps.push({ x: t.x, y: t.y, drop });
    }
```

A method, called from `update` after `this.syncLava(world, course);`:

```ts
  /** A drop swells at a tap's spout while it wobbles, then lets go (game/course.ts). */
  private syncTaps(world: World, course: CourseState): void {
    course.taps.forEach((t, i) => {
      const view = this.taps[i];
      if (!view) return;
      const swelling = tapWarning(t);
      view.drop.setVisible(swelling);
      if (!swelling) return;
      const k = 1 - t.timer / TAP_WARN_FRAMES;
      view.drop.setScale(spriteScale(view.drop) * (0.3 + 0.7 * k))
        .setX(view.x * TILE + TILE / 2 + Math.sin(world.animFrame * 0.8) * k);
    });
  }
```

In `playFx`, add `case 'drip': this.spray.explode(6, fx.x, fx.y); break;`.

Imports: `TAP_WARN_FRAMES, tapWarning` from `../game/course`; `DROP_TEXTURE, spriteScale` from `./textures` (spriteScale is already imported).

- [ ] **Step 4: Type-check and run everything**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

---

### Task 8: The cut to home, and a house on the map

**Files:**
- Modify: `src/scenes/BetweenScene.ts`, `src/gfx/worldMap.ts`

Checked in the browser in Task 9.

- [ ] **Step 1: Seven stops on the map**

In `src/gfx/worldMap.ts`:

```ts
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [92, 268], [168, 196], [246, 262], [322, 188], [400, 254], [476, 178], [552, 250],
];
```

Import `HOME_THEME` from `../data/levels` and `STAGES` from `../data/stages`. Badge colour:

```ts
      const bg = LEVELS[theme]?.bg ?? STAGES.find((s) => s.theme === theme)?.level.bg ?? '#88ccff';
      const colour = Phaser.Display.Color.HexStringToColor(bg).color;
      const ring = i === SPOTS.length - 1 ? 0xffd23f : 0xffffff;
      if (theme === HOME_THEME) {
        // Home: a little house, a red roof over it.
        badge.fillStyle(0x000000, 0.2).fillRect(x - 20, y - 7, 44, 32);
        badge.fillStyle(colour).fillRect(x - 22, y - 10, 44, 32);
        badge.lineStyle(3, ring).strokeRect(x - 22, y - 10, 44, 32);
        badge.fillStyle(0xc0504a).fillTriangle(x - 28, y - 10, x + 28, y - 10, x, y - 34);
      } else {
        badge.fillStyle(0x000000, 0.2).fillCircle(x + 2, y + 3, BADGE_R);
        badge.fillStyle(colour).fillCircle(x, y, BADGE_R);
        badge.lineStyle(3, ring).strokeCircle(x, y, BADGE_R);
      }
```

The villain's trip in the opening still ends at the T-Rex's castle: in the constructor `this.castle = Math.max(0, themes.indexOf(LEVELS.length - 1));` (a `private readonly castle: number` field), and in `update`:

```ts
      const u = Math.min(this.castle, (t / VILLAIN_TRIP) * this.castle);
```

Update the file's doc comment: seven stops, the castle, then home.

- [ ] **Step 2: The cut from the castle to home**

In `src/scenes/BetweenScene.ts`:

Imports: `HOME_THEME` from `../data/levels`, `drawWallpaper` from `../gfx/parallax`, `TOILET_TEXTURE` from `../gfx/textures`.

Constants:

```ts
/** Into the home world, the scene cuts from the castle to home at the snatch, through black. */
const CUT_FRAMES = 20;
/** Where the toilet stands at home, and how long Härra Kaka takes to come up out of it. */
const HOME_TOILET_X = 540;
const POP_FRAMES = 30;
```

Fields:

```ts
  /** Into the home world: the castle until the snatch, then home. */
  private homeCut = false;
  private away: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private home: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> = [];
  private cutShade?: Phaser.GameObjects.Rectangle;
```

`drawBackdrop` returns what it draws:

```ts
  private drawBackdrop(theme: number): Phaser.GameObjects.Graphics[] {
    const level = STAGES.find((s) => s.theme === theme)?.level ?? this.stage.level;
    const parallax = PARALLAX[theme];
    const sky = this.add.graphics().setDepth(-3);
    drawSky(sky, level.bg, parallax?.bg2 ?? level.bg);
    const drawn = [sky];
    if (parallax) {
      const ridges = this.add.graphics().setDepth(-2);
      drawRidges(ridges, parallax.layers, 0);
      drawn.push(ridges);
    }
    drawn.push(this.add.graphics()
      .fillStyle(colour(level.groundColor)).fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(colour(level.groundTop)).fillRect(0, GROUND_Y, BASE_W, 6)
      .setDepth(-1));
    return drawn;
  }

  /** Home: the next level's wallpaper and floor, and the toilet Härra Kaka comes up out of. */
  private drawHome(): Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image> {
    const level = this.stage.level;
    const wall = this.add.graphics().setDepth(-3);
    drawWallpaper(wall, level.bg);
    const floor = this.add.graphics()
      .fillStyle(colour(level.groundColor)).fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(colour(level.groundTop)).fillRect(0, GROUND_Y, BASE_W, 6)
      .setDepth(-1);
    const toilet = this.add.image(HOME_TOILET_X, GROUND_Y, TOILET_TEXTURE).setOrigin(0.5, 1).setDepth(DEPTH_ACTOR + 0.5);
    toilet.setScale(spriteScale(toilet));
    return [wall, floor, toilet];
  }
```

In `create`, replace `this.drawBackdrop(finished?.theme ?? this.stage.theme);` with:

```ts
    this.homeCut = this.transition?.kind === 'worldChange' && this.stage.theme === HOME_THEME;
    this.away = this.drawBackdrop(finished?.theme ?? this.stage.theme);
    this.home = [];
    this.cutShade = undefined;
    if (this.homeCut) {
      this.home = this.drawHome();
      for (const o of this.home) o.setVisible(false);
      this.cutShade = this.add.rectangle(0, 0, BASE_W, BASE_H, 0x000000).setOrigin(0, 0)
        .setDepth(DEPTH_LABEL + 0.5).setAlpha(0);
    }
```

In `update`, before `if (this.map && t >= mapAt) {`: `this.syncHomeCut(t);`, with:

```ts
  /** Into the home world: through black from the castle to home as Härra Kaka comes. */
  private syncHomeCut(t: number): void {
    if (!this.homeCut) return;
    const at = this.times.grabAt;
    for (const o of this.away) o.setVisible(t < at);
    for (const o of this.home) o.setVisible(t >= at);
    this.cutShade?.setAlpha(Math.max(0, 1 - Math.abs(t - at) / CUT_FRAMES));
  }
```

At the top of `drawBeaten`, after `if (!this.beaten) return;`:

```ts
    // Home: the T-Rex stayed at his castle.
    if (this.homeCut && t >= this.times.grabAt) {
      this.beaten.setVisible(false);
      for (const star of this.beatenStars) star.setVisible(false);
      this.beatenBubble?.setVisible(false);
      this.beatenSays?.setVisible(false);
      return;
    }
```

In `drawSnatch`, replace the swoop (the `if (grabT < CARRY_AFTER) {` branch's `this.villain...setPosition(...)` statement) with:

```ts
      if (this.homeCut) {
        // Up out of the toilet, behind its bowl, then over to the sibling.
        const rise = Math.min(1, grabT / POP_FRAMES);
        const x = HOME_TOILET_X - this.villain.displayWidth / 2 - Math.max(0, grabT - POP_FRAMES) * 4;
        this.villain.setFlipX(false).setDepth(grabT < POP_FRAMES ? DEPTH_ACTOR : DEPTH_CARRIED)
          .setPosition(x, this.villainY + (1 - rise) * 40);
      } else {
        this.villain
          .setFlipX(this.snatching === null)
          .setPosition(BASE_W + 20 - grabT * 4, this.villainY + Math.sin(t * 0.3) * 2);
      }
```

- [ ] **Step 3: Type-check and run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no errors, all tests pass, the build succeeds.

---

### Task 9: In the browser, and the papers

- [ ] **Step 1: Serve the worktree**

Run (in the background): `npm run dev -- --port 5181 --strictPort`

- [ ] **Step 2: Play HOMMIK in the browser**

Open `http://localhost:5181/next/?level=19` (HOMMIK is the run's 19th stage; check the path the dev server prints). Choose Super Easy and a hero. With the hidden-tab harness (memory: hidden-tab-browser-checks: `game.loop.sleep()`, a `Date.now` override, `game.step`, key events with `keyCode` set) take screenshots of: the bed bounce bumping the `?`; the bedroom furniture; the hallway, a sock stomped, the hairbrush shot; the stool and counter, a tap swelling and a drop falling into a basin, its splash; a potty turning to colour; Härra Kaka with the sibling by the toilet, hopping off. A bot (re-read world state each frame) runs it through on Super Easy and on Hard: note any death the level forces.

- [ ] **Step 3: The cutscene into home, and the map**

Start a run at stage 18 (Troonisaal; `?level=18`), set the world's `won` through the harness to end it, and screenshot the between scene: the T-Rex dazed saying "MA OLEN NÜÜD PISIKE...", the cut through black to home, Härra Kaka up out of the toilet, the snatch, the headline, and the map with seven stops, the house last, the hero walking from the castle to it. Then finish `VANNITUBA` (stage 20) and screenshot the win screen's last line.

- [ ] **Step 4: Fix what the browser shows**

Anything wrong on screen: fix it, re-run `npx tsc --noEmit && npx vitest run`, re-check.

- [ ] **Step 5: The papers**

- `next/PLAYTEST.md`: a section "The home world (KODU)": `?level=19` for HOMMIK; what to try (the bed, the taps, the potties, the hairbrush); that PÄEV and ÕHTU come in steps 2 and 3.
- The spec: under Steps, mark step 1 done (2026-11-24).
- Memory (`obstacle-course-demo.md`): the home world, step 1 built, worktree and branch, what is next.

- [ ] **Step 6: Final check**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all pass. Then stop for the owner and the children to play step 1 (spec: "after each, the owner and the children play it on the dev server before the next").
