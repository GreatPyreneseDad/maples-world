import type { Input } from '../player/Input';

/** What the menu buttons do; the game owns the panels. */
export interface TouchHandlers { journal(): void; guild(): void; seeds(): void; lab(): void; leaveMicro(): void; }

const LOOK_GAIN = 2.4;   // one finger-pixel turns the camera as far as this many mouse-pixels
const STICK_R = 52;      // px of thumb travel for full tilt
const DEADZONE = 0.35;

/**
 * On-screen controls for phones and tablets. Left thumb drags a move stick, right thumb drags to look,
 * buttons stand in for mouse buttons and keys. Everything feeds the same Input the keyboard does,
 * so Player and MicroWorld do not know the difference.
 */
export class TouchControls {
  private root = document.createElement('div');
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId = -1; private lookId = -1;
  private sx = 0; private sy = 0; private lx = 0; private ly = 0;
  private playing = false; private micro: false | 'microscope' | 'shrink' = false;

  constructor(private input: Input, private h: TouchHandlers) {
    this.root.id = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="t-stick" hidden><i></i></div>
      <div class="t-menu">
        <button type="button" data-do="journal" class="t-world">Journal</button>
        <button type="button" data-do="guild" class="t-world">Guild</button>
        <button type="button" data-do="seeds" class="t-world">Seeds</button>
        <button type="button" data-do="lab" class="t-world">Lab</button>
        <button type="button" data-wheel="-1" class="t-scope" aria-label="Zoom in">+</button>
        <button type="button" data-wheel="1" class="t-scope" aria-label="Zoom out">&minus;</button>
        <button type="button" data-do="leaveMicro" class="t-micro">Back to size</button>
      </div>
      <div class="t-act">
        <button type="button" data-click="0" class="t-world t-break">Break</button>
        <button type="button" data-key="Space" class="t-fly" aria-label="Jump. Double tap to fly.">Jump<small>&times;2 fly</small></button>
        <button type="button" data-click="2" class="t-world t-place">Place<small>or use</small></button>
        <button type="button" data-key="KeyC" class="t-fly" aria-label="Down">Down</button>
      </div>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick')!;
    this.knob = this.stick.querySelector('i')!;

    for (const b of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      const d = b.dataset;
      if (d.do) { b.addEventListener('click', () => this.h[d.do as keyof TouchHandlers]()); continue; }
      let timer: number | null = null;
      const fire = () => { if (d.click) this.input.click(Number(d.click)); if (d.wheel) this.input.scroll(Number(d.wheel)); };
      const up = () => { b.classList.remove('on'); if (d.key) this.input.release(d.key); if (timer !== null) { clearInterval(timer); timer = null; } };
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('on');
        if (d.key) this.input.press(d.key);
        fire();
        // Holding Break keeps digging; holding a zoom button keeps zooming. Place stays one block per tap.
        if (d.click === '0' || d.wheel) timer = window.setInterval(fire, d.wheel ? 90 : 230);
      });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    }

    const el = input.el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      input.lastTouch = performance.now();
      if (!input.locked) { if (!input.captured) input.requestLock(); return; }
      if (input.captured) return;
      if (this.stickId < 0 && e.clientX < innerWidth * 0.42) {
        this.stickId = e.pointerId; this.sx = e.clientX; this.sy = e.clientY;
        this.stick.style.left = `${this.sx}px`; this.stick.style.top = `${this.sy}px`;
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.stick.hidden = false;
      } else if (this.lookId < 0) {
        this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
      } else return;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) {
        let x = (e.clientX - this.sx) / STICK_R, y = (e.clientY - this.sy) / STICK_R;
        const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
        this.knob.style.transform = `translate(calc(-50% + ${x * STICK_R}px), calc(-50% + ${y * STICK_R}px))`;
        this.setKey('KeyW', y < -DEADZONE); this.setKey('KeyS', y > DEADZONE);
        this.setKey('KeyA', x < -DEADZONE); this.setKey('KeyD', x > DEADZONE);
      } else if (e.pointerId === this.lookId) {
        this.input.look((e.clientX - this.lx) * LOOK_GAIN, (e.clientY - this.ly) * LOOK_GAIN);
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.stickId) this.dropStick();
      if (e.pointerId === this.lookId) this.lookId = -1;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private setKey(code: string, on: boolean) { if (on) this.input.press(code); else this.input.release(code); }
  private dropStick() {
    this.stickId = -1; this.stick.hidden = true;
    for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) this.input.release(k);
  }

  /** Called every frame: show the controls only while the player is actually in the world. */
  setState(playing: boolean, micro: false | 'microscope' | 'shrink') {
    if (playing === this.playing && micro === this.micro) return;
    this.playing = playing; this.micro = micro;
    this.root.hidden = !playing;
    this.root.className = micro ? `micro ${micro}` : 'world';
    if (!playing) { this.dropStick(); this.lookId = -1; }
  }
}
