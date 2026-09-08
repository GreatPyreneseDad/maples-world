// Maple's World — Genie Edge Function.
// Holds the Anthropic key, verifies the caller owns the world, rate-limits, and streams one
// model step back as NDJSON GenieEvents. The client executes tools and calls again with results.
//
// Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   [GENIE_MODEL=claude-sonnet-4-5]
// Deploy:   npm run deploy:genie   (copies shared/genie-tools.ts alongside first)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GENIE_TOOLS, GENIE_SYSTEM_PROMPT, LIMITS, type GenieEvent, type GenieRequest } from './genie-tools.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('GENIE_MODEL') ?? 'claude-sonnet-4-5';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  // --- auth: user-scoped client honors RLS, so a world lookup doubles as an ownership check.
  const auth = req.headers.get('authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  let body: GenieRequest;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body?.worldId || !Array.isArray(body.messages)) return json({ error: 'worldId and messages required' }, 400);

  const { data: world } = await userClient.from('worlds').select('id').eq('id', body.worldId).maybeSingle();
  if (!world) return json({ error: 'world not found or not yours' }, 403);

  // --- rate limit (service role; function is not callable by clients)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: allowed } = await admin.rpc('genie_take_token', { p_user: user.id, p_limit: 20 });
  if (allowed === false) return json({ error: 'The genie needs a breather — try again in a minute.' }, 429);

  // --- bound the conversation we forward (client also trims; never trust it)
  const messages = sanitizeMessages(body.messages).slice(-30);
  if (messages.length === 0 || (messages[messages.length - 1] as { role: string }).role !== 'user') return json({ error: 'last message must be from user' }, 400);

  const system = `${GENIE_SYSTEM_PROMPT}

Current context (JSON): ${JSON.stringify(body.context ?? {})}
Interpret positions relative to this. If "target" is non-null, the player is pointing at that block — treat it as the anchor for "here"/"there".`;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, stream: true, system, tools: GENIE_TOOLS, messages }),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => '');
    return json({ error: `model error ${upstream.status}: ${t.slice(0, 300)}` }, 502);
  }

  // --- translate Anthropic SSE → NDJSON GenieEvents, assembling tool_use inputs.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: GenieEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'));
      const blocks: Record<number, { type: string; id?: string; name?: string; text?: string; json?: string }> = {};
      let stopReason: string = 'end_turn';
      let toolCalls = 0;
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const logRow = (content: unknown) => admin.from('genie_log').insert({ world_id: body.worldId, user_id: user.id, role: 'assistant', content }).then(() => {}, () => {});
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
            const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
            if (!dataLine) continue;
            const ev = JSON.parse(dataLine.slice(5).trim());
            switch (ev.type) {
              case 'content_block_start':
                blocks[ev.index] = ev.content_block.type === 'tool_use'
                  ? { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, json: '' }
                  : { type: 'text', text: '' };
                break;
              case 'content_block_delta': {
                const b = blocks[ev.index];
                if (!b) break;
                if (ev.delta.type === 'text_delta') { b.text = (b.text ?? '') + ev.delta.text; emit({ type: 'text', delta: ev.delta.text }); }
                else if (ev.delta.type === 'input_json_delta') b.json = (b.json ?? '') + ev.delta.partial_json;
                break;
              }
              case 'content_block_stop': {
                const b = blocks[ev.index];
                if (b?.type === 'tool_use') {
                  let input: unknown = {};
                  try { input = b.json ? JSON.parse(b.json) : {}; } catch { input = {}; }
                  (b as { input?: unknown }).input = input;
                  if (++toolCalls <= LIMITS.toolCallsPerTurn) emit({ type: 'tool_call', call: { id: b.id!, name: b.name as never, input: input as never } });
                }
                break;
              }
              case 'message_delta':
                if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
                break;
              case 'error':
                emit({ type: 'error', message: ev.error?.message ?? 'model error' });
                break;
            }
          }
        }
        const content = Object.keys(blocks).map(Number).sort((a, b) => a - b).map(i => {
          const b = blocks[i] as { type: string; id?: string; name?: string; text?: string; input?: unknown };
          return b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} } : { type: 'text', text: b.text ?? '' };
        });
        const assistantMessage = { role: 'assistant', content };
        await logRow(assistantMessage);
        emit({ type: 'turn_end', stopReason: stopReason as never, assistantMessage });
      } catch (e) {
        emit({ type: 'error', message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...CORS, 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

/** Keep only well-formed user/assistant turns; cap string sizes. The client is untrusted. */
function sanitizeMessages(msgs: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const m of msgs) {
    if (!m || typeof m !== 'object') continue;
    const { role, content } = m as { role?: string; content?: unknown };
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content === 'string') { out.push({ role, content: content.slice(0, 2000) }); continue; }
    if (Array.isArray(content) && content.length <= 64) out.push({ role, content });
  }
  return out;
}
