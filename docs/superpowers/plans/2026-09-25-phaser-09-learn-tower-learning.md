# Learn Tower, Part 2a: The Learning Around the Climb — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the learn tower does to teach, on top of the climb Plan 8 built: the
voice saying what to find, a low tone and a dull buzz for a wrong letter, a light buzz, a pop,
sparkles and a flying star for a right one, a hint that moves as well as glows, the word on
the HUD in words mode, and a result screen after the star. First, the final review's deferred
cleanups.

**Architecture:** The climb stays pure (`next/src/game/learn/`, no Phaser) and raises every
cue as a value, as it already does for sounds and events: `Climb.rumbles` for buzzes, and
`Climb.speech` for lines to say, with the rules for when to speak in a new
`game/learn/speech.ts`. The scenes play them: `audio/voice.ts` wraps the browser's speech
synthesis; `LearnTowerScene` draws the effects with Phaser's tweens, particle emitters and
Glow filter; `LearnHudScene` shows the word and flies each star home; a new
`LearnResultScene` ends the tower. A `LearnSession { mode, used, score }` carries the round
and the score from the learn menu through every tower and result screen.

**Tech Stack:** Phaser 4.2.1, TypeScript 7 (strict, `noUnusedLocals`), Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-23-learn-tower-design.md`, build-order step 4 (the
learning around the climb). Plan 8 (`docs/superpowers/plans/2026-09-23-phaser-08-learn-tower-climb.md`,
merged as PR #20) built steps 1-3. **Plan 10** does steps 5 and 6: the castle look, the
trapdoor's swing, the opt-in real-Arcade check, and `PLAYTEST.md`.

---

## Ground rules for this repo

- Work in the worktree `/Users/sergei/Work/gi-do/.claude/worktrees/phaser2`, branch
  `worktree-phaser2`. Run every command from `next/`: `cd next` once, then
  `npx vitest run ...`, `npm test`, `npm run build`.
- `npm run build` runs `tsc --noEmit` first. `noUnusedLocals` is on, so an unused import
  fails the build. Vitest does not type-check; the build does. Run both before every commit.
- **Nothing under `src/game/` may import a Phaser value.** Phaser reads `navigator` and
  `window` as its module loads, so `import Phaser from 'phaser'` throws under Vitest.
  `tests/world.test.ts` checks this. Type imports (`import type ...`) are erased and fine.
- Commits: conventional prefix, lowercase, a subject that says what changed for the game,
  and a body. **No `Co-Authored-By` lines** (the owner's rule). Never amend; add a commit.
  Never force-push. Never use a bare `git stash`: the stash is shared with other worktrees.
- The owner's direction for the port: use Phaser's own features for engine work, and write
  our own code only for a stated reason.
- Every change below is given as exact text. "Replace A with B" means A occurs exactly once
  in that file at that point in the plan (unless the step says how many times), so if it is
  not found, stop: your file differs from the one this was checked against.

## This plan was dry-run before hand-off

Every task was applied in order to an export of `1993dc3` (Plan 8, as merged), by scripts
from which this document's code blocks are generated, so the code below is exactly what ran.
For each task the new tests failed first, with the failures quoted in its Step 2, and then
passed. The suite went 583 → 584 → 585 → 590 → 604 → 616 → 616 → 616 → 616 tests, `tsc` was
clean after every task, and `vite build` was clean at the end.

The finished tower was then played in Chrome, stepped by hand, with speech and the gamepad
stubbed to record what they were asked. Task 9 lists what was seen; in short, everything
below behaved as described. If a step fails for you, the likeliest cause is a difference
between your checkout and `1993dc3`, not the plan's code.

## What was checked in Phaser's source before writing this

These facts shape the code below; do not re-derive them, but do not contradict them either.

- **Particles.** `this.add.particles(x, y, texture, config)` returns a `ParticleEmitter`.
  With `emitting: false` it waits, and `explode(count, x, y)` bursts `count` particles at
  `x, y`. With the emitter at `(0, 0)` that point is in world px. In the config, an array
  (`tint: [a, b, c]`) picks one value per particle, `{ min, max }` a random value per
  particle, and `{ start, end }` runs over the particle's life. `scale` sets `scaleX` and
  `scaleY` separately, so a random `scale` gives oblongs, which suits brick chunks.
  `advance: ms` fast-forwards the emitter when it is made. The default tint mode multiplies,
  so one white texture takes any colour.
- **Filters.** Every Game Object has `enableFilters()` (`GameObject` mixes in `Filters`).
  Under the canvas renderer it does nothing and `filters` stays `null`, so the code must
  treat the Glow as optional. `filters.internal.addGlow(color, outerStrength,
  innerStrength, scale, knockout, quality, distance)` returns a `Phaser.Filters.Glow` whose
  `outerStrength` a tween can drive. `setPaddingOverride(null)` pads the framebuffer by the
  glow's reach; without it the glow is cut off at the object's edges.
- **Tweens read `Date.now()`.** `TweenManager.getDelta` measures its own time, not the
  scene's step. That matters only for Task 9's browser check, which drives the game by hand.
- **`pixelArt: true` (main.ts) turns on `roundPixels`**, so an image centred on a half pixel
  is still drawn on whole pixels.
- **`Phaser.Scene` already has a `data` property**, its DataManager. A scene must not keep
  its own fields in `this.data`.
- **Speech.** `speechSynthesis.getVoices()` is empty until the browser fills the list, then
  `voiceschanged` fires. `speak()` queues an utterance behind whatever is being said;
  `cancel()` empties the queue and stops the current one.

## Decisions this plan takes

- **The hint moves as well as shines** (the owner's call). After two misses the right block
  gets Phaser's Glow filter, breathing, and pulses in size. The white wash it had in Plan 8
  was 1.24:1 on the gold, too faint for a child to find.
- **The camera pans on the right answer**, not when the hero reaches the next storey. The
  final review measured the hero rising up to 37px behind the HUD band for a quarter of a
  second otherwise. Every counted bump carries the hero up (the spring tests in
  `tests/learnJumps.test.ts`), and the rare re-arm pans back.
- **The voice's cheers come in a fixed order**, one per gate: Tubli!, Väga hea!, Super!,
  Suurepärane!, and Fantastiline! at the star, so each tower ends on its biggest. They are
  Estonian like everything the voice says. The result screen's cheer is a UI string, in the
  UI language, and is picked at random once, as the spec says.
- **Syllables are spoken in lower case** ("ma", not "MA"), so a voice says them as a
  syllable instead of spelling two capitals. Letters stay capitals, which a voice names.
- **Where the shared values live**, as the final review placed them: `PLAYER_POSES` in
  `gfx/textures.ts`, `PLAYER_DRAW_INSET` beside `playerSize` in `game/player.ts`,
  `MAX_STEPS_PER_FRAME` in `config/constants.ts`, and the mover contract (`MoveReport`,
  `BodyMover`) in `game/player.ts`.
- **The real-Arcade differential is an opt-in script** (the owner's call), not part of
  `npm test`. It comes in Plan 10.

## Not in this plan

- **The castle** (spec step 5): the back wall, windows, torches, banners, the sky's day to
  night gradient, and the roof's night sky, battlements and flag; the trapdoor's swing; the
  banners' sway and the torches' flames. Plan 10.
- **Playtest notes** (spec step 6): `next/PLAYTEST.md`. Plan 10.
- **The opt-in real-Arcade check.** Plan 10.
- **The menus' starfield and bob running on different clocks** (the final review's item 6).
  It touches three scenes that are not the tower's; a separate cleanup.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `next/src/config/constants.ts` | Modify: `MAX_STEPS_PER_FRAME` | 1 |
| `next/src/game/frameClock.ts` | Modify: its ceiling is `MAX_STEPS_PER_FRAME` | 1 |
| `next/src/game/player.ts` | Modify: `PLAYER_DRAW_INSET`; the mover contract, `MoveReport` and `BodyMover` | 1, 2 |
| `next/src/physics/player.ts` | Modify: imports the mover contract; the top-edge note moves to `edges` | 1, 2 |
| `next/src/gfx/textures.ts` | Modify: `PLAYER_POSES` exported; the learn stars' own textures | 1, 2 |
| `next/src/gfx/learnTiles.ts` | Modify: `LEARN_TILES_TEXTURE`; block widths, height and brick read from their homes; the spark | 1, 2, 6 |
| `next/src/game/learn/tower.ts` | Modify: `LEARN_HUD_H` | 1 |
| `next/src/game/learn/content.ts` | Modify: `LEARN_MODES` | 2 |
| `next/src/game/learn/gate.ts` | Modify: `feetAbove`; `answerIndex` everywhere; the buzzes; the right and wrong lines | 2, 3, 5 |
| `next/src/game/learn/climb.ts` | Modify: `feetAbove` for the storey; buzzes; the voice | 2, 3, 5 |
| `next/src/game/learn/types.ts` | Modify: `ClimbMove`; `Climb.rumbles`, `Climb.speech` and the voice's clock; `LearnSession` | 2, 3, 5, 8 |
| `next/src/game/learn/speech.ts` | Create: what the voice says, and when | 5 |
| `next/src/game/types.ts` | Modify: the `wrong` cue and `EffectCue` | 3 |
| `next/src/audio/sfx.ts` | Modify: `sfxWrong` | 3 |
| `next/src/audio/cues.ts` | Modify: `playEffect` | 3 |
| `next/src/audio/voice.ts` | Create: speech synthesis | 4, 5 |
| `next/src/config/i18n.ts` | Modify: `learn_find_syllable`; `learn_speak`; the result screen's strings | 1, 7, 8 |
| `next/src/main.ts` | Modify: `installVoice()`; the result scene | 4, 8 |
| `next/src/scenes/SliceScene.ts` | Modify: the shared values | 1 |
| `next/src/scenes/LearnTowerScene.ts` | Modify; whole file in Task 6: the cues played, the effects, the stars sent, the session | 1, 2, 3, 5, 6, 7, 8 |
| `next/src/scenes/LearnHudScene.ts` | Modify; whole file in Task 7: the word, the speaker hint, the flying stars | 1, 2, 7 |
| `next/src/scenes/LearnResultScene.ts` | Create: the result screen | 8 |
| `next/src/scenes/LearnMenuScene.ts` | Modify: starts a `LearnSession` | 8 |
| `next/src/scenes/keys.ts` | Modify: `LEARN_RESULT_SCENE_KEY`, and `learnresult` gets its scene | 8 |
| `next/src/game/navigation.ts` | Modify: a comment | 8 |
| `next/tests/helpers/climbs.ts` | Create: the gate tests' helpers, shared with the voice tests | 5 |
| `next/tests/voice.test.ts`, `next/tests/learnSpeech.test.ts` | Create | 4, 5 |
| `next/tests/learnTower.test.ts`, `learnGate.test.ts`, `i18n.test.ts`, `sfx.test.ts`, `sounds.test.ts`, `navigation.test.ts`, `helpers/towerMove.ts` | Modify | 1, 2, 3, 5, 7, 8 |
| `docs/superpowers/specs/2026-09-23-learn-tower-design.md` | Modify: as built | 9 |

---

### Task 1: One home for each shared value, and two names in line

The final review of Plan 8 found three values copied from `SliceScene` into the tower scene
(the draw inset, the pose list and the five-step ceiling), the learn HUD's height tied to the
room the tower keeps for it only by a comment, and two names out of line with their
neighbours. This task gives each value one home and renames the two. Nothing behaves
differently; a new test ties the HUD's height to `HUD_ROOM`.

**Files:**
- Modify: `next/src/config/constants.ts`
- Modify: `next/src/game/frameClock.ts`
- Modify: `next/src/game/player.ts`
- Modify: `next/src/physics/player.ts`
- Modify: `next/src/gfx/textures.ts`
- Modify: `next/src/scenes/SliceScene.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Modify: `next/src/gfx/learnTiles.ts`
- Modify: `next/src/config/i18n.ts`
- Modify: `next/src/game/learn/tower.ts`
- Modify: `next/src/scenes/LearnHudScene.ts`
- Test: `next/tests/learnTower.test.ts`
- Test: `next/tests/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

In `next/tests/learnTower.test.ts`, replace:

```ts
  BATTLEMENTS, buildTower, GAPS, HUD_ROOM, INSIDE, LEARN_VIEW_H, LEARN_VIEW_W, LETTER_ROOM, MAP_COLS,
```

with:

```ts
  BATTLEMENTS, buildTower, GAPS, HUD_ROOM, INSIDE, LEARN_HUD_H, LEARN_VIEW_H, LEARN_VIEW_W, LEARN_ZOOM,
  LETTER_ROOM, MAP_COLS,
