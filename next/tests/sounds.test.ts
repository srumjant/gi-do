// What the game sounds like, asserted in a node process with no speaker in it.
//
// This is the part of the sound work that is not plumbing. In index.html a sound is an
// untestable side effect: `sfxStomp()` sits three loops deep inside `update()`, and the
// only way to find out whether stomping an enemy makes a noise is to be a person in a
// browser with the volume up. Here the simulation raises a VALUE — `world.sounds` — and
// the scene turns values into oscillators, so "stomping an enemy emits a stomp" is a
// question a test can ask.
//
// Three things are checked, in this order:
//
//   1. THE MOMENTS. Every place index.html calls an `sfx*()` (or, for three of them, a
//      bare `playTone`) in code this port reaches, the port raises the matching cue —
//      and raises it at the same point, so the ORDER of several cues in one step is the
//      live order too.
//   2. THE HYGIENE. The list holds the step just taken and nothing older, including on
//      the frozen steps (dead, won, mid-announcement) where nothing else happens. That
//      is what stops a death banking up a burst of stomps to fire on the respawn.
//   3. THE OTHER END. Every cue in the union actually reaches the audio stack.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TILE } from '../src/config/constants';
import { getCurrentTheme, stopBGM } from '../src/audio/bgm';
import { setAudioContext } from '../src/audio/context';
import { playCue, playEffect, playSounds } from '../src/audio/cues';
import { LEVELS } from '../src/data/levels';
import { stepEnemy } from '../src/game/enemy';
import {
  bumpBlocksAbove, createPlayer, playerDie, playerHit, stepPlayer,
} from '../src/game/player';
import { setRandom } from '../src/game/random';
import {
  checkRescue, collectPickups, createWorld, respawnLevel, stepArrows, stepCat, stepStars,
  stepWorld,
} from '../src/game/world';
import { getRescueSprites } from '../src/game/run';
import { findGroundY } from '../src/game/tiles';
import { headTileRow } from '../src/physics/player';
import { emptyInput, type InputState } from '../src/input/actions';
import type { EnemyState, SoundCue, World } from '../src/game/types';
import { FakeAudioContext } from './helpers/fakeAudio';
import { testMove } from './helpers/testMove';

function held(overrides: Partial<InputState>): InputState {
  return { ...emptyInput(), ...overrides };
}

/** A doll with the real doll's dimensions, parked wherever a test wants it. */
function enemyAt(x: number, y: number, over: Partial<EnemyState> = {}): EnemyState {
  return {
    type: 'doll', x, y, vx: 0, vy: 0, w: 14.4, h: 16.2, alive: true,
    frame: 0, frameTimer: 0, squashTimer: 0,
    noGravity: false, originY: 0, sineOffset: 0, bounceTimer: 0, stunTimer: 0,
    shootTimer: 0, shootInterval: 0, noStomp: false,
    isChicken: false,
  };
}

/** Where Arcade's separation leaves a player that has just hit the block at (tx, ty). */
function underBlock(world: World, tx: number, ty: number): void {
  world.player.x = tx * TILE;
  world.player.y = (ty + 1) * TILE;
}

