import type Phaser from 'phaser';
import andikaBoldUrl from '../assets/fonts/Andika-Bold.woff2?url';
import andikaRegularUrl from '../assets/fonts/Andika-Regular.woff2?url';

/**
 * The game's one typeface: Andika, SIL's font for children learning to read. Its a and g are
 * the single-storey shapes children write, its I, l and 1 differ, and it has every Estonian
 * letter. One face everywhere means a letter looks the same on every screen, and in learn mode
 * the letter on a block and the one in the HUD are the same shape. These are SIL's own web
 * files, unmodified, under the SIL Open Font License (assets/fonts/OFL.txt).
 *
 * The live game is monospace throughout; this is the owner's call for the children who play
 * it, as is showing every string in capitals (config/i18n.ts's T).
 *
 * Phaser's font loader names each face's family after its load key, so the two weights are two
 * families. The fallbacks only fill glyphs Andika lacks: ★, ◀ ▶, the pad's buttons, emoji.
 */
const REGULAR = 'Andika';
const BOLD = 'AndikaBold';
const FALLBACK = '"Trebuchet MS", system-ui, sans-serif';

/** For text. */
export const GAME_FONT = `${REGULAR}, ${FALLBACK}`;
/** For what the live game drew bold: the face is bold already, so no `fontStyle: 'bold'`. */
export const GAME_FONT_BOLD = `${BOLD}, ${FALLBACK}`;

/**
 * Text is drawn at this many times its size, so the letters stay smooth when the canvas is
 * scaled up to fill the screen (`pixelArt` scales everything else with hard edges).
 */
export const GAME_TEXT_RESOLUTION = 3;

/** A face already added to the page's fonts: Phaser's font loader keeps no cache to ask. */
function loaded(family: string): boolean {
  return [...document.fonts].some((face) => face.family.replace(/"/g, '') === family);
}

/**
 * Queues the two faces on a scene's loader, once per page. The title screen calls it from
 * `preload()`, and every screen comes after the title, so Phaser holds the first `create()`
 * until the faces are in and no text is ever drawn in a fallback first.
 */
export function preloadGameFont(scene: Phaser.Scene): void {
  if (!loaded(REGULAR)) scene.load.font(REGULAR, andikaRegularUrl, 'woff2');
  if (!loaded(BOLD)) scene.load.font(BOLD, andikaBoldUrl, 'woff2');
}
