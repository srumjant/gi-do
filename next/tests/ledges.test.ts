import { describe, expect, it } from 'vitest';
import { quietWorld, step } from './helpers/courseRuns';
import { TILE } from '../src/config/constants';
import { DIFF_KEYS } from '../src/config/difficulty';
import { isSolid, LEVELS } from '../src/data/levels';
import { DEMOS } from '../src/data/demos';
import { STAGES } from '../src/data/stages';

/**
 * Every step, block and platform a child can stand on, in every level of the run: a running
 * jump off its edge, taken from right at the edge or up to two tiles before it, must not come
 * down in a pit, lava or water further on (found by this scan, 2026-11-23: on some difficulties
 * a jump off a step landed exactly in the pit a few tiles past it, in six levels).
 */
describe('every ledge in the run', () => {
  // Every hand-built level: the run's, and those on a screen of their own (data/demos.ts).
  for (const level of new Set([...STAGES, ...Object.values(DEMOS)].map((s) => s.level).filter((l) => !LEVELS.includes(l)))) {
    it(`lands a jump off every step and perch in ${level.name} on solid ground`, () => {
      const map = level.generate({} as never);
      const W = map[0].length;
      const standable = (x: number, y: number) => isSolid(map[y]?.[x]) && !isSolid(map[y - 1]?.[x]) && !isSolid(map[y - 2]?.[x]);
      const bad: string[] = [];
      for (let x = 1; x < W - 2; x++) {
        for (let y = 8; y <= 23; y++) {
          if (!standable(x, y) || isSolid(map[y][x + 1]) || isSolid(map[y - 1][x + 1])) continue;
          // A step down, not the edge of a gap: the ground goes on right after it.
          const stepDown = [...Array(25 - y).keys()].some((d) => isSolid(map[y + d]?.[x + 1]));
          if (!stepDown) continue;
          let x0 = x;
          while (x0 > x - 3 && standable(x0 - 1, y)) x0--;
          for (const key of DIFF_KEYS) {
            for (const early of [0, 8, 16, 24, 32]) {
              const world = quietWorld(level, key);
              world.course!.stations.forEach((s) => { s.cooldown = 99999; });
              const p = world.player;
              p.x = x0 * TILE;
              p.y = y * TILE - p.h;
              p.vx = 0;
              p.vy = 0;
              p.onGround = true;
              p.hasCape = false;
              p.invincible = 0;
              let jumped = false;
              let air = false;
              for (let i = 0; i < 200 && !world.dead && !world.won; i++) {
                const press = !jumped && p.onGround && p.x + p.w >= (x + 1) * TILE - 2 - early;
                if (press) jumped = true;
                step(world, { right: true, jump: jumped, jumpPressed: press });
                if (jumped && !p.onGround) air = true;
                if (air && p.onGround) break;
              }
              if (world.dead) bad.push(`x${x} y${y} ${key} ${early}px early: fell at ${(p.x / TILE).toFixed(1)}`);
            }
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
