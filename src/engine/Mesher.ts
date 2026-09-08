import { BLOCKS, isOpaque, AIR } from './Blocks';
import { CHUNK_SIZE, type Chunk } from './Chunk';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}
export interface ChunkMeshes { opaque: MeshData | null; transparent: MeshData | null }

type GetBlock = (x: number, y: number, z: number) => number;

const SHADE = [0.78, 0.74, 1.0, 0.5, 0.86, 0.68]; // -x +x +y -y +z -z  (indexed by face id below)

/**
 * Greedy meshing (Lysenko). Merges coplanar faces of identical block id into rectangles.
 * Two passes: opaque geometry and transparent geometry (water, glass, leaves).
 * Cross-chunk face culling uses the world getter so seams never show.
 */
export function meshChunk(chunk: Chunk, getWorld: GetBlock): ChunkMeshes {
  if (chunk.nonAir === 0) return { opaque: null, transparent: null };
  const ox = chunk.cx * CHUNK_SIZE, oy = chunk.cy * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;

  const get = (x: number, y: number, z: number) => {
    if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) return chunk.get(x, y, z);
    return getWorld(ox + x, oy + y, oz + z);
  };

  return {
    opaque: buildPass(get, ox, oy, oz, true),
    transparent: buildPass(get, ox, oy, oz, false),
  };
}

class Builder {
  pos: number[] = []; nor: number[] = []; col: number[] = []; idx: number[] = [];
  quad(
    x: number, y: number, z: number,   // origin corner
    du: [number, number, number], dv: [number, number, number],
    n: [number, number, number], rgb: [number, number, number], shade: number, flip: boolean,
  ) {
    const base = this.pos.length / 3;
    const v = [
      [x, y, z],
      [x + du[0], y + du[1], z + du[2]],
      [x + du[0] + dv[0], y + du[1] + dv[1], z + du[2] + dv[2]],
      [x + dv[0], y + dv[1], z + dv[2]],
    ];
    for (const p of v) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade); }
    if (flip) this.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  toMesh(): MeshData | null {
    if (this.idx.length === 0) return null;
    return {
      positions: new Float32Array(this.pos), normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col), indices: new Uint32Array(this.idx),
    };
  }
}

const colorCache = new Map<number, [number, number, number]>();
function rgbOf(hex: number): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) { c = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]; colorCache.set(hex, c); }
  return c;
}

/** Should the face of `a` toward `b` be drawn, in this pass? */
function faceVisible(a: number, b: number, opaquePass: boolean): boolean {
  if (a === AIR) return false;
  const aOpaque = isOpaque(a);
  if (aOpaque !== opaquePass) return false;
  if (isOpaque(b)) return false;
  if (!aOpaque && a === b) return false; // water-water, glass-glass: no internal faces
  return true;
}

function buildPass(get: GetBlock, ox: number, oy: number, oz: number, opaquePass: boolean): MeshData | null {
  const b = new Builder();
  const mask = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  const q: [number, number, number] = [0, 0, 0];
  const x: [number, number, number] = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    q[0] = q[1] = q[2] = 0; q[d] = 1;

    for (x[d] = -1; x[d] < CHUNK_SIZE;) {
      // Build mask for the slice between x[d] and x[d]+1
      let n = 0;
      for (x[v] = 0; x[v] < CHUNK_SIZE; x[v]++) {
        for (x[u] = 0; x[u] < CHUNK_SIZE; x[u]++, n++) {
          const a = get(x[0], x[1], x[2]);
          const bb = get(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          // Only faces owned by this chunk: a-face when x[d] >= 0, b-face when x[d]+1 < SIZE
          const aFace = x[d] >= 0 && faceVisible(a, bb, opaquePass);
          const bFace = x[d] + 1 < CHUNK_SIZE && faceVisible(bb, a, opaquePass);
          mask[n] = aFace ? (a << 1) | 1 : bFace ? (bb << 1) : 0; // low bit: 1 = +d normal, 0 = -d normal
        }
      }
      x[d]++;

      // Greedy sweep
      n = 0;
      for (let j = 0; j < CHUNK_SIZE; j++) {
        for (let i = 0; i < CHUNK_SIZE;) {
          const m = mask[n];
          if (m === 0) { i++; n++; continue; }
          let w = 1;
          while (i + w < CHUNK_SIZE && mask[n + w] === m) w++;
          let h = 1;
          outer: for (; j + h < CHUNK_SIZE; h++)
            for (let k = 0; k < w; k++) if (mask[n + k + h * CHUNK_SIZE] !== m) break outer;

          const id = m >> 1, positive = (m & 1) === 1;
          const def = BLOCKS[id];
          const faceIdx = d * 2 + (positive ? 1 : 0); // 0:-x 1:+x 2:-y 3:+y 4:-z 5:+z
          // colors: [top, side, bottom]
          const hex = d === 1 ? (positive ? def.colors[0] : def.colors[2]) : def.colors[1];
          const shadeIdx = [0, 1, 3, 2, 5, 4][faceIdx];
          x[u] = i; x[v] = j;
          const du: [number, number, number] = [0, 0, 0]; du[u] = w;
          const dv: [number, number, number] = [0, 0, 0]; dv[v] = h;
          const nrm: [number, number, number] = [0, 0, 0]; nrm[d] = positive ? 1 : -1;
          // Winding: for -d faces flip so the front faces outward.
          b.quad(ox + x[0], oy + x[1], oz + x[2], du, dv, nrm, rgbOf(hex), SHADE[shadeIdx], !positive);

          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * CHUNK_SIZE] = 0;
          i += w; n += w;
        }
      }
    }
  }
  return b.toMesh();
}
