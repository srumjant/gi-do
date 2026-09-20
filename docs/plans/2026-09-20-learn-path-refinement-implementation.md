# Learn Path Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gigi & Dodo learn mode smooth and fun for a pre-reader by moving the difficulty from precision platforming into letter knowledge, and fix the game-wide controller dead ends found alongside it.

**Architecture:** Everything lives in the single `index.html` file — no build step, no dependencies, no package manager. Changes are surgical edits to existing inline functions plus a handful of new ones inserted beside their neighbours. A new `?test=1` self-test harness provides real assertions for the pure logic (physics, zone maths, pad detection) by calling the same functions the game uses, so tests cannot drift from implementation.

**Tech Stack:** Vanilla JS, Canvas 2D, Web Audio (existing), Web Speech API (`speechSynthesis`, new), Gamepad API (existing, extended with `vibrationActuator`).

**Spec:** `docs/plans/2026-09-20-learn-path-refinement.md`

---

## A note on testing in this repo

This project has **no test runner, no build step and no dependencies** — that is a deliberate property the README calls out, and adding Jest or a bundler would cost more than it returns for a game two children play.

So the plan splits verification two ways, and neither is ceremony:

1. **Pure logic is genuinely test-driven** through a self-test harness that runs
   two ways: in the browser at `index.html?test=1`, and headlessly via
   `node scripts/run-tests.js`. The node runner evaluates the game's own inline
   `<script>` in a VM with a small DOM shim, so the tests call the *same*
   functions the game runs — `learnVertStep`, `zoneAt`, `detectPadKind`. Nothing
   is copied or reimplemented, so the tests cannot drift. It exits non-zero on
   failure, which makes it the verification command for every task.

   This adds one dev-only file in `scripts/`. The game itself stays a single
   HTML file with no build step and no dependencies — `scripts/run-tests.js`
   uses only node builtins and is never loaded by the game.

   The shim deliberately omits `speechSynthesis`. That is not laziness: it means
   every test run also proves the game loads and plays on a device with no
   voices installed, which is the likely state of the kids' iPad.
2. **Feel, visuals and audio are verified by scripted manual playtest**, with
   exact expected observations. There is no honest way to unit-test "does the
   jump feel good".

Every task states which kind of verification applies. Do not skip the manual
steps — the highest-risk item in this whole plan (the jump-cut trap) is caught
by test, but the second-highest (whether a 4-year-old understands the arches)
is only catchable by watching one use it.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` | The entire game | Modified throughout |
| `scripts/run-tests.js` | Headless runner for the in-file self-tests | Created in Task 1 |
| `docs/plans/2026-09-20-learn-path-refinement.md` | Design spec | Reference only |

`index.html` is ~3000 lines and organised in clearly commented sections
(`UPDATE`, `DRAW`, `LEARN MODE`, `GAMEPAD SUPPORT`). New code goes into the
section it belongs to. The file is large, but splitting it would break the
single-file property the project depends on, so we follow the existing pattern.

**Build order rationale:** Tasks 1–5 are game-wide infrastructure (tests, back
navigation, controller). They ship value immediately, and they make Tasks 6–10
testable — without Task 2 you must reload the page every time you want to leave
learn mode, and without Task 4 the on-screen prompts lie about your DualSense.

---

### Task 1: Self-test harness and shared physics step

Extracts the vertical integration step out of `updateLearn` so tests and game
share one implementation, then asserts the measured jump heights the whole gate
design depends on.

**Files:**
- Modify: `index.html` — add constants near `LEARN_WORDS` (~line 2148); extract step function; append harness before `gameLoop` (~line 2767)

- [ ] **Step 1: Add the tuning constants**

Immediately after the `LEARN_WORDS` declaration (~line 2148), add:

```js
// Tower tuning. GATE_GAP must sit strictly between a normal jump's rise and a
// rocket's rise — the self-tests below assert exactly that.
// GATES_PER_TOWER, GATE_RISE and GATE_GAP are consumed by the tower builder,
// and LEARN_ROCKET by the correct-answer launch. Until those land, the
// self-tests are their only reader — they are scaffolding, not dead code.
const GATES_PER_TOWER=4;
const STEP_RISE=45;      // vertical gap between stepping platforms
const GATE_RISE=50;      // last step up to the gate floor
const GATE_GAP=132;      // gate floor up to the landing floor above it
const LEARN_JUMP=-9.0;   // normal jump impulse
const LEARN_ROCKET=-11.0;// correct-answer launch impulse
```

- [ ] **Step 2: Write the failing tests**

Insert immediately before `function gameLoop()` (~line 2767):

```js
// ==========================================
//  SELF TESTS — open index.html?test=1
// ==========================================
// `var`, not `const`: top-level const/let in a vm script never attach to the
// context object, so scripts/run-tests.js could not read the results.
var TEST_RESULTS={pass:0,fail:0};
function tAssert(name,cond,detail){
  if(cond){TEST_RESULTS.pass++;console.log('[TEST] PASS  '+name);}
  else{TEST_RESULTS.fail++;console.error('[TEST] FAIL  '+name+(detail?'  — '+detail:''));}
}
function tNear(name,actual,expected,tol){
  tAssert(name,Math.abs(actual-expected)<=tol,'expected '+expected+' ±'+tol+', got '+actual.toFixed(2));
}

// Replays the real integrator to find how high an impulse carries the player.
function simulateRise(impulse,holdJump,startRocketing){
  let vy=impulse,y=0,maxRise=0,rocketing=startRocketing;
  for(let f=0;f<1000;f++){
    vy=learnVertStep(vy,holdJump,rocketing,false);
    if(rocketSpent(vy,rocketing))rocketing=false;
    y+=vy;
    if(y<maxRise)maxRise=y;
    if(y>0&&f>2)break;
  }
  return -maxRise;
}

function testPhysics(){
  const normalHeld=simulateRise(LEARN_JUMP,true,false);
  const rocketHeld=simulateRise(LEARN_ROCKET,true,true);
  const rocketTap=simulateRise(LEARN_ROCKET,false,true);
  tNear('normal jump, held',            normalHeld,                          106.3,1);
  tNear('normal jump, tapped',          simulateRise(LEARN_JUMP,false,false),  19.1,1);
  tNear('rocket, held',                 rocketHeld,                          158.4,1);
  tNear('rocket, tapped + exemption',   rocketTap,                           158.4,1);
  tNear('rocket, tapped, NO exemption', simulateRise(LEARN_ROCKET,false,false),19.1,1);
  // Invariants that must hold even if the physics is retuned later:
  tAssert('gate cannot be skipped by a normal jump', normalHeld<GATE_GAP,
          normalHeld.toFixed(1)+' >= '+GATE_GAP);
  tAssert('rocket clears the gate even when tapped', rocketTap>GATE_GAP,
          rocketTap.toFixed(1)+' <= '+GATE_GAP);
  tAssert('rocket cannot overshoot onto the next step', rocketHeld<GATE_GAP+STEP_RISE,
          rocketHeld.toFixed(1)+' >= '+(GATE_GAP+STEP_RISE));
}

function runSelfTests(){
  TEST_RESULTS.pass=0;TEST_RESULTS.fail=0;
  console.log('[TEST] ===== start =====');
  testPhysics();
  console.log('[TEST] ===== '+TEST_RESULTS.pass+' passed, '+TEST_RESULTS.fail+' failed =====');
}
if(location.search.indexOf('test=1')>=0)window.addEventListener('load',runSelfTests);
```

- [ ] **Step 3: Create the headless test runner**

Create `scripts/run-tests.js`. This has been verified to load the current
`index.html` cleanly, so if it reports a load failure, the fault is in your
edit, not the shim:

```js
#!/usr/bin/env node
// Runs the game's in-file self-tests headlessly.
//
// index.html is a single file with one inline <script>. We evaluate that exact
// script in a VM with a minimal DOM shim, then call runSelfTests(). Because it
// loads the real file, the tests exercise the real functions — nothing is
// copied or reimplemented here, so the tests cannot drift from the game.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('No <script> block found in ' + htmlPath); process.exit(2); }
const source = m[1];

// --- minimal DOM shim -------------------------------------------------------
const noop = () => {};
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient')
        return () => ({ addColorStop: noop });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p in t) return t[p];
      return noop;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeEl(id) {
  return {
    id, width: 640, height: 400, textContent: '', title: '',
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop,
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
    appendChild: noop, focus: noop, click: noop
  };
}
const elements = {};
const documentShim = {
  getElementById: (id) => (elements[id] || (elements[id] = makeEl(id))),
  querySelector: () => null, querySelectorAll: () => [],
  createElement: (t) => makeEl(t),
  addEventListener: noop, removeEventListener: noop,
  documentElement: makeEl('html'), body: makeEl('body'),
  fullscreenElement: null, webkitFullscreenElement: null,
  exitFullscreen: () => Promise.resolve()
};

