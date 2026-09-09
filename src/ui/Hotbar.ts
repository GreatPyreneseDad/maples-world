import { BLOCKS, blockId } from '../engine/Blocks';
import type { BlockName } from '../../shared/genie-tools';

// Tool items are negative sentinels: they live in hotbar slots but are not blocks.
export const LAMP_ITEM = -1;
export const GOGGLES_ITEM = -2;
export const MICROSCOPE_ITEM = -3;
export const SHRINK_ITEM = -4;
const TOOL_CLASS: Record<number, string> = { [LAMP_ITEM]: 'lamp', [GOGGLES_ITEM]: 'goggles', [MICROSCOPE_ITEM]: 'microscope', [SHRINK_ITEM]: 'shrink' };
const TOOL_LABEL: Record<number, string> = { [LAMP_ITEM]: 'lamp', [GOGGLES_ITEM]: 'goggles', [MICROSCOPE_ITEM]: 'scope', [SHRINK_ITEM]: 'shrink' };
export const isTool = (id: number) => id < 0;

const DEFAULT_SLOTS: (BlockName | number)[] = [LAMP_ITEM, GOGGLES_ITEM, MICROSCOPE_ITEM, SHRINK_ITEM, 'planks', 'brick', 'glass', 'stone', 'pink'];

export class Hotbar {
  slots: number[] = DEFAULT_SLOTS.map(s => (typeof s === 'number' ? s : blockId(s)));
  active = 4;
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
  get holdingTool() { return isTool(this.selected); }
  get toolName() { return TOOL_LABEL[this.selected] ?? null; }

  select(i: number) { this.active = ((i % 9) + 9) % 9; this.render(); }
  scroll(dir: number) { if (dir) this.select(this.active + dir); }

  private render() {
    this.el.innerHTML = '';
    this.slots.forEach((id, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (i === this.active ? ' active' : '') + (isTool(id) ? ' ' + TOOL_CLASS[id] : '');
      const sw = document.createElement('div'); sw.className = 'swatch';
      const label = document.createElement('div'); label.className = 'slot-label';
      if (isTool(id)) label.textContent = TOOL_LABEL[id];
      else { const b = BLOCKS[id]; sw.style.background = '#' + b.colors[1].toString(16).padStart(6, '0'); label.textContent = b.name; }
      d.append(sw, label);
      d.addEventListener('mousedown', ev => { ev.stopPropagation(); this.select(i); });
      this.el.appendChild(d);
    });
  }
}
