# Phaser Migration, Plan 6: Scenes and the HUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the port from one level you can play into a game you can start, choose, lose,
win and carry on through — and put the numbers back on screen.

**Architecture:** One Phaser Scene per `gameState`, per the spec. Navigation stays a pure
data table in `src/game/` so it can be tested headlessly; drawing does not, and is checked
by eye.

**Tech Stack:** Phaser 4, TypeScript, Vitest.

---

## Why this before the remaining enemies

The spec sequences the rest of the world (step 6) ahead of the scenes (step 7). That order
no longer holds, for two reasons found while finishing Plan 5:

- **`won` is terminal and nothing selects a level.** Enemies built for levels 2-6 would be
  unreachable. Ghosts and a boss nobody can get to are not progress.
- **`super_easy` is finished and unplayable.** `startWithCape`, `capeSavesPit` and the
  extra-pickup rule are ported and tested, but `SliceScene` hardcodes `'normal'`, so the
  gentlest difficulty — the one small children actually want — cannot be reached in a
  browser. A difficulty scene unlocks work that already exists.

## Keep it lean

Plan 5's rules carry over, with one change that matters:

- **No unit tests for drawing.** Most of this plan is drawing.
- **The navigation table is the exception and must be tested.** It is pure data plus a pure
  function, the live game already tests it (`testBackNav`, `index.html:3232`), and it
  encodes a bug that has already bitten once — see Task 3.
- **No test-per-scene.** One test over the transition table beats ten over ten scenes.
- No mutation testing unless a test's value is genuinely in doubt.

`npm run build && npm test` before each commit. **354 tests pass today.**

## What is in scope

The ten states the adventure uses: `title`, `modeselect`, `difficulty`, `select`, `intro`,
`between`, `levelcomplete`, `gameover`, `win`, `paused`. Plus the HUD and the power-up
popup.

## What is deliberately out

- **Learn mode** — `learnmenu`, `learnletters`, `learnresult` and `drawLearn`. Spec step 8,
  its own plan. Mode select will offer it; picking it can land on a stub that says so.
- **`debug`** — the level-jump state. Developer tooling, not the children's game.
- **The remaining enemies and the boss.** Next plan, and reachable once this one lands.
- **Sound.** The audio engine has existed since Plan 1 and is still not wired to anything.
  It wants doing, but menu music is a poor place to start; it belongs with gameplay sound.
- **The felt shader**, still deferred at the owner's request.

## The one architectural risk

Everything in this plan is presentation and input, and **presentation has no golden-trace
safety net.** The frame-by-frame harness that caught six real bugs across Plans 4 and 5
compares simulation state; it cannot tell you a menu is ugly or that a button does nothing.

So the discipline changes shape here:

- **Keep logic out of the scenes.** Anything that decides *what happens* — which scene
  follows which, whether a state can be paused, which difficulty record a choice maps to —
  goes in `src/game/` as pure functions, no Phaser import, and gets tested. Scenes should
  only draw and forward input.
- **The HUD reads world state and never writes it.** If a HUD scene mutates the world, the
  simulation's guarantees stop meaning anything.

## Scale

Measured from the live source, drawing only, excluding the state machine and input:

| Function | Lines |
|---|---|
| `drawBetween` (`:2170`) | 209 |
| `drawIntro` (`:2020`) | 100 |
| `drawModeSelect` (`:1965`) | 54 |
| `drawPowerupPopup` (`:3140`) | 45 |
| `drawPauseOverlay` (`:1902`) | 31 |
| `drawDifficulty` (`:2121`) | 29 |
| `drawTitle` (`:1937`) | 27 |
| `drawSelect` (`:2151`) | 18 |
| `drawWin` (`:2447`) | 14 |
| `drawGameOver` (`:2441`) | 5 |

Plus the HUD at `:1854-1870` and the state dispatch in `update()` from `:1274`.

`drawBetween` is a third of the plan on its own and is the one task worth splitting if it
fights back.

---

## Task 1: The HUD

