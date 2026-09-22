import type { DifficultyRecord } from '../config/difficulty';

/**
 * Tile codes. 0 empty, 1 ground, 2 brick/platform, 3 question block,
 * 5 rainbow block. 4 is never written by any level.
 *
 * Solidity is whatever `isSolid` says — an explicit list of four codes, not
 * "non-zero". They coincide today only because 4 is unused; write a tile 4 or 6 and
 * `tile !== 0` would collide where the live game does not.
 */
export type TileMap = number[][];

export const TILE_EMPTY = 0;
export const TILE_GROUND = 1;
export const TILE_BRICK = 2;
export const TILE_QUESTION = 3;
export const TILE_RAINBOW = 5;

export function isSolid(tile: number): boolean {
  return tile === TILE_GROUND || tile === TILE_BRICK
      || tile === TILE_QUESTION || tile === TILE_RAINBOW;
}

export interface EnemyDef {
  type: string;
  /** Tile column. The row is resolved from the ground at spawn time. */
  x: number;
}

export interface Level {
  name: string;
  bg: string;
  groundColor: string;
  brickColor: string;
  groundTop: string;
  width: number;
  height: number;
  playerStart: [number, number];
  rescuePos: [number, number];
  generate(dc: DifficultyRecord): TileMap;
  enemyDefs: EnemyDef[];
  bowPositions: number[];
  superPositions: number[];
  catPosition: number;
  clouds: Array<[number, number]>;
}

export function makeGround(w: number, h: number): TileMap { const m=Array.from({length:h},()=>Array(w).fill(0)); for(let y=h-2;y<h;y++) for(let x=0;x<w;x++) m[y][x]=1; return m; }
export function addPlats(m: TileMap, ps: Array<[number, number, number]>): void { ps.forEach(([px,py,pw])=>{for(let i=0;i<pw;i++)if(px+i<m[0].length)m[py][px+i]=2;}); }
export function addQBlocks(m: TileMap, qs: Array<[number, number]>): void { qs.forEach(([qx,qy])=>m[qy][qx]=3); }
export function addRainbowBlock(m: TileMap, pos: Array<[number, number]>): void { pos.forEach(([rx,ry])=>{ if(m[ry]&&rx<m[0].length) m[ry][rx]=5; }); }
export function addGaps(m: TileMap, gs: Array<[number, number]>, h: number, gapMult: number): void {
  gs.forEach(([gx,gw])=>{
    const actualW = Math.max(1, Math.round(gw * gapMult));
    for(let i=0;i<actualW;i++) for(let gy=h-2;gy<h;gy++) if(gx+i<m[0].length) m[gy][gx+i]=0;
  });
}

/**
 * Each level's name, as a translation key, indexed 0-based — so level 0 is `level_1`.
 *
 * The live game writes this array out TWICE, once in the HUD (index.html:1858) and once in
 * the between-level cutscene (:2363), which is two chances to get the off-by-one wrong. It
 * is data about the levels, so it lives with them, once.
 *
 * Separate from each record's own `name` field, which is the untranslated English the level
 * was authored under ("Doll Garden") and is not what either screen shows.
 */
export const LEVEL_NAME_KEYS = ['level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'];

