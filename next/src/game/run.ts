import { DC } from '../config/difficulty';
import { LEVELS } from '../data/levels';
import type { Character } from './player';
import {
  BAT_P, BAT_S,
  BOUNCER_P, BOUNCER_S,
  CANNON_P, CANNON_S,
  CAR_P, CAR_S,
  CHICKEN_P, CHICKEN_S,
  DINO_P, DINO_S,
  DODO_SKINS,
  DOLL_P, DOLL_S,
  GHOST_P, GHOST_S,
  GIGI_SKINS,
  ICEBAT_P, ICEBAT_S,
  KIDNAPPERS,
  PENGUIN_P, PENGUIN_S,
  type Palette,
  type Skin,
  type SpriteData,
} from '../data/sprites';

/**
 * Run state: which character is selected and which skin of them, which level the run is on
 * and what it has left, plus the sprite lookups that read all of it. Ported from
 * index.html:848-867 (getEnemySpriteInfo, getPlayerSprites, getRescueSprites), :825
 * (getKidnapper) and the selectedChar/gigiSkin/dodoSkin/currentLevel/lives/score globals
 * declared at index.html:988.
 *
 * Two halves, in this one file because the spec's repo layout asks for one
 * (`state/run.ts — currentLevel, lives, score`) and because they are the same thing: what
 * the children chose, and where that choice has got to. The second half starts at "The run"
 * below and has a long comment of its own about why `lives` and `score` are here at all
 * when a `World` also has them.
 *
 * data/sprites.ts's header explains why these three were left out of that module:
 * they are behaviour, not data, and two of them read mutable state that has no home
 * in a pure-data file. That state lives here instead, alongside them, following the
 * shape config/difficulty.ts uses for the live game's `selectedDifficulty` global — a
 * module-level variable with a get/set pair, resolved live on every call rather than
 * cached, so changing it mid-run is visible immediately.
 *
 * Phaser-free by design: this is game state (what the kids picked), not rendering.
 * tests/world.test.ts enforces that nothing under src/game imports Phaser.
 */

/**
 * Both characters, in the order the character screen puts them in (index.html:2155-2159
 * draws Gigi on the left, :2160-2164 Dodo on the right). The character select maps its
 * cursor through this; everything that has to walk BOTH characters — baking their
 * textures, say — iterates it rather than writing the pair out again.
 */
export const CHARACTERS: readonly Character[] = ['gigi', 'dodo'];

/**
 * A character's skins. The live game reaches for `GIGI_SKINS` or `DODO_SKINS` by hand
 * at each of its four use sites (index.html:1340-1343, 2142, 2157, 2162); this is that
 * choice, named once, so the menu's skin cursor and the texture bakery cannot drift
 * apart about how many skins a character has.
 */
export function skinsOf(character: Character): readonly Skin[] {
  return character === 'dodo' ? DODO_SKINS : GIGI_SKINS;
}

let selectedChar: Character = 'gigi';
let gigiSkin = 0;
let dodoSkin = 0;

export function getSelectedChar(): Character {
  return selectedChar;
}

export function setSelectedChar(char: Character): void {
  selectedChar = char;
}

export function getGigiSkin(): number {
  return gigiSkin;
}

export function setGigiSkin(skin: number): void {
  gigiSkin = skin;
}

export function getDodoSkin(): number {
  return dodoSkin;
}

export function setDodoSkin(skin: number): void {
  dodoSkin = skin;
}

/**
 * The skin held for a character, whether or not they are the one being played. The
 * live game keeps `gigiSkin` and `dodoSkin` as two separate globals and picks between
 * them at every use site (index.html:1340-1343 cycles one or the other depending on
 * which side of the character screen the cursor is on); these two collapse that pick
 * into one place, so a caller that already knows WHICH character it means does not
 * have to know which variable holds it.
 */
export function getSkinIndex(character: Character): number {
  return character === 'dodo' ? dodoSkin : gigiSkin;
}

export function setSkinIndex(character: Character, skin: number): void {
  if (character === 'dodo') dodoSkin = skin;
  else gigiSkin = skin;
}

export interface EnemySpriteInfo {
  sprite: SpriteData;
  palette: Palette;
}

