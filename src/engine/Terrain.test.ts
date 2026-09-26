import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Terrain, SEA_LEVEL } from './Terrain.ts';
import { CHUNK_SIZE, WORLD_HEIGHT_CHUNKS, blockIndex } from './Chunk.ts';

// Mock Chunk without parameter properties (Node strip-types compat)
class TestChunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly data = new Uint8Array(CHUNK_SIZE ** 3);
  dirty = true;
  modified = false;
  nonAir = 0;

  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
  }

  get(lx: number, ly: number, lz: number) {
    return this.data[blockIndex(lx, ly, lz)];
  }

  set(lx: number, ly: number, lz: number, id: number): boolean {
    const i = blockIndex(lx, ly, lz);
    const prev = this.data[i];
    if (prev === id) return false;
    if (prev === 0) this.nonAir++;
    if (id === 0) this.nonAir--;
    this.data[i] = id;
    this.dirty = true;
    return true;
  }

  recount() {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++;
    this.nonAir = n;
  }
}

test('Terrain classic generates deterministic heights', () => {
  const t1 = new Terrain(42, false);
  const t2 = new Terrain(42, false);
  assert.equal(t1.surfaceHeight(10, 20), t2.surfaceHeight(10, 20));
});

test('Terrain classic heights differ by seed', () => {
  const t1 = new Terrain(1, false);
  const t2 = new Terrain(2, false);
  assert.notEqual(t1.surfaceHeight(10, 20), t2.surfaceHeight(10, 20));
});

test('Terrain classic generates a column with blocks', () => {
  const t = new Terrain(123, false);
  const chunks: any[] = [];
  for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
    chunks.push(new TestChunk(0, cy, 0));
  }
  t.generateColumn(chunks, 0, 0);
  let totalBlocks = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.data.length; i++) {
      if (c.data[i] !== 0) totalBlocks++;
    }
  }
  assert.ok(totalBlocks > 0, 'classic column should have blocks');
});

test('Terrain volumetric generates a column with blocks', () => {
  const t = new Terrain(456, true);
  const chunks: any[] = [];
  for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
    chunks.push(new TestChunk(1, cy, 1));
  }
  t.generateColumn(chunks, 1, 1);
  let totalBlocks = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.data.length; i++) {
      if (c.data[i] !== 0) totalBlocks++;
    }
  }
  assert.ok(totalBlocks > 0, 'volumetric column should have blocks');
});

test('Terrain volumetric creates some air pockets (caves)', () => {
  const t = new Terrain(789, true);
  const chunks: any[] = [];
  for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
    chunks.push(new TestChunk(2, cy, 2));
  }
  t.generateColumn(chunks, 2, 2);
  
  // Count air blocks below sea level in the middle Y range where caves are likely.
  let undergroundAir = 0;
  for (let cy = 1; cy < 4; cy++) {
    const c = chunks[cy];
    const wy0 = c.cy * CHUNK_SIZE;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      const y = wy0 + ly;
      if (y < 10 || y > SEA_LEVEL) continue; // focus mid-depth
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          if (c.get(lx, ly, lz) === 0) undergroundAir++;
        }
      }
    }
  }
  // With 3D noise we expect *some* air underground (not zero).
  assert.ok(undergroundAir > 0, 'volumetric should create underground air (caves)');
});

test('Terrain classic vs volumetric differ', () => {
  const seed = 999;
  const tc = new Terrain(seed, false);
  const tv = new Terrain(seed, true);
  const chunksC: any[] = [];
  const chunksV: any[] = [];
  for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
    chunksC.push(new TestChunk(3, cy, 3));
    chunksV.push(new TestChunk(3, cy, 3));
  }
  tc.generateColumn(chunksC, 3, 3);
  tv.generateColumn(chunksV, 3, 3);
  
  let diffCount = 0;
  for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
    for (let i = 0; i < CHUNK_SIZE ** 3; i++) {
      if (chunksC[cy].data[i] !== chunksV[cy].data[i]) diffCount++;
    }
  }
  assert.ok(diffCount > 100, 'classic and volumetric should produce different terrain');
});
