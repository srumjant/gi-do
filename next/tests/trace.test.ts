// The golden trace suite (Plan 2, Task 7) — the validation gate the whole migration
// exists for. Every script in inputScript.ts's SCRIPTS is driven, frame for frame,
// against both the live game (via driveLiveGame, a real Node VM running the actual
// index.html) and the port (createWorld/stepWorld), and the two traces must be
// EXACTLY equal — not toBeCloseTo. Both sides do the same IEEE-754 arithmetic in the
// same order; if they ever differ, the arithmetic differs, and that is a finding to
// fix or explain, not to paper over with a tolerance.
//
// Every script here is player-focused and runs with enemies LIVE on both sides — see
// the note on Level 0's doll@15 in inputScript.ts and in liveGame.ts's
// `suppressEnemies` option for why that used to not be true: contact damage was out
// of scope, so an enemy touching the player would make the two sides diverge for a
// reason that had nothing to do with the physics under test. Now that contact damage
// is implemented (player.ts's playerHit/playerDie, enemy.ts's stepEnemy), running with
// enemies live is the point — several of these scripts now walk right into doll@15 and
// die, and matching through that death — and through the 90-frame respawn — is exactly
// what this suite exists to prove. No frame count was shortened to dodge the doll.
//
// Suppression is per-script rather than global. A handful of scripts exist to test the
// player against real geometry (the gap at tile 20, the coyote window over it), and
// doll@15 kills any hold-right script at frame 60 — well before it can get there. With
// enemies on, those scripts silently become duplicates of every other frame-60 death:
// coyoteJumpLatest in particular collapsed into a byte-identical copy of coyoteJump,
// and the coyote window stopped being pinned by any trace at all. So the geometry
// scripts run with enemies off, everything else runs with them on, and dieAndRespawn
// covers the death-and-respawn path deliberately.
import { describe, expect, it } from 'vitest';
import { driveLiveGame } from './helpers/liveGame';
import { SCRIPTS, STOMP_SCRIPT } from './helpers/inputScript';
import { createWorld, stepWorld } from '../src/game/world';
import { findGroundY } from '../src/game/tiles';
import { LEVELS } from '../src/data/levels';
import { TILE } from '../src/config/constants';

/**
 * Scripts whose player is expected to die within their own frame window — a pit fall
 * or, now that contact damage exists, doll@15 catching up with a script that runs (or
 * stays) too close to it for too long. See each script's own comment in
 * inputScript.ts for which and why. Every other script must never die — if one does,
 * that is either a bug or a script whose frame count silently grew past a hazard, and
 * either way `toEqual` below would already have caught the actual divergence; this
 * just makes the expectation explicit instead of implicit.
 */
const EXPECT_DEATH = new Set([
  // Falls in the real pit at tile 20 — enemies suppressed so it can get there.
  'walkOffLedge',
  // Killed by doll@15 on contact, enemies live.
  'runningJump', 'walkCycle', 'dieAndRespawn',
]);

describe.each(Object.entries(SCRIPTS))('%s matches the live game', (name, script) => {
  it('agrees with the live game on every frame — player, camera, and enemies', () => {
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: script.frames, input: script.input,
      suppressEnemies: script.suppressEnemies,
    });

    const world = createWorld(0, 'normal');
    if (script.suppressEnemies) {
      world.pending.length = 0;
      world.enemies.length = 0;
    }

    const port: typeof live = [];
    const deadEachFrame: boolean[] = [];
    let prevJump = false;
    for (let f = 0; f < script.frames; f++) {
      const held = script.input(f);
      stepWorld(world, {
        left: held.left, right: held.right, jump: held.jump,
        jumpPressed: held.jump && !prevJump,
      });
      prevJump = held.jump;
      const p = world.player;
      port.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
        frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
          frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
        })),
        score: world.score,
      });
      deadEachFrame.push(world.dead);
    }

    expect(port).toEqual(live);

    // Death is now either bounded (the script's window ends while still frozen,
    // never reaching the 90-frame respawn) or it deliberately crosses the respawn —
    // and in both cases this asserts the shape directly rather than trusting the
    // blanket `toEqual` above to have caught a boundary drifting: a future change
    // that shifts the death or respawn frame fails LOUDLY on the line below, pointing
    // straight at the bound, instead of as a generic mismatch deep in a 100+ line diff.
    const deathFrame = deadEachFrame.indexOf(true);
    if (EXPECT_DEATH.has(name)) {
      expect(deathFrame).toBeGreaterThanOrEqual(0); // must actually die, or the checks below prove nothing
      const respawnFrame = deadEachFrame.indexOf(false, deathFrame + 1);
      if (respawnFrame === -1) {
        // "Bound the pit, don't hope it stays clear": never reaches its own respawn,
        // so it must stay frozen (dead) for the rest of its window.
        expect(script.frames - deathFrame).toBeLessThan(90);
      } else {
        // Crosses the full respawn cycle — the `toEqual` above already proved this
        // matches the live game frame for frame, through the freeze AND the rebuild;
        // this pins the exact mechanic (a respawn is exactly 90 frames after death,
        // no more, no less) so THAT claim fails loudly on its own if it ever drifts.
        expect(respawnFrame).toBe(deathFrame + 90);
      }
    } else {
      expect(deathFrame).toBe(-1);
    }
  });
});

