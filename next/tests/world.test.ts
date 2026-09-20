// Port of the camera lerp at index.html:1634-1640, plus the world constructor and the
// fixed-step orchestrator (createWorld / stepWorld) that hosts the enemies (enemy.ts)
// and the rescue (checkRescue below).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { checkRescue, createWorld, stepCamera, stepWorld } from '../src/game/world';
import { findGroundY } from '../src/game/tiles';
import { getRescueSprites, setSelectedChar } from '../src/game/run';
import { emptyInput, type InputState } from '../src/input/actions';
import { TILE, VIEW_H, VIEW_W } from '../src/config/constants';
import type { World } from '../src/game/types';

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
  const dir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../src/game');
  for (const file of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(source, `${file} imports Phaser`).not.toMatch(/from ['"]phaser['"]/);
  }
});

describe('camera vs. the live game', () => {
  // A plain "hold right" script was tried first, as the task suggested, and turned out
  // to be genuinely awkward: doll@15 (index.html's own level-0 enemyDefs) patrols left
  // into the oncoming player and kills it around frame 59 — well before the player
  // ever reaches the ~205px dead zone the camera needs to start scrolling at all. That
  // is a real live-game interaction, but not one this port simulates yet (enemies are
  // Task 5), so comparing through it would be comparing against a death this side of
  // the fence can't reproduce, not against the camera math this task is about.
  //
  // Jumping in place sidesteps it: the player never leaves the neighbourhood of spawn
  // (x≈32), doll@15 patrols from x=240 and covers at most 96px in 120 frames, so they
  // never meet, while the vertical motion still drives the Y camera through exactly
  // the cases the unit tests above exercise in isolation — clamped-at-rest, lerping
  // while the target moves, and snapping once it's close — against the real update().
  it('matches frame by frame over a jump-in-place script', () => {
    const FRAMES = 120;
    const script = (f: number) => ({ left: false, right: false, jump: f >= 5 && f < 20 });
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES, input: script,
    });

    const world = createWorld(0, 'normal');
    const port: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < FRAMES; i++) {
      stepWorld(world, held(script(i)));
      port.push({ x: world.camera.x, y: world.camera.y });
    }

    expect(port).toEqual(live.map((s) => s.camera));
    // Sanity: the Y camera is not just sitting still at its rest clamp the whole
    // time — the jump actually moved it, which is the point of this test.
    expect(new Set(port.map((s) => s.y)).size).toBeGreaterThan(1);
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

  it('matches the live game across the death and after it', () => {
    const FRAMES = 60; // well inside the live game's 90-frame respawn, which is out of scope
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES,
      input: () => ({ left: false, right: true, jump: false }),
      mutateMap: carveGap,
    });

    const world = createWorld(0, 'normal');
    world.map = world.map.map((row) => row.slice());
    carveGap(world.map);

    const port = [];
    for (let i = 0; i < FRAMES; i++) {
      stepWorld(world, held({ right: true }));
      const p = world.player;
      port.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
        frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
          frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
        })),
        score: world.score,
      });
    }

    // The script must actually kill the player, or this proves nothing.
    expect(world.dead).toBe(true);
    expect(port).toEqual(live);
  });

  it('stops the camera and the enemies on the death frame, not one frame later', () => {
    const world = createWorld(0, 'normal');
    world.map = world.map.map((row) => row.slice());
    carveGap(world.map);

    let frozenAt = -1;
    const after: Array<{ cam: number; enemyX: number[]; frame: number; frameTimer: number }> = [];
    const animFrameAfter: number[] = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(world, held({ right: true }));
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

  // Level 0's rescue is at tile (115,20) — index.html:1631's rX/rY, derived the same
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

    stepWorld(world, held({})); // the win itself
    expect(world.won).toBe(true);
    expect(world.stateTimer).toBe(200);

    const frozen = {
      x: world.player.x, y: world.player.y,
      camera: { ...world.camera },
      enemyCount: world.enemies.length,
    };
    const animFrames: number[] = [world.animFrame];
    for (let i = 0; i < 20; i++) {
      stepWorld(world, held({ right: true, jump: i % 2 === 0 })); // input that would move a live world
      animFrames.push(world.animFrame);
    }

    expect(world.player.x).toBe(frozen.x);
    expect(world.player.y).toBe(frozen.y);
    expect(world.camera).toEqual(frozen.camera);
    expect(world.enemies.length).toBe(frozen.enemyCount);
    expect(world.dead).toBe(false); // won, not dead — the two never overlap here
    expect(world.stateTimer).toBe(200); // left alone — no level-advance in this slice

    // animFrame is the one exception, same as the dead-freeze test above: it keeps
    // counting through the freeze rather than stopping with everything else.
    for (let i = 1; i < animFrames.length; i++) {
      expect(animFrames[i]).toBe(animFrames[i - 1] + 1);
    }
  });
});