function FakeAudioParam() { return { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop }; }
function FakeAudioNode() {
  return { connect: noop, disconnect: noop, start: noop, stop: noop,
           frequency: FakeAudioParam(), gain: FakeAudioParam(),
           type: 'sine', buffer: null, loop: false };
}
function FakeAudioContext() {
  return { currentTime: 0, destination: {}, state: 'running', sampleRate: 44100,
           resume: () => Promise.resolve(), close: () => Promise.resolve(),
           createOscillator: FakeAudioNode, createGain: FakeAudioNode,
           createBiquadFilter: FakeAudioNode, createBufferSource: FakeAudioNode,
           createBuffer: () => ({ getChannelData: () => new Float32Array(8) }) };
}

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map,
  Float32Array, Uint8ClampedArray, Promise, RegExp, Error, isNaN, parseInt, parseFloat,
  document: documentShim,
  location: { search: '?test=1', href: 'file://' + htmlPath, hash: '' },
  navigator: { getGamepads: () => [], userAgent: 'node', vibrate: noop },
  screen: { orientation: { lock: () => Promise.resolve(), unlock: noop } },
  AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext,
  // Speech synthesis is absent by design: every run therefore also proves the
  // game works on a device with no voices installed.
  requestAnimationFrame: noop, cancelAnimationFrame: noop,
  setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
  addEventListener: noop, removeEventListener: noop,
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// --- run --------------------------------------------------------------------
const context = vm.createContext(sandbox);
try {
  vm.runInContext(source, context, { filename: 'index.html', timeout: 20000 });
} catch (e) {
  console.error('Script failed to load: ' + (e && e.stack || e));
  process.exit(2);
}

if (typeof context.runSelfTests !== 'function') {
  console.error('Loaded OK, but runSelfTests() is not defined.');
  process.exit(3);
}
try {
  context.runSelfTests();
} catch (e) {
  // A ReferenceError here means a test called a function that does not exist
  // yet — the expected state midway through TDD. Report it cleanly instead of
  // letting node dump its own stack trace and pick its own exit code.
  console.error('Tests threw: ' + (e && e.message || e));
  process.exit(2);
}

const r = context.TEST_RESULTS;
if (!r) {
  // Top-level `const`/`let` in a vm script never attach to the context object;
  // only `var` and function declarations do. Without this check a `const`
  // TEST_RESULTS reads back as undefined and every run looks like a failure,
  // however many assertions passed.
  console.error('TEST_RESULTS is not visible on the context — declare it with `var`, not `const`.');
  process.exit(3);
}
process.exit(r.fail > 0 ? 1 : 0);
```

- [ ] **Step 4: Run to verify the tests fail**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected: `Tests threw: learnVertStep is not defined` and `exit=2`.

- [ ] **Step 5: Extract the shared vertical step**

In `updateLearn`, replace these lines:

```js
  if(!jk&&L.pvy<-3.6)L.pvy=-3.6;

  // Gravity with apex hang — floatier for kids
  const apex=Math.abs(L.pvy)<2.0&&!L.pOnGround;
  const gm=L.pvy>0?1.1:(apex?0.5:1.0);
  L.pvy+=0.38*gm;if(L.pvy>7)L.pvy=7;
```

with:

```js
  L.pvy=learnVertStep(L.pvy,jk,L.rocketing,L.pOnGround);
  if(rocketSpent(L.pvy,L.rocketing))L.rocketing=false;
```

Then add, immediately above `function updateLearn()`:

```js
// One frame of vertical motion for the learn-mode player. Shared with the
// self-tests so the asserted jump heights describe real behaviour.
// `rocketing` suppresses the variable-height jump-cut: without it a child who
// taps rather than holds jump rises 19px instead of 158px and is trapped below
// a gate they answered correctly.
// When a rocket launch stops being exempt from the jump-cut: at the apex.
// Shared with the self-tests for the same reason learnVertStep is — if the
// game and the harness disagreed about when the exemption ends, the asserted
// rocket heights would stop describing what the player actually gets.
function rocketSpent(vy,rocketing){return rocketing&&vy>=0;}

function learnVertStep(vy,holdJump,rocketing,onGround){
  if(!holdJump&&!rocketing&&vy<-3.6)vy=-3.6;
  const apex=Math.abs(vy)<2.0&&!onGround;
  const gm=vy>0?1.1:(apex?0.5:1.0);
  vy+=0.38*gm;
  return vy>7?7:vy;
}
```

Also add `rocketing:false,` to the `learn` object literal (~line 2149), after
`pOnGround:false,`.

Finally, replace the hardcoded jump impulse in `updateLearn`:

```js
  if((L.pOnGround||L.pCoyote>0)&&L.pJumpBuf>0){L.pvy=-9.0;L.pOnGround=false;L.pCoyote=0;L.pJumpBuf=0;sfxJump();}
```

with:

```js
  if((L.pOnGround||L.pCoyote>0)&&L.pJumpBuf>0){L.pvy=LEARN_JUMP;L.pOnGround=false;L.pCoyote=0;L.pJumpBuf=0;sfxJump();}
```

- [ ] **Step 6: Run to verify it passes**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected output — **all 8 PASS, 0 FAIL, `exit=0`**:

```
[TEST] ===== start =====
[TEST] PASS  normal jump, held
[TEST] PASS  normal jump, tapped
[TEST] PASS  rocket, held
[TEST] PASS  rocket, tapped + exemption
[TEST] PASS  rocket, tapped, NO exemption
[TEST] PASS  gate cannot be skipped by a normal jump
[TEST] PASS  rocket clears the gate even when tapped
[TEST] PASS  rocket cannot overshoot onto the next step
[TEST] ===== 8 passed, 0 failed =====
```

- [ ] **Step 7: Verify the game still plays**

Open `index.html` in a browser with no query string, press SPACE → ÕPIME! →
TÄHED. Confirm the player still jumps and moves exactly as before. The
extraction must be behaviour-preserving. If you cannot open a browser, say so
in your report rather than claiming this step passed.

- [ ] **Step 8: Commit**

```bash
git add index.html scripts/run-tests.js
git commit -m "test: add self-test harness and extract shared learn-mode physics step"
```

---

### Task 2: Centralised back navigation and pause menu

`Escape` is handled in only 7 of 15 states. Replace the scattered inline checks
with one map so no state can be forgotten, and give mid-run states a pause
screen rather than an instant quit.

These ship together deliberately: `handleBack` opens the pause menu, so
splitting them would leave a commit where pressing Escape mid-level throws.

**Files:**
- Modify: `index.html` — `update()` (~line 1017), state branches (~1038–1065), `draw()` (~line 1381), `updateLearn` (~2303, 2319, 2431), `TRANSLATIONS` (~165)

- [ ] **Step 1: Add the back map, pause state and handler**

Insert immediately above `function update()` (~line 1017):

```js
// ==========================================
//  BACK NAVIGATION
// ==========================================
// Every state must have a way out. Before this existed, Escape was handled in
// 7 of 15 states, so picking a character locked the player into the adventure
// with no exit at all on a controller.
const BACK_TARGET={
  modeselect:'title', difficulty:'modeselect', select:'difficulty',
  intro:'select', gameover:'modeselect', win:'modeselect', debug:'title',
  learnmenu:'modeselect', learnletters:'learnmenu', learnresult:'learnmenu'
};
// Mid-run states open the pause menu instead of quitting outright: Select is
// easy to hit by accident and binning a run for it would be its own clunk.
const PAUSABLE=['playing','dead','between','levelcomplete'];
const LEARN_STATES=['learnmenu','learnletters','learnsyllables','learnresult'];

let pausePrev='playing', pauseIdx=0;
function openPause(){pausePrev=gameState;gameState='paused';pauseIdx=0;sfxPickup();}
function resumeFromPause(){gameState=pausePrev;}

function isMenuState(){
  return ['title','modeselect','difficulty','select','learnmenu','learnresult',
          'gameover','win','debug','paused'].indexOf(gameState)>=0;
}

function handleBack(){
  if(!justPressed['Escape'])return false;
  justPressed['Escape']=false;
  if(gameState==='paused'){resumeFromPause();return true;}
  if(PAUSABLE.indexOf(gameState)>=0){openPause();return true;}
  const target=BACK_TARGET[gameState];
  if(!target)return false;
  if(target==='modeselect')modeIndex=LEARN_STATES.indexOf(gameState)>=0?1:0;
  sfxPickup();
  gameState=target;
  return true;
}
```

- [ ] **Step 2: Call it from the update loop, and gate the language toggle**

In `update()`, the language toggle line currently reads:

```js
  if(justPressed['KeyL']){lang=lang==='et'?'en':'et';justPressed['KeyL']=false;}
