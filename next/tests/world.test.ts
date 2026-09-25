// Port of the camera lerp at index.html:1634-1640, plus the world constructor and the
// fixed-step orchestrator (createWorld / stepWorld) that hosts the enemies (enemy.ts)
// and the rescue (checkRescue below).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { testEnemyMove, testMove } from './helpers/testMove';
import { checkRescue, createWorld, rescueSpot, stepArrows, stepCamera, stepWorld } from '../src/game/world';
import { findGroundY } from '../src/game/tiles';
import { getRescueSprites, setSelectedChar } from '../src/game/run';
import { emptyInput, type InputState } from '../src/input/actions';
import { DIFF_KEYS } from '../src/config/difficulty';
import { LEVELS, TILE_BRICK } from '../src/data/levels';
import { TILE, VIEW_H, VIEW_W } from '../src/config/constants';
import { setRandom } from '../src/game/random';
import type { EnemyState, World } from '../src/game/types';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

/** The same clamp stepCamera itself applies, recomputed here to know what to expect. */
function cameraTarget(world: World): { x: number; y: number } {
  const { player: p, level: lvl } = world;
  return {
    x: Math.max(0, Math.min(p.x - VIEW_W / 2 + p.w / 2, lvl.width * TILE - VIEW_W)),
    y: Math.max(0, Math.min(p.y - VIEW_H / 2, lvl.height * TILE - VIEW_H)),
  };
}

describe('createWorld', () => {
  it('starts the camera at the origin', () => {
    const world = createWorld(0, 'normal');
    expect(world.camera).toEqual({ x: 0, y: 0 });
  });

  it('queues every one of the level\'s enemy defs as pending and unspawned', () => {
    const world = createWorld(0, 'normal');
    expect(world.pending).toEqual(
      world.level.enemyDefs.map((d) => ({ type: d.type, x: d.x, spawned: false })),
    );
  });
});

describe('stepCamera', () => {
  it('moves toward the player over successive steps', () => {
    const world = createWorld(0, 'normal');
    world.player.x = 2000; // far right of spawn, well clear of the level's own clamp
    const target = cameraTarget(world);
    let prevDist = Math.abs(world.camera.x - target.x);
    expect(prevDist).toBeGreaterThan(0); // sanity: there is somewhere to move to

    for (let i = 0; i < 15; i++) {
      stepCamera(world);
      const dist = Math.abs(world.camera.x - target.x);
      expect(dist).toBeLessThan(prevDist); // strictly closer every step
      prevDist = dist;
    }
  });

  it('never goes negative, even where the raw target would be without the clamp', () => {
    const world = createWorld(0, 'normal');
    // Pretend the camera had already scrolled right, and the player is back at the
    // level's left edge: p.x - VIEW_W/2 + p.w/2 is negative there, so the target
    // reads 0 only because of the Math.max(0, ...) clamp in stepCamera/cameraTarget.
    world.camera.x = 500;
    world.camera.y = 300;
    world.player.x = 0;
    world.player.y = 0;
    expect(cameraTarget(world)).toEqual({ x: 0, y: 0 });

    for (let i = 0; i < 200; i++) {
      stepCamera(world);
      expect(world.camera.x).toBeGreaterThanOrEqual(0);
      expect(world.camera.y).toBeGreaterThanOrEqual(0);
    }
    expect(world.camera.x).toBe(0);
    expect(world.camera.y).toBe(0);
  });

  it('stops exactly on target rather than approaching forever', () => {
    const world = createWorld(0, 'normal');
    world.player.x = 2000;
    const target = cameraTarget(world);

    for (let i = 0; i < 200; i++) stepCamera(world);
    expect(world.camera.x).toBe(target.x);

    // Idempotent once snapped — further steps do not perturb it away again.
    stepCamera(world);
    expect(world.camera.x).toBe(target.x);
  });
});

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