describe('the rescue vs. the live game', () => {
  // The rescue sits 113 tiles from spawn, across four gaps and past six ground
  // enemies (doll, doll, car, bat, dino, doll) before ever reaching the bouncer and
  // the rest of the level — briefly tried as a real "hold right, jump periodically"
  // script (enemies suppressed) and it died in a pit around frame 649, x=617,
  // nowhere near tile 115. Choreographing a script that reliably clears all four
  // gaps is exactly the kind of jump-timing problem out of scope here (see
  // inputScript.ts's own derived-timing helpers for how much machinery clearing even
  // ONE gap already takes) — so this tests the win condition directly (the
  // `checkRescue` describe block above) instead of via a script that walks there.
  //
  // A short trace IS practical, though: teleporting the player straight to the
  // rescue on both sides needs no choreography at all, only a couple of frames of
  // "hold right" to walk the last few pixels into the box, with enemies suppressed
  // (irrelevant to what this checks) on both sides. `beforeRun`/`onFrame`
  // (tests/helpers/liveGame.ts, added for this) mirror `mutateMap`'s own pattern:
  // `getPlayer()` returns the live script's actual `player` object, so mutating it
  // moves the real thing, and `getGameState()` reads the live `gameState` string
  // directly so the frame the live game itself flips to 'levelcomplete' can be
  // compared against `world.won` on the port's side.
  it('wins on the same frame as the live game when teleported to the rescue and walked in', () => {
    const FRAMES = 10;
    const rX = 115 * TILE;
    const rY = 344; // findGroundY(map,115) - dodo's rDH(24); pinned literally here as
    // an independent check on the derivation the checkRescue tests above already do.
    const startX = rX - 20; // a few pixels short, so "hold right" walks it in rather
    // than starting already inside the box.

    let liveWinFrame = -1;
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi', frames: FRAMES,
      input: () => ({ left: false, right: true, jump: false }),
      suppressEnemies: true,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = startX; p.y = rY; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d, f) => {
        if (liveWinFrame < 0 && d.getGameState() === 'levelcomplete') liveWinFrame = f;
      },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = startX;
    world.player.y = rY;
    world.player.vx = 0;
    world.player.vy = 0;
    world.player.onGround = true;

    let portWinFrame = -1;
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, held({ right: true }));
      if (portWinFrame < 0 && world.won) portWinFrame = f;
    }

    expect(portWinFrame).toBeGreaterThanOrEqual(0); // it must actually win, or this proves nothing
    expect(portWinFrame).toBe(liveWinFrame);
    expect(world.player.x).toBe(live[FRAMES - 1].x);
    expect(world.player.y).toBe(live[FRAMES - 1].y);
    // The rescue is a scoring event too (index.html:1631's `score+=Math.round(500*
    // dc.scoreMultiplier)`) — 500 at normal's 1.0 multiplier, awarded on the win frame
    // and exactly once, since `won` freezes the world from the next frame on.
    expect(world.score).toBe(live[FRAMES - 1].score);
    expect(world.score).toBe(500);
  });
});
