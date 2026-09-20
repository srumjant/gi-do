# Phaser Migration, Plan 3: Sprites, Tiles and Parallax — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the slice look like the game. The kids' pixel art on screen instead of coloured rectangles, the real tile grid, and the parallax sky — in the **flat** style only.

**Architecture:** Sprite arrays rasterise to canvases once at boot and register as GPU textures. The scene swaps its rectangles for sprites. Everything that *animates* moves into the simulation, because that is where the live game keeps it — which means the frame-by-frame comparison grows to cover it.

**Tech Stack:** Phaser 4.2.1, Vite, TypeScript (strict), Vitest.

**Read first:** `docs/superpowers/specs/2026-09-20-phaser-migration-design.md`, and Plan 2's result — the validation gate passed, both halves.

---

## Where this sits

Plan 2 proved the port moves identically to the live game: twelve input scripts, compared
frame by frame with no tolerance, all matching, and the children played the rectangle build
and said it felt right. That was the migration's riskiest question and it is answered.

This plan is refinement. Nothing here can invalidate the approach; it can only make the
port look like the thing it already behaves like.

**The felt shader is deliberately NOT in this plan.** It was split out and deferred at the
owner's request. That costs nothing for parity: `STYLE_FELT` starts `false`
(`index.html:510`) and is opt-in per browser, so **flat is what the kids actually see**.
Build the texture pipeline shader-ready — one rasterise step, one place where a palette
transform would hook in — and the felt work slots in later without rework.

## The insight this plan is built on

**Animation is simulation state, not presentation.** The live game updates `p.frame` and
`p.frameTimer` inside `update()` (`index.html:1424-1429`), and `animFrame` is incremented
on the very first line of `update()` — before every state check, so it advances in all
states including title and death.

That means animation belongs in `src/game/`, and it means the golden traces can cover it.
**This plan strengthens the gate rather than merely decorating the output.** Every task
that moves an animating value into the simulation must also add it to the trace comparison.

What stays in the scene, because the live game computes it at draw time and never stores it:

- the enemy's vertical wobble, `Math.sin(animFrame * 0.15 + e.x)` (`index.html:1760`)
- the invincibility blink, `Math.floor(animFrame / 3) % 2` (`:1838`)
- the squashed-enemy scale and fade
- the rainbow block's colour, `hsl((animFrame*3 + tx*20) % 360, 100%, 65%)` (`:1693`)

All of those read `animFrame` but do not write it, so they are presentation driven by
simulation state — which is exactly the split this codebase already has.

---

## File structure

```
next/src/
  game/
    types.ts            MODIFIED — frame/frameTimer on player and enemies, animFrame and
                        squashTimer restored, all of it simulation state
    player.ts           MODIFIED — the walk cycle
    enemy.ts            MODIFIED — the 15-frame flip, squashTimer countdown
    world.ts            MODIFIED — animFrame
    run.ts              NEW — selectedChar, gigiSkin, dodoSkin, and the sprite lookups
                        that read them
  gfx/
    rasterise.ts        NEW — SpriteData + Palette -> HTMLCanvasElement
    textures.ts         NEW — register every sprite with Phaser at boot
    tiles.ts            NEW — draw the tile grid the way the live game draws it
    parallax.ts         NEW — sky gradient, hill ridges, clouds
  scenes/
    SliceScene.ts       MODIFIED — sprites instead of rectangles
next/tests/
  rasterise.test.ts     NEW
  run.test.ts           NEW
  trace.test.ts         MODIFIED — the comparison grows to cover animation
```

`src/game/` still must not import Phaser. `src/gfx/` may.

---

## Task 1: Animation into the simulation, and into the gate

**Files:**
- Modify: `next/src/game/types.ts`, `player.ts`, `enemy.ts`, `world.ts`
- Modify: `next/tests/helpers/liveGame.ts`, `next/tests/trace.test.ts`

Do this **first**. It is the task that makes every later one verifiable, and it is the only
task here that can find a real bug.

**The live source.** Player walk cycle, `index.html:1424-1429`, at the end of the player
block:

```js
if(!p.onGround)p.frame=2;
else if(Math.abs(p.vx)>0.3){
  const walkSpeed=Math.max(4,Math.round(12-Math.abs(p.vx)*3));
  p.frameTimer++;if(p.frameTimer>walkSpeed){p.frame=p.frame===0?1:0;p.frameTimer=0;}
} else p.frame=0;
```

Frame 0 is stand, 1 is run, 2 is jump. The walk cycle gets faster as the player does.

Enemy flip, `index.html:1540`, inside the per-enemy loop after movement:

```js
e.frameTimer++;if(e.frameTimer>15){e.frame=1-e.frame;e.frameTimer=0;}
```

Squash countdown, at the top of the same loop (`:1525`) — this is why a stomped enemy stays
visible for half a second before vanishing:

```js
if(!e.alive){if(e.squashTimer>0)e.squashTimer--;return;}
```

`squashTimer` is set to 30 on a stomp (`:1545`), and `spawnEnemy` initialises it to 0.

And `animFrame`, the **first line** of `update()` (`index.html:1275`):

```js
function update(){
  animFrame++;
  ...
```

Before every state check, so it advances even while dead. In the port that means
incrementing it in `stepWorld` **before** the `world.dead` early return, not after.

- [ ] **Step 1: Extend the types**

`PlayerState` gains `frame: number` and `frameTimer: number`, both starting 0
(`index.html:1168`). `EnemyState` gains the same plus `squashTimer: number`, all starting 0
(`:1215`). `World` gains `animFrame: number` starting 0.

- [ ] **Step 2: Write the failing trace assertions first**

Extend the `Sample` shape in `next/tests/helpers/liveGame.ts` to carry the player's `frame`
and `frameTimer`, the world's `animFrame`, and each enemy's `frame`, `frameTimer` and
`squashTimer`. Run the trace suite and **watch it fail** — the port does not have these
fields yet, so every script should go red. Report that output; it is the proof the new
fields are actually being compared rather than quietly ignored.

- [ ] **Step 3: Implement, and make the traces green again**

Port the three blocks above into `stepPlayer`, `stepEnemy` and `stepWorld`. Keep the
ordering: the walk cycle runs at the **end** of the player block, after collision; the
squash countdown runs at the **top** of the per-enemy loop and returns early; `animFrame`
increments first in `stepWorld`.

- [ ] **Step 4: Add a script that exercises the walk cycle**

The existing scripts were written before animation existed, and none of them was designed
to make the frame counter interesting. Add one that accelerates, holds the cap, decelerates
below the 0.3 threshold and stops — so `walkSpeed` takes several distinct values and
`frame` toggles at several distinct rates. Confirm it goes red if you change the `0.3`
threshold or the `12 - |vx|*3` formula.

- [ ] **Step 5: Build, full suite, commit.**

---

## Task 2: Run state and sprite selection

**Files:**
- Create: `next/src/game/run.ts`
- Test: `next/tests/run.test.ts`

Plan 1 deliberately left four functions behind in `sprites.ts` because they read mutable
game state. They are needed now.

**The live source** (`index.html:849-858`, and `getEnemySpriteInfo` around `:839`):

```js
function getPlayerSprites(){
  if(selectedChar==='dodo'){const sk=DODO_SKINS[dodoSkin]||DODO_SKINS[0];return{stand:sk.stand,run:sk.run,jump:sk.jump,palette:sk.palette};}
  const sk=GIGI_SKINS[gigiSkin]||GIGI_SKINS[0];
  return{stand:sk.stand,run:sk.run,jump:sk.jump,palette:sk.palette};
}
```

Read `getEnemySpriteInfo` and `getRescueSprites` from the file and port them too. Note
`getEnemySpriteInfo` **defaults an unknown type to the dino sprite** — Plan 2's
`spawnEnemy` deliberately returns `undefined` for unimplemented types instead, so keep the
two behaviours distinct and say why in a comment.

