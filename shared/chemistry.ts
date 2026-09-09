/**
 * The chemistry contract. Real elements, real compositions, real formulas.
 *
 * Break a block and the atoms it is made of fall out, each labelled with its chemical symbol.
 * Gather atoms and combine them by real formulas to make new things. Shared by the browser
 * (drops, lab, journal) and the genie (give_element, list of recipes in the system prompt).
 *
 * Simplifications are declared, never hidden: a "stone" block yields the major elements of
 * granite; "water" yields H, H, O with a rare Na or Cl (sea salt). Pigment blocks yield the
 * elements of the real mineral pigment of that colour.
 */

import type { BlockName } from './genie-tools.ts';

export type Category =
  | 'alkali metal' | 'alkaline earth metal' | 'transition metal' | 'post-transition metal'
  | 'metalloid' | 'reactive nonmetal' | 'noble gas' | 'lanthanide' | 'actinide' | 'unknown';

export interface Element { z: number; symbol: string; name: string; category: Category; fact?: string }

const C = {
  a: 'alkali metal', ae: 'alkaline earth metal', t: 'transition metal', p: 'post-transition metal',
  m: 'metalloid', n: 'reactive nonmetal', g: 'noble gas', l: 'lanthanide', ac: 'actinide', u: 'unknown',
} as const satisfies Record<string, Category>;

// z, symbol, name, category
const RAW: [number, string, string, Category][] = [
  [1, 'H', 'hydrogen', C.n], [2, 'He', 'helium', C.g], [3, 'Li', 'lithium', C.a], [4, 'Be', 'beryllium', C.ae], [5, 'B', 'boron', C.m],
  [6, 'C', 'carbon', C.n], [7, 'N', 'nitrogen', C.n], [8, 'O', 'oxygen', C.n], [9, 'F', 'fluorine', C.n], [10, 'Ne', 'neon', C.g],
  [11, 'Na', 'sodium', C.a], [12, 'Mg', 'magnesium', C.ae], [13, 'Al', 'aluminium', C.p], [14, 'Si', 'silicon', C.m], [15, 'P', 'phosphorus', C.n],
  [16, 'S', 'sulfur', C.n], [17, 'Cl', 'chlorine', C.n], [18, 'Ar', 'argon', C.g], [19, 'K', 'potassium', C.a], [20, 'Ca', 'calcium', C.ae],
  [21, 'Sc', 'scandium', C.t], [22, 'Ti', 'titanium', C.t], [23, 'V', 'vanadium', C.t], [24, 'Cr', 'chromium', C.t], [25, 'Mn', 'manganese', C.t],
  [26, 'Fe', 'iron', C.t], [27, 'Co', 'cobalt', C.t], [28, 'Ni', 'nickel', C.t], [29, 'Cu', 'copper', C.t], [30, 'Zn', 'zinc', C.t],
  [31, 'Ga', 'gallium', C.p], [32, 'Ge', 'germanium', C.m], [33, 'As', 'arsenic', C.m], [34, 'Se', 'selenium', C.n], [35, 'Br', 'bromine', C.n],
  [36, 'Kr', 'krypton', C.g], [37, 'Rb', 'rubidium', C.a], [38, 'Sr', 'strontium', C.ae], [39, 'Y', 'yttrium', C.t], [40, 'Zr', 'zirconium', C.t],
  [41, 'Nb', 'niobium', C.t], [42, 'Mo', 'molybdenum', C.t], [43, 'Tc', 'technetium', C.t], [44, 'Ru', 'ruthenium', C.t], [45, 'Rh', 'rhodium', C.t],
  [46, 'Pd', 'palladium', C.t], [47, 'Ag', 'silver', C.t], [48, 'Cd', 'cadmium', C.t], [49, 'In', 'indium', C.p], [50, 'Sn', 'tin', C.p],
  [51, 'Sb', 'antimony', C.m], [52, 'Te', 'tellurium', C.m], [53, 'I', 'iodine', C.n], [54, 'Xe', 'xenon', C.g], [55, 'Cs', 'caesium', C.a],
  [56, 'Ba', 'barium', C.ae], [57, 'La', 'lanthanum', C.l], [58, 'Ce', 'cerium', C.l], [59, 'Pr', 'praseodymium', C.l], [60, 'Nd', 'neodymium', C.l],
  [61, 'Pm', 'promethium', C.l], [62, 'Sm', 'samarium', C.l], [63, 'Eu', 'europium', C.l], [64, 'Gd', 'gadolinium', C.l], [65, 'Tb', 'terbium', C.l],
  [66, 'Dy', 'dysprosium', C.l], [67, 'Ho', 'holmium', C.l], [68, 'Er', 'erbium', C.l], [69, 'Tm', 'thulium', C.l], [70, 'Yb', 'ytterbium', C.l],
  [71, 'Lu', 'lutetium', C.l], [72, 'Hf', 'hafnium', C.t], [73, 'Ta', 'tantalum', C.t], [74, 'W', 'tungsten', C.t], [75, 'Re', 'rhenium', C.t],
  [76, 'Os', 'osmium', C.t], [77, 'Ir', 'iridium', C.t], [78, 'Pt', 'platinum', C.t], [79, 'Au', 'gold', C.t], [80, 'Hg', 'mercury', C.t],
  [81, 'Tl', 'thallium', C.p], [82, 'Pb', 'lead', C.p], [83, 'Bi', 'bismuth', C.p], [84, 'Po', 'polonium', C.p], [85, 'At', 'astatine', C.m],
  [86, 'Rn', 'radon', C.g], [87, 'Fr', 'francium', C.a], [88, 'Ra', 'radium', C.ae], [89, 'Ac', 'actinium', C.ac], [90, 'Th', 'thorium', C.ac],
  [91, 'Pa', 'protactinium', C.ac], [92, 'U', 'uranium', C.ac], [93, 'Np', 'neptunium', C.ac], [94, 'Pu', 'plutonium', C.ac], [95, 'Am', 'americium', C.ac],
  [96, 'Cm', 'curium', C.ac], [97, 'Bk', 'berkelium', C.ac], [98, 'Cf', 'californium', C.ac], [99, 'Es', 'einsteinium', C.ac], [100, 'Fm', 'fermium', C.ac],
  [101, 'Md', 'mendelevium', C.ac], [102, 'No', 'nobelium', C.ac], [103, 'Lr', 'lawrencium', C.ac], [104, 'Rf', 'rutherfordium', C.t], [105, 'Db', 'dubnium', C.t],
  [106, 'Sg', 'seaborgium', C.t], [107, 'Bh', 'bohrium', C.t], [108, 'Hs', 'hassium', C.t], [109, 'Mt', 'meitnerium', C.u], [110, 'Ds', 'darmstadtium', C.u],
  [111, 'Rg', 'roentgenium', C.u], [112, 'Cn', 'copernicium', C.t], [113, 'Nh', 'nihonium', C.u], [114, 'Fl', 'flerovium', C.u], [115, 'Mc', 'moscovium', C.u],
  [116, 'Lv', 'livermorium', C.u], [117, 'Ts', 'tennessine', C.u], [118, 'Og', 'oganesson', C.u],
];

