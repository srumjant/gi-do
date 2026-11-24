# Pick a Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second way to play: the mode screen's new card VALI TASE opens the world map, where the child picks a world and one of its levels, plays it exactly as in the story, and comes back to the map.

**Architecture:** The run already plays one level on its own for `?boss=poo` (`startDemo` in `game/run.ts`); a picked level goes the same way and remembers which stage it was, so the level's end, the game over screen and the pause menu know to go back to the map. What the map decides lives in a pure module (`game/levelPick.ts`); a new scene (`LevelMapScene`) draws it with the world map the story already has (`gfx/worldMap.ts`), which learns to walk the hero on demand. The navigation table gets the map's state.

**Tech Stack:** Phaser 4.2.1, TypeScript strict, Vitest 4. In `next/` of `.claude/worktrees/level-pick`.

**Spec:** `docs/superpowers/specs/2026-11-24-level-pick-design.md`. No commits unless the owner asks.

Commands run in `.claude/worktrees/level-pick/next`: tests `npx vitest run <file>`, types `npx tsc --noEmit`, build `npm run build`.

---

### Task 1: The run remembers the mode and the picked level

**Files:**
- Modify: `src/game/run.ts` (next to `startDemo`, `startRun`)
- Test: `tests/levelPick.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIG, setDifficulty } from '../src/config/difficulty';
import { DEMOS } from '../src/data/demos';
import { STAGES } from '../src/data/stages';
import {
  finishLevel, getCurrentStage, getPlayMode, getRunTotals, inDemo, isLastLevel, pickedStage,
  setPlayMode, startDemo, startPicked, startRun,
} from '../src/game/run';

afterEach(() => {
  startRun();
  setPlayMode('story');
});

describe('a level picked on the map', () => {
  it("plays that stage on its own, with the difficulty's lives and no score", () => {
    setDifficulty('easy');
    startPicked(7);
    expect(getCurrentStage()).toBe(STAGES[7]);
    expect(pickedStage()).toBe(7);
    expect(inDemo()).toBe(true);
    expect(getRunTotals()).toEqual({ lives: DIFFICULTY_CONFIG.easy.lives, score: 0 });
    expect(isLastLevel(0)).toBe(true);
  });

  it('is won by finishing it, and still knows which it was', () => {
    startPicked(3);
    expect(finishLevel({ lives: 2, score: 50 })).toBe('game-won');
    expect(pickedStage()).toBe(3);
  });

  it('is forgotten by a new story and by ?boss=poo', () => {
    startPicked(5);
    startRun();
    expect(pickedStage()).toBeNull();
    expect(inDemo()).toBe(false);
    startPicked(5);
    startDemo(DEMOS.poo);
    expect(pickedStage()).toBeNull();
  });

  it("keeps to the run's stages", () => {
    startPicked(999);
    expect(pickedStage()).toBe(STAGES.length - 1);
    startPicked(-4);
    expect(pickedStage()).toBe(0);
  });

  it('remembers which mode the mode screen chose', () => {
    expect(getPlayMode()).toBe('story');
    setPlayMode('pick');
    expect(getPlayMode()).toBe('pick');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`startPicked` is not exported): `npx vitest run tests/levelPick.test.ts`

- [ ] **Step 3: Implement** in `src/game/run.ts`, after `startDemo`:

```ts
/**
 * What the mode screen chose: the story, the whole run; or one level picked on the map
 * (docs/superpowers/specs/2026-11-24-level-pick-design.md). The hero screen reads it to know
 * where to go next.
 */
export type PlayMode = 'story' | 'pick';
let playMode: PlayMode = 'story';

export function getPlayMode(): PlayMode {
  return playMode;
}

export function setPlayMode(mode: PlayMode): void {
  playMode = mode;
}

/**
 * The stage picked on the level map and played on its own, or null. Kept after the level ends,
 * so the map opens again on its world; a new story or `?boss=` forgets it.
 */
let picked: number | null = null;

export function pickedStage(): number | null {
  return picked;
}

