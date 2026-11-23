# Playtest: does the new engine feel the same?

This is the validation gate for the Phaser migration. Everything after it is refinement.
If it fails, walking away is still cheap — which is the whole reason it comes first.

## What to play

| | Where | What it is |
|---|---|---|
| **Old** | `https://srumjant.github.io/gi-do/` | the real game, unchanged |
| **New** | `https://srumjant.github.io/gi-do/next/` | all six levels, on Phaser |

**The new one needs a keyboard or a controller, so it does not work on the iPad at all.**
The real game has on-screen buttons; the port has none yet, so it is laptop-only for now.
Arrows or WASD to move, space to jump, X to shoot.

**A controller works as of 2026-09-22**, and it works on the menus too — a child who picks
one up can choose a difficulty and a hero with it, not just run and jump. Xbox, PlayStation
and Switch pads are all recognised, and the button prompts on screen change to match
whichever one is plugged in. Ⓐ (✕ on a DualSense) jumps and confirms, Ⓑ (○) shoots during
a level and goes back in a menu, Ⓧ (□) shoots, and the d-pad and the left stick both move.
Pickups buzz the pad. What does not buzz yet is landing on an enemy's head, because that is
the screen shake, and the screen shake is still missing.

## What the new one deliberately does not have

Say this up front or the first thirty seconds are just them listing it:

no title screen (it starts on the difficulty screen), no pause, and no learn mode.

**Every enemy is there now.** The **ghost** and the **cannon** were the last two, and they
arrived on 2026-09-22, so levels 2, 3, 4 and 6 are no longer emptier than they should be —
that is the thing to check on those levels. A ghost hangs in the air bobbing until you get
close, then comes straight at you through walls and floors; it is see-through and it
pulses. A cannon sits still and spits flat fireballs along the ground, and **you cannot
jump on it** — landing on a cannon's head hurts you, exactly as in the real game. Shoot it,
or turn it into a chicken and then jump on it.

**Level 6 has its boss now.** It breathes fireballs, roars when it is losing, and has to be
beaten before you can reach your sibling — who is in a cage behind it until it falls. An
arrow hurts it; a chicken ray bounces off, exactly as in the real game. What is missing is
the punch around it: no screen shake when you land on its head, and none of the sparks and
smoke, because the port has no particle system yet.

Everything else is there now: all six levels with every enemy on them, difficulty and
character choice, hearts, score, the cat, the bow, the chicken ray, the silly power-ups,
the cape, and the between-level cutscene.

**The sound arrived on 2026-09-22 and is the thing to listen to.** Every effect and every
theme, including two the original plays that are easy to miss: the cat has a little tune of
its own when it turns up, and a cape absorbing a hit makes a sound of its own.

One thing about it is worth knowing before it looks like a bug. A browser will not start
audio until somebody presses a key, so **the difficulty screen is silent until you confirm
on it** — the menu music starts from that keypress and the level's own theme takes over
when the level does. If the game stays silent after that first confirm, that is the failure
to report and it is the most likely one: the sound has only ever been checked by
instrumenting the browser, never by ear. **You are the first person to hear it.**

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
level building, the sprites, the translations — and now the sounds, both ends of them: that
the audio engine makes the right noise, and that the simulation asks for the right noise at
the right moment. Stomping an enemy raising a stomp is a real test now, which it never was
in the original. Those are pure logic and they still have their tests.

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

## Second levels, batch 1 (2026-11-22)

Two new levels sit in the run now, each right after its theme's classic level:
**Nukuaed II** (stage 2) and **Dinosauruse kanjon II** (stage 4). The six classic levels are
unchanged. To play one straight away, add `?level=N` to the address: `?level=2` is Nukuaed II,
`?level=4` is Dinosauruse kanjon II (the menus still come first: difficulty and hero).

- **Nukuaed II is about the bow.** A drawbridge lowered by shooting its target; a portcullis
  whose target hangs too high for a standing shot, so you jump and fire at the top of the
  jump; a tunnel of red guards that bounce you back until you shoot them; a spring up the
  sibling's tower.
- **Dinosauruse kanjon II is about the fart jump.** Canyon ledges and pits first (plain
  jumping), then two 7-tall steps that only a fart jump climbs (a spare fart waits on the
  first step), then the two-tool puzzle: fart up to a ledge under a rock overhang, shoot the
  target hanging over the chasm from there, and the bridge comes down below. Then cannons,
  and a spring up the mesa.

Every obstacle was checked on all four difficulties, by tests and in the browser.

### What to watch

- **Anywhere stuck for more than a minute,** or **more than three or four deaths in one
  section**: that section needs changing. Say which one.
- **Jump and shoot** at the portcullis: do they work it out on their own? A standing shot
  flies under the target, on purpose.
- **The two-tool puzzle** in the canyon: do they think of going up to the ledge to shoot?
  If not, that is the most likely place to need a hint (an arrow sign, a glint on the ledge).
- **The car on the far side of the first drawbridge** walks onto the bridge once it is down:
  jump it or shoot it. Fair, or too mean?
- **Length**: the demo's 2-3 minutes was "fine"; these are about the same each.

## Doll Garden, the whole theme (2026-11-22)

Doll Garden is now three levels and a boss, at the start of the run: **Nukuaed** (the
original level, rebuilt), **Aiavärav** (the Garden Gate, which was Nukuaed II) and
**Nukumaja** (the Doll House), where the **Doll Queen** waits. `?level=1`, `?level=2`,
`?level=3` open each one.

