# Home World, Step 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ÕHTU, the home world's last level and the run's end: a wet floor with shampoo bottles squirting soap, a bath of rubber ducks to hop across, then Härra Kaka's toilet.

**Architecture:** Ducks are riding platforms on the bubbles' code (`game/course.ts`): the landing and carrying part is pulled out to serve both, and a duck carries its rider sideways. Each duck drifts back and forth over its own stretch of the bath (the water run split evenly between the ducks on it, neighbours starting in opposite directions, so they meet at the border). The shampoo bottle is the cannon with a soap blob for a fireball. The poo arena becomes one exported section that both VANNITUBA (`?boss=poo`) and ÕHTU end with.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vitest 4. In `next/` of `.claude/worktrees/home-world`.

**Spec:** `docs/superpowers/specs/2026-11-24-home-world-design.md` (step 3). No commits unless asked.

---

### Task 1: Letters and data

- **Test** (`tests/course.test.ts`): `q` over a water run is a duck, its stretch the run split evenly; `m` is a shampoo bottle.

```ts
  it('reads ducks (q) on the bath, each with its own stretch of it, and a shampoo bottle (m)', () => {
    const water = `..BB${'_'.repeat(8)}BB..`;
    const parsed = parseCourse(joinSections([sectionOf(14, {
      19: '.....q...q....',
      20: '..P.........m.',
      21: water, 22: water, 23: water, 24: water,
    }).map((r, y) => (y === 22 ? r.slice(0, 13) + 'R' : r))]));
    expect(parsed.course.ducks).toEqual([
      { x: 5, y: 21, left: 4, right: 7 },
      { x: 9, y: 21, left: 8, right: 11 },
    ]);
    expect(parsed.enemyDefs.map((d) => d.type)).toEqual(['shampoo']);
  });
```

- **Code:** `levels.ts`: `CourseDef.ducks?: Array<{ x: number; y: number; left: number; right: number }>` ("rubber ducks (`q`) on a bath: `y` the water's top row, `left`..`right` the columns of its own stretch"); `FurnitureKind` gains `'nightWindow' | 'tubEnd'`. `course.ts`: `ENEMY_LETTERS.m = 'shampoo'`; `q` collected as `{ x, y }`, then for each, the water row is the first `TILE_WATER` below it, the run is the water around it on that row, and the ducks on one run share it out in order (`Math.floor` boundaries); the letter table gains `q` and `m`.

### Task 2: The shampoo bottle

- **Test** (`tests/home.test.ts`): on a floor with `m`, after its first interval a projectile of type `soap` flies flat toward the hero; `noStomp` is true; `squirt` is heard.
- **Code:** sprites `SHAMPOO_S/P` (a pink bottle, a blue pump, eyes, a white label) and `SOAP_S/P` (a pink and white blob); `enemy.ts`: `shampoo` wherever `cannon` is in `spawnEnemy`/`stepEnemy`/`isGroundPatrol` (`const SHOOTERS = new Set(['cannon', 'shampoo'])`), the shot `type: e.type === 'shampoo' ? 'soap' : 'fireball'`, the sound `e.type === 'shampoo' ? 'squirt' : 'cannon-fire'`; `SoundCue` `squirt`, `sfxSquirt` (`playTone(500, 0.09, 'triangle', 0.06, 150)`); textures as the plunger's; `SOAP_TEXTURE` drawn for `soap` shots in `SliceScene.syncEnemyProjectiles` (no trail).

### Task 3: Ducks to ride

- **Test** (`tests/home.test.ts`), on a little bath level (rims, 16 tiles of water, two ducks):
  - drift within their stretch and turn at its ends; slower on Super Easy (`duckSpeed`);
  - carry a hero standing on one along with it;
  - a hero over the water with no duck under them falls in (`world.dead`).
- **Code** (`game/course.ts`): `Duck { x; y; w; vx; left; right }` (pixels; `y` the top a rider stands on: `waterRow * TILE - DUCK_SINK`), `DUCK_W = 32`, `DUCK_SINK = 6`, `duckSpeed(dc) = 0.3 + 0.25 * dc.enemySpeed`; `CourseState.ducks`; built from `def.ducks`, neighbours starting in opposite directions. The riding part of `stepBubbles` becomes `ride(world, course, was)` over `[...bubbles, ...ducks]`, a `Ride` being `{ x; y; w; popped? }`: a rider on a duck is moved by the duck's `vx` first (unless a wall is there). `stepCourse` runs `stepRides` (bubbles, then ducks, then riding) first.

### Task 4: The dead-end check knows ducks

- `tests/helpers/reach.ts`: in `solid`, a duck's stretch is solid on the row over its water (`y - 1`, `left..right`): the ducks get you across, given the wait.

### Task 5: ÕHTU

- `vannituba.ts` exports `POO_ARENA` (its bathroom section) and uses it.
- `levels2/ohtu.ts`: `courseLevel({ name: 'Evening', theme: HOME_THEME, ending: 'boss', boss: 'poo', indoors: true, home: true, look: { bg: '#b9a6d6', groundColor: '#e9eef2', groundTop: '#ffffff', brickColor: '#8fc3d8' } })`, sections:
  - **the bath is filling**, 40 wide: `P` (2, 20); `b` (6, 22); `F` (10, 22); row 23 `I` at 12-34 (the wet floor); `m` at 20 and 32 (row 22).
  - **the bath**, 40 wide: `F` (2, 22); rims `B` at 6-7 and 32-33, rows 20-22; water `_` at 8-31, rows 21-24; ducks `q` at (10, 20), (18, 20), (26, 20).
  - **the toilet**: `POO_ARENA`.
  - furniture: `nightWindow`, `towel`, `tubEnd` over each rim, `door`.
- `stages.ts`: the home world is HOMMIK, PÄEV, ÕHTU (`level_7_3`: `ÕHTU`/`EVENING`); `?boss=poo` keeps VANNITUBA.
- **Tests:** ÕHTU comes after PÄEV and ends the run on the poo; it ends with the very arena VANNITUBA ends with; two shampoo bottles on a wet floor; a bot crosses the bath duck to duck on every difficulty (wait on the rim or a duck until the next duck is close, then hop).
- **Pictures:** `gfx/furniture.ts` `nightWindow` (a dark blue sky, a moon, stars, curtains) and `tubEnd` (the bathtub's white enamel end over a rim, a blue rim line); `gfx/course.ts`: in the home tileset the water is bath water (light blue, foam); a duck image per duck (`DUCK_TEXTURE` at twice its size, its back where the rider stands, bobbing, facing the way it drifts).

### Task 6: Browser, papers

- `?level=21` is ÕHTU. Screenshots: the wet floor and the bottles squirting; hopping the ducks; the arena and the fight to its end; the win screen. A driven run on Super Easy and on Hard (through the bath; the fight by its own bot as in the poo batch).
- `PLAYTEST.md`, the spec (step 3 built), memory. `tsc`, all tests, build.
