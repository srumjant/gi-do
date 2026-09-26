# The learn tower

**Date:** 2026-09-23
**Status:** Approved in brainstorming; ready for an implementation plan
**Scope:** Step 8 of the Phaser migration (`2026-09-20-phaser-migration-design.md`): learn
mode, built in `next/`. The live game's learn mode in `index.html` is not changed.

## Summary

Learn mode becomes a castle tower that the child climbs storey by storey. Each storey ends
in a brick ceiling with three big letter blocks set into it. The voice says a letter; bumping
the right block from below springs the child up through the ceiling into the next storey.
Four gates make a tower, and a star waits on the roof.

This is a redesign, not a port. The migration's bug-for-bug contract does not apply,
because the owner's playtest of the live learn mode was: "gate is strange red line,
jumping areas are either too close or too far, design of level should be nice."

## What is wrong with the live learn mode

| Complaint | Cause in `index.html` |
|---|---|
| The gate is a strange red line | The "gate barrier" is a dashed `rgba(255,100,100,0.4)` stroke drawn across the gate row (`:2853-2857`). It is decoration only; the real gate is three separate floating blocks. |
| Too close | Steps are 45px apart (`:2571`, `:2593`) while a held jump rises 106px, and step centres stay within 100px of each other (`MAX_HOP`, `:2549`) on steps 100-130px wide. The steps sit almost on top of each other: one jump carries you past the next two, so climbing is just pressing jump. |
| Too far | The three answer blocks sit at x = 70, 260, 450 (`:2582`, `:2604`) above a centred launch pad. The middle answer is straight up; the outer two need a 130px leap at full speed, and a push that starts a moment late falls. |

The September refinement (`docs/plans/2026-09-20-learn-path-refinement.md`) planned fixes
for `index.html`, but only its game-wide tasks 1-5 were built. Its gate design (full-width
floor, three launch arches) is replaced here: the owner chose letter blocks after seeing
both animated side by side. Its voice rules, four-gate pacing and hint rule carry over.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Shape | A tower, climbed storey by storey | The complaints are about how it is built, not about climbing. |
| Gate | Letter blocks set into a solid brick ceiling; bump the one you hear | A gate you can see. All three answers hang over one flat floor, so none is harder to reach. Bumping from below is the `?` block move the kids already know. |
| Right answer | The block springs you up through the ceiling, which shuts behind you | A ceiling low enough to jump through afterwards is low enough to bump your head on while climbing onto the letter floor (see *The gate*). |
| Hops | 3 tiles up; gaps of 2, 3, 4, 4 tiles by storey; planks in three lengths, the shortest near the top | The owner's pick: gentle first, a little bolder each storey, capped near two-thirds of a jump; and planks "shorter, multiple varieties". |
| Storey length | 1 to 5 planks; the first storey short; at least one long | The owner: "somewhere more jumps, somewhere less, out of screen, fully visible." |
| Look | Castle tower | The owner's pick over an open-air tower and a toy-block tower. |
| Engine | Phaser features first | The owner's direction: Phaser is the engine; write our own only for a strong reason. |
| Player | The adventure's movement, at super_easy numbers | One jump across the whole game, and one the kids have already approved. |
| Zoom | 1.25 (the adventure uses 1.5) | So a one- or two-plank storey fits on screen whole. |
| Hint | Phaser's Glow round the right block, and the block pulsing in size | White over the gold was too faint to find (1.24:1); movement catches the eye. |

## How a tower plays

### Flow

Mode select → learn menu (letters, syllables, words) → a tower → the result → a new tower,
or back to the learn menu.

Back from the tower goes to the learn menu, and back from the learn menu goes to mode select
with the cursor on learn. That is the port's existing table (`game/navigation.ts`), unchanged.
The title theme keeps playing, as it does in the live game.

A tower has four gates. In letters and syllables mode each gate asks a new item, avoiding
items already asked this session. In words mode a tower spells one word, a letter per gate;
every entry in `LEARN_WORDS` has four letters.

### A storey, bottom to top

```
  ███████[ A ]███████████[ K ]███████████[ S ]███████   letter ceiling: brick, 2 tiles thick
                                                         5 tiles of headroom
  ═══════════════════════════════════════════════════   letter floor: wood, full width
                   ═════════                             plank N, 3 tiles below the letter floor
     ═════════                                           ...
                               ═════════                 plank 1, 3 tiles above the floor
  ███████████████████████████████████████████████████   floor: brick, the storey below's ceiling
```

