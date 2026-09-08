import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, WORLD_HEIGHT_CHUNKS, chunkKey } from './Chunk';
import { Terrain } from './Terrain';
import { isSolid, AIR } from './Blocks';

export type BlockChangeListener = (x: number, y: number, z: number, prev: number, next: number) => void;

/**
 * Authoritative block store. Everything — player, genie, persistence — goes through
 * getBlock / setBlock. Chunks are generated lazily per column and flagged dirty for the renderer.
 */
export class World {
  readonly chunks = new Map<string, Chunk>();
  readonly terrain: Terrain;
  private listeners = new Set<BlockChangeListener>();

  constructor(readonly seed: number) {
    this.terrain = new Terrain(seed);
  }

  onBlockChange(fn: BlockChangeListener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  hasColumn(cx: number, cz: number) { return this.chunks.has(chunkKey(cx, 0, cz)); }

  /** Get or generate the chunk containing chunk coords. Returns null above/below world. */
  getChunk(cx: number, cy: number, cz: number, generate = true): Chunk | null {
    if (cy < 0 || cy >= WORLD_HEIGHT_CHUNKS) return null;
    const k = chunkKey(cx, cy, cz);
    let c = this.chunks.get(k);
    if (c || !generate) return c ?? null;
    this.generateColumn(cx, cz);
    return this.chunks.get(k)!;
  }

  generateColumn(cx: number, cz: number) {
    if (this.hasColumn(cx, cz)) return;
    const col: Chunk[] = [];
    for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
      const c = new Chunk(cx, cy, cz);
      this.chunks.set(chunkKey(cx, cy, cz), c);
      col.push(c);
    }
    this.terrain.generateColumn(col, cx, cz);
    // Neighbor faces at the seam may now be occluded/visible.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      for (let cy = 0; cy < WORLD_HEIGHT_CHUNKS; cy++) {
        const n = this.chunks.get(chunkKey(cx + dx, cy, cz + dz));
        if (n) n.dirty = true;
      }
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const c = this.getChunk(x >> 4, y >> 4, z >> 4, false);
    if (!c) return AIR;
    return c.get(x & 15, y & 15, z & 15);
  }

  /** Same as getBlock but generates the column if needed (raycasts, physics near frontier). */
  getBlockGen(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const c = this.getChunk(x >> 4, y >> 4, z >> 4, true);
    return c ? c.get(x & 15, y & 15, z & 15) : AIR;
  }

  isSolidAt(x: number, y: number, z: number) { return isSolid(this.getBlockGen(x, y, z)); }

  setBlock(x: number, y: number, z: number, id: number, opts: { silent?: boolean; markModified?: boolean } = {}): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = this.getChunk(x >> 4, y >> 4, z >> 4, true);
    if (!c) return false;
    const lx = x & 15, ly = y & 15, lz = z & 15;
    const prev = c.get(lx, ly, lz);
    if (!c.set(lx, ly, lz, id)) return false;
    if (opts.markModified !== false) c.modified = true;
    // Boundary edits expose/hide faces in neighbors.
    if (lx === 0) this.markDirty(c.cx - 1, c.cy, c.cz); else if (lx === CHUNK_SIZE - 1) this.markDirty(c.cx + 1, c.cy, c.cz);
    if (ly === 0) this.markDirty(c.cx, c.cy - 1, c.cz); else if (ly === CHUNK_SIZE - 1) this.markDirty(c.cx, c.cy + 1, c.cz);
    if (lz === 0) this.markDirty(c.cx, c.cy, c.cz - 1); else if (lz === CHUNK_SIZE - 1) this.markDirty(c.cx, c.cy, c.cz + 1);
    if (!opts.silent) for (const fn of this.listeners) fn(x, y, z, prev, id);
    return true;
  }

  private markDirty(cx: number, cy: number, cz: number) {
    const n = this.chunks.get(chunkKey(cx, cy, cz));
    if (n) n.dirty = true;
  }

  /** Highest solid (non-air, non-water) block at column; -1 if none. */
  surfaceHeight(x: number, z: number): number {
    this.getChunk(x >> 4, 0, z >> 4, true);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== AIR && isSolid(id)) return y;
    }
    return -1;
  }

  /** Chunks touched by player/genie that persistence should save. */
  modifiedChunks(): Chunk[] {
    const out: Chunk[] = [];
    for (const c of this.chunks.values()) if (c.modified) out.push(c);
    return out;
  }

  /** Free columns far from the player. Modified chunks are kept (persistence owns their lifetime). */
  unloadFar(pcx: number, pcz: number, radius: number): string[] {
    const removed: string[] = [];
    const columns = new Map<string, Chunk[]>();
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) <= radius && Math.abs(c.cz - pcz) <= radius) continue;
      const k = `${c.cx},${c.cz}`;
      (columns.get(k) ?? columns.set(k, []).get(k)!).push(c);
    }
    for (const col of columns.values()) {
      if (col.some(c => c.modified)) continue;       // whole column stays; columns are atomic
      for (const c of col) {
        const k = chunkKey(c.cx, c.cy, c.cz);
        this.chunks.delete(k);
        removed.push(k);
      }
    }
    return removed;
  }
}
