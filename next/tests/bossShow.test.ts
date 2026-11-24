import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/config/i18n';
import type { Villain } from '../src/data/levels';
import { STAGES } from '../src/data/stages';
import type { CourseBoss } from '../src/game/bosses';
import {
  BANNER, createBossShow, HEARTS, HINT_AFTER, HINT_EVERY, hintFor, HOP, LINE, SHRUG_GAP, SHRUGS, stepBossShow,
  type BossShowState, type ShowInput,
} from '../src/game/bossShow';
import { createWorld } from '../src/game/world';

const KINDS: Villain[] = ['dollQueen', 'pterodactyl', 'vanaToomas', 'pizzaChef', 'yeti', 'tRex'];

function bossOf(kind: Villain): CourseBoss {
  const stage = STAGES.find((s) => s.level.course?.boss?.kind === kind);
  if (!stage) throw new Error(`no stage for ${kind}`);
  const world = createWorld(stage.theme, 'normal', 'gigi', undefined, stage.level);
  if (!world.courseBoss) throw new Error(`no boss in ${stage.level.name}`);
  return world.courseBoss;
}

/** A show and a boss, driven a frame (one step) at a time. */
function drive(kind: Villain, hints = false) {
  const boss = bossOf(kind);
  const show: BossShowState = createBossShow();
  let frame = 0;
  const step = (events: string[] = [], extra: Partial<ShowInput> = {}) => {
    frame++;
    return stepBossShow(show, { boss, events, frame, heroDead: false, heroHasCape: false, hints, ...extra });
  };
  const wake = () => {
    const awake: Record<Villain, string> = {
      dollQueen: 'shielded', pterodactyl: 'flying', vanaToomas: 'marching', pizzaChef: 'cooking', yeti: 'windup', tRex: 'walking',
      poo: 'hopping',
    };
    (boss as { phase: string }).phase = awake[kind];
    return step(['wake']);
  };
  return { boss, show, step, wake };
}

