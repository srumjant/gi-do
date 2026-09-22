# Phaser Migration, Plan 7: Arcade Physics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put the player and the ground-patrol enemies on real Arcade bodies, as the spec
always specified, and replace the frame-exact safety net with one that can survive it.

**Architecture:** Arcade owns position, velocity and tile collision for bodied entities.
Everything else — feel, pickups, scoring, power-ups — stays pure TypeScript operating on
state Arcade has already resolved.

**Tech Stack:** Phaser 4 Arcade Physics, TypeScript, Vitest.

---

## The decision this plan implements

The owner has chosen a **full switch, with the golden traces retired.** This is a deliberate
break with the bug-compatibility contract, made with the cost understood. Recording it
plainly because the rest of this document depends on it:

- **The port stops being frame-identical to `index.html`.** Arcade's separation differs from
  the hand-rolled X-then-Y sweep in detail — the `+1` snap, the 2px and 3px probe insets —
  so exact comparison stops being possible, not merely inconvenient.
- **The children become the judge of feel.** There is no longer a test that can tell us the
  jump is wrong. That is the real cost, and no amount of new testing fully replaces it.
- **This is the "re-tune deliberately" phase**, arriving earlier than planned. Bug-compatible
  was always "for now".

## What it actually costs, measured

| | Tests |
|---|---|
| `trace.test.ts` — all frame-exact comparison | **~14, retired** |
| Live drives inside `enemy` / `player` / `world.test.ts` | **~11, converted** |
| Data, audio, i18n, sprites, tiles, parallax — 13 files | **~74, untouched** |
| Everything else in the suite | **untouched** |

Of 354 passing tests, roughly **25 are affected and ~329 are not.** The simulation's pure
layers — pickups, score, block bumps, power-ups, the cat, arrows — do not care who moved the
player, only where it ended up.

## What Arcade actually replaces

Measured in `stepPlayer`: gravity, the X sweep, the Y sweep and the left clamp. **About 60
lines.** Everything else stays hand-written because Arcade has no equivalent:

- acceleration and air control
- coyote time and the jump buffer
- variable jump height
- the apex hang (0.6 gravity rising, 1.2 falling) — **Arcade's own gravity cannot express
  this**, so body gravity stays off and `vy` is integrated by hand, or the hang is lost
- the fart jump multiplier, shooting, block bumps, the pit-and-cape branch

Anyone expecting this plan to delete a lot of code should recalibrate now. The win is
architectural and forward-looking — slopes, moving platforms, one-way platforms, whatever
the children invent next — not a reduction in what exists.

## The replacement safety net

Frame-exact comparison dies. Three things take its place, in descending order of value:

1. **The children playing it.** Always the real gate; now the only one for feel.
2. **Behavioural invariants, with tolerance.** Not "x is 81.6 on frame 40" but "the player
   clears the gap at column 20", "a jump is still possible 6 frames after leaving a ledge",
   "the player never ends a frame inside a solid tile". These are properties the original
   also satisfied, expressed so that an approximate engine can pass them.
3. **`liveGame.ts` stays.** The harness that drives the original keeps working and keeps its
   value as a **reference**, not a gate — when something feels wrong, being able to ask the
   original what it did is worth more than the tests it used to power. **Do not delete it.**

## What stays pure

`src/game/` loses its no-Phaser rule **only where Arcade takes over**. This is a scalpel, not
a demolition:

- **Arcade-owned:** player and ground-enemy position, velocity, and tile collision.
- **Still pure, still tested, still no Phaser import:** pickups and stars, score, block
  bumps, the three power-ups, the cat, arrows, the chicken conversion, navigation, level
  building, difficulty records, i18n, audio.

The sequence each frame becomes: Arcade steps bodies → sync bodies into `World` state → run
the pure logic against the resolved state. Keep that order explicit; it is what preserves the
~329 tests.

---

## Task 1: The map as a tilemap

**Files:** `next/src/scenes/SliceScene.ts`, `next/src/physics/` (new)

The map is a 2D number array with `getTile`/`isSolid` (`isSolid` is `t===1||t===2||t===3||t===5`).
Arcade needs real collision geometry.

Build a Phaser tilemap layer from the existing array and set collision on the solid indices.
The array stays the source of truth — block bumps mutate it (tile 3 or 5 → 2), and Plan 5's
rendering already repaints bumped cells, so **the collision layer must be updated on a bump
too** or a spent block will keep its old collision.

Both tile 2 and tile 3 are solid, so a `?` block becoming a brick does not change
collision — but a future block type might. Make the update explicit rather than relying on
that coincidence.

**Test:** an invariant test that every index `isSolid` accepts is a colliding index in the
layer, and no other is. One assertion over the set, not per-tile.

---