```

Then, in the same file, replace:

```ts
  it('stands the star on the roof, in view below the HUD', () => {
```

with:

```ts
  it('keeps the whole HUD band clear above every view', () => {
    expect(HUD_ROOM * LEARN_ZOOM).toBeGreaterThanOrEqual(LEARN_HUD_H);
  });

  it('stands the star on the roof, in view below the HUD', () => {
```

In `next/tests/i18n.test.ts`, replace `'learn_find_syll',` with `'learn_find_syllable',`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/learnTower.test.ts tests/i18n.test.ts`

Expected: FAIL. Three tests: `keeps the whole HUD band clear above every view`
(`TypeError: expected value must be number or bigint, received "undefined"`, since
`LEARN_HUD_H` does not exist yet), and the two i18n parity tests, `has the same keys, bar the
port-only ones` and `has every port-only key it claims to have`, which now expect
`learn_find_syllable`.

- [ ] **Step 3: Implement**

The draw inset's doc moves from `SliceScene` to `game/player.ts`, next to `playerSize`,
whose `- 4` is the same 2px on each side. The frame clock's ceiling becomes the shared one;
its test still sees 5 frames at most per call.

In `next/src/config/constants.ts`, replace:

```ts
export const STEP_MS = 1000 / STEP_HZ;
```

with:

```ts
export const STEP_MS = 1000 / STEP_HZ;

/**
 * The most fixed steps one rendered frame may run. A frame that arrives late, above all the
 * first one after a backgrounded tab comes back, catches up this far and drops the rest,
 * rather than running a burst of steps at once.
 */
export const MAX_STEPS_PER_FRAME = 5;
```

In `next/src/game/frameClock.ts`, replace `import { STEP_HZ } from '../config/constants';` with `import { MAX_STEPS_PER_FRAME, STEP_HZ } from '../config/constants';`.

Then, in the same file, replace:

```ts
 * The ceiling on how many frames one call can advance, and the same one SliceScene's
 * accumulator uses, for a reason that matters more here:
```

with:

```ts
 * The ceiling on how many frames one call can advance: the scenes' fixed-step loops use the
 * same one, and it matters more here:
```

Then, in the same file, replace `const MAX_FRAMES_PER_CALL = 5;` with `const MAX_FRAMES_PER_CALL = MAX_STEPS_PER_FRAME;`.

In `next/src/game/player.ts`, replace:

```ts
/**
 * The hitbox of a character:
```

with:

```ts
/**
 * The sprite draws 2px larger than the hitbox on every side (index.html:1848:
 * `drawSprite(spr,p.x-2,p.y-2,ps.palette,2,p.facing<0)`): half of the 4 playerSize below
 * takes off each dimension. Not cosmetic — get this wrong and the art sits 2px off the hitbox,
 * which reads as a collision bug. Every scene that draws a player uses it.
 */
export const PLAYER_DRAW_INSET = 2;

/**
 * The hitbox of a character:
```

In `next/src/physics/player.ts`, replace:

```ts
 * with no offset: the sprite's 2px margin is SliceScene's PLAYER_DRAW_INSET, where the
 * drawing is, and does not belong here.
```

with:

```ts
 * with no offset: the sprite's 2px margin is game/player.ts's PLAYER_DRAW_INSET, which the
 * scenes apply where they draw, and does not belong here.
```

In `next/src/gfx/textures.ts`, replace:

```ts
const POSES = ['stand', 'run', 'jump'] as const;
export type Pose = typeof POSES[number];
```

with:

```ts
/** `player.frame`: 0 stand, 1 run, 2 jump (game/types.ts, index.html:1424-1429). */
export const PLAYER_POSES = ['stand', 'run', 'jump'] as const;
export type Pose = typeof PLAYER_POSES[number];
```

Then, in the same file, replace:

```ts
      for (const pose of POSES) {
```

with:

```ts
      for (const pose of PLAYER_POSES) {
```

In `next/src/scenes/SliceScene.ts`, replace:

```ts
import { BASE_H, BASE_W, STEP_MS, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
```

with:

```ts
import { BASE_H, BASE_W, MAX_STEPS_PER_FRAME, STEP_MS, VIEW_H, VIEW_W, ZOOM } from '../config/constants';
```

Then, in the same file, replace `import type { Character, PlayerMove } from '../game/player';` with `import { type Character, PLAYER_DRAW_INSET, type PlayerMove } from '../game/player';`.

Then, in the same file, replace:

```ts
  PLAYER_SCALE,
  playerTextureKey,
```

with:

```ts
  PLAYER_POSES,
  PLAYER_SCALE,
  playerTextureKey,
```

Then, in the same file, delete:

```ts
/**
 * The sprite draws 2px larger than the hitbox on every side (index.html:1848:
 * `drawSprite(spr,p.x-2,p.y-2,ps.palette,2,p.facing<0)`, because the hitbox itself is
 * inset from the sprite by `w = spriteW - 4`, `h = spriteH - 4`, player.ts:35-36). Not
 * cosmetic — get this wrong and the art sits 2px off the hitbox, which reads as a
 * collision bug.
 */
const PLAYER_DRAW_INSET = 2;

/** `player.frame`: 0 stand, 1 run, 2 jump (types.ts, index.html:1424-1429). */
const PLAYER_POSES = ['stand', 'run', 'jump'] as const;

```

Then, in the same file, replace `this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);` with `this.accumulator = Math.min(this.accumulator + delta, STEP_MS * MAX_STEPS_PER_FRAME);`.

In `next/src/scenes/LearnTowerScene.ts`, replace `import { STEP_MS, TILE } from '../config/constants';` with `import { MAX_STEPS_PER_FRAME, STEP_MS, TILE } from '../config/constants';`.

Then, in the same file, replace `import type { Character } from '../game/player';` with `import { type Character, PLAYER_DRAW_INSET } from '../game/player';`.

Then, in the same file, replace:

```ts
import { blockTextureKey, LEARN_TILES_KEY, registerLearnTiles, toPhaserData } from '../gfx/learnTiles';
import { playerTextureKey, registerTextures, STAR_TEXTURE } from '../gfx/textures';
```

with:

```ts
import { blockTextureKey, LEARN_TILES_TEXTURE, registerLearnTiles, toPhaserData } from '../gfx/learnTiles';
import { PLAYER_POSES, playerTextureKey, registerTextures, STAR_TEXTURE } from '../gfx/textures';
```

Then, in the same file, delete:

```ts
/** The sprite draws 2px larger than the hitbox on every side, as in SliceScene. */
const PLAYER_DRAW_INSET = 2;
const POSES = ['stand', 'run', 'jump'] as const;
```

Then, in the same file, replace:

```ts
    // The same fixed step as SliceScene: never more than five steps' worth of time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
```

with:

```ts
    // The same fixed step as SliceScene, with the same ceiling on the time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * MAX_STEPS_PER_FRAME);
```

Then, in the same file, replace `tilemap.addTilesetImage(LEARN_TILES_KEY, LEARN_TILES_KEY, TILE, TILE, 0, 0);` with `tilemap.addTilesetImage(LEARN_TILES_TEXTURE, LEARN_TILES_TEXTURE, TILE, TILE, 0, 0);`.

Then, in the same file, replace `POSES[this.climb.player.frame]` with `PLAYER_POSES[this.climb.player.frame]`.

In `next/src/gfx/learnTiles.ts`, replace all 2 of `LEARN_TILES_KEY` with `LEARN_TILES_TEXTURE`.

In `next/src/config/i18n.ts`, replace:

```ts
  learn_find_syll:    {et:'LEIA SILP:',               en:'FIND THE SYLLABLE:'},
```

with:

```ts
  learn_find_syllable: {et:'LEIA SILP:',              en:'FIND THE SYLLABLE:'},
```

In `next/src/game/learn/tower.ts`, replace:

```ts
/** World px the 48px HUD covers at this zoom (48 / 1.25 = 38.4), rounded up. */
export const HUD_ROOM = 40;
```

with:

```ts
/** The learn HUD's band across the top of the screen, in screen px (LearnHudScene). */
export const LEARN_HUD_H = 48;
/**
 * The world px a view keeps clear above a storey's ceiling, so the ceiling shows below the
 * HUD rather than under it: the band covers LEARN_HUD_H / LEARN_ZOOM = 38.4 of them, and this
 * keeps a little more.
 */
export const HUD_ROOM = 40;
```

In `next/src/scenes/LearnHudScene.ts`, replace:

```ts
import type { Climb } from '../game/learn/types';
```

with:

```ts
import { LEARN_HUD_H } from '../game/learn/tower';
import type { Climb } from '../game/learn/types';
```

Then, in the same file, delete:

```ts
/** The band across the top. The tower keeps storeys out from under it (tower.ts's HUD_ROOM). */
const HUD_H = 48;
```

Then, in the same file, replace:

```ts
  syllables: 'learn_find_syll',
```

with:

```ts
  syllables: 'learn_find_syllable',
```

Then, in the same file, replace `fillRect(0, 0, BASE_W, HUD_H);` with `fillRect(0, 0, BASE_W, LEARN_HUD_H);`.

Then check nothing still uses an old name: `grep -rn "LEARN_TILES_KEY\|learn_find_syll'\|STEP_MS \* 5" src tests`
prints nothing.

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  584 passed (584)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/learnTower.test.ts \
  tests/i18n.test.ts \
  src/config/constants.ts \
  src/game/frameClock.ts \
  src/game/player.ts \
  src/physics/player.ts \
  src/gfx/textures.ts \
  src/scenes/SliceScene.ts \
  src/scenes/LearnTowerScene.ts \
  src/gfx/learnTiles.ts \
  src/config/i18n.ts \
  src/game/learn/tower.ts \
  src/scenes/LearnHudScene.ts
git commit -m "refactor: one home each for the player's poses, draw inset and step ceiling" -m "PLAYER_POSES is exported from gfx/textures.ts, PLAYER_DRAW_INSET sits beside playerSize in game/player.ts, and MAX_STEPS_PER_FRAME in config/constants.ts serves SliceScene, the learn tower and the frame clock. The learn HUD's height is LEARN_HUD_H in tower.ts, and a test pins that HUD_ROOM covers it at the tower's zoom. LEARN_TILES_KEY becomes LEARN_TILES_TEXTURE and learn_find_syll becomes learn_find_syllable, in line with their neighbours. Nothing behaves differently."
```

---

### Task 2: The stars at whole scales, the mover contract in one place, and the review's small fixes

The rest of the final review's deferred list, all small:
- The roof's star and the HUD's stars are the world's 1.5-scale star enlarged 3 and 2 times,
  which blurs its half-pixel edges. They get textures of their own, baked at 4 and 3, as
  `gfx/textures.ts` says scale belongs to the draw site.
- `ClimbMove` repeated the shape of `physics/player.ts`'s `MoveReport`. The contract is
  declared once, in `game/player.ts` beside `PlayerMove`, and both sides use it.
- The trapdoor shuts at `feet < top` while the storey count moves at `feet <= top`, on the
  same row. `feetAbove` is now the one test for both, so they happen on the same step.
- The tileset copies three values from elsewhere: the block widths, the block height and
  the brick colour. It reads them from their homes.
- `rearmIfStranded`'s doc says a counted bump leaves the head "well inside the opening";
  the exact claim is the body is at least 3px inside its edges. `closeTrapdoors` finds the
  right block with `b.correct` where the other three places use `answerIndex`.
- The tower scene's loose numbers get names.

**Files:**
- Modify: `next/src/gfx/textures.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Modify: `next/src/scenes/LearnHudScene.ts`
- Modify: `next/src/game/player.ts`
- Modify: `next/src/physics/player.ts`
- Modify: `next/src/game/learn/types.ts`
- Modify: `next/src/game/learn/gate.ts`
- Modify: `next/src/game/learn/content.ts`
- Modify: `next/src/gfx/learnTiles.ts`
- Modify: `next/src/game/learn/climb.ts`
- Test: `next/tests/learnGate.test.ts`
- Test: `next/tests/helpers/towerMove.ts`

- [ ] **Step 1: Write the failing tests**

In `next/tests/learnGate.test.ts`, replace `import { blockCells, headBump, trapdoorCells } from '../src/game/learn/gate';` with `import { blockCells, feetAbove, headBump, trapdoorCells } from '../src/game/learn/gate';`.

Then, in the same file, replace:

```ts
  it('turns the whole letter ceiling to brick when it shuts', () => {
```

with:

```ts
  it('counts the hero through a ceiling only once the feet are above its top', () => {
    const c = climb();
    const top = c.layout.storeys[0].ceilingRows[0];
    // The one boundary both the trapdoor and the storey count go by: this row is the next floor.
    expect(c.layout.storeys[1].floorRow).toBe(top);
    c.player.y = top * TILE - c.player.h;
    expect(feetAbove(c.player, top)).toBe(false);
    c.player.y -= 0.5;
    expect(feetAbove(c.player, top)).toBe(true);
  });

  it('turns the whole letter ceiling to brick when it shuts', () => {
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/learnGate.test.ts`

Expected: FAIL. `counts the hero through a ceiling only once the feet are above its top`:
`TypeError: feetAbove is not a function`.

- [ ] **Step 3: Implement**

`LEARN_MODES` is new in `content.ts` because the tileset needs every mode's block width.
`learnTiles.ts` now imports Phaser as a value, for `Phaser.Display.Color.HexStringToColor`,
the helper the adventure's tiles already use for the same brick.

In `next/src/gfx/textures.ts`, replace:

```ts
export const FIREBALL_TEXTURE = 'fireball';
```

with:

```ts
export const FIREBALL_TEXTURE = 'fireball';
/**
 * The learn tower's star on its roof, and the HUD's star for each gate: STAR_S again, at whole
 * scales of their own, since scale belongs to the draw site. 4 on the roof (28px, inside the
 * two-tile star box) and 3 in the HUD (21px). Enlarging the world's 1.5 bake would blur them.
 */
export const LEARN_STAR_TEXTURE = 'learn-star';
export const LEARN_HUD_STAR_TEXTURE = 'learn-hud-star';
```

Then, in the same file, replace:

```ts
 * the star, the cat and its claw mark, the two kinds of projectile, and the cape.
```

with:

```ts
 * the star, the cat and its claw mark, the two kinds of projectile, and the cape; and the
 * learn tower's two stars.
```

Then, in the same file, replace:

```ts
  [FIREBALL_TEXTURE, FIREBALL_S, FIREBALL_P, 2],
```

with:

```ts
  [FIREBALL_TEXTURE, FIREBALL_S, FIREBALL_P, 2],
  [LEARN_STAR_TEXTURE, STAR_S, STAR_P, 4],
  [LEARN_HUD_STAR_TEXTURE, STAR_S, STAR_P, 3],
```

In `next/src/scenes/LearnTowerScene.ts`, replace:

```ts
import {
  LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
```

with:

```ts
import {
  CEILING, LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
```

Then, in the same file, replace:

```ts
import { PLAYER_POSES, playerTextureKey, registerTextures, STAR_TEXTURE } from '../gfx/textures';
```

with:

```ts
import { LEARN_STAR_TEXTURE, PLAYER_POSES, playerTextureKey, registerTextures } from '../gfx/textures';
```

Then, in the same file, replace:

```ts
/** How white the right block's hint glow gets at its brightest. */
const GLOW_ALPHA = 0.55;
```

with:

```ts
/** How white the right block's hint glow gets at its brightest. */
const GLOW_ALPHA = 0.55;
/** The star floats up and down this far, this slowly. */
const STAR_BOB_PX = 4;
const STAR_BOB_MS = 800;
/** A wrong block shakes sideways this far, this fast, this many times. */
const SHAKE_PX = 3;
const SHAKE_MS = 40;
const SHAKE_REPEATS = 3;
```

Then, in the same file, replace:

```ts
const glow = this.add.rectangle(0, 0, b.width * TILE, 2 * TILE, 0xffffff).setOrigin(0, 0).setAlpha(0);
```

with:

```ts
const glow = this.add.rectangle(0, 0, b.width * TILE, CEILING * TILE, 0xffffff).setOrigin(0, 0).setAlpha(0);
```

Then, in the same file, replace:

```ts
    const star = this.add
      .image(box.x + box.w / 2, box.y + box.h / 2, STAR_TEXTURE)
      .setScale(3)
      .setDepth(DEPTH_STAR);
    this.tweens.add({ targets: star, y: star.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
```

with:

```ts
    const star = this.add.image(box.x + box.w / 2, box.y + box.h / 2, LEARN_STAR_TEXTURE).setDepth(DEPTH_STAR);
    this.tweens.add({
      targets: star, y: star.y - STAR_BOB_PX, duration: STAR_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
```

Then, in the same file, replace:

```ts
    this.tweens.add({ targets: box, x: restX + 3, duration: 40, yoyo: true, repeat: 3, onComplete: () => box.setX(restX) });
```

with:

```ts
    this.tweens.add({
      targets: box, x: restX + SHAKE_PX, duration: SHAKE_MS, yoyo: true, repeat: SHAKE_REPEATS,
      onComplete: () => box.setX(restX),
    });
```

In `next/src/scenes/LearnHudScene.ts`, replace `import { registerTextures, STAR_TEXTURE } from '../gfx/textures';` with `import { LEARN_HUD_STAR_TEXTURE, registerTextures } from '../gfx/textures';`.

Then, in the same file, replace:

```ts
const STAR_X = 12;
const STAR_Y = 12;
const STAR_STEP = 26;
const STAR_SCALE = 2;
```

with:

```ts
/** Where the prompt's and the target's baselines sit in the band. */
const PROMPT_BOTTOM = 16;
const TARGET_BOTTOM = 44;
const STAR_X = 12;
const STAR_Y = 12;
const STAR_STEP = 26;
```

Then, in the same file, replace:

```ts
    this.add.text(BASE_W / 2, 16, TStr(PROMPT[this.climb.layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    this.target = this.add.text(BASE_W / 2, 44, '', TARGET_FONT).setOrigin(0.5, 1);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, STAR_TEXTURE)
      .setOrigin(0, 0)
      .setScale(STAR_SCALE));
```

with:

```ts
    this.add.text(BASE_W / 2, PROMPT_BOTTOM, TStr(PROMPT[this.climb.layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    this.target = this.add.text(BASE_W / 2, TARGET_BOTTOM, '', TARGET_FONT).setOrigin(0.5, 1);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, LEARN_HUD_STAR_TEXTURE)
      .setOrigin(0, 0));
```

In `next/src/game/player.ts`, replace:

```ts
export type PlayerMove = (world: World) => void;
```

with:

```ts
export type PlayerMove = (world: World) => void;

/** What one step of a body found out that the player state cannot hold. */
export interface MoveReport {
  /**
   * The tile row a rising head was stopped under this step, or null. Which cells of that row
   * it hit is the caller's rule: the adventure's is bumpBlocksAbove's two probe columns, the
   * learn tower's is climb.ts's.
   */
  headHitRow: number | null;
}

/**
 * Moves one player one fixed step and reports what it found. The game's is an Arcade body
 * (physics/player.ts's createBodyMover); the learn tower's tests step tests/helpers/towerMove.ts.
 */
export type BodyMover = (p: PlayerState) => MoveReport;
```

In `next/src/physics/player.ts`, replace:

```ts
import { bumpBlocksAbove, type PlayerMove } from '../game/player';
```

with:

```ts
import { type BodyMover, bumpBlocksAbove, type MoveReport, type PlayerMove } from '../game/player';
```

Then, in the same file, replace:

```ts
  /** World bounds to set; left out, the world's bounds are not touched and not used. */
  edges?: WorldEdges;
```

with:

```ts
  /**
   * World bounds to set; left out, the world's bounds are not touched and not used. A top
   * edge (`up`) stops a rising head as a tile does, and the report then names the row just
   * above the world, which holds no tile; no mover sets one today.
   */
  edges?: WorldEdges;
```

Then, in the same file, delete:

```ts
/** What one step found out that the player state cannot hold. */
export interface MoveReport {
  /**
   * The tile row a rising head was stopped under this step, or null. Which cells of that
   * row it hit is the caller's rule — the adventure's is bumpBlocksAbove's two probe
   * columns (game/player.ts). A top world edge (`edges.up`) stops a head too, and then this
   * names the row just above the world, which holds no tile; no mover has one today.
   */
  headHitRow: number | null;
}

export type BodyMover = (p: PlayerState) => MoveReport;

```

In `next/src/game/learn/types.ts`, replace:

```ts
import type { PlayerState, SoundCue } from '../types';
```

with:

```ts
import type { BodyMover } from '../player';
import type { PlayerState, SoundCue } from '../types';
```

Then, in the same file, replace:

```ts
/**
 * Moves the hero one step and reports the tile row a rising head was stopped under, or
 * null. The scene's is its Arcade body (physics/player.ts's createBodyMover); the tests'
 * is tests/helpers/towerMove.ts. Which cells of that row the head hit is the climb's own
 * rule (climb.ts).
 */
export type ClimbMove = (p: PlayerState) => { headHitRow: number | null };
```

with:

```ts
/**
 * What a climb steps the hero with: game/player.ts's BodyMover, the scene's Arcade body or
 * the tests' towerMove. Which cells of the reported row the head hit is the climb's own rule
 * (climb.ts).
 */
export type ClimbMove = BodyMover;
```

In `next/tests/helpers/towerMove.ts`, replace:

```ts
 * does (physics/player.ts's MoveReport).
```

with:

```ts
 * does (game/player.ts's MoveReport).
```

In `next/src/game/learn/gate.ts`, replace:

```ts
    // The right block's cells are the trapdoor's already.
    const letters = st.blocks.flatMap((b, i) => (b.correct ? [] : blockCells(c.layout, s, i)));
```

with:

```ts
    // The right block's cells are the trapdoor's already.
    const answer = answerIndex(c.layout, s);
    const letters = st.blocks.flatMap((_, i) => (i === answer ? [] : blockCells(c.layout, s, i)));
```

Then, in the same file, replace:

```ts
 * the right block comes back, armed, so bumping it springs them again. Play does not produce
 * this today (a counted bump leaves the head well inside the opening), but nobody may get
 * stuck below a solved gate.
```

with:

```ts
 * the right block comes back, armed, so bumping it springs them again. Play does not produce
 * this today: a counted bump leaves the hero's body at least 3px inside the opening's edges,
 * which one step's drift (3px at most) cannot cross before the head is in the opening. But
 * nobody may get stuck below a solved gate.
```

In `next/src/game/learn/content.ts`, replace:

```ts
/** A random source in [0, 1). Defaults to game/random.ts's seam; tests pass their own. */
```

with:

```ts
/** The three exercises, in the learn menu's order. */
export const LEARN_MODES: readonly LearnMode[] = ['letters', 'syllables', 'words'];

/** A random source in [0, 1). Defaults to game/random.ts's seam; tests pass their own. */
```

In `next/src/gfx/learnTiles.ts`, replace:

```ts
import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { T_BRICK, T_EMPTY, T_LETTER, T_PLANK, T_STONE } from '../game/learn/tower';
```

with:

```ts
import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { LEVELS } from '../data/levels';
import { LEARN_MODES } from '../game/learn/content';
import { blockLayout, CEILING, T_BRICK, T_EMPTY, T_LETTER, T_PLANK, T_STONE } from '../game/learn/tower';
```

Then, in the same file, replace:

```ts
/** The first world's brick (data/levels.ts, Doll Garden): the tower is built of the adventure's own. */
const BRICK = 0xcc8844;
```

with:

```ts
/** The first world's brick (Doll Garden): the tower is built of the adventure's own. */
const LEARN_BRICK = Phaser.Display.Color.HexStringToColor(LEVELS[0].brickColor).color;
/** One picture per block width the tower uses (tower.ts's blockLayout). */
const BLOCK_WIDTHS = [...new Set(LEARN_MODES.map((mode) => blockLayout(mode).width))];
```

Then, in the same file, replace:

```ts
    drawBrick(g, T_BRICK * TILE, 0, BRICK);
```

with:

```ts
    drawBrick(g, T_BRICK * TILE, 0, LEARN_BRICK);
```

Then, in the same file, replace:

```ts
  for (const width of [2, 3]) {
    bake(scene, blockTextureKey(width), width * TILE, 2 * TILE, (g) => drawBlock(g, width));
  }
```

with:

```ts
  for (const width of BLOCK_WIDTHS) {
    bake(scene, blockTextureKey(width), width * TILE, CEILING * TILE, (g) => drawBlock(g, width));
  }
```

Then, in the same file, replace:

```ts
  const h = 2 * TILE;
```

with:

```ts
  const h = CEILING * TILE;
```

In `next/src/game/learn/gate.ts`, replace:

```ts
import { TILE } from '../../config/constants';
```

with:

```ts
import { TILE } from '../../config/constants';
import type { PlayerState } from '../types';
```

Then, in the same file, replace:

```ts
/** Which gate and block a map cell belongs to, or null. */
```

with:

```ts
/**
 * The hero's feet are above the top of map row `row`. A letter ceiling's top row is the next
 * storey's floor, so this one test both shuts a trapdoor and counts the hero into the storey
 * above (climb.ts), on the same step.
 */
export function feetAbove(p: PlayerState, row: number): boolean {
  return p.y + p.h < row * TILE;
}

/** Which gate and block a map cell belongs to, or null. */
```

Then, in the same file, replace:

```ts
  const feet = c.player.y + c.player.h;
  c.gates.forEach((gate, s) => {
    if (!gate.trapdoorOpen) return;
    const st = c.layout.storeys[s];
    if (feet >= st.ceilingRows[0] * TILE) return;
```

with:

```ts
  c.gates.forEach((gate, s) => {
    if (!gate.trapdoorOpen) return;
    const st = c.layout.storeys[s];
    if (!feetAbove(c.player, st.ceilingRows[0])) return;
```

In `next/src/game/learn/climb.ts`, replace `import { closeTrapdoors, headBump, rearmIfStranded } from './gate';` with `import { closeTrapdoors, feetAbove, headBump, rearmIfStranded } from './gate';`.

Then, in the same file, replace:

```ts
  if (c.player.y + c.player.h > nextFloorRow * TILE) return;
```

with:

```ts
  if (!feetAbove(c.player, nextFloorRow)) return;
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  585 passed (585)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/learnGate.test.ts \
  src/gfx/textures.ts \
  src/scenes/LearnTowerScene.ts \
  src/scenes/LearnHudScene.ts \
  src/game/player.ts \
  src/physics/player.ts \
  src/game/learn/types.ts \
  tests/helpers/towerMove.ts \
  src/game/learn/gate.ts \
  src/game/learn/content.ts \
  src/gfx/learnTiles.ts \
  src/game/learn/climb.ts
git commit -m "refactor: stars baked at whole scales, the mover contract in game/, one boundary for trapdoor and storey" -m "The tower's star and the HUD's stars get textures of their own at scales 4 and 3, instead of the world's 1.5 bake enlarged. MoveReport and BodyMover are declared once in game/player.ts, and ClimbMove is BodyMover. feetAbove is the one test that both shuts a trapdoor and counts the hero into the storey above, so the two land on the same step. The tileset reads the block widths, the block height and the brick colour from their homes; the re-arm's doc says exactly why play never needs it; closeTrapdoors finds the right block with answerIndex like the rest; the tower scene's loose numbers have names."
```

---

### Task 3: A low tone and a dull buzz for a wrong letter, a light buzz for a right one

A wrong letter still plays the `?` block's knock. The spec gives it the live learn mode's
own low tone, `playTone(150,.15,'triangle',.08,100)` at `index.html:2743`, a bare call like
the boss's, now named `sfxWrong`. Right and wrong answers also buzz a controller, light and
dull, with the September plan's values (`docs/plans/2026-09-20-learn-path-refinement.md`,
§7). The climb raises them as `Climb.rumbles`, the way the adventure raises
`World.rumbles`, and the scene plays them with `padRumble`.

The climb's sounds are also typed as effects, `EffectCue`: every cue but the two music
ones. The scene then plays them with `playEffect(cue)`, and the meaningless level index in
`playCue(cue, 0)` goes (the final review's item).

**Files:**
- Modify: `next/src/audio/sfx.ts`
- Modify: `next/src/game/types.ts`
- Modify: `next/src/audio/cues.ts`
- Modify: `next/src/game/learn/types.ts`
- Modify: `next/src/game/learn/climb.ts`
- Modify: `next/src/game/learn/gate.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Test: `next/tests/sfx.test.ts`
- Test: `next/tests/sounds.test.ts`
- Test: `next/tests/learnGate.test.ts`

- [ ] **Step 1: Write the failing tests**

In `next/tests/sfx.test.ts`, replace:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
```

with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
```

Add to the end of `next/tests/sfx.test.ts`:

```ts
/**
 * Learn mode's wrong-answer tone is a bare `playTone` in the live learn update
 * (index.html:2743), like the boss's three and the cannon's shot: there is no named function
 * to load and call. So it is checked the way boss.test.ts checks those: the call it was copied
 * from has to still be in index.html, spelled like this, and sfxWrong has to make exactly it.
 */
describe("the wrong-answer tone is the live learn mode's", () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(here, '../../index.html'), 'utf8');

  it('is still spelled that way (index.html:2743)', () => {
    expect(source).toContain("playTone(150,.15,'triangle',.08,100)");
  });

  it('is the one call sfxWrong makes', () => {
    vi.mocked(playTone).mockClear();
    sfx.sfxWrong();
    vi.runAllTimers();
    expect(vi.mocked(playTone).mock.calls).toEqual([[150, 0.15, 'triangle', 0.08, 100]]);
  });
});
```

In `next/tests/sounds.test.ts`, replace `import { playCue, playSounds } from '../src/audio/cues';` with `import { playCue, playEffect, playSounds } from '../src/audio/cues';`.

Then, in the same file, replace:

```ts
    'boss-fire', 'boss-charge', 'boss-roar', 'cannon-fire',
  ];
```

with:

```ts
    'boss-fire', 'boss-charge', 'boss-roar', 'cannon-fire', 'wrong',
  ];
