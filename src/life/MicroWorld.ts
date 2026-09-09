import * as THREE from 'three';
import { speciesFor, type Habitat, type Species } from '../../shared/taxonomy';
import { buildBody, type Body } from './Bodies';
import type { Input } from '../player/Input';

export type Substrate = Extract<Habitat, 'pond' | 'soil' | 'leaf' | 'moss' | 'bark'>;
export type MicroMode = 'microscope' | 'shrink';

/** Scene unit: organisms are placed by a compressed size so a 2 µm bacterium and a 1.5 mm Stentor share one dish. */
export const microScale = (um: number) => 3 * Math.log2(1 + um);

const DISH_R = 110;
const SUBSTRATE_LOOK: Record<Substrate, { floor: number; medium: number; fog: number; debris: number; label: string }> = {
  pond: { floor: 0x2a4a3a, medium: 0x6fb0c8, fog: 0.0028, debris: 0x9ac0a0, label: 'a drop of pond water' },
  soil: { floor: 0x4a3a2a, medium: 0x8a7a5a, fog: 0.0045, debris: 0xa08060, label: 'a pinch of soil' },
  leaf: { floor: 0x3a7a2a, medium: 0x9ad080, fog: 0.0032, debris: 0xc0e0a0, label: 'the surface of a leaf' },
  moss: { floor: 0x2f6b2f, medium: 0x7ab070, fog: 0.0032, debris: 0xa0d090, label: 'a cushion of moss' },
  bark: { floor: 0x5a4030, medium: 0x9a8060, fog: 0.004, debris: 0xb09070, label: 'a crack in the bark' },
};

export class MicroCritter {
  body: Body;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0; roll = 0;
  timer = 0;
  phase = Math.random() * 100;
  scale: number;
  /** Colony size for dividers / filament length for chains. */
  colony = 1;
  alive = true;
  constructor(readonly sp: Species) {
    this.body = buildBody(sp);
    this.scale = microScale(sp.size);
    this.body.group.scale.setScalar(this.scale);
  }
  get radius() { return this.body.radius * this.body.group.scale.x; }
}

/**
 * The small world. A separate scene: a dish of substrate, seeded by where the player looked,
 * populated from the taxonomy by substrate. Two ways in: the microscope (looking down, zooming)
 * and shrinking (walking among them).
 */
