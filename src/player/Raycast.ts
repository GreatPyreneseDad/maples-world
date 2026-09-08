import type { World } from '../engine/World';

export interface RayHit {
  /** Block that was hit. */
  block: [number, number, number];
  /** Face normal — the empty cell adjacent to the hit face is block + normal. */
  normal: [number, number, number];
  distance: number;
  id: number;
}

/** Amanatides–Woo voxel traversal. */
export function raycastBlocks(
  world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
): RayHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  const frac = (v: number) => v - Math.floor(v);
  let tMaxX = dx > 0 ? (1 - frac(ox)) * tDeltaX : dx < 0 ? frac(ox) * tDeltaX : Infinity;
  let tMaxY = dy > 0 ? (1 - frac(oy)) * tDeltaY : dy < 0 ? frac(oy) * tDeltaY : Infinity;
  let tMaxZ = dz > 0 ? (1 - frac(oz)) * tDeltaZ : dz < 0 ? frac(oz) * tDeltaZ : Infinity;
  let normal: [number, number, number] = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 256 && t <= maxDist; i++) {
    const id = world.getBlockGen(x, y, z);
    if (id !== 0 && world.isSolidAt(x, y, z)) return { block: [x, y, z], normal, distance: t, id };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0]; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0]; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ]; }
  }
  return null;
}
