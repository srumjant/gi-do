# Learn Tower, Part 1: The Climb — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable learn tower in the Phaser port: pick letters, syllables or words from the
learn menu, climb storeys of wooden planks, bump the letter you are asked for, spring through
the ceiling, and reach the star on the roof. The tiles look like the game's own; the castle
decoration, voice and result screen come in Part 2.

**Architecture:** Game rules live in `next/src/game/learn/` with no Phaser import, so Vitest
can pin every spacing guarantee from the spec. Phaser does the engine work: a real tilemap
with a generated tileset, per-side tile collision for the planks, Arcade's `blocked.up` for
head bumps, camera follow, bounds and pan, and tweens. The player's movement is the
adventure's own code, split out of `stepPlayer` so both modes share it.

**Tech Stack:** Phaser 4.2.1, TypeScript 7 (strict, `noUnusedLocals`), Vite 8, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-23-learn-tower-design.md`. This plan is its build
order steps 1-3: shared groundwork, the rules, and a playable tower on the tower's own tiles.
**Part 2** (a separate plan, written after this one lands) covers steps 4-6: voice, sounds and
effects, the roof and result screen, the castle look, and `PLAYTEST.md`.

---

## Ground rules for this repo

- Run every command from `next/`: `cd next` once, then `npx vitest run ...`, `npm test`,
  `npm run build`.
- `npm run build` runs `tsc --noEmit` first. `noUnusedLocals` is on, so an unused import
  fails the build. Vitest does not type-check; the build does. Run both before every commit.
- **Nothing under `src/game/` may import a Phaser value.** Phaser reads `navigator` and
  `window` as its module loads, so `import Phaser from 'phaser'` throws under Vitest. Type
  imports (`import type ...`) are erased and fine.
- Commits: conventional prefix, lowercase, a subject that says what changed for the game,
  and a body. **No `Co-Authored-By` lines** (the owner's rule). Never amend; add a commit.
- The owner's direction for the port: use Phaser's own features for engine work, and write
  our own code only for a stated reason.

## This plan was dry-run before hand-off

Every file below that the plan creates was extracted from this document into a copy of the
port, every edit applied as written, and the result passed the full suite (562 tests),
`tsc --noEmit` and `vite build`. The tower was then played in a browser: the right letter's
spring with jump let go at once, the trapdoor shutting as brick, jumping up through a plank,
and the camera panning between storeys all behaved as described. If a step fails for you,
the likeliest cause is a difference between your checkout and the one this was checked
against (`e44d181` plus the spec commits), not the plan's code.

## What was checked in Phaser's source before writing this

These facts shape the code below; do not re-derive them, but do not contradict them either.

- **One-way tiles work.** `TileCheckY` (Arcade) stops a body moving DOWN only if the tile has
  `collideUp` and `faceTop`, and a body moving UP only if it has `collideDown`. So
  `tile.setCollision(false, false, true, false)` is a plank you can jump up through.
- **Tile bias.** A falling body whose bottom is up to `TILE_BIAS` (16px) below a tile's top is
  put back on top of it. Near misses onto a plank therefore count as landings, with a small
  pop. The test mover in Task 6 copies this.
- **Which tiles a head hit: not the collision callback.** `physics.add.collider(body, layer,
  cb)` calls `cb(body, tile)` AFTER separating that tile, and it works for the port's
  standalone body (`sprite.isBody`). But it reports only the FIRST tile along a head: Arcade
  visits tiles left to right, and once it has snapped the body under one, the next no longer
  overlaps the body (`TileIntersectsBody`) and is never reported. A head under a brick and a
  letter reports the brick alone. So the mover reports the row a rising head was stopped
  under (`blocked.up` plus `headTileRow`), and the climb picks the cells with the adventure's
  two probes, 3px in from each side (`headColumns`): the spec's named fallback, and the rule
  the `?` blocks already use. Task 3's review found this by running Phaser's own separation
  code under Node.
- **Empty tiles.** Phaser's 2D-array parser treats `-1` as empty and `0` as a real tile
  index. The tower's rules use `0` for empty; the scene converts `0` to `-1` for Phaser.
- **Camera.** When bounds are shorter than the view, `clampY` pins the view's top to the top
  of the bounds and the camera holds still. That is how a short storey stays whole on screen.
  Follow is skipped while a pan runs (`if (follow && !this.panEffect.isRunning)`), and bounds
  would clamp the pan, so remove the bounds before panning and set the new ones when it ends.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `next/src/game/player.ts` | Modify: split `stepMotion`, `stepWalkCycle`, `playerSize` out of the adventure's player step; share the head's probe columns (`headColumns`) | 1, 6 |
| `next/src/physics/tiles.ts` | Modify: per-side tile collision (`collisionSides`, `applyTileFaces`, `applyTileFacesAt`); its `TileFaces` and `FacesRule` types move to `game/tiles.ts` in Task 5 | 2, 5 |
| `next/src/game/tiles.ts` | Modify: the tile-faces types, `TileFaces` and `FacesRule`, so the tower's rules need nothing from `physics/` | 5 |
| `next/src/physics/player.ts` | Modify: `createBodyMover` (general Arcade mover that reports the row a head hit); `createPlayerMove` becomes a thin adventure wrapper | 3 |
| `next/src/game/learn/content.ts` | Create: the letter, syllable and word pools; targets and distractors | 4 |
| `next/src/game/learn/tower.ts` | Create: tile codes, geometry, `buildTower`, camera view rectangles | 5 |
| `next/src/game/learn/types.ts` | Create: `Climb`, `GateState`, `ClimbEvent`, `ClimbMove`, cells | 6 |
| `next/src/game/learn/gate.ts` | Create: which block a bump hit; right and wrong answers; trapdoors | 6 |
| `next/src/game/learn/climb.ts` | Create: `createClimb`, `stepClimb` (one fixed step of the climb) | 6 |
| `next/src/gfx/learnTiles.ts` | Create: the tower tileset and letter-block textures | 8 |
| `next/src/scenes/LearnTowerScene.ts` | Create: the climb, on Phaser | 10 |
| `next/src/scenes/LearnHudScene.ts` | Create: what to find, and one star per gate | 10 |
| `next/src/scenes/LearnMenuScene.ts` | Create: letters, syllables or words; replaces `LearnScene` | 11 |
| `next/src/scenes/LearnScene.ts` | Delete (the "coming soon" placeholder) | 11 |
| `next/src/scenes/keys.ts` | Modify: learn scene keys and `SCENE_FOR_STATE` | 9, 10, 11 |
| `next/src/scenes/ModeSelectScene.ts` | Modify: the learn card opens the learn menu | 11 |
| `next/src/main.ts` | Modify: register the learn scenes | 10, 11 |
| `next/src/config/i18n.ts` | Modify: learn strings in, placeholder strings out | 9, 11 |
| `next/tests/helpers/seeded.ts` | Create: deterministic random source | 5 |
| `next/tests/helpers/towerMove.ts` | Create: a pure stand-in for the tower's Arcade body | 6 |
| `next/tests/learnContent.test.ts` | Create | 4 |
| `next/tests/learnTower.test.ts` | Create | 5 |
| `next/tests/learnGate.test.ts` | Create | 6 |
| `next/tests/learnJumps.test.ts` | Create: the spec's jump checks | 7 |
| `next/tests/player.test.ts`, `physics.test.ts`, `i18n.test.ts`, `navigation.test.ts` | Modify | 1, 2, 9, 10, 11 |

---

### Task 1: Split the movement out of the adventure's player step

The tower must jump exactly like the adventure. `stepPlayer` mixes that movement with
adventure-only rules (the pit, the cape, the bow, power-up timers), so the movement and the
walk animation become their own exported functions and `stepPlayer` calls them. The
adventure's behaviour must not change; its existing tests guard that.

**Files:**
- Modify: `next/src/game/player.ts`
- Test: `next/tests/player.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `next/tests/player.test.ts`:

```ts
describe('the movement learn mode shares', () => {
  const LEARN = {
    playerSpeed: DIFFICULTY_CONFIG.super_easy.playerSpeed,
    jumpForce: DIFFICULTY_CONFIG.super_easy.jumpForce,
  };
  const jumpHeld = (f: number): InputState => held({ jump: true, jumpPressed: f === 0 });
  const jumpTapped = (f: number): InputState => held({ jump: f === 0, jumpPressed: f === 0 });

  function standing(): PlayerState {
    const { w, h } = playerSize('gigi');
    return {
      x: 0, y: -h, vx: 0, vy: 0, w, h, onGround: true, facing: 1,
      coyoteTime: 0, jumpBuffer: 0, frame: 0, frameTimer: 0, invincible: 0,
      hasBow: false, bowCharges: 0, arrowCooldown: 0, hasCape: false,
      fartTimer: 0, bigHeadTimer: 0, chickenRayCharges: 0,
    };
  }

  // Integrates y by hand with no floor: only the top of the arc matters here.
  function riseOf(input: (f: number) => InputState, options = {}): { rise: number; sounds: SoundCue[] } {
    const p = standing();
    const startY = p.y;
    const sounds: SoundCue[] = [];
    let top = p.y;
    for (let f = 0; f < 200; f++) {
      stepMotion(p, input(f), LEARN, sounds, options);
      p.y += p.vy;
      p.onGround = false;
      top = Math.min(top, p.y);
      if (p.vy > 0) break;
    }
    return { rise: startY - top, sounds };
  }

  it('rises 98.4px on a held jump at the learn numbers', () => {
    expect(riseOf(jumpHeld).rise).toBeCloseTo(98.4, 6);
  });

  it('cuts a tapped jump to a 24.2px hop', () => {
    expect(riseOf(jumpTapped).rise).toBeCloseTo(24.2, 6);
  });

  it('keeps a tapped jump at full height while noJumpCut is set', () => {
    expect(riseOf(jumpTapped, { noJumpCut: true }).rise).toBeCloseTo(98.4, 6);
  });

  it('raises the jump sound on the step the jump starts', () => {
    expect(riseOf(jumpHeld).sounds).toEqual(['jump']);
  });

  it('shows the jump pose in the air and the stand pose at rest', () => {
    const p = standing();
    p.onGround = false;
    stepWalkCycle(p);
    expect(p.frame).toBe(2);
    p.onGround = true;
    p.vx = 0;
    stepWalkCycle(p);
    expect(p.frame).toBe(0);
  });

  it('sizes a character exactly as createPlayer does', () => {
    for (const character of ['gigi', 'dodo'] as const) {
      const p = createPlayer(LEVELS[0], DIFFICULTY_CONFIG.normal, character);
      expect(playerSize(character)).toEqual({ w: p.w, h: p.h });
    }
  });
});
```

Change the imports at the top of the same file. Replace:

```ts
import {
  createPlayer, giveRandomSillyPowerup, stepPlayer, GRND_DECEL,
} from '../src/game/player';
```

with:

```ts
import {
  createPlayer, giveRandomSillyPowerup, playerSize, stepMotion, stepPlayer, stepWalkCycle,
  GRND_DECEL,
} from '../src/game/player';
```

and replace:

```ts
import type { World } from '../src/game/types';
```

with:

```ts
import type { PlayerState, SoundCue, World } from '../src/game/types';
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/player.test.ts`
Expected: FAIL. The new `describe` fails with errors naming `playerSize`, `stepMotion` or
`stepWalkCycle` as not exported (not a function). The existing tests still pass.

- [ ] **Step 3: Add `playerSize` and use it in `createPlayer`**

In `next/src/game/player.ts`, insert this immediately ABOVE the doc comment that begins
`/**\n * Port of the player construction at index.html:1166-1171` (so that comment stays
attached to `createPlayer`):

```ts
/**
 * The hitbox of a character: the stand sprite at scale 2, inset by 4 each way
 * (index.html:670, :1167) — 16x24 for Gigi, 16x20 for Dodo. `createPlayer` and learn
 * mode's climber both size from here, so the two are the same body.
 */
export function playerSize(character: Character): { w: number; h: number } {
  const stand = character === 'dodo' ? DODO_SKINS[0].stand : GIGI_SKINS[0].stand;
  return { w: stand[0].length * 2 - 4, h: stand.length * 2 - 4 };
}

```

Then, inside `createPlayer`, replace:

```ts
  const stand = character === 'dodo' ? DODO_SKINS[0].stand : GIGI_SKINS[0].stand;
  const pw = stand[0].length * 2;
  const ph = stand.length * 2;
  return {
    x: level.playerStart[0] * TILE,
    y: level.playerStart[1] * TILE,
    vx: 0,
    vy: 0,
    w: pw - 4,
    h: ph - 4,
```

with:

```ts
  const { w, h } = playerSize(character);
  return {
    x: level.playerStart[0] * TILE,
    y: level.playerStart[1] * TILE,
    vx: 0,
    vy: 0,
    w,
    h,
```

- [ ] **Step 4: Add `SoundCue` to the types import**

Replace:

```ts
import { PICKUP_RUMBLE, type PlayerState, type PowerupType, type World } from './types';
```

with:

```ts
import { PICKUP_RUMBLE, type PlayerState, type PowerupType, type SoundCue, type World } from './types';
```

- [ ] **Step 5: Make `stepPlayer` call the shared functions**

Do this BEFORE adding them in Step 6, while the lines below still appear only once in the
file. The file will not compile between this step and the next; that is expected.

In `stepPlayer`, right after `const level = world.level;`, delete everything from the line
`  // Player movement — smooth acceleration with air control (index.html:1362-1370).`
down to and including the line `  if (p.vy > 8) p.vy = 8;` (this block also holds the
`fireArrow(world, input);` call). Put this in its place:

```ts
  // Running, coyote time, the jump buffer, the jump, the variable-height cut and gravity
  // (index.html:1362-1403) — shared with learn mode, see stepMotion above.
  stepMotion(p, input, dc, world.sounds);

  // Shooting (index.html:1390-1398). The live source has it between the variable-height
  // cut and gravity; here it runs after gravity, which reads exactly the same values:
  // gravity only changes `vy`, and an arrow reads the player's x, y, size and facing. So an
  // arrow fired mid-jump still leaves from where the player was at the top of the frame.
  fireArrow(world, input);
```

Then replace the walk-cycle block, from the line
`  // Smooth animation — walk cycle speed matches player speed (index.html:1424-1429).`
down to and including the `}` that closes its final `else { p.frame = 0; }`, with:

```ts
  // The walk cycle (index.html:1424-1429), after collision — see stepWalkCycle above.
  stepWalkCycle(p);
```

`const level = world.level;` and `const dc = world.dc;` stay: the pit still reads `level`, and
`stepMotion` takes `dc`.

- [ ] **Step 6: Add `stepMotion` and `stepWalkCycle`**

Insert this immediately ABOVE the doc comment that begins
`/**\n * Port of index.html:1361-1423. Mutates \`world.player\`` (the one on `stepPlayer`):

```ts
/**
 * The two fields of a difficulty record that movement reads. Narrower than
 * `DifficultyRecord` so learn mode can move a player without inventing lives, a gap width
 * or a bow.
 */
export type MotionRecord = Pick<DifficultyRecord, 'playerSpeed' | 'jumpForce'>;

export interface MotionOptions {
  /**
   * Skip the variable-height cut this step. Learn mode sets it while a letter block's
   * spring carries the player up through the ceiling: a child who taps rather than holds
   * would otherwise rise 24px instead of 98px and be left under an open trapdoor. The
   * adventure never sets it.
   */
  noJumpCut?: boolean;
}

/**
 * The movement half of the player step (index.html:1362-1403): running, coyote time, the
 * jump buffer, the jump, the variable-height cut, and gravity with its apex hang. Shared
 * by `stepPlayer` below and learn mode's climb (game/learn/climb.ts), so a jump is the
 * same jump in both.
 *
 * Mutates `p`, and pushes 'jump' or 'fart' onto `sounds` on the step a jump starts.
 * Moves nothing: position is the mover's job, and runs after this.
 */
export function stepMotion(
  p: PlayerState,
  input: InputState,
  dc: MotionRecord,
  sounds: SoundCue[],
  options: MotionOptions = {},
): void {
  // Player movement — smooth acceleration with air control (index.html:1362-1370).
  const accel = p.onGround ? GRND_ACCEL : AIR_ACCEL;
  const decel = p.onGround ? GRND_DECEL : AIR_DECEL;
  if (input.left) {
    p.vx = Math.max(p.vx - accel, -dc.playerSpeed);
    p.facing = -1;
  } else if (input.right) {
    p.vx = Math.min(p.vx + accel, dc.playerSpeed);
    p.facing = 1;
  } else {
    p.vx *= decel;
    if (Math.abs(p.vx) < 0.12) p.vx = 0;
  }

  // Coyote time — allows jumping a few frames after leaving a ledge (index.html:1373-1374).
  if (p.onGround) {
    p.coyoteTime = 6;
  } else if (p.coyoteTime > 0) {
    p.coyoteTime--;
  }

  // Jump buffer — press jump slightly before landing (index.html:1375-1379). Set to 8,
  // then decremented in this SAME step, so it already reads 7 by the time anything
  // checks it this frame. Do not reorder these two lines.
  const jumpKey = input.jump;
  const jumpJust = input.jumpPressed;
  if (jumpJust) p.jumpBuffer = 8;
  if (p.jumpBuffer > 0) p.jumpBuffer--;

  // Execute jump: (coyote time OR on ground) AND (just pressed OR still buffered)
  // (index.html:1380-1386). The fart multiplies the force IN PLACE — 1.5x a jumpForce
  // that is already negative, so -7.5 becomes -11.25 at normal. It is applied here, at
  // the assignment, and nowhere else: the variable-height clamp just below still
  // measures against the UNMULTIPLIED `dc.jumpForce * 0.4`, so releasing the key early
  // cuts a fart jump back to exactly the same short hop as a plain one.
  const canJump = p.onGround || p.coyoteTime > 0;
  if (canJump && p.jumpBuffer > 0) {
    p.vy = p.fartTimer > 0 ? dc.jumpForce * 1.5 : dc.jumpForce;
    p.onGround = false;
    p.coyoteTime = 0;
    p.jumpBuffer = 0;
    // index.html:1384-1385. Reads the same `fartTimer` the force above just read, one
    // line later and before the timer is decremented at the bottom of stepPlayer, so a
    // jump that got the 1.5x always gets the fart too. The live branch also spawns five
    // green particles; those are presentation and are not ported.
    sounds.push(p.fartTimer > 0 ? 'fart' : 'jump');
  }

  // Variable jump height — release early for a short hop (index.html:1387-1388). The
  // clamp target is negative (jumpForce is negative), and only applies while vy is
  // still below (more negative than) it. Skipped while `noJumpCut` is set.
  if (!options.noJumpCut && !jumpKey && p.vy < dc.jumpForce * 0.4) {
    p.vy = dc.jumpForce * 0.4;
  }

  // Gravity: apex hang (reduced gravity near the jump peak) + faster fall
  // (index.html:1400-1403). `vy > 0` is tested BEFORE `isApex` — apex hang applies only
  // while RISING; a slow FALL takes the 1.2 branch even though |vy| < 1.5.
  const isApex = Math.abs(p.vy) < 1.5 && !p.onGround;
  const gMul = p.vy > 0 ? 1.2 : (isApex ? 0.6 : 1.0);
  p.vy += GRAVITY * gMul;
  if (p.vy > 8) p.vy = 8;
}

/**
 * The walk cycle (index.html:1424-1429). Runs at the END of a step, after collision, so it
 * reacts to this step's resolved `onGround` and `vx` rather than last step's. Shared with
 * learn mode's climb.
 */
export function stepWalkCycle(p: PlayerState): void {
  if (!p.onGround) {
    p.frame = 2;
  } else if (Math.abs(p.vx) > 0.3) {
    const walkSpeed = Math.max(4, Math.round(12 - Math.abs(p.vx) * 3));
    p.frameTimer++;
    if (p.frameTimer > walkSpeed) {
      p.frame = p.frame === 0 ? 1 : 0;
      p.frameTimer = 0;
    }
  } else {
    p.frame = 0;
  }
}

```

