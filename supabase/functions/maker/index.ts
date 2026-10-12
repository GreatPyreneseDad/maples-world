// Genie Game Maker server piece (test build).
// Keeps the ElevenLabs and Anthropic keys off the browser. Every call needs the test passcode.
// Nothing is stored here: audio and words pass through to ElevenLabs / Anthropic and back.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CONTRACT_PROMPT, VERSION as ENGINE_VERSION } from './pip-engine.mjs';

const EL = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const AK = Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('maples-world-api-key') ?? Deno.env.get('MAPLES_WORLD_API_KEY') ?? '';
const PASS = Deno.env.get('MAKER_PASSCODE') ?? '';
const VOICE = Deno.env.get('PIP_VOICE') ?? 'cgSgspJ2msm6clMCkdW9';
const TALK_MODEL = Deno.env.get('MAKER_TALK_MODEL') ?? 'claude-haiku-5-5';
const BUILD_MODEL = Deno.env.get('MAKER_BUILD_MODEL') ?? 'claude-sonnet-5-5';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '', SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const NEW_CAP = Number(Deno.env.get('MAKER_NEW_GAMES_PER_DAY') ?? 40), BUILD_CAP = Number(Deno.env.get('MAKER_BUILDS_PER_DAY') ?? 400);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const db = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-maker-pass', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

const TALK_SYSTEM = `You are Pip, a kind, silly wish-unicorn. You help a young child (about 2 to 8 years old) invent their own video game by talking out loud with them. A grown-up may be sitting beside them.

What the child says reaches you through speech-to-text. It may be garbled, partial, or baby talk. Guess generously and run with your best guess. Never ask them to repeat themselves more than once.

Your whole job is to draw out the CHILD'S OWN ideas. The game must be theirs, not yours.
- Ask one open, concrete, imagination-sparking question at a time ("What does the dragon like to eat?", "What happens when you tap him?").
- Reflect their idea back with delight, then build on it.
- Do NOT offer menus of choices. Only if the child is stuck or silent, offer two silly choices.
- Never replace their idea with yours. Odd combinations are wonderful; keep them exactly.
- Small children do not like waiting. Build as soon as you know who or what the game is about and one thing that happens. That is usually after 1 or 2 answers, never more than 3 questions. Never ask about something the child already told you. Do not ask what things look like or wear. If the child or grown-up says "make it", build right away with what you have.
- Everything you say is spoken aloud: at most 2 short sentences, about 25 words, simple words, no emojis, no lists.

Keep it gentle. No blood, hurting, dying, or truly scary things. If the child asks for those, turn it silly without scolding (a monster becomes a tickle monster; shooting becomes throwing pancakes or bubbles).
Never ask for personal information (name, age, address, school). If the child says some, do not repeat it and do not put it in the game. Only talk about making the game.

Always answer by calling the tool "pip".
- action "ask": keep talking. "say" is your reply and question.
- action "build": make (or change) the game now. "say" is one excited line such as "Ooh! I am mixing the magic now!". "brief" is a complete description for the game programmer: every detail the child gave, in plain English, what the player does with their finger, what happens, the goal, what is silly about it. Fill gaps with choices that fit the child's idea. "game_name" is a fun short title. "music" describes a short instrumental background loop that fits the game (instruments, mood, tempo).
- action "play": only when a game already exists and the child wants to go back to playing without changes.
When a current game is given and the child asks for a change, use action "build" and write the brief as the full updated game description, ending with a line "CHANGE REQUESTED: ..." saying exactly what to change.`;

const PIP_TOOL = { name: 'pip', description: 'Pip speaks and decides what happens next.', input_schema: { type: 'object', properties: {
  say: { type: 'string', description: 'What Pip says aloud. At most 2 short sentences.' },
  action: { type: 'string', enum: ['ask', 'build', 'play'] },
  brief: { type: 'string', description: 'Only for build: complete game description for the programmer.' },
  game_name: { type: 'string', description: 'Only for build: short fun title.' },
  music: { type: 'string', description: 'Only for build: instrumental background loop description.' },
}, required: ['say', 'action'] } };

