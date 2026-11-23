# The boss show

The owner (2026-11-23): "lets make bossess more interactive too and add animations to them
too, make fun". Asked what "interactive" should mean, they picked all four: the bosses react
to everything, entrance and defeat shows, new things to do in each fight, livelier bodies.

Split in two batches. **This is batch 1, the show**: reactions, speech, livelier bodies,
entrances and defeats, for all six bosses. It changes how the bosses look and talk and not how
a fight plays, so it cannot make one unwinnable. Batch 2, a new trick in each fight, changes
rules and comes after, with its own design; its ideas are listed at the end.

## What a child sees

**Reactions and speech.** A speech bubble over the boss, in capitals, Estonian and English,
one at a time, each for about a second and a half:

| When | What | Example |
|---|---|---|
| The hero reaches the arena | The boss's name in big letters, and a taunt | NUKUKUNINGANNA! "MINU VIHMAVARI KAITSEB MIND!" |
| Something that does not count yet | A line of its own, a wobble | the parasol: "HAHA! VIHMAVARI!" |
| A hit | "AI!", "OI-OI!", "AUH!" in turn | |
| The last heart left | "OH EI!" | |
| The hero is hurt | A laugh | "HAHAA!" |
| Stuck for 8 seconds (Super Easy and Easy only) | The boss blurts out its weakness | "ÄRA AINULT MÄRKI LASE!" |
| Beaten | A line of its own | "MU VIHMAVARI! BUHUU!" |

"Does not count yet" is the event each boss already raises: the Doll Queen's and Vana
Toomas's `clang`, the Pterodactyl's `bounce`, the Pizza Chef's `swat` and `bonk`, the Yeti's
and the T-Rex's `thud` and `bonk`. Those lines wait three seconds before they repeat, so a
child firing arrows does not get a wall of bubbles.

The hints are reverse psychology, by the tool the fight wants right now: the target
("ÄRA AINULT MÄRKI LASE!"), a fart jump, a big head, the chicken ray, a jump on the head
while dizzy, jumping over a charge. The T-Rex's follows his round. A hint comes again every
ten seconds while the child is still stuck; a hit resets the clock.

**Livelier bodies.**

- Walking or flying: a bob and a squash in step. Standing: a slow breath.
- Facing the hero, as the rules already have them do.
- Before an attack, a crouch (squash down, then up as it comes): the Doll Queen before a
  heart, Toomas while his pole is up, the Chef before a pizza, the Yeti winding up, the
  T-Rex roaring.
- A hit: a white flash and a squash. Something that does not count: a short wobble.
- Dizzy or hurt: eyes shut. As hearts run out, redder: a red copy of the boss laid over it,
  a little stronger with each heart lost.

**Entrances.** On `wake` (the hero crossing into the arena), the name comes up big over the
screen for about a second and a half, the boss hops and lands with a shake, and says its
taunt. Play does not stop.

**Defeats**, one each:

- **The Doll Queen**: her parasol flies off, she spins, then runs off the side crying.
- **The Pterodactyl**: tumbles down in a cloud of feathers, then flaps away.
- **Vana Toomas**: his armour flies off and he runs away in spotted underpants.
- **The Pizza Chef**: turns into a chicken and runs off clucking.
- **The Yeti**: slips, slides along the floor and shrinks into a little snowman.
- **The T-Rex**: spins, shrinks into a toy with confetti and bounces.

## How it is built

- **`src/game/bossShow.ts`**, pure and tested: once per step, from the boss's state, the
  events its view drained, the hero (hurt or not) and the difficulty, it decides the look
  (bob, squash, wobble, flash, redness, eyes shut, entrance hop) and what is said. Each
  boss's events and phases are mapped onto a few shared ones by a small table in the same
  file: which events do not count, which phase is a wind-up, which hint fits now.
- **`src/gfx/bossShow.ts`**, the Phaser side, shared by the six views: the speech bubble,
  the name banner, two overlays per boss (white for the flash, red for the anger), and
  applying the look to the boss's pictures after the view has placed them.
- **Pictures by rule** (`src/gfx/bossFrames.ts`, pure): each boss's eyes are one palette
  index (the Doll Queen 6, the Pterodactyl 4, the Chef 4, the Yeti 5, the T-Rex 6 in his eye
  rows, Toomas 6 without his helmet), so "eyes shut" is a dark dash two pixels wide where
  the pupil was, the whites and glints painted with the colour around them. (Painting the whole
  eye over, the first try, left the faces with no eyes at all.) The white and red copies are the sprite in one colour. Toomas's underpants are
  his bare sprite with the shirt gone and the shorts white with red spots. One new drawing:
  the Yeti's little snowman.
- **The six views** (`src/gfx/dollQueen.ts` and the rest) each make a show, hand it the
  events they drain, and play their own defeat.
- Cheap to draw, for the TV: pictures, tweens and short particle bursts, nothing redrawn
  every frame.

## Tests

- `tests/bossShow.test.ts`: each kind of line comes when it should and not otherwise (the
  three-second wait, hints only on Super Easy and Easy and only when stuck, the order when
  several happen at once); the look's numbers (the hop, the crouch, the flash fading); every
  line's key is translated, in capitals.
- `tests/bossFrames.test.ts`: eyes shut changes only the eyes; every boss's eye index is in
  its sprite; the copies keep the sprite's shape.
- In the browser, every boss: the entrance, a "does not count", a hit, the laugh, a hint on
  Super Easy, the defeat; that nothing during an entrance hurts; and the frame time on the
  TV benchmark (`gl.finish` per frame) stays where it is.

## Batch 2, for later

One new trick in each fight, each its own small design: the Doll Queen's parasol as a
trampoline to reach the high targets; shooting a falling rock back up at the Pterodactyl so she
glides low; shooting Toomas's flag over his face so he stumbles blind with his back open;
shooting a pizza back into the Chef's face; shooting a hanging icicle onto the Yeti; shooting
the T-Rex's fireballs into confetti.
