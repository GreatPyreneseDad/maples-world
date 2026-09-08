/** Keyboard/mouse state. UI (chat) can claim focus to suppress game input. */
export class Input {
  keys = new Set<string>();
  mouseDX = 0; mouseDY = 0;
  locked = false;
  /** When true, keys/mouse are ignored by the game (chat open, menu open). */
  captured = false;
  private clicks: number[] = [];
  private wheel = 0;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', e => {
      if (this.captured) return;
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', e => {
      if (!this.locked || this.captured) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', e => {
      if (!this.locked) { this.requestLock(); return; }
      if (this.captured) return;
      this.clicks.push(e.button);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => { if (this.locked && !this.captured) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; if (!this.locked) this.keys.clear(); });
  }

  requestLock() { this.el.requestPointerLock?.(); }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code: string) { return !this.captured && this.keys.has(code); }
  /** Drain accumulated mouse delta. */
  takeMouse(): [number, number] { const r: [number, number] = [this.mouseDX, this.mouseDY]; this.mouseDX = this.mouseDY = 0; return r; }
  takeClicks(): number[] { const c = this.clicks; this.clicks = []; return c; }
  takeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
}
