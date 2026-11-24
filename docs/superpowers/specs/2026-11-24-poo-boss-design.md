# Härra Kaka, the poo boss

The owner's children (2026-11-24): "next boss should be piece of poo, lets demo it in separate
screen where i can play only boss level". Asked how it should fight and where, the owner chose
**stomp and split** in **a bathroom, flushed away** at the end. Approved 2026-11-24.

## The fight

Changed the same day: the owner found stomp and split "too simple", and asked for a button on
the toilet that flushes a bit of the poo each time and throws the hero to the other side; and
for the poo to hurt the hero ("it damages player actually").

- **Härra Kaka** (Mr. Poo): a big poo with a face, flies buzzing round it, hopping about a
  bathroom toward the hero. Before each hop it crouches; landing ("PLOP") sends a green stink
  wave along the floor both ways: low, so every jump clears it. A wave never starts on top of the
  hero (on Hard, a poo landing beside the hero made a hit nobody could jump).
- **Touching the poo hurts**, on top or at the side: nobody stomps on a poo. Only its body
  hurts, not the empty corners of its box, so a jump over it that clips a corner gets over it.
  Measured: every difficulty's jump stays above its body long enough to clear it with room
  to spare (Hard: 27 frames, 71 px, against 46 needed). Arrows stick in it and do nothing.
- **The toilet is the weapon.** A red flush button sits on top of its tank ("button is on top of
  toilet and opens lid"). Coming down from a jump through the button's height anywhere over the
  back of the bowl, the tank or the gap behind it presses it (the toilet is not solid, so a child
  walks into it, and Super Easy's fast run carries one past the tank). The tank's top is 60 px up
  and Hard's jump lifts the feet 62: a standing jump at the toilet presses it on every difficulty.
  The button goes down, the lid springs open and throws the hero in an arc about 190 px back
  toward the bathtub, while the super flush sucks the poo across the floor into the bowl, and
  its stink waves with it, so nothing waits where the hero lands. A piece of the poo goes down;
  the rest is spat back out between the hero and the toilet, smaller and quicker, with two little
  poos: to flush again, the hero has to get past it. Lying squashed, only its flat heap hurts.
- **The lid** covers the whole seat, from the bowl's front to the tank, hinged at its back end at
  the tank, and opens 45 degrees ("lid should open 45 %", "cover whole part of sitting area"). It
  lies just behind the toilet and the whirling poo, so it tucks under the tank's edge as it tips
  up and never covers the poo going in.
- **Three flushes** and it is gone for good, whirling down the bowl: "NÄGEMIIIST!". The cage
  opens; walking in wins.
- The poo keeps clear of the toilet, so the lid can always be reached. Hops are slower and lower
  on Super Easy, quicker on Hard.

## The bathroom

A short tiled corridor, then the bathroom: tiled walls, a bathtub with rubber ducks at the left,
a giant toilet at the right, the sibling in the cage on a step at the end. The door shuts
behind the hero, as in the other boss rooms.

## The show

Everything batch 1 of the boss show gave the others (docs/superpowers/specs/2026-11-23-boss-show-design.md):
the name in big letters, the taunt "MA OLEN SUUR JA HAISEN!", lines when flushed and on the last
heart, a laugh when the hero is hurt, blinking, the crouch, the white flash, redder as its hearts
go, eyes shut when spat out. The Super Easy hint: "ÄRA AINULT NUPPU VAJUTA!".

## A screen of its own

`?boss=poo` on the address: choose the difficulty and the hero as usual, then straight into
the bathroom, no cutscenes. The run of 18 levels is untouched. Beating it goes to the win
screen ("HÄRRA KAKA ON MINEMA LOPUTATUD!"), and from there back to the title.

## How it is built

- `src/game/bosses/poo.ts`: the rules, pure, like the other bosses; in the boss union.
- `'poo'` joins `Villain` and `BossKind`; the little poo (`poolet`) joins the enemy types.
- The stink wave is an enemy projectile, type `stink`, 8 px tall, like Toomas's wave.
- `src/data/levels2/vannituba.ts`: the level, not in `STAGES`; `src/data/demos.ts` names it.
- `src/game/run.ts`: a demo run of one stage; `scenes/startStage.ts` reads `?boss=`.
- `src/gfx/poo.ts`: its view, with the bathroom's toilet, bathtub and ducks, the flies, the
  show, and the flush.
- New drawings: the poo, the little poo, the toilet, the bathtub, a duck, the stink cloud.

## Tests

The rules (the hop and its stink wave, the wave low enough to jump on every difficulty, a stomp
is a hit and splits two little poos, a bump never hurts, arrows do nothing, three hits beat it,
nothing hurts once beaten); the level (the ledge and dead-end checks run on it too); the demo
run (one stage, then won); every line translated, in capitals. In the browser: a whole fight on
Super Easy and on Hard, from `?boss=poo`.
