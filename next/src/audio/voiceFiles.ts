import type Phaser from 'phaser';

/**
 * The voice's recordings in the project, by key (src/assets/voice/<key>.wav, made with the
 * recorder, record.html). Vite finds them when it builds, so a clip not recorded yet is simply
 * not here, and the voice skips it (audio/voice.ts).
 */
const FILES = import.meta.glob('../assets/voice/*.wav', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const VOICE_FILES: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.wav'.length), url]),
);

/**
 * Queues every recording not loaded yet, on a scene's loader. The tower calls it from
 * `preload()`, so Phaser holds its `create()` until the voice is in; later towers find it loaded.
 */
export function preloadVoice(scene: Phaser.Scene): void {
  for (const [key, url] of VOICE_FILES) {
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, url);
  }
}
