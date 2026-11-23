# Ninja and Cinderella Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Ninja skin for Gigi and a Cinderella skin for Dodo in the Phaser port, picked on the character screen like the existing ones.

**Architecture:** Skins are data (`src/data/sprites.ts`): a palette and three pixel grids. Everything that draws a hero iterates `skinsOf(character)` (`src/game/run.ts`), so appending to `GIGI_SKINS` / `DODO_SKINS` is enough for textures, menus, levels and cutscenes. A skin may carry an i18n `nameKey` for its name on the character screen.

**Tech Stack:** TypeScript, Phaser 4, Vitest. Run commands from `next/` in the worktree `.claude/worktrees/skins`.

Spec: `docs/superpowers/specs/2026-11-23-ninja-and-cinderella-skins-design.md`.

---

### Task 1: The test for skins

**Files:**
- Create: `next/tests/skins.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/config/i18n';
import { DODO_SKINS, GIGI_SKINS, type Skin } from '../src/data/sprites';

const POSES = ['stand', 'run', 'jump'] as const;
const CHARACTERS: [string, Skin[]][] = [['gigi', GIGI_SKINS], ['dodo', DODO_SKINS]];

describe('the skins', () => {
  for (const [who, skins] of CHARACTERS) {
    it(`${who}: every skin draws every pose on the classic skin's grid`, () => {
      const h = skins[0].stand.length;
      const w = skins[0].stand[0].length;
      for (const skin of skins) {
        for (const pose of POSES) {
          const grid = skin[pose];
          expect({ skin: skin.name, pose, h: grid.length }).toEqual({ skin: skin.name, pose, h });
          for (const row of grid) expect({ skin: skin.name, pose, w: row.length }).toEqual({ skin: skin.name, pose, w });
        }
      }
    });

    it(`${who}: every colour a skin draws with is in its palette`, () => {
      for (const skin of skins) {
        for (const pose of POSES) {
          for (const v of skin[pose].flat()) {
            if (v !== 0) expect({ skin: skin.name, pose, v, there: v in skin.palette }).toEqual({ skin: skin.name, pose, v, there: true });
          }
        }
      }
    });
  }

  it('has a Ninja for Gigi and a Cinderella for Dodo', () => {
    expect(GIGI_SKINS.map((s) => s.name)).toContain('Ninja');
    expect(DODO_SKINS.map((s) => s.name)).toContain('Cinderella');
    expect(TRANSLATIONS.skin_cinderella).toMatchObject({ et: 'TUHKATRIINU', en: 'CINDERELLA' });
  });

  it('names every translated skin in capitals, in both languages', () => {
    for (const skin of [...GIGI_SKINS, ...DODO_SKINS]) {
      if (!skin.nameKey) continue;
      const entry = TRANSLATIONS[skin.nameKey];
      expect({ key: skin.nameKey, there: Boolean(entry) }).toEqual({ key: skin.nameKey, there: true });
      for (const text of [entry.et, entry.en]) expect(text).toBe(text.toUpperCase());
    }
  });
});
```

- [ ] **Step 2: Run it and see the last two fail**

Run: `npx vitest run tests/skins.test.ts`
Expected: the grid and palette tests PASS for the existing skins; "has a Ninja ..." FAILS (no 'Ninja'); tsc-wise `nameKey` does not exist on `Skin` yet (Vitest still runs).

### Task 2: The skins

**Files:**
- Modify: `next/src/data/sprites.ts` (the `Skin` interface; after `GIGI_TRUCK_P`; `GIGI_SKINS`; after `DODO_ELSA_P`; `DODO_SKINS`)

- [ ] **Step 1: Add `nameKey` to `Skin`**

```ts
export interface Skin {
  name: string;
  /** The port's own skins: an i18n key for the name on the character screen. */
  nameKey?: string;
  palette: Palette;
  stand: SpriteData;
  run: SpriteData;
  jump: SpriteData;
}
```

- [ ] **Step 2: The Ninja, after `GIGI_TRUCK_P`**

The sprite faces right unflipped, so the headband's tail is on the left (behind him).

```ts
// The port's own skins (2026-11-23), not in the live game: tests/sprites.test.ts checks the
// live game's skins are the first ones, unchanged.
// Gigi as a ninja: navy hood and suit, an eye slit, a red headband whose tail flaps behind.
export const GIGI_NINJA_STAND=[[0,0,0,5,5,5,5,5,0,0],[0,0,5,5,5,5,5,5,5,0],[0,7,7,7,7,7,7,7,7,0],[0,0,5,4,4,4,4,4,5,0],[0,0,5,4,3,4,3,4,5,0],[0,0,5,5,5,5,5,5,5,0],[0,0,0,5,5,5,5,5,0,0],[0,0,0,0,5,5,5,0,0,0],[0,0,0,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,7,7,7,1,0,0],[0,0,0,2,2,2,2,2,0,0],[0,0,0,2,2,0,2,2,0,0],[0,0,0,6,6,0,6,6,0,0]];
export const GIGI_NINJA_RUN=[[0,0,0,5,5,5,5,5,0,0],[0,0,5,5,5,5,5,5,5,0],[0,7,7,7,7,7,7,7,7,0],[7,0,5,4,4,4,4,4,5,0],[0,0,5,4,3,4,3,4,5,0],[0,0,5,5,5,5,5,5,5,0],[0,0,0,5,5,5,5,5,0,0],[0,0,0,0,5,5,5,0,0,0],[0,0,0,1,1,1,1,1,0,0],[0,0,1,1,1,1,1,1,1,0],[0,0,0,1,7,7,7,1,0,0],[0,0,0,2,2,2,2,2,0,0],[0,0,2,2,0,0,2,2,0,0],[0,6,6,0,0,0,0,6,6,0]];
export const GIGI_NINJA_JUMP=[[0,0,0,5,5,5,5,5,0,0],[0,7,5,5,5,5,5,5,5,0],[0,7,7,7,7,7,7,7,7,0],[0,0,5,4,4,4,4,4,5,0],[0,0,5,4,3,4,3,4,5,0],[0,0,5,5,5,5,5,5,5,0],[0,0,0,5,5,5,5,5,0,0],[0,0,0,0,5,5,5,0,0,0],[0,1,0,1,1,1,1,1,0,1],[0,0,0,1,1,1,1,1,0,0],[0,0,0,1,7,7,7,1,0,0],[0,0,0,2,2,2,2,2,0,0],[0,0,2,2,0,0,2,2,0,0],[0,6,6,0,0,0,0,6,6,0]];
export const GIGI_NINJA_P={1:'#2a3550',2:'#1c2338',3:'#4f7942',4:'#ffcc99',5:'#232c45',6:'#111111',7:'#d03030'};
```

- [ ] **Step 3: Append it to `GIGI_SKINS`**

```ts
export const GIGI_SKINS: Skin[] = [
  {name:'Classic',palette:GIGI_P,stand:GIGI_STAND,run:GIGI_RUN,jump:GIGI_JUMP},
  {name:'Monster Truck',palette:GIGI_TRUCK_P,stand:GIGI_TRUCK_STAND,run:GIGI_TRUCK_RUN,jump:GIGI_TRUCK_JUMP},
  {name:'Ninja',nameKey:'skin_ninja',palette:GIGI_NINJA_P,stand:GIGI_NINJA_STAND,run:GIGI_NINJA_RUN,jump:GIGI_NINJA_JUMP},
];
```

- [ ] **Step 4: Cinderella, after `DODO_ELSA_P`**

```ts
// Dodo as Cinderella, the fairy-tale princess: golden hair in a bun, a pale-blue headband,
// puffed sleeves, a pale-blue ball gown and glass slippers. A port-only skin, as the Ninja.
export const DODO_CINDERELLA_STAND=[[0,0,0,0,5,5,0,0,0,0],[0,0,9,9,9,9,9,9,0,0],[0,5,5,5,5,5,5,5,5,0],[0,5,5,4,4,4,4,5,5,0],[0,5,4,3,4,4,3,4,5,0],[0,0,4,8,4,4,8,4,0,0],[0,0,0,4,7,7,4,0,0,0],[0,0,0,0,4,4,0,0,0,0],[0,0,2,1,1,1,1,2,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,2,2,2,2,2,2,1,0],[0,0,6,6,0,0,6,6,0,0]];
export const DODO_CINDERELLA_RUN=[[0,0,0,0,5,5,0,0,0,0],[0,0,9,9,9,9,9,9,0,0],[0,5,5,5,5,5,5,5,5,0],[0,5,5,4,4,4,4,5,5,0],[0,5,4,3,4,4,3,4,5,0],[0,0,4,8,4,4,8,4,0,0],[0,0,0,4,7,7,4,0,0,0],[0,0,0,0,4,4,0,0,0,0],[0,0,2,1,1,1,1,2,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,2,2,2,2,2,2,1,0],[0,6,6,0,0,0,0,6,6,0]];
export const DODO_CINDERELLA_JUMP=[[0,0,0,0,5,5,0,0,0,0],[0,0,9,9,9,9,9,9,0,0],[0,5,5,5,5,5,5,5,5,0],[0,5,5,4,4,4,4,5,5,0],[0,5,4,3,4,4,3,4,5,0],[0,0,4,8,4,4,8,4,0,0],[0,0,0,4,7,7,4,0,0,0],[0,0,0,0,4,4,0,0,0,0],[0,2,0,1,1,1,1,0,2,0],[0,0,1,1,1,1,1,1,0,0],[0,0,2,2,2,2,2,2,0,0],[0,0,6,6,0,0,6,6,0,0]];
export const DODO_CINDERELLA_P={1:'#3f86d0',2:'#cfeaff',3:'#3f6d96',4:'#ffd2b0',5:'#f2cc55',6:'#bfe6ff',7:'#b5504a',8:'#ffb096',9:'#5fb0e0'};
```

- [ ] **Step 5: Append it to `DODO_SKINS`**

```ts
export const DODO_SKINS: Skin[] = [
  {name:'Classic',palette:DODO_P,stand:DODO_STAND,run:DODO_RUN,jump:DODO_JUMP},
  {name:'Elsa',palette:DODO_ELSA_P,stand:DODO_ELSA_STAND,run:DODO_ELSA_RUN,jump:DODO_ELSA_JUMP},
  {name:'Cinderella',nameKey:'skin_cinderella',palette:DODO_CINDERELLA_P,stand:DODO_CINDERELLA_STAND,run:DODO_CINDERELLA_RUN,jump:DODO_CINDERELLA_JUMP},
];
```

### Task 3: The names, and the parity test

**Files:**
- Modify: `next/src/config/i18n.ts` (after `story_trex_tiny`)
- Modify: `next/tests/i18n.test.ts` (`PORT_ONLY_KEYS`)
- Modify: `next/src/scenes/CharacterScene.ts` (`skinName`)
- Modify: `next/tests/sprites.test.ts` (the parity loop)

- [ ] **Step 1: The translations**

```ts
  // The port's own skins' names (data/sprites.ts, `nameKey`).
  skin_ninja:         {et:'NINJA',                    en:'NINJA'},
  skin_cinderella:    {et:'TUHKATRIINU',              en:'CINDERELLA'},
