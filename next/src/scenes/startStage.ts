import { DEMOS } from '../data/demos';
import type { Stage } from '../data/stages';

/**
 * Where a run starts: the first stage, unless the address says `?level=N` — counted from 1, as
 * a person counts — to playtest one level without playing those before it. For example
 * `http://localhost:5173/gi-do/next/?level=2` is Doll Garden II. game/run.ts's startRun clamps it.
 */
export function requestedStage(): number {
  const n = Number(new URLSearchParams(window.location.search).get('level'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}

/**
 * A level played on its own: `?boss=poo` is Härra Kaka's bathroom (data/demos.ts), after the
 * difficulty and the hero are chosen. Null for anything else, and the run goes on as usual.
 */
export function requestedDemo(): Stage | null {
  const name = new URLSearchParams(window.location.search).get('boss');
  return name !== null && name in DEMOS ? DEMOS[name] : null;
}
