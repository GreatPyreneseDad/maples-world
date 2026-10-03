import { LIMITS, type GenieEvent, type GenieRequest, type ToolCall, type ToolResult } from '../../shared/genie-tools';
import type { WorldEdit } from './WorldEdit';

export interface GenieBackend {
  /** Stream one model step. Must yield a final `turn_end` (or `error`). */
  step(req: GenieRequest, signal: AbortSignal): AsyncIterable<GenieEvent>;
}

export interface AgentCallbacks {
  onText(delta: string): void;
  onToolCall(call: ToolCall, result: ToolResult): void;
  onDone(): void;
  onError(msg: string): void;
}

/**
 * Client-side agentic loop. The model proposes tool calls; WorldEdit executes them
 * as they stream in (so the player watches the build happen), results go back,
 * repeat until the model ends its turn or the step cap trips.
 */
export class GenieAgent {
  private history: unknown[] = [];
  private abort: AbortController | null = null;
  busy = false;

  private key: string;

  constructor(private backend: GenieBackend, private edit: WorldEdit, private worldId: string) {
    this.key = `maples:genie-history:${worldId}`;
    try { this.history = JSON.parse(localStorage.getItem(this.key) ?? '[]'); } catch { this.history = []; }
    const before = this.history.length;
    this.repair();
    if (this.history.length !== before) this.persist();
  }