describe('the camera through a real jump', () => {
  // CONVERTED with plan 7, from a frame-for-frame comparison against the live game.
  //
  // That comparison drove a jump-in-place script through both sides and asserted the two
  // cameras were equal every frame. The camera is pure math over the player's position,
  // so with the player on an Arcade body the comparison is a comparison of player
  // physics wearing a camera's clothes, and it retires with the rest of them.
  //
  // Two things learned while retiring it, both worth keeping:
  //
  //   - The script it used could not show what it claimed. The camera's Y target is
  //     `clamp(p.y - VIEW_H/2, 0, lvl.height*TILE - VIEW_H)`, and in level 1 that upper
  //     clamp is 133.33 while a jump from the base ground only lifts the player to
  //     y≈280 — a raw target of ~146, still over the clamp. So the Y camera sat pinned
  //     at 133.33 for every frame of that jump, on BOTH sides, and the test's own sanity
  //     check ("the Y camera is not just sitting still") was satisfied by the opening
  //     lerp up from the origin, not by the jump at all.
  //   - Where the Y camera does move is up on the high platforms, which is where this
  //     replacement stands: [58,14,4] — columns 58-61, row 14, top at 224 — leaves the
  //     player at y=200 and a raw target of ~67, well inside the clamps.
  //
  // What remains is the port against its own arithmetic, through the real loop rather
  // than by poking `player.x` and calling `stepCamera` (the describe above). `testMove`
  // holds the player up and the jump is stepPlayer's; neither is asserted here, only
  // that the camera goes where the player is.
  it('tracks the player up and back down, without overshooting its target', () => {
    const FRAMES = 120;
    const PLATFORM_TILE = 59;
    const world = createWorld(0, 'normal');
    // No enemies: the camera has no opinion about them, and a dino patrolling the
    // question block at [55,15] two rows below is not worth the coupling.
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = PLATFORM_TILE * TILE;
    world.player.y = findGroundY(world.map, PLATFORM_TILE) - world.player.h;
    world.player.onGround = true;

    const targets: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, held({ jump: f >= 5 && f < 20, jumpPressed: f === 5 }), testMove);
      targets.push(cameraTarget(world).y);
      // Never outside the level, whatever the player is doing.
      expect(world.camera.y).toBeGreaterThanOrEqual(0);
      expect(world.camera.y).toBeLessThanOrEqual(world.level.height * TILE - VIEW_H);
    }

    // The jump really did move the target — up while rising, back down on landing —
    // rather than the whole run happening against a pinned clamp.
    expect(new Set(targets).size).toBeGreaterThan(5);
    expect(Math.max(...targets) - Math.min(...targets)).toBeGreaterThan(20);
    // ...and by the end the camera has caught up with it.
    expect(Math.abs(world.camera.y - cameraTarget(world).y)).toBeLessThan(1);
    expect(world.player.onGround).toBe(true); // landed back on the platform, as intended
  });
});

describe('death freezes the whole world, not just the player', () => {
  // The live update() returns as soon as the state is 'dead' (index.html:1348), above the
  // playing branch — so the camera and every enemy stop dead too. An earlier version of
  // stepWorld froze only the player and let the camera keep scrolling around the corpse.
  //
  // This needs a PIT death specifically. Level 0's doll@15 patrols into the oncoming
  // player and kills it by contact around frame 59, but contact damage is deliberately
  // out of the slice, so the port would not die there and the comparison would be about
  // the wrong thing. A gap carved next to spawn kills both implementations the same way,
  // well before the doll is anywhere near.
  const GAP_FROM = 4;
  const GAP_TO = 8;
  const carveGap = (map: number[][]): void => {
    for (let ty = map.length - 2; ty < map.length; ty++) {
      for (let tx = GAP_FROM; tx <= GAP_TO; tx++) map[ty][tx] = 0;
    }
  };

  // RETIRED with plan 7: 'matches the live game across the death and after it', which
  // drove this same carved gap through both sides and compared player, camera, enemies
  // and score frame for frame across the death. It is a player-physics comparison, and
  // those are over. What it knew, kept because the test below still depends on half of
  // it: the live game's 90-frame respawn is what bounds the 60-frame window (past that,
  // the level rebuilds and the comparison is about something else), and the live camera
  // and enemies stop on the death frame itself, not the one after — index.html:1348's
  // `return` is above the whole playing branch.
  it('stops the camera and the enemies on the death frame, not one frame later', () => {
    const world = createWorld(0, 'normal');
    world.map = world.map.map((row) => row.slice());
    carveGap(world.map);

    let frozenAt = -1;
    const after: Array<{ cam: number; enemyX: number[]; frame: number; frameTimer: number }> = [];
    const animFrameAfter: number[] = [];
    for (let i = 0; i < 60; i++) {
      // BOTH movers, and the enemy one is what makes the enemy half of this test mean
      // anything: a ground patroller handed no mover stands still anyway (see EnemyMove
      // in game/enemy.ts), so "the enemies stopped" would be a claim about nothing.
      stepWorld(world, held({ right: true }), testMove, testEnemyMove);
      if (world.dead) {
        if (frozenAt < 0) frozenAt = i;
        after.push({
          cam: world.camera.x,
          enemyX: world.enemies.map((e) => e.x),
          frame: world.player.frame,
          frameTimer: world.player.frameTimer,
        });
        animFrameAfter.push(world.animFrame);
      }
    }

    expect(frozenAt).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(5);
    // Every sample taken from the death frame onward is identical to the first — the
    // player's own walk-cycle frame/frameTimer included, frozen exactly like its x/y.
    for (const sample of after) expect(sample).toEqual(after[0]);

    // animFrame is the one exception (index.html:1275 runs even in the live game's own
    // 'dead' state, before its gameState branch): it keeps counting through death
    // rather than freezing with everything else.
    for (let i = 1; i < animFrameAfter.length; i++) {
      expect(animFrameAfter[i]).toBe(animFrameAfter[i - 1] + 1);
    }
  });
});

