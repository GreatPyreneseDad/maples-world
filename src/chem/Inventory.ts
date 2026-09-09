import { RECIPES, canCraft, type Recipe } from '../../shared/chemistry';

/** Atoms the player holds, plus the compounds they have made. Persisted per world. */
export class ElementInventory {
  counts: Record<string, number> = {};
  crafted = new Set<string>();
  private key: string;
  onChange?: () => void;

  constructor(worldId: string) {
    this.key = `maples:atoms:${worldId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? '{}');
      this.counts = saved.counts ?? {};
      for (const id of saved.crafted ?? []) this.crafted.add(id);
    } catch { /* fresh */ }
  }

  add(symbol: string, n = 1) { this.counts[symbol] = (this.counts[symbol] ?? 0) + n; this.persist(); }

  total() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }
  distinct() { return Object.keys(this.counts).filter(k => this.counts[k] > 0).length; }

  can(r: Recipe) { return canCraft(this.counts, r); }
  available() { return RECIPES.filter(r => this.can(r)); }

  /** Consume atoms for a recipe. Returns false if short. */
  craft(r: Recipe): boolean {
    if (!this.can(r)) return false;
    for (const [s, n] of Object.entries(r.needs)) { this.counts[s] -= n; if (this.counts[s] <= 0) delete this.counts[s]; }
    this.crafted.add(r.id);
    this.persist();
    return true;
  }

  private persist() {
    try { localStorage.setItem(this.key, JSON.stringify({ counts: this.counts, crafted: [...this.crafted] })); } catch { /* quota */ }
    this.onChange?.();
  }
}
