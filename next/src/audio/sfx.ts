import { playTone } from './synth';

// One-shots. setTimeout is the right tool here: only the music needs scheduling
// against the audio clock, and a few milliseconds of jitter on a coin is inaudible.

export function sfxJump(): void {
  playTone(300, 0.15, 'square', 0.12, 600);
}

export function sfxStomp(): void {
  playTone(200, 0.1, 'square', 0.15);
  setTimeout(() => playTone(400, 0.15, 'square', 0.12), 50);
}

export function sfxCoin(): void {
  playTone(880, 0.08, 'square', 0.1);
  setTimeout(() => playTone(1200, 0.15, 'square', 0.1), 80);
}

export function sfxHurt(): void {
  playTone(200, 0.3, 'sawtooth', 0.15, 80);
}

export function sfxBlock(): void {
  playTone(500, 0.06, 'triangle', 0.1);
  setTimeout(() => playTone(700, 0.1, 'triangle', 0.08), 60);
}

export function sfxShoot(): void {
  playTone(600, 0.08, 'sawtooth', 0.1, 900);
}

export function sfxPickup(): void {
  playTone(440, 0.1, 'triangle', 0.12);
  setTimeout(() => playTone(660, 0.1, 'triangle', 0.12), 80);
  setTimeout(() => playTone(880, 0.15, 'triangle', 0.1), 160);
}

export function sfxFart(): void {
  playTone(80, 0.2, 'sawtooth', 0.15, 30);
  setTimeout(() => playTone(60, 0.15, 'sawtooth', 0.1, 20), 100);
}

export function sfxBoing(): void {
  playTone(300, 0.1, 'sine', 0.12, 600);
  setTimeout(() => playTone(500, 0.15, 'sine', 0.1, 200), 80);
}

export function sfxCluck(): void {
  playTone(800, 0.05, 'square', 0.08);
  setTimeout(() => playTone(600, 0.08, 'square', 0.06), 60);
}

/** A rising arpeggio, one note every 150ms. */
export function sfxWin(): void {
  [523, 659, 784, 1047].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, 'square', 0.1), i * 150);
  });
}

// ---------------------------------------------------------------------------------
// The three below have no name in the live source. They are bare `playTone` calls sitting
// in the middle of game logic, which is why a search for `sfx` — the obvious way to find
// every sound in index.html, and the way this port's first pass over the audio went —
// misses all three. There are ten such calls live; these are the three in code this port
// ran when they were found. Of the other seven, the boss's three are named further down
// this file now that the fight is ported; what is left is the cannon's shot and learn
// mode's.
//
// Named here, rather than left inline at the call sites, so that the port has one file
// that answers "what noises can this game make?".

/**
 * A cape earning its keep: index.html:1423 (a pit survived) and :1646 (a contact hit
 * absorbed), with identical arguments in both places. A 400Hz sawtooth sliding down to
 * 200 — audibly a near miss rather than a reward.
 */
export function sfxCapeSave(): void {
  playTone(400, 0.15, 'sawtooth', 0.12, 200);
}

/** The cat arriving (index.html:1454): three sine notes climbing, 100ms apart. */
export function sfxCatArrive(): void {
  playTone(600, 0.15, 'sine', 0.06);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.06), 100);
  setTimeout(() => playTone(1000, 0.1, 'sine', 0.05), 200);
}

/** The puff the cat goes out in after its third scratch (index.html:1494). */
export function sfxCatVanish(): void {
  playTone(300, 0.1, 'sine', 0.05);
}

// ---------------------------------------------------------------------------------
// The boss fight, which makes three noises and has a name for none of them. Every one is
// a bare `playTone` buried in `update()` (index.html:1572, :1583, :1610), so the search
// that found the three above — grep for `sfx` — finds a completely silent boss and says
// the sound work is done. Named here for the same reason the cape and the cat were.
//
// All three live in the bottom two octaves the synth can reach, an octave below anything
// else in the game: a 150Hz shot against the player's 600Hz bow, and a roar that bottoms
// out at 40. That is the whole characterisation — the boss is the only thing in Gigi &
// Dodo that is LOW.

/**
 * A fireball leaving the boss (index.html:1572). 150Hz sawtooth sliding down to 80 over a
 * fifth of a second.
 *
 * Not the same sound as the CANNON's shot, which is also a 150Hz sawtooth at the same
 * volume (index.html:1535) but half as long and sliding to 300 rather than 80 — it ends
 * ABOVE where it started rather than well below. Two tones a careless reading would fold
 * into one; when the cannon lands it wants a second function here, not a call to this one.
 */
export function sfxBossFire(): void {
  playTone(150, 0.2, 'sawtooth', 0.08, 80);
}

/** The boss committing to a charge (index.html:1583): a short, hard 100Hz square down to 60. */
export function sfxBossCharge(): void {
  playTone(100, 0.3, 'square', 0.1, 60);
}

/**
 * The roar at a health threshold (index.html:1610) — the loudest thing in the game at
 * 0.15, and the only two-tone effect that goes DOWN: 80Hz sliding to 50, then 60 sliding
 * to 40 a further 150ms later. The second tone starts below where the first one ended,
 * so the pair reads as one long fall rather than as two notes.
 */
export function sfxBossRoar(): void {
  playTone(80, 0.5, 'sawtooth', 0.15, 50);
  setTimeout(() => playTone(60, 0.4, 'square', 0.12, 40), 150);
}
