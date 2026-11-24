import type {
  BossDef, BossKind, CourseDef, EnemyDef, Furniture, Level, LevelEnding, StationKind, TileMap, Villain,
} from './levels';
import {
  isSolid, LEVELS, TILE_BRICK, TILE_CRACKED, TILE_EMPTY, TILE_GATE, TILE_GROUND, TILE_ICE, TILE_LAVA,
  TILE_PLANK, TILE_QUESTION, TILE_RAINBOW, TILE_SPRING, TILE_WATER,
} from './levels';

/**
 * The ASCII format the hand-built levels are written in — each theme's second level
 * (data/levels2/, docs/superpowers/specs/2026-11-22-extra-levels-design.md) — and the parser
 * and builder that turn one into a level record.
 *
 * A level is a list of sections, one per obstacle, laid side by side left to right; every
 * section is 25 rows, the same height as the adventure's levels, with the ground in the
 * bottom two.
 *
 *   .  air                       #  ground                B  brick
 *   ?  question block (a star)   C  cracked block: a big head smashes it
 *   S  spring
 *   =  drawbridge: empty until its target is shot, then planks are laid across
 *   |  gate: bars until its target is shot, then they lift away
 *   T  target: shoot it with the bow. It opens every = and | run nearer to it than to any
 *      other target, so put a target next to what it opens. Keep it within about 10 tiles of
 *      where the player stands to shoot: the camera shows ~13 ahead.
 *   !  rainbow block: a random silly power-up    @  the cat
 *   t  a helper target: the T nearest it opens only once this is hit too
 *   :  door: open until the player is through it, then it shuts behind them
 *   Q  the boss, where she stands    1 2 3  where her targets stand, round by round
 *   ~  lava: falling in is a fall     v  a vent in the lava: it spits fireballs straight up
 *   I  ice: solid, and you slide on it     _  icy water: falling in is a fall, as lava
 *   b  bow       c  cape       f  fart jump     h  big head     k  chicken ray
 *      (these come back a few seconds after they are taken)
 *   F  checkpoint flag: a death brings you back to the last one you touched
 *   P  where the hero starts     R  where the sibling waits
 *   d  doll   n  dino   a  bat   x  car   o  cannon   u  bouncer   p  penguin   i  ice bat
 *   D  N  K  Z  W  L  a ZOMBIE doll, dino, knight, cook, penguin or toy soldier: it can't be
 *      stomped, it pushes you back, an arrow puts it down. Only zombies wear a knight's armour,
 *      a cook's hat or a tin soldier's coat, so K, Z and L have no lower case; W (a waddle)
 *      because P is the hero's start.
 *   g  giant: in the way, never hurts (a stomp bounces off, arrows too); only a chicken ray
 *      moves him. Put him where no jump gets over: under a roof 4 tiles up.
 *   w  a dripping tap: now and then a drop falls straight down from it (the home world)
 *   s  smelly sock (walks, like a doll)    y  fly (flies, like a bat)
 *   H  hairbrush: only ever a zombie, since nobody stomps on a hairbrush
 *   j  plunger: stays where it is and jumps straight up, again and again
 *   O  soap dish: lets go of a bubble to ride now and then
 *   X  toilet brush: spins round the middle of its cell; nothing stops it
 *   q  rubber duck on the bath below it: the ducks on one bath share it out, each drifting back
 *      and forth over its own stretch, neighbours meeting at the border
 *   m  shampoo bottle: squirts soap blobs, as a cannon fires
 *
 * Size obstacles from the jump itself (tests/helpers/courseRuns.ts's jumpRise): a held jump
 * lifts the feet 6.1 tiles on super easy and 3.9 on hard, a fart jump 13.9 and 8.8. So a
 * wall only a fart clears is 7 tall, a tunnel nobody jumps an enemy in is 2, a chasm nobody
 * jumps (or is carried over by a cape's rescue from the middle) is 18 wide.
 */

const ENEMY_LETTERS: Record<string, string> = {
  d: 'doll', n: 'dino', a: 'bat', x: 'car', o: 'cannon', u: 'bouncer', p: 'penguin', g: 'giant',
  i: 'icebat', s: 'sock', y: 'fly', j: 'plunger', m: 'shampoo',
};
/** Upper case is the same walker as a zombie (EnemyState.zombie). */
const ZOMBIE_LETTERS: Record<string, string> = {
  D: 'doll', N: 'dino', K: 'knight', Z: 'cook', W: 'penguin', L: 'soldier', H: 'hairbrush',
};

