// The boss fight (index.html:1194-1208 for the spawn, :1550-1626 for the fight itself),
// plus the projectile system it shares with the cannon and the rescue gate it exists to
// hold shut.
//
// The comparison at the bottom of this file is the strongest gate in it: the boss is one
// of the things Arcade never touched (Plan 7's "explicitly NOT bodied" list names it), so
// unlike the player it can still be driven frame for frame against the real index.html
// and diffed to the decimal. The rest of the file is about the moments that comparison
// cannot reach without a very long script — a roar at a specific hit point, a chicken ray
// bouncing off, the rescue opening.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS, DIFFICULTY_CONFIG, type DifficultyKey } from '../src/config/difficulty';
import { LEVELS } from '../src/data/levels';
import { BOSS_IDLE } from '../src/data/sprites';
import { BOSS_SCALE, stepBoss } from '../src/game/boss';
import { stepEnemy } from '../src/game/enemy';
import { getRescueSprites } from '../src/game/run';
import { findGroundY } from '../src/game/tiles';
import {
  checkRescue, createWorld, respawnLevel, stepEnemyProjectiles,
} from '../src/game/world';
import type { EnemyState, World } from '../src/game/types';
import { driveLiveGame } from './helpers/liveGame';

/** Level 6 — the only one with a boss. Its index, not its number. */
const FINAL = LEVELS.length - 1;

function bossWorld(difficulty: DifficultyKey = 'normal'): World {
  const world = createWorld(FINAL, difficulty, 'gigi');
  // Parked well to the left of the arena and out of everything's way, so nothing below
  // is accidentally a collision test. Every test that wants contact moves them back.
  world.player.x = 0;
  world.player.y = 0;
  return world;
}

/**
 * Puts the player where a stomp lands and steps the fight once. `y` is chosen so that
 * `p.y + p.h - 4` is comfortably above the boss's midline, which is what the live stomp
 * test compares (index.html:1602).
 */
function stomp(world: World): void {
  const b = world.boss!;
  world.player.x = b.x + 16;
  world.player.y = b.y - 14;
  world.player.vy = 2;
  world.player.invincible = 0;
  stepBoss(world);
}

/** Frames enough to clear a roar (50) and the cooldown it opens behind it (120). */
function waitOutTheRoar(world: World): void {
  const parkedX = world.player.x;
  const parkedY = world.player.y;
  world.player.x = 0;
  world.player.y = 0;
  for (let i = 0; i < 180; i++) stepBoss(world);
  world.player.x = parkedX;
  world.player.y = parkedY;
}

describe('the boss spawn', () => {
  it('exists on the final level and on no other', () => {
    const bosses = LEVELS.map((_, i) => createWorld(i, 'normal').boss);
    expect(bosses.map((b) => b !== null)).toEqual([false, false, false, false, false, true]);
  });

  it('stands six tiles left of the rescue, sized from BOSS_IDLE at scale 4', () => {
    const world = bossWorld();
    const b = world.boss!;
    const tx = LEVELS[FINAL].rescuePos[0] - 6;
    expect(b.x).toBe(tx * TILE);
    expect(b.w).toBe(BOSS_IDLE[0].length * BOSS_SCALE);
    expect(b.h).toBe(BOSS_IDLE.length * BOSS_SCALE);
    // Standing on whatever findGroundY finds in that column — on level 6 the platform at
    // [147,14,4], not the floor, which is why this is derived rather than a literal.
    expect(b.y).toBe(findGroundY(world.map, tx) - b.h);
  });

  /**
   * The one assertion that covers the whole difficulty dial. There is no `bossHp` field
   * anywhere: the live line steps `dc.enemySpeed` through four `<=` thresholds
   * (index.html:1202), so the boss gets harder because the ENEMIES got faster.
   */
  it('scales its health with difficulty, 5 / 7 / 10 / 14', () => {
    const hp = DIFF_KEYS.map((key) => createWorld(FINAL, key).boss!.hp);
    expect(hp).toEqual([5, 7, 10, 14]);
    // maxHp is seeded from the same number, which is what the health bar divides by.
    const maxHp = DIFF_KEYS.map((key) => createWorld(FINAL, key).boss!.maxHp);
    expect(maxHp).toEqual(hp);
  });

  it('fires a fifth slower than the cannon does on the same difficulty', () => {
    for (const key of DIFF_KEYS) {
      const world = createWorld(FINAL, key);
      expect(world.boss!.shootInterval, key)
        .toBe(DIFFICULTY_CONFIG[key].enemyShootInterval * 1.2);
    }
  });

  it('comes back at full health after a death', () => {
    const world = bossWorld();
    stomp(world);
    expect(world.boss!.hp).toBe(9);

    respawnLevel(world);

    // index.html:1196-1208 — `initLevel` IS the respawn path, and it rebuilds the boss
    // unconditionally. Losing a life really does undo every hit you had landed.
    expect(world.boss!.hp).toBe(10);
    expect(world.bossDefeated).toBe(false);
  });
});

