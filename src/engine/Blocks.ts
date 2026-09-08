import { BLOCK_NAMES, type BlockName } from '../../shared/genie-tools';

export type BlockId = number;

export interface BlockDef {
  id: BlockId;
  name: BlockName;
  solid: boolean;        // collides with player
  opaque: boolean;       // culls neighbor faces
  /** Base RGB per face group: [top, side, bottom]. Atlas tiles are generated from these. */
  colors: [number, number, number];
  emissive?: number;     // 0..1
  noise?: number;        // texture grain amount 0..1
}

const def = (
  name: BlockName, top: number, side = top, bottom = side,
  opts: Partial<Pick<BlockDef, 'solid' | 'opaque' | 'emissive' | 'noise'>> = {},
): Omit<BlockDef, 'id'> => ({
  name, colors: [top, side, bottom], solid: true, opaque: true, noise: 0.08, ...opts,
});

const DEFS: Omit<BlockDef, 'id'>[] = [
  def('air', 0, 0, 0, { solid: false, opaque: false }),
  def('grass', 0x5fae3a, 0x8b6b3f, 0x6b4a2b, { noise: 0.12 }),
  def('dirt', 0x6b4a2b, 0x6b4a2b, 0x6b4a2b, { noise: 0.12 }),
  def('stone', 0x8a8a8a, 0x8a8a8a, 0x8a8a8a, { noise: 0.1 }),
  def('sand', 0xe4d69c),
  def('water', 0x3b7fd1, 0x3b7fd1, 0x3b7fd1, { solid: false, opaque: false, noise: 0.04 }),
  def('wood', 0x9c7a4a, 0x6e4c2a, 0x9c7a4a, { noise: 0.1 }),
  def('leaves', 0x3f8f2f, 0x3f8f2f, 0x3f8f2f, { opaque: false, noise: 0.2 }),
  def('planks', 0xc09a5e, 0xc09a5e, 0xc09a5e, { noise: 0.07 }),
  def('glass', 0xcfe9ff, 0xcfe9ff, 0xcfe9ff, { opaque: false, noise: 0.02 }),
  def('brick', 0xa8513f, 0xa8513f, 0xa8513f, { noise: 0.1 }),
  def('cobble', 0x6f6f6f, 0x6f6f6f, 0x6f6f6f, { noise: 0.18 }),
  def('snow', 0xf4f8ff, 0xf4f8ff, 0xf4f8ff, { noise: 0.03 }),
  def('gold', 0xf3c53d, 0xf3c53d, 0xf3c53d, { noise: 0.05, emissive: 0.1 }),
  def('diamond', 0x7fe7ff, 0x7fe7ff, 0x7fe7ff, { noise: 0.05, emissive: 0.15 }),
  def('red', 0xe03a3a), def('orange', 0xf08a2a), def('yellow', 0xf2d53a), def('green', 0x3ac25a),
  def('blue', 0x3a6fe0), def('purple', 0x8f4ae0), def('pink', 0xf07ac0), def('white', 0xf5f5f5), def('black', 0x202020),
  def('lamp', 0xfff1b0, 0xfff1b0, 0xfff1b0, { emissive: 0.9, noise: 0.02 }),
];

export const BLOCKS: BlockDef[] = DEFS.map((d, id) => ({ ...d, id }));
export const BLOCK_BY_NAME: Record<BlockName, BlockDef> = Object.fromEntries(BLOCKS.map(b => [b.name, b])) as never;
export const AIR: BlockId = 0;

if (BLOCKS.length !== BLOCK_NAMES.length || BLOCKS.some((b, i) => b.name !== BLOCK_NAMES[i])) {
  throw new Error('Blocks.ts and shared/genie-tools.ts BLOCK_NAMES are out of sync');
}

export const blockId = (name: BlockName): BlockId => BLOCK_BY_NAME[name].id;
export const isSolid = (id: BlockId) => BLOCKS[id]?.solid ?? false;
export const isOpaque = (id: BlockId) => BLOCKS[id]?.opaque ?? false;