```

Then, in the same file, replace:

```ts
  it('music-level starts the theme the scene names, not some fixed one', () => {
```

with:

```ts
  // The learn tower plays its cues through playEffect, which takes no level index.
  it('plays an effect without a level index', () => {
    playEffect('wrong');
    vi.runAllTimers();
    expect(fake.oscillators.map((o) => o.type)).toEqual(['triangle']);
  });

  it('music-level starts the theme the scene names, not some fixed one', () => {
```

In `next/tests/learnGate.test.ts`, replace:

```ts
import { blockCells, feetAbove, headBump, trapdoorCells } from '../src/game/learn/gate';
```

with:

```ts
import { blockCells, feetAbove, headBump, RIGHT_RUMBLE, trapdoorCells, WRONG_RUMBLE } from '../src/game/learn/gate';
```

Then, in the same file, replace:

```ts
    expect(c.sounds).toContain('coin');
    expect(c.events).toContainEqual({ type: 'bump-right', storey: 0, block: answerOf(c, 0) });
```

with:

```ts
    expect(c.sounds).toContain('coin');
    expect(c.rumbles).toEqual([RIGHT_RUMBLE]);
    expect(c.events).toContainEqual({ type: 'bump-right', storey: 0, block: answerOf(c, 0) });
```

Then, in the same file, replace:

```ts
    expect(c.events).toContainEqual({ type: 'bump-wrong', storey: 0, block: wrongOf(c, 0) });
    expect(run(c, 120, idle, () => c.player.onGround)).toBe(true);
```

with:

```ts
    expect(c.events).toContainEqual({ type: 'bump-wrong', storey: 0, block: wrongOf(c, 0) });
    expect(c.sounds).toContain('wrong');
    expect(c.sounds).not.toContain('block');
    expect(c.rumbles).toEqual([WRONG_RUMBLE]);
    expect(run(c, 120, idle, () => c.player.onGround)).toBe(true);
```

Then, in the same file, replace:

```ts
  it('makes the right block glow after two misses', () => {
```

with:

```ts
  it('buzzes a controller light for a right letter and dull for a wrong one', () => {
    // The September plan's two buzzes (docs/plans/2026-09-20-learn-path-refinement.md, §7).
    expect(RIGHT_RUMBLE).toEqual({ strong: 0, weak: 0.6, dur: 120 });
    expect(WRONG_RUMBLE).toEqual({ strong: 0.35, weak: 0, dur: 200 });
  });

  it('makes the right block glow after two misses', () => {
```

Then, in the same file, replace:

```ts
    expect(headBump(c, blockCells(c.layout, 0, answerOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].solved).toBe(false);
  });
```

with:

```ts
    expect(headBump(c, blockCells(c.layout, 0, answerOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].solved).toBe(false);
    expect(c.sounds).toEqual([]);
    expect(c.rumbles).toEqual([]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/sfx.test.ts tests/sounds.test.ts tests/learnGate.test.ts`

Expected: FAIL. Seven tests. Four in `learnGate.test.ts` (the climb has no `rumbles`, and a wrong answer
still plays `block`: `expected [ 'jump', 'block' ] to include 'wrong'`);
`is the one call sfxWrong makes` (`sfxWrong is not a function`); `wrong makes a sound` (the
cue plays nothing yet); and `plays an effect without a level index`
(`playEffect is not a function`). `is still spelled that way (index.html:2743)` passes
already: the live file has the call.

- [ ] **Step 3: Implement**

`stepMotion` takes `sounds: SoundCue[]` and is handed `Climb.sounds`, now `EffectCue[]`.
TypeScript allows it, and it is sound: `stepMotion` only ever pushes `'jump'` or `'fart'`.

In `next/src/audio/sfx.ts`, replace:

```ts
// are named further down this file now that both are ported; what is left is learn
// mode's, which this port does not have.
```

with:

```ts
// are named further down this file now that both are ported, and the last, learn mode's
// wrong answer, is sfxWrong at the bottom.
```

Add to the end of `next/src/audio/sfx.ts`:

```ts
/**
 * A wrong letter in learn mode (index.html:2743): a low 150Hz triangle sliding down to 100,
 * and soft. A wrong answer costs nothing, so it must not sound like getting hurt.
 */
export function sfxWrong(): void {
  playTone(150, 0.15, 'triangle', 0.08, 100);
}
```

In `next/src/game/types.ts`, replace:

```ts
 *   - `music-level` is the level's own theme, restarted by a respawn.
```

with:

```ts
 *   - `wrong` is learn mode's wrong letter (index.html:2743), a bare
 *     `playTone(150,.15,'triangle',.08,100)` in the live learn update. Low and soft: a
 *     wrong answer costs nothing.
 *   - `music-level` is the level's own theme, restarted by a respawn.
```

Then, in the same file, replace:

```ts
  | 'cannon-fire'
  | 'music-level'
  | 'music-stop';
```

with:

```ts
  | 'cannon-fire'
  | 'wrong'
  | 'music-level'
  | 'music-stop';

/**
 * The cues that are sound effects: every SoundCue but the music's two, so a name is all they
 * need. The learn tower raises only these, and plays them without a level index.
 */
export type EffectCue = Exclude<SoundCue, 'music-level' | 'music-stop'>;
```

In `next/src/audio/cues.ts`, replace `import type { SoundCue, World } from '../game/types';` with `import type { EffectCue, SoundCue, World } from '../game/types';`.

Then, in the same file, replace:

```ts
  sfxWin,
} from './sfx';
```

with:

```ts
  sfxWin,
  sfxWrong,
} from './sfx';
```

Then, in the same file, replace:

```ts
 * `levelIndex` is here because a World does not know which level it is — the level RECORD
 * is on it, the index is the run's. Only `music-level` reads it.
 */
export function playCue(cue: SoundCue, levelIndex: number): void {
  switch (cue) {
    case 'jump': sfxJump(); break;
```

with:

```ts
 * `levelIndex` is here because a World does not know which level it is — the level RECORD
 * is on it, the index is the run's. Only `music-level` reads it.
 */
export function playCue(cue: SoundCue, levelIndex: number): void {
  switch (cue) {
    // index.html:1209 — a respawn is an initLevel, and initLevel ends on startBGM(idx).
    case 'music-level': startBGM(levelIndex); break;
    // index.html:1631 (rescued) and :1647 (died). Both go quiet on the spot.
    case 'music-stop': stopBGM(); break;
    default: playEffect(cue);
  }
}

/** A sound effect, which needs nothing but its name. The learn tower plays its cues here. */
export function playEffect(cue: EffectCue): void {
  switch (cue) {
    case 'jump': sfxJump(); break;
```

Then, in the same file, replace:

```ts
    case 'cannon-fire': sfxCannonFire(); break;
    // index.html:1209 — a respawn is an initLevel, and initLevel ends on startBGM(idx).
    case 'music-level': startBGM(levelIndex); break;
    // index.html:1631 (rescued) and :1647 (died). Both go quiet on the spot.
    case 'music-stop': stopBGM(); break;
  }
}
```

with:

```ts
    case 'cannon-fire': sfxCannonFire(); break;
    // index.html:2743, learn mode's wrong letter.
    case 'wrong': sfxWrong(); break;
    default:
      // An effect this switch does not play fails the build here, not silently in play.
      cue satisfies never;
  }
}
```

In `next/src/game/learn/types.ts`, replace `import type { PlayerState, SoundCue } from '../types';` with `import type { EffectCue, PlayerState, RumbleCue } from '../types';`.

Then, in the same file, replace:

```ts
 * What the scene has to show for a step, in the order it happened. Sounds ride
 * `Climb.sounds`, exactly as the adventure's ride `World.sounds`.
```

with:

```ts
 * What the scene has to show for a step, in the order it happened. Sounds ride
 * `Climb.sounds` and buzzes `Climb.rumbles`, exactly as the adventure's ride `World.sounds`
 * and `World.rumbles`.
```

Then, in the same file, replace:

```ts
  score: number;
  sounds: SoundCue[];
  events: ClimbEvent[];
```

with:

```ts
  score: number;
  sounds: EffectCue[];
  rumbles: RumbleCue[];
  events: ClimbEvent[];
```

In `next/src/game/learn/climb.ts`, replace:

```ts
    score: 0,
    sounds: [],
    events: [],
```

with:

```ts
    score: 0,
    sounds: [],
    rumbles: [],
    events: [],
```

In `next/src/game/learn/gate.ts`, replace:

```ts
import type { Cell, Climb } from './types';
```

with:

```ts
import type { RumbleCue } from '../types';
import type { Cell, Climb } from './types';

/**
 * The September plan's two buzzes (docs/plans/2026-09-20-learn-path-refinement.md, §7): a
 * short one on the light motor for a right letter, a longer, duller one on the heavy motor
 * for a wrong one.
 */
export const RIGHT_RUMBLE: RumbleCue = { strong: 0, weak: 0.6, dur: 120 };
export const WRONG_RUMBLE: RumbleCue = { strong: 0.35, weak: 0, dur: 200 };
```

Then, in the same file, replace:

```ts
    c.sounds.push('coin');
    c.events.push({ type: 'bump-right', storey, block });
```

with:

```ts
    c.sounds.push('coin');
    c.rumbles.push(RIGHT_RUMBLE);
    c.events.push({ type: 'bump-right', storey, block });
```

Then, in the same file, replace:

```ts
  gate.mistakes++;
  c.sounds.push('block');
```

with:

```ts
  gate.mistakes++;
  c.sounds.push('wrong');
  c.rumbles.push(WRONG_RUMBLE);
```

In `next/src/scenes/LearnTowerScene.ts`, replace `import { playCue } from '../audio/cues';` with `import { playEffect } from '../audio/cues';`.

Then, in the same file, replace:

```ts
import { bindBackKey, justDown, type MenuKey, padContextFor } from '../input/menuKeys';
```

with:

```ts
import { padRumble } from '../input/gamepad';
import { bindBackKey, justDown, type MenuKey, padContextFor } from '../input/menuKeys';
```

Then, in the same file, replace:

```ts
      for (const cue of this.climb.sounds.splice(0)) playCue(cue, 0);
```

with:

```ts
      for (const cue of this.climb.sounds.splice(0)) playEffect(cue);
      for (const cue of this.climb.rumbles.splice(0)) padRumble(cue);
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  590 passed (590)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/sfx.test.ts \
  tests/sounds.test.ts \
  tests/learnGate.test.ts \
  src/audio/sfx.ts \
  src/game/types.ts \
  src/audio/cues.ts \
  src/game/learn/types.ts \
  src/game/learn/climb.ts \
  src/game/learn/gate.ts \
  src/scenes/LearnTowerScene.ts
git commit -m "feat: a low tone and a dull buzz for a wrong letter, a light buzz for a right one" -m "sfxWrong is the live learn mode's wrong-answer tone (index.html:2743), in place of the question block's knock. The climb raises controller buzzes as Climb.rumbles, the way the adventure raises World.rumbles, with the September plan's two values: light for right, dull for wrong. The climb's sounds are EffectCue, every cue but the music's, so the tower plays them with playEffect and no level index."
```

---

### Task 4: The voice

`audio/voice.ts` wraps the browser's speech synthesis, with the September plan's rules
(§3): the voice is picked Estonian, then Finnish, then Italian, then the first there is,
and picked again when Chrome fills in its list after the page loads; it speaks at rate 0.8
and pitch 1.1, and always in Estonian, whatever the UI language. `speak(text, 'now')` cuts
off whatever is being said; `speak(text, 'after')` waits its turn. With no speech at all it
does nothing, and the game plays exactly as before. Nothing speaks yet; Task 5 decides what
is said and when.

The pick's eight tests are the September plan's own
(`docs/plans/2026-09-20-learn-path-refinement-implementation.md`, Task 6). The rest stub
`window.speechSynthesis` and `SpeechSynthesisUtterance` with Vitest's `vi.stubGlobal`.

**Files:**
- Create: `next/src/audio/voice.ts`
- Modify: `next/src/main.ts`
- Test: `next/tests/voice.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `next/tests/voice.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installVoice, pickVoiceFrom, speak, VOICE_PITCH, VOICE_RATE, type VoiceLike } from '../src/audio/voice';

const V = (lang: string): VoiceLike => ({ lang, name: `test-${lang}` });

// The September plan's eight cases (docs/plans/2026-09-20-learn-path-refinement-implementation.md, Task 6).
describe('the voice pick', () => {
  it('prefers Estonian above all', () => {
    expect(pickVoiceFrom([V('it-IT'), V('fi-FI'), V('et-EE')])?.lang).toBe('et-EE');
  });

  it('falls back to Finnish when there is no Estonian', () => {
    expect(pickVoiceFrom([V('en-US'), V('it-IT'), V('fi-FI')])?.lang).toBe('fi-FI');
  });

  it('falls back to Italian when there is no Estonian or Finnish', () => {
    expect(pickVoiceFrom([V('en-US'), V('it-IT')])?.lang).toBe('it-IT');
  });

  it('falls back to the first voice otherwise', () => {
    expect(pickVoiceFrom([V('en-US'), V('de-DE')])?.lang).toBe('en-US');
  });

  it('handles bare language codes', () => {
    expect(pickVoiceFrom([V('en'), V('et')])?.lang).toBe('et');
  });

  it('ignores case', () => {
    expect(pickVoiceFrom([V('ET-ee')])?.lang).toBe('ET-ee');
  });

  it('is null with no voices', () => {
    expect(pickVoiceFrom([])).toBeNull();
  });

  it('is null with no voice list at all', () => {
    expect(pickVoiceFrom(undefined)).toBeNull();
  });
});

/** The part of speechSynthesis the voice uses, recording what it was asked. */
class FakeSynth {
  voices: VoiceLike[] = [];
  calls: string[] = [];
  spoken: FakeUtterance[] = [];
  private readonly changed: Array<() => void> = [];

  getVoices(): VoiceLike[] { return this.voices; }
  addEventListener(type: string, listener: () => void): void {
    if (type === 'voiceschanged') this.changed.push(listener);
  }
  cancel(): void { this.calls.push('cancel'); }
  speak(u: FakeUtterance): void {
    this.calls.push(`speak ${u.text}`);
    this.spoken.push(u);
  }
  /** What the browser does when its voice list fills in after the page has loaded. */
  install(voices: VoiceLike[]): void {
    this.voices = voices;
    for (const listener of this.changed) listener();
  }
}

class FakeUtterance {
  voice: VoiceLike | null = null;
  lang = '';
  rate = 1;
  pitch = 1;
  constructor(readonly text: string) {}
}

describe('speaking', () => {
  let synth: FakeSynth;

  beforeEach(() => {
    synth = new FakeSynth();
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    installVoice();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cuts off what is being said to say something now', () => {
    speak('A', 'now');
    expect(synth.calls).toEqual(['cancel', 'speak A']);
  });

  it('waits its turn to say something after', () => {
    speak('Tubli!', 'now');
    speak('K', 'after');
    expect(synth.calls).toEqual(['cancel', 'speak Tubli!', 'speak K']);
  });

  it('speaks slower and brighter, for a small child', () => {
    speak('A', 'now');
    expect(synth.spoken[0].rate).toBe(VOICE_RATE);
    expect(synth.spoken[0].pitch).toBe(VOICE_PITCH);
    expect([VOICE_RATE, VOICE_PITCH]).toEqual([0.8, 1.1]);
  });

  it('asks for Estonian when no voice is installed', () => {
    speak('A', 'now');
    expect(synth.spoken[0].voice).toBeNull();
    expect(synth.spoken[0].lang).toBe('et-EE');
  });

  it('picks again when the voice list fills in', () => {
    synth.install([V('en-US'), V('fi-FI')]);
    speak('A', 'now');
    expect(synth.spoken[0].voice?.lang).toBe('fi-FI');
    expect(synth.spoken[0].lang).toBe('fi-FI');
  });

  it('is silent, and does not throw, where there is no speech at all', () => {
    vi.stubGlobal('window', {});
    expect(() => speak('A', 'now')).not.toThrow();
    expect(synth.calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/voice.test.ts`

Expected: FAIL. `tests/voice.test.ts` cannot load: `Cannot find module '../src/audio/voice'`.

- [ ] **Step 3: Implement**

`voice.ts` looks up `window.speechSynthesis` on every call and never at import, so it loads
under Vitest (which has no `window`) and the tests can swap the global in.

Create `next/src/audio/voice.ts`:

```ts
/**
 * The learn tower's voice: the browser's speech synthesis, always in Estonian, whatever the
 * UI language, because the letters and words are Estonian. Phaser has no speech of its own.
 * The rules are the September plan's (docs/plans/2026-09-20-learn-path-refinement.md, §3).
 *
 * No voice, or no speech at all, is silence and nothing worse: the HUD always shows the
 * target, so the game stays fully playable.
 */

/** The part of a SpeechSynthesisVoice the pick reads. */
export interface VoiceLike {
  lang: string;
  name: string;
}

/**
 * Estonian, then Finnish and Italian, which both say Estonian vowels closely enough to learn
 * from (and Italian is very widely installed), then whatever the system has.
 */
const VOICE_PREFS = ['et', 'fi', 'it'];

/** Slower and brighter than the default, for a small child. */
export const VOICE_RATE = 0.8;
export const VOICE_PITCH = 1.1;

/** The first voice in a language VOICE_PREFS names, in that order; else the first voice; else null. */
export function pickVoiceFrom<V extends VoiceLike>(voices: readonly V[] | null | undefined): V | null {
  if (!voices || voices.length === 0) return null;
  for (const want of VOICE_PREFS) {
    const hit = voices.find((v) => v.lang.toLowerCase().startsWith(want));
    if (hit) return hit;
  }
  return voices[0];
}

let voice: SpeechSynthesisVoice | null = null;

/** The browser's speech synthesis, or null where there is none. Looked up per call, never at import. */
function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/**
 * Picks the voice, and picks again whenever the browser's list changes: Chrome fills it in
 * after the page loads, so the first pick often sees none. Called once, at boot (main.ts).
 */
export function installVoice(): void {
  const s = synth();
  if (!s) return;
  const pick = (): void => { voice = pickVoiceFrom(s.getVoices()); };
  pick();
  s.addEventListener('voiceschanged', pick);
}

/**
 * Says `text`. 'now' cuts off whatever is being said or waiting, as a target said again
 * should; 'after' waits its turn, so the next storey's target never talks over a cheer.
 */
export function speak(text: string, when: 'now' | 'after'): void {
  const s = synth();
  if (!s) return;
  try {
    if (when === 'now') s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    // With no voice picked, Estonian still, and the browser chooses.
    u.lang = voice?.lang ?? 'et-EE';
    u.rate = VOICE_RATE;
    u.pitch = VOICE_PITCH;
    s.speak(u);
  } catch {
    // Speech is never worth breaking a frame over.
  }
}
```

In `next/src/main.ts`, replace:

```ts
import Phaser from 'phaser';
import { BASE_W, BASE_H, STEP_HZ } from './config/constants';
```

with:

```ts
import Phaser from 'phaser';
import { installVoice } from './audio/voice';
import { BASE_W, BASE_H, STEP_HZ } from './config/constants';
```

Then, in the same file, replace:

```ts
installGlyphs();
```

with:

```ts
installGlyphs();
// The learn tower's voice list fills in after the page loads; picking starts now. See audio/voice.ts.
installVoice();
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  604 passed (604)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/voice.test.ts \
  src/audio/voice.ts \
  src/main.ts
git commit -m "feat: the learn tower's voice" -m "audio/voice.ts wraps speechSynthesis. The voice is picked Estonian, then Finnish, then Italian, then the first there is, and picked again when the browser fills in its list; rate 0.8, pitch 1.1. speak says a line now, cutting off what is being said, or after it. Where there is no speech it does nothing. main.ts starts the pick at boot. Nothing speaks yet."
```

---

### Task 5: What the tower says, and when

The spec's voice rules, as pure code in `game/learn/speech.ts`, raised as `Climb.speech`
lines that the tower scene hands to `speak`:
- when a tower starts, the target (`'now'`);
- a right answer, the letter and that gate's cheer (`'now'`);
- a wrong answer, the target again (`'now'`);
- landing in a new storey, its target, queued behind the cheer (`'after'`), once;
- arriving on a letter floor from below, the target, unless the voice spoke in the last four
  seconds (`'now'`); landing back on it after a jump from it is not arriving;
- X, the target, anywhere below the roof (`'now'`);
- the star, the last cheer (`'now'`).

Words mode says the word and then the letter ("kass. K."). Leaving the tower hushes the
voice. `Climb` gets the voice's clock: `steps`, `lastSpokeAt` and `announced`.

The gate tests' helpers (`standUnder`, `run`, `held`, `idle`, `answerOf`, `wrongOf`) move
to `tests/helpers/climbs.ts` unchanged, so the new voice tests can use them too.

**Files:**
- Create: `next/src/game/learn/speech.ts`
- Modify: `next/src/game/learn/types.ts`
- Modify: `next/src/game/learn/climb.ts`
- Modify: `next/src/game/learn/gate.ts`
- Modify: `next/src/audio/voice.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Test: `next/tests/helpers/climbs.ts` (new)
- Test: `next/tests/learnGate.test.ts`
- Test: `next/tests/voice.test.ts`
- Test: `next/tests/learnSpeech.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

The first change moves the helpers out of `learnGate.test.ts`; its tests do not change.

Create `next/tests/helpers/climbs.ts`:

```ts
import { TILE } from '../../src/config/constants';
import { stepClimb } from '../../src/game/learn/climb';
import { WALL } from '../../src/game/learn/tower';
import type { Climb } from '../../src/game/learn/types';
import { emptyInput, type InputState } from '../../src/input/actions';
import { towerMove } from './towerMove';

/** Storey `s`'s right block, and one of its wrong ones. */
export const answerOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => b.correct);
export const wrongOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => !b.correct);

/** Jump held from frame 0; and nothing pressed at all. */
export const held = (f: number): InputState => ({ ...emptyInput(), jump: true, jumpPressed: f === 0 });
export const idle = (): InputState => emptyInput();

/** Stands the hero on storey `s`'s letter floor, centred under block `block`. */
export function standUnder(c: Climb, s: number, block: number): void {
  const st = c.layout.storeys[s];
  const b = st.blocks[block];
  const p = c.player;
  p.x = (b.col + WALL) * TILE + (b.width * TILE - p.w) / 2;
  p.y = st.letterFloorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  c.storey = s;
  c.lastGround = s;
}

/** Steps until `until` holds (true) or the frames run out (false). */
export function run(c: Climb, frames: number, input: (f: number) => InputState, until: () => boolean): boolean {
  const move = towerMove(c.layout.map);
  for (let f = 0; f < frames; f++) {
    stepClimb(c, input(f), move);
    if (until()) return true;
  }
  return false;
}
```

In `next/tests/learnGate.test.ts`, replace:

```ts
import { starBox, T_BRICK, T_EMPTY, T_LETTER, WALL } from '../src/game/learn/tower';
import type { Cell, Climb } from '../src/game/learn/types';
import { emptyInput, type InputState } from '../src/input/actions';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const climb = (): Climb => createClimb('letters', [], 'gigi', seeded(3));
const answerOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => b.correct);
const wrongOf = (c: Climb, s: number): number => c.layout.storeys[s].blocks.findIndex((b) => !b.correct);
const held = (f: number): InputState => ({ ...emptyInput(), jump: true, jumpPressed: f === 0 });
const idle = (): InputState => emptyInput();
const codes = (c: Climb, cells: Cell[]): number[] => cells.map(({ col, row }) => c.layout.map[row][col]);

/** Stands the hero on storey `s`'s letter floor, centred under block `block`. */
function standUnder(c: Climb, s: number, block: number): void {
  const st = c.layout.storeys[s];
  const b = st.blocks[block];
  const p = c.player;
  p.x = (b.col + WALL) * TILE + (b.width * TILE - p.w) / 2;
  p.y = st.letterFloorRow * TILE - p.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  c.storey = s;
  c.lastGround = s;
}

/** Steps until `until` holds (true) or the frames run out (false). */
function run(c: Climb, frames: number, input: (f: number) => InputState, until: () => boolean): boolean {
  const move = towerMove(c.layout.map);
  for (let f = 0; f < frames; f++) {
    stepClimb(c, input(f), move);
    if (until()) return true;
  }
  return false;
}
```

with:

```ts
import { starBox, T_BRICK, T_EMPTY, T_LETTER, WALL } from '../src/game/learn/tower';
import type { Cell, Climb } from '../src/game/learn/types';
import { answerOf, held, idle, run, standUnder, wrongOf } from './helpers/climbs';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const climb = (): Climb => createClimb('letters', [], 'gigi', seeded(3));
const codes = (c: Climb, cells: Cell[]): number[] => cells.map(({ col, row }) => c.layout.map[row][col]);
```

In `next/tests/voice.test.ts`, replace:

```ts
import { installVoice, pickVoiceFrom, speak, VOICE_PITCH, VOICE_RATE, type VoiceLike } from '../src/audio/voice';
```

with:

```ts
import { hush, installVoice, pickVoiceFrom, speak, VOICE_PITCH, VOICE_RATE, type VoiceLike } from '../src/audio/voice';
```

Then, in the same file, replace:

```ts
  it('is silent, and does not throw, where there is no speech at all', () => {
```

with:

```ts
  it('hushes: stops what is being said, and what is waiting', () => {
    hush();
    expect(synth.calls).toEqual(['cancel']);
  });

  it('is silent, and does not throw, where there is no speech at all', () => {
```

Then, in the same file, replace:

```ts
    expect(() => speak('A', 'now')).not.toThrow();
```

with:

```ts
    expect(() => speak('A', 'now')).not.toThrow();
    expect(() => hush()).not.toThrow();
```

Create `next/tests/learnSpeech.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STEP_HZ, TILE } from '../src/config/constants';
import { createClimb, stepClimb } from '../src/game/learn/climb';
import type { LearnMode } from '../src/game/learn/content';
import { LEARN_CHEERS, REPEAT_GAP } from '../src/game/learn/speech';
import { starBox } from '../src/game/learn/tower';
import type { Climb } from '../src/game/learn/types';
import { emptyInput } from '../src/input/actions';
import { answerOf, held, idle, run, standUnder, wrongOf } from './helpers/climbs';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const climb = (mode: LearnMode = 'letters'): Climb => createClimb(mode, [], 'gigi', seeded(3));
const target = (c: Climb, s: number): string => c.layout.storeys[s].target;
/** What the voice was asked to say, and empties the list, as the scene does. */
const heard = (c: Climb) => c.speech.splice(0);

describe('the voice', () => {
  it('says what to find when a tower starts', () => {
    const c = climb();
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('says a syllable as a syllable, not as two letters', () => {
    const c = climb('syllables');
    expect(heard(c)).toEqual([{ text: target(c, 0).toLowerCase(), when: 'now' }]);
  });

  it('says the word and then the letter in words mode', () => {
    const c = climb('words');
    const word = c.layout.word ?? '';
    expect(heard(c)).toEqual([{ text: `${word.toLowerCase()}. ${target(c, 0)}.`, when: 'now' }]);
  });

  it('says the letter and a cheer for a right answer', () => {
    const c = climb();
    heard(c);
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    expect(heard(c)).toEqual([{ text: `${target(c, 0)}. ${LEARN_CHEERS[0]}`, when: 'now' }]);
  });

  it('says the target again for a wrong one', () => {
    const c = climb();
    heard(c);
    standUnder(c, 0, wrongOf(c, 0));
    run(c, 40, held, () => c.gates[0].mistakes === 1);
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('says the next target on landing in the new storey, after the cheer, and once', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    heard(c);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    run(c, 30, idle, () => false);
    expect(heard(c)).toEqual([{ text: target(c, 1), when: 'after' }]);
  });

  it('says the target on reaching the letter floor, unless it spoke in the last four seconds', () => {
    expect(REPEAT_GAP).toBe(4 * STEP_HZ);
    const arrive = (quietFor: number): Climb => {
      const c = climb();
      standUnder(c, 0, answerOf(c, 0));
      c.lastGround = -1; // as if the hero had just come up from the plank below
      c.lastSpokeAt = c.steps + 1 - quietFor;
      heard(c);
      stepClimb(c, idle(), towerMove(c.layout.map));
      return c;
    };
    const spoke = arrive(REPEAT_GAP);
    expect(heard(spoke)).toEqual([{ text: target(spoke, 0), when: 'now' }]);
    expect(heard(arrive(REPEAT_GAP - 1))).toEqual([]);
  });

  it('does not say it again on landing back on the letter floor after a jump', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    c.lastSpokeAt = -REPEAT_GAP;
    const move = towerMove(c.layout.map);
    // A tap: up a little and down again onto the same floor, reaching no block.
    stepClimb(c, { ...emptyInput(), jump: true, jumpPressed: true }, move);
    heard(c);
    expect(run(c, 60, idle, () => c.player.onGround)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[0].letterFloorRow * TILE);
    expect(heard(c)).toEqual([]);
  });

  it('says the target when X is pressed', () => {
    const c = climb();
    heard(c);
    stepClimb(c, { ...emptyInput(), firePressed: true }, towerMove(c.layout.map));
    expect(heard(c)).toEqual([{ text: target(c, 0), when: 'now' }]);
  });

  it('has nothing to say to X on the roof', () => {
    const c = climb();
    c.storey = c.layout.storeys.length;
    heard(c);
    stepClimb(c, { ...emptyInput(), firePressed: true }, towerMove(c.layout.map));
    expect(heard(c)).toEqual([]);
  });

  it('cheers at the star, with the one cheer no gate used', () => {
    const c = climb();
    c.gates.forEach((g) => { g.solved = true; g.armed = false; });
    c.storey = c.layout.storeys.length;
    const star = starBox(c.layout);
    c.player.x = star.x;
    c.player.y = star.y + star.h - c.player.h;
    c.player.onGround = true;
    heard(c);
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(heard(c)).toEqual([{ text: LEARN_CHEERS[c.layout.storeys.length], when: 'now' }]);
    expect(new Set(LEARN_CHEERS).size).toBe(c.layout.storeys.length + 1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/learnGate.test.ts tests/voice.test.ts tests/learnSpeech.test.ts`

Expected: FAIL. `tests/learnSpeech.test.ts` cannot load (`Cannot find module '../src/game/learn/speech'`),
and the two voice tests that call `hush` fail with `hush is not a function`.
`learnGate.test.ts` still passes: only its helpers moved.

- [ ] **Step 3: Implement**

`gate.ts` imports from `speech.ts` and `climb.ts` imports both; `speech.ts` imports only
types and `STEP_HZ`, so there is no import cycle.

Create `next/src/game/learn/speech.ts`:

```ts
import { STEP_HZ } from '../../config/constants';
import type { LearnMode } from './content';
import type { TowerLayout } from './tower';
import type { Climb } from './types';

/**
 * The voice's cheers, in Estonian like everything it says: one for each gate, in this order,
 * and the last for the star, so each tower ends on its biggest.
 */
export const LEARN_CHEERS: readonly string[] = ['Tubli!', 'Väga hea!', 'Super!', 'Suurepärane!', 'Fantastiline!'];

/** How long the voice stays quiet before saying the target again on reaching a letter floor: 4 seconds. */
export const REPEAT_GAP = 4 * STEP_HZ;

/**
 * An item as the voice should read it. A letter stays a capital, which a voice names; a
 * syllable goes lower case, which it says as a syllable instead of spelling it out.
 */
function spoken(item: string, mode: LearnMode): string {
  return mode === 'syllables' ? item.toLowerCase() : item;
}

/** What storey `s` asks for: the item, or in words mode the word and then the letter ("kass. K."). */
export function targetLine(layout: TowerLayout, s: number): string {
  const target = layout.storeys[s].target;
  if (layout.mode === 'words' && layout.word) return `${layout.word.toLowerCase()}. ${target}.`;
  return spoken(target, layout.mode);
}

/** A right answer at storey `s`: the item, and that gate's cheer. */
export function rightLine(layout: TowerLayout, s: number): string {
  return `${spoken(layout.storeys[s].target, layout.mode)}. ${LEARN_CHEERS[s % LEARN_CHEERS.length]}`;
}

/** The star's cheer. */
export function starLine(layout: TowerLayout): string {
  return LEARN_CHEERS[layout.storeys.length % LEARN_CHEERS.length];
}

/** Asks the scene to say `text` (audio/voice.ts's `speak`), and remembers when. */
export function say(c: Climb, text: string, when: 'now' | 'after'): void {
  c.speech.push({ text, when });
  c.lastSpokeAt = c.steps;
}

/**
 * The voice on the ground. The first time the hero stands in a new storey, that storey's
 * target, after whatever is still being said (the right answer's cheer). And on arriving on
 * a letter floor from below, the target again, unless the voice has spoken in the last
 * REPEAT_GAP. `groundBefore` is `lastGround` from before this step: landing back on the
 * letter floor after a jump from it is not arriving.
 */
export function speakOnGround(c: Climb, groundBefore: number): void {
  if (!c.player.onGround || c.storey >= c.layout.storeys.length) return;
  if (c.storey > c.announced) {
    c.announced = c.storey;
    say(c, targetLine(c.layout, c.storey), 'after');
    return;
  }
  const s = c.lastGround;
  if (s >= 0 && s !== groundBefore && c.steps - c.lastSpokeAt >= REPEAT_GAP) {
    say(c, targetLine(c.layout, s), 'now');
  }
}
```

In `next/src/game/learn/types.ts`, replace:

```ts
export interface Climb {
```

with:

```ts
/** A line for the voice: 'now' cuts off what is being said, 'after' waits its turn (audio/voice.ts). */
export interface SpeechCue {
  text: string;
  when: 'now' | 'after';
}

export interface Climb {
```

Then, in the same file, replace:

```ts
  sounds: EffectCue[];
  rumbles: RumbleCue[];
  events: ClimbEvent[];
}
```

with:

```ts
  sounds: EffectCue[];
  rumbles: RumbleCue[];
  events: ClimbEvent[];
  /** Lines for the voice, in order (game/learn/speech.ts). The scene speaks them and empties the list. */
  speech: SpeechCue[];
  /** Steps taken since the tower began: the voice's clock. */
  steps: number;
  /** The step the voice was last asked to speak on. */
  lastSpokeAt: number;
  /** The highest storey whose target has been said on arrival; the first is said as the tower starts. */
  announced: number;
}
```

In `next/src/game/learn/climb.ts`, replace:

```ts
import { closeTrapdoors, feetAbove, headBump, rearmIfStranded } from './gate';
```

with:

```ts
import { closeTrapdoors, feetAbove, headBump, rearmIfStranded } from './gate';
import { say, speakOnGround, starLine, targetLine } from './speech';
```

Then, in the same file, replace:

```ts
/** A fresh tower for `mode`, adding what it asks to `used`, with the hero at the door. */
```

with:

```ts
/** A fresh tower for `mode`, adding what it asks to `used`, with the hero at the door and the voice saying what to find. */
```

Then, in the same file, replace:

```ts
  return {
    layout,
    player,
```

with:

```ts
  const c: Climb = {
    layout,
    player,
```

Then, in the same file, replace:

```ts
    rumbles: [],
    events: [],
  };
}
```

with:

```ts
    rumbles: [],
    events: [],
    speech: [],
    steps: 0,
    lastSpokeAt: 0,
    announced: 0,
  };
  say(c, targetLine(layout, 0), 'now');
  return c;
}
```

Then, in the same file, replace:

```ts
 * One fixed step of the climb: the adventure's movement, the mover, then the gate rules on
 * what the head hit, the trapdoors, where the hero now stands, the walk cycle and the star.
 */
export function stepClimb(c: Climb, input: InputState, move: ClimbMove): void {
  if (c.finished) return;
  const p = c.player;
```

with:

```ts
 * One fixed step of the climb: the adventure's movement, the mover, then the gate rules on
 * what the head hit, the trapdoors, where the hero now stands, the voice, the walk cycle and
 * the star. X asks the voice for the target again, anywhere below the roof.
 */
export function stepClimb(c: Climb, input: InputState, move: ClimbMove): void {
  if (c.finished) return;
  c.steps++;
  const p = c.player;
  if (input.firePressed && c.storey < c.layout.storeys.length) say(c, targetLine(c.layout, c.storey), 'now');
```

Then, in the same file, replace:

```ts
  closeTrapdoors(c);
  trackGround(c);
  rearmIfStranded(c);
  trackStorey(c);
  stepWalkCycle(p);
```

with:

```ts
  closeTrapdoors(c);
  const groundBefore = c.lastGround;
  trackGround(c);
  rearmIfStranded(c);
  trackStorey(c);
  speakOnGround(c, groundBefore);
  stepWalkCycle(p);
```

Then, in the same file, replace:

```ts
  c.sounds.push('win');
  c.events.push({ type: 'finished' });
```

with:

```ts
  c.sounds.push('win');
  say(c, starLine(c.layout), 'now');
  c.events.push({ type: 'finished' });
```

In `next/src/game/learn/gate.ts`, replace:

```ts
import type { RumbleCue } from '../types';
import type { Cell, Climb } from './types';
```

with:

```ts
import type { RumbleCue } from '../types';
import { rightLine, say, targetLine } from './speech';
import type { Cell, Climb } from './types';
```

Then, in the same file, replace:

```ts
 * that gate's own letter floor. Right: the gate is solved (scoring once) and its trapdoor
 * opens; the caller springs the hero (climb.ts). Wrong: a miss, and after two the right
 * block glows. Returns what happened, or null for a bump that does not count.
```

with:

```ts
 * that gate's own letter floor. Right: the gate is solved (scoring once), its trapdoor
 * opens and the voice says the letter and a cheer; the caller springs the hero (climb.ts).
 * Wrong: a miss, the voice says the target again, and after two misses the right block glows.
 * Returns what happened, or null for a bump that does not count.
```

Then, in the same file, replace:

```ts
    c.rumbles.push(RIGHT_RUMBLE);
    c.events.push({ type: 'bump-right', storey, block });
```

with:

```ts
    c.rumbles.push(RIGHT_RUMBLE);
    say(c, rightLine(c.layout, storey), 'now');
    c.events.push({ type: 'bump-right', storey, block });
```

Then, in the same file, replace:

```ts
  c.rumbles.push(WRONG_RUMBLE);
  c.events.push({ type: 'bump-wrong', storey, block });
```

with:

```ts
  c.rumbles.push(WRONG_RUMBLE);
  say(c, targetLine(c.layout, storey), 'now');
  c.events.push({ type: 'bump-wrong', storey, block });
```

In `next/src/audio/voice.ts`, replace:

```ts
    // Speech is never worth breaking a frame over.
  }
}
```

with:

```ts
    // Speech is never worth breaking a frame over.
  }
}

/** Stops whatever is being said, and whatever is waiting: leaving the tower should be quiet. */
export function hush(): void {
  try {
    synth()?.cancel();
  } catch {
    // As above.
  }
}
```

In `next/src/scenes/LearnTowerScene.ts`, replace:

```ts
import { playEffect } from '../audio/cues';
```

with:

```ts
import { playEffect } from '../audio/cues';
import { hush, speak } from '../audio/voice';
```

Then, in the same file, replace:

```ts
      for (const cue of this.climb.rumbles.splice(0)) padRumble(cue);
```

with:

```ts
      for (const cue of this.climb.rumbles.splice(0)) padRumble(cue);
      for (const line of this.climb.speech.splice(0)) speak(line.text, line.when);
```

Then, in the same file, replace:

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop(LEARN_HUD_SCENE_KEY));
```

with:

```ts
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(LEARN_HUD_SCENE_KEY);
      hush();
    });
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  616 passed (616)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/climbs.ts \
  tests/learnGate.test.ts \
  tests/voice.test.ts \
  tests/learnSpeech.test.ts \
  src/game/learn/speech.ts \
  src/game/learn/types.ts \
  src/game/learn/climb.ts \
  src/game/learn/gate.ts \
  src/audio/voice.ts \
  src/scenes/LearnTowerScene.ts
git commit -m "feat: the tower says what to find, cheers each right letter, and hushes on the way out" -m "game/learn/speech.ts holds the spec's voice rules and the climb raises them as Climb.speech: the target when a tower starts, on landing in a new storey (after the cheer), on reaching a letter floor unless the voice spoke in the last four seconds, after a wrong answer and on X; the letter and the gate's cheer for a right answer; the last cheer at the star. Syllables are said in lower case, and words mode says the word, then the letter. The gate tests' helpers move to tests/helpers/climbs.ts so the voice tests can share them."
```

---

### Task 6: The effects: pop, sparks, brick chunks, the moving hint, confetti

The tower scene gets its effects, all Phaser: tweens, three particle emitters from one baked
white spark, and the Glow filter.
- **Right answer:** the block swells and fades in a burst of sparks; each brick the trapdoor
  knocks out (its side columns) breaks into chunks; the camera starts up to the next storey
  at once (see *Decisions*).
- **Two misses:** the right block's Glow breathes and the block pulses in size, until found.
- **The star:** it pops in a burst of confetti.

The block containers are now centred on their blocks, so the pop and the pulse grow from the
middle. A brick is "knocked out" when a `tiles` event empties a cell that holds brick; only
an opening trapdoor does that, so the chunks need no rule of their own.

None of this can be tested under Vitest, where Phaser cannot load. The checks are the suite
staying green, `tsc`, and Task 9's browser check.

**Files:**
- Modify: `next/src/gfx/learnTiles.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`

- [ ] **Step 1: Implement**

`learnTiles.ts` bakes the spark and exports `LEARN_BRICK` for the chunks' tint. Then the
tower scene is replaced whole: most of it is unchanged from Tasks 1-5, but the block views,
the event handling and three new helpers (`pop`, `showHint`, `stopTweens`) touch every part
of it.

In `next/src/gfx/learnTiles.ts`, replace:

```ts
/** The first world's brick (Doll Garden): the tower is built of the adventure's own. */
const LEARN_BRICK =
```

with:

```ts
/**
 * The first world's brick (Doll Garden): the tower is built of the adventure's own, and a
 * knocked-out brick's chunks are tinted with it.
 */
export const LEARN_BRICK =
```

Then, in the same file, replace:

```ts
/** A frame per tile code, T_EMPTY's included, so a code is its own frame number. */
const FRAMES = T_LETTER + 1;
```

with:

```ts
/** A frame per tile code, T_EMPTY's included, so a code is its own frame number. */
const FRAMES = T_LETTER + 1;
/** A small white square, tinted per use: the tower's sparks, brick chunks and confetti. */
export const LEARN_SPARK_TEXTURE = 'learn-spark';
const SPARK_PX = 3;
```

Then, in the same file, replace:

```ts
  for (const width of BLOCK_WIDTHS) {
```

with:

```ts
  bake(scene, LEARN_SPARK_TEXTURE, SPARK_PX, SPARK_PX, (g) => {
    g.fillStyle(0xffffff).fillRect(0, 0, SPARK_PX, SPARK_PX);
  });
  for (const width of BLOCK_WIDTHS) {
```

Then, in the same file, replace:

```ts
 * Bakes the tileset and the letter-block pictures into textures, once. Idempotent: a restarted
 * tower reuses them.
```

with:

```ts
 * Bakes the tileset, the letter-block pictures and the spark into textures, once. Idempotent:
 * a restarted tower reuses them.
```

Replace the whole of `next/src/scenes/LearnTowerScene.ts` with:

```ts
import Phaser from 'phaser';
import { playEffect } from '../audio/cues';
import { hush, speak } from '../audio/voice';
import { MAX_STEPS_PER_FRAME, STEP_MS, TILE } from '../config/constants';
import { createClimb, stepClimb } from '../game/learn/climb';
import type { LearnMode } from '../game/learn/content';
import {
  CEILING, LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_BRICK, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
import type { Climb, ClimbEvent, ClimbMove } from '../game/learn/types';
import { type Character, PLAYER_DRAW_INSET } from '../game/player';
import { getSelectedChar, getSkinIndex } from '../game/run';
import {
  blockTextureKey, LEARN_BRICK, LEARN_SPARK_TEXTURE, LEARN_TILES_TEXTURE, registerLearnTiles, toPhaserData,
} from '../gfx/learnTiles';
import { LEARN_STAR_TEXTURE, PLAYER_POSES, playerTextureKey, registerTextures } from '../gfx/textures';
import { createControls, type Controls } from '../input/controls';
import { padRumble } from '../input/gamepad';
import { bindBackKey, justDown, type MenuKey, padContextFor } from '../input/menuKeys';
import { createBodyMover } from '../physics/player';
import { applyTileFaces, applyTileFacesAt } from '../physics/tiles';
import { LEARN_HUD_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnHudData } from './LearnHudScene';
import { takeBack } from './navigate';

export interface LearnTowerData {
  mode: LearnMode;
  /** What this round has asked: the same array from tower to tower, emptied by pickTargets when a round ends. */
  used: string[];
}

/** A plain sky until the castle backdrop. */
const SKY = '#7ec0ee';
const FOLLOW_LERP = 0.15;
/** The camera centres this far above the hero: more of the climb above than below. */
const FOLLOW_ABOVE = 48;
const PAN_MS = 600;
/** After the star, a new tower in the same mode. The result screen goes here. */
const NEXT_TOWER_MS = 2000;
const DEPTH_BLOCK = 5;
const DEPTH_STAR = 6;
const DEPTH_PLAYER = 10;
const DEPTH_EFFECTS = 20;
const LETTER_FONT = {
  fontFamily: '"Trebuchet MS", system-ui, sans-serif',
  fontSize: '20px',
  fontStyle: 'bold',
  color: '#8a4b00',
};
const LETTER_RESOLUTION = 3;
/** The star floats up and down this far, this slowly. */
const STAR_BOB_PX = 4;
const STAR_BOB_MS = 800;
/** A wrong block shakes sideways this far, this fast, this many times. */
const SHAKE_PX = 3;
const SHAKE_MS = 40;
const SHAKE_REPEATS = 3;
/** The right block, and the star, pop: they swell to this and fade out, this fast. */
const POP_SCALE = 1.6;
const POP_MS = 220;
/** Sparks from a popped block, chunks from each brick a trapdoor knocks out, confetti from the star. */
const SPARKS = 16;
const CHUNKS_PER_BRICK = 4;
const CONFETTI = 60;
/** The live learn mode's celebration colours (index.html:2719). */
const CONFETTI_COLORS = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];
/**
 * The hint: Phaser's Glow round the right block, breathing, and the block swelling and
 * settling with it, so it moves as well as shines. White over the gold alone was too faint
 * to find (1.24:1).
 */
const HINT_GLOW_COLOR = 0xffffff;
const HINT_GLOW_STRENGTH = 6;
const HINT_GLOW_DISTANCE = 8;
const HINT_PULSE_SCALE = 1.12;
const HINT_PULSE_MS = 450;

/**
 * A letter block on screen: its container (picture and letter), centred on the block so it
 * pops and pulses from the middle; the picture, which carries the hint's glow; and where it
 * rests, for the shake.
 */
interface BlockView {
  box: Phaser.GameObjects.Container;
  picture: Phaser.GameObjects.Image;
  restX: number;
  glow: Phaser.Filters.Glow | null;
}

/**
 * One learn tower. The rules are game/learn/ (tested there); this scene is the engine side:
 * a real tilemap drawn from the tower's own tileset, which Arcade also collides against,
 * with planks colliding only from above; the general Arcade mover (physics/player.ts's
 * createBodyMover), which reports the row a head hit for the climb to pick the letter; the
 * same fixed 60Hz step as SliceScene; a camera that follows the hero inside the current
 * storey's bounds and pans to the next; and the climb's cues, played: sounds, buzzes, the
 * voice and the effects.
 *
 * Back goes to the learn menu (game/navigation.ts: `learnletters` is not pausable).
 */
export class LearnTowerScene extends Phaser.Scene {
  private mode: LearnMode = 'letters';
  private used: string[] = [];
  private character: Character = 'gigi';
  private skin = 0;
  private climb!: Climb;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private move!: ClimbMove;
  /** One view per block, per storey. */
  private blocks: BlockView[][] = [];
  private star!: Phaser.GameObjects.Image;
  private playerImage!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chunks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** The point the camera follows: the hero's centre. */
  private readonly follow = { x: 0, y: 0 };
  /** The storey the camera is panning or bound to, so a pan already under way is not restarted. */
  private viewStorey = 0;
  private controls!: Controls;
  private backKey!: MenuKey;
  private accumulator = 0;
  private leaving = false;

  constructor() {
    super(LEARN_TOWER_SCENE_KEY);
  }

  init(data: LearnTowerData): void {
    this.mode = data?.mode ?? 'letters';
    this.used = data?.used ?? [];
    this.blocks = [];
    this.viewStorey = 0;
    this.accumulator = 0;
    this.leaving = false;
  }

  create(): void {
    registerTextures(this);
    registerLearnTiles(this);
    this.cameras.main.setBackgroundColor(SKY);

    this.character = getSelectedChar();
    this.skin = getSkinIndex(this.character);
    this.climb = createClimb(this.mode, this.used, this.character);

    this.layer = this.buildLayer();
    // The side walls are world edges too: above the last storey they stand only BATTLEMENTS
    // high, lower than a jump, and nothing else would keep the hero on the roof.
    this.move = createBodyMover(this, this.climb.player, {
      layer: this.layer,
      edges: {
        width: MAP_COLS * TILE,
        height: this.climb.layout.rows * TILE,
        left: true,
        right: true,
        up: false,
        down: false,
      },
    });
    this.buildBlocks();
    this.star = this.buildStar();
    this.playerImage = this.add.image(0, 0, this.poseKey()).setOrigin(0, 0).setDepth(DEPTH_PLAYER);
    this.syncPlayer();
    this.buildEffects();

    const cam = this.cameras.main;
    cam.setZoom(LEARN_ZOOM);
    this.boundToStorey(0);
    // startFollow snaps the scroll to the follow point and clamps it to the bounds, so this
    // is also the first frame's position: storey 0 always fits, and its top is pinned.
    // lerpX 0: the camera never moves sideways; the bounds are exactly the view's width.
    cam.startFollow(this.follow, true, 0, FOLLOW_LERP, 0, FOLLOW_ABOVE);

    // Made here, not earlier: the pad half seeds itself from what is held right now, so the
    // button that chose the exercise does not also jump.
    this.controls = createControls(this);
    this.backKey = bindBackKey(this, padContextFor('learnletters'));

    this.scene.launch(LEARN_HUD_SCENE_KEY, { climb: this.climb } satisfies LearnHudData);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(LEARN_HUD_SCENE_KEY);
      hush();
    });
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (justDown(this.backKey)) {
      this.leaving = true;
      takeBack(this, 'learnletters');
      return;
    }
    // The same fixed step as SliceScene, with the same ceiling on the time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= STEP_MS) {
      stepClimb(this.climb, this.controls.read(), this.move);
      for (const event of this.climb.events.splice(0)) this.apply(event);
      for (const cue of this.climb.sounds.splice(0)) playEffect(cue);
      for (const cue of this.climb.rumbles.splice(0)) padRumble(cue);
      for (const line of this.climb.speech.splice(0)) speak(line.text, line.when);
      this.accumulator -= STEP_MS;
    }
    this.syncPlayer();
  }

  private buildLayer(): Phaser.Tilemaps.TilemapLayer {
    const tilemap = this.make.tilemap({
      data: toPhaserData(this.climb.layout.map),
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = tilemap.addTilesetImage(LEARN_TILES_TEXTURE, LEARN_TILES_TEXTURE, TILE, TILE, 0, 0);
    if (!tileset) throw new Error('the tower tileset is not a texture');
    // `false`: the CPU layer, the only kind Arcade collides against (as physics/tiles.ts).
    const layer = tilemap.createLayer(0, tileset, 0, 0, false);
    if (!layer || !('culledTiles' in layer)) throw new Error('the tower tilemap has no layer 0');
    applyTileFaces(layer, towerTileFaces);
    return layer;
  }

  private buildBlocks(): void {
    this.blocks = this.climb.layout.storeys.map((st) => st.blocks.map((b) => {
      const w = b.width * TILE;
      const h = CEILING * TILE;
      const x = (b.col + WALL) * TILE + w / 2;
      const y = st.ceilingRows[0] * TILE + h / 2;
      const picture = this.add.image(0, 0, blockTextureKey(b.width));
      const letter = this.add.text(0, 1, b.letter, LETTER_FONT).setOrigin(0.5, 0.5).setResolution(LETTER_RESOLUTION);
      const box = this.add.container(x, y, [picture, letter]).setDepth(DEPTH_BLOCK);
      return { box, picture, restX: x, glow: null };
    }));
  }

  private buildStar(): Phaser.GameObjects.Image {
    const box = starBox(this.climb.layout);
    const star = this.add.image(box.x + box.w / 2, box.y + box.h / 2, LEARN_STAR_TEXTURE).setDepth(DEPTH_STAR);
    this.tweens.add({
      targets: star, y: star.y - STAR_BOB_PX, duration: STAR_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    return star;
  }

  /**
   * Three emitters, idle until something explodes them, all from one white spark tinted per
   * use: the popped block's sparkle, a knocked-out brick's chunks, and the star's confetti.
   */
  private buildEffects(): void {
    this.sparks = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 600,
      speed: { min: 60, max: 180 },
      scale: { start: 1.5, end: 0 },
      tint: [0xffffff, 0xffdd00, 0x88ff88],
      gravityY: 200,
    }).setDepth(DEPTH_EFFECTS);
    this.chunks = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 900,
      speedX: { min: -70, max: 70 },
      speedY: { min: -150, max: -40 },
      scale: { min: 1.5, max: 2.5 },
      rotate: { start: 0, end: 360 },
      tint: LEARN_BRICK,
      gravityY: 600,
    }).setDepth(DEPTH_EFFECTS);
    this.confetti = this.add.particles(0, 0, LEARN_SPARK_TEXTURE, {
      emitting: false,
      lifespan: 1600,
      speed: { min: 80, max: 240 },
      angle: { min: 200, max: 340 },
      rotate: { start: 0, end: 360 },
      tint: CONFETTI_COLORS,
      gravityY: 250,
    }).setDepth(DEPTH_EFFECTS);
  }

  private apply(event: ClimbEvent): void {
    switch (event.type) {
      case 'tiles':
        for (const cell of event.cells) this.setTile(cell.col, cell.row, cell.code);
        return;
      case 'bump-right':
        this.pop(this.blocks[event.storey][event.block]);
        // Now, not when the hero reaches the next storey: they spring up through the HUD band
        // otherwise. Every counted bump carries them there (tests/learnJumps.test.ts).
        this.panToStorey(event.storey + 1);
        return;
      case 'bump-wrong':
        this.shake(this.blocks[event.storey][event.block]);
        return;
      case 'hint':
        this.showHint(this.blocks[event.storey][event.block]);
        return;
      case 'rearm':
        this.blocks[event.storey][event.block].box.setVisible(true);
        this.panToStorey(event.storey);
        return;
      case 'gate-closed':
        // The wrong letters go with the rest of the ceiling, which is brick now. The right
        // one is already popping out of sight, and cutting its pop short would show.
        this.climb.layout.storeys[event.storey].blocks.forEach((b, i) => {
          if (b.correct) return;
          const view = this.blocks[event.storey][i];
          this.stopTweens(view);
          view.box.setVisible(false);
        });
        return;
      case 'storey':
        if (event.storey !== this.viewStorey) this.panToStorey(event.storey);
        return;
      case 'finished':
        this.tweens.killTweensOf(this.star);
        this.confetti.explode(CONFETTI, this.star.x, this.star.y);
        this.tweens.add({ targets: this.star, scale: POP_SCALE, alpha: 0, duration: POP_MS });
        this.time.delayedCall(NEXT_TOWER_MS, () => {
          this.scene.restart({ mode: this.mode, used: this.used } satisfies LearnTowerData);
        });
        return;
      default:
        // A ClimbEvent this switch does not know fails the build here, not silently in play.
        event satisfies never;
    }
  }

  /**
   * Mirrors a map edit on the Phaser layer, collision included. Both calls are needed:
   * putTileAt sets a tile's collision from the layer's collideIndexes, which this layer does
   * not use (its collision is per tile and per side), so it leaves the tile colliding on no
   * side; applyTileFacesAt then sets the tower's sides and recalculates the faces around it.
   *
   * A brick knocked out of the map, which only an opening trapdoor does (its side columns),
   * breaks into chunks.
   */
  private setTile(col: number, row: number, code: number): void {
    if (code === T_EMPTY) {
      if (this.layer.getTileAt(col, row)?.index === T_BRICK) {
        this.chunks.explode(CHUNKS_PER_BRICK, (col + 0.5) * TILE, (row + 0.5) * TILE);
      }
      this.layer.removeTileAt(col, row, true, true);
      return;
    }
    this.layer.putTileAt(code, col, row, false);
    applyTileFacesAt(this.layer, col, row, towerTileFaces);
  }

  /** The right block pops: it swells and fades in a burst of sparks, and hides until a re-arm brings it back. */
  private pop(view: BlockView): void {
    const { box } = view;
    this.stopTweens(view);
    this.sparks.explode(SPARKS, box.x, box.y);
    this.tweens.add({
      targets: box, scale: POP_SCALE, alpha: 0, duration: POP_MS, ease: 'Quad.easeOut',
      onComplete: () => box.setVisible(false).setScale(1).setAlpha(1),
    });
  }

  private shake({ box, restX }: BlockView): void {
    this.tweens.killTweensOf(box);
    box.setX(restX);
    this.tweens.add({
      targets: box, x: restX + SHAKE_PX, duration: SHAKE_MS, yoyo: true, repeat: SHAKE_REPEATS,
      onComplete: () => box.setX(restX),
    });
  }

  /** The hint, on the right block. Under the canvas renderer there are no filters, and the pulse alone shows it. */
  private showHint(view: BlockView): void {
    const glow = view.picture.enableFilters().filters?.internal
      .addGlow(HINT_GLOW_COLOR, 0, 0, 1, false, 10, HINT_GLOW_DISTANCE) ?? null;
    if (glow) {
      // Pads the picture's framebuffer by the glow's reach, so the glow is not cut off at its edges.
      glow.setPaddingOverride(null);
      this.tweens.add({
        targets: glow, outerStrength: HINT_GLOW_STRENGTH, duration: HINT_PULSE_MS, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    view.glow = glow;
    this.tweens.add({
      targets: view.box, scale: HINT_PULSE_SCALE, duration: HINT_PULSE_MS, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Stops a block's shake or hint, and puts it back as it rests. */
  private stopTweens(view: BlockView): void {
    this.tweens.killTweensOf(view.box);
    if (view.glow) {
      this.tweens.killTweensOf(view.glow);
      view.glow.outerStrength = 0;
    }
    view.box.setPosition(view.restX, view.box.y).setScale(1);
  }

  /**
   * Into storey `s`: bounds off (they would clamp the pan, and follow waits while a pan
   * runs), pan to where the camera will settle, and bound it to the new storey when the pan
   * ends. Follow picks up from there.
   */
  private panToStorey(s: number): void {
    this.viewStorey = s;
    const cam = this.cameras.main;
    const target = settleCenter(storeyView(this.climb.layout, s));
    cam.removeBounds();
    cam.pan(target.x, target.y, PAN_MS, 'Sine.easeInOut', true, (_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress === 1) this.boundToStorey(s);
    });
  }

  private boundToStorey(s: number): void {
    const view = storeyView(this.climb.layout, s);
    this.cameras.main.setBounds(view.x, view.y, view.width, view.height);
  }

  private syncPlayer(): void {
    const p = this.climb.player;
    this.playerImage
      .setTexture(this.poseKey())
      .setPosition(p.x - PLAYER_DRAW_INSET, p.y - PLAYER_DRAW_INSET)
      .setFlipX(p.facing < 0);
    this.follow.x = p.x + p.w / 2;
    this.follow.y = p.y + p.h / 2;
  }

  private poseKey(): string {
    return playerTextureKey(this.character, this.skin, PLAYER_POSES[this.climb.player.frame]);
  }
}
```

Things in this file that are easy to get subtly wrong, and why they are as they are:
- **`gate-closed` leaves the right block alone.** The trapdoor shuts about 8 steps after the
  bump, while the 220ms pop is still running; stopping the pop there would cut it short.
  The right block hides itself when its pop ends.
- **`viewStorey` guards the pan.** The pan starts on `bump-right`; the `storey` event for the
  same storey arrives mid-pan and must not restart it. `rearm` pans back.
- **`showHint` treats the Glow as optional**, because under the canvas renderer
  `enableFilters()` does nothing and `filters` is `null`. The pulse alone shows it there.

- [ ] **Step 2: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  616 passed (616)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 3: Commit**

```bash
git add src/gfx/learnTiles.ts \
  src/scenes/LearnTowerScene.ts
git commit -m "feat: the learn tower's pop, sparks, brick chunks, moving hint and confetti" -m "The right block swells and fades in a burst of sparks, and the bricks its trapdoor knocks out fall as chunks; the camera starts up to the next storey on the right answer, so the hero never rises behind the HUD. The hint is Phaser's Glow round the right block with the block pulsing, instead of a faint white wash. The star pops in confetti. All Phaser: tweens, three particle emitters from one baked spark, and the Glow filter. Blocks are drawn from their centres so the pop and the pulse grow from the middle."
```

---

### Task 7: The HUD: the word, the speaker key, and each star flying home

- **Words mode** shows the whole word, found letters green and the one to find framed. On
  the roof all are green and the frame goes.
- **A speaker hint** at the right of the band, `🔊 X / Ⓧ`, says X asks the voice again (the
  `{X}` placeholder becomes the pad's own button glyph).
- **A right answer's star flies** from the block to its slot, which lights and bounces as it
  lands. One per solved gate: a block bumped again after a re-arm sends none. The tower
  calls the HUD's `flyStar` with the block's centre in screen px.

The HUD's star slots are now centred on their points (origin 0.5), so the landing bounce
grows from the middle; `roundPixels` keeps them crisp.

**Files:**
- Modify: `next/src/config/i18n.ts`
- Modify: `next/src/scenes/LearnHudScene.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Test: `next/tests/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

In `next/tests/i18n.test.ts`, replace:

```ts
  'learn_find_letter', 'learn_find_syllable', 'learn_find_letters',
];
```

with:

```ts
  'learn_find_letter', 'learn_find_syllable', 'learn_find_letters',
  'learn_speak',
];
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/i18n.test.ts`

Expected: FAIL. `has every port-only key it claims to have`: `learn_speak` is listed but not in
`TRANSLATIONS` yet.

- [ ] **Step 3: Implement**

The HUD is replaced whole. The tower imports `LearnHudScene` as a type only, so the two
scene files do not import each other at run time.

In `next/src/config/i18n.ts`, replace:

```ts
  learn_find_letters: {et:'LEIA TÄHED:',              en:'FIND THE LETTERS:'},
```

with:

```ts
  learn_find_letters: {et:'LEIA TÄHED:',              en:'FIND THE LETTERS:'},
  learn_speak:        {et:'🔊 X / {X}',               en:'🔊 X / {X}'},
```

Replace the whole of `next/src/scenes/LearnHudScene.ts` with:

```ts
import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import type { LearnMode } from '../game/learn/content';
import { LEARN_HUD_H } from '../game/learn/tower';
import type { Climb } from '../game/learn/types';
import { LEARN_HUD_STAR_TEXTURE, registerTextures } from '../gfx/textures';
import { LEARN_HUD_SCENE_KEY } from './keys';

export interface LearnHudData {
  /** A live reference; the HUD only reads it. */
  climb: Climb;
}

const PROMPT: Record<LearnMode, string> = {
  letters: 'learn_find_letter',
  syllables: 'learn_find_syllable',
  words: 'learn_find_letters',
};
const PROMPT_FONT = { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffdd00' };
const TARGET_FONT = { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' };
const SPEAK_FONT = { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#aaddff' };
/** Where the prompt's and the target's baselines sit in the band. */
const PROMPT_BOTTOM = 16;
const TARGET_BOTTOM = 44;
/** The first star slot's centre, and the step to the next. */
const STAR_X = 22;
const STAR_Y = 22;
const STAR_STEP = 26;
const UNSOLVED_ALPHA = 0.28;
/** Shown instead of a target once the hero is on the roof. */
const ROOF_MARK = '★';
/** Words mode: a cell per letter, the found ones green and the one to find framed. */
const WORD_CELL = 26;
const FOUND_COLOR = '#88ff88';
const FRAME_COLOR = 0xffdd00;
const FRAME_H = 32;
/** The speaker hint's right edge. */
const SPEAK_RIGHT = BASE_W - 12;
/** A right answer's star flies to its slot this fast, and the slot bounces this much when it lands. */
const FLY_MS = 700;
const LAND_SCALE = 1.4;
const LAND_MS = 120;

/**
 * What to find, and one star per gate, lit as each right answer's star flies in. A parallel
 * scene over the tower, like the adventure's HudScene; no score during the climb, because a
 * number means nothing to a pre-reader. Words mode shows the whole word, found letters green
 * and the one to find framed. The speaker hint says X asks the voice again.
 */
export class LearnHudScene extends Phaser.Scene {
  private climb!: Climb;
  /** The target, in letters and syllables mode. */
  private target: Phaser.GameObjects.Text | null = null;
  /** The word's letters and the frame, in words mode. */
  private letters: Phaser.GameObjects.Text[] = [];
  private frame: Phaser.GameObjects.Rectangle | null = null;
  /** What the word display last showed, so it is redrawn only when that changes. */
  private shown = '';
  private stars: Phaser.GameObjects.Image[] = [];
  /** Stars sent flying so far; the next one goes to this slot. */
  private sent = 0;

  constructor() {
    super(LEARN_HUD_SCENE_KEY);
  }

  init(data: LearnHudData): void {
    this.climb = data.climb;
    this.target = null;
    this.letters = [];
    this.frame = null;
    this.shown = '';
    this.stars = [];
    this.sent = 0;
  }

  create(): void {
    registerTextures(this);
    const { layout } = this.climb;
    this.add.graphics().fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, LEARN_HUD_H);
    this.add.text(BASE_W / 2, PROMPT_BOTTOM, TStr(PROMPT[layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    if (layout.mode === 'words' && layout.word) {
      this.buildWord(layout.word);
    } else {
      this.target = this.add.text(BASE_W / 2, TARGET_BOTTOM, '', TARGET_FONT).setOrigin(0.5, 1);
    }
    this.add.text(SPEAK_RIGHT, LEARN_HUD_H / 2, TStr('learn_speak'), SPEAK_FONT).setOrigin(1, 0.5);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, LEARN_HUD_STAR_TEXTURE)
      .setAlpha(UNSOLVED_ALPHA));
  }

  update(): void {
    const { layout, storey, gates } = this.climb;
    this.target?.setText(storey < layout.storeys.length ? layout.storeys[storey].target : ROOF_MARK);
    if (this.frame) {
      const shown = `${storey}:${gates.map((g) => (g.solved ? 1 : 0)).join('')}`;
      if (shown !== this.shown) {
        this.shown = shown;
        this.showWord();
      }
    }
  }

  /**
   * A right answer's star, flying from where its block was (screen px) to its slot, which
   * lights as it lands. One per solved gate: a block bumped again after a re-arm sends none.
   */
  flyStar(x: number, y: number): void {
    const solved = this.climb.gates.filter((g) => g.solved).length;
    if (this.sent >= solved || this.sent >= this.stars.length) return;
    const slot = this.stars[this.sent++];
    const star = this.add.image(x, y, LEARN_HUD_STAR_TEXTURE);
    this.tweens.add({
      targets: star,
      x: slot.x,
      y: slot.y,
      duration: FLY_MS,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        star.destroy();
        slot.setAlpha(1);
        this.tweens.add({ targets: slot, scale: LAND_SCALE, duration: LAND_MS, yoyo: true });
      },
    });
  }

  private buildWord(word: string): void {
    const chars = [...word];
    const left = BASE_W / 2 - ((chars.length - 1) * WORD_CELL) / 2;
    this.letters = chars.map((ch, i) => this.add
      .text(left + i * WORD_CELL, TARGET_BOTTOM, ch, TARGET_FONT)
      .setOrigin(0.5, 1));
    this.frame = this.add
      .rectangle(left, TARGET_BOTTOM + 2, WORD_CELL - 2, FRAME_H)
      .setOrigin(0.5, 1)
      .setStrokeStyle(2, FRAME_COLOR);
  }

  /** Found letters green, the rest white, and the frame on the one to find; none on the roof. */
  private showWord(): void {
    const { storey, gates } = this.climb;
    this.letters.forEach((t, i) => t.setColor(gates[i].solved ? FOUND_COLOR : TARGET_FONT.color));
    const current = this.letters[storey];
    this.frame?.setVisible(current !== undefined);
    if (current) this.frame?.setX(current.x);
  }
}
```

In `next/src/scenes/LearnTowerScene.ts`, replace `import type { LearnHudData } from './LearnHudScene';` with `import type { LearnHudData, LearnHudScene } from './LearnHudScene';`.

Then, in the same file, replace:

```ts
      case 'bump-right':
        this.pop(this.blocks[event.storey][event.block]);
```

with:

```ts
      case 'bump-right':
        this.sendStar(this.blocks[event.storey][event.block]);
        this.pop(this.blocks[event.storey][event.block]);
```

Then, in the same file, replace:

```ts
  private shake({ box, restX }: BlockView): void {
```

with:

```ts
  /** The HUD's star for a right answer flies from the block: its centre, in screen px. */
  private sendStar({ box }: BlockView): void {
    const cam = this.cameras.main;
    const hud = this.scene.get(LEARN_HUD_SCENE_KEY) as LearnHudScene;
    hud.flyStar((box.x - cam.worldView.x) * cam.zoom, (box.y - cam.worldView.y) * cam.zoom);
  }

  private shake({ box, restX }: BlockView): void {
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  616 passed (616)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/i18n.test.ts \
  src/config/i18n.ts \
  src/scenes/LearnHudScene.ts \
  src/scenes/LearnTowerScene.ts
git commit -m "feat: the learn HUD shows the word, the speaker key, and each star flying home" -m "Words mode shows the whole word, found letters green and the one to find framed. A speaker hint says X asks the voice again. A right answer sends a star from the block to its slot, which lights and bounces as it lands, one per solved gate."
```

---

### Task 8: The learn session, and the result screen

`LearnSession { mode, used, score }` replaces `LearnTowerData`. The learn menu starts one;
each tower adds its score when the star is touched; the result screen carries it on to the
next tower, so the score adds up as the live `learn.score` does, until back to the menu.

Two seconds after the star, `LearnResultScene`, a port of the live `drawLearnResult`
(`index.html:2989-3023`):
- a cheer, picked once when the screen opens (`learn_cheers`, in the UI language);
- what was found: the four items, or the word;
- the session's score;
- the hero jumping (the one who climbed), bobbing as the live screen's does;
- confetti falling, already under way when the screen opens.

Confirm starts a new tower in the same mode with the session; back goes to the learn menu,
which the navigation table already says. `learnresult` now has a scene, so only `intro`
and `debug` are left without one.

**Files:**
- Create: `next/src/scenes/LearnResultScene.ts`
- Modify: `next/src/config/i18n.ts`
- Modify: `next/src/game/learn/types.ts`
- Modify: `next/src/scenes/LearnTowerScene.ts`
- Modify: `next/src/scenes/LearnMenuScene.ts`
- Modify: `next/src/scenes/keys.ts`
- Modify: `next/src/game/navigation.ts`
- Modify: `next/src/main.ts`
- Test: `next/tests/navigation.test.ts`
- Test: `next/tests/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

In `next/tests/navigation.test.ts`, replace:

```ts
 * a dispatch that covers all of them. Here a state is a scene, three states have no scene
 * yet, and a back route into one of those three would be a button that leads nowhere.
```

with:

```ts
 * a dispatch that covers all of them. Here a state is a scene, two states have no scene,
 * and a back route into one of those two would be a button that leads nowhere.
```

Then, in the same file, replace:

```ts
    expect(missing).toEqual(['intro', 'debug', 'learnresult']);
```

with:

```ts
    expect(missing).toEqual(['intro', 'debug']);
```

In `next/tests/i18n.test.ts`, replace:

```ts
 * The `learn_*` keys are learn mode's own words. The live game hardcodes them in Estonian
 * inside drawLearn and drawLearnMenu rather than keeping them in TRANSLATIONS, so the port's
 * versions are new keys with both languages.
```

with:

```ts
 * The `learn_*` keys are learn mode's own words. The live game hardcodes them in Estonian
 * inside drawLearn, drawLearnMenu and drawLearnResult rather than keeping them in
 * TRANSLATIONS, so the port's versions are new keys with both languages.
```

Then, in the same file, replace:

```ts
  'learn_speak',
];
```

with:

```ts
  'learn_speak', 'learn_cheers', 'learn_found', 'learn_result_hint',
];
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/navigation.test.ts tests/i18n.test.ts`

Expected: FAIL. `has every port-only key it claims to have` (the three new keys) and
`names exactly what is left to port`
(`expected [ 'intro', 'debug', 'learnresult' ] to deeply equal [ 'intro', 'debug' ]`).

- [ ] **Step 3: Implement**

The result scene keeps its data in `result`, not `data`, which is the scene's own
DataManager.

In `next/src/config/i18n.ts`, replace:

```ts
  // Learn mode's own words. The live game hardcodes them in Estonian inside drawLearn and
  // drawLearnMenu (index.html:2890, :2947-2955, :2983-2985); here they have both languages.
```

with:

```ts
  // Learn mode's own words. The live game hardcodes them in Estonian inside drawLearn,
  // drawLearnMenu and drawLearnResult (index.html:2890, :2929, :2947-2955, :2983-2985,
  // :3001-3021); here they have both languages.
```

Then, in the same file, replace:

```ts
  learn_speak:        {et:'🔊 X / {X}',               en:'🔊 X / {X}'},
```

with:

```ts
  learn_speak:        {et:'🔊 X / {X}',               en:'🔊 X / {X}'},
  learn_cheers:       {et:['TUBLI!','VÄGA HEA!','SUPER!','SUUREPÄRANE!','FANTASTILINE!'],
                       en:['WELL DONE!','VERY GOOD!','SUPER!','EXCELLENT!','FANTASTIC!']},
  learn_found:        {et:'Leitud:',                  en:'Found:'},
  learn_result_hint:  {et:'Space / {A} uus torn  •  ESC / {B} menüü',
                       en:'Space / {A} new tower  •  ESC / {B} menu'},
```

In `next/src/game/learn/types.ts`, replace:

```ts
import type { BodyMover } from '../player';
```

with:

```ts
import type { BodyMover } from '../player';
import type { LearnMode } from './content';
```

Then, in the same file, replace:

```ts
/** A map cell: column and row of the tower's map. */
```

with:

```ts
/**
 * One sitting at the learn tower, from the learn menu's confirm until back: the exercise,
 * what it has asked (the same array from tower to tower, emptied by pickTargets when a round
 * ends), and the score, which adds up tower after tower as the live `learn.score` does
 * (index.html:2650).
 */
export interface LearnSession {
  mode: LearnMode;
  used: string[];
  score: number;
}

/** A map cell: column and row of the tower's map. */
```

Create `next/src/scenes/LearnResultScene.ts`:

```ts
import Phaser from 'phaser';
import { BASE_W, STEP_MS } from '../config/constants';
import { T, TStr } from '../config/i18n';
import { pickFrom } from '../game/learn/content';
import type { LearnSession } from '../game/learn/types';
import { random } from '../game/random';
import { getSelectedChar, getSkinIndex } from '../game/run';
import { LEARN_SPARK_TEXTURE, registerLearnTiles } from '../gfx/learnTiles';
import { registerScaledPlayerTextures, scaledPlayerTextureKey } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEARN_RESULT_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

export interface LearnResultData {
  /** Carried on to the next tower, score and all. */
  session: LearnSession;
  /** What the tower asked, in order. All found: the star is past the fourth gate. */
  found: string[];
  /** The word it spelled, in words mode; otherwise null. */
  word: string | null;
}

/** index.html:2991: the result's deep blue. */
const BACKGROUND = '#1a2a4a';
/** index.html:2994: the confetti's five colours, falling down the screen. */
const CONFETTI_COLORS = [0xffdd00, 0xff69b4, 0x88ff88, 0x88ccff, 0xffaa44];
/** How long the confetti has already been falling when the screen opens. */
const CONFETTI_HEAD_START_MS = 6000;
/** index.html:3000-3010: the baselines of the cheer, what was found, and the score. */
const CHEER_Y = 80;
const FOUND_Y = 130;
const SCORE_Y = 170;
/** index.html:3013-3014: the hero jumping, at scale 3, 220 down, bobbing 5px either way. */
const HERO_SCALE = 3;
const HERO_Y = 220;
const BOB_PX = 5;
/** `Math.sin(animFrame*0.1)`: half a swing is π / 0.1 frames. */
const BOB_HALF_MS = (Math.PI / 0.1) * STEP_MS;
/** index.html:3021: the hint line. */
const HINT_Y = 360;
const CHEER_FONT = { fontFamily: 'monospace', fontSize: '28px', fontStyle: 'bold', color: '#ffdd00' };
const FOUND_FONT = { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' };
const SCORE_FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#aaddff' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaddcc' };

/**
 * After a tower: a cheer, what was found, the session's score and the hero jumping, under
 * falling confetti. A port of drawLearnResult (index.html:2989-3023), with the cheer chosen
 * once rather than hard-coded, and the hero the one who climbed. Confirm starts a new tower
 * in the same mode, the session carried on; back goes to the learn menu
 * (game/navigation.ts: `learnresult` goes back to `learnmenu`).
 */
export class LearnResultScene extends Phaser.Scene {
  /** Not `data`: that name is the scene's own DataManager. */
  private result!: LearnResultData;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(LEARN_RESULT_SCENE_KEY);
  }

  init(data: LearnResultData): void {
    this.result = data;
    this.leaving = false;
  }

  create(): void {
    registerLearnTiles(this);
    registerScaledPlayerTextures(this, [['jump', HERO_SCALE]]);
    this.cameras.main.setBackgroundColor(BACKGROUND);

    this.add.particles(0, -8, LEARN_SPARK_TEXTURE, {
      x: { min: 0, max: BASE_W },
      frequency: 60,
      lifespan: 9000,
      speedX: { min: -20, max: 20 },
      speedY: { min: 50, max: 90 },
      rotate: { start: 0, end: 360 },
      scale: { min: 1, max: 1.5 },
      tint: CONFETTI_COLORS,
      advance: CONFETTI_HEAD_START_MS,
    });

    const cheers = T('learn_cheers');
    const cheer = Array.isArray(cheers) ? pickFrom(cheers, random) : cheers;
    const { session, found, word } = this.result;
    this.add.text(BASE_W / 2, CHEER_Y, cheer, CHEER_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, FOUND_Y, `${TStr('learn_found')} ${word ?? found.join(' ')}`, FOUND_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, SCORE_Y, `${TStr('score_label')}${session.score}`, SCORE_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, HINT_Y, TStr('learn_result_hint'), HINT_FONT).setOrigin(0.5, 1);

    const character = getSelectedChar();
    const hero = this.add
      .image(BASE_W / 2, HERO_Y - BOB_PX, scaledPlayerTextureKey(character, getSkinIndex(character), 'jump', HERO_SCALE))
      .setOrigin(0.5, 0);
    this.tweens.add({ targets: hero, y: HERO_Y + BOB_PX, duration: BOB_HALF_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.keys = bindMenuKeys(this);
  }

  update(): void {
    if (this.leaving) return;
    if (pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      this.scene.start(LEARN_TOWER_SCENE_KEY, this.result.session satisfies LearnSession);
      return;
    }
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'learnresult');
    }
  }
}
```

In `next/src/scenes/LearnTowerScene.ts`, replace:

```ts
import { createClimb, stepClimb } from '../game/learn/climb';
import type { LearnMode } from '../game/learn/content';
```

with:

```ts
import { createClimb, stepClimb } from '../game/learn/climb';
```

Then, in the same file, replace `import type { Climb, ClimbEvent, ClimbMove } from '../game/learn/types';` with `import type { Climb, ClimbEvent, ClimbMove, LearnSession } from '../game/learn/types';`.

Then, in the same file, replace:

```ts
import { LEARN_HUD_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnHudData, LearnHudScene } from './LearnHudScene';
```

with:

```ts
import { LEARN_HUD_SCENE_KEY, LEARN_RESULT_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnHudData, LearnHudScene } from './LearnHudScene';
import type { LearnResultData } from './LearnResultScene';
```

Then, in the same file, delete:

```ts
export interface LearnTowerData {
  mode: LearnMode;
  /** What this round has asked: the same array from tower to tower, emptied by pickTargets when a round ends. */
  used: string[];
}

```

Then, in the same file, replace:

```ts
/** After the star, a new tower in the same mode. The result screen goes here. */
const NEXT_TOWER_MS = 2000;
```

with:

```ts
/** After the star, the result screen. */
const RESULT_DELAY_MS = 2000;
```

Then, in the same file, replace:

```ts
  private mode: LearnMode = 'letters';
  private used: string[] = [];
```

with:

```ts
  private session: LearnSession = { mode: 'letters', used: [], score: 0 };
```

Then, in the same file, replace:

```ts
  init(data: LearnTowerData): void {
    this.mode = data?.mode ?? 'letters';
    this.used = data?.used ?? [];
```

with:

```ts
  init(data: Partial<LearnSession>): void {
    // The learn menu starts a session and the result screen carries it on. Started bare, from
    // a console, a tower is a letters one.
    this.session = { mode: data?.mode ?? 'letters', used: data?.used ?? [], score: data?.score ?? 0 };
```

Then, in the same file, replace:

```ts
    this.climb = createClimb(this.mode, this.used, this.character);
```

with:

```ts
    this.climb = createClimb(this.session.mode, this.session.used, this.character);
```

Then, in the same file, replace:

```ts
      case 'finished':
        this.tweens.killTweensOf(this.star);
```

with:

```ts
      case 'finished':
        this.session.score += this.climb.score;
        this.tweens.killTweensOf(this.star);
```

Then, in the same file, replace:

```ts
        this.time.delayedCall(NEXT_TOWER_MS, () => {
          this.scene.restart({ mode: this.mode, used: this.used } satisfies LearnTowerData);
        });
```

with:

```ts
        this.time.delayedCall(RESULT_DELAY_MS, () => {
          this.scene.start(LEARN_RESULT_SCENE_KEY, {
            session: this.session,
            found: this.climb.layout.storeys.map((st) => st.target),
            word: this.climb.layout.word,
          } satisfies LearnResultData);
        });
```

Then, in the same file, replace:

```ts
 * voice and the effects.
 *
 * Back goes to the learn menu (game/navigation.ts: `learnletters` is not pausable).
```

with:

```ts
 * voice and the effects. The star ends it, and the result screen follows.
 *
 * Back goes to the learn menu (game/navigation.ts: `learnletters` is not pausable).
```

In `next/src/scenes/LearnMenuScene.ts`, replace:

```ts
import type { LearnMode } from '../game/learn/content';
```

with:

```ts
import type { LearnMode } from '../game/learn/content';
import type { LearnSession } from '../game/learn/types';
```

Then, in the same file, delete:

```ts
import type { LearnTowerData } from './LearnTowerScene';
```

Then, in the same file, replace:

```ts
      this.scene.start(LEARN_TOWER_SCENE_KEY, { mode: this.cards[this.index].mode, used: [] } satisfies LearnTowerData);
```

with:

```ts
      this.scene.start(LEARN_TOWER_SCENE_KEY, { mode: this.cards[this.index].mode, used: [], score: 0 } satisfies LearnSession);
```

In `next/src/scenes/keys.ts`, replace:

```ts
/** What to find and how many gates are done. Runs alongside the tower. */
export const LEARN_HUD_SCENE_KEY = 'LearnHud';
```

with:

```ts
/** What to find and how many gates are done. Runs alongside the tower. */
export const LEARN_HUD_SCENE_KEY = 'LearnHud';
/** After a tower: the cheer, what was found and the score (`learnresult`). */
export const LEARN_RESULT_SCENE_KEY = 'LearnResult';
```

Then, in the same file, replace:

```ts
 * and the label is a scene of its own already (LevelOverlayScene). Three states map to
 * nothing at all — `intro` and `debug` are not ported, and `learnresult` arrives with the
 * learn tower's second plan.
```

with:

```ts
 * and the label is a scene of its own already (LevelOverlayScene). Two states map to
 * nothing at all: `intro` and `debug` are not ported.
```

Then, in the same file, replace:

```ts
  learnletters: LEARN_TOWER_SCENE_KEY,
```

with:

```ts
  learnletters: LEARN_TOWER_SCENE_KEY,
  learnresult: LEARN_RESULT_SCENE_KEY,
```

In `next/src/game/navigation.ts`, replace:

```ts
 * Three of them have no scene in this port: `intro` and `debug` are not ported, and
 * `learnresult` arrives with the learn tower's second plan. They are in the union anyway,
 * because the TABLE is what is being ported and a half-copied table is the thing the live
 * comment warns about. Their rows cost nothing and they are already correct for the plan
 * that adds the screens.
```

with:

```ts
 * Two of them have no scene in this port: `intro` and `debug` are not ported. They are in
 * the union anyway, because the TABLE is what is being ported and a half-copied table is the
 * thing the live comment warns about. Their rows cost nothing.
```

In `next/src/main.ts`, replace:

```ts
import { LearnHudScene } from './scenes/LearnHudScene';
```

with:

```ts
import { LearnHudScene } from './scenes/LearnHudScene';
import { LearnResultScene } from './scenes/LearnResultScene';
```

Then, in the same file, replace:

```ts
    LearnHudScene,
    DifficultyScene,
```

with:

```ts
    LearnHudScene,
    LearnResultScene,
    DifficultyScene,
```

- [ ] **Step 4: Run everything and type-check**

Run: `npm test && npm run build`

Expected: `Tests  616 passed (616)`; `tsc` reports nothing; Vite builds (its chunk-size warning is Phaser's, and was there before).

- [ ] **Step 5: Commit**

```bash
git add tests/navigation.test.ts \
  tests/i18n.test.ts \
  src/config/i18n.ts \
  src/game/learn/types.ts \
  src/scenes/LearnResultScene.ts \
  src/scenes/LearnTowerScene.ts \
  src/scenes/LearnMenuScene.ts \
  src/scenes/keys.ts \
  src/game/navigation.ts \
  src/main.ts
git commit -m "feat: the learn result screen, and a session that keeps the score" -m "LearnSession carries the mode, what has been asked and the score from the learn menu through every tower, replacing LearnTowerData. Two seconds after the star, LearnResultScene shows a cheer picked once, what was found, the score, the hero jumping and falling confetti. Confirm starts a new tower in the same mode; back goes to the learn menu. learnresult now has a scene, which leaves only intro and debug without one."
```

---

### Task 9: Check it in a browser, and bring the spec up to date

No new code. The spec's browser checks that step 4 can answer, and the spec's text brought
in line with what was built.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-learn-tower-design.md`

- [ ] **Step 1: Run the suite and the build once more**

Run: `npm test && npm run build`

Expected: `Tests  616 passed (616)`; `tsc` reports nothing; Vite builds.

- [ ] **Step 2: Play it**

`npm run dev`, then Title → the learn card → each mode. An automated check can do it all in
one hidden tab by stepping the game by hand. Paste this setup into the page first; it
records speech and buzzes instead of making them, and gives Phaser's tweens a clock that
follows the steps:

```js
window.__said = []; window.__rumbles = [];
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
  getVoices: () => [], addEventListener() {},
  cancel() { __said.push('<cancel>'); }, speak(u) { __said.push(u.text); } } });
const pad = { id: 'fake pad', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
  vibrationActuator: { playEffect: (type, p) => { __rumbles.push(p); return Promise.resolve('complete'); } } };
navigator.getGamepads = () => [pad, null, null, null];
// Tweens read Date.now(); make it follow the steps. Never pace with setTimeout: a hidden tab
// throttles timers to about one a second.
window.__clock = Date.now(); Date.now = () => window.__clock;
window.__now = performance.now();
window.__step = (n) => { for (let i = 0; i < n; i++) {
  __now += 1000 / 60; __clock += 1000 / 60; game.step(__now, 1000 / 60); } };
window.__key = (type, code, key, keyCode) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, key, keyCode, bubbles: true }));
```

Check, and write down anything that differs:
- **Wrong letter:** the block shakes 3px and settles back; a low tone; the dull buzz
  (`{ duration: 200, strongMagnitude: 0.35, weakMagnitude: 0 }`); the target said again.
- **Two misses:** the right block glows (its Glow's `outerStrength` breathing 0 to 6) and
  pulses (scale 1 to 1.12).
- **Right letter, jump let go the moment the head hits it:** the spring still carries the
  hero into the next storey. The block pops (scale to about 1.6, alpha to 0, then hidden);
  16 sparks and 16 brick chunks; the camera's pan starts on the bump, not later; the
  trapdoor shuts on the same step the storey changes; the light buzz
  (`{ duration: 120, strongMagnitude: 0, weakMagnitude: 0.6 }`); the voice says the letter
  and "Tubli!", then the next target queued behind it (no cancel before it).
- **HUD:** the target and `🔊 X / Ⓧ`; a star flies from the block to the first slot, which
  lights and bounces. Words mode: the word, the found letter green, the frame moving to the
  next letter when the hero reaches the next storey, all green and no frame on the roof.
- **Voice rules:** at the tower's door the voice stays quiet after the first line; X says
  the target (a syllable in lower case); words mode says "kass. K." and so on.
- **The star:** 60 confetti, the star pops, "Fantastiline!", and the result screen two
  seconds later.
- **Result screen:** the cheer, "Leitud: …", "Punktid: …", the hero jumping, confetti.
  Confirm starts a new tower in the same mode with the score carried (a second result shows
  the two towers' total); back goes to the learn menu, its cursor where it was.
- **Back from the tower** goes to the learn menu and hushes the voice.
- **The console** shows no errors from the game (a Chrome extension's "Could not establish
  connection" is not the game's).

These were all seen as described in the dry run.

- [ ] **Step 3: Bring the spec up to date**

In `docs/superpowers/specs/2026-09-23-learn-tower-design.md`, replace:

```md
| Zoom | 1.25 (the adventure uses 1.5) | So a one- or two-plank storey fits on screen whole. |
```

with:

```md
| Zoom | 1.25 (the adventure uses 1.5) | So a one- or two-plank storey fits on screen whole. |
| Hint | Phaser's Glow round the right block, and the block pulsing in size | White over the gold was too faint to find (1.24:1); movement catches the eye. |
```

Then, in the same file, replace:

```md
5. If the child ever stands on the letter floor with the trapdoor still open, a jump under
   the opening springs them again. Nobody can get stuck below a solved gate.
```

with:

```md
5. If the child ever stands on the letter floor with the trapdoor still open, the trapdoor
   shuts and the right block comes back, and bumping it springs them again. Play does not
   produce this (a counted bump leaves the hero at least 3px inside the opening); it is a
   safety net, so nobody can get stuck below a solved gate.
```

Then, in the same file, replace:

```md
the voice says the target again. Nothing is lost. After two wrong answers at a gate, the
right block glows until it is found.
```

with:

```md
the voice says the target again. Nothing is lost. After two wrong answers at a gate, the
right block glows and pulses until it is found.
```

Then, in the same file, replace:

```md
- Springing into the next storey pans the camera to it.
```

with:

```md
- A right answer pans the camera up to the next storey as the spring starts, so the hero
  never rises behind the HUD.
```

Then, in the same file, replace:

```md
- `types.ts`: the climb's state, the events the scene draws from, and the mover's contract.
  Cues (sounds, events) come back as values, the way `World.sounds` does for the adventure.
```

with:

```md
- `speech.ts`: what the voice says and when (see *Voice*), as lines for the scene to speak.
- `types.ts`: the climb's state, the events the scene draws from, and the learn session.
  Cues (sounds, buzzes, speech, events) come back as values, the way `World.sounds` does
  for the adventure. The mover's contract is `game/player.ts`'s `BodyMover`.
```

- [ ] **Step 4: Commit**

```bash
git add ../docs/superpowers/specs/2026-09-23-learn-tower-design.md
git commit -m "docs: the learn tower spec, as Part 2a built it" -m "The hint's glow and pulse get a row in the decisions, the re-arm says what it does, the camera pans on the right answer, and the module list has speech.ts and the learn session."
```

- [ ] **Step 5: Record the outcome**

If everything holds, that is the task. If something is off, fix it in a new commit that says
what was wrong, and re-run Step 2. Anything that is a design question rather than a bug (the
glow too strong, the voice too fast, the effects too busy) goes to the owner, not into code.

---

## Self-review against the spec

Spec coverage for step 4, *the learning around it*:

| Spec requirement | Task |
|---|---|
| Voice: speechSynthesis, et → fi → it → default, re-picked on `voiceschanged`, rate 0.8, pitch 1.1, always Estonian | 4 |
| Voice: the target at the start, on landing in a new storey, on reaching the letter floor unless spoken in the last 4 s, after a wrong answer, on X | 5 |
| Voice: the letter and a cheer after a right answer, the next target queued after it; "KASS. K." in words mode | 5 |
| Voice: silent and fully playable with no voice | 4 |
| Right answer: pop, sparkle, coin sound, light buzz, +50, a star flies to the HUD | 3, 6, 7 (the coin and +50 are Plan 8's) |
| Wrong answer: wobble (Plan 8), the live low tone, a duller buzz, the target again | 3, 5 |
| The glow after two misses (now with movement) | 6 |
| HUD: the prompt, the target large, the whole word with found letters green and the current one framed, the speaker with the X glyph, four stars; no score | 7 |
| The star: win sound (Plan 8), confetti, a cheer from the voice, +100 (Plan 8) | 5, 6 |
| The result screen two seconds later: the cheer chosen once, what was found, the score, the hero jumping; confirm → a new tower, back → the learn menu | 8 |
| An `sfxWrong` beside the other effects | 3 |
| `SCENE_FOR_STATE` for `learnresult`; every learn state has a scene | 8 |
| Test: the September plan's `pickVoiceFrom` cases | 4 |
| Browser: X replays the voice; back works from the tower and the result screen | 9 |

Left for Plan 10, as the spec's build order has it: the castle (step 5) and the playtest
notes (step 6), with the trapdoor's swing tween and the opt-in real-Arcade check.

## What only a person can check

- Whether the kids' laptop has an Estonian, Finnish or Italian voice, and how it sounds
  reading the letters, the syllables and "kass. K.".
- The buzzes on a real controller, and whether the dull one reads as "not that one" rather
  than as a telling-off.
- Whether a child notices the pulsing glow without being told.
- Whether the pop, the chunks and the confetti are fun or too busy.
- Gamepad input on the result screen; a 120 Hz screen.
