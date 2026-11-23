# Winter: Three Levels and the Yeti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Winter becomes Talvine imedemaa (the original, rebuilt), Jäätunud järv (the Frozen
Lake) and Jääloss (the Ice Palace), ending with the Yeti; chase endings with him running off;
zombie penguins; ice you slide on, and icy water.

**Architecture:** As batches 1 to 4: pure rules in `src/game/`, Phaser in `src/gfx/` and the
scenes, ASCII levels through `courseLevel`. Ice is a tile (`TILE_ICE`, solid) that changes the
hero's grip in `stepMotion`; icy water is a tile (`TILE_WATER`) that is a fall, as lava is. The
Yeti joins the boss union (`src/game/bosses/index.ts`).

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, "Winter, in detail".

## Ground rules

Worktree `.claude/worktrees/winter`, branch `winter`; `npx vitest run` and
`npx tsc --noEmit -p .` before a task is done; nothing in `src/game/` or `src/data/` imports
Phaser; no commits unless the owner asks; the `phaser` skill before Phaser code; test first.

---

### Task 1: Ice and icy water

**Files:** `src/data/levels.ts` (`TILE_ICE` 11, solid; `TILE_WATER` 12), `src/data/course.ts`
(`I` ice, `_` water), `src/game/player.ts` (`MotionOptions.onIce`: low grip), `src/game/course.ts`
(water is a fall, as lava), `src/gfx/course.ts` (both drawn), `tests/helpers/courseRuns.ts`
(water is a gap to the runner); tests in `tests/course.test.ts`.

- [x] On ice the hero speeds up more slowly than on snow and, letting go, slides several tiles
  further; jumping off ice is the same jump.
- [x] Falling into icy water is a fall: the cape throws you out once, else a life is gone.
- [x] Both tiles drawn: ice pale blue with a shine; water dark blue with a lighter surface.

### Task 2: Zombie penguins

**Files:** `src/data/sprites.ts` (`ZOMBIE_PENGUIN_P`), `src/gfx/textures.ts` (`ZOMBIE_KINDS`),
`src/data/course.ts` (`W`); test in `tests/course.test.ts`.

- [x] `W` parses to `{ type: 'penguin', zombie: true }`, pushes, and goes down to an arrow.

### Task 3: The Yeti's rules

**Files:** create `src/game/bosses/yeti.ts`, `tests/yeti.test.ts`; modify `src/data/levels.ts`
(`BossKind`, `Villain` gain `'yeti'`), `src/game/bosses/index.ts`.

- [x] 40x40 at `Q`; asleep until the hero is in the room. Winds up facing the hero
  (`windupFrames`), then charges, speeding up, until he reaches a wall (just inside the door, or
  the dais's foot). A charge hurts; otherwise his touch pushes the hero out, never into a wall.
- [x] Slamming a wall: dizzy for `dizzyFrames`, and icicles drop across the room (`icicleCount`),
  each hanging `ICICLE_WARN` frames first, never right on top of him; they fall, hurt, and an
  arrow breaks one.
- [x] Dizzy, a stomp on his head is a hit: he gets up, calls two zombie penguins (never more than
  two up), and charges faster. Not stomped in time, he winds up again.
- [x] Three hits: beaten, icicles gone, his zombies fall, the cage opens.
- [x] Tests: each rule; every plain jump clears his charge on every difficulty running at him,
  and on Super Easy standing; slower and kinder on Super Easy than Hard.

### Task 4: How he looks

**Files:** `src/data/sprites.ts` (Yeti, roaring Yeti, icicle), `src/gfx/textures.ts`, create
`src/gfx/yeti.ts`; modify `src/scenes/SliceScene.ts` (view; icicles drawn by `type`).

- [x] He shakes as he winds up, mouth open; leans into the charge with snow spraying behind;
  the room shakes at the slam; hanging icicles shake over their shadows; stars while dizzy;
  beaten, he flops over. `VILLAIN_TEXTURES.yeti`; he runs off on foot.

### Task 5: The three levels

**Files:** create `src/data/levels2/talvemaa.ts`, `jarv.ts`, `jaaloss.ts`, `tests/winter.test.ts`;
modify `src/data/stages.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`.

- [x] Talvine imedemaa (`level_5`), Jäätunud järv (`level_5_2`, "Jäätunud järv" / "The Frozen
  Lake"), Jääloss (`level_5_3`, "Jääloss" / "The Ice Palace"), as the spec describes.
- [x] Theme 4's list: `[TALVEMAA, JARV, JAALOSS]`.
- [x] Tests: run order and endings; every gap a plain jump on Hard; every floe wide enough to stop
  on; the ice cliff only a fart climbs; the cracked ice smashed by a big head only; a station after
  the last flag before every zombie, giant, cliff and cracked wall; each level runs through on
  every difficulty with what is in the way shot.

### Task 6: Play it in the browser, Super Easy and Hard

As before; `next/PLAYTEST.md` gets a Winter section; record what was found at the end of this plan.

---

## What the browser and the tests found (Tasks 5 and 6, 2026-11-23)

Each level played to its end on Super Easy and Hard with real physics, ordinary enemies and
all, and the fight to the rescue on both (about 38 seconds of fighting on Super Easy, 21 on
Hard, no deaths). Found and fixed:

- **Six-tile floes were too short.** Super Easy's long jump came down near the far end, and a
  hero who let go slid off into the water. The floes are 10 to 12 tiles and the ice a little
  grippier (it slides three or four tiles, not five); tested on every difficulty.
- **Pits where a jump off a step lands.** Jumping off a step before a pit came down in it on
  some difficulties (the pit was as far off as one jump). Both pits in Talvine imedemaa are now
  well past every jump's landing.
- **Standing on his head.** A hero on the Yeti's head as he wound up at a wall made him charge
  straight into it: dizzy at once, stomped at once. His head throws you off now, and he never
  charges into the wall at his back (tested).
- **His back hurt.** A hero who jumped his charge came down on his back as he ran off, and was
  hurt. Only his front hurts in a charge (tested).
- **Too short to reach him.** He slams into the far wall, up to twenty tiles off, and on Hard
  his dizzy spell had shrunk to two seconds. It is never shorter than it takes to run the whole
  room and jump (tested).
- **The water was a thin strip** under the floes; it is level with them now, so the ice floats.
- **Both beaten bosses sank into the floor** when they flopped over (the Pizza Chef too); they
  turn about their middle now and rest on it.
