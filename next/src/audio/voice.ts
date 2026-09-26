/**
 * The learn tower's voice: the owner's recordings, one clip per letter, syllable, word and
 * cheer (game/learn/voiceClips.ts), played through Phaser's sound manager. A line is clips in
 * order. 'now' cuts off whatever is being said or waiting, as a target said again should;
 * 'after' waits its turn, so the next storey's target never talks over a cheer. A clip not
 * recorded yet is skipped: silence, never another voice.
 */

/** The part of Phaser's sound manager the voice uses (a fake in tests/voice.test.ts). */
export interface VoiceSounds {
  add(key: string): VoiceSound;
}

/** The part of a Phaser sound the voice uses. */
export interface VoiceSound {
  play(): boolean;
  stop(): boolean;
  destroy(): void;
  once(event: 'complete', listener: () => void): unknown;
}

let sounds: VoiceSounds | null = null;
let recorded: (key: string) => boolean = () => false;
/** The clip playing now, and the ones still to come after it, in order. */
let playing: VoiceSound | null = null;
let queue: string[] = [];

/**
 * Hands the voice the game's sound manager, and a way to ask whether a clip is loaded.
 * Called once, at boot (main.ts).
 */
export function installVoice(manager: VoiceSounds, isRecorded: (key: string) => boolean): void {
  hush();
  sounds = manager;
  recorded = isRecorded;
}

/** Says a line: its clips, one after another. */
export function speak(clips: readonly string[], when: 'now' | 'after'): void {
  if (!sounds) return;
  if (when === 'now') hush();
  queue.push(...clips.filter((key) => recorded(key)));
  if (!playing) playNext();
}

/** Stops whatever is being said, and whatever is waiting: leaving the tower should be quiet. */
export function hush(): void {
  queue = [];
  const sound = playing;
  playing = null;
  sound?.stop();
  sound?.destroy();
}

function playNext(): void {
  const key = queue.shift();
  if (key === undefined || !sounds) return;
  const sound = sounds.add(key);
  playing = sound;
  // A clip cut off (hush) never completes: Phaser's stop is not an end, and destroy drops the listener.
  sound.once('complete', () => {
    sound.destroy();
    playing = null;
    playNext();
  });
  // A game with no audio at all plays nothing and never completes: go straight on, in silence.
  if (!sound.play()) {
    sound.destroy();
    playing = null;
    playNext();
  }
}