- [ ] **Step 7: Run the player tests**

Run: `npx vitest run tests/player.test.ts`
Expected: PASS, every test, old and new.

- [ ] **Step 8: Run everything and type-check**

Run: `npm test && npm run build`
Expected: all tests pass; `tsc` reports nothing; Vite builds.

- [ ] **Step 9: Commit**

```bash
git add src/game/player.ts tests/player.test.ts
git commit -m "refactor: the jump, split out so learn mode can share it" -m "stepMotion is the movement half of stepPlayer — running, coyote time, the jump buffer, the jump, the variable-height cut and gravity — and stepWalkCycle is the walk animation. stepPlayer calls both, in the same places, so the adventure is unchanged; the arrow now fires after gravity instead of before it, which reads identical values because gravity only touches vy. stepMotion takes a noJumpCut switch the adventure never sets: learn mode's spring needs it. playerSize is the hitbox rule createPlayer used, now shared."
```

---

### Task 2: Per-side tile collision

Planks collide only from above. The adventure's collision layer is untouched; this adds the
vocabulary the tower's layer uses.

**Files:**
- Modify: `next/src/physics/tiles.ts`
- Test: `next/tests/physics.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `next/tests/physics.test.ts`:

```ts
describe('per-side tile collision', () => {
  it('stops a body at every side of a solid tile', () => {
    expect(collisionSides('all')).toEqual([true, true, true, true]);
  });

  it('stops a body only on top of a plank, so a jump passes up through it', () => {
    // Tile#setCollision's order is left, right, up, down, and "up" is the tile's TOP face:
    // the one that stops a body moving down onto it (Arcade's TileCheckY).
    expect(collisionSides('top')).toEqual([false, false, true, false]);
  });

  it('stops nothing at an empty tile', () => {
    expect(collisionSides('none')).toEqual([false, false, false, false]);
  });
});
```

And add `collisionSides` to that file's import from `../src/physics/tiles`:

```ts
import { collisionSides, SOLID_TILE_INDEXES } from '../src/physics/tiles';
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/physics.test.ts`
Expected: FAIL — `collisionSides is not a function`.

- [ ] **Step 3: Implement**

Append to `next/src/physics/tiles.ts`:

```ts
/**
 * Which sides of a tile stop the player. `top` is a plank: land on it from above, jump up
 * through it from below. The adventure only ever has `all` and `none`; learn mode's tower
 * adds `top` (game/learn/tower.ts's `towerTileFaces`).
 */
export type TileFaces = 'none' | 'all' | 'top';

/** A tile vocabulary's collision: one answer per tile code. */
export type FacesRule = (code: number) => TileFaces;

/**
 * `Tile#setCollision`'s four sides — left, right, up, down — for each kind of tile.
 *
 * Arcade names the sides of the TILE: `up` is its top face, which stops a body moving DOWN
 * onto it (`TileCheckY`: `deltaY() > 0 && collideUp`), and `down` is its underside, which
 * stops a body moving up. So a plank is `up` alone. This is the only part of the per-side
 * collision a test can reach (see the Phaser import note at the top of this file).
 */
export function collisionSides(faces: TileFaces): [boolean, boolean, boolean, boolean] {
  switch (faces) {
    case 'all': return [true, true, true, true];
    case 'top': return [false, false, true, false];
    default: return [false, false, false, false];
  }
}

/**
 * Sets every tile's collision in `layer` from `rule`, then recomputes, once, the faces
 * Arcade separates against. Tiles Phaser holds as empty (index -1) answer `none`.
 */
export function applyTileFaces(layer: Phaser.Tilemaps.TilemapLayer, rule: FacesRule): void {
  layer.forEachTile((tile) => {
    const [left, right, up, down] = collisionSides(rule(tile.index));
    tile.setCollision(left, right, up, down, false);
  });
  layer.calculateFacesWithin();
}

/**
 * The same for one tile — one just put back into the layer, such as a trapdoor cell that
 * has shut. Recalculates that tile's faces and its neighbours'.
 */
export function applyTileFacesAt(
  layer: Phaser.Tilemaps.TilemapLayer,
  tileX: number,
  tileY: number,
  rule: FacesRule,
): void {
  const tile = layer.getTileAt(tileX, tileY);
  if (!tile) return;
  const [left, right, up, down] = collisionSides(rule(tile.index));
  tile.setCollision(left, right, up, down, true);
}
```

The file's `import type Phaser from 'phaser'` already covers these types; do not change it
to a value import.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/physics.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and type-check**

Run: `npm test && npm run build`
Expected: all pass, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/physics/tiles.ts tests/physics.test.ts
git commit -m "feat: tiles that only stop you from above" -m "A tile's collision can now be set per side: all four, the top alone, or none. The top alone is a plank — Arcade stops a body landing on it and lets a rising one through — which the learn tower's planks need. The adventure's layer is built exactly as before."
```

---

### Task 3: A general Arcade mover, with the adventure's as a wrapper

The tower needs the same body mechanics as the adventure's player — sync in, one Arcade step,
read back — and to know when a rising head was stopped, and under which row. `createBodyMover`
is that; the adventure's `createPlayerMove` becomes a wrapper that adds the `?` block bump.