const FACTS: Record<string, string> = {
  H: 'The lightest atom. Two of them plus one oxygen make every drop of water.',
  He: 'Named after the Sun (helios) — it was found there before it was found on Earth.',
  C: 'Diamond and pencil lead are both pure carbon — only the arrangement differs.',
  N: 'Almost four-fifths of the air you breathe is nitrogen.',
  O: 'Made by plants, cyanobacteria and algae. Rust, water and sand all contain it.',
  Na: 'Soft, silvery, and fizzes in water. With chlorine it becomes table salt.',
  Mg: 'Sits at the heart of chlorophyll — the green in every leaf.',
  Al: 'The most common metal in Earth’s crust, hiding inside clay and rock.',
  Si: 'Sand is mostly silicon and oxygen. So are computer chips.',
  P: 'Glows faintly in the dark; its name means “light-bearer”.',
  S: 'Bright yellow crystals; the smell of a struck match.',
  Cl: 'A green gas alone; a white crystal when it holds hands with sodium.',
  K: 'Bananas are full of it. In water it burns with a lilac flame.',
  Ca: 'Bones, shells, chalk and marble are built on calcium.',
  Ti: 'The white in white paint is titanium dioxide.',
  Mn: 'Manganese oxides paint amethyst and old cave paintings purple and black.',
  Fe: 'The core of the Earth is mostly iron. Rust is iron holding oxygen.',
  Co: 'Cobalt glass has been deep blue for three thousand years.',
  Cu: 'Copper turns green as it weathers — the Statue of Liberty is copper.',
  Au: 'Gold never rusts. Every atom of it was forged in colliding stars.',
  Ar: 'A lazy gas: it fills light bulbs so the hot wire cannot burn.',
  W: 'Tungsten melts at the highest temperature of any metal — hence light-bulb filaments.',
};

export const ELEMENTS: Element[] = RAW.map(([z, symbol, name, category]) => ({ z, symbol, name, category, fact: FACTS[symbol] }));
export const ELEMENT_BY_SYMBOL: Record<string, Element> = Object.fromEntries(ELEMENTS.map(e => [e.symbol, e]));