describe('stomping the boss', () => {
  it('takes one hit point and throws the player higher than an enemy does', () => {
    const world = bossWorld();
    stomp(world);
    expect(world.boss!.hp).toBe(9);
    expect(world.boss!.hurtTimer).toBe(20);
    // index.html:1604's `p.vy=-7`, against index.html:1545's `p.vy=-5` for an ordinary
    // enemy. Both are asserted here rather than only the boss's, because the whole point
    // is that they are NOT the same number and a port that copied the enemy path would
    // pass a test that only looked at one of them.
    expect(world.player.vy).toBe(-7);

    const enemyWorld = bossWorld();
    const doll = enemyAt(enemyWorld, 400, 300);
    enemyWorld.enemies.push(doll);
    enemyWorld.player.x = doll.x + 2;
    enemyWorld.player.y = doll.y - 14;
    enemyWorld.player.vy = 2;
    stepEnemy(enemyWorld, doll);
    expect(enemyWorld.player.vy).toBe(-5);
  });

  it('pays 100 points at the difficulty\'s multiplier', () => {
    const world = bossWorld('hard'); // multiplier 1.5
    const before = world.score;
    stomp(world);
    expect(world.score - before).toBe(150);
  });

  it('is a hit, not a hug: side contact goes through playerHit', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.player.x = b.x + 16;
    world.player.y = b.y + 40; // well below the midline, so not a stomp
    world.player.vy = 0;
    world.player.hasCape = false;

    stepBoss(world);

    expect(b.hp).toBe(10); // unhurt
    expect(world.dead).toBe(true);
    expect(world.sounds).toContain('hurt');
  });

  it('lets a cape absorb that contact, exactly as it absorbs an enemy\'s', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.player.x = b.x + 16;
    world.player.y = b.y + 40;
    world.player.vy = 0;
    world.player.hasCape = true;

    stepBoss(world);

    expect(world.dead).toBe(false);
    expect(world.player.hasCape).toBe(false);
    expect(world.player.invincible).toBe(60);
    expect(world.sounds).toContain('cape');
  });

  /**
   * A big head widens the stomp window against every ENEMY in the game, by compounding
   * `dc.stompHitbox` with a further 1.5 (enemy.ts, index.html:1542). The boss branch does
   * not: index.html:1601 reads `dc.stompHitbox||1` and stops there. So the one power-up
   * that makes the rest of the game easier does nothing at all here.
   */
  it('ignores a big head, unlike every ordinary enemy', () => {
    const world = bossWorld();
    const b = world.boss!;
    // Feet at 190: past the plain midline (144 + 40 = 184), inside where a 1.5x window
    // would reach (144 + 60 = 204).
    world.player.x = b.x + 16;
    world.player.y = 190 - world.player.h + 4;
    world.player.vy = 2;
    world.player.bigHeadTimer = 600;
    world.player.hasCape = true; // survive the hit this is expected to be

    stepBoss(world);

    expect(b.hp).toBe(10);
    expect(world.player.hasCape).toBe(false); // it was a hit, not a stomp
  });

  it('does honour super_easy\'s stompHitbox, which is a different field', () => {
    const world = bossWorld('super_easy'); // stompHitbox 2.0 -> the whole boss counts
    const b = world.boss!;
    world.player.x = b.x + 16;
    world.player.y = 190 - world.player.h + 4;
    world.player.vy = 2;

    stepBoss(world);

    expect(b.hp).toBe(4); // 5 - 1
  });
});

