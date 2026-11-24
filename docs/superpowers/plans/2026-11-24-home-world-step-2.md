# Home World, Step 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PÄEV, the home world's second level: the plunger that jumps in place, the toilet brush that spins, soap bubbles you ride, the washing machine only a fart jump clears, and the shower curtain that a target on a high shelf opens.

**Architecture:** Riding platforms live in the pure simulation (`game/course.ts`), stepped after the hero has moved: a bubble lands a hero coming down onto it and carries a rider, writing `p.y`/`p.onGround` the way the poo fight's fling writes the hero's place (both movers place the body from `p.x`/`p.y` every step, `physics/player.ts`). The plunger is an enemy type with its own branch in `stepEnemy`; the toilet brush and the soap dish are course parts like the vent. `Level.potty` becomes `Level.home`: potties for flags and a shower curtain for a gate's bars.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4. Commands run in `next/` of `.claude/worktrees/home-world`.

**Spec:** `docs/superpowers/specs/2026-11-24-home-world-design.md` (step 2). **Rules:** no commits unless asked; child-facing words in capitals; Phaser built-ins first; `src/game` free of Phaser.

---

## File structure

| File | What changes |
|---|---|
| `src/data/levels.ts` | `potty` → `home`; `CourseDef.soaps`, `CourseDef.brushes`; furniture kinds `boots`, `basket`, `washer`, `shelf`, `towel`, `bathtub` |
| `src/data/course.ts` | letters `j` plunger, `O` soap dish, `X` toilet brush; `home` |
| `src/data/levels2/paev.ts` | new: PÄEV |
| `src/data/levels2/hommik.ts` | `potty: true` → `home: true` |
| `src/data/stages.ts`, `src/config/i18n.ts` | PÄEV in the run; `level_7_2` |
| `src/data/sprites.ts`, `src/game/run.ts`, `src/gfx/textures.ts` | the plunger |
| `src/game/enemy.ts`, `src/game/types.ts` | the plunger's rules; `EnemyState.airborne`; cues `plop`, `pop` |
| `src/game/course.ts` | soap dishes, bubbles and riding; toilet brushes |
| `src/audio/sfx.ts`, `src/audio/cues.ts` | `sfxPlop`, `sfxPop` |
| `src/gfx/course.ts` | the curtain tileset; soap dishes, bubbles, brushes; pop splash |
| `src/gfx/furniture.ts` | the new kinds |
| `src/scenes/SliceScene.ts` | the plunger's squat and stretch |
| `tests/helpers/reach.ts` | a soap dish lifts: jumps from any height its bubbles reach |
| `tests/home.test.ts`, `tests/course.test.ts` | the plunger, the brush, bubbles, PÄEV |

---

### Task 1: `home` for `potty`, and the new letters

- [ ] **Step 1: Tests.** In `tests/course.test.ts`'s home describe, rename `potty: true` to `home: true` and `level.potty` to `level.home` (and the `Plain` one), and add:

```ts
  it('reads a plunger (j), a soap dish (O) standing on the floor, and a toilet brush (X)', () => {
    const parsed = parseCourse(joinSections([sectionOf(12, {
      19: '.......X....',
      20: '..P.........',
      22: '...j.O....R.',
    })]));
    expect(parsed.enemyDefs).toEqual([{ type: 'plunger', x: 3, floorRow: 23 }]);
    expect(parsed.course.soaps).toEqual([{ x: 5, y: 23 }]);
    expect(parsed.course.brushes).toEqual([{ x: 7, y: 19 }]);
  });
```

In `tests/home.test.ts` rename `HOMMIK.potty` to `HOMMIK.home`.

- [ ] **Step 2: Run, see them fail.** `./node_modules/.bin/vitest run tests/course.test.ts tests/home.test.ts`

- [ ] **Step 3: Code.**
  - `levels.ts`: `potty?: boolean` becomes `home?: boolean` with the doc "The home world's look: potties for flags, a shower curtain for a gate's bars." `CourseDef` gains `soaps?: Array<{ x: number; y: number }>` ("soap dishes (`O`), each standing on floor row `y`: they let go of bubbles to ride") and `brushes?: Array<{ x: number; y: number }>` ("toilet brushes (`X`), each spinning round the middle of its cell"). `FurnitureKind` gains `'boots' | 'basket' | 'washer' | 'shelf' | 'towel' | 'bathtub'`.
  - `course.ts`: `ENEMY_LETTERS` gains `j: 'plunger'`; parse `O` into `soaps` (`{ x, y: floorBelow(map, x, y) }`) and `X` into `brushes`; return them like `taps`, only when there are some; the letter table gains `j  plunger: stays where it is and jumps straight up`, `O  soap dish: lets go of a bubble to ride now and then`, `X  toilet brush: spins round the middle of its cell; nothing stops it`. `CourseLevelSpec.potty` → `home`, built as `...(spec.home ? { home: true } : {})`.
  - `hommik.ts`: `potty: true` → `home: true`; `gfx/course.ts`: `world.level.potty` → `world.level.home`.

