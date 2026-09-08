import { Noise } from './Noise';
import { blockId } from './Blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, type Chunk } from './Chunk';

export const SEA_LEVEL = 38;

const B = {
  grass: blockId('grass'), dirt: blockId('dirt'), stone: blockId('stone'), sand: blockId('sand'),
  water: blockId('water'), wood: blockId('wood'), leaves: blockId('leaves'), snow: blockId('snow'),
};

/** Seeded terrain generator. Pure function of (seed, x, z) so any client regenerates the same world. */
export class Terrain {
  private height: Noise;
  private detail: Noise;
  private trees: Noise;

  constructor(readonly seed: number) {
    this.height = new Noise(seed);
    this.detail = new Noise(seed ^ 0x9e3779b9);
    this.trees = new Noise(seed ^ 0x85ebca6b);
  }

  surfaceHeight(x: number, z: number): number {
    const continental = this.height.fbm2(x / 260, z / 260, 4) * 22;
    const hills = this.detail.fbm2(x / 48, z / 48, 3) * 6;
    const h = 42 + continental + hills;
    return Math.max(4, Math.min(WORLD_HEIGHT - 20, Math.floor(h)));
  }

  /** Fill an entire vertical column of chunks (same cx, cz) in one pass. */
  generateColumn(chunks: Chunk[], cx: number, cz: number) {
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++)
        heights[lz * CHUNK_SIZE + lx] = this.surfaceHeight(wx0 + lx, wz0 + lz);

    for (const c of chunks) {
      const wy0 = c.cy * CHUNK_SIZE;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const h = heights[lz * CHUNK_SIZE + lx];
          const beach = h <= SEA_LEVEL + 1;
          for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            const y = wy0 + ly;
            let id = 0;
            if (y < h - 3) id = B.stone;
            else if (y < h) id = beach ? B.sand : B.dirt;
            else if (y === h) id = beach ? B.sand : h > 64 ? B.snow : B.grass;
            else if (y <= SEA_LEVEL) id = B.water;
            if (id !== 0) c.set(lx, ly, lz, id);
          }
        }
      }
    }
    this.plantTrees(chunks, cx, cz, heights);
    for (const c of chunks) { c.modified = false; c.dirty = true; }
  }

  private plantTrees(chunks: Chunk[], cx: number, cz: number, heights: Int32Array) {
    const wx0 = cx * CHUNK_SIZE, wz0 = cz * CHUNK_SIZE;
    const setLocal = (lx: number, y: number, lz: number, id: number) => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      const c = chunks[y >> 4];
      if (c.get(lx, y & 15, lz) === 0) c.set(lx, y & 15, lz, id);
    };
    // Trees are kept 2 blocks from chunk edges so a column is self-contained (no cross-chunk writes at gen time).
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const h = heights[lz * CHUNK_SIZE + lx];
        if (h <= SEA_LEVEL + 1 || h > 64) continue;
        const n = this.trees.noise2((wx0 + lx) * 0.9, (wz0 + lz) * 0.9);
        if (n < 0.86) continue;
        const trunk = 4 + ((n * 1000) | 0) % 3;
        for (let i = 1; i <= trunk; i++) chunks[(h + i) >> 4]?.set(lx, (h + i) & 15, lz, B.wood);
        const top = h + trunk;
        for (let dy = -2; dy <= 1; dy++)
          for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++) {
              const r = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
              if (r > 4 || (dy === 1 && r > 2)) continue;
              if (dx === 0 && dz === 0 && dy <= 0) continue;
              setLocal(lx + dx, top + dy, lz + dz, B.leaves);
            }
      }
    }
  }
}