describe('enemy trace vs. the live game (stomp, enemies enabled)', () => {
  // Level 0's enemyDefs, in order: doll@15, doll@28, car@40, bat@48, dino@55,
  // doll@65, bouncer@73, car@80, dino@90, bat@95, doll@105, dino@110. The live game
  // spawns every one of them, in this exact order, as the camera's spawn window
  // (camera.x + 640) reaches each column — normal difficulty has no enemySkipChance,
  // so nothing is ever skipped on that side. That makes live's `enemies[i]` always
  // `enemyDefs[i]`, for however many have spawned so far.
  //
  // The port only implements ground patrollers — doll, car, dino, penguin (see
  // enemy.ts's ENEMY_SPRITES) — and spawnEnemy returns undefined for everything else,
  // so the spawn window still marks a non-patroller def `spawned` (consuming it at
  // exactly the frame the live game would have spawned it, so LATER defs still line
  // up), but never pushes anything for it. That makes port's `enemies[i]` the i-th
  // PATROLLER entry of enemyDefs, not enemyDefs[i] itself. The instant a non-patroller
  // spawns on live's side, raw index alignment breaks (comparing live's enemies[3] to
  // port's enemies[3] would compare a dino to a bat) — so this keys every enemy by
  // type + spawn column instead of position.
  //
  // STOMP_SCRIPT's own camera range never reaches that far — the player never
  // approaches the first gap (x stays under 280 the whole 100 frames; even at the
  // absolute limit of standing safely on the near side of that gap, the spawn window
  // tops out at column 47, one short of bat@48 — see inputScript.ts), so this
  // particular trace only ever sees doll@15, doll@28 and car@40, all patrollers, and
  // never concretely exercises a skip. Identity-based keying is used anyway, because
  // it is the correct general method for this level, not because this script needs
  // it to pass; bat@48 and the rest of enemyDefs are declared but deliberately absent
  // from both sides' `enemies` throughout this trace.
  const ALL_DEFS = LEVELS[0].enemyDefs;
  const PORT_PATROLLER_TYPES = new Set(['doll', 'car', 'dino', 'penguin']);
  const PORT_DEFS = ALL_DEFS.filter((d) => PORT_PATROLLER_TYPES.has(d.type));

  function keyOf(type: string, spawnColumn: number): string {
    return `${type}@${spawnColumn}`;
  }

  it('the player matches, and every patroller the port spawns matches its live counterpart by identity', () => {
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: STOMP_SCRIPT.frames, input: STOMP_SCRIPT.input,
      // suppressEnemies deliberately omitted: this is the one trace where enemies
      // are enabled on both sides.
    });

    const world = createWorld(0, 'normal'); // enemies enabled — no suppression here
    let prevJump = false;
    const port: typeof live = [];
    for (let f = 0; f < STOMP_SCRIPT.frames; f++) {
      const held = STOMP_SCRIPT.input(f);
      stepWorld(world, {
        left: held.left, right: held.right, jump: held.jump,
        jumpPressed: held.jump && !prevJump,
      });
      prevJump = held.jump;
      const p = world.player;
      port.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
        frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: world.enemies.map((e) => ({
          type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
          frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
        })),
        score: world.score,
      });
    }

    // The player side is a plain frame-by-frame comparison, same as every script
    // above — no identity keying needed for a single actor.
    for (let f = 0; f < STOMP_SCRIPT.frames; f++) {
      expect(port[f].x).toBe(live[f].x);
      expect(port[f].y).toBe(live[f].y);
      expect(port[f].vx).toBe(live[f].vx);
      expect(port[f].vy).toBe(live[f].vy);
      expect(port[f].onGround).toBe(live[f].onGround);
      expect(port[f].frame).toBe(live[f].frame);
      expect(port[f].frameTimer).toBe(live[f].frameTimer);
      expect(port[f].animFrame).toBe(live[f].animFrame);
      expect(port[f].camera).toEqual(live[f].camera);
      // The stomp is a scoring event (index.html:1545's `score+=Math.round(200*
      // dc.scoreMultiplier)`), so this trace is where that award is pinned: 0 for
      // every frame before the stomp, 200 at normal's 1.0 multiplier from the stomp
      // frame on, and never a second time for the same already-dead doll.
      expect(port[f].score).toBe(live[f].score);
    }

    // Sanity: the script must actually DO the thing it is named for, or the
    // comparison below proves nothing. doll@15 is enemyDefs[0].
    const doll15Key = keyOf(ALL_DEFS[0].type, ALL_DEFS[0].x);
    let stompFrame = -1;
    const doll15SquashTimers: number[] = [];

    for (let f = 0; f < STOMP_SCRIPT.frames; f++) {
      const liveEnemies = live[f].enemies;
      const portEnemies = port[f].enemies;

      // live[f].enemies[i] is ALL_DEFS[i], for however many have spawned by frame f.
      const liveByKey = new Map(
        liveEnemies.map((e, i) => [keyOf(e.type, ALL_DEFS[i].x), e]),
      );
      // port[f].enemies[i] is PORT_DEFS[i] (the i-th patroller-type def), for however
      // many patrollers have spawned by frame f.
      for (let i = 0; i < portEnemies.length; i++) {
        const key = keyOf(portEnemies[i].type, PORT_DEFS[i].x);
        expect(portEnemies[i].type).toBe(PORT_DEFS[i].type); // sanity on the key itself
        const liveEnemy = liveByKey.get(key);
        expect(liveEnemy, `frame ${f + 1}: no live enemy keyed ${key} (port has one)`).toBeDefined();
        expect(portEnemies[i].x).toBe(liveEnemy!.x);
        expect(portEnemies[i].y).toBe(liveEnemy!.y);
        expect(portEnemies[i].vx).toBe(liveEnemy!.vx);
        expect(portEnemies[i].alive).toBe(liveEnemy!.alive);
        expect(portEnemies[i].frame).toBe(liveEnemy!.frame);
        expect(portEnemies[i].frameTimer).toBe(liveEnemy!.frameTimer);
        expect(portEnemies[i].squashTimer).toBe(liveEnemy!.squashTimer);

        if (key === doll15Key && !portEnemies[i].alive && stompFrame < 0) stompFrame = f + 1;
        if (key === doll15Key) doll15SquashTimers.push(portEnemies[i].squashTimer);
      }

      // bat@48 and everything after it in ALL_DEFS is deliberately absent from BOTH
      // arrays throughout this trace — the camera never gets there (see the comment
      // above the describe block) — asserted here rather than assumed, so a future
      // change to this script that DID reach it would fail loudly instead of
      // silently comparing past the point where the two arrays stop lining up.
      expect(liveEnemies.length).toBeLessThanOrEqual(3);
      expect(portEnemies.length).toBeLessThanOrEqual(3);
    }

    expect(stompFrame).toBeGreaterThan(0); // doll@15 was actually stomped, not just present

    // ...and the stomp really did pay out on the live side, so the per-frame `score`
    // comparison above is two sides agreeing on 200, not two sides agreeing on 0.
    // 200 is `Math.round(200 * dc.scoreMultiplier)` at normal's multiplier of 1.0, and
    // it is awarded exactly once — a squashed doll is not re-stomped while its
    // squashTimer runs down.
    expect(live[live.length - 1].score).toBe(200);

    // The squash countdown (index.html:1215, 1525, 1545) is a real behaviour change —
    // a stomped enemy now persists, flattened, for 30 frames instead of vanishing the
    // instant it dies — and this window is long enough to watch the whole thing play
    // out: 30 right after the stomp, decaying strictly, and settled at 0 well before
    // the trace ends, not just "still counting down when the window runs out".
    expect(doll15SquashTimers[stompFrame - 1]).toBe(30);
    expect(doll15SquashTimers[doll15SquashTimers.length - 1]).toBe(0);
    expect(doll15SquashTimers).toContain(0); // reached 0, not merely trending toward it
  });
});