/** CPK-inspired display colours by symbol (fallbacks by category). */
export const ELEMENT_COLORS: Record<string, number> = {
  H: 0xffffff, C: 0x333333, N: 0x3050f8, O: 0xff2020, Na: 0xab5cf2, Mg: 0x8aff00, Al: 0xbfa6a6, Si: 0xf0c8a0, P: 0xff8000, S: 0xffff30,
  Cl: 0x1ff01f, K: 0x8f40d4, Ca: 0x3dff00, Ti: 0xbfc2c7, Mn: 0x9c7ac7, Fe: 0xe06633, Co: 0xf090a0, Cu: 0xc88033, Au: 0xffd123, Ar: 0x80d1e3, W: 0x2194d6,
};
export const CATEGORY_COLORS: Record<Category, number> = {
  'alkali metal': 0xff6b6b, 'alkaline earth metal': 0xffb86b, 'transition metal': 0xffd86b, 'post-transition metal': 0xb8e986,
  'metalloid': 0x6bdcff, 'reactive nonmetal': 0x7bffb2, 'noble gas': 0xc8a2ff, 'lanthanide': 0xff9ff3, 'actinide': 0xff7eb6, 'unknown': 0xaaaaaa,
};
export const elementColor = (sym: string) => ELEMENT_COLORS[sym] ?? CATEGORY_COLORS[ELEMENT_BY_SYMBOL[sym]?.category ?? 'unknown'];

/**
 * What falls out when a block breaks: weighted atoms. Weights ≈ how often that atom is drawn.
 * Each break yields 2–3 atoms. Rare extras (weight < 0.15) are the fun of it.
 */
export const BLOCK_COMPOSITION: Partial<Record<BlockName, Record<string, number>>> = {
  stone: { O: 3, Si: 2.5, Al: 0.8, K: 0.4, Na: 0.4, Ca: 0.3, Fe: 0.3, Mg: 0.2 },        // granite
  cobble: { O: 3, Si: 2.5, Al: 0.8, Fe: 0.5, Mg: 0.3, Ca: 0.3 },
  dirt: { O: 3, Si: 2, Al: 0.8, Fe: 0.5, C: 0.8, H: 0.6, N: 0.3, K: 0.2, P: 0.1 },   // soil
  grass: { C: 2, H: 2, O: 2, N: 0.5, Mg: 0.15, K: 0.1 },                              // plant matter (chlorophyll → Mg)
  sand: { Si: 2, O: 3, Ca: 0.15 },                                                    // quartz + shell
  water: { H: 2, O: 1, Na: 0.12, Cl: 0.12 },                                          // sea water
  snow: { H: 2, O: 1 },
  wood: { C: 2, H: 2, O: 1.5, N: 0.1 },                                               // cellulose / lignin
  planks: { C: 2, H: 2, O: 1.5 },
  leaves: { C: 2, H: 2, O: 2, N: 0.4, Mg: 0.2 },
  glass: { Si: 2, O: 3, Na: 0.6, Ca: 0.4 },                                           // soda-lime glass
  brick: { O: 3, Si: 2, Al: 1, Fe: 0.6 },                                             // fired clay
  gold: { Au: 1 },
  diamond: { C: 1 },
  red: { Fe: 2, O: 3 },                                                                // hematite
  orange: { Fe: 2, O: 3, H: 1 },                                                      // ochre (goethite)
  yellow: { Fe: 1, O: 2, H: 1 },                                                      // yellow ochre
  green: { Cu: 2, C: 1, O: 3, H: 1 },                                                 // malachite
  blue: { Na: 1, Al: 1, Si: 1, O: 2, S: 0.5 },                                        // lazurite (lapis)
  purple: { Mn: 1, O: 2, Si: 0.5 },                                                   // manganese violet / amethyst
  pink: { Co: 1, Al: 1, O: 2 },                                                       // cobalt pink (Thénard-type)
  white: { Ti: 1, O: 2 },                                                             // titanium white
  black: { C: 1 },                                                                    // carbon black
  lamp: { W: 0.4, Ar: 0.4, Si: 1, O: 1.5 },                                           // filament, fill gas, glass
  salt: { Na: 1, Cl: 1 },
  iron: { Fe: 1 },
  copper: { Cu: 1 },
  coal: { C: 3, H: 0.3, S: 0.1 },
  chalk: { Ca: 1, C: 1, O: 3 },
};

