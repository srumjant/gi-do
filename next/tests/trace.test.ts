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
import { afterEach, describe, expect, it } from 'vitest';
import { driveLiveGame, type ArrowSample, type CatSample } from './helpers/liveGame';
import { SCRIPTS, STOMP_SCRIPT } from './helpers/inputScript';
import { createWorld, respawnLevel, stepWorld } from '../src/game/world';
import { findGroundY, rectOverlap } from '../src/game/tiles';
import { setRandom } from '../src/game/random';
import { LEVELS, TILE_BRICK, TILE_QUESTION, TILE_RAINBOW } from '../src/data/levels';
import { GRAVITY, TILE } from '../src/config/constants';

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
        firePressed: false,
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
        firePressed: false,
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
    left: f >= RIGHT_FRAMES, right: f < RIGHT_FRAMES, jump: false, fire: false,
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
      stepWorld(world, { ...held, jumpPressed: false, firePressed: false });
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

// ---------------------------------------------------------------------------
// The three silly power-ups (Plan 5, Task 2).
//
// The only thing that grants one is a rainbow block taken from below, and both sides'
// `Math.random` resolves to a constant 0.5 here, so the ONLY branch a trace can ever
// reach through the real trigger is `bighead` (the rainbow-block trace at the bottom of
// this file does exactly that). What a trace can do for the other two is seed the timers
// on both sides — the driver's `beforeRun` writes the live game's own `player` object,
// and the port's is just a field — and then compare what the live game does with a fart
// or a big head against what the port does. That is where these three live: the effects
// are the interesting part, and they are all reachable this way. The GRANT itself (which
// branch sets which field) is unit-tested in player.test.ts for the same reason.
// ---------------------------------------------------------------------------

/** Standard Sample projection off the port's World — the same shape every trace pushes. */
function sampleWorld(world: ReturnType<typeof createWorld>) {
  const p = world.player;
  return {
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround,
    frame: p.frame, frameTimer: p.frameTimer, animFrame: world.animFrame,
    camera: { x: world.camera.x, y: world.camera.y },
    enemies: world.enemies.map((e) => ({
      type: e.type, x: e.x, y: e.y, vx: e.vx, vy: e.vy, alive: e.alive,
      frame: e.frame, frameTimer: e.frameTimer, squashTimer: e.squashTimer,
    })),
    score: world.score,
  };
}

describe('the fart jump vs. the live game', () => {
  // index.html:1383 — `p.vy = p.fartTimer>0 ? dc.jumpForce*1.5 : dc.jumpForce`. The
  // multiplier is applied at the assignment and NOWHERE else, which matters: the
  // variable-height cut on the very next line still measures against the unmultiplied
  // `dc.jumpForce*0.4`, so this script holds the button down through the whole rise
  // rather than tapping it, and the jump is the full 1.5x one all the way up.
  //
  // Enemies suppressed: this is about one number on one frame, and doll@15 would kill
  // a stationary player around frame 240 for reasons with nothing to do with it.
  const FRAMES = 60;
  const JUMP_FRAME = 5;
  const script = (f: number) => ({ left: false, right: false, jump: f >= JUMP_FRAME, fire: false });

  const REF = createWorld(0, 'normal', 'gigi');
  const START_TILE = LEVELS[0].playerStart[0];
  const START_X = START_TILE * TILE;
  const START_Y = findGroundY(REF.map, START_TILE) - REF.player.h;

  it('jumps 1.5x as hard while the fart timer runs, and burns the timer down a frame at a time', () => {
    const liveFartTimers: number[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      suppressEnemies: true,
      beforeRun: (d) => {
        // Planted on the ground rather than dropped from playerStart, so the jump fires
        // on a known frame instead of whenever the fall happens to land.
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
        p.fartTimer = 900; // index.html:1151
      },
      onFrame: (d) => { liveFartTimers.push(d.getPlayer().fartTimer as number); },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;
    world.player.fartTimer = 900;

    const port: typeof live = [];
    const portFartTimers: number[] = [];
    let prevJump = false;
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: h.jump && !prevJump, firePressed: false });
      prevJump = h.jump;
      port.push(sampleWorld(world));
      portFartTimers.push(world.player.fartTimer);
    }

    expect(port).toEqual(live);
    // The countdown itself (index.html:1432): one per frame, from 900, starting on the
    // very first stepped frame — so a 900-frame power-up really does last 900 frames.
    expect(portFartTimers).toEqual(liveFartTimers);
    expect(portFartTimers[0]).toBe(899);
    expect(portFartTimers[FRAMES - 1]).toBe(900 - FRAMES);

    // The number the whole feature is: jumpForce (-7.5 at normal) times 1.5, plus the
    // same frame's gravity, which is applied after the jump assignment. A plain jump
    // would read -7.1 here; this is -10.85.
    expect(port[JUMP_FRAME].vy).toBe(world.dc.jumpForce * 1.5 + GRAVITY);
    expect(port[JUMP_FRAME].onGround).toBe(false);
    // ...and it really does clear more height than an unmultiplied jump could. Ideal
    // rise for an initial vy is vy^2 / (2*GRAVITY); the plain force cannot reach even
    // that bound, so beating it is proof the 1.5x was applied and not merely asserted.
    const plainBound = START_Y - (world.dc.jumpForce ** 2) / (2 * GRAVITY);
    expect(Math.min(...port.map((f) => f.y))).toBeLessThan(plainBound);
  });
});

describe('the fart stink cloud vs. the live game', () => {
  // index.html:1439-1443 (the cloud) and :1526 (what a stun does). Enemies LIVE — the
  // whole point is what happens to doll@15, which without a fart kills this exact
  // hold-right script on contact at frame 60 (see EXPECT_DEATH above).
  //
  // 110 frames: long enough to see the stun start, watch the player walk clean through
  // the paralysed doll, and watch the counter tick back down alone once the player is
  // out of range — and short enough to stop before the pit at tile 20, whose death
  // would be about geometry rather than about the fart.
  const FRAMES = 110;
  const script = () => ({ left: false, right: true, jump: false, fire: false });

  it('stuns doll@15 cumulatively, freezes it whole, and lets the player walk through it unharmed', () => {
    const liveStun: number[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => { d.getPlayer().fartTimer = 900; },
      // The live enemy has NO stunTimer field until the cloud first adds one
      // (index.html:1442's `(e.stunTimer||0)+120` is lazy). The port's EnemyState always
      // carries one, starting at 0, so the live side is normalised the same way its own
      // source normalises it — that `||0` is the live game agreeing this is 0.
      onFrame: (d) => {
        const doll = d.getEnemies()[0];
        liveStun.push(doll === undefined ? 0 : ((doll.stunTimer as number) ?? 0));
      },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.player.fartTimer = 900;

    const port: typeof live = [];
    const portStun: number[] = [];
    const portDead: boolean[] = [];
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, { ...script(), jumpPressed: false, firePressed: false });
      port.push(sampleWorld(world));
      portStun.push(world.enemies[0]?.stunTimer ?? 0);
      portDead.push(world.dead);
    }

    // Position, velocity, camera, score AND every enemy's own motion, frame for frame.
    // A stunned enemy is frozen whole, so this alone is most of the claim.
    expect(port).toEqual(live);
    expect(portStun).toEqual(liveStun);

    // doll@15 is enemies[0] on both sides for this whole window, and nothing past
    // car@40 streams in — asserted so the keying above stays honest if the script grows.
    expect(port.every((f) => f.enemies.length <= 3)).toBe(true);
    expect(port[FRAMES - 1].enemies[0].type).toBe('doll');

    // The cloud is CUMULATIVE and UNBOUNDED: +120 every frame in range, -1 for that
    // frame's own countdown, so a net +119 per frame. Ten frames of standing near an
    // enemy is nearly twenty seconds of paralysis, and this script is nowhere near
    // standing still.
    const first = portStun.findIndex((v) => v > 0);
    expect(first).toBeGreaterThan(0);
    expect(portStun[first]).toBe(119);
    expect(portStun[first + 1]).toBe(238);
    expect(portStun[first + 9]).toBe(119 * 10);
    // It keeps climbing well past any single grant, then decays by exactly 1 a frame
    // once the player is out of range — never reset, never capped.
    const peak = Math.max(...portStun);
    expect(peak).toBeGreaterThan(4000);
    const peakAt = portStun.indexOf(peak);
    expect(portStun[peakAt + 1]).toBe(peak - 1);
    expect(portStun[FRAMES - 1]).toBeGreaterThan(4000);

    // Frozen whole from the first stunned frame on: no walking, no gravity, no frame
    // flip. The live doll walks left at -0.8 until then, so this is a real change.
    const dollAt = (f: number) => port[f].enemies[0];
    expect(dollAt(first - 1).x).toBeLessThan(dollAt(0).x); // was walking
    expect(dollAt(FRAMES - 1).x).toBe(dollAt(first).x); // has not moved since
    expect(dollAt(FRAMES - 1).frameTimer).toBe(dollAt(first).frameTimer);

    // And the payoff: the stun `return` at index.html:1526 sits ABOVE the stomp box and
    // the contact check, so a stunned enemy cannot hurt you. This script walks the
    // player's box straight across the doll's — the same contact that kills it at frame
    // 60 without a fart — and nothing happens to either of them.
    const overlapped = port.some((f) => {
      const d = f.enemies[0];
      return f.x + 2 < d.x + 14.4 && f.x + 2 + 12 > d.x;
    });
    expect(overlapped).toBe(true);
    expect(portDead.includes(true)).toBe(false);
    expect(port[FRAMES - 1].enemies[0].alive).toBe(true); // not stomped either
    expect(port[FRAMES - 1].score).toBe(0);
  });
});

