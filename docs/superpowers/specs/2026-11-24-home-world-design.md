# World 7: Kodu, a normal day at home

The owner (2026-11-24), after Härra Kaka: "lets build whole level around bathroom and toilet,
just things happening in small kids life". Asked where, the owner chose a new world in the run:
"after t-rex, but now it's their normal day and final boss is poo, aligns with daily schedule";
three levels like every other world; mostly redrawn things, with one new trick per level.
Approved 2026-11-24.

## The world and the story

- **World 7: KODU (HOME)**, after the T-Rex's Toy Castle. It is the run's new end: 21 levels.
- After the T-Rex's fight: the reunion, and the T-Rex, dazed, says "MA OLEN NÜÜD PISIKE..."
  (the line the win screen says today). Then the kids are home on a normal morning:
  Härra Kaka pops up out of the toilet, grabs the sibling ("HIHII! %S ON NÜÜD MINU!") and the
  headline says "HÄRRA KAKA VIIS %S ÄRA!". The snatch is drawn at home, on the bathroom's
  wallpaper, not in the castle. The map then walks the kids to a seventh stop, a little house:
  "MAAILM 7: KODU".
- One level for each part of the day:
  - **HOMMIK** (morning): Härra Kaka hops off with the sibling at the end.
  - **PÄEV** (day): he hops off again.
  - **ÕHTU** (evening): bath time, then the toilet and his fight, as he is now (three flushes).
- After the third flush, the win screen: "HÄRRA KAKA ON MINEMA LOPUTATUD!" and "HEAD ÖÖD!".
- The world has its own tune: playful, bouncy, bath-time.
- `?boss=poo` still plays the bathroom fight on its own.

## The three levels

**HOMMIK** (morning), ending in a chase:
1. The bedroom: you start on a bouncy bed with a ? block over it; toy blocks to climb, a
   rainbow block. No fly here: bouncing on the bed puts the hero right where a fly flies.
2. The hallway: smelly socks walking at you (stomp them); the bow, a fly, then a hairbrush,
   which nobody stomps: shoot it.
3. The sink: a step stool up onto the counter, and the **dripping taps**: run under them between
   drops. A slippery toothpaste puddle lies just past a tap, never just before one, so a child
   who stops to wait does not slide under the drip.
4. The potty: Härra Kaka with the sibling hops off as you come.

**PÄEV** (day), ending in a chase:
1. Back in from outside: muddy boots to climb, and plungers jumping up and down in your way:
   run under one while it is up, or stomp it while it is down.
2. The laundry: a basket of socks, and a washing machine too tall to jump: the fart jump.
3. Washing hands: **soap bubbles** rise from the soap; ride one up to a high shelf, where a
   target opens the shower curtain (a gate).
4. Toilet brushes spinning round in the way: slip past while the brush is turned away. Then
   Härra Kaka hops off with the sibling again.

**ÕHTU** (evening), ending in the fight:
1. The bath is filling: a wet, slippery floor, and shampoo bottles squirting soap blobs.
2. The bath: a long tub of water and **rubber ducks** drifting back and forth on it; hop duck to
   duck. Falling in is a fall: back to the last potty.
3. The toilet: the door shuts, Härra Kaka.

## The new tricks

- **The dripping tap.** A tap under a ceiling or shelf. It wobbles, then lets go of a drop,
  which falls straight down and splashes on whatever is below; a drop that touches the hero is
  a hit. Drops come slower on Super Easy than on Hard, and the gap between two drops is always
  long enough to run under at the difficulty's speed.
- **Soap bubbles.** A soap dish lets go of a bubble every few seconds. It rises slowly and pops
  when it touches anything solid above it. Land on a bubble from above and it carries you up;
  jump off it onto a shelf. When it pops, you drop. They come more often on Super Easy.
- **Rubber ducks.** Ducks float on a tub's water, drifting from one end to the other and back,
  bobbing a little. Land on one from above and it carries you; slower on Super Easy.
- Bubbles and ducks are one new thing, a **riding platform**: solid only from above, carrying
  whoever stands on it. A bubble rises and pops; a duck drifts and turns.

## New pictures