export const LEVELS: Level[] = [
  // --- Level 1: Doll Garden ---
  {
    name:"Doll Garden", bg:'#88ccff', groundColor:'#44aa44', brickColor:'#cc8844', groundTop:'#2d8a2d',
    width:120, height:25, playerStart:[2,20], rescuePos:[115,20],
    generate(dc){
      const m=makeGround(this.width,this.height);
      addPlats(m,[[10,19,5],[18,17,4],[25,20,3],[30,16,5],[38,19,4],[42,15,3],[50,18,6],[58,14,4],[63,19,3],[70,17,5],[78,20,4],[82,15,4],[88,18,5],[95,16,4],[100,19,6],[108,17,4]]);
      addQBlocks(m,[[12,16],[32,13],[55,15],[72,14],[90,15],[102,16]]);
      addRainbowBlock(m,[[43,12]]);
      addGaps(m,[[20,3],[45,2],[75,3],[98,2]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'doll',x:15},{type:'doll',x:28},{type:'car',x:40},{type:'bat',x:48},{type:'dino',x:55},{type:'doll',x:65},{type:'bouncer',x:73},{type:'car',x:80},{type:'dino',x:90},{type:'bat',x:95},{type:'doll',x:105},{type:'dino',x:110}],
    bowPositions:[35,70], superPositions:[22,85], catPosition:50,
    clouds:[[5,3],[20,5],[35,2],[55,4],[70,3],[90,5],[105,2]]
  },
  // --- Level 2: Dinosaur Canyon ---
  {
    name:"Dinosaur Canyon", bg:'#cc8855', groundColor:'#886633', brickColor:'#aa6622', groundTop:'#aa7733',
    width:140, height:25, playerStart:[2,20], rescuePos:[135,20],
    generate(dc){
      const m=makeGround(this.width,this.height);
      addPlats(m,[[8,20,4],[14,18,3],[20,16,5],[28,19,3],[34,15,4],[40,20,5],[48,17,4],[55,14,3],[60,19,5],[68,16,4],[74,20,3],[80,14,5],[88,18,4],[95,15,3],[100,20,6],[108,17,4],[115,19,5],[122,16,3],[128,20,4]]);
      addQBlocks(m,[[22,13],[36,12],[57,11],[70,13],[82,11],[97,12],[110,14],[124,13]]);
      addRainbowBlock(m,[[49,14]]);
      addGaps(m,[[12,2],[25,3],[45,3],[65,2],[85,3],[105,2],[120,3]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'dino',x:10},{type:'dino',x:22},{type:'cannon',x:29},{type:'car',x:32},{type:'doll',x:42},{type:'bat',x:47},{type:'dino',x:52},{type:'ghost',x:58},{type:'dino',x:62},{type:'bouncer',x:68},{type:'car',x:72},{type:'cannon',x:78},{type:'doll',x:82},{type:'bat',x:87},{type:'dino',x:92},{type:'car',x:102},{type:'bouncer',x:108},{type:'dino',x:112},{type:'ghost',x:118},{type:'dino',x:125}],
    bowPositions:[18,60,100], superPositions:[38,78,115], catPosition:75,
    clouds:[[10,4],[30,2],[50,5],[75,3],[95,4],[115,2],[130,5]]
  },
  // --- Level 3: Tallinn, Estonia ---
  {
    name:"Tallinn Old Town", bg:'#5577aa', groundColor:'#778899', brickColor:'#99aabb', groundTop:'#8899aa',
    width:150, height:25, playerStart:[2,20], rescuePos:[145,20],
    generate(dc){
      const m=makeGround(this.width,this.height);
      // Medieval towers and walls
      addPlats(m,[[6,18,3],[12,16,4],[18,20,3],[24,14,5],[32,19,4],[38,17,3],[44,15,4],[50,20,5],[56,13,4],[62,18,3],[68,16,5],[76,20,4],[82,14,4],[88,17,3],[94,19,5],[100,15,4],[106,20,3],[112,13,4],[118,18,5],[124,16,3],[130,20,4],[136,14,5],[142,18,4]]);
      addQBlocks(m,[[14,13],[26,11],[46,12],[58,10],[70,13],[84,11],[96,16],[102,12],[114,10],[126,13],[138,11]]);
      addRainbowBlock(m,[[63,15]]);
      addGaps(m,[[16,2],[35,3],[60,2],[78,3],[105,2],[128,3]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'doll',x:8},{type:'ghost',x:15},{type:'dino',x:22},{type:'bat',x:30},{type:'cannon',x:36},{type:'bouncer',x:42},{type:'doll',x:50},{type:'ghost',x:56},{type:'car',x:64},{type:'bat',x:70},{type:'dino',x:78},{type:'cannon',x:86},{type:'bouncer',x:92},{type:'ghost',x:98},{type:'doll',x:106},{type:'bat',x:112},{type:'dino',x:120},{type:'cannon',x:126},{type:'ghost',x:134},{type:'bouncer',x:140}],
    bowPositions:[20,55,95,130], superPositions:[10,45,80,120], catPosition:68,
    clouds:[[8,2],[25,4],[45,3],[65,2],[90,4],[115,3],[135,2]]
  },
  // --- Level 4: Palermo, Sicily ---
  {
    name:"Palermo Piazza", bg:'#ffcc77', groundColor:'#cc9955', brickColor:'#ddaa66', groundTop:'#ddbb77',
    width:150, height:25, playerStart:[2,20], rescuePos:[145,20],
    generate(dc){
      const m=makeGround(this.width,this.height);
      // Italian piazza with arches and balconies
      addPlats(m,[[8,19,4],[14,17,3],[20,15,5],[28,20,3],[34,18,4],[40,14,3],[46,16,5],[52,20,4],[58,13,4],[64,17,3],[70,19,5],[76,15,4],[82,20,3],[88,14,5],[94,18,4],[100,16,3],[106,20,5],[112,13,4],[118,17,3],[124,15,5],[130,20,4],[136,18,3],[142,14,4]]);
      addQBlocks(m,[[16,14],[22,12],[42,11],[60,10],[72,16],[78,12],[90,11],[102,13],[114,10],[126,12],[138,15]]);
      addRainbowBlock(m,[[47,13]]);
      addGaps(m,[[25,3],[48,2],[66,3],[85,2],[108,3],[132,2]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'car',x:10},{type:'doll',x:16},{type:'bat',x:24},{type:'ghost',x:32},{type:'dino',x:38},{type:'cannon',x:44},{type:'bouncer',x:52},{type:'doll',x:58},{type:'bat',x:64},{type:'ghost',x:72},{type:'cannon',x:78},{type:'dino',x:84},{type:'car',x:90},{type:'bouncer',x:96},{type:'ghost',x:104},{type:'bat',x:110},{type:'cannon',x:118},{type:'doll',x:124},{type:'dino',x:132},{type:'bouncer',x:138},{type:'ghost',x:142}],
    bowPositions:[22,60,100,135], superPositions:[15,50,85,125], catPosition:70,
    clouds:[[5,2],[20,4],[40,2],[60,3],[80,2],[100,4],[120,2],[140,3]]
  },
  // --- Level 5: Winter Wonderland ---
  {
    name:"Winter Wonderland", bg:'#c8ddef', groundColor:'#e8eef5', brickColor:'#aabbcc', groundTop:'#f0f4f8',
    width:150, height:25, playerStart:[2,20], rescuePos:[145,20],
    generate(dc){
      const m=makeGround(this.width,this.height);
      // Icy platforms, snow drifts
      addPlats(m,[[6,19,4],[12,17,3],[18,15,5],[26,20,4],[32,18,3],[38,14,4],[44,16,5],[52,20,3],[58,13,4],[64,18,3],[70,15,5],[78,20,4],[84,17,3],[90,14,4],[96,19,5],[102,16,3],[108,20,4],[114,13,4],[120,17,3],[126,15,5],[132,20,4],[138,18,3],[144,16,4]]);
      addQBlocks(m,[[14,14],[20,12],[40,11],[60,10],[72,12],[92,11],[104,13],[116,10],[128,12],[140,13]]);
      addRainbowBlock(m,[[45,13]]);
      addGaps(m,[[22,2],[35,3],[55,2],[75,3],[100,2],[122,3]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'penguin',x:8},{type:'icebat',x:14},{type:'penguin',x:20},{type:'icebat',x:28},{type:'penguin',x:34},{type:'icebat',x:40},{type:'penguin',x:48},{type:'icebat',x:54},{type:'penguin',x:60},{type:'icebat',x:66},{type:'penguin',x:72},{type:'icebat',x:80},{type:'penguin',x:86},{type:'icebat',x:92},{type:'penguin',x:98},{type:'icebat',x:104},{type:'penguin',x:110},{type:'icebat',x:116},{type:'penguin',x:122},{type:'icebat',x:128},{type:'penguin',x:134},{type:'icebat',x:140}],
    bowPositions:[16,55,95,135], superPositions:[10,45,80,120], catPosition:65,
    clouds:[[5,2],[20,4],[40,3],[60,2],[85,4],[110,3],[135,2]]
  },
  // --- Level 6: Toy Castle (Final) ---
  {
    name:"Toy Castle", bg:'#443366', groundColor:'#555577', brickColor:'#777799', groundTop:'#7777aa',
    width:160, height:25, playerStart:[2,20], rescuePos:[155,14],
    generate(dc){
      const m=makeGround(this.width,this.height);
      addPlats(m,[[8,20,4],[14,18,3],[20,16,6],[28,20,4],[34,14,4],[40,19,3],[46,17,5],[54,15,3],[60,20,5],[66,13,4],[72,18,3],[78,16,5],[86,20,4],[92,14,4],[98,18,3],[104,16,5],[110,20,4],[116,13,4],[122,17,3],[128,15,5],[134,20,4],[138,18,3],[142,16,4],[147,14,4],[152,14,8]]);
      addQBlocks(m,[[22,13],[36,11],[56,12],[68,10],[80,13],[94,11],[106,13],[118,10],[130,12],[142,9]]);
      addRainbowBlock(m,[[47,14]]);
      addGaps(m,[[12,2],[25,3],[42,2],[62,3],[82,2],[100,3],[120,2],[138,2]],this.height,dc.gapWidth);
      return m;
    },
    enemyDefs:[{type:'doll',x:10},{type:'bat',x:14},{type:'dino',x:18},{type:'cannon',x:26},{type:'car',x:30},{type:'ghost',x:37},{type:'doll',x:42},{type:'bouncer',x:47},{type:'dino',x:50},{type:'car',x:58},{type:'bat',x:63},{type:'doll',x:68},{type:'cannon',x:73},{type:'dino',x:76},{type:'ghost',x:82},{type:'car',x:88},{type:'bouncer',x:93},{type:'dino',x:96},{type:'cannon',x:103},{type:'doll',x:106},{type:'bat',x:110},{type:'dino',x:114},{type:'ghost',x:120},{type:'car',x:124},{type:'bouncer',x:130},{type:'cannon',x:134},{type:'doll',x:136},{type:'bat',x:143},{type:'dino',x:148}],
    bowPositions:[15,50,90,130], superPositions:[30,70,110,142], catPosition:60,
    clouds:[[8,3],[25,5],[45,2],[65,4],[85,3],[105,5],[125,2],[145,4]]
  }
];

