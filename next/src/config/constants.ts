// Authoring resolution. Everything is laid out in these units; the Scale manager
// handles the device. Values are the live game's — see tests/constants.test.ts.
export const BASE_W = 640;
export const BASE_H = 400;

/** World zoom. The HUD draws unzoomed, the world draws at this scale. */
export const ZOOM = 1.5;
export const VIEW_W = BASE_W / ZOOM;
export const VIEW_H = BASE_H / ZOOM;

export const TILE = 16;
export const GRAVITY = 0.4;

/** Enemy sprites render larger than their source grid. */
export const ENEMY_SCALE = 1.8;

/** The simulation runs at exactly this rate regardless of display refresh. */
export const STEP_HZ = 60;
export const STEP_MS = 1000 / STEP_HZ;