This task was carried out as two commits. The first gave the mover a tile callback; review
found that the callback reports only the first tile along a head (see *What was checked in Phaser's source before writing this*). The
code below is the file after the second.

**Files:**
- Modify (full replacement): `next/src/physics/player.ts`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `next/src/physics/player.ts` with:

```ts
// A TYPE import, as in physics/tiles.ts: everything here hangs off objects the scene hands
// us, so nothing needs a Phaser VALUE, and headTileRow below stays reachable from
// tests/physics.test.ts (Phaser cannot be imported under Vitest at all).
import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { bumpBlocksAbove, type PlayerMove } from '../game/player';
import type { PlayerState, World } from '../game/types';
import { PX_PER_FRAME_TO_PX_PER_SECOND, stepBodyAlone } from './body';

/**
 * Which tile row a head-first hit landed on, given the body's top edge AFTER Arcade has
 * separated it.
 *
 * The live game reads the block row off the head's position BEFORE the snap
 * (index.html:1417-1418). Arcade has already separated the body by the time we see it, and
 * `ProcessTileSeparationY` leaves `body.y` exactly on the tile's bottom edge — an exact
 * multiple of TILE, since the layer sits at the origin at scale 1. That edge floors to the
 * row BELOW the block, so the block is one row up.
 *
 * Kept as a named function with its own test, because an off-by-one here does not crash
 * or even look wrong: the blocks simply stop paying out.
 */
export function headTileRow(bodyTop: number): number {
  return Math.floor(bodyTop / TILE) - 1;
}

/**
 * The world's size, and which of its four edges stop the body. The edges belong to the
 * world (`setBoundsCollision`), not to this body: every body in the scene that collides
 * with the world's bounds meets the same ones.
 */
export interface WorldEdges {
  width: number;
  height: number;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface BodyMoverOptions {
  /** The layer the body collides with. The only thing it collides with. */
  layer: Phaser.Tilemaps.TilemapLayer;
  /** World bounds to set; left out, the world's bounds are not touched and not used. */
  edges?: WorldEdges;
}

/** What one step found out that the player state cannot hold. */
export interface MoveReport {
  /**
   * The tile row a rising head was stopped under this step, or null. Which cells of that
   * row it hit is the caller's rule — the adventure's is bumpBlocksAbove's two probe
   * columns (game/player.ts).
   */
  headHitRow: number | null;
}

export type BodyMover = (p: PlayerState) => MoveReport;

/**
 * Puts a player on an Arcade body and returns the function that moves it one fixed step.
 *
 * **The body is a separator, not a home.** The player state stays the single source of
 * truth: every step pushes `x/y/vx/vy` INTO the body, takes one Arcade step, and reads the
 * resolved values back. Anything that writes the player's position or velocity elsewhere —
 * a respawn, a cape's pit rescue, a learn-mode spring — is picked up automatically.
 *
 * **World gravity is off and `vy` is integrated by hand** (game/player.ts's stepMotion):
 * the apex hang is a per-frame multiplier Arcade's constant gravity cannot express.
 * `allowGravity` is off as well as the world's gravity being zero, to say out loud that
 * the absence is deliberate.
 *
 * **`onGround` comes from `blocked.down`, and it has to.** Phaser 4 sets `touching.*` only
 * in the body-versus-body separator; a body standing on a TILEMAP has `touching.down` false
 * forever. Reading it would leave `onGround` false for good — coyote time would never arm,
 * the jump buffer would never fire, and the player could not jump at all. `blocked.down`
 * also covers world bounds.
 *
 * **A head hit is `blocked.up`, plus the row it was stopped under** (headTileRow). The tile
 * separator sets `blocked.up` only when the body was RISING, so it cannot fire on a landing
 * or a sideways scrape. There is no tile callback, because Arcade's collider callback
 * cannot say which tiles a head hit: it visits tiles left to right, and once it has snapped
 * the body under the first, the next one along no longer overlaps the body and is never
 * reported. A head under a brick and a letter would report the brick alone.
 *
 * **A standalone body**, with no Game Object, for two reasons. A body with one re-reads its
 * position from it every step, which would make the drawn image an input to the physics;
 * and a player can be drawn by more than one image (SliceScene's syncPlayer swaps three),
 * none of which is the hitbox. The body IS the hitbox, so `body.position` is `p.x, p.y`
 * with no offset: the sprite's 2px margin is SliceScene's PLAYER_DRAW_INSET, where the
 * drawing is, and does not belong here.
 *
 * **It rests disabled** and is switched on for exactly its own step (physics/body.ts's
 * stepBodyAlone), so no other body's step moves it.
 */
export function createBodyMover(
  scene: Phaser.Scene,
  player: PlayerState,
  options: BodyMoverOptions,
): BodyMover {
  const physics = scene.physics;
  const { edges } = options;

  // Before the body: its custom bounds rectangle is captured from world.bounds when it is
  // built. setBounds mutates that same Rectangle, so the order does not strictly matter —
  // but a body built against the canvas's 640x400 default is a trap for later. Without
  // `edges` the body is built against exactly that default, which is harmless only because
  // it then never collides with the world's bounds.
  if (edges) {
    physics.world.setBounds(0, 0, edges.width, edges.height, edges.left, edges.right, edges.up, edges.down);
  }

  const body = physics.add.body(player.x, player.y, player.w, player.h);
  body.allowGravity = false;
  body.setCollideWorldBounds(edges !== undefined);

  // A persistent collider rather than a per-step physics.collide call, so that it runs
  // INSIDE the Arcade step, between the body moving and the step ending.
  physics.add.collider(body, options.layer);

  body.enable = false;

  return (p: PlayerState): MoveReport => {
    // A respawn can replace the player wholesale; a hitbox that kept the old size would be
    // a horrible bug to find.
    if (body.width !== p.w || body.height !== p.h) {
      body.setSize(p.w, p.h, false);
    }
    body.position.set(p.x, p.y);
    body.velocity.set(p.vx * PX_PER_FRAME_TO_PX_PER_SECOND, p.vy * PX_PER_FRAME_TO_PX_PER_SECOND);

    stepBodyAlone(physics.world, body);

    p.x = body.x;
    p.y = body.y;
    // Arcade only ever zeroes these (bounce, drag and acceleration are all off), so this is
    // reading back the separation, not a new velocity.
    p.vx = body.velocity.x / PX_PER_FRAME_TO_PX_PER_SECOND;
    p.vy = body.velocity.y / PX_PER_FRAME_TO_PX_PER_SECOND;
    p.onGround = body.blocked.down;
    return { headHitRow: body.blocked.up ? headTileRow(body.y) : null };
  };
}

/**
 * The adventure's mover: `createBodyMover` with the level's bounds — the left edge only,
 * because the live game clamps `p.x` at 0 (index.html:1422) and has no right edge, no
 * ceiling and, above all, no floor: the pit is a `y` threshold the player must be able to
 * fall through — plus the head-first `?` block bump (index.html:1417-1420).
 *
 * `player.x` is already written back when bumpBlocksAbove reads its two probe columns, as
 * the live source reads them off its already-swept x.
 */
export function createPlayerMove(
  scene: Phaser.Scene,
  world: World,
  collisionLayer: Phaser.Tilemaps.TilemapLayer,
): PlayerMove {
  const mover = createBodyMover(scene, world.player, {
    layer: collisionLayer,
    edges: {
      width: world.level.width * TILE,
      height: world.level.height * TILE,
      left: true,
      right: false,
      up: false,
      down: false,
    },
  });
  return (w: World): void => {
    const { headHitRow } = mover(w.player);
    if (headHitRow !== null) {
      bumpBlocksAbove(w, headHitRow);
    }
  };
}
```

- [ ] **Step 2: Run everything and type-check**

Run: `npm test && npm run build`
Expected: all pass (physics.test.ts's `headTileRow` tests included), build clean.

- [ ] **Step 3: Check the adventure in a browser**

Arcade cannot run under Vitest, so this is the only check the mover gets. Run `npm run dev`,
open the printed URL, press Space on the title, choose ADVENTURE, a difficulty and a hero.
On level 1:
- walk right; the player stands on the ground and stops against platforms' sides;
- jump onto a platform; land on it;
- jump into the first `?` block from below; a star pops out and the block turns to brick;
- fall into the first gap; the player dies (not on super easy, where the cape saves you).

Expected: all four exactly as before this task. If any differ, stop: the wrapper is wrong.

- [ ] **Step 4: Commit**

```bash
git add src/physics/player.ts
git commit -m "refactor: one Arcade mover for any player, the adventure's wrapped round it" -m "createBodyMover is the body the adventure's player always had — sync in, one single-body Arcade step, read back — with optional world edges and a callback Arcade calls with each tile it separated the body from. createPlayerMove is now the adventure's bounds plus the ? block bump on top of it, and behaves as before: checked in the browser, because Arcade cannot run under Vitest."
```

---

### Task 4: The learn pools, targets and options

**Files:**
- Create: `next/src/game/learn/content.ts`
- Modify: `next/tests/world.test.ts`
- Test: `next/tests/learnContent.test.ts`

Review found that nothing reset `used` once the pool ran out, so every later tower drew
from the whole pool and most repeated something from the tower before. Follow-up commits
start a new round there. The code below is the result.

- [ ] **Step 1: Let the Phaser-free check see into subfolders**

`tests/world.test.ts` checks that nothing in `src/game/` imports Phaser by reading every
entry there as a file. The first file in `src/game/learn/` would make it crash on the folder
(`EISDIR`). Make it walk subfolders, which also puts the learn rules under the same check.
Replace:

```ts
it('src/game stays free of Phaser so it can run headlessly', () => {
  const dir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../src/game');
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(source, `${file} imports Phaser`).not.toMatch(/from ['"]phaser['"]/);
  }
});
```

with:

```ts
it('src/game stays free of Phaser so it can run headlessly', () => {
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../src/game');
  // Every file, subfolders included: learn mode keeps its rules in src/game/learn/.
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of files(root)) {
    const source = fs.readFileSync(file, 'utf8');
    expect(source, `${path.relative(root, file)} imports Phaser`).not.toMatch(/from ['"]phaser['"]/);
  }
});
```

Run: `npx vitest run tests/world.test.ts`
Expected: PASS. The folder does not exist yet; the check is ready for it.

- [ ] **Step 2: Write the failing tests**

Create `next/tests/learnContent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  distractorPool, GATES_PER_TOWER, LEARN_LETTERS, LEARN_SYLLABLES, LEARN_WORDS, pickOptions,
  pickTargets,
} from '../src/game/learn/content';
import { loadLegacySection } from './helpers/legacy';

// A tiny deterministic source, local to this file (Task 5 adds a shared one).
function seq(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const legacy = loadLegacySection({
  from: '//  LEARN MODE',
  to: '//  CONTROLLER IDENTITY',
  expose: ['LEARN_LETTERS', 'LEARN_SYLLABLES', 'LEARN_WORDS'],
});

describe('the learn pools', () => {
  it("are the live game's, unchanged", () => {
    expect(LEARN_LETTERS).toEqual(legacy.LEARN_LETTERS);
    expect(LEARN_SYLLABLES).toEqual(legacy.LEARN_SYLLABLES);
    expect(LEARN_WORDS).toEqual(legacy.LEARN_WORDS);
  });

  it('hold only words of one letter per gate', () => {
    expect(LEARN_WORDS.every((w) => w.length === GATES_PER_TOWER)).toBe(true);
  });
});

describe("a tower's targets", () => {
  it('are four different letters, remembered for the next tower', () => {
    const used: string[] = [];
    const { targets, word } = pickTargets('letters', used, seq(1));
    expect(word).toBeNull();
    expect(targets).toHaveLength(GATES_PER_TOWER);
    expect(new Set(targets).size).toBe(GATES_PER_TOWER);
    expect(targets.every((t) => LEARN_LETTERS.includes(t))).toBe(true);
    expect(used).toEqual(targets);
  });

  it('avoid what this round has already asked', () => {
    const used = LEARN_SYLLABLES.slice(0, LEARN_SYLLABLES.length - GATES_PER_TOWER);
    const { targets } = pickTargets('syllables', used, seq(2));
    expect(targets.sort()).toEqual(LEARN_SYLLABLES.slice(-GATES_PER_TOWER).sort());
  });

  it('never repeat inside a tower, even once the pool is used up', () => {
    const used = [...LEARN_LETTERS];
    const { targets } = pickTargets('letters', used, seq(3));
    expect(new Set(targets).size).toBe(GATES_PER_TOWER);
    expect(targets.every((t) => LEARN_LETTERS.includes(t))).toBe(true);
  });

  it('spell one word, a letter per gate, in words mode', () => {
    const used: string[] = [];
    const { targets, word } = pickTargets('words', used, seq(4));
    expect(word).not.toBeNull();
    expect(LEARN_WORDS).toContain(word);
    expect(targets.join('')).toBe(word);
    expect(used).toEqual([word]);
  });

  it('start a new round once the pool is used up, still avoiding the tower that used it up', () => {
    const used = LEARN_LETTERS.slice(0, LEARN_LETTERS.length - GATES_PER_TOWER);
    const { targets: last } = pickTargets('letters', used, seq(5));
    expect(used).toEqual(last);
    expect([...last].sort()).toEqual(LEARN_LETTERS.slice(-GATES_PER_TOWER).sort());
    const { targets: next } = pickTargets('letters', used, seq(6));
    expect(next.some((t) => last.includes(t))).toBe(false);
  });

  it('start a new round of words with the last fresh one, and not repeat it next', () => {
    const used = LEARN_WORDS.slice(0, -1);
    const { word } = pickTargets('words', used, seq(7));
    expect(word).toBe(LEARN_WORDS[LEARN_WORDS.length - 1]);
    expect(used).toEqual([word]);
    expect(pickTargets('words', used, seq(8)).word).not.toBe(word);
  });

  it('still pick a word when every word has been spelled', () => {
    const used = [...LEARN_WORDS];
    const { word } = pickTargets('words', used, seq(9));
    expect(LEARN_WORDS).toContain(word);
    expect(used).toEqual([word]);
    expect(pickTargets('words', used, seq(10)).word).not.toBe(word);
  });
});

describe("a gate's options", () => {
  it('are three different items with the target exactly once', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const mode of ['letters', 'syllables', 'words'] as const) {
        const target = mode === 'syllables' ? 'MA' : 'K';
        const options = pickOptions(target, mode, seq(seed));
        expect(options).toHaveLength(3);
        expect(new Set(options).size).toBe(3);
        expect(options.filter((o) => o === target)).toHaveLength(1);
        expect(options.every((o) => distractorPool(mode).includes(o))).toBe(true);
      }
    }
  });

  it('come from the syllables for syllables, and from the letters otherwise', () => {
    expect(distractorPool('syllables')).toBe(LEARN_SYLLABLES);
    expect(distractorPool('letters')).toBe(LEARN_LETTERS);
    expect(distractorPool('words')).toBe(LEARN_LETTERS);
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/learnContent.test.ts`
Expected: FAIL — cannot resolve `../src/game/learn/content`.

- [ ] **Step 4: Implement**

Create `next/src/game/learn/content.ts`:

```ts
import { random } from '../random';

/** Which learn exercise a tower asks. */
export type LearnMode = 'letters' | 'syllables' | 'words';

/** A random source in [0, 1). Defaults to game/random.ts's seam; tests pass their own. */
export type Rand = () => number;

/** index.html:2466-2468, unchanged. tests/learnContent.test.ts compares them with the live file. */
export const LEARN_LETTERS: readonly string[] = ['A', 'E', 'I', 'O', 'U', 'M', 'N', 'S', 'K', 'T', 'L', 'P', 'R', 'J', 'V', 'H', 'Ä', 'Ö', 'Ü', 'Õ'];
export const LEARN_SYLLABLES: readonly string[] = ['MA', 'PA', 'SA', 'KA', 'TA', 'LA', 'NA', 'ME', 'SE', 'KE', 'TE', 'LE', 'MI', 'SI', 'KI', 'TI', 'MO', 'KO', 'TO', 'MU', 'KU', 'TU', 'LU'];
export const LEARN_WORDS: readonly string[] = ['KASS', 'KOER', 'MAJA', 'PALL', 'KALA', 'LUMI', 'AUTO', 'MUNA', 'PAAT', 'SUUR'];

/** One tower asks four questions. Every word in LEARN_WORDS has four letters, a letter per gate. */
export const GATES_PER_TOWER = 4;

export function pickFrom<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

export function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface TowerTargets {
  /** One per gate, bottom to top. */
  targets: string[];
  /** The word being spelled, in words mode; null otherwise. */
  word: string | null;
}

/**
 * A tower's four questions, avoiding what this round has already asked (`used`, which this
 * appends to) and never repeating one inside a tower. In words mode the four are the
 * letters of one word, and it is the word that is not repeated. The tower that uses up the
 * pool ends the round: `used` is emptied and keeps only that tower's own questions, so
 * they are not asked again until the round after.
 */
export function pickTargets(mode: LearnMode, used: string[], rand: Rand = random): TowerTargets {
  if (mode === 'words') {
    const fresh = LEARN_WORDS.filter((w) => !used.includes(w));
    const word = pickFrom(fresh.length > 0 ? fresh : LEARN_WORDS, rand);
    if (fresh.length <= 1) used.length = 0;
    used.push(word);
    return { targets: word.split(''), word };
  }
  const pool = mode === 'letters' ? LEARN_LETTERS : LEARN_SYLLABLES;
  const targets: string[] = [];
  for (let i = 0; i < GATES_PER_TOWER; i++) {
    const fresh = pool.filter((x) => !used.includes(x) && !targets.includes(x));
    targets.push(pickFrom(fresh.length > 0 ? fresh : pool.filter((x) => !targets.includes(x)), rand));
  }
  if (pool.every((x) => used.includes(x) || targets.includes(x))) used.length = 0;
  used.push(...targets);
  return { targets, word: null };
}

/** Where a gate's wrong answers come from: syllables for syllables, letters for letters AND words. */
export function distractorPool(mode: LearnMode): readonly string[] {
  return mode === 'syllables' ? LEARN_SYLLABLES : LEARN_LETTERS;
}

/** A gate's three blocks: the target and two different distractors, shuffled. */
export function pickOptions(target: string, mode: LearnMode, rand: Rand = random): string[] {
  const others = shuffled(distractorPool(mode).filter((x) => x !== target), rand).slice(0, 2);
  return shuffled([target, ...others], rand);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/learnContent.test.ts`
Expected: PASS. If the legacy test fails with a marker error, check the markers against
`index.html` (`//  LEARN MODE — Tower Climb with Letter Gates` and `//  CONTROLLER IDENTITY`,
two spaces after the slashes).

- [ ] **Step 6: Run everything, type-check, commit**

Run: `npm test && npm run build`
Expected: all pass, build clean.

```bash
git add src/game/learn/content.ts tests/learnContent.test.ts tests/world.test.ts
git commit -m "feat: what a learn tower asks" -m "The letter, syllable and word pools, copied from index.html and tested against it, and the two choices built on them: a tower's four targets, avoiding what the session has already asked and never repeating inside a tower, and a gate's three options, the target plus two different distractors from the right pool. Words mode spells one four-letter word, a letter per gate."
```

---

### Task 5: Building a tower

The whole storey geometry of the spec, as data. Every rule in the spec's *Hop rules* and
*The gate* sections is a test here.

**Files:**
- Create: `next/src/game/learn/tower.ts`
- Create: `next/tests/helpers/seeded.ts`
- Modify: `next/src/game/tiles.ts`, `next/src/physics/tiles.ts` (the tile-faces types move)
- Modify: `next/tests/learnContent.test.ts`
- Test: `next/tests/learnTower.test.ts`

Review added tests for the whole map, the spec's block columns, the tile faces and the
camera helpers. It renamed `VIEW_W`/`VIEW_H` and `BASE`, which sat too close to the
adventure's names, and moved `TileFaces` to `game/tiles.ts` so the tower imports nothing
from `physics/`. It also moved the star across the roof from the last spring, which could
otherwise carry the hero straight into it. The code below is the result.

- [ ] **Step 1: Add the seeded random helper**

Create `next/tests/helpers/seeded.ts`:

```ts
/**
 * mulberry32: a tiny deterministic random source, so a tower that fails a test can be built
 * again from its seed.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Then move `next/tests/learnContent.test.ts` onto it, so the tests have one deterministic
source (its local `seq`, a Park–Miller generator, starts every seed from 1 to 200 on a first
draw below 0.0016):
- delete that file's local `seq` function and the comment line above it;
- add `import { seeded } from './helpers/seeded';` after its `loadLegacySection` import;
- replace every `seq(` in the file with `seeded(`.

Run: `npx vitest run tests/learnContent.test.ts`
Expected: PASS. None of its assertions depends on which numbers come out.

- [ ] **Step 2: Write the failing tests**

Create `next/tests/learnTower.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { GATES_PER_TOWER, LEARN_WORDS, pickTargets, type LearnMode } from '../src/game/learn/content';
import {
  BATTLEMENTS, buildTower, GAPS, HUD_ROOM, INSIDE, LEARN_VIEW_H, LEARN_VIEW_W, LETTER_ROOM, MAP_COLS,
  plankLengths, RISE, settleCenter, START_COL, starBox, storeyView, T_BRICK, T_EMPTY, T_LETTER,
  T_PLANK, T_STONE, towerTileFaces, type TowerLayout, WALL,
} from '../src/game/learn/tower';
import { seeded } from './helpers/seeded';

const MODES: LearnMode[] = ['letters', 'syllables', 'words'];
const BUILT = MODES.flatMap((mode) => Array.from({ length: 100 }, (_, i) => {
  const rand = seeded(i + 1);
  const { targets, word } = pickTargets(mode, [], rand);
  return { name: `${mode} seed ${i + 1}`, layout: buildTower(mode, targets, word, rand) };
}));

/** Runs `check` on every built tower and collects its complaints, named by tower. */
function problems(check: (t: TowerLayout) => string[]): string[] {
  return BUILT.flatMap(({ name, layout }) => check(layout).map((p) => `${name}: ${p}`));
}

describe('a learn tower', () => {
  it('rises three tiles every hop', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const out = st.planks.flatMap((p, k) =>
        p.row === st.floorRow - RISE * (k + 1) ? [] : [`storey ${s} plank ${k}`]);
      if (st.letterFloorRow !== st.floorRow - RISE * (st.planks.length + 1)) out.push(`storey ${s} letter floor`);
      return out;
    }))).toEqual([]);
  });

  it('puts gaps of 2, 3, 4, 4 tiles between planks, and never lets planks overlap', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.slice(1).flatMap((b, k) => {
      const a = st.planks[k];
      const gap = b.col > a.col ? b.col - (a.col + a.width) : a.col - (b.col + b.width);
      return gap === GAPS[s] ? [] : [`storey ${s} gap ${k} is ${gap}`];
    })))).toEqual([]);
  });

  it("takes each plank's length from its storey's set", () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.flatMap((p, k) =>
      plankLengths(s).includes(p.width) ? [] : [`storey ${s} plank ${k} is ${p.width} wide`])))).toEqual([]);
    expect(plankLengths(0)).toEqual([6, 5]);
    expect(plankLengths(1)).toEqual([5, 4, 3]);
    expect(plankLengths(2)).toEqual([4, 3, 2]);
    expect(plankLengths(3)).toEqual([4, 3, 2]);
  });

  it('keeps planks inside the walls', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.planks.flatMap((p, k) =>
      p.col >= 0 && p.col + p.width <= INSIDE ? [] : [`storey ${s} plank ${k}`])))).toEqual([]);
  });

  it('starts each storey a short walk from where you arrive', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const expected = s === 0 ? START_COL : centreOfAnswer(t, s - 1);
      if (st.arrivalCol !== expected) return [`storey ${s} arrival ${st.arrivalCol} vs ${expected}`];
      const p = st.planks[0];
      const walk = p.col > st.arrivalCol ? p.col - st.arrivalCol : st.arrivalCol - (p.col + p.width - 1);
      return walk >= 2 && walk <= 6 ? [] : [`storey ${s} first plank ${walk} tiles away`];
    }))).toEqual([]);
  });

  it('makes the first storey short and every tower have a long climb', () => {
    expect(problems((t) => {
      const counts = t.storeys.map((st) => st.planks.length);
      const out: string[] = [];
      if (counts[0] < 1 || counts[0] > 2) out.push(`first storey has ${counts[0]}`);
      if (counts.some((n) => n < 1 || n > 5)) out.push(`counts ${counts}`);
      if (!counts.slice(1).some((n) => n >= 4)) out.push(`no long climb in ${counts}`);
      return out;
    })).toEqual([]);
  });

  it('lays the letter floor across the whole tower', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) =>
      range(WALL, WALL + INSIDE).every((c) => t.map[st.letterFloorRow][c] === T_PLANK) ? [] : [`storey ${s}`]))).toEqual([]);
  });

  it('builds a solid brick ceiling with the letters set into it', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => st.ceilingRows.flatMap((row) =>
      range(0, INSIDE).flatMap((c) => {
        const inBlock = st.blocks.some((b) => c >= b.col && c < b.col + b.width);
        const want = inBlock ? T_LETTER : T_BRICK;
        return t.map[row][c + WALL] === want ? [] : [`storey ${s} row ${row} col ${c}`];
      }))))).toEqual([]);
  });

  it('hangs the letters five tiles above the letter floor', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) =>
      st.ceilingRows[1] + 1 === st.letterFloorRow - LETTER_ROOM ? [] : [`storey ${s}`]))).toEqual([]);
  });

  it('gives each gate three different options and one right answer', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const letters = st.blocks.map((b) => b.letter);
      const right = st.blocks.filter((b) => b.correct);
      return new Set(letters).size === 3 && right.length === 1 && right[0].letter === st.target ? [] : [`storey ${s}`];
    }))).toEqual([]);
  });

  it('spells a word from the list in words mode', () => {
    for (const { layout } of BUILT.filter((b) => b.layout.mode === 'words')) {
      expect(LEARN_WORDS).toContain(layout.word);
      expect(layout.storeys.map((st) => st.target).join('')).toBe(layout.word);
    }
  });

  it('stacks each storey on the one below, and the roof on the last', () => {
    expect(problems((t) => {
      const out = t.storeys.slice(1).flatMap((st, k) =>
        st.floorRow === t.storeys[k].ceilingRows[0] ? [] : [`storey ${k + 1}`]);
      if (t.roofRow !== t.storeys[t.storeys.length - 1].ceilingRows[0]) out.push('roof');
      return out;
    })).toEqual([]);
  });

  it('stands its walls from the base to above the roof', () => {
    expect(problems((t) => range(t.roofRow, t.rows).flatMap((r) =>
      [0, 1, MAP_COLS - 2, MAP_COLS - 1].every((c) => t.map[r][c] === T_STONE) ? [] : [`row ${r}`]))).toEqual([]);
  });

  it('fits a storey of one or two planks on screen, and scrolls the longer ones', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const fits = storeyView(t, s).height <= LEARN_VIEW_H;
      return fits === (st.planks.length <= 2) ? [] : [`storey ${s} with ${st.planks.length} planks`];
    }))).toEqual([]);
  });

  it('stands the star on the roof, in view below the HUD', () => {
    expect(problems((t) => {
      const box = starBox(t);
      const view = storeyView(t, t.storeys.length);
      const out: string[] = [];
      if (t.star.col < 0 || t.star.col + 2 > INSIDE) out.push(`star at ${t.star.col} is not inside the walls`);
      for (let c = t.star.col; c < t.star.col + 2; c++) {
        if (towerTileFaces(t.map[t.roofRow][c + WALL]) !== 'all') out.push(`col ${c} is not on solid roof`);
        if (t.map[t.roofRow - 1][c + WALL] !== T_EMPTY || t.map[t.roofRow - 2][c + WALL] !== T_EMPTY) {
          out.push(`col ${c} is not clear above the roof`);
        }
      }
      if (box.y + box.h !== t.roofRow * TILE) out.push('not standing on the roof');
      if (box.y < view.y + HUD_ROOM || box.y + box.h > view.y + LEARN_VIEW_H) out.push('out of view');
      return out;
    })).toEqual([]);
  });

  it('keeps the star clear of the columns the last spring comes up through', () => {
    expect(problems((t) => {
      const last = t.storeys[t.storeys.length - 1];
      const answer = last.blocks.find((b) => b.correct) ?? last.blocks[0];
      // The trapdoor is the block and a column either side; one more for the hero's width.
      const from = answer.col - 2;
      const to = answer.col + answer.width + 1;
      return t.star.col + 1 < from || t.star.col > to ? [] : [`star at ${t.star.col}, spring through ${from}-${to}`];
    })).toEqual([]);
  });

  it('draws exactly what its storeys describe, and nothing else', () => {
    expect(problems((t) => {
      const want = t.map.map((row) => row.map(() => T_EMPTY));
      const fill = (row: number, col: number, width: number, code: number): void => {
        for (let c = col; c < col + width; c++) want[row][c + WALL] = code;
      };
      for (let r = t.storeys[0].floorRow; r < t.rows; r++) fill(r, 0, INSIDE, T_BRICK);
      for (const st of t.storeys) {
        for (const p of st.planks) fill(p.row, p.col, p.width, T_PLANK);
        fill(st.letterFloorRow, 0, INSIDE, T_PLANK);
        for (const row of st.ceilingRows) {
          fill(row, 0, INSIDE, T_BRICK);
          for (const b of st.blocks) fill(row, b.col, b.width, T_LETTER);
        }
      }
      for (let r = t.roofRow - BATTLEMENTS; r < t.rows; r++) {
        want[r][1] = T_STONE;
        want[r][MAP_COLS - 2] = T_STONE;
        if (r > t.roofRow - BATTLEMENTS) {
          want[r][0] = T_STONE;
          want[r][MAP_COLS - 1] = T_STONE;
        }
      }
      return t.map.flatMap((row, r) => row.flatMap((code, c) => (code === want[r][c] ? [] : [`row ${r} col ${c}`])));
    })).toEqual([]);
  });

  it('sets the blocks where the spec puts them', () => {
    expect(problems((t) => {
      const want = t.mode === 'syllables' ? [[2, 3], [10, 3], [18, 3]] : [[3, 2], [11, 2], [19, 2]];
      return t.storeys.flatMap((st, s) =>
        JSON.stringify(st.blocks.map((b) => [b.col, b.width])) === JSON.stringify(want) ? [] : [`storey ${s}`]);
    })).toEqual([]);
  });

  it('lets wood be jumped up through, and nothing else', () => {
    expect(towerTileFaces(T_PLANK)).toBe('top');
    for (const code of [T_BRICK, T_STONE, T_LETTER]) expect(towerTileFaces(code)).toBe('all');
    expect(towerTileFaces(T_EMPTY)).toBe('none');
  });

  it('sends the first plank away from the nearer wall', () => {
    expect(problems((t) => t.storeys.flatMap((st, s) => {
      const p = st.planks[0];
      const away = st.arrivalCol < INSIDE / 2 ? p.col > st.arrivalCol : p.col < st.arrivalCol;
      return away ? [] : [`storey ${s}`];
    }))).toEqual([]);
  });

  it('has four storeys, with a gap for each', () => {
    expect(GAPS).toHaveLength(GATES_PER_TOWER);
    expect(problems((t) => (t.storeys.length === GATES_PER_TOWER ? [] : [`${t.storeys.length} storeys`]))).toEqual([]);
  });

  it('starts the hero at the door, on the first storey floor', () => {
    expect(problems((t) =>
      t.start.col === START_COL && t.start.row === t.storeys[0].floorRow ? [] : ['start'])).toEqual([]);
  });

  it('settles a short view from its top and a tall one on its floor, centred on the tower', () => {
    const middle = (MAP_COLS * TILE) / 2;
    const short = { x: middle - LEARN_VIEW_W / 2, y: 100, width: LEARN_VIEW_W, height: LEARN_VIEW_H - 8 };
    const tall = { x: middle - LEARN_VIEW_W / 2, y: 100, width: LEARN_VIEW_W, height: LEARN_VIEW_H + 88 };
    expect(settleCenter(short)).toEqual({ x: middle, y: 100 + LEARN_VIEW_H / 2 });
    expect(settleCenter(tall)).toEqual({ x: middle, y: 100 + LEARN_VIEW_H + 88 - LEARN_VIEW_H / 2 });
    expect(problems((t) => {
      const v = storeyView(t, 0);
      return v.width === LEARN_VIEW_W && v.x + v.width / 2 === middle ? [] : ['off centre'];
    })).toEqual([]);
  });
});

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function centreOfAnswer(t: TowerLayout, s: number): number {
  const b = t.storeys[s].blocks.find((x) => x.correct) ?? t.storeys[s].blocks[0];
  return b.col + Math.floor(b.width / 2);
}
```

- [ ] **Step 3: Run to see it fail**

Run: `npx vitest run tests/learnTower.test.ts`
Expected: FAIL — cannot resolve `../src/game/learn/tower`.

- [ ] **Step 4: Implement**

First give the collision vocabulary a home among the game rules, so `tower.ts` needs nothing
from `physics/` (everywhere else, physics depends on game). Move these two declarations,
with their doc comments, from `next/src/physics/tiles.ts` to the end of
`next/src/game/tiles.ts`:

```ts
/**
 * Which sides of a tile stop the player. `top` is a plank: land on it from above, jump up
 * through it from below. The adventure only ever has `all` and `none`; learn mode's tower
 * adds `top` (game/learn/tower.ts's `towerTileFaces`).
 */