  /**
   * Make the history something the API will accept again, whatever happened last time
   * (tab closed mid-build, max_tokens, a dropped stream): every tool_use must be answered by
   * a tool_result in the very next user message, and vice versa. Unanswered tool_use blocks
   * are stripped; orphan tool_result blocks are stripped; then the ends are trimmed so the
   * history starts with a user turn and ends with an assistant turn.
   */
  private repair() {
    type Msg = { role: 'user' | 'assistant'; content: unknown };
    type Block = { type: string; id?: string; tool_use_id?: string; text?: string };
    const msgs = (this.history as Msg[]).filter(m => m && (m.role === 'user' || m.role === 'assistant'));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    while (msgs.length && msgs[msgs.length - 1].role !== 'assistant') msgs.pop();
    const out: Msg[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!Array.isArray(m.content)) { out.push(m); continue; }
      let blocks = m.content as Block[];
      if (m.role === 'assistant') {
        const next = msgs[i + 1];
        const answered = new Set(Array.isArray(next?.content) ? (next!.content as Block[]).filter(b => b.type === 'tool_result').map(b => b.tool_use_id) : []);
        blocks = blocks.filter(b => b.type !== 'tool_use' || answered.has(b.id));
      } else {
        const prev = out[out.length - 1];
        const asked = new Set(Array.isArray(prev?.content) ? (prev!.content as Block[]).filter(b => b.type === 'tool_use').map(b => b.id) : []);
        blocks = blocks.filter(b => b.type !== 'tool_result' || asked.has(b.tool_use_id));
      }
      blocks = blocks.filter(b => b.type !== 'text' || (b.text ?? '').trim());
      if (blocks.length) out.push({ role: m.role, content: blocks });
    }
    // Merge adjacent same-role turns (can appear after stripping), then trim the ends.
    const merged: Msg[] = [];
    for (const m of out) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) {
        const a = Array.isArray(last.content) ? last.content as Block[] : [{ type: 'text', text: String(last.content) }];
        const b = Array.isArray(m.content) ? m.content as Block[] : [{ type: 'text', text: String(m.content) }];
        last.content = [...a, ...b];
      } else merged.push({ ...m });
    }
    while (merged.length && merged[0].role !== 'user') merged.shift();
    while (merged.length && merged[merged.length - 1].role !== 'assistant') merged.pop();
    const changed = merged.length !== this.history.length;
    this.history = merged;
    if (changed && merged.length) this.repair(); // trimming can orphan a pair; settle to a fixed point
  }

  /** Turns remembered from earlier sessions (for the chat log on open). */
  get transcript(): { role: 'user' | 'assistant'; text: string }[] {
    const out: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const m of this.history as { role: 'user' | 'assistant'; content: unknown }[]) {
      if (typeof m.content === 'string') out.push({ role: m.role, text: m.content });
      else if (Array.isArray(m.content)) { const text = (m.content as { type: string; text?: string }[]).filter(b => b.type === 'text' && b.text).map(b => b.text!).join(' '); if (text) out.push({ role: m.role, text }); }
    }
    return out;
  }

  private persist() { try { localStorage.setItem(this.key, JSON.stringify(this.history)); } catch { /* quota */ } }

  reset() { this.history = []; this.persist(); }
  cancel() { this.abort?.abort(); }

  async say(userText: string, context: GenieRequest['context'], cb: AgentCallbacks) {
    if (this.busy) return;
    this.busy = true;
    this.abort = new AbortController();
    this.history.push({ role: 'user', content: userText });
    let toolResults: ToolResult[] | undefined;

    try {
      for (let step = 0; step < LIMITS.agentSteps; step++) {
        const req: GenieRequest = { worldId: this.worldId, context, messages: this.history, toolResults };
        toolResults = undefined;
        let stop: string = 'end_turn';
        const results: ToolResult[] = [];
        type AsstMsg = { content?: { type: string; id?: string }[] };
        let assistant: AsstMsg | null = null;
        let calls = 0;

        for await (const ev of this.backend.step(req, this.abort.signal)) {
          if (ev.type === 'text') cb.onText(ev.delta);
          else if (ev.type === 'tool_call') {
            calls++;
            const res = calls > LIMITS.toolCallsPerTurn
              ? { id: ev.call.id, ok: false, content: 'error: too many tool calls this turn — the rest were skipped; continue with fewer, bigger shapes' }
              : this.edit.execute(ev.call);
            results.push(res);
            cb.onToolCall(ev.call, res);
          } else if (ev.type === 'turn_end') {
            stop = ev.stopReason;
            assistant = ev.assistantMessage as AsstMsg;
            this.history.push(ev.assistantMessage);
          } else if (ev.type === 'error') throw new Error(ev.message);
        }
        if (!assistant) throw new Error('the genie stream ended early');
        const issued = (assistant as AsstMsg).content ?? [];

        // Every tool_use the model issued MUST get a tool_result in the next turn, even ones
        // the stream never delivered (cut off by max_tokens) — otherwise the API rejects the
        // whole conversation forever after.
        const have = new Set(results.map(r => r.id));
        for (const b of issued) {
          if (b.type === 'tool_use' && b.id && !have.has(b.id)) results.push({ id: b.id, ok: false, content: stop === 'max_tokens' ? 'error: cut off — your reply was too long. Finish in fewer, bigger tool calls.' : 'error: not executed' });
        }

        if (results.length === 0) break;
        // Anthropic format: tool results are a user message of tool_result blocks.
        this.history.push({
          role: 'user',
          content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: !r.ok })),
        });
        toolResults = results;
        // Keep working after tool calls, and after a max_tokens cut-off (the model picks up where it stopped).
        if (stop !== 'tool_use' && stop !== 'max_tokens') break;
      }
      // Keep history bounded (system prompt carries the persona; older turns matter little).
      if (this.history.length > 40) this.history = this.history.slice(-30);
      this.repair();
      this.persist();
      cb.onDone();
    } catch (e) {
      this.repair();
      this.persist();
      if ((e as Error).name !== 'AbortError') cb.onError((e as Error).message);
      else cb.onDone();
    } finally {
      this.busy = false;
    }
  }
}

/** Parses newline-delimited JSON from a fetch body. */
export async function* ndjson(res: Response, signal: AbortSignal): AsyncGenerator<GenieEvent> {
  if (!res.ok || !res.body) throw new Error(`genie backend ${res.status}: ${await res.text().catch(() => '')}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as GenieEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as GenieEvent;
}

/** Talks to the Supabase Edge Function. */
export class SupabaseGenieBackend implements GenieBackend {
  constructor(private url: string, private getToken: () => Promise<string | null>, private publishableKey: string) {}
  async *step(req: GenieRequest, signal: AbortSignal) {
    const token = await this.getToken();
    const res = await fetch(`${this.url}/functions/v1/genie`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', apikey: this.publishableKey, authorization: `Bearer ${token ?? this.publishableKey}` },
      body: JSON.stringify(req),
    });
    yield* ndjson(res, signal);
  }
}
