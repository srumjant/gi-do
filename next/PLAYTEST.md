# Playtest: does the new engine feel the same?

This is the validation gate for the Phaser migration. Everything after it is refinement.
If it fails, walking away is still cheap — which is the whole reason it comes first.

## What to play

| | Where | What it is |
|---|---|---|
| **Old** | `https://srumjant.github.io/gi-do/` | the real game, unchanged |
| **New** | `https://srumjant.github.io/gi-do/next/` | level 1 only, on Phaser, drawn as coloured rectangles |

Both work on the iPad and on the laptop. Keyboard only for the new one — arrows or WASD to
move, space to jump.

## What the new one deliberately does not have

Say this up front or the first thirty seconds are just them listing it:

no pictures (everybody is a rectangle), no music, no sounds, one level, no hearts, no
score, no menus, no cat, no bow, no power-ups, and **the enemies cannot hurt you** — you
can jump on them, but walking into one does nothing.

The white rectangle is you. The red ones are enemies. Green is the ground, brown is a
platform, gold is a `?` block.

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

## What the machine already checked

Worth knowing so the questions above are the only ones being asked of the children.

Twelve scripted input sequences are fed to **both** the live game and the port, and their
position, velocity, grounded state, camera and enemies are compared **every frame, to the
decimal**. The live game's real physics is driven headlessly for this — not a copy of it,
the actual `index.html` running in a sandbox. All twelve match exactly.

So "does it move identically" is answered, and answered harder than a person could. What
that cannot tell us is whether it *feels* the same to play in a real browser — input
latency, how the screen scrolls, whether landing on something reads right. That is what
the children are for.

If they say it feels different, believe them and come back to the traces. A frame-perfect
match and a child saying "it's wrong" at the same time would mean the difference is in
presentation rather than simulation, and that is a useful thing to have narrowed down.
