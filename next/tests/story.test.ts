import { describe, expect, it } from 'vitest';
import { HOME_THEME } from '../src/data/levels';
import { STAGES } from '../src/data/stages';
import { TRANSLATIONS } from '../src/config/i18n';
import { fill, scriptFor, transitionInto, villainOf, worlds, type Line } from '../src/game/story';

describe('the story', () => {
  it('has a villain for every world, the T-Rex, then Härra Kaka at home', () => {
    expect(worlds().map(villainOf)).toEqual(['dollQueen', 'pterodactyl', 'vanaToomas', 'pizzaChef', 'yeti', 'tRex', 'poo']);
  });

  it('opens with the first world\'s villain snatching the sibling, and the map at world 1', () => {
    expect(transitionInto(0, true)).toEqual({ kind: 'opening', villain: 'dollQueen', world: 0 });
    expect(scriptFor(transitionInto(0, true)!)).toMatchObject({
      grab: { key: 'story_wants' }, mapTitle: { key: 'story_save' }, mapSub: { worldNumber: 1, worldKey: 'world_1' },
    });
  });

  it('names the villain being chased after a world\'s first and second levels, and which level is next', () => {
    expect(transitionInto(1)).toEqual({ kind: 'chase', villain: 'dollQueen', world: 0, level: 2, levels: 3 });
    expect(transitionInto(2)).toEqual({ kind: 'chase', villain: 'dollQueen', world: 0, level: 3, levels: 3 });
    expect(scriptFor(transitionInto(2)!).headline).toEqual({ key: 'story_follow', villainKey: 'villain_dollQueen_par' });
  });

  it('after a boss: the beaten boss owns up, the next world\'s villain snatches the sibling, the map shows the next world', () => {
    const t = transitionInto(3)!;
    expect(t).toEqual({ kind: 'worldChange', beaten: 'dollQueen', villain: 'pterodactyl', world: 1, finalWorld: false });
    expect(scriptFor(t)).toMatchObject({
      beaten: { key: 'story_sent_me' },
      grab: { key: 'story_wants' },
      headline: { key: 'story_took', villainKey: 'villain_pterodactyl' },
      mapTitle: { key: 'story_world', worldNumber: 2, worldKey: 'world_2' },
    });
  });

  it('has the T-Rex come for the sibling himself before his castle', () => {
    const into = STAGES.findIndex((s) => s.theme === 5);
    const t = transitionInto(into)!;
    expect(t).toMatchObject({ kind: 'worldChange', beaten: 'yeti', villain: 'tRex', finalWorld: false });
    expect(scriptFor(t).grab).toEqual({ key: 'story_now_me' });
  });

  it('takes the kids home after the T-Rex: he is tiny now, Härra Kaka snatches the sibling, the map shows home', () => {
    const t = transitionInto(STAGES.findIndex((s) => s.theme === HOME_THEME))!;
    expect(t).toEqual({ kind: 'worldChange', beaten: 'tRex', villain: 'poo', world: 6, finalWorld: true });
    expect(scriptFor(t)).toMatchObject({
      beaten: { key: 'story_tiny_now' },
      grab: { key: 'story_poo_grab' },
      headline: { key: 'story_took', villainKey: 'villain_poo' },
      mapTitle: { key: 'story_world', worldNumber: 7, worldKey: 'world_7' },
    });
  });

  it('has a transition for every stage after the first, and every line it says is a word in capitals', () => {
    const keys = new Set<string>();
    const add = (l?: Line) => {
      if (!l) return;
      keys.add(l.key);
      if (l.villainKey) keys.add(l.villainKey);
      if (l.worldKey) keys.add(l.worldKey);
    };
    for (let i = 1; i < STAGES.length; i++) {
      const t = transitionInto(i);
      expect({ i, kind: t?.kind ?? null }).not.toEqual({ i, kind: null });
      const s = scriptFor(t!);
      [s.grab, s.beaten, s.headline, s.mapTitle, s.mapSub].forEach(add);
    }
    [scriptFor(transitionInto(0, true)!).grab, scriptFor(transitionInto(0, true)!).mapTitle].forEach(add);
    for (const key of keys) {
      const entry = TRANSLATIONS[key];
      expect({ key, there: Boolean(entry) }).toEqual({ key, there: true });
      for (const text of [entry.et, entry.en] as string[]) expect({ key, text }).toEqual({ key, text: text.toUpperCase() });
    }
  });

  it('puts the names into a line', () => {
    expect(fill('%V VIIS %S ÄRA!', { villain: 'PTERODAKTÜL', sibling: 'DODO' })).toBe('PTERODAKTÜL VIIS DODO ÄRA!');
    expect(fill('T-REX TAHAB %ST!', { sibling: 'DODO' })).toBe('T-REX TAHAB DODOT!');
    expect(fill('MAAILM %N: %W', { worldNumber: 2, world: 'DINOSAURUSE KANJON' })).toBe('MAAILM 2: DINOSAURUSE KANJON');
  });
});
