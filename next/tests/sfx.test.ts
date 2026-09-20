import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './helpers/fakeAudio';
import { setAudioContext } from '../src/audio/context';
import * as sfx from '../src/audio/sfx';
import { playTone } from '../src/audio/synth';
import { loadLegacySection } from './helpers/legacy';

// Every test in this file except the live-game comparison at the bottom wants playTone
// to actually run, against the FakeAudioContext below — that is how the existing tests
// observe oscillators. The comparison instead needs to intercept playTone's arguments.
// Rather than fork this file in two, playTone is wrapped in a vi.fn() that calls
// through to the real implementation by default, so every test above is unaffected,
// and only the comparison describe block swaps in a recording implementation.
vi.mock('../src/audio/synth', () => ({ playTone: vi.fn() }));

let fake: FakeAudioContext;
let realPlayTone: typeof playTone;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('../src/audio/synth')>(
    '../src/audio/synth',
  );
  realPlayTone = actual.playTone;
});

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakeAudioContext();
  setAudioContext(fake as unknown as AudioContext);
  vi.mocked(playTone).mockImplementation(realPlayTone);
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

// ============================================================================
// Compares the port's playTone call sequence against the live game's, effect by
// effect. index.html has nothing to import, so the eleven sfx* functions are
// evaluated straight out of it in a Node vm (see helpers/legacy.ts), with a stub
// playTone/setTimeout prelude standing in for the real ones. Both the legacy stub and
// the port's mocked playTone record every call — immediate or delayed — as
// [delay, freq, dur, type, vol, slideTo], so a mismatched number, waveform, or
// setTimeout delay on either side makes the two recordings disagree.
// ============================================================================

type RecordedCall = [
  delay: number,
  freq: number,
  dur: number,
  type: string | null,
  vol: number | null,
  slideTo: number | null,
];

interface LegacySfx {
  sfxJump(): void;
  sfxStomp(): void;
  sfxCoin(): void;
  sfxHurt(): void;
  sfxBlock(): void;
  sfxShoot(): void;
  sfxPickup(): void;
  sfxFart(): void;
  sfxBoing(): void;
  sfxCluck(): void;
  sfxWin(): void;
  CALLS: RecordedCall[];
  runTimers(): void;
  reset(): void;
}

// A Node vm context has no setTimeout, so this prelude supplies one: it queues
// (ms, fn) pairs instead of scheduling them for real, and runTimers() fires them back
// in ascending delay order — which is all that is needed here, since none of these
// eleven effects schedule a further setTimeout from inside an already-delayed callback.
const LEGACY_SFX_PRELUDE = `
  let NOW = 0;
  const CALLS = [];
  const TIMERS = [];
  function playTone(f, d, t, v, sl) {
    CALLS.push([NOW, f, d, t || null, v || null, sl === undefined ? null : sl]);
  }
  function setTimeout(fn, ms) { TIMERS.push([ms, fn]); return TIMERS.length; }
  function runTimers() {
    const ts = TIMERS.splice(0).sort((a, b) => a[0] - b[0]);
    for (const [ms, fn] of ts) { NOW = ms; fn(); }
    NOW = 0;
  }
  function reset() { CALLS.length = 0; TIMERS.length = 0; NOW = 0; }
`;

// Sliced from 'function sfxJump' rather than from the '//  SOUND ENGINE' banner above
// it, so the real playTone (index.html:299) is excluded and never shadows the stub.
const legacy = loadLegacySection<LegacySfx>({
  from: 'function sfxJump',
  to: '//  BACKGROUND MUSIC',
  prelude: LEGACY_SFX_PRELUDE,
  expose: [
    'sfxJump', 'sfxStomp', 'sfxCoin', 'sfxHurt', 'sfxBlock', 'sfxShoot',
    'sfxPickup', 'sfxFart', 'sfxBoing', 'sfxCluck', 'sfxWin',
    'CALLS', 'runTimers', 'reset',
  ],
});

describe('playTone call sequence matches the live game', () => {
  let portCalls: RecordedCall[];

  beforeEach(() => {
    // vi's fake-timer clock backs Date.now(): 0 for the synchronous call a sfx*
    // function makes on entry, and the scheduled delay once vi.runAllTimers() advances
    // the clock to fire a chained setTimeout — the same "delay since the effect
    // started" that the legacy prelude's NOW captures via its own timer queue.
    vi.setSystemTime(0);
    portCalls = [];
    vi.mocked(playTone).mockImplementation((f, d, t, v, sl) => {
      portCalls.push([Date.now(), f, d, t || null, v || null, sl === undefined ? null : sl]);
    });
  });

  for (const name of NAMES) {
    it(`${name} sends the live game's exact playTone arguments and delays`, () => {
      legacy.reset();
      legacy[name]();
      legacy.runTimers();

      sfx[name]();
      vi.runAllTimers();

      expect(portCalls).toEqual(legacy.CALLS);
    });
  }
});
