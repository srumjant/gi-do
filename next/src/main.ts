/// <reference types="vite/client" />
import Phaser from 'phaser';
import { BASE_W, BASE_H, STEP_HZ } from './config/constants';
import { BetweenScene } from './scenes/BetweenScene';
import { CharacterScene } from './scenes/CharacterScene';
import { DifficultyScene } from './scenes/DifficultyScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HudScene } from './scenes/HudScene';
import { LevelOverlayScene } from './scenes/LevelOverlayScene';
import { PowerupPopupScene } from './scenes/PowerupPopupScene';
import { SliceScene } from './scenes/SliceScene';
import { WinScene } from './scenes/WinScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'arcade',
    arcade: {
      /**
       * ZERO, and it has to be. The apex hang applies 0.6 gravity while rising and 1.2
       * while falling (index.html:1400-1403) — a per-frame multiplier, which a constant
       * cannot express. `stepPlayer` integrates `vy` by hand and the mover carries the
       * answer into the body, so anything Arcade added here would be applied twice and
       * the hang would be gone. See physics/player.ts.
       */
      gravity: { x: 0, y: 0 },
      /**
       * The important one. Left to itself, Arcade hooks the scene's UPDATE event and
       * steps once per RENDERED frame — which on a 120Hz screen is twice as often as
       * SliceScene's fixed-step accumulator runs the rest of the simulation, and the
       * player alone would move at double speed. That is precisely the bug the
       * accumulator exists to fix (index.html runs straight off requestAnimationFrame;
       * this port deliberately does not). `customUpdate` takes the hook away, and the
       * simulation drives Arcade itself from inside SliceScene's fixed step, once per
       * body per step — see stepBodyAlone in physics/body.ts.
       *
       * It also fixes the ORDER. Phaser emits UPDATE before it calls `Scene.update`, so
       * the default would step the bodies BEFORE the frame's input had set a velocity.
       */
      customUpdate: true,
      /**
       * Arcade's own fixed delta, and therefore the length of one of our frames. It is
       * already the default; stated here because `PX_PER_FRAME_TO_PX_PER_SECOND` in
       * physics/player.ts is the same number, and the two must not drift apart.
       */
      fps: STEP_HZ,
      debug: false,
    },
  },
  /**
   * Order is load-bearing, twice over.
   *
   * Phaser auto-starts only the FIRST scene in this array, so the game now boots into
   * the difficulty screen rather than mid-level on a difficulty nobody chose. From
   * there each screen starts the next by hand — difficulty, character, then the level,
   * which launches the HUD alongside itself once it has a World to hand it. Title and
   * mode select land in front of DifficultyScene in a later task and will take over
   * being first.
   *
   * Phaser also RENDERS the scenes in this same order, which is why the HUD is listed
   * after the level: that is what puts it in front of the game rather than behind it. The
   * two menu screens are stopped long before either of those runs, so where they sit only
   * decides which one boots.
   *
   * The power-up announcement comes last of all, and that is the live draw order too:
   * index.html:3455 is `update();draw();drawPowerupPopup();`, and the HUD is drawn inside
   * `draw()` (:1854-1867). So its dim falls over the hearts and the score as well. The
   * frozen-world overlays sit between the two for the same reason and by the same rule:
   * :1898-1899 are the last lines of `draw()`, after the HUD, before the popup.
   *
   * The last three run the level loop rather than the level, and none of them is ever on
   * screen at the same time as another scene, so where they sit in this list decides
   * nothing at all — except that they must not be first, because first is what boots.
   */
  scene: [
    DifficultyScene,
    CharacterScene,
    SliceScene,
    HudScene,
    LevelOverlayScene,
    PowerupPopupScene,
    BetweenScene,
    GameOverScene,
    WinScene,
  ],
});

/**
 * A handle on the running game, for driving it by hand from a browser console: stepping
 * the loop one frame at a time (`game.loop.step(t)`), reading `world` out of the scene,
 * checking an invariant over a few hundred frames. Now that the frame-exact traces are
 * retired for the player (Plan 7), the browser IS where the physics gets checked, and
 * that check needs a way in.
 *
 * Dev only. Vite replaces `import.meta.env.DEV` with the literal `false` in a production
 * build, so the whole branch — and any promise it makes about the global — is dropped
 * from what the children are served.
 */
if (import.meta.env.DEV) {
  (globalThis as unknown as { game: Phaser.Game }).game = game;
}