/**
 * Port of index.html:848-857.
 *
 * `dino` has no case of its own — it reaches DINO_S/DINO_P through the `default`
 * branch below, exactly as the live game does. That is deliberate: do not add a
 * `case 'dino':` to make it explicit, it would just be the same mapping written a
 * second time.
 *
 * The same default branch also catches every type this switch does not name — still
 * DINO_S/DINO_P. That is a *different* decision from `spawnEnemy` in enemy.ts, which
 * returns `undefined` for a type its simulation does not implement (ghost, bat,
 * cannon, bouncer) so its caller can skip spawning it rather than create a half-
 * simulated enemy. The two must not be unified into one mapping: this function
 * answers "what does that enemy look like on screen", and always has an answer;
 * `spawnEnemy` answers "should this exist in the simulation at all", and sometimes
 * the answer is no. Defaulting here is not a substitute for the `undefined` there.
 */
export function getEnemySpriteInfo(type: string): EnemySpriteInfo {
  switch (type) {
    case 'car': return { sprite: CAR_S, palette: CAR_P };
    case 'doll': return { sprite: DOLL_S, palette: DOLL_P };
    case 'ghost': return { sprite: GHOST_S, palette: GHOST_P };
    case 'bat': return { sprite: BAT_S, palette: BAT_P };
    case 'cannon': return { sprite: CANNON_S, palette: CANNON_P };
    case 'bouncer': return { sprite: BOUNCER_S, palette: BOUNCER_P };
    case 'penguin': return { sprite: PENGUIN_S, palette: PENGUIN_P };
    case 'icebat': return { sprite: ICEBAT_S, palette: ICEBAT_P };
    case 'chicken': return { sprite: CHICKEN_S, palette: CHICKEN_P };
    default: return { sprite: DINO_S, palette: DINO_P };
  }
}

export interface PlayerSprites {
  stand: SpriteData;
  run: SpriteData;
  jump: SpriteData;
  palette: Palette;
}

/**
 * Port of index.html:858-862.
 *
 * `|| DODO_SKINS[0]` / `|| GIGI_SKINS[0]` are real fallbacks, not defensive
 * leftovers: an out-of-range skin index — a save from before a skin existed, or
 * simply never having picked one — falls back to skin 0 rather than indexing past
 * the end of the array and reading `.stand` off `undefined`.
 */
export function getPlayerSprites(): PlayerSprites {
  if (selectedChar === 'dodo') {
    const sk = DODO_SKINS[dodoSkin] || DODO_SKINS[0];
    return { stand: sk.stand, run: sk.run, jump: sk.jump, palette: sk.palette };
  }
  const sk = GIGI_SKINS[gigiSkin] || GIGI_SKINS[0];
  return { stand: sk.stand, run: sk.run, jump: sk.jump, palette: sk.palette };
}

export interface RescueSprites {
  sprite: SpriteData;
  jump: SpriteData;
  palette: Palette;
  name: string;
}

/**
 * Port of index.html:863-867. The kidnapped sibling is always the OTHER character
 * from the one selected — playing as Gigi, the cage holds Dodo, and vice versa —
 * with the same out-of-range-skin fallback as getPlayerSprites above.
 */
export function getRescueSprites(): RescueSprites {
  if (selectedChar === 'dodo') {
    const sk = GIGI_SKINS[gigiSkin] || GIGI_SKINS[0];
    return { sprite: sk.stand, jump: sk.jump, palette: sk.palette, name: 'Gigi' };
  }
  const sk = DODO_SKINS[dodoSkin] || DODO_SKINS[0];
  return { sprite: sk.stand, jump: sk.jump, palette: sk.palette, name: 'Dodo' };
}

/** One entry of the live `KIDNAPPERS` table (index.html:817-824): art, palette, colour. */
export type Kidnapper = (typeof KIDNAPPERS)[number];

/**
 * Port of index.html:825, which sits a few lines above the three sprite lookups already in
 * this file.
 *
 * Who steals the sibling between levels — the villain of the level you are about to walk
 * into. Only the between-level cutscene draws it; it is nobody's enemy record, and the
 * sprite it hands back is deliberately unrelated to what that level actually spawns.
 *
 * The modulo is the live game's own. With six levels and six entries it never wraps today,
 * but the guard is real and is kept rather than assumed away.
 */
export function getKidnapper(levelIndex: number): Kidnapper {
  return KIDNAPPERS[kidnapperIndex(levelIndex)];
}

/**
 * The same lookup, as the position in `KIDNAPPERS` rather than the record there. The
 * cutscene's textures are baked one per kidnapper rather than one per level — two of the
 * six entries are the same dino — so the scene needs the index the modulo lands on, and
 * this is the one place that modulo is written.
 */