describe('the moments that make a noise', () => {
  afterEach(() => setRandom(Math.random));

  it('starts a level silent', () => {
    expect(createWorld(0, 'normal').sounds).toEqual([]);
  });

  // index.html:1385. The one sound in the game a child makes on purpose, constantly.
  it('a jump emits a jump', () => {
    const world = createWorld(0, 'normal');
    world.player.onGround = true;
    stepPlayer(world, held({ jump: true, jumpPressed: true }), testMove);
    expect(world.sounds).toContain('jump');
  });

  // index.html:1384 — the branch ABOVE the ordinary jump, so a fart jump is a fart and
  // NOT also a jump. Getting that wrong is inaudible in a test that only checks 'fart'.
  it('a fart jump emits a fart instead of a jump, not as well as one', () => {
    const world = createWorld(0, 'normal');
    world.player.onGround = true;
    world.player.fartTimer = 900;
    stepPlayer(world, held({ jump: true, jumpPressed: true }), testMove);
    expect(world.sounds).toContain('fart');
    expect(world.sounds).not.toContain('jump');
  });

  it('a step with no jump in it is silent', () => {
    const world = createWorld(0, 'normal');
    world.player.onGround = true;
    stepPlayer(world, emptyInput(), testMove);
    expect(world.sounds).toEqual([]);
  });

  // index.html:1395. Two counters, two different noises, and the ray wins whenever a
  // charge is left — so this is also a check that the cue follows the branch that was
  // actually taken rather than the weapon the player is holding.
  it('an arrow twangs and a chicken ray clucks', () => {
    const bow = createWorld(0, 'normal');
    bow.player.hasBow = true;
    bow.player.bowCharges = 3;
    stepPlayer(bow, held({ firePressed: true }), testMove);
    expect(bow.sounds).toContain('shoot');
    expect(bow.sounds).not.toContain('cluck');

    const ray = createWorld(0, 'normal');
    ray.player.hasBow = true;
    ray.player.bowCharges = 3;
    ray.player.chickenRayCharges = 8; // wins over the bow, with a full bow in hand
    stepPlayer(ray, held({ firePressed: true }), testMove);
    expect(ray.sounds).toContain('cluck');
    expect(ray.sounds).not.toContain('shoot');
  });

  // index.html:1419. One knock per block that actually pays out — a second bump on a
  // spent block is silent, which is the only feedback that says "this one is finished".
  it('a question block knocks once, and a spent one does not knock again', () => {
    const world = createWorld(0, 'normal');
    const block = world.questionBlocks[0];
    underBlock(world, block.x, block.y);

    bumpBlocksAbove(world, headTileRow(world.player.y));
    expect(world.sounds).toEqual(['block']);

    world.sounds.length = 0;
    bumpBlocksAbove(world, headTileRow(world.player.y));
    expect(world.sounds).toEqual([]);
  });

  // index.html:1420 then :1155. Three cues from one bump, and the ORDER is the live
  // one: the knock belongs to the block, the other two to the prize coming out of it.
  it('a rainbow block knocks, then hands out a prize', () => {
    setRandom(() => 0.5);
    const world = createWorld(0, 'normal');
    const block = world.rainbowBlocks[0];
    underBlock(world, block.x, block.y);

    bumpBlocksAbove(world, headTileRow(world.player.y));

    expect(world.sounds).toEqual(['block', 'pickup', 'win']);
  });

  // index.html:1447-1448.
  it('a bow and a super each chime once', () => {
    for (const which of ['bowPickups', 'superPickups'] as const) {
      const world = createWorld(0, 'normal');
      const pickup = world[which][0];
      world.player.x = pickup.x;
      world.player.y = pickup.y;

      collectPickups(world);
      expect(world.sounds, which).toEqual(['pickup']);

      // Taken once. Walking back over it in a later step says nothing.
      world.sounds.length = 0;
      collectPickups(world);
      expect(world.sounds, which).toEqual([]);
    }
  });

  // index.html:1453-1454 — the chime AND the cat's own three-note jingle on the line
  // after it, which is a bare `playTone` and went unported until this task.
  it('the cat arrives with a jingle of its own on top of the chime', () => {
    const world = createWorld(0, 'normal');
    const pickup = world.catPickup!;
    world.player.x = pickup.x;
    world.player.y = pickup.y;

    collectPickups(world);

    expect(world.sounds).toEqual(['pickup', 'cat-arrive']);
    expect(world.cat).not.toBeNull();
  });

  // index.html:1490 and :1492-1495. The puff is raised on the frame of the THIRD
  // scratch, inside the same branch — not on the following frame, when the cat is
  // actually removed.
  it('the cat scratches like a stomp, and puffs out on the third one', () => {
    const world = createWorld(0, 'normal');
    world.pending.length = 0;
    world.cat = {
      x: 100, y: 100, vx: 0, vy: 0, facing: 1, frame: 0, frameTimer: 0,
      scratchTimer: 0, scratchTarget: null, hitsLeft: 2, bounceDir: 1,
      baseY: 100, onGround: false,
    };
    world.enemies = [enemyAt(104, 104)];

    stepCat(world);
    expect(world.sounds).toEqual(['stomp']); // two scratches left: no puff yet

    world.sounds.length = 0;
    world.cat!.scratchTimer = 0;
    world.enemies = [enemyAt(104, 104)];
    stepCat(world);
    expect(world.sounds).toEqual(['stomp', 'cat-vanish']);

    // And the frame AFTER, on which the cat is finally removed, is silent.
    world.sounds.length = 0;
    stepCat(world);
    expect(world.cat).toBeNull();
    expect(world.sounds).toEqual([]);
  });

  // index.html:1511 and :1514 — the two ends of an arrow's flight.
  it('an arrow kill sounds like a stomp and a conversion like a cluck', () => {
    const kill = createWorld(0, 'normal');
    kill.pending.length = 0;
    kill.enemies = [enemyAt(100, 200)];
    kill.arrows = [{ x: 100, y: 202, vx: 0, life: 10, isChicken: false }];
    stepArrows(kill);
    expect(kill.sounds).toEqual(['stomp']);

    const convert = createWorld(0, 'normal');
    convert.pending.length = 0;
    setRandom(() => 0.5);
    convert.enemies = [enemyAt(100, 200)];
    convert.arrows = [{ x: 100, y: 202, vx: 0, life: 10, isChicken: true }];
    stepArrows(convert);
    expect(convert.sounds).toEqual(['cluck']);
  });

  // index.html:1521.
  it('a star is a coin', () => {
    const world = createWorld(0, 'normal');
    world.stars = [{ x: world.player.x, y: world.player.y, vy: 0, collected: false }];
    stepStars(world);
    expect(world.sounds).toEqual(['coin']);
  });

  // index.html:1545. The one the whole event list exists to make testable.
  it('stomping an enemy emits a stomp', () => {
    const world = createWorld(0, 'normal');
    const enemy = enemyAt(100, 150);
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi');
    world.player.x = 98;
    world.player.y = 152.4 - world.player.h;
    world.player.vy = 3; // falling — the stomp branch needs it

    stepEnemy(world, enemy);

    expect(enemy.alive).toBe(false);
    expect(world.sounds).toEqual(['stomp']);
  });

  // index.html:1546. The boing does not REPLACE the stomp, it lands on top of it —
  // both noises at once is most of what makes a big head feel silly.
  it('a big-head stomp boings as well as stomping', () => {
    const world = createWorld(0, 'normal');
    const enemy = enemyAt(100, 150);
    world.player = createPlayer(LEVELS[0], world.dc, 'gigi');
    world.player.x = 98;
    world.player.y = 152.4 - world.player.h;
    world.player.vy = 3;
    world.player.bigHeadTimer = 1200;

    stepEnemy(world, enemy);

    expect(world.sounds).toEqual(['stomp', 'boing']);
  });

  // index.html:1646 — a bare `playTone`, the only feedback that the cape is what just
  // saved you. A hit WITHOUT a cape is a death instead, and sounds like one.
  it('a cape absorbing a hit whooshes; without one it is a death', () => {
    const saved = createWorld(0, 'normal');
    saved.player.hasCape = true;
    playerHit(saved);
    expect(saved.sounds).toEqual(['cape']);
    expect(saved.dead).toBe(false);

    const killed = createWorld(0, 'normal');
    playerHit(killed);
    expect(killed.sounds).toEqual(['hurt', 'music-stop']);
  });

  // index.html:1423 — the pit save, which pays the same tone from a different branch.
  it('a cape catching a pit fall whooshes too', () => {
    const world = createWorld(0, 'super_easy'); // the one difficulty with capeSavesPit
    expect(world.dc.capeSavesPit).toBeTruthy();
    world.player.hasCape = true;
    world.player.y = world.level.height * TILE + 64; // below the bottom of the world

    const playedOn = stepPlayer(world, emptyInput(), testMove);

    expect(playedOn).toBe(false);
    expect(world.dead).toBe(false);
    expect(world.sounds).toEqual(['cape']);
  });

  // index.html:1647. The music stops WITH the death, not when the respawn happens —
  // so the ninety frames before a retry are a real silence.
  it('a death hurts and takes the music with it', () => {
    const world = createWorld(0, 'normal');
    playerDie(world);
    expect(world.sounds).toEqual(['hurt', 'music-stop']);
  });

  // index.html:1209 — the last line of initLevel, which a respawn IS. Without this the
  // first death would leave the rest of the run silent.
  it('a respawn brings the level music back', () => {
    const world = createWorld(0, 'normal');
    respawnLevel(world);
    expect(world.sounds).toEqual(['music-level']);
  });

  // index.html:1631. The fanfare, and then silence for the whole cutscene.
  it('the rescue cheers and then goes quiet', () => {
    const world = createWorld(0, 'normal', 'gigi');
    const rescueTx = world.level.rescuePos[0];
    world.player.x = rescueTx * TILE;
    world.player.y = findGroundY(world.map, rescueTx) - getRescueSprites().sprite.length * 2;

    checkRescue(world);

    expect(world.won).toBe(true);
    expect(world.sounds).toEqual(['win', 'music-stop']);
  });
});

