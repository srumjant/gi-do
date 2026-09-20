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
context.runSelfTests();
const r = context.TEST_RESULTS || { pass: 0, fail: 1 };
process.exit(r.fail > 0 ? 1 : 0);