describe('the boss show', () => {
  it('makes an entrance on waking: its taunt, a hop and the banner', () => {
    for (const kind of KINDS) {
      const d = drive(kind);
      const first = d.wake();
      expect(first).toMatchObject({ line: `boss_intro_${kind}`, newLine: true });
      expect(first.look.banner).toBe(1);
      const mid = Array.from({ length: HOP / 2 - 1 }, () => d.step()).pop()!;
      expect(mid.look.dy).toBeLessThan(-10);
      const later = Array.from({ length: BANNER }, () => d.step()).pop()!;
      expect(later.look.banner).toBe(0);
      expect(later.line).toBeNull();
    }
  });

  it('shrugs off what does not count, with a line no more often than every three seconds', () => {
    for (const kind of KINDS) {
      const d = drive(kind);
      d.wake();
      for (let i = 0; i < LINE; i++) d.step();
      const first = d.step([SHRUGS[kind][0]]);
      expect(first).toMatchObject({ line: `boss_shrug_${kind}`, newLine: true });
      expect(first.look.angle).not.toBe(0);
      let said = 0;
      for (let i = 1; i < SHRUG_GAP; i++) if (d.step([SHRUGS[kind][0]]).newLine) said++;
      expect(said).toBe(0);
      expect(d.step([SHRUGS[kind][0]]).newLine).toBe(true);
    }
  });

  it('says AI!, OI-OI!, AUH! in turn when hit, OH EI! on the last heart, and flashes', () => {
    const d = drive('tRex');
    d.wake();
    d.boss.hp = 3;
    const one = d.step(['hit']);
    expect(one.line).toBe('boss_hit_1');
    expect(one.look.flash).toBe(1);
    d.boss.hp = 2;
    expect(d.step(['hit']).line).toBe('boss_hit_2');
    d.boss.hp = 1;
    expect(d.step(['hit']).line).toBe('boss_last');
  });

  it('cuts a lesser line off with a hit, but not a hit with a lesser line', () => {
    const d = drive('yeti');
    d.wake();
    expect(d.step(['hit']).line).toBe('boss_hit_1');
    expect(d.step(['thud']).line).toBe('boss_hit_1');
  });

  it('laughs, once, when the hero is hurt or loses the cape', () => {
    const d = drive('pizzaChef');
    d.wake();
    for (let i = 0; i < LINE; i++) d.step();
    expect(d.step([], { heroDead: true }).line).toBe('boss_laugh');
    expect(d.step([], { heroDead: true }).newLine).toBe(false);
    for (let i = 0; i < LINE; i++) d.step([], { heroDead: false });
    d.step([], { heroHasCape: true });
    expect(d.step([], { heroHasCape: false }).line).toBe('boss_laugh');
  });

  it('blurts out a hint on Super Easy and Easy when the child is stuck, not on Normal, and a hit resets it', () => {
    const normal = drive('dollQueen');
    normal.wake();
    let said: string[] = [];
    for (let i = 0; i < HINT_AFTER + 10; i++) { const f = normal.step(); if (f.newLine) said.push(f.line!); }
    expect(said).toEqual([]);

    const easy = drive('dollQueen', true);
    easy.wake();
    said = [];
    for (let i = 0; i < HINT_AFTER + HINT_EVERY + 5; i++) { const f = easy.step(); if (f.newLine) said.push(f.line!); }
    expect(said).toEqual(['hint_target', 'hint_target']);

    easy.step(['hit']);
    said = [];
    for (let i = 0; i < HINT_AFTER - 5; i++) { const f = easy.step(); if (f.newLine) said.push(f.line!); }
    expect(said).toEqual([]);
  });

  it('hints at the tool the fight wants now, the T-Rex by his round', () => {
    const queen = bossOf('dollQueen');
    queen.phase = 'shielded';
    expect(hintFor(queen)).toBe('hint_target');
    queen.phase = 'dizzy';
    expect(hintFor(queen)).toBe('hint_head');
    const rex = bossOf('tRex');
    rex.phase = 'walking';
    expect(['bow', 'fart', 'bighead', 'chicken'].map((_, round) => { rex.round = round; return hintFor(rex); }))
      .toEqual(['hint_target', 'hint_fart', 'hint_bighead', 'hint_chicken']);
  });

  it('says its defeat line once, and from then on leaves the look plain for the view\'s own show', () => {
    for (const kind of KINDS) {
      const d = drive(kind);
      d.wake();
      (d.boss as { phase: string }).phase = 'defeated';
      d.boss.hp = 0;
      const beaten = d.step(['hit']);
      expect(beaten.line).toBe(`boss_beaten_${kind}`);
      expect(beaten.look).toMatchObject({ dy: 0, sx: 1, sy: 1, angle: 0, flash: 0, red: 0 });
      expect(d.step().newLine).toBe(false);
    }
  });

  it('goes redder as its hearts run out, and shuts its eyes asleep and dizzy', () => {
    const d = drive('vanaToomas');
    expect(d.step().look.eyesShut).toBe(true);
    d.wake();
    d.boss.hp = HEARTS.vanaToomas;
    expect(d.step().look.red).toBe(0);
    d.boss.hp = 1;
    expect(d.step().look.red).toBeCloseTo(0.35 * 2 / 3);
    d.boss.phase = 'hurt';
    expect(d.step().look.eyesShut).toBe(true);
  });

  it('only says lines that exist, in capitals', () => {
    const keys = new Set<string>(['boss_hit_1', 'boss_hit_2', 'boss_hit_3', 'boss_last', 'boss_laugh',
      'hint_target', 'hint_fart', 'hint_bighead', 'hint_chicken', 'hint_head', 'hint_jump_over']);
    for (const kind of KINDS) for (const k of ['intro', 'shrug', 'beaten']) keys.add(`boss_${k}_${kind}`);
    for (const key of keys) {
      const entry = TRANSLATIONS[key];
      expect({ key, there: Boolean(entry) }).toEqual({ key, there: true });
      for (const text of [entry.et, entry.en] as string[]) expect(text).toBe(text.toUpperCase());
    }
  });
});