export interface Recipe {
  id: string;
  /** Real chemical formula (display). */
  formula: string;
  name: string;
  /** Atoms consumed. */
  needs: Record<string, number>;
  /** Block produced. */
  yields: BlockName;
  fact: string;
}

export const RECIPES: Recipe[] = [
  { id: 'water', formula: 'H₂O', name: 'water', needs: { H: 2, O: 1 }, yields: 'water', fact: 'Two hydrogens hold one oxygen at a 104.5° angle — that bend is why water is so strange and so good at dissolving things.' },
  { id: 'ice', formula: 'H₂O (s)', name: 'snow', needs: { H: 4, O: 2 }, yields: 'snow', fact: 'Frozen water takes up more room than liquid water — that is why ice floats.' },
  { id: 'quartz', formula: 'SiO₂', name: 'sand (quartz)', needs: { Si: 1, O: 2 }, yields: 'sand', fact: 'Silicon dioxide. Most beaches are tiny broken pieces of this crystal.' },
  { id: 'glass', formula: 'SiO₂ · Na₂O · CaO', name: 'glass', needs: { Si: 2, O: 4, Na: 1, Ca: 1 }, yields: 'glass', fact: 'Sand melted with soda and lime. Lightning striking a beach makes glass tubes called fulgurites.' },
  { id: 'salt', formula: 'NaCl', name: 'salt', needs: { Na: 1, Cl: 1 }, yields: 'salt', fact: 'A metal that explodes in water plus a poison gas make the salt on your chips. Chemistry is like that.' },
  { id: 'rust', formula: 'Fe₂O₃', name: 'rust (hematite)', needs: { Fe: 2, O: 3 }, yields: 'red', fact: 'Iron slowly grabbing oxygen. Mars is red for the same reason.' },
  { id: 'iron', formula: 'Fe', name: 'iron', needs: { Fe: 4 }, yields: 'iron', fact: 'Pure iron is soft; a pinch of carbon turns it into steel.' },
  { id: 'copper', formula: 'Cu', name: 'copper', needs: { Cu: 4 }, yields: 'copper', fact: 'The first metal people ever worked, ten thousand years ago.' },
  { id: 'malachite', formula: 'Cu₂CO₃(OH)₂', name: 'malachite (green)', needs: { Cu: 2, C: 1, O: 5, H: 2 }, yields: 'green', fact: 'Copper weathering into a green stone. Ancient Egyptians ground it for eye paint.' },
  { id: 'coal', formula: 'C', name: 'coal', needs: { C: 4 }, yields: 'coal', fact: 'Ancient forests, buried and squeezed for three hundred million years.' },
  { id: 'diamond', formula: 'C', name: 'diamond', needs: { C: 8 }, yields: 'diamond', fact: 'Same atoms as coal, arranged in a perfect lattice under enormous pressure.' },
  { id: 'chalk', formula: 'CaCO₃', name: 'chalk (calcite)', needs: { Ca: 1, C: 1, O: 3 }, yields: 'chalk', fact: 'Made of trillions of shells of tiny sea creatures. Marble is the same stuff, squeezed.' },
  { id: 'gold', formula: 'Au', name: 'gold', needs: { Au: 4 }, yields: 'gold', fact: 'So unreactive it can lie in a river for a million years and still shine.' },
  { id: 'titania', formula: 'TiO₂', name: 'titanium white', needs: { Ti: 1, O: 2 }, yields: 'white', fact: 'The whitest white we know: in paint, paper, and sunscreen.' },
  { id: 'cellulose', formula: 'C₆H₁₀O₅', name: 'planks (cellulose)', needs: { C: 6, H: 10, O: 5 }, yields: 'planks', fact: 'Plants build wood from sugar chains — carbon they pulled from the air.' },
  { id: 'clay', formula: 'Al₂Si₂O₅(OH)₄', name: 'brick (fired clay)', needs: { Al: 2, Si: 2, O: 9, H: 4 }, yields: 'brick', fact: 'Clay is rock that rain wore down to flakes; fire locks it hard again.' },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map(r => [r.id, r]));

/** Draw n atoms from a composition using the supplied random source. */
export function drawAtoms(block: BlockName, n: number, rand: () => number = Math.random): string[] {
  const comp = BLOCK_COMPOSITION[block];
  if (!comp) return [];
  const entries = Object.entries(comp);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let r = rand() * total;
    for (const [sym, w] of entries) { r -= w; if (r <= 0) { out.push(sym); break; } }
    if (out.length < i + 1) out.push(entries[0][0]);
  }
  return out;
}

export function canCraft(inv: Record<string, number>, r: Recipe) {
  return Object.entries(r.needs).every(([s, n]) => (inv[s] ?? 0) >= n);
}