export type TileFaces = 'none' | 'all' | 'top';

/** A tile vocabulary's collision: one answer per tile code. */
export type FacesRule = (code: number) => TileFaces;
```

and add `import type { FacesRule, TileFaces } from '../game/tiles';` to `physics/tiles.ts`,
just above its `import type { World } from '../game/types';`.

Create `next/src/game/learn/tower.ts`:

```ts
import { BASE_H, BASE_W, TILE } from '../../config/constants';
import { random } from '../random';
import type { TileFaces } from '../tiles';
import { GATES_PER_TOWER, type LearnMode, pickFrom, pickOptions, type Rand } from './content';

/** The tower's own tile codes. They are also the frame numbers of its tileset (gfx/learnTiles.ts). */
export const T_EMPTY = 0;
export const T_BRICK = 1;
export const T_STONE = 2;
export const T_PLANK = 3;
export const T_LETTER = 4;

/** Wood can be jumped up through; brick, stone and letter blocks cannot. */
export function towerTileFaces(code: number): TileFaces {
  if (code === T_PLANK) return 'top';
  if (code === T_BRICK || code === T_STONE || code === T_LETTER) return 'all';
  return 'none';
}

/** Columns inside the walls. */
export const INSIDE = 24;
/** Wall thickness, each side. */
export const WALL = 2;
export const MAP_COLS = INSIDE + 2 * WALL;
/** Every hop, in tiles. */
export const RISE = 3;
/** Letter floor to the underside of the letter ceiling. */
export const LETTER_ROOM = 5;
/** Letter ceiling thickness. */
export const CEILING = 2;
/** Rows of brick under the first storey. */
export const BASE_ROWS = 2;
/** Wall rows above the roof. */
export const BATTLEMENTS = 2;
/** Rows of sky above the roof. */
export const ROOF_SKY = 8;
/** The gap between consecutive planks, by storey. */
export const GAPS: readonly number[] = [2, 3, 4, 4];
/** Inside column the hero starts on, beside the tower's door. */
export const START_COL = 4;
/** How far in from either wall the star stands, in tiles. */
export const STAR_INSET = 3;

/** The tower's camera zoom: a one- or two-plank storey fits whole at this zoom. */
export const LEARN_ZOOM = 1.25;
/** The tower's view in world px. Not config/constants.ts's VIEW_W/VIEW_H: the adventure zooms 1.5. */
export const LEARN_VIEW_W = BASE_W / LEARN_ZOOM;
export const LEARN_VIEW_H = BASE_H / LEARN_ZOOM;
/** World px the 48px HUD covers at this zoom (48 / 1.25 = 38.4), rounded up. */
export const HUD_ROOM = 40;

/** A plank: `col` counts inside the walls, `row` is the map row whose top it stands on. */
export interface Plank {
  col: number;
  width: number;
  row: number;
}

/** A letter block set into a letter ceiling. `col` counts inside the walls, as a plank's does. */
export interface Block {
  col: number;
  width: number;
  letter: string;
  correct: boolean;
}

export interface Storey {
  /** The map row whose top is this storey's floor. */
  floorRow: number;
  planks: Plank[];
  letterFloorRow: number;
  /** The letter ceiling: its top row, then its bottom row. */
  ceilingRows: [number, number];
  blocks: Block[];
  target: string;
  /** Inside column the hero arrives on: the door for the first storey, the answer below for the rest. */
  arrivalCol: number;
}

export interface TowerLayout {
  mode: LearnMode;
  word: string | null;
  /** Rows top to bottom, MAP_COLS wide. Gate rules edit it as trapdoors open and shut. */
  map: number[][];
  rows: number;
  storeys: Storey[];
  /** The map row whose top is the roof. */
  roofRow: number;
  /** Feet on top of `row`, at inside column `col`. */
  start: { col: number; row: number };
  /** The star's inside column, standing on the top of `row`. */
  star: { col: number; row: number };
}

/**
 * The star's inside column (it is two tiles wide), STAR_INSET tiles in from the wall on the
 * far side of the roof from `arrivalCol`, where the last spring comes up. So the spring
 * lands you on the roof, clear of the star, and you walk to it, rather than springing
 * straight into it and ending the tower in mid-air.
 */
export function starCol(arrivalCol: number): number {
  return arrivalCol < INSIDE / 2 ? INSIDE - STAR_INSET - 2 : STAR_INSET;
}

/** A storey with `planks` planks, floor to ceiling top, in tiles. */
export function storeyHeight(planks: number): number {
  return RISE * (planks + 1) + LETTER_ROOM + CEILING;
}

/**
 * The plank lengths a storey may use: long (8 minus the gap), medium (7 minus) and short
 * (6 minus). The first storey leaves the short ones out. See the spec's hop rules for what
 * each length guarantees.
 */
export function plankLengths(storey: number): number[] {
  const gap = GAPS[storey];
  return storey === 0 ? [8 - gap, 7 - gap] : [8 - gap, 7 - gap, 6 - gap];
}

/** Where the letter blocks sit, inside the walls: 2 wide for letters, 3 wide for syllables. */
export function blockLayout(mode: LearnMode): { cols: number[]; width: number } {
  return mode === 'syllables' ? { cols: [2, 10, 18], width: 3 } : { cols: [3, 11, 19], width: 2 };
}

/** Plank counts per storey: the first 1 or 2; the others 1 to 5, with at least one 4 or 5. */
export function plankCounts(rand: Rand): number[] {
  const counts = [1 + Math.floor(rand() * 2)];
  for (let s = 1; s < GATES_PER_TOWER; s++) counts.push(1 + Math.floor(rand() * 5));
  if (!counts.slice(1).some((n) => n >= 4)) {
    counts[1 + Math.floor(rand() * (GATES_PER_TOWER - 1))] = 4 + Math.floor(rand() * 2);
  }
  return counts;
}

/**
 * One storey's planks, as inside columns and widths. The first starts 2 to 6 tiles to the
 * side of the arrival column, away from the nearer wall. Each next plank is the storey's gap
 * beyond the last one, carrying on in the same direction while it fits and turning back at
 * a wall. No plank can then overlap the one before it.
 *
 * Every plank fits without clamping. From any arrival column, a walk of at most 6 plus the
 * longest plank stops short of the far wall. A turn-back always has room: both ways are
 * blocked only if a plank, two gaps and two more planks need 26 columns or more, and with
 * these gaps and lengths they need at most 22.
 */
export function placePlanks(storey: number, count: number, arrivalCol: number, rand: Rand): Array<{ col: number; width: number }> {
  const lengths = plankLengths(storey);
  const gap = GAPS[storey];
  let dir = arrivalCol < INSIDE / 2 ? 1 : -1;
  const first = pickFrom(lengths, rand);
  const walk = 2 + Math.floor(rand() * 5);
  const firstCol = dir > 0 ? arrivalCol + walk : arrivalCol - walk - (first - 1);
  const planks = [{ col: firstCol, width: first }];
  for (let k = 1; k < count; k++) {
    const width = pickFrom(lengths, rand);
    const prev = planks[k - 1];
    const beside = (d: number): number => (d > 0 ? prev.col + prev.width + gap : prev.col - gap - width);
    let col = beside(dir);
    if (col < 0 || col > INSIDE - width) {
      dir = -dir;
      col = beside(dir);
    }
    planks.push({ col, width });
  }
  return planks;
}

/**
 * Builds one tower for four targets, bottom-up: the base, four storeys (planks, a letter
 * floor, a letter ceiling), the roof, and the walls. Heights are counted in tiles above the
 * base's top and turned into map rows at the end of the arithmetic, so the map's row 0 is
 * the sky above the roof.
 */
export function buildTower(
  mode: LearnMode,
  targets: readonly string[],
  word: string | null,
  rand: Rand = random,
): TowerLayout {
  const counts = plankCounts(rand);
  const roofHeight = counts.reduce((sum, n) => sum + storeyHeight(n), 0);
  const rows = ROOF_SKY + roofHeight + BASE_ROWS;
  const rowAt = (height: number): number => rows - BASE_ROWS - height;
  const map = Array.from({ length: rows }, () => new Array<number>(MAP_COLS).fill(T_EMPTY));
  const fill = (row: number, col: number, width: number, code: number): void => {
    for (let c = col; c < col + width; c++) map[row][c + WALL] = code;
  };

  for (let r = rows - BASE_ROWS; r < rows; r++) fill(r, 0, INSIDE, T_BRICK);

  const { cols: blockCols, width: blockWidth } = blockLayout(mode);
  const storeys: Storey[] = [];
  let floor = 0;
  let arrivalCol = START_COL;
  for (let s = 0; s < GATES_PER_TOWER; s++) {
    const planks = placePlanks(s, counts[s], arrivalCol, rand)
      .map((p, k) => ({ ...p, row: rowAt(floor + RISE * (k + 1)) }));
    for (const p of planks) fill(p.row, p.col, p.width, T_PLANK);

    const letterFloor = floor + RISE * (counts[s] + 1);
    const letterFloorRow = rowAt(letterFloor);
    fill(letterFloorRow, 0, INSIDE, T_PLANK);

    const ceilingRows: [number, number] = [
      rowAt(letterFloor + LETTER_ROOM + CEILING),
      rowAt(letterFloor + LETTER_ROOM + 1),
    ];
    const options = pickOptions(targets[s], mode, rand);
    const blocks = blockCols.map((col, i) => ({
      col, width: blockWidth, letter: options[i], correct: options[i] === targets[s],
    }));
    for (const row of ceilingRows) {
      fill(row, 0, INSIDE, T_BRICK);
      for (const b of blocks) fill(row, b.col, b.width, T_LETTER);
    }

    storeys.push({ floorRow: rowAt(floor), planks, letterFloorRow, ceilingRows, blocks, target: targets[s], arrivalCol });
    const answer = blocks.find((b) => b.correct) ?? blocks[0];
    arrivalCol = answer.col + Math.floor(answer.width / 2);
    floor += storeyHeight(counts[s]);
  }

  // Walls, from the base to BATTLEMENTS above the roof. The top row keeps only the inner
  // stones, which notches the wall tops.
  const wallTop = rowAt(floor + BATTLEMENTS);
  for (let r = wallTop; r < rows; r++) {
    map[r][1] = T_STONE;
    map[r][MAP_COLS - 2] = T_STONE;
    if (r > wallTop) {
      map[r][0] = T_STONE;
      map[r][MAP_COLS - 1] = T_STONE;
    }
  }

  const roofRow = rowAt(floor);
  return {
    mode, word, map, rows, storeys, roofRow,
    start: { col: START_COL, row: rows - BASE_ROWS },
    // After the loop, arrivalCol is where the last spring comes up onto the roof.
    star: { col: starCol(arrivalCol), row: roofRow },
  };
}

/** A rectangle in world px. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The camera bounds for storey `s`, or for the roof when `s` is past the last storey: from
 * the ceiling top (plus the room the HUD covers) down to one row below the floor. Always
 * the view's width, centred on the tower, so the camera never scrolls sideways.
 */
export function storeyView(layout: TowerLayout, s: number): ViewRect {
  const x = (MAP_COLS * TILE - LEARN_VIEW_W) / 2;
  if (s >= layout.storeys.length) {
    return { x, y: -HUD_ROOM, width: LEARN_VIEW_W, height: (layout.roofRow + 1) * TILE + HUD_ROOM };
  }
  const st = layout.storeys[s];
  const top = st.ceilingRows[0] * TILE - HUD_ROOM;
  const bottom = (st.floorRow + 1) * TILE;
  return { x, y: top, width: LEARN_VIEW_W, height: bottom - top };
}

/**
 * Where the camera's centre settles in a view, with the hero on its floor: a view that fits
 * is shown from its top (Phaser's clamp pins the top of short bounds); a taller one shows
 * its bottom, where the hero lands.
 */
export function settleCenter(view: ViewRect): { x: number; y: number } {
  return {
    x: view.x + view.width / 2,
    y: view.height <= LEARN_VIEW_H ? view.y + LEARN_VIEW_H / 2 : view.y + view.height - LEARN_VIEW_H / 2,
  };
}

