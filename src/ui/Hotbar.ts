import { BLOCKS, blockId } from '../engine/Blocks';
import type { BlockName } from '../../shared/genie-tools';

export const LAMP_ITEM = -1; // sentinel: the genie's lamp occupies a hotbar slot but is not a block

const DEFAULT_SLOTS: (BlockName | typeof LAMP_ITEM)[] = [LAMP_ITEM, 'planks', 'brick', 'glass', 'stone', 'wood', 'leaves', 'pink', 'blue'];

export class Hotbar {
  slots: number[] = DEFAULT_SLOTS.map(s => (s === LAMP_ITEM ? LAMP_ITEM : blockId(s)));
  active = 1;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    this.render();
    window.addEventListener('keydown', e => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && !(e.target instanceof HTMLInputElement)) this.select(n - 1);
    });
  }

  get selected(): number { return this.slots[this.active]; }
  get holdingLamp() { return this.selected === LAMP_ITEM; }

  select(i: number) { this.active = ((i % 9) + 9) % 9; this.render(); }
  scroll(dir: number) { if (dir) this.select(this.active + dir); }

  private render() {
    this.el.innerHTML = '';
    this.slots.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (i === this.active ? ' active' : '') + (id === LAMP_ITEM ? ' lamp' : '');
      const sw = document.createElement('div'); sw.className = 'swatch';
      const label = document.createElement('div'); label.className = 'label';
      if (id === LAMP_ITEM) label.textContent = 'lamp';
      else { const b = BLOCKS[id]; sw.style.background = '#' + b.colors[1].toString(16).padStart(6, '0'); label.textContent = b.name; }
      d.append(sw, label);
      d.addEventListener('mousedown', ev => { ev.stopPropagation(); this.select(i); });
      this.el.appendChild(d);
    });
  }
}
