/**
 * The four records are NOT uniform. Thirteen fields are on all of them; four exist
 * only on `super_easy`. Every read site in the live game guards for that, and the
 * fallbacks are load-bearing — carry them into later plans:
 *   stompHitbox    -> `dc.stompHitbox || 1`      (index.html:1542, 1601)
 *   invincibleTime -> `dc.invincibleTime || 60`  (index.html:1646)
 *   enemySkipChance / capeSavesPit -> truthiness (index.html:1359, 1423)
 */
export interface DifficultyRecord {
  label: string;
  color: string;
  lives: number;
  playerSpeed: number;
  jumpForce: number;
  enemySpeed: number;
  enemyShootInterval: number;
  ghostAggroRange: number;
  bouncerJumpForce: number;
  bowCharges: number;
  gapWidth: number;
  scoreMultiplier: number;
  startWithCape: boolean;

  // super_easy only.
  capeSavesPit?: boolean;
  enemySkipChance?: number;
  invincibleTime?: number;
  stompHitbox?: number;
}

export const DIFFICULTY_CONFIG = {
  super_easy: {
    label: 'Super Easy', color: '#88ff88',
    lives: Infinity,
    enemySpeed: 0.3,       // multiplier on enemy vx
    enemyShootInterval: 200, // cannon fire rate (higher = slower)
    playerSpeed: 3.0,
    jumpForce: -9.0,        // bigger jump for kids
    bowCharges: 8,
    startWithCape: true,    // start every level with cape
    capeSavesPit: true,     // cape protects from pit falls too
    stompHitbox: 2.0,       // multiplier on stomp detection zone (bigger = easier)
    gapWidth: 0.3,          // multiplier on gap widths (smaller = easier)
    ghostAggroRange: 70,
    bouncerJumpForce: -3,
    scoreMultiplier: 0.5,
    enemySkipChance: 0.4,  // 40% of enemies don't spawn
    invincibleTime: 120,    // longer invincibility after hit
  },
  easy: {
    label: 'Easy', color: '#aaddff',
    lives: 4,
    enemySpeed: 0.6,
    enemyShootInterval: 120,
    playerSpeed: 2.6,
    jumpForce: -7.8,
    bowCharges: 4,
    startWithCape: false,
    gapWidth: 0.7,
    ghostAggroRange: 150,
    bouncerJumpForce: -5,
    scoreMultiplier: 0.75,
  },
  normal: {
    label: 'Normal', color: '#ffffff',
    lives: 3,
    enemySpeed: 1.0,
    enemyShootInterval: 90,
    playerSpeed: 2.5,
    jumpForce: -7.5,
    bowCharges: 3,
    startWithCape: false,
    gapWidth: 1.0,
    ghostAggroRange: 200,
    bouncerJumpForce: -6,
    scoreMultiplier: 1.0,
  },
  hard: {
    label: 'Hard', color: '#ff6666',
    lives: 2,
    enemySpeed: 1.4,
    enemyShootInterval: 60,
    playerSpeed: 2.5,
    jumpForce: -7.2,
    bowCharges: 2,
    startWithCape: false,
    gapWidth: 1.3,
    ghostAggroRange: 280,
    bouncerJumpForce: -7,
    scoreMultiplier: 1.5,
  }
} as const satisfies Record<string, DifficultyRecord>;

export type DifficultyKey = keyof typeof DIFFICULTY_CONFIG;

export const DIFF_KEYS: DifficultyKey[] = ['super_easy', 'easy', 'normal', 'hard'];

let selected: DifficultyKey = 'normal';

export function getDifficulty(): DifficultyKey {
  return selected;
}

export function setDifficulty(key: DifficultyKey): void {
  selected = key;
}

/**
 * The active record. Resolved on every call, never cached: the live game reads it
 * live, so changing difficulty mid-run retunes the level in progress. That is
 * preserved deliberately (spec, bug-compatibility item 9).
 */
export function DC(): DifficultyRecord {
  return DIFFICULTY_CONFIG[selected];
}
