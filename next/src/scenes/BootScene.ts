import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config/constants';
import { ensureAudio } from '../audio/context';
import { startBGM } from '../audio/bgm';
import { BGM_TITLE } from '../data/bgmThemes';
import { LEVELS } from '../data/levels';
import { TStr, setGlyphResolver, type GlyphAction } from '../config/i18n';

/**
 * Placeholders like {A} in the translations resolve through this. The real
 * resolver arrives with the gamepad code in a later plan and picks glyphs per
 * controller; until then an Xbox-style labelling is the sensible default, which
 * is also what the live game falls back to when it cannot identify a pad.
 */
const DEFAULT_GLYPHS: Record<GlyphAction, string> = {
  confirm: 'A',
  back: 'B',
  shoot: 'X',
  pause: 'START',
};

export class BootScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super('Boot');
  }

  create(): void {
    setGlyphResolver((action) => DEFAULT_GLYPHS[action]);

    this.add
      .text(BASE_W / 2, BASE_H / 2 - 24, 'GIGI & DODO', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffdd00',
      })
      .setOrigin(0.5);

    // Proof the ported data is reachable from the running game, not just from tests.
    this.add
      .text(BASE_W / 2, BASE_H / 2 + 8, `${LEVELS.length} levels loaded`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#88ccff',
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_W / 2, BASE_H / 2 + 34, TStr('press_start'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Browsers refuse to start an AudioContext before a user gesture, so the music
    // waits for the first key or tap rather than starting on load.
    this.input.keyboard?.on('keydown', () => this.begin());
    this.input.on('pointerdown', () => this.begin());
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    ensureAudio();
    startBGM(BGM_TITLE);
  }
}
