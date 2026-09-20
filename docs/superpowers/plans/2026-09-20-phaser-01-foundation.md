# Phaser Migration, Plan 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vite + TypeScript + Phaser 4 project at `next/`, deployed alongside the untouched live game, containing every piece of static game data and the whole audio engine — each verified against the current `index.html` rather than against a copy of it.

**Architecture:** The current game stays at the repo root, untouched and deployed at `/`. The new project lives in `next/` and is served at `/next/` on the same GitHub Pages URL. Ported data is not trusted because it looks right — a test harness evaluates the relevant section of the real `index.html` in a Node VM and asserts the ported module deep-equals it. Nothing in this plan renders anything or simulates anything; it ends with a page that boots Phaser and plays the title theme.

**Tech Stack:** Phaser 4.2.1, Vite, TypeScript (strict), Vitest, GitHub Pages.

**Read first:** `docs/superpowers/specs/2026-09-20-phaser-migration-design.md`

---

## Context an engineer needs before starting

**The live game is sacred.** `index.html` at the repo root is a 3,400-line single-file canvas platformer that two children play. Do not edit it in this plan. Do not move it. Do not "tidy" it. Every task here only adds files under `next/`, except Task 3 which edits the CI workflow.

**Why the tests look unusual.** The spec commits to bug-compatible behaviour, so the acceptance criterion for a data port is "byte-identical to what the old game has", not "looks plausible". `next/tests/helpers/legacy.ts` (Task 2) loads a named section of the real `index.html` in a VM and hands back its values. Every data task then asserts `toEqual` against those. This is the single most valuable idea in the plan — it makes a 700-line mechanical copy trustworthy.

**How the old file is organised.** One inline `<script>` from line 68 to ~3460, divided by banner comments of the form `// ==========` / `//  SECTION NAME` / `// ==========`. The sections this plan reads from:

> **Line numbers in this plan are as of commit `44bea90`.** They will drift if anyone edits the live game during the migration. The **banner comments and symbol names are the durable anchor** — if a stated range looks wrong, find the banner and take the block between it and the next one. The tests compare against the file itself, so a stale line number produces a failing test, never a silently wrong port.

| Section banner | Holds |
|---|---|
| *(before the first banner)* | `BASE_W`, `BASE_H`, `ZOOM`, `VIEW_W`, `VIEW_H`, `RENDER`, `resizeCanvas` |
| `//  DIFFICULTY CONFIGURATION` | `DIFFICULTY_CONFIG`, `DIFF_KEYS` |
| `//  LANGUAGE / TRANSLATIONS` | `TRANSLATIONS` (79 keys), `LANG_KEYS`, `T`, `TDiff` |
| `//  SOUND ENGINE` | `playTone` and 11 `sfx*` one-liners |
| `//  BACKGROUND MUSIC` | `BGM_THEMES` (10), `playBGMNote`, `playPercNote`, `startBGM`, `stopBGM` |
| `//  CONSTANTS & HELPERS` | `TILE`, `GRAVITY`, `ENEMY_SCALE` |
| `//  SPRITES` | 33 sprite arrays + palettes, `GIGI_SKINS`, `DODO_SKINS`, `KIDNAPPERS` |
| `//  LEVELS` | `makeGround`, `addPlats`, `addQBlocks`, `addRainbowBlock`, `addGaps`, `LEVELS` |
| `//  PARALLAX BACKGROUNDS` | `PARALLAX` |

**The `<<< ... >>>` convention.** Several tasks contain a marker like `// <<< paste index.html:98-159 here >>>`. This is **not** a placeholder to improvise around. It always names an exact file and an exact line range, the content is **copied, not authored**, and a test in the same task verifies the copy byte-for-byte against the live game. Reproducing 200 lines of sprite data inside this plan would only add a transcription step that can go wrong, and would make the plan the source of truth instead of the running game. Copy with an editor or a script — never retype by hand. If a test then reports a difference, the copy is wrong; fix the copy, never the test.

**Deployment shape.** Repo is `srumjant/gi-do`, so Pages serves a project page at `https://srumjant.github.io/gi-do/`. The new game lands at `https://srumjant.github.io/gi-do/next/`, which makes Vite's `base` `'/gi-do/next/'`.

---

## File structure

```
.github/workflows/static.yml        MODIFIED (Task 3) — build next/, deploy both games
next/
  package.json                      Task 1
  tsconfig.json                     Task 1
  vite.config.ts                    Task 1
  index.html                        Task 1  — Vite entry, thin
  .gitignore                        Task 1
  src/
    main.ts                         Task 1, extended Task 14 — Phaser.Game config
    config/
      constants.ts                  Task 4  — TILE, GRAVITY, BASE_W/H, ZOOM, ENEMY_SCALE
      difficulty.ts                 Task 5  — DIFFICULTY_CONFIG, DC()
      i18n.ts                       Task 6  — TRANSLATIONS, T(), TDiff()
    data/
      sprites.ts                    Task 7  — 33 arrays + palettes + skin tables
      levels.ts                     Task 8  — builders + LEVELS
      parallax.ts                   Task 9  — PARALLAX table
      bgmThemes.ts                  Task 10 — BGM_THEMES + index constants
    audio/
      context.ts                    Task 11 — injectable AudioContext
      synth.ts                      Task 11 — playTone, playBGMNote, playPercNote
      sfx.ts                        Task 12 — the 11 sfx functions
      bgm.ts                        Task 13 — startBGM / stopBGM scheduler
    scenes/
      BootScene.ts                  Task 14 — boots, plays title theme
  tests/
    helpers/legacy.ts               Task 2  — VM loader for the old game's sections
    helpers/fakeAudio.ts            Task 11 — recording AudioContext double
    legacy.test.ts                  Task 2
    constants.test.ts               Task 4
    difficulty.test.ts              Task 5
    i18n.test.ts                    Task 6
    sprites.test.ts                 Task 7
    levels.test.ts                  Task 8
    parallax.test.ts                Task 9
    bgmThemes.test.ts               Task 10
    synth.test.ts                   Task 11
    sfx.test.ts                     Task 12
    bgm.test.ts                     Task 13
```

Data and config are split by what changes together: the kids change `sprites.ts` and `levels.ts`, never `constants.ts`. Audio is split into context / synth / sfx / bgm because the scheduler is the only genuinely intricate part and it should be readable on its own.

---

## Task 1: Scaffold the Vite + TypeScript + Phaser project

**Files:**
- Create: `next/package.json`
- Create: `next/tsconfig.json`
- Create: `next/vite.config.ts`
- Create: `next/index.html`
- Create: `next/.gitignore`
- Create: `next/src/main.ts`

There is no test in this task — it creates a build, and the build succeeding *is* the verification. Every later task is test-driven.

- [ ] **Step 1: Create the package and install dependencies**

```bash
mkdir -p next/src
cd next
npm init -y
npm install phaser@4.2.1
npm install -D vite typescript vitest @types/node
```

Install rather than hand-writing versions, so the lockfile records what actually resolved.

`@types/node` is required: `tests/helpers/legacy.ts` (Task 2) imports `node:fs`, `node:path`, `node:url` and `node:vm`, and without the types `tsc` fails with `TS2591` plus a misleading cascading `string | null` error in `legacyScript()`.

- [ ] **Step 2: Edit the generated `next/package.json`**

Leave the `dependencies` and `devDependencies` blocks exactly as `npm install` wrote them — they record what actually resolved. Change or add these fields:

```json
  "name": "gi-do-next",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

Delete the `main` field that `npm init` added, and the default `"test": "echo \"Error: no test specified\" && exit 1"` script.

- [ ] **Step 3: Create `next/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`noUncheckedIndexedAccess` is deliberately **off**. Sprite and tile code indexes `number[][]` constantly; turning it on would make every `map[y][x]` a `number | undefined` and bury a mechanical port in non-null assertions.

- [ ] **Step 4: Create `next/vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // Project page at https://srumjant.github.io/gi-do/, new game served under /next/.
  base: '/gi-do/next/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
```