describe('the big head vs. the live game', () => {
  // index.html:1542-1546. Two separate changes to the same check, both pinned here by
  // running the existing stomp script with the timer seeded:
  //
  //   - `bhx` widens the player/enemy overlap box by 8px each side, so contact happens
  //     EARLIER. Without a big head this script stomps doll@15 on frame 60; with one,
  //     on frame 58. That is the widened box, visible as a date on the calendar.
  //   - `squashTimer` is overwritten from 30 to 45, so the flattened doll lingers half
  //     again as long.
  //
  // The `shm` multiplier is exercised too (1 * 1.5 at normal), though not separably
  // from `bhx` in a single trace. Its COMPOUNDING with `dc.stompHitbox` is a super_easy
  // behaviour no trace can reach yet — see enemy.test.ts.
  it('stomps earlier through a wider box and flattens for 45 frames instead of 30', () => {
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: STOMP_SCRIPT.frames, input: STOMP_SCRIPT.input,
      beforeRun: (d) => { d.getPlayer().bigHeadTimer = 1200; }, // index.html:1152
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.player.bigHeadTimer = 1200;

    const port: typeof live = [];
    const portBigHead: number[] = [];
    let prevJump = false;
    for (let f = 0; f < STOMP_SCRIPT.frames; f++) {
      const h = STOMP_SCRIPT.input(f);
      stepWorld(world, { ...h, jumpPressed: h.jump && !prevJump, firePressed: false });
      prevJump = h.jump;
      port.push(sampleWorld(world));
      portBigHead.push(world.player.bigHeadTimer);
    }

    expect(port).toEqual(live);
    // index.html:1433, the same one-a-frame countdown the fart timer gets.
    expect(portBigHead[0]).toBe(1199);
    expect(portBigHead[STOMP_SCRIPT.frames - 1]).toBe(1200 - STOMP_SCRIPT.frames);

    // The stomp must actually happen, or everything below is comparing two runs in
    // which nothing occurred.
    const killFrame = port.findIndex((f) => f.enemies.some((e) => !e.alive));
    expect(killFrame).toBeGreaterThan(0);
    // 45, not 30 (index.html:1546 overwriting :1545), and it counts down from there.
    expect(port[killFrame].enemies[0].squashTimer).toBe(45);
    expect(port[killFrame + 1].enemies[0].squashTimer).toBe(44);
    // Same 200 points as a plain stomp — big head does not change the award.
    expect(port[killFrame].score).toBe(Math.round(200 * world.dc.scoreMultiplier));

    // The widened box, as a frame number: the identical script without a big head
    // stomps this same doll two frames later. Anchored to the existing enemy trace
    // above, which already pins that run against the live game frame for frame.
    const plain = createWorld(0, 'normal', 'gigi');
    let prevJ = false;
    let plainKill = -1;
    for (let f = 0; f < STOMP_SCRIPT.frames; f++) {
      const h = STOMP_SCRIPT.input(f);
      stepWorld(plain, { ...h, jumpPressed: h.jump && !prevJ, firePressed: false });
      prevJ = h.jump;
      if (plainKill < 0 && plain.enemies.some((e) => !e.alive)) plainKill = f;
    }
    expect(plainKill).toBe(killFrame + 2);
  });
});

// ---------------------------------------------------------------------------
// Blocks taken from below (Plan 5, Task 3) — index.html:1417-1421, inside the head-hit
// branch of the Y sweep.
//
// Both scripts plant the player on the platform directly under a block and hold jump.
// `?` and rainbow are two lists swept separately off the same collision, so they get a
// trace each: one for the star a question block pays out, one for the silly power-up a
// rainbow block pays out — and, far more disruptive, the 120-frame full-world freeze
// that comes with it.
// ---------------------------------------------------------------------------

/** Just the four fields a live `stars` entry carries (index.html:1419). */
interface StarSample { x: number; y: number; vy: number; collected: boolean }

/**
 * The standard Sample with every ENEMY's `vy` dropped — the player's is kept.
 *
 * A noGravity flyer (bat/icebat) never has its `vy` assigned on the live side: the
 * gravity block that is the only thing which ever writes it is skipped entirely for
 * one, so the field stays `undefined` there forever, while this port's uniformly
 * shaped EnemyState always carries a real 0. A representational difference between an
 * ad-hoc live object and a uniform one, not a physics difference — enemy.test.ts's own
 * bat/bouncer trace and the STOMP_SCRIPT comparison above both omit enemy `vy` for
 * exactly this reason. The rainbow-block trace below is the first `toEqual`-style
 * comparison with bat@48 inside its window, so it needs the same treatment; the shape
 * is projected rather than the fields compared one at a time so the single blanket
 * assertion still covers everything else.
 */
function stripEnemyVy<S extends { enemies: Array<{ vy: number }> }>(s: S) {
  return {
    ...s,
    enemies: s.enemies.map((e) => {
      const { vy: _vy, ...rest } = e;
      return rest;
    }),
  };
}

