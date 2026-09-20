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