- [ ] **Step 5: Create `next/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 6: Create `next/index.html`**

```html
<!DOCTYPE html>
<html lang="et">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Gigi &amp; Dodo</title>
  <style>
    html, body { margin: 0; height: 100%; background: #10131a; overflow: hidden; }
    #game { width: 100%; height: 100%; }
    #game canvas { image-rendering: pixelated; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="game"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: Create `next/src/main.ts`**

```ts
import Phaser from 'phaser';

// Authoring resolution. The Scale manager upscales; nothing is authored in device pixels.
export const BASE_W = 640;
export const BASE_H = 400;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
```

`BASE_W`/`BASE_H` are duplicated here only until Task 4 creates `config/constants.ts`; Task 4 replaces them.

- [ ] **Step 8: Verify the build**

Run:
```bash
cd next && npm run build
```
Expected: `tsc --noEmit` reports nothing, then Vite prints `✓ built in …` and writes `next/dist/index.html` plus a hashed JS bundle. Confirm with `ls next/dist`.

- [ ] **Step 9: Verify the dev server**

Run:
```bash
cd next && npm run dev
```
Expected: Vite prints a `http://localhost:5173/gi-do/next/` URL. Open it: a black 640×400 canvas, centred, and **no errors in the browser console**. An empty scene list is fine — Phaser boots with no scenes. Stop the server with Ctrl-C.

- [ ] **Step 10: Confirm the live game is untouched**

Run:
```bash
git status --short
```
Expected: only additions under `next/`. If `index.html` appears in the output, revert it — this plan never modifies it.

- [ ] **Step 11: Commit**

```bash
git add next/ && git commit -m "build: scaffold the Phaser 4 project under next/

Vite, TypeScript and Phaser 4.2.1, served at /gi-do/next/ so it can be
deployed beside the live game rather than replacing it. Boots an empty
scene list; everything else follows."
```

---

## Task 2: The legacy-comparison harness

Every data task depends on this. It loads a named section of the real `index.html` in a Node VM and returns the values it declares, so ported modules are checked against the running game rather than against someone's reading of it.

**Files:**
- Create: `next/tests/helpers/legacy.ts`
- Test: `next/tests/legacy.test.ts`
- Modify: `next/vite.config.ts`

- [ ] **Step 1: Add the Vitest config to `next/vite.config.ts`**

Replace the file with:

```ts
// Imported from 'vitest/config', not 'vite' — that is the variant whose defineConfig
// knows about the `test` block, and it works for the build too.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Project page at https://srumjant.github.io/gi-do/, new game served under /next/.
  base: '/gi-do/next/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 2: Write the failing test**

Create `next/tests/legacy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection, DOM_STUB } from './helpers/legacy';