describe('the list holds one step and nothing older', () => {
  /** Steps a world once with nothing held down. */
  function step(world: World): void {
    stepWorld(world, emptyInput(), testMove);
  }

  it('is emptied at the top of every step, so a cue nobody played does not linger', () => {
    const world = createWorld(0, 'normal');
    world.player.onGround = true;
    stepWorld(world, held({ jump: true, jumpPressed: true }), testMove);
    expect(world.sounds).toContain('jump');

    step(world); // nothing read it, and it is gone anyway
    expect(world.sounds).toEqual([]);
  });

  // The burst this exists to rule out: a death raises two cues, then ninety frozen
  // frames go by. If those frames accumulated instead of clearing, the respawn would
  // arrive with a pile of them and the game would shout on the way back in.
  it('a death and the ninety frozen frames after it never pile up', () => {
    const world = createWorld(0, 'normal');
    playerDie(world);
    world.sounds.length = 0; // as the scene would, having played them

    for (let i = 0; i < 89; i++) {
      step(world);
      expect(world.sounds, `frozen frame ${i}`).toEqual([]);
    }

    // The ninetieth is the respawn itself, and it says exactly one thing.
    step(world);
    expect(world.dead).toBe(false);
    expect(world.sounds).toEqual(['music-level']);
  });

  // The other frozen state, and the one that freezes hardest: the whole world stops for
  // 120 frames behind a power-up announcement. The two cues the announcement itself
  // raised are on the step that CREATED it; every step after that is silent.
  it('the frozen frames behind a power-up announcement are silent', () => {
    setRandom(() => 0.5);
    const world = createWorld(0, 'normal');
    world.powerupPopup = { type: 'bighead', timer: 120, maxTimer: 120 };
    world.sounds.push('pickup', 'win'); // whatever the grant left behind

    step(world);

    expect(world.powerupPopup).not.toBeNull(); // still frozen
    expect(world.sounds).toEqual([]);
    setRandom(Math.random);
  });

  it('a won level counts down in silence', () => {
    const world = createWorld(0, 'normal');
    world.won = true;
    world.stateTimer = 200;
    world.sounds.push('win', 'music-stop');

    step(world);

    expect(world.stateTimer).toBe(199);
    expect(world.sounds).toEqual([]);
  });
});

