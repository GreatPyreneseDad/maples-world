# Maple's World — Architecture

A browser voxel sandbox. The player carries a lamp; rubbing it summons a rainbow-horned unicorn genie — an AI agent that edits the world through a bounded, undoable command layer.

## Principles

1. **One authority for blocks.** `World.setBlock` is the only mutation path. Player, genie, and persistence all go through it. Listeners hang off it (save-dirty tracking).
2. **The model never touches block data.** Claude proposes *tool calls*; `WorldEdit` validates and executes them. Limits (volume, radius, calls per turn, steps per wish) are enforced client-side *and* server-side. Undo is free because every op records its diff.
3. **Terrain is a pure function of the seed.** Only modified chunks are persisted (deflate+base64 of the 4 KB block array). A world is `{seed, modified chunks}` — tiny, portable, regenerable.
4. **Offline-first.** IndexedDB is always written; Supabase when signed in. The `OfflineGenie` keeps the game playable with no backend at all.
5. **Zero assets.** Block textures are shader grain over vertex colors; the unicorn is primitives. Nothing to load, nothing to host but code.

## Layout

```
shared/genie-tools.ts        The contract: block names, tool schemas, limits, system prompt.
                             Imported by BOTH the browser and the Edge Function (copied at deploy).
src/engine/                  Voxel core
  Blocks.ts                  Block registry (id ↔ name, solid/opaque, colors). Asserts sync with shared list.
  Chunk.ts                   16³ Uint8Array, dirty/modified flags, nonAir count.
  World.ts                   Chunk map, lazy column generation, setBlock w/ neighbor-dirty, surfaceHeight, unload.
  Terrain.ts / Noise.ts      Seeded simplex fBm heightmap, beaches, snow, trees.
  Mesher.ts                  Greedy meshing (Lysenko), cross-chunk culling, opaque + transparent passes.
  ChunkRenderer.ts           Dirty-chunk remesh queue with per-frame budget; Lambert + grain shader.
src/player/                  Input (pointer lock), Player (swept AABB, fly toggle), Raycast (Amanatides–Woo).
src/genie/
  WorldEdit.ts               Tool executor: fill/sphere/cylinder/line/replace/clear/scan/… + undo stack.
  GenieAgent.ts              Client agentic loop. Streams NDJSON; executes tools as they arrive.
  OfflineGenie.ts            Rule-based fallback backend.
  GenieEntity.ts             The unicorn (primitives, rainbow horn, sparkles, thinking pulse).
src/ui/                      Hotbar (lamp in slot 1), ChatPanel.
src/persist/                 codec (deflate/base64), WorldStore (IndexedDB + Supabase), WorldSync (debounced writer).
supabase/migrations/         Schema + RLS + rate-limit RPC.
supabase/functions/genie/    Edge Function: auth → ownership → rate limit → Claude (streaming) → NDJSON.
tests/                       Playwright smoke: boot, genie build+undo, persistence round-trip.
```

## Data flow: a wish

```
player types "build a pink castle"
  → ChatPanel.onSubmit → Game.wish() gathers context {player, facing, target, surfaceY}
  → GenieAgent.say(): POST /functions/v1/genie {worldId, context, messages}
      Edge Function: getUser (JWT) → worlds RLS lookup (ownership) → genie_take_token (20/min)
                     → Anthropic Messages API (stream, tools=GENIE_TOOLS)
                     → SSE translated to NDJSON: text | tool_call | turn_end
  → for each tool_call: WorldEdit.execute() → World.setBlock() ×N → chunks dirty → remesh (budget 24/frame)
  → if stop_reason == tool_use: results appended as tool_result blocks, loop (max 12 steps)
  → WorldSync notices dirty chunks → 1.5 s debounce → IndexedDB + world_chunks upsert
```

## Coordinates

x/z horizontal, y up, world height 128 (8 chunks). Chunk `(cx,cy,cz)` covers `[cx*16, cx*16+16)`. Block at `(x,y,z)` lives in chunk `(x>>4, y>>4, z>>4)` at local `(x&15, y&15, z&15)`. Sea level 38.

## Security posture

- Anthropic key lives only in Edge Function secrets.
- `verify_jwt` on the function; ownership checked via RLS (user-scoped client), not trusted input.
- Rate limit per user per minute via `security definer` RPC callable only by service role.
- Client message history is sanitized and capped server-side; tool inputs are validated in `WorldEdit` (unknown blocks rejected, boxes clamped, volumes bounded).
- Anonymous auth → no PII collected. Anonymous users can be upgraded to email later without losing worlds.

## Not yet (deliberate)

Multiplayer, mobs, crafting, survival, lighting/AO, sound, mobile controls, genie long-term memory (table exists, unused by prompt), world sharing (read-only links). Each is additive to the above without restructuring.
