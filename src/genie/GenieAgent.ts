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

  constructor(private backend: GenieBackend, private edit: WorldEdit, private worldId: string) {}

  reset() { this.history = []; }
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
        let calls = 0;

        for await (const ev of this.backend.step(req, this.abort.signal)) {
          if (ev.type === 'text') cb.onText(ev.delta);
          else if (ev.type === 'tool_call') {
            calls++;
            const res = calls > LIMITS.toolCallsPerTurn
              ? { id: ev.call.id, ok: false, content: 'error: too many tool calls this turn' }
              : this.edit.execute(ev.call);
            results.push(res);
            cb.onToolCall(ev.call, res);
          } else if (ev.type === 'turn_end') {
            stop = ev.stopReason;
            this.history.push(ev.assistantMessage);
          } else if (ev.type === 'error') throw new Error(ev.message);
        }

        if (stop !== 'tool_use' || results.length === 0) break;
        // Anthropic format: tool results are a user message of tool_result blocks.
        this.history.push({
          role: 'user',
          content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: !r.ok })),
        });
        toolResults = results;
      }
      // Keep history bounded (system prompt carries the persona; older turns matter little).
      if (this.history.length > 40) this.history = this.history.slice(-30);
      cb.onDone();
    } catch (e) {
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
