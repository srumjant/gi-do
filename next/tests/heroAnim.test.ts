import { describe, expect, it } from 'vitest';
import {
  BLINK_EVERY, BLINK_FOR, BREATH, createHeroAnim, DEATH_HANG, IDLE_AFTER, OUCH_FOR, stepHeroAnim,
  type HeroLook, type HeroState,
} from '../src/game/heroAnim';

const standing: HeroState = { frame: 0, facing: 1, hasCape: false, arrowCooldown: 0, dead: false };

function run(states: HeroState[]): HeroLook[] {
  const a = createHeroAnim();
  return states.map((s) => stepHeroAnim(a, s));
}
const repeat = (s: HeroState, n: number) => Array.from({ length: n }, () => s);

describe('the hero\'s look', () => {
  it('is the pose the game says, unmoved, when nothing is going on', () => {
    const [stand, runPose, jump] = run([standing, { ...standing, frame: 1 }, { ...standing, frame: 2 }]);
    expect(stand).toEqual({ frame: 'stand', dx: 0, dy: 0, angle: 0, flipY: false, bow: false });
    expect(runPose.frame).toBe('run');
    expect(jump.frame).toBe('jump');
  });

  it('breathes and blinks once the hero has stood still a moment, and stops when they move', () => {
    const looks = run(repeat(standing, IDLE_AFTER + 2 * BLINK_EVERY));
    expect(looks.slice(0, IDLE_AFTER).every((l) => l.frame === 'stand' && l.dy === 0)).toBe(true);
    const idle = looks.slice(IDLE_AFTER);
    // A breath: a pixel up for BREATH steps, then down.
    expect(idle.slice(0, BREATH).every((l) => l.dy === 0)).toBe(true);
    expect(idle.slice(BREATH, 2 * BREATH).every((l) => l.dy === -1)).toBe(true);
    // A blink of BLINK_FOR steps every BLINK_EVERY.
    expect(idle.filter((l) => l.frame === 'blink').length).toBe(2 * BLINK_FOR);
    expect(idle[BLINK_EVERY - 1].frame).toBe('blink');

    const a = createHeroAnim();
    for (let i = 0; i < IDLE_AFTER + BREATH + 5; i++) stepHeroAnim(a, standing);
    stepHeroAnim(a, { ...standing, frame: 1 });
    expect(stepHeroAnim(a, standing)).toMatchObject({ frame: 'stand', dy: 0 });
  });

  it('holds the bow out and kicks back a pixel when an arrow flies, the legs staying the jump\'s in the air', () => {
    const shots = run([15, 14, 13, 12, 11, 10, 9, 8, 7].map((c) => ({ ...standing, arrowCooldown: c })));
    expect(shots.map((l) => l.frame)).toEqual(['shoot', 'shoot', 'shoot', 'shoot', 'shoot', 'shoot', 'shoot', 'stand', 'stand']);
    expect(shots.map((l) => l.bow)).toEqual([true, true, true, true, true, true, true, false, false]);
    expect(shots.map((l) => l.dx)).toEqual([-1, -1, -1, 0, 0, 0, 0, 0, 0]);
    const [left] = run([{ ...standing, facing: -1, arrowCooldown: 15 }]);
    expect(left.dx).toBe(1);
    const [air] = run([{ ...standing, frame: 2, arrowCooldown: 15 }]);
    expect(air).toMatchObject({ frame: 'jump', bow: true });
  });

  it('winces, pushed back and tilted away, when the cape goes, easing back to nothing', () => {
    const looks = run([{ ...standing, hasCape: true }, ...repeat(standing, OUCH_FOR + 1)]);
    const ouch = looks.slice(1);
    expect(ouch.slice(0, OUCH_FOR).every((l) => l.frame === 'ouch')).toBe(true);
    expect(ouch[0].dx).toBeLessThan(0);
    expect(ouch[0].angle).toBeLessThan(0);
    expect(Math.abs(ouch[OUCH_FOR - 1].dx)).toBeLessThan(Math.abs(ouch[0].dx));
    expect(ouch[OUCH_FOR]).toMatchObject({ frame: 'stand', dx: 0, angle: 0 });
    // Facing left, pushed the other way.
    const [, left] = run([{ ...standing, facing: -1, hasCape: true }, { ...standing, facing: -1 }]);
    expect(left.dx).toBeGreaterThan(0);
    expect(left.angle).toBeGreaterThan(0);
  });

  it('loses a life with a wince, a hang, a hop up and a fall far below, upside down, and is itself again after', () => {
    const dead = { ...standing, dead: true };
    const looks = run([...repeat(dead, 90), standing]);
    expect(looks.slice(0, 90).every((l) => l.frame === 'ouch')).toBe(true);
    expect(looks.slice(0, DEATH_HANG).every((l) => l.dy === 0 && !l.flipY)).toBe(true);
    const air = looks.slice(DEATH_HANG, 90).map((l) => l.dy);
    expect(Math.min(...air)).toBeLessThan(-30);
    expect(air[air.length - 1]).toBeGreaterThan(400);
    expect(looks[DEATH_HANG + 5].flipY).toBe(true);
    expect(looks[90]).toEqual({ frame: 'stand', dx: 0, dy: 0, angle: 0, flipY: false, bow: false });
  });
});
