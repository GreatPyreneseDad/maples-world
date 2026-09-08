export const CHUNK_SIZE = 16;
export const CHUNK_BITS = 4;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const WORLD_HEIGHT_CHUNKS = 8;               // 128 blocks tall
export const WORLD_HEIGHT = CHUNK_SIZE * WORLD_HEIGHT_CHUNKS;

export const chunkKey = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;
export const blockIndex = (lx: number, ly: number, lz: number) => (ly << 8) | (lz << 4) | lx;

export class Chunk {
  readonly data = new Uint8Array(CHUNK_SIZE ** 3);
  /** Geometry needs rebuilding. */
  dirty = true;
  /** Differs from generated terrain; needs persisting. */
  modified = false;
  /** Number of non-air blocks — lets the renderer skip empty chunks fast. */
  nonAir = 0;

  constructor(readonly cx: number, readonly cy: number, readonly cz: number) {}

  get(lx: number, ly: number, lz: number) { return this.data[blockIndex(lx, ly, lz)]; }

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
