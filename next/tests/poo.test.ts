import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG, setDifficulty, type DifficultyKey } from '../src/config/difficulty';
import { DEMOS } from '../src/data/demos';
import {
  BUTTON_UP, FLING_DIST, FLING_FRAMES, LID_LEFT, flyingOut, hopLift, SPIT_FLIGHT, hurtBox, buttonBox, POO_CROUCH_FRAMES, POO_SPAT_FRAMES, POO_W, restFrames, stepPoo, STINK_H, SUCK_FRAMES,
  TOILET_GAP, type PooState,
} from '../src/game/bosses/poo';
import { finishLevel, getCurrentStage, inDemo, isLastLevel, startDemo, startRun } from '../src/game/run';
import { createWorld } from '../src/game/world';
import type { World } from '../src/game/types';

function fight(difficulty: DifficultyKey = 'normal'): { world: World; b: PooState } {
  const stage = DEMOS.poo;
  const world = createWorld(stage.theme, difficulty, 'gigi', undefined, stage.level);
  const b = world.courseBoss;
  if (!b || b.kind !== 'poo') throw new Error('the bathroom has no poo');
  return { world, b };
}

/** The hero stands on the floor at `x`, still. */
function standAt(world: World, b: PooState, x: number): void {
  const p = world.player;
  p.x = x;
  p.y = b.floorY - p.h;
  p.vx = 0;
  p.vy = 0;
}

function wake(world: World, b: PooState): void {
  standAt(world, b, b.patrol[0] + 4);
  stepPoo(world, b);
}

/** Steps until his hop lands, or gives up. */
function untilPlop(world: World, b: PooState): number {
  for (let i = 0; i < 600; i++) {
    stepPoo(world, b);
    if (b.fx.some((f) => f.kind === 'plop')) return i;
    // Keep the hero well away, so nothing but the hop happens.
    standAt(world, b, b.patrol[0] - 40);
  }
  return -1;
}

