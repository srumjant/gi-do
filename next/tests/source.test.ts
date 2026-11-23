import { afterEach, describe, expect, it } from 'vitest';
import { backName, confirmName, setInputSource } from '../src/input/source';

describe('the button a prompt names', () => {
  afterEach(() => setInputSource('keyboard'));

  it('is the one on the device last used: SPACE, the controller\'s glyph, or the touch OK', () => {
    // The owner (2026-11-23): "VAJUTA SPACE" was the wrong word on a phone or a controller.
    setInputSource('keyboard');
    expect([confirmName('Ⓐ'), backName('Ⓑ')]).toEqual(['SPACE', 'ESC']);
    setInputSource('pad');
    expect([confirmName('✕'), backName('○')]).toEqual(['✕', '○']);
    setInputSource('touch');
    expect([confirmName('Ⓐ'), backName('Ⓑ')]).toEqual(['OK', '❚❚']);
  });
});
