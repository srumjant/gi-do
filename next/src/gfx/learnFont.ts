import type Phaser from 'phaser';
import andikaBoldUrl from '../assets/fonts/Andika-Bold.woff2?url';
import andikaRegularUrl from '../assets/fonts/Andika-Regular.woff2?url';

/**
 * Learn mode's one typeface: Andika, SIL's font for children learning to read. Its a and g are
 * the single-storey shapes children write, its I, l and 1 differ, and it has every Estonian
 * letter. One face everywhere in learn mode means the letter on a block and the one in the HUD
 * are the same shape. These are SIL's own web files, unmodified, under the SIL Open Font
 * License (assets/fonts/OFL.txt).
 *
 * Phaser's font loader names each face's family after its load key, so the two weights are two
 * families. The fallbacks only fill glyphs Andika lacks: ★, ◀ ▶, the pad's buttons, 🔊.
 */
const REGULAR = 'Andika';
const BOLD = 'AndikaBold';
const FALLBACK = '"Trebuchet MS", system-ui, sans-serif';

/** For text. */
export const LEARN_FONT = `${REGULAR}, ${FALLBACK}`;
/** For letters, targets and headings: the face is bold already, so no `fontStyle: 'bold'`. */
export const LEARN_FONT_BOLD = `${BOLD}, ${FALLBACK}`;

/**
 * Text is drawn at this many times its size, so the letters stay smooth when the canvas is
 * scaled up to fill the screen (`pixelArt` scales everything else with hard edges).
 */
export const LEARN_TEXT_RESOLUTION = 3;

/** A face already added to the page's fonts: Phaser's font loader keeps no cache to ask. */
function loaded(family: string): boolean {
  return [...document.fonts].some((face) => face.family.replace(/"/g, '') === family);
}

/**
 * Queues the two faces on a scene's loader, once per page. Call from `preload()`: Phaser holds
 * `create()` until they are in, so no text is drawn in a fallback first.
 */
export function preloadLearnFont(scene: Phaser.Scene): void {
  if (!loaded(REGULAR)) scene.load.font(REGULAR, andikaRegularUrl, 'woff2');
  if (!loaded(BOLD)) scene.load.font(BOLD, andikaBoldUrl, 'woff2');
}