- **Floor:** brick, full width. The first storey's floor is the tower's base; every later
  floor is the top of the storey below's letter ceiling.
- **Planks:** wood, one-way. You can jump up through them and land on them from above.
- **Letter floor:** wood, one-way, the full width of the tower.
- **Letter ceiling:** brick, solid, two tiles thick. Its underside is 5 tiles above the letter
  floor, and the three letter blocks sit flush in it.

Wood can be jumped through; brick cannot. The letter ceiling is the only barrier in a storey,
and it is the gate. A storey with N planks is 3N + 10 tiles tall.

### Hop rules

Measured by replaying the port's movement at super_easy numbers frame by frame, in the order
`stepPlayer` runs it: a held jump rises **98.4px** (6.1 tiles), a tapped one **24.2px**.

- Every hop rises exactly **3 tiles** (48px), about half a jump.
- The gap between consecutive planks is **2, 3, 4, 4** tiles in storeys 1 to 4.
- Consecutive planks never overlap horizontally, so the climb zig-zags instead of stacking.
- **Planks come in three lengths, set by the gap in front of them.** A plank's length is
  what decides whether a jump that holds the direction all the way lands on it or sails past
  it. That is the old "too far" in reverse, and the owner asked for shorter planks in several
  varieties. Measured, jumping from the edge of the plank below and holding the direction for
  the whole jump:

  | Length | Lands you when you jump |
  |---|---|
  | Long: 8 minus the gap | always, standing or running, even from the very lip |
  | Medium: 7 minus the gap | always, except a running jump from the very lip |
  | Short: 6 minus the gap | from a standing start; otherwise ease off the direction |

  Anything shorter than 6 minus the gap is missed by most held jumps, so that is the floor.
- **Which lengths appear where.** Storey 1 uses only long and medium planks (6 and 5 tiles),
  so the first climb stays gentle. Storey 2 mixes all three (5, 4, 3). Storeys 3 and 4 mix all
  three (4, 3, 2), so the shortest planks sit near the top. Each plank's length is picked at
  random from its storey's set.
- Planks stay inside the tower walls. The first plank's near edge is 2 to 6 tiles to the
  side of where you arrive (away from the nearer wall), so even the first hop moves you
  across rather than straight up.
- The first storey has 1 or 2 planks. Of the other three, at least one has 4 or 5; the rest
  are random between 1 and 5.
- A missed hop drops you onto a plank or the floor below. The floor is solid, so a fall never
  leaves the storey.

A full held jump rises just over two hops (98.4px against 96px), so it can carry you past a
plank. The usual case is the last one: from the plank below it, a big jump lands straight on
the full-width letter floor, and in a one-plank storey a big jump from the floor does the
same. That is harmless (the child reaches the letters sooner, and the bump rule still counts
from the letter floor) and is not prevented.

### The gate

**Blocks.** In letters and words mode the blocks are 2×2 tiles, at columns 3-4, 11-12 and
19-20 of the 24-column tower. Syllable blocks are 3×2, at columns 2-4, 10-12 and 18-20, so
both letters stay large. One block is the answer and two are distractors from the same pool.
The three are always different, in shuffled positions.

**Which bumps count.** A bump counts when the head hits a block from below during a jump
that started on the letter floor. Hitting the plain ceiling between blocks is just a bump of
the head. The geometry already keeps accidental answers out:

| Check (measured) | Gigi (24px tall) | Dodo (20px tall) |
|---|---|---|
| Held jump from the plank below the letter floor: head stops short of the ceiling by | 5.6px | 9.6px |
| Held jump from the letter floor reaches the blocks | yes | yes |
| Tapped jump from the letter floor reaches the blocks | no | no |

**Right answer.**
1. The block pops, sparkles and plays the coin sound. The voice says the letter and a cheer,
   the pad gives a short light buzz, the score goes up by 50, and a star flies to the HUD.
2. The trapdoor opens: the block's columns plus one on each side, through both ceiling rows.
3. The player gets a spring of -9, the same as a jump, that **ignores the variable-jump cut
   until the apex**. With jump released on the first frame, the feet still clear the ceiling
   top by 42.4px (Gigi) or 46.4px (Dodo). Without the exemption they stop about 40px below it,
   and the child is stuck under an open trapdoor. This is the September plan's rocket trap,
   and it is handled the same way.
