import * as THREE from 'three';
import type { World } from '../engine/World';
import { blockId, isSolid } from '../engine/Blocks';
import { SEA_LEVEL } from '../engine/Terrain';
import { SPECIES, SPECIES_BY_ID, speciesFor, type Habitat, type Species } from '../../shared/taxonomy';
import { buildBody, type Body } from './Bodies';

const B = { grass: blockId('grass'), sand: blockId('sand'), water: blockId('water'), snow: blockId('snow'), wood: blockId('wood'), leaves: blockId('leaves'), dirt: blockId('dirt') };

/** Deterministic per-column RNG so the same world shows the same life at the same spots. */
function rng(seed: number, a: number, b: number) {
  let s = (seed ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Critter {
  static nextId = 1;
  readonly id = Critter.nextId++;
  body: Body;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  /** Behavior scratch */
  target = new THREE.Vector3();
  timer = 0;
  phase = Math.random() * 100;
  /** Growth 0..1 for plants and fungi; 1 for animals. */
  growth = 1;
  age = 0;
  alive = true;
  spawnedBy: 'world' | 'genie' | 'spread' = 'world';

  constructor(readonly sp: Species) {
    this.body = buildBody(sp);
    this.body.group.scale.setScalar(this.visualSize);
  }

  /** Macro sizes are honest meters, but a 7 mm ladybird would be invisible — clamp the low end for legibility. */
  get visualSize() { return this.sp.tier === 'macro' ? Math.max(this.sp.size, 0.22) : this.sp.size; }

  /** World-space bounding sphere radius (for aim picking). */
  get radius() { return this.body.radius * this.body.group.scale.x; }
}

interface Column { key: string; cx: number; cz: number; critters: Critter[] }

/**
 * Macro-scale life. Spawns deterministically per chunk column, applies kingdom dynamics each
 * frame, despawns far columns. Genie-spawned critters are tracked with the column they stand in.
 */
export class LifeSystem {
  readonly critters: Critter[] = [];
  readonly group = new THREE.Group();
  private columns = new Map<string, Column>();
  radius = 4;          // columns
  maxPerColumn = 5;
  private t = 0;
  onSpawn?: (c: Critter) => void;

  constructor(private world: World, scene: THREE.Scene) { scene.add(this.group); }

  // ---- population ----------------------------------------------------------

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    const pcx = Math.floor(player.x) >> 4, pcz = Math.floor(player.z) >> 4;
    // Spawn one new column per frame at most (keeps frame time flat).
    outer: for (let dz = -this.radius; dz <= this.radius; dz++) for (let dx = -this.radius; dx <= this.radius; dx++) {
      const cx = pcx + dx, cz = pcz + dz, key = `${cx},${cz}`;
      if (!this.columns.has(key) && this.world.hasColumn(cx, cz)) { this.spawnColumn(cx, cz); break outer; }
    }
    for (const col of this.columns.values()) {
      if (Math.abs(col.cx - pcx) > this.radius + 1 || Math.abs(col.cz - pcz) > this.radius + 1) this.despawnColumn(col);
    }
    for (const c of this.critters) this.step(c, dt, player);
    if (this.critters.some(c => !c.alive)) this.reap();
  }

  /** Spawn every column in range now (tests, teleports). Normal play spreads this over frames. */
  settle(player: THREE.Vector3) {
    const pcx = Math.floor(player.x) >> 4, pcz = Math.floor(player.z) >> 4;
    for (let dz = -this.radius; dz <= this.radius; dz++) for (let dx = -this.radius; dx <= this.radius; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (!this.columns.has(`${cx},${cz}`)) { this.world.generateColumn(cx, cz); this.spawnColumn(cx, cz); }
    }
  }

  private spawnColumn(cx: number, cz: number) {
    const col: Column = { key: `${cx},${cz}`, cx, cz, critters: [] };
    this.columns.set(col.key, col);
    const r = rng(this.world.seed, cx, cz);
    const n = 1 + Math.floor(r() * this.maxPerColumn);
    for (let i = 0; i < n; i++) {
      const x = cx * 16 + Math.floor(r() * 16), z = cz * 16 + Math.floor(r() * 16);
      const hab = this.habitatAt(x, z, r);
      if (!hab) continue;
      const pool = speciesFor(hab, 'macro');
      if (!pool.length) continue;
      const sp = weighted(pool, r());
      const c = this.place(sp, x, z, r);
      if (c) { col.critters.push(c); c.spawnedBy = 'world'; }
    }
  }

  /** Public: the genie asks for a creature near a point. */
  spawn(sp: Species, x: number, z: number): Critter | null {
    const c = this.place(sp, x, z, Math.random);
    if (!c) return null;
    c.spawnedBy = 'genie';
    const key = `${Math.floor(x) >> 4},${Math.floor(z) >> 4}`;
    const col = this.columns.get(key) ?? (() => { const nc: Column = { key, cx: Math.floor(x) >> 4, cz: Math.floor(z) >> 4, critters: [] }; this.columns.set(key, nc); return nc; })();
    col.critters.push(c);
    return c;
  }

  private place(sp: Species, x: number, z: number, r: () => number): Critter | null {
    const c = new Critter(sp);
    const h = this.world.surfaceHeight(x, z);
    const surfaceId = this.world.getBlock(x, h, z);
    const inWater = this.world.getBlock(x, h + 1, z) === B.water;
    if (sp.locomotion === 'swim') {
      if (!inWater && sp.id !== 'mallard') return null;
      c.pos.set(x + 0.5, sp.id === 'mallard' ? SEA_LEVEL + 0.9 : h + 1 + r() * Math.max(0.5, SEA_LEVEL - h - 1), z + 0.5);
    } else if (sp.locomotion === 'fly') {
      c.pos.set(x + 0.5, h + 3 + r() * 6, z + 0.5);
    } else {
      if (inWater || surfaceId === B.water) return null;
      c.pos.set(x + 0.5, h + 1, z + 0.5);
    }
    c.yaw = r() * Math.PI * 2;
    c.target.copy(c.pos);
    if (sp.kingdom === 'Plantae' || sp.kingdom === 'Fungi') c.growth = 0.35 + r() * 0.65;
    this.applyTransform(c);
    this.group.add(c.body.group);
    this.critters.push(c);
    this.onSpawn?.(c);
    return c;
  }

  private despawnColumn(col: Column) {
    for (const c of col.critters) c.alive = false;
    this.columns.delete(col.key);
    this.reap();
  }

  private reap() {
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      if (c.alive) continue;
      this.group.remove(c.body.group);
      this.critters.splice(i, 1);
    }
  }

  /** Classify the surface at (x,z) into a macro habitat. */
  habitatAt(x: number, z: number, r: () => number = Math.random): Habitat | null {
    const h = this.world.surfaceHeight(x, z);
    if (h < 0) return null;
    const top = this.world.getBlock(x, h, z);
    if (this.world.getBlock(x, h + 1, z) === B.water) return 'water';
    // Look around for water (shore), canopy (shade/forest), trunks (wood).
    let water = 0, leaves = 0, wood = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const hh = this.world.surfaceHeight(x + dx, z + dz);
      if (this.world.getBlock(x + dx, hh + 1, z + dz) === B.water) water++;
      for (let dy = 1; dy <= 8; dy++) { const id = this.world.getBlock(x + dx, h + dy, z + dz); if (id === B.leaves) leaves++; else if (id === B.wood) wood++; }
    }
    if (top === B.sand) return water > 0 ? 'shore' : 'sand';
    if (top === B.snow) return 'snow';
    if (water > 0 && top === B.grass) return 'shore';
    if (wood > 2 && r() < 0.4) return 'wood';
    if (leaves > 6) return r() < 0.35 ? 'shade' : 'forest';
    if (top === B.grass) return 'grass';
    return null;
  }

  // ---- dynamics -----------------------------------------------------------

  private step(c: Critter, dt: number, player: THREE.Vector3) {
    c.age += dt; c.timer -= dt;
    const sp = c.sp;
    const distP = c.pos.distanceTo(player);
    switch (sp.locomotion) {
      case 'walk': this.walk(c, dt, player, distP, sp.id === 'sand-lizard' ? 2.2 : 1.6, sp.id === 'red-fox' ? 0 : 5); break;
      case 'crawl': this.walk(c, dt, player, distP, 0.35, 0); break;
      case 'hop': this.hop(c, dt, player, distP); break;
      case 'fly': this.fly(c, dt); break;
      case 'swim': sp.id === 'mallard' ? this.paddle(c, dt) : this.swim(c, dt); break;
      case 'burrow': this.burrow(c, dt); break;
      case 'sessile': case 'spread': this.grow(c, dt); break;
      default: break;
    }
    this.animate(c, dt);
    this.applyTransform(c);
  }

  private pickGroundTarget(c: Critter, range: number, allowWater = false) {
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * range;
      const x = Math.floor(c.pos.x + Math.cos(a) * d), z = Math.floor(c.pos.z + Math.sin(a) * d);
      const h = this.world.surfaceHeight(x, z);
      const wet = this.world.getBlock(x, h + 1, z) === B.water;
      if (wet && !allowWater) continue;
      if (Math.abs(h + 1 - c.pos.y) > 3) continue;
      c.target.set(x + 0.5, h + 1, z + 0.5);
      return;
    }
    c.target.copy(c.pos);
  }

  private walk(c: Critter, dt: number, player: THREE.Vector3, distP: number, speed: number, fleeDist: number) {
    if (fleeDist && distP < fleeDist) {
      const away = c.pos.clone().sub(player).setY(0).normalize().multiplyScalar(6);
      c.target.copy(c.pos).add(away); c.target.y = this.world.surfaceHeight(Math.floor(c.target.x), Math.floor(c.target.z)) + 1;
      c.timer = 1.2; speed *= 1.8;
    } else if (c.timer <= 0) {
      if (Math.random() < 0.5) { c.timer = 1 + Math.random() * 3; c.target.copy(c.pos); }   // graze/rest
      else { this.pickGroundTarget(c, 6); c.timer = 3 + Math.random() * 4; }
    }
    this.moveToward(c, dt, speed, true);
  }

  private hop(c: Critter, dt: number, player: THREE.Vector3, distP: number) {
    const ground = this.world.surfaceHeight(Math.floor(c.pos.x), Math.floor(c.pos.z)) + 1;
    const onGround = c.pos.y <= ground + 0.02;
    if (onGround) {
      c.pos.y = ground; c.vel.set(0, 0, 0);
      const scared = distP < 4;
      if (c.timer <= 0 || scared) {
        if (scared) { const away = c.pos.clone().sub(player).setY(0).normalize(); c.target.copy(c.pos).addScaledVector(away, 4); }
        else if (Math.random() < 0.6) this.pickGroundTarget(c, 4, c.sp.id === 'common-frog');
        const dir = c.target.clone().sub(c.pos).setY(0);
        const len = dir.length();
        if (len > 0.3) {
          dir.normalize();
          const power = c.sp.id === 'common-frog' ? 3.2 : 3.8;
          c.vel.set(dir.x * power * 0.9, scared ? power * 1.3 : power, dir.z * power * 0.9);
          c.yaw = Math.atan2(dir.x, dir.z);
        }
        c.timer = scared ? 0.2 : 0.6 + Math.random() * 2.5;
      }
    } else {
      c.vel.y -= 14 * dt;
      c.pos.addScaledVector(c.vel, dt);
      const g2 = this.world.surfaceHeight(Math.floor(c.pos.x), Math.floor(c.pos.z)) + 1;
      if (c.pos.y < g2) { c.pos.y = g2; c.vel.set(0, 0, 0); }
    }
  }

  private fly(c: Critter, dt: number) {
    const isBee = c.sp.id === 'honey-bee';
    if (c.timer <= 0) {
      c.timer = isBee ? 1.5 + Math.random() * 2 : 3 + Math.random() * 5;
      let flower: Critter | null = null;
      if (isBee && Math.random() < 0.7) {
        let best = 1e9;
        for (const o of this.critters) if (o.sp.body === 'flower' || o.sp.body === 'clover') { const d = o.pos.distanceToSquared(c.pos); if (d < best && d < 400) { best = d; flower = o; } }
      }
      if (flower) c.target.copy(flower.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      else {
        const a = Math.random() * Math.PI * 2, d = isBee ? 3 + Math.random() * 5 : 8 + Math.random() * 20;
        const x = c.pos.x + Math.cos(a) * d, z = c.pos.z + Math.sin(a) * d;
        const h = this.world.surfaceHeight(Math.floor(x), Math.floor(z));
        c.target.set(x, h + (isBee ? 0.8 + Math.random() * 1.5 : 5 + Math.random() * 10), z);
      }
    }
    const speed = isBee ? 2.2 : 6;
    this.moveToward(c, dt, speed, false);
    // Never clip into ground.
    const ground = this.world.surfaceHeight(Math.floor(c.pos.x), Math.floor(c.pos.z)) + 1;
    if (c.pos.y < ground + 0.3) c.pos.y = ground + 0.3;
  }

  private swim(c: Critter, dt: number) {
    if (c.timer <= 0) {
      c.timer = 2 + Math.random() * 3;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 5;
        const x = c.pos.x + Math.cos(a) * d, z = c.pos.z + Math.sin(a) * d, y = c.pos.y + (Math.random() - 0.5) * 2;
        if (this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.water) { c.target.set(x, y, z); break; }
      }
    }
    this.moveToward(c, dt, 1.4, false);
    if (this.world.getBlock(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z)) !== B.water) { c.target.copy(c.pos); c.pos.y -= dt; }
  }

  private paddle(c: Critter, dt: number) {
    if (c.timer <= 0) {
      c.timer = 2 + Math.random() * 4;
      for (let tries = 0; tries < 6; tries++) {
        const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 6;
        const x = c.pos.x + Math.cos(a) * d, z = c.pos.z + Math.sin(a) * d;
        if (this.world.getBlock(Math.floor(x), SEA_LEVEL, Math.floor(z)) === B.water) { c.target.set(x, SEA_LEVEL + 0.9, z); break; }
      }
    }
    this.moveToward(c, dt, 0.9, false);
    c.pos.y = SEA_LEVEL + 0.9 + Math.sin(this.t * 2 + c.phase) * 0.04;
  }

  private burrow(c: Critter, dt: number) {
    // Mostly underground: surfaces for a few seconds, then sinks. Visible fraction ≈ 35%.
    if (c.timer <= 0) { c.timer = 3 + Math.random() * 5; c.phase = Math.random() < 0.35 ? 1 : 0; this.pickGroundTarget(c, 2); }
    const ground = this.world.surfaceHeight(Math.floor(c.pos.x), Math.floor(c.pos.z)) + 1;
    const targetY = c.phase ? ground - 0.02 : ground - 0.25;
    c.pos.y += (targetY - c.pos.y) * Math.min(1, dt * 2);
    if (c.phase) this.moveToward(c, dt, 0.25, false, true);
  }

  private grow(c: Critter, dt: number) {
    if (c.growth < 1) c.growth = Math.min(1, c.growth + dt / 90);   // ~90 s to maturity
    c.body.group.scale.setScalar(c.visualSize * (0.3 + 0.7 * c.growth));
    if (c.sp.locomotion !== 'spread' || c.growth < 1) return;
    // Spread: rare, capped, habitat-checked. Plants want light (no canopy); fungi want shade/wood.
    if (c.timer > 0) return;
    c.timer = 20 + Math.random() * 40;
    if (Math.random() > 0.35) return;
    const near = this.critters.filter(o => o.sp.id === c.sp.id && o.pos.distanceToSquared(c.pos) < 64).length;
    if (near >= 6) return;
    const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 3;
    const x = Math.floor(c.pos.x + Math.cos(a) * d), z = Math.floor(c.pos.z + Math.sin(a) * d);
    const hab = this.habitatAt(x, z);
    if (!hab || !c.sp.habitats.includes(hab)) return;
    const child = this.place(c.sp, x, z, Math.random);
    if (child) { child.growth = 0.05; child.spawnedBy = 'spread'; this.columns.get(`${x >> 4},${z >> 4}`)?.critters.push(child); }
  }

  private moveToward(c: Critter, dt: number, speed: number, stickToGround: boolean, keepY = false) {
    const to = c.target.clone().sub(c.pos);
    if (keepY) to.y = 0;
    const dist = to.length();
    if (dist < 0.15) { c.vel.set(0, 0, 0); return; }
    to.normalize();
    const step = Math.min(dist, speed * dt);
    c.pos.addScaledVector(to, step);
    c.vel.copy(to).multiplyScalar(speed);
    const targetYaw = Math.atan2(to.x, to.z);
    let dy = targetYaw - c.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    c.yaw += dy * Math.min(1, dt * 6);
    if (stickToGround) {
      const g = this.world.surfaceHeight(Math.floor(c.pos.x), Math.floor(c.pos.z)) + 1;
      if (isSolid(this.world.getBlock(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z))) && g - c.pos.y > 1.2) { c.pos.addScaledVector(to, -step); c.target.copy(c.pos); return; } // wall: give up
      c.pos.y += (g - c.pos.y) * Math.min(1, dt * 10);
    }
  }

  private animate(c: Critter, dt: number) {
    const p = c.body.parts, t = this.t + c.phase;
    const moving = c.vel.lengthSq() > 0.01;
    if (p.leg) for (const l of p.leg) l.rotation.x = moving ? Math.sin(t * 9 + (l.userData.phase ?? (l.position.x > 0 ? 0 : Math.PI))) * 0.6 : 0;
    if (p.wing) for (const w of p.wing) { const f = c.sp.body === 'bird' ? 5 : 40; w.rotation.z = (w.userData.side ?? 1) * Math.sin(t * f) * (c.sp.body === 'bird' ? 0.6 : 0.9); }
    if (p.tail) for (const tl of p.tail) tl.rotation.y = Math.sin(t * (c.sp.body === 'fish' ? 8 : 3)) * 0.4;
    if (p.seg) for (const s of p.seg) s.position.x = Math.sin(t * 4 + (s.userData.i ?? 0) * 0.9) * 0.05;
    if (p.frond) for (const f of p.frond) f.rotation.z = Math.sin(t * 0.8 + f.rotation.y) * 0.04;
    if (p.head) for (const h of p.head) h.rotation.z = Math.sin(t * 0.7) * 0.05;
    void dt;
  }

  private applyTransform(c: Critter) {
    c.body.group.position.copy(c.pos);
    c.body.group.rotation.y = c.yaw;
    if (c.sp.locomotion === 'fly' || c.sp.locomotion === 'swim') c.body.group.rotation.x = -Math.atan2(c.vel.y, Math.hypot(c.vel.x, c.vel.z) + 1e-6) * 0.6;
  }

  /** Nearest critter along a ray (camera aim), by bounding sphere. */
  pick(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 12): Critter | null {
    let best: Critter | null = null, bestT = maxDist;
    const oc = new THREE.Vector3();
    for (const c of this.critters) {
      oc.copy(c.pos).sub(origin);
      const tca = oc.dot(dir);
      if (tca < 0 || tca > bestT) continue;
      const r = Math.max(c.radius, 0.25) * 1.3;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 > r * r) continue;
      bestT = tca; best = c;
    }
    return best;
  }

  /** Counts by kingdom, for HUD/debug. */
  census() {
    const out: Record<string, number> = {};
    for (const c of this.critters) out[c.sp.kingdom] = (out[c.sp.kingdom] ?? 0) + 1;
    return out;
  }

  static species(id: string) { return SPECIES_BY_ID[id]; }
  static all() { return SPECIES; }
}

function weighted(pool: Species[], r: number): Species {
  const total = pool.reduce((s, sp) => s + (sp.weight ?? 1), 0);
  let acc = r * total;
  for (const sp of pool) { acc -= sp.weight ?? 1; if (acc <= 0) return sp; }
  return pool[pool.length - 1];
}
