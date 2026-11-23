# Ninja and Cinderella skins

The owner asked for more skins: "gigi -> sonic, dodo -> cinderella". Sonic is SEGA's
character and is not drawn, not even renamed; the owner chose an original Ninja for Gigi
instead. Cinderella is a fairy-tale character: an original fairy-tale princess, not a copy
of any film's design. Approved 2026-11-23.

## What

Two skins, in the Phaser port (`next/`) only. The original game is left unchanged.

- **Gigi: NINJA.** A navy hood and suit, a mask with only an eye slit, a red headband whose
  tail sticks out behind him (it flaps when he runs), a red belt, darker trousers and
  black shoes.
- **Dodo: TUHKATRIINU / CINDERELLA.** Golden hair with a bun on top and a pale-blue
  headband, puffed sleeves, a pale-blue ball gown with a lighter hem, and glass slippers.

Each new skin comes after the existing ones in `GIGI_SKINS` / `DODO_SKINS`
(`src/data/sprites.ts`), so the character screen's ↑↓ reaches them, and every place
that draws a skin (level, menus, cutscenes, the carried sibling, the learn tower)
picks them up through `skinsOf`.

## Rules the drawings keep

- The same grid as the character's other skins: Gigi 10 wide by 14 tall, Dodo 10 by 12.
  The hitbox and the draw offsets assume those sizes.
- The big-head power-up splits a sprite at half its height (`bigHeadRows`): Gigi's head
  is rows 0-6, Dodo's rows 0-5, so each head fits in its top half.
- Stand, run and jump differ in the legs (and the arms when jumping) the way the other
  skins do; the Ninja's headband tail flaps in the run frame.
- Every index a frame uses is in its palette; 0 is transparent.

Gigi, standing (H hood, R red, s skin, e eyes, N suit, D trousers, B shoes):

```
...HHHHH..
..HHHHHHH.
.RRRRRRRR.
..HsssssH.
..HsesesH.
..HHHHHHH.
...HHHHH..
....HHH...
...NNNNN..
..NNNNNNN.
...NRRRN..
...DDDDD..
...DD.DD..
...BB.BB..
```

Dodo, standing (G hair, B headband, s skin, e eyes, c cheeks, m mouth, L gown, l lighter,
g slippers):

```
....GG....
..BBBBBB..
.GGGGGGGG.
.GGssssGG.
.GsessesG.
..scsscs..
...smms...
....ss....
..lLLLLl..
..LLLLLL..
.LllllllL.
..gg..gg..
```

## Names

The character screen shows a skin's name in capitals. A skin may now carry an i18n key
for its name (`nameKey`), used in place of `name` when set: `skin_ninja` (NINJA in both
languages) and `skin_cinderella` (TUHKATRIINU / CINDERELLA). The existing skins keep their
plain names.

## Tests

- `tests/sprites.test.ts` compares `GIGI_SKINS` and `DODO_SKINS` with the original game's
  arrays: it now checks that the original game's skins are the first entries, unchanged.
- A new `tests/skins.test.ts`: every skin of a character has the same grid size in every
  pose, every index used is in the palette, and the port's extra skins have a translated
  name in capitals.
- The new keys go into `PORT_ONLY_KEYS` in `tests/i18n.test.ts`.
- In the browser: the character screen (both skins, both names), a level (stand, run,
  jump, big head), and a cutscene (the carried sibling).

## Animations (added 2026-11-23)

The owner asked, mid-batch, for an idle animation, one for getting hit and one for shooting.
Approved: frames made by rule from each skin's own drawing, and motion by moving the picture,
so all six skins (and any later) get them with no new drawings and no gameplay change.

- **Frames, by rule** (`src/game/heroFrames.ts`): every hero drawing colours its eyes with
  palette index 3 and its skin with 4, and row 9 is the arms.
  - `blink`: the standing frame, eyes closed (3 becomes 4).
  - `ouch`: the jumping frame (arms flung up), eyes closed.
  - `shoot`: the standing frame, the front arm (row 9) one pixel longer forward.
- **When** (`src/game/heroAnim.ts`, pure, stepped once per simulation step):
  - Idle: standing for 45 frames, then a one-pixel breath every 40 frames and a blink of
    7 frames every 2 seconds. On the character screen too.
  - Shooting (an arrow or the chicken ray): while the bow's cooldown is above 8 of its 15,
    the `shoot` frame (the jump frame stays in the air) and the bow held out in front; the
    first three frames kick back a pixel.
  - The cape lost (a hit or a pit save): `ouch` for 24 frames, pushed back 4 pixels and
    tilted away, both easing back to nothing; the usual flicker carries on.
  - A life lost: `ouch`, a moment's hang, then a hop up and a fall off the bottom of the
    screen, upside down, while the level is frozen.
  - With the big head: the same frames and movement, without the tilt or turning over.
- **Tests**: the derived frames (`tests/heroFrames.test.ts`, including that row 9 is the
  arms with room in front in every skin) and the timings (`tests/heroAnim.test.ts`).
