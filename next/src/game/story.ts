import type { Villain } from '../data/levels';
import { STAGES } from '../data/stages';

/**
 * The story the cutscenes tell (docs/superpowers/specs/2026-11-23-story-and-transitions-design.md):
 * the T-Rex wants the sibling for his Toy Castle, and each world's villain is one of his
 * helpers, carrying the sibling a world nearer. After him the kids are home on a normal day,
 * and Härra Kaka is the last villain (docs/superpowers/specs/2026-11-24-home-world-design.md).
 * Pure: which beat a transition is, who is in it, and which lines (i18n keys, with names to put
 * in) it says. BetweenScene acts it out.
 */

/** A world's villain: who runs off with the sibling in its chases and waits at its end. */
export function villainOf(theme: number): Villain | null {
  const stages = STAGES.filter((s) => s.theme === theme);
  for (const s of stages) if (s.level.villain) return s.level.villain;
  return stages[stages.length - 1]?.level.course?.boss?.kind ?? null;
}

/** The worlds of the run, in order, by theme. */
export function worlds(): number[] {
  return [...new Set(STAGES.map((s) => s.theme))];
}

export type Transition =
  /** Before the first level: the first villain snatches the sibling, then the map. */
  | { kind: 'opening'; villain: Villain; world: number }
  /** After a world's first or second level: its villain runs off with the sibling. */
  | { kind: 'chase'; villain: Villain; world: number; level: number; levels: number }
  /**
   * After a world's boss: the reunion, the beaten boss owning up, the next world's villain
   * snatching the sibling, then the map with the hero walking to the next world.
   */
  | { kind: 'worldChange'; beaten: Villain; villain: Villain; world: number; finalWorld: boolean };

/**
 * The transition shown on the way into stage `into` (an index into STAGES). `opening` asks for
 * the one before the very first level. Null where the story has nothing to say (a classic
 * level with no villain), which keeps the original game's kidnapper cutscene.
 */
export function transitionInto(into: number, opening = false): Transition | null {
  const next = STAGES[into];
  if (!next) return null;
  const world = worlds().indexOf(next.theme);
  const villain = villainOf(next.theme);
  if (!villain) return null;
  if (opening) return { kind: 'opening', villain, world };
  const finished = STAGES[into - 1];
  if (!finished) return null;
  if (finished.level.ending === 'chase' && finished.level.villain) {
    const inWorld = STAGES.filter((s) => s.theme === next.theme);
    return {
      kind: 'chase', villain: finished.level.villain, world,
      level: inWorld.indexOf(next) + 1, levels: inWorld.length,
    };
  }
  const beaten = finished.level.course?.boss?.kind ?? villainOf(finished.theme);
  if (!beaten) return null;
  return { kind: 'worldChange', beaten, villain, world, finalWorld: world === worlds().length - 1 };
}

/** A line: an i18n key, and the names to put into it (%V, %S, %N, %W). */
export interface Line {
  key: string;
  /** A villain's name, as the key of its own translation ('villain_x' or 'villain_x_par'). */
  villainKey?: string;
  /** The world's number, from 1, and its name's key. */
  worldNumber?: number;
  worldKey?: string;
}

/** What each beat of a transition says. */
export interface Script {
  /** The villain's shout as they grab the sibling. */
  grab?: Line;
  /** The beaten boss, sitting dazed. */
  beaten?: Line;
  /** The headline over the snatch or the chase. */
  headline?: Line;
  /** The headline over the map, and the line under it. */
  mapTitle?: Line;
  mapSub?: Line;
}

export const worldKey = (world: number) => `world_${world + 1}`;
export const villainKey = (v: Villain, partitive = false) => `villain_${v}${partitive ? '_par' : ''}`;

export function scriptFor(t: Transition): Script {
  switch (t.kind) {
    case 'opening':
      return {
        grab: { key: 'story_wants' },
        mapTitle: { key: 'story_save' },
        mapSub: { key: 'story_world', worldNumber: t.world + 1, worldKey: worldKey(t.world) },
      };
    case 'chase':
      return { headline: { key: 'story_follow', villainKey: villainKey(t.villain, true) } };
    case 'worldChange':
      return {
        // The T-Rex was behind it all, so nobody sent him: he owns up he is tiny now.
        beaten: { key: t.beaten === 'tRex' ? 'story_tiny_now' : 'story_sent_me' },
        grab: { key: t.villain === 'tRex' ? 'story_now_me' : t.villain === 'poo' ? 'story_poo_grab' : 'story_wants' },
        headline: { key: 'story_took', villainKey: villainKey(t.villain) },
        mapTitle: { key: 'story_world', worldNumber: t.world + 1, worldKey: worldKey(t.world) },
        mapSub: { key: 'story_save' },
      };
  }
}

/** Put the names into a line's text: %V the villain, %S the sibling, %N and %W the world. */
export function fill(text: string, names: { villain?: string; sibling?: string; worldNumber?: number; world?: string }): string {
  return text
    .replace('%V', names.villain ?? '')
    .replace('%S', names.sibling ?? '')
    .replace('%N', names.worldNumber !== undefined ? String(names.worldNumber) : '')
    .replace('%W', names.world ?? '');
}
