import { afterEach, describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel, joinSections, parseCourse } from '../src/data/course';
import { DEMO_COURSE as COURSE_LEVEL } from './helpers/demoCourse';
import { TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_PLANK, TILE_SPRING, isSolid } from '../src/data/levels';
import {
  LIFT_FRAMES, MIN_STATION_ARROWS, PLANK_INTERVAL, SPRING_FORCE, STATION_COOLDOWN,
} from '../src/game/course';
import { spawnEnemy } from '../src/game/enemy';
import { setRandom } from '../src/game/random';
import { createWorld } from '../src/game/world';
import type { World } from '../src/game/types';
import { quietWorld, standAt, step } from './helpers/courseRuns';

function course(difficulty: DifficultyKey = 'super_easy'): World {
  return createWorld(0, difficulty, 'gigi', undefined, COURSE_LEVEL);
}

/** A course with nothing else on it, so a test sees only the piece it is about. */
function quietCourse(difficulty: DifficultyKey = 'super_easy'): World {
  return quietWorld(COURSE_LEVEL, difficulty);
}

/** Where a target's planks start: the chasm's near edge is one tile before. */
function bridgeStart(t: { cells: Array<{ x: number }> }): number {
  return Math.min(...t.cells.map((c) => c.x));
}

function station(world: World, kind: string): { x: number; y: number } {
  const s = world.course!.stations.find((st) => st.kind === kind);
  if (!s) throw new Error(`no ${kind} station`);
  return { x: s.x / TILE, y: s.y / TILE };
}

afterEach(() => setRandom(Math.random));

