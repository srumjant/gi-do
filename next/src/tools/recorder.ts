import { VOICE_CLIPS, type VoiceGroup } from '../game/learn/voiceClips';
import { CLIP_RATE, encodeWav, resample, trimAndLevel } from './clipAudio';

/**
 * The voice recorder: record.html on the dev server, for the owner to record the learn tower's
 * voice one clip at a time. Space starts and stops a recording; the clip is trimmed, levelled,
 * saved into the project (src/assets/voice/<key>.wav, through vite.config.ts's endpoint) and
 * played back, and the next clip comes up. Dev only: the production build has no such page.
 */

const HINTS: Readonly<Record<VoiceGroup, string>> = {
  letter: 'Say the letter’s sound, not its name',
  syllable: 'Say the syllable',
  word: 'Say the word',
  cheer: 'Say the cheer, happily!',
};

const app = document.getElementById('app');
let index = 0;
let recorded = new Set<string>();
let status = '';
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let busy = false;

function render(): void {
  if (!app) return;
  const clip = VOICE_CLIPS[index];
  const done = VOICE_CLIPS.filter((c) => recorded.has(c.key)).length;
  const recording = recorder?.state === 'recording';
  app.innerHTML = `
    <h1>Gigi &amp; Dodo: voice recorder</h1>
    <p class="help">
      <kbd>Space</kbd> record, and <kbd>Space</kbd> again to stop: it is trimmed, saved and played back,
      and the next one comes up. <kbd>←</kbd> <kbd>→</kbd> move, <kbd>P</kbd> plays the saved clip.
      Letters are said as their sound.
    </p>
    <div class="card">
      <div class="item">${clip.say}</div>
      <div class="hint">${HINTS[clip.group]}${recorded.has(clip.key) ? ' · ✓ recorded' : ''}</div>
      <div class="status${recording ? ' recording' : ''}">${recording ? '● Recording… Space to stop' : status}</div>
      <div class="progress">${done} / ${VOICE_CLIPS.length} recorded</div>
    </div>
    <div class="grid">
      ${VOICE_CLIPS.map((c, i) => `<button data-i="${i}" class="${recorded.has(c.key) ? 'done' : ''}${i === index ? ' current' : ''}">${c.say}</button>`).join('')}
    </div>`;
  app.querySelectorAll<HTMLButtonElement>('.grid button').forEach((button) => {
    button.onclick = () => {
      index = Number(button.dataset.i);
      status = '';
      render();
    };
  });
}

function move(delta: number): void {
  index = (index + delta + VOICE_CLIPS.length) % VOICE_CLIPS.length;
  status = '';
  render();
}

async function toggle(): Promise<void> {
  if (busy) return;
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  // The microphone stays open between clips, so the browser asks only once.
  stream ??= await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
  });
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => void save(new Blob(chunks, { type: rec.mimeType }));
  recorder = rec;
  rec.start();
  render();
}

async function save(recording: Blob): Promise<void> {
  const clip = VOICE_CLIPS[index];
  busy = true;
  status = 'Saving…';
  render();
  try {
    const wav = await toWav(recording);
    if (!wav) {
      status = 'Heard nothing. Press Space and try again.';
      return;
    }
    const response = await fetch(`__voice/${clip.key}`, { method: 'PUT', body: wav });
    if (!response.ok) throw new Error(`the dev server said ${response.status}`);
    recorded.add(clip.key);
    status = 'Saved. Listen…';
    render();
    await play(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    index = Math.min(index + 1, VOICE_CLIPS.length - 1);
    status = recorded.size === VOICE_CLIPS.length ? 'All done. Thank you!' : '';
  } catch (error) {
    status = `Not saved: ${String(error)}`;
  } finally {
    busy = false;
    render();
  }
}

/** The recording, decoded, as a trimmed and levelled WAV file; null if nothing was heard. */
async function toWav(recording: Blob): Promise<ArrayBuffer | null> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await recording.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      buffer.getChannelData(ch).forEach((s, i) => { mono[i] += s / buffer.numberOfChannels; });
    }
    const speech = trimAndLevel(mono, buffer.sampleRate);
    return speech ? encodeWav(resample(speech, buffer.sampleRate, CLIP_RATE), CLIP_RATE) : null;
  } finally {
    void context.close();
  }
}

function play(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) void toggle();
  } else if (e.code === 'ArrowRight') move(1);
  else if (e.code === 'ArrowLeft') move(-1);
  else if (e.code === 'KeyP' && recorded.has(VOICE_CLIPS[index].key)) {
    void play(`src/assets/voice/${VOICE_CLIPS[index].key}.wav?t=${Date.now()}`);
  }
});

async function start(): Promise<void> {
  recorded = new Set(await (await fetch('__voice')).json() as string[]);
  const next = VOICE_CLIPS.findIndex((clip) => !recorded.has(clip.key));
  index = next < 0 ? 0 : next;
  render();
}

void start();
