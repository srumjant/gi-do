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

/**
 * Returns the context, creating it on first use. Browsers refuse to start an
 * AudioContext outside a user gesture, so the live game calls this lazily from
 * inside playTone rather than at load — that is preserved here.
 *
 * The `typeof window` guard is load-bearing: the tests run in Vitest's `node`
 * environment, where `window` is not merely undefined but an unresolved
 * identifier, so touching it throws a ReferenceError rather than yielding
 * undefined. An injected context short-circuits before that line, but the
 * "no audio context" test deliberately sets null and would otherwise crash.
 */
export function ensureAudio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
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
