import type { SupabaseClient } from '@supabase/supabase-js';
import { CHUNK_SIZE, chunkKey, type Chunk } from '../engine/Chunk';
import type { World } from '../engine/World';
import { encodeChunk, decodeChunk } from './codec';

export interface ChunkRecord { cx: number; cy: number; cz: number; data: string }

export interface WorldMeta { id: string; name: string; seed: number }

export interface WorldStore {
  readonly kind: 'local' | 'cloud';
  listWorlds(): Promise<WorldMeta[]>;
  createWorld(name: string, seed: number, id?: string): Promise<WorldMeta>;
  loadChunks(worldId: string): Promise<ChunkRecord[]>;
  saveChunks(worldId: string, recs: ChunkRecord[]): Promise<void>;
}

// ---- IndexedDB -------------------------------------------------------------

export class LocalStore implements WorldStore {
  readonly kind = 'local' as const;
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((res, rej) => {
      const req = indexedDB.open('maples-world', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('worlds', { keyPath: 'id' });
        db.createObjectStore('chunks', { keyPath: 'key' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  private async tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
    const db = await this.db;
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res((r as IDBRequest<T> | undefined)?.result as T);
      t.onerror = () => rej(t.error);
    });
  }
  async listWorlds() { return (await this.tx<WorldMeta[]>('worlds', 'readonly', s => s.getAll())) ?? []; }
  async createWorld(name: string, seed: number, id: string = crypto.randomUUID()) {
    const w = { id, name, seed };
    await this.tx('worlds', 'readwrite', s => { s.put(w); });
    return w;
  }
  async loadChunks(worldId: string) {
    const all = (await this.tx<(ChunkRecord & { key: string; worldId: string })[]>('chunks', 'readonly', s => s.getAll())) ?? [];
    return all.filter(r => r.worldId === worldId);
  }
  async saveChunks(worldId: string, recs: ChunkRecord[]) {
    await this.tx('chunks', 'readwrite', s => { for (const r of recs) s.put({ ...r, worldId, key: `${worldId}:${r.cx},${r.cy},${r.cz}` }); });
  }
}

// ---- Supabase --------------------------------------------------------------

export class CloudStore implements WorldStore {
  readonly kind = 'cloud' as const;
  constructor(private sb: SupabaseClient) {}
  async listWorlds() {
    const { data, error } = await this.sb.from('worlds').select('id,name,seed').order('updated_at', { ascending: false });
    if (error) throw error;
    return data as WorldMeta[];
  }
  async createWorld(name: string, seed: number, id?: string) {
    const row: Record<string, unknown> = { name, seed };
    if (id) row.id = id;
    const { data, error } = await this.sb.from('worlds').insert(row).select('id,name,seed').single();
    if (error) throw error;
    return data as WorldMeta;
  }
  async loadChunks(worldId: string) {
    const { data, error } = await this.sb.from('world_chunks').select('cx,cy,cz,data').eq('world_id', worldId);
    if (error) throw error;
    return data as ChunkRecord[];
  }
  async saveChunks(worldId: string, recs: ChunkRecord[]) {
    if (!recs.length) return;
    const rows = recs.map(r => ({ world_id: worldId, ...r }));
    const { error } = await this.sb.from('world_chunks').upsert(rows, { onConflict: 'world_id,cx,cy,cz' });
    if (error) throw error;
    await this.sb.from('worlds').update({ updated_at: new Date().toISOString() }).eq('id', worldId);
  }
}

// ---- Sync engine -----------------------------------------------------------

/**
 * Debounced writer. Local store is always written (offline-first); cloud when available.
 * On load, cloud wins over local if both exist (cloud is the shared truth across devices).
 */
export class WorldSync {
  private pending = new Set<string>();
  private timer: number | null = null;
  status: 'idle' | 'saving' | 'error' = 'idle';
  lastError = '';

  constructor(private world: World, private worldId: string, private local: LocalStore, private cloud: CloudStore | null) {
    world.onBlockChange((x, y, z) => this.pending.add(chunkKey(x >> 4, y >> 4, z >> 4)));
    window.addEventListener('beforeunload', () => { void this.flush(); });
  }

  setCloud(c: CloudStore | null) { this.cloud = c; }

  async load() {
    let recs: ChunkRecord[] = [];
    if (this.cloud) {
      try { recs = await this.cloud.loadChunks(this.worldId); } catch (e) { this.lastError = String((e as Error).message); }
    }
    if (!recs.length) recs = await this.local.loadChunks(this.worldId);
    for (const r of recs) {
      const c = this.world.getChunk(r.cx, r.cy, r.cz, true);
      if (!c) continue;
      const bytes = await decodeChunk(r.data);
      if (bytes.length !== CHUNK_SIZE ** 3) continue;
      c.data.set(bytes); c.recount(); c.dirty = true; c.modified = true;
    }
    return recs.length;
  }

  /** Called every frame; schedules a save 1.5 s after the last edit. */
  tick() {
    if (this.pending.size === 0 || this.timer !== null) return;
    this.timer = window.setTimeout(() => { this.timer = null; void this.flush(); }, 1500);
  }

  async flush() {
    if (this.pending.size === 0) return;
    const keys = [...this.pending]; this.pending.clear();
    const chunks: Chunk[] = [];
    for (const k of keys) { const c = this.world.chunks.get(k); if (c) chunks.push(c); }
    const recs: ChunkRecord[] = await Promise.all(chunks.map(async c => ({ cx: c.cx, cy: c.cy, cz: c.cz, data: await encodeChunk(c.data) })));
    this.status = 'saving';
    try {
      await this.local.saveChunks(this.worldId, recs);
      if (this.cloud) await this.cloud.saveChunks(this.worldId, recs);
      this.status = 'idle';
    } catch (e) {
      this.status = 'error'; this.lastError = String((e as Error).message);
      for (const k of keys) this.pending.add(k); // retry next tick
    }
  }
}