4. The trapdoor shuts, as plain brick, once the player's feet are above the ceiling top. The
   child lands on it and cannot fall back through.
5. If the child ever stands on the letter floor with the trapdoor still open, the trapdoor
   shuts and the right block comes back, and bumping it springs them again. Play does not
   produce this (a counted bump leaves the hero at least 3px inside the opening); it is a
   safety net, so nobody can get stuck below a solved gate.

**Wrong answer.** The block wobbles, a low tone plays (the live learn mode's
`playTone(150,.15,'triangle',.08,100)`, `index.html:2743`), the pad gives a duller buzz, and
the voice says the target again. Nothing is lost. After two wrong answers at a gate, the
right block glows and pulses until it is found.

### Voice

Carried over from the September plan (§3):

- `speechSynthesis`, with the voice chosen by `et` → `fi` → `it` → the default, and chosen
  again on `voiceschanged`. Rate 0.8, pitch 1.1.
- Always Estonian, whatever the UI language, because the content is Estonian.
- It speaks the target:
  - when a tower starts, and when you land in a new storey;
  - on reaching the letter floor, unless it spoke in the last 4 seconds;
  - after a wrong answer;
  - on the X button.
- After a right answer it says the letter and a cheer. The next storey's target is queued
  after that, never spoken over it.
- In words mode it says the word, then the letter: "KASS. K."
- With no voice installed the game is silent and still fully playable; the HUD always shows
  the target.

### HUD

A parallel scene, like the adventure's `HudScene`:
- the prompt: LEIA TÄHT / LEIA SILP / LEIA TÄHED, and the English equivalents;
- the target, large. In words mode it shows the whole word, with found letters green and the
  current one framed;
- a speaker icon with the X-button glyph;
- four stars, one per gate.

There is no score on screen during the climb.

### The roof and the result

After the fourth gate the spring lands you on the roof: open night sky, battlements, a flag,
and the star. Touching the star plays the win sound, sets off confetti, gets a cheer from the
voice and adds 100 to the score. Two seconds later the result screen shows:
- the cheer, chosen once rather than every frame;
- what was found: the four items, or the word;
- the score;
- the hero jumping.

Confirm starts a new tower in the same mode; back goes to the learn menu.

### The camera

At zoom 1.25 the view is 32 × 20 tiles. The 28-tile tower (24 inside, 2 of wall on each side)
sits in it with a strip of sky either side. Horizontally the camera is fixed on the tower.

Vertically the camera is bounded to the current storey:
- A storey that fits is shown whole, and the camera holds still. Up to two planks fit: 16
  tiles, against 17.6 visible under a 48px HUD.
- A taller storey is followed inside its bounds, with more room above the child than below.
- A right answer pans the camera up to the next storey as the spring starts, so the hero
  never rises behind the HUD.

## The look: a castle tower

- **Walls:** light stone, two tiles thick, rising past the roof into battlements.
- **Inside:** a dark stone back wall with arched windows, torches with flickering flames and a
  warm glow, and banners hanging from each letter ceiling between the blocks.
- **Tiles:** floors and ceilings in the adventure's brick; planks and the letter floor in
  wood; letter blocks in the `?` block's gold with a large letter.
- **Sky:** one tall gradient, seen outside the walls and through the windows. It is day at the
  base, sunset in the middle storeys, and night with stars over the roof.
- **Base:** the tower's door with grass outside. The hero starts at the door.

## How it is built

### Phaser does the engine work

| Need | Phaser feature |
|---|---|
| Tiles, drawn and collided | A real tilemap with a castle tileset generated at boot. One visible layer, which Arcade also collides against. |
| Jump-through planks | Per-side tile collision: the top face only. |
| Trapdoor | Removing and replacing tiles through the tilemap API, with a tween for the swing. |
| Camera | Follow, per-storey bounds, follow offset, and a pan between storeys. |
| Keeping the hero in the tower | World bounds on both sides: above the last storey the walls are lower than a jump. |
| Effects | Tweens for the pop, wobble, glow, star bob and banner sway. Particle emitters for sparkles, brick chunks and confetti. A sprite animation for the torch flames. |
| Delays | Phaser time events. |
| Sky through windows | A world-space gradient behind a back-wall layer with window openings. |
| HUD, menu, result | Scenes, with the HUD running in parallel. |

