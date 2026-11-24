import { VANNITUBA } from './levels2/vannituba';
import type { Stage } from './stages';

/**
 * Levels with a screen of their own, outside the run: `?boss=<name>` on the address plays the
 * one level (scenes/startStage.ts, game/run.ts's `startDemo`). Härra Kaka, the poo boss, the
 * owner's children's idea (docs/superpowers/specs/2026-11-24-poo-boss-design.md).
 */
export const DEMOS: Readonly<Record<string, Stage>> = {
  poo: { theme: 0, level: VANNITUBA, nameKey: 'level_poo' },
};