The `||DODO_SKINS[0]` fallbacks are real: an out-of-range skin index falls back to the
first skin rather than crashing. Preserve them.

Keep this module Phaser-free — it is game state, not rendering.

- [ ] Tests: the default character is Gigi; selecting Dodo changes the sprite set; an
  out-of-range skin index falls back to the first skin; every enemy type in every level's
  `enemyDefs` resolves to a real sprite and palette.

---

## Task 3: The texture pipeline

**Files:**
- Create: `next/src/gfx/rasterise.ts`, `next/src/gfx/textures.ts`
- Test: `next/tests/rasterise.test.ts`

**Rasterise** one `SpriteData` + `Palette` into a canvas: width `cols * scale`, height
`rows * scale`, one `fillRect` per non-zero cell. That is the live `getCachedSprite`
(`index.html:621`) minus the felt branch.

Two deliberate differences from the live pipeline, both wins:

- **Do not bake the flip.** The live game bakes it into the cache key, doubling the texture
  count; Phaser's `setFlipX` is free on the GPU.
- **Do not build a content-keyed cache.** Textures are registered once at boot under a
  name and looked up by name. The live game's per-call key construction was the thing
  memoised in `27c5a21`; here the problem does not arise.

**Leave one seam for the felt shader.** Rasterise should take the palette through a single
colour function that currently returns its input unchanged. That is where `FC()` hooks in
later. One indirection now, no rework later.

Register every sprite at boot via `textures.addCanvas`. Name them predictably
(`gigi.classic.stand`, `enemy.doll`, `cloud`), and generate at a scale that matches how the
live game draws each: player and rescue NPC at 2, enemies at `ENEMY_SCALE` 1.8, clouds at
5-6, HUD items at 1.5.

- [ ] Tests, in the `node` environment with a canvas stub or by asserting on the pixel
  grid the rasteriser produces rather than on a real canvas: a sprite's dimensions are
  `cols*scale × rows*scale`; index 0 leaves a transparent cell; every non-zero index paints
  its palette colour; an unknown index does not throw.

---

## Task 4: Draw the player and the enemies

**Files:**
- Modify: `next/src/scenes/SliceScene.ts`

Swap the rectangles for `Phaser.GameObjects.Image`s.

**Positioning, from the live draw calls:**

- Player: `drawSprite(spr, p.x-2, p.y-2, ps.palette, 2, p.facing<0)` (`index.html:1838`).
  The sprite is 2px larger than the hitbox on every side — `w = spriteW - 4` — so it draws
  at `(x-2, y-2)`, not at the hitbox corner. Getting this wrong puts the art 2px off and
  looks like a collision bug.
- Enemy: `drawSprite(info.sprite, e.x, e.y+wb, info.palette, ENEMY_SCALE, fl)`
  (`:1763`), where `fl = e.vx > 0` — **sprites face left by default**, so the flip is on
  moving *right* — and `wb = Math.sin(animFrame * 0.15 + e.x)` is a draw-time vertical
  wobble that is never stored.
- Frame choice: 0 stand, 1 run, 2 jump, from `p.frame`.

**Presentation effects that read `animFrame` but belong here, not in the simulation:**

- invincibility blink: draw only when `p.invincible <= 0 || Math.floor(animFrame/3) % 2 === 0`
  (`:1838`). The slice has no invincibility yet, so wire the expression and leave it inert.
- squashed enemy: when `!alive && squashTimer > 0`, draw at `scaleY 0.3`, offset
  `y + h*0.7`, alpha `squashTimer/30`, and skip entirely once the timer hits zero (`:1762`).
- ghost transparency (`:1761`) — out of scope, no ghosts in the slice. Note it.

- [ ] Verify in a browser: the characters are the kids' art, they face the way they move,
  the walk cycle speeds up as the player does, and a stomped enemy squashes and fades
  rather than vanishing.

---

## Task 5: The tile grid

**Files:**
- Create: `next/src/gfx/tiles.ts`
- Modify: `next/src/scenes/SliceScene.ts`

The live tile loop (`index.html:1690-1695`) is more than four flat colours:

