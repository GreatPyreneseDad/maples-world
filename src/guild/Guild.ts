import * as THREE from 'three';
import type { World } from '../engine/World';
import { blockId, isSolid, BLOCK_BY_NAME } from '../engine/Blocks';
import type { LifeSystem, Critter } from '../life/LifeSystem';
import { SPECIES_BY_ID, type Species } from '../../shared/taxonomy';
import { QUEST_TEMPLATES, QUEST_ANIMALS, foodOf, habitatNeed, rankFor, type QuestKind, type HabitatNeed } from '../../shared/guild';
import type { BlockName } from '../../shared/genie-tools';

export interface Quest {
  id: string;
  kind: QuestKind;
  speciesId: string;
  foodId?: string;
  title: string;
  brief: string;
  /** Marker position (follows the subject for feed/shelter/free). */
  pos: THREE.Vector3;
  subjectId?: number;
  need?: HabitatNeed;
  cage?: [number, number, number][];
  startedAt: number;
  progress: string;
  done: boolean;
  points: number;
}

/**
 * The Animal Protector Guild. Reads the living world, hands out quests, watches for them
 * to be completed by real changes in the world (a plant eaten, a sheep under a roof, a stone
 * removed, a pond dug), and rewards with rank and friendship.
 */
export class Guild {
  quests: Quest[] = [];
  points = 0;
  completed: string[] = [];
  befriended = new Set<string>();
  private markers = new Map<string, THREE.Sprite>();
  private group = new THREE.Group();
  private t = 0;
  private checkT = 0;
  private key: string;
  private seq = 0;
  onQuest?: (q: Quest) => void;
  onComplete?: (q: Quest) => void;
  onProgress?: (q: Quest) => void;
  onRank?: (name: string) => void;

