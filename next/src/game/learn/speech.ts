import { STEP_HZ } from '../../config/constants';
import type { LearnMode } from './content';
import type { TowerLayout } from './tower';
import type { Climb } from './types';
import { LEARN_CHEERS } from './voiceClips';

/** How long the voice stays quiet before saying the target again on reaching a letter floor: 4 seconds. */
export const REPEAT_GAP = 4 * STEP_HZ;

/**
 * An item as the voice should read it. A letter stays a capital, which a voice names; a
 * syllable goes lower case, which it says as a syllable instead of spelling it out.
 */
function spoken(item: string, mode: LearnMode): string {
  return mode === 'syllables' ? item.toLowerCase() : item;
}

/** What storey `s` asks for: the item, or in words mode the word and then the letter ("kass. K."). */
export function targetLine(layout: TowerLayout, s: number): string {
  const target = layout.storeys[s].target;
  if (layout.mode === 'words' && layout.word) return `${layout.word.toLowerCase()}. ${target}.`;
  return spoken(target, layout.mode);
}

/** A right answer at storey `s`: the item, and that gate's cheer. */
export function rightLine(layout: TowerLayout, s: number): string {
  return `${spoken(layout.storeys[s].target, layout.mode)}. ${LEARN_CHEERS[s % LEARN_CHEERS.length]}`;
}

/** The star's cheer. */
export function starLine(layout: TowerLayout): string {
  return LEARN_CHEERS[layout.storeys.length % LEARN_CHEERS.length];
}

/** Asks the scene to say `text` (audio/voice.ts's `speak`), and remembers when. */
export function say(c: Climb, text: string, when: 'now' | 'after'): void {
  c.speech.push({ text, when });
  c.lastSpokeAt = c.steps;
}

/**
 * X: the target, now. On the way up through a trapdoor the gate below is answered (and not
 * re-armed), so X gives the next storey's target instead of the letter just found. Saying a
 * storey's target this way counts as its announcement, so landing there stays quiet. Nothing
 * on the roof.
 */
export function speakOnX(c: Climb): void {
  const gate = c.gates[c.storey];
  const s = gate && !gate.armed ? c.storey + 1 : c.storey;
  if (s >= c.layout.storeys.length) return;
  say(c, targetLine(c.layout, s), 'now');
  c.announced = Math.max(c.announced, s);
}

/**
 * The voice on the ground. The first time the hero stands in a new storey, that storey's
 * target, after whatever is still being said (the right answer's cheer). And on arriving on
 * a letter floor from below, the target again, unless the voice has spoken in the last
 * REPEAT_GAP. `groundBefore` is `lastGround` from before this step: landing back on the
 * letter floor after a jump from it is not arriving.
 */
export function speakOnGround(c: Climb, groundBefore: number): void {
  if (!c.player.onGround || c.storey >= c.layout.storeys.length) return;
  if (c.storey > c.announced) {
    c.announced = c.storey;
    say(c, targetLine(c.layout, c.storey), 'after');
    return;
  }
  const s = c.lastGround;
  if (s >= 0 && s !== groundBefore && c.steps - c.lastSpokeAt >= REPEAT_GAP) {
    say(c, targetLine(c.layout, s), 'now');
  }
}
