# Palermo: Three Levels and the Pizza Chef — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Palermo becomes Palermo väljak (the original, rebuilt), Turg (the Market) and
Katedraal (the Cathedral), ending with the Pizza Chef; chase endings with him running off;
zombie cooks; giants in the way that only a chicken ray moves.

**Architecture:** As batches 1 to 3: pure rules in `src/game/`, Phaser in `src/gfx/` and the
scenes, ASCII levels through `courseLevel`. The Pizza Chef joins the boss union
(`src/game/bosses/index.ts`). The giant already exists (`type: 'giant'`, an Arcade static body
in `gfx/course.ts`); it gets its own look and kinder rules.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, "Palermo, in detail".

## Ground rules

Worktree `.claude/worktrees/palermo`, branch `palermo`; `npx vitest run` and
`npx tsc --noEmit -p .` before a task is done; nothing in `src/game/` or `src/data/` imports
Phaser; no commits unless the owner asks; the `phaser` skill before Phaser code; test first.

---

### Task 1: Chickens and giants that never hurt (hand-built levels)

**Files:** `src/game/enemy.ts`; tests in `tests/course.test.ts`.

- [x] On a level with a course, a chicken's touch does nothing; a stomp still pops it for points.
  The original levels keep the original rule (`tests/legacy.test.ts` and friends stay green).
- [x] A giant never hurts: landing on him bounces the hero up, a side touch pushes the hero out
  (never into a wall, `boxHitsSolid`), arrows still bounce off, a ray still makes a chicken.
- [x] Tests: a zombie rayed into a chicken walks into the hero, who is unhurt; a stomp on a
  giant bounces; walking into one pushes back; an original level's chicken still hurts.

### Task 2: Zombie cooks and the giant's look

**Files:** `src/data/sprites.ts`, `src/game/enemy.ts`, `src/game/run.ts`, `src/gfx/textures.ts`,
`src/data/course.ts`, `src/config/constants.ts`; test in `tests/course.test.ts`.

- [x] `COOK_S` (8x9: tall hat, face, jacket, apron, shoes), `COOK_P`, `ZOMBIE_COOK_P` (grey
  hat, green face, red eyes, stained apron); `cook` in `ENEMY_SPRITES`, `getEnemySpriteInfo`,
  `ENEMY_TYPES`, `ZOMBIE_KINDS`; `Z` in the course legend (a zombie cook; no lower case).
- [x] `GIANT_S` (16x18, a strongman with his arms folded, moustache, striped vest) at
  `GIANT_SCALE` 3, still 48x54.
- [x] Test: `Z` parses to `{ type: 'cook', zombie: true }` and pushes like the other zombies.

### Task 3: The Pizza Chef's rules

**Files:** create `src/game/bosses/pizzaChef.ts`, `tests/pizzaChef.test.ts`; modify
`src/data/levels.ts` (`BossKind`, `Villain` gain `'pizzaChef'`), `src/game/bosses/index.ts`.

- [x] 32x48 at `Q`, asleep until the hero is past the door side of the square; then cooking:
  he faces the hero and calls his giants (one, then two) on the floor between him and the door,
  never on top of the hero.
- [x] He tosses a pizza every `throwInterval` (`type: 'pizza'`): an arc that lands where the hero
  stood, under his own gravity; it hurts, an arrow knocks it out, never more than two up.
- [x] Rays: while a giant stands, or while he is not cooking, he bats a ray away. Otherwise a ray
  makes him a chicken for `chickenFrames`: a smaller box, running away from the hero between the
  patrol ends. A stomp on the chicken is a hit; his touch never hurts.
- [x] After a hit he sits dazed (`CHEF_HURT_FRAMES`), walks home, and calls the next round's
  giants. Time up without a stomp: he pops back unhurt and walks home, no new giants.
- [x] Three hits: defeated, pizzas gone, the cage opens.
- [x] Tests: each rule above; slower, rarer pizzas and a longer chicken on Super Easy than Hard;
  the chicken slower than the hero runs on every difficulty.

### Task 4: How he looks

**Files:** `src/data/sprites.ts` (chef, chef-chicken, pizza, peel), `src/gfx/textures.ts`,
create `src/gfx/pizzaChef.ts`; modify `src/scenes/SliceScene.ts` (view; pizzas drawn by `type`,
spinning, with a shadow on the floor), `src/scenes/BetweenScene.ts` (runner).

- [x] The chef with his peel; a puff of flour when he turns into a chicken and back; feathers on
  a hit; dazed stars; giants arriving in a puff; beaten, he flops and his hat rolls off.
- [x] `VILLAIN_TEXTURES.pizzaChef`; he runs off on foot like the Queen and Toomas.

### Task 5: The three levels

**Files:** create `src/data/levels2/piazza.ts`, `turg.ts`, `katedraal.ts`, `tests/palermo.test.ts`;
modify `src/data/stages.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`.

- [x] Palermo väljak (`level_4`), Turg (`level_4_2`, "Turg" / "The Market"), Katedraal
  (`level_4_3`, "Katedraal" / "The Cathedral"), as the spec describes.
- [x] Theme 3's list: `[PIAZZA, TURG, KATEDRAAL]`.
- [x] Tests: the run order and endings; a chicken ray station before every giant; every giant
  under a roof no jump gets over, and no way past without a ray; every gap a plain jump; the
  target behind a giant out of reach until he is a chicken; the two-target gate; each level
  runs through on every difficulty with rays fired at what is in the way.

### Task 6: Play it in the browser, Super Easy and Hard

As before: each level to its end, the fight to the rescue, on both difficulties; fix what is
found, with a test where one can pin it; `next/PLAYTEST.md` gets a Palermo section; record what
was found at the end of this plan.

---

## What the browser found (Task 6, 2026-11-23)

Each level played to its end on Super Easy and Hard with real physics, and the fight to the
rescue on both (about 14 seconds of fighting on Super Easy, 20 on Hard, no deaths). Found and
fixed:

- **Boxed in by two giants.** The Chef called his second round's giants on either side of a
  hero standing between the spots, under his pizzas. Giants now come only between the hero
  and him, and until they all have, he still bats rays away (tested).
- **A flag after the station.** Turg's first flag stood after the chicken ray station: a hero
  who died at the giant came back with no rays and the station behind them. Every giant and
  zombie cook now has a station after the last flag before it (tested, all three levels).
- **The Chef off screen.** In a 40-tile square he tossed pizzas from out of view; the square
  is 32 now and he stands in it.
- **A giant's chicken fell from his head.** It appeared where his hat was and dropped three
  tiles; it appears at his feet now, with a puff of confetti and dust (tested).
- **Hard pile-ups.** A doll walked in under a low market stall, where no jump clears it (the
  stalls are solid counters now); a car that turned back at a stall followed the hero into a
  giant's lane and hit them from behind (gone); a doll at the top of the cathedral steps met
  a hero jumping up them (gone).
- **Looks.** The zombie cook's grey hat did not read as a cook's (dirty white now); beaten, the
  Chef sank into the floor (he flops over instead).

Not changed: the giants' roofs read as floating blocks of brick; the bot never jumps out of a
giant's way, a child can.