describe('every cue reaches the audio stack', () => {
  let fake: FakeAudioContext;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeAudioContext();
    setAudioContext(fake as unknown as AudioContext);
  });

  afterEach(() => {
    stopBGM();
    vi.useRealTimers();
  });

  const EFFECTS: SoundCue[] = [
    'jump', 'fart', 'shoot', 'cluck', 'block', 'pickup', 'coin',
    'stomp', 'boing', 'hurt', 'win', 'cape', 'cat-arrive', 'cat-vanish',
    'boss-fire', 'boss-charge', 'boss-roar', 'cannon-fire', 'wrong',
  ];

  // A cue the switch does not answer is silence with no error anywhere — exactly the
  // failure this whole task exists to end. So every name in the union is played here.
  for (const cue of EFFECTS) {
    it(`${cue} makes a sound`, () => {
      playCue(cue, 0);
      vi.runAllTimers();
      expect(fake.oscillators.length, `${cue} produced no oscillator`).toBeGreaterThan(0);
    });
  }

  // The learn tower plays its cues through playEffect, which takes no level index.
  it('plays an effect without a level index', () => {
    playEffect('wrong');
    vi.runAllTimers();
    expect(fake.oscillators.map((o) => o.type)).toEqual(['triangle']);
  });

  it('music-level starts the theme the scene names, not some fixed one', () => {
    playCue('music-level', 3);
    expect(getCurrentTheme()).toBe(3);
  });

  it('music-stop stops it', () => {
    playCue('music-level', 2);
    expect(getCurrentTheme()).toBe(2);
    playCue('music-stop', 2);
    expect(getCurrentTheme()).toBe(-1);
  });

  it('plays the step in the order it was raised, and empties the list behind it', () => {
    const world = createWorld(0, 'normal');
    world.sounds.push('coin', 'stomp');

    playSounds(world, 0);

    expect(world.sounds).toEqual([]);
  });

  // Idempotent on purpose: a caller that plays the same list twice in one frame gets
  // silence the second time rather than a double. That mistake is otherwise inaudible
  // until it is a machine-gun of stomps.
  it('playing an already-played list makes no further sound', () => {
    const world = createWorld(0, 'normal');
    world.sounds.push('coin');

    playSounds(world, 0);
    vi.runAllTimers();
    const after = fake.oscillators.length;
    expect(after).toBeGreaterThan(0);

    playSounds(world, 0);
    vi.runAllTimers();
    expect(fake.oscillators.length).toBe(after);
  });
});