describe('checkRescue', () => {
  afterEach(() => setSelectedChar('gigi')); // never leak a character choice into an unrelated test

  // Level 0's rescue is at tile (115,20) — index.html:1629's rX/rY, derived the same
  // way here: rGY=findGroundY(map,115)=368 (flat ground, no platform covers column
  // 115), and rDH from the RESCUED character's sprite at scale 2. Playing gigi
  // rescues Dodo (DODO_STAND, 12 rows -> 24), so rY=368-24=344.
  const RESCUE_TX = 115;

  it('wins when the player\'s full hitbox overlaps the rescue box', () => {
    const world = createWorld(0, 'normal', 'gigi');
    const rX = RESCUE_TX * TILE;
    const rGY = findGroundY(world.map, RESCUE_TX);
    const rY = rGY - getRescueSprites().sprite.length * 2;
    world.player.x = rX;
    world.player.y = rY;

    checkRescue(world);

    expect(world.won).toBe(true);
    expect(world.stateTimer).toBe(200); // index.html:1631's stateTimer=200
  });

  it('does not win nowhere near the rescue', () => {
    const world = createWorld(0, 'normal', 'gigi'); // player still at spawn, tile 2
    checkRescue(world);
    expect(world.won).toBe(false);
  });

  it('sizes the box off the RESCUED character\'s sprite, not the player\'s', () => {
    // Gigi (14-row stand, rDH=28) and Dodo (12-row stand, rDH=24) are different
    // heights, and it is always the OTHER character being rescued — so the same Y
    // has to win when rescuing the tall one and miss when rescuing the short one,
    // with nothing else about the scene changed.
    const rX = RESCUE_TX * TILE;

    const tallWorld = createWorld(0, 'normal', 'dodo'); // playing dodo rescues Gigi (28)
    setSelectedChar('dodo');
    const topOfTallBox = findGroundY(tallWorld.map, RESCUE_TX) - 28;
    tallWorld.player.w = 1;
    tallWorld.player.h = 2; // a thin probe: enough to sit just inside the top of the box
    tallWorld.player.x = rX;
    tallWorld.player.y = topOfTallBox;
    checkRescue(tallWorld);
    expect(tallWorld.won).toBe(true);

    const shortWorld = createWorld(0, 'normal', 'gigi'); // playing gigi rescues Dodo (24)
    setSelectedChar('gigi');
    shortWorld.player.w = 1;
    shortWorld.player.h = 2;
    shortWorld.player.x = rX;
    shortWorld.player.y = topOfTallBox; // the SAME y — 4px above Dodo's shorter box
    checkRescue(shortWorld);
    expect(shortWorld.won).toBe(false);
  });

  it('uses a flat 16px width, not the rescued sprite\'s own width', () => {
    // Dodo's stand sprite is 10 cols wide (w=20 at scale 2) — noticeably wider than
    // the hardcoded 16 index.html:1631 actually uses. A thin probe placed just past
    // the CORRECT box's right edge (rX+16) would still be inside a sprite-width box.
    const world = createWorld(0, 'normal', 'gigi');
    const rX = RESCUE_TX * TILE;
    const rY = findGroundY(world.map, RESCUE_TX) - getRescueSprites().sprite.length * 2;
    world.player.w = 1;
    world.player.h = 1;
    world.player.x = rX + 16;
    world.player.y = rY;

    checkRescue(world);

    expect(world.won).toBe(false);
  });

  it('uses the player\'s FULL hitbox, not the inset box the stomp check uses', () => {
    // createPlayer's default gigi box is w=16 — the same width the stomp check in
    // enemy.ts insets by +2/-4 (a 12px-wide box). Placed 15px left of the rescue box,
    // the FULL box overlaps by 1px; the inset box, 2px narrower on each side, falls
    // 1px short.
    const world = createWorld(0, 'normal', 'gigi');
    const rX = RESCUE_TX * TILE;
    const rY = findGroundY(world.map, RESCUE_TX) - getRescueSprites().sprite.length * 2;
    world.player.x = rX - 15;
    world.player.y = rY; // player.h is 24 here, exactly rDH — a clean vertical match

    checkRescue(world);

    expect(world.won).toBe(true);
  });

  it('ports the (always-true, in this slice) boss condition rather than dropping it', () => {
    // index.html:1630's `canRescue=!boss||bossDefeated`. This slice's World has no
    // `boss` field at all — a boss fight is a later plan — so there is no way to
    // construct a world where this reads false; every test above already exercises
    // the always-true path. This just names that explicitly, in one place, rather
    // than leaving it implicit in every other passing assertion.
    const world = createWorld(0, 'normal', 'gigi');
    const rX = RESCUE_TX * TILE;
    const rY = findGroundY(world.map, RESCUE_TX) - getRescueSprites().sprite.length * 2;
    world.player.x = rX;
    world.player.y = rY;
    checkRescue(world);
    expect(world.won).toBe(true);
  });

  // `rescueSpot` is the same derivation, named and exported so the scene can DRAW the
  // sibling there. Nothing above can catch it drifting from the box the check uses —
  // the check would go on working perfectly while the sibling stood somewhere else, so
  // a child would walk up to a picture that does nothing and win on empty air a little
  // further along. That is a worse bug than the missing sprite it replaced, and it is
  // the only part of the drawing worth a unit test.
  describe('rescueSpot', () => {
    it('is the top-left corner of the box checkRescue wins on', () => {
      const world = createWorld(0, 'normal', 'gigi');
      const spot = rescueSpot(world);

      // A 1x1 probe in the spot's own corner wins...
      world.player.w = 1;
      world.player.h = 1;
      world.player.x = spot.x;
      world.player.y = spot.y;
      checkRescue(world);
      expect(world.won).toBe(true);

      // ...and the same probe one pixel above the spot's top edge does not, so the y
      // really is where the box starts rather than anywhere inside it.
      const above = createWorld(0, 'normal', 'gigi');
      above.player.w = 1;
      above.player.h = 1;
      above.player.x = spot.x;
      above.player.y = spot.y - 1;
      checkRescue(above);
      expect(above.won).toBe(false);
    });

    it('stands in the rescue column on the ground, as tall as the RESCUED character', () => {
      // Playing gigi rescues Dodo (12-row stand, 24 at scale 2) and playing dodo
      // rescues Gigi (14 rows, 28) — the same column and the same ground either way,
      // so the taller sibling simply starts 4px higher up.
      const rescuingDodo = rescueSpot(createWorld(0, 'normal', 'gigi'));
      const ground = findGroundY(createWorld(0, 'normal', 'gigi').map, RESCUE_TX);
      expect(rescuingDodo).toEqual({ x: RESCUE_TX * TILE, y: ground - 24, h: 24 });

      setSelectedChar('dodo');
      const rescuingGigi = rescueSpot(createWorld(0, 'normal', 'dodo'));
      expect(rescuingGigi).toEqual({ x: RESCUE_TX * TILE, y: ground - 28, h: 28 });
    });
  });
});