const STATION_LETTERS: Record<string, StationKind> = {
  b: 'bow', c: 'cape', f: 'fart', h: 'bighead', k: 'chicken',
};

const TILE_LETTERS: Record<string, number> = {
  '#': TILE_GROUND, B: TILE_BRICK, '?': TILE_QUESTION, C: TILE_CRACKED, S: TILE_SPRING, '|': TILE_GATE,
  '!': TILE_RAINBOW,
  '~': TILE_LAVA, v: TILE_LAVA,
  I: TILE_ICE, _: TILE_WATER,
};

/** The sections laid side by side into one picture, a string per row. */
export function joinSections(sections: readonly (readonly string[])[]): string[] {
  const height = sections[0].length;
  for (const section of sections) {
    if (section.length !== height) throw new Error('every course section must be the same height');
    const width = section[0].length;
    if (section.some((row) => row.length !== width)) {
      throw new Error('every row of a course section must be the same width');
    }
  }
  return Array.from({ length: height }, (_, y) => sections.map((s) => s[y]).join(''));
}

/** Everything a picture describes, as the level record and the course need it. */
export interface ParsedCourse {
  map: TileMap;
  playerStart: [number, number];
  rescuePos: [number, number];
  enemyDefs: EnemyDef[];
  /** The column the cat waits in (@), or null. */
  cat: number | null;
  course: CourseDef;
}

/** The first solid row at or below `y` in column `x`, which is what anything there stands on. */
function floorBelow(map: TileMap, x: number, y: number): number {
  for (let ty = y; ty < map.length; ty++) if (isSolid(map[ty][x])) return ty;
  return map.length - 2;
}

type Cell = { x: number; y: number; to: number };

/** Every run of = (a row) and of | (a column), each as the cells it changes, in order. */
function mechanisms(rows: readonly string[]): Cell[][] {
  const runs: Cell[][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '=' || row[x - 1] === '=') continue;
      const run: Cell[] = [];
      for (let x1 = x; row[x1] === '='; x1++) run.push({ x: x1, y, to: TILE_PLANK });
      runs.push(run.reverse()); // laid from the far side back towards the player
    }
  });
  for (let x = 0; x < rows[0].length; x++) {
    for (let y = 0; y < rows.length; y++) {
      if (rows[y][x] !== '|' || rows[y - 1]?.[x] === '|') continue;
      const run: Cell[] = [];
      for (let y1 = y; rows[y1]?.[x] === '|'; y1++) run.push({ x, y: y1, to: TILE_EMPTY });
      runs.push(run.reverse()); // lifted from the bottom up
    }
  }
  return runs;
}

/** Tiles apart, counting a diagonal step as one. */
function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** How far a target is from a run: its nearest cell. */
function distance(t: { x: number; y: number }, run: Cell[]): number {
  return Math.min(...run.map((c) => chebyshev(c, t)));
}

/** Every run of `:` (a column): a door that shuts once the player is through it. */
function doorsIn(rows: readonly string[]): CourseDef['doors'] {
  const doors: CourseDef['doors'] = [];
  for (let x = 0; x < rows[0].length; x++) {
    for (let y = 0; y < rows.length; y++) {
      if (rows[y][x] !== ':' || rows[y - 1]?.[x] === ':') continue;
      const cells: Array<{ x: number; y: number }> = [];
      for (let y1 = y; rows[y1]?.[x] === ':'; y1++) cells.push({ x, y: y1 });
      doors.push({ x, cells });
    }
  }
  return doors;
}

/**
 * The ducks on their baths: each finds the water under it, and the ducks on one run of water
 * share it out in order, so each drifts over a stretch of its own (game/course.ts).
 */
function ducksOn(map: TileMap, marks: Array<{ x: number; y: number }>): NonNullable<CourseDef['ducks']> {
  const found = marks.map((m) => {
    let y = m.y;
    while (y < map.length && map[y][m.x] !== TILE_WATER) y++;
    if (y >= map.length) throw new Error(`the duck at ${m.x},${m.y} has no water under it`);
    let a = m.x;
    while (map[y][a - 1] === TILE_WATER) a--;
    let b = m.x;
    while (map[y][b + 1] === TILE_WATER) b++;
    return { x: m.x, y, a, b };
  });
  return found.map((d) => {
    const same = found.filter((o) => o.y === d.y && o.a === d.a).sort((p, q) => p.x - q.x);
    const i = same.indexOf(d);
    const len = d.b - d.a + 1;
    return {
      x: d.x, y: d.y,
      left: d.a + Math.floor((i * len) / same.length),
      right: d.a + Math.floor(((i + 1) * len) / same.length) - 1,
    };
  }).sort((p, q) => p.x - q.x);
}

