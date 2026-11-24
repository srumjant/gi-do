# Pick a level: one level on its own, chosen on the map

The owner (2026-11-24): "lets add new mode where can select a level on map, so existing one will
be story and then new one will be free roam or somthing like that, gameplay is exactly sam, but
just one level". Asked, the owner chose three cards on the mode screen, a world and then its level
on the map, back to the map after the level, and no stars. Approved 2026-11-24. Built 2026-11-24
(plan `docs/superpowers/plans/2026-11-24-level-pick.md`).

## What the child sees

- The mode screen has three cards:
  - **LUGU / STORY**: the run as it is today, from the first world to Härra Kaka.
  - **VALI TASE / PICK A LEVEL**: the new mode.
  - **ÕPIME! / LET'S LEARN!**: the learn towers, as today.
  Their descriptions are in capitals, like every word a child reads: "PÄÄSTA OMA ÕDE-VENDA!",
  "MÄNGI ÜHTE TASET!", "TÄHED, SILBID JA SÕNAD".
- Picking a level goes through the difficulty screen and the hero screen, as the story does, and
  then to the level map. Back on the map goes to the hero screen; the difficulty and the hero are
  chosen once and kept for every level played from the map.

## The level map

- The same old-paper map as between worlds: the winding dotted path, the seven badges in their
  worlds' colours with their villains' faces and names, the house at the end. No stars, no villain
  carrying anyone. Behind the panel, the menu's sky and grass; the menu's tune goes on playing.
- The hero stands on one world; that badge pulses. ◀ ▶ walks the hero to the world before or after
  (a quick walk, a third of a second; a press during the walk is kept and walks on from where the
  hero arrives). The ends stop: no wrapping from the house back to the first world.
- OK opens a box over the bottom of the map: the world's number and name, and its three levels as
  three small cards, each in its level's own colour with its name. The third level's card carries
  the villain's face: it is the fight. ◀ ▶ picks a card, OK plays it, back closes the box.
- A hint line at the bottom, in capitals: "◀ ▶ VALI MAAILM • OK AVA • TAGASI" with the map,
  "◀ ▶ VALI TASE • OK MÄNGI • TAGASI" with the box (English: "CHOOSE A WORLD • OPEN • BACK",
  "CHOOSE A LEVEL • PLAY • BACK"), the device's own buttons named as on the other screens.
- The map opens on the first world the first time, and on the world just played after a level.

## Playing the one level

- No cutscene before the level: no snatch, no map walk. The level plays exactly as in the story,
  its ending included: the villain hopping off with the sibling, or the fight, the cage and the
  overlay.
- Lives and score: the difficulty's full lives, a score from nothing, as a run begins.
- Won: after the level's own ending, back to the map, the hero on that world.
- Lives gone: the GAME OVER screen, then the map (OK, its three seconds, or back).
- The pause menu's middle button, VAHETA MÄNGU / SWITCH MODE, reads KAART / MAP in a picked level
  and goes back to the map. CONTINUE and MAIN MENU are as today.
- `?boss=poo` plays Härra Kaka's bathroom on its own and ends on the win screen, as today;
  `?level=N` starts the story at level N, as today.

## How it is built

- `game/run.ts` already plays one level on its own for `?boss=poo` (`startDemo`): the
  difficulty's lives, the score from nothing, and finishing the level is winning. A picked level
  goes the same way and carries one more thing, where it came from: the map, and which world.
  `startRun` clears it.
- A pure module in `src/game` (no Phaser) holds what the map decides: the worlds in order and
  each world's levels (as stage indices); which stage a world and a card mean; moving the world
  and card cursors (clamped at the ends); the world the map opens on.
- A new scene, the level map, draws with the world map's own drawing (`gfx/worldMap.ts`), which
  gains what the picker needs: no star and no pulse of its own when asked, and moving the hero
  from one world to another on demand rather than once from a plan.
- The navigation table (`game/navigation.ts`) gains the map's state, back going to the hero
  screen, and counts it a menu; the learn card moves from the second place to the third, and
  `modeCursorFor` still puts the cursor back on it when backing out of the learn screens.
- The level's end (`SliceScene`), the game over screen and the pause menu ask the run whether
  the level was picked on the map, and if so go back to it.
- Words, in both languages and in capitals: the three cards' names and descriptions, the two
  hints, KAART / MAP.

## Tests

- The map's module: every one of the 21 stages is reachable from exactly one world and card,
  in the run's order; the cursors stop at their ends; the map opens on the world just played.
- The run: a picked level is won by finishing it, keeps its world, and a new story clears it.
- Navigation: the new state has a way back, is a menu, and backing out of learn lands on the
  learn card (the third).
- Translations: the new words in both languages, in capitals.
- In the browser: the three cards; the map walked end to end; a level picked in each world;
  a level won and a level lost, each back to the map on its world; the pause menu's MAP.