/** Play one stage of the run on its own, as `?boss=` plays its level: then back to the map. */
export function startPicked(stage: number): void {
  const index = Math.max(0, Math.min(stage, STAGES.length - 1));
  startDemo(STAGES[index]);
  picked = index;
}
```

and `picked = null;` as the first line of both `startDemo` and `startRun`. (`picked` and `playMode` are declared with `let` below `startDemo`; move the two `let` lines above `startDemo` so they are declared before the functions that use them, next to `let demo`.)

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run tests/levelPick.test.ts tests/poo.test.ts`

### Task 2: What the map decides

**Files:**
- Create: `src/game/levelPick.ts`
- Test: `tests/levelPick.test.ts` (add a describe)

- [ ] **Step 1: Write the failing test** (append; add `import { OHTU } from '../src/data/levels2/ohtu';` and `import { mapOpensOn, stageAt, worldLevels, worldOf } from '../src/game/levelPick';` to the imports)

```ts
describe('the level map', () => {
  it("has seven worlds of three levels: every stage once, in the run's order", () => {
    const levels = worldLevels();
    expect(levels).toHaveLength(7);
    expect(levels.every((l) => l.length === 3)).toBe(true);
    expect(levels.flat()).toEqual(STAGES.map((_, i) => i));
  });

  it('means one stage by a world and a card, both ways round', () => {
    worldLevels().forEach((levels, world) => levels.forEach((stage, card) => {
      expect(stageAt(world, card)).toBe(stage);
      expect(worldOf(stage)).toBe(world);
    }));
    expect(STAGES[stageAt(6, 2)].level).toBe(OHTU);
  });

  it('keeps a world or a card past the ends to the ends', () => {
    expect(stageAt(-1, -1)).toBe(0);
    expect(stageAt(99, 99)).toBe(STAGES.length - 1);
  });

  it('ends every world on its fight', () => {
    for (const levels of worldLevels()) expect(STAGES[levels[levels.length - 1]].level.ending).toBe('boss');
  });

  it('opens on the first world, or on the world just played', () => {
    expect(mapOpensOn(null)).toBe(0);
    expect(mapOpensOn(7)).toBe(2);
    expect(mapOpensOn(STAGES.length - 1)).toBe(6);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (no module): `npx vitest run tests/levelPick.test.ts`

- [ ] **Step 3: Implement** `src/game/levelPick.ts`:

```ts
import { STAGES } from '../data/stages';
import { worlds } from './story';

/**
 * What the level map decides (docs/superpowers/specs/2026-11-24-level-pick-design.md), with
 * none of what it draws: the run's worlds in order, each with its levels as indices into
 * STAGES; which stage a badge and a card mean; where the map opens. The cursors move with
 * game/menu.ts's `clampIndex`: the map stops at its ends.
 */
export function worldLevels(): number[][] {
  return worlds().map((theme) => STAGES.flatMap((stage, i) => (stage.theme === theme ? [i] : [])));
}

/** The stage a world's badge and a card in its box mean; past the ends, the ends. */
export function stageAt(world: number, card: number): number {
  const all = worldLevels();
  const levels = all[Math.max(0, Math.min(world, all.length - 1))];
  return levels[Math.max(0, Math.min(card, levels.length - 1))];
}

/** The world a stage is in. */
export function worldOf(stage: number): number {
  return Math.max(0, worldLevels().findIndex((levels) => levels.includes(stage)));
}

