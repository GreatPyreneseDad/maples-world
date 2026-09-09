import { ELEMENTS, ELEMENT_BY_SYMBOL, RECIPES, elementColor, type Recipe } from '../../shared/chemistry';
import type { ElementInventory } from '../chem/Inventory';

/**
 * The Lab: your atoms on the left (a periodic table that fills in as you find things),
 * recipes on the right with real formulas. Click a recipe you can afford and it is made.
 */
export class LabPanel {
  private root = document.getElementById('lab')!;
  private atomsEl = document.getElementById('lab-atoms')!;
  private recipesEl = document.getElementById('lab-recipes')!;
  private countEl = document.getElementById('lab-count')!;
  private pocket = document.getElementById('pocket')!;
  onCraft?: (r: Recipe) => void;

  constructor(private inv: ElementInventory) {
    document.getElementById('lab-close')!.addEventListener('click', () => this.toggle(false));
    inv.onChange = () => { this.renderPocket(); if (this.isOpen) this.render(); };
    this.renderPocket();
  }

  get isOpen() { return !this.root.hidden; }
  toggle(open = this.root.hidden) { this.root.hidden = !open; if (open) this.render(); }

  /** Tiny always-on strip of what you're carrying. */
  renderPocket() {
    const entries = Object.entries(this.inv.counts).filter(([, n]) => n > 0).sort((a, b) => ELEMENT_BY_SYMBOL[a[0]].z - ELEMENT_BY_SYMBOL[b[0]].z);
    this.pocket.hidden = entries.length === 0;
    this.pocket.innerHTML = entries.slice(0, 14).map(([s, n]) => `<span class="atom" style="--c:#${elementColor(s).toString(16).padStart(6, '0')}"><b>${s}</b><i>${n}</i></span>`).join('')
      + (entries.length > 14 ? `<span class="more">+${entries.length - 14}</span>` : '') + `<span class="hint">L · lab</span>`;
  }

  render() {
    const have = this.inv.counts;
    this.countEl.textContent = `${this.inv.total()} atoms · ${this.inv.distinct()} elements · ${this.inv.crafted.size}/${RECIPES.length} compounds made`;
    // Periodic table, 18 columns, main-block only (lanthanides/actinides in a footnote row).
    const cell = (e: (typeof ELEMENTS)[number]) => {
      const n = have[e.symbol] ?? 0;
      const col = `#${elementColor(e.symbol).toString(16).padStart(6, '0')}`;
      return `<div class="el ${n ? 'have' : ''}" style="grid-column:${column(e.z)};--c:${col}" title="${e.name} (Z=${e.z}) — ${e.category}${e.fact ? '\n' + e.fact : ''}"><b>${e.symbol}</b><small>${e.z}</small>${n ? `<i>${n}</i>` : ''}</div>`;
    };
    const main = ELEMENTS.filter(e => !(e.z >= 57 && e.z <= 71) && !(e.z >= 89 && e.z <= 103));
    const f = ELEMENTS.filter(e => (e.z >= 57 && e.z <= 71) || (e.z >= 89 && e.z <= 103));
    this.atomsEl.innerHTML = `<div class="ptable">${main.map(cell).join('')}</div><div class="fblock">${f.map(e => { const n = have[e.symbol] ?? 0; return `<div class="el ${n ? 'have' : ''}" style="--c:#${elementColor(e.symbol).toString(16).padStart(6, '0')}" title="${e.name} (Z=${e.z})"><b>${e.symbol}</b>${n ? `<i>${n}</i>` : ''}</div>`; }).join('')}</div>`;

    this.recipesEl.innerHTML = RECIPES.map(r => {
      const ok = this.inv.can(r), made = this.inv.crafted.has(r.id);
      const needs = Object.entries(r.needs).map(([s, n]) => `<span class="${(have[s] ?? 0) >= n ? 'ok' : 'short'}">${s}<sub>${n}</sub> <em>${have[s] ?? 0}</em></span>`).join(' ');
      return `<div class="recipe ${ok ? 'can' : ''} ${made ? 'made' : ''}" data-id="${r.id}"><div class="f">${r.formula}</div><div class="n">${r.name}${made ? ' ✓' : ''}</div><div class="needs">${needs}</div>${made || ok ? `<p>${r.fact}</p>` : ''}<button ${ok ? '' : 'disabled'}>Make</button></div>`;
    }).join('');
    this.recipesEl.querySelectorAll<HTMLButtonElement>('.recipe button').forEach(btn => btn.addEventListener('click', e => {
      const id = (e.currentTarget as HTMLElement).closest('.recipe')!.getAttribute('data-id')!;
      const r = RECIPES.find(x => x.id === id)!;
      if (this.inv.craft(r)) this.onCraft?.(r);
    }));
  }
}

/** Periodic-table column for a main-block element. */
function column(z: number): number {
  if (z === 1) return 1; if (z === 2) return 18;
  if (z <= 4) return z - 2;                       // Li Be
  if (z <= 10) return z + 8;                      // B..Ne → 13..18
  if (z <= 12) return z - 10;                     // Na Mg
  if (z <= 18) return z;                          // Al..Ar → 13..18
  if (z <= 36) return z - 18;                     // K..Kr → 1..18
  if (z <= 54) return z - 36;                     // Rb..Xe
  if (z <= 56) return z - 54;                     // Cs Ba
  if (z <= 86) return z - 68;                     // Hf..Rn → 4..18  (72-68=4)
  if (z <= 88) return z - 86;                     // Fr Ra
  return z - 100;                                 // Rf..Og → 4..18 (104-100=4)
}
