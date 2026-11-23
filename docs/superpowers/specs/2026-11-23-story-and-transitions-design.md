# Story and transitions

**Date:** 2026-11-23
**Status:** Approved by the owner in chat (2026-11-23).

## Why

The owner, after playing to the end: the transitions are off and the story is weak. After a
boss the sibling is saved and at once snatched again with no reason given ("let's go further,
and then the next boss comes"); the cutscenes look plain; the words don't say what is going on;
"VAJUTA SPACE" doesn't always move on, and on a phone or with a controller it names the wrong
button. Every word a child reads stays in capitals, so they can read it on their own.

## Decisions (owner, 2026-11-23)

| Question | Answer |
|---|---|
| What ties the worlds together | The T-Rex is behind it all: he wants the sibling for his Toy Castle, and each world's villain is one of his helpers |
| Where you are | A world map between worlds; three dots for the levels inside a world |
| Opening | Yes: the snatch, before level 1 |
| What was off | Saved then snatched at once; plain looks; unclear words; the prompt |

## The story, beat by beat

- **Opening** (after choosing the hero, only when the run starts at level 1): the two play in
  the garden; the Doll Queen swoops in and grabs the sibling: "T-REX TAHAB DODOT!" "OI EI!";
  the map: six worlds on a path to the castle, the hero at the first. "PÄÄSTA DODO!"
- **After levels 1 and 2** (a chase): the villain runs off with the sibling, the hero after
  them. "JÄLITA NUKUKUNINGANNAT!" (the villain by name), and three dots for the world's levels.
- **After a boss**: the reunion ("DODO ON PÄÄSTETUD!", hearts); the beaten boss, sitting
  dazed: "T-REX SAATIS MIND..."; the next world's villain swoops in, "T-REX TAHAB DODOT!" (the
  T-Rex himself, before Toy Castle: "NÜÜD MINA ISE!"), and runs off: "PTERODAKTÜL VIIS DODO
  ÄRA!"; the map: the world just done gets a star, the hero walks to the next. "MAAILM 2:
  DINOSAURUSE KANJON".
- **The end**: the Win screen adds "T-REX ON NÜÜD PISIKE!".

## How it looks and reads

- Cutscenes draw the world's own sky and hills, not a flat colour.
- The map: a panel with a winding path through six round badges, each world's colour with
  its villain's face, the castle's T-Rex last; done worlds starred; the hero walking.
- Every line names who and what. Capitals throughout (the i18n table writes them so too).
- The prompt names the button on the device last used: SPACE on the keyboard, the
  controller's confirm glyph, OK on the touch buttons. It shows only when pressing does
  something, and pressing moves the scene on (to the map, then out).

## Testing

The story's beats as pure data (which lines, villains and world numbers each transition
gets) tested for every stage of the run; the device names tested; then every transition seen
in the browser.
