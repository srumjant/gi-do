# A second level for every theme

**Date:** 2026-11-22
**Status:** Proposed. Builds on the obstacle-course demo (branch `demo-level`), which the
owner's child played: "length was fine", the one problem was a target off screen (fixed).

## Summary

Every theme gets a second, hand-built level that uses the obstacle course's ideas. The six
existing levels do not change. The run plays each theme's classic level and then its new one,
twelve levels in all, with Toy Castle's new level before the boss so the boss stays the
finale:

    1 Doll Garden, 1 Doll Garden II, 2 Dinosaur Canyon, 2 … II, … 5 Winter II,
    6 Toy Castle II, 6 Toy Castle (boss)

Built in three batches, each played by the kids before the next: themes 1-2, then 3-4, then
5-6. Until a theme has its new level, the run simply skips it.

## Who it is for

The child plays the first difficulty card, Super Easy, and sometimes harder ones. On Super
Easy lives are infinite and every life starts with a cape, so dying is not the challenge.
**The challenge comes from the puzzles and from skill** — working out which tool opens what,
aiming, timing, jumping well — and every level must still be fair on Hard.

## The challenge curve

Each new level teaches one tool on its own, then mixes it with the tools from earlier themes.
Later levels ask for more at once.

| Level | Teaches | Mixes in | New twist |
|---|---|---|---|
| Doll Garden II | bow and targets | — | a target up high: jump and shoot; a target that opens a gate |
| Dinosaur Canyon II | fart jump | bow | cliffs one after another, so the fart's 15 seconds matter; a target you can only see from a ledge you fart-jump onto |
| Tallinn II | big head | bow, fart | cracked town walls; springs up the towers |
| Palermo II | chicken ray | all | the giant, with guards around it |
| Winter II | — | all | two tools in a row, the power-up a long way before its obstacle |
| Toy Castle II | — | all | the gauntlet before the boss |

Rules every level keeps, from the demo and its playtest:

- **A tool sits right before the first obstacle it opens,** and comes back if it is used up.
  Later, a tool may sit further back so its timer matters — but never before the child has
  met that tool on its own.
- **What a child must aim at is on screen from where they aim.** The camera shows about 13
  tiles ahead; a target sits within 10.
- **Every obstacle is checked against the jump**, on every difficulty, by tests: impossible
  without its tool, possible with it.
- **A checkpoint flag after every section.** A death costs one section, never the level.
- **About 2-3 minutes** to play through, like the demo.
- Optional extras for a child who wants more: stars on high routes, never required.

## The levels in batch 1

### Doll Garden II — the bow

1. **Warm-up.** Steps, a real pit, `?` blocks.
2. **The drawbridge.** Bow station; the chasm; the target on its post in the chasm (as fixed
   after the playtest).
3. **Jump and shoot.** A gate of bars from the ground to a ceiling blocks the way. Its target
   hangs above the ground, too high to hit standing: the child has to jump and fire at the
   top of the jump.
4. **The guard tunnel.** As in the demo: red guards bounce you back, so you shoot them.
5. **The finish.** A spring up to the sibling's tower, and a second spring up to a high row of
   bonus stars.

### Dinosaur Canyon II — the fart jump

1. **Canyon ledges.** Cliffs of 2 to 5 tiles going up and down, pits between them, bats.
2. **The first wall.** Fart station; a 7-tile cliff (as in the demo).
3. **Against the clock.** Two more tall cliffs, close enough to climb on the same fart if
   the child keeps moving. A second station halfway is the safety net.
4. **Two tools.** A bow station; a target across a chasm that can only be seen and hit from a
   high ledge — which takes a fart jump to reach. Shooting it lowers the bridge below.
5. **Cannons.** Cannons on ledges firing across the path; duck their fireballs or shoot them.
6. **The finish.** A spring up a mesa to the sibling.

Both use their theme's colours, hills, music and enemies (dinos, bats, cannons and bouncers
in the canyon). Where a theme's ground matches its hills too closely to see a wall against
them, the level uses a contrasting ground colour, as the demo did.

## What gets built

- **A run order.** A list of stages, each naming its theme and its level, replaces "level
  index 0 to 5". The theme decides the hills, music, kidnapper and name; the stage decides the
  level. `finishLevel` walks the list. The six level records, and the tests that pin them to
  the original game, stay exactly as they are.
- **Level names** of their own in both languages ("Nukuaed II" style).
- **`?level=N`** in the address starts a run at stage N, for playtests. The demo's `?course`
  goes, and the demo course becomes the material for Doll Garden II.
- **Gates.** A run of `|` in the ASCII is a gate: solid bars until its target is shot, then
  they open. Each bridge or gate belongs to the target nearest it, so a level is written by
  putting a target next to what it opens.
- **Targets anywhere,** including up high, with the same big glowing look.

Everything else is already in the demo: stations, targets, drawbridges, cracked blocks,
springs, guards, giants, flags, the cape fix.

## Testing

- **Unit tests** for the run order (twelve stages once all six exist, Toy Castle's boss last,
  missing themes skipped), and for each new level: every obstacle checked against the jump on
  all four difficulties, as `tests/course.test.ts` does for the demo.
- **The browser.** A scripted run through each new level with real Arcade physics on Super Easy
  and on Hard, as was done for the demo — that is where the demo's real bugs were found.
- **The kids,** after each batch. What to watch: anywhere a child is stuck for more than a
  minute, or dies more than three or four times in one section, is a section to change.

## Out of scope

- Changing the six existing levels.
- Saving progress, or a level select beyond `?level=N`.
- Tiled as the level format. The ASCII sections stay until levels need more than they can say.
- Batches 2 and 3 in detail: each is designed after the kids have played the one before.