- **The story is a chase now.** At the end of Nukuaed and Aiavärav the Doll Queen leaps away
  with the sibling ("JÄLITA NEID!"), and the cutscene shows her running off with them. The
  sibling is rescued only after she is beaten.
- **Zombies.** The dark enemies your child called zombies are zombies now: grey-green, red
  eyes, they sway and groan, and come after you. They still can't be stomped and never
  hurt; they push you back, and an arrow puts them down. Two appear right after the first
  bow in Nukuaed.
- **Nukumaja** is indoors: a target behind three zombies; a gate that needs two targets,
  one of them high (jump and shoot); a target you can only line up from the top of the
  stairs. Then the throne room: the door shuts behind you.
- **The Doll Queen.** Her parasol turns arrows and stomps away. Shoot the target that pops
  up and the parasol flies off; she sits down dizzy with stars round her head, and a stomp
  or an arrow then costs her a heart. Three hearts: the first target is low, the second
  high (jump and shoot), the third high by the door behind you (turn round). She throws
  slow hearts at you, and calls zombie dolls when she is hit.
- **The T-Rex** at the very end of the game has a new look: a proper green T-Rex in
  profile. Its fight is unchanged for now.

### What to watch

- Does your child find the parasol-and-target idea without help? If not, what did they try?
- The third round: do they think of turning round to the target by the door? Standing
  just inside the door, under it but a step to the right, is the safe place to shoot from.
- Zombies: fun, or too scary? (They were the child's own word.)
- Anywhere stuck for more than a minute, or more than three or four deaths in a section.

## Dinosaur Canyon, the whole theme (2026-11-22)

Dinosaur Canyon is now three levels and a boss, right after Doll Garden: **Dinosauruse kanjon**
(the canyon, rebuilt), **Kaljusein** (the Canyon Wall, which was Dinosaur Canyon II) and
**Vulkaan** (the Volcano), where the **Pterodactyl** waits. `?level=4`, `?level=5`, `?level=6`
open each one.

- **The Pterodactyl is the villain now.** She flies off with the sibling at the end of the
  first two levels, up and away, and in the cutscene she flies with them hanging below her.
- **Kanjon** hands over the theme's tool: a cliff no plain jump climbs, with the fart station
  right in front of it. Then the bow comes back for two zombie dinos, and a cannon on a ledge.
- **Kaljusein** is the old Dinosaur Canyon II, with two zombie dinos by the cannons, and the
  chase on top of the mesa.
- **Vulkaan**: lava. Falling in is a fall (Super Easy's cape throws you back out once). Stones
  over the lava with a vent between two that spits fire straight up, glowing first; a fart up
  the volcano wall, then rock to rock over more lava past another vent; zombie dinos and a
  cannon. The fart lasts 15 seconds, so the jumps after the wall are big fart jumps: every rock
  is wide enough that a jump held to the right still lands on it.
- **The Pterodactyl.** The arena door shuts behind you. She circles too high for a plain jump;
  take a fart from one of the two stations and jump when she is over you: you go up past her
  and land on her back. Three landings. She drops rocks (a shadow on the ground shows where),
  flies off after each hit and calls zombie dinos, and comes back quicker. The sibling is in a
  cage on the rock at the end.

### What to watch

- Does your child work out the fart station at the first cliff alone? If they get stuck at
  the cliff without it, do they think of going back for it?
- Lava: frightening, or fun? Does the vent's glow read as a warning?
- The fight: do they find jumping up under her, or do they try to shoot her first? (Arrows
  bounce off her.)
- Anywhere stuck for more than a minute, or more than three or four deaths in a section.

## Tallinn, the whole theme (2026-11-22)

Tallinn is now three levels and a boss, right after Dinosaur Canyon: **Tallinna vanalinn**
(the Old Town, rebuilt), **Tornid** (the Towers) and **Raekoja plats** (Town Hall Square),
where **Vana Toomas** waits. `?level=7`, `?level=8`, `?level=9` open each one.

- **The big head is the tool.** It smashes cracked stone (the brown, cracked blocks). The town
  gate is a tower too tall to jump whose doorway is bricked up with it, and the big head
  station stands in front.
- **Zombie knights** are Tallinn's zombies: little rusty knights. Same rule as ever: they
  push, never hurt, and an arrow puts them down.
- **Vana Toomas** runs off with the sibling at the end of the first two levels.
- **Tornid**: a spring onto the town wall; a tower on the wall walk with a cracked door; a
  tower whose floors are cracked, so the big head drops you through them; a target behind a
  cracked tower door that opens a gate; zombie knights in a low passage; a spring up the last
  tower.
- **Raekoja plats**: zombie knights in front of a cracked door (shoot them first); a spring
  onto the town wall, where a cracked wall hides the target for the gate below (if you drop
  down before shooting it, a second spring takes you back up); cannons behind low walls.
- **Vana Toomas.** The square's door shuts behind you. Without a big head he is all armour:
  you bounce off, nothing hurts. With one, land on him (or run into his back) and a piece of
  armour flies off: helmet, breastplate, shield. Not while his flag pole is up: then he is
  braced, and he slams it down, sending a shockwave along the ground to jump. After each hit
  he staggers away and calls two zombie knights. Beaten, he sits down in his striped vest.

### What to watch

- Does your child think of the big head at the first tower, or try to jump it?
- The falling tower in Tornid: fun, or confusing?
- The fight: do they find landing on his helmet? Do they jump the shockwave, and wait while
  the flag pole is up?
- Anywhere stuck for more than a minute, or more than three or four deaths in a section.