describe('arrows against the boss', () => {
  it('an ordinary arrow takes a hit point', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.arrows.push({ x: b.x + 20, y: b.y + 30, vx: 6, life: 60, isChicken: false });

    stepBoss(world);

    expect(b.hp).toBe(9);
    expect(b.hurtTimer).toBe(15); // not the stomp's 20
    expect(world.arrows[0].life).toBe(0);
    expect(world.sounds).toContain('stomp');
  });

  /**
   * The asymmetry the fight is built on. A chicken ray is the strongest thing in the
   * game against an ordinary enemy — one hit and it is a chicken — and against the boss
   * it is worth nothing at all: it is spent, it makes a noise, it leaves an 8-frame
   * flash, and the health bar does not move (index.html:1620).
   */
  it('a chicken ray bounces off with a cluck and does no damage', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.arrows.push({ x: b.x + 20, y: b.y + 30, vx: 6, life: 60, isChicken: true });
    const before = world.score;

    stepBoss(world);

    expect(b.hp).toBe(10);
    expect(b.hurtTimer).toBe(8); // the shortest of the three flashes
    expect(world.arrows[0].life).toBe(0); // spent all the same
    expect(world.score).toBe(before); // and worth nothing
    expect(world.sounds).toEqual(['cluck']);
  });
});

describe('the roar', () => {
  /**
   * Exactly two roars per fight, at exactly `floor(maxHp*0.5)` and `floor(maxHp*0.25)`,
   * on every difficulty. Equality, not a threshold crossing (index.html:1608) — which is
   * only safe because HP never falls by more than one at a time.
   */
  it('fires at the two hit points the live game names, on all four difficulties', () => {
    const expected: Record<DifficultyKey, number[]> = {
      super_easy: [2, 1],
      easy: [3, 1],
      normal: [5, 2],
      hard: [7, 3],
    };
    const seen: Partial<Record<DifficultyKey, number[]>> = {};

    for (const key of DIFF_KEYS) {
      const world = bossWorld(key);
      const roars: number[] = [];
      // Stomp the whole fight out, leaving room between hits for the 50-frame roar and
      // the 120-frame cooldown behind it — otherwise the cooldown would swallow the
      // second roar and the test would be measuring the wrong thing.
      while (world.boss!.alive) {
        // Cleared by hand: `stepWorld` empties this at the top of every step, and these
        // tests drive `stepBoss` directly, so without it the first roar would still be
        // in the list on every stomp that followed it.
        world.sounds.length = 0;
        stomp(world);
        if (world.sounds.includes('boss-roar')) roars.push(world.boss!.hp);
        waitOutTheRoar(world);
      }
      seen[key] = roars;
    }

    expect(seen).toEqual(expected);
  });

  it('freezes the boss where it stands for fifty frames', () => {
    const world = bossWorld();
    world.boss!.hp = 6; // one stomp from normal's first threshold of 5
    stomp(world);
    expect(world.boss!.roarTimer).toBe(50);
    expect(world.boss!.roarCooldown).toBe(120);

    const b = world.boss!;
    const x = b.x;
    world.player.x = 0; // out of the way, so only the roar decides what happens
    world.player.y = 0;
    for (let i = 0; i < 40; i++) stepBoss(world);
    expect(b.x).toBe(x); // not one pixel, in forty frames
    expect(b.vx).toBe(0);
  });

  it('does not fire on the killing blow', () => {
    const world = bossWorld();
    world.boss!.hp = 1;
    stomp(world);
    // `b.hp > 0` guards the roar (index.html:1608), so the boss goes down quietly except
    // for the fanfare.
    expect(world.sounds).not.toContain('boss-roar');
    expect(world.sounds).toContain('win');
  });
});

describe('defeat', () => {
  it('pays a thousand points at the multiplier and sets bossDefeated', () => {
    const world = bossWorld('hard'); // multiplier 1.5
    world.boss!.hp = 1;
    const before = world.score;

    stomp(world);

    expect(world.boss!.alive).toBe(false);
    expect(world.bossDefeated).toBe(true);
    // 150 for the stomp itself and 1500 for the kill, each rounded at its own award site.
    expect(world.score - before).toBe(150 + 1500);
  });

  it('stops the fight: a dead boss neither moves nor shoots', () => {
    const world = bossWorld();
    world.boss!.hp = 1;
    stomp(world);
    const b = world.boss!;
    const { x, shootTimer } = b;

    world.player.x = 0;
    world.player.y = 0;
    for (let i = 0; i < 200; i++) stepBoss(world);

    expect(b.x).toBe(x);
    expect(b.shootTimer).toBe(shootTimer);
    expect(world.enemyProjectiles).toEqual([]);
  });
});

