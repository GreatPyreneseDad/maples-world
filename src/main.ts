import * as THREE from 'three';
import { World } from './engine/World';
import { ChunkRenderer } from './engine/ChunkRenderer';
import { BLOCKS, AIR, blockId } from './engine/Blocks';
import { Input } from './player/Input';
import { Player } from './player/Player';
import { Hotbar, LAMP_ITEM, GOGGLES_ITEM, MICROSCOPE_ITEM, SHRINK_ITEM, FLASK_ITEM, SEEDS_ITEM } from './ui/Hotbar';
import { Guild } from './guild/Guild';
import { GuildPanel } from './ui/GuildPanel';
import { SeedPouch } from './ui/SeedPouch';
import { ElementDrops } from './chem/ElementDrops';
import { ElementInventory } from './chem/Inventory';
import { LabPanel } from './ui/LabPanel';
import { drawAtoms, ELEMENT_BY_SYMBOL, RECIPES, type Recipe } from '../shared/chemistry';
import { LifeSystem } from './life/LifeSystem';
import { MicroWorld, type Substrate } from './life/MicroWorld';
import { FieldGuide } from './ui/FieldGuide';
import { findSpecies, SPECIES, SPECIES_BY_ID } from '../shared/taxonomy';
import { ChatPanel } from './ui/ChatPanel';
import { WorldEdit } from './genie/WorldEdit';
import { GenieEntity } from './genie/GenieEntity';
import { GenieAgent, SupabaseGenieBackend, type GenieBackend } from './genie/GenieAgent';
import { OfflineGenie } from './genie/OfflineGenie';
import { LocalStore, CloudStore, WorldSync, type WorldMeta } from './persist/WorldStore';
import { supabase, ensureSession, accessToken, SUPABASE_URL, SUPABASE_KEY } from './persist/supabase';

const VIEW_RADIUS = 6;          // chunks (≈ 96 blocks)
const UNLOAD_RADIUS = VIEW_RADIUS + 3;

