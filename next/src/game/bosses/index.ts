import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import type { World } from '../types';
import { buildDollQueen, stepDollQueen, type DollQueenState } from './dollQueen';
import { buildPterodactyl, stepPterodactyl, type PterodactylState } from './pterodactyl';

/** A hand-built level's boss, whichever it is: each theme has its own. */
export type CourseBoss = DollQueenState | PterodactylState;

export function buildCourseBoss(def: BossDef, dc: DifficultyRecord): CourseBoss {
  return def.kind === 'pterodactyl' ? buildPterodactyl(def, dc) : buildDollQueen(def, dc);
}

export function stepCourseBoss(world: World, boss: CourseBoss): void {
  if (boss.kind === 'pterodactyl') stepPterodactyl(world, boss);
  else stepDollQueen(world, boss);
}