/** The star's box in world px: two tiles square, standing on the roof. */
export function starBox(layout: TowerLayout): { x: number; y: number; w: number; h: number } {
  return {
    x: (layout.star.col + WALL) * TILE,
    y: (layout.star.row - 2) * TILE,
    w: 2 * TILE,
    h: 2 * TILE,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/learnTower.test.ts`
Expected: PASS. A failure message names the mode, seed, storey and plank; rebuild that tower
in a scratch test from its seed to see why.

- [ ] **Step 6: Run everything, type-check, commit**

Run: `npm test && npm run build`

```bash
git add src/game/learn/tower.ts src/game/tiles.ts src/physics/tiles.ts tests/learnTower.test.ts tests/helpers/seeded.ts tests/learnContent.test.ts
git commit -m "feat: a learn tower, built to the spacing rules" -m "buildTower lays out four storeys bottom-up: planks 3 tiles apart with gaps of 2, 3, 4, 4 and three lengths per storey set by the gap, a full-width letter floor, and a two-tile brick ceiling with the letters five tiles above it. The first storey is short, every tower has a long climb, and a one- or two-plank storey fits on screen at the tower's 1.25 zoom. Every one of those is a test over 300 seeded towers. learnContent.test.ts moves onto the same seeded source."
```

---

### Task 6: The climb — gate rules and one fixed step

**Files:**
- Modify: `next/src/game/player.ts`
- Create: `next/src/game/learn/types.ts`
- Create: `next/src/game/learn/gate.ts`
- Create: `next/src/game/learn/climb.ts`
- Create: `next/tests/helpers/towerMove.ts`
- Test: `next/tests/learnGate.test.ts`

Review ran these tests, and Task 7's, on real Arcade: same verdicts. It added tests for the
trapdoor's side columns and the climb onto the roof, gave `towerMove` the scene's world edges
and Arcade's strict landing test, and tidied `gate.ts`. The code below is the result.

- [ ] **Step 1: Share the head's probe columns**

A head bumps a block the way the adventure's `?` blocks always have: at two columns probed
3px in from each side of the player, so a head a little way under either edge of a block
bumps it. Arcade's tile callback cannot give this (see *What was checked in Phaser's source before writing this*), so the rule moves
out of `bumpBlocksAbove` into a function the climb shares.

In `next/src/game/player.ts`, insert directly above the doc comment of `bumpBlocksAbove`
(the comment that begins `Port of index.html:1418-1420`):

```ts
/**
 * The two columns a head-first hit probes, 3px in from each side of the player
 * (index.html:1417-1418): a head must be a little way under a block to bump it, the same
 * from either side. The adventure's `?` and rainbow blocks (bumpBlocksAbove, below) and
 * learn mode's letters (game/learn/climb.ts) are bumped by this one rule. The two are the
 * same column when the player is inside one.
 */
export function headColumns(p: PlayerState): [number, number] {
  return [Math.floor((p.x + 3) / TILE), Math.floor((p.x + p.w - 3) / TILE)];
}
```

In `bumpBlocksAbove`, replace:

```ts
  const p = world.player;
  const h1 = Math.floor((p.x + 3) / TILE);
  const h2 = Math.floor((p.x + p.w - 3) / TILE);
  const hy = headTileY;
```

with:

```ts
  const [h1, h2] = headColumns(world.player);
  const hy = headTileY;
```

In the same function's doc comment, replace:

```
 * The two probe columns are read off `p.x` here rather than passed in. The live source
 * computes them once for the whole Y sweep and reuses them (`pL2`, `pR2`), but they are
 * a function of `p.x` alone and the snap only ever touches `y`, so deriving them is the
 * same two numbers — and it keeps the 3px inset, which is part of the bump RULE, in the
 * same place as the rest of the rule.
```

with:

```
 * The two probe columns come from `p.x` (headColumns, above) rather than being passed in.
 * The live source computes them once for the whole Y sweep and reuses them (`pL2`,
 * `pR2`), but they are a function of `p.x` alone and the snap only ever touches `y`, so
 * deriving them is the same two numbers — and it keeps the 3px inset, which is part of
 * the bump RULE, with the rules rather than with the collision.
```

And in `stepPlayer`'s note on what went away, replace:

```
  //     The 3px pair survives in bumpBlocksAbove, where it decides which COLUMNS a head
  //     hit can pop, which is a rule about blocks rather than about collision.
```

with:

```
  //     The 3px pair survives in headColumns, where it decides which COLUMNS a head hit
  //     can pop, which is a rule about blocks rather than about collision.
```

Run: `npm test`
Expected: all pass, the same count as before. The adventure's bump tests (physics, gamepad
and sounds) drive `bumpBlocksAbove` and see the same two columns.

- [ ] **Step 2: Add the test mover**

Create `next/tests/helpers/towerMove.ts`:

```ts
import { TILE } from '../../src/config/constants';
import { towerTileFaces } from '../../src/game/learn/tower';
import type { ClimbMove } from '../../src/game/learn/types';

/** Arcade's TILE_BIAS: how deep a falling body may sink into a tile top and be put back on it. */
const TILE_BIAS = 16;

/**
 * A stand-in for the tower scene's Arcade body, for tests: plain integration, then separation
 * against the tower's map with the same per-side rule the scene gives Arcade — solid tiles
 * stop you from every side, planks only from above, and a falling body up to TILE_BIAS deep
 * in a tile top is put back on it, as Arcade's TileCheckY does — inside the same left and
 * right world edges. Reports the row a rising head was stopped under, as the scene's mover
 * does (physics/player.ts's MoveReport).
 *
 * Phaser's package entry cannot load under Vitest, which is why this exists. Arcade's own
 * World and Body can, deep-imported from phaser/src, and run that way the gate tests and the
 * jump checks give the same verdicts. One structural difference remains: this separates X,
 * against the rows the body was in before this step's vertical move, then Y, where Arcade
 * moves both and resolves each tile along its smaller overlap. At a solid corner (an open
 * trapdoor's edge, a battlement) that can shift a sideways move by a frame.
 *
 * It reads `map` live, so trapdoors the gate rules open and shut are seen at once.
 */
export function towerMove(map: number[][]): ClimbMove {
  const faces = (col: number, row: number) => towerTileFaces(map[row]?.[col] ?? 0);
  const span = (from: number, size: number): [number, number] =>
    [Math.floor(from / TILE), Math.ceil((from + size) / TILE) - 1];

  return (p) => {
    let headHitRow: number | null = null;

    p.x += p.vx;
    // Arcade clamps to the world edges the scene sets (left and right) before any tile.
    const width = (map[0]?.length ?? 0) * TILE;
    if (p.x < 0) { p.x = 0; p.vx = 0; } else if (p.x + p.w > width) { p.x = width - p.w; p.vx = 0; }
    const [r0, r1] = span(p.y, p.h);
    const [x0, x1] = span(p.x, p.w);
    let wall: number | null = null;
    for (let r = r0; r <= r1 && wall === null; r++) {
      for (let c = x0; c <= x1; c++) {
        if (faces(c, r) === 'all') { wall = c; break; }
      }
    }
    if (wall !== null) {
      p.x = p.vx > 0 ? wall * TILE - p.w : (wall + 1) * TILE;
      p.vx = 0;
    }

    const prevBottom = p.y + p.h;
    p.y += p.vy;
    p.onGround = false;
    const [c0, c1] = span(p.x, p.w);
    if (p.vy < 0) {
      const row = Math.floor(p.y / TILE);
      for (let c = c0; c <= c1; c++) {
        if (faces(c, row) === 'all') headHitRow = row;
      }
      if (headHitRow !== null) {
        p.y = (row + 1) * TILE;
        p.vy = 0;
      }
    } else if (p.vy > 0) {
      const bottom = p.y + p.h;
      // Strictly below: Arcade's overlap test is strict, so feet exactly on a tile top land
      // there on the next step, not this one.
      for (let row = Math.floor(prevBottom / TILE); row * TILE < bottom; row++) {
        const top = row * TILE;
        if (bottom - top > TILE_BIAS) continue;
        let floor = false;
        for (let c = c0; c <= c1; c++) {
          if (faces(c, row) !== 'none') floor = true;
        }
        if (floor) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      }
    }
    return { headHitRow };
  };
}
```

- [ ] **Step 3: Write the failing tests**

Create `next/tests/learnGate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { createClimb, LEARN_MOTION, stepClimb } from '../src/game/learn/climb';
import { blockCells, headBump, trapdoorCells } from '../src/game/learn/gate';
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

describe('a letter gate', () => {
  it('opens the trapdoor, springs you and scores for the right letter', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    expect(run(c, 40, held, () => c.gates[0].solved)).toBe(true);
    expect(c.score).toBe(50);
    expect(c.gates[0].trapdoorOpen).toBe(true);
    expect(c.sprung).toBe(true);
    expect(c.player.vy).toBe(LEARN_MOTION.jumpForce);
    expect(codes(c, trapdoorCells(c.layout, 0)).every((code) => code === T_EMPTY)).toBe(true);
    expect(c.sounds).toContain('coin');
    expect(c.events).toContainEqual({ type: 'bump-right', storey: 0, block: answerOf(c, 0) });
  });

  it('carries you through with jump let go at once, and shuts behind you', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    expect(run(c, 150, idle, () => c.storey === 1 && c.player.onGround)).toBe(true);
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(codes(c, trapdoorCells(c.layout, 0)).every((code) => code === T_BRICK)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[1].floorRow * TILE);
    expect(c.events).toContainEqual({ type: 'storey', storey: 1 });
    expect(c.events).toContainEqual({ type: 'gate-closed', storey: 0 });
  });

  it('carries you through from a bump at either edge of the letter, not only its middle', () => {
    for (const edge of ['left', 'right'] as const) {
      const c = climb();
      const block = answerOf(c, 0);
      standUnder(c, 0, block);
      const b = c.layout.storeys[0].blocks[block];
      const left = (b.col + WALL) * TILE;
      c.player.x = edge === 'left' ? left - c.player.w + 4 : left + b.width * TILE - 4;
      expect(run(c, 40, held, () => c.gates[0].solved)).toBe(true);
      expect(run(c, 150, idle, () => c.storey === 1 && c.player.onGround)).toBe(true);
      expect(c.events.some((e) => e.type === 'rearm')).toBe(false);
    }
  });

  it('turns the whole letter ceiling to brick when it shuts', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    c.layout.storeys[0].blocks.forEach((_, i) => {
      expect(codes(c, blockCells(c.layout, 0, i)).every((code) => code === T_BRICK)).toBe(true);
    });
  });

  it('wobbles for a wrong letter and costs nothing', () => {
    const c = climb();
    standUnder(c, 0, wrongOf(c, 0));
    expect(run(c, 40, held, () => c.gates[0].mistakes === 1)).toBe(true);
    expect(c.gates[0].solved).toBe(false);
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(c.score).toBe(0);
    expect(codes(c, blockCells(c.layout, 0, answerOf(c, 0))).every((code) => code === T_LETTER)).toBe(true);
    expect(c.events).toContainEqual({ type: 'bump-wrong', storey: 0, block: wrongOf(c, 0) });
    expect(run(c, 120, idle, () => c.player.onGround)).toBe(true);
    expect(c.player.y + c.player.h).toBe(c.layout.storeys[0].letterFloorRow * TILE);
  });

  it('makes the right block glow after two misses', () => {
    const c = climb();
    for (let miss = 1; miss <= 2; miss++) {
      standUnder(c, 0, wrongOf(c, 0));
      run(c, 40, held, () => c.gates[0].mistakes === miss);
    }
    expect(c.events).toContainEqual({ type: 'hint', storey: 0, block: answerOf(c, 0) });
  });

  it('glows once, however many more misses follow', () => {
    const c = climb();
    for (let miss = 1; miss <= 3; miss++) {
      standUnder(c, 0, wrongOf(c, 0));
      run(c, 40, held, () => c.gates[0].mistakes === miss);
    }
    expect(c.gates[0].mistakes).toBe(3);
    expect(c.events.filter((e) => e.type === 'hint')).toHaveLength(1);
  });

  it('counts a head a little way under either edge of a letter, and not one just outside', () => {
    // The adventure's two probes, 3px in from each side (game/player.ts's headColumns), so
    // the reach is the same from the left as from the right.
    const missesJumpingFrom = (x: (left: number, right: number, w: number) => number): number => {
      const c = climb();
      const block = wrongOf(c, 0);
      standUnder(c, 0, block);
      const b = c.layout.storeys[0].blocks[block];
      const left = (b.col + WALL) * TILE;
      c.player.x = x(left, left + b.width * TILE, c.player.w);
      run(c, 40, held, () => false);
      return c.gates[0].mistakes;
    };
    expect(missesJumpingFrom((left, _right, w) => left - w + 4)).toBe(1); // 4px under the left edge
    expect(missesJumpingFrom((_left, right) => right - 4)).toBe(1); // 4px under the right edge
    expect(missesJumpingFrom((left, _right, w) => left - w + 2)).toBe(0); // 2px: both probes on brick
    expect(missesJumpingFrom((_left, right) => right - 2)).toBe(0);
  });

  it('counts a bump only from its own letter floor', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    c.lastGround = -1;
    expect(headBump(c, blockCells(c.layout, 0, answerOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].solved).toBe(false);
  });

  it('cannot be answered again once solved', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    run(c, 150, idle, () => c.storey === 1 && c.player.onGround);
    c.lastGround = 0;
    expect(headBump(c, blockCells(c.layout, 0, wrongOf(c, 0))[0])).toBeNull();
    expect(c.gates[0].mistakes).toBe(0);
  });

  it('brings the block back to spring you again if you end up under the open trapdoor', () => {
    const c = climb();
    standUnder(c, 0, answerOf(c, 0));
    run(c, 40, held, () => c.gates[0].solved);
    standUnder(c, 0, answerOf(c, 0)); // as if the spring had clipped the trapdoor's edge
    c.sprung = false;
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(c.gates[0].trapdoorOpen).toBe(false);
    expect(c.gates[0].armed).toBe(true);
    expect(codes(c, blockCells(c.layout, 0, answerOf(c, 0))).every((code) => code === T_LETTER)).toBe(true);
    expect(run(c, 40, held, () => c.gates[0].trapdoorOpen)).toBe(true);
    expect(c.score).toBe(50);
  });
});

