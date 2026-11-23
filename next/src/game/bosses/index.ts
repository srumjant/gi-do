import type { DifficultyRecord } from '../../config/difficulty';
import type { BossDef } from '../../data/levels';
import type { World } from '../types';
import { buildDollQueen, stepDollQueen, type DollQueenState } from './dollQueen';
import { buildPizzaChef, stepPizzaChef, type PizzaChefState } from './pizzaChef';
import { buildPterodactyl, stepPterodactyl, type PterodactylState } from './pterodactyl';
import { buildTRex, stepTRex, type TRexState } from './tRex';
import { buildVanaToomas, stepVanaToomas, type VanaToomasState } from './vanaToomas';
import { buildYeti, stepYeti, type YetiState } from './yeti';

/** A hand-built level's boss, whichever it is: each theme has its own. */
export type CourseBoss = DollQueenState | PterodactylState | VanaToomasState | PizzaChefState | YetiState | TRexState;

export function buildCourseBoss(def: BossDef, dc: DifficultyRecord): CourseBoss {
  switch (def.kind) {
    case 'pterodactyl': return buildPterodactyl(def, dc);
    case 'vanaToomas': return buildVanaToomas(def, dc);
    case 'pizzaChef': return buildPizzaChef(def, dc);
    case 'yeti': return buildYeti(def);
    case 'tRex': return buildTRex(def, dc);
    default: return buildDollQueen(def, dc);
  }
}

export function stepCourseBoss(world: World, boss: CourseBoss): void {
  switch (boss.kind) {
    case 'pterodactyl': stepPterodactyl(world, boss); break;
    case 'vanaToomas': stepVanaToomas(world, boss); break;
    case 'pizzaChef': stepPizzaChef(world, boss); break;
    case 'yeti': stepYeti(world, boss); break;
    case 'tRex': stepTRex(world, boss); break;
    default: stepDollQueen(world, boss);
  }
}