```js
if(tile===1){ fill groundColor; if(ty>0 && !isSolid(map[ty-1][tx])) fill groundTop over the top 3px }
else if(tile===2){ fill brickColor; stroke '#00000033'; fill '#00000022' at dx+7 (1px wide) and dy+7 (1px tall) }
else if(tile===3){ fill '#ffcc00'; stroke '#cc8800'; text '?' at (dx+4, dy+12) in 10px monospace }
else if(tile===5){ fill hsl((animFrame*3 + tx*20) % 360, 100%, 65%); stroke '#fff'; text '!' at (dx+6, dy+12) bold 11px }
```

Three things worth naming:

- **The ground-top strip only draws where the tile above is not solid** — that is the grass
  edge, and it is why a buried ground tile has no green line through it.
- **The brick mortar** is two 1px lines forming a cross, not a border.
- **The rainbow block animates**, cycling hue with `animFrame` and offset per column, so it
  cannot be part of a static tile layer. Draw it separately and update it per frame.

Everything except the rainbow block can be drawn once into a `Graphics` and left alone.

- [ ] Verify in a browser against the live game side by side. The grass edge, the mortar
  cross and the cycling rainbow block should all be present.

---

## Task 6: Parallax and clouds

**Files:**
- Create: `next/src/gfx/parallax.ts`
- Modify: `next/src/scenes/SliceScene.ts`

Port `drawParallax` (`index.html:1044-1072`): a vertical sky gradient from the level's `bg`
to the entry's `bg2`, then each layer's ridge as a `quadraticCurveTo` chain.

The numbers, confirmed against the data in Plan 1:

- `baseY = BASE_H * layer.y` and `peakY = baseY - layer.hills[i] * BASE_H` — both fractions
  of **BASE_H (400)**, not of the zoomed view height.
- the scroll offset carries a further 0.5: `x = i*hillW - ((camera.x * layer.speed * 0.5) % hillW)`
- there is a per-ridge sine wobble, `Math.sin(i*1.3 + scrollX*0.002) * 8`
- `layer.h` is **declared on every layer and read by nothing**. Do not start honouring it.

Clouds go through the sprite pipeline at scale 5-6 with `globalAlpha 0.75` (`:1676`), from
the level's `clouds` array.

Phaser has no `quadraticCurveTo` on `Graphics` in the same shape as canvas; check the
installed typings and use whatever v4 offers, or approximate with a path of line segments
dense enough that the ridge reads as a curve. **Report which you used.** This is the one
task where matching the live output exactly may not be practical, and saying so is better
than pretending.

- [ ] Verify side by side. A close match is the bar here, not a pixel-identical one.

---

## Task 7: Visual checkpoint

**Files:**
- Modify: `next/PLAYTEST.md`

- [ ] Put the live game and the port side by side on the same part of level 1 and compare:
  characters, the grass edge, brick mortar, the rainbow block, the sky, the hills, the
  clouds. Capture both.
- [ ] List anything that differs and decide, for each, whether it is a bug or a deferred
  felt-style difference.
- [ ] Update `PLAYTEST.md`: the slice is no longer rectangles, so the "what it deliberately
  lacks" list shrinks to sound, menus, other levels, and the felt style.
- [ ] Full suite, build, commit, push.

---

## Done when

- [ ] Animation is simulation state and the golden traces compare it — including a script
      built to make the walk cycle interesting.
- [ ] Every trace still matches the live game frame by frame.
- [ ] `npm test` and `npm run build` are green.
- [ ] `src/game/` still imports no Phaser, enforced by the existing test.
- [ ] Level 1 renders with the kids' art, the real tile grid and the parallax sky.
- [ ] `index.html` is untouched.
- [ ] Differences from the live build are listed and each is explained.

## What comes next

The remaining enemies, the boss and the cat (spec step 6), then the scenes and HUD (step 7),
learn mode (step 8), input unification (step 9), cutover (step 10) — and the felt shader
(step 5b) whenever it is wanted, slotting into the seam left in `rasterise.ts`.