describe('winning freezes the whole world, same as dying does', () => {
  it('stops the player, camera and enemies on the win frame, but keeps animFrame counting', () => {
    const world = createWorld(0, 'normal', 'gigi');
    const rX = 115 * TILE;
    const rY = findGroundY(world.map, 115) - getRescueSprites().sprite.length * 2;
    world.player.x = rX;
    world.player.y = rY;
    world.player.vx = 0;
    world.player.vy = 0;

    stepWorld(world, held({}), testMove); // the win itself
    expect(world.won).toBe(true);
    expect(world.stateTimer).toBe(200);

    const frozen = {
      x: world.player.x, y: world.player.y,
      camera: { ...world.camera },
      enemyCount: world.enemies.length,
    };
    const animFrames: number[] = [world.animFrame];
    for (let i = 0; i < 20; i++) {
      // Input that would move a live world — and, with a mover injected, genuinely
      // would: without one the player cannot move at all and "nothing moved" is a
      // claim about nothing.
      stepWorld(world, held({ right: true, jump: i % 2 === 0 }), testMove);
      animFrames.push(world.animFrame);
    }

    expect(world.player.x).toBe(frozen.x);
    expect(world.player.y).toBe(frozen.y);
    expect(world.camera).toEqual(frozen.camera);
    expect(world.enemies.length).toBe(frozen.enemyCount);
    expect(world.dead).toBe(false); // won, not dead — the two never overlap here
    // The one thing that is NOT frozen besides animFrame: the rescue's own 200-frame
    // countdown, which the live 'levelcomplete' state runs (index.html:1350) and which the
    // scene reads to know when to advance the level. Twenty steps, twenty frames off it.
    expect(world.stateTimer).toBe(180);

    // animFrame is the one exception, same as the dead-freeze test above: it keeps
    // counting through the freeze rather than stopping with everything else.
    for (let i = 1; i < animFrames.length; i++) {
      expect(animFrames[i]).toBe(animFrames[i - 1] + 1);
    }
  });
});