const BUILD_SYSTEM = `You write small touch games for very young children (2 to 8 years old). A child described the game out loud; you receive the brief. Make THEIR idea real, including the odd details. The result runs on phones, tablets and laptops inside a sandboxed canvas.

OUTPUT FORMAT (exactly these tags, nothing else outside them):
<how>One short sentence Pip says aloud telling the child what to do, e.g. "Tap the frogs to make them jump!"</how>
<icon>one emoji for the game</icon>
<use>comma-separated names of LIBRARY PARTS you reuse (only names from the library list you were given; never kit functions), or empty</use>
<part name="camelCaseName" about="one line: what it does and its arguments">function camelCaseName(...) { ... }</part>   (zero or more; see PARTS)
<code>
...JavaScript...
</code>

${CONTRACT_PROMPT}

RULES
- Touch first. The whole game must be playable with one finger: tap and/or drag. No keyboard needed. Tapping anywhere should always do something visible or audible.
- Big targets: anything tappable is at least 80 pixels across, with generous hit areas (use kit.dist with a radius of at least 50).
- The child cannot lose. No game over, no lives, no countdown pressure, no "wrong" buzzers. Misses are silly and harmless.
- Reward constantly: sounds, puffs, wiggles, growing things, a visible count made of pictures or a big number.
- A round should take a small child 30 to 90 seconds; then kit.win(), then a new round with a little more or a twist.
- Buttons cover the top 120 pixels and the bottom-right 120x120 pixel corner. Draw nothing important there. Put any counter or progress row just below, at about y = 150.
- Prefer kit.sprite, kit.item, kit.prop and kit.emoji over hand-drawn rectangles; build bigger things by combining emoji.
- Position things relative to W and H so it works both tall and wide. Clamp positions into the screen every frame.
- Movement uses dt. Keep arrays small (remove old objects). Never use unbounded loops.
- No DOM, no document or window access, no network, no storage, no timers (use kit.t and dt), no alert. No images or audio other than kit.
- Never throw. Check that things exist before using them.
- Declare your state and helper functions first, then define const game = { init() {}, update(dt) {}, draw() {} } as one object literal. Never mention game on any line above that definition, and never assign to game.something outside it.
- Plain JavaScript, no imports, about 80 to 220 lines, never more than 320. When changing an existing game, keep it compact: rewrite and simplify rather than only adding, and drop anything the change makes unnecessary. Declare your state with let/const at the top of the code.

PARTS (a growing library of reusable helpers)
If you write a helper that would be useful in other games (for example flyTo, wobble, drawRainbow, bounceOff, spawnRing), put it in a <part> instead of in <code>. A part is one self-contained function that only uses its arguments, ctx, W, H and kit. Parts are loaded before your code. You may also receive existing library parts: reuse them when they fit by listing their names in <use>; do not redefine them. Never declare a variable or function in <code> with the same name as a part, and never redeclare W, H, ctx or kit.

When you are given previous code and a change request or an error, return the complete updated game in the same format.`;

