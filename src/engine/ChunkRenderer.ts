import * as THREE from 'three';
import { meshChunk, type MeshData } from './Mesher';
import { chunkKey, WORLD_HEIGHT_CHUNKS, type Chunk } from './Chunk';
import type { World } from './World';

/** Injects a subtle per-block grain so flat vertex colors read as material, not plastic. */
function grainMaterial(base: THREE.MeshLambertMaterial) {
  base.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
float hash3(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // Nudge sample point inward along the normal so faces at integer planes land in the block they belong to.
  vec3 cell = floor(vWorldPos - vNormal * 0.01);
  vec3 sub = floor(fract(vWorldPos - vNormal * 0.01) * 4.0);
  float g = hash3(cell) * 0.10 + hash3(cell * 4.0 + sub) * 0.08;
  diffuseColor.rgb *= (0.91 + g);
}`);
  };
  return base;
}

export class ChunkRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh[]>();
  private opaqueMat: THREE.Material;
  private transMat: THREE.Material;
  /** Remesh budget per frame — keeps input latency flat during big genie builds. */
  remeshBudget = 6;

  constructor(private world: World, scene: THREE.Scene) {
    this.opaqueMat = grainMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.transMat = grainMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }));
    scene.add(this.group);
  }

  /** Called every frame. Remeshes dirty chunks nearest the player first. */
  update(pcx: number, pcz: number, viewRadius: number) {
    // Ensure columns in view exist.
    for (let dz = -viewRadius; dz <= viewRadius; dz++)
      for (let dx = -viewRadius; dx <= viewRadius; dx++)
        if (dx * dx + dz * dz <= viewRadius * viewRadius) this.world.generateColumn(pcx + dx, pcz + dz);

    // Collect dirty chunks in view, sorted by distance.
    const dirty: Chunk[] = [];
    for (const c of this.world.chunks.values()) {
      if (!c.dirty) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (viewRadius + 1) ** 2) continue;
      dirty.push(c);
    }
    dirty.sort((a, b) => dist2(a, pcx, pcz) - dist2(b, pcx, pcz));
    for (let i = 0; i < Math.min(this.remeshBudget, dirty.length); i++) this.rebuild(dirty[i]);

    // Drop meshes for chunks that no longer exist.
    for (const k of this.meshes.keys()) if (!this.world.chunks.has(k)) this.dispose(k);
  }

  private rebuild(c: Chunk) {
    const k = chunkKey(c.cx, c.cy, c.cz);
    this.dispose(k);
    c.dirty = false;
    const { opaque, transparent } = meshChunk(c, (x, y, z) => this.world.getBlock(x, y, z));
    const list: THREE.Mesh[] = [];
    if (opaque) list.push(this.toMesh(opaque, this.opaqueMat));
    if (transparent) list.push(this.toMesh(transparent, this.transMat));
    for (const m of list) this.group.add(m);
    if (list.length) this.meshes.set(k, list);
  }

  private toMesh(d: MeshData, mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    return m;
  }

  private dispose(k: string) {
    const list = this.meshes.get(k);
    if (!list) return;
    for (const m of list) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes.delete(k);
  }

  get meshCount() { return this.meshes.size; }
  get pendingDirty() { let n = 0; for (const c of this.world.chunks.values()) if (c.dirty) n++; return n; }
  static readonly COLUMN_CHUNKS = WORLD_HEIGHT_CHUNKS;
}

const dist2 = (c: Chunk, px: number, pz: number) => (c.cx - px) ** 2 + (c.cz - pz) ** 2;