## Task 2: The player on an Arcade body

**Files:** `next/src/game/player.ts`, `next/src/physics/`, `SliceScene.ts`

The body owns `x`, `y`, `vx`, `vy` and tile separation. Everything listed under "What Arcade
actually replaces" stays hand-written on top of it.

Four things to decide explicitly and write down:

- **Body gravity off.** The apex hang needs a per-frame multiplier Arcade cannot express.
  Integrate `vy` by hand into `body.velocity`, or accept losing the hang — and if you accept
  it, say so loudly, because it is a feel change the children will notice on every jump.
- **Body size is per character.** Gigi is 24 tall, Dodo 20, and the live hitbox is inset from
  the sprite. Set the body size and offset from the existing per-character values.
- **`onGround` comes from `body.blocked.down` / `touching.down`** — pick one and know why.
  Coyote time and the jump buffer both read it, so getting it wrong breaks the feel features
  that survive.
- **The pit check stays hand-written.** It is a `y` threshold with a cape branch, not a
  collision.

**Known behaviour that will change.** Say so in the commit rather than letting it be
discovered: holding right against a wall currently oscillates on a 2-frame cycle, because the
hand-rolled snap leaves a 1px gap. Arcade will not reproduce that. It is a defect and losing
it is an improvement, but it is a change.

**Test:** behavioural, per the safety-net section. At minimum: the player stands on ground
without sinking or jittering; a jump clears a known gap; coyote time still allows a late
jump; the player never ends a frame inside a solid tile.

---

## Task 3: Ground-patrol enemies on bodies

**Files:** `next/src/game/enemy.ts`, `next/src/physics/`

Per the spec: **doll, car, dino, penguin and chicken** get bodies. Their behaviour is
patrol-with-turn — reverse at a wall, and reverse at a ledge by probing for floor ahead.

The ledge probe has no Arcade equivalent and stays hand-written. Read the existing
implementation before replacing anything: it reverses on `isSolid` ahead at mid-height, and
separately when the tile ahead-and-below is empty while the tile below-centre is solid.

**Explicitly NOT bodied**, and this is deliberate rather than an oversight to fix later:

- **bats and ghosts** — `y` is written from a sine each frame, `noGravity` is true
- **the boss** — no `y` integration, `x` clamped to a window
- **all projectiles** — arrows are pure horizontal `vx`; fireballs have a constant `vy` that
  never accelerates

Handing projectiles to Arcade with world gravity on would make them drop. Leave them manual.

**Test:** an enemy patrols a platform and turns at both ends without falling off, and a
converted chicken — which becomes a ground patroller mid-flight, with `noGravity` going
false — acquires a body correctly.

---

## Task 4: Retire and convert the tests

**Files:** `next/tests/trace.test.ts`, `enemy.test.ts`, `player.test.ts`, `world.test.ts`

Do this **after** Tasks 2 and 3, not before. Until the new physics exists there is nothing to
write the replacement tests against, and deleting the old ones first removes the only
description of what the behaviour was.

- **`trace.test.ts`** — retire. Do not quietly delete it: its scripts encode a great deal of
  hard-won knowledge about level 1's geometry and about what the original does. Preserve that
  as behavioural tests where it still applies, and as comments where it does not.
- **The ~11 live drives elsewhere** — convert to behavioural assertions or to pure-state unit
  tests that no longer need the live game.
- **Leave `liveGame.ts` in place and working.** It is now a reference tool.

Report the final test count and what was lost, honestly. A drop is expected; a drop plus a
claim that nothing was lost is not.

---

## Task 5: Play it

**Files:** none

Run it in a browser and play level 1 end to end. Then hand it to the children, because from
this plan onward they are the safety net.

What to pay attention to, because these are what Arcade changes:

- the weight of the jump, and whether the hang at the top still feels right
- landing — any sink, jitter or bounce
- walking into a wall, and walking off a ledge
- whether stomping still connects where you expect

---

## Done when

- [ ] Player and ground-patrol enemies move on Arcade bodies.
- [ ] Bats, ghosts, the boss and all projectiles are still manual, deliberately.
- [ ] Coyote time, jump buffer, variable jump height and the apex hang all still work, or
      their loss is documented and accepted.
- [ ] Block bumps update collision as well as rendering.
- [ ] The behavioural invariants pass.
- [ ] `liveGame.ts` still works as a reference.
- [ ] The pure layers still import no Phaser, and their tests still pass.
- [ ] The children have played it.
- [ ] `index.html` untouched.

## What this plan does not do

It does not revisit the scenes and HUD (Plan 6, started and paused for this), the remaining
enemies, learn mode, input unification, the felt shader, or cutover. Plan 6's Task 1 was in
flight when this was chosen and was reverted uncommitted; its brief is still valid.
