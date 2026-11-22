# Dinosaur Canyon: Three Levels and the Pterodactyl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dinosaur Canyon becomes Dinosauruse kanjon (the original, rebuilt), Kaljusein (today's
Dinosaur Canyon II) and Vulkaan (new: lava and vents), ending with the Pterodactyl; chase
endings with her flying off; zombie dinos.

**Architecture:** As batch 1 (`2026-11-22-doll-garden-theme.md`): pure rules in `src/game/`,
Phaser in `src/gfx/` and the scenes, ASCII levels through `courseLevel`. The boss slot becomes a
union of bosses with one build and one step that dispatch on `kind`.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, "Dinosaur Canyon, in detail".

## Ground rules

As batch 1: worktree `.claude/worktrees/dino-canyon`, branch `dino-canyon`; `npx vitest run` and
`npx tsc --noEmit -p .` before a task is done; nothing in `src/game/` or `src/data/` imports
Phaser; no commits unless the owner asks; the `phaser` skill before Phaser code; test first.

---

### Task 1: More than one kind of boss, and the Pterodactyl's rules

**Files:** `src/data/levels.ts`, `src/data/course.ts`, create `src/game/bosses/pterodactyl.ts`,
`src/game/bosses/index.ts`, `tests/pterodactyl.test.ts`; modify `src/game/bosses/dollQueen.ts`,
`src/game/types.ts`, `src/game/world.ts`, `src/gfx/dollQueen.ts`, `tests/dollQueen.test.ts`,
`tests/dollGarden.test.ts`.

- [x] `src/data/levels.ts`: `export type BossKind = 'dollQueen' | 'pterodactyl';`; `BossDef.kind`
  becomes `BossKind`; `Villain` becomes `'dollQueen' | 'pterodactyl'`.
- [x] `src/data/course.ts`: `CourseLevelSpec` gains `boss?: BossKind`, which `courseLevel` writes
  into the parsed boss (`course: spec.boss && parsed.course.boss ? { ...parsed.course, boss: {
  ...parsed.course.boss, kind: spec.boss } } : parsed.course`). The parser no longer throws for a
  boss with no spots; `buildDollQueen` throws instead (`'the Doll Queen needs her target spots'`),
  because a Pterodactyl needs none.
- [x] `src/game/bosses/pterodactyl.ts`: the rules (below).
- [x] `src/game/bosses/index.ts`:

```ts
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import type { World } from '../types';
import { buildDollQueen, stepDollQueen, type DollQueenState } from './dollQueen';
import { buildPterodactyl, stepPterodactyl, type PterodactylState } from './pterodactyl';

/** A hand-built level's boss, whichever it is: each theme has its own. */
export type CourseBoss = DollQueenState | PterodactylState;

export function buildCourseBoss(def: BossDef, dc: DifficultyRecord): CourseBoss {
  return def.kind === 'pterodactyl' ? buildPterodactyl(def, dc) : buildDollQueen(def, dc);
}

export function stepCourseBoss(world: World, boss: CourseBoss): void {
  if (boss.kind === 'pterodactyl') stepPterodactyl(world, boss);
  else stepDollQueen(world, boss);
}
```

- [x] `World.courseBoss` becomes `CourseBoss | null`; `world.ts` builds and steps through the
  dispatchers; the Doll Queen's view hides itself unless `courseBoss.kind === 'dollQueen'`; the
  Queen's tests read `world.courseBoss as DollQueenState`.
- [x] Tests, `tests/pterodactyl.test.ts`: she sleeps until the hero is in the arena, then flies at
  her altitude; no plain jump reaches her back and every fart jump does, on every difficulty
  (`jumpRise`); landing on her back is a hit; touching her from below or the side bounces the
  hero off unharmed; arrows bounce off; a rock drops only after its warning, straight down, never
  more than two in the air; after a hit she is gone for a while, comes back a round faster, and
  has called zombie dinos (never more than two); three hits beat her and take her zombies; the
  cage opens only then.

### Task 2: Lava and vents

**Files:** `src/data/levels.ts`, `src/data/course.ts`, `src/game/course.ts`, `src/gfx/course.ts`,
`tests/course.test.ts`.

- [x] `TILE_LAVA = 10`, not solid. ASCII `~` is lava; `v` is a vent, a lava cell that erupts.
  `CourseDef.vents: Array<{ x: number; y: number }>`.
- [x] Rules (`game/course.ts`): touching lava with the feet is a fall: with a cape, the cape is spent
  and the hero is thrown up out of it (as from a pit: `vy -10`, `liftTimer 30`, 60 frames
  invincible, `'cape'`); without one, `playerDie`. Each vent erupts every
  `ventInterval(dc) = round(dc.enemyShootInterval * 0.9) + 40` frames, glowing for its last 45
  (`ventWarning`), with a fireball straight up (`vx 0`, `vy -(2.4 + dc.enemySpeed)`, life 50,
  `'cannon-fire'`); vents start out of step with each other.
