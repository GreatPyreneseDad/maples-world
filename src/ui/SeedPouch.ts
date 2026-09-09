import { SPECIES, SPECIES_BY_ID, type Species } from '../../shared/taxonomy';

/** Choose what to plant. Every seed is a real plant with its real name; the card says who eats it. */
export class SeedPouch {
  private root = document.getElementById('seeds')!;
  private list = document.getElementById('seeds-list')!;
  private current: Species | null = null;
  onPick?: (sp: Species) => void;

  constructor() {
    document.getElementById('seeds-close')!.addEventListener('click', () => this.toggle(false));
  }

  get selected() { return this.current; }
  get isOpen() { return !this.root.hidden; }

  toggle(open = this.root.hidden) { this.root.hidden = !open; if (open) this.render(); }

  render() {
    const plants = SPECIES.filter(s => s.kingdom === 'Plantae' && s.tier === 'macro');
    this.list.innerHTML = plants.map(p => {
      const eaters = SPECIES.filter(s => s.diet?.includes(p.id)).map(s => s.common);
      return `<button class="seed ${this.current?.id === p.id ? 'on' : ''}" data-id="${p.id}"><i>${p.binomial}</i><b>${p.common}</b><small>${p.habitats.includes('water') ? 'plant on water' : 'plant on grass or soil'}${eaters.length ? ' · eaten by ' + eaters.join(', ') : ''}</small></button>`;
    }).join('');
    this.list.querySelectorAll<HTMLButtonElement>('.seed').forEach(b => b.addEventListener('click', () => {
      this.current = SPECIES_BY_ID[b.dataset.id!];
      this.onPick?.(this.current);
      this.toggle(false);
    }));
  }
}
