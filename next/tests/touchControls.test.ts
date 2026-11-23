import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUCH_BUTTONS } from '../src/input/touchControls';

describe('the touch buttons', () => {
  it('press the keys the game reads: arrows, Space to jump, X to shoot, Enter, and Escape', () => {
    // The key codes Phaser's Key objects match on (input/keyboard.ts and input/menuKeys.ts).
    expect(Object.fromEntries(Object.entries(TOUCH_BUTTONS).map(([id, k]) => [id, k.keyCode]))).toEqual({
      'btn-left': 37, 'btn-right': 39, 'btn-up': 38, 'btn-down': 40,
      'btn-jump': 32, 'btn-shoot': 88, 'btn-ok': 13, 'btn-back': 27,
    });
  });

  it('are all on the page, inside the game\'s container so they stay in full screen', () => {
    // Found by the owner (2026-11-23): on a phone nothing got past the title, there were no buttons.
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const game = html.slice(html.indexOf('<div id="game">'), html.indexOf('<script'));
    for (const id of Object.keys(TOUCH_BUTTONS)) expect({ id, onPage: game.includes(`id="${id}"`) }).toEqual({ id, onPage: true });
  });
});