async function claude(body: Record<string, unknown>) {
  return await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = new URL(req.url), op = url.searchParams.get('op') ?? '';
  try {
    // ---- public: the Wished Games shelf (no passcode, read only) ----
    if (op === 'list') { const r = await db('wished_games?select=id,name,icon,how,created_at&hidden=eq.false&order=created_at.desc&limit=200'); return json({ games: r.ok ? await r.json() : [] }); }
    if (op === 'get') { const { id } = await req.json(); if (!UUID.test(String(id))) return json({ error: 'bad id' }, 400); const r = await db(`wished_games?select=id,name,icon,how,pre,code,music_url,engine_version&hidden=eq.false&id=eq.${id}`); const rows = r.ok ? await r.json() : []; return rows[0] ? json(rows[0]) : json({ error: 'not found' }, 404); }
  } catch (e) { return json({ error: clip((e as Error)?.message, 200) }, 500); }
  if (!PASS || req.headers.get('x-maker-pass') !== PASS) { await new Promise(r => setTimeout(r, 600)); return json({ error: 'passcode' }, 401); }
  try {
    // ---- grown-up only: publish / unpublish ----
    if (op === 'publish') { const b = await req.json(); const row = { name: clip(b.name, 60).trim() || 'A Wished Game', icon: clip(b.icon, 16) || '🎮', how: clip(b.how, 200), pre: clip(b.pre, 40000), code: clip(b.code, 60000), engine_version: clip(b.engine, 20) || ENGINE_VERSION, updated_at: new Date().toISOString() };
      if (row.code.length < 20) return json({ error: 'no code' }, 400);
      if (UUID.test(String(b.id))) { const r = await db(`wished_games?id=eq.${b.id}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }); const rows = r.ok ? await r.json() : []; if (rows[0]) return json({ id: rows[0].id }); }
      const c = await db('wished_games?select=id', { method: 'HEAD', headers: { prefer: 'count=exact' } }); if (Number((c.headers.get('content-range') ?? '').split('/')[1] ?? 0) >= 300) return json({ error: 'The shelf is full (300 games).' }, 409);
      const r = await db('wished_games', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) }); const rows = await r.json(); if (!r.ok || !rows[0]) return json({ error: `publish ${r.status}: ${clip(JSON.stringify(rows), 200)}` }, 502); return json({ id: rows[0].id }); }
    if (op === 'pubmusic') { const id = url.searchParams.get('id') ?? ''; if (!UUID.test(id)) return json({ error: 'bad id' }, 400); const buf = await req.arrayBuffer(); if (buf.byteLength < 1000 || buf.byteLength > 2_000_000) return json({ error: 'bad size' }, 413);
      const up = await fetch(`${SB_URL}/storage/v1/object/wished-music/${id}.mp3`, { method: 'POST', headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, 'content-type': 'audio/mpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: buf }); if (!up.ok) return json({ error: `music ${up.status}: ${clip(await up.text(), 200)}` }, 502);
      const music_url = `${SB_URL}/storage/v1/object/public/wished-music/${id}.mp3?v=${Date.now()}`; await db(`wished_games?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ music_url }) }); return json({ music_url }); }
    if (op === 'unpublish') { const { id } = await req.json(); if (!UUID.test(String(id))) return json({ error: 'bad id' }, 400); await db(`wished_games?id=eq.${id}`, { method: 'DELETE' }); await fetch(`${SB_URL}/storage/v1/object/wished-music/${id}.mp3`, { method: 'DELETE', headers: { authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY } }); return json({ ok: true }); }

    if (op === 'ping') return json({ ok: true, voice: !!EL, brain: !!AK, engine: ENGINE_VERSION });

    if (op === 'log') { const b = await req.json(); console.log('MAKERLOG ' + JSON.stringify({ stage: clip(b.stage, 20), error: clip(b.error, 400), ua: clip(b.ua, 160), code: clip(b.code, 6000) })); return json({ ok: true }); }

    if (op === 'models') { const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01' } }); const j = await r.json(); return json({ talk: TALK_MODEL, build: BUILD_MODEL, models: (j.data ?? []).map((m: { id: string }) => m.id), err: j.error }); }

    if (op === 'stt') {
      const buf = await req.arrayBuffer(); if (buf.byteLength < 800) return json({ text: '' }); if (buf.byteLength > 3_000_000) return json({ error: 'too long' }, 413);
      const type = (req.headers.get('content-type') ?? 'audio/webm').split(';')[0]; const ext = type.includes('mp4') ? 'mp4' : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : type.includes('ogg') ? 'ogg' : 'webm';
      const fd = new FormData(); fd.append('model_id', 'scribe_v2'); fd.append('language_code', 'en'); fd.append('tag_audio_events', 'false'); fd.append('timestamps_granularity', 'none'); fd.append('file', new Blob([buf], { type }), `say.${ext}`);
      const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': EL }, body: fd });
      if (!r.ok) return json({ error: `stt ${r.status}: ${clip(await r.text(), 200)}` }, 502);
      const j = await r.json(); return json({ text: clip(j.text, 600).trim() });
    }

    if (op === 'tts') {
      const { text } = await req.json(); const t = clip(text, 420).trim(); if (!t) return json({ error: 'empty' }, 400);
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/stream?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': EL, 'content-type': 'application/json' },
        body: JSON.stringify({ text: t, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, speed: 0.95 } }) });
      if (!r.ok) return json({ error: `tts ${r.status}: ${clip(await r.text(), 200)}` }, 502);
      return new Response(r.body, { headers: { ...CORS, 'content-type': 'audio/mpeg' } });
    }

    if (op === 'music') {
      const { prompt } = await req.json(); const p = clip(prompt, 400).trim() || 'playful bouncy children\'s game music, ukulele and glockenspiel';
      const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_64', { method: 'POST', headers: { 'xi-api-key': EL, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: `${p}. Gentle background music for a small child's video game, loopable, cheerful, not too busy, no vocals.`, music_length_ms: 30000, force_instrumental: true }) });
      if (!r.ok) return json({ error: `music ${r.status}: ${clip(await r.text(), 200)}` }, 502);
      return new Response(r.body, { headers: { ...CORS, 'content-type': 'audio/mpeg' } });
    }

    if (op === 'talk') {
      const b = await req.json(); const msgs: { role: string; content: string }[] = [];
      for (const m of (Array.isArray(b.messages) ? b.messages : []).slice(-24)) { const role = m.role === 'assistant' ? 'assistant' : 'user', content = clip(m.content, 700).trim() || '(silence)'; const last = msgs[msgs.length - 1]; if (last && last.role === role) last.content += '\n' + content; else msgs.push({ role, content }); }
      if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(The child has just arrived.)' });
      if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '(silence)' });
      let system = TALK_SYSTEM; if (b.game && b.game.brief) system += `\n\nCURRENT GAME (already built and being played): "${clip(b.game.name, 80)}"\n${clip(b.game.brief, 2500)}`;
      const r = await claude({ model: TALK_MODEL, max_tokens: 1200, system, tools: [PIP_TOOL], tool_choice: { type: 'tool', name: 'pip' }, messages: msgs });
      const j = await r.json(); if (!r.ok) return json({ error: `brain ${r.status}: ${clip(j?.error?.message, 200)}` }, 502);
      const tu = (j.content ?? []).find((c: { type: string }) => c.type === 'tool_use'); if (!tu) return json({ error: 'brain gave no answer' }, 502);
      const o = tu.input ?? {}; return json({ say: clip(o.say, 400), action: ['ask', 'build', 'play'].includes(o.action) ? o.action : 'ask', brief: clip(o.brief, 3000), game_name: clip(o.game_name, 60), music: clip(o.music, 300) });
    }

    if (op === 'build') {
      const b = await req.json(); const brief = clip(b.brief, 3000); if (!brief) return json({ error: 'no brief' }, 400);
      if (!b.error) { const cap = await db('rpc/maker_bump', { method: 'POST', body: JSON.stringify({ is_new: !b.prev_code, new_cap: NEW_CAP, build_cap: BUILD_CAP }) }); if (cap.ok && (await cap.json()) === false) return json({ error: 'cap' }, 429); }
      let user = `GAME NAME: ${clip(b.name, 60)}\n\nBRIEF FROM THE CHILD (via Pip):\n${brief}`;
      const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 30).map((p: { name: string; about: string; code: string }) => `// ${clip(p.name, 40)}: ${clip(p.about, 160)}\n${clip(p.code, 1500)}`).join('\n\n');
      if (parts) user += `\n\nLIBRARY PARTS AVAILABLE (list the ones you use in <use>):\n${clip(parts, 14000)}`;
      if (b.prev_code) user += `\n\nPREVIOUS CODE OF THIS GAME:\n<code>\n${clip(b.prev_code, 24000)}\n</code>`;
      if (b.error) user += `\n\nTHE PREVIOUS CODE FAILED WITH THIS ERROR. Fix it and return the complete game:\n${clip(b.error, 600)}`;
      const model = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].includes(b.model) ? b.model : BUILD_MODEL;
      const base = { model, max_tokens: 12000, stream: true, system: BUILD_SYSTEM, messages: [{ role: 'user', content: user }] };
      let r = await claude({ ...base, thinking: { type: model.includes('haiku') ? 'disabled' : 'between_tools' } }); let note = 'nothink';
      if (r.status === 400) { r = await claude({ ...base, thinking: { type: model.includes('haiku') ? 'between_tools' : 'disabled' } }); note = 'nothink2'; }
      if (r.status === 400) { note = 'fallback:' + clip(await r.text(), 160); r = await claude(base); }
      if (!r.ok || !r.body) return json({ error: `builder ${r.status}: ${clip(await r.text(), 200)}` }, 502);
      const dec = new TextDecoder(), enc = new TextEncoder(); let carry = '';
      const out = r.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, ctl) { carry += dec.decode(chunk, { stream: true }); const lines = carry.split('\n'); carry = lines.pop() ?? '';
          for (const l of lines) { if (!l.startsWith('data: ')) continue; try { const ev = JSON.parse(l.slice(6)); if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') ctl.enqueue(enc.encode(ev.delta.text)); else if (ev.type === 'message_delta' && b.debug) ctl.enqueue(enc.encode(`\n<meta>${note} ${JSON.stringify(ev.usage)} ${ev.delta?.stop_reason}</meta>`)); else if (ev.type === 'message_delta' && ev.delta?.stop_reason && ev.delta.stop_reason !== 'end_turn') ctl.enqueue(enc.encode(`\n<stopped>${ev.delta.stop_reason}</stopped>`)); else if (ev.type === 'error') ctl.enqueue(enc.encode(`\n<error>${clip(ev.error?.message, 200)}</error>`)); } catch (_) { /* partial line */ } } },
      }));
      return new Response(out, { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json({ error: 'unknown op' }, 400);
  } catch (e) { return json({ error: clip((e as Error)?.message, 200) }, 500); }
});
