import { padGlyph } from '../input/gamepad';
import { setGlyphResolver } from './i18n';

/**
 * Placeholders like `{A}` in the translations resolve through this. Two strings in the
 * live game carry one — `press_start` (index.html:174) and `mode_hint` (:182) — and an
 * unresolved placeholder renders as the literal text `{A}` on screen.
 *
 * (An earlier version of this comment, and the brief that came with the gamepad work, both
 * said FOUR: `press_start`, `controls`, `mode_hint` and `pause_hint`. The last two carry no
 * placeholder in the live source or in this port's copy of it — `controls` spells the keys
 * out and adds a 🎮, and `pause_hint` names no button at all. Grepping the table for `{`
 * finds two.)
 *
 * The resolver asks the controller (input/gamepad.ts), which answers Xbox until a pad
 * identifies itself as something else — the same default the live game has, and for the
 * same reason: `padKind` starts at `'xbox'` because the "standard gamepad" layout is
 * Xbox-shaped. Installed once at boot, so nothing has to remember to do it.
 *
 * ## When the glyphs change
 *
 * The live game redraws every string every frame, so plugging in a DualSense swaps the Ⓐ
 * for a ✕ on the spot. This port builds its text objects once in `create()` and only moves
 * them afterwards, so a screen already on display keeps the glyphs it was built with and
 * the next screen has the new ones. In practice that is invisible: a browser hides a
 * gamepad from `navigator.getGamepads()` until a button on it has been pressed, so the
 * first sample only ever happens on a screen the child is already leaving.
 *
 * It lived in `BootScene` until 2026-09-22. That scene was Plan 1 scaffolding, was never
 * in the scene list, and so never ran — which meant the resolver was never installed and
 * the first screen to use a placeholder would have shown the raw `{A}`.
 */
export function installGlyphs(): void {
  setGlyphResolver(padGlyph);
}
