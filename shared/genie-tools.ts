/**
 * The Genie contract. One file, two runtimes.
 *
 * Imported by the browser (src/genie/*) and by the Supabase Edge Function
 * (supabase/functions/genie). Anything the AI can do to the world is a tool
 * here; the client executes tools deterministically through WorldEdit.
 * The model never touches block data directly.
 */

export const BLOCK_NAMES = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'water', 'wood', 'leaves',
  'planks', 'glass', 'brick', 'cobble', 'snow', 'gold', 'diamond',
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'black',
  'lamp',
  'salt', 'iron', 'copper', 'coal', 'chalk',
] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export interface Vec3 { x: number; y: number; z: number }

/** Tool input shapes. Keep in lock-step with GENIE_TOOLS below. */
export interface ToolInputs {
  set_block: { pos: Vec3; block: BlockName };
  fill: { from: Vec3; to: Vec3; block: BlockName; hollow?: boolean };
  sphere: { center: Vec3; radius: number; block: BlockName; hollow?: boolean };
  cylinder: { base: Vec3; radius: number; height: number; block: BlockName; hollow?: boolean };
  line: { from: Vec3; to: Vec3; block: BlockName };
  replace: { from: Vec3; to: Vec3; find: BlockName; block: BlockName };
  clear: { from: Vec3; to: Vec3 };
  get_block: { pos: Vec3 };
  scan: { from: Vec3; to: Vec3 };
  surface_height: { x: number; z: number };
  undo: { steps?: number };
  say: { text: string };
  spawn_creature: { species: string; count?: number; near?: Vec3 };
  identify: { radius?: number };
  give_element: { symbol: string; count?: number };
}
export type ToolName = keyof ToolInputs;

export interface ToolCall<N extends ToolName = ToolName> {
  id: string;
  name: N;
  input: ToolInputs[N];
}

export interface ToolResult {
  id: string;
  ok: boolean;
  /** Short, model-facing summary (block counts, heights, errors). */
  content: string;
}

/** What the client sends the Edge Function each turn. */
export interface GenieRequest {
  worldId: string;
  /** Player position, look direction, and the block they're pointing at. */
  context: {
    player: Vec3;
    facing: Vec3;
    target: Vec3 | null;
    surfaceY: number;
    timeOfDay: number;
  };
  /** Conversation so far, in Anthropic Messages format (user/assistant turns). */
  messages: unknown[];
  /** Results for tool calls the model issued on the previous step, if any. */
  toolResults?: ToolResult[];
}

/** Streamed back as newline-delimited JSON. */
export type GenieEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'turn_end'; stopReason: 'end_turn' | 'tool_use' | 'max_tokens'; assistantMessage: unknown }
  | { type: 'error'; message: string };

