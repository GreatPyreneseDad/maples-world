import * as THREE from 'three';
import type { World } from '../engine/World';
import type { Input } from './Input';
import { raycastBlocks, type RayHit } from './Raycast';

const WIDTH = 0.6, HEIGHT = 1.8, EYE = 1.62;
const GRAVITY = -28, JUMP = 9.2, WALK = 5.2, SPRINT = 8.5, FLY = 14;
const REACH = 6;

/**
 * First-person controller with swept AABB collision against the voxel grid.
 * Position is the feet center. Resolves each axis independently (classic voxel approach):
 * robust, no tunneling at these speeds with dt clamped.
 */
export class Player {
  pos = new THREE.Vector3(0.5, 80, 0.5);
  vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  onGround = false;
  flying = false;
  target: RayHit | null = null;
  private lastSpaceTap = 0;

  constructor(readonly camera: THREE.PerspectiveCamera, private world: World, private input: Input) {}

  spawnOnSurface(x: number, z: number) {
    const h = this.world.surfaceHeight(x, z);
    this.pos.set(x + 0.5, h + 1.01, z + 0.5);
    this.vel.set(0, 0, 0);
  }

  update(dtRaw: number) {
    const dt = Math.min(dtRaw, 1 / 30);
    this.look();
    this.move(dt);
    this.updateCamera();
    this.target = this.ray();
  }

  private look() {
    const [dx, dy] = this.input.takeMouse();
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch - dy * 0.0022));
  }

  private move(dt: number) {
    const inp = this.input;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (inp.down('KeyW')) wish.add(fwd);
    if (inp.down('KeyS')) wish.sub(fwd);
    if (inp.down('KeyD')) wish.add(right);
    if (inp.down('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    // Double-tap space toggles flight (creative mode default for a builder's sandbox).
    if (inp.down('Space')) {
      const now = performance.now();
      if (!this.spaceHeld) {
        if (now - this.lastSpaceTap < 260) { this.flying = !this.flying; this.vel.y = 0; }
        this.lastSpaceTap = now;
      }
      this.spaceHeld = true;
    } else this.spaceHeld = false;

    const speed = this.flying ? FLY : inp.down('ShiftLeft') ? SPRINT : WALK;
    this.vel.x = wish.x * speed;
    this.vel.z = wish.z * speed;

    if (this.flying) {
      this.vel.y = (inp.down('Space') ? 1 : 0) * speed - (inp.down('ControlLeft') || inp.down('KeyC') ? speed : 0);
    } else {
      this.vel.y += GRAVITY * dt;
      if (this.onGround && inp.down('Space')) { this.vel.y = JUMP; this.onGround = false; }
      this.vel.y = Math.max(this.vel.y, -60);
    }

    this.sweep(dt);
  }
  private spaceHeld = false;

  private sweep(dt: number) {
    const hw = WIDTH / 2;
    const collides = (px: number, py: number, pz: number) => {
      const x0 = Math.floor(px - hw), x1 = Math.floor(px + hw - 1e-6);
      const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT - 1e-6);
      const z0 = Math.floor(pz - hw), z1 = Math.floor(pz + hw - 1e-6);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++)
        if (this.world.isSolidAt(x, y, z)) return true;
      return false;
    };

    // Y axis
    let ny = this.pos.y + this.vel.y * dt;
    if (collides(this.pos.x, ny, this.pos.z)) {
      if (this.vel.y < 0) { ny = Math.floor(ny) + 1; this.onGround = true; }
      else ny = Math.floor(ny + HEIGHT) - HEIGHT - 1e-4;
      this.vel.y = 0;
    } else this.onGround = false;
    this.pos.y = ny;

    // X axis (with step-up for 1-block ledges when walking on ground)
    let nx = this.pos.x + this.vel.x * dt;
    if (collides(nx, this.pos.y, this.pos.z)) {
      nx = this.vel.x > 0 ? Math.floor(nx + hw) - hw - 1e-4 : Math.floor(nx - hw) + 1 + hw + 1e-4;
      this.vel.x = 0;
    }
    this.pos.x = nx;

    // Z axis
    let nz = this.pos.z + this.vel.z * dt;
    if (collides(this.pos.x, this.pos.y, nz)) {
      nz = this.vel.z > 0 ? Math.floor(nz + hw) - hw - 1e-4 : Math.floor(nz - hw) + 1 + hw + 1e-4;
      this.vel.z = 0;
    }
    this.pos.z = nz;

    if (this.pos.y < -10) this.spawnOnSurface(Math.floor(this.pos.x), Math.floor(this.pos.z));
  }

  private updateCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  facing(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation).normalize();
  }

  private ray(): RayHit | null {
    const d = this.facing();
    const o = this.camera.position;
    return raycastBlocks(this.world, o.x, o.y, o.z, d.x, d.y, d.z, REACH);
  }

  /** Would placing a block at (x,y,z) intersect the player? */
  intersectsBlock(x: number, y: number, z: number) {
    const hw = WIDTH / 2;
    return x + 1 > this.pos.x - hw && x < this.pos.x + hw &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT &&
      z + 1 > this.pos.z - hw && z < this.pos.z + hw;
  }
}