export function kidnapperIndex(levelIndex: number): number {
  return levelIndex % KIDNAPPERS.length;
}

/* -------------------------------------------------------------------------- *
 *  The run
 * -------------------------------------------------------------------------- */

/** What one level hands the next: the lives that are left and the points so far. */
export interface RunTotals {
  lives: number;
  score: number;
}

/** What follows the level that has just been finished. */
export type LevelOutcome = 'next-level' | 'game-won';

/**
 * The run's own three numbers, and the only state in this port that outlives a `World`.
 *
 * A `World` is ONE LEVEL'S ATTEMPT — the map, the player, the enemies — and, while that
 * level is running, the run's `lives` and `score` as well, because the simulation reads and
 * writes them every single step: a death decrements `lives` (player.ts's playerDie), a star
 * adds to `score`, and `stepWorld`'s dead branch chooses between a respawn and the end of
 * the run by reading `lives`. Dying does NOT rebuild the World — `respawnLevel` mutates it
 * in place, which is exactly how those two already survive a death. Finishing a level DOES
 * rebuild it, and these three are what has to survive that.
 *
 * `currentLevel` has no other home at all: index.html keeps it as a global (index.html:988)
 * and `SliceScene` simply hardcoded 0 until now.
 *
 * `lives` and `score` here are deliberately NOT a second, parallel copy of the World's.
 * Exactly one of the two is authoritative at any moment, and both hand-over points are
 * explicit and singular: `createWorld`'s `start` argument carries them run -> world as a
 * level begins, and `finishLevel` below carries them world -> run as one ends. Nothing
 * reads them from here mid-level — the HUD reads the World, as it must, or it would show
 * the lives you had when the level started rather than the ones you have now.
 *
 * The initial values are index.html:988's globals (`currentLevel=0, lives=3, score=0`)
 * rather than anything derived from a difficulty, because at module load nobody has chosen
 * one yet. `startRun` is what actually seeds a run, and that is the live game's arrangement
 * too: index.html:1347 sets all three together on the way out of the intro.
 */
let currentLevel = 0;
let lives = 3;
let score = 0;

/** Which level the run is on. `SliceScene` builds this one; the HUD names it. */
export function getCurrentLevel(): number {
  return currentLevel;
}

/** What the next `World` starts with — see `createWorld`'s `start` argument. */
export function getRunTotals(): RunTotals {
  return { lives, score };
}

/**
 * Begin a run: level 0, a full set of lives for the difficulty that was chosen, no score.
 *
 * Port of index.html:1347's `currentLevel=0;lives=DC().lives;score=0;initLevel(0)`, the
 * line that leaves the intro. The three assignments belong together and are therefore one
 * call: a "new game" that reset the level but kept the last run's score is not a thing
 * anyone should have to discover in a browser.
 *
 * `DC()` is resolved here rather than passed in, because it is resolved there too — the
 * number of lives is the difficulty's, and the difficulty has by definition already been
 * chosen by the time anything calls this. On super_easy it is `Infinity`, which is a real
 * setting rather than a debug state; see World.lives in game/types.ts.
 */
export function startRun(): void {
  currentLevel = 0;
  lives = DC().lives;
  score = 0;
}

/**
 * The level just finished: bank what it ended with, and step to the next one. Says whether
 * there IS a next one.
 *
 * Port of index.html:1350 — `currentLevel++; if(currentLevel>=LEVELS.length) win; else
 * between` — plus the banking the live game does not need, because there `lives` and
 * `score` are the very same globals the level was already using.
 *
 * One call rather than a setter and an increment, so that the pair cannot be done by
 * halves. The order is visible in one place: the increment happens BEFORE the between-level
 * cutscene, which is why that cutscene shows the NEXT level's colours, name and kidnapper
 * (index.html:2180, :2317 and :2364 all read `currentLevel` after the increment).
 */
export function finishLevel(totals: RunTotals): LevelOutcome {
  lives = totals.lives;
  score = totals.score;
  currentLevel++;
  return currentLevel >= LEVELS.length ? 'game-won' : 'next-level';
}

/**
 * Is this the last level? index.html asks in three places and spells it out each time:
 * `currentLevel===LEVELS.length-1` at :1735 and :2177, `currentLevel<LEVELS.length-1` at
 * :1898. It decides whether the rescue overlay promises another world or congratulates you,
 * and it is also what makes a level the boss level.
 */
export function isLastLevel(levelIndex: number): boolean {
  return levelIndex === LEVELS.length - 1;
}
