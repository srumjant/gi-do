import { beforeEach, describe, expect, it } from 'vitest';
import { hush, installVoice, speak, type VoiceSound, type VoiceSounds } from '../src/audio/voice';
import { VOICE_FILES } from '../src/audio/voiceFiles';
import { VOICE_CLIPS } from '../src/game/learn/voiceClips';

/** A clip as Phaser plays one: stopping it is not an end, and destroying it drops the listener. */
class FakeSound implements VoiceSound {
  private listener: (() => void) | null = null;

  constructor(readonly key: string, private readonly sounds: FakeSounds) {}

  play(): boolean {
    this.sounds.log.push(`play ${this.key}`);
    return this.sounds.audible;
  }
  stop(): boolean {
    this.sounds.log.push(`stop ${this.key}`);
    return true;
  }
  destroy(): void { this.listener = null; }
  once(_event: 'complete', listener: () => void): unknown {
    this.listener = listener;
    return this;
  }
  /** The clip reaches its end. */
  finish(): void { this.listener?.(); }
}

/** The part of Phaser's sound manager the voice uses, recording what it was asked. */
class FakeSounds implements VoiceSounds {
  log: string[] = [];
  /** False for a game with no audio at all, where nothing plays. */
  audible = true;
  private last: FakeSound | null = null;

  add(key: string): FakeSound {
    this.last = new FakeSound(key, this);
    return this.last;
  }
  /** The clip playing now reaches its end. */
  finish(): void { this.last?.finish(); }
}

describe('the voice', () => {
  let sounds: FakeSounds;
  let recorded: (key: string) => boolean;

  beforeEach(() => {
    sounds = new FakeSounds();
    recorded = () => true;
    installVoice(sounds, (key) => recorded(key));
  });

  it("says a line's clips one after another", () => {
    speak(['word-kass', 'letter-k'], 'now');
    expect(sounds.log).toEqual(['play word-kass']);
    sounds.finish();
    expect(sounds.log).toEqual(['play word-kass', 'play letter-k']);
    sounds.finish();
    expect(sounds.log).toEqual(['play word-kass', 'play letter-k']);
  });

  it('cuts off what is being said, and what is waiting, to say something now', () => {
    speak(['letter-a', 'cheer-1'], 'now');
    speak(['letter-b'], 'now');
    sounds.finish();
    expect(sounds.log).toEqual(['play letter-a', 'stop letter-a', 'play letter-b']);
  });

  it('waits its turn to say something after', () => {
    speak(['letter-a', 'cheer-1'], 'now');
    speak(['letter-b'], 'after');
    sounds.finish();
    sounds.finish();
    expect(sounds.log).toEqual(['play letter-a', 'play cheer-1', 'play letter-b']);
  });

  it('says something after at once when nothing is being said', () => {
    speak(['letter-b'], 'after');
    expect(sounds.log).toEqual(['play letter-b']);
  });

  it('skips a clip not recorded yet: silence, never another voice', () => {
    recorded = (key) => key !== 'cheer-1';
    speak(['letter-a', 'cheer-1', 'letter-b'], 'now');
    sounds.finish();
    expect(sounds.log).toEqual(['play letter-a', 'play letter-b']);
  });

  it('hushes: stops what is being said, and what is waiting', () => {
    speak(['letter-a', 'cheer-1'], 'now');
    hush();
    sounds.finish();
    expect(sounds.log).toEqual(['play letter-a', 'stop letter-a']);
    speak(['letter-b'], 'after');
    expect(sounds.log).toEqual(['play letter-a', 'stop letter-a', 'play letter-b']);
  });

  it('goes on in silence in a game with no audio, never stuck waiting', () => {
    sounds.audible = false;
    speak(['letter-a', 'letter-b'], 'now');
    speak(['letter-c'], 'after');
    expect(sounds.log).toEqual(['play letter-a', 'play letter-b', 'play letter-c']);
  });

  it('holds only recordings of clips the game asks for', () => {
    const known = new Set(VOICE_CLIPS.map((clip) => clip.key));
    for (const key of VOICE_FILES.keys()) expect(known).toContain(key);
  });
});
