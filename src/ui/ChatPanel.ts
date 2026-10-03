import type { ToolCall, ToolResult } from '../../shared/genie-tools';

export class ChatPanel {
  private root = document.getElementById('chat')!;
  private log = document.getElementById('chat-log')!;
  private input = document.getElementById('chat-input') as HTMLInputElement;
  private send = document.getElementById('chat-send') as HTMLButtonElement;
  private status = document.getElementById('chat-status')!;
  private current: HTMLElement | null = null;
  onSubmit?: (text: string) => void;
  onClose?: () => void;

  constructor() {
    document.getElementById('chat-form')!.addEventListener('submit', e => {
      e.preventDefault();
      const t = this.input.value.trim();
      if (!t || this.send.disabled) return;
      this.input.value = '';
      this.user(t);
      this.onSubmit?.(t);
    });
    document.getElementById('chat-close')!.addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); this.close(); } e.stopPropagation(); });
    this.input.addEventListener('keyup', e => e.stopPropagation());
  }

  get isOpen() { return !this.root.hidden; }

  open(greeting?: string) {
    this.root.hidden = false;
    if (greeting && this.log.childElementCount === 0) this.genie(greeting);
    setTimeout(() => this.input.focus(), 0);
  }

  close() { if (this.root.hidden) return; this.root.hidden = true; this.input.blur(); this.onClose?.(); }

  setBusy(b: boolean) { this.send.disabled = b; this.status.textContent = b ? 'thinking…' : 'ready'; }

  user(text: string) { this.add('user', text); this.current = null; }
  genie(text: string) { this.add('genie', text); this.current = null; }
  /** Streamed text: appends to the current genie bubble. */
  genieDelta(delta: string) {
    if (!this.current) this.current = this.add('genie', '');
    this.current.textContent += delta;
    this.log.scrollTop = this.log.scrollHeight;
  }
  tool(call: ToolCall, res: ToolResult) {
    this.current = null;
    this.add('tool' + (res.ok ? '' : ' err'), `✦ ${call.name} → ${res.content}`);
  }
  error(msg: string) { this.add('genie err', `The lamp flickers… ${msg}`); this.current = null; }

  private add(cls: string, text: string) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    this.log.appendChild(d);
    while (this.log.childElementCount > 80) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    return d;
  }
}
