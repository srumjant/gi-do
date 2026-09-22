# Playtest: does the new engine feel the same?

This is the validation gate for the Phaser migration. Everything after it is refinement.
If it fails, walking away is still cheap — which is the whole reason it comes first.

## What to play

| | Where | What it is |
|---|---|---|
| **Old** | `https://srumjant.github.io/gi-do/` | the real game, unchanged |
| **New** | `https://srumjant.github.io/gi-do/next/` | all six levels, on Phaser |

Both work on the iPad and on the laptop. Keyboard only for the new one — arrows or WASD to
move, space to jump.

## What the new one deliberately does not have

Say this up front or the first thirty seconds are just them listing it:

**no music and no sounds at all**, no title screen (it starts on the difficulty screen),
no pause, and no learn mode. Two enemies are missing — the **ghost** and the **cannon** —
so levels 2, 3, 4 and 6 are emptier than they should be. There is **no boss**, so level 6
ends like any other level.

Everything else is there now: all six levels, difficulty and character choice, hearts,
score, the cat, the bow, the chicken ray, the silly power-ups, the cape, and the
between-level cutscene. Level 5, the ice one, is complete — every penguin and icebat it
is supposed to have.

The felt style is not there, but that is off by default in the real game too, so unless
someone has turned it on with `F`, both should look the same. A couple of visual extras
are missing: the sparkles when you pick something up, and the coloured border that flashes
round the screen while a power-up is running.

## What to ask

Not "is it good?" — they will say yes. Ask them to play the same bit of level 1 in both,
then ask these, in this order:

1. **Which one feels floatier when you jump?** (or heavier, or slower to come down)
2. **Which one is easier to land on an enemy?**
3. **When you jump, does it go where you thought it would?** Which one surprises you more?
4. **Which one is easier to stop running in?**
5. **Which is harder to jump off the edge of a hole in time?**
6. *Only after all of the above:* **which one would you rather play?**

If you can, don't tell them which is which. "This one" and "that one" is enough.

## What to write down

Their exact words, including the ones that do not fit the questions. "It's weird" is data;
so is a shrug. Add them here:

```
Date:
Who played:

Q1 floatier:
Q2 easier to land on an enemy:
Q3 jump goes where expected:
Q4 easier to stop:
Q5 edge of a hole:
Q6 which would you rather play:

Anything they said unprompted:
```

## What the machine still checks — and what it no longer can

**This changed on 2026-09-22, and the change matters for how you read the children.**

The port used to be compared against the live game frame by frame, to the decimal: scripted
inputs fed to both, positions and velocities diffed with no tolerance. That was true, and it
is no longer.

The player and the ground-patrol enemies now run on Phaser's Arcade Physics, by choice. Arcade
separates bodies from tiles its own way, so exact agreement with the hand-rolled original is
not merely untested — it is **not possible**, and not wanted. That comparison has been retired
deliberately.

**Still checked, and still exact:** everything that is not movement. Pickups, score, the
blocks you hit from below, the three silly power-ups, the cat, arrows and the chicken ray,
level building, the sprites, the sounds, the translations. Those are pure logic and they still
have their tests.

**No longer checked by anything:** how it feels to move. The weight of a jump, whether landing
reads right, whether a ledge catches you.

### So the children are now the only judge of feel

There is no test that can disagree with them. If a child says the jump feels wrong, there is
nothing to check it against — **believe them, and say so**.

### Four things we already know changed

Worth watching for, and worth not treating as new bugs if they come up:

- **Walking into a wall used to jitter.** The old code left a 1px gap and the player buzzed
  against it. Now it rests flush. This is a fix, but it will look different.
- **Ledges are more forgiving.** The old code dropped you once about 3px of you hung over the
  edge; Arcade keeps you up while any part of you is on. Easier, and a real change to how
  jumps off platforms feel.
- **Enemies no longer sink into walls.** A doll or a dino walking into a wall used to push a
  fraction of itself into the wall tile for the one frame before it turned around, and you
  could see it. Now it stops against the face and turns. Same fix as the player's, and the
  same kind of small visual difference.
- **Two `?` blocks side by side can no longer both be popped with one jump.** No level has such
  a pair today, so this may never show up.

Anything *else* they notice about movement is new information, and there is no longer a trace
that can confirm or deny it. That is the cost of the switch, and it was accepted knowingly.