- Enemies. Four are drawn new on a behaviour that already exists; two are new behaviours, the
  owner's ideas ("something that stays in place, but jumps", "something that rotates around
  its axis"):

  | Enemy | Plays like |
  |---|---|
  | smelly sock | the doll: walks, stomp it |
  | fly | the bat |
  | shampoo bottle | the cannon: soap blobs for fireballs |
  | hairbrush | a zombie: no stomp, an arrow puts it down |
  | plunger | new: stays in its place and jumps straight up, again and again; it squats before each jump, and lands with a PLOPP. Touching it hurts; stomp it while it is down, or run under it while it is up |
  | toilet brush | new: a long brush spinning round its middle on one spot, like a propeller; the whole brush hurts and nothing beats it; slip past while it is turned away |

  The plunger jumps less often on Super Easy; the brush turns slower on Super Easy, and it is
  always placed so that every difficulty has a gap to pass through. The little poos come back
  where it fits.
- In this world the checkpoint flag is a **potty**.
- **Furniture**: a bed, the sink and its step stool, the washing machine, the laundry basket, a
  towel rail. A level lists its furniture with a place for each; each is a picture drawn over
  the blocks it stands on (the washing machine is a wall of blocks drawn as a washing machine),
  with no rules of its own.
- Ground and walls in bathroom tiles; the wet floor is the ice tile and the bath water the
  water tile, in this world's colours. The time of day shows in the wallpaper's colour: bright
  in the morning, warm in the day, dusky in the evening.

## How it is built

- Theme 6 is the first theme with no classic level behind it. Its colours come from its levels'
  own look; its tune is a seventh entry in the music list; the map draws a seventh stop; the
  classic kidnapper cutscene is not used, because the story covers every transition into it.
- Enemy types `sock`, `fly`, `shampoo`, `hairbrush`, each with its letter in the level format
  and the behaviour of the one it plays like; `plunger` and `toiletBrush`, with behaviours of
  their own (the brush, which cannot be beaten, is a course part like the vent rather than an
  enemy, so no stomp, arrow or ray touches it).
- The tap: a course part like the lava vent, its drops enemy projectiles of a new type.
- The riding platform: pure rules in `src/game` (where it is, how it moves, who stands on it),
  a Phaser body the hero's mover collides with from above, and its picture.
- Furniture: a list in the level spec, drawn behind the hero.
- The poo arena is one section shared by ÕHTU and the `?boss=poo` level.
- The story: the T-Rex's beaten line, the poo's grab line, the snatch at home, the house on the
  map; the win screen's lines.

## Steps

Built on one branch, one PR, in three steps; after each, the owner and the children play it on
the dev server before the next:
1. The world, the story, the furniture, the sock, the fly and the hairbrush, the potty, the
   tune, the dripping tap and HOMMIK. Built 2026-11-24 (plan
   `docs/superpowers/plans/2026-11-24-home-world-step-1.md`); the towel rail waits for step 2. Until ÕHTU exists, the world's last level is today's bathroom (`?boss=poo`'s), so
   the run plays through to the end at every step.
2. The riding platform with its bubbles, the plunger, the toilet brush, the washing machine,
   and PÄEV. Built 2026-11-24 (plan `docs/superpowers/plans/2026-11-24-home-world-step-2.md`),
   with the towel rail; `potty` became `home` (potties and a shower curtain for a gate).
3. The ducks on the same platform, the shampoo bottles, and ÕHTU in place of the bathroom. Built
   2026-11-24 (plan `docs/superpowers/plans/2026-11-24-home-world-step-3.md`): each duck keeps to
   its own stretch of the bath, neighbours meeting at their border; a towel shelf over the bath's
   near end keeps a Super Easy jump onto the rim from flying into the water.

## Tests

The tap (a drop falls, hits, splashes; the gap between drops is long enough to run on every
difficulty); the riding platform (lands from above only, carries the hero, a bubble pops at a
ceiling, a duck turns at the tub's ends); the redrawn enemies behave like the ones they copy;
the plunger squats, jumps and lands where it stood, hurts by touch and is stomped only while
down; the toilet brush turns at its difficulty's speed, hurts along its length, and leaves a
gap every difficulty's run gets through; the
story's beats into and out of the home world; the run ends on ÕHTU; every line translated, in
capitals. The ledge and dead-end checks run on the three levels. In the browser, a bot plays
each level on Super Easy and on Hard.