const vec3 = {
  type: 'object',
  properties: { x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' } },
  required: ['x', 'y', 'z'],
} as const;
const block = { type: 'string', enum: BLOCK_NAMES as unknown as string[] } as const;

/** Anthropic tool definitions. Limits are enforced client-side too. */
export const GENIE_TOOLS = [
  { name: 'set_block', description: 'Place one block.', input_schema: { type: 'object', properties: { pos: vec3, block }, required: ['pos', 'block'] } },
  { name: 'fill', description: 'Fill an axis-aligned box (inclusive corners) with a block. hollow=true leaves the interior as air — use it for rooms and houses. Max 64x64x64.', input_schema: { type: 'object', properties: { from: vec3, to: vec3, block, hollow: { type: 'boolean' } }, required: ['from', 'to', 'block'] } },
  { name: 'sphere', description: 'Solid or hollow sphere. Max radius 32.', input_schema: { type: 'object', properties: { center: vec3, radius: { type: 'integer' }, block, hollow: { type: 'boolean' } }, required: ['center', 'radius', 'block'] } },
  { name: 'cylinder', description: 'Vertical cylinder from base upward. Max radius 32, height 64. Good for towers and tree trunks.', input_schema: { type: 'object', properties: { base: vec3, radius: { type: 'integer' }, height: { type: 'integer' }, block, hollow: { type: 'boolean' } }, required: ['base', 'radius', 'height', 'block'] } },
  { name: 'line', description: 'Straight 1-block-thick line between two points. Bridges, beams, rails.', input_schema: { type: 'object', properties: { from: vec3, to: vec3, block }, required: ['from', 'to', 'block'] } },
  { name: 'replace', description: 'Within a box, replace every `find` block with `block`. Repainting, swapping materials.', input_schema: { type: 'object', properties: { from: vec3, to: vec3, find: block, block }, required: ['from', 'to', 'find', 'block'] } },
  { name: 'clear', description: 'Set a box to air. Max 64x64x64.', input_schema: { type: 'object', properties: { from: vec3, to: vec3 }, required: ['from', 'to'] } },
  { name: 'get_block', description: 'Read the block at a position.', input_schema: { type: 'object', properties: { pos: vec3 }, required: ['pos'] } },
  { name: 'scan', description: 'Summarize a box: block counts and bounding info. Max 32x32x32. Use before building on unknown ground.', input_schema: { type: 'object', properties: { from: vec3, to: vec3 }, required: ['from', 'to'] } },
  { name: 'surface_height', description: 'Y of the highest solid block at (x,z). Build ON TOP of this: base y = surface_height + 1.', input_schema: { type: 'object', properties: { x: { type: 'integer' }, z: { type: 'integer' } }, required: ['x', 'z'] } },
  { name: 'undo', description: 'Undo the last N of your edits (default 1). Use when the player says it looks wrong.', input_schema: { type: 'object', properties: { steps: { type: 'integer' } } } },
  { name: 'spawn_creature', description: 'Bring a living thing into the world by its Latin binomial, common name, or id from the SPECIES list (macro tier only — micro life lives under the microscope). It appears near the player or at `near`. Water animals need water nearby. Max count 8.', input_schema: { type: 'object', properties: { species: { type: 'string' }, count: { type: 'integer' }, near: vec3 }, required: ['species'] } },
  { name: 'give_element', description: 'Drop atoms of a real element (by chemical symbol, e.g. "Au", "Na", "Cl") at the player\'s feet. Max 12 per call. Use when the player asks for an element or is one atom short of a recipe.', input_schema: { type: 'object', properties: { symbol: { type: 'string' }, count: { type: 'integer' } }, required: ['symbol'] } },
  { name: 'identify', description: 'List the living things near the player with their binomials and distances. Use when asked "what is that?", "what lives here?", or to teach a name.', input_schema: { type: 'object', properties: { radius: { type: 'integer' } } } },
] as const;

export const LIMITS = {
  boxVolume: 64 * 64 * 64,
  scanVolume: 32 * 32 * 32,
  radius: 32,
  height: 64,
  toolCallsPerTurn: 40,
  agentSteps: 12,
} as const;

export const GENIE_SYSTEM_PROMPT = `You are the Genie of Maple's World: a rainbow-horned unicorn who lives in a lamp and builds whatever the player imagines, block by block.

Voice: warm, playful, brief. One or two sentences of speech per turn, then act. Never lecture. The player may be a child — keep everything kind and G-rated. If asked for something unsafe or mean, gently redirect to something delightful.

How to build:
- Coordinates: x/z horizontal, y up. The player's position and the block they point at are given in context. Build near the player (within ~30 blocks) unless told otherwise, and in front of them, not on top of them.
- ALWAYS call surface_height (or scan) before placing a structure on the ground so it sits on the terrain, not floating or buried.
- Prefer fill(hollow=true) for buildings, then cut doors/windows with clear or set_block(glass). Roofs: step fill boxes inward each level.
- Trees: cylinder(wood) trunk + sphere(leaves) canopy. Rainbows: nested arcs via line segments in red, orange, yellow, green, blue, purple.
- Big requests: plan in 3–8 tool calls, not 40 single blocks. Batch several tool calls in one turn.
- After building, say what you made in one short sentence and offer one tiny follow-up idea.
- If the player says undo / that's wrong / too big, call undo.

Life: the world is alive with real species in Whittaker's five kingdoms (Animalia, Plantae, Fungi, Protista, Monera). Use their real Latin binomials when you speak of them — say the name, then the common name: "Vulpes vulpes, the red fox". You can spawn_creature any macro species from the SPECIES list below, and identify what lives nearby. Micro life (protists, bacteria, tardigrades) is seen through the microscope or by shrinking — tell the player to try those. Teach lightly: one true fact at a time, never a lecture.

Chemistry: breaking a block spills the real atoms it is made of, labelled by symbol (stone → Si, O, Al, K…; water → H, H, O and a rare Na or Cl). The player gathers atoms and combines them by real formulas in the Lab (L key) — the RECIPES list below is exactly what can be made. Speak in formulas and names together: "H₂O, water". You can give_element a few atoms when asked or when they are one short. Never invent elements or compounds outside the lists.

You cannot move the player or change game rules. If asked, say what you can do instead.`;
