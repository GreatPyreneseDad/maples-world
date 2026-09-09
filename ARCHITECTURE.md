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
src/life/
  ../shared/taxonomy.ts      THE LIVING REGISTRY: ~40 real species, real binomials, Whittaker's five kingdoms.
  Bodies.ts                  Procedural rigs per body plan (quadruped, ciliate, volvox, rod…) with animatable parts.
  LifeSystem.ts              Macro life: deterministic per-column spawning by habitat, kingdom dynamics
                             (walk/hop/fly/swim/crawl/burrow; plants grow + spread in light; fungi in shade/wood).
  MicroWorld.ts              The small world: a separate scene per substrate (pond/soil/leaf/moss/bark) with
                             cilia, flagella, pseudopods, run-and-tumble, division, filaments. Microscope or shrink.
src/chem/
  ../shared/chemistry.ts     THE PERIODIC TABLE: 118 elements; what every block is made of; real-formula recipes.
  ElementDrops.ts            Atoms as labelled sprites: pop, bounce, settle, magnet to the player.
  Inventory.ts               Atoms held + compounds made, persisted per world.
src/guild/Guild.ts           Quest generation, markers, completion by world observation, rank + friends (persisted).
src/ui/                      Hotbar (lamp, goggles, microscope, shrink, flask, seeds, blocks), ChatPanel, FieldGuide, LabPanel,
                             GuildPanel (G) + quest tracker, SeedPouch (K).
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

## Life

Five kingdoms, real names, honest dynamics. `shared/taxonomy.ts` is the only place species are defined; the browser spawns/renders from it, the genie's `spawn_creature` and `identify` tools validate against it, and the Edge Function pastes it into the system prompt so the model knows exactly what exists. Macro life is seeded per chunk column from the world seed (same world, same fox on the same hill); micro life is seeded from the block you looked at. Sizes are true (meters / micrometers); the micro scene compresses them logarithmically so a 2 µm *E. coli* and a 1.5 mm *Stentor* share one dish. The Field Journal is the pedagogy: aim → binomial appears → hold → discovered → fact. Discoveries persist locally and in `discoveries`.

## The Animal Protector Guild

The storyline is not scripted against coordinates; it is generated from the living world. `shared/guild.ts` holds the quest vocabulary (feed, shelter, free, habitat), rank ladder, and `habitatNeed()` — what "a home" means per species, expressed as countable blocks or plants. `src/guild/Guild.ts` offers quests near the player (preferring animals already there), spawns what it must (a caged fox, a sheep in the weather), and completes them by observing the world: `LifeSystem` fires `ate` when an animal grazes a mature favourite plant and `sheltered` when a domestic animal stands under a roof with three walls; a rockfall is a recorded set of cobble cells and the animal is free when a side opens at its level; a pond is nine water blocks within the marker's radius. Diets are real and live on the species (`diet`), so the same table drives the seed pouch's "eaten by" hints, the Guild's briefs, the genie's prompt, and the animals' foraging.

## Chemistry

Break a block and 2–3 of its real constituent atoms spill out, each wearing its symbol and atomic number (stone → Si, O, Al, K, Na, Ca, Fe, Mg; sea water → H, H, O and the odd Na or Cl; the green pigment block → malachite's Cu, C, O, H). Walk over them to pocket them. The Lab (L, or the flask) is a periodic table that fills in as you find elements, beside sixteen recipes with real formulas — H₂O, NaCl, SiO₂, Fe₂O₃, CaCO₃, C₆H₁₀O₅ — each of which yields a block placed where you aim. Compositions are declared simplifications (granite for "stone"), never fictions. Five blocks exist only through chemistry: salt, iron, copper, coal, chalk.

## Coordinates

x/z horizontal, y up, world height 128 (8 chunks). Chunk `(cx,cy,cz)` covers `[cx*16, cx*16+16)`. Block at `(x,y,z)` lives in chunk `(x>>4, y>>4, z>>4)` at local `(x&15, y&15, z&15)`. Sea level 38.

## Security posture

- Anthropic key lives only in Edge Function secrets.
- `verify_jwt` on the function; ownership checked via RLS (user-scoped client), not trusted input.
- Rate limit per user per minute via `security definer` RPC callable only by service role.
- Client message history is sanitized and capped server-side; tool inputs are validated in `WorldEdit` (unknown blocks rejected, boxes clamped, volumes bounded).
- Anonymous auth → no PII collected. Anonymous users can be upgraded to email later without losing worlds.

## Not yet (deliberate)

Multiplayer, crafting, survival, predator/prey ecosystem, taming, lighting/AO, sound, mobile controls, genie long-term memory (table exists, unused by prompt), world sharing (read-only links). Each is additive to the above without restructuring.