- [x] Look (`gfx/course.ts`): a lava tile frame (orange, brighter bubbles); vents glow while
  warning; embers rise from lava now and then; a splash when the hero falls in.
- [x] Tests: lava with a cape throws the hero up and spends it; lava without one kills; a vent
  warns, then erupts straight up, on its interval; vents start apart.

### Task 3: Seeing the Pterodactyl

**Files:** `src/data/sprites.ts`, `src/gfx/textures.ts`, create `src/gfx/pterodactyl.ts`, modify
`src/scenes/SliceScene.ts`, `src/scenes/BetweenScene.ts`.

- [x] Her sprite, 16x8 at 3, two wing frames, in profile facing left (long beak, crest); a rock
  texture. `VILLAIN_TEXTURES.pterodactyl`.
- [x] `PterodactylView` (like `DollQueenView`): wings flapping; a shadow on the floor under her
  while a rock is coming; she shoots up out of sight when hit, tumbles and bursts into feathers
  when beaten; sparks on a hit, a puff on a bounce. Hidden unless the boss is hers.
- [x] Rocks draw with the rock texture (`syncEnemyProjectiles`, by `type`).
- [x] The chase cutscene flies a flying villain above the ground.

### Task 4: The three levels

**Files:** create `src/data/levels2/kanjon.ts`, `src/data/levels2/vulkaan.ts`,
`tests/dinoCanyon.test.ts`; modify `src/data/levels2/dinoCanyon2.ts`, `src/data/stages.ts`,
`src/config/i18n.ts`, `tests/i18n.test.ts`, `tests/levels2.test.ts`.

- [x] **Dinosauruse kanjon** (`level_2`): canyon ledges and gentle pits, dinos, a bat, `?`
  blocks; the first cliff, 7 tall, with the fart station in front; a bow and two zombie dinos; a
  cannon on a ledge; the Pterodactyl perched with the sibling at the end (chase).
- [x] **Kaljusein** (`level_2_2`, "Canyon Wall"): today's map, two zombie dinos by the cannons,
  ending chase on the mesa.
- [x] **Vulkaan** (`level_2_3`, "Volcano"): stepping stones over lava with a vent; a fart up onto a
  pillar over lava, then pillar to pillar past a vent; zombie dinos and a cannon; the arena (door,
  two fart stations, the Pterodactyl, the cage on a rock).
- [x] Theme 1's list: `[KANJON, DINO_CANYON_2, VULKAAN]`.
- [x] Tests: the run order and endings; Kanjon's cliff needs a fart on every difficulty and the
  rest of it runs through with plain jumps; Kaljusein's chase at the mesa top; Vulkaan's first
  pillar needs a fart, the next ones do not; every stepping stone is a plain jump; the arena's
  boss is the Pterodactyl, its door shuts behind you, its cage stands on the rock.

### Task 5: Play it in the browser, Super Easy and Hard

As batch 1's Task 9: each level to its end, the fight to the rescue, on both difficulties; fix
what is found, with a test where one can pin it; `next/PLAYTEST.md` gets a Dinosaur Canyon
section; record what was found at the end of this plan.

---

## The Pterodactyl's rules (Task 1)

