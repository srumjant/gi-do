# Tallinn: Three Levels and Vana Toomas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tallinn becomes Tallinna vanalinn (the original, rebuilt), Tornid (the Towers) and
Raekoja plats (Town Hall Square), ending with Vana Toomas; chase endings with him running off;
zombie knights.

**Architecture:** As batches 1 and 2: pure rules in `src/game/`, Phaser in `src/gfx/` and the
scenes, ASCII levels through `courseLevel`. Vana Toomas joins the boss union
(`src/game/bosses/index.ts`).

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, "Tallinn, in detail".

## Ground rules

Worktree `.claude/worktrees/tallinn`, branch `tallinn`; `npx vitest run` and
`npx tsc --noEmit -p .` before a task is done; nothing in `src/game/` or `src/data/` imports
Phaser; no commits unless the owner asks; the `phaser` skill before Phaser code; test first.

---

### Task 1: Zombie knights

**Files:** `src/data/sprites.ts`, `src/game/enemy.ts`, `src/game/run.ts`, `src/gfx/textures.ts`,
`src/data/course.ts`; test in `tests/course.test.ts`.

- [x] `KNIGHT_S` (8x9, a little knight: plumed helmet with a visor slit, breastplate, boots),
  `KNIGHT_P` (bright steel, for completeness) and `ZOMBIE_KNIGHT_P` (rusty armour, green chin,
  red eyes in the slit).
- [x] `knight` in `ENEMY_SPRITES`, `getEnemySpriteInfo`, `ENEMY_TYPES`, and `ZOMBIE_KINDS`.
- [x] `K` in the course legend: a zombie knight. Only zombies wear this armour, so there is no
  lower-case letter.
- [x] Test: a `K` parses to `{ type: 'knight', zombie: true }`, walks after the hero, pushes and
  goes down to an arrow, like the other zombies.

### Task 2: Vana Toomas's rules

**Files:** create `src/game/bosses/vanaToomas.ts`, `tests/vanaToomas.test.ts`; modify
`src/data/levels.ts` (`BossKind`, `Villain` gain `'vanaToomas'`), `src/game/bosses/index.ts`.

- [x] He is 32x48 (16x24 at 2), stands at `Q`, sleeps until the hero is past the door side of
  his walk, then marches between the patrol ends, turning at each.
- [x] Without a big head any touch is harmless: a stomp bounces the hero up with a clang, a side
  touch pushes them out, arrows clang off. Nothing he does by touch hurts.
- [x] With a big head, landing on his top third, or running into his back (the side he is not
  facing), is a hit: a piece of armour flies off (helmet, breastplate, shield, in that order),
  he staggers back for `TOOMAS_HURT_FRAMES`, calls zombie knights at the patrol ends (never
  more than `TOOMAS_MAX_ZOMBIES` up), and comes back faster. His front (the shield) clangs.
- [x] Every `stampInterval` he stops, raises his flag pole for `TOOMAS_WINDUP_FRAMES`, and stamps:
  two shockwaves (`type: 'wave'`) roll along the floor away from him; they hurt, they stop at
  walls, an arrow breaks one, a jump clears them on every difficulty.
- [x] Three hits and he sits down, beaten: his zombies fall, the cage opens.
- [x] Tests: each rule above; the shockwave is lower than every plain jump; slower and rarer on
  Super Easy than Hard.

### Task 3: How he looks

**Files:** `src/data/sprites.ts` (body, helmet, breastplate, shield, flag pole; a whole-knight
sprite merged from the layers for the chase and the cutscene), `src/gfx/textures.ts`, create
`src/gfx/vanaToomas.ts`; modify `src/scenes/SliceScene.ts` (view; waves drawn by `type`).

- [x] Layers drawn over his body; a hit sends that piece spinning off; he flashes while staggered;
  the flag pole rises in the windup and slams down; dust where a wave rolls; beaten, he sits.
- [x] `VILLAIN_TEXTURES.vanaToomas` is the whole knight; he runs off on foot like the Queen.

### Task 4: The three levels

**Files:** create `src/data/levels2/vanalinn.ts`, `tornid.ts`, `raekoda.ts`, `tests/tallinn.test.ts`;
modify `src/data/stages.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`.

- [x] Vanalinn (`level_3`), Tornid (`level_3_2`, "Tornid" / "The Towers"), Raekoja plats
  (`level_3_3`, "Raekoja plats" / "Town Hall Square"), as the spec describes.
- [x] Theme 2's list: `[VANALINN, TORNID, RAEKODA]`.
- [x] Tests: the run order and endings; each tower too tall to jump or spring over, its cracked
  door smashed by a big head; every gap a plain jump; Tornid's cracked tower floors drop a big
  head through and nothing else; the springs reach the wall; the hidden target opens its gate;
  the square's door shuts, the cage stands on the steps.

### Task 5: Play it in the browser, Super Easy and Hard

As before: each level to its end, the fight to the rescue, on both difficulties; fix what is
found, with a test where one can pin it; `next/PLAYTEST.md` gets a Tallinn section; record what
was found at the end of this plan.

---

## What the browser found (Task 5, 2026-11-22)

Each level played to its end on Super Easy and Hard with real physics, and the fight to the
rescue on both. Found and fixed:

- **Zombies hurt a big head.** The big head widens the hero's hit box, so a zombie just short
  of the push's reach was taken for an ordinary enemy and killed the hero. A zombie now never
  reaches the enemy hit code (`enemy.ts`; tested).
- **Pushed into a wall, through the floor.** A zombie pushing a hero against a wall put them
  inside it, and Arcade dropped them through the floor (a respawn rebuilds a smashed tower
  door behind you). Every push (zombies and all three bosses) now checks the wall first
  (`boxHitsSolid`); pinned, the hero holds the zombie back (tested).
- **The fight was over in seconds.** Bouncing on his helmet landed again the moment each
  stagger ended. Now a hero is thrown off to the side, he staggers well away and stamps as
  he recovers, and while his flag pole is up he is braced (a big head clangs). Super Easy:
  about 5 seconds of fighting; Hard: about 8, jumping the slam (tested).
- **His waves outlived him** and took a cape after the win; they settle when he is beaten.
- **The Town Hall target** stood a row too high: every standing shot flew under it. It stands
  on the wall top now, and the wall is 8 tall so no jump from the ground shoots over it
  (tested for both heroes on every difficulty).
- **Stations past a spring's landing.** Springs carry you far: the big head on the town wall
  and the bow on the Town Hall wall stand at the wall's foot, where a spring's overshoot ends.
- **Traps.** The target's alcove in Tornid sealed off the whole path; dropping off the Town Hall
  wall before shooting its target left you between the wall and a shut gate (a second spring
  takes you back up); a gap between the last tower and the wall in Tornid caught a spring's
  overshoot (the tower meets the wall now).
- **Hard pile-ups.** A cannon on a narrow wall, and a doll and a bat in a cannon's pocket,
  killed the bot over and over on Hard: Vanalinn's cannon is on the ground, the square's sit
  behind low walls, and the pockets are clear. A cracked pile that stood the hero in a
  cannon's line of fire is gone.
- **Looks.** Toomas turns to run off (in the level and the cutscene, sized to the Queen's
  height there); the zombie knight's eyes were one red blob.

Not changed: the bot never aims, so it shot targets only by luck; a child turns round and
shoots.
