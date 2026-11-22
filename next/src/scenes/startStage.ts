/**
 * Where a run starts: the first stage, unless the address says `?level=N` — counted from 1, as
 * a person counts — to playtest one level without playing those before it. For example
 * `http://localhost:5173/gi-do/next/?level=2` is Doll Garden II. game/run.ts's startRun clamps it.
 */
export function requestedStage(): number {
  const n = Number(new URLSearchParams(window.location.search).get('level'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}
