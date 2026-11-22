# Doll Garden: Three Levels and the Doll Queen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doll Garden becomes three hand-built levels that grow harder (Nukuaed, Aiavärav, Nukumaja) ending in a boss fight with the Doll Queen; guards become zombies with a look and a groan; levels end in a chase or a boss; the T-Rex gets a new look.

**Architecture:** Rules stay pure in `src/game/` (the course pieces, zombies, the chase ending, the Doll Queen's whole fight) and are unit-tested; Phaser draws them (`src/gfx/`, scenes). The run's theme 0 becomes a list of three levels (`data/stages.ts`). Levels are ASCII sections (`data/course.ts`), extended with `!` rainbow, `@` cat, `t` helper targets, `:` doors, `Q` the boss and `1`-`3` her target spots.

**Tech Stack:** Phaser 4.2.1, TypeScript (strict, `noUnusedLocals`), Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, batch 1.

---

## Ground rules

- Worktree `/Users/sergei/Work/gi-do/.claude/worktrees/doll-garden`, branch `doll-garden`. Commands from `next/`. Run `npx vitest run` and `npx tsc --noEmit -p .` before calling a task done; `npm run build` at the end.
- Nothing under `src/game/` or `src/data/` imports a Phaser value.
- No commits unless the owner asks.
- Before writing Phaser code (Tasks 6 and 7), load the `phaser` skill and check the APIs used.

## File structure

| File | Responsibility |
|---|---|
| `src/game/enemy.ts`, `src/game/types.ts`, `src/data/levels.ts`, `src/data/course.ts`, `src/game/world.ts` | guards renamed zombies; zombies shuffle after the hero and groan |
| `src/data/sprites.ts`, `src/gfx/textures.ts`, `src/scenes/SliceScene.ts` | zombie palettes and textures; the queen sprite; the new T-Rex |
| `src/audio/sfx.ts`, `src/audio/cues.ts` | the groan |
| `src/data/stages.ts` | themes as lists of levels |
| `src/data/levels.ts`, `src/data/course.ts`, `src/game/course.ts` | `!`, `@`, `t`, `:`, `Q`, `1`-`9`; endings, villain, indoors on a level |
| `src/game/bosses/dollQueen.ts` (create) | the Doll Queen's fight, pure |
| `src/gfx/dollQueen.ts` (create) | her sprite, parasol, target, stars, hearts, burst |
| `src/scenes/LevelOverlayScene.ts`, `src/scenes/BetweenScene.ts` | the chase's overlay and cutscene |
| `src/data/levels2/nukuaed.ts`, `nukumaja.ts` (create), `dollGarden2.ts` (modify) | the three levels |
| tests: `course.test.ts`, `levels2.test.ts`, `sounds.test.ts`, `sprites.test.ts`, `stages.test.ts`, `i18n.test.ts` (modify); `dollQueen.test.ts`, `dollGarden.test.ts` (create); `helpers/courseRuns.ts` (modify) | |

---

### Task 1: Zombies

**Files:** `src/data/levels.ts`, `src/game/types.ts`, `src/game/world.ts`, `src/game/enemy.ts`, `src/data/course.ts`, `src/data/sprites.ts`, `src/gfx/textures.ts`, `src/scenes/SliceScene.ts`, `src/audio/sfx.ts`, `src/audio/cues.ts`, tests `course.test.ts`, `levels2.test.ts`, `sounds.test.ts`.

- [ ] **Step 1: Rename the guard to a zombie, everywhere it is written.** In `src/data/levels.ts` `EnemyDef`, replace the `guard?: boolean` field and its comment with:

```ts
  /**
   * A zombie (EnemyState.zombie): it cannot be stomped, pushes the player back instead of
   * hurting them, and goes down to an arrow. The owner's child named them.
   */
  zombie?: boolean;
```

In `src/game/types.ts`: `PendingEnemy`'s `guard?: boolean` (and its comment) becomes
`/** A zombie (EnemyState.zombie), when the level says so. */ zombie?: boolean;`; `EnemyState`'s `guard` field and comment become:

```ts
  /**
   * A zombie (data/course.ts's uppercase letters; the owner's child named them): touching it
   * does not hurt, it pushes you back, invincible or not, and it cannot be stomped, so the
   * way past is an arrow. It shuffles after the hero once they are near (game/enemy.ts).
   */
  zombie?: boolean;
  /** Set once a zombie has seen the hero and groaned about it. */
  noticed?: boolean;
  /** Frames until a zombie may groan again while it pushes the hero. */
  groanTimer?: number;
```

`src/game/world.ts` `pendingFor`: `if (d.guard) pending.guard = true;` becomes `if (d.zombie) pending.zombie = true;`.
`src/game/enemy.ts`: `if (def.guard) e.guard = true;` becomes `if (def.zombie) e.zombie = true;`; in `chickenify`, the two guard lines become `// A chicken is nobody's zombie.` and `if (e.zombie) e.zombie = false;`.
`src/data/course.ts`: `GUARD_LETTERS` becomes `ZOMBIE_LETTERS` (comment: `/** Upper case is the same walker as a zombie (EnemyState.zombie). */`), `guard: true` becomes `zombie: true`, and the legend's `D  N` line becomes
` *   D  N  a ZOMBIE doll or dino: it can't be stomped, it pushes you back, an arrow puts it down`.
Tests: in `tests/course.test.ts` and `tests/levels2.test.ts`, `d.guard` becomes `d.zombie`; `describe('the tunnel\'s guards'` becomes `describe('zombies'`, `guardAhead` becomes `zombieAhead`, and "bounce the player back" becomes "push the player back".

- [ ] **Step 2: Write the failing tests.** Add to `describe('zombies')` in `tests/course.test.ts`:

```ts
  it('shuffle after a hero they can see, and groan once when they first do', () => {
    const world = quietCourse();
    const e = zombieAhead(world);
    world.player.x = e.x - 5 * TILE;
    world.player.invincible = 9999;
    const x0 = e.x;
    let groans = 0;
    for (let i = 0; i < 40; i++) {
      step(world);
      groans += world.sounds.filter((s) => s === 'groan').length;
    }
    expect(e.x).toBeLessThan(x0);
    expect(groans).toBe(1);
  });

  it('leave a hero out of sight alone', () => {
    const world = quietCourse();
    const e = zombieAhead(world);
    world.player.x = e.x - 20 * TILE;
    step(world, {}, 5);
    expect(e.noticed).toBeFalsy();
  });
```

(`zombieAhead` already stands the player at column 0 of floor 23 and pushes the zombie; drop its `standAt`-then-overlap line from these two tests by setting `world.player.x` after it, as above.)
In `tests/sounds.test.ts`, add `'groan'` to the end of the `EFFECTS` list.

- [ ] **Step 3: Run them to see them fail.** `npx vitest run tests/course.test.ts tests/sounds.test.ts` — FAIL: `e.x` unchanged; `'groan'` not a `SoundCue`.

- [ ] **Step 4: The shuffle and the groan, in `src/game/enemy.ts`.** Add near the top, after the imports:

```ts
/** How near, in pixels, a zombie notices the hero and starts after them. */
export const ZOMBIE_SIGHT = 10 * TILE;
/** Frames between groans while a zombie keeps pushing. */
export const ZOMBIE_GROAN_GAP = 60;

/**
 * A zombie's walk: towards the hero once they are within sight, at its own slow pace, and it
 * stops at the edge of a drop rather than walking off or turning back, so it waits at a ledge.
 * Out of sight it patrols like a doll. It groans once, the first time it sees the hero.
 */
function shuffleAfterHero(world: World, e: EnemyState): void {
  if ((e.groanTimer ?? 0) > 0) e.groanTimer = (e.groanTimer ?? 0) - 1;
  const p = world.player;
  const dx = p.x + p.w / 2 - (e.x + e.w / 2);
  if (Math.abs(dx) > ZOMBIE_SIGHT) return;
  if (!e.noticed) {
    e.noticed = true;
    world.sounds.push('groan');
  }
  const dir = dx < 0 ? -1 : 1;
  const ahead = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  const floor = isSolid(getTile(world.map, ahead, e.y + e.h + 2));
  const pace = Math.abs(e.vx) || 0.8 * world.dc.enemySpeed;
  e.vx = floor ? dir * pace : 0;
}
```

In `stepEnemy`'s ground-patrol `else` branch, before `const blocked = move?.(world, e);`, add
`if (e.zombie) shuffleAfterHero(world, e);`. Replace the guard's push block with:

```ts
  // A zombie (EnemyState.zombie) pushes the player back out of it, and that is all it does:
  // no damage, and no stomp either. Ahead of the invincibility gate below on purpose, so the
  // blink after a cape is spent does not walk you through it. It groans as it shoves, but
  // not every frame of a long shove.
  if (e.zombie && rectOverlap({ x: p.x, y: p.y, w: p.w, h: p.h }, { x: e.x, y: e.y, w: e.w, h: e.h })) {
    const fromLeft = p.x + p.w / 2 < e.x + e.w / 2;
    p.x = fromLeft ? e.x - p.w - 1 : e.x + e.w + 1;
    p.vx = fromLeft ? -4 : 4;
    if (p.vy > 0) p.vy = -3;
    if ((e.groanTimer ?? 0) <= 0) {
      world.sounds.push('groan');
      e.groanTimer = ZOMBIE_GROAN_GAP;
    }
    return;
  }
```

- [ ] **Step 5: The groan as a sound.** `src/game/types.ts` `SoundCue`: add `| 'groan'` after `| 'wrong'`. `src/audio/sfx.ts`, at the end:

```ts
/**
 * A zombie (game/enemy.ts): a low, wobbling moan, two falling notes. Quiet, because there can
 * be three of them in a tunnel, and a child should hear them coming, not be startled.
 */
export function sfxGroan(): void {
  playTone(130, 0.45, 'sawtooth', 0.06, 90);
  setTimeout(() => playTone(110, 0.5, 'triangle', 0.07, 70), 200);
}
```

`src/audio/cues.ts`: import `sfxGroan` and add `case 'groan': sfxGroan(); break;` after `case 'wrong'`.

- [ ] **Step 6: The zombie look.** `src/data/sprites.ts`, after `DINO_P`:

```ts
/** Zombies (the owner's child's word for them): the same walkers, grey-green and red-eyed. */
export const ZOMBIE_DOLL_P={1:'#ff4040',2:'#4a3d55',3:'#3a1f1f',4:'#6f8f5f',7:'#9fb58a'};
export const ZOMBIE_DINO_P={1:'#7d8f6a',2:'#3e4a36',3:'#ffee55'};
```

`src/gfx/textures.ts`: import `ZOMBIE_DOLL_P, ZOMBIE_DINO_P` (and `DOLL_S`, `DINO_S` if not imported) and add:

```ts
/** The walkers that have a zombie (data/course.ts's uppercase letters), and its palette. */
export const ZOMBIE_KINDS: Readonly<Record<string, { sprite: SpriteData; palette: Palette }>> = {
  doll: { sprite: DOLL_S, palette: ZOMBIE_DOLL_P },
  dino: { sprite: DINO_S, palette: ZOMBIE_DINO_P },
};

/** `enemy-zombie-<type>`. */
export function zombieTextureKey(type: string): string {
  return `enemy-zombie-${type}`;
}
```

and at the end of `registerEnemyTextures`:

```ts
  for (const [type, { sprite, palette }] of Object.entries(ZOMBIE_KINDS)) {
    addSprite(scene, zombieTextureKey(type), sprite, palette, ENEMY_SCALE);
  }
```

`src/scenes/SliceScene.ts` `syncEnemyImage`: `image.setTexture(enemyTextureKey(enemy.type));` becomes

```ts
    image.setTexture(enemy.zombie && enemy.type in ZOMBIE_KINDS
      ? zombieTextureKey(enemy.type)
      : enemyTextureKey(enemy.type));
    // A zombie sways as it shuffles, so it reads as one before it is close enough to groan.
    image.setAngle(enemy.alive && enemy.zombie ? Math.sin(animFrame * 0.12 + enemy.x * 0.05) * 5 : 0);
```

and the three tint lines (`// An obstacle course's guard is flushed red...`, `if (enemy.guard) ...`, `else image.clearTint();`) are deleted. Import `ZOMBIE_KINDS, zombieTextureKey` from `../gfx/textures`.

- [ ] **Step 7: Run the tests and types.** `npx vitest run && npx tsc --noEmit -p .` — all pass.

---

### Task 2: Themes as lists of levels

**Files:** `src/data/stages.ts`, `tests/stages.test.ts`.

- [ ] **Step 1: The failing test.** Replace `tests/stages.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_NAME_KEYS } from '../src/data/levels';
import { buildStages, STAGES } from '../src/data/stages';

const named = (name: string) => ({ ...LEVELS[0], name });

describe('the run order', () => {
  it('is the six classic levels when no theme has a list of its own', () => {
    expect(buildStages({}).map((s) => [s.theme, s.level])).toEqual(LEVELS.map((l, i) => [i, l]));
  });

  it('plays a theme\'s own list in place of its classic level', () => {
    const a = named('A');
    const b = named('B');
    const stages = buildStages({ 1: [{ level: a, nameKey: 'x' }, { level: b, nameKey: 'y' }] });
    expect(stages.map((s) => s.level.name)).toEqual([
      'Doll Garden', 'A', 'B', 'Tallinn Old Town', 'Palermo Piazza', 'Winter Wonderland', 'Toy Castle',
    ]);
    expect(stages[2]).toEqual({ theme: 1, level: b, nameKey: 'y' });
  });

  it('names every classic stage by its classic key, and ends on the boss', () => {
    for (const s of STAGES) if (LEVELS.includes(s.level)) expect(s.nameKey).toBe(LEVEL_NAME_KEYS[s.theme]);
    expect(STAGES[STAGES.length - 1].level).toBe(LEVELS[LEVELS.length - 1]);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/stages.test.ts` — FAIL (`buildStages` takes second levels).

- [ ] **Step 3: `src/data/stages.ts`.** Replace `SecondLevel` and `buildStages` with:

```ts
/** One of a theme's levels, and the key of its name. */
export interface LevelEntry {
  level: Level;
  nameKey: string;
}

/**
 * The run, theme by theme. A theme with a list of its own plays that list in place of its
 * classic level (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md); a theme
 * not yet reworked plays its classic level alone. Toy Castle keeps its classic level last,
 * because that is the boss and the boss is the end (game/boss.ts's isFinalLevel).
 */
export function buildStages(themes: Partial<Record<number, readonly LevelEntry[]>>): Stage[] {
  return LEVELS.flatMap((level, theme) => {
    const listed = themes[theme];
    if (!listed) return [{ theme, level, nameKey: LEVEL_NAME_KEYS[theme] }];
    return listed.map((entry) => ({ theme, level: entry.level, nameKey: entry.nameKey }));
  });
}

export const STAGES: readonly Stage[] = buildStages({
  0: [
    { level: LEVELS[0], nameKey: LEVEL_NAME_KEYS[0] },
    { level: DOLL_GARDEN_2, nameKey: 'level_1_2' },
  ],
  1: [
    { level: LEVELS[1], nameKey: LEVEL_NAME_KEYS[1] },
    { level: DINO_CANYON_2, nameKey: 'level_2_2' },
  ],
});
```

(The same run as before; Task 8 replaces theme 0's list.)

- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit -p .` — all pass.

---

### Task 3: The ASCII format grows: rainbow, cat, helper targets, doors, a boss; endings on a level

**Files:** `src/data/levels.ts`, `src/data/course.ts`, `src/game/course.ts`, `tests/course.test.ts`.

- [ ] **Step 1: The failing tests,** in `describe('the course map')` of `tests/course.test.ts` (import `TILE_RAINBOW` from `../src/data/levels`):

```ts
  it('reads a rainbow block and the cat', () => {
    const { map, cat } = parseCourse(['P..@..!...R', '###########']);
    expect(map[0][6]).toBe(TILE_RAINBOW);
    expect(cat).toBe(3);
  });

  it('reads a boss, its target spots in number order, and a walk between its door and its cage', () => {
    const { course, map } = parseCourse([
      'P..........2.............',
      '...:.......1...Q....3.R..',
      '#########################',
    ]);
    const b = course.boss!;
    expect(b.kind).toBe('dollQueen');
    expect([b.x, b.y]).toEqual([15, 2]);
    expect(b.spots).toEqual([{ x: 11, y: 1 }, { x: 11, y: 0 }, { x: 20, y: 1 }]);
    expect(b.patrol).toEqual([7, 19]);
    expect(course.doors).toEqual([{ x: 3, cells: [{ x: 3, y: 1 }] }]);
    expect(map[1][3]).toBe(TILE_EMPTY);
  });

  const GROUP = [
    'P....T....t.........R',
    '..................|..',
    '..................|..',
    '#####################',
  ];

  it('lets a lower-case t help the nearest T: their gate opens only once both are hit', () => {
    expect(parseCourse(GROUP).course.targets.map((t) => t.partOf ?? null)).toEqual([null, 0]);
    const world = quietWorld(courseLevel({ name: 'group', theme: 0, sections: [GROUP] }));
    const [big, small] = world.course!.targets;
    world.arrows.push({ x: big.box.x - 8, y: big.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 60);
    expect(world.map[2][18]).toBe(TILE_GATE);
    world.arrows.push({ x: small.box.x - 8, y: small.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 60);
    expect(world.map[2][18]).toBe(TILE_EMPTY);
  });

  it('shuts a door behind the player once they are through it, and not before', () => {
    const rows = ['P.....:.......R', '......:........', '###############'];
    const world = quietWorld(courseLevel({ name: 'door', theme: 0, sections: [rows] }));
    standAt(world, 4, 2);
    step(world);
    expect(world.map[0][6]).toBe(TILE_EMPTY);
    standAt(world, 8, 2);
    step(world);
    expect([world.map[0][6], world.map[1][6]]).toEqual([TILE_GATE, TILE_GATE]);
  });
```

- [ ] **Step 2:** `npx vitest run tests/course.test.ts` — FAIL.

- [ ] **Step 3: `src/data/levels.ts`.** `CourseDef.targets`' element type gains `partOf?: number` with the comment `/** A lower-case t: the index of the T it helps open. */`. `CourseDef` gains:

```ts
  /** Doors (`:`) that shut behind the player once they are through, each a column of cells. */
  doors: Array<{ x: number; cells: Array<{ x: number; y: number }> }>;
  /** The boss, on a level that ends with one. */
  boss?: BossDef;
```

`Level` gains, after `course?`:

```ts
  /** How the level ends. Absent means 'rescue', the original levels' ending. */
  ending?: LevelEnding;
  /** Who runs off with the sibling at a 'chase' ending. */
  villain?: Villain;
  /** Drawn indoors: a wallpaper instead of the theme's sky, hills and clouds. */
  indoors?: boolean;
```

and at the end of the file:

```ts
/**
 * How a level ends (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md): the
 * sibling rescued (the original levels), the villain running off with them as the hero arrives
 * (a theme's first two levels), or a boss to beat before the cage opens (its third).
 */
export type LevelEnding = 'rescue' | 'chase' | 'boss';

/** A theme's villain, who carries the sibling through its levels. */
export type Villain = 'dollQueen';

/** A boss, as a level's ASCII places it. */
export interface BossDef {
  kind: 'dollQueen';
  /** Where she stands: the column, and the floor row under her. */
  x: number;
  y: number;
  /** Where each round's target stands, in order (the level's digits 1, 2, 3...). */
  spots: Array<{ x: number; y: number }>;
  /** The columns her walk stays between: a few in from her door, a few short of the cage. */
  patrol: [number, number];
}
```

- [ ] **Step 4: `src/data/course.ts`.** Import `TILE_RAINBOW` and `type BossDef, type LevelEnding, type Villain`; add `'!': TILE_RAINBOW` to `TILE_LETTERS`. The legend gains:

```ts
 *   !  rainbow block: a random silly power-up    @  the cat
 *   t  a helper target: the T nearest it opens only once this is hit too
 *   :  door: open until the player is through it, then it shuts behind them
 *   Q  the boss, where she stands    1 2 3  where her targets stand, round by round
```

`ParsedCourse` gains `cat: number | null;`. Replace `distance` and add the doors scanner:

```ts
/** Tiles apart, counting a diagonal step as one. */
function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** How far a target is from a run: its nearest cell. */
function distance(t: { x: number; y: number }, run: Cell[]): number {
  return Math.min(...run.map((c) => chebyshev(c, t)));
}

/** Every run of `:` (a column): a door that shuts once the player is through it. */
function doorsIn(rows: readonly string[]): CourseDef['doors'] {
  const doors: CourseDef['doors'] = [];
  for (let x = 0; x < rows[0].length; x++) {
    for (let y = 0; y < rows.length; y++) {
      if (rows[y][x] !== ':' || rows[y - 1]?.[x] === ':') continue;
      const cells: Array<{ x: number; y: number }> = [];
      for (let y1 = y; rows[y1]?.[x] === ':'; y1++) cells.push({ x, y: y1 });
      doors.push({ x, cells });
    }
  }
  return doors;
}
```

In `parseCourse`: declare `let queen: { x: number; y: number } | null = null; let cat: number | null = null; const helpers: Array<{ x: number; y: number }> = []; const spots: Array<{ n: number; x: number; y: number }> = [];`; in the letter loop add, after the `'R'` branch:

```ts
      else if (ch === 'Q') queen = { x, y: floorBelow(map, x, y) };
      else if (ch === '@') cat = x;
      else if (ch === 't') helpers.push({ x, y });
      else if (ch >= '1' && ch <= '9') spots.push({ n: Number(ch), x, y });
```

After the T-ownership checks, before `return`:

```ts
  helpers.sort((a, b) => a.x - b.x);
  const partOf = helpers.map((h) => {
    if (targets.length === 0) throw new Error(`the helper target at ${h.x},${h.y} has no T to help`);
    let best = 0;
    targets.forEach((t, i) => { if (chebyshev(h, t) < chebyshev(h, targets[best])) best = i; });
    return best;
  });

  const doors = doorsIn(rows);
  let boss: BossDef | undefined;
  const found = queen as { x: number; y: number } | null;
  if (found) {
    if (spots.length === 0) throw new Error('a boss needs its target spots, 1, 2, 3');
    spots.sort((a, b) => a.n - b.n);
    const behind = doors.filter((d) => d.x < found.x).map((d) => d.x + 4);
    const rx = (rescuePos as [number, number])[0];
    boss = {
      kind: 'dollQueen',
      x: found.x,
      y: found.y,
      spots: spots.map(({ x, y }) => ({ x, y })),
      // From just inside her door (or ten tiles before her, with no door) to just short of the cage.
      patrol: [behind.length > 0 ? Math.max(...behind) : found.x - 10, rx > found.x ? rx - 3 : rows[0].length - 3],
    };
  }
```

and the return becomes:

```ts
  return {
    map, playerStart, rescuePos, enemyDefs, cat: cat as number | null,
    course: {
      targets: [
        ...targets.map((t, i) => ({ ...t, cells: owned[i] })),
        ...helpers.map((h, i) => ({ ...h, cells: [], partOf: partOf[i] })),
      ],
      stations,
      flags,
      doors,
      ...(boss ? { boss } : {}),
    },
  };
```

`CourseLevelSpec` gains `ending?: LevelEnding; villain?: Villain; indoors?: boolean;`, and `courseLevel`'s returned record: `catPosition: parsed.cat,` (replacing `null` and its comment with `// The cat, where the level puts one (@).`), plus at the end
`...(spec.ending ? { ending: spec.ending } : {}), ...(spec.villain ? { villain: spec.villain } : {}), ...(spec.indoors ? { indoors: true } : {}),`.

- [ ] **Step 5: `src/game/course.ts`.** Import `TILE_GATE`. `TargetState` gains `/** A helper's T (data/levels.ts's CourseDef), or null. */ partOf: number | null;`. `CourseState` gains `doors: Array<{ x: number; cells: Array<{ x: number; y: number }>; shut: boolean }>;`. `buildCourse`: the target literal gains `partOf: t.partOf ?? null,`; the state gains `doors: def.doors.map((d) => ({ x: d.x, cells: d.cells.map((c) => ({ ...c })), shut: false })),`. Replace `stepTargets` with:

```ts
/** Whether target `i` and every helper of it have been hit. */
function groupDone(course: CourseState, i: number): boolean {
  return course.targets[i].hit && course.targets.every((o) => o.partOf !== i || o.hit);
}

/**
 * Arrows against targets, after world.ts's stepArrows, so each arrow is where it has just flown
 * to; a hit spends the arrow. A T opens what it owns once it and its helpers (t) are all hit:
 * the first of two chimes, the last one sounds like the gate opening.
 */
function stepTargets(world: World, course: CourseState): void {
  course.targets.forEach((t, i) => {
    if (t.hit) return;
    for (const a of world.arrows) {
      if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, t.box)) continue;
      a.life = 0;
      t.hit = true;
      t.timer = PLANK_INTERVAL * 3;
      world.score += Math.round(100 * world.dc.scoreMultiplier);
      world.sounds.push(groupDone(course, t.partOf ?? i) ? 'win' : 'coin');
      pushFx(course, { kind: 'target', x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 3 });
      break;
    }
  });
  world.arrows = world.arrows.filter((a) => a.life > 0);

  course.targets.forEach((t, i) => {
    if (t.done >= t.cells.length || !groupDone(course, i)) return;
    if (--t.timer > 0) return;
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
  });
}

/** A door shuts behind the player once they are a step past it, and stays shut. */
function stepDoors(world: World, course: CourseState): void {
  const p = world.player;
  for (const d of course.doors) {
    if (d.shut || p.x < (d.x + 1) * TILE + 4) continue;
    d.shut = true;
    for (const c of d.cells) {
      world.map[c.y][c.x] = TILE_GATE;
      pushFx(course, { kind: 'gate', x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 });
    }
    course.mapVersion++;
    world.sounds.push('block', 'boss-roar');
  }
}
```

and call `stepDoors(world, course);` in `stepCourse` after `stepTargets`.

- [ ] **Step 6:** `npx vitest run && npx tsc --noEmit -p .` — all pass.

---

### Task 4: The Doll Queen's fight, pure

**Files:** create `src/game/bosses/dollQueen.ts`, `tests/dollQueen.test.ts`; modify `src/game/types.ts`, `src/game/world.ts`.

- [ ] **Step 1: The failing tests.** `tests/dollQueen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jumpRise, quietWorld, standAt, step } from './helpers/courseRuns';
import { DIFF_KEYS, DIFFICULTY_CONFIG } from '../src/config/difficulty';
import { courseLevel } from '../src/data/course';
import {
  dizzyFrames, heartSpeed, QUEEN_H, QUEEN_HP, QUEEN_HURT_FRAMES, QUEEN_SIT_H, throwInterval,
  type DollQueenState,
} from '../src/game/bosses/dollQueen';
import type { Rect, World } from '../src/game/types';

/** The throne room in miniature: a door, the three spots (low, high, far), the Queen, the cage. */
function room(): string[] {
  const rows = Array.from({ length: 25 }, () => '.'.repeat(40));
  const set = (x: number, y: number, ch: string) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  rows[23] = '#'.repeat(40);
  rows[24] = '#'.repeat(40);
  set(1, 20, 'P');
  for (let y = 17; y <= 22; y++) set(4, y, ':');
  set(13, 22, '1');
  set(21, 18, '2');
  set(31, 22, '3');
  set(26, 22, 'Q');
  set(36, 22, 'R');
  return rows;
}
const ROOM = courseLevel({ name: 'throne room', theme: 0, ending: 'boss', sections: [room()] });

/** In the room, out of harm's way (invincible), with the Queen awake. */
function inRoom(difficulty: keyof typeof DIFFICULTY_CONFIG = 'super_easy'): { world: World; q: DollQueenState } {
  const world = quietWorld(ROOM, difficulty);
  standAt(world, 8, 23);
  world.player.invincible = 99999;
  step(world);
  return { world, q: world.courseBoss! };
}

function shoot(world: World, box: Rect): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h / 2 - 2, vx: 6, life: 60, isChicken: false });
}

/** Drop the hero onto her head. */
function stomp(world: World, q: DollQueenState): void {
  const p = world.player;
  p.x = q.x + q.w / 2 - p.w / 2;
  p.y = q.y - p.h + 3;
  p.vy = 4;
  p.onGround = false;
  step(world);
}

function knockParasol(world: World, q: DollQueenState): void {
  q.x = q.patrol[0];
  shoot(world, q.spots[q.round]);
  step(world);
}

describe('the Doll Queen', () => {
  it('sleeps until the hero is in the room, then raises her parasol and shows a target', () => {
    const world = quietWorld(ROOM);
    standAt(world, 2, 23);
    step(world);
    expect(world.courseBoss!.phase).toBe('asleep');
    standAt(world, 8, 23);
    step(world);
    expect(world.courseBoss!.phase).toBe('shielded');
    expect(world.courseBoss!.targetUp).toBe(true);
  });

  it('turns arrows and stomps away with her parasol', () => {
    const { world, q } = inRoom();
    shoot(world, q);
    step(world);
    expect(world.arrows).toHaveLength(0);
    stomp(world, q);
    expect(q.hp).toBe(QUEEN_HP);
    expect(world.player.vy).toBeLessThan(0);
  });

  it('sits down dizzy when her target is shot', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    expect(q.phase).toBe('dizzy');
    expect(q.h).toBe(QUEEN_SIT_H);
    expect(q.targetUp).toBe(false);
  });

  it('loses a heart to a stomp while dizzy, and calls two zombies', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    stomp(world, q);
    expect(q.hp).toBe(QUEEN_HP - 1);
    expect(q.phase).toBe('hurt');
    expect(world.enemies.filter((e) => e.zombie && e.alive)).toHaveLength(2);
  });

  it('loses a heart to an arrow while dizzy, too', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    expect(q.hp).toBe(QUEEN_HP - 1);
  });

  it('gets back up when the dizziness wears off, with the same target', () => {
    const { world, q } = inRoom();
    knockParasol(world, q);
    step(world, {}, dizzyFrames(world.dc) + 1);
    expect(q.phase).toBe('shielded');
    expect(q.round).toBe(0);
    expect(q.targetUp).toBe(true);
    expect(q.h).toBe(QUEEN_H);
  });

  it('asks for the next spot each round, and three hits beat her', () => {
    const { world, q } = inRoom();
    for (let round = 0; round < QUEEN_HP; round++) {
      expect(q.round).toBe(round);
      world.enemies.forEach((e) => { e.alive = false; });
      knockParasol(world, q);
      expect(q.phase).toBe('dizzy');
      shoot(world, q);
      step(world);
      step(world, {}, QUEEN_HURT_FRAMES + 1);
    }
    expect(q.phase).toBe('defeated');
  });

  it('takes her zombies with her when she falls', () => {
    const { world, q } = inRoom();
    q.hp = 2;
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    expect(world.enemies.some((e) => e.alive)).toBe(true);
    step(world, {}, QUEEN_HURT_FRAMES + 1);
    q.hp = 1;
    q.round = 0;
    knockParasol(world, q);
    shoot(world, q);
    step(world);
    step(world, {}, QUEEN_HURT_FRAMES + 1);
    expect(q.phase).toBe('defeated');
    expect(world.enemies.some((e) => e.alive)).toBe(false);
  });

  it('throws hearts at the hero, at a height a standing hero is hit by', () => {
    const { world, q } = inRoom();
    q.throwTimer = 1;
    step(world);
    const heart = world.enemyProjectiles.find((s) => s.type === 'heart')!;
    expect(heart.vx).toBeLessThan(0);
    const p = world.player;
    expect(heart.y + 8).toBeGreaterThan(p.y);
    expect(heart.y).toBeLessThan(p.y + p.h);
  });

  it('is quicker on hard than on super easy', () => {
    const easy = DIFFICULTY_CONFIG.super_easy;
    const hard = DIFFICULTY_CONFIG.hard;
    expect(throwInterval(hard, 0)).toBeLessThan(throwInterval(easy, 0));
    expect(heartSpeed(hard, 0)).toBeGreaterThan(heartSpeed(easy, 0));
    expect(dizzyFrames(hard)).toBeLessThan(dizzyFrames(easy));
  });

  it('sits low enough that a held jump reaches her head, on every difficulty', () => {
    for (const key of DIFF_KEYS) expect({ key, reach: jumpRise(key) > QUEEN_SIT_H }).toEqual({ key, reach: true });
  });

  it('keeps the sibling caged until she is beaten', () => {
    const { world, q } = inRoom();
    standAt(world, 36, 23);
    step(world);
    expect(world.won).toBe(false);
    q.phase = 'defeated';
    step(world);
    expect(world.won).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/dollQueen.test.ts` — FAIL: no such module.

- [ ] **Step 3: `src/game/bosses/dollQueen.ts`.**

```ts
import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { playerHit } from '../player';
import { rectOverlap } from '../tiles';
import type { Rect, World } from '../types';

/**
 * The Doll Queen, Doll Garden's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md).
 *
 * A doll three times the hero's height under a big parasol. The parasol turns arrows and stomps
 * away; a target stands somewhere in the room, and shooting it knocks the parasol off. She sits
 * down dizzy for a while, and a stomp or an arrow then costs her a heart. Three hearts. Each
 * round's target stands somewhere harder (the level's spots 1, 2, 3: low, high, far) and she
 * walks and throws faster. She throws hearts, which drift across the room at a standing hero's
 * height, and calls two zombies each time she is hit.
 *
 * Pure, like the rest of src/game/: gfx/dollQueen.ts draws her from this state and drains `fx`.
 */

export const QUEEN_HP = 3;
/** Her body, in pixels: the 12x18 sprite at 4, less a little at each side. */
export const QUEEN_W = 40;
export const QUEEN_H = 72;
/** Sitting down dizzy: low enough that a held jump on every difficulty reaches her head. */
export const QUEEN_SIT_H = 48;
/** How long she reels after a hit, untouchable, before the next round. */
export const QUEEN_HURT_FRAMES = 60;

const TARGET_W = 22;
const TARGET_H = 36;
/** A heart's height above the floor: a standing hero's chest, so a child jumps it or shoots it. */
const HEART_HEIGHT = 20;

export type QueenPhase = 'asleep' | 'shielded' | 'dizzy' | 'hurt' | 'defeated';

/** Something worth showing (gfx/dollQueen.ts). Positions in pixels. */
export interface QueenFx {
  kind: 'wake' | 'target' | 'hit' | 'clang';
  x: number;
  y: number;
}

export interface DollQueenState {
  kind: 'dollQueen';
  /** Her body's box: standing, or sitting when dizzy. */
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facing: 1 | -1;
  /** The floor she stands on, in pixels. */
  floorY: number;
  /** How far left and right her walk goes, as her `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** 0, 1, 2: which spot this round's target stands on. */
  round: number;
  phase: QueenPhase;
  /** Frames left of being dizzy, or of reeling from a hit. */
  timer: number;
  /** Frames to her next throw. */
  throwTimer: number;
  /** Each round's target box, in pixels. */
  spots: Rect[];
  /** Whether this round's target is standing. */
  targetUp: boolean;
  /** Drained by the scene; capped, so a driver that never drains it cannot grow it forever. */
  fx: QueenFx[];
}

export function walkSpeed(dc: DifficultyRecord, round: number): number {
  return 0.6 * dc.enemySpeed * (1 + 0.35 * round);
}

export function throwInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(70, Math.round(dc.enemyShootInterval * 1.3) - round * 25);
}

export function heartSpeed(dc: DifficultyRecord, round: number): number {
  return 1.1 * dc.enemySpeed * (1 + 0.25 * round);
}

/** About ten seconds on super easy, three to five elsewhere. */
export function dizzyFrames(dc: DifficultyRecord): number {
  return Math.round(180 + 120 / dc.enemySpeed);
}

export function buildDollQueen(def: BossDef, dc: DifficultyRecord): DollQueenState {
  const floorY = def.y * TILE;
  return {
    kind: 'dollQueen',
    x: def.x * TILE + TILE / 2 - QUEEN_W / 2,
    y: floorY - QUEEN_H,
    w: QUEEN_W,
    h: QUEEN_H,
    vx: 0,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - QUEEN_W],
    hp: QUEEN_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    throwTimer: throwInterval(dc, 0),
    spots: def.spots.map((s) => ({
      x: s.x * TILE + (TILE - TARGET_W) / 2,
      y: (s.y + 1) * TILE - TARGET_H,
      w: TARGET_W,
      h: TARGET_H,
    })),
    targetUp: false,
    fx: [],
  };
}

/** This round's target box. */
export function currentSpot(q: DollQueenState): Rect {
  return q.spots[Math.min(q.round, q.spots.length - 1)];
}

function pushFx(q: DollQueenState, fx: QueenFx): void {
  if (q.fx.length >= 32) q.fx.shift();
  q.fx.push(fx);
}

function centre(q: DollQueenState): { x: number; y: number } {
  return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
}

/** On her feet, parasol up, this round's target standing. */
function standUp(q: DollQueenState): void {
  q.phase = 'shielded';
  q.h = QUEEN_H;
  q.y = q.floorY - q.h;
  q.targetUp = true;
}

function sitDown(world: World, q: DollQueenState): void {
  q.phase = 'dizzy';
  q.timer = dizzyFrames(world.dc);
  q.targetUp = false;
  q.vx = 0;
  q.h = QUEEN_SIT_H;
  q.y = q.floorY - q.h;
  world.sounds.push('win', 'boing');
}

/** Two zombie dolls, one from each end of her walk. */
function callZombies(world: World, q: DollQueenState): void {
  const floorRow = q.floorY / TILE;
  for (const x of [q.patrol[0], q.patrol[1] + q.w]) {
    const e = spawnEnemy(world.map, world.dc, { type: 'doll', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (e) world.enemies.push(e);
  }
}

function hit(world: World, q: DollQueenState): void {
  q.hp--;
  q.phase = 'hurt';
  q.timer = QUEEN_HURT_FRAMES;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boss-roar');
  pushFx(q, { kind: 'hit', ...centre(q) });
  if (q.hp > 0) callZombies(world, q);
}

function defeat(world: World, q: DollQueenState): void {
  q.phase = 'defeated';
  q.targetUp = false;
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  // Her zombies go with her.
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

function walkAndThrow(world: World, q: DollQueenState): void {
  const p = world.player;
  const speed = walkSpeed(world.dc, q.round);
  q.vx = (q.vx < 0 ? -1 : 1) * speed;
  q.x += q.vx;
  if (q.x <= q.patrol[0]) {
    q.x = q.patrol[0];
    q.vx = speed;
  }
  if (q.x >= q.patrol[1]) {
    q.x = q.patrol[1];
    q.vx = -speed;
  }
  q.facing = p.x + p.w / 2 < q.x + q.w / 2 ? -1 : 1;

  if (--q.throwTimer > 0) return;
  q.throwTimer = throwInterval(world.dc, q.round);
  world.enemyProjectiles.push({
    x: q.x + q.w / 2 + q.facing * (q.w / 2 + 4),
    y: q.floorY - HEART_HEIGHT,
    vx: q.facing * heartSpeed(world.dc, q.round),
    vy: 0,
    life: 900,
    type: 'heart',
  });
  world.sounds.push('boss-fire');
}

/** Arrows: her target first, then her — turned away by the parasol, or a hit while she sits. */
function arrows(world: World, q: DollQueenState): void {
  const target = currentSpot(q);
  for (const a of world.arrows) {
    if (a.life <= 0) continue;
    const box = { x: a.x, y: a.y, w: 12, h: 4 };
    if (q.phase === 'shielded' && q.targetUp && rectOverlap(box, target)) {
      a.life = 0;
      pushFx(q, { kind: 'target', x: target.x + target.w / 2, y: target.y });
      sitDown(world, q);
      continue;
    }
    if (!rectOverlap(box, q)) continue;
    a.life = 0;
    if (q.phase === 'dizzy') {
      hit(world, q);
      break;
    }
    world.sounds.push('block');
    pushFx(q, { kind: 'clang', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/**
 * The hero touching her. From above: a stomp while she sits dizzy is a hit; while her parasol
 * is up it just bounces the hero off. From the side: pushed away, and hurt unless she is sitting.
 * Stomps work through a cape's blink; only the hurting waits for it.
 */
function contact(world: World, q: DollQueenState): void {
  const p = world.player;
  if (!rectOverlap(p, q)) return;
  const fromAbove = p.vy > 0 && p.y + p.h - 6 < q.y + q.h / 2;
  if (fromAbove) {
    p.vy = -6;
    if (q.phase === 'dizzy') {
      hit(world, q);
    } else {
      world.sounds.push('boing');
      pushFx(q, { kind: 'clang', x: p.x + p.w / 2, y: q.y });
    }
    return;
  }
  const fromLeft = p.x + p.w / 2 < q.x + q.w / 2;
  p.x = fromLeft ? q.x - p.w - 1 : q.x + q.w + 1;
  p.vx = fromLeft ? -3 : 3;
  if (q.phase === 'shielded' && p.invincible <= 0) playerHit(world);
}

/** One step of her, after the course and the enemies (game/world.ts's stepWorld). */
export function stepDollQueen(world: World, q: DollQueenState): void {
  const p = world.player;
  switch (q.phase) {
    case 'defeated':
      return;
    case 'asleep':
      if (p.x + p.w / 2 > q.patrol[0]) {
        world.sounds.push('boss-roar');
        pushFx(q, { kind: 'wake', ...centre(q) });
        standUp(q);
      }
      return;
    case 'hurt':
      if (--q.timer > 0) return;
      if (q.hp <= 0) {
        defeat(world, q);
        return;
      }
      q.round++;
      world.sounds.push('boss-roar');
      standUp(q);
      return;
    case 'dizzy':
      if (--q.timer <= 0) {
        world.sounds.push('boss-roar');
        standUp(q);
        return;
      }
      break;
    case 'shielded':
      walkAndThrow(world, q);
      break;
  }
  arrows(world, q);
  if (q.phase === 'shielded' || q.phase === 'dizzy') contact(world, q);
}
```

- [ ] **Step 4: Wire her into the world.** `src/game/types.ts`: `import type { DollQueenState } from './bosses/dollQueen';` and `World` gains, after `course`:

```ts
  /**
   * The boss of a hand-built level that ends with one (game/bosses/), rebuilt with the level
   * like the blocks; `null` everywhere else. The original Toy Castle's T-Rex is `boss`.
   */
  courseBoss: DollQueenState | null;
```

`src/game/world.ts`: import `buildDollQueen, stepDollQueen`; `LevelSpawnState` gains `courseBoss: DollQueenState | null;`; `buildLevelState` returns `courseBoss: level.course?.boss ? buildDollQueen(level.course.boss, dc) : null,`; in `stepWorld` after `stepCourse(world);` add `if (world.courseBoss) stepDollQueen(world, world.courseBoss);`; in `checkRescue`, `const canRescue = !world.boss || world.bossDefeated;` becomes

```ts
  const canRescue = (!world.boss || world.bossDefeated)
    && (!world.courseBoss || world.courseBoss.phase === 'defeated');
```

- [ ] **Step 5:** `npx vitest run && npx tsc --noEmit -p .` — all pass.

---

### Task 5: How a level ends: the chase

**Files:** `src/game/world.ts`, `src/scenes/LevelOverlayScene.ts`, `src/scenes/SliceScene.ts`, `src/scenes/BetweenScene.ts`, `src/config/i18n.ts`, tests `course.test.ts`, `i18n.test.ts`.

- [ ] **Step 1: The failing test,** in `tests/course.test.ts`:

```ts
describe('a chase ending', () => {
  const CHASE = ['P..........R...', '###############'];
  const level = courseLevel({ name: 'chase', theme: 0, ending: 'chase', villain: 'dollQueen', sections: [CHASE] });

  it('ends the level as the hero gets close, without touching anyone', () => {
    const world = quietWorld(level);
    standAt(world, 2, 1);
    step(world);
    expect(world.won).toBe(false);
    standAt(world, 8, 1);
    step(world);
    expect(world.won).toBe(true);
  });
});
```

- [ ] **Step 2:** FAIL (`won` stays false).

- [ ] **Step 3: `checkRescue` in `src/game/world.ts`.** Add above it:

```ts
/** How near the hero gets before a chase level's villain runs off (Level.ending). */
export const CHASE_REACH = 4 * TILE;
```

and at the top of `checkRescue`, after `const { x: rX, y: rY, h: rDH } = rescueSpot(world);`:

```ts
  // A chase level's villain runs off with the sibling as the hero arrives: nothing to touch,
  // nothing to beat. The level is won all the same, and the next one carries on the chase.
  if (world.level.ending === 'chase') {
    const near = Math.abs(p.x + p.w / 2 - (rX + 8)) < CHASE_REACH
      && Math.abs(p.y + p.h - (rY + rDH)) < 3 * TILE;
    if (near) {
      world.won = true;
      world.stateTimer = 200;
      world.score += Math.round(250 * world.dc.scoreMultiplier);
      world.sounds.push('boss-roar', 'music-stop');
    }
    return;
  }
```

- [ ] **Step 4: Words, in `src/config/i18n.ts`,** after `level_2_2`:

```ts
  level_1_3:          {et:'Nukumaja',                 en:'Doll House'},
  follow_them:        {et:'JÄLITA NEID!',             en:'FOLLOW THEM!'},
  next_level:         {et:'Järgmine tase...',         en:'Next level...'},
```

and `level_1_2` becomes `{et:'Aiavärav', en:'Garden Gate'}`. `tests/i18n.test.ts` `PORT_ONLY_KEYS` gains `'level_1_3', 'follow_them', 'next_level',`.

- [ ] **Step 5: The overlay.** `src/scenes/LevelOverlayScene.ts` `create`, replacing the `rescueTitle` and `closing` lines:

```ts
    // A chase level ends with the villain getting away (Level.ending): no "is safe" yet.
    const chase = this.world.level.ending === 'chase';
    this.rescueTitle = this.centred(
      RESCUE_TITLE_DY, RESCUE_TITLE_FONT, chase ? TStr('follow_them') : sibling + TStr('is_safe'),
    );
    // 'Next world...' or 'You did it!', decided by whether there is a level after this one.
    const closing = chase ? 'next_level' : isLastLevel(this.levelIndex) ? 'you_did_it' : 'next_world';
```

- [ ] **Step 6: The villain at the end of a chase level, in `SliceScene`.** Add the field
`private villainImage!: Phaser.GameObjects.Image;`, create it in `create()` right after `rescueImage`:

```ts
    // A chase level's villain (Level.villain), standing with the sibling at the end.
    this.villainImage = this.add
      .image(0, 0, VILLAIN_TEXTURES.dollQueen)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_RESCUE)
      .setVisible(false);
```

In `syncRescue`, read `courseBoss` from the world too; `const caged = boss !== null && boss.alive && isFinalLevel(level);` becomes

```ts
    const caged = (boss !== null && boss.alive && isFinalLevel(level))
      || (courseBoss !== null && courseBoss.phase !== 'defeated');
```

add `this.villainImage.setVisible(false);` next to the other two `setVisible(false)` lines, and right after `const textX = ...;`:

```ts
    if (level.ending === 'chase') {
      this.syncVillain(spot);
      return;
    }
```

and the method:

```ts
  /**
   * A chase level's end: the villain holding the sibling up while they call for help; once the
   * hero is near the level is won (game/world.ts's checkRescue) and she runs off to the right
   * with them, hopping, over the 200 frames the overlay shows.
   */
  private syncVillain(spot: RescueSpot): void {
    const { won, stateTimer, animFrame, level } = this.world;
    const run = won ? 200 - stateTimer : 0;
    const x = spot.x + 8 + run * 3.2;
    const floor = spot.y + spot.h - (won ? Math.abs(Math.sin(run * 0.25)) * 10 : 0);
    this.villainImage
      .setTexture(VILLAIN_TEXTURES[level.villain ?? 'dollQueen'])
      .setVisible(true)
      .setPosition(x, floor);
    const top = floor - this.villainImage.displayHeight;
    this.rescueImage.setPosition(x - 8, top - spot.h + 6 + Math.sin(animFrame * 0.2) * 2);
    this.rescueCryText
      .setVisible(animFrame % 80 < 50)
      .setPosition(x - RESCUE_TEXT_OFFSET_X, top - spot.h - 4);
  }
```

Import `RescueSpot` from `../game/world` (type) and `VILLAIN_TEXTURES` from `../gfx/textures` (Task 6 adds it; until then this task stops at Step 5 — do Step 6 after Task 6's Step 2).

- [ ] **Step 7: The chase cutscene, in `BetweenScene`.** Import `STAGES` from `../data/stages`, `type Villain` from `../data/levels`, `VILLAIN_TEXTURES` from `../gfx/textures`. Fields:

```ts
  /** Set when the level just finished ended in a chase: whose chase it is. */
  private chase: Villain | null = null;
  private runner?: Phaser.GameObjects.Image;
```

In `create`, after `this.stage = getCurrentStage();`:

```ts
    const finished = STAGES[this.levelIndex - 1];
    this.chase = finished?.level.ending === 'chase' ? finished.level.villain ?? 'dollQueen' : null;
```

after the actors are made:

```ts
    if (this.chase) {
      this.runner = this.add
        .image(0, 0, VILLAIN_TEXTURES[this.chase])
        .setOrigin(0.5, 1)
        .setScale(0.75)
        .setDepth(DEPTH_ACTOR)
        .setVisible(false);
    }
```

In `buildHeadline`, the title text `sibName + TStr('sib_stolen_again')` becomes
`this.chase ? TStr('follow_them') : sibName + TStr('sib_stolen_again')`. In `update`,
`this.drawTogether(t); this.drawSnatch(t);` becomes

```ts
    if (this.chase) {
      this.drawChase(t);
    } else {
      this.drawTogether(t);
      this.drawSnatch(t);
    }
```

and the method:

```ts
  /**
   * After a chase level: the villain runs across with the sibling held up, calling for help,
   * and the hero after them, both gone before the headline says to follow.
   */
  private drawChase(t: number): void {
    const runner = this.runner;
    if (!runner) return;
    const bob = Math.abs(Math.sin(t * 0.3)) * 4;
    const runnerX = 170 + t * 2.4;
    runner.setVisible(true).setPosition(runnerX, GROUND_Y - bob);
    const top = GROUND_Y - runner.displayHeight - bob;
    this.carried.setVisible(true).setPosition(runnerX - 12, top - this.siblingH + 8);
    this.help.setVisible(t % 60 < 40).setPosition(runnerX, top - this.siblingH - 4);
    this.hero.setVisible(true).setPosition(30 + t * 2.4, this.heroY - bob);
    this.hearts.setVisible(false);
    this.sibling.setVisible(false);
    this.villain.setVisible(false);
  }
```

- [ ] **Step 8:** `npx vitest run && npm run build` — all pass.

---

### Task 6: Seeing the Queen: sprite, parasol, target, stars, hearts; the indoor wallpaper

**Files:** `src/data/sprites.ts`, `src/gfx/textures.ts`, create `src/gfx/dollQueen.ts`, modify `src/gfx/course.ts` (exports), `src/gfx/parallax.ts`, `src/scenes/SliceScene.ts`.

- [ ] **Step 1: Load the `phaser` skill** and check `Graphics.slice`/`fillPath`, `Color.lighten`, `tweens.chain`, `particles(...).explode` against Phaser 4.

- [ ] **Step 2: The sprite.** `src/data/sprites.ts`, after the boss sprites:

```ts
/**
 * The Doll Queen (game/bosses/dollQueen.ts, gfx/dollQueen.ts): a doll in a pink gown with a
 * golden crown, 12x18, facing the hero; and her parasol, 14x8. Drawn for the port (2026-11-22);
 * the original game has no such boss.
 */
export const QUEEN_S=[[0,0,0,5,0,5,5,0,5,0,0,0],[0,0,0,5,5,10,10,5,5,0,0,0],[0,0,1,1,1,1,1,1,1,1,0,0],[0,1,1,2,2,2,2,2,2,1,1,0],[0,1,2,6,7,2,2,7,6,2,1,0],[0,1,8,2,2,2,2,2,2,8,1,0],[0,1,2,2,2,8,8,2,2,2,1,0],[0,1,1,2,2,2,2,2,2,1,1,0],[1,1,0,0,3,3,3,3,0,0,1,1],[1,0,2,3,3,7,7,3,3,2,0,1],[0,0,2,3,3,3,3,3,3,2,0,0],[0,0,0,3,4,3,3,4,3,0,0,0],[0,0,3,3,4,3,3,4,3,3,0,0],[0,3,3,4,3,3,3,3,4,3,3,0],[3,3,4,3,3,3,3,3,3,4,3,3],[4,4,4,4,4,4,4,4,4,4,4,4],[0,0,0,2,0,0,0,0,2,0,0,0],[0,0,9,9,0,0,0,0,9,9,0,0]];
export const QUEEN_P={1:'#ffcc33',2:'#ffe0c8',3:'#ff69b4',4:'#cc3d8a',5:'#ffd700',6:'#222233',7:'#ffffff',8:'#ff4466',9:'#8a2be2',10:'#33ccff'};
export const PARASOL_S=[[0,0,0,0,1,1,1,1,1,1,0,0,0,0],[0,0,1,1,2,2,2,2,2,2,1,1,0,0],[0,1,1,2,2,2,2,2,2,2,2,1,1,0],[1,1,2,2,2,2,2,2,2,2,2,2,1,1],[3,1,3,1,1,3,1,3,1,1,3,1,3,1],[0,0,0,0,0,0,4,4,0,0,0,0,0,0],[0,0,0,0,0,0,4,4,0,0,0,0,0,0],[0,0,0,0,0,0,4,0,4,0,0,0,0,0]];
export const PARASOL_P={1:'#ff3d8b',2:'#ff9ccb',3:'#ffffff',4:'#7a4a20'};
```

`src/gfx/textures.ts`: import `QUEEN_S, QUEEN_P, PARASOL_S, PARASOL_P` and `type Villain`; add

```ts
/** The Doll Queen, Doll Garden's boss and villain: 12x18 drawn at 4, three times the hero. */
export const QUEEN_TEXTURE = 'queen';
export const QUEEN_SCALE = 4;
/** Her parasol, 14x8 at the same scale. */
export const PARASOL_TEXTURE = 'queen-parasol';

/** Each villain's picture, for the end of a chase level and its cutscene. */
export const VILLAIN_TEXTURES: Readonly<Record<Villain, string>> = { dollQueen: QUEEN_TEXTURE };
```

and in `registerBossTextures`: `addSprite(scene, QUEEN_TEXTURE, QUEEN_S, QUEEN_P, QUEEN_SCALE);` and `addSprite(scene, PARASOL_TEXTURE, PARASOL_S, PARASOL_P, QUEEN_SCALE);`. Now do Task 5's Step 6.

- [ ] **Step 3: Export the course's target art** from `src/gfx/course.ts`: `COURSE_SPARK_TEXTURE`, `COURSE_TARGET_TEXTURE`, `COURSE_GLOW_TEXTURE`, `TARGET_PX` become `export const`.

- [ ] **Step 4: `src/gfx/dollQueen.ts`.**

```ts
import type Phaser from 'phaser';
import { currentSpot, QUEEN_H, QUEEN_SIT_H, type DollQueenState, type QueenFx } from '../game/bosses/dollQueen';
import type { World } from '../game/types';
import { COURSE_GLOW_TEXTURE, COURSE_SPARK_TEXTURE, COURSE_TARGET_TEXTURE, TARGET_PX } from './course';
import { HUD_HEART_TEXTURE, PARASOL_TEXTURE, QUEEN_TEXTURE, STAR_TEXTURE, spriteScale } from './textures';

/** With the original boss (SliceScene's DEPTH_BOSS), and her effects over everything in the world. */
const DEPTH = 17;
const DEPTH_FX = 22.5;
const CONFETTI = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];

/**
 * How the Doll Queen looks (her rules are game/bosses/dollQueen.ts): her sprite, standing, or
 * sitting dizzy with stars going round her head; her parasol, which flies off when her target is
 * shot and pops back when she gets up; a heart for each hit she has left; the round's target
 * with its glow, sinking when it is hit; confetti when she is hit, and a burst when she falls.
 * All of it Phaser images, tweens and one particle emitter.
 */
export class DollQueenView {
  private readonly queen: Phaser.GameObjects.Image;
  private readonly parasol: Phaser.GameObjects.Image;
  private readonly hearts: Phaser.GameObjects.Image[];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly target: Phaser.GameObjects.Image;
  private readonly stars: Phaser.GameObjects.Image[];
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The state last drawn: a respawn rebuilds the level, and with it a fresh Queen. */
  private drawn: DollQueenState | null = null;
  private phase: string | null = null;
  private targetUp = false;

  constructor(private readonly scene: Phaser.Scene) {
    const image = (key: string, depth = DEPTH): Phaser.GameObjects.Image => {
      const img = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
      return img.setScale(spriteScale(img));
    };
    this.queen = image(QUEEN_TEXTURE).setOrigin(0.5, 1);
    this.parasol = image(PARASOL_TEXTURE).setOrigin(0.5, 1);
    this.hearts = [0, 1, 2].map(() => image(HUD_HEART_TEXTURE).setScale(0.5));
    this.glow = image(COURSE_GLOW_TEXTURE);
    this.target = image(COURSE_TARGET_TEXTURE).setOrigin(0.5, 0);
    this.stars = [0, 1, 2].map(() => image(STAR_TEXTURE, DEPTH_FX));
    this.sparks = scene.add.particles(0, 0, COURSE_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1400,
      speed: { min: 80, max: 260 },
      scale: { start: 1.8, end: 0 },
      rotate: { start: 0, end: 360 },
      tint: CONFETTI,
      gravityY: 240,
    }).setDepth(DEPTH_FX);
    scene.tweens.add({
      targets: this.glow, scale: { from: 0.8, to: 1.35 }, alpha: { from: 1, to: 0.45 },
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  /** Once per rendered frame, after the steps. */
  update(world: World): void {
    const q = world.courseBoss;
    if (!q) {
      this.hideAll();
      return;
    }
    if (q !== this.drawn) this.reset(q);
    for (const fx of q.fx.splice(0)) this.playFx(fx);
    if (q.phase !== this.phase) this.changePhase(q);
    if (q.targetUp !== this.targetUp) this.changeTarget(q);
    this.place(q, world.animFrame);
  }

  private hideAll(): void {
    for (const obj of [this.queen, this.parasol, this.glow, this.target, ...this.hearts, ...this.stars]) {
      obj.setVisible(false);
    }
  }

  private reset(q: DollQueenState): void {
    this.drawn = q;
    this.phase = null;
    this.targetUp = false;
    this.scene.tweens.killTweensOf([this.queen, this.parasol, this.target]);
    this.queen.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
    this.parasol.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
    this.target.setVisible(false);
    this.glow.setVisible(false);
  }

  private playFx(fx: QueenFx): void {
    if (fx.kind === 'hit') this.sparks.explode(30, fx.x, fx.y);
    else if (fx.kind === 'clang') this.sparks.explode(6, fx.x, fx.y);
    else if (fx.kind === 'target') this.sparks.explode(16, fx.x, fx.y);
  }

  private changePhase(q: DollQueenState): void {
    const was = this.phase;
    this.phase = q.phase;
    const tweens = this.scene.tweens;
    if (q.phase === 'dizzy') {
      // The parasol flies off, spinning, and is gone until she gets up.
      tweens.killTweensOf(this.parasol);
      tweens.add({
        targets: this.parasol, y: this.parasol.y - 140, angle: 720, alpha: 0, duration: 900,
        ease: 'Quad.easeOut', onComplete: () => this.parasol.setVisible(false),
      });
    } else if (q.phase === 'shielded' && (was === 'dizzy' || was === 'hurt')) {
      tweens.killTweensOf(this.parasol);
      this.parasol.setVisible(true).setAlpha(1).setAngle(0).setScale(0);
      tweens.add({ targets: this.parasol, scale: 1, duration: 400, ease: 'Back.easeOut' });
    } else if (q.phase === 'hurt') {
      tweens.add({ targets: this.queen, alpha: { from: 0.3, to: 1 }, duration: 100, repeat: 4 });
    } else if (q.phase === 'defeated') {
      this.sparks.explode(90, q.x + q.w / 2, q.y + q.h / 2);
      this.parasol.setVisible(false);
      tweens.add({
        targets: this.queen, scale: 0, angle: 360, alpha: 0, duration: 800, ease: 'Back.easeIn',
        onComplete: () => this.queen.setVisible(false),
      });
    }
  }

  private changeTarget(q: DollQueenState): void {
    this.targetUp = q.targetUp;
    const spot = currentSpot(q);
    const x = spot.x + spot.w / 2;
    const y = spot.y + spot.h / 2 - TARGET_PX / 2;
    const tweens = this.scene.tweens;
    tweens.killTweensOf(this.target);
    if (q.targetUp) {
      this.target.setVisible(true).setPosition(x, y).setAlpha(1).setAngle(0).setScale(0);
      tweens.add({ targets: this.target, scale: 1, duration: 350, ease: 'Back.easeOut' });
      tweens.add({
        targets: this.target, angle: { from: -5, to: 5 }, duration: 700, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut', delay: 350,
      });
      this.glow.setVisible(true).setPosition(x, spot.y + spot.h / 2);
    } else {
      this.glow.setVisible(false);
      tweens.add({
        targets: this.target, y: y + 90, alpha: 0, duration: 600, ease: 'Back.easeIn',
        onComplete: () => this.target.setVisible(false),
      });
    }
  }

  /** Where everything stands this frame. */
  private place(q: DollQueenState, animFrame: number): void {
    if (q.phase === 'defeated') {
      for (const obj of [...this.hearts, ...this.stars]) obj.setVisible(false);
      return;
    }
    const cx = q.x + q.w / 2;
    const sitting = q.phase === 'dizzy';
    this.queen.setPosition(cx, q.floorY).setFlipX(q.facing > 0).setScale(1, sitting ? QUEEN_SIT_H / QUEEN_H : 1);
    const head = q.floorY - (sitting ? QUEEN_SIT_H : QUEEN_H);
    if (q.phase === 'asleep' || q.phase === 'shielded') {
      this.parasol.setPosition(cx + Math.sin(animFrame * 0.05) * 2, head + 8);
    }
    const heartsY = head - (sitting ? 14 : 38);
    this.hearts.forEach((h, i) => {
      h.setVisible(i < q.hp).setPosition(cx + (i - 1) * 12, heartsY);
    });
    this.stars.forEach((s, i) => {
      const a = animFrame * 0.12 + (i * Math.PI * 2) / 3;
      s.setVisible(sitting).setPosition(cx + Math.cos(a) * 20, head - 4 + Math.sin(a) * 5);
    });
  }
}
```

- [ ] **Step 5: In `SliceScene`:** a field `private queenView!: DollQueenView;`, created in `create()` after the boss objects: `this.queenView = new DollQueenView(this);`; `syncSprites` calls `this.queenView.update(this.world);` after `this.syncBoss();`. In `syncEnemyProjectiles`, the pooled image's texture follows the shot: after `const image = this.pooledImage(...)` add `image.setTexture(shot.type === 'heart' ? HUD_HEART_TEXTURE : FIREBALL_TEXTURE).setScale(spriteScale(image) * (shot.type === 'heart' ? 0.6 : 1));` and draw the trail only `if (shot.type !== 'heart')`.

- [ ] **Step 6: Indoors.** `src/gfx/parallax.ts`:

```ts
/**
 * An indoor level's back wall (Level.indoors), in place of the sky and hills: the level's
 * colour as wallpaper, lighter stripes, and a small flower on each, drawn once.
 */
export function drawWallpaper(graphics: Phaser.GameObjects.Graphics, color: string): void {
  const base = Phaser.Display.Color.HexStringToColor(color);
  const stripe = base.clone().lighten(8).color;
  const flower = base.clone().lighten(22).color;
  graphics.clear();
  graphics.fillStyle(base.color).fillRect(0, 0, BASE_W, BASE_H);
  for (let x = 0; x < BASE_W; x += 40) {
    graphics.fillStyle(stripe).fillRect(x, 0, 16, BASE_H);
    for (let y = 24; y < BASE_H; y += 48) graphics.fillStyle(flower).fillCircle(x + 8, y, 3);
  }
}
```

`SliceScene.createParallax`, at its top:

```ts
    if (this.world.level.indoors) {
      const wall = this.add.graphics();
      this.setupFixedLayer(wall);
      drawWallpaper(wall, this.world.level.bg);
      return;
    }
```

- [ ] **Step 7:** `npx vitest run && npm run build` — all pass.

---

### Task 7: The T-Rex looks like a T-Rex

**Files:** `src/data/sprites.ts`, `tests/sprites.test.ts`.

- [ ] **Step 1: The test first.** In `tests/sprites.test.ts`, the identity loop skips the redrawn boss:

```ts
/** Redrawn for the port at the owner's request (2026-11-22): it did not read as a dinosaur. */
const REDRAWN = new Set(['BOSS_IDLE', 'BOSS_WALK', 'BOSS_CHARGE', 'BOSS_ROAR', 'BOSS_P']);
```

`for (const name of NAMES) {` becomes `for (const name of NAMES.filter((n) => !REDRAWN.has(n))) {`, and add inside that describe:

```ts
  it('redraws the T-Rex at the same size, so its fight is unchanged', () => {
    for (const name of ['BOSS_IDLE', 'BOSS_WALK', 'BOSS_CHARGE', 'BOSS_ROAR']) {
      const mine = (ported as unknown as Record<string, number[][]>)[name];
      const theirs = legacy[name] as number[][];
      expect([mine.length, mine[0].length]).toEqual([theirs.length, theirs[0].length]);
      expect(mine).not.toEqual(theirs);
    }
  });
```

- [ ] **Step 2:** `npx vitest run tests/sprites.test.ts` — FAIL (`not.toEqual`).

- [ ] **Step 3: The new T-Rex.** In `src/data/sprites.ts` replace `BOSS_IDLE`, `BOSS_WALK`, `BOSS_CHARGE`, `BOSS_ROAR` and `BOSS_P` with:

```ts
/**
 * The T-Rex, the final boss, redrawn for the port (2026-11-22) at the owner's request: the
 * original's front-facing eyes on a thin upright body read as an owl more than a dinosaur.
 * In profile, facing left (the scene flips it): a long head with a row of teeth, a tiny arm,
 * thick legs, a long tail. Same 18x20 grid as before, so its fight is unchanged. The roar
 * opens the jaw wide.
 */
export const BOSS_IDLE=[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,5,6,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[6,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[7,0,7,0,7,0,7,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[0,2,2,2,2,2,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,2,2,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,2,2,1,1,1,1,1,1,1,1,1,1,4,4],[0,0,0,8,0,2,2,1,1,1,1,1,1,1,4,4,4,4],[0,0,0,0,2,2,2,1,1,1,1,1,1,4,4,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,1,1,0,0,1,1,1,0,0,0,0],[0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,8,8,8,0,0,8,8,8,0,0,0,0]];
export const BOSS_WALK=[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,5,6,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[6,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[7,0,7,0,7,0,7,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[0,2,2,2,2,2,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,2,2,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,2,2,1,1,1,1,1,1,1,1,1,1,4,4],[0,0,0,8,0,2,2,1,1,1,1,1,1,1,4,4,4,4],[0,0,0,0,2,2,2,1,1,1,1,1,1,4,4,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0,0,0,0,0,1,1,0,0],[0,0,0,0,8,8,8,0,0,0,0,0,0,8,8,8,0,0]];
export const BOSS_CHARGE=[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,5,6,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[6,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[7,0,7,0,7,0,7,1,1,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[0,2,2,2,2,2,0,1,1,1,1,1,0,0,0,0,0,0],[0,0,0,0,0,0,2,2,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,2,2,1,1,1,1,1,1,1,1,1,1,4,4],[0,0,0,8,0,2,2,1,1,1,1,1,1,1,4,4,4,4],[0,0,0,0,2,2,2,1,1,1,1,1,1,4,4,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0],[0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0],[0,0,0,8,8,8,0,0,0,0,0,0,0,0,8,8,8,0]];
export const BOSS_ROAR=[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,4,4,4,4,4,4,0,0,0,0,0,0,0,0,0],[0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,5,6,1,1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[6,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0],[3,3,3,3,3,3,3,0,1,1,1,0,0,0,0,0,0,0],[7,0,7,0,7,0,3,0,1,1,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,3,0,1,1,1,1,0,0,0,0,0,0],[7,0,7,0,7,0,3,0,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,2,2,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,1,0,0,0,0],[0,0,0,0,2,2,1,1,1,1,1,1,1,1,1,1,4,4],[0,0,0,8,0,2,2,1,1,1,1,1,1,1,4,4,4,4],[0,0,0,0,2,2,2,1,1,1,1,1,1,4,4,0,0,0],[0,0,0,0,0,2,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,2,1,1,1,1,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,1,1,0,0,1,1,1,0,0,0,0],[0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,8,8,8,0,0,8,8,8,0,0,0,0]];
export const BOSS_P={1:'#3f9b46',2:'#c9e59a',3:'#cc2233',4:'#24672c',5:'#ffd23f',6:'#111111',7:'#ffffff',8:'#f2e6c4'};
```

- [ ] **Step 4:** `npx vitest run && npx tsc --noEmit -p .` — all pass. Check the four poses by eye in the browser in Task 9.

---

### Task 8: The three levels

**Files:** create `src/data/levels2/nukuaed.ts`, `src/data/levels2/nukumaja.ts`, `tests/dollGarden.test.ts`; modify `src/data/levels2/dollGarden2.ts`, `src/data/stages.ts`, `tests/helpers/courseRuns.ts`, `tests/levels2.test.ts`.

- [ ] **Step 1: Share the test helpers.** Move `runRight`, `climbs`, `reachesTower`, `arrowRange` and `hits` from `tests/levels2.test.ts` into `tests/helpers/courseRuns.ts` as exports (with `HEROES`), and import them back in `tests/levels2.test.ts`. `hits` takes a box now: `export function hits(box: { y: number; h: number }, y: number): boolean { return y < box.y + box.h && y + 4 > box.y; }`, and its calls in `tests/levels2.test.ts` pass `t.box`. In `tests/levels2.test.ts` Dinosaur Canyon II's `STAGES[3]` becomes `STAGES[4]`.

- [ ] **Step 2: The failing tests.** `tests/dollGarden.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  arrowRange, climbs, HEROES, hits, quietWorld, reachesTower, runRight, standAt, step,
} from './helpers/courseRuns';
import { DIFF_KEYS } from '../src/config/difficulty';
import { TILE_EMPTY, TILE_GATE, TILE_RAINBOW } from '../src/data/levels';
import { DOLL_GARDEN_2 } from '../src/data/levels2/dollGarden2';
import { NUKUAED } from '../src/data/levels2/nukuaed';
import { NUKUMAJA } from '../src/data/levels2/nukumaja';
import { STAGES } from '../src/data/stages';
import type { Rect, World } from '../src/game/types';

function shoot(world: World, box: Rect): void {
  world.arrows.push({ x: box.x - 8, y: box.y + box.h / 2 - 2, vx: 6, life: 60, isChicken: false });
}

describe('Doll Garden, the theme', () => {
  it('is the run\'s first three levels: two chases, then the Queen', () => {
    expect(STAGES.slice(0, 3).map((s) => [s.theme, s.level, s.nameKey])).toEqual([
      [0, NUKUAED, 'level_1'], [0, DOLL_GARDEN_2, 'level_1_2'], [0, NUKUMAJA, 'level_1_3'],
    ]);
    expect([NUKUAED.ending, DOLL_GARDEN_2.ending, NUKUMAJA.ending]).toEqual(['chase', 'chase', 'boss']);
  });
});

describe('Nukuaed', () => {
  const level = NUKUAED;

  it('hands over the bow, then shows the first zombies', () => {
    const bow = level.course!.stations.find((s) => s.kind === 'bow')!;
    const zombies = level.enemyDefs.filter((d) => d.zombie);
    expect(zombies).toHaveLength(2);
    for (const z of zombies) expect(z.x).toBeGreaterThan(bow.x);
  });

  it('has a rainbow block, and the cat after the zombies', () => {
    expect(level.generate({} as never).flat()).toContain(TILE_RAINBOW);
    const lastZombie = Math.max(...level.enemyDefs.filter((d) => d.zombie).map((d) => d.x));
    expect(level.catPosition).toBeGreaterThan(lastZombie);
  });

  it('runs through to the chase with plain jumping, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = quietWorld(level, key);
      runRight(world, level.width, 1500);
      expect({ key, won: world.won }).toEqual({ key, won: true });
    }
  });
});

describe('Aiavärav', () => {
  it('ends in a chase once the hero is up on the tower', () => {
    const world = quietWorld(DOLL_GARDEN_2);
    standAt(world, DOLL_GARDEN_2.rescuePos[0] - 3, 16);
    step(world);
    expect(world.won).toBe(true);
  });

  it('is reached by the spring, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      expect({ key, spring: reachesTower(DOLL_GARDEN_2, key, true) }).toEqual({ key, spring: true });
    }
  });
});

describe('Nukumaja', () => {
  const level = NUKUMAJA;
  const [hall, pair, stairs, helper] = level.course!.targets;

  it('is indoors, and ends with the Doll Queen and her three target spots', () => {
    expect(level.indoors).toBe(true);
    expect(level.course!.boss?.kind).toBe('dollQueen');
    expect(level.course!.boss!.spots).toHaveLength(3);
  });

  it('stands its first target behind a row of zombies', () => {
    expect(level.enemyDefs.filter((d) => d.zombie && d.x < hall.x).length).toBeGreaterThanOrEqual(3);
    expect(hall.cells.every((c) => c.to === TILE_EMPTY)).toBe(true);
  });

  it('needs a low and a high target both hit to open its second gate', () => {
    expect(helper.partOf).toBe(1);
    const world = quietWorld(level);
    const big = world.course!.targets[1];
    const small = world.course!.targets[3];
    const bar = big.cells[0];
    shoot(world, big.box);
    step(world, {}, 60);
    expect(world.map[bar.y][bar.x]).toBe(TILE_GATE);
    shoot(world, small.box);
    step(world, {}, 80);
    expect(world.map[bar.y][bar.x]).toBe(TILE_EMPTY);
  });

  it('hangs the pair\'s high target out of a standing shot, in reach of a jumping one', () => {
    const box = quietWorld(level).course!.targets[3].box;
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(box, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < box.y + box.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });

  it('lines its third target up only from the top of the stairs', () => {
    const box = quietWorld(level).course!.targets[2].box;
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const floor = arrowRange(key, hero, 23);
        expect({ key, hero, fromFloor: floor.highest < box.y + box.h }).toEqual({ key, hero, fromFloor: false });
        const top = arrowRange(key, hero, 14);
        expect({ key, hero, fromTop: hits(box, top.standing) }).toEqual({ key, hero, fromTop: true });
      }
    }
  });

  it('has stairs a plain jump climbs, on every difficulty', () => {
    const bow = level.course!.stations.find((s) => s.x > pair.x && s.x < stairs.x)!;
    for (const key of DIFF_KEYS) {
      expect({ key, up: climbs(level, key, bow.x + 1, 23, 14, false) }).toEqual({ key, up: true });
    }
  });

  it('shuts the throne room door behind the hero', () => {
    const world = quietWorld(level);
    const [door] = world.course!.doors;
    standAt(world, door.x + 3, 23);
    step(world);
    expect(world.map[door.cells[0].y][door.x]).toBe(TILE_GATE);
  });

  it('hangs the Queen\'s second target out of a standing shot, in reach of a jumping one', () => {
    const spot = quietWorld(level).courseBoss!.spots[1];
    for (const key of DIFF_KEYS) {
      for (const hero of HEROES) {
        const { standing, highest } = arrowRange(key, hero, 23);
        expect({ key, hero, standing: hits(spot, standing) }).toEqual({ key, hero, standing: false });
        expect({ key, hero, jumping: highest < spot.y + spot.h }).toEqual({ key, hero, jumping: true });
      }
    }
  });
});
```

- [ ] **Step 3:** `npx vitest run tests/dollGarden.test.ts` — FAIL: no such modules.

- [ ] **Step 4: Nukuaed.** `src/data/levels2/nukuaed.ts`:

```ts
import { courseLevel } from '../course';

/**
 * Doll Garden, level 1: the original level, rebuilt by hand as the theme's start. Steps and
 * little pits, a rainbow block, the cat; halfway, the bow, and right after it the first two
 * zombies, out in the open where shooting them is the obvious thing. At the end the Doll
 * Queen runs off with the sibling.
 */
export const NUKUAED = courseLevel({
  name: 'Doll Garden',
  theme: 0,
  // Earth-brown ground, not the hills' green, so every step and wall stands out against them.
  look: { groundColor: '#9a6a3c', groundTop: '#3fa53a' },
  ending: 'chase',
  villain: 'dollQueen',
  sections: [
    // the garden: steps, a little pit, a rainbow block
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
      '..................................a.....',
      '........................................',
      '........................................',
      '........?.?...................!.........',
      '..P.....................................',
      '..................##....................',
      '............d.#...##..................F.',
      '#######################..###############',
      '#######################..###############',
    ],
    // platforms, and a pit with a stepping stone
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
      '.............?..........................',
      '........................................',
      '........................................',
      '........................................',
      '...........BBBBB........................',
      '........................................',
      '........................................',
      '....BBBBB.........BBBB..................',
      '.........................BB.............',
      '........................................',
      '..........x.....................n.....F.',
      '########################....############',
      '########################....############',
    ],
    // the bow, and the first zombies: shoot them
    [
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '...b.........D....D......u........F.',
      '####################################',
      '####################################',
    ],
    // the cat, and the Doll Queen running off with the sibling
    [
      '..................................',
      '..................................',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '.................................B',
      '...............?.................B',
      '.................................B',
      '.................................B',
      '........................a........B',
      '..............BBBB...............B',
      '.................................B',
      '.................................B',
      '........BBBB.....................B',
      '.................................B',
      '.................................B',
      '...@................d........R...B',
      '##################################',
      '##################################',
    ],
  ],
});
```

- [ ] **Step 5: Aiavärav.** In `src/data/levels2/dollGarden2.ts`, the record's `name` becomes `'Garden Gate'`, and it gains `ending: 'chase', villain: 'dollQueen',`. Its comment's first line becomes "Doll Garden, level 2 (Aiavärav, the Garden Gate): the bow, and everything it can do besides kill".

- [ ] **Step 6: Nukumaja.** `src/data/levels2/nukumaja.ts`:

```ts
import { courseLevel } from '../course';

/**
 * Doll Garden, level 3: inside the Doll House. A target behind a row of zombies; a gate that
 * needs two targets, one high; a target only lined up from the top of the stairs. Then the
 * throne room: the door shuts behind you, and the Doll Queen (game/bosses/dollQueen.ts).
 */
export const NUKUMAJA = courseLevel({
  name: 'Doll House',
  theme: 0,
  indoors: true,
  look: { bg: '#6b4a7a', groundColor: '#8a5a3a', groundTop: '#b07a4a', brickColor: '#a86a7a' },
  ending: 'boss',
  sections: [
    // the zombie hall: the target is behind them
    [
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      '....................................',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '................................BB..',
      '................................BB..',
      '................................BB..',
      '................................BB..',
      '................................BB..',
      '................................BB..',
      '................................BB..',
      '................................||..',
      '................................||..',
      '................................||..',
      '..P.............................||..',
      '................................||..',
      '....b.........D...D...D....T....||.F',
      '####################################',
      '####################################',
    ],
    // two targets for one gate: one low, one high
    [
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '............................BB....',
      '............................BB....',
      '............................BB....',
      '............................BB....',
      '............................BB....',
      '............................BB....',
      '............................||....',
      '............................||....',
      '............................||....',
      '....................t.......||....',
      '............................||....',
      '............................||....',
      '..b.........T...........D...||...F',
      '##################################',
      '##################################',
    ],
    // a target only lined up from the top of the stairs
    [
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      '..................................',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '..............................BB..',
      '..............................BB..',
      '..............................BB..',
      '......................T.......BB..',
      '..........BBBBBBB.............BB..',
      '..........BBBBBBB.............BB..',
      '..........BBBBBBB.............BB..',
      '........BBBBBBBBB.............||..',
      '........BBBBBBBBB.............||..',
      '........BBBBBBBBB.............||..',
      '......BBBBBBBBBBB.............||..',
      '......BBBBBBBBBBB.............||..',
      '..b...BBBBBBBBBBB.............||..',
      '##################################',
      '##################################',
    ],
    // the throne room: the Doll Queen
    [
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      '...B...................................B',
      '...B...................................B',
      '...B...................................B',
      '...B...................................B',
      '...B...................................B',
      '...B...................................B',
      '...B...................................B',
      '...:...................................B',
      '...:...................................B',
      '...:.3...............2.................B',
      '...:...................................B',
      '...:...................................B',
      '.F.:...b.....1............Q.........R..B',
      '########################################',
      '########################################',
    ],
  ],
});
```

- [ ] **Step 7: Theme 0's list,** in `src/data/stages.ts` (import `NUKUAED`, `NUKUMAJA`):

```ts
  0: [
    { level: NUKUAED, nameKey: LEVEL_NAME_KEYS[0] },
    { level: DOLL_GARDEN_2, nameKey: 'level_1_2' },
    { level: NUKUMAJA, nameKey: 'level_1_3' },
  ],
```

- [ ] **Step 8:** `npx vitest run && npm run build` — all pass.

---

### Task 9: Play it, with real physics

- [ ] **Step 1:** `npm run dev -- --port 5175 --strictPort`; in an automated tab, drive the game per the memory note "Hidden-tab browser checks".
- [ ] **Step 2:** `?level=1` (Nukuaed), Super Easy: run to the end; shoot the two zombies; the chase ends the level; the overlay says "JÄLITA NEID!"; the cutscene shows the Queen running with the sibling. Screenshot the end and the cutscene.
- [ ] **Step 3:** `?level=2` (Aiavärav): its zombies look like zombies and groan; the chase at the tower top.
- [ ] **Step 4:** `?level=3` (Nukumaja), Super Easy and Hard: the zombie hall, the two-target gate, the stairs target; then the throne room: the door shuts, the Queen wakes, three rounds (low, jump-and-shoot, across the room), her hearts, her zombies, the burst, the cage, the rescue, and the next cutscene (Dinosaur Canyon's kidnapper). Screenshot the fight.
- [ ] **Step 5:** The classic Toy Castle (`?level=` its stage) to see the T-Rex's new poses on screen.
- [ ] **Step 6:** Fix what the browser finds, re-running the tests. Then `next/PLAYTEST.md` gains a "Doll Garden, the whole theme" section: what to watch (stuck more than a minute; more than three or four deaths in a section; whether the Queen's parasol-and-target idea is found without help; whether the zombies are fun or scary).
- [ ] **Step 7:** `npx vitest run && npm run build`.

---

## Self-review against the spec

- Story (chase in 1-2, boss in 3): Tasks 5 (chase), 4 (cage until beaten), 8 (endings on the levels).
- Zombies, the guard rule with a look, a shuffle and a groan: Task 1.
- Boss framework and the Doll Queen (parasol, target, dizzy, 3 hits, harder rounds, hearts, zombies, burst, cage, door): Tasks 3 (door, spots), 4 (rules), 6 (view).
- Multi-target gates: Task 3.
- The three Doll Garden levels in place of the old two: Task 8.
- The T-Rex's new look on today's fight: Task 7.
- Themes: the stage list per theme (Task 2); the theme's look via `courseLevel`'s `theme`, plus `indoors` (Tasks 3, 6).
- Testing on all four difficulties and both heroes, then the browser, then the child: Tasks 4, 8, 9.

## What the browser found (Task 9, as built)

Each was invisible to the unit tests' simple mover and fixed, with a test added where one
could pin it:

- **The chase:** the Queen ran right at 3px a frame, through the end wall and out of view
  before anyone could see her go. She hops in place, then leaps up and away.
- **High targets on super easy:** the top of the jump carried an arrow over a 36px box.
  **And on hard:** the low jump reached a 52px box only in its last few frames. Target boxes
  are 68px tall and the high targets hang a row lower (row 19); a test checks a shot from
  anywhere in the top third of a jump, on every difficulty, for both heroes.
- **The Queen's third target** stood inside her walk, so she was always in the way, and on
  hard she cannot be jumped: the fight could not be won. It hangs by the door, outside her
  walk. **Then** an arrow at it touched the shut door in the next column and died: the door
  moved a column left and her walk starts four columns in, leaving a safe tile to shoot from.
- **The sibling indoors** was placed on the roof: the original levels' search from the top
  found the ceiling. Hand-built levels stand the sibling on the floor under their R.
- **Her hearts-left icons** borrowed the HUD's heart texture before the HUD had made it, and
  drew Phaser's missing-texture box. She has her own heart texture.
- **Round 3 on hard** had up to four zombies and fast hearts at once: she keeps at most two of
  each.
- **The T-Rex** in the original Toy Castle still stands half over the top of the screen; its
  arena is part of Toy Castle's batch.