  constructor(private world: World, private life: LifeSystem, worldId: string, scene: THREE.Scene, private playerPos: () => THREE.Vector3, private facing: () => THREE.Vector3) {
    this.key = `maples:guild:${worldId}`;
    scene.add(this.group);
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? '{}');
      this.points = saved.points ?? 0; this.completed = saved.completed ?? []; for (const s of saved.befriended ?? []) this.befriended.add(s);
    } catch { /* fresh */ }
    life.onEvent = (kind, c, other) => this.onLifeEvent(kind, c, other);
  }

  get rank() { return rankFor(this.points); }
  get active() { return this.quests.filter(q => !q.done); }

  // ---- offering ------------------------------------------------------------

  /** Offer a quest. Chooses a kind the player hasn't got active, preferring animals already nearby. */
  offer(kind?: QuestKind, speciesId?: string): Quest | null {
    if (this.active.length >= 3) return null;
    const kinds: QuestKind[] = ['feed', 'shelter', 'free', 'habitat'];
    const activeKinds = new Set(this.active.map(q => q.kind));
    const pick = kind ?? kinds.filter(k => !activeKinds.has(k))[Math.floor(Math.random() * kinds.filter(k => !activeKinds.has(k)).length)] ?? 'feed';
    const p = this.playerPos(), f = this.facing();
    const ahead = (d: number) => { const x = Math.floor(p.x + f.x * d + (Math.random() - 0.5) * 4), z = Math.floor(p.z + f.z * d + (Math.random() - 0.5) * 4); return { x, z, y: this.world.surfaceHeight(x, z) + 1 }; };

    let q: Quest | null = null;
    if (pick === 'feed') {
      // Prefer a hungry stranger already nearby.
      let subject = this.life.critters.find(c => c.sp.diet?.length && !c.friendly && !c.sp.domestic && (!speciesId || c.sp.id === speciesId) && c.pos.distanceTo(p) < 40 && !this.active.some(a => a.subjectId === c.id));
      if (!subject) {
        const pool = QUEST_ANIMALS.filter(s => !s.domestic && s.locomotion !== 'swim');
        subject = this.spawnNear((speciesId && SPECIES_BY_ID[speciesId]) || pool[Math.floor(Math.random() * pool.length)], ahead(12)) ?? undefined;
      }
      if (!subject) return null;
      const food = foodOf(subject.sp)!;
      q = this.make('feed', subject.sp, food, subject.pos.clone(), subject.id);
    } else if (pick === 'shelter') {
      const sp = SPECIES_BY_ID[this.completed.filter(id => id.startsWith('shelter')).length % 2 === 0 ? 'sheep' : 'chicken'];
      const subject = this.spawnNear(sp, ahead(9));
      if (!subject) return null;
      q = this.make('shelter', sp, foodOf(sp), subject.pos.clone(), subject.id);
    } else if (pick === 'free') {
      const pool = ['rabbit', 'red-fox', 'red-deer', 'roman-snail'].map(id => SPECIES_BY_ID[id]);
      const sp = pool[Math.floor(Math.random() * pool.length)];
      const at = ahead(11);
      const subject = this.spawnNear(sp, at);
      if (!subject) return null;
      subject.stuck = true;
      const cage = this.buildCage(Math.floor(subject.pos.x), Math.floor(subject.pos.y), Math.floor(subject.pos.z));
      q = this.make('free', sp, undefined, subject.pos.clone(), subject.id);
      q.cage = cage;
    } else {
      const pool = ['common-frog', 'honey-bee', 'roman-snail', 'rabbit', 'red-deer', 'mallard'].map(id => SPECIES_BY_ID[id]);
      const sp = (speciesId && SPECIES_BY_ID[speciesId]) || pool[Math.floor(Math.random() * pool.length)];
      const at = ahead(10);
      q = this.make('habitat', sp, foodOf(sp), new THREE.Vector3(at.x + 0.5, at.y, at.z + 0.5));
      q.need = habitatNeed(sp, foodOf(sp));
    }
    this.quests.push(q);
    this.marker(q);
    this.persist();
    this.onQuest?.(q);
    return q;
  }

  private make(kind: QuestKind, sp: Species, food: Species | undefined, pos: THREE.Vector3, subjectId?: number): Quest {
    const t = QUEST_TEMPLATES[kind];
    return { id: `${kind}-${sp.id}-${++this.seq}-${Date.now().toString(36)}`, kind, speciesId: sp.id, foodId: food?.id, title: t.title(sp, food), brief: t.brief(sp, food), pos, subjectId, startedAt: this.t, progress: '', done: false, points: t.points };
  }

  private spawnNear(sp: Species, at: { x: number; y: number; z: number }): Critter | null {
    // Spiral outward from `at`, visiting every column once: habitat-picky species (a frog wants
    // the pond's rim) are found reliably instead of by luck.
    const first = this.life.spawn(sp, at.x, at.z);
    if (first) return first;
    for (let r = 1; r <= 7; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = this.life.spawn(sp, at.x + dx, at.z + dz);
        if (c) return c;
      }
    }
    return null;
  }

  /** A hollow cobble box around (x,y,z): the "rockfall". Returns the shell cells so we can tell when one is removed. */
  private buildCage(x: number, y: number, z: number): [number, number, number][] {
    const cells: [number, number, number][] = [];
    const cobble = blockId('cobble');
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 2; dy++) {
      const shell = Math.abs(dx) === 1 || Math.abs(dz) === 1 || dy === 2;
      if (!shell) continue;
      const bx = x + dx, by = y + dy, bz = z + dz;
      if (this.world.setBlock(bx, by, bz, cobble)) cells.push([bx, by, bz]);
      else if (this.world.getBlock(bx, by, bz) === cobble) cells.push([bx, by, bz]);
    }
    return cells;
  }

  // ---- progress -------------------------------------------------------------

  private onLifeEvent(kind: 'ate' | 'sheltered', c: Critter, other?: Critter) {
    for (const q of this.active) {
      if (q.subjectId !== c.id) continue;
      if (q.kind === 'feed' && kind === 'ate' && other && other.sp.id === q.foodId) this.complete(q);
      if (q.kind === 'shelter' && kind === 'sheltered') this.complete(q);
    }
  }

  update(dt: number) {
    this.t += dt; this.checkT += dt;
    // Markers bob and follow their subjects.
    for (const q of this.active) {
      const subject = q.subjectId ? this.life.critters.find(c => c.id === q.subjectId) : null;
      if (subject) q.pos.copy(subject.pos);
      const m = this.markers.get(q.id);
      if (m) { m.position.set(q.pos.x, q.pos.y + 2.2 + Math.sin(this.t * 2) * 0.15, q.pos.z); }
    }
    if (this.checkT < 0.5) return;
    this.checkT = 0;
    for (const q of this.active) {
      const subject = q.subjectId ? this.life.critters.find(c => c.id === q.subjectId) : null;
      if (q.subjectId && !subject) { q.progress = 'The animal wandered out of sight — go back toward the marker.'; continue; }
      if (q.kind === 'free' && q.cage && subject) {
        const remaining = q.cage.filter(([x, y, z]) => this.world.getBlock(x, y, z) === blockId('cobble')).length;
        const opened = q.cage.length - remaining;
        q.progress = opened ? `${opened} stone${opened > 1 ? 's' : ''} moved` : 'Trapped under stone';
        // Free when a side (not the roof) is open at the animal's level.
        const sx = Math.floor(subject.pos.x), sy = Math.floor(subject.pos.y), sz = Math.floor(subject.pos.z);
        const sideOpen = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !isSolid(this.world.getBlock(sx + dx, sy, sz + dz)) && !isSolid(this.world.getBlock(sx + dx, sy + 1, sz + dz)));
        if (sideOpen) { subject.stuck = false; subject.friendly = true; this.complete(q); }
      } else if (q.kind === 'habitat' && q.need) {
        const n = this.countNeed(q);
        q.progress = `${Math.min(n, q.need.count)} / ${q.need.count}`;
        if (n >= q.need.count) this.complete(q);
      } else if (q.kind === 'feed' && subject) {
        const food = q.foodId ? this.life.critters.filter(c => c.sp.id === q.foodId && c.pos.distanceTo(subject.pos) < 10) : [];
        const ripe = food.filter(f => f.growth >= 0.8).length;
        q.progress = food.length === 0 ? `No ${SPECIES_BY_ID[q.foodId!].common} nearby yet` : ripe ? `${ripe} ripe — waiting for it to eat` : `${food.length} growing…`;
      } else if (q.kind === 'shelter' && subject) {
        q.progress = subject.body.group.userData.shelterTarget ? 'It has spotted a shelter…' : 'No shelter nearby yet';
      }
      this.onProgress?.(q);
    }
  }

  private countNeed(q: Quest): number {
    const need = q.need!;
    if (need.species) return this.life.critters.filter(c => c.sp.id === need.species && c.pos.distanceTo(q.pos) <= need.radius).length;
    const id = BLOCK_BY_NAME[need.block as BlockName].id; let n = 0;
    const r = need.radius, cx = Math.floor(q.pos.x), cy = Math.floor(q.pos.y), cz = Math.floor(q.pos.z);
    for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) for (let y = cy - 4; y <= cy + 6; y++) if (this.world.getBlock(x, y, z) === id) n++;
    return n;
  }

  private complete(q: Quest) {
    if (q.done) return;
    q.done = true; q.progress = 'Complete';
    const before = this.rank.name;
    this.points += q.points;
    this.completed.push(q.id);
    this.befriended.add(q.speciesId);
    const subject = q.subjectId ? this.life.critters.find(c => c.id === q.subjectId) : null;
    if (subject) subject.friendly = true;
    if (q.kind === 'habitat') {
      // They move in.
      const sp = SPECIES_BY_ID[q.speciesId];
      for (let i = 0; i < 2; i++) { const c = this.spawnNear(sp, { x: Math.floor(q.pos.x) + (i ? 3 : -3), y: Math.floor(q.pos.y), z: Math.floor(q.pos.z) + (i ? -2 : 2) }); if (c) c.friendly = true; }
    }
    const m = this.markers.get(q.id); if (m) { this.group.remove(m); this.markers.delete(q.id); }
    this.persist();
    this.onComplete?.(q);
    if (this.rank.name !== before) this.onRank?.(this.rank.name);
  }

  private marker(q: Quest) {
    const s = new THREE.Sprite(markerMaterial(q.kind));
    s.scale.set(0.9, 0.9, 0.9);
    s.position.copy(q.pos).add(new THREE.Vector3(0, 2.2, 0));
    this.group.add(s); this.markers.set(q.id, s);
  }

  private persist() {
    try { localStorage.setItem(this.key, JSON.stringify({ points: this.points, completed: this.completed, befriended: [...this.befriended] })); } catch { /* quota */ }
  }
}

const markerCache = new Map<string, THREE.SpriteMaterial>();
function markerMaterial(kind: QuestKind) {
  let m = markerCache.get(kind);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  const col = { feed: '#8ff0b0', shelter: '#ffd86b', free: '#ff9a9a', habitat: '#7fe7ff' }[kind];
  ctx.beginPath(); ctx.moveTo(64, 8); ctx.lineTo(116, 30); ctx.lineTo(104, 92); ctx.lineTo(64, 122); ctx.lineTo(24, 92); ctx.lineTo(12, 30); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,16,32,0.8)'; ctx.stroke();
  // paw
  ctx.fillStyle = '#1a1428';
  ctx.beginPath(); ctx.ellipse(64, 76, 18, 15, 0, 0, Math.PI * 2); ctx.fill();
  for (const [x, y] of [[44, 50], [58, 40], [72, 40], [86, 50]]) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  markerCache.set(kind, m);
  return m;
}