- [ ] **Step 4: Run.** The two files pass; `./node_modules/.bin/tsc --noEmit` is clean.

### Task 2: The plunger

- [ ] **Step 1: Tests** (append to `tests/home.test.ts`):

```ts
describe('the plunger', () => {
  /** A floor 40 wide, a plunger at column 20. */
  const PLUNGER_LEVEL = courseLevel({
    name: 'Plunger', theme: 0,
    sections: [sectionOf(40, { 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(20)}j${'.'.repeat(17)}R.` })],
  });
  const withPlunger = (key: (typeof DIFF_KEYS)[number]) => {
    const world = quietWorld(PLUNGER_LEVEL, key);
    for (const d of world.pending) d.spawned = false;
    world.player.hasCape = false;
    standAt(world, 2, 23);
    step(world);
    const e = world.enemies.find((x) => x.type === 'plunger')!;
    return { world, e };
  };

  it('stays where it stands and jumps straight up, again and again, squatting first, landing with a plop', () => {
    const { world, e } = withPlunger('normal');
    const x = e.x;
    let jumps = 0;
    let squatted = false;
    let plops = 0;
    for (let i = 0; i < 400; i++) {
      const wasDown = !e.airborne;
      if (plungerSquatting(e, world.dc)) squatted = true;
      step(world);
      if (wasDown && e.airborne) jumps++;
      plops += world.sounds.filter((s) => s === 'plop').length;
      expect(e.x).toBe(x);
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
    expect(squatted).toBe(true);
    expect(plops).toBeGreaterThanOrEqual(2);
  });

  it('jumps less often on Super Easy than on Hard', () => {
    expect(plungerRest(DIFFICULTY_CONFIG.super_easy)).toBeGreaterThan(plungerRest(DIFFICULTY_CONFIG.hard));
  });

  it('is stomped while it is down, and hurts while it is up or by touch', () => {
    // Down: a hero coming down on it squashes it.
    let { world, e } = withPlunger('normal');
    world.player.x = e.x;
    world.player.y = e.y - world.player.h + 2;
    world.player.vy = 3;
    step(world);
    expect(e.alive).toBe(false);
    // Up: the same comes to harm.
    ({ world, e } = withPlunger('normal'));
    for (let i = 0; i < 400 && !e.airborne; i++) step(world);
    step(world, {}, 6);
    world.player.x = e.x;
    world.player.y = e.y - world.player.h + 2;
    world.player.vy = 3;
    step(world);
    expect(world.dead).toBe(true);
    // At its side, on the ground: harm.
    ({ world, e } = withPlunger('normal'));
    standAt(world, 19, 23);
    world.player.x = e.x - world.player.w + 3;
    step(world);
    expect(world.dead).toBe(true);
  });

  it('lets a hero run under it while it is up, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const { world, e } = withPlunger(key);
      standAt(world, 18, 23);
      world.player.x = e.x - world.player.w - TILE;
      for (let i = 0; i < 400 && !e.airborne; i++) step(world);
      for (let i = 0; i < 60 && world.player.x < e.x + e.w + 4; i++) step(world, { right: true });
      expect({ key, dead: world.dead, past: world.player.x >= e.x + e.w + 4 }).toEqual({ key, dead: false, past: true });
    }
  });
});
```

(imports: `PLUNGER_LEVEL` uses `courseLevel`, `sectionOf`, already in the file; add `plungerRest, plungerSquatting` from `../src/game/enemy`.)

- [ ] **Step 2: Fail.** `./node_modules/.bin/vitest run tests/home.test.ts`

- [ ] **Step 3: Code.**
  - `sprites.ts`: `PLUNGER_S=[[0,0,0,3,3,0,0,0],[0,0,0,2,2,0,0,0],[0,0,0,2,2,0,0,0],[0,0,0,2,2,0,0,0],[0,0,0,2,2,0,0,0],[0,1,1,1,1,1,1,0],[1,1,4,1,1,4,1,1],[1,1,1,1,1,1,1,1],[1,5,5,5,5,5,5,1]]`, `PLUNGER_P={1:'#e03a3a',2:'#c8935a',3:'#8a5a3a',4:'#222222',5:'#a02020'}`; in `ENEMY_SPRITES`, `getEnemySpriteInfo` and `ENEMY_TYPES` as the sock was.
  - `types.ts`: `EnemyState.airborne?: boolean` ("A plunger in the air (game/enemy.ts): it can be stomped only while it is down."); `SoundCue` gains `'plop'` and `'pop'`.
  - `enemy.ts`:

```ts
/** The plunger (the home world): it stays where it stands and jumps straight up, again and again. */
export const PLUNGER_JUMP = 7;
/** Frames it squats before each jump, which the scene shows. */
export const PLUNGER_SQUAT = 18;

