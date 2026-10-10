/** Keyboard/mouse/touch state. UI (chat) can claim focus to suppress game input. */
export class Input {
  keys = new Set<string>();
  mouseDX = 0; mouseDY = 0;
  locked = false;
  /** When true, keys/mouse are ignored by the game (chat open, menu open). */
  captured = false;
  private clicks: number[] = [];
  private wheel = 0;
  /**
   * Phones and tablets have no pointer lock. In touch mode "locked" just means "playing":
   * requestLock/releaseLock flip it directly and TouchControls feeds look, clicks and virtual keys.
   */
  readonly touchMode = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  /** Keys held by on-screen buttons and the move stick. */
  private virtual = new Set<string>();
  /** Presses not yet seen by a frame. A tap can start and end between two frames; it must still count once. */
  private latched = new Set<string>();
  /** Time of the last touch on the canvas; browsers replay touches as mouse events, which we must ignore. */
  lastTouch = -1e9;
  /** Fires whenever play starts or stops (pointer lock gained/lost, or the touch equivalent). */
  onLock?: (locked: boolean) => void;

  constructor(readonly el: HTMLElement) {
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
      if (performance.now() - this.lastTouch < 800) return;
      if (!this.locked) { this.requestLock(); return; }
      if (this.captured) return;
      this.clicks.push(e.button);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => { if (this.locked && !this.captured) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { if (!this.touchMode) this.setLocked(document.pointerLockElement === el); });
  }

  private setLocked(v: boolean) {
    this.locked = v;
    if (!v) { this.keys.clear(); this.virtual.clear(); this.latched.clear(); }
    this.onLock?.(v);
  }
  requestLock() { if (this.touchMode) { this.setLocked(true); return; } this.el.requestPointerLock?.(); }
  releaseLock() { if (this.touchMode) { this.setLocked(false); return; } if (document.pointerLockElement) document.exitPointerLock(); }

  // On-screen controls feed the same state the keyboard and mouse do.
  press(code: string) { if (this.locked && !this.captured) { this.virtual.add(code); this.latched.add(code); } }
  /** Call once per frame after input has been read. */
  endFrame() { this.latched.clear(); }
  release(code: string) { this.virtual.delete(code); }
  click(button: number) { if (this.locked && !this.captured) this.clicks.push(button); }
  look(dx: number, dy: number) { if (this.locked && !this.captured) { this.mouseDX += dx; this.mouseDY += dy; } }
  scroll(dir: number) { if (this.locked && !this.captured) this.wheel += dir; }

  down(code: string) { return !this.captured && (this.keys.has(code) || this.virtual.has(code) || this.latched.has(code)); }
  /** Drain accumulated mouse delta. */
  takeMouse(): [number, number] { const r: [number, number] = [this.mouseDX, this.mouseDY]; this.mouseDX = this.mouseDY = 0; return r; }
  takeClicks(): number[] { const c = this.clicks; this.clicks = []; return c; }
  takeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
}