export function parseCourse(rows: readonly string[]): ParsedCourse {
  const map: TileMap = rows.map((row) => [...row].map((ch) => TILE_LETTERS[ch] ?? TILE_EMPTY));
  let playerStart: [number, number] | null = null;
  let rescuePos: [number, number] | null = null;
  const enemyDefs: EnemyDef[] = [];
  const targets: Array<{ x: number; y: number }> = [];
  let queen: { x: number; y: number } | null = null;
  let cat: number | null = null;
  const helpers: Array<{ x: number; y: number }> = [];
  const spots: Array<{ n: number; x: number; y: number }> = [];
  const vents: CourseDef['vents'] = [];
  const taps: Array<{ x: number; y: number }> = [];
  const soaps: Array<{ x: number; y: number }> = [];
  const brushes: Array<{ x: number; y: number }> = [];
  const duckMarks: Array<{ x: number; y: number }> = [];
  const stations: CourseDef['stations'] = [];
  const flags: CourseDef['flags'] = [];

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'P') playerStart = [x, y];
      else if (ch === 'R') rescuePos = [x, y];
      else if (ch === 'Q') queen = { x, y: floorBelow(map, x, y) };
      else if (ch === '@') cat = x;
      else if (ch === 'v') vents.push({ x, y });
      else if (ch === 'w') taps.push({ x, y });
      else if (ch === 'O') soaps.push({ x, y: floorBelow(map, x, y) });
      else if (ch === 'X') brushes.push({ x, y });
      else if (ch === 'q') duckMarks.push({ x, y });
      else if (ch === 't') helpers.push({ x, y });
      else if (ch >= '1' && ch <= '9') spots.push({ n: Number(ch), x, y });
      else if (ch === 'T') targets.push({ x, y });
      else if (ch === 'F') flags.push({ x, y: floorBelow(map, x, y) });
      else if (ch in STATION_LETTERS) stations.push({ kind: STATION_LETTERS[ch], x, y });
      else if (ch in ENEMY_LETTERS) {
        enemyDefs.push({ type: ENEMY_LETTERS[ch], x, floorRow: floorBelow(map, x, y) });
      } else if (ch in ZOMBIE_LETTERS) {
        enemyDefs.push({ type: ZOMBIE_LETTERS[ch], x, floorRow: floorBelow(map, x, y), zombie: true });
      }
    }
  });

  if (!playerStart || !rescuePos) throw new Error('a course needs a P and an R');
  // Left to right, the order a child meets them in (and the order tests list them in).
  enemyDefs.sort((a, b) => a.x - b.x);
  targets.sort((a, b) => a.x - b.x);
  stations.sort((a, b) => a.x - b.x);
  flags.sort((a, b) => a.x - b.x);

  const owned: Cell[][] = targets.map(() => []);
  for (const run of mechanisms(rows)) {
    if (targets.length === 0) throw new Error('a bridge or gate with no target to open it');
    let best = 0;
    targets.forEach((t, i) => { if (distance(t, run) < distance(targets[best], run)) best = i; });
    owned[best].push(...run);
  }
  targets.forEach((t, i) => {
    if (owned[i].length === 0) throw new Error(`the target at ${t.x},${t.y} opens nothing`);
  });

  helpers.sort((a, b) => a.x - b.x);
  const partOf = helpers.map((h) => {
    if (targets.length === 0) throw new Error(`the helper target at ${h.x},${h.y} has no T to help`);
    let best = 0;
    targets.forEach((t, i) => { if (chebyshev(h, t) < chebyshev(h, targets[best])) best = i; });
    return best;
  });

  const doors = doorsIn(rows);
  let boss: BossDef | undefined;
  const found = queen as { x: number; y: number } | null;
  if (found) {
    spots.sort((a, b) => a.n - b.n);
    const behind = doors.filter((d) => d.x < found.x).map((d) => d.x + 4);
    const rx = (rescuePos as [number, number])[0];
    boss = {
      kind: 'dollQueen',
      x: found.x,
      y: found.y,
      spots: spots.map(({ x, y }) => ({ x, y })),
      // From just inside her door (or ten tiles before her, with no door) to just short of the cage.
      patrol: [behind.length > 0 ? Math.max(...behind) : found.x - 10, rx > found.x ? rx - 3 : rows[0].length - 3],
    };
  }

  return {
    map, playerStart, rescuePos, enemyDefs, cat: cat as number | null,
    course: {
      targets: [
        ...targets.map((t, i) => ({ ...t, cells: owned[i] })),
        ...helpers.map((h, i) => ({ ...h, cells: [], partOf: partOf[i] })),
      ],
      stations,
      flags,
      doors,
      vents,
      ...(taps.length > 0 ? { taps } : {}),
      ...(soaps.length > 0 ? { soaps } : {}),
      ...(brushes.length > 0 ? { brushes } : {}),
      ...(duckMarks.length > 0 ? { ducks: ducksOn(map, duckMarks) } : {}),
      ...(boss ? { boss } : {}),
    },
  };
}

