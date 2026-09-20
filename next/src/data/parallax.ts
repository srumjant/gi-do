export interface ParallaxLayer {
  /** Top of the layer, as a fraction of view height. */
  y: number;
  /** Layer height, as a fraction of view height. */
  h: number;
  color: string;
  /** Fraction of camera.x this layer scrolls by. Smaller is further away. */
  speed: number;
  /** Ridge heights sampled across the layer's width, as fractions of view height. */
  hills: number[];
}

export interface ParallaxConfig {
  /** Bottom stop of the sky gradient. The top stop is the level's own `bg`. */
  bg2: string;
  /** Back to front. */
  layers: ParallaxLayer[];
}

/** Keyed by level index. Note the shape: an object with `bg2` and `layers`, not a
 *  bare array — drawParallax reads `pd.bg2 || lvl.bg` for the gradient's far stop. */
export const PARALLAX: Record<number, ParallaxConfig> = {
  // Doll Garden: blue sky, puffy hills, flowers
  0:{bg2:'#77bbee',layers:[
    {y:0.55,h:0.45,color:'#6bbb6b',speed:0.15,hills:[0.12,0.08,0.14,0.1,0.13,0.09,0.11,0.15,0.1,0.12]},
    {y:0.65,h:0.35,color:'#55aa55',speed:0.3,hills:[0.1,0.14,0.09,0.12,0.15,0.08,0.13,0.1,0.11,0.14]},
  ]},
  // Dinosaur Canyon: orange desert, mesas
  1:{bg2:'#cc7744',layers:[
    {y:0.45,h:0.3,color:'#aa6633',speed:0.1,hills:[0.2,0.15,0.22,0.12,0.18,0.25,0.14,0.2,0.16,0.21]},
    {y:0.6,h:0.4,color:'#996622',speed:0.25,hills:[0.12,0.16,0.1,0.14,0.18,0.11,0.15,0.13,0.17,0.12]},
  ]},
  // Tallinn: grey-blue, medieval towers
  2:{bg2:'#446688',layers:[
    {y:0.5,h:0.3,color:'#556688',speed:0.12,hills:[0.18,0.12,0.2,0.1,0.16,0.22,0.14,0.19,0.13,0.17]},
    {y:0.62,h:0.38,color:'#667799',speed:0.28,hills:[0.1,0.14,0.08,0.12,0.15,0.09,0.13,0.11,0.14,0.1]},
  ]},
  // Palermo: warm golden, gentle hills
  3:{bg2:'#eebb66',layers:[
    {y:0.5,h:0.35,color:'#ddaa55',speed:0.12,hills:[0.1,0.14,0.08,0.12,0.16,0.09,0.13,0.11,0.15,0.1]},
    {y:0.63,h:0.37,color:'#cc9944',speed:0.25,hills:[0.12,0.08,0.14,0.1,0.13,0.09,0.11,0.15,0.1,0.12]},
  ]},
  // Winter: white/blue, snowy mountains
  4:{bg2:'#b0ccee',layers:[
    {y:0.4,h:0.35,color:'#c8dde8',speed:0.1,hills:[0.22,0.16,0.25,0.14,0.2,0.28,0.18,0.24,0.15,0.21]},
    {y:0.58,h:0.42,color:'#dde8f0',speed:0.22,hills:[0.12,0.16,0.1,0.14,0.18,0.11,0.15,0.13,0.17,0.12]},
  ]},
  // Toy Castle: dark purple, eerie towers
  5:{bg2:'#332255',layers:[
    {y:0.45,h:0.3,color:'#443366',speed:0.1,hills:[0.2,0.14,0.22,0.12,0.18,0.24,0.16,0.21,0.13,0.19]},
    {y:0.6,h:0.4,color:'#554477',speed:0.25,hills:[0.1,0.14,0.08,0.12,0.16,0.09,0.13,0.11,0.15,0.1]},
  ]},
};