describe('walking into the rescue', () => {
  // The rescue sits 113 tiles from spawn, across four gaps and past six ground
  // enemies (doll, doll, car, bat, dino, doll) before ever reaching the bouncer and
  // the rest of the level — briefly tried as a real "hold right, jump periodically"
  // script (enemies suppressed) and it died in a pit around frame 649, x=617,
  // nowhere near tile 115. Choreographing a script that reliably clears all four
  // gaps is exactly the kind of jump-timing problem out of scope here — the retired
  // trace suite needed a derived, searched-for jump frame to clear even ONE gap — so
  // this tests the win condition directly (the `checkRescue` describe block above)
  // instead of via a script that walks there.
  //
  // A short trace WAS practical and this used to be one: teleport the player straight
  // to the rescue on both sides, hold right for the last few pixels, and assert the two
  // win on the same frame with the same score. CONVERTED with plan 7 — the frame the
  // player arrives is now Arcade's answer rather than the live sweep's, so only the
  // port's own side of it survives. The live half is recorded rather than run: measured
  // on the day it was retired, the original flips `gameState` to 'levelcomplete' on
  // frame 3 of this script, scores 500 doing it, and ends the tenth frame at x=1826.
  // `driveLiveGame`'s `beforeRun`/`getGameState` will say so again if it is ever worth
  // re-asking (tests/helpers/liveGame.ts).
  //
  // Worth knowing WHY that number is not asserted, since it currently agrees to the
  // pixel: this stretch is open flat ground, where the live sweep never separates
  // anything and x is plain `x += vx`. So the agreement is about the acceleration ramp
  // — hand-written, unchanged, shared — and says nothing whatever about Arcade, which is
  // not what runs here. Asserting it would be asserting `testMove`.
  it('wins, and scores 500 exactly once, when walked into the rescue box', () => {
    const FRAMES = 10;
    const rX = 115 * TILE;
    const rY = 344; // findGroundY(map,115) - dodo's rDH(24); pinned literally here as
    // an independent check on the derivation the checkRescue tests above already do.
    const startX = rX - 20; // a few pixels short, so "hold right" walks it in rather
    // than starting already inside the box.

    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = startX;
    world.player.y = rY;
    world.player.vx = 0;
    world.player.vy = 0;
    world.player.onGround = true;

    let portWinFrame = -1;
    const scores: number[] = [];
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, held({ right: true }), testMove);
      if (portWinFrame < 0 && world.won) portWinFrame = f;
      scores.push(world.score);
    }

    expect(portWinFrame).toBeGreaterThanOrEqual(0); // it must actually win, or this proves nothing
    // Walked in rather than starting inside the box: the first frames are a walk, not a
    // win. (`checkRescue` above covers the box arithmetic; this covers reaching it.)
    expect(portWinFrame).toBeGreaterThan(0);
    // The rescue is a scoring event too (index.html:1631's `score+=Math.round(500*
    // dc.scoreMultiplier)`) — 500 at normal's 1.0 multiplier, awarded on the win frame
    // and exactly once, since `won` freezes the world from the next frame on.
    expect(world.score).toBe(500);
    expect(scores.filter((s) => s === 0)).toHaveLength(portWinFrame);
    expect(new Set(scores)).toEqual(new Set([0, 500]));
  });
});