describe('the bow and super pickups vs. the live game', () => {
  // Level 1's record is `bowPositions:[35,70], superPositions:[22,85]`, which the spawn
  // (world.ts's buildLevelState) resolves against the real map into the bow at
  // (560, 352) — resting on the base ground — and the super at (352, 352).
  //
  // Tile 22 is INSIDE the level's first pit, which is worth knowing before reading the
  // script below. `addGaps` carves `[[20,3]]` at normal's gapWidth of 1.0, i.e. columns
  // 20, 21 AND 22, so the super's own column has no solid tile anywhere in it,
  // `findGroundY` falls through to its bottom-row fallback, and the pickup ends up
  // hanging in mid-air over the hole. It is still collectable on foot from the right-
  // hand lip: the player keeps standing while EITHER of its two floor probes is still
  // over column 23, and that leaves a few pixels where the hitboxes already overlap and
  // the ground has not yet run out. This script takes exactly that — walk right onto
  // the bow, turn around, walk back, clip the super off the lip, and carry on into the
  // pit — which is why it ends in a death that has nothing to do with the pickups.
  //
  // Real, unmutated level-1 geometry throughout; no mutateMap. The teleport is only to
  // skip the walk (the same reason world.test.ts's rescue trace teleports): tile 33 is
  // 31 tiles from spawn, across that same pit, and choreographing a script that clears
  // it is a jump-timing problem with nothing to do with pickups. Enemies are suppressed
  // on both sides for the same reason they are in the rescue trace — doll@28 and car@40
  // are both inside the spawn window the instant the camera starts moving, and what
  // they do to a player walking back and forth is not what this trace is about.
  const REF = createWorld(0, 'normal', 'gigi');
  const BOW = REF.bowPickups[0];
  const BOW_TILE = BOW.x / TILE;
  /** Two tiles short of the bow, standing on the ground the bow itself rests on. */
  const START_X = BOW.x - 2 * TILE;
  const START_Y = findGroundY(REF.map, BOW_TILE) - REF.player.h;
  /**
   * Frames of "hold right" before turning around. Nine would do (the grounded ramp
   * covers 0.6, 1.2, 1.8, 2.4 and then 2.5 a frame, and a 16px-wide player only has to
   * reach BOW.x - 16); fourteen leaves margin without carrying the player past the
   * pickup. If it ever stopped being enough, `bowFrame` below fails outright rather
   * than quietly asserting nothing.
   */
  const RIGHT_FRAMES = 14;
  /**
   * The walk back is the long part: ~13 tiles at 2.5px a frame, then the fall. The
   * player dies in the pit at frame 121 and 140 leaves it frozen for the rest — well
   * short of the 90-frame respawn, which would take the bow and the cape straight back
   * off it again (respawnLevel rebuilds the pickups; only `score` survives a death).
   */
  const FRAMES = 140;

  interface Powerups { hasBow: boolean; bowCharges: number; hasCape: boolean }

  const script = (f: number) => ({
    left: f >= RIGHT_FRAMES, right: f < RIGHT_FRAMES, jump: false,
  });

  it('grants the bow and the cape on the same frames the live game does', () => {
    // hasBow/bowCharges/hasCape are per-actor fields only this trace cares about, so
    // they come through `onFrame` into a side channel rather than growing the shared
    // Sample shape. `score` is in Sample already — it is a run-level global.
    const livePowerups: Powerups[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      suppressEnemies: true,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d) => {
        const p = d.getPlayer();
        livePowerups.push({
          hasBow: p.hasBow as boolean,
          bowCharges: p.bowCharges as number,
          hasCape: p.hasCape as boolean,
        });
      },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;

    const port: typeof live = [];
    const portPowerups: Powerups[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const held = script(f);
      stepWorld(world, { ...held, jumpPressed: false });
      const p = world.player;
      port.push({
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
        frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
        camera: { x: world.camera.x, y: world.camera.y },
        enemies: [],
        score: world.score,
      });
      portPowerups.push({
        hasBow: p.hasBow, bowCharges: p.bowCharges, hasCape: p.hasCape,
      });
    }

    // Position, velocity, camera and score, frame for frame — the usual comparison.
    expect(port).toEqual(live);
    // And the pickup state itself, frame for frame: not just "both ended up with a
    // bow" but "both gained it, and its charges, on the same frame".
    expect(portPowerups).toEqual(livePowerups);

    // The script must actually collect both, in that order, or everything above is
    // comparing two identically empty runs.
    const bowFrame = portPowerups.findIndex((s) => s.hasBow);
    const capeFrame = portPowerups.findIndex((s) => s.hasCape);
    expect(bowFrame).toBeGreaterThanOrEqual(0);
    expect(capeFrame).toBeGreaterThan(bowFrame);

    // Charges arrive with the bow and nothing in this window spends them. The number
    // comes off the difficulty record (3 at normal, 8 at super_easy, 2 at hard) — a
    // distinction no trace can show, since every trace runs at normal.
    expect(portPowerups[bowFrame].bowCharges).toBe(world.dc.bowCharges);
    expect(portPowerups[FRAMES - 1].bowCharges).toBe(world.dc.bowCharges);

    // Neither pickup is worth points. Stars, stomps, arrow kills, the cat and the
    // rescue score; picking up the bow or the cape does not.
    expect(live.every((s) => s.score === 0)).toBe(true);
  });
});