The adventure does several of these by hand: it draws its tiles into a Graphics object,
keeps an invisible copy for collision, and has no particles. That stays as it is for now.
Moving the adventure onto Phaser features is separate, later work.

### Our own code, and why

| What | Why not a Phaser feature |
|---|---|
| Movement feel: acceleration, coyote time, jump buffer, variable jump, apex-hang gravity | Arcade's gravity is constant and it has no coyote time or buffer. This is the feel the kids approved, and it is shared with the adventure, not copied. |
| The fixed 60 Hz step for the player | The adventure's accumulator and single-body Arcade step, so the jump is exactly the adventure's. |
| Which block a head hit | Arcade's tile collision callback reports only the first tile along a head, so a head under a brick and a letter would report the brick. The mover reports `blocked.up` and the row instead, and the gate rules probe two columns 3px in from each side: the adventure's `?` block rule, the same from either edge, and testable under Vitest. |
| Tower building and the gate rules | Game rules, not engine features. Keeping them free of Phaser lets Vitest test them; Phaser cannot be imported under Vitest. |
| Voice | Phaser has no speech synthesis. |
| Sound effects | The existing procedural synth. |

### Modules

**New, with no Phaser import** (`next/src/game/learn/`):
- `content.ts`: `LEARN_LETTERS`, `LEARN_SYLLABLES` and `LEARN_WORDS` (from
  `index.html:2466-2468`); picking targets without session repeats; picking distractors.
- `tower.ts`: `buildTower(mode, targets, word, rand)` returns the tile map (empty, brick,
  stone, plank, letter block), the storeys with their planks, letter floor, ceiling and
  blocks, the roof and star, and the start position. It enforces every hop rule above. It
  also holds the camera's per-storey views.
- `gate.ts`: the gate rules. Which bumps count, right and wrong answers, the glow, the
  trapdoor opening and shutting, and the re-arm if the hero is ever stranded under one.
- `climb.ts`: one fixed step of the climb: the shared movement, the mover, the gate rules on
  what the head hit, the spring, the storey the hero is in, the star and the score.
- `speech.ts`: what the voice says and when (see *Voice*), as lines for the scene to speak.
- `types.ts`: the climb's state, the events the scene draws from, and the learn session.
  Cues (sounds, buzzes, speech, events) come back as values, the way `World.sounds` does
  for the adventure. The mover's contract is `game/player.ts`'s `BodyMover`.

**Changed, with adventure behaviour unchanged:**
- `game/player.ts`: the movement part of `stepPlayer` and the walk animation become
  functions that both `stepPlayer` and the tower call. The movement function takes a switch
  that skips the variable-jump cut; the adventure never sets it. The two columns a head
  probes, 3px in from each side, become one too, shared by the `?` block bump and the gate
  rules.
- `physics/tiles.ts`: collision is described per tile side, so a plank collides only from
  above. The tower builds its own visible layer from its tileset and gives it these sides;
  the adventure's collision layer is built as before. The side vocabulary (`TileFaces`)
  lives in `game/tiles.ts`, so the tower's rules need nothing from `physics/`.
- `physics/player.ts`: the Arcade mover takes the player, the layer and optional bounds, and
  reports the row a rising head was stopped under. The adventure keeps its `?` block bump.

**New, with Phaser:**
- `scenes/LearnMenuScene.ts`, replacing the `LearnScene` "coming soon" placeholder;
  `scenes/LearnTowerScene.ts`; `scenes/LearnHudScene.ts`; `scenes/LearnResultScene.ts`.
- `gfx/learnTiles.ts`: the tileset and the letter-block pictures, baked with Phaser from the
  adventure's own brick (Part 1). Part 2 adds the back wall, windows, torches, banners, sky
  and roof.
- `audio/voice.ts`: `pickVoiceFrom`, and speaking with the queueing rule above.

**Also:**
- The learn strings in `config/i18n.ts`, in both languages. The placeholder's `learn_soon`
  keys go.