describe('the roof', () => {
  it('is reached through the last gate', () => {
    const c = climb();
    const last = c.layout.storeys.length - 1;
    c.gates.slice(0, last).forEach((g) => { g.solved = true; g.armed = false; });
    standUnder(c, last, answerOf(c, last));
    run(c, 40, held, () => c.gates[last].solved);
    expect(run(c, 150, idle, () => c.player.onGround)).toBe(true);
    expect(c.storey).toBe(c.layout.storeys.length);
    expect(c.events).toContainEqual({ type: 'storey', storey: c.layout.storeys.length });
    expect(c.player.y + c.player.h).toBe(c.layout.roofRow * TILE);
  });

  it('ends the tower when the hero touches the star', () => {
    const c = climb();
    c.gates.forEach((g) => { g.solved = true; g.armed = false; });
    c.storey = c.layout.storeys.length;
    const star = starBox(c.layout);
    c.player.x = star.x;
    c.player.y = star.y + star.h - c.player.h;
    c.player.onGround = true;
    stepClimb(c, idle(), towerMove(c.layout.map));
    expect(c.finished).toBe(true);
    expect(c.score).toBe(100);
    expect(c.sounds).toContain('win');
    expect(c.events).toContainEqual({ type: 'finished' });
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run tests/learnGate.test.ts`
Expected: FAIL — cannot resolve `../src/game/learn/climb` (or `types`).

- [ ] **Step 5: Implement the types**

Create `next/src/game/learn/types.ts`:

```ts
import type { PlayerState, SoundCue } from '../types';
import type { TowerLayout } from './tower';

/** A map cell: column and row of the tower's map. */
export interface Cell {
  col: number;
  row: number;
}

export interface TileEdit extends Cell {
  code: number;
}

export interface GateState {
  /** Answered right at least once. Scores once. */
  solved: boolean;
  /** Bumps at this gate count. False from a right answer until re-armed. */
  armed: boolean;
  mistakes: number;
  trapdoorOpen: boolean;
}

/**
 * What the scene has to show for a step, in the order it happened. Sounds ride
 * `Climb.sounds`, exactly as the adventure's ride `World.sounds`.
 */
export type ClimbEvent =
  /** Map cells changed; mirror them on the Phaser layer. */
  | { type: 'tiles'; cells: TileEdit[] }
  | { type: 'bump-right'; storey: number; block: number }
  | { type: 'bump-wrong'; storey: number; block: number }
  /** Two misses at a gate: the right block should glow until found. */
  | { type: 'hint'; storey: number; block: number }
  /** The right block is back, after the hero ended up under its open trapdoor. */
  | { type: 'rearm'; storey: number; block: number }
  /** The hero is through; the storey's letter ceiling is plain floor from now on. */
  | { type: 'gate-closed'; storey: number }
  /** The hero has risen into storey `storey`; past the last storey is the roof. */
  | { type: 'storey'; storey: number }
  | { type: 'finished' };

export interface Climb {
  layout: TowerLayout;
  player: PlayerState;
  gates: GateState[];
  /** Where the hero is: a storey index, or `layout.storeys.length` on the roof. */
  storey: number;
  /**
   * The storey whose letter floor the hero stood on when last on the ground; -1 if that
   * ground was anything else. A bump counts only from there.
   */
  lastGround: number;
  /** A spring is carrying the hero: no jump cut until the apex. */
  sprung: boolean;
  finished: boolean;
  score: number;
  sounds: SoundCue[];
  events: ClimbEvent[];
}

/**
 * Moves the hero one step and reports the tile row a rising head was stopped under, or
 * null. The scene's is its Arcade body (physics/player.ts's createBodyMover); the tests'
 * is tests/helpers/towerMove.ts. Which cells of that row the head hit is the climb's own
 * rule (climb.ts).
 */
export type ClimbMove = (p: PlayerState) => { headHitRow: number | null };
```

- [ ] **Step 6: Implement the gate rules**

Create `next/src/game/learn/gate.ts`:

```ts
import { TILE } from '../../config/constants';
import { INSIDE, T_BRICK, T_EMPTY, T_LETTER, type TowerLayout, WALL } from './tower';
import type { Cell, Climb } from './types';

/** Which gate and block a map cell belongs to, or null. */
export function blockAt(layout: TowerLayout, col: number, row: number): { storey: number; block: number } | null {
  const inside = col - WALL;
  for (let s = 0; s < layout.storeys.length; s++) {
    const st = layout.storeys[s];
    if (row !== st.ceilingRows[0] && row !== st.ceilingRows[1]) continue;
    const block = st.blocks.findIndex((b) => inside >= b.col && inside < b.col + b.width);
    return block >= 0 ? { storey: s, block } : null;
  }
  return null;
}

/** Storey `s`'s right block. buildTower gives every storey exactly one (tests/learnTower.test.ts). */
function answerIndex(layout: TowerLayout, storey: number): number {
  const i = layout.storeys[storey].blocks.findIndex((b) => b.correct);
  if (i < 0) throw new Error(`storey ${storey} has no right block`);
  return i;
}

/** A block's map cells: its columns through both ceiling rows. */
export function blockCells(layout: TowerLayout, storey: number, block: number): Cell[] {
  const st = layout.storeys[storey];
  const b = st.blocks[block];
  return st.ceilingRows.flatMap((row) =>
    Array.from({ length: b.width }, (_, i) => ({ col: b.col + i + WALL, row })));
}

/** The trapdoor: the right block's columns plus one on each side, through both ceiling rows. */
export function trapdoorCells(layout: TowerLayout, storey: number): Cell[] {
  const st = layout.storeys[storey];
  const b = st.blocks[answerIndex(layout, storey)];
  const from = Math.max(0, b.col - 1);
  const to = Math.min(INSIDE - 1, b.col + b.width);
  return st.ceilingRows.flatMap((row) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ col: from + i + WALL, row })));
}

export type BumpOutcome = 'right' | 'wrong' | null;

/**
 * A rising head hit cell `hit`. Counts only for an armed gate, and only if the jump began on
 * that gate's own letter floor. Right: the gate is solved (scoring once) and its trapdoor
 * opens; the caller springs the hero (climb.ts). Wrong: a miss, and after two the right
 * block glows. Returns what happened, or null for a bump that does not count.
 */
export function headBump(c: Climb, hit: Cell): BumpOutcome {
  const found = blockAt(c.layout, hit.col, hit.row);
  if (!found) return null;
  const { storey, block } = found;
  const gate = c.gates[storey];
  if (!gate.armed || c.lastGround !== storey) return null;
  const blocks = c.layout.storeys[storey].blocks;
  if (blocks[block].correct) {
    if (!gate.solved) {
      gate.solved = true;
      c.score += 50;
    }
    gate.armed = false;
    gate.trapdoorOpen = true;
    setCells(c, trapdoorCells(c.layout, storey), T_EMPTY);
    c.sounds.push('coin');
    c.events.push({ type: 'bump-right', storey, block });
    return 'right';
  }
  gate.mistakes++;
  c.sounds.push('block');
  c.events.push({ type: 'bump-wrong', storey, block });
  if (gate.mistakes === 2) {
    c.events.push({ type: 'hint', storey, block: answerIndex(c.layout, storey) });
  }
  return 'wrong';
}

/**
 * Shuts every open trapdoor the hero's feet have risen above. The whole letter ceiling then
 * becomes plain brick: it is the next storey's floor now, and the gate is done.
 */
export function closeTrapdoors(c: Climb): void {
  const feet = c.player.y + c.player.h;
  c.gates.forEach((gate, s) => {
    if (!gate.trapdoorOpen) return;
    const st = c.layout.storeys[s];
    if (feet >= st.ceilingRows[0] * TILE) return;
    gate.trapdoorOpen = false;
    // The right block's cells are the trapdoor's already.
    const letters = st.blocks.flatMap((b, i) => (b.correct ? [] : blockCells(c.layout, s, i)));
    setCells(c, [...trapdoorCells(c.layout, s), ...letters], T_BRICK);
    c.events.push({ type: 'gate-closed', storey: s });
  });
}

/**
 * A safety net: if the hero is ever standing on a letter floor whose trapdoor is still open,
 * the right block comes back, armed, so bumping it springs them again. Play does not produce
 * this today (a counted bump leaves the head well inside the opening), but nobody may get
 * stuck below a solved gate.
 */
export function rearmIfStranded(c: Climb): void {
  const s = c.lastGround;
  if (!c.player.onGround || s < 0) return;
  const gate = c.gates[s];
  if (!gate.trapdoorOpen) return;
  gate.trapdoorOpen = false;
  gate.armed = true;
  const answer = answerIndex(c.layout, s);
  setCells(c, trapdoorCells(c.layout, s), T_BRICK);
  setCells(c, blockCells(c.layout, s, answer), T_LETTER);
  c.events.push({ type: 'rearm', storey: s, block: answer });
}

function setCells(c: Climb, cells: Cell[], code: number): void {
  for (const { col, row } of cells) c.layout.map[row][col] = code;
  c.events.push({ type: 'tiles', cells: cells.map((cell) => ({ ...cell, code })) });
}
```

- [ ] **Step 7: Implement the climb**

Create `next/src/game/learn/climb.ts`:

```ts
import { TILE } from '../../config/constants';
import { DIFFICULTY_CONFIG } from '../../config/difficulty';
import type { InputState } from '../../input/actions';
import {
  type Character, headColumns, type MotionRecord, playerSize, stepMotion, stepWalkCycle,
} from '../player';
import { random } from '../random';
import type { PlayerState } from '../types';
import { type LearnMode, pickTargets, type Rand } from './content';
import { closeTrapdoors, headBump, rearmIfStranded } from './gate';
import { buildTower, starBox, WALL } from './tower';
import type { Climb, ClimbMove } from './types';

/** The gentlest adventure feel, super_easy's speed and jump: the one the tower is built around. */
export const LEARN_MOTION: MotionRecord = {
  playerSpeed: DIFFICULTY_CONFIG.super_easy.playerSpeed,
  jumpForce: DIFFICULTY_CONFIG.super_easy.jumpForce,
};

/** A fresh tower for `mode`, adding what it asks to `used`, with the hero at the door. */
export function createClimb(mode: LearnMode, used: string[], character: Character, rand: Rand = random): Climb {
  const { targets, word } = pickTargets(mode, used, rand);
  const layout = buildTower(mode, targets, word, rand);
  const { w, h } = playerSize(character);
  const player: PlayerState = {
    x: (layout.start.col + WALL) * TILE,
    y: layout.start.row * TILE - h,
    vx: 0,
    vy: 0,
    w,
    h,
    onGround: false,
    facing: 1,
    coyoteTime: 0,
    jumpBuffer: 0,
    frame: 0,
    frameTimer: 0,
    // The adventure's fields, unused on the tower: no enemies, no bow, no power-ups.
    invincible: 0,
    hasBow: false,
    bowCharges: 0,
    arrowCooldown: 0,
    hasCape: false,
    fartTimer: 0,
    bigHeadTimer: 0,
    chickenRayCharges: 0,
  };
  return {
    layout,
    player,
    gates: layout.storeys.map(() => ({ solved: false, armed: true, mistakes: 0, trapdoorOpen: false })),
    storey: 0,
    lastGround: -1,
    sprung: false,
    finished: false,
    score: 0,
    sounds: [],
    events: [],
  };
}

/**
 * One fixed step of the climb: the adventure's movement, the mover, then the gate rules on
 * what the head hit, the trapdoors, where the hero now stands, the walk cycle and the star.
 */
export function stepClimb(c: Climb, input: InputState, move?: ClimbMove): void {
  if (c.finished) return;
  const p = c.player;

  stepMotion(p, input, LEARN_MOTION, c.sounds, { noJumpCut: c.sprung });
  if (c.sprung && p.vy >= 0) c.sprung = false;

  const { headHitRow } = move ? move(p) : { headHitRow: null };
  if (headHitRow !== null) {
    // Which cells of that row the head hit: the adventure's two probes, 3px in from each
    // side (game/player.ts's headColumns), so a head a little way under either edge of a
    // letter bumps it. A probe on plain brick is not a bump; only a counted one ends this.
    for (const col of headColumns(p)) {
      const outcome = headBump(c, { col, row: headHitRow });
      if (outcome === 'right') {
        // The spring: a jump's worth of speed from where the head met the block, exempt
        // from the jump cut until the apex. It clears the ceiling top by 42px even if the
        // child lets go of jump at once (tests/learnJumps.test.ts).
        p.vy = LEARN_MOTION.jumpForce;
        c.sprung = true;
        c.sounds.push('boing');
      }
      if (outcome) break;
    }
  }

  closeTrapdoors(c);
  trackGround(c);
  rearmIfStranded(c);
  trackStorey(c);
  stepWalkCycle(p);
  checkStar(c);
}

/** Remembers whether the hero is standing on a letter floor, and whose. */
function trackGround(c: Climb): void {
  const p = c.player;
  if (!p.onGround) return;
  const feet = p.y + p.h;
  c.lastGround = c.layout.storeys.findIndex((st) => Math.abs(st.letterFloorRow * TILE - feet) < 0.5);
}

/** Moves `storey` up once the hero's feet rise above the next floor (the roof, after the last). */
function trackStorey(c: Climb): void {
  const { storeys, roofRow } = c.layout;
  if (c.storey >= storeys.length) return;
  const next = c.storey + 1;
  const nextFloorRow = next < storeys.length ? storeys[next].floorRow : roofRow;
  if (c.player.y + c.player.h > nextFloorRow * TILE) return;
  c.storey = next;
  c.events.push({ type: 'storey', storey: next });
}

/** On the roof, touching the star ends the tower. */
function checkStar(c: Climb): void {
  if (c.storey < c.layout.storeys.length) return;
  const star = starBox(c.layout);
  const p = c.player;
  const touching = p.x < star.x + star.w && p.x + p.w > star.x && p.y < star.y + star.h && p.y + p.h > star.y;
  if (!touching) return;
  c.finished = true;
  c.score += 100;
  c.sounds.push('win');
  c.events.push({ type: 'finished' });
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/learnGate.test.ts`
Expected: PASS.

If "carries you through" fails with the hero back on the letter floor, the spring or the
trapdoor is wrong: check that `headBump` empties the trapdoor cells before the next step,
and that `stepClimb` passes `noJumpCut: c.sprung`.

If the edge test finds no miss at 4px, `stepClimb` stopped at the first probe: a probe on
plain brick returns null, and only a counted bump may end the loop.

- [ ] **Step 9: Run everything, type-check, commit**

Run: `npm test && npm run build`

```bash
git add src/game/player.ts src/game/learn/types.ts src/game/learn/gate.ts src/game/learn/climb.ts tests/helpers/towerMove.ts tests/learnGate.test.ts
git commit -m "feat: the letter gate, and one step of the climb" -m "A head bumps a letter by the adventure's own rule, two probes 3px in from each side (now shared as headColumns), so a head a little way under either edge counts; and a bump counts only from the gate's own letter floor. The right letter scores once, opens a trapdoor the width of the block and one tile either side, and springs the hero with a jump's worth of speed exempt from the jump cut; the trapdoor shuts as brick once the hero's feet are above it, and the rest of the letters go with it. A wrong letter is a miss and nothing else, and two make the right one glow. If the hero ever lands back under an open trapdoor, the block comes back to spring them again. stepClimb runs the adventure's movement, a mover, and these rules, one fixed step at a time."
```

---

### Task 7: The spec's jump checks

These are the guarantees behind "not too close, not too far", checked through the real
movement function against real generated towers.

**Files:**
- Test: `next/tests/learnJumps.test.ts`

- [ ] **Step 1: Write the tests**

Create `next/tests/learnJumps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { LEARN_MOTION } from '../src/game/learn/climb';
import { pickTargets, type LearnMode } from '../src/game/learn/content';
import { trapdoorCells } from '../src/game/learn/gate';
import { buildTower, GAPS, type Storey, T_EMPTY, type TowerLayout, WALL } from '../src/game/learn/tower';
import { type Character, playerSize, stepMotion } from '../src/game/player';
import type { PlayerState } from '../src/game/types';
import { emptyInput, type InputState } from '../src/input/actions';
import { seeded } from './helpers/seeded';
import { towerMove } from './helpers/towerMove';

const MODES: LearnMode[] = ['letters', 'syllables', 'words'];
const TOWERS: TowerLayout[] = MODES.flatMap((mode) => Array.from({ length: 40 }, (_, i) => {
  const rand = seeded(1000 + i);
  const { targets, word } = pickTargets(mode, [], rand);
  return buildTower(mode, targets, word, rand);
}));
const CHARACTERS: Character[] = ['gigi', 'dodo'];

function standing(character: Character, x: number, feetY: number): PlayerState {
  const { w, h } = playerSize(character);
  return {
    x, y: feetY - h, vx: 0, vy: 0, w, h, onGround: true, facing: 1,
    coyoteTime: 0, jumpBuffer: 0, frame: 0, frameTimer: 0, invincible: 0,
    hasBow: false, bowCharges: 0, arrowCooldown: 0, hasCape: false,
    fartTimer: 0, bigHeadTimer: 0, chickenRayCharges: 0,
  };
}

interface Outcome {
  /** The row whose top the hero landed on, or null. */
  landedRow: number | null;
  x: number;
  minHead: number;
  minFeet: number;
  /** Steps on which the hero's rising head was stopped by a tile. */
  headStops: number;
}

/** Runs the real movement against the tower until the hero lands (or 4 seconds pass). */
function jump(map: number[][], p: PlayerState, input: (f: number) => InputState, spring = false): Outcome {
  const move = towerMove(map);
  let exempt = spring;
  let minHead = p.y;
  let minFeet = p.y + p.h;
  let headStops = 0;
  for (let f = 0; f < 240; f++) {
    stepMotion(p, input(f), LEARN_MOTION, [], { noJumpCut: exempt });
    if (exempt && p.vy >= 0) exempt = false;
    if (move(p).headHitRow !== null) headStops++;
    minHead = Math.min(minHead, p.y);
    minFeet = Math.min(minFeet, p.y + p.h);
    if (f > 2 && p.onGround) return { landedRow: (p.y + p.h) / TILE, x: p.x, minHead, minFeet, headStops };
  }
  return { landedRow: null, x: p.x, minHead, minFeet, headStops };
}

const held = (dir: number) => (f: number): InputState =>
  ({ ...emptyInput(), jump: true, jumpPressed: f === 0, left: dir < 0, right: dir > 0 });
const tap = (f: number): InputState => ({ ...emptyInput(), jump: f === 0, jumpPressed: f === 0 });

function overlaps(x: number, w: number, plank: { col: number; width: number }): boolean {
  const left = (plank.col + WALL) * TILE;
  return x + w > left && x < left + plank.width * TILE;
}

/**
 * Landed on plank `k` of the storey — or, when that plank is the storey's last, on the letter
 * floor above it. A full held jump rises 98.4px, just over two hops (96px), so from the plank
 * below the last one it can carry the hero straight onto the full-width letter floor. That is
 * progress, not a miss.
 */
function landedWell(st: Storey, k: number, out: Outcome, w: number): boolean {
  if (out.landedRow === st.planks[k].row && overlaps(out.x, w, st.planks[k])) return true;
  return k === st.planks.length - 1 && out.landedRow === st.letterFloorRow;
}

function centredUnder(character: Character, span: { col: number; width: number }): number {
  return (span.col + WALL) * TILE + (span.width * TILE - playerSize(character).w) / 2;
}

describe('every hop between planks', () => {
  it('lands a standing jump from the edge that holds the direction', () => {
    const misses: string[] = [];
    TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => st.planks.slice(1).forEach((b, k) => {
      const a = st.planks[k];
      const dir = b.col > a.col ? 1 : -1;
      const { w } = playerSize('gigi');
      const x = dir > 0 ? (a.col + a.width + WALL) * TILE - w : (a.col + WALL) * TILE;
      const out = jump(t.map, standing('gigi', x, a.row * TILE), held(dir));
      if (!landedWell(st, k + 1, out, w)) misses.push(`tower ${ti} storey ${s} hop ${k + 1}`);
    })));
    expect(misses).toEqual([]);
  });

  it('lands even a running jump from the very lip onto a long plank', () => {
    const misses: string[] = [];
    TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => st.planks.slice(1).forEach((b, k) => {
      if (b.width !== 8 - GAPS[s]) return;
      const a = st.planks[k];
      const dir = b.col > a.col ? 1 : -1;
      const { w } = playerSize('gigi');
      const x = dir > 0 ? (a.col + a.width + WALL) * TILE - 1 : (a.col + WALL) * TILE - w + 1;
      const p = standing('gigi', x, a.row * TILE);
      p.vx = dir * LEARN_MOTION.playerSpeed;
      const out = jump(t.map, p, held(dir));
      if (!landedWell(st, k + 1, out, w)) misses.push(`tower ${ti} storey ${s} hop ${k + 1}`);
    })));
    expect(misses).toEqual([]);
  });

  it('lands a jump from the last plank on the letter floor', () => {
    TOWERS.forEach((t) => t.storeys.forEach((st) => {
      const last = st.planks[st.planks.length - 1];
      expect(jump(t.map, standing('gigi', centredUnder('gigi', last), last.row * TILE), held(0)).landedRow)
        .toBe(st.letterFloorRow);
    }));
  });
});

describe('the letter ceiling', () => {
  for (const character of CHARACTERS) {
    it(`is out of reach from every plank, for ${character}`, () => {
      const reached: string[] = [];
      TOWERS.forEach((t, ti) => t.storeys.forEach((st, s) => {
        const underside = (st.ceilingRows[1] + 1) * TILE;
        st.planks.forEach((pl, k) => {
          const out = jump(t.map, standing(character, centredUnder(character, pl), pl.row * TILE), held(0));
          if (out.headStops > 0 || out.minHead <= underside) reached.push(`tower ${ti} storey ${s} plank ${k}`);
        });
      }));
      expect(reached).toEqual([]);
    });

    it(`is reached from the letter floor by a held jump but not a tap, for ${character}`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st) => st.blocks.forEach((b) => {
        const x = centredUnder(character, b);
        const feet = st.letterFloorRow * TILE;
        expect(jump(t.map, standing(character, x, feet), held(0)).headStops).toBeGreaterThan(0);
        expect(jump(t.map, standing(character, x, feet), tap).headStops).toBe(0);
      })));
    });
  }
});

describe('the spring', () => {
  function springFrom(t: TowerLayout, s: number, character: Character, exempt: boolean): Outcome {
    const st = t.storeys[s];
    const map = t.map.map((row) => [...row]);
    for (const { col, row } of trapdoorCells(t, s)) map[row][col] = T_EMPTY;
    const b = st.blocks.find((x) => x.correct) ?? st.blocks[0];
    const { h } = playerSize(character);
    const p = standing(character, centredUnder(character, b), (st.ceilingRows[1] + 1) * TILE + h);
    p.onGround = false;
    p.vy = LEARN_MOTION.jumpForce;
    return jump(map, p, () => emptyInput(), exempt);
  }

  for (const character of CHARACTERS) {
    it(`carries ${character} above the ceiling with jump let go`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st, s) => {
        expect(springFrom(t, s, character, true).minFeet).toBeLessThan(st.ceilingRows[0] * TILE);
      }));
    });

    it(`would leave ${character} under the trapdoor without the jump-cut exemption`, () => {
      TOWERS.forEach((t) => t.storeys.forEach((st, s) => {
        expect(springFrom(t, s, character, false).minFeet).toBeGreaterThan(st.ceilingRows[0] * TILE);
      }));
    });
  }
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/learnJumps.test.ts`
Expected: PASS. These pass against Tasks 1, 5 and 6 as written: the tower was designed to
these numbers (spec: 98.4px held jump, 5.6px head clearance for Gigi, 42.4px spring margin,
and the plank-length table). One thing they allow on purpose: from the plank below a
storey's last, a full held jump rises just over two hops (98.4px against 96px) and can land
straight on the full-width letter floor. That is progress, not a miss (`landedWell`). If a
check fails, do not loosen it. The failure names a tower and hop; rebuild that tower from
its seed (`seeded(1000 + index)` in its mode) and fix the generator or the rule it breaks.

- [ ] **Step 3: Run everything, type-check, commit**

Run: `npm test && npm run build`

```bash
git add tests/learnJumps.test.ts
git commit -m "test: every hop lands, no plank reaches the letters, the spring always clears" -m "The spec's jump checks, through the real movement function against 120 generated towers: a standing jump from the edge that holds the direction lands on the next plank, and a running one from the lip lands on every long plank — or, from the plank below a storey's last, carries on to the letter floor, since a full jump rises just over two hops; from no plank does a held jump reach the letter ceiling, for Gigi or Dodo, while from the letter floor a held jump does and a tap does not; and the spring clears the ceiling with jump let go at once — which it would not without the jump-cut exemption, the test that says why the switch exists."
```

---

### Task 8: The tower's tiles and letter blocks

**Files:**
- Create: `next/src/gfx/learnTiles.ts`
- Modify: `next/src/gfx/tiles.ts` (three exports)

Review found the first version's brick was a lookalike of the adventure's. The tiles are now
drawn with Phaser Graphics and baked with `generateTexture`, calling the adventure's own
`drawBrick`. The code below is the result.

- [ ] **Step 1: Implement**

In `next/src/gfx/tiles.ts`, export `QUESTION_FILL`, `QUESTION_STROKE` and `drawBrick`
(add `export` in front of each; nothing else changes), so the tower draws the adventure's own
brick and `?` gold.

Create `next/src/gfx/learnTiles.ts`:

```ts
import type Phaser from 'phaser';
import { TILE } from '../config/constants';
import { T_BRICK, T_EMPTY, T_LETTER, T_PLANK, T_STONE } from '../game/learn/tower';
import { drawBrick, QUESTION_FILL, QUESTION_STROKE } from './tiles';

/** The tower's tileset: one 16px frame per tile code, frame 0 unused (Phaser's empty is -1). */
export const LEARN_TILES_KEY = 'learn-tiles';
/** A frame per tile code, T_EMPTY's included, so a code is its own frame number. */
const FRAMES = T_LETTER + 1;

/** The first world's brick (data/levels.ts, Doll Garden): the tower is built of the adventure's own. */
const BRICK = 0xcc8844;
const STONE = 0xa3a3ba;
const WOOD = 0xb5773a;
const WOOD_LIGHT = 0xd99a58;
const WOOD_DARK = 0x7a4a20;

/**
 * Bakes the tileset and the letter-block pictures into textures, once. Idempotent: a restarted
 * tower reuses them.
 */
export function registerLearnTiles(scene: Phaser.Scene): void {
  bake(scene, LEARN_TILES_KEY, TILE * FRAMES, TILE, (g) => {
    drawBrick(g, T_BRICK * TILE, 0, BRICK);
    drawStone(g, T_STONE * TILE);
    drawPlank(g, T_PLANK * TILE);
    // Under the block pictures (see drawBlock); shows only if a picture is hidden.
    g.fillStyle(QUESTION_FILL).fillRect(T_LETTER * TILE, 0, TILE, TILE);
  });
  for (const width of [2, 3]) {
    bake(scene, blockTextureKey(width), width * TILE, 2 * TILE, (g) => drawBlock(g, width));
  }
}

/** A letter block's picture, `width` tiles wide and the ceiling's two tiles tall. */
export function blockTextureKey(width: number): string {
  return `learn-block-${width}`;
}

/** The tower's map in Phaser's terms: empty is -1 there, because 0 is a real tile index. */
export function toPhaserData(map: readonly number[][]): number[][] {
  return map.map((row) => row.map((code) => (code === T_EMPTY ? -1 : code)));
}

/**
 * Draws into a throwaway Graphics and bakes it into a texture. The guard is not only for the
 * console: generateTexture draws OVER a texture that already has the key, without clearing
 * it, so a second bake would darken every translucent edge.
 */
