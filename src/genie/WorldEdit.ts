import type { World } from '../engine/World';
import { BLOCKS, blockId, AIR } from '../engine/Blocks';
import { LIMITS, type ToolCall, type ToolInputs, type ToolResult, type Vec3, type BlockName, BLOCK_NAMES } from '../../shared/genie-tools';

/** x, y, z, optional op-specific flag (fill uses 1 = shell). */
type Cell = [number, number, number, number?];
interface Change { x: number; y: number; z: number; prev: number }
interface UndoEntry { label: string; changes: Change[] }

/**
 * The only path by which the genie touches the world. Every op is bounded,
 * deterministic, and recorded for undo. Tool calls from the model are validated
 * here — the model is untrusted input.
 */
export class WorldEdit {
  private undoStack: UndoEntry[] = [];
  readonly maxUndo = 50;
  /** Fires after any op so UI can flash / play sound. */
  onEdit?: (label: string, count: number) => void;

  constructor(private world: World, private canPlaceAt?: (x: number, y: number, z: number) => boolean) {}

  execute(call: ToolCall): ToolResult {
    try {
      const content = this.dispatch(call);
      return { id: call.id, ok: true, content };
    } catch (e) {
      return { id: call.id, ok: false, content: `error: ${(e as Error).message}` };
    }
  }

  private dispatch(call: ToolCall): string {
    const i = call.input as never;
    switch (call.name) {
      case 'set_block': return this.setBlock(i);
      case 'fill': return this.fill(i);
      case 'sphere': return this.sphere(i);
      case 'cylinder': return this.cylinder(i);
      case 'line': return this.line(i);
      case 'replace': return this.replace(i);
      case 'clear': return this.clear(i);
      case 'get_block': return this.getBlock(i);
      case 'scan': return this.scan(i);
      case 'surface_height': return this.surfaceHeight(i);
      case 'undo': return this.undo((i as ToolInputs['undo']).steps ?? 1);
      case 'say': return 'ok';
      default: throw new Error(`unknown tool ${(call as ToolCall).name}`);
    }
  }

  // ---- ops ----------------------------------------------------------------

  private setBlock({ pos, block }: ToolInputs['set_block']) {
    const id = this.id(block);
    const p = this.vec(pos);
    const n = this.apply(`set ${block}`, [[p.x, p.y, p.z]], () => id);
    return `placed ${n} block`;
  }