- Scene keys, plus `SCENE_FOR_STATE` entries for `learnletters` and `learnresult`.
- An `sfxWrong` beside the existing sound effects.
- `next/PLAYTEST.md` updated for learn mode.

The movement uses the super_easy record's `playerSpeed` (3.0) and `jumpForce` (-9.0), the
gentlest adventure feel. The hero is the last selected character and skin, Gigi by default.

## Testing

**Vitest, no Phaser:**
- **Tower rules**, across many seeds and all three modes:
  - every hop rises 3 tiles; gaps are 2, 3, 4, 4; every plank's length is in its storey's
    set (storey 1: 6 or 5; later storeys: 8, 7 or 6 minus the gap);
  - consecutive planks never overlap, and planks stay inside the walls;
  - storeys have 1 to 5 planks, the first 1 or 2, and at least one other has 4 or 5;
  - the letter floor is full width, the ceiling is solid except for the blocks, and the
    blocks are 5 tiles above the letter floor;
  - there are four gates, each with exactly one right block and no repeated options, and
    every word has four letters.
- **Jump checks** through the real movement function, for both Gigi and Dodo:
  - from the edge of every plank, a standing-start jump that holds the direction lands on
    the next one; onto a long plank, a running jump from the very lip lands too;
  - no plank's jump reaches the letter ceiling;
  - a held jump from the letter floor reaches the blocks, and a tap does not;
  - the spring clears the ceiling top with jump released on the first frame;
  - without the cut exemption it would not. This test records why the switch exists.
- **Gate rules:**
  - which block a bump hits (a head a little way under either edge of a block counts, one
    just outside does not), and that bumps from below the letter floor are ignored;
  - right and wrong effects, and the glow after two misses;
  - the trapdoor shuts once the player is above it;
  - a solved gate cannot be answered again, and the star ends the tower.
- **Voice:** the September plan's `pickVoiceFrom` cases.
- **Navigation:** every learn state has a scene.
- **No regressions:** the existing player and physics tests pass unchanged once the movement
  code is split out.

**In a browser, before calling it done:**
- Jump into the right letter and let go the moment your head hits it: the spring still
  carries you through. (A tap alone cannot reach the letters; that is deliberate.)
- Both characters and all three modes work. A long storey scrolls and a short one sits whole.
- Walking between the three letters is easy, a wrong answer costs nothing, and the glow
  appears after two misses.
- A head a little way under a letter's left or right edge bumps it, from either side alike.
- Back works from the tower and from the result screen, and X replays the voice.
- On a machine with no Estonian voice, the game is silent and fully playable.

## Build order

1. **Shared groundwork.** Split out the movement and the walk animation, add per-side tile
   collision, and generalise the Arcade mover. The adventure's tests stay green throughout.
2. **The rules.** `content.ts`, `tower.ts` and `gate.ts`, with their tests, including the
   jump checks.
3. **A playable tower on plain tiles.** The tilemap, one-way planks, the camera, the
   trapdoor and the spring. Then the first browser check: the spring with jump let go the
   moment the letter is hit.
4. **The learning around it.** HUD, voice, sounds, buzzes, effects, the result screen and
   the learn menu.
5. **The castle.** Tileset, back wall, windows, torches, banners, sky and roof.
6. **Playtest notes.** Update `next/PLAYTEST.md` with what to watch for with the kids.

## Out of scope

- Touch controls. The port has none yet.
- The felt style.
- New letters, syllables or words; Italian.
- The live game's learn mode in `index.html`, which stays as it is until the port replaces it.
- Moving the adventure onto Phaser features.
- Pausing inside the tower. Back goes to the learn menu, as the navigation table already says.

## Risks

- **Arcade's tile collision callback** (settled: not used). It works for the port's
  standalone body and fires after separation, but it reports only the first tile along a
  head: once Arcade has snapped the body under one tile, the next no longer overlaps it. A
  head under a brick and a letter would report the brick. So the tower uses the fallback
  this risk named: the mover's `blocked.up` plus the head's tile row, with the adventure's
  two 3px probes choosing the columns.
- **Thin head clearance.** Under the letter ceiling it is 5.6px for Gigi. Any change to
  super_easy's jump or to the player's size breaks it, which is why the jump checks test it
  instead of trusting it.
- **Voices.** Nobody knows yet whether the kids' laptop has an Estonian, Finnish or Italian
  voice. If none, the game is silent.