describe('the course map', () => {
  it('is one picture, 25 rows tall, with the ground along the bottom', () => {
    expect(COURSE_LEVEL.height).toBe(25);
    const map = COURSE_LEVEL.generate(DIFFICULTY_CONFIG.normal);
    expect(map).toHaveLength(25);
    expect(map.every((row) => row.length === COURSE_LEVEL.width)).toBe(true);
    expect(map[24][0]).toBe(1);
  });

  it('is handed out fresh each time, so a smashed wall comes back after a death', () => {
    const a = COURSE_LEVEL.generate(DIFFICULTY_CONFIG.normal);
    a[0][0] = 99;
    expect(COURSE_LEVEL.generate(DIFFICULTY_CONFIG.normal)[0][0]).not.toBe(99);
  });

  it('puts a power-up before each obstacle, in order', () => {
    expect(COURSE_LEVEL.course!.stations.map((s) => s.kind))
      .toEqual(['bow', 'bow', 'fart', 'bighead', 'chicken']);
  });

  it('links its one target, in view from the edge, to an 18-tile drawbridge', () => {
    const [target] = COURSE_LEVEL.course!.targets;
    expect(target.cells).toHaveLength(18);
    expect(target.cells.every((c) => c.y === 23 && c.to === TILE_PLANK)).toBe(true);
    const x0 = bridgeStart(target);
    // In view from the edge, where a child stands to shoot: the camera shows ~13 tiles ahead.
    expect(target.x - (x0 - 1)).toBeLessThanOrEqual(10);
    expect(target.x).toBeGreaterThan(x0 + 3); // and not touchable from the edge
  });

  const TINY = [
    'P....T.......T....R',
    '......|............',
    '......|............',
    '#########====######',
    '###################',
  ];

  it('gives each bridge or gate to the target nearest it', () => {
    const { map, course } = parseCourse(TINY);
    const [gateTarget, bridgeTarget] = course.targets;
    expect(map[1][6]).toBe(TILE_GATE);
    expect(map[3][9]).toBe(TILE_EMPTY);
    // Bars lift from the bottom up; planks are laid from the far side back.
    expect(gateTarget.cells).toEqual([
      { x: 6, y: 2, to: TILE_EMPTY }, { x: 6, y: 1, to: TILE_EMPTY },
    ]);
    expect(bridgeTarget.cells.map((c) => c.x)).toEqual([12, 11, 10, 9]);
    expect(bridgeTarget.cells.every((c) => c.y === 3 && c.to === TILE_PLANK)).toBe(true);
  });

  it('refuses a target that opens nothing', () => {
    expect(() => parseCourse(['P.T..T..R', '#########'])).toThrow(/opens nothing/);
  });

  it('opens a gate a bar at a time once its target is shot', () => {
    const world = quietWorld(courseLevel({ name: 'tiny', theme: 0, sections: [TINY] }));
    const t = world.course!.targets[0];
    world.arrows.push({ x: t.box.x - 8, y: t.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(t.hit).toBe(true);
    let bottomFirst = false;
    for (let i = 0; i < 40; i++) {
      step(world);
      if (world.map[2][6] === TILE_EMPTY && world.map[1][6] === TILE_GATE) bottomFirst = true;
    }
    expect(bottomFirst).toBe(true);
    expect(world.map[1][6]).toBe(TILE_EMPTY);
  });

  it('stands the tunnel\'s enemies on the tunnel floor, not on its roof', () => {
    const map = COURSE_LEVEL.generate(DIFFICULTY_CONFIG.normal);
    const inTunnel = COURSE_LEVEL.enemyDefs.filter((d) => isSolid(map[20][d.x]) && d.floorRow === 23);
    expect(inTunnel.length).toBe(3);
    const doll = spawnEnemy(map, DIFFICULTY_CONFIG.normal, inTunnel[0])!;
    expect(doll.y + doll.h).toBe(23 * TILE);
  });

  it('refuses a picture whose sections do not line up, or a target with no bridge', () => {
    expect(() => joinSections([['..', '..'], ['.']])).toThrow();
    expect(() => parseCourse(['P.R.T', '#####'])).toThrow();
  });
});

describe('super easy on the course', () => {
  it('skips none of its enemies, and adds no free bows or capes', () => {
    setRandom(() => 0); // every roll would skip
    const world = course('super_easy');
    expect(world.bowPickups).toEqual([]);
    expect(world.superPickups).toEqual([]);
    step(world);
    const inView = world.pending.filter((d) => d.spawned).length;
    expect(inView).toBeGreaterThan(0);
    expect(world.enemies.length).toBe(inView);
  });
});

describe('stations', () => {
  it('hand out a bow with at least a few arrows, and come back', () => {
    const world = quietCourse('hard');
    const at = station(world, 'bow');
    standAt(world, at.x, at.y + 1);
    step(world);
    expect(world.player.hasBow).toBe(true);
    expect(world.player.bowCharges).toBeGreaterThanOrEqual(MIN_STATION_ARROWS);
    const s = world.course!.stations[0];
    expect(s.cooldown).toBeGreaterThan(0);
    standAt(world, 2, 23);
    step(world, {}, STATION_COOLDOWN);
    expect(s.cooldown).toBe(0);
  });

  it('announce a silly power-up the first time only', () => {
    const world = quietCourse();
    const at = station(world, 'fart');
    standAt(world, at.x, at.y + 1);
    step(world);
    expect(world.player.fartTimer).toBeGreaterThan(0);
    expect(world.powerupPopup).not.toBeNull();
    step(world, {}, 121);
    expect(world.powerupPopup).toBeNull();
    const s = world.course!.stations.find((st) => st.kind === 'fart')!;
    s.cooldown = 0;
    world.player.fartTimer = 0;
    standAt(world, at.x, at.y + 1);
    step(world);
    expect(world.player.fartTimer).toBeGreaterThan(0);
    expect(world.powerupPopup).toBeNull();
  });
});

describe('the drawbridge', () => {
  it('comes down plank by plank once its target is shot', () => {
    const world = quietCourse();
    const t = world.course!.targets[0];
    world.arrows.push({ x: t.box.x - 8, y: t.box.y + 20, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(t.hit).toBe(true);
    expect(world.arrows).toHaveLength(0);
    step(world, {}, PLANK_INTERVAL * (t.cells.length + 3));
    for (const c of t.cells) expect(world.map[c.y][c.x]).toBe(TILE_PLANK);
  });

  it('cannot be jumped on any difficulty, from a running start at the very edge', () => {
    for (const key of DIFF_KEYS) {
      const world = quietCourse(key);
      const t = world.course!.targets[0];
      const edge = bridgeStart(t) - 1;
      standAt(world, edge - 6, 23);
      let jumped = false;
      for (let i = 0; i < 200 && !world.dead; i++) {
        const atEdge = world.player.x + world.player.w >= (edge + 1) * TILE - 1;
        step(world, { right: true, jump: atEdge || jumped, jumpPressed: atEdge && !jumped });
        if (atEdge) jumped = true;
        world.player.hasCape = false;
      }
      expect({ key, landed: !world.dead }).toEqual({ key, landed: false });
    }
  });
});

describe('the cracked wall', () => {
  function atTheWall(): { world: World; wallX: number } {
    const world = quietCourse();
    const map = world.map;
    const wallX = map[22].indexOf(TILE_CRACKED);
    standAt(world, wallX - 2, 23);
    return { world, wallX };
  }

  it('stops a player with an ordinary head', () => {
    const { world, wallX } = atTheWall();
    step(world, { right: true }, 60);
    expect(world.map[22][wallX]).toBe(TILE_CRACKED);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(wallX * TILE);
  });

  it('gives way to a big head, a hero-shaped hole at a time', () => {
    const { world, wallX } = atTheWall();
    world.player.bigHeadTimer = 600;
    step(world, { right: true }, 90);
    expect(world.map[22][wallX]).toBe(TILE_EMPTY);
    expect(world.map[9][wallX]).toBe(TILE_CRACKED); // the top of the wall is still there
    expect(world.player.x).toBeGreaterThan((wallX + 3) * TILE);
  });
});

describe('the fart cliff', () => {
  function climb(key: DifficultyKey, fart: boolean): boolean {
    const world = quietCourse(key);
    const at = station(world, 'fart');
    world.course!.stations.forEach((s) => { s.cooldown = 99999; });
    standAt(world, at.x, at.y + 1);
    if (fart) world.player.fartTimer = 900;
    const cliffTop = 16 * TILE;
    for (let i = 0; i < 240; i++) {
      const p = world.player;
      step(world, { right: true, jump: true, jumpPressed: p.onGround });
      if (p.onGround && p.y + p.h <= cliffTop) return true;
    }
    return false;
  }

  it('is too tall for a plain jump on every difficulty', () => {
    for (const key of DIFF_KEYS) expect({ key, up: climb(key, false) }).toEqual({ key, up: false });
  });

  it('is cleared by a fart jump on every difficulty', () => {
    for (const key of DIFF_KEYS) expect({ key, up: climb(key, true) }).toEqual({ key, up: true });
  });
});

describe('springs', () => {
  it('throw the player higher than a jump, letting go of jump or not', () => {
    const world = quietCourse('normal');
    const sx = world.map[23].indexOf(TILE_SPRING);
    standAt(world, sx, 23);
    step(world);
    expect(world.player.vy).toBeCloseTo(DIFFICULTY_CONFIG.normal.jumpForce * SPRING_FORCE);
    const startY = world.player.y;
    let top = startY;
    for (let i = 0; i < LIFT_FRAMES; i++) {
      step(world);
      top = Math.min(top, world.player.y);
    }
    expect(startY - top).toBeGreaterThan(6 * TILE);
  });
});

describe('the sibling\'s tower', () => {
  function reach(key: DifficultyKey, fromSpring: boolean): boolean {
    const world = quietCourse(key);
    const spring = world.map[23].lastIndexOf(TILE_SPRING);
    const towerTop = 16 * TILE;
    // Walking onto the spring from two tiles back, or jumping from just past it.
    if (fromSpring) standAt(world, spring - 3, 23);
    else standAt(world, spring + 1, 23);
    for (let i = 0; i < 240; i++) {
      const p = world.player;
      if (world.won) return true;
      step(world, { right: true, jump: !fromSpring, jumpPressed: !fromSpring && p.onGround });
      if (!fromSpring) world.map[23] = world.map[23].map((c) => (c === TILE_SPRING ? 1 : c));
      if (p.onGround && p.y + p.h <= towerTop) return true;
    }
    return world.won;
  }

  it('is out of reach of a plain jump on every difficulty', () => {
    for (const key of DIFF_KEYS) expect({ key, up: reach(key, false) }).toEqual({ key, up: false });
  });

  it('is reached from the spring on every difficulty, holding only an arrow', () => {
    for (const key of DIFF_KEYS) expect({ key, up: reach(key, true) }).toEqual({ key, up: true });
  });
});

describe('the cape', () => {
  it('throws the player clear of a pit even when jump is not held', () => {
    const world = quietCourse('normal');
    const t = world.course!.targets[0];
    world.player.hasCape = true;
    standAt(world, bridgeStart(t) + 5, 30); // below the world, in the chasm
    world.player.vy = 8;
    step(world);
    expect(world.player.hasCape).toBe(false);
    const rescuedAt = world.player.y;
    let top = rescuedAt;
    for (let i = 0; i < 40; i++) {
      step(world, { right: false, jump: false });
      top = Math.min(top, world.player.y);
    }
    expect(rescuedAt - top).toBeGreaterThan(3 * TILE);
  });
});

describe('the giant', () => {
  function giant(world: World) {
    const def = COURSE_LEVEL.enemyDefs.find((d) => d.type === 'giant')!;
    const e = spawnEnemy(world.map, world.dc, def)!;
    world.enemies.push(e);
    return e;
  }

  it('shrugs off an arrow', () => {
    const world = quietCourse();
    const e = giant(world);
    world.arrows.push({ x: e.x - 6, y: e.y + 20, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(e.alive).toBe(true);
    expect(e.type).toBe('giant');
    expect(world.arrows).toHaveLength(0);
  });

  it('is a chicken after a chicken ray', () => {
    const world = quietCourse();
    const e = giant(world);
    world.arrows.push({ x: e.x - 6, y: e.y + 20, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(e.type).toBe('chicken');
    expect(e.h).toBeLessThan(TILE);
  });

  it('cannot be jumped over in its corridor', () => {
    const def = COURSE_LEVEL.enemyDefs.find((d) => d.type === 'giant')!;
    const map = COURSE_LEVEL.generate(DIFFICULTY_CONFIG.normal);
    const e = spawnEnemy(map, DIFFICULTY_CONFIG.normal, def)!;
    let ceiling = def.floorRow! - 1;
    while (!isSolid(map[ceiling][def.x])) ceiling--;
    const headroom = (def.floorRow! - ceiling - 1) * TILE;
    expect(headroom).toBeGreaterThanOrEqual(e.h);
    expect(headroom).toBeLessThan(e.h + 20); // Dodo, the shorter hero, is 20 tall
  });
});

describe('the tunnel\'s guards', () => {
  function guardAhead(world: World) {
    const def = COURSE_LEVEL.enemyDefs.find((d) => d.guard)!;
    const e = spawnEnemy(world.map, world.dc, def)!;
    world.enemies.push(e);
    return e;
  }

  it('bounce the player back without hurting, even mid-blink after a cape', () => {
    const world = quietCourse();
    const e = guardAhead(world);
    world.player.hasCape = true;
    world.player.invincible = 100;
    standAt(world, 0, 23);
    world.player.x = e.x - world.player.w + 2; // already overlapping
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.hasCape).toBe(true);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(e.x);
    expect(world.player.vx).toBeLessThan(0);
  });

  it('go down to an arrow like anyone else', () => {
    const world = quietCourse();
    const e = guardAhead(world);
    world.arrows.push({ x: e.x - 6, y: e.y + 8, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(e.alive).toBe(false);
  });
});

describe('checkpoints', () => {
  it('bring a death back to the last flag touched, not the start', () => {
    const world = course();
    const flag = world.course!.flags[2];
    standAt(world, flag.x, flag.y);
    step(world);
    expect(world.checkpoint).toEqual({ x: flag.x, y: flag.y });
    world.player.hasCape = false;
    world.player.y = 30 * TILE;
    world.player.vy = 8;
    step(world);
    expect(world.dead).toBe(true);
    step(world, {}, 91);
    expect(world.dead).toBe(false);
    expect(world.player.x).toBe(flag.x * TILE);
    expect(world.pending.filter((d) => d.x < flag.x).every((d) => d.spawned)).toBe(true);
    expect(world.camera.x).toBeGreaterThan(0);
  });
});