describe('the question block vs. the live game', () => {
  // Level 1's question blocks are at tiles [12,16] [32,13] [55,15] [72,14] [90,15] and
  // [102,16] (index.html:891). This one is the block at column 12, which sits three rows
  // above the platform `addPlats` writes at [10,19,5] (columns 10-14) — a plain standing
  // jump from that platform reaches its underside on the second frame of the rise.
  //
  // buildLevelState scans the map row by row, so `questionBlocks[0]` is [32,13], NOT the
  // first entry of the level record's own list. Looked up by column, not by index.
  const REF = createWorld(0, 'normal', 'gigi');
  const QB = REF.questionBlocks.find((b) => b.x === 12)!;
  /**
   * The platform's top. Deliberately NOT `findGroundY` of the block's OWN column:
   * findGroundY scans DOWNWARD from row 0 and stops at the first solid tile, which in
   * column 12 is the question block itself — 48px above the floor the player actually
   * stands on. Column 11 is the same platform with nothing above it.
   */
  const PLATFORM_TOP = findGroundY(REF.map, QB.x - 1);
  /**
   * Standing exactly on the block's own column boundary. The Y sweep probes at `x+3`
   * and `x+w-3`, which for a 16px-wide player is x+3 and x+13 — both inside this one
   * tile, so `h1 === h2` here and the second pass over each list finds nothing (the
   * `!hit` guard has already been flipped by the first). The straddle where the two
   * probes DO name different columns is common enough, but level 1 has no two blocks
   * adjacent in a row, so nothing here can pop two off one jump.
   */
  const START_X = QB.x * TILE;
  const START_Y = PLATFORM_TOP - REF.player.h;
  const JUMP_FRAME = 5;
  /**
   * The star's whole life: it leaves the block at -2, decelerates by 0.1 a frame for
   * about twenty frames, and then hangs there forever. 60 frames covers the bump, the
   * entire ramp, and a long tail with the star provably parked.
   */
  const FRAMES = 60;
  const script = (f: number) => ({ left: false, right: false, jump: f >= JUMP_FRAME, fire: false });

  // Enemies suppressed on both sides: doll@15 and car@40 are both inside the spawn
  // window from the first frame (the camera clamps to 0 at this x), and what they do
  // walking along the floor three tiles below the platform is not what this trace is
  // about. The rainbow-block trace below runs with them live, where they earn their keep.
  it('pops the block into a brick and spawns a star one tile above it', () => {
    const liveStars: StarSample[][] = [];
    const liveTile: number[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      suppressEnemies: true,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d) => {
        const stars = d.getLevelSpawn().stars as StarSample[];
        liveStars.push(stars.map((s) => ({
          x: s.x, y: s.y, vy: s.vy, collected: s.collected,
        })));
        liveTile.push(d.getMap()[QB.y][QB.x]);
      },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;
    expect(world.map[QB.y][QB.x]).toBe(TILE_QUESTION); // sanity: aiming at a real one

    const port: typeof live = [];
    const portStars: StarSample[][] = [];
    const portTile: number[] = [];
    let prevJump = false;
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: h.jump && !prevJump, firePressed: false });
      prevJump = h.jump;
      port.push(sampleWorld(world));
      portStars.push(world.stars.map((s) => ({
        x: s.x, y: s.y, vy: s.vy, collected: s.collected,
      })));
      portTile.push(world.map[QB.y][QB.x]);
    }

    // Player, camera, animFrame and score frame for frame, as every trace does...
    expect(port).toEqual(live);
    // ...and the two things this one is actually about: the star's whole flight, and
    // the map cell underneath it, on the same frames.
    expect(portStars).toEqual(liveStars);
    expect(portTile).toEqual(liveTile);

    // The bump must actually happen, or everything below compares two empty runs.
    const bump = portStars.findIndex((s) => s.length > 0);
    expect(bump).toBeGreaterThan(JUMP_FRAME); // on the rise, not on the standing frames
    expect(portStars[bump - 1]).toEqual([]);

    // Tile 3 becomes tile 2 (index.html:1419). Both are solid — `isSolid` takes 1, 2, 3
    // and 5 — so this changes nothing about collision and everything about what it is.
    expect(portTile.slice(0, bump)).toEqual(Array(bump).fill(TILE_QUESTION));
    expect(portTile.slice(bump)).toEqual(Array(FRAMES - bump).fill(TILE_BRICK));
    // ...and exactly one block was bumped: the one aimed at, not its five siblings.
    expect(world.questionBlocks.filter((b) => b.hit)).toEqual([{ ...QB, hit: true }]);

    // One star, one tile ABOVE the block (`qb.y*TILE - TILE`), at the block's own
    // column, moving at -2. world.ts's stepStars runs later in the SAME step as the
    // bump, so the earliest state any trace can observe is already one ramp step along
    // — hence the `+ 0.1` and the y that has already moved by the stepped vy.
    const SPAWN_Y = QB.y * TILE - TILE;
    expect(portStars[bump]).toEqual([
      { x: QB.x * TILE, y: SPAWN_Y + (-2 + 0.1), vy: -2 + 0.1, collected: false },
    ]);
    expect(portStars[FRAMES - 1]).toHaveLength(1); // never a second one

    // The ramp is ONE-WAY (world.ts's stepStars): the star rises, decelerates, and
    // stops dead the frame vy would go positive. It never falls back, and once vy is
    // exactly 0 the `if (s.vy)` truthiness guard freezes it for the rest of the level.
    const ys = portStars.slice(bump).map((s) => s[0].y);
    const vys = portStars.slice(bump).map((s) => s[0].vy);
    expect(Math.max(...ys)).toBe(ys[0]); // highest y is the first — it only ever rose
    expect(ys.every((y, i) => i === 0 || y <= ys[i - 1])).toBe(true);
    expect(vys.every((v) => v <= 0)).toBe(true); // clamped, never positive
    const stopped = vys.indexOf(0);
    expect(stopped).toBeGreaterThan(0); // it really does come to rest inside the window
    expect(vys.slice(stopped).every((v) => v === 0)).toBe(true);
    expect(ys.slice(stopped).every((y) => y === ys[stopped])).toBe(true);
    // It went somewhere before it stopped — a whole tile's worth of rise, not a twitch.
    expect(ys[stopped]).toBeLessThan(SPAWN_Y - TILE);

    // Uncollected throughout, and therefore unscored: the star hangs in the tile
    // directly above a block the player is standing UNDER, and that block is solid, so
    // there is no way up to it from here. Stars are worth 100 * dc.scoreMultiplier when
    // they ARE caught (world.ts's stepStars); nothing in this window catches one.
    expect(portStars.every((s) => s.every((v) => !v.collected))).toBe(true);
    expect(port[FRAMES - 1].score).toBe(0);
    expect(world.dead).toBe(false);
  });

  // A bump mutates the map and both block lists, and `respawnLevel` (world.ts) is what
  // undoes it: index.html:1163's initLevel opens with `map=lvl.generate(dc)` and
  // re-derives every table from that fresh map, so dying restores every block bumped
  // before the death and takes the stars back with it.
  //
  // Port-side only, and deliberately: WHAT a respawn rebuilds is already compared
  // against the live game's own initLevel by world.test.ts's spawn-table parity check
  // (all four difficulties, all six levels) and the whole death-and-respawn cycle is
  // compared frame for frame by the dieAndRespawn script above. What neither of those
  // can show is a block that was bumped FIRST, because until now nothing could bump one.
  it('gives the block back on a respawn', () => {
    const world = createWorld(0, 'normal', 'gigi');
    world.pending.length = 0;
    world.enemies.length = 0;
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;

    let prevJump = false;
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: h.jump && !prevJump, firePressed: false });
      prevJump = h.jump;
    }
    // Sanity: there is something to undo.
    expect(world.map[QB.y][QB.x]).toBe(TILE_BRICK);
    expect(world.questionBlocks.some((b) => b.hit)).toBe(true);
    expect(world.stars).toHaveLength(1);

    respawnLevel(world);

    expect(world.map[QB.y][QB.x]).toBe(TILE_QUESTION);
    expect(world.questionBlocks.some((b) => b.hit)).toBe(false);
    expect(world.stars).toEqual([]);
  });
});

