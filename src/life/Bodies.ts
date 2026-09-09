import * as THREE from 'three';
import type { Species, BodyPlan } from '../../shared/taxonomy';

/**
 * Procedural bodies. Each body plan is a small rig of primitives at roughly unit size
 * (1 unit ≈ the organism's body length), scaled by the caller. Named parts are returned
 * so behaviors can animate them (legs swing, wings flap, cilia shimmer).
 */
export interface Body {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D[]>;
  /** Radius of a bounding sphere at unit scale, for aim-picking. */
  radius: number;
}

const matCache = new Map<string, THREE.Material>();
function mat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number; flat?: boolean } = {}) {
  const key = `${color}:${opts.emissive ?? 0}:${opts.opacity ?? 1}:${opts.flat ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.75, metalness: 0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissive ? 0.5 : 0,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1, flatShading: !!opts.flat,
      side: opts.transparent ? THREE.DoubleSide : THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  disc: new THREE.CylinderGeometry(0.5, 0.5, 0.08, 14),
  plane: new THREE.PlaneGeometry(1, 1),
};

type B = { group: THREE.Group; add: (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, rx?: number, ry?: number, rz?: number) => THREE.Mesh; part: (name: string, o: THREE.Object3D) => void };

function rig(fn: (b: B) => number): Body {
  const group = new THREE.Group();
  const parts: Record<string, THREE.Object3D[]> = {};
  const b: B = {
    group,
    add: (g, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
      group.add(mesh); return mesh;
    },
    part: (name, o) => { (parts[name] ??= []).push(o); },
  };
  const radius = fn(b);
  return { group, parts, radius };
}

/** Legs as a pivoted group so they can swing from the hip. */
function leg(b: B, m: THREE.Material, x: number, y: number, z: number, len: number, thick: number, name = 'leg') {
  const pivot = new THREE.Group(); pivot.position.set(x, y, z);
  const shin = new THREE.Mesh(G.box, m); shin.scale.set(thick, len, thick); shin.position.y = -len / 2;
  pivot.add(shin); b.part(name, pivot); b.group.add(pivot);
  return pivot;
}

export function buildBody(sp: Species): Body {
  const [c1, c2] = sp.colors;
  const A = mat(c1), Bm = mat(c2);
  switch (sp.body as BodyPlan) {
    case 'quadruped': return rig(b => {
      b.add(G.box, A, 0, 0.55, 0, 0.36, 0.34, 1.0);
      b.add(G.box, A, 0, 0.78, 0.55, 0.22, 0.28, 0.32);           // head
      b.add(G.box, Bm, 0, 0.72, 0.75, 0.14, 0.12, 0.16);          // muzzle
      b.add(G.cone, A, 0.08, 0.98, 0.5, 0.08, 0.16, 0.08); b.add(G.cone, A, -0.08, 0.98, 0.5, 0.08, 0.16, 0.08);
      const tail = b.add(G.box, A, 0, 0.6, -0.6, 0.12, 0.12, 0.35, 0.5); tail.add(new THREE.Mesh(G.box, Bm)).position.set(0, 0, -0.5); b.part('tail', tail);
      for (const [x, z] of [[0.13, 0.35], [-0.13, 0.35], [0.13, -0.35], [-0.13, -0.35]]) { const l = leg(b, A, x, 0.4, z, 0.4, 0.09); l.userData.phase = (x > 0) === (z > 0) ? 0 : Math.PI; }
      return 0.7;
    });
    case 'rabbit': return rig(b => {
      b.add(G.sphere, A, 0, 0.35, 0, 0.5, 0.45, 0.7);
      b.add(G.sphere, A, 0, 0.55, 0.38, 0.32, 0.3, 0.32);
      b.add(G.box, A, 0.07, 0.85, 0.35, 0.07, 0.35, 0.05); b.add(G.box, A, -0.07, 0.85, 0.35, 0.07, 0.35, 0.05);
      b.add(G.sphere, Bm, 0, 0.35, -0.38, 0.14, 0.14, 0.14);
      for (const [x, z] of [[0.15, 0.2], [-0.15, 0.2], [0.17, -0.2], [-0.17, -0.2]]) leg(b, A, x, 0.25, z, 0.25, 0.09);
      return 0.55;
    });
    case 'bird': return rig(b => {
      b.add(G.sphere, A, 0, 0.5, 0, 0.36, 0.34, 0.7);
      b.add(G.sphere, A, 0, 0.62, 0.38, 0.22, 0.22, 0.24);
      b.add(G.cone, Bm, 0, 0.6, 0.55, 0.08, 0.2, 0.08, Math.PI / 2);
      b.add(G.box, A, 0, 0.5, -0.45, 0.16, 0.05, 0.3);
      for (const side of [1, -1]) { const w = new THREE.Group(); w.position.set(side * 0.15, 0.55, 0); const m = new THREE.Mesh(G.box, A); m.scale.set(0.6, 0.04, 0.35); m.position.x = side * 0.3; w.add(m); b.part('wing', w); w.userData.side = side; b.group.add(w); }
      return 0.6;
    });
    case 'duck': return rig(b => {
      b.add(G.sphere, Bm, 0, 0.3, 0, 0.5, 0.36, 0.8);
      b.add(G.sphere, A, 0, 0.6, 0.35, 0.24, 0.24, 0.26);
      b.add(G.box, mat(0xf2b200), 0, 0.56, 0.55, 0.1, 0.06, 0.2);
      b.add(G.box, Bm, 0, 0.45, -0.45, 0.2, 0.08, 0.25, -0.4);
      return 0.55;
    });
    case 'fish': return rig(b => {
      b.add(G.sphere, A, 0, 0, 0, 0.28, 0.4, 1.0);
      const tail = b.add(G.cone, Bm, 0, 0, -0.62, 0.06, 0.4, 0.3, Math.PI / 2); b.part('tail', tail);
      b.add(G.cone, Bm, 0, 0.28, 0, 0.05, 0.25, 0.3);
      b.add(G.sphere, mat(0x101010), 0.1, 0.06, 0.35, 0.06, 0.06, 0.06); b.add(G.sphere, mat(0x101010), -0.1, 0.06, 0.35, 0.06, 0.06, 0.06);
      return 0.55;
    });
    case 'frog': return rig(b => {
      b.add(G.sphere, A, 0, 0.3, 0, 0.7, 0.45, 0.8);
      b.add(G.sphere, A, 0, 0.5, 0.3, 0.5, 0.35, 0.4);
      b.add(G.sphere, Bm, 0.18, 0.66, 0.35, 0.16, 0.16, 0.16); b.add(G.sphere, Bm, -0.18, 0.66, 0.35, 0.16, 0.16, 0.16);
      b.add(G.box, A, 0.4, 0.15, -0.2, 0.2, 0.15, 0.5, 0, 0.5); b.add(G.box, A, -0.4, 0.15, -0.2, 0.2, 0.15, 0.5, 0, -0.5);
      return 0.55;
    });
    case 'lizard': return rig(b => {
      b.add(G.box, A, 0, 0.12, 0, 0.3, 0.18, 0.9);
      b.add(G.box, Bm, 0, 0.12, 0.55, 0.22, 0.14, 0.3);
      const tail = b.add(G.cone, A, 0, 0.1, -0.85, 0.15, 0.8, 0.15, -Math.PI / 2); b.part('tail', tail);
      for (const [x, z] of [[0.2, 0.3], [-0.2, 0.3], [0.2, -0.3], [-0.2, -0.3]]) leg(b, A, x, 0.12, z, 0.14, 0.06);
      return 0.7;
    });
    case 'insect': return rig(b => {   // bee
      b.add(G.sphere, A, 0, 0.5, 0, 0.5, 0.45, 0.8);
      b.add(G.box, Bm, 0, 0.5, 0, 0.52, 0.47, 0.12); b.add(G.box, Bm, 0, 0.5, -0.25, 0.5, 0.45, 0.1);
      b.add(G.sphere, Bm, 0, 0.55, 0.45, 0.3, 0.3, 0.3);
      for (const side of [1, -1]) { const w = b.add(G.plane, mat(0xffffff, { transparent: true, opacity: 0.45 }), side * 0.35, 0.8, 0, 0.6, 0.3, 1, -Math.PI / 2); b.part('wing', w); w.userData.side = side; }
      return 0.6;
    });
    case 'beetle': return rig(b => {
      b.add(G.sphere, A, 0, 0.3, 0, 0.8, 0.5, 0.9);
      b.add(G.sphere, Bm, 0, 0.32, 0.42, 0.4, 0.3, 0.3);
      for (let i = 0; i < 7; i++) b.add(G.disc, Bm, ((i % 2) ? 0.22 : -0.22) * (i < 6 ? 1 : 0), 0.5 + (i < 6 ? 0.02 : 0.05), -0.25 + (i >> 1) * 0.2, 0.18, 0.5, 0.18);
      return 0.55;
    });
    case 'ant': return rig(b => {
      b.add(G.sphere, A, 0, 0.25, 0.4, 0.35, 0.35, 0.35); b.add(G.sphere, Bm, 0, 0.25, 0, 0.3, 0.3, 0.4); b.add(G.sphere, A, 0, 0.25, -0.45, 0.4, 0.4, 0.5);
      for (const [x, z] of [[0.25, 0.15], [-0.25, 0.15], [0.28, 0], [-0.28, 0], [0.25, -0.15], [-0.25, -0.15]]) leg(b, Bm, x, 0.25, z, 0.25, 0.04);
      return 0.6;
    });
    case 'spider': return rig(b => {
      b.add(G.sphere, A, 0, 0.3, -0.1, 0.6, 0.5, 0.7); b.add(G.sphere, Bm, 0, 0.3, 0.35, 0.3, 0.28, 0.3);
      for (let i = 0; i < 4; i++) for (const side of [1, -1]) { const l = leg(b, A, side * 0.3, 0.35, 0.25 - i * 0.17, 0.4, 0.04); l.rotation.z = side * 0.9; l.rotation.x = (i - 1.5) * 0.35; }
      return 0.6;
    });
    case 'snail': return rig(b => {
      b.add(G.box, A, 0, 0.12, 0.1, 0.35, 0.22, 1.0);
      b.add(G.sphere, Bm, 0, 0.5, -0.15, 0.7, 0.7, 0.6); b.add(G.sphere, mat(c2 - 0x202020), 0, 0.5, -0.15, 0.4, 0.4, 0.35);
      b.add(G.box, A, 0.08, 0.35, 0.6, 0.04, 0.3, 0.04); b.add(G.box, A, -0.08, 0.35, 0.6, 0.04, 0.3, 0.04);
      return 0.6;
    });
    case 'worm': case 'nematode': return rig(b => {
      for (let i = 0; i < 7; i++) { const seg = b.add(G.sphere, i === 2 ? Bm : A, 0, 0.1, (i - 3) * 0.16, 0.18, 0.18, 0.2); b.part('seg', seg); seg.userData.i = i; }
      return 0.6;
    });
    case 'moss': return rig(b => {
      for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.1 + (i % 4) * 0.1; b.add(G.cone, i % 3 ? A : Bm, Math.cos(a) * r, 0.25, Math.sin(a) * r, 0.12, 0.5, 0.12); }
      return 0.5;
    });
    case 'fern': return rig(b => {
      for (let i = 0; i < 7; i++) { const f = new THREE.Group(); f.rotation.y = i * 0.9; f.rotation.x = -0.5; const m = new THREE.Mesh(G.box, i % 2 ? A : Bm); m.scale.set(0.16, 0.03, 0.9); m.position.set(0, 0.35, 0.45); f.add(m); b.part('frond', f); b.group.add(f); }
      return 0.7;
    });
    case 'flower': return rig(b => {
      b.add(G.cyl, mat(0x4caf50), 0, 0.4, 0, 0.06, 0.8, 0.06);
      b.add(G.box, mat(0x4caf50), 0.1, 0.2, 0, 0.3, 0.02, 0.12, 0, 0, 0.3);
      const head = b.add(G.disc, A, 0, 0.82, 0, 0.5, 1, 0.5); b.part('head', head);
      head.add(new THREE.Mesh(G.disc, Bm)).scale.set(0.4, 1.4, 0.4);
      return 0.55;
    });
    case 'clover': return rig(b => {
      for (let i = 0; i < 3; i++) { const a = i * 2.09; b.add(G.sphere, A, Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22, 0.32, 0.08, 0.32); }
      b.add(G.sphere, Bm, 0.3, 0.45, 0.2, 0.22, 0.22, 0.22);
      return 0.45;
    });
    case 'sapling': return rig(b => {
      b.add(G.cyl, Bm, 0, 0.3, 0, 0.1, 0.6, 0.1);
      b.add(G.cone, A, 0, 0.75, 0, 0.7, 0.6, 0.7); b.add(G.cone, A, 0, 1.05, 0, 0.5, 0.5, 0.5); b.add(G.cone, A, 0, 1.3, 0, 0.3, 0.4, 0.3);
      return 0.8;
    });
    case 'bush': return rig(b => {
      for (let i = 0; i < 5; i++) { const a = i * 1.26; b.add(G.sphere, A, Math.cos(a) * 0.25, 0.4 + (i % 2) * 0.15, Math.sin(a) * 0.25, 0.55, 0.5, 0.55); }
      b.add(G.sphere, A, 0, 0.6, 0, 0.6, 0.55, 0.6);
      for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 0.3 + (i % 3) * 0.08; const berry = b.add(G.sphere, Bm, Math.cos(a) * r, 0.45 + ((i * 7) % 5) * 0.08, Math.sin(a) * r, 0.1, 0.1, 0.1); b.part('fruit', berry); }
      b.add(G.cyl, mat(0x6e4c2a), 0, 0.15, 0, 0.08, 0.3, 0.08);
      return 0.6;
    });
    case 'duckweed': return rig(b => {
      for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.2 + (i % 3) * 0.12; b.add(G.disc, i % 2 ? A : Bm, Math.cos(a) * r, 0.02, Math.sin(a) * r, 0.28, 0.4, 0.28); }
      return 0.5;
    });
    case 'sheep': return rig(b => {
      b.add(G.sphere, A, 0, 0.6, 0, 0.7, 0.6, 1.0);
      b.add(G.sphere, A, 0, 0.75, 0.15, 0.55, 0.5, 0.6);
      b.add(G.box, Bm, 0, 0.72, 0.6, 0.24, 0.3, 0.32);
      b.add(G.box, Bm, 0.14, 0.9, 0.5, 0.06, 0.12, 0.1); b.add(G.box, Bm, -0.14, 0.9, 0.5, 0.06, 0.12, 0.1);
      for (const [x, z] of [[0.18, 0.3], [-0.18, 0.3], [0.18, -0.3], [-0.18, -0.3]]) leg(b, Bm, x, 0.35, z, 0.35, 0.09);
      return 0.7;
    });
    case 'chicken': return rig(b => {
      b.add(G.sphere, A, 0, 0.45, 0, 0.5, 0.45, 0.65);
      b.add(G.sphere, A, 0, 0.72, 0.3, 0.26, 0.26, 0.26);
      b.add(G.box, Bm, 0, 0.88, 0.3, 0.06, 0.12, 0.16);                      // comb
      b.add(G.cone, mat(0xf2b200), 0, 0.7, 0.48, 0.08, 0.16, 0.08, Math.PI / 2); // beak
      b.add(G.box, Bm, 0, 0.62, 0.42, 0.05, 0.1, 0.05);                       // wattle
      b.add(G.box, A, 0, 0.55, -0.4, 0.1, 0.2, 0.2, 0.5);
      for (const x of [0.1, -0.1]) leg(b, mat(0xf2b200), x, 0.25, 0, 0.25, 0.04);
      return 0.55;
    });
    case 'mushroom': return rig(b => {
      b.add(G.cyl, Bm, 0, 0.3, 0, 0.22, 0.6, 0.22);
      const cap = b.add(G.sphere, A, 0, 0.62, 0, 0.9, 0.5, 0.9); b.part('cap', cap);
      if (sp.id === 'fly-agaric') for (let i = 0; i < 6; i++) { const a = i * 1.05; b.add(G.sphere, Bm, Math.cos(a) * 0.28, 0.8, Math.sin(a) * 0.28, 0.1, 0.06, 0.1); }
      return 0.55;
    });
    case 'bracket': return rig(b => { b.add(G.sphere, A, 0, 0.2, 0.3, 0.9, 0.5, 0.7); b.add(G.disc, Bm, 0, 0.0, 0.3, 0.8, 1, 0.6); return 0.5; });
    case 'candlesnuff': return rig(b => { for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.25; b.add(G.cyl, A, x, 0.3, 0, 0.08, 0.6, 0.08, 0, 0, (i - 1) * 0.3); b.add(G.cyl, Bm, x - (i - 1) * 0.15, 0.62, 0, 0.07, 0.25, 0.07); } return 0.45; });
    case 'yeast': return rig(b => { b.add(G.sphere, A, 0, 0, 0, 1, 0.9, 1); b.add(G.sphere, Bm, 0.45, 0.35, 0, 0.5, 0.5, 0.5); return 0.6; });
    case 'mold': case 'branching': return rig(b => {
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, r = 0.5; b.add(G.cyl, A, Math.cos(a) * r * 0.5, 0.05, Math.sin(a) * r * 0.5, 0.04, r, 0.04, Math.PI / 2, 0, 0).rotation.set(Math.PI / 2, 0, -a + Math.PI / 2); }
      for (let i = 0; i < 5; i++) { const a = i * 1.26; b.add(G.sphere, Bm, Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5, 0.14, 0.14, 0.14); }
      return 0.6;
    });
    case 'rotifer': return rig(b => {
      b.add(G.cyl, mat(c1, { transparent: true, opacity: 0.8 }), 0, 0, 0, 0.35, 1, 0.35, Math.PI / 2);
      const crown = b.add(G.disc, Bm, 0, 0, 0.5, 0.5, 1, 0.5, Math.PI / 2); b.part('cilia', crown);
      b.add(G.cone, Bm, 0, 0, -0.6, 0.15, 0.3, 0.15, -Math.PI / 2);
      return 0.6;
    });
    case 'tardigrade': return rig(b => {
      b.add(G.sphere, A, 0, 0.3, 0, 0.55, 0.5, 1.0); b.add(G.sphere, A, 0, 0.32, 0.5, 0.35, 0.3, 0.3);
      for (let i = 0; i < 4; i++) for (const side of [1, -1]) leg(b, Bm, side * 0.28, 0.2, 0.35 - i * 0.25, 0.2, 0.1);
      return 0.6;
    });
    case 'daphnia': return rig(b => {
      b.add(G.sphere, mat(c1, { transparent: true, opacity: 0.7 }), 0, 0.3, 0, 0.6, 0.8, 0.9);
      b.add(G.sphere, mat(0x101010), 0, 0.55, 0.35, 0.14, 0.14, 0.14);
      const heart = b.add(G.sphere, mat(0xd04040), 0, 0.5, -0.1, 0.12, 0.12, 0.12); b.part('heart', heart);
      for (const side of [1, -1]) { const ant = b.add(G.box, Bm, side * 0.3, 0.5, 0.2, 0.06, 0.06, 0.6, 0, side * 0.6); b.part('wing', ant); ant.userData.side = side; }
      return 0.6;
    });
    case 'amoeba': return rig(b => {
      const body = b.add(G.sphere, mat(c1, { transparent: true, opacity: 0.55 }), 0, 0, 0, 1, 0.6, 1); b.part('blob', body);
      for (let i = 0; i < 4; i++) { const a = i * 1.7; const p = b.add(G.sphere, mat(c1, { transparent: true, opacity: 0.5 }), Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0.5, 0.4, 0.7); b.part('pseudopod', p); p.userData.a = a; }
      b.add(G.sphere, Bm, 0.1, 0.05, 0, 0.3, 0.25, 0.3);
      return 0.7;
    });
    case 'ciliate': return rig(b => {
      b.add(G.sphere, mat(c1, { transparent: true, opacity: 0.7 }), 0, 0, 0, 0.45, 0.4, 1.0);
      b.add(G.sphere, Bm, 0, 0, -0.2, 0.25, 0.22, 0.3);
      for (let i = 0; i < 16; i++) { const a = i * 0.39; const c = b.add(G.box, mat(0xffffff, { transparent: true, opacity: 0.5 }), Math.cos(a) * 0.24, Math.sin(a) * 0.21, (i % 4 - 1.5) * 0.25, 0.03, 0.03, 0.12); b.part('cilia', c); }
      return 0.55;
    });
    case 'euglena': return rig(b => {
      b.add(G.sphere, A, 0, 0, 0, 0.3, 0.3, 1.0);
      b.add(G.sphere, Bm, 0.08, 0.1, 0.35, 0.1, 0.1, 0.1);
      const fl = b.add(G.cyl, mat(0xffffff, { transparent: true, opacity: 0.6 }), 0, 0, 0.9, 0.02, 0.8, 0.02, Math.PI / 2); b.part('flagellum', fl);
      return 0.55;
    });
    case 'volvox': return rig(b => {
      b.add(G.sphere, mat(c2, { transparent: true, opacity: 0.35 }), 0, 0, 0, 1, 1, 1);
      for (let i = 0; i < 40; i++) { const t = Math.acos(1 - 2 * (i + 0.5) / 40), p = i * 2.39996; b.add(G.sphere, A, 0.5 * Math.sin(t) * Math.cos(p), 0.5 * Math.cos(t), 0.5 * Math.sin(t) * Math.sin(p), 0.07, 0.07, 0.07); }
      b.add(G.sphere, A, 0.2, -0.1, 0.1, 0.3, 0.3, 0.3); b.add(G.sphere, A, -0.2, 0.15, -0.1, 0.22, 0.22, 0.22);
      return 0.55;
    });
    case 'diatom': return rig(b => { b.add(G.box, mat(c1, { transparent: true, opacity: 0.75 }), 0, 0, 0, 0.25, 0.15, 1.0); for (let i = 0; i < 9; i++) b.add(G.box, Bm, 0, 0.08, (i - 4) * 0.1, 0.26, 0.01, 0.02); return 0.55; });
    case 'stentor': return rig(b => { b.add(G.cone, mat(c1, { transparent: true, opacity: 0.75 }), 0, 0.5, 0, 0.9, 1.0, 0.9, Math.PI); const crown = b.add(G.disc, Bm, 0, 1.0, 0, 1.0, 1, 1.0); b.part('cilia', crown); return 0.7; });
    case 'rod': return rig(b => { b.add(G.cyl, A, 0, 0, 0, 0.4, 0.7, 0.4, Math.PI / 2); b.add(G.sphere, A, 0, 0, 0.35, 0.4, 0.4, 0.4); b.add(G.sphere, A, 0, 0, -0.35, 0.4, 0.4, 0.4); for (let i = 0; i < 3; i++) { const f = b.add(G.cyl, mat(0xffffff, { transparent: true, opacity: 0.4 }), (i - 1) * 0.1, 0, -0.9, 0.015, 0.8, 0.015, Math.PI / 2); b.part('flagellum', f); } return 0.6; });
    case 'coccus': return rig(b => { for (const [x, y, z] of [[0, 0, 0], [0.45, 0, 0], [0, 0.45, 0], [0.45, 0.45, 0]]) b.add(G.sphere, (x + y) > 0.5 ? Bm : A, x - 0.22, y - 0.22, z, 0.5, 0.5, 0.5); return 0.55; });
    case 'chain': return rig(b => { for (let i = 0; i < 6; i++) b.add(i === 3 ? G.sphere : G.cyl, i === 3 ? Bm : A, 0, 0, (i - 2.5) * 0.3, 0.22, 0.28, 0.22, Math.PI / 2); return 0.9; });
  }
}