function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** Wall stone: two courses, offset joints, a lit top edge. */
function drawStone(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(STONE).fillRect(x, 0, TILE, TILE);
  g.fillStyle(0x000000, 0.2)
    .fillRect(x, 7, TILE, 1)
    .fillRect(x, 15, TILE, 1)
    .fillRect(x + 7, 0, 1, 7)
    .fillRect(x + 2, 8, 1, 7)
    .fillRect(x + 12, 8, 1, 7);
  g.fillStyle(0xffffff, 0.14).fillRect(x, 0, TILE, 1);
}

/**
 * A plank: a 7px board at the top of the tile and nothing below it, so it reads as thin —
 * something you can jump up through — next to the solid brick.
 */
function drawPlank(g: Phaser.GameObjects.Graphics, x: number): void {
  g.fillStyle(WOOD).fillRect(x, 0, TILE, 7);
  g.fillStyle(WOOD_LIGHT).fillRect(x, 0, TILE, 2);
  g.fillStyle(WOOD_DARK).fillRect(x, 6, TILE, 1);
  g.fillStyle(0x000000, 0.25).fillRect(x + 11, 2, 1, 4);
}

/** One letter block in the `?` block's own gold and edge, drawn whole so it reads as one block, not four. */
function drawBlock(g: Phaser.GameObjects.Graphics, width: number): void {
  const w = width * TILE;
  const h = 2 * TILE;
  g.fillStyle(QUESTION_FILL).fillRect(0, 0, w, h);
  g.fillStyle(0xffffff, 0.35).fillRect(2, 2, w - 4, 2).fillRect(2, 2, 2, h - 4);
  g.fillStyle(0x000000, 0.15).fillRect(2, h - 4, w - 4, 2).fillRect(w - 4, 2, 2, h - 4);
  g.lineStyle(2, QUESTION_STROKE).strokeRect(1, 1, w - 2, h - 2);
}
```

- [ ] **Step 2: Type-check and commit**

Run: `npm test && npm run build`
Expected: all pass, build clean. (Nothing imports this file yet; Task 10 does.)

```bash
git add src/gfx/learnTiles.ts src/gfx/tiles.ts
git commit -m "feat: the tower's tiles, drawn once at boot" -m "A five-frame tileset in the tower's tile codes — brick, stone, and a thin plank that reads as something to jump through — and a whole letter block picture per width, so a 2x2 block looks like one block rather than four tiles. toPhaserData turns the tower's empty 0 into Phaser's -1, because 0 is a real tile index to Phaser."
```

---

### Task 9: Learn strings and scene keys

Everything the menu and HUD will name, added before the scenes that use it, without removing
the placeholder yet (Task 11 does).

**Files:**
- Modify: `next/src/config/i18n.ts`
- Modify: `next/src/scenes/keys.ts`
- Test: `next/tests/i18n.test.ts`

- [ ] **Step 1: Update the i18n parity test first**

In `next/tests/i18n.test.ts`, replace:

```ts
/**
 * The strings this port has and the live game does not, named here so that the parity check
 * below stays a parity check. Every one of them exists because the port is missing something
 * the original has, and each should leave with whichever plan supplies it: these three say
 * that learn mode is not built yet.
 *
 * An unlisted extra key fails the same assertion a missing live key does, which is the point
 * — the list is a short, deliberate exception, not a hole.
 */
const PORT_ONLY_KEYS = ['learn_soon', 'learn_soon_d', 'back_hint'];
```

with:

```ts
/**
 * The strings this port has and the live game does not, named here so that the parity check
 * below stays a parity check.
 *
 * The `learn_*` keys are learn mode's own words. The live game hardcodes them in Estonian
 * inside drawLearn and drawLearnMenu rather than keeping them in TRANSLATIONS, so the port's
 * versions are new keys with both languages. The first three say that learn mode is not built
 * yet, and leave with the placeholder screen.
 *
 * An unlisted extra key fails the same assertion a missing live key does, which is the point
 * — the list is a short, deliberate exception, not a hole.
 */
const PORT_ONLY_KEYS = [
  'learn_soon', 'learn_soon_d', 'back_hint',
  'learn_title', 'learn_choose',
  'learn_letters', 'learn_letters_d',
  'learn_syllables', 'learn_syllables_d',
  'learn_words', 'learn_words_d',
  'learn_menu_hint',
  'learn_find_letter', 'learn_find_syll', 'learn_find_letters',
];
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — "has every port-only key it claims to have" lists the twelve `learn_*`
keys as missing.

- [ ] **Step 3: Add the strings**

In `next/src/config/i18n.ts`, insert immediately ABOVE the comment line
`  // Not in the live game. Learn mode is a whole second game — letters, syllables, a climb —`:

```ts
  // Learn mode's own words. The live game hardcodes these in Estonian inside drawLearn and
  // drawLearnMenu (index.html:2887, :2945-2958); here they have both languages.
  learn_title:        {et:'ÕPIME!',                   en:'LET\'S LEARN!'},
  learn_choose:       {et:'Vali harjutus:',           en:'Choose an exercise:'},
  learn_letters:      {et:'TÄHED',                    en:'LETTERS'},
  learn_letters_d:    {et:'Leia õige täht',           en:'Find the right letter'},
  learn_syllables:    {et:'SILBID',                   en:'SYLLABLES'},
  learn_syllables_d:  {et:'Leia õige silp',           en:'Find the right syllable'},
  learn_words:        {et:'SÕNAD',                    en:'WORDS'},
  learn_words_d:      {et:'Ehita sõna',               en:'Build the word'},
  learn_menu_hint:    {et:'◀ ▶ vali  •  Space / {A} alusta  •  ESC / {B} tagasi',
                       en:'◀ ▶ choose  •  Space / {A} start  •  ESC / {B} back'},
  learn_find_letter:  {et:'LEIA TÄHT:',               en:'FIND THE LETTER:'},
  learn_find_syll:    {et:'LEIA SILP:',               en:'FIND THE SYLLABLE:'},
  learn_find_letters: {et:'LEIA TÄHED:',              en:'FIND THE LETTERS:'},
```

- [ ] **Step 4: Add the scene keys**

In `next/src/scenes/keys.ts`, replace:

```ts
/** Learn mode, which is not ported: a screen that says so (stands in for `learnmenu`). */
export const LEARN_SCENE_KEY = 'Learn';
```

with:

```ts
/** Learn mode, which is not ported: a screen that says so (stands in for `learnmenu`). */
export const LEARN_SCENE_KEY = 'Learn';
/** The learn menu: letters, syllables or words (`learnmenu`). */
export const LEARN_MENU_SCENE_KEY = 'LearnMenu';
/** One learn tower, climbed gate by gate (`learnletters`). */
export const LEARN_TOWER_SCENE_KEY = 'LearnTower';
/** What to find and how many gates are done. Runs alongside the tower. */
export const LEARN_HUD_SCENE_KEY = 'LearnHud';
```

In the same file's top comment, replace `Keeping the thirteen of them here` with
`Keeping all of them here`.

- [ ] **Step 5: Run the tests, type-check, commit**

Run: `npm test && npm run build`
Expected: all pass.

```bash
git add src/config/i18n.ts src/scenes/keys.ts tests/i18n.test.ts
git commit -m "feat: learn mode's words, in both languages" -m "The menu's title, its three exercises and their descriptions, the hint, and the three prompts the tower asks with. The live game hardcodes all of them in Estonian; here they are translation keys, listed in the parity test as the port's own. Scene keys for the learn menu, tower and HUD land ahead of the scenes."
```

---

### Task 10: The tower on Phaser, with its HUD

**Files:**
- Create: `next/src/scenes/LearnHudScene.ts`
- Create: `next/src/scenes/LearnTowerScene.ts`
- Modify: `next/src/scenes/keys.ts`
- Modify: `next/src/main.ts`
- Test: `next/tests/navigation.test.ts`

- [ ] **Step 1: Update the navigation test first**

In `next/tests/navigation.test.ts`, find the test `names exactly what is left to port` and
change its expectation from:

```ts
    expect(missing).toEqual(['intro', 'debug', 'learnletters', 'learnresult']);
```

to:

```ts
    expect(missing).toEqual(['intro', 'debug', 'learnresult']);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/navigation.test.ts`
Expected: FAIL — `learnletters` is still missing.

- [ ] **Step 3: Map `learnletters` to the tower**

In `next/src/scenes/keys.ts`, in `SCENE_FOR_STATE`, add after the `learnmenu` line:

```ts
  learnletters: LEARN_TOWER_SCENE_KEY,
```

and in the doc comment above `SCENE_FOR_STATE`, replace:

```
 * Three states map to SliceScene, because in the live game they are one screen with the
 * simulation stopped: `dead` and `levelcomplete` are the frozen world with a label over it,
 * and the label is a scene of its own already (LevelOverlayScene). Four states map to
 * nothing at all — `intro` and `debug` are not ported, and `learnletters`/`learnresult` sit
 * behind the one placeholder that stands in for the whole of learn mode.
```

with:

```
 * Three states map to SliceScene, because in the live game they are one screen with the
 * simulation stopped: `dead` and `levelcomplete` are the frozen world with a label over it,
 * and the label is a scene of its own already (LevelOverlayScene). Three states map to
 * nothing at all — `intro` and `debug` are not ported, and `learnresult` arrives with the
 * learn tower's second plan.
```

- [ ] **Step 4: Create the HUD**

Create `next/src/scenes/LearnHudScene.ts`:

```ts
import Phaser from 'phaser';
import { BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import type { LearnMode } from '../game/learn/content';
import type { Climb } from '../game/learn/types';
import { registerTextures, STAR_TEXTURE } from '../gfx/textures';
import { LEARN_HUD_SCENE_KEY } from './keys';

export interface LearnHudData {
  /** A live reference; the HUD only reads it. */
  climb: Climb;
}

/** The band across the top. The tower keeps storeys out from under it (tower.ts's HUD_ROOM). */
const HUD_H = 48;
const PROMPT: Record<LearnMode, string> = {
  letters: 'learn_find_letter',
  syllables: 'learn_find_syll',
  words: 'learn_find_letters',
};
const PROMPT_FONT = { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffdd00' };
const TARGET_FONT = { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' };
const STAR_X = 12;
const STAR_Y = 12;
const STAR_STEP = 26;
const STAR_SCALE = 2;
const UNSOLVED_ALPHA = 0.28;
/** Shown instead of a target once the hero is on the roof. */
const ROOF_MARK = '★';

/**
 * What to find, and one star per gate, filling in as gates are solved. A parallel scene
 * over the tower, like the adventure's HudScene; no score during the climb, because a
 * number means nothing to a pre-reader.
 *
 * Part 2 of the learn tower adds the word display for words mode and the speaker.
 */
export class LearnHudScene extends Phaser.Scene {
  private climb!: Climb;
  private target!: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(LEARN_HUD_SCENE_KEY);
  }

  init(data: LearnHudData): void {
    this.climb = data.climb;
  }

  create(): void {
    registerTextures(this);
    this.add.graphics().fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, HUD_H);
    this.add.text(BASE_W / 2, 16, TStr(PROMPT[this.climb.layout.mode]), PROMPT_FONT).setOrigin(0.5, 1);
    this.target = this.add.text(BASE_W / 2, 44, '', TARGET_FONT).setOrigin(0.5, 1);
    this.stars = this.climb.gates.map((_, i) => this.add
      .image(STAR_X + i * STAR_STEP, STAR_Y, STAR_TEXTURE)
      .setOrigin(0, 0)
      .setScale(STAR_SCALE));
  }

  update(): void {
    const { layout, storey, gates } = this.climb;
    this.target.setText(storey < layout.storeys.length ? layout.storeys[storey].target : ROOF_MARK);
    const solved = gates.filter((g) => g.solved).length;
    this.stars.forEach((star, i) => star.setAlpha(i < solved ? 1 : UNSOLVED_ALPHA));
  }
}
```

- [ ] **Step 5: Create the tower scene**

Create `next/src/scenes/LearnTowerScene.ts`:

```ts
import Phaser from 'phaser';
import { playCue } from '../audio/cues';
import { STEP_MS, TILE } from '../config/constants';
import { createClimb, stepClimb } from '../game/learn/climb';
import type { LearnMode } from '../game/learn/content';
import {
  LEARN_ZOOM, MAP_COLS, settleCenter, starBox, storeyView, T_EMPTY, towerTileFaces, WALL,
} from '../game/learn/tower';
import type { Climb, ClimbEvent, ClimbMove } from '../game/learn/types';
import type { Character } from '../game/player';
import { getSelectedChar, getSkinIndex } from '../game/run';
import { blockTextureKey, LEARN_TILES_KEY, registerLearnTiles, toPhaserData } from '../gfx/learnTiles';
import { playerTextureKey, registerTextures, STAR_TEXTURE } from '../gfx/textures';
import { createControls, type Controls } from '../input/controls';
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

/** A plain sky until Part 2's castle backdrop. */
const SKY = '#7ec0ee';
/** The sprite draws 2px larger than the hitbox on every side, as in SliceScene. */
const PLAYER_DRAW_INSET = 2;
const POSES = ['stand', 'run', 'jump'] as const;
const FOLLOW_LERP = 0.15;
/** The camera centres this far above the hero: more of the climb above than below. */
const FOLLOW_ABOVE = 48;
const PAN_MS = 600;
/** After the star, a new tower in the same mode. Part 2 puts the result screen here. */
const NEXT_TOWER_MS = 2000;
const DEPTH_BLOCK = 5;
const DEPTH_STAR = 6;
const DEPTH_PLAYER = 10;
const LETTER_FONT = {
  fontFamily: '"Trebuchet MS", system-ui, sans-serif',
  fontSize: '20px',
  fontStyle: 'bold',
  color: '#8a4b00',
};
const LETTER_RESOLUTION = 3;
/** How white the right block's hint glow gets at its brightest. */
const GLOW_ALPHA = 0.55;

/**
 * One learn tower. The rules are game/learn/ (tested there); this scene is the engine side:
 * a real tilemap drawn from the tower's own tileset, which Arcade also collides against,
 * with planks colliding only from above; the adventure's Arcade mover, which reports the row
 * a head hit for the climb to pick the letter; the same fixed 60Hz step as SliceScene; and a
 * camera that follows the hero inside the current storey's bounds and pans to the next.
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
  /** One container per block (picture + letter), per storey. */
  private blocks: Phaser.GameObjects.Container[][] = [];
  private playerImage!: Phaser.GameObjects.Image;
  /** The point the camera follows: the hero's centre. */
  private readonly follow = { x: 0, y: 0 };
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
    this.buildStar();
    this.playerImage = this.add.image(0, 0, this.poseKey()).setOrigin(0, 0).setDepth(DEPTH_PLAYER);
    this.syncPlayer();

    const cam = this.cameras.main;
    cam.setZoom(LEARN_ZOOM);
    this.boundToStorey(0);
    const start = settleCenter(storeyView(this.climb.layout, 0));
    cam.centerOn(start.x, start.y);
    // lerpX 0: the camera never moves sideways; the bounds are exactly the view's width.
    cam.startFollow(this.follow, true, 0, FOLLOW_LERP, 0, FOLLOW_ABOVE);

    // Made here, not earlier: the pad half seeds itself from what is held right now, so the
    // button that chose the exercise does not also jump.
    this.controls = createControls(this);
    this.backKey = bindBackKey(this, padContextFor('learnletters'));

    this.scene.launch(LEARN_HUD_SCENE_KEY, { climb: this.climb } satisfies LearnHudData);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop(LEARN_HUD_SCENE_KEY));
  }

  update(_time: number, delta: number): void {
    if (this.leaving) return;
    if (justDown(this.backKey)) {
      this.leaving = true;
      takeBack(this, 'learnletters');
      return;
    }
    // The same fixed step as SliceScene: never more than five steps' worth of time banked.
    this.accumulator = Math.min(this.accumulator + delta, STEP_MS * 5);
    while (this.accumulator >= STEP_MS) {
      stepClimb(this.climb, this.controls.read(), this.move);
      for (const event of this.climb.events.splice(0)) this.apply(event);
      for (const cue of this.climb.sounds.splice(0)) playCue(cue, 0);
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
    const tileset = tilemap.addTilesetImage(LEARN_TILES_KEY, LEARN_TILES_KEY, TILE, TILE, 0, 0);
    if (!tileset) throw new Error('the tower tileset is not a texture');
    // `false`: the CPU layer, the only kind Arcade collides against (as physics/tiles.ts).
    const layer = tilemap.createLayer(0, tileset, 0, 0, false);
    if (!layer || !('culledTiles' in layer)) throw new Error('the tower tilemap has no layer 0');
    applyTileFaces(layer, towerTileFaces);
    return layer;
  }

  private buildBlocks(): void {
    this.blocks = this.climb.layout.storeys.map((st) => st.blocks.map((b) => {
      const x = (b.col + WALL) * TILE;
      const y = st.ceilingRows[0] * TILE;
      const picture = this.add.image(0, 0, blockTextureKey(b.width)).setOrigin(0, 0);
      // The hint: white over the gold, faded in and out once the right block should glow.
      // Fading the block itself would show the gold letter tile underneath, gold on gold.
      const glow = this.add.rectangle(0, 0, b.width * TILE, 2 * TILE, 0xffffff).setOrigin(0, 0).setAlpha(0);
      const letter = this.add
        .text((b.width * TILE) / 2, TILE + 1, b.letter, LETTER_FONT)
        .setOrigin(0.5, 0.5)
        .setResolution(LETTER_RESOLUTION);
      return this.add.container(x, y, [picture, glow, letter])
        .setDepth(DEPTH_BLOCK)
        .setData('x', x)
        .setData('glow', glow);
    }));
  }

  private buildStar(): void {
    const box = starBox(this.climb.layout);
    const star = this.add
      .image(box.x + box.w / 2, box.y + box.h / 2, STAR_TEXTURE)
      .setScale(3)
      .setDepth(DEPTH_STAR);
    this.tweens.add({ targets: star, y: star.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private apply(event: ClimbEvent): void {
    switch (event.type) {
      case 'tiles':
        for (const cell of event.cells) this.setTile(cell.col, cell.row, cell.code);
        return;
      case 'bump-right':
        this.blocks[event.storey][event.block].setVisible(false);
        return;
      case 'bump-wrong':
        this.shake(this.blocks[event.storey][event.block]);
        return;
      case 'hint':
        this.tweens.add({
          targets: this.blocks[event.storey][event.block].getData('glow'),
          alpha: GLOW_ALPHA, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        return;
      case 'rearm':
        this.blocks[event.storey][event.block].setVisible(true);
        return;
      case 'gate-closed':
        for (const box of this.blocks[event.storey]) {
          this.tweens.killTweensOf([box, box.getData('glow')]);
          box.setVisible(false);
        }
        return;
      case 'storey':
        this.panToStorey(event.storey);
        return;
      case 'finished':
        this.time.delayedCall(NEXT_TOWER_MS, () => {
          this.scene.restart({ mode: this.mode, used: this.used } satisfies LearnTowerData);
        });
        return;
    }
  }

  /** Mirrors a map edit on the Phaser layer, collision included. */
  private setTile(col: number, row: number, code: number): void {
    if (code === T_EMPTY) {
      this.layer.removeTileAt(col, row, true, true);
      return;
    }
    this.layer.putTileAt(code, col, row, true);
    applyTileFacesAt(this.layer, col, row, towerTileFaces);
  }

  private shake(box: Phaser.GameObjects.Container): void {
    const x = box.getData('x') as number;
    this.tweens.killTweensOf(box);
    box.setX(x);
    this.tweens.add({ targets: box, x: x + 3, duration: 40, yoyo: true, repeat: 3, onComplete: () => box.setX(x) });
  }

  /**
   * Into storey `s`: bounds off (they would clamp the pan, and follow waits while a pan
   * runs), pan to where the camera will settle, and bound it to the new storey when the pan
   * ends. Follow picks up from there.
   */
  private panToStorey(s: number): void {
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
    return playerTextureKey(this.character, this.skin, POSES[this.climb.player.frame]);
  }
}
```

