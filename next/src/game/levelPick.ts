import { STAGES } from '../data/stages';
import { worlds } from './story';

/**
 * What the level map decides (docs/superpowers/specs/2026-11-24-level-pick-design.md), with
 * none of what it draws: the run's worlds in order, each with its levels as indices into
 * STAGES; which stage a badge and a card mean; where the map opens. The cursors move with
 * game/menu.ts's `clampIndex`: the map stops at its ends.
 */
export function worldLevels(): number[][] {
  return worlds().map((theme) => STAGES.flatMap((stage, i) => (stage.theme === theme ? [i] : [])));
}

/** The stage a world's badge and a card in its box mean; past the ends, the ends. */
export function stageAt(world: number, card: number): number {
  const all = worldLevels();
  const levels = all[Math.max(0, Math.min(world, all.length - 1))];
  return levels[Math.max(0, Math.min(card, levels.length - 1))];
}

/** The world a stage is in. */
export function worldOf(stage: number): number {
  return Math.max(0, worldLevels().findIndex((levels) => levels.includes(stage)));
}

/** Where the map opens: on the world of the level just played, or on the first. */
export function mapOpensOn(picked: number | null): number {
  return picked === null ? 0 : worldOf(picked);
}
