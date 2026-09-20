// Port of the camera lerp at index.html:1634-1640, plus the world constructor and the
// fixed-step orchestrator (createWorld / stepWorld) that will host Task 5's enemies.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { createWorld, stepCamera, stepWorld } from '../src/game/world';
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
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
        })),
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
    const after: Array<{ cam: number; enemyX: number[] }> = [];
    for (let i = 0; i < 60; i++) {
      stepWorld(world, held({ right: true }));
      if (world.dead) {
        if (frozenAt < 0) frozenAt = i;
        after.push({
          cam: world.camera.x,
          enemyX: world.enemies.map((e) => e.x),
        });
      }
    }

    expect(frozenAt).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(5);
    // Every sample taken from the death frame onward is identical to the first.
    for (const sample of after) expect(sample).toEqual(after[0]);
  });
});