```ts
import { TILE } from '../../config/constants';
import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import { spawnEnemy } from '../enemy';
import { rectOverlap } from '../tiles';
import type { World } from '../types';

/**
 * The Pterodactyl, Dinosaur Canyon's boss (docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md).
 *
 * She flies back and forth over the arena, PTERO_ALTITUDE above the floor: no plain jump
 * reaches her back on any difficulty, a fart jump does on every one, so the theme's tool is the
 * way to beat her. Landing on her back is a hit; touching her from below or the side just
 * bounces the hero off, unharmed, because she is the one to catch. She drops rocks straight
 * down, with a shadow on the floor first, and after each hit she flies up out of sight, calls
 * zombie dinos and comes back faster. Three hits.
 *
 * Pure, like the rest of src/game/: gfx/pterodactyl.ts draws her and drains `fx`.
 */

export const PTERO_HP = 3;
/** Her body, in pixels: the 16x8 sprite at 3. */
export const PTERO_W = 48;
export const PTERO_H = 24;
/**
 * The bottom of her body, this far above the floor. Her back is then 128px up: hard's plain
 * jump lifts the feet 62px and super easy's 98, every fart jump at least 141.
 */
export const PTERO_ALTITUDE = 104;
/** How long she is gone, up out of sight, after a hit. */
export const PTERO_HURT_FRAMES = 100;
/** Frames of shadow on the floor before a rock drops. */
export const PTERO_WARN_FRAMES = 40;
export const PTERO_MAX_ZOMBIES = 2;
export const PTERO_MAX_ROCKS = 2;

export type PteroPhase = 'asleep' | 'flying' | 'hurt' | 'defeated';

/** Something worth showing (gfx/pterodactyl.ts). Positions in pixels. */
export interface PteroFx {
  kind: 'wake' | 'hit' | 'bounce';
  x: number;
  y: number;
}

export interface PterodactylState {
  kind: 'pterodactyl';
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  facing: 1 | -1;
  /** The arena's floor, in pixels. */
  floorY: number;
  /** How far left and right she flies, as her `x`, in pixels. */
  patrol: [number, number];
  hp: number;
  /** 0, 1, 2: each round faster, dropping more. */
  round: number;
  phase: PteroPhase;
  /** Frames left of being gone after a hit. */
  timer: number;
  /** Frames to her next rock. */
  dropTimer: number;
  /** Counts up while she flies; her bob and her wings follow it. */
  flap: number;
  /** Drained by the scene; capped. */
  fx: PteroFx[];
}

export function flySpeed(dc: DifficultyRecord, round: number): number {
  return Math.max(0.5, dc.enemySpeed) * (0.8 + 0.4 * round);
}

export function dropInterval(dc: DifficultyRecord, round: number): number {
  return Math.max(80, Math.round(dc.enemyShootInterval * 1.4) - round * 30);
}

export function rockSpeed(dc: DifficultyRecord): number {
  return 1.2 + dc.enemySpeed;
}

/** Her body's y while flying: the altitude, bobbing a little. */
function flightY(b: PterodactylState): number {
  return b.floorY - PTERO_ALTITUDE - b.h + Math.sin(b.flap * 0.06) * 4;
}

export function buildPterodactyl(def: BossDef, dc: DifficultyRecord): PterodactylState {
  const floorY = def.y * TILE;
  const b: PterodactylState = {
    kind: 'pterodactyl',
    x: def.x * TILE + TILE / 2 - PTERO_W / 2,
    y: 0,
    w: PTERO_W,
    h: PTERO_H,
    vx: 0,
    facing: -1,
    floorY,
    patrol: [def.patrol[0] * TILE, def.patrol[1] * TILE - PTERO_W],
    hp: PTERO_HP,
    round: 0,
    phase: 'asleep',
    timer: 0,
    dropTimer: dropInterval(dc, 0),
    flap: 0,
    fx: [],
  };
  b.y = flightY(b);
  return b;
}

/** Whether a rock is about to drop: the scene shows its shadow on the floor. */
export function rockWarning(b: PterodactylState): boolean {
  return b.phase === 'flying' && b.dropTimer <= PTERO_WARN_FRAMES;
}

function pushFx(b: PterodactylState, fx: PteroFx): void {
  if (b.fx.length >= 32) b.fx.shift();
  b.fx.push(fx);
}

/** Two zombie dinos from the ends of her flight, never more than PTERO_MAX_ZOMBIES up. */
function callZombies(world: World, b: PterodactylState): void {
  const floorRow = b.floorY / TILE;
  const up = world.enemies.filter((e) => e.alive && e.zombie).length;
  for (const x of [b.patrol[1] + b.w, b.patrol[0]].slice(0, Math.max(0, PTERO_MAX_ZOMBIES - up))) {
    const e = spawnEnemy(world.map, world.dc, { type: 'dino', x: Math.floor(x / TILE), floorRow, zombie: true });
    if (e) world.enemies.push(e);
  }
}

function defeat(world: World, b: PterodactylState): void {
  b.phase = 'defeated';
  world.score += Math.round(1000 * world.dc.scoreMultiplier);
  world.sounds.push('win');
  for (const e of world.enemies) {
    if (!e.alive || !e.zombie) continue;
    e.alive = false;
    e.squashTimer = 30;
  }
}

function hit(world: World, b: PterodactylState): void {
  b.hp--;
  world.score += Math.round(500 * world.dc.scoreMultiplier);
  world.sounds.push('stomp', 'boss-roar');
  pushFx(b, { kind: 'hit', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (b.hp <= 0) {
    defeat(world, b);
    return;
  }
  b.phase = 'hurt';
  b.timer = PTERO_HURT_FRAMES;
  callZombies(world, b);
}

function fly(world: World, b: PterodactylState): void {
  const speed = flySpeed(world.dc, b.round);
  b.vx = (b.vx < 0 ? -1 : 1) * speed;
  b.x += b.vx;
  if (b.x <= b.patrol[0]) {
    b.x = b.patrol[0];
    b.vx = speed;
  }
  if (b.x >= b.patrol[1]) {
    b.x = b.patrol[1];
    b.vx = -speed;
  }
  b.facing = b.vx < 0 ? -1 : 1;
  b.flap++;
  b.y = flightY(b);

  if (--b.dropTimer > 0) return;
  b.dropTimer = dropInterval(world.dc, b.round);
  if (world.enemyProjectiles.filter((s) => s.type === 'rock').length >= PTERO_MAX_ROCKS) return;
  world.enemyProjectiles.push({
    x: b.x + b.w / 2 - 4,
    y: b.y + b.h,
    vx: 0,
    vy: rockSpeed(world.dc),
    life: 400,
    type: 'rock',
  });
  world.sounds.push('boss-fire');
}

/** Arrows bounce off her: only landing on her back counts. */
function arrows(world: World, b: PterodactylState): void {
  for (const a of world.arrows) {
    if (a.life <= 0 || !rectOverlap({ x: a.x, y: a.y, w: 12, h: 4 }, b)) continue;
    a.life = 0;
    world.sounds.push('block');
    pushFx(b, { kind: 'bounce', x: a.x, y: a.y });
  }
  world.arrows = world.arrows.filter((a) => a.life > 0);
}

/** Landing on her back is a hit; any other touch bounces the hero off, unharmed. */
function contact(world: World, b: PterodactylState): void {
  const p = world.player;
  if (!rectOverlap(p, b)) return;
  if (p.vy > 0 && p.y + p.h - 6 < b.y + b.h / 2) {
    p.vy = -7;
    hit(world, b);
    return;
  }
  if (p.y + p.h / 2 > b.y + b.h) {
    // From below: knocked back down.
    p.y = b.y + b.h + 1;
    if (p.vy < 0) p.vy = 2;
  } else {
    const fromLeft = p.x + p.w / 2 < b.x + b.w / 2;
    p.x = fromLeft ? b.x - p.w - 1 : b.x + b.w + 1;
    p.vx = fromLeft ? -3 : 3;
  }
  world.sounds.push('boing');
  pushFx(b, { kind: 'bounce', x: p.x + p.w / 2, y: p.y });
}

/** One step of her, after the course and the enemies (game/world.ts's stepWorld). */
export function stepPterodactyl(world: World, b: PterodactylState): void {
  const p = world.player;
  switch (b.phase) {
    case 'defeated':
      return;
    case 'asleep':
      b.flap++;
      b.y = flightY(b);
      if (p.x + p.w / 2 > b.patrol[0]) {
        b.phase = 'flying';
        world.sounds.push('boss-roar');
        pushFx(b, { kind: 'wake', x: b.x + b.w / 2, y: b.y });
      }
      return;
    case 'hurt':
      // Up out of sight, then back, faster.
      b.y -= 3;
      if (--b.timer > 0) return;
      b.round++;
      b.phase = 'flying';
      b.y = flightY(b);
      world.sounds.push('boss-roar');
      return;
    case 'flying':
      fly(world, b);
      break;
  }
  arrows(world, b);
  contact(world, b);
}
```