export class MicroWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
  readonly critters: MicroCritter[] = [];
  active = false;
  mode: MicroMode = 'microscope';
  substrate: Substrate = 'pond';
  private t = 0;
  private zoom = 100;          // microscope camera height
  private orbit = 0;
  private debris: THREE.Points | null = null;
  private light: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private floor: THREE.Mesh | null = null;
  private rim: THREE.Mesh | null = null;
  // shrink-mode controller
  private yaw = 0; private pitch = -0.2;
  private pos = new THREE.Vector3(0, 12, 40);
  onSpawn?: (c: MicroCritter) => void;

  constructor(private input: Input) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334433, 1.2);
    this.light = new THREE.DirectionalLight(0xffffff, 1.8);
    this.light.position.set(60, 120, 40);
    this.scene.add(this.hemi, this.light);
  }

  enter(substrate: Substrate, seed: number, mode: MicroMode) {
    this.leave();
    this.substrate = substrate; this.mode = mode; this.active = true; this.t = 0;
    const look = SUBSTRATE_LOOK[substrate];
    this.scene.background = new THREE.Color(look.medium);
    this.scene.fog = new THREE.FogExp2(look.medium, look.fog);

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(DISH_R, 64), new THREE.MeshStandardMaterial({ color: look.floor, roughness: 1 }));
    this.floor.rotation.x = -Math.PI / 2; this.scene.add(this.floor);
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(DISH_R, 3, 8, 64), new THREE.MeshStandardMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.35 }));
    this.rim.rotation.x = Math.PI / 2; this.scene.add(this.rim);

    // Debris: the dust that makes a microscope image look like one.
    const N = 700, arr = new Float32Array(N * 3);
    const r = rng(seed ^ 0x51ed);
    for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * DISH_R; arr[i * 3] = Math.cos(a) * d; arr[i * 3 + 1] = 0.5 + r() * 30; arr[i * 3 + 2] = Math.sin(a) * d; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.debris = new THREE.Points(g, new THREE.PointsMaterial({ color: look.debris, size: 0.9, transparent: true, opacity: 0.6 }));
    this.scene.add(this.debris);

    // Population.
    const pool = speciesFor(substrate, 'micro');
    const n = 16 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const sp = pool[Math.floor(r() * pool.length)];
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (DISH_R - 15);
      this.spawn(sp, Math.cos(a) * d, Math.sin(a) * d, r);
    }

    this.zoom = 100; this.orbit = 0;
    this.pos.set(0, 6, 30); this.yaw = 0; this.pitch = -0.15;
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }

  spawn(sp: Species, x: number, z: number, r: () => number = Math.random): MicroCritter {
    const c = new MicroCritter(sp);
    const floorY = sp.locomotion === 'sessile' || sp.locomotion === 'divide' || sp.locomotion === 'filament' || sp.body === 'tardigrade' || sp.body === 'nematode' ? 0 : 2 + r() * 24;
    c.pos.set(x, floorY + c.radius * 0.6, z);
    c.yaw = r() * Math.PI * 2;
    c.timer = r() * 2;
    this.scene.add(c.body.group);
    this.critters.push(c);
    this.onSpawn?.(c);
    return c;
  }

  leave() {
    if (!this.active && this.critters.length === 0) return;
    for (const c of this.critters) this.scene.remove(c.body.group);
    this.critters.length = 0;
    for (const o of [this.floor, this.rim, this.debris]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.floor = this.rim = null; this.debris = null;
    this.active = false;
  }

  get description() { return SUBSTRATE_LOOK[this.substrate].label; }

  // ---- per frame -----------------------------------------------------------

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    for (const c of this.critters) this.step(c, dt);
    this.controls(dt);
    if (this.debris) this.debris.rotation.y += dt * 0.01;
  }

  private controls(dt: number) {
    const [mdx, mdy] = this.input.takeMouse();
    const wheel = this.input.takeWheel();
    if (this.mode === 'microscope') {
      this.zoom = Math.max(18, Math.min(260, this.zoom * (1 + wheel * 0.12)));
      this.orbit += mdx * 0.002;
      const panSpeed = this.zoom * 0.6 * dt;
      const fwd = new THREE.Vector3(-Math.sin(this.orbit), 0, -Math.cos(this.orbit)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      if (this.input.down('KeyW')) this.pos.addScaledVector(fwd, panSpeed);
      if (this.input.down('KeyS')) this.pos.addScaledVector(fwd, -panSpeed);
      if (this.input.down('KeyD')) this.pos.addScaledVector(right, panSpeed);
      if (this.input.down('KeyA')) this.pos.addScaledVector(right, -panSpeed);
      this.pos.x = Math.max(-DISH_R, Math.min(DISH_R, this.pos.x)); this.pos.z = Math.max(-DISH_R, Math.min(DISH_R, this.pos.z));
      // Look down at the dish from `zoom` high, tilted slightly so bodies have depth.
      this.camera.position.set(this.pos.x + Math.sin(this.orbit) * this.zoom * 0.25, this.zoom, this.pos.z + Math.cos(this.orbit) * this.zoom * 0.25);
      this.camera.lookAt(this.pos.x, 0, this.pos.z);
    } else {
      this.yaw -= mdx * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - mdy * 0.0022));
      const speed = (this.input.down('ShiftLeft') ? 40 : 18) * dt;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      if (this.input.down('KeyW')) this.pos.addScaledVector(fwd, speed);
      if (this.input.down('KeyS')) this.pos.addScaledVector(fwd, -speed);
      if (this.input.down('KeyD')) this.pos.addScaledVector(right, speed);
      if (this.input.down('KeyA')) this.pos.addScaledVector(right, -speed);
      if (this.input.down('Space')) this.pos.y += speed;
      if (this.input.down('ControlLeft') || this.input.down('KeyC')) this.pos.y -= speed;
      this.pos.y = Math.max(1.5, Math.min(60, this.pos.y));
      const rr = Math.hypot(this.pos.x, this.pos.z); if (rr > DISH_R - 4) { this.pos.x *= (DISH_R - 4) / rr; this.pos.z *= (DISH_R - 4) / rr; }
      this.camera.position.copy(this.pos);
      this.camera.rotation.set(0, 0, 0, 'YXZ'); this.camera.rotation.y = this.yaw; this.camera.rotation.x = this.pitch;
    }
  }

  // ---- micro dynamics --------------------------------------------------------

  private step(c: MicroCritter, dt: number) {
    c.timer -= dt;
    const sp = c.sp, t = this.t + c.phase, p = c.body.parts;
    switch (sp.locomotion) {
      case 'cilia': {   // smooth, spiraling swim (Paramecium rows; rotifer crawls-and-swims)
        if (c.timer <= 0) { c.timer = 2 + Math.random() * 4; c.vel.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 6); }
        c.roll += dt * 2.5;
        c.pos.addScaledVector(c.vel, dt);
        c.yaw = Math.atan2(c.vel.x, c.vel.z);
        if (p.cilia) for (const ci of p.cilia) ci.rotation.y += dt * 12;
        break;
      }
      case 'flagellum': {  // Euglena: forward with a corkscrew wobble, occasional sharp turn
        if (c.timer <= 0) { c.timer = 1 + Math.random() * 3; c.yaw += (Math.random() - 0.5) * 2.5; }
        c.vel.set(Math.sin(c.yaw), Math.sin(t * 3) * 0.3, Math.cos(c.yaw)).multiplyScalar(9);
        c.pos.addScaledVector(c.vel, dt);
        c.roll += dt * 6;
        if (p.flagellum) for (const f of p.flagellum) f.rotation.x = Math.PI / 2 + Math.sin(t * 25) * 0.4;
        break;
      }
      case 'pseudopod': {  // Amoeba: very slow creep, body reshaping
        if (c.timer <= 0) { c.timer = 4 + Math.random() * 6; c.yaw = Math.random() * Math.PI * 2; }
        c.vel.set(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(0.8);
        c.pos.addScaledVector(c.vel, dt);
        if (p.pseudopod) p.pseudopod.forEach((pp, i) => { const s = 0.5 + 0.45 * Math.sin(t * 0.7 + i * 1.7); pp.scale.set(s, 0.4, s * 1.3); pp.position.set(Math.cos(pp.userData.a + t * 0.2) * 0.5, 0, Math.sin(pp.userData.a + t * 0.2) * 0.5); });
        if (p.blob) for (const bl of p.blob) bl.scale.set(1 + Math.sin(t * 0.9) * 0.1, 0.6, 1 + Math.cos(t * 0.7) * 0.1);
        break;
      }
      case 'tumble': {  // Volvox: rolling green sphere, drifting
        c.roll += dt * 1.2; c.yaw += dt * 0.4;
        if (c.timer <= 0) { c.timer = 3 + Math.random() * 3; c.vel.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.2, Math.random() - 0.5).multiplyScalar(3); }
        c.pos.addScaledVector(c.vel, dt);
        break;
      }
      case 'drift': {   // Diatom: Brownian jitter
        c.vel.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.3, (Math.random() - 0.5)).multiplyScalar(dt * 30)).multiplyScalar(0.96);
        c.pos.addScaledVector(c.vel, dt);
        c.yaw += (Math.random() - 0.5) * dt * 2;
        break;
      }
      case 'run-tumble': {  // E. coli: straight runs (~1 s), then a tumble to a new random heading
        if (c.timer <= 0) { c.timer = 0.6 + Math.random() * 1.2; c.yaw = Math.random() * Math.PI * 2; c.vel.set(Math.sin(c.yaw), (Math.random() - 0.5) * 0.4, Math.cos(c.yaw)).multiplyScalar(14); c.roll = Math.random() * 6; }
        c.pos.addScaledVector(c.vel, dt);
        if (c.timer < 0.15) c.yaw += dt * 25;   // the tumble itself
        if (p.flagellum) for (const f of p.flagellum) f.rotation.z = Math.sin(t * 40) * 0.5;
        break;
      }
      case 'divide': {  // yeast, bacillus, micrococcus: colonies grow in place
        if (c.timer <= 0 && c.colony < 12) {
          c.timer = 8 + Math.random() * 10;
          c.colony++;
          const a = Math.random() * Math.PI * 2, d = c.radius * 1.6;
          const child = this.spawn(sp, c.pos.x + Math.cos(a) * d, c.pos.z + Math.sin(a) * d);
          child.colony = c.colony; child.body.group.scale.setScalar(0.01); child.timer = 30 + Math.random() * 30;
        }
        const target = microScale(sp.size);
        if (c.body.group.scale.x < target) c.body.group.scale.addScalar(dt * target * 0.25);
        break;
      }
      case 'filament': {  // Anabaena / Streptomyces / Penicillium: extend along an axis
        if (c.colony < 6 && c.timer <= 0) { c.timer = 6 + Math.random() * 8; c.colony++; }
        const target = microScale(sp.size);
        const len = c.body.group.scale.z;
        const want = target * (1 + (c.colony - 1) * 0.45);
        if (len < want) c.body.group.scale.z += dt * target * 0.2;
        c.yaw += Math.sin(t * 0.3) * dt * 0.05;
        break;
      }
      case 'sessile': {  // Stentor: anchored, crown spins, body sways
        if (p.cilia) for (const ci of p.cilia) ci.rotation.y += dt * 6;
        c.body.group.rotation.z = Math.sin(t * 0.8) * 0.08;
        break;
      }
      case 'crawl': {   // tardigrade / nematode: slow floor walk
        if (c.timer <= 0) { c.timer = 3 + Math.random() * 5; c.yaw += (Math.random() - 0.5) * 2; }
        c.vel.set(Math.sin(c.yaw), 0, Math.cos(c.yaw)).multiplyScalar(sp.body === 'nematode' ? 4 : 1.5);
        c.pos.addScaledVector(c.vel, dt);
        c.pos.y = c.radius * 0.6;
        if (p.leg) for (const l of p.leg) l.rotation.x = Math.sin(t * 5 + (l.position.x > 0 ? 0 : Math.PI) + l.position.z * 3) * 0.7;
        if (p.seg) for (const s of p.seg) s.position.x = Math.sin(t * 6 + (s.userData.i ?? 0) * 1.1) * 0.12;
        break;
      }
      case 'swim': {    // Daphnia: jerky upward hops, then sink — the "water flea" motion
        if (c.timer <= 0) { c.timer = 0.5 + Math.random() * 0.8; c.vel.set((Math.random() - 0.5) * 8, 10 + Math.random() * 6, (Math.random() - 0.5) * 8); }
        c.vel.y -= 18 * dt; c.vel.multiplyScalar(0.985);
        c.pos.addScaledVector(c.vel, dt);
        if (p.wing) for (const w of p.wing) w.rotation.z = (w.userData.side ?? 1) * (0.6 + Math.max(0, Math.sin(t * 9)) * 0.7);
        if (p.heart) for (const h of p.heart) h.scale.setScalar(1 + Math.max(0, Math.sin(t * 20)) * 0.4);
        break;
      }
      default: break;
    }
    // Stay in the dish and in the water column.
    const rr = Math.hypot(c.pos.x, c.pos.z);
    if (rr > DISH_R - 6) { c.pos.x *= (DISH_R - 6) / rr; c.pos.z *= (DISH_R - 6) / rr; c.vel.multiplyScalar(-0.5); c.yaw += Math.PI; }
    const minY = c.radius * 0.6, maxY = 30;
    if (c.pos.y < minY) { c.pos.y = minY; c.vel.y = Math.abs(c.vel.y) * 0.5; }
    if (c.pos.y > maxY) { c.pos.y = maxY; c.vel.y = -Math.abs(c.vel.y) * 0.5; }

    c.body.group.position.copy(c.pos);
    c.body.group.rotation.y = c.yaw;
    if (sp.locomotion === 'cilia' || sp.locomotion === 'flagellum' || sp.locomotion === 'tumble') c.body.group.rotation.z = c.roll;
  }

  /** Nearest critter along camera ray. */
  pick(maxDist = 400): MicroCritter | null {
    const origin = this.camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let best: MicroCritter | null = null, bestT = maxDist;
    const oc = new THREE.Vector3();
    for (const c of this.critters) {
      oc.copy(c.pos).sub(origin);
      const tca = oc.dot(dir);
      if (tca < 0 || tca > bestT) continue;
      const r = Math.max(c.radius, 2) * 1.4;
      if (oc.lengthSq() - tca * tca > r * r) continue;
      bestT = tca; best = c;
    }
    return best;
  }
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
