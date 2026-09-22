import { setGlyphResolver, type GlyphAction } from './i18n';

/**
 * Placeholders like `{A}` in the translations resolve through this. Four strings in the
 * live game carry one (`press_start`, `controls`, `mode_hint`, `pause_hint`), and an
 * unresolved placeholder renders as the literal text `{A}` on screen.
 *
 * These are the live game's Xbox set verbatim (index.html:3037), which is also its own
 * fallback when a pad cannot be identified — `padKind` initialises to `'xbox'`.
 *
 * The real resolver arrives with the gamepad work and picks glyphs per controller. Until
 * then this is installed once at boot, so nothing has to remember to do it.
 *
 * It lived in `BootScene` until 2026-09-22. That scene was Plan 1 scaffolding, was never
 * in the scene list, and so never ran — which meant the resolver was never installed and
 * the first screen to use a placeholder would have shown the raw `{A}`.
 */
const DEFAULT_GLYPHS: Record<GlyphAction, string> = {
  confirm: 'Ⓐ',
  back: 'Ⓑ',
  shoot: 'Ⓧ',
  pause: '☰',
};

export function installDefaultGlyphs(): void {
  setGlyphResolver((action) => DEFAULT_GLYPHS[action]);
}