- [ ] **Step 6: Register the scenes**

In `next/src/main.ts`, add after `import { LearnScene } from './scenes/LearnScene';`:

```ts
import { LearnHudScene } from './scenes/LearnHudScene';
import { LearnTowerScene } from './scenes/LearnTowerScene';
```

and in the `scene` list, after `LearnScene,` add:

```ts
    LearnTowerScene,
    LearnHudScene,
```

(The HUD after the tower, so Phaser draws it on top.)

- [ ] **Step 7: Run the tests and type-check**

Run: `npm test && npm run build`
Expected: all pass, build clean.

- [ ] **Step 8: Check the tower in a browser**

Run `npm run dev` and open the URL. The mode select's learn card still leads to the
placeholder until Task 11, so start the tower from the browser console:

```js
for (const s of game.scene.getScenes(true)) s.scene.stop();
game.scene.start('LearnTower', { mode: 'letters', used: [] });
```

Click the canvas so it has focus, then check, in this order:
1. The tower draws: brick base and ceilings, grey stone walls, thin wooden planks, gold
   letter blocks with letters, the HUD band with a prompt, a letter and four dim stars.
2. Walk and jump up the first storey. You pass UP through planks and land ON them.
3. On the letter floor, walk under a WRONG letter and jump: it shakes, you bonk and fall back.
4. Do it once more: the right block starts to glow, a white pulse over its gold.
5. Stand under a WRONG letter with the hero only a little way under the block's LEFT edge,
   most of the body under the brick beside it, and jump: it still shakes. The same at its
   right edge. A head fully under the brick beside a letter just bonks.
6. Walk under the RIGHT letter, jump into it, and **let go of jump the moment your head
   hits it**. The block vanishes and the spring carries you up through the gap anyway, onto
   the floor above; the camera pans up and the first star in the HUD turns gold. (A tap on
   its own cannot reach the letters: they hang 5 tiles up so that only a real jump answers.)
7. Climb a storey with 3 or more planks: the camera follows. A storey with 1 or 2 planks
   sits whole on screen.
8. Solve all four gates. The last spring lands you on the roof, not in the star. Run at each
   wall and jump: you stop at the tower's edge. Then walk to the star: after two seconds a
   new tower starts.
9. Press Escape: the learn menu's placeholder screen appears (its key is still `Learn`).

Expected: all nine. If 2 fails (you bonk on planks), the per-side collision is not applied;
if 5 or 6 fails, check that the mover's `headHitRow` is the ceiling's lower row when a head
stops under it (physics/player.ts), and that `stepClimb` tries both probe columns.

If you drive the browser by automation and the page reports `document.hidden === true`, the
game is frozen, not broken: a hidden tab gets no `requestAnimationFrame`. Step it by hand from
the console, dispatching keys on `window` between steps:

```js
let now = performance.now();
const tick = (n) => { for (let i = 0; i < n; i++) game.step(now += 1000 / 60, 1000 / 60); };
const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'Space', key: ' ', keyCode: 32 }));
key('keydown'); tick(10); key('keyup'); tick(90);
```

- [ ] **Step 9: Commit**

```bash
git add src/scenes/LearnHudScene.ts src/scenes/LearnTowerScene.ts src/scenes/keys.ts src/main.ts tests/navigation.test.ts
git commit -m "feat: the learn tower, playable" -m "A real Phaser tilemap from the tower's own tileset, which Arcade collides against too, planks from above only. The adventure's mover, reporting the row a head hit so the climb can pick the letter, the same fixed step as the level, and a camera that follows inside the current storey — holding still when the storey fits — and pans to the next. Wrong letters shake and the right one glows after two; the star starts a new tower. The HUD asks what to find and fills a star per gate. Checked in the browser, including a spring with jump let go the instant the head hits the letter."
```

---

### Task 11: The learn menu replaces the placeholder

**Files:**
- Create: `next/src/scenes/LearnMenuScene.ts`
- Delete: `next/src/scenes/LearnScene.ts`
- Modify: `next/src/scenes/keys.ts`, `next/src/scenes/ModeSelectScene.ts`, `next/src/main.ts`,
  `next/src/config/i18n.ts`, `next/tests/i18n.test.ts`

- [ ] **Step 1: Update the i18n parity test first**

In `next/tests/i18n.test.ts`, delete the line `  'learn_soon', 'learn_soon_d', 'back_hint',`
from `PORT_ONLY_KEYS`, and delete the sentence `The first three say that learn mode is not
built yet, and leave with the placeholder screen.` from its comment.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL — "has the same keys, bar the port-only ones" shows `back_hint`, `learn_soon`
and `learn_soon_d` as extra.

- [ ] **Step 3: Remove the placeholder strings**

In `next/src/config/i18n.ts`, delete these lines:

```ts
  // Not in the live game. Learn mode is a whole second game — letters, syllables, a climb —
  // and this port does not have it yet, so the mode select's second card leads to a screen
  // that says so. The alternative was a card that does nothing when pressed, which reads as
  // a broken game rather than an absent one. They go when learn mode lands.
  learn_soon:         {et:'ÕPPIMINE TULEB VARSTI!',   en:'LEARNING IS COMING SOON!'},
  learn_soon_d:       {et:'Tähed ja silbid on veel tegemisel.',
                       en:'Letters and syllables are still being made.'},
  back_hint:          {et:'Vajuta ESC või {B} tagasi', en:'Press ESC or {B} to go back'},
```

- [ ] **Step 4: Create the menu**

Create `next/src/scenes/LearnMenuScene.ts`:

```ts
import Phaser from 'phaser';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { TStr } from '../config/i18n';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import type { LearnMode } from '../game/learn/content';
import { getSkinIndex } from '../game/run';
import { createStarField, type StarField, type StarFieldSpec } from '../gfx/starfield';
import { playerTextureKey, registerTextures } from '../gfx/textures';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEARN_MENU_SCENE_KEY, LEARN_TOWER_SCENE_KEY } from './keys';
import type { LearnTowerData } from './LearnTowerScene';
import { takeBack } from './navigate';

/** index.html:2941-2943: the learn menu's night blue and its twinkling stars. */
const BACKGROUND = '#2a3a5a';
const STARS: StarFieldSpec = {
  count: 40,
  strideX: 73, offsetX: 20,
  strideY: 47, offsetY: 10,
  speed: 0.02, base: 0.3, swing: 0.2,
};

interface Card {
  mode: LearnMode;
  label: string;
  desc: string;
  sample: string;
  color: number;
  css: string;
}

// index.html:2955-2973's layout: three 160px cards, 20px apart, 120px down.
const CARD_W = 160;
const CARD_H = 160;
const CARD_GAP = 20;
const CARD_Y = 120;
const HERO_Y = BASE_H - 100;
const HERO_SCALE = 1.5;

const TITLE_FONT = { fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#88ff88' };
const SUBTITLE_FONT = { fontFamily: 'monospace', fontSize: '14px', color: '#aaddcc' };
const LABEL_FONT = { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold' };
const SAMPLE_FONT = { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' };
const DESC_FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa' };
const HINT_FONT = { fontFamily: 'monospace', fontSize: '12px', color: '#aaddcc' };

function cardX(i: number): number {
  const total = 3 * CARD_W + 2 * CARD_GAP;
  return (BASE_W - total) / 2 + i * (CARD_W + CARD_GAP);
}

/**
 * The learn menu: letters, syllables or words. A port of drawLearnMenu (index.html:2940),
 * translated. Confirm starts a tower in that mode with a fresh session; back goes to the
 * mode select with the cursor on the learn card (game/navigation.ts's modeCursorFor).
 */
export class LearnMenuScene extends Phaser.Scene {
  private index = 0;
  private cards: Card[] = [];
  private boxes!: Phaser.GameObjects.Graphics;
  private heroes: Phaser.GameObjects.Image[] = [];
  private stars!: StarField;
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private leaving = false;

  constructor() {
    super(LEARN_MENU_SCENE_KEY);
  }

  create(): void {
    this.leaving = false;
    registerTextures(this);
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.stars = createStarField(this, STARS);

    this.cards = [
      { mode: 'letters', label: TStr('learn_letters'), desc: TStr('learn_letters_d'), sample: 'A B C', color: 0x88ccff, css: '#88ccff' },
      { mode: 'syllables', label: TStr('learn_syllables'), desc: TStr('learn_syllables_d'), sample: 'MA KA', color: 0xffaa66, css: '#ffaa66' },
      { mode: 'words', label: TStr('learn_words'), desc: TStr('learn_words_d'), sample: 'KASS', color: 0xff88cc, css: '#ff88cc' },
    ];

    this.add.text(BASE_W / 2, 60, TStr('learn_title'), TITLE_FONT).setOrigin(0.5, 1);
    this.add.text(BASE_W / 2, 85, TStr('learn_choose'), SUBTITLE_FONT).setOrigin(0.5, 1);

    this.boxes = this.add.graphics();
    this.cards.forEach((card, i) => {
      const x = cardX(i) + CARD_W / 2;
      this.add.text(x, CARD_Y + 35, card.label, { ...LABEL_FONT, color: card.css }).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + 80, card.sample, SAMPLE_FONT).setOrigin(0.5, 1);
      this.add.text(x, CARD_Y + 115, card.desc, DESC_FONT).setOrigin(0.5, 1);
    });

    // Gigi on the left and Dodo on the right, bobbing (index.html:2976-2979).
    this.heroes = [
      this.add.image(60, HERO_Y, playerTextureKey('gigi', getSkinIndex('gigi'), 'stand'))
        .setOrigin(0, 0).setScale(HERO_SCALE),
      this.add.image(BASE_W - 90, HERO_Y, playerTextureKey('dodo', getSkinIndex('dodo'), 'stand'))
        .setOrigin(0, 0).setScale(HERO_SCALE).setFlipX(true),
    ];

    this.add.text(BASE_W / 2, 350, TStr('learn_menu_hint'), HINT_FONT).setOrigin(0.5, 1);

    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.stars.update();
    this.drawBoxes();
    const bob = Math.sin(t * 0.06) * 3;
    for (const hero of this.heroes) hero.setY(HERO_Y + bob);

    if (this.leaving) return;
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.index = Math.max(0, this.index - 1);
    if (pressedAny(this.keys.right, this.keys.altRight)) this.index = Math.min(this.cards.length - 1, this.index + 1);
    if (pressedAny(this.keys.confirm, this.keys.enter)) {
      this.leaving = true;
      sfxPickup();
      this.scene.start(LEARN_TOWER_SCENE_KEY, { mode: this.cards[this.index].mode, used: [] } satisfies LearnTowerData);
      return;
    }
    if (justDown(this.keys.back)) {
      this.leaving = true;
      takeBack(this, 'learnmenu');
    }
  }

  private drawBoxes(): void {
    this.boxes.clear();
    this.cards.forEach((card, i) => {
      const x = cardX(i);
      if (i === this.index) {
        this.boxes.fillStyle(card.color, 0x22 / 0xff).fillRect(x, CARD_Y, CARD_W, CARD_H);
        this.boxes.lineStyle(3, card.color).strokeRect(x - 2, CARD_Y - 2, CARD_W + 4, CARD_H + 4);
      } else {
        this.boxes.fillStyle(0xffffff, 0.05).fillRect(x, CARD_Y, CARD_W, CARD_H);
      }
    });
  }
}
```

- [ ] **Step 5: Point the keys, the mode select and main.ts at the menu**

In `next/src/scenes/keys.ts`, delete:

```ts
/** Learn mode, which is not ported: a screen that says so (stands in for `learnmenu`). */
export const LEARN_SCENE_KEY = 'Learn';
```

and in `SCENE_FOR_STATE` change `  learnmenu: LEARN_SCENE_KEY,` to
`  learnmenu: LEARN_MENU_SCENE_KEY,`.

In `next/src/scenes/ModeSelectScene.ts`:
- change the import `import { DIFFICULTY_SCENE_KEY, LEARN_SCENE_KEY, MODE_SELECT_SCENE_KEY } from './keys';`
  to `import { DIFFICULTY_SCENE_KEY, LEARN_MENU_SCENE_KEY, MODE_SELECT_SCENE_KEY } from './keys';`;
- in `confirm()`, change `LEARN_SCENE_KEY` to `LEARN_MENU_SCENE_KEY`;
- in the class comment, replace the paragraph from ` * ## Learn mode is not ported` down to
  ` * alternative to THAT was drawing one card, which would quietly remove half of what the live`
  ` * game offers from the screen whose whole job is to offer it.` with:

```
 * ## Learn mode
 *
 * The second card opens the learn menu (LearnMenuScene): letters, syllables or words, each
 * a tower to climb.
```

  Keep the paragraph after it (`Its route is fully wired regardless: ...`).

In `next/src/main.ts`, replace `import { LearnScene } from './scenes/LearnScene';` with
`import { LearnMenuScene } from './scenes/LearnMenuScene';`, and in the scene list replace
`    LearnScene,` with `    LearnMenuScene,`.

- [ ] **Step 6: Delete the placeholder**

```bash
git rm src/scenes/LearnScene.ts
```

- [ ] **Step 7: Run the tests and type-check**

Run: `npm test && npm run build`
Expected: all pass, build clean. `grep -rn "LEARN_SCENE_KEY\|LearnScene\b\|learn_soon\|back_hint" src tests`
prints nothing.

- [ ] **Step 8: Check the menu in a browser**

`npm run dev`, then from the title: Space → ◀ ▶ to LET'S LEARN / ÕPIME! → Space.
1. The learn menu draws: title, three cards with A B C / MA KA / KASS, Gigi and Dodo bobbing.
2. ◀ ▶ moves the highlight; Space on TÄHED starts a letters tower, SILBID a syllables tower
   (3-wide blocks with two letters), SÕNAD a words tower (the four targets spell a word).
3. Escape in a tower returns to this menu; Escape here returns to the mode select with the
   cursor on the learn card.
4. With a pad: Ⓐ/✕ confirms, Ⓑ/○ goes back, the d-pad moves.

- [ ] **Step 9: Commit**

```bash
git add -A src/scenes src/main.ts src/config/i18n.ts tests/i18n.test.ts
git commit -m "feat: the learn menu, and the placeholder retired" -m "Letters, syllables or words, as the live learn menu draws them — three cards on the night-blue starfield with Gigi and Dodo bobbing either side — translated, and each starting a tower. Back returns to the mode select on the learn card, as the navigation table says. The 'learning is coming soon' screen and its three strings are gone."
```

---

### Task 12: End-to-end check in a browser

No code. The spec's browser checks that Part 1 can answer; voice, the result screen and the
castle are Part 2's.

- [ ] **Step 1: Run the whole suite and the build once more**

Run: `npm test && npm run build`
Expected: all pass, build clean.

- [ ] **Step 2: Play it**

`npm run dev`. Title → ÕPIME! → each mode in turn. Check, and write down anything that
differs:
- **Jump into the right letter and let go the moment your head hits it: the spring still
  carries you through.** Repeat under the left and right blocks, not only the middle one.
- From the plank below a storey's last, a big jump can land straight on the letter floor,
  skipping the last plank. That is expected (a full jump rises just over two hops) and
  harmless.
- Walking between the three letters on the letter floor is easy; nothing to fall off.
- A wrong answer costs nothing; after two misses the right block glows.
- A head a little way under the left or right edge of a letter bumps it, from either side
  alike; a head fully under the brick beside it just bonks.
- Arriving on the letter floor from the plank below never bumps your head.
- Both characters: choose Dodo in the adventure's character screen first (the tower uses
  the last selected hero), then climb.
- A long storey scrolls as you climb, with more room above you than below; a short one sits
  whole and still.
- Near-miss landings onto a plank snap you on top (Arcade's tile bias) and do not look
  broken.
- On the roof, running at a wall and jumping stops you at the tower's edge, and the last
  spring lands you on the roof rather than in the star.
- Back works from the tower and from the menu.
- On a 120Hz screen, if one is available, the climb is not faster than on 60Hz.

- [ ] **Step 3: Record the outcome**

If everything holds, no commit is needed. If something is off, fix it in a new commit that
says what was wrong, and re-run Step 2. Anything that is a design question rather than a
bug (a hop that feels wrong, a letter hard to read at 1.25 zoom) goes to the owner, not
into code.

---

## Self-review against the spec

Spec coverage for Part 1 (steps 1-3 of the spec's build order):

| Spec requirement | Task |
|---|---|
| Movement shared with the adventure, jump-cut switch | 1 |
| Per-side collision, planks from above only | 2, 10 |
| Arcade mover reporting the row a head hit; adventure unchanged | 3 |
| Pools, targets without repeats, distractors | 4 |
| Storeys: 3-tile hops, gaps 2/3/4/4, three plank lengths, 1-5 planks, first short, one long | 5 |
| Letter floor full width; ceiling 2 thick, letters 5 above; blocks 2 or 3 wide | 5 |
| Short storeys fit at zoom 1.25; camera bounds per storey | 5, 10 |
| Bump counts only from its own letter floor; right/wrong; glow after two | 6 |
| Which block a head hit: the row from `blocked.up`, the adventure's 3px probes for the columns | 3, 6 |
| Trapdoor opens, spring exempt from the cut, shuts as brick behind | 6, 7 |
| Nobody stuck under an open trapdoor | 6 |
| Jump checks for Gigi and Dodo | 7 |
| Real tilemap with a generated tileset; tweens; camera follow/bounds/pan | 8, 10 |
| HUD: prompt, target, one star per gate | 10 |
| Learn menu; back navigation unchanged | 11 |
| Roof star ends the tower | 6, 10 |

Deferred to Part 2 by design: voice and X-replay, `sfxWrong` and buzzes, particles, the
block pop and trapdoor swing, the words-mode word display, the result screen, the castle
backdrop (back wall, windows, torches, banners, sky by height, battlements art, flag), and
`PLAYTEST.md`.