describe('the rainbow block vs. the live game', () => {
  // Level 1's single rainbow block is at tile [43,12] (index.html:892), three rows above
  // the platform at [42,15,3] (columns 42-44) — the same standing-jump geometry as the
  // question block above. Enemies run LIVE on both sides here, unlike that trace,
  // because the freeze this block causes is a claim about them too: index.html:1276
  // returns out of update() before the enemy step, so a rainbow block stops the dolls
  // and the bat mid-stride along with the player and the camera.
  //
  // Six of level 1's enemy defs stream in inside this window (doll@15, doll@28, car@40,
  // bat@48, dino@55, doll@65) and the port implements all six types, so the two sides'
  // `enemies` arrays line up index for index and the standard sample comparison covers
  // them with no keying. bat@48 draws its sineOffset from random.ts's seam at spawn,
  // which is why this pins the port's draw to the same 0.5 the live driver's sandboxed
  // Math.random already returns.
  afterEach(() => setRandom(Math.random));

  const REF = createWorld(0, 'normal', 'gigi');
  const RB = REF.rainbowBlocks[0]; // the level's only one
  /** Column 42: the same platform, without the rainbow block sitting above it. */
  const PLATFORM_TOP = findGroundY(REF.map, RB.x - 1);
  const START_X = RB.x * TILE;
  const START_Y = PLATFORM_TOP - REF.player.h;
  const JUMP_FRAME = 5;
  /**
   * Long enough to matter: the bump lands on frame 6, the world is then frozen for 120
   * frames, and 200 leaves ~70 frames on the far side — the player falls back to the
   * platform and lands, the camera finishes its lerp and settles, the enemies walk on
   * and two more stream in. A window that stopped inside the freeze would prove almost
   * nothing, since a frozen world matching a frozen world is trivially true.
   */
  const FRAMES = 200;
  const script = (f: number) => ({ left: false, right: false, jump: f >= JUMP_FRAME, fire: false });

  interface Powerups {
    fartTimer: number; bigHeadTimer: number; chickenRayCharges: number; hasBow: boolean;
  }

  it('grants a big head, freezes the whole world for 120 frames, and lets it go again', () => {
    const livePowerups: Powerups[] = [];
    const liveTile: number[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d) => {
        const p = d.getPlayer();
        livePowerups.push({
          fartTimer: p.fartTimer as number,
          bigHeadTimer: p.bigHeadTimer as number,
          chickenRayCharges: p.chickenRayCharges as number,
          hasBow: p.hasBow as boolean,
        });
        liveTile.push(d.getMap()[RB.y][RB.x]);
      },
    });

    setRandom(() => 0.5); // the live driver's own stubbed Math.random
    const world = createWorld(0, 'normal', 'gigi');
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;
    expect(world.map[RB.y][RB.x]).toBe(TILE_RAINBOW); // sanity: aiming at a real one

    const port: typeof live = [];
    const portPowerups: Powerups[] = [];
    const portTile: number[] = [];
    const portPopup: Array<{ type: string; timer: number; maxTimer: number } | null> = [];
    let prevJump = false;
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: h.jump && !prevJump, firePressed: false });
      prevJump = h.jump;
      const p = world.player;
      port.push(sampleWorld(world));
      portPowerups.push({
        fartTimer: p.fartTimer, bigHeadTimer: p.bigHeadTimer,
        chickenRayCharges: p.chickenRayCharges, hasBow: p.hasBow,
      });
      portTile.push(world.map[RB.y][RB.x]);
      portPopup.push(world.powerupPopup === null ? null : { ...world.powerupPopup });
    }

    // Player, camera, animFrame, score AND every enemy, frame for frame — through the
    // freeze and out the other side. Enemy `vy` alone is projected away; see
    // stripEnemyVy above for why bat@48 makes that necessary here.
    expect(port.map(stripEnemyVy)).toEqual(live.map(stripEnemyVy));
    expect(portPowerups).toEqual(livePowerups);
    expect(portTile).toEqual(liveTile);

    // The bump must actually happen, or everything below compares two idle runs.
    const bump = portPopup.findIndex((p) => p !== null);
    expect(bump).toBeGreaterThan(JUMP_FRAME); // on the rise, not on the standing frames
    // Tile 5 becomes tile 2, exactly like the question block's 3 does, and the block is
    // marked hit so a second bump pays nothing.
    expect(portTile.slice(0, bump)).toEqual(Array(bump).fill(TILE_RAINBOW));
    expect(portTile.slice(bump)).toEqual(Array(FRAMES - bump).fill(TILE_BRICK));
    expect(world.rainbowBlocks).toEqual([{ ...RB, hit: true }]);

    // `bighead` SPECIFICALLY. Both sides' Math.random is a constant 0.5 and
    // Math.floor(0.5 * 3) is 1, which indexes ['fart','bighead','chicken'] — so the one
    // branch the real trigger can reach is the middle one, on both sides. The other two
    // are pinned by injection in player.test.ts.
    expect(portPopup[bump]).toEqual({ type: 'bighead', timer: 120, maxTimer: 120 });
    // 1199, not 1200: the grant happens inside the Y sweep, and the same frame's own
    // power-up countdown (index.html:1433) runs further down the SAME player block and
    // immediately spends one. The live side agrees — that is the `toEqual` above.
    expect(portPowerups[bump].bigHeadTimer).toBe(1199);
    expect(portPowerups[bump - 1].bigHeadTimer).toBe(0);
    // ...and nothing else was granted. A fart or a chicken ray here would mean the draw
    // landed on the wrong branch.
    expect(portPowerups.every((s) => s.fartTimer === 0)).toBe(true);
    expect(portPowerups.every((s) => s.chickenRayCharges === 0)).toBe(true);
    expect(portPowerups.every((s) => !s.hasBow)).toBe(true);

    // The freeze (index.html:1276). It starts on the frame AFTER the bump — the bump
    // happens mid-update, below that gate — and runs for exactly 120 frames, the last of
    // which is also the one that clears the popup.
    const FREEZE = 120;
    const frozen = port[bump];
    expect(frozen.enemies.length).toBeGreaterThan(0); // "nothing moves" needs movers
    for (let f = bump + 1; f <= bump + FREEZE; f++) {
      expect(port[f].x).toBe(frozen.x);
      expect(port[f].y).toBe(frozen.y);
      expect(port[f].vy).toBe(frozen.vy);
      expect(port[f].camera).toEqual(frozen.camera);
      expect(port[f].enemies).toEqual(frozen.enemies);
      // The timers do not burn while the world is stopped either: the gate returns
      // above the player block that decrements them.
      expect(portPowerups[f].bigHeadTimer).toBe(1199);
      // ...but animFrame does keep counting, which is why the drawn scene behind the
      // popup still animates. It is incremented ABOVE the gate.
      expect(port[f].animFrame).toBe(frozen.animFrame + (f - bump));
    }
    expect(portPopup[bump + FREEZE - 1]).toEqual({ type: 'bighead', timer: 1, maxTimer: 120 });
    expect(portPopup[bump + FREEZE]).toBeNull();

    // ...and the world starts again on the very next frame. Not "eventually": the
    // player resumes falling, the camera resumes lerping and the big head resumes
    // burning down, all on frame bump+121.
    const after = port[bump + FREEZE + 1];
    expect(after.y).toBeGreaterThan(frozen.y);
    expect(after.camera.x).toBeGreaterThan(frozen.camera.x);
    expect(portPowerups[bump + FREEZE + 1].bigHeadTimer).toBe(1198);
    // It keeps going for the whole tail, rather than ticking once and stopping: every
    // frame after the freeze is one more off the timer.
    expect(portPowerups[FRAMES - 1].bigHeadTimer)
      .toBe(1199 - (FRAMES - 1 - (bump + FREEZE)));
    // And the player really does land back on the platform it jumped from.
    expect(port.slice(bump + FREEZE + 1).some((s) => s.onGround)).toBe(true);
    expect(port[FRAMES - 1].y).toBe(START_Y);
    expect(world.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The bow, arrows and the chicken ray (Plan 5, Task 4) — index.html:1390-1398 (firing,
// inside the player block) and :1503-1517 (flight and hits, its own pass between the
// pickups and the stars).
//
// Two traces. The first collects a real bow off the map and shoots a real enemy with
// it; the second seeds chicken ray charges, because the only thing in the game that
// grants them is the rainbow block and the 0.5 stub makes that always pay out a big
// head instead (see the rainbow-block trace above). Both fire through the SAME
// `justPressed` edge the live game uses — `fire` held in the script, turned into a
// press on its rising edge by driveLiveGame and by `firePressed` here.
//
// bat@48 streams in during BOTH windows, which is why both stub `Math.random` (its
// sineOffset is drawn at spawn) and both project enemy `vy` away with stripEnemyVy.
// ---------------------------------------------------------------------------

describe('the bow vs. the live game', () => {
  // Level 1's bow at tile 35 (560, 352), reached exactly the way the pickup trace above
  // reaches it: planted two tiles short of it on the same ground, then walked onto it.
  // The player then turns around, stops, and shoots LEFT at doll@28 — the nearest thing
  // an arrow fired from standing height can actually hit. car@40 is closer, but it
  // patrols the platform at row 19 and an arrow fired off the floor passes underneath it.
  //
  // Enemies run LIVE on both sides: the whole point is killing one. Nothing else in the
  // window reaches the player — doll@15 and doll@28 both walk away to the left, car@40
  // stays on its platform, and the camera's spawn window tops out at column 62, so the
  // seven defs past dino@55 never appear.
  afterEach(() => setRandom(Math.random));

  const REF = createWorld(0, 'normal', 'gigi');
  const BOW = REF.bowPickups[0];
  const START_X = BOW.x - 2 * TILE;
  const START_Y = findGroundY(REF.map, BOW.x / TILE) - REF.player.h;
  /** Right long enough to walk onto the bow, then left just long enough to turn around. */
  const RIGHT_FRAMES = 14;
  const TURN_FRAMES = 20;
  /**
   * Three presses, and the middle one is the point of it. The first fires. The second
   * comes 6 frames later, inside the 15-frame cooldown, and must do NOTHING — no arrow,
   * no charge spent. The third comes exactly 15 frames after the first, on the frame the
   * cooldown has just reached 0, and must fire: that is the boundary between 15 frames
   * between shots and 16.
   */
  const FIRE_FRAMES = [20, 26, 35];
  /**
   * 110 frames. The first arrow kills doll@28 on frame 39; the second hits nothing and
   * has to run its `life` all the way out, which it does on frame 94. Stopping earlier
   * would leave the 60-frame lifetime untested.
   */
  const FRAMES = 110;

  interface Bow { hasBow: boolean; bowCharges: number; arrowCooldown: number }

  const script = (f: number) => ({
    left: f >= RIGHT_FRAMES && f < TURN_FRAMES,
    right: f < RIGHT_FRAMES,
    jump: false,
    fire: FIRE_FRAMES.includes(f),
  });

  it('fires on the press, kills on the hit, and honours the cooldown and the arrow lifetime', () => {
    const liveArrows: ArrowSample[][] = [];
    const liveBow: Bow[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d) => {
        const p = d.getPlayer();
        liveArrows.push(d.getArrows());
        liveBow.push({
          hasBow: p.hasBow as boolean,
          bowCharges: p.bowCharges as number,
          arrowCooldown: p.arrowCooldown as number,
        });
      },
    });

    setRandom(() => 0.5); // the live driver's own stubbed Math.random, for bat@48
    const world = createWorld(0, 'normal', 'gigi');
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;

    const port: typeof live = [];
    const portArrows: ArrowSample[][] = [];
    const portBow: Bow[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: false, firePressed: h.fire });
      const p = world.player;
      port.push(sampleWorld(world));
      portArrows.push(world.arrows.map((a) => ({
        x: a.x, y: a.y, vx: a.vx, life: a.life, isChicken: a.isChicken,
      })));
      portBow.push({
        hasBow: p.hasBow, bowCharges: p.bowCharges, arrowCooldown: p.arrowCooldown,
      });
    }

    // Player, camera, animFrame, score AND every enemy, frame for frame — the usual
    // comparison, which already covers the kill from the victim's side.
    expect(port.map(stripEnemyVy)).toEqual(live.map(stripEnemyVy));
    // ...and the two things this trace is about: every arrow's whole flight, and the bow
    // state that fired it, on the same frames.
    expect(portArrows).toEqual(liveArrows);
    expect(portBow).toEqual(liveBow);

    // The bow is collected off the map, not seeded — the charges are the difficulty's
    // (3 at normal), and they are what the shots below spend.
    const bowFrame = portBow.findIndex((b) => b.hasBow);
    expect(bowFrame).toBeGreaterThanOrEqual(0);
    expect(bowFrame).toBeLessThan(FIRE_FRAMES[0]);
    expect(portBow[bowFrame].bowCharges).toBe(world.dc.bowCharges);

    // Shot one. Fired on the press frame, one charge gone, cooldown full — and the arrow
    // is ALREADY a step downrange, because stepArrows runs later in the same step that
    // created it. Facing is -1 (the turn-around above), so it leaves from `p.x - 12` at
    // `p.y + p.h/2 - 2` and flies at -6.
    const [first, blocked, second] = FIRE_FRAMES;
    expect(portArrows[first - 1]).toEqual([]);
    expect(portArrows[first]).toHaveLength(1);
    expect(portArrows[first][0]).toEqual({
      x: port[first - 1].x - 12 - 6,
      y: port[first - 1].y + REF.player.h / 2 - 2,
      vx: -6,
      life: 59,
      isChicken: false,
    });
    expect(portBow[first].bowCharges).toBe(world.dc.bowCharges - 1);
    expect(portBow[first].arrowCooldown).toBe(15);

    // The cooldown. A press 6 frames later buys nothing at all — no second arrow, no
    // second charge spent — and then the press on the frame the cooldown reaches 0 does
    // fire, 15 frames after the first and not 16.
    expect(portArrows[blocked]).toHaveLength(1);
    expect(portBow[blocked].bowCharges).toBe(world.dc.bowCharges - 1);
    expect(portBow[second - 1].arrowCooldown).toBe(1);
    expect(portBow[second].arrowCooldown).toBe(15);
    expect(portArrows[second]).toHaveLength(2);
    expect(portBow[second].bowCharges).toBe(world.dc.bowCharges - 2);
    expect(second - first).toBe(15);

    // The kill. doll@28 is enemies[1] on both sides; the arrow that reaches it is spent
    // on the same frame, and 200 points land at normal's 1.0 multiplier — the same award
    // a stomp pays, once, for one doll.
    const killFrame = port.findIndex((s) => s.enemies.some((e) => !e.alive));
    expect(killFrame).toBeGreaterThan(first);
    expect(port[killFrame].enemies[1].type).toBe('doll');
    // 29, not the 30 the hit assigns: stepEnemies runs after stepArrows in the same
    // step, and the dead-enemy branch at the top of it spends one straight away.
    expect(port[killFrame].enemies[1].squashTimer).toBe(29);
    expect(port[killFrame - 1].score).toBe(0);
    expect(port[killFrame].score).toBe(Math.round(200 * world.dc.scoreMultiplier));
    expect(port[FRAMES - 1].score).toBe(Math.round(200 * world.dc.scoreMultiplier));
    // The arrow that did it left the list on the frame it hit — `life` went to 0 and the
    // filter at the end of the pass swept it — while the other one flew on.
    expect(portArrows[killFrame - 1]).toHaveLength(2);
    expect(portArrows[killFrame]).toHaveLength(1);

    // The survivor dies of old age instead. `life` starts at 60, is decremented on the
    // frame the arrow is fired, and the arrow is gone the frame it reaches 0 — 59 frames
    // of flight, and no second kill for the score to have noticed.
    expect(portArrows[second][1].life).toBe(59);
    const gone = portArrows.findIndex((a, f) => f > second && a.length === 0);
    expect(gone).toBe(second + 59);
    expect(portArrows.slice(gone).every((a) => a.length === 0)).toBe(true);

    // Nothing in this window hurts the player, and no other enemy is touched: exactly one
    // of the five is dead at the end, which is what makes the score assertions above mean
    // "one arrow, one kill" rather than "some arrows, some kills".
    expect(world.dead).toBe(false);
    expect(port[FRAMES - 1].enemies.filter((e) => !e.alive)).toHaveLength(1);
    expect(port[FRAMES - 1].enemies).toHaveLength(5);
  });
});