/** Frames a plunger rests between jumps: longer on Super Easy. */
export function plungerRest(dc: { enemyShootInterval: number }): number {
  return Math.round(dc.enemyShootInterval * 0.4) + 30;
}

/** Whether a plunger on the ground is about to jump. */
export function plungerSquatting(e: EnemyState, dc: { enemyShootInterval: number }): boolean {
  return !e.airborne && e.bounceTimer > plungerRest(dc) - PLUNGER_SQUAT;
}
```

    `isGroundPatrol` excludes `'plunger'` (it falls and lands by the hand-written floor snap, as the cannon does); `spawnEnemy` gains `} else if (def.type === 'plunger') { e.vx = 0; e.bounceTimer = 0; e.airborne = false; }`; `stepEnemy` gains, before the ground patrol's `else`:

```ts
  } else if (e.type === 'plunger') {
    // Stays where it stands: rests, squats, jumps straight up, lands with a plop.
    e.vx = 0;
    if (e.vy === 0) {
      if (e.airborne) {
        e.airborne = false;
        e.bounceTimer = 0;
        world.sounds.push('plop');
      }
      if (++e.bounceTimer >= plungerRest(dc)) {
        e.vy = -PLUNGER_JUMP;
        e.airborne = true;
        e.bounceTimer = 0;
      }
    }
    // Stomped only while it is down: up in the air it is a hit.
    e.noStomp = e.airborne === true;
```

  - `sfx.ts`: `sfxPlop` (`playTone(180, 0.12, 'sine', 0.12, 90)`) and `sfxPop` (`playTone(900, 0.04, 'triangle', 0.08, 1400)`); `cues.ts` plays them for `plop` and `pop`.
  - `SliceScene.syncEnemyImage`, after `image.setScale(scale);` in the alive branch:

```ts
    // A plunger squats before it jumps and stretches in the air (game/enemy.ts).
    if (enemy.type === 'plunger') {
      const squat = plungerSquatting(enemy, this.world.dc);
      const sx = squat ? 1.15 : enemy.airborne ? 0.9 : 1;
      const sy = squat ? 0.78 : enemy.airborne ? 1.12 : 1;
      image.setScale(scale * sx, scale * sy).setAlpha(1)
        .setPosition(enemy.x - (enemy.w * (sx - 1)) / 2, enemy.y + enemy.h * (1 - sy));
      return;
    }
```

- [ ] **Step 4: Run.** `tests/home.test.ts`, `tests/enemy.test.ts`, `tests/sounds.test.ts` pass; `tsc` clean.

### Task 3: The toilet brush

- [ ] **Step 1: Tests** (append to `tests/home.test.ts`; import `BRUSH_R, brushSpeed, brushTouches` from `../src/game/course`):

```ts
describe('the toilet brush', () => {
  /** A floor 40 wide, a brush spinning round column 20, three and a half tiles over the floor. */
  const BRUSH_LEVEL = courseLevel({
    name: 'Brush', theme: 0,
    sections: [sectionOf(40, { 19: `${'.'.repeat(20)}X${'.'.repeat(19)}`, 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(38)}R.` })],
  });

  it('turns at its difficulty\'s speed, slower on Super Easy', () => {
    expect(brushSpeed(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(brushSpeed(DIFFICULTY_CONFIG.hard));
    const world = quietWorld(BRUSH_LEVEL, 'normal');
    standAt(world, 2, 23);
    const b = world.course!.brushes[0];
    const a0 = b.angle;
    step(world, {}, 10);
    expect(b.angle - a0).toBeCloseTo(10 * brushSpeed(world.dc), 5);
  });

  it('hurts along its whole length, and nowhere else', () => {
    const b = { x: 200, y: 200, angle: 0 };
    expect(brushTouches(b, { x: 200 + BRUSH_R - 4, y: 190, w: 16, h: 24 })).toBe(true);
    expect(brushTouches(b, { x: 200 - BRUSH_R - 10, y: 190, w: 16, h: 24 })).toBe(true);
    expect(brushTouches(b, { x: 200 + BRUSH_R + 6, y: 190, w: 16, h: 24 })).toBe(false);
    expect(brushTouches({ ...b, angle: Math.PI / 2 }, { x: 230, y: 190, w: 16, h: 24 })).toBe(false);
  });

  it('leaves standing room beside it, and a gap a run gets through, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      // Beside it, out of its reach, all the way round.
      const still = quietWorld(BRUSH_LEVEL, key);
      still.player.hasCape = false;
      standAt(still, 20 - 4, 23);
      step(still, {}, Math.ceil((2 * Math.PI) / brushSpeed(still.dc)));
      expect({ key, standing: !still.dead }).toEqual({ key, standing: true });
      // A run from beside it to past it: some start times get through, and not just one.
      let through = 0;
      const tries = 24;
      for (let k = 0; k < tries; k++) {
        const world = quietWorld(BRUSH_LEVEL, key);
        world.player.hasCape = false;
        standAt(world, 20 - 4, 23);
        step(world, {}, Math.round((k * Math.PI) / brushSpeed(world.dc) / tries));
        for (let i = 0; i < 120 && !world.dead && world.player.x < (20 + 4) * TILE; i++) step(world, { right: true });
        if (!world.dead) through++;
      }
      expect({ key, enough: through >= tries / 4 }).toEqual({ key, enough: true });
    }
  });
});
```

- [ ] **Step 2: Fail.**

- [ ] **Step 3: Code** in `game/course.ts`. `CourseState.brushes: Array<{ x: number; y: number; angle: number }>` (the pivot in pixels); `buildCourse`: `brushes: (def.brushes ?? []).map((b) => ({ x: b.x * TILE + TILE / 2, y: b.y * TILE + TILE / 2, angle: ((b.x * 37) % 90) / 90 * Math.PI }))`. Then:

```ts
/** A toilet brush's half length: it spins round its middle (the home world). */
export const BRUSH_R = 40;

/** Radians a brush turns a frame: slower on Super Easy. */
export function brushSpeed(dc: { enemySpeed: number }): number {
  return 0.018 + 0.012 * dc.enemySpeed;
}

/** Whether a brush at its angle touches a box anywhere along its length. */
export function brushTouches(b: { x: number; y: number; angle: number }, box: Rect): boolean {
  const dx = Math.cos(b.angle) * BRUSH_R;
  const dy = Math.sin(b.angle) * BRUSH_R;
  for (let i = -10; i <= 10; i++) {
    const px = b.x + (dx * i) / 10;
    const py = b.y + (dy * i) / 10;
    if (px > box.x - 3 && px < box.x + box.w + 3 && py > box.y - 3 && py < box.y + box.h + 3) return true;
  }
  return false;
}

/** Brushes spin; one that touches the hero is a hit. Nothing stops a brush. */
function stepBrushes(world: World, course: CourseState): void {
  const p = world.player;
  for (const b of course.brushes) {
    b.angle += brushSpeed(world.dc);
    if (world.dead || p.invincible > 0) continue;
    if (brushTouches(b, { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h })) playerHit(world);
  }
}
```

`stepCourse` calls it after `stepTaps`. Import `playerHit` from `./player`.

- [ ] **Step 4: Run.** Pass; tsc clean.

### Task 4: Soap bubbles to ride

- [ ] **Step 1: Tests** (append; import `BUBBLE_W, bubbleInterval` from `../src/game/course`):

```ts
describe('soap bubbles', () => {
  /** A soap dish on the floor at column 10, a ceiling over it at row 10, a shelf at row 15 from column 13. */
  const ceiling = `${'.'.repeat(6)}${'B'.repeat(8)}${'.'.repeat(26)}`;
  const shelf = `${'.'.repeat(13)}${'B'.repeat(6)}${'.'.repeat(21)}`;
  const BUBBLE_LEVEL = courseLevel({
    name: 'Bubbles', theme: 0,
    sections: [sectionOf(40, { 10: ceiling, 15: shelf, 20: `..P${'.'.repeat(37)}`, 22: `${'.'.repeat(10)}O${'.'.repeat(27)}R.` })],
  });
  const atTheDish = (key: (typeof DIFF_KEYS)[number] = 'normal') => {
    const world = quietWorld(BUBBLE_LEVEL, key);
    standAt(world, 10, 23);
    world.player.x = 10 * TILE;
    world.course!.soaps[0].timer = 2;
    return world;
  };

  it('come more often on Super Easy than on Hard', () => {
    expect(bubbleInterval(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(bubbleInterval(DIFFICULTY_CONFIG.hard));
  });

  it('lift a hero standing at the dish, carry them up, and pop at whatever is over them', () => {
    const world = atTheDish();
    let lowest = Infinity;
    let popped = false;
    for (let i = 0; i < 600 && !popped; i++) {
      step(world);
      lowest = Math.min(lowest, world.player.y);
      popped = world.course!.fx.some((f) => f.kind === 'pop');
    }
    expect(lowest).toBeLessThan(23 * TILE - world.player.h - 4 * TILE);
    expect(popped).toBe(true);
    // Popped under the ceiling: the hero's head had got up to it.
    expect(lowest).toBeLessThanOrEqual(11 * TILE + 2);
    step(world, {}, 80);
    expect(world.player.y + world.player.h).toBe(23 * TILE);
  });

  it('let a rider jump off onto a shelf, on every difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = atTheDish(key);
      for (let i = 0; i < 600 && world.player.y + world.player.h > 15 * TILE - 2; i++) step(world);
      for (let i = 0; i < 90; i++) step(world, { right: true, jump: i < 12, jumpPressed: i === 0 });
      const p = world.player;
      expect({ key, onShelf: p.onGround && p.y + p.h === 15 * TILE && p.x > 13 * TILE }).toEqual({ key, onShelf: true });
    }
  });

  it('are solid only from above: one rising past a hero beside it does not lift them', () => {
    const world = atTheDish();
    world.player.x = 10 * TILE + TILE / 2 + BUBBLE_W / 2 + 2;
    step(world, {}, 120);
    expect(world.player.y + world.player.h).toBe(23 * TILE);
    expect(world.course!.bubbles.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Fail.**

- [ ] **Step 3: Code** in `game/course.ts`:

```ts
/** A soap bubble (the home world): its box's left, its top (where a rider stands), where its top started, its age. */
export interface Bubble { x: number; y: number; from: number; age: number; popped: boolean }
export const BUBBLE_W = 32;
/** Pixels a bubble rises a frame. */
export const BUBBLE_RISE = 0.7;
/** The longest a bubble lasts before it pops of itself. */
export const BUBBLE_LIFE = 900;

/** Frames between a soap dish's bubbles: more often on Super Easy. */
export function bubbleInterval(dc: { enemyShootInterval: number }): number {
  return Math.round(260 - dc.enemyShootInterval / 2);
}
```

`CourseState` gains `soaps: Array<{ x: number; y: number; timer: number }>`, `bubbles: Bubble[]`, `riding: Bubble | null`, `feet: number | null` ("where the hero's feet were at the end of the last step, so a bubble knows a hero came down onto it"); `buildCourse`: `soaps: (def.soaps ?? []).map((s) => ({ ...s, timer: 30 })), bubbles: [], riding: null, feet: null`; `CourseFx.kind` gains `'pop'`.

```ts
/** Whether anything solid is in row-pixel `y` across `x0..x1`. */
function solidAcross(world: World, x0: number, x1: number, y: number): boolean {
  for (let x = x0; x <= x1; x += TILE / 2) if (isSolid(getTile(world.map, x, y))) return true;
  return isSolid(getTile(world.map, x1, y));
}

/**
 * Soap dishes near the hero let go of bubbles, which rise and pop at whatever is over them (over
 * their rider's head, when ridden). A bubble is solid only from above: a hero coming down onto
 * it lands, and a rider is carried up, until they jump off or it pops. Stepped after the hero
 * has moved, so it can put them back on top: both movers place the hero's body from `p.x`/`p.y`
 * every step.
 */
function stepBubbles(world: World, course: CourseState): void {
  const p = world.player;
  for (const s of course.soaps) {
    if (Math.abs(s.x * TILE - (p.x + p.w / 2)) > VENT_REACH) continue;
    if (--s.timer > 0) continue;
    s.timer = bubbleInterval(world.dc);
    const top = s.y * TILE;
    course.bubbles.push({ x: s.x * TILE + TILE / 2 - BUBBLE_W / 2, y: top, from: top, age: 0, popped: false });
  }
  const was = new Map(course.bubbles.map((b) => [b, b.y]));
  for (const b of course.bubbles) {
    b.y -= BUBBLE_RISE;
    b.age++;
    const head = b === course.riding ? b.y - p.h : b.y;
    if (b.age > BUBBLE_LIFE || head < TILE || solidAcross(world, b.x + 2, b.x + BUBBLE_W - 2, head)) b.popped = true;
  }
  const feet = p.y + p.h;
  const over = (b: Bubble) => p.x + p.w > b.x + 2 && p.x < b.x + BUBBLE_W - 2;
  let riding: Bubble | null = null;
  if (!world.dead && p.vy >= 0) {
    for (const b of course.bubbles) {
      if (b.popped || !over(b)) continue;
      const landed = course.feet !== null && course.feet <= (was.get(b) ?? b.y) + 1 && feet >= b.y;
      if (b === course.riding || landed) { riding = b; break; }
    }
  }
  if (riding) {
    p.y = riding.y - p.h;
    p.vy = 0;
    p.onGround = true;
  }
  course.riding = riding;
  for (const b of course.bubbles) {
    if (!b.popped) continue;
    pushFx(course, { kind: 'pop', x: b.x + BUBBLE_W / 2, y: b.y + BUBBLE_W / 2 });
    world.sounds.push('pop');
  }
  course.bubbles = course.bubbles.filter((b) => !b.popped);
  course.feet = p.y + p.h;
}
```

`stepCourse` calls `stepBubbles(world, course);` first, before `stepStations`.

- [ ] **Step 4: Run.** Pass; tsc clean.

### Task 5: The dead-end check knows a soap dish lifts

- [ ] **Step 1.** In `tests/helpers/reach.ts`'s `graphFor`, pull the jump loop out into `jumpFrom(x, y, m, push)` (the `dx`/`y2` loop as it is, pushing `id[y2 * W + x2]`), call it from the cell loop, and after the cell loop add:

```ts
    // A soap dish's bubbles lift whoever stands at it (game/course.ts): from any height they
    // rise to, with room for the hero's head, a jump as from a floor there.
    for (const d of course.soaps ?? []) {
      const from = id[d.y * W + d.x];
      if (from < 0) continue;
      for (let h = d.y - 1; h >= 2 && clear(d.x, h - 2, h - 1); h--) {
        jumpFrom(d.x, h, plain, (m) => edges[from].push(m));
      }
    }
```

Update the file's doc comment: "a soap dish's bubble lifts them up its column".

- [ ] **Step 2.** `./node_modules/.bin/vitest run tests/softlocks.test.ts` still passes.

### Task 6: PÄEV, and the pictures

- [ ] **Step 1: Tests** (append to `tests/home.test.ts`; import `PAEV` from `../src/data/levels2/paev`, `climbs` from `./helpers/courseRuns`):

```ts
describe('PÄEV, the day', () => {
  const map = PAEV.generate({} as never);
  const col = (section: number, x: number) => [0, 42, 82, 122][section] + x;

  it('comes after HOMMIK, and ends with Härra Kaka running off again', () => {
    const at = STAGES.findIndex((s) => s.level === PAEV);
    expect(STAGES[at - 1].level).toBe(HOMMIK);
    expect(STAGES[at]).toEqual({ theme: HOME_THEME, level: PAEV, nameKey: 'level_7_2' });
    expect([PAEV.ending, PAEV.villain, PAEV.home]).toEqual(['chase', 'poo', true]);
  });

  it('has plungers in the hall and toilet brushes at the end', () => {
    expect(PAEV.enemyDefs.filter((d) => d.type === 'plunger')).toHaveLength(3);
    expect(PAEV.course!.brushes).toHaveLength(2);
  });

  it('has a washing machine only a fart jump gets over, its station at its foot, on every difficulty', () => {
    const washer = col(1, 22);
    const top = map.findIndex((row) => isSolid(row[washer]));
    const fart = PAEV.course!.stations.find((s) => s.kind === 'fart')!;
    const potties = PAEV.course!.flags.filter((f) => f.x < washer);
    expect(fart.x).toBeGreaterThan(Math.max(...potties.map((f) => f.x)));
    for (const key of DIFF_KEYS) {
      expect({ key, plain: climbs(PAEV, key, washer - 3, 23, top, false) }).toEqual({ key, plain: false });
      expect({ key, fart: climbs(PAEV, key, washer - 3, 23, top, true) }).toEqual({ key, fart: true });
    }
  });

  it('puts the shelf out of a jump\'s reach, so a bubble is the way up', () => {
    expect(jumpRise('super_easy')).toBeLessThan((23 - 13) * TILE - TILE);
    expect(PAEV.course!.soaps).toHaveLength(1);
  });

  it('hangs the curtain\'s target where a shot from the shelf hits it and one from the floor does not', () => {
    const t = quietWorld(PAEV).course!.targets[0];
    const hits = (y: number) => y < t.box.y + t.box.h && y + 4 > t.box.y;
    const h = 24;
    expect(hits(arrowY(13 * TILE - h, h))).toBe(true);
    for (const key of DIFF_KEYS) expect(hits(arrowY(23 * TILE - h - jumpRise(key), h))).toBe(false);
  });
});
```

(`col` follows the section widths below: 42, 40, 40, 36.)

- [ ] **Step 2: Fail.**

- [ ] **Step 3: The level.** Create `src/data/levels2/paev.ts` with `courseLevel({ name: 'Day', theme: HOME_THEME, ending: 'chase', villain: 'poo', indoors: true, home: true, look: { bg: '#cfe8c8', groundColor: '#e9eef2', groundTop: '#ffffff', brickColor: '#8fc3d8' }, sections, furniture })`. Sections, each 25 rows, ground `#` in rows 23-24 (rows not listed are air):

  - **back in from outside**, 42 wide: row 20 `P` at 2; row 21 `B` at 10-11; row 22 `b` at 5, `B` at 9-12, `F` at 16, `j` at 21, 28, 35.
  - **the laundry**, 40 wide: rows 16-22 `B` at 22-24; row 22 `F` at 2, `s` at 8 and 12, `F` at 15, `f` at 17.
  - **washing hands**, 40 wide: rows 0-18 `B` at 31-32; rows 19-22 `|` at 31; row 13 `B` at 14-24; row 12 `T` at 27; row 22 `F` at 2, `b` at 6, `O` at 11.
  - **the toilet brushes**, 36 wide: row 19 `X` at 8 and 17; row 22 `F` at 2, `R` at 27.

  Furniture: section 0 `boots` (9,22,1,1), (10,22,2,2), (12,22,1,1), `window` (24,17,3,3), `door` (39,22,2,4); section 1 `basket` (4,22,3,2), `window` (10,17,3,3), `washer` (22,22,3,7), `towel` (30,18,2,3); section 2 `towel` (4,18,2,3), `shelf` (14,13,11,2); section 3 `window` (6,17,3,3), `bathtub` (29,22,5,2).

  Generate the rows with a script in the scratchpad (as HOMMIK's were) and paste them, each section commented as above.

- [ ] **Step 4: In the run.** `stages.ts`: `{ level: PAEV, nameKey: 'level_7_2' }` between HOMMIK and VANNITUBA. `i18n.ts`: `level_7_2: {et:'PÄEV', en:'DAY'}`; `tests/i18n.test.ts`: add `'level_7_2'` to `PORT_ONLY_KEYS`.

- [ ] **Step 5: The pictures.**
  - `gfx/furniture.ts`: the six kinds. `bathtub` uses `BATHTUB_TEXTURE` at its own size, like the toilet (`Exclude<FurnitureKind, 'toilet' | 'bathtub'>` for the drawn ones):

```ts
  // One big red rubber boot, mud on it: its leg at the left, its foot along the bottom.
  boots: (g, W, H) => {
    const leg = Math.max(8, Math.round(W * 0.55));
    g.fillStyle(0xd83a3a).fillRect(1, 0, leg, H - 2).fillRoundedRect(1, H - 10, W - 2, 8, { tl: 0, tr: 4, bl: 0, br: 2 });
    g.fillStyle(0x3a2a1a).fillRect(1, H - 3, W - 2, 3);
    g.fillStyle(0xff7a7a).fillRect(3, 2, 2, H - 8);
    g.fillStyle(0x7a5230).fillCircle(W * 0.3, H - 6, 2.5).fillCircle(W * 0.7, H - 5, 2).fillCircle(leg * 0.5, H * 0.45, 2);
  },
  // A wicker laundry basket, clothes heaped in it.
  basket: (g, W, H) => {
    g.fillStyle(0xff8fb0).fillCircle(W * 0.3, 7, 6);
    g.fillStyle(0x5ab0ff).fillCircle(W * 0.6, 6, 6);
    g.fillStyle(0xffd23f).fillCircle(W * 0.8, 8, 4);
    g.fillStyle(0xc8935a).fillRoundedRect(2, 8, W - 4, H - 8, { tl: 2, tr: 2, bl: 5, br: 5 });
    g.fillStyle(0x8a5a3a);
    for (let y = 12; y < H - 2; y += 5) g.fillRect(4, y, W - 8, 1);
  },
  // Machines three tiles high stacked from the floor (a washer, a dryer on it), laundry on top.
  washer: (g, W, H) => {
    const unit = 3 * TILE;
    const n = Math.floor(H / unit);
    const pile = H - n * unit;
    for (let i = 0; i < n; i++) {
      const y = pile + i * unit;
      g.fillStyle(WHITE).fillRect(0, y, W, unit);
      g.lineStyle(1, LINE).strokeRect(0.5, y + 0.5, W - 1, unit - 1);
      g.fillStyle(SHADE).fillRect(2, y + 2, W - 4, 7);
      g.fillStyle(0x5ab0ff).fillCircle(W - 8, y + 5.5, 2);
      g.fillStyle(LINE).fillCircle(W / 2, y + 28, 15);
      g.fillStyle(0x9fd8ff).fillCircle(W / 2, y + 28, 12);
      g.fillStyle(0xffffff, 0.7).fillEllipse(W / 2 - 4, y + 23, 6, 4);
    }
    if (pile > 0) {
      g.fillStyle(0xff8fb0).fillCircle(W * 0.3, pile - 5, Math.min(7, pile));
      g.fillStyle(0x6ad06a).fillCircle(W * 0.55, pile - 6, Math.min(8, pile));
      g.fillStyle(0xffd23f).fillCircle(W * 0.78, pile - 4, Math.min(6, pile));
    }
  },
  // A wooden shelf (its bottom row is the blocks to stand on), brackets, bottles along it.
  shelf: (g, W, H) => {
    const top = H - TILE;
    g.fillStyle(WOOD).fillRect(0, top, W, 10);
    g.fillStyle(0xc98f5e).fillRect(0, top, W, 2);
    for (let x = 8; x < W; x += 48) g.fillStyle(WOOD_DARK).fillTriangle(x, top + 10, x + 8, top + 10, x, top + 16);
    const colours = [0xff8fb0, 0x6ad06a, 0x5ab0ff, 0xffd23f, 0xc07aff];
    for (let i = 0, x = 10; x + 8 < W && top >= 12; i++, x += 26) {
      const h = 9 + (i % 3) * 2;
      g.fillStyle(colours[i % colours.length]).fillRoundedRect(x, top - h, 8, h, 2);
      g.fillStyle(0xffffff).fillRect(x + 2, top - h - 3, 4, 3);
    }
  },
  // A towel on a rail.
  towel: (g, W, H) => {
    g.fillStyle(LINE).fillRect(0, 2, W, 3);
    g.fillStyle(0xff8fb0).fillRect(3, 5, W - 6, H - 6);
    g.fillStyle(0xffffff).fillRect(3, H - 8, W - 6, 2).fillRect(3, H - 4, W - 6, 1);
  },
```

  - `gfx/course.ts`:
    - a second tileset `COURSE_TILES_HOME_TEXTURE`, the same frames but the gate drawn by `drawCurtain` (a pale blue shower curtain, two folds, a bubble pattern), chosen in the constructor when `world.level.home`;
    - textures `COURSE_SOAP_TEXTURE` (a white dish, a pink soap), `COURSE_BUBBLE_TEXTURE` (a 32px translucent bubble with a white rim and shine), `COURSE_BRUSH_TEXTURE` (80x12: a white handle, a dark blue bristle head at one end);
    - images for each soap dish (bottom-centre on its floor) and brush (at its pivot, rotated to its angle every frame), and a pool of bubble images (origin top-centre at the bubble's top, scaled up from small as it comes out of the dish: `Math.min(BUBBLE_W, 8 + (b.from - b.y)) / BUBBLE_W`, a little sway);
    - `case 'pop': this.spray.explode(10, fx.x, fx.y); break;`.

- [ ] **Step 6: Run everything.** `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && npm run build`. If the ledge or dead-end checks fail on PÄEV, fix the map.

### Task 7: In the browser, and the papers

- [ ] **Step 1.** `?level=20` is PÄEV (port 5181). Screenshots: the boots and the plungers squatting and jumping; the laundry, the fart jump over the washing machine; a bubble rising from the soap dish, riding it, jumping to the shelf, shooting the target, the curtain lifting; the brushes spinning; Härra Kaka by the bathtub hopping off. A scripted run (wait for a plunger to go up, take the fart, ride a bubble, wait for a brush's gap) on Super Easy and on Hard: note any hit the level forces.
- [ ] **Step 2.** Fix what the browser shows; re-run tsc and tests.
- [ ] **Step 3.** `PLAYTEST.md`: PÄEV under the home world's section. The spec: step 2 built. Memory: progress.
- [ ] **Step 4.** `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && npm run build`. Stop for the owner.