/** A piece of furniture as a level file writes it: `x` counted from the start of `section`. */
export interface FurnitureSpec extends Furniture {
  section: number;
}

/** What a second level is made of: its sections and which theme it belongs to. */
export interface CourseLevelSpec {
  /** The English name it was authored under (the screens use its translation key). */
  name: string;
  /** 0-5: the classic level whose colours and clouds it borrows; HOME_THEME has none. */
  theme: number;
  sections: readonly (readonly string[])[];
  /**
   * Colours instead of the theme's, for a ground that stands out against its hills. A theme
   * with no classic level behind it (HOME_THEME) must give all four.
   */
  look?: Partial<Pick<Level, 'bg' | 'groundColor' | 'brickColor' | 'groundTop'>>;
  ending?: LevelEnding;
  villain?: Villain;
  indoors?: boolean;
  /** Which boss the level's Q is (the Doll Queen if it does not say). */
  boss?: BossKind;
  furniture?: readonly FurnitureSpec[];
  /** The home world's look: potties for flags, a shower curtain for a gate. */
  home?: boolean;
}

/**
 * A level record from ASCII sections. The map is handed out fresh on every build, because a
 * World writes to it (blocks bumped, walls smashed, bridges laid) and a respawn must get the
 * original back. The difficulty does not reshape it: a course's gaps are its puzzles.
 */
export function courseLevel(spec: CourseLevelSpec): Level {
  const parsed = parseCourse(joinSections(spec.sections));
  const theme: Level | undefined = LEVELS[spec.theme];
  const look = spec.look ?? {};
  if (!theme && !(look.bg && look.groundColor && look.brickColor && look.groundTop)) {
    throw new Error(`theme ${spec.theme} has no classic level to borrow from: give ${spec.name} its whole look`);
  }
  // Where each section starts, for the furniture counted from its own section.
  const starts = spec.sections.map((_, i) => spec.sections.slice(0, i).reduce((sum, s) => sum + s[0].length, 0));
  return {
    name: spec.name,
    bg: theme?.bg ?? '',
    groundColor: theme?.groundColor ?? '',
    brickColor: theme?.brickColor ?? '',
    groundTop: theme?.groundTop ?? '',
    ...look,
    width: parsed.map[0].length,
    height: parsed.map.length,
    playerStart: parsed.playerStart,
    rescuePos: parsed.rescuePos,
    generate: () => parsed.map.map((row) => [...row]),
    enemyDefs: parsed.enemyDefs,
    bowPositions: [],
    superPositions: [],
    // The cat, where the level puts one (@).
    catPosition: parsed.cat,
    clouds: theme?.clouds ?? [],
    course: spec.boss && parsed.course.boss
      ? { ...parsed.course, boss: { ...parsed.course.boss, kind: spec.boss } }
      : parsed.course,
    ...(spec.ending ? { ending: spec.ending } : {}),
    ...(spec.villain ? { villain: spec.villain } : {}),
    ...(spec.indoors ? { indoors: true } : {}),
    ...(spec.furniture
      ? { furniture: spec.furniture.map(({ section, ...piece }) => ({ ...piece, x: piece.x + starts[section] })) }
      : {}),
    ...(spec.home ? { home: true } : {}),
  };
}