describe('the level spawn tables vs. the live game', () => {
  // `dc.enemySkipChance` does not only make enemies spawn less often — it also injects
  // a pickup every 20 tiles (world.ts's buildLevelState). It is truthy on super_easy
  // alone, and every frame trace in this suite runs at `normal`, so no trace can reach
  // that branch at all; without this, it would be covered by nothing. It is not a
  // theoretical corner either, since super_easy and easy are the difficulties this
  // game is actually played on.
  //
  // One assertion over the whole grid rather than a case per cell. It costs nothing to
  // widen from the one branch that needs covering to all four difficulties and all six
  // levels, and doing so also pins the parts that move WITH difficulty for other
  // reasons: gapWidth reshapes the map, which moves every pickup's `y` (findGroundY)
  // and can change which columns carry a question or rainbow block at all.
  it('builds identical pickup, star and block tables for every difficulty and level', () => {
    // Through JSON deliberately: the live tables are objects from the VM's own realm,
    // and what is being compared is the data, not the identity or the prototype.
    const snapshot = <T>(v: T): T => JSON.parse(JSON.stringify(v));

    const live: unknown[] = [];
    const port: unknown[] = [];
    for (const difficulty of DIFF_KEYS) {
      for (let level = 0; level < LEVELS.length; level++) {
        // frames: 0 — initLevel has already run by the time beforeRun fires, and no
        // frame needs stepping to read what it built.
        driveLiveGame({
          level, difficulty, character: 'gigi', frames: 0,
          input: () => ({ left: false, right: false, jump: false, fire: false }),
          beforeRun: (d) => {
            live.push({ difficulty, level, ...snapshot(d.getLevelSpawn()) });
          },
        });
        const w = createWorld(level, difficulty, 'gigi');
        port.push({
          difficulty,
          level,
          ...snapshot({
            bowPickups: w.bowPickups, superPickups: w.superPickups, catPickup: w.catPickup,
            stars: w.stars, questionBlocks: w.questionBlocks, rainbowBlocks: w.rainbowBlocks,
          }),
        });
      }
    }

    // Each entry carries its own difficulty and level, so a mismatch names the cell
    // rather than leaving 24 anonymous ones to be counted through by hand.
    expect(port).toEqual(live);
  });
});

