import * as THREE from 'three';
import type { World } from '../engine/World';
import { ELEMENT_BY_SYMBOL, elementColor } from '../../shared/chemistry';

/**
 * Atoms in the world. Each is a small glowing sphere wearing its chemical symbol.
 * They pop out of a broken block, bounce, settle, and drift to the player when close.
 */
export class Atom {
  mesh: THREE.Group;
  vel = new THREE.Vector3();
  age = 0;
  alive = true;
  constructor(readonly symbol: string, readonly pos: THREE.Vector3) {
    this.mesh = makeAtomMesh(symbol);
    this.mesh.position.copy(pos);
  }
}

const spriteCache = new Map<string, THREE.Texture>();
function symbolTexture(sym: string): THREE.Texture {
  let t = spriteCache.get(sym);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const color = '#' + elementColor(sym).toString(16).padStart(6, '0');
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
  // Legible on light and dark atoms.
  const lum = (elementColor(sym) >> 16 & 255) * 0.299 + (elementColor(sym) >> 8 & 255) * 0.587 + (elementColor(sym) & 255) * 0.114;
  ctx.fillStyle = lum > 150 ? '#1a1a2a' : '#ffffff';
  ctx.font = `bold ${sym.length > 1 ? 58 : 70}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sym, 64, 68);
  ctx.font = '22px system-ui, sans-serif'; ctx.fillText(String(ELEMENT_BY_SYMBOL[sym]?.z ?? ''), 64, 24);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(sym, t);
  return t;
}

const matCache = new Map<string, THREE.SpriteMaterial>();
function makeAtomMesh(sym: string) {
  const g = new THREE.Group();
  let m = matCache.get(sym);
  if (!m) { m = new THREE.SpriteMaterial({ map: symbolTexture(sym), transparent: true, depthWrite: false }); matCache.set(sym, m); }
  const s = new THREE.Sprite(m); s.scale.setScalar(0.42);
  g.add(s);
  return g;
}

export class ElementDrops {
  readonly atoms: Atom[] = [];
  readonly group = new THREE.Group();
  maxAtoms = 80;
  /** Called when the player collects one. */
  onCollect?: (symbol: string) => void;
  private t = 0;

  constructor(private world: World, scene: THREE.Scene) { scene.add(this.group); }

  /** Pop atoms out of a broken block at (x,y,z). */
  burst(x: number, y: number, z: number, symbols: string[]) {
    for (const sym of symbols) {
      const a = new Atom(sym, new THREE.Vector3(x + 0.5, y + 0.6, z + 0.5));
      const ang = Math.random() * Math.PI * 2;
      a.vel.set(Math.cos(ang) * (1 + Math.random() * 1.5), 3 + Math.random() * 2, Math.sin(ang) * (1 + Math.random() * 1.5));
      this.atoms.push(a); this.group.add(a.mesh);
    }
    while (this.atoms.length > this.maxAtoms) this.remove(this.atoms[0]);
  }

  update(dtRaw: number, player: THREE.Vector3) {
    const dt = Math.min(dtRaw, 0.1);
    this.t += dt;
    for (const a of this.atoms) {
      a.age += dt;
      const toPlayer = new THREE.Vector3(player.x, player.y + 0.9, player.z).sub(a.pos);
      const d = toPlayer.length();
      if (d < 2.6 && a.age > 0.5) {                        // magnet: glide straight to the player
        a.vel.set(0, 0, 0);
        a.pos.addScaledVector(toPlayer.normalize(), Math.min(d, (4 + (2.6 - d) * 4) * dt));
      } else {
        a.vel.y -= 12 * dt;
        a.vel.x *= 0.98; a.vel.z *= 0.98;
      }
      a.pos.addScaledVector(a.vel, dt);
      // Ground: rest on top of the highest solid block beneath.
      const bx = Math.floor(a.pos.x), bz = Math.floor(a.pos.z);
      if (!(d < 2.6 && a.age > 0.5) && this.world.isSolidAt(bx, Math.floor(a.pos.y - 0.2), bz)) {
        a.pos.y = Math.floor(a.pos.y - 0.2) + 1.2; a.vel.y = Math.abs(a.vel.y) * 0.3; a.vel.x *= 0.6; a.vel.z *= 0.6;
      }
      if (a.pos.y < 0) a.alive = false;
      a.mesh.position.copy(a.pos);
      a.mesh.position.y += Math.sin(this.t * 3 + a.pos.x) * 0.05;
      if (a.pos.distanceTo(new THREE.Vector3(player.x, player.y + 0.9, player.z)) < 0.6 && a.age > 0.5) { a.alive = false; this.onCollect?.(a.symbol); }
      if (a.age > 120) a.alive = false;                     // don't litter forever
    }
    for (let i = this.atoms.length - 1; i >= 0; i--) if (!this.atoms[i].alive) this.remove(this.atoms[i]);
  }

  private remove(a: Atom) {
    this.group.remove(a.mesh);
    const i = this.atoms.indexOf(a); if (i >= 0) this.atoms.splice(i, 1);
  }
}
