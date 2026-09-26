/**
 * Deterministic 2D/3D simplex noise (Gustavson), seeded via mulberry32.
 * 
 * 3D implementation derived from simplex-noise.js by Jonas Wagner
 * https://github.com/jwagner/simplex-noise.js @ 6bfff874f5f0
 * Copyright (c) 2024 Jonas Wagner, MIT License
 * Based on speed-improved simplex noise by Stefan Gustavson (stegu@itn.liu.se)
 * with optimisations by Peter Eastman and rank ordering by Gustavson 2012.
 */

const SQRT3 = Math.sqrt(3.0);
const SQRT5 = Math.sqrt(5.0);
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

const fastFloor = (x: number) => Math.floor(x) | 0;

export class Noise {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);
  private permGrad3x!: Float64Array;
  private permGrad3y!: Float64Array;
  private permGrad3z!: Float64Array;

  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
    this.buildGrad3Tables();
  }

  private static G2 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
  ];

  private static grad3 = new Float64Array([
    1, 1, 0,  -1, 1, 0,  1, -1, 0,  -1, -1, 0,
    1, 0, 1,  -1, 0, 1,  1, 0, -1,  -1, 0, -1,
    0, 1, 1,  0, -1, 1,  0, 1, -1,  0, -1, -1
  ]);

  private buildGrad3Tables() {
    // Pre-compute gradient components for 3D; yields ~15% speedup per upstream benchmarks.
    this.permGrad3x = new Float64Array(this.perm.length);
    this.permGrad3y = new Float64Array(this.perm.length);
    this.permGrad3z = new Float64Array(this.perm.length);
    for (let i = 0; i < this.perm.length; i++) {
      const gi = (this.perm[i] % 12) * 3;
      this.permGrad3x[i] = Noise.grad3[gi];
      this.permGrad3y[i] = Noise.grad3[gi + 1];
      this.permGrad3z[i] = Noise.grad3[gi + 2];
    }
  }

  noise2(xin: number, yin: number): number {
    const F2 = 0.5 * (SQRT3 - 1), G2 = (3 - SQRT3) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    const corner = (x: number, y: number, gi: number) => {
      let tt = 0.5 - x * x - y * y;
      if (tt < 0) return 0;
      tt *= tt;
      const g = Noise.G2[gi];
      return tt * tt * (g[0] * x + g[1] * y);
    };
    n += corner(x0, y0, this.permMod12[ii + this.perm[jj]]);
    n += corner(x1, y1, this.permMod12[ii + i1 + this.perm[jj + j1]]);
    n += corner(x2, y2, this.permMod12[ii + 1 + this.perm[jj + 1]]);
    return 70 * n;
  }

  /**
   * 3D simplex noise in [-1, 1].
   * Coordinates should be finite, |x|,|y|,|z| < 2^31.
   */
  noise3(x: number, y: number, z: number): number {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const k = fastFloor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;

    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = ii + this.perm[jj + this.perm[kk]];
      t0 *= t0;
      n0 = t0 * t0 * (this.permGrad3x[gi0] * x0 + this.permGrad3y[gi0] * y0 + this.permGrad3z[gi0] * z0);
    }

    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]];
      t1 *= t1;
      n1 = t1 * t1 * (this.permGrad3x[gi1] * x1 + this.permGrad3y[gi1] * y1 + this.permGrad3z[gi1] * z1);
    }

    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]];
      t2 *= t2;
      n2 = t2 * t2 * (this.permGrad3x[gi2] * x2 + this.permGrad3y[gi2] * y2 + this.permGrad3z[gi2] * z2);
    }

    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]];
      t3 *= t3;
      n3 = t3 * t3 * (this.permGrad3x[gi3] * x3 + this.permGrad3y[gi3] * y3 + this.permGrad3z[gi3] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }

  /** Fractal Brownian motion in [-1,1]. */
  fbm2(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Fractal Brownian motion in 3D, [-1,1]. */
  fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }
}