describe('the arena', () => {
  it('clamps the boss to ten tiles around the rescue and never integrates its y', () => {
    const world = bossWorld();
    const b = world.boss!;
    const y = b.y;
    const min = (LEVELS[FINAL].rescuePos[0] - 8) * TILE;
    const max = (LEVELS[FINAL].rescuePos[0] + 2) * TILE;

    // Shoved far outside on both sides, it is back inside on the very next step.
    b.x = min - 500;
    stepBoss(world);
    expect(b.x).toBeGreaterThanOrEqual(min);

    b.x = max + 500;
    stepBoss(world);
    expect(b.x).toBeLessThanOrEqual(max);

    // Six hundred frames of pacing and charging, and it has not fallen a single pixel:
    // there is no gravity on it and no tile under it (bug-compatibility item 1).
    for (let i = 0; i < 600; i++) {
      stepBoss(world);
      expect(b.x).toBeGreaterThanOrEqual(min);
      expect(b.x).toBeLessThanOrEqual(max);
    }
    expect(b.y).toBe(y);
  });
});

describe('fireballs', () => {
  it('leave in pairs, on two different straight lines', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.player.x = b.x + 400; // to the right, so the volley goes right
    b.shootTimer = b.shootInterval - 1;

    stepBoss(world);

    expect(world.enemyProjectiles).toHaveLength(2);
    const [flat, steep] = world.enemyProjectiles;
    // index.html:1570-1571. Same origin, everything else different.
    expect(flat.x).toBe(steep.x);
    expect(flat.y).toBe(steep.y);
    expect([flat.vx, flat.vy, flat.life]).toEqual([2.5, -1, 120]);
    expect([steep.vx, steep.vy, steep.life]).toEqual([2, -2, 100]);
    expect(world.sounds).toContain('boss-fire');
  });

  it('aims away from the boss\'s centre, so it can fire left', () => {
    const world = bossWorld();
    const b = world.boss!;
    world.player.x = b.x - 400;
    b.shootTimer = b.shootInterval - 1;

    stepBoss(world);

    expect(world.enemyProjectiles.map((p) => p.vx)).toEqual([-2.5, -2]);
  });

  /**
   * Bug-compatibility item 4, and the reason these are not Arcade bodies: `vy` is
   * constant for the whole flight. Under gravity the pair would converge into two arcs
   * and fall; here they diverge forever in two straight lines.
   */
  it('never accelerate — vy is the same on the last frame as on the first', () => {
    const world = bossWorld();
    world.enemyProjectiles.push({ x: 100, y: 200, vx: 2.5, vy: -1, life: 40 });
    const shot = world.enemyProjectiles[0];

    for (let n = 1; n <= 20; n++) {
      stepEnemyProjectiles(world);
      expect(shot.vy).toBe(-1);
      expect(shot.x).toBeCloseTo(100 + n * 2.5, 10);
      expect(shot.y).toBeCloseTo(200 - n * 1, 10);
    }
  });

  it('expire when their life runs out', () => {
    const world = bossWorld();
    world.enemyProjectiles.push({ x: 100, y: 200, vx: 2.5, vy: -1, life: 3 });

    stepEnemyProjectiles(world);
    stepEnemyProjectiles(world);
    expect(world.enemyProjectiles).toHaveLength(1);
    stepEnemyProjectiles(world);
    expect(world.enemyProjectiles).toHaveLength(0);
  });

  it('stop dead against a solid tile', () => {
    const world = bossWorld();
    // The bottom two rows of every level are ground (makeGround), so anything down there
    // is inside a wall.
    const insideTheFloor = (LEVELS[FINAL].height - 1) * TILE + 4;
    world.enemyProjectiles.push({ x: 800, y: insideTheFloor, vx: 2.5, vy: 0, life: 120 });

    stepEnemyProjectiles(world);

    expect(world.enemyProjectiles).toHaveLength(0);
  });

  it('hurt the player through the same path a contact hit uses', () => {
    const world = bossWorld();
    world.player.x = 800;
    world.player.y = 200;
    world.player.hasCape = true;
    world.enemyProjectiles.push({
      x: world.player.x + 4, y: world.player.y + 4, vx: 0, vy: 0, life: 120,
    });

    stepEnemyProjectiles(world);

    expect(world.player.hasCape).toBe(false);
    expect(world.sounds).toContain('cape');
    expect(world.enemyProjectiles).toHaveLength(0); // spent on the hit
  });

  it('can be shot out of the air, spending the arrow and paying fifty', () => {
    const world = bossWorld();
    world.player.x = 0;
    world.player.y = 0;
    world.arrows.push({ x: 800, y: 200, vx: 6, life: 60, isChicken: false });
    world.enemyProjectiles.push({ x: 802, y: 198, vx: -2.5, vy: 0, life: 120 });
    const before = world.score;

    stepEnemyProjectiles(world);

    expect(world.enemyProjectiles).toHaveLength(0);
    expect(world.arrows[0].life).toBe(0); // a trade, not a free parry
    expect(world.score - before).toBe(50); // normal's multiplier is 1.0
    // index.html:1554 spawns particles and nothing else — there is no sound for this.
    expect(world.sounds).toEqual([]);
  });
});