class Game {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 600);
  world!: World;
  chunks!: ChunkRenderer;
  input: Input;
  player!: Player;
  hotbar: Hotbar;
  chat = new ChatPanel();
  edit!: WorldEdit;
  genie!: GenieEntity;
  agent!: GenieAgent;
  sync!: WorldSync;
  meta!: WorldMeta;
  life!: LifeSystem;
  micro!: MicroWorld;
  guide!: FieldGuide;
  drops!: ElementDrops;
  atoms!: ElementInventory;
  lab!: LabPanel;
  guild!: Guild;
  genieNotes: string[] = [];
  guildPanel!: GuildPanel;
  seeds!: SeedPouch;
  microHud = document.getElementById('micro-hud')!;
  highlight: THREE.LineSegments;
  hud = document.getElementById('hud')!;
  overlay = document.getElementById('overlay')!;
  overlayStatus = document.getElementById('overlay-status')!;
  toastEl = document.getElementById('toast')!;
  sun: THREE.DirectionalLight;
  timer = new THREE.Timer();
  frames = 0; fps = 0; fpsT = 0; tickCount = 0;

  constructor() {
    const app = document.getElementById('app')!;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    app.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x8fc6ff);
    this.scene.fog = new THREE.Fog(0x8fc6ff, 60, VIEW_RADIUS * 16 - 8);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b5a3a, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
    this.sun.position.set(0.6, 1, 0.3);
    this.scene.add(this.sun);

    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
    this.scene.add(this.highlight);

    this.input = new Input(this.renderer.domElement);
    this.hotbar = new Hotbar(document.getElementById('hotbar')!);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      if (this.micro) { this.micro.camera.aspect = innerWidth / innerHeight; this.micro.camera.updateProjectionMatrix(); }
    });
    this.overlay.addEventListener('click', () => this.input.requestLock());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (locked) this.overlay.hidden = true;
      else if (!this.chat.isOpen && !this.guide?.isJournalOpen && !this.lab?.isOpen && !this.guildPanel?.isOpen && !this.seeds?.isOpen) this.overlay.hidden = false;
    });
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.chat.isOpen) { e.preventDefault(); this.closeChat(); }
      if (e.code === 'KeyJ' && !this.chat.isOpen && this.guide) this.toggleJournal();
      if (e.code === 'KeyQ' && this.micro?.active) this.leaveMicro();
      if (e.code === 'KeyL' && !this.chat.isOpen && this.lab) this.toggleLab();
      if (e.code === 'KeyG' && !this.chat.isOpen && this.guildPanel) this.togglePanel(this.guildPanel);
      if (e.code === 'KeyK' && !this.chat.isOpen && this.seeds) this.togglePanel(this.seeds);
    });
  }

  async boot() {
    this.overlayStatus.textContent = 'waking the world…';
    // World identity: URL hash > localStorage > new.
    const local = new LocalStore();
    let cloud: CloudStore | null = null;
    let userId: string | null = null;
    if (supabase) {
      userId = await ensureSession();
      if (userId) cloud = new CloudStore(supabase);
    }
    this.meta = await this.resolveWorld(local, cloud);
    location.hash = `w=${this.meta.id}`;
    localStorage.setItem('maples:lastWorld', this.meta.id);

    this.world = new World(this.meta.seed);
    this.chunks = new ChunkRenderer(this.world, this.scene);
    this.player = new Player(this.camera, this.world, this.input);
    this.edit = new WorldEdit(this.world, (x, y, z) => !this.player.intersectsBlock(x, y, z));
    this.edit.life = {
      spawn: (q, count, near) => {
        const sp = findSpecies(q);
        if (!sp) throw new Error(`unknown species "${q}". Known: ${SPECIES.filter(s => s.tier === 'macro').map(s => s.binomial).join(', ')}`);
        if (sp.tier === 'micro') return `${sp.binomial} is ${sp.size} µm — too small to place in the open air. Suggest the microscope or shrink dust.`;
        const facing = this.player.facing();
        const cx = near?.x ?? Math.floor(this.player.pos.x + facing.x * 5), cz = near?.z ?? Math.floor(this.player.pos.z + facing.z * 5);
        let placed = 0;
        for (let i = 0; i < count; i++) {
          for (let tries = 0; tries < 12 && placed <= i; tries++) {   // water animals need water; land animals need land
            const r = 1 + tries * 0.8;
            const x = cx + Math.floor((Math.random() - 0.5) * 2 * r), z = cz + Math.floor((Math.random() - 0.5) * 2 * r);
            const c = this.life.spawn(sp, x, z);
            if (c) { placed++; this.guide.discover(sp); }
          }
        }
        return placed ? `spawned ${placed} × ${sp.binomial} (${sp.common})` : `could not place ${sp.binomial} here — it needs ${sp.habitats.join('/')}`;
      },
      giveElement: (symbol, count) => {
        const sym = Object.keys(ELEMENT_BY_SYMBOL).find(k => k.toLowerCase() === symbol.trim().toLowerCase()) ?? Object.values(ELEMENT_BY_SYMBOL).find(e => e.name === symbol.trim().toLowerCase())?.symbol;
        if (!sym) throw new Error(`"${symbol}" is not a chemical element symbol`);
        const p = this.player.pos, f = this.player.facing();
        this.drops.burst(Math.floor(p.x + f.x * 2), Math.floor(p.y), Math.floor(p.z + f.z * 2), Array(count).fill(sym));
        return `dropped ${count} × ${sym} (${ELEMENT_BY_SYMBOL[sym].name})`;
      },
      identify: radius => {
        const p = this.player.pos;
        const near = this.life.critters.map(c => ({ c, d: c.pos.distanceTo(p) })).filter(o => o.d <= radius).sort((a, b) => a.d - b.d).slice(0, 12);
        for (const o of near) this.guide.discover(o.c.sp);
        return near.length ? near.map(o => `${o.c.sp.binomial} (${o.c.sp.common}, ${o.c.sp.kingdom}) ${o.d.toFixed(0)}m`).join('; ') : 'nothing living within range';
      },
    };
    this.edit.onEdit = (label, n) => this.toast(`✦ ${label}: ${n} blocks`);
    this.genie = new GenieEntity(this.scene);
    this.life = new LifeSystem(this.world, this.scene);
    this.micro = new MicroWorld(this.input);
    this.guide = new FieldGuide(this.meta.id);
    this.drops = new ElementDrops(this.world, this.scene);
    this.atoms = new ElementInventory(this.meta.id);
    this.lab = new LabPanel(this.atoms);
    this.drops.onCollect = sym => { this.atoms.add(sym); const e = ELEMENT_BY_SYMBOL[sym]; this.toast(`${sym} · ${e?.name ?? sym}${this.atoms.counts[sym] === 1 && e?.fact ? ' — ' + e.fact : ''}`); };
    this.lab.onCraft = r => this.placeCrafted(r);
    this.guild = new Guild(this.world, this.life, this.meta.id, this.scene, () => this.player.pos, () => this.player.facing());
    this.guildPanel = new GuildPanel(this.guild, () => this.player.pos);
    this.seeds = new SeedPouch();
    this.guildPanel.onAsk = () => { const q = this.guild.offer(); if (!q) this.toast('You already have three quests — finish one first.'); };
    this.guild.onQuest = q => { this.toast(`✦ Guild quest: ${q.title}`); this.guildPanel.renderHud(); };
    this.guild.onProgress = () => this.guildPanel.renderHud();
    this.guild.onComplete = q => { this.toast(`✓ ${q.title} — +${q.points} · ${SPECIES_BY_ID[q.speciesId].binomial} trusts you now`); this.guildPanel.renderHud(); if (this.guildPanel.isOpen) this.guildPanel.render(); };
    this.guild.onRank = name => this.toast(`★ New rank: ${name}`);
    this.seeds.onPick = sp => this.toast(`Seed: ${sp.binomial} — ${sp.common}`);
    this.life.onEvent = ((orig) => (kind: 'ate' | 'sheltered', c: any, other?: any) => { orig?.(kind, c, other); if (kind === 'ate' && other) this.toast(`${c.sp.common} ate ${other.sp.common} — ${c.sp.binomial} likes you`); })(this.life.onEvent);
    this.guide.onDiscover = sp => this.toast(`✦ New in your journal: ${sp.binomial} — ${sp.common}`);
    this.guide.onChange = ids => { void cloud?.saveDiscoveries(this.meta.id, ids).catch(e => { this.sync.lastError = String(e.message); }); };
    if (cloud) cloud.loadDiscoveries(this.meta.id).then(ids => { this.guide.merge(ids); }).catch(() => {});

    const backend: GenieBackend = SUPABASE_URL && SUPABASE_KEY && userId
      ? new SupabaseGenieBackend(SUPABASE_URL, accessToken, SUPABASE_KEY)
      : new OfflineGenie();
    this.agent = new GenieAgent(backend, this.edit, this.meta.id);
    // The genie's memory of its own work and of the player, per world.
    try { this.edit.builds = JSON.parse(localStorage.getItem(`maples:genie-builds:${this.meta.id}`) ?? '[]'); } catch { /* fresh */ }
    this.edit.onBuildsChange = b => { try { localStorage.setItem(`maples:genie-builds:${this.meta.id}`, JSON.stringify(b)); } catch { /* quota */ } };
    try { this.genieNotes = JSON.parse(localStorage.getItem(`maples:genie-notes:${this.meta.id}`) ?? '[]'); } catch { /* fresh */ }
    this.edit.life!.remember = note => {
      if (!note.trim()) throw new Error('empty note');
      this.genieNotes.push(note.trim()); if (this.genieNotes.length > 20) this.genieNotes.shift();
      try { localStorage.setItem(`maples:genie-notes:${this.meta.id}`, JSON.stringify(this.genieNotes)); } catch { /* quota */ }
      return `remembered: ${note.trim()}`;
    };

    this.sync = new WorldSync(this.world, this.meta.id, local, cloud);
    this.overlayStatus.textContent = 'loading your builds…';
    const n = await this.sync.load();
    this.overlayStatus.textContent = `${n ? `${n} saved chunks restored` : 'fresh world'} · ${cloud ? 'cloud save on' : 'local save only'} · genie: ${backend instanceof OfflineGenie ? 'offline' : 'Claude'}`;

    this.player.spawnOnSurface(0, 0);
    this.chunks.update(0, 0, VIEW_RADIUS);
    // Mesh the spawn area before first frame so there's no pop-in.
    this.chunks.remeshBudget = 400; this.chunks.update(0, 0, VIEW_RADIUS); this.chunks.remeshBudget = 6;

    this.hotbar.onUse = id => { if (!this.chat.isOpen && !this.micro.active && !this.input.captured) this.useTool(id); };
    this.chat.onSubmit = t => this.wish(t);
    this.chat.onClose = () => {
      this.input.captured = false;
      this.genie.dismiss();
      this.agent.cancel();
      // Pointer lock can't be re-acquired from a keypress in most browsers; offer the click.
      this.overlayStatus.textContent = 'The genie bows and slips back into the lamp. Click to keep playing.';
      this.overlay.hidden = false;
    };

    // First steps: the Guild reaches out once the player has looked around.
    setTimeout(() => { if (this.guild.active.length === 0 && this.guild.completed.length === 0 && !this.micro.active) { this.guild.offer('feed'); this.toast('✦ The Animal Protector Guild has a job for you — press G'); } }, 12_000);
    this.renderer.setAnimationLoop(() => this.frame());
    (window as unknown as { game: Game }).game = this; // debugging & smoke tests
  }

  private async resolveWorld(local: LocalStore, cloud: CloudStore | null): Promise<WorldMeta> {
    const wanted = new URLSearchParams(location.hash.slice(1)).get('w') ?? localStorage.getItem('maples:lastWorld');
    const store = cloud ?? local;
    const worlds = await store.listWorlds().catch(() => [] as WorldMeta[]);
    const found = worlds.find(w => w.id === wanted) ?? (await local.listWorlds()).find(w => w.id === wanted);
    if (found) {
      // Make sure the cloud knows about a world that only existed locally.
      if (cloud && !worlds.some(w => w.id === found.id)) await cloud.createWorld(found.name, found.seed, found.id).catch(() => {});
      return found;
    }
    const seed = (Math.random() * 2 ** 31) | 0;
    const meta = await store.createWorld("Maple's World", seed);
    if (store !== local) await local.createWorld(meta.name, meta.seed, meta.id);
    return meta;
  }

  // ---- loop ----------------------------------------------------------------

  frame() {
    this.timer.update();
    const dt = this.timer.getDelta();
    if (this.micro.active) { this.microFrame(dt); return; }
    this.player.update(dt);
    this.handleClicks();
    this.hotbar.scroll(this.input.takeWheel());

    const pcx = Math.floor(this.player.pos.x) >> 4, pcz = Math.floor(this.player.pos.z) >> 4;
    this.chunks.update(pcx, pcz, VIEW_RADIUS);
    if ((++this.tickCount & 127) === 0) this.world.unloadFar(pcx, pcz, UNLOAD_RADIUS);

    this.genie.update(dt, this.player.pos);
    this.life.update(dt, this.player.pos);
    this.drops.update(dt, this.player.pos);
    this.guild.update(dt);
    if ((this.tickCount & 31) === 0) this.guildPanel.renderHud();
    this.sync.tick();

    // Field guide: what am I looking at, and what's around me?
    if (!this.chat.isOpen && !this.guide.isJournalOpen && !this.lab.isOpen && !this.guildPanel.isOpen && !this.seeds.isOpen) {
      const facing = this.player.facing();
      const aimed = this.life.pick(this.camera.position, facing, 14);
      const goggles = this.hotbar.selected === GOGGLES_ITEM;
      const nearby = goggles ? this.life.critters.filter(c => c.pos.distanceToSquared(this.player.pos) < 100).sort((a, b) => a.pos.distanceToSquared(this.player.pos) - b.pos.distanceToSquared(this.player.pos)) : [];
      this.guide.updateLabels(this.camera, aimed, nearby, goggles, dt);
    } else this.guide.hideLabels();

    const t = this.player.target;
    this.highlight.visible = !!t && !this.hotbar.holdingTool;
    if (t) this.highlight.position.set(t.block[0] + 0.5, t.block[1] + 0.5, t.block[2] + 0.5);

    this.sun.position.set(this.camera.position.x + 60, this.camera.position.y + 100, this.camera.position.z + 30);
    this.sun.target.position.copy(this.camera.position); this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.hudText(); }
  }

  private hudText() {
    const p = this.player.pos;
    const t = this.player.target;
    const held = this.hotbar.holdingTool ? this.hotbar.toolName : BLOCKS[this.hotbar.selected].name;
    const census = Object.entries(this.life.census()).map(([k, v]) => `${k} ${v}`).join(' · ');
    this.hud.textContent =
      `${this.fps} fps · ${this.chunks.meshCount} meshes · ${this.world.chunks.size} chunks\n` +
      `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}${this.player.flying ? ' · flying' : ''}\n` +
      `holding: ${held}${t ? ` · looking at ${BLOCKS[t.id].name} @ ${t.block.join(',')}` : ''}\n` +
      `save: ${this.sync.status}${this.sync.lastError ? ' (' + this.sync.lastError + ')' : ''} · undo depth ${this.edit.undoDepth}\n` +
      `life: ${census || 'none nearby'} · journal ${this.guide.discovered.size} · atoms ${this.atoms.total()} · compounds ${this.atoms.crafted.size}/${RECIPES.length}\n` +
      `guild: ${this.guild.rank.name} · ${this.guild.points} pts · ${this.guild.active.length} active · friends ${this.guild.befriended.size}`;
  }

  private handleClicks() {
    for (const btn of this.input.takeClicks()) {
      const t = this.player.target;
      if (btn === 0 && t && !this.hotbar.holdingTool) {
        const name = BLOCKS[t.id].name;
        if (this.world.setBlock(t.block[0], t.block[1], t.block[2], AIR)) this.drops.burst(t.block[0], t.block[1], t.block[2], drawAtoms(name, 2 + (Math.random() < 0.5 ? 1 : 0)));
      } else if (btn === 2) {
        if (this.hotbar.holdingTool) { this.useTool(this.hotbar.selected); continue; }
        if (!t) continue;
        const [x, y, z] = [t.block[0] + t.normal[0], t.block[1] + t.normal[1], t.block[2] + t.normal[2]];
        if (this.player.intersectsBlock(x, y, z)) continue;
        if (this.world.getBlock(x, y, z) !== AIR && this.world.getBlock(x, y, z) !== blockId('water')) continue;
        this.world.setBlock(x, y, z, this.hotbar.selected);
      }
    }
  }

  /** Activate a tool item — right-click, or double-tap its number key. */
  useTool(held: number) {
    const t = this.player.target;
    if (held === LAMP_ITEM) { this.summon(); return; }
    if (held === MICROSCOPE_ITEM) { if (t) this.enterMicro(this.substrateOf(t.id, t.block), 'microscope'); else this.toast('Point the microscope at water, soil, leaves or wood'); return; }
    if (held === SHRINK_ITEM) { const f = Math.floor(this.player.pos.y) - 1; const under = this.world.getBlock(Math.floor(this.player.pos.x), f, Math.floor(this.player.pos.z)); this.enterMicro(this.substrateOf(under, [Math.floor(this.player.pos.x), f, Math.floor(this.player.pos.z)]), 'shrink'); return; }
    if (held === GOGGLES_ITEM) { this.toast('Goggles on — every living thing nearby shows its name'); return; }
    if (held === FLASK_ITEM) { this.toggleLab(true); return; }
    if (held === SEEDS_ITEM) { this.plantSeed(); return; }
  }

  // ---- the small world -----------------------------------------------------

  private substrateOf(blockIdAt: number, at: [number, number, number]): Substrate {
    const name = BLOCKS[blockIdAt]?.name;
    // Moss nearby? Then it's a moss cushion.
    const moss = this.life.critters.some(c => c.sp.id === 'haircap-moss' && c.pos.distanceToSquared(new THREE.Vector3(at[0] + 0.5, at[1] + 1, at[2] + 0.5)) < 4);
    if (moss) return 'moss';
    if (name === 'water' || name === 'sand') return 'pond';
    if (name === 'leaves') return 'leaf';
    if (name === 'wood' || name === 'planks') return 'bark';
    return 'soil';
  }

  enterMicro(substrate: Substrate, mode: 'microscope' | 'shrink') {
    const seed = (this.meta.seed ^ Math.floor(this.player.pos.x) * 73856093 ^ Math.floor(this.player.pos.z) * 19349663) >>> 0;
    this.micro.enter(substrate, seed, mode);
    this.guide.hideLabels();
    this.highlight.visible = false;
    this.scene.visible = false;
    this.microHud.hidden = false;
    this.microHud.innerHTML = mode === 'microscope'
      ? `🔬 Microscope — ${this.micro.description} · <b>wheel</b> zoom · <b>WASD</b> pan · <b>Q</b> put it down`
      : `✨ You shrank into ${this.micro.description} · <b>WASD</b> swim · <b>Space/C</b> up/down · <b>Q</b> grow back`;
    this.toast(mode === 'microscope' ? 'Looking closer…' : 'Shrinking…');
  }

  leaveMicro() {
    this.micro.leave();
    this.scene.visible = true;
    this.microHud.hidden = true;
    this.guide.hideLabels();
  }

  private microFrame(dt: number) {
    this.micro.update(dt);
    this.input.takeClicks();
    if (!this.guide.isJournalOpen) {
      const aimed = this.micro.pick();
      const nearby = this.micro.critters.filter(c => c.pos.distanceToSquared(this.micro.camera.position) < 260 * 260);
      // In the small world the microscope IS the goggles: everything in view is named.
      this.guide.updateLabels(this.micro.camera, aimed, nearby, true, dt);
    }
    this.renderer.render(this.micro.scene, this.micro.camera);
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.hud.textContent = `${this.fps} fps · micro: ${this.micro.critters.length} organisms in ${this.micro.description}`; }
  }

  toggleLab(open?: boolean) {
    this.lab.toggle(open);
    this.input.captured = this.lab.isOpen;
    if (this.lab.isOpen) { this.input.releaseLock(); this.overlay.hidden = true; }
    else this.input.requestLock();
  }

  /** A crafted compound appears where the player is aiming (or just in front), and the Lab tells you what it is. */
  placeCrafted(r: Recipe) {
    const t = this.player.target;
    const facing = this.player.facing();
    let x: number, y: number, z: number;
    if (t) { [x, y, z] = [t.block[0] + t.normal[0], t.block[1] + t.normal[1], t.block[2] + t.normal[2]]; }
    else { x = Math.floor(this.player.pos.x + facing.x * 3); z = Math.floor(this.player.pos.z + facing.z * 3); y = this.world.surfaceHeight(x, z) + 1; }
    if (this.player.intersectsBlock(x, y, z)) { x = Math.floor(this.player.pos.x + facing.x * 2); z = Math.floor(this.player.pos.z + facing.z * 2); y = this.world.surfaceHeight(x, z) + 1; }
    this.world.setBlock(x, y, z, blockId(r.yields));
    this.toast(`${r.formula} → ${r.name}`);
  }

  /** Generic modal toggle: releases the pointer while a panel is open. */
  togglePanel(panel: { toggle(open?: boolean): void; isOpen: boolean }, open?: boolean) {
    panel.toggle(open);
    this.input.captured = panel.isOpen;
    if (panel.isOpen) { this.input.releaseLock(); this.overlay.hidden = true; }
    else this.input.requestLock();
  }

  /** Right-click with the seed pouch: plant the chosen seed on the block you're looking at. */
  plantSeed() {
    const sp = this.seeds.selected;
    if (!sp) { this.togglePanel(this.seeds, true); return; }
    const t = this.player.target;
    if (!t) { this.toast('Look at the ground to plant'); return; }
    const top = BLOCKS[t.id].name;
    const wantsWater = sp.habitats.includes('water');
    if (wantsWater && top !== 'water') { this.toast(`${sp.common} floats — plant it on water`); return; }
    if (!wantsWater && !['grass', 'dirt', 'sand', 'snow'].includes(top)) { this.toast(`${sp.common} needs soil, not ${top}`); return; }
    const c = this.life.plant(sp, t.block[0], t.block[2]);
    if (c) this.toast(`Planted ${sp.binomial} — it will take a minute or two to grow`);
    else this.toast('Nothing took root here');
  }

  toggleJournal(open?: boolean) {
    this.guide.toggleJournal(open);
    this.input.captured = this.guide.isJournalOpen;
    if (this.guide.isJournalOpen) { this.input.releaseLock(); this.overlay.hidden = true; }
    else this.input.requestLock();
  }

  // ---- genie ---------------------------------------------------------------

  summon() {
    const facing = this.player.facing();
    const gx = Math.floor(this.player.pos.x + facing.x * 3), gz = Math.floor(this.player.pos.z + facing.z * 3);
    const gy = this.world.surfaceHeight(gx, gz);
    this.genie.summon(this.player.pos, facing, gy);
    this.input.captured = true;
    this.input.releaseLock();
    this.overlay.hidden = true;
    if (!this.chat.hasHistory) {
      const past = this.agent.transcript.slice(-8);
      for (const m of past) m.role === 'user' ? this.chat.user(m.text) : this.chat.genie(m.text);
      this.chat.genie(past.length ? '✨ Back again! I remember what we were making. What next?' : "✨ You rubbed the lamp! I'm your genie. What shall we build?");
    }
    this.chat.open();
  }

  closeChat() { this.chat.close(); }

  private async wish(text: string) {
    if (this.agent.busy) return;
    this.chat.setBusy(true);
    this.genie.thinking = true;
    const t = this.player.target;
    const facing = this.player.facing();
    const p = this.player.pos;
    const ctx = {
      player: { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) },
      facing: { x: +facing.x.toFixed(2), y: +facing.y.toFixed(2), z: +facing.z.toFixed(2) },
      target: t ? { x: t.block[0], y: t.block[1], z: t.block[2] } : null,
      surfaceY: this.world.surfaceHeight(Math.floor(p.x + facing.x * 6), Math.floor(p.z + facing.z * 6)),
      timeOfDay: 0.5,
      builds: this.edit.builds.slice(-6),
      notes: this.genieNotes,
    };
    this.edit.beginBuild(text);
    const finish = () => { const b = this.edit.endBuild(); if (b) this.toast(`✦ built: ${Object.entries(b.blocks).map(([k, v]) => `${v} ${k}`).slice(0, 3).join(', ')}`); };
    await this.agent.say(text, ctx, {
      onText: d => this.chat.genieDelta(d),
      onToolCall: (c, r) => { this.chat.tool(c, r); this.chunks.remeshBudget = 24; },
      onDone: () => { finish(); this.chat.setBusy(false); this.genie.thinking = false; this.chunks.remeshBudget = 6; },
      onError: m => { finish(); this.chat.error(m); this.chat.setBusy(false); this.genie.thinking = false; },
    });
  }

  private toastT: number | null = null;
  toast(msg: string) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('show');
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }
}

new Game().boot().catch(e => {
  console.error(e);
  document.getElementById('overlay-status')!.textContent = `failed to start: ${e.message}`;
});