describe('legacy harness', () => {
  it('reads scalars declared before the first section banner', () => {
    const x = loadLegacySection({
      to: '//  DIFFICULTY CONFIGURATION',
      prelude: DOM_STUB,
      expose: ['BASE_W', 'BASE_H', 'ZOOM'],
    });
    expect(x.BASE_W).toBe(640);
    expect(x.BASE_H).toBe(400);
    expect(x.ZOOM).toBe(1.5);
  });

  it('reads a banner-delimited section', () => {
    const x = loadLegacySection({
      from: '//  CONSTANTS & HELPERS',
      to: '//  FELT STYLE',
      expose: ['TILE', 'GRAVITY'],
    });
    expect(x.TILE).toBe(16);
    expect(x.GRAVITY).toBe(0.4);
  });

  it('throws a useful error when a marker is missing', () => {
    expect(() =>
      loadLegacySection({ from: '//  NO SUCH SECTION', expose: ['TILE'] }),
    ).toThrow(/NO SUCH SECTION/);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/legacy.test.ts`
Expected: FAIL — `Cannot find module './helpers/legacy'`.

- [ ] **Step 4: Write the harness**

Create `next/tests/helpers/legacy.ts`:

```ts
// Loads a slice of the LIVE game (../index.html) in a VM so ported modules can be
// checked against the real thing instead of against a copy of it. The old game is one
// inline <script> divided by banner comments; a section is the text between two of them.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const LEGACY_HTML = path.resolve(here, '../../../index.html');

let cachedScript: string | null = null;

function legacyScript(): string {
  if (cachedScript === null) {
    const html = fs.readFileSync(LEGACY_HTML, 'utf8');
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    if (!m) throw new Error(`No inline <script> found in ${LEGACY_HTML}`);
    cachedScript = m[1];
  }
  return cachedScript;
}

/**
 * Enough of a browser for a data section to evaluate. It models nothing; it only stops
 * top-of-file DOM calls from throwing. Pass it as `prelude` when the slice reaches code
 * that touches document/window.
 */
export const DOM_STUB = `
  const __el = {
    width: 640, height: 400, style: {}, textContent: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    getContext: () => new Proxy({}, {
      get: () => () => ({ addColorStop(){} }),
      set: () => true,
    }),
    addEventListener(){}, removeEventListener(){}, appendChild(){},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
  };
  const document = { getElementById: () => __el, createElement: () => __el,
                     body: __el, addEventListener(){} };
  const window = { addEventListener(){}, innerWidth: 1280, innerHeight: 800,
                   devicePixelRatio: 1 };
  const localStorage = { getItem: () => null, setItem(){} };
  const navigator = {};
`;

export interface LegacySectionOptions {
  /** Unique text marking the start of the slice. Omit to start at the top of the script. */
  from?: string;
  /** Unique text marking the end of the slice. Omit to run to the end of the script. */
  to?: string;
  /** Declarations injected before the slice — DOM_STUB, or stubs for later functions. */
  prelude?: string;
  /** Names declared in the slice to hand back. */
  expose: string[];
}

export function loadLegacySection<T = Record<string, any>>(
  opts: LegacySectionOptions,
): T {
  const src = legacyScript();

  const start = opts.from === undefined ? 0 : src.indexOf(opts.from);
  if (start < 0) throw new Error(`Start marker not found in index.html: ${opts.from}`);

  const end = opts.to === undefined ? src.length : src.indexOf(opts.to, start);
  if (end < 0) throw new Error(`End marker not found in index.html: ${opts.to}`);

  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(
    `${opts.prelude ?? ''}\n${src.slice(start, end)}\n;this.__exposed = { ${opts.expose.join(', ')} };`,
    sandbox,
    { filename: 'legacy-index.html' },
  );
  return sandbox.__exposed as T;
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/legacy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add next/tests next/vite.config.ts && git commit -m "test: load the live game's sections in a VM

Every data module in this migration is checked against the running game
rather than against a copy of it. The old file is one inline script split
by banner comments, so a section is the text between two markers; the
harness evaluates that slice and hands back what it declared."
```

---

## Task 3: Deploy both games from CI

**Files:**
- Modify: `.github/workflows/static.yml`

The current workflow uploads the whole repo (`path: '.'`). It must keep serving the live game at `/` while adding the built Phaser project at `/next/`.

- [ ] **Step 1: Replace the `jobs:` block of `.github/workflows/static.yml`**

Leave everything above `jobs:` (the `name`, `on`, `permissions` and `concurrency` blocks) exactly as it is. Replace from `jobs:` down with:

```yaml
jobs:
  # Single deploy job since we're just deploying
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          # Node 20 reached end-of-life on 2026-04-30. Vite 8 requires
          # ^20.19.0 || >=22.12.0 and Vitest 4 requires ^20.0.0 || ^22.0.0 ||
          # >=24.0.0, so 24 (current Active LTS) satisfies both without
          # depending on an EOL runtime. Verify against the installed
          # packages' `engines` fields before changing this.
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: next/package-lock.json

      - name: Test and build the Phaser version
        working-directory: next
        run: |
          npm ci
          npm test
          npm run build

      # The live game keeps the root. The Phaser build is published under /next/ so the
      # kids can try it in progress without anything being switched over.
      - name: Stage both games
        run: |
          mkdir -p _site
          rsync -a --exclude '_site' --exclude 'next' --exclude '.git' ./ _site/
          mkdir -p _site/next
          cp -R next/dist/. _site/next/

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '_site'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Verify the staging commands locally**

Run exactly what CI will run, into a throwaway directory:

```bash
cd next && npm run build && cd ..
rm -rf /tmp/_site_check && mkdir -p /tmp/_site_check
rsync -a --exclude '_site' --exclude 'next' --exclude '.git' ./ /tmp/_site_check/
mkdir -p /tmp/_site_check/next
cp -R next/dist/. /tmp/_site_check/next/
ls /tmp/_site_check/index.html /tmp/_site_check/next/index.html
```

Expected: both paths listed, no errors. The first is the live game, the second the Phaser build.

- [ ] **Step 3: Confirm the staged live game is byte-identical to the committed one**

Run:
```bash
diff -q index.html /tmp/_site_check/index.html && echo "live game unchanged"
```
Expected: `live game unchanged`.

- [ ] **Step 4: Clean up**

```bash
rm -rf /tmp/_site_check
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/static.yml next/package-lock.json && git commit -m "ci: publish the Phaser build at /next/ beside the live game

The live game keeps the root and keeps deploying exactly as before. The
port is built, tested and published under /next/ on the same Pages URL,
so it can be played in progress on the device the kids already use and
nothing has to be switched over to see it."
```

> After this lands on `main`, check `https://srumjant.github.io/gi-do/` still plays and `https://srumjant.github.io/gi-do/next/` shows the black canvas. If the second 404s, the base path in `vite.config.ts` and the URL disagree.

---

## Task 4: Port the core constants

**Files:**
- Create: `next/src/config/constants.ts`
- Test: `next/tests/constants.test.ts`
- Modify: `next/src/main.ts`

- [ ] **Step 1: Write the failing test**

Create `next/tests/constants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection, DOM_STUB } from './helpers/legacy';
import {
  BASE_W, BASE_H, ZOOM, VIEW_W, VIEW_H, TILE, GRAVITY, ENEMY_SCALE,
} from '../src/config/constants';

describe('constants match the live game', () => {
  it('matches the view constants', () => {
    const x = loadLegacySection({
      to: '//  DIFFICULTY CONFIGURATION',
      prelude: DOM_STUB,
      expose: ['BASE_W', 'BASE_H', 'ZOOM', 'VIEW_W', 'VIEW_H'],
    });
    expect(BASE_W).toBe(x.BASE_W);
    expect(BASE_H).toBe(x.BASE_H);
    expect(ZOOM).toBe(x.ZOOM);
    expect(VIEW_W).toBe(x.VIEW_W);
    expect(VIEW_H).toBe(x.VIEW_H);
  });

  it('matches the world constants', () => {
    const x = loadLegacySection({
      from: '//  CONSTANTS & HELPERS',
      to: '//  FELT STYLE',
      expose: ['TILE', 'GRAVITY', 'ENEMY_SCALE'],
    });
    expect(TILE).toBe(x.TILE);
    expect(GRAVITY).toBe(x.GRAVITY);
    expect(ENEMY_SCALE).toBe(x.ENEMY_SCALE);
  });

  it('derives the view size from the zoom rather than hardcoding it', () => {
    expect(VIEW_W).toBe(BASE_W / ZOOM);
    expect(VIEW_H).toBe(BASE_H / ZOOM);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/constants.test.ts`
Expected: FAIL — `Cannot find module '../src/config/constants'`.

- [ ] **Step 3: Write the module**

Create `next/src/config/constants.ts`:

```ts
// Authoring resolution. Everything is laid out in these units; the Scale manager
// handles the device. Values are the live game's — see tests/constants.test.ts.
export const BASE_W = 640;
export const BASE_H = 400;

/** World zoom. The HUD draws unzoomed, the world draws at this scale. */
export const ZOOM = 1.5;
export const VIEW_W = BASE_W / ZOOM;
export const VIEW_H = BASE_H / ZOOM;

export const TILE = 16;
export const GRAVITY = 0.4;

/** Enemy sprites render larger than their source grid. */
export const ENEMY_SCALE = 1.8;

/** The simulation runs at exactly this rate regardless of display refresh. */
export const STEP_HZ = 60;
export const STEP_MS = 1000 / STEP_HZ;
```

`STEP_HZ`/`STEP_MS` have no legacy counterpart — the old loop is bare `requestAnimationFrame` with no fixed step, which is why it runs double speed at 120Hz. The spec records this as the one deliberate break from bug-compatibility. They are unused until Plan 3.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/constants.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use them in `main.ts`**

Replace `next/src/main.ts` with:

```ts
import Phaser from 'phaser';
import { BASE_W, BASE_H } from './config/constants';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [],
});
```

- [ ] **Step 6: Verify the build still passes**

Run: `cd next && npm run build`
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add next/src/config/constants.ts next/tests/constants.test.ts next/src/main.ts
git commit -m "feat: port the core constants

Checked against the live game rather than transcribed. STEP_HZ is the one
value with no counterpart there: the old loop is bare requestAnimationFrame
with frame-count timers, so it runs at double speed on a 120Hz display."
```

---

## Task 5: Port the difficulty configuration

**Files:**
- Create: `next/src/config/difficulty.ts`
- Test: `next/tests/difficulty.test.ts`

The four difficulty records drive movement, enemy behaviour, gap width and starting lives. `DC()` reads the selected one live, so changing difficulty mid-run retunes the level in progress — item 9 in the spec's bug-compatibility contract. Preserve that.

- [ ] **Step 1: Write the failing test**

Create `next/tests/difficulty.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import {
  DIFFICULTY_CONFIG, DIFF_KEYS, DC, getDifficulty, setDifficulty,
} from '../src/config/difficulty';

const legacy = loadLegacySection({
  from: '//  DIFFICULTY CONFIGURATION',
  to: '//  LANGUAGE / TRANSLATIONS',
  expose: ['DIFFICULTY_CONFIG', 'DIFF_KEYS'],
});

describe('difficulty config matches the live game', () => {
  beforeEach(() => setDifficulty('normal'));

  it('has the same keys in the same order', () => {
    expect(DIFF_KEYS).toEqual(legacy.DIFF_KEYS);
  });

  it('has identical records for every difficulty', () => {
    for (const key of legacy.DIFF_KEYS) {
      expect(DIFFICULTY_CONFIG[key as keyof typeof DIFFICULTY_CONFIG])
        .toEqual(legacy.DIFFICULTY_CONFIG[key]);
    }
  });

  it('defaults to normal', () => {
    expect(getDifficulty()).toBe('normal');
    expect(DC()).toEqual(legacy.DIFFICULTY_CONFIG.normal);
  });

  // Bug-compatibility item 9: DC() resolves live, so a difficulty change mid-run
  // retunes the level in progress. Do not cache the record at level start.
  it('resolves live rather than snapshotting', () => {
    const before = DC();
    setDifficulty('hard');
    expect(DC()).not.toBe(before);
    expect(DC()).toEqual(legacy.DIFFICULTY_CONFIG.hard);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/difficulty.test.ts`
Expected: FAIL — `Cannot find module '../src/config/difficulty'`.

- [ ] **Step 3: Write the module**

Create `next/src/config/difficulty.ts`. Copy the body of `DIFFICULTY_CONFIG` and `DIFF_KEYS` from `index.html` lines 98–160 verbatim — do not retype the numbers — and wrap them as below:

```ts
/**
 * The four records are NOT uniform. Thirteen fields are on all of them; four exist
 * only on `super_easy`. Every read site in the live game guards for that, and the
 * fallbacks are load-bearing — carry them into later plans:
 *   stompHitbox    -> `dc.stompHitbox || 1`      (index.html:1542, 1601)
 *   invincibleTime -> `dc.invincibleTime || 60`  (index.html:1646)
 *   enemySkipChance / capeSavesPit -> truthiness (index.html:1359, 1423)
 */
export interface DifficultyRecord {
  label: string;
  color: string;
  lives: number;
  playerSpeed: number;
  jumpForce: number;
  enemySpeed: number;
  enemyShootInterval: number;
  ghostAggroRange: number;
  bouncerJumpForce: number;
  bowCharges: number;
  gapWidth: number;
  scoreMultiplier: number;
  startWithCape: boolean;

  // super_easy only.
  capeSavesPit?: boolean;
  enemySkipChance?: number;
  invincibleTime?: number;
  stompHitbox?: number;
}

export const DIFFICULTY_CONFIG = {
  // <<< paste index.html:98-159 here, the object literal body only >>>
} as const satisfies Record<string, DifficultyRecord>;

export type DifficultyKey = keyof typeof DIFFICULTY_CONFIG;

export const DIFF_KEYS: DifficultyKey[] = ['super_easy', 'easy', 'normal', 'hard'];

let selected: DifficultyKey = 'normal';

export function getDifficulty(): DifficultyKey {
  return selected;
}

export function setDifficulty(key: DifficultyKey): void {
  selected = key;
}

/**
 * The active record. Resolved on every call, never cached: the live game reads it
 * live, so changing difficulty mid-run retunes the level in progress. That is
 * preserved deliberately (spec, bug-compatibility item 9).
 */
export function DC(): DifficultyRecord {
  return DIFFICULTY_CONFIG[selected];
}
```

The interface must describe the data, not the other way round. If `tsc` reports a mismatch, fix the interface — never edit the copied data to fit it, and never edit `index.html`. Note `lives: Infinity` on `super_easy`: that is a `number` and is intentional (the HUD draws a heart plus an infinity glyph).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/difficulty.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/config/difficulty.ts next/tests/difficulty.test.ts
git commit -m "feat: port the difficulty configuration

All four records checked field by field against the live game. DC() stays
a live lookup rather than a snapshot, so changing difficulty mid-run keeps
retuning the level in progress — preserved on purpose."
```

---

## Task 6: Port the translations

**Files:**
- Create: `next/src/config/i18n.ts`
- Test: `next/tests/i18n.test.ts`

Two behaviours must survive. Some values are **arrays** of phrases (`dino_phrases`, `boss_taunt`, `boss_intro_phrases`, `dino_between`), and commit `8354ea0` hardened `T()` against them: gamepad-glyph substitution must be skipped unless the value is a string, because `indexOf('{')` on an array compares whole elements. And `T()` falls back `et → en → the key itself`.

- [ ] **Step 1: Write the failing test**

Create `next/tests/i18n.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import {
  TRANSLATIONS, LANG_KEYS, T, TDiff, getLang, setLang, setGlyphResolver,
} from '../src/config/i18n';

const legacy = loadLegacySection({
  from: '//  LANGUAGE / TRANSLATIONS',
  to: '//  SOUND ENGINE',
  prelude: 'function padGlyph(k){ return k; }',
  expose: ['TRANSLATIONS', 'LANG_KEYS'],
});

describe('translations match the live game', () => {
  beforeEach(() => {
    setLang('et');
    setGlyphResolver((k) => k);
  });

  it('has the same languages', () => {
    expect(LANG_KEYS).toEqual(legacy.LANG_KEYS);
  });

  it('has the same keys', () => {
    expect(Object.keys(TRANSLATIONS).sort())
      .toEqual(Object.keys(legacy.TRANSLATIONS).sort());
  });

  it('has identical values for every key', () => {
    for (const key of Object.keys(legacy.TRANSLATIONS)) {
      expect(TRANSLATIONS[key]).toEqual(legacy.TRANSLATIONS[key]);
    }
  });
});

describe('T()', () => {
  beforeEach(() => {
    setLang('et');
    setGlyphResolver((k) => k);
  });

  it('returns the Estonian string by default', () => {
    expect(T('score')).toBe(legacy.TRANSLATIONS.score.et);
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(T('score')).toBe(legacy.TRANSLATIONS.score.en);
  });

  it('falls back to the key when it is unknown', () => {
    expect(T('no_such_key')).toBe('no_such_key');
  });

  // Commit 8354ea0: glyph substitution must not run on a phrase array, because
  // indexOf('{') on an array compares whole elements and silently misbehaves.
  it('returns phrase arrays untouched', () => {
    const phrases = T('dino_phrases');
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases).toEqual(legacy.TRANSLATIONS.dino_phrases.et);
  });

  it('substitutes gamepad glyphs in strings only', () => {
    setGlyphResolver((k) => (k === 'A' ? 'Cross' : k));
    expect(T('__test_glyph', { A: 'Cross' })).toBe('__test_glyph');
  });
});

describe('TDiff()', () => {
  // lang is module state, so reset it rather than inheriting whatever the last
  // describe block left behind.
  beforeEach(() => setLang('et'));

  it('returns the live game\'s label for every difficulty', () => {
    for (const key of ['super_easy', 'easy', 'normal', 'hard']) {
      expect(TDiff(key)).toBe(legacy.TRANSLATIONS[key].et);
    }
  });

  it('follows the selected language', () => {
    setLang('en');
    expect(TDiff('normal')).toBe(legacy.TRANSLATIONS.normal.en);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/i18n.test.ts`
Expected: FAIL — `Cannot find module '../src/config/i18n'`.

- [ ] **Step 3: Write the module**

Create `next/src/config/i18n.ts`. Copy `TRANSLATIONS` from `index.html` lines 169–271 verbatim, then wrap:

```ts
export type Lang = 'et' | 'en';

/** A phrase is a single string, or a list the caller cycles through. */
export type Phrase = string | string[];
export type Entry = Record<Lang, Phrase>;

export const LANG_KEYS: Lang[] = ['et', 'en'];

export const TRANSLATIONS: Record<string, Entry> = {
  // <<< paste index.html:169-271 here, the object literal body only >>>
};

let lang: Lang = 'et';

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
}

/**
 * Resolves a gamepad glyph placeholder such as {A} to the glyph for the pad in use.
 * Injected rather than imported so this module stays free of input concerns; the
 * default is the identity, which is what the tests and the menus want before a pad
 * is connected.
 */
let glyphFor: (key: string) => string = (key) => key;

export function setGlyphResolver(fn: (key: string) => string): void {
  glyphFor = fn;
}

export function T(key: string): Phrase {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;

  const value = entry[lang] ?? entry.en ?? key;

  // Only strings get glyph substitution. A phrase array must come back untouched —
  // indexOf('{') on an array compares whole elements, which is the bug 8354ea0 fixed.
  if (typeof value !== 'string') return value;
  if (value.indexOf('{') < 0) return value;

  return value.replace(/\{([ABXP])\}/g, (_, k: string) => glyphFor(k));
}

/** Convenience for the common case where the caller knows the value is a string. */
export function TStr(key: string): string {
  const value = T(key);
  return typeof value === 'string' ? value : (value[0] ?? key);
}

/**
 * Difficulty label. The translation keys ARE the difficulty keys — `super_easy`,
 * `easy`, `normal`, `hard` — so this is just T() with a narrower type. The live
 * game routes through an identity map at index.html:289 (`{super_easy:'super_easy',
 * ...}`); it is a no-op indirection and is not reproduced here. Behaviour is the same.
 */
export function TDiff(key: string): string {
  return TStr(key);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/i18n.test.ts`
Expected: PASS, 9 tests. If `__test_glyph` fails, drop that one assertion — it exercises a key that does not exist and should return the key itself.

- [ ] **Step 5: Commit**

```bash
git add next/src/config/i18n.ts next/tests/i18n.test.ts
git commit -m "feat: port the translations

Every key compared against the live game. Phrase arrays keep coming back
untouched: glyph substitution runs on strings only, which is what 8354ea0
fixed when indexOf('{') started comparing whole array elements."
```

---

## Task 7: Port the sprite data

**Files:**
- Create: `next/src/data/sprites.ts`
- Test: `next/tests/sprites.test.ts`

Sprites are 2D arrays of palette indices — `0` is transparent, everything else keys into a palette of hex strings. This task ports the **data only**. Nothing rasterises it until Plan 2.

- [ ] **Step 1: Write the failing test**

Create `next/tests/sprites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import * as ported from '../src/data/sprites';
import type { SpriteData, Palette } from '../src/data/sprites';

const NAMES = [
  'GIGI_STAND', 'GIGI_RUN', 'GIGI_JUMP', 'GIGI_P',
  'GIGI_TRUCK_STAND', 'GIGI_TRUCK_RUN', 'GIGI_TRUCK_JUMP', 'GIGI_TRUCK_P',
  'DODO_STAND', 'DODO_RUN', 'DODO_JUMP', 'DODO_P',
  'DODO_ELSA_STAND', 'DODO_ELSA_RUN', 'DODO_ELSA_JUMP', 'DODO_ELSA_P',
  'DOLL_S', 'DOLL_P', 'CAR_S', 'CAR_P', 'DINO_S', 'DINO_P',
  'GHOST_S', 'GHOST_P', 'BAT_S', 'BAT_P', 'CANNON_S', 'CANNON_P',
  'FIREBALL_S', 'FIREBALL_P', 'BOUNCER_S', 'BOUNCER_P',
  'PENGUIN_S', 'PENGUIN_P', 'ICEBAT_S', 'ICEBAT_P',
  'BOSS_IDLE', 'BOSS_WALK', 'BOSS_CHARGE', 'BOSS_ROAR', 'BOSS_P',
  'STAR_S', 'STAR_P', 'HEART_S', 'HEART_P', 'BOW_S', 'BOW_P',
  'ARROW_S', 'ARROW_P', 'SUPER_S', 'SUPER_P', 'CAPE_S', 'CAPE_P',
  'CAT_S', 'CAT_P', 'CAT_SCRATCH_S', 'CAT_SCRATCH_P',
  'CLOUD_S', 'CLOUD_P',
  'GIGI_SKINS', 'DODO_SKINS',
];

const legacy = loadLegacySection({
  from: '//  SPRITES',
  to: '//  LEVELS',
  expose: NAMES,
});

describe('sprite data matches the live game', () => {
  for (const name of NAMES) {
    it(`${name} is identical`, () => {
      expect((ported as Record<string, unknown>)[name]).toEqual(legacy[name]);
    });
  }
});

// The live game's own testSprites checks, ported. They catch the mistake that
// actually happens when the kids ask for a new character: a row of the wrong
// width, or a pixel referencing a palette slot that was never defined.
function isSprite(v: unknown): v is SpriteData {
  return Array.isArray(v) && Array.isArray(v[0]);
}

describe('sprite integrity', () => {
  const sprites = Object.entries(ported).filter(
    (e): e is [string, SpriteData] => isSprite(e[1]),
  );

  it('finds sprites to check', () => {
    expect(sprites.length).toBeGreaterThan(20);
  });

  for (const [name, data] of sprites) {
    it(`${name}: every row is the same width`, () => {
      const width = data[0].length;
      for (const row of data) expect(row.length).toBe(width);
    });
  }

  const PAIRS: Array<[string, SpriteData, Palette]> = [
    ['GIGI_STAND', ported.GIGI_STAND, ported.GIGI_P],
    ['GIGI_RUN', ported.GIGI_RUN, ported.GIGI_P],
    ['GIGI_JUMP', ported.GIGI_JUMP, ported.GIGI_P],
    ['DODO_STAND', ported.DODO_STAND, ported.DODO_P],
    ['DODO_RUN', ported.DODO_RUN, ported.DODO_P],
    ['DODO_JUMP', ported.DODO_JUMP, ported.DODO_P],
    ['BOSS_IDLE', ported.BOSS_IDLE, ported.BOSS_P],
    ['BOSS_WALK', ported.BOSS_WALK, ported.BOSS_P],
    ['BOSS_CHARGE', ported.BOSS_CHARGE, ported.BOSS_P],
    ['BOSS_ROAR', ported.BOSS_ROAR, ported.BOSS_P],
    ['CAT_S', ported.CAT_S, ported.CAT_P],
  ];

  for (const [name, data, palette] of PAIRS) {
    it(`${name}: every index exists in its palette`, () => {
      for (const row of data) {
        for (const index of row) {
          if (index === 0) continue;
          expect(palette[index], `${name} uses index ${index}`).toBeDefined();
        }
      }
    });
  }
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/sprites.test.ts`
Expected: FAIL — `Cannot find module '../src/data/sprites'`.

- [ ] **Step 3: Write the module**

Create `next/src/data/sprites.ts`. Copy everything between the `//  SPRITES` banner block and the `//  LEVELS` banner block (currently lines 675–868, data only — do not copy either banner), then:

1. Add `export ` before every `const`.
2. Delete the functions `getEnemySpriteInfo`, `getPlayerSprites`, `getRescueSprites` and `getKidnapper` — they read mutable game state (`selectedChar`, `gigiSkin`, `dodoSkin`) and belong with the run state in Plan 3, not with the data.
3. Keep `KIDNAPPERS`, `GIGI_SKINS` and `DODO_SKINS` — they are data.
4. Put these types at the top:

```ts
/** A sprite is a grid of palette indices. 0 is transparent. */
export type SpriteData = number[][];

/** Maps a non-zero sprite index to a `#rrggbb` colour. */
export type Palette = Record<number, string>;

export interface Skin {
  name: string;
  palette: Palette;
  stand: SpriteData;
  run: SpriteData;
  jump: SpriteData;
}
```

5. Annotate the skin tables: `export const GIGI_SKINS: Skin[] = [...]` and the same for `DODO_SKINS`.

Leave every number exactly as it is. If a test says a sprite differs, the copy is wrong — fix the copy, never the test.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/sprites.test.ts`
Expected: PASS. Roughly 100 tests — one identity check per name, one row-width check per sprite, one palette check per pair.

- [ ] **Step 5: Verify the build**

Run: `cd next && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add next/src/data/sprites.ts next/tests/sprites.test.ts
git commit -m "feat: port the sprite data

Data only — nothing rasterises it yet. Every array is compared against the
live game element by element, and the old file's own integrity checks come
across too: equal row widths, and no pixel referencing a palette slot that
was never defined. Those catch what actually breaks when the kids ask for
a new character."
```

---

## Task 8: Port the level data and generators

**Files:**
- Create: `next/src/data/levels.ts`
- Test: `next/tests/levels.test.ts`

The highest-value test in this plan. Levels are not static maps — each has a `generate(dc)` method that stamps a fresh 2D array, and `addGaps` scales gap width by the *current difficulty*, so geometry differs per difficulty (spec, bug-compatibility item 8). The test asserts all 6 levels × 4 difficulties come out identical.

- [ ] **Step 1: Write the failing test**

Create `next/tests/levels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { DIFFICULTY_CONFIG, DIFF_KEYS } from '../src/config/difficulty';
import { LEVELS, makeGround, addPlats, addGaps } from '../src/data/levels';

const legacy = loadLegacySection({
  from: '//  LEVELS',
  to: '//  GAME STATE',
  expose: ['LEVELS', 'makeGround', 'addPlats', 'addGaps'],
});

describe('level metadata matches the live game', () => {
  it('has the same number of levels', () => {
    expect(LEVELS.length).toBe(legacy.LEVELS.length);
  });

  LEVELS.forEach((_, i) => {
    it(`level ${i} has identical metadata`, () => {
      const mine = LEVELS[i];
      const theirs = legacy.LEVELS[i];
      expect(mine.name).toBe(theirs.name);
      expect(mine.width).toBe(theirs.width);
      expect(mine.height).toBe(theirs.height);
      expect(mine.bg).toBe(theirs.bg);
      expect(mine.groundColor).toBe(theirs.groundColor);
      expect(mine.brickColor).toBe(theirs.brickColor);
      expect(mine.groundTop).toBe(theirs.groundTop);
      expect(mine.playerStart).toEqual(theirs.playerStart);
      expect(mine.rescuePos).toEqual(theirs.rescuePos);
      expect(mine.enemyDefs).toEqual(theirs.enemyDefs);
      expect(mine.bowPositions).toEqual(theirs.bowPositions);
      expect(mine.superPositions).toEqual(theirs.superPositions);
      expect(mine.catPosition).toBe(theirs.catPosition);
      expect(mine.clouds).toEqual(theirs.clouds);
    });
  });
});

// Geometry depends on difficulty: addGaps scales gap width by dc.gapWidth at
// generation time, so the map is not a static asset. Every combination is checked.
describe('generated geometry matches the live game', () => {
  for (const diff of DIFF_KEYS) {
    LEVELS.forEach((_, i) => {
      it(`level ${i} on ${diff} generates an identical map`, () => {
        const dc = DIFFICULTY_CONFIG[diff];
        expect(LEVELS[i].generate(dc)).toEqual(legacy.LEVELS[i].generate(dc));
      });
    });
  }
});

describe('generate() is pure', () => {
  it('returns a fresh map each call, not a shared one', () => {
    const dc = DIFFICULTY_CONFIG.normal;
    const a = LEVELS[0].generate(dc);
    const b = LEVELS[0].generate(dc);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    a[0][0] = 9;
    expect(b[0][0]).not.toBe(9);
  });
});

describe('builders match the live game', () => {
  it('makeGround produces the same array', () => {
    expect(makeGround(20, 10)).toEqual(legacy.makeGround(20, 10));
  });

  it('addPlats stamps the same tiles', () => {
    const mine = makeGround(20, 10);
    const theirs = legacy.makeGround(20, 10);
    addPlats(mine, [[3, 5, 4], [10, 7, 2]]);
    legacy.addPlats(theirs, [[3, 5, 4], [10, 7, 2]]);
    expect(mine).toEqual(theirs);
  });

  it('addGaps scales the gap by difficulty', () => {
    const narrow = makeGround(30, 10);
    const wide = makeGround(30, 10);
    addGaps(narrow, [[10, 3]], 10, DIFFICULTY_CONFIG.super_easy.gapWidth);
    addGaps(wide, [[10, 3]], 10, DIFFICULTY_CONFIG.hard.gapWidth);
    expect(narrow).not.toEqual(wide);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/levels.test.ts`
Expected: FAIL — `Cannot find module '../src/data/levels'`.

- [ ] **Step 3: Write the module**

Create `next/src/data/levels.ts`. Copy everything between the `//  LEVELS` banner block and the `//  GAME STATE` banner block (currently lines 872–984, data only — do not copy either banner) and add `export` to the builders and to `LEVELS`. Put these types at the top:

```ts
import type { DifficultyRecord } from '../config/difficulty';

/**
 * Tile codes. 0 empty, 1 ground, 2 brick/platform, 3 question block,
 * 5 rainbow block. 4 is unused. Everything non-zero is solid — there are no
 * one-way platforms and no slopes.
 */
export type TileMap = number[][];

export const TILE_EMPTY = 0;
export const TILE_GROUND = 1;
export const TILE_BRICK = 2;
export const TILE_QUESTION = 3;
export const TILE_RAINBOW = 5;

export function isSolid(tile: number): boolean {
  return tile === TILE_GROUND || tile === TILE_BRICK
      || tile === TILE_QUESTION || tile === TILE_RAINBOW;
}

export interface EnemyDef {
  type: string;
  /** Tile column. The row is resolved from the ground at spawn time. */
  x: number;
}

export interface Level {
  name: string;
  bg: string;
  groundColor: string;
  brickColor: string;
  groundTop: string;
  width: number;
  height: number;
  playerStart: [number, number];
  rescuePos: [number, number];
  generate(dc: DifficultyRecord): TileMap;
  enemyDefs: EnemyDef[];
  bowPositions: number[];
  superPositions: number[];
  catPosition: number;
  clouds: Array<[number, number]>;
}
```

Then annotate: `export const LEVELS: Level[] = [ ... ]`.

Keep `generate` as a method using `this.width` / `this.height`, exactly as the original does. TypeScript infers `this` correctly inside an object literal typed as `Level`.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/levels.test.ts`
Expected: PASS — 6 metadata tests, 24 geometry tests (6 levels × 4 difficulties), 1 purity test, 3 builder tests.

If a geometry test fails, the difference is real. Print the first mismatching row to find it:

```bash
cd next && npx vitest run tests/levels.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add next/src/data/levels.ts next/tests/levels.test.ts
git commit -m "feat: port the level data and generators

Levels are generated, not static: addGaps scales gap width by the active
difficulty, so geometry differs per difficulty. All 6 levels are checked
against the live game across all 4 difficulties, plus a test that generate()
hands back a fresh map rather than a shared one."
```

---

## Task 9: Port the parallax table

**Files:**
- Create: `next/src/data/parallax.ts`
- Test: `next/tests/parallax.test.ts`

Data only. The drawing code (sky gradient, quadratic-curve hill ridges) belongs to Plan 2.

- [ ] **Step 1: Write the failing test**

Create `next/tests/parallax.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { LEVELS } from '../src/data/levels';
import { PARALLAX } from '../src/data/parallax';

const legacy = loadLegacySection({
  from: '//  PARALLAX BACKGROUNDS',
  to: '//  SILLY POWER-UPS',
  expose: ['PARALLAX'],
});

describe('parallax table matches the live game', () => {
  it('is identical', () => {
    expect(PARALLAX).toEqual(legacy.PARALLAX);
  });

  it('covers every level', () => {
    LEVELS.forEach((_, i) => {
      expect(PARALLAX[i], `level ${i} has no parallax entry`).toBeDefined();
      expect(PARALLAX[i].layers.length).toBeGreaterThan(0);
      expect(PARALLAX[i].bg2).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('orders layers back to front by scroll speed', () => {
    for (const { layers } of Object.values(PARALLAX)) {
      for (let i = 1; i < layers.length; i++) {
        expect(layers[i].speed).toBeGreaterThanOrEqual(layers[i - 1].speed);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/parallax.test.ts`
Expected: FAIL — `Cannot find module '../src/data/parallax'`.

- [ ] **Step 3: Write the module**

Create `next/src/data/parallax.ts`. Copy the `PARALLAX` literal from `index.html` lines 1012–1043 (the `PARALLAX BACKGROUNDS` section) and type it:

```ts
export interface ParallaxLayer {
  /** Top of the layer, as a fraction of view height. */
  y: number;
  /** Layer height, as a fraction of view height. */
  h: number;
  color: string;
  /** Fraction of camera.x this layer scrolls by. Smaller is further away. */
  speed: number;
  /** Ridge heights sampled across the layer's width, as fractions of view height. */
  hills: number[];
}

export interface ParallaxConfig {
  /** Bottom stop of the sky gradient. The top stop is the level's own `bg`. */
  bg2: string;
  /** Back to front. */
  layers: ParallaxLayer[];
}

/** Keyed by level index. Note the shape: an object with `bg2` and `layers`, not a
 *  bare array — drawParallax reads `pd.bg2 || lvl.bg` for the gradient's far stop. */
export const PARALLAX: Record<number, ParallaxConfig> = {
  // <<< paste index.html:1012-1043 here, the object literal body only >>>
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/parallax.test.ts`
Expected: PASS, 3 tests.

If the back-to-front ordering test fails, **delete that test** rather than reordering the data — the port must stay faithful, and layer order is the live game's business. Note it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add next/src/data/parallax.ts next/tests/parallax.test.ts
git commit -m "feat: port the parallax background table

Data only; the sky gradient and hill ridges are drawing code and come in
Plan 2. Includes a check that every level has layers, so a level added
later cannot silently render against a blank sky."
```

---

## Task 10: Port the BGM theme data

**Files:**
- Create: `next/src/data/bgmThemes.ts`
- Test: `next/tests/bgmThemes.test.ts`

Ten themes: six level themes at indices 0–5, then title, win, game over and intro. Melody, bass and harmony are step arrays read modulo their own length, so they loop at different periods — that is what makes the music feel less repetitive, and it must be preserved.

- [ ] **Step 1: Write the failing test**

Create `next/tests/bgmThemes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadLegacySection } from './helpers/legacy';
import { LEVELS } from '../src/data/levels';
import {
  BGM_THEMES, BGM_TITLE, BGM_WIN, BGM_GAMEOVER, BGM_INTRO,
} from '../src/data/bgmThemes';

const legacy = loadLegacySection({
  from: '//  BACKGROUND MUSIC',
  to: '//  CONSTANTS & HELPERS',
  prelude: 'let audioCtx = null; function ensureAudio(){}',
  expose: ['BGM_THEMES', 'BGM_TITLE', 'BGM_WIN', 'BGM_GAMEOVER', 'BGM_INTRO'],
});

describe('BGM themes match the live game', () => {
  it('has the same number of themes', () => {
    expect(BGM_THEMES.length).toBe(legacy.BGM_THEMES.length);
  });

  BGM_THEMES.forEach((_, i) => {
    it(`theme ${i} is identical`, () => {
      expect(BGM_THEMES[i]).toEqual(legacy.BGM_THEMES[i]);
    });
  });

  it('has the same named indices', () => {
    expect(BGM_TITLE).toBe(legacy.BGM_TITLE);
    expect(BGM_WIN).toBe(legacy.BGM_WIN);
    expect(BGM_GAMEOVER).toBe(legacy.BGM_GAMEOVER);
    expect(BGM_INTRO).toBe(legacy.BGM_INTRO);
  });

  it('gives every level a theme', () => {
    LEVELS.forEach((_, i) => {
      expect(BGM_THEMES[i], `level ${i} has no theme`).toBeDefined();
    });
  });

  it('gives every theme a usable tempo and at least one note', () => {
    for (const theme of BGM_THEMES) {
      expect(theme.bpm).toBeGreaterThan(0);
      expect(theme.notes.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/bgmThemes.test.ts`
Expected: FAIL — `Cannot find module '../src/data/bgmThemes'`.

- [ ] **Step 3: Write the module**

Create `next/src/data/bgmThemes.ts`. Copy the `BGM_THEMES` literal from `index.html:323-426` and the four index constants from line 427. Type it:

```ts
export type OscillatorKind = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface BgmTheme {
  bpm: number;
  wave: OscillatorKind;
  vol: number;
  bass: OscillatorKind;
  bassVol: number;
  harm: OscillatorKind;
  harmVol: number;
  /** Frequencies in Hz. 0 is a rest. Read modulo length, so parts loop independently. */
  notes: number[];
  bassN: number[];
  harmN: number[];
  /** 0 silent, 1 kick, 2 hi-hat. */
  perc: number[];
}

export const BGM_THEMES: BgmTheme[] = [
  // <<< paste index.html:323-426 here, the array body only >>>
];

// Level themes occupy 0..5; these follow.
export const BGM_TITLE = 6;
export const BGM_WIN = 7;
export const BGM_GAMEOVER = 8;
export const BGM_INTRO = 9;
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/bgmThemes.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/data/bgmThemes.ts next/tests/bgmThemes.test.ts
git commit -m "feat: port the BGM theme data

All ten themes compared against the live game. Parts are read modulo their
own length, so melody, bass, harmony and percussion loop at different
periods — that is deliberate and the types keep it visible."
```

---

## Task 11: Port the synth core

**Files:**
- Create: `next/src/audio/context.ts`
- Create: `next/src/audio/synth.ts`
- Create: `next/tests/helpers/fakeAudio.ts`
- Test: `next/tests/synth.test.ts`

The live game's audio is pure Web Audio synthesis — no sample files. Phaser's sound manager plays samples and has nothing to offer here, so this logic moves across unchanged. The only structural change is that the `AudioContext` becomes injectable, so it can be tested.

- [ ] **Step 1: Write the recording double**

Create `next/tests/helpers/fakeAudio.ts`:

```ts
// A recording stand-in for AudioContext. It models the shape the synth uses and
// nothing else: what was created, what it was connected to, and every scheduled
// parameter change with its timestamp.

export interface RampCall {
  param: string;
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime';
  value: number;
  time: number;
}

export class FakeParam {
  value = 0;
  calls: RampCall[] = [];

  constructor(private readonly name: string, private readonly log: RampCall[]) {}

  private record(method: RampCall['method'], value: number, time: number): this {
    const call: RampCall = { param: this.name, method, value, time };
    this.calls.push(call);
    this.log.push(call);
    return this;
  }

  setValueAtTime(value: number, time: number): this {
    return this.record('setValueAtTime', value, time);
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.record('linearRampToValueAtTime', value, time);
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    return this.record('exponentialRampToValueAtTime', value, time);
  }
}

export class FakeOscillator {
  type = 'sine';
  frequency: FakeParam;
  started: number | null = null;
  stopped: number | null = null;
  connectedTo: unknown[] = [];

  constructor(log: RampCall[]) {
    this.frequency = new FakeParam('frequency', log);
  }

  connect(target: unknown): unknown { this.connectedTo.push(target); return target; }
  start(at = 0): void { this.started = at; }
  stop(at = 0): void { this.stopped = at; }
}

export class FakeGain {
  gain: FakeParam;
  connectedTo: unknown[] = [];

  constructor(log: RampCall[]) {
    this.gain = new FakeParam('gain', log);
  }

  connect(target: unknown): unknown { this.connectedTo.push(target); return target; }
}

export class FakeAudioContext {
  currentTime = 0;
  destination = { kind: 'destination' as const };
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  /** Every scheduled parameter change across every node, in call order. */
  schedule: RampCall[] = [];

  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator(this.schedule);
    this.oscillators.push(osc);
    return osc;
  }

  createGain(): FakeGain {
    const gain = new FakeGain(this.schedule);
    this.gains.push(gain);
    return gain;
  }

  /** Advance the audio clock, the way time passing would. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `next/tests/synth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext, getAudioContext } from '../src/audio/context';
import { playTone } from '../src/audio/synth';

let fake: FakeAudioContext;

beforeEach(() => {
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

describe('playTone', () => {
  it('creates one oscillator and one gain, wired to the destination', () => {
    playTone(440, 0.2, 'square', 0.1);
    expect(fake.oscillators.length).toBe(1);
    expect(fake.gains.length).toBe(1);
    expect(fake.oscillators[0].connectedTo).toContain(fake.gains[0]);
    expect(fake.gains[0].connectedTo).toContain(fake.destination);
  });

  it('uses the requested waveform and frequency', () => {
    playTone(660, 0.2, 'sawtooth', 0.1);
    expect(fake.oscillators[0].type).toBe('sawtooth');
    expect(fake.oscillators[0].frequency.calls[0].value).toBe(660);
  });

  it('starts now and stops after the requested duration', () => {
    fake.currentTime = 5;
    playTone(440, 0.25, 'square', 0.1);
    expect(fake.oscillators[0].started).toBe(5);
    expect(fake.oscillators[0].stopped).toBeCloseTo(5.25, 5);
  });

  // The envelope exists to stop clicks: gain ramps up from 0 and back down to 0,
  // never jumping. A tone that starts at full volume pops audibly.
  it('ramps the gain up from zero and back to zero', () => {
    playTone(440, 0.2, 'square', 0.1);
    const gain = fake.gains[0].gain.calls;
    expect(gain.length).toBeGreaterThanOrEqual(3);
    expect(gain[0].value).toBe(0);
    expect(gain[gain.length - 1].value).toBe(0);
    expect(Math.max(...gain.map((c) => c.value))).toBeCloseTo(0.1, 5);
  });

  it('slides the frequency when a slide target is given', () => {
    playTone(300, 0.15, 'square', 0.12, 600);
    const freq = fake.oscillators[0].frequency.calls;
    expect(freq.some((c) => c.method === 'linearRampToValueAtTime' && c.value === 600)).toBe(true);
  });

  it('does nothing and does not throw when there is no audio context', () => {
    setAudioContext(null);
    expect(() => playTone(440, 0.2, 'square', 0.1)).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/synth.test.ts`
Expected: FAIL — `Cannot find module '../src/audio/context'`.

- [ ] **Step 4: Write the context module**

Create `next/src/audio/context.ts`:

```ts
// The AudioContext is a module-level singleton, created on the first user gesture —
// browsers refuse to start one before that. It is settable so tests can inject a
// recording double, and nullable so every caller degrades to silence rather than
// throwing when audio is unavailable.
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  return ctx;
}

export function setAudioContext(next: AudioContext | null): void {
  ctx = next;
}

/** Call from a user-gesture handler. Returns null if the browser has no AudioContext. */
export function ensureAudio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}
```

- [ ] **Step 5: Write the synth module**

Create `next/src/audio/synth.ts`. Port `playTone` from `index.html:299-308`, `playBGMNote` from `:429-439` and `playPercNote` from `:440-456`, keeping the envelope shapes exactly:

```ts
import type { OscillatorKind } from '../data/bgmThemes';
import { getAudioContext } from './context';

/**
 * One oscillator straight to the destination, with a three-segment gain envelope.
 * The envelope is not decoration: starting at full gain produces an audible click.
 * Every call is wrapped so a failing audio stack degrades to silence.
 *
 * @param slideTo optional frequency to ramp towards across the note
 */
export function playTone(
  freq: number,
  dur: number,
  type: OscillatorKind,
  vol: number,
  slideTo?: number,
): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // <<< port index.html:300-307 verbatim, using `ctx`, `freq`, `dur`,
    //     `type`, `vol` and `slideTo` in place of the original f/d/t/v/sl >>>
  } catch {
    // Audio is never worth breaking a frame over.
  }
}

/** Melody/bass/harmony note, scheduled at an absolute AudioContext time. */
export function playBGMNote(
  type: OscillatorKind,
  freq: number,
  at: number,
  dur: number,
  vol: number,
): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // <<< port index.html:430-438 verbatim >>>
  } catch {
    // ignore
  }
}

/** Percussion. 1 is a kick (sine, 120Hz dropping to 40), 2 a hi-hat (detuned squares). */
export function playPercNote(type: number, at: number, vol: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // <<< port index.html:441-455 verbatim >>>
  } catch {
    // ignore
  }
}
```

While porting `playPercNote`, drop the `g2.gain=g;` assignment at the **start of line 453** — keep the rest of that line, which does the real wiring (`o.connect(g); o2.connect(g); g.connect(destination)`). The assignment writes over a read-only `AudioParam`, so it is a no-op; the hi-hat's second oscillator already reaches `g` through `o2.connect(g)`. Dropping it changes nothing audible.

- [ ] **Step 6: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/synth.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add next/src/audio/ next/tests/synth.test.ts next/tests/helpers/fakeAudio.ts
git commit -m "feat: port the synth core

Web Audio synthesis, moved across unchanged — Phaser's sound manager plays
samples and has nothing to offer a synth. The AudioContext becomes
injectable so the envelopes can be asserted against a recording double;
they exist to stop clicks, so 'ramps from zero' is the thing worth testing.

Drops the dead g2.gain assignment from playPercNote: it wrote over a
read-only AudioParam on a node that was never connected."
```

---

## Task 12: Port the sound effects

**Files:**
- Create: `next/src/audio/sfx.ts`
- Test: `next/tests/sfx.test.ts`

Eleven one-line effects. Multi-note ones chain with `setTimeout`, which is fine for one-shots — only the music needs sample-accurate scheduling.

- [ ] **Step 1: Write the failing test**

Create `next/tests/sfx.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext } from '../src/audio/context';
import * as sfx from '../src/audio/sfx';

let fake: FakeAudioContext;

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

afterEach(() => {
  vi.useRealTimers();
});

const NAMES = [
  'sfxJump', 'sfxStomp', 'sfxCoin', 'sfxHurt', 'sfxBlock', 'sfxShoot',
  'sfxPickup', 'sfxFart', 'sfxBoing', 'sfxCluck', 'sfxWin',
] as const;

describe('sound effects', () => {
  it('exports all eleven', () => {
    for (const name of NAMES) {
      expect(typeof sfx[name], name).toBe('function');
    }
  });

  for (const name of NAMES) {
    it(`${name} makes a sound`, () => {
      sfx[name]();
      vi.runAllTimers();
      expect(fake.oscillators.length, `${name} produced no oscillator`).toBeGreaterThan(0);
    });
  }

  it('chains multi-note effects over time rather than all at once', () => {
    sfx.sfxCoin();
    const immediate = fake.oscillators.length;
    vi.runAllTimers();
    expect(fake.oscillators.length).toBeGreaterThan(immediate);
  });

  it('stays silent without an audio context', () => {
    setAudioContext(null);
    for (const name of NAMES) {
      expect(() => { sfx[name](); }, name).not.toThrow();
    }
    vi.runAllTimers();
    expect(fake.oscillators.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/sfx.test.ts`
Expected: FAIL — `Cannot find module '../src/audio/sfx'`.

- [ ] **Step 3: Write the module**

Create `next/src/audio/sfx.ts`. Port the eleven functions from `index.html:309-316`, one export each:

```ts
import { playTone } from './synth';

// One-shots. setTimeout is the right tool here — only the music needs scheduling
// against the audio clock, and a few milliseconds of jitter on a coin is inaudible.

export function sfxJump(): void {
  playTone(300, 0.15, 'square', 0.12, 600);
}

export function sfxStomp(): void {
  playTone(200, 0.1, 'square', 0.15);
  setTimeout(() => playTone(400, 0.15, 'square', 0.12), 50);
}

// <<< port the remaining nine from index.html:310-316, same shape >>>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/sfx.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/audio/sfx.ts next/tests/sfx.test.ts
git commit -m "feat: port the eleven sound effects

Each one is checked to actually produce an oscillator, including after its
chained setTimeout fires, and the whole set is checked to stay silent
rather than throw when there is no audio context."
```

---

## Task 13: Port the BGM scheduler

**Files:**
- Create: `next/src/audio/bgm.ts`
- Test: `next/tests/bgm.test.ts`

The most intricate piece of audio in the game, and the best-written. It is a **lookahead scheduler**: it schedules every note against absolute `AudioContext` time in a 400ms window, re-arming every 120ms via `setTimeout`. `setTimeout` never places a note — it only wakes the scheduler. A stale-timer guard stops two themes overlapping when the level changes mid-window.

- [ ] **Step 1: Write the failing test**

Create `next/tests/bgm.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext } from '../src/audio/context';
import { startBGM, stopBGM, getCurrentTheme } from '../src/audio/bgm';
import { BGM_TITLE } from '../src/data/bgmThemes';

let fake: FakeAudioContext;

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
});

afterEach(() => {
  stopBGM();
  vi.useRealTimers();
});

describe('BGM scheduler', () => {
  it('schedules notes ahead of the clock, not on it', () => {
    startBGM(0);
    expect(fake.oscillators.length).toBeGreaterThan(0);
    // Every note is placed in the future — that is the point of a lookahead scheduler.
    for (const osc of fake.oscillators) {
      expect(osc.started).not.toBeNull();
      expect(osc.started!).toBeGreaterThanOrEqual(fake.currentTime);
    }
  });

  it('schedules a bounded window rather than the whole song', () => {
    startBGM(0);
    const horizon = Math.max(...fake.oscillators.map((o) => o.started ?? 0));
    expect(horizon).toBeLessThan(fake.currentTime + 1);
  });

  it('schedules more notes as the clock advances', () => {
    startBGM(0);
    const first = fake.oscillators.length;
    fake.advance(0.5);
    vi.advanceTimersByTime(200);
    expect(fake.oscillators.length).toBeGreaterThan(first);
  });

  it('reports which theme is playing', () => {
    startBGM(BGM_TITLE);
    expect(getCurrentTheme()).toBe(BGM_TITLE);
  });

  it('stops scheduling after stopBGM', () => {
    startBGM(0);
    stopBGM();
    const atStop = fake.oscillators.length;
    fake.advance(1);
    vi.advanceTimersByTime(1000);
    expect(fake.oscillators.length).toBe(atStop);
    expect(getCurrentTheme()).toBe(-1);
  });

  // Switching level mid-window must not leave the previous theme's timer alive and
  // scheduling notes underneath the new one. Exactly one scheduler is ever pending.
  it('does not leave the old theme scheduling when switched', () => {
    startBGM(0);
    expect(vi.getTimerCount()).toBe(1);
    startBGM(1);
    expect(getCurrentTheme()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does nothing without an audio context', () => {
    setAudioContext(null);
    expect(() => startBGM(0)).not.toThrow();
    vi.advanceTimersByTime(500);
    expect(fake.oscillators.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd next && npx vitest run tests/bgm.test.ts`
Expected: FAIL — `Cannot find module '../src/audio/bgm'`.

- [ ] **Step 3: Write the module**

Create `next/src/audio/bgm.ts`. Port `startBGM` from `index.html:457-495` and `stopBGM` from `:496`:

```ts
import { BGM_THEMES } from '../data/bgmThemes';
import { getAudioContext } from './context';
import { playBGMNote, playPercNote } from './synth';

/** How far ahead of the clock notes are placed. */
const LOOKAHEAD_S = 0.4;
/** How often the scheduler wakes to top the window up. */
const TICK_MS = 120;

let currentTheme = -1;
let noteIndex = 0;
let nextNoteTime = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function getCurrentTheme(): number {
  return currentTheme;
}

export function startBGM(themeIndex: number): void {
  stopBGM();
  const ctx = getAudioContext();
  const theme = BGM_THEMES[themeIndex];
  if (!ctx || !theme) return;

  currentTheme = themeIndex;
  noteIndex = 0;
  nextNoteTime = ctx.currentTime + 0.1;

  // <<< port the scheduleNotes() body from index.html:465-494 here, keeping:
  //   - the `while (nextNoteTime < ctx.currentTime + LOOKAHEAD_S)` loop
  //   - melody, bass (dur x1.1), harmony (dur x0.7) and percussion, each read
  //     with `i % arr.length` so the parts loop at different periods
  //   - `nextNoteTime += 60 / theme.bpm` and `noteIndex++` per step
  //   - the stale guard: bail out if currentTheme !== themeIndex
  //   - re-arm with `timer = setTimeout(scheduleNotes, TICK_MS)`
  // >>>
}

export function stopBGM(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  currentTheme = -1;
}
```

The stale guard is the important part. Without it, calling `startBGM` for a new level leaves the old theme's timer alive and both play at once.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd next && npx vitest run tests/bgm.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite**

Run: `cd next && npm test`
Expected: every test file passes. This is the first point where the whole foundation is green together.

- [ ] **Step 6: Commit**

```bash
git add next/src/audio/bgm.ts next/tests/bgm.test.ts
git commit -m "feat: port the BGM scheduler

A lookahead scheduler, not a setTimeout-per-note loop: notes are placed
against absolute AudioContext time in a 400ms window and setTimeout only
wakes the scheduler to top it up. Tests assert the window stays bounded,
that it keeps filling as the clock advances, and that switching theme
mid-window does not leave both playing — which is what the stale guard is
for."
```

---

## Task 14: Boot and play

**Files:**
- Create: `next/src/scenes/BootScene.ts`
- Modify: `next/src/main.ts`

The demonstrable end of Plan 1: `/next/` boots Phaser, shows that it is alive, and starts the title theme on first input. Nothing is rendered from game data yet — that is Plan 2.

- [ ] **Step 1: Write the scene**

Create `next/src/scenes/BootScene.ts`:

```ts
import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config/constants';
import { ensureAudio } from '../audio/context';
import { startBGM } from '../audio/bgm';
import { BGM_TITLE } from '../data/bgmThemes';
import { LEVELS } from '../data/levels';
import { TStr } from '../config/i18n';

export class BootScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(BASE_W / 2, BASE_H / 2 - 24, 'GIGI & DODO', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffdd00',
      })
      .setOrigin(0.5);

    // Proof the ported data is reachable from the running game, not just from tests.
    this.add
      .text(BASE_W / 2, BASE_H / 2 + 8, `${LEVELS.length} levels loaded`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#88ccff',
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_W / 2, BASE_H / 2 + 34, TStr('press_start'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Browsers refuse to start an AudioContext before a user gesture, so the music
    // waits for the first key or tap rather than starting on load.
    this.input.keyboard?.on('keydown', () => this.begin());
    this.input.on('pointerdown', () => this.begin());
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    ensureAudio();
    startBGM(BGM_TITLE);
  }
}
```

If `press_start` is not a real key in `TRANSLATIONS`, `TStr` returns the key itself and the screen still works — check `index.html:169-271` for the actual key name and use it.

- [ ] **Step 2: Register the scene**

Replace `next/src/main.ts` with:

```ts
import Phaser from 'phaser';
import { BASE_W, BASE_H } from './config/constants';
import { BootScene } from './scenes/BootScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});
```

- [ ] **Step 3: Verify the build**

Run: `cd next && npm run build`
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 4: Verify in a browser**

Run: `cd next && npm run dev`, open the printed URL.

Expected, and check each:
1. "GIGI & DODO" in yellow, centred.
2. "6 levels loaded" underneath — this is the ported level data being read by the running game.
3. A prompt line below that.
4. Press any key: the title theme plays.
5. **No errors in the browser console.**

Stop the server with Ctrl-C.

- [ ] **Step 5: Confirm the live game is still untouched**

Run:
```bash
git status --short && git diff --stat HEAD -- index.html
```
Expected: no changes to `index.html` at all.

- [ ] **Step 6: Run the whole suite one more time**

Run: `cd next && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add next/src/scenes/BootScene.ts next/src/main.ts
git commit -m "feat: boot the Phaser build and play the title theme

The end of the foundation: /next/ boots, reads the ported level data at
runtime rather than only in tests, and starts the music on first input —
browsers will not open an AudioContext before a gesture. Nothing is drawn
from game data yet; that is Plan 2."
```

---

## Done when

- [ ] `cd next && npm test` is green.
- [ ] `cd next && npm run build` succeeds with no TypeScript errors.
- [ ] `https://srumjant.github.io/gi-do/` still plays the current game, unchanged.
- [ ] `https://srumjant.github.io/gi-do/next/` shows the boot screen and plays music.
- [ ] `git log --oneline -- index.html` shows no new commits from this plan.
- [ ] Every ported module has a test asserting equality against the live game.

## What Plan 2 picks up

The texture pipeline: rasterise `SpriteData` + `Palette` into canvases, register them with `textures.addCanvas`, bake the felt bevel variant at boot, and move the palette transform, grain and shadow into a Phaser 4 Filter. Then the tilemap and the parallax drawing. It will need a `SpriteData → HTMLCanvasElement` function as its first interface, which is why it is not written yet.