describe('Härra Kaka, the poo boss', () => {
  it('sleeps until the hero comes into the bathroom, then wakes', () => {
    const { world, b } = fight();
    standAt(world, b, b.patrol[0] - 60);
    stepPoo(world, b);
    expect(b.phase).toBe('asleep');
    wake(world, b);
    expect(b.phase).toBe('hopping');
    expect(b.fx.map((f) => f.kind)).toContain('wake');
  });

  it('crouches, hops and lands with a plop that sends a low stink wave each way', () => {
    const { world, b } = fight();
    wake(world, b);
    b.fx.length = 0;
    expect(untilPlop(world, b)).toBeGreaterThan(POO_CROUCH_FRAMES);
    const waves = world.enemyProjectiles.filter((s) => s.type === 'stink');
    expect(waves).toHaveLength(2);
    expect(waves.map((w) => Math.sign(w.vx)).sort()).toEqual([-1, 1]);
    for (const w of waves) expect(w.y + STINK_H).toBe(b.floorY);
    // Low enough for every jump: the lowest, Hard's, lifts the feet 62px.
    expect(STINK_H).toBeLessThan(20);
    expect(b.y + b.h).toBe(b.floorY);
    expect(b.x).toBeGreaterThanOrEqual(b.patrol[0]);
  });

  it('hops lower and rests longer on Super Easy than on Hard', () => {
    expect(hopLift(DIFFICULTY_CONFIG.super_easy)).toBeLessThan(hopLift(DIFFICULTY_CONFIG.hard));
    expect(restFrames(DIFFICULTY_CONFIG.super_easy, 0)).toBeGreaterThan(restFrames(DIFFICULTY_CONFIG.hard, 0));
  });

  it('never starts a stink wave on top of the hero', () => {
    const { world, b } = fight('hard');
    wake(world, b);
    b.fx.length = 0;
    b.hop = 'air';
    b.vx = 0;
    b.vy = 2;
    // Landing right beside the hero: the wave on his side is not sent.
    standAt(world, b, b.x - world.player.w - 1);
    for (let i = 0; i < 40 && !b.fx.some((f) => f.kind === 'plop'); i++) stepPoo(world, b);
    const waves = world.enemyProjectiles.filter((s) => s.type === 'stink');
    expect(waves).toHaveLength(1);
    expect(waves[0].vx).toBeGreaterThan(0);
  });

  it('hurts the hero by touch, at the side and on top: nobody stomps on a poo', () => {
    for (const fromAbove of [false, true]) {
      const { world, b } = fight('normal');
      wake(world, b);
      const p = world.player;
      if (fromAbove) {
        p.x = b.x + b.w / 2 - p.w / 2;
        p.y = hurtBox(b).y - p.h + 4;
        p.vy = 3;
      } else {
        standAt(world, b, b.x + 2);
      }
      stepPoo(world, b);
      expect({ fromAbove, hurt: world.dead || world.player.invincible > 0 }).toEqual({ fromAbove, hurt: true });
      expect(b.hp).toBe(3);
    }
  });

  it('only hurts with his body: a jump clipping his box\'s empty top corner gets over him', () => {
    const { world, b } = fight('normal');
    wake(world, b);
    const p = world.player;
    // Feet just inside the top corner of his box, beside his narrow tip.
    p.x = b.x - p.w + 3;
    p.y = b.y - p.h + 3;
    p.vy = 2;
    stepPoo(world, b);
    expect(world.dead).toBe(false);
    expect(world.player.invincible).toBe(0);
  });

  it('puts the flush button on top of the tank, where every difficulty\'s jump reaches', () => {
    const { b } = fight();
    // Hard's jump lifts the feet 62px: it comes down through the button.
    expect(buttonBox(b).y).toBeGreaterThanOrEqual(b.floorY - 62);
    expect(b.floorY - BUTTON_UP).toBeGreaterThan(buttonBox(b).y);
  });

  it('keeps clear of the toilet, so it can always be reached', () => {
    const { b } = fight();
    expect(b.patrol[1] + POO_W).toBeLessThanOrEqual(b.toiletX - LID_LEFT - TOILET_GAP);
  });

  it('flushes when the hero lands on the button on the tank: the hero flies to the bathtub side, the poo is sucked in and spat out smaller', () => {
    const { world, b } = fight();
    wake(world, b);
    world.enemyProjectiles.push({ x: b.patrol[0] + 20, y: b.floorY - STINK_H, vx: 1, vy: 0, life: 300, type: 'stink' });
    pressButton(world, b);
    expect(b.phase).toBe('sucked');
    expect(b.fling).not.toBeNull();
    expect(world.enemyProjectiles.filter((s) => s.type === 'stink')).toHaveLength(0);
    for (let i = 0; i < FLING_FRAMES; i++) stepPoo(world, b);
    const p = world.player;
    expect(b.fling).toBeNull();
    // Thrown back toward the bathtub, but not out of sight of the toilet.
    expect(p.x).toBe(Math.max(b.patrol[0], buttonBox(b).x - FLING_DIST - p.w));
    expect(buttonBox(b).x - p.x).toBeLessThan(260);
    expect(p.y + p.h).toBe(b.floorY);
    expect(world.dead).toBe(false);
    for (let i = FLING_FRAMES; i < SUCK_FRAMES; i++) stepPoo(world, b);
    expect(b.hp).toBe(2);
    expect(b.phase).toBe('spat');
    expect(b.w).toBeLessThan(POO_W);
    // Spat out between the hero and the toilet: past him again to flush again.
    expect(b.x).toBeGreaterThan(p.x + p.w);
    expect(b.x + b.w).toBeLessThan(buttonBox(b).x);
    expect(world.enemies.filter((e) => e.alive && e.type === 'poolet')).toHaveLength(2);
    for (let i = 0; i < POO_SPAT_FRAMES; i++) stepPoo(world, b);
    expect(b.phase).toBe('hopping');
  });

  it('does not hurt while he is still flying out of the bowl, only once he has landed', () => {
    const { world, b } = fight('normal');
    wake(world, b);
    pressButton(world, b);
    for (let i = 0; i < SUCK_FRAMES; i++) stepPoo(world, b);
    expect(flyingOut(b)).toBe(true);
    // The hero standing right where he will land.
    standAt(world, b, b.x + b.w / 2 - world.player.w / 2);
    stepPoo(world, b);
    expect(world.dead).toBe(false);
    for (let i = 1; i < SPIT_FLIGHT; i++) {
      standAt(world, b, b.x + b.w / 2 - world.player.w / 2);
      stepPoo(world, b);
    }
    expect(flyingOut(b)).toBe(false);
    standAt(world, b, b.x + b.w / 2 - world.player.w / 2);
    stepPoo(world, b);
    expect(world.dead).toBe(true);
  });

  it('is gone after three flushes: his waves settle and his little poos squash', () => {
    const { world, b } = fight();
    wake(world, b);
    for (let flush = 0; flush < 3; flush++) {
      pressButton(world, b);
      for (let i = 0; i < SUCK_FRAMES + POO_SPAT_FRAMES; i++) stepPoo(world, b);
    }
    expect(b.hp).toBe(0);
    expect(b.phase).toBe('defeated');
    expect(world.enemyProjectiles.filter((s) => s.type === 'stink')).toHaveLength(0);
    expect(world.enemies.filter((e) => e.alive && e.type === 'poolet')).toHaveLength(0);
  });

  it('lets arrows stick in him for nothing', () => {
    const { world, b } = fight();
    wake(world, b);
    standAt(world, b, b.patrol[0] - 60);
    world.arrows.push({ x: b.x + 4, y: b.y + 10, vx: 6, life: 30, isChicken: false } as World['arrows'][number]);
    stepPoo(world, b);
    expect(world.arrows).toHaveLength(0);
    expect(b.hp).toBe(3);
    expect(b.fx.map((f) => f.kind)).toContain('thud');
  });
});

/** The hero coming down on the flush button on top of the tank. */
function pressButton(world: World, b: PooState): void {
  const p = world.player;
  const button = buttonBox(b);
  p.x = button.x + button.w / 2 - p.w / 2;
  p.y = button.y - p.h + 1;
  p.vy = 3;
  stepPoo(world, b);
}

describe('a level on its own (?boss=poo)', () => {
  afterEach(() => startRun(0));

  it('plays the bathroom as the one and last level, then is won; a run clears it', () => {
    setDifficulty('super_easy');
    startDemo(DEMOS.poo);
    expect(inDemo()).toBe(true);
    expect(getCurrentStage().level).toBe(DEMOS.poo.level);
    expect(isLastLevel(0)).toBe(true);
    expect(finishLevel({ lives: 3, score: 10 })).toBe('game-won');
    startRun(0);
    expect(inDemo()).toBe(false);
    expect(getCurrentStage().level).not.toBe(DEMOS.poo.level);
  });
});