---

## What the browser found (Task 5, 2026-11-22)

Each level played to its end on Super Easy and Hard with real physics, and the fight to the
rescue on both. Found and fixed:

- **Her belly.** Touching her from below bounced the hero back down, so a jump from right
  under her, the jump a child makes, never hit. A rising hero now passes up through her and
  lands on her back (`contact`); pinned on every difficulty in `tests/pterodactyl.test.ts`.
- **Her look.** The 16x8 sprite read as a flat purple log. Redrawn 24x12 at 2 (the same 48x24
  body): spread wing, long tapered beak, swept-back crest. She faces the way she flies off, in
  the level and in the cutscene, where she was also too small (drawn at 1.6 now).
- **The chase.** Flying off, she went through the wall behind her; she now climbs steeply.
- **Lava out of sight.** The view is 16 rows tall, so lava in the bottom rows did not show
  from the rock tops: the gaps looked like plain holes. The lava in those gaps stands 4 rows
  high now.
- **Vents everywhere.** A vent is part of the map, so it erupted, with a cannon's bang, all
  level long from off screen. Vents now erupt only within 20 tiles of the hero (`VENT_REACH`,
  tested).
- **Canyon rock** was the hills' colour, so the first cliff hardly showed: dark rock now, on
  Kanjon and Kaljusein.
- A checkpoint flag four tiles before the arena's own flag: removed.

Not changed: on Kaljusein the bot jumped a doll and over the fart station in front of the
wall, then stood stuck at the wall until it walked back for it; a child does the same. Batch
1's bridge puzzle on Kaljusein is still for a person, not the bot.