**Files:** `next/src/scenes/HudScene.ts` (new), `SliceScene.ts`

A concurrent scene at scale 1. The live HUD is drawn in unzoomed 640×400 space after both
camera transforms are popped (`index.html:1854-1870`), so it maps directly onto a parallel
scene and must **not** inherit the world camera's zoom or scroll.

What it draws: hearts for lives (with an `∞` when `lives === Infinity`), the score, the
level name and difficulty, then the cat / cape / bow icons right-aligned with their counts,
then the fart and big-head icons below the hearts.

Three things to get right:

- **`lives === Infinity` draws one heart and an infinity glyph**, not an infinite loop.
  This is a real difficulty setting, not a debug state.
- **The icon row is right-aligned with a running cursor** (`hx` walking left by 22 per
  icon), so which icons are present changes where the others sit.
- **Read-only.** The HUD takes `World` and renders it. It must not write to it.

The spec notes this also removes a transform-stack coupling that caused a real bug
(`bb84c41`): the live tile loop strokes without setting `lineWidth`, so one pause left every
block border fat for the rest of the level. A parallel scene cannot do that to the world.

**Test:** none. Look at it.

---

## Task 2: The power-up popup

**Files:** `next/src/scenes/HudScene.ts` or its own scene, `SliceScene.ts`

`drawPowerupPopup` (`index.html:3140-3184`) with `POWERUP_INFO` (`:1143-1147`), which
carries a name, description, colour and emoji per type in both languages.

The simulation side is **already done and tested**: bumping a rainbow block sets
`world.powerupPopup` and freezes the whole world for 120 frames. Right now nothing draws it,
so that freeze reads as a hang — this task is what makes two seconds of stillness legible.

Watch the timer: the popup's `timer` counts **down** from 120 and the live draw uses it
against `maxTimer` for its animation, so both fields matter.

**Test:** none. Look at it, and confirm the freeze now explains itself.

---

## Task 3: Navigation, as testable data

**Files:** `next/src/game/navigation.ts` (new), `next/tests/navigation.test.ts` (new)

The one part of this plan that is logic rather than paint, and the one part that gets tested.

```js
const BACK_TARGET={
  modeselect:'title', difficulty:'modeselect', select:'difficulty',
  intro:'select', gameover:'modeselect', win:'modeselect', debug:'title',
  learnmenu:'modeselect', learnletters:'learnmenu', learnresult:'learnmenu'
};
const PAUSABLE=['playing','dead','between','levelcomplete'];
```

Read the comment above `BACK_TARGET` at `index.html:1230-1232` before writing anything. It
records a bug that shipped: back navigation covered 7 of 15 states, so **picking a character
locked the player into the adventure with no exit at all on a controller.** That is the
failure this table exists to prevent, and it is why this is the one thing here worth a test.

`PAUSABLE` encodes a deliberate decision too: mid-run, the Select button opens the pause
menu rather than quitting, because it is easy to hit by accident and binning a child's run
for it would be its own kind of cruel.

Port both as data plus pure functions — no Phaser import. Mirror the live game's own
`testBackNav` (`index.html:3232`): assert over the **whole** table that every reachable
non-root state has a back target, rather than spot-checking a few entries. One assertion
over the collection, not ten over ten states.

Include the learn-mode entries even though learn mode is out of scope — they are part of the
table's shape, and omitting them is how the original bug happened.

---

## Task 4: Title and mode select

**Files:** `next/src/scenes/TitleScene.ts`, `ModeSelectScene.ts` (new), `BootScene.ts`

`drawTitle` (`:1937-1963`) and `drawModeSelect` (`:1965-2018`).

Boot should now land on the title rather than straight into the level. Mode select offers
adventure and learn; **learn is out of scope, so route it to a placeholder that says so
rather than a dead button.** A button that does nothing is worse than one that admits it.

The title's `press_start` string carries a `{A}` placeholder that `T()` resolves to a
gamepad glyph by action name — the port has this from Plan 1, so use it rather than
hardcoding a letter.

**Test:** none beyond Task 3's table.

---

