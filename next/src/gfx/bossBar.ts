/**
 * The boss health bar's colour rule, which the live game writes out TWICE — once for the
 * little bar floating over the boss's head (index.html:1811) and once for the wide one
 * across the bottom of the screen (index.html:1889) — in two different draw passes, with
 * the same three colours and the same two thresholds copied by hand.
 *
 * Here those two passes are two different SCENES (SliceScene draws the world, HudScene
 * draws the screen), so the duplication would have to cross a file boundary to survive.
 * It does not: the rule lives here and both import it. If the children ever ask for a
 * different colour, there is one place to change.
 *
 * Geometry is deliberately NOT here. The two bars are 72x6 and 120x10, positioned from
 * completely different origins, and sharing those numbers would be sharing a coincidence
 * rather than a rule — the same reason gfx/textures.ts registers the same sprite twice at
 * two scales instead of picking one.
 */

/** Above half health (index.html:1811, :1889). */
const BOSS_BAR_GOOD = 0x44cc44;
/** Above a quarter. */
const BOSS_BAR_HURT = 0xcccc44;
/** At or below a quarter — the last stretch of the fight. */
const BOSS_BAR_CRITICAL = 0xcc4444;

/** The bar's dark backing, under the fill (index.html:1810, :1888). */
export const BOSS_BAR_BACK = 0x330000;

/**
 * Which of the three the fill is, at this fraction of full health.
 *
 * Both thresholds are STRICT `>`, exactly as the live ternary chain has them, so a boss
 * sitting on precisely half health already shows yellow rather than green. That is the
 * same health value the first roar fires on (game/boss.ts), so the two cues land
 * together — the bar turns and the boss bellows on the same stomp.
 */
export function bossBarColor(hp: number, maxHp: number): number {
  if (hp > maxHp * 0.5) return BOSS_BAR_GOOD;
  if (hp > maxHp * 0.25) return BOSS_BAR_HURT;
  return BOSS_BAR_CRITICAL;
}