describe('the rescue gate', () => {
  /** The rescue box, derived exactly as checkRescue derives it (index.html:1629). */
  function standAtTheRescue(world: World): void {
    const tx = world.level.rescuePos[0];
    world.player.x = tx * TILE;
    world.player.y = findGroundY(world.map, tx) - getRescueSprites().sprite.length * 2;
  }

  it('holds the sibling out of reach while the boss lives', () => {
    const world = bossWorld();
    standAtTheRescue(world);

    checkRescue(world);

    expect(world.won).toBe(false);
  });

  it('opens the moment the boss goes down', () => {
    const world = bossWorld();
    world.boss!.hp = 1;
    stomp(world);
    expect(world.bossDefeated).toBe(true);

    standAtTheRescue(world);
    checkRescue(world);

    expect(world.won).toBe(true);
    expect(world.stateTimer).toBe(200);
  });

  it('is no gate at all on the five levels with no boss', () => {
    const world = createWorld(0, 'normal', 'gigi');
    const tx = world.level.rescuePos[0];
    world.player.x = tx * TILE;
    world.player.y = findGroundY(world.map, tx) - getRescueSprites().sprite.length * 2;

    checkRescue(world);

    expect(world.won).toBe(true);
  });
});

describe('what the fight sounds like', () => {
  it('raises the volley, the charge, the roar and the fanfare at their own moments', () => {
    const world = bossWorld();
    const b = world.boss!;

    b.shootTimer = b.shootInterval - 1;
    stepBoss(world);
    expect(world.sounds).toEqual(['boss-fire']);

    // A charge commits once `chargeTimer` clears 180 (index.html:1580).
    world.sounds.length = 0;
    b.chargeTimer = 180;
    stepBoss(world);
    expect(world.sounds).toEqual(['boss-charge']);

    // A stomp onto the first threshold: the hit, then the roar, in that order — the live
    // source plays sfxStomp at :1605 and the roar's tones at :1610.
    world.sounds.length = 0;
    b.charging = false;
    b.roarTimer = 0;
    b.roarCooldown = 0;
    b.hp = 6;
    stomp(world);
    expect(world.sounds).toEqual(['stomp', 'boss-roar']);

    // And the last hit: the stomp and the fanfare, with no roar between them.
    world.sounds.length = 0;
    b.roarTimer = 0;
    b.hp = 1;
    stomp(world);
    expect(world.sounds).toEqual(['stomp', 'win']);
  });
});

/**
 * The gate. Four hundred frames of the real fight, against the real index.html, field by
 * field — the boss and every fireball in the air, every frame.
 *
 * This works where the equivalent player comparison no longer can because the boss was
 * never handed to Arcade: it is the same hand-rolled arithmetic on both sides, so "close
 * enough" is not required and is not accepted. The player is pinned to a fixed spot on
 * solid ground in both runs (with no input it does not move, which the test asserts
 * rather than assumes), so the only thing moving is the fight.
 */
