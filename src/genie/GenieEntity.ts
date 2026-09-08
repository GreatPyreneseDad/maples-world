import * as THREE from 'three';

const RAINBOW = [0xff3b3b, 0xff8c2a, 0xffe23a, 0x3ad46a, 0x3a8cff, 0x9b4bff, 0xff6ad5];

/**
 * The rainbow-horned unicorn. Built from primitives so there are zero assets to load.
 * Floats, bobs, faces the player, and glows while "thinking".
 */
export class GenieEntity {
  readonly group = new THREE.Group();
  visible = false;
  thinking = false;
  private t = 0;
  private hornMat: THREE.MeshStandardMaterial;
  private sparkles: THREE.Points;
  private sparkleVel: Float32Array;
  private auraLight: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    const white = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.7 });
    const mane = new THREE.MeshStandardMaterial({ color: 0xf07ac0, roughness: 0.6, emissive: 0x501030, emissiveIntensity: 0.4 });
    const hoof = new THREE.MeshStandardMaterial({ color: 0xd8b060, metalness: 0.4, roughness: 0.4 });
    const eye = new THREE.MeshStandardMaterial({ color: 0x1a1030 });

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };

    // Body & neck & head (unit scale ≈ 1.2 blocks long)
    box(0.55, 0.5, 1.0, white, 0, 0.9, 0);
    box(0.32, 0.55, 0.32, white, 0, 1.3, 0.42);
    box(0.36, 0.34, 0.5, white, 0, 1.62, 0.6);
    box(0.2, 0.16, 0.18, white, 0, 1.52, 0.9);               // muzzle
    box(0.06, 0.06, 0.02, eye, 0.19, 1.68, 0.78); box(0.06, 0.06, 0.02, eye, -0.19, 1.68, 0.78);
    // Legs
    for (const [x, z] of [[0.18, 0.35], [-0.18, 0.35], [0.18, -0.35], [-0.18, -0.35]]) {
      box(0.16, 0.55, 0.16, white, x, 0.4, z);
      box(0.17, 0.1, 0.17, hoof, x, 0.1, z);
    }
    // Mane & tail
    for (let i = 0; i < 5; i++) box(0.12, 0.18, 0.14, mane, 0, 1.55 + i * 0.02, 0.45 - i * 0.14);
    for (let i = 0; i < 4; i++) box(0.14, 0.14, 0.14, mane, 0, 0.95 - i * 0.12, -0.55 - i * 0.1);

    // Rainbow horn: cone with vertex colors banded along its height.
    const cone = new THREE.ConeGeometry(0.07, 0.55, 8, 7, false);
    const pos = cone.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); // -0.275..0.275
      const band = Math.min(RAINBOW.length - 1, Math.floor(((y + 0.275) / 0.55) * RAINBOW.length));
      c.setHex(RAINBOW[band]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.hornMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3 });
    const horn = new THREE.Mesh(cone, this.hornMat);
    horn.position.set(0, 2.05, 0.6);
    horn.rotation.x = -0.25;
    this.group.add(horn);

    // Sparkles
    const N = 60;
    const sp = new Float32Array(N * 3);
    const sc = new Float32Array(N * 3);
    this.sparkleVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 1.6; sp[i * 3 + 1] = Math.random() * 2.4; sp[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      c.setHex(RAINBOW[i % RAINBOW.length]); sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
      this.sparkleVel[i] = 0.3 + Math.random() * 0.6;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.sparkles = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true }));
    this.group.add(this.sparkles);

    this.auraLight = new THREE.PointLight(0xffe0ff, 6, 12, 1.6);
    this.auraLight.position.set(0, 1.5, 0);
    this.group.add(this.auraLight);

    this.group.visible = false;
    scene.add(this.group);
  }

  /** Appear in front of the player at ground level (+ hover). */
  summon(playerPos: THREE.Vector3, facing: THREE.Vector3, groundY: number) {
    const flat = new THREE.Vector3(facing.x, 0, facing.z).normalize().multiplyScalar(3);
    this.baseY = groundY + 1.2;
    this.group.position.set(playerPos.x + flat.x, this.baseY, playerPos.z + flat.z);
    this.visible = this.group.visible = true;
    this.t = 0;
  }

  dismiss() { this.visible = this.group.visible = false; }

  update(dt: number, playerPos: THREE.Vector3) {
    if (!this.visible) return;
    this.t += dt;
    const bob = Math.sin(this.t * 2.2) * 0.12;
    this.group.position.y = this.baseY + bob;

    // Face the player.
    const dx = playerPos.x - this.group.position.x, dz = playerPos.z - this.group.position.z;
    this.group.rotation.y = Math.atan2(dx, dz);

    // Horn pulse — faster while thinking.
    const pulse = 0.25 + (this.thinking ? 0.9 : 0.35) * (0.5 + 0.5 * Math.sin(this.t * (this.thinking ? 9 : 3)));
    this.hornMat.emissiveIntensity = pulse;
    this.auraLight.intensity = 4 + pulse * 6;

    // Sparkles drift upward and respawn.
    const p = this.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.sparkleVel[i] * dt * (this.thinking ? 2.5 : 1);
      if (y > 2.6) { y = 0; p.setX(i, (Math.random() - 0.5) * 1.6); p.setZ(i, (Math.random() - 0.5) * 1.6); }
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  private baseY = 0;
}
