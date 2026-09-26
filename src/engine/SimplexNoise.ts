/*
 * Upstream: jwagner/simplex-noise.js @ 6bfff874f5f0
 * License: MIT
 * 
 * A fast simplex noise implementation for 2D, 3D and 4D.
 * Based on a speed-improved simplex noise algorithm by Stefan Gustavson (stegu@itn.liu.se)
 * with optimizations by Peter Eastman (peastman@drizzle.stanford.edu) and
 * better rank ordering method by Stefan Gustavson in 2012.
 * 
 * Copyright (c) 2024 Jonas Wagner
 * Adapted for Maple's World: seeded via mulberry32, module API, full type annotations.
 */

const SQRT3 = Math.sqrt(3.0);
const SQRT5 = Math.sqrt(5.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const F4 = (SQRT5 - 1.0) / 4.0;
const G4 = (5.0 - SQRT5) / 20.0;

const fastFloor = (x: number) => Math.floor(x) | 0;

const grad2 = new Float64Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 1, 0, -1, 0,
  0, 1, 0, -1, 0, 1, 0, -1
]);

const grad3 = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1
]);

const grad4 = new Float64Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
  0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
  -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
  -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
  -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0
]);

function buildPermutationTable(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 255; i > 0; i--) {
    const r = i + ~~(random() * (256 - i));
    const aux = p[i];
    p[i] = p[r];
    p[r] = aux;
  }
  
  for (let i = 256; i < 512; i++) {
    p[i] = p[i - 256];
  }
  
  return p;
}

export type NoiseFunction2D = (x: number, y: number) => number;
export type NoiseFunction3D = (x: number, y: number, z: number) => number;
export type NoiseFunction4D = (x: number, y: number, z: number, w: number) => number;

/**
 * Production-grade simplex noise with 2D/3D/4D support.
 * EXPERIMENTAL: enables future volumetric terrain (caves, overhangs).
 * CLASSIC terrain uses the original Noise class.
 */
export class SimplexNoise {
  private perm: Uint8Array;
  private permGrad2x: Float64Array;
  private permGrad2y: Float64Array;
  private permGrad3x: Float64Array;
  private permGrad3y: Float64Array;
  private permGrad3z: Float64Array;

  constructor(seed: number) {
    this.perm = buildPermutationTable(seed);
    this.permGrad2x = new Float64Array(this.perm).map(v => grad2[(v % 12) * 2]);
    this.permGrad2y = new Float64Array(this.perm).map(v => grad2[(v % 12) * 2 + 1]);
    this.permGrad3x = new Float64Array(this.perm).map(v => grad3[(v % 12) * 3]);
    this.permGrad3y = new Float64Array(this.perm).map(v => grad3[(v % 12) * 3 + 1]);
    this.permGrad3z = new Float64Array(this.perm).map(v => grad3[(v % 12) * 3 + 2]);
  }

  /**
   * Samples the noise field in two dimensions.
   * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
   * @returns a number in the interval [-1, 1]
   */
  noise2(x: number, y: number): number {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    
    const s = (x + y) * F2;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    
    const ii = i & 255;
    const jj = j & 255;
    
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = ii + this.perm[jj];
      const g0x = this.permGrad2x[gi0];
      const g0y = this.permGrad2y[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g0x * x0 + g0y * y0);
    }
    
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = ii + i1 + this.perm[jj + j1];
      const g1x = this.permGrad2x[gi1];
      const g1y = this.permGrad2y[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g1x * x1 + g1y * y1);
    }
    
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = ii + 1 + this.perm[jj + 1];
      const g2x = this.permGrad2x[gi2];
      const g2y = this.permGrad2y[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g2x * x2 + g2y * y2);
    }
    
    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * Samples the noise field in three dimensions.
   * Coordinates should be finite, bigger than -2^31 and smaller than 2^31.
   * @returns a number in the interval [-1, 1]
   */
  noise3(x: number, y: number, z: number): number {
    let n0, n1, n2, n3;
    
    const s = (x + y + z) * F3;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const k = fastFloor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    
    let i1, j1, k1;
    let i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;
    
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) {
      n0 = 0.0;
    } else {
      const gi0 = ii + this.perm[jj + this.perm[kk]];
      t0 *= t0;
      n0 = t0 * t0 * (this.permGrad3x[gi0] * x0 + this.permGrad3y[gi0] * y0 + this.permGrad3z[gi0] * z0);
    }
    
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) {
      n1 = 0.0;
    } else {
      const gi1 = ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]];
      t1 *= t1;
      n1 = t1 * t1 * (this.permGrad3x[gi1] * x1 + this.permGrad3y[gi1] * y1 + this.permGrad3z[gi1] * z1);
    }
    
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) {
      n2 = 0.0;
    } else {
      const gi2 = ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]];
      t2 *= t2;
      n2 = t2 * t2 * (this.permGrad3x[gi2] * x2 + this.permGrad3y[gi2] * y2 + this.permGrad3z[gi2] * z2);
    }
    
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) {
      n3 = 0.0;
    } else {
      const gi3 = ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]];
      t3 *= t3;
      n3 = t3 * t3 * (this.permGrad3x[gi3] * x3 + this.permGrad3y[gi3] * y3 + this.permGrad3z[gi3] * z3);
    }
    
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  /**
   * Fractal Brownian motion in 2D, returns [-1, 1].
   */
  fbm2(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Fractal Brownian motion in 3D, returns [-1, 1].
   */
  fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
