import { courseLevel } from '../course';
import { HOME_THEME } from '../levels';
import { POO_ARENA } from './vannituba';

/**
 * Home, level 3: the evening, and the end of the run (docs/superpowers/specs/2026-11-24-home-world-design.md).
 * The bath is filling: a wet floor and shampoo bottles squirting soap; the bath, crossed on the
 * rubber ducks drifting on it; then the toilet: the door shuts, and Härra Kaka (POO_ARENA, the
 * same bathroom as ?boss=poo's).
 */
export const OHTU = courseLevel({
  name: 'Evening',
  theme: HOME_THEME,
  ending: 'boss',
  boss: 'poo',
  indoors: true,
  home: true,
  // A dusky evening wallpaper, white tiles underfoot, blue tiles on the walls.
  look: { bg: '#b9a6d6', groundColor: '#e9eef2', groundTop: '#ffffff', brickColor: '#8fc3d8' },
  sections: [
    // the bath is filling: a wet floor, and shampoo bottles squirting soap along it; the bow after
    // the potty, so a respawn there finds it again (browser, 2026-11-24)
    [
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '..P.....................................',
      '........................................',
      '.....F...b..........m...........m.......',
      '############IIIIIIIIIIIIIIIIIIIIIII#####',
      '########################################',
    ],
    // the bath: climb on the rim, then duck to duck across, and off the far rim; fall in and
    // it is back to the potty. A towel shelf over the near end: a Super Easy running jump up onto
    // the rim flew over it into the water (browser, 2026-11-24); under the shelf it bumps its head
    // and lands on the rim, and hops from the rim onto the ducks stay small.
    [
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '........................................',
      '....BBBBBBB.............................',
      '........................................',
      '........................................',
      '........................................',
      '......BB..q.......q.......q.....BB......',
      '......BB________________________BB......',
      '..F...BB________________________BB......',
      '########________________________########',
      '########________________________########',
    ],
    // the toilet: the door shuts, Härra Kaka
    POO_ARENA,
  ],
  furniture: [
    { kind: 'nightWindow', section: 0, x: 14, y: 17, w: 3, h: 3 },
    { kind: 'towel', section: 0, x: 26, y: 18, w: 2, h: 3 },
    { kind: 'shelf', section: 1, x: 4, y: 16, w: 7, h: 2 },
    { kind: 'tubEnd', section: 1, x: 6, y: 22, w: 2, h: 3 },
    { kind: 'tubEnd', section: 1, x: 32, y: 22, w: 2, h: 3 },
    { kind: 'nightWindow', section: 1, x: 18, y: 15, w: 3, h: 3 },
  ],
});