```

Replace it with:

```js
  if(justPressed['KeyL']&&isMenuState()){lang=lang==='et'?'en':'et';justPressed['KeyL']=false;}
  if(handleBack()){clearJP();return;}
  if(gameState==='paused'){
    if(justPressed['ArrowLeft']||justPressed['KeyA'])pauseIdx=Math.max(0,pauseIdx-1);
    if(justPressed['ArrowRight']||justPressed['KeyD'])pauseIdx=Math.min(2,pauseIdx+1);
    if(justPressed['Space']||justPressed['Enter']){
      sfxPickup();
      if(pauseIdx===0)resumeFromPause();
      else if(pauseIdx===1){gameState='modeselect';modeIndex=0;}
      else gameState='title';
    }
    clearJP();return;
  }
```

Gating `KeyL` on `isMenuState()` also delivers the spec's requirement that the
language toggle cannot fire mid-run — on a DualSense that key is bound to △,
which a child hits constantly.

- [ ] **Step 3: Remove the superseded inline handlers**

Delete these lines (now handled centrally). Each appears exactly once:

```js
    if(justPressed['Escape']){gameState='title';justPressed['Escape']=false;}          // in 'debug'
    if(justPressed['Escape']){gameState='title';justPressed['Escape']=false;}          // in 'modeselect'
    if(justPressed['Escape']){gameState='modeselect';modeIndex=0;justPressed['Escape']=false;}  // in 'difficulty'
```

And in `updateLearn`, delete:

```js
    if(justPressed['Escape']){gameState='modeselect';modeIndex=1;justPressed['Escape']=false;}  // in 'learnmenu'
    if(justPressed['Escape']){gameState='learnmenu';justPressed['Escape']=false;}      // in 'learnresult'
  if(justPressed['Escape']){gameState='learnmenu';justPressed['Escape']=false;}        // in the climb
```

Also delete the now-duplicated language toggle at the top of `updateLearn`:

```js
  if(justPressed['KeyL']){lang=lang==='et'?'en':'et';justPressed['KeyL']=false;}