  private fill({ from, to, block, hollow }: ToolInputs['fill']) {
    const id = this.id(block);
    const [a, b] = this.box(from, to, LIMITS.boxVolume);
    const cells: Cell[] = [];
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) for (let z = a.z; z <= b.z; z++) {
      const shell = x === a.x || x === b.x || y === a.y || y === b.y || z === a.z || z === b.z;
      cells.push([x, y, z, shell ? 1 : 0]);
    }
    const n = this.apply(`fill ${block}`, cells, c => (hollow && c[3] === 0) ? AIR : id);
    return `filled ${n} blocks (${dims(a, b)})${hollow ? ', hollow' : ''}`;
  }

  private sphere({ center, radius, block, hollow }: ToolInputs['sphere']) {
    const id = this.id(block);
    const c = this.vec(center);
    const r = clampInt(radius, 1, LIMITS.radius);
    const cells: Cell[] = [];
    const r2 = (r + 0.5) ** 2, inner = (r - 0.5) ** 2;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = x * x + y * y + z * z;
      if (d > r2) continue;
      if (hollow && d < inner) continue;
      cells.push([c.x + x, c.y + y, c.z + z]);
    }
    const n = this.apply(`sphere ${block}`, cells, () => id);
    return `sphere r=${r}: ${n} blocks`;
  }

  private cylinder({ base, radius, height, block, hollow }: ToolInputs['cylinder']) {
    const id = this.id(block);
    const c = this.vec(base);
    const r = clampInt(radius, 0, LIMITS.radius), h = clampInt(height, 1, LIMITS.height);
    const cells: Cell[] = [];
    const r2 = (r + 0.5) ** 2, inner = (r - 0.5) ** 2;
    for (let y = 0; y < h; y++) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = x * x + z * z;
      if (d > r2) continue;
      if (hollow && d < inner) continue;
      cells.push([c.x + x, c.y + y, c.z + z]);
    }
    const n = this.apply(`cylinder ${block}`, cells, () => id);
    return `cylinder r=${r} h=${h}: ${n} blocks`;
  }

  private line({ from, to, block }: ToolInputs['line']) {
    const id = this.id(block);
    const a = this.vec(from), b = this.vec(to);
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z));
    if (steps > 256) throw new Error('line too long (max 256)');
    const cells: Cell[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      cells.push([Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), Math.round(a.z + (b.z - a.z) * t)]);
    }
    const n = this.apply(`line ${block}`, cells, () => id);
    return `line: ${n} blocks`;
  }

  private replace({ from, to, find, block }: ToolInputs['replace']) {
    const findId = this.id(find), id = this.id(block);
    const [a, b] = this.box(from, to, LIMITS.boxVolume);
    const cells: Cell[] = [];
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) for (let z = a.z; z <= b.z; z++)
      if (this.world.getBlockGen(x, y, z) === findId) cells.push([x, y, z]);
    const n = this.apply(`replace ${find}->${block}`, cells, () => id);
    return `replaced ${n} ${find} with ${block}`;
  }

  private clear({ from, to }: ToolInputs['clear']) {
    const [a, b] = this.box(from, to, LIMITS.boxVolume);
    const cells: Cell[] = [];
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) for (let z = a.z; z <= b.z; z++) cells.push([x, y, z]);
    const n = this.apply('clear', cells, () => AIR);
    return `cleared ${n} blocks (${dims(a, b)})`;
  }

  private getBlock({ pos }: ToolInputs['get_block']) {
    const p = this.vec(pos);
    return BLOCKS[this.world.getBlockGen(p.x, p.y, p.z)].name;
  }

  private scan({ from, to }: ToolInputs['scan']) {
    const [a, b] = this.box(from, to, LIMITS.scanVolume);
    const counts = new Map<string, number>();
    let minSolidY = Infinity, maxSolidY = -Infinity;
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) for (let z = a.z; z <= b.z; z++) {
      const id = this.world.getBlockGen(x, y, z);
      const name = BLOCKS[id].name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      if (id !== AIR && BLOCKS[id].solid) { minSolidY = Math.min(minSolidY, y); maxSolidY = Math.max(maxSolidY, y); }
    }
    const top = [...counts.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' ');
    return `box ${dims(a, b)} — ${top}; solid y-range ${isFinite(minSolidY) ? `${minSolidY}..${maxSolidY}` : 'none'}`;
  }

  private surfaceHeight({ x, z }: ToolInputs['surface_height']) {
    return String(this.world.surfaceHeight(Math.round(x), Math.round(z)));
  }

  undo(steps = 1): string {
    let total = 0, done = 0;
    for (let s = 0; s < steps; s++) {
      const e = this.undoStack.pop();
      if (!e) break;
      for (let i = e.changes.length - 1; i >= 0; i--) {
        const c = e.changes[i];
        this.world.setBlock(c.x, c.y, c.z, c.prev);
      }
      total += e.changes.length; done++;
    }
    this.onEdit?.('undo', total);
    return done ? `undid ${done} edit(s), ${total} blocks restored` : 'nothing to undo';
  }

  get undoDepth() { return this.undoStack.length; }

  // ---- internals ----------------------------------------------------------

  private apply(label: string, cells: Cell[], pick: (cell: Cell) => number): number {
    const changes: Change[] = [];
    for (const cell of cells) {
      const [x, y, z] = cell;
      if (this.canPlaceAt && !this.canPlaceAt(x, y, z)) continue;
      const next = pick(cell);
      const prev = this.world.getBlockGen(x, y, z);
      if (prev === next) continue;
      if (this.world.setBlock(x, y, z, next)) changes.push({ x, y, z, prev });
    }
    if (changes.length) {
      this.undoStack.push({ label, changes });
      if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
      this.onEdit?.(label, changes.length);
    }
    return changes.length;
  }

  private id(name: BlockName): number {
    if (!(BLOCK_NAMES as readonly string[]).includes(name)) throw new Error(`unknown block "${name}". Use one of: ${BLOCK_NAMES.join(', ')}`);
    return blockId(name);
  }

  private vec(v: Vec3): Vec3 {
    if (!v || typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number') throw new Error('position must be {x,y,z} integers');
    return { x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z) };
  }

  private box(from: Vec3, to: Vec3, maxVolume: number): [Vec3, Vec3] {
    const a = this.vec(from), b = this.vec(to);
    const lo = { x: Math.min(a.x, b.x), y: Math.max(0, Math.min(a.y, b.y)), z: Math.min(a.z, b.z) };
    const hi = { x: Math.max(a.x, b.x), y: Math.min(127, Math.max(a.y, b.y)), z: Math.max(a.z, b.z) };
    const vol = (hi.x - lo.x + 1) * (hi.y - lo.y + 1) * (hi.z - lo.z + 1);
    if (vol > maxVolume) throw new Error(`box volume ${vol} exceeds limit ${maxVolume}; split into smaller boxes`);
    return [lo, hi];
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const dims = (a: Vec3, b: Vec3) => `${b.x - a.x + 1}x${b.y - a.y + 1}x${b.z - a.z + 1}`;