```

and `'skin_ninja', 'skin_cinderella',` appended to `PORT_ONLY_KEYS` in `tests/i18n.test.ts`.

- [ ] **Step 2: The name on the character screen**

```ts
function skinName(character: Character): string {
  const skins = skinsOf(character);
  const skin = skins[getSkinIndex(character)] ?? skins[0];
  return skin.nameKey ? TStr(skin.nameKey) : skin.name;
}
```

- [ ] **Step 3: The parity test checks the live game's skins as a prefix**

In `tests/sprites.test.ts`, above the `describe`:

```ts
/** The port added skins of its own after the live game's (2026-11-23); those come first, unchanged. */
const EXTENDED = new Set(['GIGI_SKINS', 'DODO_SKINS']);
```

and the loop body:

```ts
    it(`${name} is identical`, () => {
      const mine = (ported as Record<string, unknown>)[name];
      if (EXTENDED.has(name)) {
        const theirs = legacy[name] as unknown[];
        expect((mine as unknown[]).slice(0, theirs.length)).toEqual(theirs);
      } else {
        expect(mine).toEqual(legacy[name]);
      }
    });
```

- [ ] **Step 4: Run everything**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass, tsc clean.

### Task 4: The browser

- [ ] **Step 1:** Serve the worktree (`npm run dev -- --port 5177 --strictPort`), open the character screen, step ↑↓ to NINJA and TUHKATRIINU; switch the language and see CINDERELLA.
- [ ] **Step 2:** In a level with each skin: stand, run (tail flaps), jump, and the big-head power-up (`grantSillyPowerup(world, 'bighead')`): the head is the whole head and only the head.
- [ ] **Step 3:** A cutscene (`cut(3, false, 260)`): Cinderella carried by the Pterodactyl reads as her.
- [ ] **Step 4:** Note the skins in `next/PLAYTEST.md`; `npm run build`.
