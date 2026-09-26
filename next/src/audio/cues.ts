import type { EffectCue, SoundCue, World } from '../game/types';
import { startBGM, stopBGM } from './bgm';
import {
  sfxBlock,
  sfxBoing,
  sfxBossCharge,
  sfxBossFire,
  sfxBossRoar,
  sfxCannonFire,
  sfxCapeSave,
  sfxCatArrive,
  sfxCatVanish,
  sfxCluck,
  sfxCoin,
  sfxFart,
  sfxHurt,
  sfxJump,
  sfxPickup,
  sfxShoot,
  sfxStomp,
  sfxWin,
  sfxWrong,
} from './sfx';

/**
 * The other end of `World.sounds`: the one place that turns a cue the simulation raised
 * into an actual oscillator.
 *
 * This file is the seam the whole arrangement exists for. `src/game/` raises values and
 * imports nothing from here; `src/audio/` plays sounds and knows nothing about a World
 * beyond two types, both erased at compile time. The dependency runs one way, and it runs
 * the way that keeps the simulation loadable in a node process with no `window` in it.
 *
 * `levelIndex` is here because a World does not know which level it is — the level RECORD
 * is on it, the index is the run's. Only `music-level` reads it.
 */
export function playCue(cue: SoundCue, levelIndex: number): void {
  switch (cue) {
    // index.html:1209 — a respawn is an initLevel, and initLevel ends on startBGM(idx).
    case 'music-level': startBGM(levelIndex); break;
    // index.html:1631 (rescued) and :1647 (died). Both go quiet on the spot.
    case 'music-stop': stopBGM(); break;
    default: playEffect(cue);
  }
}

/** A sound effect, which needs nothing but its name. The learn tower plays its cues here. */
export function playEffect(cue: EffectCue): void {
  switch (cue) {
    case 'jump': sfxJump(); break;
    case 'fart': sfxFart(); break;
    case 'shoot': sfxShoot(); break;
    case 'cluck': sfxCluck(); break;
    case 'block': sfxBlock(); break;
    case 'pickup': sfxPickup(); break;
    case 'coin': sfxCoin(); break;
    case 'stomp': sfxStomp(); break;
    case 'boing': sfxBoing(); break;
    case 'hurt': sfxHurt(); break;
    case 'win': sfxWin(); break;
    case 'cape': sfxCapeSave(); break;
    case 'cat-arrive': sfxCatArrive(); break;
    case 'cat-vanish': sfxCatVanish(); break;
    // The three the boss makes, all bare playTone calls in the live source — see sfx.ts.
    case 'boss-fire': sfxBossFire(); break;
    case 'boss-charge': sfxBossCharge(); break;
    case 'boss-roar': sfxBossRoar(); break;
    // index.html:1535, another bare playTone — and NOT 'boss-fire'. See audio/sfx.ts.
    case 'cannon-fire': sfxCannonFire(); break;
    // index.html:2743, learn mode's wrong letter.
    case 'wrong': sfxWrong(); break;
    default:
      // An effect this switch does not play fails the build here, not silently in play.
      cue satisfies never;
  }
}

/**
 * Plays everything the step just taken raised, in the order it was raised, and empties the
 * list behind itself.
 *
 * Called once per SIMULATION step and not once per rendered frame — a frame that steps
 * three times has three of these. `stepWorld` clears the list at the top of every step, so
 * skipping one would drop its sounds rather than delay them, and on a slow frame that is
 * the difference between hearing the coin you just took and never hearing it.
 *
 * Emptying here as well as in `stepWorld` is not redundant in the way it looks: this is
 * what makes the call idempotent, so a caller that plays the same list twice in one frame
 * — a mistake that is otherwise inaudible until it is a machine-gun of stomps — gets
 * silence the second time instead of a double.
 */
export function playSounds(world: World, levelIndex: number): void {
  for (const cue of world.sounds) playCue(cue, levelIndex);
  world.sounds.length = 0;
}
