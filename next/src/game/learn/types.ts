import type { BodyMover } from '../player';
import type { EffectCue, PlayerState, RumbleCue } from '../types';
import type { TowerLayout } from './tower';

/** A map cell: column and row of the tower's map. */
export interface Cell {
  col: number;
  row: number;
}

export interface TileEdit extends Cell {
  code: number;
}

export interface GateState {
  /** Answered right at least once. Scores once. */
  solved: boolean;
  /** Bumps at this gate count. False from a right answer until re-armed. */
  armed: boolean;
  mistakes: number;
  trapdoorOpen: boolean;
}

/**
 * What the scene has to show for a step, in the order it happened. Sounds ride
 * `Climb.sounds` and buzzes `Climb.rumbles`, exactly as the adventure's ride `World.sounds`
 * and `World.rumbles`.
 */
export type ClimbEvent =
  /** Map cells changed; mirror them on the Phaser layer. */
  | { type: 'tiles'; cells: TileEdit[] }
  | { type: 'bump-right'; storey: number; block: number }
  | { type: 'bump-wrong'; storey: number; block: number }
  /** Two misses at a gate: the right block should glow until found. */
  | { type: 'hint'; storey: number; block: number }
  /** The right block is back, after the hero ended up under its open trapdoor. */
  | { type: 'rearm'; storey: number; block: number }
  /** The hero is through; the storey's letter ceiling is plain floor from now on. */
  | { type: 'gate-closed'; storey: number }
  /** The hero has risen into storey `storey`; past the last storey is the roof. */
  | { type: 'storey'; storey: number }
  | { type: 'finished' };

/** A line for the voice: 'now' cuts off what is being said, 'after' waits its turn (audio/voice.ts). */
export interface SpeechCue {
  text: string;
  when: 'now' | 'after';
}

export interface Climb {
  layout: TowerLayout;
  player: PlayerState;
  gates: GateState[];
  /** Where the hero is: a storey index, or `layout.storeys.length` on the roof. */
  storey: number;
  /**
   * The storey whose letter floor the hero stood on when last on the ground; -1 if that
   * ground was anything else. A bump counts only from there.
   */
  lastGround: number;
  /** A spring is carrying the hero: no jump cut until the apex. */
  sprung: boolean;
  finished: boolean;
  score: number;
  sounds: EffectCue[];
  rumbles: RumbleCue[];
  events: ClimbEvent[];
  /** Lines for the voice, in order (game/learn/speech.ts). The scene speaks them and empties the list. */
  speech: SpeechCue[];
  /** Steps taken since the tower began: the voice's clock. */
  steps: number;
  /** The step the voice was last asked to speak on. */
  lastSpokeAt: number;
  /** The highest storey whose target has been said on arrival; the first is said as the tower starts. */
  announced: number;
}

/**
 * What a climb steps the hero with: game/player.ts's BodyMover, the scene's Arcade body or
 * the tests' towerMove. Which cells of the reported row the head hit is the climb's own rule
 * (climb.ts).
 */
export type ClimbMove = BodyMover;
