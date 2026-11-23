# Toy Castle: Three Levels and the T-Rex's Final Fight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toy Castle becomes Mängulossi (the original, rebuilt), Lossisaalid (the Castle Halls)
and Troonisaal (the Throne Room), ending with the T-Rex's new fight, one tool per hit, on the
boss framework; chase endings with the T-Rex; zombie toy soldiers. The run ends there.

**Architecture:** As batches 1 to 5: pure rules in `src/game/`, Phaser in `src/gfx/` and the
scenes, ASCII levels through `courseLevel`. The T-Rex joins the boss union
(`src/game/bosses/index.ts`) as `tRex`; the classic fight (`game/boss.ts`) stays for the
original level's tests, which no longer comes in the run.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-22-three-levels-and-a-boss-design.md`, "Toy Castle, in detail".

## Ground rules

Worktree `.claude/worktrees/toy-castle`, branch `toy-castle`; `npx vitest run` and
`npx tsc --noEmit -p .` before a task is done; nothing in `src/game/` or `src/data/` imports
Phaser; no commits unless the owner asks; the `phaser` skill before Phaser code; test first.

---

### Task 1: Zombie toy soldiers

**Files:** `src/data/sprites.ts` (`SOLDIER_S`, `SOLDIER_P`, `ZOMBIE_SOLDIER_P`), `src/game/enemy.ts`,
`src/game/run.ts`, `src/gfx/textures.ts`, `src/data/course.ts` (`L`); test in `tests/course.test.ts`.

- [x] `L` parses to `{ type: 'soldier', zombie: true }`, pushes, and goes down to an arrow.

### Task 2: The T-Rex's rules

**Files:** create `src/game/bosses/tRex.ts`, `tests/tRex.test.ts`; modify `src/data/levels.ts`
(`BossKind`, `Villain` gain `'tRex'`), `src/game/bosses/index.ts`.

- [x] 72x80 at `Q`; asleep until the hero is in the room; walks his patrol, and every
  `roarInterval` walks to the middle and roars (`roarFrames`), facing the hero, breathing a
  fireball at them. His touch never hurts: a landing bounces off sideways, a side touch pushes
  the hero out, never into a wall.
- [x] Round 1 (bow): the toy block hangs over the middle; an arrow or a ray at the target (the
  level's `1`) drops it; on him, a hit; on the floor, a new block after `BLOCK_RELOAD`.
- [x] Round 2 (fart): a landing on him with the fart on is a hit; without, a bounce.
- [x] Round 3 (big head): touching him with a big head is a hit (the crown).
- [x] Round 4 (chicken ray): he calls two zombie dinos (never on the hero); a ray at him with
  none standing is the last hit; with any standing he bats it away.
- [x] After a hit he staggers for `TREX_HURT_FRAMES`; beaten, his fireballs and zombies go,
  the cage opens.
- [x] Tests: each rule; every round's tool, and only it, hurts him; slower and kinder on Super
  Easy than Hard.

### Task 3: How he looks

**Files:** `src/data/sprites.ts` (crown, toy block, soldier), `src/gfx/textures.ts`
(`VILLAIN_TEXTURES.tRex`, profile), create `src/gfx/tRex.ts`; modify `src/scenes/SliceScene.ts`.

- [x] His four poses (walk, roar, idle); the crown on his head until it is smashed; the block
  on its rope to the target; a bubble with the needed tool over him; flashing while hurt;
  beaten, he shrinks into a tiny toy.

### Task 4: The three levels

**Files:** create `src/data/levels2/mangulossi.ts`, `saalid.ts`, `troonisaal.ts`,
`tests/toyCastle.test.ts`; modify `src/data/stages.ts`, `src/config/i18n.ts`, `tests/i18n.test.ts`,
`tests/stages.test.ts` (the run now ends on the Throne Room).

- [x] Mängulossi (`level_6`), Lossisaalid (`level_6_2`), Troonisaal (`level_6_3`).
- [x] Theme 5's list: `[MANGULOSSI, SAALID, TROONISAAL]`; finishing Troonisaal wins the game.
- [x] Tests: order and endings; gaps; stations after the last flag; drawbridge and gates;
  each level runs through on every difficulty.

### Task 5: Play it in the browser, Super Easy and Hard

As before, to the game's end; `next/PLAYTEST.md` gets a Toy Castle section; record what was
found at the end of this plan.

---

## What the browser found (Task 5, 2026-11-23)

Each level played to its end on Super Easy and Hard with real physics, the fight to the rescue
on both (about 39 seconds of fighting on Super Easy, where the bot is slow with the last
round's rays, and 22 on Hard; no lives lost), and on to the Win screen. Found and fixed:

- **A spring under an overhang.** Springing up to the Castle Halls' gallery, the hero hit its
  underside before rising past its edge, on Hard every time, and was left under it against a
  wall. The gallery is a solid wall now, as Tornid's town wall is, and the spring takes you
  up its face.
- **A station a jump carried you past.** Jumping off the gallery came down past the fart
  station; it stands at the fart wall's foot now.
- **No room by the block's target.** It stood a tile from the throne room's door, too close to
  stand between them, so it could only be shot facing back towards the door. It stands a tile
  further in now (tested).

Not changed: a hero who jumps onto the dais can sail over the sibling; walking back into them
is the rescue, as on every level.