## Task 5: Difficulty and character select

**Files:** `next/src/scenes/DifficultyScene.ts`, `CharacterScene.ts` (new)

`drawDifficulty` (`:2121-2149`) and `drawSelect` (`:2151-2168`).

**This is the task that unlocks finished work.** `createWorld` already takes a difficulty
and a character; `SliceScene` hardcodes `'normal'` and gigi. Wire the choice through and
`super_easy` — cape at spawn, cape saves pits, extra pickups every 20 tiles, `lives:
Infinity` — becomes playable for the first time, along with Dodo and the skins.

The difficulty screen shows each record's own numbers (`index.html:2133` reads
`cfg.bowCharges`), so it must read the real records rather than a hardcoded summary, or the
screen will drift from the game.

Character select is the smallest scene here (18 lines) and the one the children will use
every single time.

---

## Task 6: Finishing a level, and the next one

**Files:** `next/src/scenes/BetweenScene.ts` (new), `next/src/game/world.ts`

`drawBetween` (`:2170-2378`) — 209 lines, the biggest single piece in this plan.

Today `checkRescue` sets `world.won` and that is the end: `won` is terminal, with a comment
in `world.ts` saying so. This task makes winning advance instead, through the between-level
card and into the next level.

Read `drawBetween` before estimating. If it turns out to be two separable things — a results
card and a level-intro card — say so and split the task rather than writing one 200-line
scene. Splitting is the expected outcome, not a failure.

**Check what the live game does with `score` and `lives` across a level boundary** rather
than assuming. Plan 5 learned that `score` survives death but the map does not; the same
question applies here and the answer is in `initLevel`'s call sites, not in this plan.

---

## Task 7: Game over and win

**Files:** `next/src/scenes/GameOverScene.ts`, `WinScene.ts` (new)

`drawGameOver` (`:2441-2445`, five lines) and `drawWin` (`:2447-2460`, fourteen).

Small scenes, but they need the surrounding logic: lives reaching zero ends the run, and
finishing the last level wins the game. Both route back to mode select via Task 3's table.

The win screen draws a heart at scale 1.5 — Plan 1 established that sprite scale is
**per draw-site, not per sprite**, so do not reuse the HUD's.

---

## Task 8: Pause

**Files:** `next/src/scenes/PauseScene.ts` (new)

`drawPauseOverlay` (`:1902-1932`), launched as a **parallel scene over a paused game scene**.

This is where the port gets to be plainly better than the original. The live `draw()`
temporarily reassigns `gameState` to `pausePrev` inside a `try/finally` so it can reuse the
draw dispatch (`index.html:1653-1658`). A parallel scene deletes that hack outright.

Pausing must freeze the simulation without discarding it, and `PAUSABLE` from Task 3 decides
where pausing is allowed at all.

---

## Task 9: The intro

**Files:** `next/src/scenes/IntroScene.ts` (new)

`drawIntro` (`:2020-2119`), 100 lines of story cutscene — the kidnapping that sets up the
rescue.

Last because it is the most skippable: it already exits on a key press after 120 frames and
auto-advances at 660. It is also the most likely to be re-cut with the children later, so it
is the worst place to spend effort before they have seen the rest.

---

## Done when

- [ ] You can start at the title, choose adventure, difficulty and character, and play.
- [ ] `super_easy` is reachable and visibly different — cape at spawn, infinite lives.
- [ ] Finishing level 1 leads to level 2 rather than stopping.
- [ ] Lives reaching zero ends the run; finishing the last level wins.
- [ ] Pause works mid-run and back navigation never strands you.
- [ ] The HUD shows lives, score, level and every power-up icon.
- [ ] A rainbow block's freeze shows a popup rather than looking like a hang.
- [ ] The navigation table is tested across every state, not spot-checked.
- [ ] All 354 existing tests still pass and `src/game/` still imports no Phaser.
- [ ] `index.html` untouched.

## What comes next

The remaining enemies and the boss — now reachable. Then learn mode, input and gamepad
unification, the felt shader, and cutover.