/** Where the map opens: on the world of the level just played, or on the first. */
export function mapOpensOn(picked: number | null): number {
  return picked === null ? 0 : worldOf(picked);
}
```

- [ ] **Step 4: Run it, expect PASS**: `npx vitest run tests/levelPick.test.ts`

### Task 3: Navigation knows the map and the three cards

**Files:**
- Modify: `src/game/navigation.ts`, `src/scenes/keys.ts`, `src/scenes/navigate.ts`, `src/scenes/TitleScene.ts`, `src/scenes/PauseScene.ts`, `src/scenes/ModeSelectScene.ts` (the rename only)
- Test: `tests/navigation.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/navigation.test.ts`, import `MODE_STORY` and `MODE_PICK` in place of `MODE_ADVENTURE`, replace every `MODE_ADVENTURE` with `MODE_STORY`, and append:

```ts
describe('the level map', () => {
  it('goes back to the hero screen, is a menu, and has a scene', () => {
    expect(BACK_TARGET.levelmap).toBe('select');
    expect(isMenuState('levelmap')).toBe(true);
    expect(SCENE_FOR_STATE.levelmap).toBeTruthy();
  });

  it('has three cards, learn the last', () => {
    expect([MODE_STORY, MODE_PICK, MODE_LEARN]).toEqual([0, 1, 2]);
  });

  it('puts the cursor back on the pick card when backing out while picking', () => {
    expect(backFrom('difficulty', true)).toEqual({ kind: 'go', target: 'modeselect', modeIndex: MODE_PICK });
    expect(backFrom('difficulty')).toEqual({ kind: 'go', target: 'modeselect', modeIndex: MODE_STORY });
    expect(modeCursorFor('learnmenu', true)).toBe(MODE_LEARN);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run tests/navigation.test.ts`

- [ ] **Step 3: Implement.**
  - `src/game/navigation.ts`:
    - `GameState` gains `| 'levelmap'`, with a doc line: "The level map (docs/superpowers/specs/2026-11-24-level-pick-design.md): the port's own, not the live game's."; `GAME_STATES` gains `'levelmap'` at the end.
    - `BACK_TARGET` gains `levelmap: 'select',`; `MENU_STATES` gains `'levelmap'`.
    - The mode constants become:

      ```ts
      /** The three cards on the mode select screen, in the order it draws them. */
      export const MODE_STORY = 0;
      export const MODE_PICK = 1;
      export const MODE_LEARN = 2;
      ```

    - `modeCursorFor` and `backFrom` take whether the child is picking a level:

      ```ts
      export function modeCursorFor(from: GameState, picking = false): number {
        if (LEARN_STATES.indexOf(from) >= 0) return MODE_LEARN;
        return picking ? MODE_PICK : MODE_STORY;
      }

      export function backFrom(state: GameState, picking = false): BackAction {
        if (state === 'paused') return { kind: 'resume' };
        if (isPausable(state)) return { kind: 'pause' };
        const target = BACK_TARGET[state];
        if (!target) return { kind: 'none' };
        return { kind: 'go', target, modeIndex: modeCursorFor(state, picking) };
      }
      ```

  - `src/scenes/keys.ts`: `export const LEVEL_MAP_SCENE_KEY = 'LevelMap';` ("The world map, to pick one level on (`levelmap`).") and `levelmap: LEVEL_MAP_SCENE_KEY,` in `SCENE_FOR_STATE`.
  - `src/scenes/navigate.ts`: `takeBack` calls `backFrom(state, getPlayMode() === 'pick')` (import `getPlayMode` from `../game/run`).
  - `TitleScene.ts`, `PauseScene.ts`, `ModeSelectScene.ts`: `MODE_ADVENTURE` becomes `MODE_STORY` (ModeSelectScene is rewritten in Task 5; here only the import and uses, so it compiles).

- [ ] **Step 4: Run, expect PASS**: `npx vitest run tests/navigation.test.ts && npx tsc --noEmit`

### Task 4: The words

**Files:**
- Modify: `src/config/i18n.ts` (port-only keys, next to `prompt_choose`), `tests/i18n.test.ts`

- [ ] **Step 1: Write the failing test.** Add to `PORT_ONLY_KEYS`: `'mode_story', 'mode_pick', 'mode_pick_d', 'prompt_map_world', 'prompt_map_level', 'pause_map'`, and append:

```ts
describe('the pick-a-level words', () => {
  it('are in both languages', () => {
    setLang('et');
    expect([T('mode_story'), T('mode_pick'), T('pause_map')]).toEqual(['LUGU', 'VALI TASE', 'KAART']);
    setLang('en');
    expect([T('mode_story'), T('mode_pick'), T('pause_map')]).toEqual(['STORY', 'PICK A LEVEL', 'MAP']);
    setLang('et');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**: `npx vitest run tests/i18n.test.ts`

- [ ] **Step 3: Implement** in `src/config/i18n.ts`, after `prompt_choose`:

```ts
  // Pick a level (docs/superpowers/specs/2026-11-24-level-pick-design.md): the mode screen's
  // story and pick cards (learn keeps mode_learn), the level map's two hints, the pause
  // menu's way back to the map.
  mode_story:         {et:'LUGU',                     en:'STORY'},
  mode_pick:          {et:'VALI TASE',                en:'PICK A LEVEL'},
  mode_pick_d:        {et:'MÄNGI ÜHTE TASET!',        en:'PLAY ONE LEVEL!'},
  prompt_map_world:   {et:'◀ ▶ VALI MAAILM  •  %K AVA  •  %B TAGASI', en:'◀ ▶ CHOOSE A WORLD  •  %K OPEN  •  %B BACK'},
  prompt_map_level:   {et:'◀ ▶ VALI TASE  •  %K MÄNGI  •  %B TAGASI', en:'◀ ▶ CHOOSE A LEVEL  •  %K PLAY  •  %B BACK'},
  pause_map:          {et:'KAART',                    en:'MAP'},
```

- [ ] **Step 4: Run, expect PASS**: `npx vitest run tests/i18n.test.ts`

### Task 5: Three cards on the mode screen

**Files:**
- Modify: `src/scenes/ModeSelectScene.ts`

- [ ] **Step 1: The card geometry** for three cards:

```ts
const CARD_W = 180;
const CARD_H = 170;
const CARD_GAP = 20;
const CARD_TOP = 95;
/** The row is centred: three cards and two gaps. */
const CARD_LEFT = (BASE_W - (3 * CARD_W + 2 * CARD_GAP)) / 2;
```

  and the description wraps inside its card, from the top down: `DESC_DY = 122`, the descs made with `{ ...DESC_FONT, wordWrap: { width: CARD_W - 16 }, align: 'center' }` and `.setOrigin(0.5, 0)`.

- [ ] **Step 2: The cards**, in `create()`:

```ts
    this.cards = [
      { icon: '📖', name: TStr('mode_story'), desc: TStr('mode_adventure_d'), col: '#e03030', glow: '#ff8866' },
      { icon: '🗺️', name: TStr('mode_pick'), desc: TStr('mode_pick_d'), col: '#2a6fd6', glow: '#88bbff' },
      { icon: '📚', name: TStr('mode_learn'), desc: TStr('mode_learn_d'), col: '#22aa66', glow: '#88ffbb' },
    ];
```

- [ ] **Step 3: Input steps along the row** (clamped, as the pause menu's row is) instead of setting one of two cards; import `clampIndex` from `../game/menu`:

```ts
    if (pressedAny(this.keys.left, this.keys.altLeft)) this.select(clampIndex(this.index, -1, this.cards.length));
    if (pressedAny(this.keys.right, this.keys.altRight)) this.select(clampIndex(this.index, 1, this.cards.length));
```

- [ ] **Step 4: Confirm** records the mode and goes on (import `setPlayMode` from `../game/run`, `MODE_PICK` from `../game/navigation`):

```ts
  private confirm(): void {
    this.leaving = true;
    ensureAudio();
    sfxPickup();
    if (this.index === MODE_LEARN) {
      this.scene.start(LEARN_MENU_SCENE_KEY);
      return;
    }
    // Story or one level: the difficulty and the hero first, either way (game/run.ts's PlayMode).
    setPlayMode(this.index === MODE_PICK ? 'pick' : 'story');
    this.scene.start(DIFFICULTY_SCENE_KEY);
  }
```

  and `heroKey()` shows Dodo on the learn card, Gigi on the other two: `const character = this.index === MODE_LEARN ? 'dodo' : 'gigi';`. Update the class comment ("Story, one level, or learn").

- [ ] **Step 5:** `npx tsc --noEmit` passes.

### Task 6: The world map walks on demand

**Files:**
- Modify: `src/gfx/worldMap.ts`

- [ ] **Step 1: The plan gains** `dim?: boolean` ("Darken the whole screen behind the panel: true in the cutscene, false on the level map over the menu's sky. Default true.") and the constructor draws the wash only when `plan.dim !== false`.

- [ ] **Step 2: The walk is the map's own state**, so it can be started again. New fields:

```ts
  private from: number;
  private to: number;
  /** When the walk began (the `t` of `update`), and how long it takes. */
  private walkStart = 0;
  private walkFrames = MAP_WALK;
  private readonly badges: Phaser.GameObjects.Graphics[] = [];
  private pulse?: Phaser.Tweens.Tween;
```

  set `this.from = plan.from; this.to = plan.to;` first thing in the constructor; push each `badge` onto `this.badges`; in place of the inline pulse tween, after the loop: `if (plan.carrier === undefined) this.pulseOn(plan.to, scene);`.

- [ ] **Step 3: The methods:**

```ts
  /** Walk the hero from the world they are at to `world`, starting at `now`, over `frames`. */
  walkTo(world: number, now: number, frames: number, scene: Phaser.Scene): void {
    this.from = this.to;
    this.to = world;
    this.walkStart = now;
    this.walkFrames = frames;
    this.pulseOn(world, scene);
  }

  /** Is the hero still on the way? */
  walking(now: number): boolean {
    return this.from !== this.to && now - this.walkStart < this.walkFrames;
  }

  /** The world the hero is off to pulses; only one at a time. */
  private pulseOn(world: number, scene: Phaser.Scene): void {
    this.pulse?.stop();
    for (const badge of this.badges) badge.setAlpha(1);
    this.pulse = scene.tweens.add({
      targets: this.badges[world], alpha: 0.6, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }
```

  and `update(t)` reads the walk from the fields: `const { from, to } = this; const f = Math.min(1, (t - this.walkStart) / this.walkFrames);` (the rest as it is). BetweenScene is unchanged: its walk starts at 0 and takes MAP_WALK, as before.

- [ ] **Step 4:** `npx tsc --noEmit` and `npx vitest run` pass (the cutscene's map behaves as before).

### Task 7: The level map scene

**Files:**
- Create: `src/scenes/LevelMapScene.ts`
- Modify: `src/main.ts` (scene list, after `CharacterScene`), `src/scenes/CharacterScene.ts` (`confirm`)

- [ ] **Step 1: The scene:**

```ts
import Phaser from 'phaser';
import { getCurrentTheme, startBGM } from '../audio/bgm';
import { sfxPickup } from '../audio/sfx';
import { BASE_H, BASE_W } from '../config/constants';
import { prompt } from '../config/glyphs';
import { TStr } from '../config/i18n';
import { BGM_TITLE } from '../data/bgmThemes';
import { STAGES } from '../data/stages';
import { createFrameClock, type FrameClock } from '../game/frameClock';
import { mapOpensOn, stageAt, worldLevels } from '../game/levelPick';
import { clampIndex } from '../game/menu';
import { getSelectedChar, getSkinIndex, pickedStage, startPicked } from '../game/run';
import { villainOf, worldKey, worlds } from '../game/story';
import { GAME_FONT_BOLD, GAME_TEXT_RESOLUTION } from '../gfx/gameFont';
import { fitScreenCamera } from '../gfx/render';
import {
  menuPlayerTextureKey, MENU_PREVIEW_SCALE, registerMenuTextures, registerTextures, VILLAIN_TEXTURES,
} from '../gfx/textures';
import { WORLD_MAP_DEPTH, WorldMap } from '../gfx/worldMap';
import { bindMenuKeys, justDown, type MenuKeys, pressedAny } from '../input/menuKeys';
import { LEVEL_MAP_SCENE_KEY, SLICE_SCENE_KEY } from './keys';
import { takeBack } from './navigate';

/** The mode screen's sky and grass. */
const SKY = '#88ccff';
const GROUND_COLOR = 0x44aa44;
const GROUND_EDGE_COLOR = 0x2d8a2d;
const GROUND_H = 60;
const GROUND_Y = BASE_H - GROUND_H;
const HEADING_Y = 62;
const HEADING_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '26px', color: '#e03030',
};
const HINT_Y = BASE_H - 14;
const HINT_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '12px', color: '#ffdd00',
};
/** The menu's hero texture is drawn at twice size; this is the cutscene's hero on the map. */
const HERO_SCALE = 0.8;
/** A third of a second from one world to the next. */
const WALK_FRAMES = 20;

/** The box of a world's levels, over the map. */
const BOX_DEPTH = WORLD_MAP_DEPTH + 2;
const BOX = { x: 80, y: 112, w: 480, h: 196 };
const BOX_TITLE_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '18px', color: '#5a3a1a',
};
const CARD_W = 136;
const CARD_H = 116;
const CARD_GAP = 16;
const CARD_Y = BOX.y + 56;
const NAME_STRIP = 30;
const FACE_Y = 44;
const FACE_PX = 56;
const NUMBER_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '40px', color: '#ffffff',
  stroke: '#000000', strokeThickness: 5,
};
const NAME_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '11px', color: '#ffffff',
  align: 'center', wordWrap: { width: CARD_W - 8 },
};
const ARROW_FONT = {
  fontFamily: GAME_FONT_BOLD, resolution: GAME_TEXT_RESOLUTION, fontSize: '16px', color: '#ffd23f',
  stroke: '#5a3a1a', strokeThickness: 3,
};

/**
 * The level map (docs/superpowers/specs/2026-11-24-level-pick-design.md): the story's world map
 * over the menu's sky, the hero walking from world to world on ◀ ▶; OK opens a box of that
 * world's three levels, each in its own colour, the fight with its villain's face; OK on one
 * plays it on its own (game/run.ts's `startPicked`), and the level's end comes back here.
 * What the map decides is in game/levelPick.ts.
 */
export class LevelMapScene extends Phaser.Scene {
  private clock!: FrameClock;
  private keys!: MenuKeys;
  private map!: WorldMap;
  private hint!: Phaser.GameObjects.Text;
  /** The world the hero stands on, or is walking to. */
  private world = 0;
  /** A press made while the hero walks: -1, 1, or 0 for none. */
  private queued = 0;
  private card = 0;
  private box?: Phaser.GameObjects.Container;
  private cardEdges?: Phaser.GameObjects.Graphics;
  private cardArrow?: Phaser.GameObjects.Text;
  private cardX0 = 0;
  private leaving = false;

  constructor() {
    super(LEVEL_MAP_SCENE_KEY);
  }

  init(): void {
    this.leaving = false;
    this.queued = 0;
    this.card = 0;
    this.box = undefined;
    this.world = mapOpensOn(pickedStage());
  }

  create(): void {
    fitScreenCamera(this);
    registerMenuTextures(this);
    // The villains' faces, which a level registers too: the map must not depend on one having run.
    registerTextures(this);
    // The menu's tune: still playing when the hero screen hands over, started again after a level.
    if (getCurrentTheme() !== BGM_TITLE) startBGM(BGM_TITLE);
    this.cameras.main.setBackgroundColor(SKY);
    this.add.graphics().fillStyle(GROUND_COLOR).fillRect(0, GROUND_Y, BASE_W, GROUND_H)
      .fillStyle(GROUND_EDGE_COLOR).fillRect(0, GROUND_Y, BASE_W, 4);
    this.add.text(BASE_W / 2, HEADING_Y, TStr('mode_pick'), HEADING_FONT).setOrigin(0.5, 1);

    const hero = getSelectedChar();
    this.map = new WorldMap(this, {
      done: 0, from: this.world, to: this.world,
      hero: menuPlayerTextureKey(hero, getSkinIndex(hero), MENU_PREVIEW_SCALE),
      heroScale: HERO_SCALE, dim: false,
    }).setVisible(true);
    this.hint = this.add.text(BASE_W / 2, HINT_Y, prompt('prompt_map_world'), HINT_FONT)
      .setOrigin(0.5, 1).setDepth(BOX_DEPTH + 1);
    this.clock = createFrameClock();
    this.keys = bindMenuKeys(this);
  }

  update(_time: number, delta: number): void {
    const t = this.clock.advance(delta);
    this.map.update(t);
    this.cardArrow?.setY(CARD_Y - 6 + Math.sin(t * 0.15) * 3);
    if (this.leaving) return;
    // Every key read every frame: an edge left unread fires on a later frame (input/menuKeys.ts).
    const left = pressedAny(this.keys.left, this.keys.altLeft);
    const right = pressedAny(this.keys.right, this.keys.altRight);
    const confirm = pressedAny(this.keys.confirm, this.keys.enter);
    const back = justDown(this.keys.back);
    const step = right ? 1 : left ? -1 : 0;
    if (this.box) this.inBox(step, confirm, back);
    else this.onMap(t, step, confirm, back);
  }

  private onMap(t: number, step: number, confirm: boolean, back: boolean): void {
    if (step !== 0) this.queued = step;
    if (this.queued !== 0 && !this.map.walking(t)) {
      const next = clampIndex(this.world, this.queued, worlds().length);
      this.queued = 0;
      if (next !== this.world) {
        this.world = next;
        this.map.walkTo(next, t, WALK_FRAMES, this);
      }
    }
    if (confirm) {
      this.openBox();
    } else if (back) {
      this.leaving = true;
      takeBack(this, 'levelmap');
    }
  }

  private inBox(step: number, confirm: boolean, back: boolean): void {
    if (step !== 0) {
      const next = clampIndex(this.card, step, worldLevels()[this.world].length);
      if (next !== this.card) {
        this.card = next;
        this.drawCards();
      }
    }
    if (confirm) {
      this.leaving = true;
      sfxPickup();
      startPicked(stageAt(this.world, this.card));
      this.scene.start(SLICE_SCENE_KEY);
    } else if (back) {
      this.closeBox();
    }
  }

  private openBox(): void {
    sfxPickup();
    this.queued = 0;
    this.card = 0;
    const levels = worldLevels()[this.world];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, BASE_W, BASE_H);
    g.fillStyle(0x000000, 0.25).fillRoundedRect(BOX.x + 4, BOX.y + 5, BOX.w, BOX.h, 12);
    g.fillStyle(0xf4e6c8).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    g.lineStyle(3, 0x8a6a3a).strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 12);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    parts.push(this.add.text(BASE_W / 2, BOX.y + 34, `${this.world + 1}. ${TStr(worldKey(this.world))}`, BOX_TITLE_FONT)
      .setOrigin(0.5, 1));
    const row = levels.length * CARD_W + (levels.length - 1) * CARD_GAP;
    this.cardX0 = (BASE_W - row) / 2;
    levels.forEach((stageIndex, i) => {
      const stage = STAGES[stageIndex];
      const x = this.cardX0 + i * (CARD_W + CARD_GAP);
      const mid = x + CARD_W / 2;
      const card = this.add.graphics();
      card.fillStyle(Phaser.Display.Color.HexStringToColor(stage.level.bg).color).fillRect(x, CARD_Y, CARD_W, CARD_H);
      card.fillStyle(0x000000, 0.55).fillRect(x, CARD_Y + CARD_H - NAME_STRIP, CARD_W, NAME_STRIP);
      parts.push(card);
      // The fight shows who it is against; the other two, their number.
      const villain = stage.level.ending === 'boss' ? stage.level.course?.boss?.kind ?? villainOf(stage.theme) : null;
      if (villain) {
        const face = this.add.image(mid, CARD_Y + FACE_Y, VILLAIN_TEXTURES[villain]);
        parts.push(face.setScale(Math.min(FACE_PX / face.height, (FACE_PX + 16) / face.width)));
      } else {
        parts.push(this.add.text(mid, CARD_Y + FACE_Y, String(i + 1), NUMBER_FONT).setOrigin(0.5, 0.5));
      }
      parts.push(this.add.text(mid, CARD_Y + CARD_H - NAME_STRIP / 2, TStr(stage.nameKey), NAME_FONT).setOrigin(0.5, 0.5));
    });
    this.cardEdges = this.add.graphics();
    this.cardArrow = this.add.text(0, CARD_Y - 6, '▼', ARROW_FONT).setOrigin(0.5, 1);
    parts.push(this.cardEdges, this.cardArrow);
    this.box = this.add.container(0, 0, parts).setDepth(BOX_DEPTH);
    this.drawCards();
    this.hint.setText(prompt('prompt_map_level'));
  }

  private closeBox(): void {
    sfxPickup();
    this.box?.destroy();
    this.box = undefined;
    this.cardEdges = undefined;
    this.cardArrow = undefined;
    this.hint.setText(prompt('prompt_map_world'));
  }

  /** The chosen card: a thick yellow edge and the arrow over it; the others a thin white one. */
  private drawCards(): void {
    if (!this.cardEdges) return;
    this.cardEdges.clear();
    const count = worldLevels()[this.world].length;
    for (let i = 0; i < count; i++) {
      const x = this.cardX0 + i * (CARD_W + CARD_GAP);
      const chosen = i === this.card;
      const grow = chosen ? 3 : 0;
      this.cardEdges.lineStyle(chosen ? 4 : 2, chosen ? 0xffd23f : 0xffffff, chosen ? 1 : 0.8)
        .strokeRect(x - grow, CARD_Y - grow, CARD_W + grow * 2, CARD_H + grow * 2);
    }
    this.cardArrow?.setX(this.cardX0 + this.card * (CARD_W + CARD_GAP) + CARD_W / 2);
  }
}
```

- [ ] **Step 2: Register it** in `src/main.ts`: import `LevelMapScene` and list it after `CharacterScene` (a run-loop screen, never on screen with another).

- [ ] **Step 3: The hero screen goes to the map when picking.** In `CharacterScene.confirm`, after the `?boss=` branch (import `getPlayMode` from `../game/run`, `LEVEL_MAP_SCENE_KEY` from `./keys`):

```ts
    // PICK A LEVEL: the map, to choose one (scenes/LevelMapScene.ts).
    if (getPlayMode() === 'pick') {
      this.scene.start(LEVEL_MAP_SCENE_KEY);
      return;
    }
```

- [ ] **Step 4:** `npx tsc --noEmit` passes.

### Task 8: A picked level comes back to the map

**Files:**
- Modify: `src/scenes/SliceScene.ts` (`leaveIfRunOver`), `src/scenes/GameOverScene.ts` (`update`), `src/scenes/PauseScene.ts` (labels, `confirm`)

- [ ] **Step 1: Won.** In `SliceScene.leaveIfRunOver`, the `game-won` branch:

```ts
      if (outcome === 'next-level') {
        this.scene.start(BETWEEN_SCENE_KEY, { next: SLICE_SCENE_KEY } satisfies BetweenData);
      } else if (pickedStage() !== null) {
        // A level picked on the map: back to the map, on its world.
        this.scene.start(LEVEL_MAP_SCENE_KEY);
      } else {
        this.scene.start(WIN_SCENE_KEY, { score } satisfies WinData);
      }
```

- [ ] **Step 2: Lost.** In `GameOverScene.update`, the timed or confirmed exit goes to `pickedStage() !== null ? LEVEL_MAP_SCENE_KEY : TITLE_SCENE_KEY`, and back goes to the map too:

```ts
    if (justDown(this.keys.back)) {
      this.leaving = true;
      // A picked level's way out is its map (docs/superpowers/specs/2026-11-24-level-pick-design.md).
      if (pickedStage() !== null) goToState(this, 'levelmap');
      else takeBack(this, 'gameover');
    }
```

- [ ] **Step 3: Paused.** In `PauseScene`, the middle label is `TStr(pickedStage() !== null ? 'pause_map' : 'pause_switch')`, and its confirm:

```ts
      case SWITCH_MODE:
        this.leaving = true;
        this.scene.stop(this.frozen);
        // In a level picked on the map, MAP: back to it. In the story, SWITCH MODE.
        if (pickedStage() !== null) this.scene.start(LEVEL_MAP_SCENE_KEY);
        else this.scene.start(MODE_SELECT_SCENE_KEY, { index: MODE_STORY } satisfies ModeSelectData);
        return;
```

- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run` pass.

### Task 9: In the browser, and the papers

- [ ] Serve the worktree: `npm run dev -- --port 5182 --strictPort` (background).
- [ ] Check, with screenshots: the three cards and their words in both languages (descriptions wrap inside the cards); STORY still plays the opening; PICK A LEVEL through difficulty and hero to the map; the hero walks end to end and stops at both ends, a quick second press walks on; a box per world, the right names and colours, the fight's face; a level from each world starts; one won (a chase level and a fight) and one lost, each back to the map on its world, the menu tune back; the pause menu's MAP; back from the box, from the map (to the hero screen) and from the difficulty screen (to the PICK card); `?boss=poo` still ends on the win screen.
- [ ] `next/PLAYTEST.md`: a section "Pick a level" with how to reach it and what to try.
- [ ] The spec: "Built 2026-11-24 (plan `docs/superpowers/plans/2026-11-24-level-pick.md`)."
- [ ] Memory: the project memory line.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