```

- [ ] **Step 4: Render the frozen world beneath the overlay**

Rename the existing `function draw(){` (~line 1381) to
`function drawWorldFrame(){`, then insert a new dispatcher directly above it:

```js
function draw(){
  if(gameState==='paused'){
    // Render the frozen scene using the state we paused from, then overlay.
    const real=gameState;
    gameState=pausePrev;
    try{drawWorldFrame();}finally{gameState=real;}
    drawPauseOverlay();clearJP();return;
  }
  drawWorldFrame();
}
```

- [ ] **Step 5: Draw the overlay**

Add `drawPauseOverlay` immediately after `drawWorldFrame`'s closing brace:

```js
function drawPauseOverlay(){
  ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect(0,0,BASE_W,BASE_H);
  ctx.textAlign='center';
  ctx.fillStyle='#ffdd00';ctx.font='bold 26px monospace';
  ctx.fillText(T('pause_title'),BASE_W/2,90);

  const opts=[T('pause_continue'),T('pause_switch'),T('pause_menu')];
  const bw=176,bh=54,gap=16;
  const totalW=opts.length*bw+(opts.length-1)*gap;
  const sx=(BASE_W-totalW)/2, y=170;
  opts.forEach((label,i)=>{
    const x=sx+i*(bw+gap);
    if(i===pauseIdx){
      ctx.fillStyle='rgba(136,255,136,0.16)';ctx.fillRect(x,y,bw,bh);
      ctx.strokeStyle='#88ff88';ctx.lineWidth=3;ctx.strokeRect(x-2,y-2,bw+4,bh+4);
      ctx.fillStyle='#88ff88';
    } else {
      ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fillRect(x,y,bw,bh);
      ctx.fillStyle='#ccc';
    }
    ctx.font='bold 15px monospace';
    ctx.fillText(label,x+bw/2,y+33);
  });

  ctx.fillStyle='#aaddcc';ctx.font='12px monospace';
  ctx.fillText(T('pause_hint'),BASE_W/2,BASE_H-40);
  ctx.textAlign='left';
}
```

- [ ] **Step 6: Add the translation keys**

In `TRANSLATIONS` (~line 165, after `mode_hint`), add:

```js
  // Pause menu
  pause_title:        {et:'PAUS',                     en:'PAUSED'},
  pause_continue:     {et:'JÄTKA',                    en:'CONTINUE'},
  pause_switch:       {et:'VAHETA MÄNGU',             en:'SWITCH MODE'},
  pause_menu:         {et:'PEAMENÜÜ',                 en:'MAIN MENU'},
  pause_hint:         {et:'◀ ▶ vali  •  Space / OK kinnita',  en:'◀ ▶ choose  •  Space / OK confirm'},
```

- [ ] **Step 7: Add a coverage test**

Add to the harness, and call `testBackNav();` from `runSelfTests()` after
`testPhysics();`:

```js
function testBackNav(){
  const ALL=['title','modeselect','difficulty','select','intro','playing','dead',
             'between','levelcomplete','gameover','win','debug','learnmenu',
             'learnletters','learnresult','paused'];
  ALL.forEach(s=>{
    const covered = s==='title' || s==='paused' ||
                    !!BACK_TARGET[s] || PAUSABLE.indexOf(s)>=0;
    tAssert('back works from state: '+s,covered,'no BACK_TARGET and not PAUSABLE');
  });
  tAssert('no back target is itself',
          Object.keys(BACK_TARGET).every(k=>BACK_TARGET[k]!==k));
  tAssert('every back target is a real state',
          Object.values(BACK_TARGET).every(v=>ALL.indexOf(v)>=0));
  tAssert('pausable states are not also in BACK_TARGET',
          PAUSABLE.every(s=>!BACK_TARGET[s]));
}
```

- [ ] **Step 8: Run the tests**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected: 8 physics PASS + 19 back-nav PASS, 0 FAIL, `exit=0`.

- [ ] **Step 9: Manual verification**

1. Open `index.html`, SPACE → SEIKLUS → pick difficulty → pick character → play.
2. Press `Escape`. Expected: the level freezes and stays visible behind a dark
   overlay reading **PAUS**, with **JÄTKA** selected.
3. Press `Escape` again. Expected: play resumes exactly where it stopped.
4. Press `Escape`, then `→` `→` and SPACE. Expected: you land on the title.
5. SPACE → SEIKLUS → difficulty → **Escape**. Expected: back to mode select
   (not pause — `difficulty` is not a `PAUSABLE` state).
6. At character select press `Escape`. Expected: back to difficulty. This path
   had no exit at all before.
7. Confirm BGM keeps playing while paused.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "fix: give every game state a way back, with a pause menu for live runs"
```

---

### Task 3: Mobile back button

**Files:**
- Modify: `index.html` — controls markup (~line 57), `setupMobile()` (~line 872)

- [ ] **Step 1: Add the button**

In the `#actions` block, change the second action row from:

```html
    <div class="action-row">
      <button class="ctrl-btn" id="btn-shoot">🏹</button>
      <button class="ctrl-btn ok" id="btn-ok">OK</button>
    </div>
```

to:

```html
    <div class="action-row">
      <button class="ctrl-btn" id="btn-back">↩</button>
      <button class="ctrl-btn" id="btn-shoot">🏹</button>
      <button class="ctrl-btn ok" id="btn-ok">OK</button>
    </div>
```

- [ ] **Step 2: Map it**

In `setupMobile()`, extend the `ids` map:

```js
    'btn-left':'ArrowLeft','btn-right':'ArrowRight',
    'btn-up':'ArrowUp','btn-down':'ArrowDown',
    'btn-jump':'Space','btn-shoot':'KeyX','btn-ok':'Enter','btn-back':'Escape'
```

- [ ] **Step 3: Manual verification**

Open `index.html` in Chrome, DevTools → device toolbar → iPhone landscape.
Reload so `'ontouchstart' in window` is true and the controls render.

1. Tap into learn mode, then tap `↩`. Expected: back to the mode select.
2. Start an adventure, tap `↩` mid-level. Expected: the pause overlay.
3. Confirm the three-button row still fits without overflowing at the narrow
   breakpoint (`max-height: 450px`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add on-screen back button so touch players can leave a mode"
```

---

### Task 4: Controller detection and glyphs

**Files:**
- Modify: `index.html` — `TRANSLATIONS` (~157–165), `T()` (~246), new pad module above `pollGamepad` (~2680)

- [ ] **Step 1: Write the failing tests**

Add to the harness and call `testPadDetect();` from `runSelfTests()`:

```js
function testPadDetect(){
  // Chrome/Edge format
  tAssert('chrome dualsense → ps',
    detectPadKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')==='ps');
  tAssert('chrome xbox → xbox',
    detectPadKind('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)')==='xbox');
  tAssert('chrome switch pro → nintendo',
    detectPadKind('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')==='nintendo');
  // Firefox format
  tAssert('firefox dualsense → ps',
    detectPadKind('054c-0ce6-DualSense Wireless Controller')==='ps');
  tAssert('firefox xbox → xbox',
    detectPadKind('045e-0b12-Xbox Wireless Controller')==='xbox');
  // Safari / name-only fallback
  tAssert('name-only dualsense → ps',
    detectPadKind('DualSense Wireless Controller')==='ps');
  tAssert('name-only dualshock → ps',
    detectPadKind('Wireless Controller DualShock 4')==='ps');
  tAssert('name-only switch → nintendo',
    detectPadKind('Nintendo Switch Pro Controller')==='nintendo');
  // Unknown defaults to xbox, because "standard gamepad" is Xbox-shaped
  tAssert('unknown → xbox', detectPadKind('Some Generic Pad')==='xbox');
  tAssert('empty → xbox', detectPadKind('')==='xbox');
  tAssert('null → xbox', detectPadKind(null)==='xbox');
  // Glyphs
  tAssert('ps confirm glyph is cross', PAD_GLYPHS.ps.confirm==='✕');
  tAssert('xbox confirm glyph is A', PAD_GLYPHS.xbox.confirm==='Ⓐ');
  tAssert('nintendo swaps A/B vs xbox',
    PAD_GLYPHS.nintendo.confirm==='Ⓑ'&&PAD_GLYPHS.nintendo.back==='Ⓐ');
  tAssert('every kind defines every glyph',
    ['xbox','ps','nintendo'].every(k=>
      ['confirm','back','shoot','pause'].every(g=>!!PAD_GLYPHS[k][g])));
  // Placeholder expansion
  const saved=padKind; padKind='ps';
  tAssert('T() expands {A} to the pad glyph', T('press_start').indexOf('✕')>=0);
  tAssert('T() leaves no placeholder behind', T('press_start').indexOf('{A}')<0);
  padKind=saved;
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected: `Tests threw: detectPadKind is not defined` and `exit=2`.

- [ ] **Step 3: Implement detection**

Insert immediately above `function pollGamepad()` (~line 2680):

```js
// ==========================================
//  CONTROLLER IDENTITY
// ==========================================
// There is no official controller-type API. gamepad.id carries USB vendor and
// product IDs, but the format differs per browser:
//   Chrome/Edge  "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
//   Firefox      "054c-0ce6-DualSense Wireless Controller"
//   Safari       "DualSense Wireless Controller"   (no IDs at all)
// So: parse either ID format, fall back to keywords, then default to Xbox —
// the "standard gamepad" layout is Xbox-shaped, so that is the safest guess.
const PAD_VENDORS={'054c':'ps','045e':'xbox','057e':'nintendo'};
const PAD_GLYPHS={
  xbox:     {confirm:'Ⓐ',back:'Ⓑ',shoot:'Ⓧ',pause:'☰'},
  ps:       {confirm:'✕',back:'○',shoot:'□',pause:'OPTIONS'},
  nintendo: {confirm:'Ⓑ',back:'Ⓐ',shoot:'Ⓨ',pause:'+'}
};
let padKind='xbox', padLastId='';

function detectPadKind(id){
  const s=(id||'').toLowerCase();
  let m=s.match(/vendor:\s*([0-9a-f]{4})/);
  if(!m)m=s.match(/^([0-9a-f]{4})-[0-9a-f]{4}/);
  if(m&&PAD_VENDORS[m[1]])return PAD_VENDORS[m[1]];
  if(/dualsense|dualshock|playstation|sony/.test(s))return 'ps';
  if(/nintendo|switch|joy-?con|pro controller/.test(s))return 'nintendo';
  if(/xbox|xinput|microsoft/.test(s))return 'xbox';
  return 'xbox';
}

function padGlyph(slot){return (PAD_GLYPHS[padKind]||PAD_GLYPHS.xbox)[slot]||'';}
```

Note the ordering inside `detectPadKind`: vendor IDs are checked before
keywords, and `pro controller` is only matched after `dualsense`, so a Sony pad
whose name contains a generic word still resolves correctly.

- [ ] **Step 4: Cache the kind on connect**

In `pollGamepad()`, immediately after the `if(!gp)return;` line:

```js
  if(gp.id!==padLastId){padLastId=gp.id;padKind=detectPadKind(gp.id);}
```

- [ ] **Step 5: Substitute glyphs into the prompt strings**

Change the two strings containing `Ⓐ` to use a `{A}` placeholder:

```js
  press_start:        {et:'VAJUTA SPACE või {A} ALUSTAMISEKS!', en:'PRESS SPACE OR {A} TO START!'},
  mode_hint:          {et:'◀ ▶ vali  •  Space / OK / {A} kinnita', en:'◀ ▶ choose  •  Space / OK / {A} confirm'},
```

Then extend `T()` (~line 246) to expand placeholders:

```js
function T(key){
  const e=TRANSLATIONS[key];
  if(!e)return key;
  const s=e[lang]||e['en'];
  return s.indexOf('{')<0?s:s
    .replace(/\{A\}/g,padGlyph('confirm'))
    .replace(/\{B\}/g,padGlyph('back'))
    .replace(/\{X\}/g,padGlyph('shoot'))
    .replace(/\{P\}/g,padGlyph('pause'));
}
```

- [ ] **Step 6: Run the tests**

Expected: all 16 pad assertions PASS, plus the earlier suites, 0 FAIL.

- [ ] **Step 7: Manual verification with the real pad**

Connect the DualSense and open `index.html`. Press a button so the browser
exposes the gamepad, then check the title prompt reads
**`VAJUTA SPACE või ✕ ALUSTAMISEKS!`** — not `Ⓐ`.

In the console, `padKind` should be `'ps'`. If it is not, log
`navigator.getGamepads()[0].id` and record the exact string in the task report;
the vendor table may need a new entry.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: detect controller type and show matching button glyphs"
```

---

### Task 5: Controller bindings and rumble

**Files:**
- Modify: `index.html` — `pollGamepad()` (~2688–2704)

- [ ] **Step 1: Make button 1 context-sensitive and neuter button 3 in play**

Replace the static `btnMap` and its loop:

```js
  const btnMap={
    0:'Space',1:'KeyX',2:'KeyX',3:'KeyL',
    9:'Enter',8:'Escape',
    12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'
  };
  Object.entries(btnMap).forEach(([bi,code])=>{
    const idx=parseInt(bi);
    if(idx>=gp.buttons.length)return;
    const pressed=gp.buttons[idx].pressed;
    const wasPressed=!!gpPrev[idx];
    if(pressed&&!wasPressed){justPressed[code]=true;keys[code]=true;}
    else if(!pressed&&wasPressed){keys[code]=false;}
    gpPrev[idx]=pressed;
  });
```

with:

```js
  // Button 1 (○ / Ⓑ) is cancel in menus and shoot in play — the universal
  // console convention. Button 9 (OPTIONS / ☰) is confirm in menus and pause
  // during a run, since Start is where a thumb looks for pause.
  const menu=isMenuState();
  const btnMap={
    0:'Space',
    1:menu?'Escape':'KeyX',
    2:'KeyX',
    3:menu?'KeyL':null,   // language toggle is menu-only: this is △ on a
                          // DualSense and kids hit it constantly mid-run
    9:menu?'Enter':'Escape',
    8:'Escape',
    12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'
  };
  Object.keys(btnMap).forEach(bi=>{
    const idx=parseInt(bi), code=btnMap[bi];
    if(idx>=gp.buttons.length)return;
    const pressed=gp.buttons[idx].pressed;
    const prevCode=gpPrev[idx]||null;   // the code that was actually pressed,
                                        // not the code that maps right now
    if(pressed&&!prevCode){
      if(code){justPressed[code]=true;keys[code]=true;gpPrev[idx]=code;}
    } else if(!pressed&&prevCode){
      keys[prevCode]=false;gpPrev[idx]=null;
    }
  });
```

`gpPrev[idx]` now stores the *code* rather than a boolean. This matters: a
button held while the state changes would otherwise release a different key code
than the one it pressed, leaving a key stuck down forever. The stick entries
(`gpPrev['sL']` etc.) keep using booleans and are untouched.

- [ ] **Step 2: Add rumble**

Add below `padGlyph`:

```js
// No-ops on pads without haptics, and on browsers that reject the effect.
function padRumble(strong,weak,dur){
  const pads=navigator.getGamepads?navigator.getGamepads():[];
  for(let i=0;i<pads.length;i++){
    const gp=pads[i];
    if(gp&&gp.connected&&gp.vibrationActuator){
      try{gp.vibrationActuator.playEffect('dual-rumble',
        {duration:dur,strongMagnitude:strong,weakMagnitude:weak});}catch(e){}
      return;
    }
  }
}
```

- [ ] **Step 3: Manual verification with the real pad**

1. On the title screen press ○. Expected: nothing breaks (title has no back
   target).
2. Enter mode select, press ○. Expected: back to title.
3. Start a run, press OPTIONS. Expected: the pause overlay opens.
4. During a run, press △ repeatedly. Expected: **the language does not change.**
5. In the mode select, press △. Expected: language toggles.
6. Hold ○ during play (shoot), and while still holding it press OPTIONS to
   pause. Release ○. Resume. Expected: the character does not keep shooting —
   this is the stuck-key case the `gpPrev` change fixes.
7. Console: `padRumble(0,0.6,120)`. Expected: a short buzz.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: console-conventional pad bindings and rumble support"
```

---

### Task 6: Voice prompts

**Files:**
- Modify: `index.html` — new voice module above the `LEARN MODE` banner (~line 2143)

- [ ] **Step 1: Write the failing tests**

Add to the harness, call `testVoicePick();` from `runSelfTests()`:

```js
function testVoicePick(){
  const V=(l)=>({lang:l,name:'test-'+l});
  tAssert('prefers estonian above all',
    pickVoiceFrom([V('it-IT'),V('fi-FI'),V('et-EE')]).lang==='et-EE');
  tAssert('falls back to finnish when no estonian',
    pickVoiceFrom([V('en-US'),V('it-IT'),V('fi-FI')]).lang==='fi-FI');
  tAssert('falls back to italian when no estonian or finnish',
    pickVoiceFrom([V('en-US'),V('it-IT')]).lang==='it-IT');
  tAssert('falls back to first available otherwise',
    pickVoiceFrom([V('en-US'),V('de-DE')]).lang==='en-US');
  tAssert('handles bare language codes',
    pickVoiceFrom([V('en'),V('et')]).lang==='et');
  tAssert('is case insensitive',
    pickVoiceFrom([V('ET-ee')]).lang==='ET-ee');
  tAssert('returns null on empty list', pickVoiceFrom([])===null);
  tAssert('returns null on undefined', pickVoiceFrom(undefined)===null);
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected: `Tests threw: pickVoiceFrom is not defined` and `exit=2`.

- [ ] **Step 3: Implement the voice module**

Insert immediately above the `LEARN MODE` section banner (~line 2143):

```js
// ==========================================
//  VOICE — speaks the learn-mode prompts
// ==========================================
// Estonian voices do not ship with macOS or iOS. Finnish and Italian both
// render Estonian vowels closely enough to teach from, and Italian is very
// widely installed, so the chain degrades usefully rather than to nonsense.
// If nothing is available the feature silently does nothing and the game is
// exactly as playable as before.
const VOICE_PREFS=['et','fi','it'];
let learnVoice=null, voiceChecked=false;

function pickVoiceFrom(voices){
  if(!voices||!voices.length)return null;
  for(let i=0;i<VOICE_PREFS.length;i++){
    const want=VOICE_PREFS[i];
    const hit=voices.find(v=>v.lang&&v.lang.toLowerCase().indexOf(want)===0);
    if(hit)return hit;
  }
  return voices[0];
}

function refreshVoice(){
  if(!('speechSynthesis' in window))return;
  try{learnVoice=pickVoiceFrom(speechSynthesis.getVoices());voiceChecked=true;}
  catch(e){learnVoice=null;}
}

if('speechSynthesis' in window){
  refreshVoice();
  // Chrome populates the voice list asynchronously.
  speechSynthesis.addEventListener('voiceschanged',refreshVoice);
}

// Letters and words are ALWAYS spoken in Estonian regardless of the UI
// language toggle: the content pools are Estonian, and saying KASS with an
// English voice would teach the wrong sound.
function speak(text,rate){
  if(!('speechSynthesis' in window))return;
  if(!voiceChecked)refreshVoice();
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    if(learnVoice)u.voice=learnVoice;
    u.lang=learnVoice?learnVoice.lang:'et-EE';
    u.rate=rate||0.8;   // slower for a small child
    u.pitch=1.1;
    speechSynthesis.speak(u);
  }catch(e){}
}

// In words mode, say the whole word then the letter being hunted, which is
// what supports blending: "KASS. K."
function speakTarget(){
  const L=learn;
  const g=L.gates[L.gateIdx];
  if(!g)return;
  if(L.mode==='words'&&L.currentWord)speak(L.currentWord+'. '+g.target+'.');
  else speak(g.target);
}
```

`speakTarget` reads `L.gates[L.gateIdx].target`, which exists in the current
gate structure as well as the one Task 7 introduces, and `L.currentWord` is
guarded — so this task is safe to ship before the tower is rebuilt.

- [ ] **Step 4: Run the tests**

Expected: 8 voice assertions PASS, 0 FAIL.

- [ ] **Step 5: Check what is actually installed**

In the console on the kids' device:

```js
speechSynthesis.getVoices().map(v=>v.lang+' '+v.name).join('\n')
```

Then `refreshVoice(); learnVoice && learnVoice.lang`. Record the result — if it
lands on `it-*`, that is the expected outcome on stock macOS/iOS. If
`learnVoice` is `null`, voice is unavailable on that device and the rest of the
plan still works, silently. Report that as a finding, not a failure.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add speech-synthesis voice with et/fi/it fallback chain"
```

---

### Task 7: Gate geometry — full-width ledge with three doorway zones

Replaces the three separated jump-target blocks and rebuilds the tower.

**Files:**
- Modify: `index.html` — `learn` object (~2149), `initLearnRound` (~2176–2287)

- [ ] **Step 1: Write the failing tests**

Add to the harness, call `testZones();` from `runSelfTests()`:

```js
function testZones(){
  const W=BASE_W/3;
  tAssert('far left is zone 0',      zoneAt(0)===0);
  tAssert('just left of first edge', zoneAt(W-9)===0);   // px+8 < W
  tAssert('just past first edge',    zoneAt(W-7)===1);
  tAssert('centre is zone 1',        zoneAt(BASE_W/2-8)===1);
  tAssert('just past second edge',   zoneAt(2*W-7)===2);
  tAssert('far right is zone 2',     zoneAt(BASE_W-16)===2);
  tAssert('clamps below range',      zoneAt(-40)===0);
  tAssert('clamps above range',      zoneAt(BASE_W+40)===2);
  // Sweep the whole floor: no x may fall outside a zone, and all three must
  // be reachable by walking.
  let bad=false, seen={};
  for(let x=-10;x<=BASE_W;x++){
    const z=zoneAt(x);
    if(z!==0&&z!==1&&z!==2)bad=true;
    seen[z]=1;
  }
  tAssert('every x on the floor maps to a valid zone',!bad);
  tAssert('all three zones are reachable',Object.keys(seen).length===3);
  // Arch centres must sit inside their own zone
  tAssert('zone centres map back to themselves',
    [0,1,2].every(z=>zoneAt(zoneCentre(z)-8)===z));
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
node scripts/run-tests.js; echo "exit=$?"
```

Expected: `Tests threw: zoneAt is not defined` and `exit=2`.

- [ ] **Step 3: Implement zone mapping**

Add directly above `function initLearnRound()`:

```js
// The gate floor spans the full screen and is split into three equal zones, so
// the player is ALWAYS under exactly one arch. There is no gap to miss and no
// precision jump involved — which is the entire point: the difficulty belongs
// in knowing the letter, not in landing on it.
function zoneAt(px){
  const z=Math.floor((px+8)/(BASE_W/3));   // px+8 is the 16px sprite's centre
  return z<0?0:(z>2?2:z);
}
function zoneCentre(z){return (BASE_W/3)*(z+0.5);}
```

- [ ] **Step 4: Add target selection**

Add directly above `initLearnRound`:

```js
function pickUnused(pool,used){
  const unused=pool.filter(x=>used.indexOf(x)<0);
  const pick=unused.length>0?unused:pool;
  return pick[Math.floor(Math.random()*pick.length)];
}

// One tower asks four questions. Words mode maps perfectly onto this because
// every entry in LEARN_WORDS is exactly four letters long.
function buildTargets(L){
  if(L.mode==='words'){
    const w=pickUnused(LEARN_WORDS,L.usedItems);
    L.usedItems.push(w);L.currentWord=w;
    return w.split('');
  }
  const pool=L.mode==='letters'?LEARN_LETTERS:LEARN_SYLLABLES;
  const out=[];
  for(let i=0;i<GATES_PER_TOWER;i++){
    const t=pickUnused(pool,L.usedItems.concat(out));
    out.push(t);L.usedItems.push(t);
  }
  return out;
}
```

- [ ] **Step 5: Rebuild the tower**

Replace the whole body of `initLearnRound` (from `const L=learn;` to its closing
brace) with:

```js
  const L=learn;
  L.platforms=[];L.gates=[];L.particles=[];
  L.pvx=0;L.pvy=0;L.pOnGround=false;L.rocketing=false;
  L.pCoyote=0;L.pJumpBuf=0;
  L.feedback=null;L.celebration=0;L.finished=false;
  L.gateIdx=0;L.currentWord=null;

  const targets=buildTargets(L);

  const startY=50;
  L.px=BASE_W/2-10;L.py=startY-30;
  L.platforms.push({x:BASE_W/2-70,y:startY,w:140});

  let curY=startY, lastPx=BASE_W/2;
  const MAX_HOP=100;
  function nextPlatX(pw){
    const minCx=Math.max(pw/2+10,lastPx-MAX_HOP);
    const maxCx=Math.min(BASE_W-pw/2-10,lastPx+MAX_HOP);
    const cx=minCx+Math.random()*Math.max(0,maxCx-minCx);
    lastPx=cx;
    return cx-pw/2;
  }

  targets.forEach((target,gi)=>{
    for(let j=0;j<3;j++){
      curY-=STEP_RISE;
      const pw=100+Math.random()*30;
      L.platforms.push({x:nextPlatX(pw),y:curY,w:pw});
    }
    // Gate floor — full width, so the player cannot fall off while deciding.
    curY-=GATE_RISE;
    L.platforms.push({x:0,y:curY,w:BASE_W,isGate:true,gateIdx:gi});
    const distPool=L.mode==='syllables'?LEARN_SYLLABLES:LEARN_LETTERS;
    const opts=shuffleArray([target,...pickDistractors(target,distPool,2)]);
    L.gates.push({
      y:curY,gateIdx:gi,target:target,solved:false,mistakes:0,
      zones:opts.map((letter,zi)=>({letter:letter,correct:letter===target,zi:zi,
                                    openTimer:0,wrongTimer:0}))
    });
    // Landing floor — also full width, because a rocket rises straight up from
    // whichever zone was chosen. A narrow centred platform would be missed
    // entirely by anyone answering from zone 0 or 2. Being full width and
    // one-way also makes every gate a permanent checkpoint.
    curY-=GATE_GAP;
    L.platforms.push({x:0,y:curY,w:BASE_W,isLanding:true,
                      isFinish:gi===targets.length-1});
    lastPx=BASE_W/2;
  });

  L.finishY=curY;
  L.camY=L.py-BASE_H*0.45;
  speakTarget();
```

- [ ] **Step 6: Add a tower-shape test**

Add to the harness, call `testTower();` from `runSelfTests()`:

```js
function testTower(){
  const savedMode=learn.mode, savedUsed=learn.usedItems;
  ['letters','syllables','words'].forEach(mode=>{
    learn.mode=mode;learn.usedItems=[];
    initLearnRound();
    const L=learn;
    tAssert(mode+': four gates',L.gates.length===GATES_PER_TOWER);
    tAssert(mode+': every gate has three zones',
      L.gates.every(g=>g.zones.length===3));
    tAssert(mode+': every gate has exactly one correct zone',
      L.gates.every(g=>g.zones.filter(z=>z.correct).length===1));
    tAssert(mode+': no duplicate options within a gate',
      L.gates.every(g=>new Set(g.zones.map(z=>z.letter)).size===3));
    const gateFloors=L.platforms.filter(p=>p.isGate);
    const landings=L.platforms.filter(p=>p.isLanding);
    tAssert(mode+': gate floors span full width',
      gateFloors.every(p=>p.x===0&&p.w===BASE_W));
    tAssert(mode+': landing floors span full width',
      landings.every(p=>p.x===0&&p.w===BASE_W));
    tAssert(mode+': exactly one finish',
      L.platforms.filter(p=>p.isFinish).length===1);
    tAssert(mode+': landing floors sit GATE_GAP above their gate',
      L.gates.every((g,i)=>Math.abs((g.y-landings[i].y)-GATE_GAP)<0.001));
    tAssert(mode+': stepping platforms stay on screen',
      L.platforms.filter(p=>!p.isGate&&!p.isLanding)
                 .every(p=>p.x>=0&&p.x+p.w<=BASE_W));
  });
  tAssert('every word is exactly '+GATES_PER_TOWER+' letters',
    LEARN_WORDS.every(x=>x.length===GATES_PER_TOWER));
  learn.mode=savedMode;learn.usedItems=savedUsed;
}
```

- [ ] **Step 7: Run the tests**

Expected: all zone and tower assertions PASS, 0 FAIL. `speakTarget` runs inside
`initLearnRound`; with no voice installed it silently does nothing, which does
not affect the assertions.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: gate becomes a full-width ledge with three doorway zones"
```

---

### Task 8: Answer submission, rocket launch, soft failure and hints

**Files:**
- Modify: `index.html` — collision and jump handling in `updateLearn`, gate rendering in `drawLearn` (~2478–2513), `TRANSLATIONS` neighbourhood (~245)

- [ ] **Step 1: Land on gate floors, and drop the old gate collision**

In `updateLearn`, delete the entire `L.gates.forEach(gate=>{ … });` collision
block — the one containing `opt.wrongTimer`, the `CORRECT!` comment and the
`WRONG` comment.

In the platform collision loop, replace:

```js
      if(L.px+pw>pl.x&&L.px<pl.x+pl.w&&L.py+ph>=pl.y&&L.py+ph<=pl.y+12){
        L.py=pl.y-ph;L.pvy=0;L.pOnGround=true;
```

with:

```js
      if(L.px+pw>pl.x&&L.px<pl.x+pl.w&&L.py+ph>=pl.y&&L.py+ph<=pl.y+12){
        L.py=pl.y-ph;L.pvy=0;L.pOnGround=true;L.rocketing=false;
        if(pl.isGate){
          // Clear the 12-frame jump buffer, or landing with jump held would
          // instantly submit an answer the child never chose.
          L.pJumpBuf=0;
          if(L.gateIdx!==pl.gateIdx){L.gateIdx=pl.gateIdx;speakTarget();}
        }
```

- [ ] **Step 2: Submit an answer on jump from a gate floor**

Replace the jump trigger line:

```js
  if((L.pOnGround||L.pCoyote>0)&&L.pJumpBuf>0){L.pvy=LEARN_JUMP;L.pOnGround=false;L.pCoyote=0;L.pJumpBuf=0;sfxJump();}
```

with:

```js
  if((L.pOnGround||L.pCoyote>0)&&L.pJumpBuf>0){
    const gate=gateUnderPlayer();
    if(gate&&L.pOnGround)answerGate(gate,zoneAt(L.px));
    else{L.pvy=LEARN_JUMP;L.pOnGround=false;L.pCoyote=0;L.pJumpBuf=0;sfxJump();}
  }
```

- [ ] **Step 3: Implement the answer handler**

Add above `function updateLearn()`:

```js
// The gate whose floor the player is standing on, or null.
function gateUnderPlayer(){
  const L=learn;
  for(let i=0;i<L.gates.length;i++){
    const g=L.gates[i];
    if(Math.abs((L.py+24)-g.y)<=12)return g;
  }
  return null;
}

function answerGate(gate,zi){
  const L=learn;
  L.pJumpBuf=0;L.pCoyote=0;
  const zone=gate.zones[zi];
  if(!zone)return;
  if(zone.correct){
    if(!gate.solved){gate.solved=true;L.score+=50;}
    zone.openTimer=40;
    // `rocketing` exempts this launch from the variable-height jump-cut.
    // Without it a tapped jump rises 19px instead of 158px, stranding the
    // child below a gate they just answered correctly.
    L.pvy=LEARN_ROCKET;L.rocketing=true;L.pOnGround=false;
    L.feedback={type:'correct',timer:40,x:zoneCentre(zi),y:gate.y-20,text:zone.letter};
    sfxCoin();padRumble(0,0.6,120);
    speak(zone.letter+'. '+cheer());
    for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=1+Math.random()*2;
      L.particles.push({x:zoneCentre(zi),y:gate.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2,
        life:25+Math.random()*15,maxLife:40,color:'#88ff88',size:2+Math.random()*2});}
  } else {
    gate.mistakes++;
    zone.wrongTimer=30;
    // A small hop so the press visibly registered — deliberately NOT exempt
    // from the jump-cut, so it can never be mistaken for a correct launch.
    L.pvy=-4;L.pOnGround=false;
    L.feedback={type:'wrong',timer:30,x:zoneCentre(zi),y:gate.y-20,text:'✗'};
    playTone(150,.15,'triangle',.08,100);padRumble(0.35,0,200);
    speakTarget();
    for(let i=0;i<5;i++)L.particles.push({x:zoneCentre(zi),y:gate.y,
      vx:(Math.random()-0.5)*2,vy:-1-Math.random(),life:15,maxLife:15,
      color:'#ff6666',size:1.5+Math.random()});
  }
}

function cheer(){
  const list=CHEERS[lang]||CHEERS.en;
  return list[Math.floor(Math.random()*list.length)];
}
```

- [ ] **Step 4: Add the cheer table**

Immediately before `function T(key)` (~line 245), add:

```js
// Kept out of TRANSLATIONS because these are picked at random, not by key.
const CHEERS={
  et:['TUBLI!','VÄGA HEA!','SUPER!','SUUREPÄRANE!','FANTASTILINE!'],
  en:['WELL DONE!','VERY GOOD!','SUPER!','EXCELLENT!','FANTASTIC!']
};
```

- [ ] **Step 5: Draw the arches**

Replace the whole `L.gates.forEach(gate=>{ … });` block inside `drawLearn` — the
one drawing option blocks and the dashed barrier — with:

```js
  L.gates.forEach(gate=>{
    const onThisFloor=Math.abs((L.py+24)-gate.y)<=12;
    const activeZ=onThisFloor?zoneAt(L.px):-1;
    gate.zones.forEach(z=>{
      if(z.wrongTimer>0)z.wrongTimer--;
      if(z.openTimer>0)z.openTimer--;
      const cx=zoneCentre(z.zi), top=gate.y-56;
      const aw=104, ax=cx-aw/2;
      const open=gate.solved&&z.correct;
      const wrong=z.wrongTimer>0;
      // Hint: after two misses the correct arch pulses, so a stuck child can
      // always make progress without an adult.
      const hint=!gate.solved&&z.correct&&gate.mistakes>=2;

      ctx.save();
      if(wrong)ctx.translate(Math.sin(z.wrongTimer*1.5)*3,0);

      // Zone divider, so the three choices read as separate doorways
      ctx.strokeStyle='rgba(255,255,255,0.10)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cx+BASE_W/6,gate.y);ctx.lineTo(cx+BASE_W/6,top);ctx.stroke();

      let col=open?'#44dd66':(wrong?'#dd4444':'#6688bb');
      if(hint){
        const p=0.5+Math.sin(animFrame*0.15)*0.5;
        col='rgb('+Math.round(102+70*p)+','+Math.round(136+90*p)+','+Math.round(187+30*p)+')';
      }
      if(activeZ===z.zi&&!open){
        ctx.fillStyle='rgba(255,255,255,0.14)';
        ctx.fillRect(ax-8,top-6,aw+16,62);
        ctx.strokeStyle='#ffdd00';ctx.lineWidth=2;
        ctx.strokeRect(ax-8,top-6,aw+16,62);
      }
      // Pillars and lintel
      ctx.fillStyle=col;
      ctx.fillRect(ax,top,14,52);
      ctx.fillRect(ax+aw-14,top,14,52);
      ctx.fillRect(ax,top,aw,14);
      if(open){ctx.fillStyle='rgba(136,255,136,0.22)';ctx.fillRect(ax+14,top+14,aw-28,38);}
      ctx.fillStyle='#ffffff';ctx.font='bold 22px monospace';ctx.textAlign='center';
      ctx.fillText(z.letter,cx,top+38);
      ctx.textAlign='left';
      ctx.restore();
    });
  });
```

- [ ] **Step 6: Manual verification — the critical one**

Open `index.html`, SPACE → ÕPIME! → TÄHED.

1. Walk left and right along the gate floor. Expected: the highlight follows you
   and **every** position highlights exactly one arch. Walk off the left edge —
   you wrap to the right, still on the floor, never falling.
2. Stand under a wrong arch and **tap** jump. Expected: small hop, red shake,
   the letter is spoken again, you land back on the same floor having lost
   nothing.
3. Get it wrong twice on one gate. Expected: the correct arch starts pulsing.
4. Stand under the correct arch and **tap** jump — do not hold it. Expected: you
   rocket up and land on the floor above. **If you fall back onto the gate
   floor, `rocketing` is not working — stop and fix it before continuing.**
5. Repeat step 4 from **zone 0** and **zone 2**, not just the middle. Expected:
   you land on the floor above in all three cases.
6. From the floor above, try to get back down to the gate. Expected: you cannot
   — it is a checkpoint.
7. Land on a gate floor while holding jump. Expected: no answer is submitted.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: rocket launch on correct answer, zero-cost wrong answers, hint pulse"
```

---

### Task 9: Pacing — four gates, one result screen

**Files:**
- Modify: `index.html` — `learn` object, finish handling and `learnresult` branch in `updateLearn` (~2307), `drawLearnResult` (~2643)

- [ ] **Step 1: Replace the round counter**

In the `learn` object literal, replace:

```js
  score:0,round:0,totalRounds:8,
```

with:

```js
  score:0,round:0,resultCheer:'',   // round = towers finished, for cheer variety
```

- [ ] **Step 2: Celebrate at the top**

The finish branch already requires every gate solved, which is now all four.
Inside its `if(allSolved){` block, immediately after `sfxWin();`, add:

```js
            padRumble(0.5,0.5,300);
            L.resultCheer=cheer();
            speak(L.resultCheer);
```

- [ ] **Step 3: Simplify the result branch**

Replace the `learnresult` branch of `updateLearn`:

```js
  if(gameState==='learnresult'){
    if(justPressed['Space']||justPressed['Enter']){
      learn.round++;
      if(learn.round>=learn.totalRounds){
        gameState='learnmenu';
        justPressed['Space']=false;justPressed['Enter']=false;
      } else {
        initLearnRound();
        gameState='learnletters';
        justPressed['Space']=false;justPressed['Enter']=false;
      }
    }
    if(justPressed['Escape']){gameState='learnmenu';justPressed['Escape']=false;}
    clearJP();return;
  }
```

with:

```js
  if(gameState==='learnresult'){
    // SPACE builds a fresh tower, back returns to the menu. There is no fixed
    // session length any more — the kids stop when they are done.
    if(justPressed['Space']||justPressed['Enter']){
      learn.round++;
      initLearnRound();
      gameState='learnletters';
      justPressed['Space']=false;justPressed['Enter']=false;
    }
    clearJP();return;
  }
```

- [ ] **Step 4: Update the result screen**

In `drawLearnResult`, replace:

```js
  ctx.fillText('TUBLI!',BASE_W/2,80);
```

with (the cheer is chosen once at finish, not rerolled every frame):

```js
  ctx.fillText(L.resultCheer||T('learn_done'),BASE_W/2,80);
```

Replace the completed-item line and score block:

```js
  ctx.fillStyle='#fff';ctx.font='18px monospace';
  const completed=L.mode==='letters'?'Täht: '+L.currentTarget:L.mode==='syllables'?'Silp: '+L.currentTarget:'Sõna: '+L.currentTarget;
  ctx.fillText(completed,BASE_W/2,130);

  ctx.fillStyle='#aaddff';ctx.font='14px monospace';
  ctx.fillText('Punktid: '+L.score,BASE_W/2,170);
  ctx.fillText('Voor: '+(L.round+1)+' / '+L.totalRounds,BASE_W/2,195);
```

with:

```js
  ctx.fillStyle='#fff';ctx.font='18px monospace';
  const done=L.mode==='words'
    ? T('learn_word')+' '+(L.currentWord||'')
    : L.gates.map(g=>g.target).join('  ');
  ctx.fillText(done,BASE_W/2,130);

  ctx.fillStyle='#aaddff';ctx.font='14px monospace';
  ctx.fillText(T('learn_score')+' '+L.score,BASE_W/2,170);
```

And replace the trailing hint block:

```js
  if(L.round+1>=L.totalRounds){
    ctx.fillStyle='#88ff88';ctx.font='bold 16px monospace';
    ctx.fillText('KÕIK TEHTUD! SUUREPÄRANE!',BASE_W/2,320);
  }

  ctx.fillStyle='#aaddcc';ctx.font='12px monospace';
  ctx.fillText(L.round+1<L.totalRounds?'SPACE = järgmine':'SPACE = tagasi menüüsse',BASE_W/2,360);
```

with:

```js
  ctx.fillStyle='#aaddcc';ctx.font='12px monospace';
  ctx.fillText(T('learn_next'),BASE_W/2,360);
```

- [ ] **Step 5: Add the translation keys**

```js
  learn_done:         {et:'TUBLI!',                   en:'WELL DONE!'},
  learn_word:         {et:'Sõna:',                    en:'Word:'},
  learn_score:        {et:'Punktid:',                 en:'Score:'},
  learn_next:         {et:'SPACE = uus torn  •  ↩ = menüü', en:'SPACE = new tower  •  ↩ = menu'},
```

- [ ] **Step 6: Manual verification**

1. Enter TÄHED and clear all four gates. Expected: an in-world celebration at
   each gate, then exactly **one** result screen at the top listing the four
   letters learned.
2. Press SPACE. Expected: a brand-new tower with four different letters, no trip
   through the menu.
3. Press `Escape` on the result screen. Expected: back to the learn menu.
4. Repeat for SÕNAD. Expected: one four-letter word, one letter per gate, and
   the result screen shows the completed word.
5. Confirm the result cheer does not flicker between frames.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: one tower is four gates and one result screen"
```

---

### Task 10: HUD stars, translated chrome, respawn safety net

**Files:**
- Modify: `index.html` — HUD block in `drawLearn` (~2537–2590), `drawLearnMenu` (~2595), respawn block in `updateLearn`

- [ ] **Step 1: Add the remaining translation keys**

```js
  learn_find_letter:  {et:'LEIA TÄHT:',               en:'FIND THE LETTER:'},
  learn_find_syll:    {et:'LEIA SILP:',               en:'FIND THE SYLLABLE:'},
  learn_build_word:   {et:'LEIA TÄHED:',              en:'FIND THE LETTERS:'},
  learn_replay:       {et:'X = kuula uuesti',         en:'X = hear it again'},
  learn_back:         {et:'↩ = tagasi',               en:'↩ = back'},
  learn_title:        {et:'ÕPIME!',                   en:'LET\'S LEARN!'},
  learn_choose:       {et:'Vali harjutus:',           en:'Choose an exercise:'},
  learn_letters:      {et:'TÄHED',                    en:'LETTERS'},
  learn_letters_d:    {et:'Leia õige täht',           en:'Find the right letter'},
  learn_syllables:    {et:'SILBID',                   en:'SYLLABLES'},
  learn_syllables_d:  {et:'Leia õige silp',           en:'Find the right syllable'},
  learn_words:        {et:'SÕNAD',                    en:'WORDS'},
  learn_words_d:      {et:'Ehita sõna',               en:'Build the word'},
  learn_menu_hint:    {et:'← →  Vali  |  SPACE  Alusta', en:'← →  Choose  |  SPACE  Start'},
```

- [ ] **Step 2: Replace the HUD**

In `drawLearn`, replace from `const modeLabel=` through the
`ctx.fillText('⭐ '+(L.round+1)+…)` line with:

```js
  ctx.fillStyle='#ffdd00';ctx.font='bold 14px monospace';ctx.textAlign='center';
  const modeLabel=L.mode==='letters'?T('learn_find_letter')
                 :L.mode==='syllables'?T('learn_find_syll'):T('learn_build_word');
  ctx.fillText(modeLabel,BASE_W/2,16);

  const hudGate=L.gates[L.gateIdx];
  ctx.fillStyle='#ffffff';ctx.font='bold 28px monospace';
  ctx.fillText(hudGate?hudGate.target:'',BASE_W/2,40);

  // Progress as stars, not a score. A number means nothing to a pre-reader.
  const solvedCount=L.gates.filter(g=>g.solved).length;
  ctx.font='16px monospace';ctx.textAlign='left';
  for(let i=0;i<GATES_PER_TOWER;i++){
    ctx.fillStyle=i<solvedCount?'#ffdd00':'rgba(255,255,255,0.22)';
    ctx.fillText('★',8+i*18,hudH-6);
  }
  ctx.textAlign='left';
```

- [ ] **Step 3: Replace the footer hints and the celebration overlay**

Replace:

```js
  ctx.fillStyle='#ffffff55';ctx.font='9px monospace';ctx.fillText('ESC = tagasi',8,BASE_H-6);
```

with:

```js
  ctx.fillStyle='#ffffff55';ctx.font='9px monospace';
  ctx.fillText(T('learn_back'),8,BASE_H-6);
  ctx.textAlign='right';
  ctx.fillText(T('learn_replay'),BASE_W-8,BASE_H-6);
  ctx.textAlign='left';
```

The celebration overlay carries its *own* hardcoded Estonian cheer list and
reads `L.currentTarget`, a field that stops being set in Task 7. Replace:

```js
    const cheers=['TUBLI!','VÄGA HEA!','SUPER!','SUUREPÄRANE!','FANTASTILINE!'];
    ctx.fillText(cheers[L.round%cheers.length],BASE_W/2,BASE_H/2-10);
    ctx.fillStyle='#fff';ctx.font='16px monospace';
    ctx.fillText(L.currentTarget,BASE_W/2,BASE_H/2+25);
```

with:

```js
    ctx.fillText(L.resultCheer||T('learn_done'),BASE_W/2,BASE_H/2-10);
    ctx.fillStyle='#fff';ctx.font='16px monospace';
    ctx.fillText(L.mode==='words'?(L.currentWord||'')
                                 :L.gates.map(g=>g.target).join(' '),
                 BASE_W/2,BASE_H/2+25);
```

Finally, delete the now-unused field from the `learn` object literal:

```js
  currentTarget:'', // what to find
```

Confirm with `grep -n "currentTarget\|totalRounds" index.html` — both must
return nothing.

- [ ] **Step 4: Wire the replay key**

In `updateLearn`, immediately after the `const L=learn,p=L;` line:

```js
  if(justPressed['KeyX']){speakTarget();justPressed['KeyX']=false;}
```

- [ ] **Step 5: Translate the menu**

In `drawLearnMenu`:

| Replace | With |
|---|---|
| `ctx.fillText('ÕPIME!',BASE_W/2,60);` | `ctx.fillText(T('learn_title'),BASE_W/2,60);` |
| `ctx.fillText('Vali harjutus:',BASE_W/2,85);` | `ctx.fillText(T('learn_choose'),BASE_W/2,85);` |
| `ctx.fillText('← →  Vali  \|  SPACE  Alusta',BASE_W/2,340);` | `ctx.fillText(T('learn_menu_hint'),BASE_W/2,340);` |
| `ctx.fillText('ESC = tagasi',BASE_W/2,365);` | `ctx.fillText(T('learn_back'),BASE_W/2,365);` |

And replace the options array:

```js
  const opts=[
    {label:'TÄHED',desc:'Leia õige täht',emoji:'A B C',color:'#88ccff'},
    {label:'SILBID',desc:'Leia õige silp',emoji:'MA KA',color:'#ffaa66'},
    {label:'SÕNAD',desc:'Kirjuta sõna',emoji:'KASS',color:'#ff88cc'},
  ];
```

with:

```js
  const opts=[
    {label:T('learn_letters'),desc:T('learn_letters_d'),emoji:'A B C',color:'#88ccff'},
    {label:T('learn_syllables'),desc:T('learn_syllables_d'),emoji:'MA KA',color:'#ffaa66'},
    {label:T('learn_words'),desc:T('learn_words_d'),emoji:'KASS',color:'#ff88cc'},
  ];
```

- [ ] **Step 6: Relax the respawn net**

The full-width floors make real falls impossible, so this is now only a guard.
Replace:

```js
  let safeY=50;
  L.gates.forEach(g=>{if(g.solved)safeY=Math.min(safeY,g.y);});
  if(L.py>safeY+160){
    L.py=safeY-30;L.px=BASE_W/2-10;L.pvy=0;L.pvx=0;
  }
```

with:

```js
  // Safety net only: the full-width gate and landing floors mean a real fall
  // cannot happen. Kept generous in case a future layout reintroduces a gap.
  let safeY=50;
  L.platforms.forEach(pl=>{
    if((pl.isGate||pl.isLanding)&&pl.y<L.py+400)safeY=Math.min(safeY,pl.y);
  });
  if(L.py>safeY+400){
    L.py=safeY-30;L.px=BASE_W/2-10;L.pvy=0;L.pvx=0;L.rocketing=false;
  }
```

- [ ] **Step 7: Manual verification**

1. Enter TÄHED. Expected: four grey stars top-left, filling gold as you solve.
   No `Punktid:` number anywhere during the climb.
2. Press `X` mid-climb. Expected: the target letter is spoken again. On mobile,
   the 🏹 button does the same.
3. Press `L` in the learn menu. Expected: **every** string switches to English,
   including the mode cards and both footer hints.
4. Enter a climb and press `L`. Expected: nothing happens — the toggle is
   menu-only now.
5. Confirm the footer reads `↩ = tagasi` and `X = kuula uuesti`.
6. Finish a tower and watch the in-world celebration. Expected: a cheer plus
   the four letters (or the word), in the current language — not blank text.
7. `grep -n "currentTarget\|totalRounds" index.html` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: star progress, translated learn chrome, voice replay on X"
```

---

## Final verification

Run the full checklist from the spec before calling this done:

- [ ] `node scripts/run-tests.js` → all suites pass, 0 failures, exit 0
- [ ] `index.html?test=1` in a real browser → same result
- [ ] A held jump from a gate floor cannot reach the platform above
- [ ] A **tapped** jump on a correct arch still clears it (the jump-cut trap)
- [ ] A rocket from zone 0 and zone 2, not just the centre, lands above
- [ ] Once above a gate, the player cannot fall back below it
- [ ] Landing on a gate floor with jump held does not auto-submit
- [ ] All three zones reachable by walking, including via the wrap
- [ ] Back works from all 15 states — keyboard, DualSense, and touch
- [ ] △ does not change language mid-run; ○ backs out of menus; OPTIONS pauses
- [ ] Title prompt shows ✕ on the DualSense, not Ⓐ
- [ ] With no Estonian voice installed, the game is silent but fully playable
- [ ] Both languages: no hardcoded Estonian remains in learn mode

Then playtest with the kids. The one thing no test can answer is whether a
4-year-old understands that walking under an arch and jumping is how you
choose. Watch for that specifically, without explaining it first.