describe('matches the live game frame for frame', () => {
  const FRAMES = 400;
  const PIN_TILE = 100;

  it('reproduces the boss and its fireballs exactly', () => {
    const world = createWorld(FINAL, 'normal', 'gigi');
    const pinX = PIN_TILE * TILE;
    const pinY = findGroundY(world.map, PIN_TILE) - world.player.h;

    const liveBoss: unknown[] = [];
    const liveShots: unknown[] = [];
    let liveMoved = false;
    driveLiveGame({
      level: FINAL,
      difficulty: 'normal',
      character: 'gigi',
      frames: FRAMES,
      // Level 6's own enemies would wander into the arena and confuse the picture; this
      // test is about the boss, and the enemies have their own file.
      suppressEnemies: true,
      input: () => ({ left: false, right: false, jump: false, fire: false }),
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = pinX;
        p.y = pinY;
        p.vx = 0;
        p.vy = 0;
      },
      onFrame: (d) => {
        const p = d.getPlayer();
        if (p.x !== pinX || p.y !== pinY) liveMoved = true;
        liveBoss.push({ ...(d.getBoss() as object) });
        liveShots.push(d.getEnemyProjectiles());
      },
    });
    // If the live player drifted, the boss would be reacting to a moving target and the
    // comparison below would be measuring something other than what it claims to.
    expect(liveMoved).toBe(false);

    world.player.x = pinX;
    world.player.y = pinY;
    world.player.vx = 0;
    world.player.vy = 0;

    let sawAVolley = false;
    for (let f = 0; f < FRAMES; f++) {
      // The live order, from index.html: the projectile pass at :1550 runs before the
      // boss pass at :1558. Called directly rather than through `stepWorld` so the
      // pinned player really is pinned and can neither fall nor die.
      stepEnemyProjectiles(world);
      stepBoss(world);
      if (world.enemyProjectiles.length > 0) sawAVolley = true;
      // Every field, including `phase` — which neither side ever reads, and which both
      // sides therefore have to be carrying for this to pass.
      expect({ ...world.boss! }, `boss diverged on frame ${f}`).toEqual(liveBoss[f]);
      expect(world.enemyProjectiles, `fireballs diverged on frame ${f}`)
        .toEqual(liveShots[f]);
    }
    // Four hundred frames at an interval of 108 is three volleys; without this the
    // fireball half of the comparison above could be two empty lists agreeing.
    expect(sawAVolley).toBe(true);
  });
});

/**
 * The three tones the fight makes, checked against the source text of index.html rather
 * than against a transcription of it.
 *
 * Every other sound in the game has a named `sfx*` function in the live source that
 * tests/sfx.test.ts can load and call. These three do not — they are bare `playTone`
 * calls sitting inside `update()` (index.html:1572, :1583, :1610), reachable only by
 * running the whole game — so the port's copy is checked the one way left: the call it
 * was copied from has to still be in the file, spelled exactly like this.
 */
describe('the boss tones are the live game\'s', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(here, '../../index.html'), 'utf8');

  const CALLS = [
    ["the fireball (index.html:1572)", "playTone(150,.2,'sawtooth',.08,80)"],
    ["the charge (index.html:1583)", "playTone(100,.3,'square',.1,60)"],
    ["the roar's first tone (index.html:1610)", "playTone(80,.5,'sawtooth',.15,50)"],
    ["the roar's second tone (index.html:1610)", "playTone(60,.4,'square',.12,40)"],
  ] as const;

  for (const [what, call] of CALLS) {
    it(`${what} is still spelled that way`, () => {
      expect(source).toContain(call);
    });
  }
});

/** A doll with the real doll's dimensions, for the stomp-height contrast above. */
function enemyAt(world: World, x: number, y: number): EnemyState {
  return {
    type: 'doll', x, y, vx: 0, vy: 0, w: 14.4, h: 16.2, alive: true,
    frame: 0, frameTimer: 0, squashTimer: 0, noGravity: true, originY: 0,
    sineOffset: 0, bounceTimer: 0, stunTimer: 0, isChicken: false,
  };
}