// Port of index.html:1503-1517. The flight itself, the kill and the conversion are all
// driven against the live game in trace.test.ts. Two branches of it are not, because no
// arrangement of level 0 puts them in front of an arrow: a chicken ray meeting an enemy
// that is ALREADY a chicken, and an arrow meeting a wall.
describe('stepArrows', () => {
  /** An enemy with the doll's real dimensions, parked wherever the test wants it. */
  function enemyAt(x: number, y: number, over: Partial<EnemyState> = {}): EnemyState {
    return {
      type: 'doll', x, y, vx: 0, vy: 0, w: 14.4, h: 16.2, alive: true,
      frame: 0, frameTimer: 0, squashTimer: 0,
      noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
      shootTimer: 0, shootInterval: 0, noStomp: false,
      isChicken: false,
      ...over,
    };
  }

  afterEach(() => setRandom(Math.random));

  // The `return` in the live conversion branch is a CONTINUE, not a BREAK — it ends one
  // enemy's turn inside `enemies.forEach` and the loop carries straight on. Reading it as
  // a break would stop the pass at the first hit, so this puts THREE enemies in the path
  // of one ray at once: the two ordinary ones must both be converted, and the one that is
  // already a chicken must be killed instead, by the branch the `return` skips.
  it('a chicken ray converts everything it overlaps at once, and kills what is already a chicken', () => {
    setRandom(() => 0.5);
    const world = createWorld(0, 'normal');
    world.pending.length = 0;
    // Stacked on the same spot, so one 12x4 arrow rect overlaps all three.
    world.enemies = [
      enemyAt(100, 200),
      enemyAt(100, 200, { type: 'chicken', isChicken: true }),
      enemyAt(100, 200),
    ];
    world.arrows = [{ x: 100, y: 202, vx: 0, life: 10, isChicken: true }];

    stepArrows(world);

    const [a, alreadyChicken, b] = world.enemies;
    expect(a.type).toBe('chicken');
    expect(b.type).toBe('chicken'); // reached AFTER the one that was killed
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
    expect(alreadyChicken.alive).toBe(false);
    expect(alreadyChicken.squashTimer).toBe(30);
    // 100 + 200 + 100: two conversions and one kill, all from a single ray, all in one
    // pass. A `break` would have scored 100.
    expect(world.score).toBe(Math.round(100 * world.dc.scoreMultiplier) * 2
      + Math.round(200 * world.dc.scoreMultiplier));
    // The arrow is spent either way, and leaves the list at the end of the same pass.
    expect(world.arrows).toEqual([]);
  });

  // Tiles are probed at two bare POINTS, `a.x` and `a.x + 10` — not across the 12-wide
  // box the enemies are tested against — so which of the two is the leading edge depends
  // on which way the arrow is going. And the check does NOT short-circuit the pass: an
  // arrow stopped by a wall still runs its enemy loop that frame, and still kills
  // anything it happens to be overlapping when it stopped.
  it('a solid tile at whichever probe leads stops an arrow, without cancelling that frame\'s hit', () => {
    // A single brick well clear of the ground, in a row level 0 leaves empty.
    const WALL_TX = 20;
    const WALL_TY = 10;
    const WALL_X = WALL_TX * TILE;
    const Y = WALL_TY * TILE + 4;

    function shoot(x: number, vx: number, enemy?: EnemyState): World {
      const world = createWorld(0, 'normal');
      world.pending.length = 0;
      world.map[WALL_TY][WALL_TX] = TILE_BRICK;
      world.enemies = enemy === undefined ? [] : [enemy];
      world.arrows = [{ x, y: Y, vx, life: 10, isChicken: false }];
      stepArrows(world);
      return world;
    }

    // Flying right, the leading probe is `x + 10`: `x` itself lands 6px short of the
    // brick and the arrow still dies.
    expect(shoot(WALL_X - 16, 6).arrows).toEqual([]);
    // Flying left, the leading probe is `x`: `x + 10` is 10px past the brick's right
    // edge, in open air, and the arrow still dies.
    expect(shoot(WALL_X + TILE + 4, -6).arrows).toEqual([]);
    // One pixel further back, with neither probe in the brick, it flies on — so the two
    // above are the tile check firing rather than the arrow simply expiring.
    expect(shoot(WALL_X - 17, 6).arrows).toHaveLength(1);

    // ...and the kill still happens on the frame the wall stops it. `a.life = 0` is not a
    // `return`: the enemy loop runs either way, so an enemy standing in the same spot as
    // the brick dies to an arrow that has already been stopped by it.
    const hit = shoot(WALL_X - 16, 6, enemyAt(WALL_X, Y - 4));
    expect(hit.enemies[0].alive).toBe(false);
    expect(hit.score).toBe(Math.round(200 * hit.dc.scoreMultiplier));
    expect(hit.arrows).toEqual([]);
  });
});
