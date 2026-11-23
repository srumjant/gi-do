import { afterEach, describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { courseLevel, joinSections, parseCourse } from '../src/data/course';
import { DEMO_COURSE as COURSE_LEVEL } from './helpers/demoCourse';
import {
  TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_PLANK, TILE_RAINBOW, TILE_SPRING, isSolid,
} from '../src/data/levels';
import {
  LIFT_FRAMES, MIN_STATION_ARROWS, PLANK_INTERVAL, SPRING_FORCE, STATION_COOLDOWN, VENT_REACH,
  VENT_WARN_FRAMES, ventWarning,
} from '../src/game/course';
import { chickenify, spawnEnemy } from '../src/game/enemy';
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

  it('reads a rainbow block and the cat', () => {
    const { map, cat } = parseCourse(['P..@..!...R', '###########']);
    expect(map[0][6]).toBe(TILE_RAINBOW);
    expect(cat).toBe(3);
  });

  it('reads a boss, its target spots in number order, and a walk between its door and its cage', () => {
    const { course, map } = parseCourse([
      'P..........2.............',
      '...:.......1...Q....3.R..',
      '#########################',
    ]);
    const b = course.boss!;
    expect(b.kind).toBe('dollQueen');
    expect([b.x, b.y]).toEqual([15, 2]);
    expect(b.spots).toEqual([{ x: 11, y: 1 }, { x: 11, y: 0 }, { x: 20, y: 1 }]);
    expect(b.patrol).toEqual([7, 19]);
    expect(course.doors).toEqual([{ x: 3, cells: [{ x: 3, y: 1 }] }]);
    expect(map[1][3]).toBe(TILE_EMPTY);
  });

  const GROUP = [
    'P....T....t.........R',
    '..................|..',
    '..................|..',
    '#####################',
  ];

  it('lets a lower-case t help the nearest T: their gate opens only once both are hit', () => {
    expect(parseCourse(GROUP).course.targets.map((t) => t.partOf ?? null)).toEqual([null, 0]);
    const world = quietWorld(courseLevel({ name: 'group', theme: 0, sections: [GROUP] }));
    const [big, small] = world.course!.targets;
    world.arrows.push({ x: big.box.x - 8, y: big.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 60);
    expect(world.map[2][18]).toBe(TILE_GATE);
    world.arrows.push({ x: small.box.x - 8, y: small.box.y + 10, vx: 6, life: 60, isChicken: false });
    step(world, {}, 60);
    expect(world.map[2][18]).toBe(TILE_EMPTY);
  });

  it('shuts a door behind the player once they are through it, and not before', () => {
    const rows = ['P.....:.......R', '......:........', '###############'];
    const world = quietWorld(courseLevel({ name: 'door', theme: 0, sections: [rows] }));
    standAt(world, 4, 2);
    step(world);
    expect(world.map[0][6]).toBe(TILE_EMPTY);
    standAt(world, 8, 2);
    step(world);
    expect([world.map[0][6], world.map[1][6]]).toEqual([TILE_GATE, TILE_GATE]);
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

  it('becomes a chicken at his feet, not up at his head', () => {
    const world = quietCourse();
    const e = giant(world);
    const feet = e.y + e.h;
    const middle = e.x + e.w / 2;
    world.arrows.push({ x: e.x - 6, y: e.y + 20, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(feet - (e.y + e.h)).toBeLessThan(4);
    expect(Math.abs(e.x + e.w / 2 - middle)).toBeLessThan(4);
  });

  it('bounces a stomp off, and never hurts (Palermo, 2026-11-23: landing on him used to)', () => {
    // Out in the open, where the demo's corridor roof is not in the way of the landing.
    const open = courseLevel({
      name: 'open giant',
      theme: 3,
      sections: [['P'.padEnd(39, '.') + 'R', ...Array.from({ length: 5 }, () => '.'.repeat(40)), '.'.repeat(14) + 'g'.padEnd(26, '.'), '#'.repeat(40), '#'.repeat(40)]],
    });
    const world = quietWorld(open);
    const e = spawnEnemy(world.map, world.dc, open.enemyDefs[0])!;
    world.enemies.push(e);
    const p = world.player;
    p.hasCape = false;
    p.invincible = 0;
    p.x = e.x + e.w / 2 - p.w / 2;
    p.y = e.y - p.h + 3;
    p.vy = 4;
    p.onGround = false;
    step(world);
    expect(world.dead).toBe(false);
    expect(p.vy).toBeLessThan(0);
    expect(e.type).toBe('giant');
  });

  it('pushes a hero walking into him back out, unhurt, from either side', () => {
    for (const fromLeft of [true, false]) {
      const world = quietCourse();
      const e = giant(world);
      const p = world.player;
      p.hasCape = false;
      p.invincible = 0;
      p.x = fromLeft ? e.x - p.w + 3 : e.x + e.w - 3;
      p.y = e.y + e.h - p.h;
      p.onGround = true;
      step(world, fromLeft ? { right: true } : { left: true });
      expect({ fromLeft, dead: world.dead, out: p.x + p.w <= e.x || p.x >= e.x + e.w })
        .toEqual({ fromLeft, dead: false, out: true });
    }
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

describe('ice and icy water (Winter, 2026-11-23)', () => {
  /** A floor of snow (`#`) or of ice (`I`), 60 wide, the hero at its start. */
  function floor(top: string): World {
    const level = courseLevel({
      name: 'rink',
      theme: 4,
      sections: [['P'.padEnd(59, '.') + 'R', '.'.repeat(60), '.'.repeat(60), top.repeat(60), '#'.repeat(60)]],
    });
    const world = quietWorld(level);
    standAt(world, 2, 3);
    return world;
  }

  /** Frames to full speed from standing, and how far the hero slides once they let go. */
  function grip(top: string): { frames: number; slide: number } {
    const world = floor(top);
    const p = world.player;
    let frames = 0;
    while (p.vx < world.dc.playerSpeed && frames < 200) {
      step(world, { right: true });
      frames++;
    }
    step(world, { right: true }, 10);
    const x0 = p.x;
    step(world, {}, 200);
    return { frames, slide: p.x - x0 };
  }

  it('makes a floor of ice slow to speed up on, and slide for tiles when the hero lets go', () => {
    const snow = grip('#');
    const ice = grip('I');
    expect(ice.frames).toBeGreaterThan(snow.frames * 2);
    expect(ice.slide).toBeGreaterThan(snow.slide + 2 * TILE);
    expect(ice.slide).toBeLessThan(8 * TILE);
  });

  it('jumps off ice as high as off snow', () => {
    const top = (t: string) => {
      const world = floor(t);
      let y = world.player.y;
      step(world, { jump: true, jumpPressed: true });
      for (let i = 0; i < 60; i++) {
        step(world, { jump: true });
        y = Math.min(y, world.player.y);
      }
      return y;
    };
    expect(top('I')).toBe(top('#'));
  });

  it('is a fall into icy water: the cape throws the hero out once, without it a life is gone', () => {
    const lake = courseLevel({
      name: 'lake',
      theme: 4,
      sections: [['P'.padEnd(29, '.') + 'R', '.'.repeat(30), '.'.repeat(30), '#'.repeat(10) + '_'.repeat(10) + '#'.repeat(10), '#'.repeat(10) + '_'.repeat(10) + '#'.repeat(10)]],
    });
    for (const cape of [true, false]) {
      const world = quietWorld(lake);
      standAt(world, 14, 2);
      world.player.hasCape = cape;
      world.player.invincible = 0;
      let deepest = 0;
      for (let i = 0; i < 30; i++) {
        step(world);
        deepest = Math.max(deepest, world.player.y + world.player.h);
      }
      expect({ cape, dead: world.dead, capeLeft: world.player.hasCape }).toEqual({ cape, dead: !cape, capeLeft: false });
      // Caught at the surface, not fallen out through the bottom of the level as from a pit.
      expect(deepest).toBeLessThan(5 * TILE);
      expect(world.course!.fx.some((f) => f.kind === 'splash')).toBe(true);
    }
  });
});

describe('chickens', () => {
  /** A zombie from the course, rayed into a chicken, with the hero at its side. */
  function rayedZombie(world: World) {
    const def = COURSE_LEVEL.enemyDefs.find((d) => d.zombie)!;
    const e = spawnEnemy(world.map, world.dc, def)!;
    world.enemies.push(e);
    world.arrows.push({ x: e.x - 6, y: e.y + 8, vx: 6, life: 60, isChicken: true });
    step(world);
    // Smaller than the zombie was, it drops to the floor first.
    step(world, {}, 10);
    return e;
  }

  it('never hurt on a hand-built level: a zombie rayed into a chicken is harmless', () => {
    // Palermo (2026-11-23): a chicken hurt like any enemy, so a ray made a harmless zombie
    // dangerous.
    const world = quietCourse();
    const e = rayedZombie(world);
    expect(e.type).toBe('chicken');
    const p = world.player;
    p.hasCape = false;
    p.invincible = 0;
    for (const dx of [-p.w + 4, e.w - 4]) {
      p.x = e.x + dx;
      p.y = e.y + e.h - p.h;
      p.vy = 0;
      p.onGround = true;
      step(world, {}, 20);
      expect({ dx, dead: world.dead }).toEqual({ dx, dead: false });
    }
  });

  it('still pop under a stomp, for points', () => {
    const world = quietCourse();
    const e = rayedZombie(world);
    const p = world.player;
    const score = world.score;
    p.x = e.x + e.w / 2 - p.w / 2;
    p.y = e.y - p.h + 3;
    p.vy = 4;
    p.onGround = false;
    step(world);
    expect(e.alive).toBe(false);
    expect(world.score).toBeGreaterThan(score);
  });

  it('still hurt on the six original levels', () => {
    const world = createWorld(0, 'super_easy');
    for (const d of world.pending) d.spawned = true;
    const e = spawnEnemy(world.map, world.dc, { type: 'doll', x: 8 })!;
    world.enemies.push(e);
    chickenify(e);
    step(world, {}, 10);
    const p = world.player;
    p.hasCape = false;
    p.invincible = 0;
    p.x = e.x + e.w / 2 - p.w / 2;
    p.y = e.y + e.h - p.h;
    p.vy = 0;
    step(world);
    expect(world.dead).toBe(true);
  });
});

describe('zombies', () => {
  function zombieAhead(world: World) {
    const def = COURSE_LEVEL.enemyDefs.find((d) => d.zombie)!;
    const e = spawnEnemy(world.map, world.dc, def)!;
    world.enemies.push(e);
    return e;
  }

  it('push the player back without hurting, even mid-blink after a cape', () => {
    const world = quietCourse();
    const e = zombieAhead(world);
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
    const e = zombieAhead(world);
    world.arrows.push({ x: e.x - 6, y: e.y + 8, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(e.alive).toBe(false);
  });

  it('shuffle after a hero they can see, and groan once when they first do', () => {
    const world = quietCourse();
    const e = zombieAhead(world);
    standAt(world, Math.floor(e.x / TILE) - 5, 23);
    world.player.invincible = 9999;
    const x0 = e.x;
    let groans = 0;
    for (let i = 0; i < 40; i++) {
      step(world);
      groans += world.sounds.filter((s) => s === 'groan').length;
    }
    expect(e.x).toBeLessThan(x0);
    expect(groans).toBe(1);
  });

  it('leave a hero out of sight alone', () => {
    const world = quietCourse();
    const e = zombieAhead(world);
    standAt(world, Math.floor(e.x / TILE) - 20, 23);
    step(world, {}, 5);
    expect(e.noticed).toBeFalsy();
  });

  it('never hurt a hero with a big head either, however close', () => {
    // Found in the browser (2026-11-22): the big head widens the hero's hit box, so a zombie
    // just short of the push's reach was taken for an ordinary enemy, and killed them.
    const world = quietCourse();
    const e = zombieAhead(world);
    const p = world.player;
    p.hasCape = false;
    p.invincible = 0;
    p.bigHeadTimer = 600;
    standAt(world, 0, 23);
    p.x = e.x - p.w - 4; // inside the big head's reach, outside the body's
    step(world);
    expect(world.dead).toBe(false);
  });

  it('never push the hero into a wall: pinned against one, the hero holds the zombie back', () => {
    // Found in the browser (2026-11-22): a zombie knight shoved the hero into a tower's door,
    // and the hero fell through the floor.
    const rows = ['P'.padEnd(39, '.') + 'R', '.....B'.padEnd(40, '.'), '.....B'.padEnd(40, '.')];
    rows.push('.....B' + '..K'.padEnd(34, '.'));
    rows.push('#'.repeat(40), '#'.repeat(40));
    const wall = courseLevel({ name: 'wall', theme: 2, sections: [rows] });
    const world = createWorld(0, 'super_easy', 'gigi', undefined, wall);
    standAt(world, 6, 4);
    world.player.invincible = 9999;
    const p = world.player;
    let leftmost = p.x;
    for (let i = 0; i < 180; i++) {
      step(world, { right: i % 40 < 20 });
      leftmost = Math.min(leftmost, p.x);
    }
    // The tests' mover puts a hero back out of a wall; Arcade, in the game, dropped them
    // through the floor. So not even for a step may the push put them in it.
    expect(world.dead).toBe(false);
    expect(leftmost).toBeGreaterThanOrEqual(6 * TILE);
    expect(p.y + p.h).toBe(4 * TILE);
  });

  it('come as toy soldiers too (Toy Castle\'s L): pushing, shuffling after the hero, down to an arrow', () => {
    const soldiers = courseLevel({
      name: 'soldiers',
      theme: 5,
      sections: [['P'.padEnd(39, '.') + 'R', '.'.repeat(40), '.'.repeat(14) + 'L'.padEnd(26, '.'), '#'.repeat(40), '#'.repeat(40)]],
    });
    expect(soldiers.enemyDefs).toEqual([{ type: 'soldier', x: 14, floorRow: 3, zombie: true }]);
    const world = createWorld(0, 'super_easy', 'gigi', undefined, soldiers);
    standAt(world, 9, 3);
    world.player.invincible = 9999;
    step(world, {}, 30);
    const e = world.enemies.find((z) => z.type === 'soldier')!;
    expect(e.zombie).toBe(true);
    expect(e.x).toBeLessThan(14 * TILE);
    world.player.x = e.x - world.player.w + 2;
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(e.x);
    world.arrows.push({ x: e.x - 6, y: e.y + 6, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(e.alive).toBe(false);
  });

  it('come as penguins too (Winter\'s W): pushing, shuffling after the hero, down to an arrow', () => {
    const waddlers = courseLevel({
      name: 'waddlers',
      theme: 4,
      sections: [['P'.padEnd(39, '.') + 'R', '.'.repeat(40), '.'.repeat(14) + 'W'.padEnd(26, '.'), '#'.repeat(40), '#'.repeat(40)]],
    });
    expect(waddlers.enemyDefs).toEqual([{ type: 'penguin', x: 14, floorRow: 3, zombie: true }]);
    const world = createWorld(0, 'super_easy', 'gigi', undefined, waddlers);
    standAt(world, 9, 3);
    world.player.invincible = 9999;
    step(world, {}, 30);
    const e = world.enemies.find((z) => z.type === 'penguin')!;
    expect(e.zombie).toBe(true);
    expect(e.x).toBeLessThan(14 * TILE);
    world.player.x = e.x - world.player.w + 2;
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(e.x);
    world.arrows.push({ x: e.x - 6, y: e.y + 6, vx: 6, life: 60, isChicken: false });
    step(world);
    expect(e.alive).toBe(false);
  });

  it('come as cooks too (Palermo\'s Z): pushing, and a ray makes a harmless chicken of one', () => {
    const cooks = courseLevel({
      name: 'cooks',
      theme: 3,
      sections: [['P'.padEnd(39, '.') + 'R', '.'.repeat(40), '.'.repeat(14) + 'Z'.padEnd(26, '.'), '#'.repeat(40), '#'.repeat(40)]],
    });
    expect(cooks.enemyDefs).toEqual([{ type: 'cook', x: 14, floorRow: 3, zombie: true }]);
    const world = createWorld(0, 'super_easy', 'gigi', undefined, cooks);
    standAt(world, 9, 3);
    world.player.invincible = 9999;
    step(world, {}, 30);
    const e = world.enemies.find((z) => z.type === 'cook')!;
    expect(e.zombie).toBe(true);
    world.player.x = e.x - world.player.w + 2;
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(e.x);
    world.arrows.push({ x: e.x - 6, y: e.y + 8, vx: 6, life: 60, isChicken: true });
    step(world);
    expect(e.type).toBe('chicken');
    expect(e.zombie).toBe(false);
  });

  it('come as knights too (Tallinn\'s K): pushing, shuffling after the hero, down to an arrow', () => {
    const knights = courseLevel({
      name: 'knights',
      theme: 2,
      sections: [['P'.padEnd(39, '.') + 'R', '.'.repeat(40), '.'.repeat(14) + 'K'.padEnd(26, '.'), '#'.repeat(40), '#'.repeat(40)]],
    });
    expect(knights.enemyDefs).toEqual([{ type: 'knight', x: 14, floorRow: 3, zombie: true }]);
    const world = createWorld(0, 'super_easy', 'gigi', undefined, knights);
    standAt(world, 9, 3);
    world.player.invincible = 9999;
    step(world, {}, 30);
    const e = world.enemies.find((z) => z.type === 'knight')!;
    expect(e.zombie).toBe(true);
    expect(e.x).toBeLessThan(14 * TILE);
    world.player.x = e.x - world.player.w + 2;
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.x + world.player.w).toBeLessThanOrEqual(e.x);
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

describe('a chase ending', () => {
  const CHASE = ['P..........R...', '###############'];
  const level = courseLevel({ name: 'chase', theme: 0, ending: 'chase', villain: 'dollQueen', sections: [CHASE] });

  it('ends the level as the hero gets close, without touching anyone', () => {
    const world = quietWorld(level);
    standAt(world, 2, 1);
    step(world);
    expect(world.won).toBe(false);
    standAt(world, 8, 1);
    step(world);
    expect(world.won).toBe(true);
  });
});

describe('lava and vents', () => {
  const POOL = [
    'P............R',
    '..............',
    '###~~v~~~v~###',
    '##############',
  ];
  const level = courseLevel({ name: 'pool', theme: 1, sections: [POOL] });

  it('throws a hero with a cape up out of the lava, and spends the cape', () => {
    const world = quietWorld(level);
    world.player.hasCape = true;
    standAt(world, 4, 3);
    step(world);
    expect(world.dead).toBe(false);
    expect(world.player.hasCape).toBe(false);
    expect(world.player.vy).toBeLessThan(0);
    expect(world.player.y + world.player.h).toBeLessThanOrEqual(2 * TILE);
  });

  it('is the end of a life without a cape', () => {
    const world = quietWorld(level);
    world.player.hasCape = false;
    standAt(world, 4, 3);
    step(world);
    expect(world.dead).toBe(true);
  });

  it('warns before a vent erupts, then sends a fireball straight up', () => {
    const world = quietWorld(level);
    const vent = world.course!.vents[0];
    vent.timer = VENT_WARN_FRAMES + 1;
    step(world);
    expect(ventWarning(vent)).toBe(true);
    expect(world.enemyProjectiles).toHaveLength(0);
    step(world, {}, VENT_WARN_FRAMES);
    const shot = world.enemyProjectiles[0];
    expect(shot.vx).toBe(0);
    expect(shot.vy).toBeLessThan(0);
  });

  it('starts its vents out of step with each other', () => {
    const [a, b] = quietWorld(level).course!.vents;
    expect(a.timer).not.toBe(b.timer);
  });

  it('keeps a vent far from the hero quiet', () => {
    const wide = courseLevel({
      name: 'wide pool',
      theme: 1,
      sections: [['P'.padEnd(59, '.') + 'R', '.'.repeat(60), '##~v~'.padEnd(60, '#'), '#'.repeat(60)]],
    });
    const world = quietWorld(wide);
    const vent = world.course!.vents[0];
    standAt(world, 3 + VENT_REACH / TILE + 4, 2);
    vent.timer = 1;
    const sounds: string[] = [];
    for (let i = 0; i < 5; i++) {
      step(world);
      sounds.push(...world.sounds);
    }
    expect(world.dead).toBe(false);
    expect(world.enemyProjectiles).toHaveLength(0);
    expect(sounds).not.toContain('cannon-fire');
  });
});
