# Migrating Gigi & Dodo to Phaser 4

**Date:** 2026-09-20
**Status:** Decisions locked, awaiting spec review; implementation plan pending

## Summary

Rewrite the game on Phaser 4.2.1 in a single push. TypeScript, Vite, ES modules.
The engine changes; the game does not. Behaviour is preserved bug-for-bug, including
the known defects, so that "did I break it?" stays answerable at every step of a
2,400-line rewrite. Re-tuning is a separate pass afterwards, with the kids in the loop.

## Why

Four motivations, all stated by the project owner, in descending order of what Phaser
actually delivers:

1. **Capability ceiling.** Phaser 4 replaced the v3 pipeline with a node-based renderer
   and a unified Filter system. The felt art style becomes a fragment shader instead of
   per-pixel CPU work. `felt-poc.html`'s stitched renderer — jittered overlapping blobs,
   thread strokes, blurred shadows — was built and abandoned because it could not be
   afforded on CPU. A shader makes it affordable. (Not in this scope; this rewrite
   matches today's look. But it becomes reachable.)
2. **Performance.** Not acute. `56f8457` already measured felt at 19.8 → 7.7 ms and flat
   at 11.5 → 6.6 ms against a 16.7 ms budget. The cost was `RENDER` 3 → 2, giving up the
   sharpness that `29ae640` had just added, plus a one-way runtime downgrade watchdog.
   WebGL rendering returns that headroom.
3. **Feature velocity.** Tweens, particle emitters, timers, camera effects and scenes
   replace bespoke implementations, so new requests from the kids map onto engine
   primitives instead of new hand-written subsystems.
4. **Standard tooling.** Conventional, documented, modular code.

### What the migration honestly does not buy

Stated up front so the plan is not oversold:

- **Audio gains nothing.** The Web Audio synth is a proper lookahead scheduler
  (`index.html:457-495`): it schedules melody, bass, harmony and percussion against
  absolute `audioCtx.currentTime` with a 400 ms window, a 120 ms re-arm tick and a
  stale-timer guard. Phaser's sound manager plays samples. This code moves verbatim.
- **~700 lines are pure data** — 33 sprite arrays with palettes, 6 levels, ~90
  translation keys, 4 difficulty records, 10 BGM themes. They move unchanged.
- **~1,000 lines of canvas-drawn UI** — menus, HUD, hand-built speech-bubble paths —
  must be rewritten as Phaser objects for no functional gain. This is the single largest
  cost in the project and it buys nothing except consistency.
- **Half the enemies are not physics-driven** and should not become so. Bats and ghosts
  write `y` from a sine each frame; the boss never integrates `y` at all; projectiles
  have constant velocity and no gravity. Arcade Physics is the wrong tool for these.
- **Learn mode (563 lines)** is a self-contained sub-game with its own physics integrator
  and its own screens. It is ported because the cutover must be feature-complete, not
  because Phaser improves it.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Migration shape | Big-bang rewrite | Owner's call over a staged strangler. Clean result, no hybrid to unwind. |
| Engine | Phaser 4.2.1 | Current release. 345 KB gzip. Canvas renderer is deprecated in v4, so WebGL in practice. |
| Language | TypeScript | Phaser ships full type definitions. Catches the class of bug the git history shows: wrong field names, stale state. |
| Build | Vite + npm | `npm run dev` for HMR; CI builds and uploads `dist/` to Pages. |
| Behaviour | Bug-compatible | The rewrite changes the engine, never the game. See the compatibility contract below. |
| Learn mode | Ported in the same push | Cutover is feature-complete; kids lose nothing on switchover day. |
| Felt style | Shader, matching today's look | Palette, grain and shadow on GPU. Bevel baked at boot (see caveat). |
| Tests | Grown step by step | Vitest, added per module as each lands, checked against the old build's output. |
| Cutover | Coexist, then flip | The current game stays live and untouched for the whole rewrite. Nothing is deleted until the switch is confirmed. |

### Build-step consequence

Native ES modules do not work over `file://` — module scripts are fetched with CORS and a
`file://` origin is opaque. The README's "open `index.html` in a browser, no build step"
and "modular, conventional code" cannot both hold. Vite was chosen, so:

- Local play *of the rewrite* becomes `npm run dev`. The current game keeps opening from
  `file://` exactly as it does today, for as long as it exists.
- `.github/workflows/static.yml` keeps `path: '.'` and gains a build step ahead of it, so
  the uploaded artifact contains both games. It does not switch to uploading `dist/` alone
  until cutover.
- The deployed GitHub Pages URL is unaffected — it is how the kids play, and it keeps
  working throughout.

## Coexistence and cutover

The rewrite is big-bang in *construction* but staged in *rollout*. The current game is not
touched until the new one has earned the switch.

- `/index.html` — the current game. Stays at the repo root, deployed, playable, and open to
  small changes for the entire rewrite.
- `/next/` — the Vite project. Served at the same Pages URL under `/next/`, so the kids can
  try it whenever they like, on the device they already play on, without installing anything.
- `scripts/run-tests.js` — keeps running against the untouched `index.html` the whole time.
  The old safety net is not retired until the new one has replaced it.

This is what makes the big-bang shape survivable. The usual objection — that a long rewrite
freezes the feedback loop that drives the project — mostly goes away when the live game
never stops working and the replacement is playable in progress.

**Cutover** happens only after the kids have played `/next/` and agreed it is the better
game. It is a promotion, not a demolition: the current game moves to `/classic/` rather than
being deleted, so reverting is editing a link rather than a revert commit. `scripts/run-tests.js`
is retired at that point, and the README is rewritten (see corrections below).

The one real cost: while both exist, a new feature requested by the kids either lands only
in the live game (and must be rebuilt in the port) or waits. That is a per-request decision,
not a blanket freeze.

## Target architecture

### Repo layout

Everything new lives under `next/`. The repo root keeps the current game exactly as it is
until cutover.

```
index.html              THE CURRENT GAME — untouched until cutover
sprites.html            sprite review tool, keeps reading the old arrays
felt-lab.html           felt tuning tool
scripts/run-tests.js    old harness, keeps running against index.html
next/
  index.html            Vite entry, thin
  package.json / tsconfig.json / vite.config.ts
  src/
    main.ts             Phaser.Game config, scene registry
    config/             constants, difficulty, i18n
    data/               sprites/, levels, parallax, bgm themes
    audio/              synth, sfx, bgm scheduler  (logic unchanged)
    gfx/                rasterise, texture registration, felt/, tilemap
    entities/           Player, enemies/, Boss, Cat, projectiles
    systems/            input, gamepad, powerups
    scenes/             Boot, Title, ModeSelect, Difficulty, CharSelect,
                        Intro, Game, Hud, Pause, Between, GameOver, Win,
                        learn/
    state/              run.ts — currentLevel, lives, score
  tests/                Vitest, grown alongside
```

The sprite arrays are duplicated into `next/src/data/sprites/` rather than shared, because
the old game needs them as globals in one script and the new one needs them as ES module
exports. They are static data the kids rarely change; if one does change during the rewrite,
it changes in both. `sprites.html` and `felt-lab.html` keep pointing at the old copy until
cutover.

### Scenes replace the `gameState` string

Today: one string (`index.html:980`), 17 reachable states, 20 bare assignment sites, and
two parallel if-chains — update at `:1265`, draw at `:1654` — that must be kept in sync
by hand.

After: one Phaser Scene per state. Two things survive because they are the good parts:

- **`BACK_TARGET`** (`:1231`) becomes a scene-key table. It is the one declarative
  construct in the current code and it already has tests (`testBackNav`, `:3223`).
- **State-dependent input mapping** — gamepad button 3 (△/Y) and 5 (R1/RB) are menu-only
  on purpose, because kids hit them mid-run.

Pause becomes a parallel scene launched over a paused GameScene. This deletes the hack in
`draw()` (`:1644-1650`) where `gameState` is temporarily reassigned to `pausePrev` inside a
`try/finally` so the draw dispatch can be reused.

### HUD as a parallel Scene

The HUD is already drawn in unzoomed 640×400 space after both camera transforms are popped
(`:1846-1891`), so it maps directly onto a concurrent scene at scale 1. This also removes
the transform-stack coupling that caused `bb84c41`: the tile loop strokes bricks without
setting `lineWidth`, so one pause left every block border fat for the rest of the level.

### Fixed 60 Hz step

Every timer in the game is a raw frame count — `fartTimer=900`, `invincible`, `stateTimer`,
`animFrame`, `screenShake.duration`, particle `life` — and the loop is bare rAF with no
delta (`:3409-3417`). On a 120 Hz display the game runs at double speed today.

`GameScene.update(time, delta)` runs an accumulator that calls `step()` at exactly 60 Hz.
Frame-count semantics are preserved verbatim, so no timer code is rewritten, and the 120 Hz
bug is fixed as a side effect. No render interpolation: it is pixel art and the camera is
already `Math.round`ed at draw time (`:1677`).

> This is the one place where "bug-compatible" is deliberately violated, because the
> existing behaviour is not a game design choice — it is a bug that makes the game
> unplayable on high-refresh displays.

### Textures generated at boot

Sprite arrays stay the source of truth. They are the kids' art, and `sprites.html` reads
them for review. `BootScene` rasterises each into a canvas and registers it via
`textures.addCanvas`.

Two consequences:

- **Flip is no longer baked.** Today it is part of the cache key (`:611`) and doubles the
  texture count. Phaser's `setFlipX` is free on GPU.
- **`getSpriteKey` disappears entirely.** It was memoised in `27c5a21` (11.5× on key
  construction, ~47 µs/frame on a 15-sprite scene — real, but 0.3% of the frame budget, so
  not a lag fix). Under Phaser the concept goes away: textures are looked up by name once
  at spawn rather than rebuilt per draw.

### Felt as a Filter — with one caveat

Palette transform (`FC()`, `:553`), fibre grain (`:568-598`) and the silhouette shadow
(`:599`) move into a fragment shader on the world camera.

The **bevel cannot**. `bevelMode:'region'` (`:631`) bevels a cell only where its neighbour
has a *different palette index*, so a shirt reads as one cut piece rather than a grid of
beads. That is authoring-time information a screen-space shader does not have. Therefore:
**the bevel is baked at texture-generation time**, with both variants (flat and felt)
generated once at boot. Toggling felt swaps texture keys. Sprite data is tiny — the largest
is 14×10 cells — so the memory cost is negligible.

What this deletes:

- `spriteCache` (`:610`, unbounded, no eviction) and `feltColorCache` (`:552`)
- The `#grain` DOM overlay and `syncSceneGrain()` (`:3380-3388`)
- The dead `grainPattern` variable (`:3382`)
- `watchFrameRate` and the one-way `RENDER` downgrade (`:3393-3408`)

What this enables: the supersampling that `RENDER` provides today has no direct Phaser
equivalent — the game is authored at 640×400 and the Scale manager upscales it — so the
sharpness `56f8457` gave up is recovered by rasterising sprite textures at 3× and letting
the GPU sample them, rather than by inflating a backing store. Felt also becomes toggleable
mid-run rather than menu-only; it is currently menu-gated (`:1272`, `:3097`) purely because
the rebuild cost makes it unusable during play.

### Physics

Real Arcade bodies with tile collision: **the player, and ground-patrol enemies**
(doll, car, dino, penguin, chicken).

Manual position writes with `allowGravity = false`: **bats and ghosts** (sine-driven `y`),
**the boss** (no `y` integration, `x` clamped to a 10-tile window), **all projectiles**
(constant velocity, no gravity — arrows are pure horizontal `vx`, fireballs have a constant
`vy` that never accelerates).

Handing the projectiles to Arcade with world gravity on would make them drop. This is
deliberate, not an oversight to fix.

### Input: one action map

Today three sources — keyboard (`:1071`), mobile touch (`:1072-1096`), gamepad
(`:3076-3130`) — all synthesise fake `KeyboardEvent.code` strings into two global objects,
and `clearJP()` (`:1149`) must be called on every early-return path in `update()`. The
exploration flagged this as the file's main correctness footgun: a new branch that forgets
it strands input.

Replaced by a typed action enum (`Left, Right, Jump, Shoot, Confirm, Back, ToggleLang,
ToggleFelt`) with `held`/`pressed` sets rebuilt once per fixed step. No manual clearing.

Preserved: state-dependent button mapping, `detectPadKind` vendor-id parsing (`:3034`),
`PAD_GLYPHS` substitution into `{A}/{B}/{X}/{P}` placeholders, and `shakeToRumble` (`:3050`,
already pure and unit-testable).

## Bug-compatibility contract

These are known defects. They are **preserved**, because the kids may have come to rely on
them and because changing them during an engine rewrite makes regressions unattributable.
Each is a candidate for the separate re-tune pass afterwards.

| # | Behaviour | Where |
|---|---|---|
| 1 | Boss has no gravity and no tile collision; `boss.y` is never integrated | `:1550-1617` |
| 2 | Cat phases through all geometry; `baseY` re-pinned to the player's feet every frame | `:1443-1492` |
| 3 | Stars from `?` blocks rise then freeze in mid-air forever (`vy=-2; vy+=.1; if(vy>0)vy=0`) | `:1511` |
| 4 | Boss "fireball spread" is two straight lines, not an arc | `:1561-1563` |
| 5 | Big-head applies a second, different hitbox for the enemy check only | `:1533-1537` |
| 6 | Fart aura adds 120 frames of stun *every frame* of overlap, stacking unboundedly | `:1423-1435` |
| 7 | Enemies have no horizontal tile collision — one leading-edge probe, can clip | `:1518-1530` |
| 8 | Difficulty rewrites level geometry: `dc.gapWidth` changes gaps at generation time | `:867-872` |
| 9 | Changing difficulty mid-run retunes an in-flight level, because `DC()` is read live | `:162` |
| 10 | `initLevel` does not reset `lives` or `score`; the three run-start call sites do | `:1154` |

Items 8–10 are arguably features, not bugs. They are listed so the rewrite does not
"clean them up" by accident.

**Explicitly not preserved:** the 120 Hz double-speed bug (see Fixed 60 Hz step above).

## Test strategy

The current harness (`scripts/run-tests.js`) regex-extracts the single `<script>` block and
evals it in a Node VM behind a hand-rolled DOM shim. It cannot survive the modular format —
but it does not have to die early: it keeps running against the untouched `index.html` for
the whole rewrite, and is retired only at cutover. Phaser's `HEADLESS` renderer exists but
still requires a real DOM (jsdom), and the repo has zero dependencies today.

The replacement is **Vitest, grown one module at a time** rather than written up front.
Because behaviour is bug-compatible, each module can be checked against the old build's
output as it lands:

- **Pure logic** — no Phaser needed. Port the existing assertions: back-nav table,
  `shakeToRumble` arithmetic, `T()` phrase-array guarding (the `8354ea0` fix), sprite
  shape validation.
- **Level generation** — assert the Phaser build produces byte-identical maps to the old
  `generate(dc)` for all 6 levels × 4 difficulties. Pure function, high value, cheap.
- **Player controller** — golden traces. Feed a fixed input sequence, record position and
  velocity per step, compare against the old implementation. This is the one place where
  "it feels wrong" bugs hide, and bug-compatibility makes the comparison exact.
- **Audio scheduler** — fake clock, assert note scheduling order and timing.
- **Rendering** — not unit tested. Visual A/B checkpoints against the current build,
  especially for felt parity.

The current harness's own docstring is worth keeping in spirit: it is explicit that a green
run proves graceful degradation for unmodelled APIs, not that anything is drawn correctly.

## Sequencing

Feel-critical work goes early so nothing is built on a wrong foundation.

1. **Scaffold** — Vite, TS, Vitest, tsconfig under `next/`; CI builds it alongside the live
   game. An empty Phaser game boots at `/next/`; `/` is untouched.
2. **Data port** — sprites, levels, i18n, difficulty, BGM themes into typed modules.
   Mechanical, low risk. Test: level generation matches the old build exactly.
3. **Audio port** — verbatim, behind a typed interface. Test: scheduler with a fake clock.
4. **BootScene + textures + felt shader.** Visual checkpoint: flat and felt side by side
   against the current build.
5. **Player controller + tile collision + fixed step.** ← **playtest gate.** Nothing
   further is built until the movement feels right.
6. **Enemies, boss, cat, projectiles, power-ups.**
7. **Scenes** — title, mode select, difficulty, char select, intro, between, game over,
   win, plus HUD and pause.
8. **Learn mode.**
9. **Input and gamepad unification.**
10. **Cutover** — only once the kids have played `/next/` and agreed. Promote the build to
    `/`, move the current game to `/classic/`, rewrite the README, retire
    `scripts/run-tests.js`.

## Risks

- **The feedback loop slows, but no longer stops.** This is the project's actual engine —
  kids play, decide what is next, Claude implements. A big-bang rewrite would normally
  freeze it; coexistence means the live game keeps working and keeps accepting small
  changes. What stops is *large* new features, since anything added to the old engine has
  to be built twice.
- **Feel drift.** Mitigated by the playtest gate at step 5 and golden traces for the player
  controller.
- **Felt shader parity.** The bevel compromise (baked at boot) is the known unknown.
  Needs a visual A/B checkpoint before step 5 proceeds.
- **Scope.** ~2,400 of 3,350 lines rewritten, plus a new toolchain, plus a shader. This is
  the largest change in the repo's history by an order of magnitude.
- **Gamepad fidelity.** The current implementation is more sophisticated than Phaser's
  gamepad API: vendor-id parsing for controller kind, state-dependent mapping, and storing
  *the code actually pressed* rather than the current mapping (`:3105`) so a state change
  mid-hold cannot strand a key. Porting must not regress these.

## Out of scope

- The stitched felt look from `felt-poc.html`. Reachable after this lands; not part of it.
- The re-tune pass. Separate, afterwards, with the kids choosing.
- `sprites.html` and `felt-lab.html`. They read the sprite arrays and the FELT constants
  directly; they keep working as long as those stay exported as data.

## README corrections needed at cutover

The README describes a game that does not exist in this repo. Planning the port from it
would produce the wrong result.

| README claims | Repo actually has |
|---|---|
| 3 chapters | 6 levels, no chapter concept in code |
| Rise of the Robot King, The Pirate King's Castle | One T-Rex boss, on the last level only |
| Water that fills gaps at ground level | No water; `grep -i water` returns nothing |
| Trilingual (Estonian, English, Italian) | Two languages: `LANG_KEYS = ['et','en']` |
| `dino-editor.html` | File does not exist |
| Pirate ships, castles with torches and banners | Not present |

Actual level names: Doll Garden, Dinosaur Canyon, Tallinn Old Town, Palermo Piazza,
Winter Wonderland, Toy Castle.

("No build step, no dependencies — it's a single HTML file" stays true of the current game
right up to cutover, and stops being true of the project at that point, by design.)