describe('the chicken ray vs. the live game', () => {
  // The ray's own charges are seeded on both sides rather than earned: the only thing
  // that grants them is the rainbow block, and under the constant 0.5 stub that block
  // always pays out a big head instead (see the rainbow-block trace above), so no trace
  // can reach the `chicken` branch through the real trigger. Seeding is the same move
  // the fart and big-head traces make, for the same reason.
  //
  // A BOW is seeded alongside it, fully charged, because that is the trap: the ray wins
  // whenever any charge is left, even with arrows in hand, and it spends its own counter
  // and not the bow's.
  //
  // The target is bat@48, and it has to be a bat. A chicken is 14.4 x 12.6 against a
  // bat's 12.6 x 10.8, so both dimensions visibly change, and a bat is the only type in
  // this level whose `noGravity` is true beforehand — the flag whose clearing turns a
  // thing that flies a sine wave into a thing that falls.
  //
  // The player is planted on the platform at [50,18,6] (columns 50-55, row 18), the one
  // standing spot in the level whose arrow height (`p.y + p.h/2 - 2`) crosses the band
  // the bat's sine actually flies through. Column 52 rather than column 50, because the
  // CAT pickup sits at column 50 (`catPosition: 50`) — standing on it collects it, the
  // live game spawns the cat companion this port does not have yet, and the cat then
  // scratches dino@55 for 300 points that the port knows nothing about. Two tiles right
  // is entirely clear of it.
  afterEach(() => setRandom(Math.random));

  const REF = createWorld(0, 'normal', 'gigi');
  const PLATFORM_TILE = 52;
  const START_X = PLATFORM_TILE * TILE;
  const START_Y = findGroundY(REF.map, PLATFORM_TILE) - REF.player.h;
  /**
   * Fired on frame 10, reaching the bat on frame 19. The window is genuinely narrow: the
   * bat's sine only lifts it into the arrow's band from about animFrame 13, and it flies
   * left at 1.2 a frame, so firing earlier only makes the arrow wait and firing much
   * later runs the bat out of reach.
   */
  const FIRE_FRAME = 10;
  /**
   * 70 frames: the conversion on frame 19, the whole fall, the landing, and a long look
   * at the bird walking afterwards. Nothing threatens the player here — dino@55 spawns on
   * the question block at [55,15] and patrols that single tile 40px above the platform,
   * never coming down.
   */
  const FRAMES = 70;

  const script = (f: number) => ({
    left: false, right: false, jump: false, fire: f === FIRE_FRAME,
  });

  /** The bat/chicken's own fields, which the shared Sample shape does not carry. */
  interface Victim {
    type: string; w: number; h: number; vx: number; vy: number;
    noGravity: boolean; isChicken: boolean; stunTimer: number;
  }
  interface Rays { chickenRayCharges: number; bowCharges: number; hasBow: boolean }

  /** bat@48 is enemyDefs[3], and the port implements every type before it. */
  const BAT_INDEX = 3;

  it('converts the bat in place, spends a ray and not an arrow, and grounds the bird', () => {
    const liveArrows: ArrowSample[][] = [];
    const liveVictim: Array<Victim | null> = [];
    const liveRays: Rays[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
        p.facing = -1; // shooting left, at a bat that is already to the left
        p.hasBow = true;
        p.bowCharges = 3; // normal's dc.bowCharges — arrows in hand, and they stay there
        p.chickenRayCharges = 8; // index.html:1153
      },
      onFrame: (d) => {
        const p = d.getPlayer();
        liveArrows.push(d.getArrows());
        liveRays.push({
          chickenRayCharges: p.chickenRayCharges as number,
          bowCharges: p.bowCharges as number,
          hasBow: p.hasBow as boolean,
        });
        const e = d.getEnemies()[BAT_INDEX];
        liveVictim.push(e === undefined ? null : {
          type: e.type, w: e.w as number, h: e.h as number, vx: e.vx,
          // A bat never has `vy` written on the live side — the gravity block that is its
          // only writer is skipped while noGravity holds — so it reads `undefined` right
          // up to the conversion. Normalised to 0, which is exactly what that same live
          // block assigns (`if(e.vy===undefined)e.vy=0`) the moment it first runs.
          vy: (e.vy as number | undefined) ?? 0,
          noGravity: !!e.noGravity,
          // Both of these are added to the live object by the conversion itself and are
          // simply absent before it, which is the same `false`/`0` this port starts from.
          isChicken: !!e.isChicken,
          stunTimer: (e.stunTimer as number | undefined) ?? 0,
        });
      },
    });

    setRandom(() => 0.5); // the live driver's own stubbed Math.random
    const world = createWorld(0, 'normal', 'gigi');
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;
    world.player.facing = -1;
    world.player.hasBow = true;
    world.player.bowCharges = 3;
    world.player.chickenRayCharges = 8;

    const port: typeof live = [];
    const portArrows: ArrowSample[][] = [];
    const portVictim: Array<Victim | null> = [];
    const portRays: Rays[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: false, firePressed: h.fire });
      const p = world.player;
      port.push(sampleWorld(world));
      portArrows.push(world.arrows.map((a) => ({
        x: a.x, y: a.y, vx: a.vx, life: a.life, isChicken: a.isChicken,
      })));
      portRays.push({
        chickenRayCharges: p.chickenRayCharges, bowCharges: p.bowCharges, hasBow: p.hasBow,
      });
      const e = world.enemies[BAT_INDEX];
      portVictim.push(e === undefined ? null : {
        type: e.type, w: e.w, h: e.h, vx: e.vx, vy: e.vy,
        noGravity: e.noGravity, isChicken: e.isChicken, stunTimer: e.stunTimer,
      });
    }

    // Player, camera, animFrame, score and every enemy's position, frame for frame. Enemy
    // `vy` alone is projected away (stripEnemyVy above); `portVictim` compares the victim's
    // own vy directly instead, which is the interesting one here.
    expect(port.map(stripEnemyVy)).toEqual(live.map(stripEnemyVy));
    expect(portArrows).toEqual(liveArrows);
    expect(portVictim).toEqual(liveVictim);
    expect(portRays).toEqual(liveRays);

    // The shot must be a RAY, not an arrow. The bow is fully charged and the ray still
    // goes first (index.html:1393's `isChicken = p.chickenRayCharges > 0`, tested before
    // anything is spent), and only the ray counter moves.
    expect(portArrows[FIRE_FRAME]).toHaveLength(1);
    expect(portArrows[FIRE_FRAME][0].isChicken).toBe(true);
    expect(portRays[FIRE_FRAME].chickenRayCharges).toBe(7);
    expect(portRays.every((r) => r.bowCharges === 3)).toBe(true);
    expect(portRays.every((r) => r.hasBow)).toBe(true);

    // The conversion itself: same object, same slot in `enemies`, everything else new —
    // type, both dimensions, direction, and the flags. `vx` is a flat -1.5 with no
    // dc.enemySpeed in it, negative because the stub makes `0.5 > 0.5` false.
    const convertFrame = portVictim.findIndex((v) => v !== null && v.isChicken);
    expect(convertFrame).toBeGreaterThan(FIRE_FRAME);
    const before = portVictim[convertFrame - 1]!;
    const after = portVictim[convertFrame]!;
    expect(before).toEqual({
      type: 'bat', w: 12.6, h: 10.8, vx: -1.2, vy: 0,
      noGravity: true, isChicken: false, stunTimer: 0,
    });
    expect(after).toEqual({
      type: 'chicken', w: 14.4, h: 12.6, vx: -1.5,
      // The enemy pass runs after the arrow pass in the same step, so gravity has already
      // touched the new bird once by the time anything can look at it.
      vy: GRAVITY,
      noGravity: false, isChicken: true, stunTimer: 0,
    });
    // Bigger in BOTH directions, from the chicken sprite grid rather than a constant.
    expect(after.w).toBeGreaterThan(before.w);
    expect(after.h).toBeGreaterThan(before.h);
    // 100 points, not the 200 a kill pays, and the enemy is very much still alive.
    expect(port[convertFrame - 1].score).toBe(0);
    expect(port[convertFrame].score).toBe(Math.round(100 * world.dc.scoreMultiplier));
    expect(port[convertFrame].enemies[BAT_INDEX].alive).toBe(true);
    // The ray is spent on the hit, exactly like an arrow — one bird per ray.
    expect(portArrows[convertFrame]).toHaveLength(0);
    expect(portRays[FRAMES - 1].chickenRayCharges).toBe(7); // and no second shot fired

    // ...and what clearing `noGravity` actually buys. A bat has no vy at all and rewrites
    // its own y every frame from `originY` plus a sine; this bird falls instead,
    // accelerating by GRAVITY a frame, until it lands on the floor and stops.
    const victims = portVictim.slice(convertFrame).map((v) => v!);
    expect(victims[1].vy).toBe(GRAVITY * 2);
    expect(victims[2].vy).toBe(GRAVITY * 3);
    const landed = victims.findIndex((v, i) => i > 0 && v.vy === 0);
    expect(landed).toBeGreaterThan(0);
    expect(Math.max(...victims.map((v) => v.vy))).toBeGreaterThan(GRAVITY * 10);
    const ys = port.slice(convertFrame).map((s) => s.enemies[BAT_INDEX].y);
    // Monotonically DOWN, never back up: nothing about a sine wave left in it.
    expect(ys.every((y, i) => i === 0 || y >= ys[i - 1])).toBe(true);
    // It lands on the base ground, sitting exactly its own new height above the floor —
    // the chicken's height, not the bat's, which is the size change showing up in the
    // physics rather than only in a field.
    //
    // Deliberately NOT findGroundY: that scans DOWNWARD from row 0 and stops at the first
    // solid tile, which over these columns is the platform at [42,15,3] four rows up, not
    // the floor the bird is standing on. The base ground makeGround writes is the bottom
    // two rows, so its top is `(height - 2) * TILE`.
    const bat = world.enemies[BAT_INDEX];
    const baseGroundY = (LEVELS[0].height - 2) * TILE;
    expect(ys[landed]).toBe(baseGroundY - after.h);
    expect(bat.y).toBe(baseGroundY - after.h);
    // That resting height is far below anything its old flight path could reach: the sine
    // is 30px either side of originY, and this is well past the bottom of it.
    expect(bat.y).toBeGreaterThan(bat.originY + 30);
    // And then it WALKS, on the ground, like the doll it now behaves as: 1.5px a frame,
    // leftward, still alive and still able to be stomped.
    expect(bat.alive).toBe(true);
    expect(bat.vx).toBe(-1.5);
    expect(ys.slice(landed).every((y) => y === ys[landed])).toBe(true);
    const walk = port.slice(convertFrame + landed).map((s) => s.enemies[BAT_INDEX].x);
    expect(walk[walk.length - 1]).toBe(walk[0] - 1.5 * (walk.length - 1));
    expect(world.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The cat companion (Plan 5, Task 5) — index.html:1449-1455 (the pickup, sitting
// between the bow/super pickups and the arrow pass) and :1456-1501 (the companion,
// its own pass in the same gap).
//
// One trace, because one run of level 1 happens to hit every part of it: the pickup,
// the spawn-frame scratch, the 30-frame cooldown measured exactly, all three scratches
// on three different enemy types, and the cat vanishing on the frame after the last
// one. bat@48 is in the window, so this stubs `Math.random` (its sineOffset is drawn at
// spawn) and projects enemy `vy` away with stripEnemyVy, exactly like the two traces
// above.
// ---------------------------------------------------------------------------

describe('the cat vs. the live game', () => {
  afterEach(() => setRandom(Math.random));

  const REF = createWorld(0, 'normal', 'gigi');
  /** 26 — a 13-row grid at scale 2, the same `spriteH(CAT_S,2)` the live cat pass uses. */
  const CAT_H = 26;
  /**
   * The cat pickup is at column 50 (`catPosition: 50`), which is the LEFT EDGE of the
   * platform at [50,18,6] — the same platform the chicken-ray trace above deliberately
   * starts two tiles right of, to avoid this. Here we want it: the player is planted at
   * column 52 on that platform and walks left onto the pickup.
   *
   * Nothing lower can reach it. The pickup's box is 22 tall from `findGroundY(50) - 26`,
   * i.e. 262-284, and a player standing on the base ground two rows below occupies
   * 344-368 — so the platform is the only place in the level this cat can be collected
   * from, which is what makes the rest of this script forced rather than chosen.
   */
  const START_TILE = 52;
  const START_X = START_TILE * TILE;
  const START_Y = findGroundY(REF.map, START_TILE) - REF.player.h;
  /**
   * Left onto the pickup, then right for the rest of the run. Fourteen frames is just
   * enough: the player collects on frame 8 and the turn-around costs three more frames
   * of drift, which stops at 797 — two pixels clear of the edge it would otherwise walk
   * off.
   */
  const TURN_FRAME = 14;
  /**
   * 110 frames. The third scratch lands on frame 89 and the cat is gone on frame 90, so
   * this is twenty frames of "and it stays gone" — and it stops twelve frames short of
   * bouncer@73, which the player walks into on frame 122. That death is real and has
   * nothing to do with the cat; the window is bounded to exclude it rather than left to
   * chance (see `world.dead` at the bottom).
   */
  const FRAMES = 110;

  const script = (f: number) => ({
    left: f < TURN_FRAME, right: f >= TURN_FRAME, jump: false, fire: false,
  });

  it('spawns on the pickup, scratches three enemies 30 frames apart, and goes the frame after the third', () => {
    const liveCats: Array<CatSample | null> = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => {
        const p = d.getPlayer();
        p.x = START_X; p.y = START_Y; p.vx = 0; p.vy = 0; p.onGround = true;
      },
      onFrame: (d) => { liveCats.push(d.getCat()); },
    });

    setRandom(() => 0.5); // the live driver's own stubbed Math.random, for bat@48
    const world = createWorld(0, 'normal', 'gigi');
    world.player.x = START_X;
    world.player.y = START_Y;
    world.player.onGround = true;

    const port: typeof live = [];
    const portCats: Array<CatSample | null> = [];
    for (let f = 0; f < FRAMES; f++) {
      const h = script(f);
      stepWorld(world, { ...h, jumpPressed: false, firePressed: false });
      port.push(sampleWorld(world));
      const c = world.cat;
      portCats.push(c === null ? null : {
        x: c.x, y: c.y, vx: c.vx, vy: c.vy, facing: c.facing, frame: c.frame,
        frameTimer: c.frameTimer, scratchTimer: c.scratchTimer,
        scratchTarget: c.scratchTarget && { x: c.scratchTarget.x, y: c.scratchTarget.y },
        hitsLeft: c.hitsLeft, bounceDir: c.bounceDir, baseY: c.baseY, onGround: c.onGround,
      });
    }

    // Player, camera, animFrame, score and every enemy, frame for frame — which already
    // covers all three victims from their own side (`alive`, `squashTimer`) and the
    // score each one paid. Enemy `vy` alone is projected away; see stripEnemyVy.
    expect(port.map(stripEnemyVy)).toEqual(live.map(stripEnemyVy));
    // ...and the cat itself, every field of it, on every frame — including the frames
    // where it is null on both sides, before the pickup and after the third scratch.
    expect(portCats).toEqual(liveCats);

    // The spawn. It is the PICKUP that creates the cat, so it appears on the exact frame
    // the pickup is taken, and 20px LEFT of the player whichever way they are facing —
    // already stepped once by the cat pass that runs later in the same update, so the
    // first x a trace can ever see is `p.x - 20 + 2.5` and the first y is a jump already
    // in progress, never the `y: p.y` the spawn literal writes.
    const spawn = portCats.findIndex((c) => c !== null);
    expect(spawn).toBeGreaterThan(0);
    expect(world.catPickup!.collected).toBe(true);
    expect(portCats[spawn]!.x).toBe(port[spawn].x - 20 + 2.5);
    expect(portCats[spawn]!.onGround).toBe(false);
    // Its own gravity, not the world's: a takeoff of -5.5 and +0.35 a frame. Under
    // GRAVITY (0.4) the same frame would read -5.1.
    expect(portCats[spawn]!.vy).toBe(-5.5 + 0.35);
    expect(portCats[spawn]!.vy).not.toBe(-5.5 + GRAVITY);
    expect(portCats[spawn + 1]!.vy).toBe(portCats[spawn]!.vy + 0.35);

    // It bounces continuously. `onGround` is set by a landing and spent by the very next
    // frame's takeoff, so it is never true twice running — there is no rest state, from
    // the spawn frame to the last one.
    const alive = portCats.filter((c): c is CatSample => c !== null);
    expect(alive.some((c) => c.onGround)).toBe(true);
    expect(alive.every((c, i) => i === 0 || !(c.onGround && alive[i - 1].onGround))).toBe(true);

    // `baseY` is written TWICE a frame and the second write is the one that counts: it
    // re-aims the landing at the player's feet AS THEY ARE THIS FRAME. Which is exactly
    // this, on every single frame the cat exists — including the ones where the player
    // is in mid-air off the platform edge, where a cat landing where it took off would
    // have drifted away from this the moment the fall started.
    expect(portCats.every((c, f) => c === null || c.baseY === port[f].y + REF.player.h - CAT_H))
      .toBe(true);
    expect(port.some((s, f) => portCats[f] !== null && !s.onGround)).toBe(true);

    // And it ignores the map completely. On the spawn frame the cat is over column 49,
    // whose ground is the base floor 100px below the height it is bouncing at — it is
    // standing on the air beside the platform because the player is standing on the
    // platform. There is no tile lookup anywhere in the cat pass.
    const catColumn = Math.floor(portCats[spawn]!.x / TILE);
    expect(findGroundY(world.map, catColumn)).toBe((LEVELS[0].height - 2) * TILE);
    expect(findGroundY(world.map, catColumn) - portCats[spawn]!.baseY).toBeGreaterThan(100);

    // Three scratches, three different enemy types, 300 points each — the biggest
    // per-enemy award in the game. The first lands on the spawn frame itself, because
    // `scratchTimer` starts at 0 and `Math.max(0, 0 - 1)` leaves it there.
    const KILL = Math.round(300 * world.dc.scoreMultiplier);
    const scratches = port
      .map((s, f) => (f > 0 && s.score !== port[f - 1].score ? f : -1))
      .filter((f) => f >= 0);
    expect(scratches).toEqual([spawn, spawn + 30, 89]);
    expect(scratches.every((f) => port[f].score - port[f - 1].score === KILL)).toBe(true);
    expect(port[FRAMES - 1].score).toBe(3 * KILL);
    expect(scratches.map((f) => portCats[f]!.hitsLeft)).toEqual([2, 1, 0]);
    // One victim per scratch and never two in a frame: the `scratchTimer > 0` guard is
    // re-tested per enemy inside the loop, so the first hit closes the rest of the frame.
    const dead = (f: number) => port[f].enemies.filter((e) => !e.alive).map((e) => e.type);
    expect(scratches.map(dead)).toEqual([['bat'], ['bat', 'dino'], ['bat', 'dino', 'doll']]);
    // 29, not the 30 the scratch assigns: stepEnemies runs after stepCat in the same
    // step and the dead-enemy branch at the top of it spends one straight away.
    expect(scratches.map((f) => port[f].enemies.find((e) => !e.alive)!.squashTimer)).toContain(29);
    // The claw lands on the victim's centre, not the cat's position.
    const bat = port[spawn].enemies[3];
    expect(portCats[spawn]!.scratchTarget).toEqual({ x: bat.x + 12.6 / 2, y: bat.y + 10.8 / 2 });

    // The cooldown, exactly. 30 on the frame of a scratch, counted down one a frame at
    // the TOP of the pass — so it is already 0 on the frame the guard next reads it, and
    // the second scratch lands 30 frames after the first, not 31.
    expect(portCats[scratches[0]]!.scratchTimer).toBe(30);
    expect(portCats[scratches[1] - 1]!.scratchTimer).toBe(1);
    expect(portCats[scratches[1]]!.scratchTimer).toBe(30);
    expect(scratches[1] - scratches[0]).toBe(30);

    // The disappearance. Spending the last scratch does NOT remove the cat: the removal
    // is the `else if` on the way into the next frame's pass, so the cat lives out the
    // whole frame it killed on — still bouncing, still at `hitsLeft` 0 — and only then
    // goes. And it never comes back: the pickup is collected.
    const last = scratches[2];
    expect(portCats[last]).not.toBeNull();
    expect(portCats[last]!.hitsLeft).toBe(0);
    expect(portCats[last + 1]).toBeNull();
    expect(portCats.slice(last + 1).every((c) => c === null)).toBe(true);
    expect(world.cat).toBeNull();

    // Nothing in this window kills the player — bouncer@73 would, twelve frames past the
    // end of it, and that is the bound this frame count is chosen to stay inside.
    expect(world.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The cape (Plan 5, Task 6) — index.html:1169, 1423, 1430, 1544, 1646.
//
// Two traces, because the two ways a cape can be spent are NOT the same code and do not
// hand out the same window: absorbing a contact hit gives `dc.invincibleTime||60`
// (index.html:1646), surviving a pit gives a hardcoded 60 (index.html:1423). Normal
// difficulty can only show the first, and shows the `||60` fallback while it is at it
// (it has neither `invincibleTime` nor `capeSavesPit`); super_easy shows both, at 120
// and 60, which is the only arrangement where the two numbers visibly differ.
// ---------------------------------------------------------------------------

/** The two cape-side fields, pulled through `onFrame` rather than grown onto Sample. */
interface CapeSample { hasCape: boolean; invincible: number }

describe('the cape absorbing a hit vs. the live game', () => {
  /**
   * Normal difficulty, and the same doll@15 collision at frame 60 that every hold-right
   * script at the top of this file already dies on (see EXPECT_DEATH) — only this time
   * the player is wearing a cape, so it survives.
   *
   * `hasCape` is seeded on both sides rather than picked up: normal's `startWithCape` is
   * false and the nearest super pickup is at tile 22, inside the first pit, so there is
   * no way to reach doll@15 with a cape by walking. The live side is seeded through
   * `beforeRun` (the driver hands back the script's own `player` object), the port's is
   * a plain field — the same trick the fart and big-head traces above use.
   *
   * The input is hold-right until the hit lands, then a turn back left and a turn right
   * again. None of that is decoration:
   *
   *   - Holding right THROUGH the hit walks the player straight across the doll while
   *     invincible — the boxes genuinely overlap and nothing happens, which is what
   *     `p.invincible<=0` gating the WHOLE stomp/hit check (index.html:1544) looks like
   *     from outside.
   *   - Turning left brings the player back across the doll a second time, still inside
   *     the window.
   *   - Turning right again on the frame the window runs out walks into the doll a
   *     third time, and that one kills.
   *
   * It also stays west of the first pit the whole way (x tops out around 180 against a
   * gap at 320), so the death in this window is unambiguously a contact death.
   */
  const TURN_LEFT = 75;
  const TURN_RIGHT = 120;
  /**
   * Dies at 127 and stays frozen for 13 — well inside the 90-frame respawn, which the
   * scripts at the top of this file already cross rather than this one repeating it.
   */
  const FRAMES = 140;

  const script = (f: number) => ({
    left: f >= TURN_LEFT && f < TURN_RIGHT,
    right: f < TURN_LEFT || f >= TURN_RIGHT,
    jump: false,
    fire: false,
  });

  it('survives the hit, walks through the doll while it blinks, and dies once it lapses', () => {
    const liveCape: CapeSample[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'normal', character: 'gigi',
      frames: FRAMES, input: script,
      beforeRun: (d) => { d.getPlayer().hasCape = true; },
      onFrame: (d) => {
        const p = d.getPlayer();
        liveCape.push({ hasCape: p.hasCape as boolean, invincible: p.invincible as number });
      },
    });

    const world = createWorld(0, 'normal', 'gigi');
    world.player.hasCape = true;

    const port: typeof live = [];
    const portCape: CapeSample[] = [];
    const portDead: boolean[] = [];
    /** Whether the player's contact box overlapped doll@15 on each frame. */
    const touching: boolean[] = [];
    for (let f = 0; f < FRAMES; f++) {
      const held = script(f);
      stepWorld(world, { ...held, jumpPressed: false, firePressed: false });
      const p = world.player;
      port.push(sampleWorld(world));
      portCape.push({ hasCape: p.hasCape, invincible: p.invincible });
      portDead.push(world.dead);
      const doll = world.enemies[0];
      touching.push(!!doll && rectOverlap(
        { x: p.x + 2, y: p.y, w: p.w - 4, h: p.h },
        { x: doll.x, y: doll.y, w: doll.w, h: doll.h },
      ));
    }

    expect(port).toEqual(live);
    expect(portCape).toEqual(liveCape);

    // The hit itself. `hasCape` goes false on exactly one frame in this window — the
    // cape is spent, not worn down — and the window it buys is normal's, which has no
    // `invincibleTime` at all, so this is the `||60` fallback being read.
    const hitFrame = portCape.findIndex((s) => !s.hasCape);
    expect(hitFrame).toBeGreaterThan(0);
    expect(portDead[hitFrame]).toBe(false); // absorbed, not fatal
    expect(world.dc.invincibleTime).toBeUndefined();
    expect(portCape[hitFrame].invincible).toBe(60);
    // A nudge, not a jump: -4 against a jumpForce of -7.5.
    expect(port[hitFrame].vy).toBe(-4);

    // The window, frame by frame rather than at its peak — 60 on the hit frame itself
    // (the decrement at index.html:1430 has already gone by when the enemies pass sets
    // it), then exactly one per frame down to 0, and 0 from then on. An off-by-one
    // anywhere in here is a game that "feels wrong" later and nothing more obvious.
    const countdown = portCape.slice(hitFrame, hitFrame + 61).map((s) => s.invincible);
    expect(countdown).toEqual(Array.from({ length: 61 }, (_, i) => 60 - i));
    expect(portCape.slice(hitFrame + 61).every((s) => s.invincible === 0)).toBe(true);

    // What the window is FOR. The player crosses the doll TWICE while it runs — two
    // separate overlapping stretches, not one long one — and survives both, so the
    // contact check was reached and declined rather than simply never met.
    const protectedTouches = touching
      .map((t, f) => (t && f > hitFrame && f < hitFrame + 61 ? f : -1))
      .filter((f) => f >= 0);
    expect(protectedTouches.length).toBeGreaterThan(10);
    expect(protectedTouches.filter((f, i) => i === 0 || f !== protectedTouches[i - 1] + 1))
      .toHaveLength(2);
    expect(portDead.slice(0, hitFrame + 61).every((d) => !d)).toBe(true);

    // And once it has lapsed, the next contact kills: one life spent, and the player is
    // standing on the ground well short of the first gap (x=320), so this is a contact
    // death and not a pit wearing one's clothes.
    const deathFrame = portDead.indexOf(true);
    expect(deathFrame).toBeGreaterThan(hitFrame + 60);
    expect(portCape[deathFrame].invincible).toBe(0);
    expect(world.lives).toBe(world.dc.lives - 1);
    expect(world.player.x).toBeLessThan(320);
    expect(world.player.y)
      .toBe(findGroundY(world.map, Math.floor(world.player.x / TILE)) - world.player.h);
  });
});

describe('the cape saving a pit fall vs. the live game', () => {
  afterEach(() => setRandom(Math.random));

  /**
   * super_easy, the only difficulty that carries `capeSavesPit` at all — and, not
   * coincidentally, the only one that carries `startWithCape`, so the cape needed to
   * reach a pit is simply the one the level starts you in. Nothing is seeded here and
   * the map is not edited.
   *
   * The pit is a gap carved next to spawn, exactly as world.test.ts's own death trace
   * carves one, rather than the level's real first gap. That is a harness limit, not a
   * reachability one: level 1's real gap IS reachable with the cape on (column 20, one
   * tile wide at super_easy's `gapWidth` of 0.3, walked into from column 17 — which is
   * the last base-ground tile UNDER the platform at `[18,17,4]`, since that platform
   * bridges columns 18-21 six rows up and a player starting on it walks clean over the
   * hole). Standing over that gap puts the camera past column 48 and streams in bat@48,
   * and a live bat object carries no `vy` field at all while this port's EnemyState
   * always does — so the shared Sample shape would compare `undefined` against `0` for
   * reasons with nothing to do with capes. A gap at columns 4-8 keeps the camera far
   * enough west that only the three ground patrollers ever spawn.
   *
   * What the 240 frames then contain, in order:
   *
   *   - The save. The cape is spent, `invincible` is set to a HARDCODED 60 — not
   *     super_easy's `invincibleTime` of 120 — `vy` is -10, and `y` is teleported to
   *     `lvl.height*TILE - 32`. That lands the player back inside the same hole, just
   *     two tiles higher, which is why the second fall follows so quickly: the rescue is
   *     not a bounce out of the pit, it is another go at it.
   *   - The second fall, about thirty frames later, with `invincible` still counting
   *     down. Invincibility has nothing to do with pits (there is no `p.invincible`
   *     anywhere in index.html:1423) and the cape is already gone, so this one kills.
   *   - The respawn ninety frames after that, which hands the cape straight back:
   *     `hasCape:dc.startWithCape` runs on EVERY level start, not just the first
   *     (index.html:1169). Nothing else in this suite can show that.
   *   - doll@15 taking that fresh cape by ordinary contact — and THAT is where
   *     super_easy's `invincibleTime` of 120 appears. Twice the window the pit gave,
   *     from the same cape, on the same difficulty, in the same trace.
   */
  const GAP_FROM = 4;
  const GAP_TO = 8;
  const carveGap = (map: number[][]): void => {
    for (let ty = map.length - 2; ty < map.length; ty++) {
      for (let tx = GAP_FROM; tx <= GAP_TO; tx++) map[ty][tx] = 0;
    }
  };
  const FRAMES = 240;
  const script = () => ({ left: false, right: true, jump: false, fire: false });

  it('throws the player back out of the pit for 60 frames, where a hit would give 120', () => {
    const liveCape: CapeSample[] = [];
    const live = driveLiveGame({
      level: 0, difficulty: 'super_easy', character: 'gigi',
      frames: FRAMES, input: script,
      mutateMap: carveGap,
      onFrame: (d) => {
        const p = d.getPlayer();
        liveCape.push({ hasCape: p.hasCape as boolean, invincible: p.invincible as number });
      },
    });

    setRandom(() => 0.5); // the live driver's own stubbed Math.random, for enemySkipChance
    const world = createWorld(0, 'super_easy', 'gigi');
    world.map = world.map.map((row) => row.slice());
    carveGap(world.map);

    const port: typeof live = [];
    const portCape: CapeSample[] = [];
    const portDead: boolean[] = [];
    for (let f = 0; f < FRAMES; f++) {
      stepWorld(world, { ...script(), jumpPressed: false, firePressed: false });
      port.push(sampleWorld(world));
      portCape.push({ hasCape: world.player.hasCape, invincible: world.player.invincible });
      portDead.push(world.dead);
    }

    expect(port).toEqual(live);
    expect(portCape).toEqual(liveCape);

    // The player really did start the level wearing one, off `dc.startWithCape` alone:
    // nothing in this test grants it and the nearest super pickup is tiles away.
    expect(world.dc.startWithCape).toBe(true);
    expect(world.dc.capeSavesPit).toBe(true);
    expect(liveCape[0].hasCape).toBe(true);

    // The save. The cape is spent, the world does NOT go dead, and the window is 60 —
    // the branch's own hardcoded number, not `dc.invincibleTime`, which is twice that
    // and is what a contact hit gives on this very difficulty (see below).
    const saveFrame = portCape.findIndex((s) => !s.hasCape);
    expect(saveFrame).toBeGreaterThan(0);
    expect(portDead[saveFrame]).toBe(false);
    expect(world.dc.invincibleTime).toBe(120);
    expect(portCape[saveFrame].invincible).toBe(60);
    // Thrown up at -10 from `lvl.height*TILE - 32`, both flat numbers: not a bounce off
    // anything, and unrelated to any jump force.
    expect(port[saveFrame].vy).toBe(-10);
    expect(port[saveFrame].y).toBe(LEVELS[0].height * TILE - 32);
    // ...and it was a real fall being survived: the frame before, the player was already
    // below the bottom row of the map and still dropping at terminal velocity, and the
    // save moved it a long way back UP rather than nudging it.
    expect(port[saveFrame - 1].y).toBeGreaterThanOrEqual(LEVELS[0].height * TILE);
    expect(port[saveFrame - 1].vy).toBe(8);
    expect(port[saveFrame].y).toBeLessThan(port[saveFrame - 1].y - TILE);

    // The second fall kills, and it kills WHILE STILL INVINCIBLE: the pit check reads
    // `capeSavesPit && hasCape` and nothing else.
    const deathFrame = portDead.indexOf(true);
    expect(deathFrame).toBeGreaterThan(saveFrame);
    expect(portCape[deathFrame].invincible).toBeGreaterThan(0);
    expect(port[deathFrame].y).toBeGreaterThan(LEVELS[0].height * TILE + 32);

    // The respawn hands the cape back, exactly 90 frames after the death like every
    // other respawn in this suite — and hands back a clean invincibility counter with
    // it, rather than the one the player died holding.
    const respawnFrame = portDead.indexOf(false, deathFrame + 1);
    expect(respawnFrame).toBe(deathFrame + 90);
    expect(portCape[respawnFrame].hasCape).toBe(true);
    expect(portCape[respawnFrame].invincible).toBe(0);

    // doll@15 then takes that second cape the ordinary way, and that is the 120.
    const hitFrame = portCape.findIndex((s, f) => f > respawnFrame && !s.hasCape);
    expect(hitFrame).toBeGreaterThan(respawnFrame);
    expect(portDead[hitFrame]).toBe(false); // absorbed, not fatal
    expect(portCape[hitFrame].invincible).toBe(world.dc.invincibleTime);
    expect(port[hitFrame].vy).toBe(-4); // the hit's nudge, not the pit's -10
    // Counting down one a frame from 120, the same way the 60 does at normal.
    expect(portCape.slice(hitFrame).map((s) => s.invincible))
      .toEqual(Array.from({ length: FRAMES - hitFrame }, (_, i) => 120 - i));

    // Infinite lives really are infinite: two deaths, still Infinity (index.html:1647's
    // untyped `lives--`, and `dc.lives` is Infinity on this difficulty alone).
    expect(world.lives).toBe(Infinity);
  });
});
