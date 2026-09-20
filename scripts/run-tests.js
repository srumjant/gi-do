#!/usr/bin/env node
// Runs the game's in-file self-tests headlessly.
//
// index.html is a single file with one inline <script>. We evaluate that exact
// script in a VM with a minimal DOM shim, then call runSelfTests(). Because it
// loads the real file, the tests exercise the real functions — nothing is
// copied or reimplemented here, so the tests cannot drift from the game.
//
// Exit codes:
//   0  all assertions passed
//   1  assertions failed
//   2  the script or the tests threw
//   3  the harness is not wired up correctly (see the messages below)
//
// WHAT THIS SHIM CAN AND CANNOT PROVE. It models enough of the browser to load
// and exercise pure logic. For any API it does not fully model — speech
// synthesis, gamepads, real canvas output — it proves only that the game
// DEGRADES GRACEFULLY when the API is missing. It cannot prove the feature
// works when the API is present. A green run here is not evidence that voice
// is spoken, that rumble fires, or that anything is drawn correctly; those
// need a real browser and, for feel, a real child.
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
