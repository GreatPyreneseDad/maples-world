/**
 * The living registry. Every organism in Maple's World is a real species with its real
 * binomial name, placed in Whittaker's five kingdoms. Shared by the browser (spawning,
 * rendering, field guide) and the genie (spawn_creature / identify tools).
 *
 * Accuracy rule: no invented species. Where taxonomy is contested (e.g. green algae,
 * which some place in Plantae), we follow the classic five-kingdom textbook placement
 * and say so in `note`.
 */

export type Kingdom = 'Animalia' | 'Plantae' | 'Fungi' | 'Protista' | 'Monera';
export const KINGDOMS: Kingdom[] = ['Animalia', 'Plantae', 'Fungi', 'Protista', 'Monera'];

/** Where an organism can appear. Macro habitats are surface biomes; micro habitats are substrates. */
export type Habitat =
  | 'grass' | 'forest' | 'sand' | 'water' | 'shore' | 'snow' | 'shade' | 'wood'   // macro
  | 'pond' | 'soil' | 'leaf' | 'moss' | 'bark';                                   // micro substrates

export type Tier = 'macro' | 'micro';

/** Movement dynamic — the kingdom's signature, encoded per species. */
export type Locomotion =
  | 'walk' | 'hop' | 'fly' | 'swim' | 'crawl' | 'burrow'          // Animalia (macro)
  | 'cilia' | 'flagellum' | 'pseudopod' | 'tumble' | 'drift'       // Protista / micro animals
  | 'run-tumble' | 'divide' | 'filament'                            // Monera
  | 'sessile' | 'spread';                                           // Plantae / Fungi

export type BodyPlan =
  | 'quadruped' | 'rabbit' | 'bird' | 'duck' | 'fish' | 'frog' | 'lizard'
  | 'insect' | 'beetle' | 'ant' | 'spider' | 'snail' | 'worm'
  | 'moss' | 'fern' | 'flower' | 'clover' | 'sapling' | 'bush' | 'duckweed' | 'sheep' | 'chicken'
  | 'mushroom' | 'bracket' | 'candlesnuff' | 'yeast' | 'mold'
  | 'rotifer' | 'tardigrade' | 'nematode' | 'daphnia'
  | 'amoeba' | 'ciliate' | 'euglena' | 'volvox' | 'diatom' | 'stentor'
  | 'rod' | 'coccus' | 'chain' | 'branching';

export interface Species {
  /** Stable slug used in save data and genie tool calls. */
  id: string;
  kingdom: Kingdom;
  phylum: string;
  /** Class (or division for plants). */
  klass: string;
  binomial: string;
  common: string;
  tier: Tier;
  habitats: Habitat[];
  locomotion: Locomotion;
  body: BodyPlan;
  /** Meters for macro; micrometers for micro. Drives mesh scale. */
  size: number;
  /** Primary / secondary colours. */
  colors: [number, number];
  /** One line a child can hold onto. */
  fact: string;
  /** Relative abundance weight within its habitat. */
  weight?: number;
  note?: string;
  /** Favourite foods, as species ids (real diets, kept kid-simple). Animals only. */
  diet?: string[];
  /** Domestic: only arrives through the Guild; needs shelter. */
  domestic?: boolean;
}

const s = (x: Species): Species => ({ weight: 1, ...x });

export const SPECIES: Species[] = [
  // ───────────────────────── ANIMALIA — macro ─────────────────────────
  s({ id: 'red-fox', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Mammalia', binomial: 'Vulpes vulpes', common: 'red fox', tier: 'macro', habitats: ['grass', 'forest'], locomotion: 'walk', body: 'quadruped', size: 0.9, colors: [0xd2691e, 0xfff5e6], fact: 'Foxes pounce with a high arc — they can hear a mouse under snow.', weight: 0.4, diet: ['raspberry'] }),
  s({ id: 'rabbit', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Mammalia', binomial: 'Oryctolagus cuniculus', common: 'European rabbit', tier: 'macro', habitats: ['grass'], locomotion: 'hop', body: 'rabbit', size: 0.4, colors: [0x9a8468, 0xffffff], fact: 'Rabbits thump the ground with a back foot to warn the warren.', weight: 1.2, diet: ['white-clover', 'dandelion'] }),
  s({ id: 'red-deer', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Mammalia', binomial: 'Cervus elaphus', common: 'red deer', tier: 'macro', habitats: ['forest'], locomotion: 'walk', body: 'quadruped', size: 1.6, colors: [0x8b5a2b, 0xe8d8c0], fact: 'Stags grow and shed a whole set of antlers every single year.', weight: 0.3, diet: ['heather'] }),
  s({ id: 'raven', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Aves', binomial: 'Corvus corax', common: 'common raven', tier: 'macro', habitats: ['forest', 'snow', 'grass'], locomotion: 'fly', body: 'bird', size: 0.6, colors: [0x14141c, 0x2a2a3a], fact: 'Ravens play — they have been seen sliding down snowy roofs for fun.', weight: 0.6, diet: ['rowan'] }),
  s({ id: 'mallard', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Aves', binomial: 'Anas platyrhynchos', common: 'mallard', tier: 'macro', habitats: ['water', 'shore'], locomotion: 'swim', body: 'duck', size: 0.5, colors: [0x2e7d32, 0xb0a080], fact: 'Only the female mallard makes the classic loud “quack”.', weight: 0.8, diet: ['duckweed'] }),
  s({ id: 'brown-trout', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Actinopterygii', binomial: 'Salmo trutta', common: 'brown trout', tier: 'macro', habitats: ['water'], locomotion: 'swim', body: 'fish', size: 0.4, colors: [0x7a6a3a, 0xd9c98a], fact: 'Trout face upstream and let the current bring food to them.', weight: 1.2 }),
  s({ id: 'common-frog', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Amphibia', binomial: 'Rana temporaria', common: 'common frog', tier: 'macro', habitats: ['shore'], locomotion: 'hop', body: 'frog', size: 0.09, colors: [0x6b8e23, 0xc8d890], fact: 'Frogs drink through their skin — they never sip with their mouths.', weight: 1 }),
  s({ id: 'sand-lizard', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Reptilia', binomial: 'Lacerta agilis', common: 'sand lizard', tier: 'macro', habitats: ['sand'], locomotion: 'walk', body: 'lizard', size: 0.2, colors: [0x8a7a4a, 0x4caf50], fact: 'A basking lizard is charging up: it needs sun-heat to move fast.', weight: 1 }),
  s({ id: 'honey-bee', kingdom: 'Animalia', phylum: 'Arthropoda', klass: 'Insecta', binomial: 'Apis mellifera', common: 'western honey bee', tier: 'macro', habitats: ['grass'], locomotion: 'fly', body: 'insect', size: 0.013, colors: [0xf2b200, 0x2a2010], fact: 'Bees tell each other where flowers are by dancing in a figure-eight.', weight: 1.5, diet: ['dandelion', 'white-clover'] }),
  s({ id: 'ladybird', kingdom: 'Animalia', phylum: 'Arthropoda', klass: 'Insecta', binomial: 'Coccinella septempunctata', common: 'seven-spot ladybird', tier: 'macro', habitats: ['grass', 'forest'], locomotion: 'crawl', body: 'beetle', size: 0.007, colors: [0xe03030, 0x101010], fact: 'Septempunctata means “seven-spotted” — count them!', weight: 1 }),
  s({ id: 'wood-ant', kingdom: 'Animalia', phylum: 'Arthropoda', klass: 'Insecta', binomial: 'Formica rufa', common: 'red wood ant', tier: 'macro', habitats: ['forest'], locomotion: 'crawl', body: 'ant', size: 0.008, colors: [0xa0522d, 0x3a1a0a], fact: 'Wood ants build nests of pine needles that can be taller than you.', weight: 1.5 }),
  s({ id: 'garden-spider', kingdom: 'Animalia', phylum: 'Arthropoda', klass: 'Arachnida', binomial: 'Araneus diadematus', common: 'European garden spider', tier: 'macro', habitats: ['forest', 'grass'], locomotion: 'crawl', body: 'spider', size: 0.015, colors: [0x7a5a3a, 0xf0e0c0], fact: 'Spiders are not insects: eight legs, no antennae, no wings.', weight: 0.6 }),
  s({ id: 'roman-snail', kingdom: 'Animalia', phylum: 'Mollusca', klass: 'Gastropoda', binomial: 'Helix pomatia', common: 'Roman snail', tier: 'macro', habitats: ['forest', 'shade'], locomotion: 'crawl', body: 'snail', size: 0.045, colors: [0xc8a878, 0x9a8a7a], fact: 'A snail’s shell grows with it — it never moves house.', weight: 0.8, diet: ['daisy'] }),
  s({ id: 'earthworm', kingdom: 'Animalia', phylum: 'Annelida', klass: 'Clitellata', binomial: 'Lumbricus terrestris', common: 'common earthworm', tier: 'macro', habitats: ['grass', 'forest'], locomotion: 'burrow', body: 'worm', size: 0.2, colors: [0xc08070, 0xe0a090], fact: 'Worms breathe through their skin and come up when rain floods the soil.', weight: 0.8 }),

  // Domestic — arrive only through the Animal Protector Guild.
  s({ id: 'sheep', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Mammalia', binomial: 'Ovis aries', common: 'sheep', tier: 'macro', habitats: ['grass'], locomotion: 'walk', body: 'sheep', size: 1.0, colors: [0xf0ece0, 0x3a3030], fact: 'Sheep remember up to fifty faces — of sheep and of people — for years.', weight: 0, diet: ['white-clover'], domestic: true }),
  s({ id: 'chicken', kingdom: 'Animalia', phylum: 'Chordata', klass: 'Aves', binomial: 'Gallus gallus', common: 'chicken', tier: 'macro', habitats: ['grass'], locomotion: 'walk', body: 'chicken', size: 0.4, colors: [0xd8b070, 0xe03030], fact: 'Chickens are the closest living relatives of Tyrannosaurus rex.', weight: 0, diet: ['dandelion'], domestic: true }),

  // ───────────────────────── ANIMALIA — micro ─────────────────────────
  s({ id: 'rotifer', kingdom: 'Animalia', phylum: 'Rotifera', klass: 'Bdelloidea', binomial: 'Philodina roseola', common: 'rotifer', tier: 'micro', habitats: ['pond', 'moss', 'bark'], locomotion: 'cilia', body: 'rotifer', size: 300, colors: [0xffc0cb, 0xffe4e1], fact: 'Rotifer means “wheel-bearer”: its crown of cilia spins like a wheel.' }),
  s({ id: 'tardigrade', kingdom: 'Animalia', phylum: 'Tardigrada', klass: 'Eutardigrada', binomial: 'Hypsibius exemplaris', common: 'water bear', tier: 'micro', habitats: ['moss', 'pond', 'bark'], locomotion: 'crawl', body: 'tardigrade', size: 500, colors: [0xd8d0b8, 0x8a8a6a], fact: 'Water bears survive boiling, freezing and even outer space.' }),
  s({ id: 'nematode', kingdom: 'Animalia', phylum: 'Nematoda', klass: 'Chromadorea', binomial: 'Caenorhabditis elegans', common: 'roundworm', tier: 'micro', habitats: ['soil'], locomotion: 'crawl', body: 'nematode', size: 1000, colors: [0xe8e0d0, 0xc8c0b0], fact: 'Scientists mapped every one of this worm’s 959 body cells.' }),
  s({ id: 'daphnia', kingdom: 'Animalia', phylum: 'Arthropoda', klass: 'Branchiopoda', binomial: 'Daphnia pulex', common: 'water flea', tier: 'micro', habitats: ['pond'], locomotion: 'swim', body: 'daphnia', size: 2000, colors: [0xe0d8a0, 0xa09060], fact: 'Its heart beats about 200 times a minute — you can watch it through its clear shell.' }),

  // ───────────────────────── PLANTAE ─────────────────────────
  s({ id: 'haircap-moss', kingdom: 'Plantae', phylum: 'Bryophyta', klass: 'Polytrichopsida', binomial: 'Polytrichum commune', common: 'common haircap moss', tier: 'macro', habitats: ['shade', 'forest'], locomotion: 'spread', body: 'moss', size: 0.1, colors: [0x2f6b2f, 0x4a8a3a], fact: 'Moss has no roots or flowers; it drinks rain straight through its leaves.', weight: 1.2 }),
  s({ id: 'bracken', kingdom: 'Plantae', phylum: 'Polypodiophyta', klass: 'Polypodiopsida', binomial: 'Pteridium aquilinum', common: 'bracken fern', tier: 'macro', habitats: ['forest'], locomotion: 'sessile', body: 'fern', size: 0.9, colors: [0x3d8b37, 0x2a5a2a], fact: 'Ferns make spores, not seeds — look for brown dots under the leaves.', weight: 1 }),
  s({ id: 'dandelion', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Taraxacum officinale', common: 'dandelion', tier: 'macro', habitats: ['grass'], locomotion: 'spread', body: 'flower', size: 0.25, colors: [0xffd400, 0x4caf50], fact: 'Each dandelion seed has its own parachute.', weight: 1.5 }),
  s({ id: 'daisy', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Bellis perennis', common: 'common daisy', tier: 'macro', habitats: ['grass'], locomotion: 'spread', body: 'flower', size: 0.12, colors: [0xffffff, 0xffd400], fact: 'Daisies close at night and open at dawn — “day’s eye”.', weight: 1.5 }),
  s({ id: 'white-clover', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Trifolium repens', common: 'white clover', tier: 'macro', habitats: ['grass'], locomotion: 'spread', body: 'clover', size: 0.1, colors: [0x3a9a3a, 0xf8f8f0], fact: 'Trifolium means “three leaves”. A fourth is a rare mistake.', weight: 1 }),
  s({ id: 'scots-pine', kingdom: 'Plantae', phylum: 'Pinophyta', klass: 'Pinopsida', binomial: 'Pinus sylvestris', common: 'Scots pine (sapling)', tier: 'macro', habitats: ['forest', 'snow'], locomotion: 'sessile', body: 'sapling', size: 1.2, colors: [0x2f5f3f, 0x8a5a3a], fact: 'Pines carry their seeds in cones and keep their needles all winter.', weight: 0.5 }),
  s({ id: 'heather', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Calluna vulgaris', common: 'heather', tier: 'macro', habitats: ['grass', 'snow'], locomotion: 'spread', body: 'moss', size: 0.3, colors: [0x9a4ac0, 0x4a6a3a], fact: 'Purple moorland is heather in bloom — deer and grouse eat the young shoots.', weight: 0.6 }),
  s({ id: 'raspberry', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Rubus idaeus', common: 'wild raspberry', tier: 'macro', habitats: ['forest', 'shade'], locomotion: 'spread', body: 'bush', size: 0.8, colors: [0x3a8a3a, 0xe0305a], fact: 'A raspberry is not one berry but a cluster of tiny fruits, each with its own seed.', weight: 0.5 }),
  s({ id: 'rowan', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Magnoliopsida', binomial: 'Sorbus aucuparia', common: 'rowan (sapling)', tier: 'macro', habitats: ['forest', 'snow'], locomotion: 'sessile', body: 'bush', size: 1.3, colors: [0x4a8a3a, 0xf05030], fact: 'Its scarlet berries feed birds through the winter; aucuparia means “bird-catcher”.', weight: 0.4 }),
  s({ id: 'duckweed', kingdom: 'Plantae', phylum: 'Magnoliophyta', klass: 'Liliopsida', binomial: 'Lemna minor', common: 'common duckweed', tier: 'macro', habitats: ['water'], locomotion: 'spread', body: 'duckweed', size: 0.5, colors: [0x6ad040, 0x4aa030], fact: 'One of the smallest flowering plants on Earth — a green raft ducks graze from.', weight: 0.8 }),

  // ───────────────────────── FUNGI ─────────────────────────
  s({ id: 'fly-agaric', kingdom: 'Fungi', phylum: 'Basidiomycota', klass: 'Agaricomycetes', binomial: 'Amanita muscaria', common: 'fly agaric', tier: 'macro', habitats: ['forest', 'shade'], locomotion: 'spread', body: 'mushroom', size: 0.2, colors: [0xd62828, 0xf8f0e0], fact: 'The mushroom is only the fruit; the fungus is a web of threads underground.', weight: 0.8 }),
  s({ id: 'field-mushroom', kingdom: 'Fungi', phylum: 'Basidiomycota', klass: 'Agaricomycetes', binomial: 'Agaricus campestris', common: 'field mushroom', tier: 'macro', habitats: ['grass'], locomotion: 'spread', body: 'mushroom', size: 0.1, colors: [0xf0e8d8, 0xb08070], fact: 'Fungi are closer cousins to animals than to plants.', weight: 0.8 }),
  s({ id: 'tinder-fungus', kingdom: 'Fungi', phylum: 'Basidiomycota', klass: 'Agaricomycetes', binomial: 'Fomes fomentarius', common: 'tinder fungus', tier: 'macro', habitats: ['wood'], locomotion: 'sessile', body: 'bracket', size: 0.25, colors: [0x7a7a72, 0x4a3a2a], fact: 'People carried this hoof-shaped fungus to keep fire alive for 5,000 years.', weight: 1 }),
  s({ id: 'candlesnuff', kingdom: 'Fungi', phylum: 'Ascomycota', klass: 'Sordariomycetes', binomial: 'Xylaria hypoxylon', common: 'candlesnuff fungus', tier: 'macro', habitats: ['wood', 'shade'], locomotion: 'sessile', body: 'candlesnuff', size: 0.05, colors: [0x202020, 0xf0f0f0], fact: 'It glows very faintly in the dark — a wisp of light on rotting wood.', weight: 0.8 }),
  s({ id: 'yeast', kingdom: 'Fungi', phylum: 'Ascomycota', klass: 'Saccharomycetes', binomial: 'Saccharomyces cerevisiae', common: 'baker’s yeast', tier: 'micro', habitats: ['leaf', 'soil', 'bark'], locomotion: 'divide', body: 'yeast', size: 6, colors: [0xf0e6c8, 0xd8c8a0], fact: 'Yeast breathes out the bubbles that make bread rise.' }),
  s({ id: 'penicillium', kingdom: 'Fungi', phylum: 'Ascomycota', klass: 'Eurotiomycetes', binomial: 'Penicillium chrysogenum', common: 'penicillium mold', tier: 'micro', habitats: ['soil', 'leaf', 'bark'], locomotion: 'filament', body: 'mold', size: 40, colors: [0x5fa8a0, 0xe8f0e8], fact: 'This blue-green mold gave us penicillin, the first antibiotic.' }),

  // ───────────────────────── PROTISTA ─────────────────────────
  s({ id: 'amoeba', kingdom: 'Protista', phylum: 'Amoebozoa', klass: 'Tubulinea', binomial: 'Amoeba proteus', common: 'amoeba', tier: 'micro', habitats: ['pond', 'soil'], locomotion: 'pseudopod', body: 'amoeba', size: 400, colors: [0xc8d8e8, 0x7a90a8], fact: 'An amoeba moves by pouring itself into a new shape.' }),
  s({ id: 'paramecium', kingdom: 'Protista', phylum: 'Ciliophora', klass: 'Oligohymenophorea', binomial: 'Paramecium caudatum', common: 'paramecium', tier: 'micro', habitats: ['pond'], locomotion: 'cilia', body: 'ciliate', size: 250, colors: [0xd8e8f0, 0x90b0c8], fact: 'Thousands of tiny hairs beat in waves to row it through the water.', weight: 1.5 }),
  s({ id: 'stentor', kingdom: 'Protista', phylum: 'Ciliophora', klass: 'Heterotrichea', binomial: 'Stentor coeruleus', common: 'blue trumpet', tier: 'micro', habitats: ['pond'], locomotion: 'sessile', body: 'stentor', size: 1500, colors: [0x3a70c8, 0x80b0f0], fact: 'A single cell shaped like a trumpet, big enough to see with the naked eye.', weight: 0.5 }),
  s({ id: 'euglena', kingdom: 'Protista', phylum: 'Euglenozoa', klass: 'Euglenida', binomial: 'Euglena gracilis', common: 'euglena', tier: 'micro', habitats: ['pond'], locomotion: 'flagellum', body: 'euglena', size: 60, colors: [0x40a040, 0xe03030], fact: 'Part plant, part animal: it swims with a tail and eats sunlight. The red dot is its eye-spot.' }),
  s({ id: 'volvox', kingdom: 'Protista', phylum: 'Chlorophyta', klass: 'Chlorophyceae', binomial: 'Volvox aureus', common: 'volvox', tier: 'micro', habitats: ['pond'], locomotion: 'tumble', body: 'volvox', size: 500, colors: [0x50c050, 0xa0f0a0], fact: 'A rolling green ball of hundreds of cells, with baby balls growing inside.', note: 'Green algae are placed in Plantae by some textbooks; Whittaker’s scheme keeps unicellular and colonial algae in Protista.' }),
  s({ id: 'diatom', kingdom: 'Protista', phylum: 'Bacillariophyta', klass: 'Bacillariophyceae', binomial: 'Pinnularia viridis', common: 'diatom', tier: 'micro', habitats: ['pond'], locomotion: 'drift', body: 'diatom', size: 150, colors: [0xc8b060, 0xf0e8c0], fact: 'Diatoms live in glass boxes they build themselves — and make much of the air you breathe.' }),

  // ───────────────────────── MONERA ─────────────────────────
  s({ id: 'e-coli', kingdom: 'Monera', phylum: 'Pseudomonadota', klass: 'Gammaproteobacteria', binomial: 'Escherichia coli', common: 'E. coli', tier: 'micro', habitats: ['soil', 'pond'], locomotion: 'run-tumble', body: 'rod', size: 2, colors: [0xd8a0d8, 0xb080b0], fact: 'It swims in straight “runs”, then tumbles to pick a new direction.', weight: 1.5 }),
  s({ id: 'bacillus', kingdom: 'Monera', phylum: 'Bacillota', klass: 'Bacilli', binomial: 'Bacillus subtilis', common: 'hay bacillus', tier: 'micro', habitats: ['soil'], locomotion: 'divide', body: 'chain', size: 4, colors: [0xe8c890, 0xc0a070], fact: 'When food runs out it wraps itself in a tough spore and waits — for years.' }),
  s({ id: 'anabaena', kingdom: 'Monera', phylum: 'Cyanobacteria', klass: 'Cyanophyceae', binomial: 'Anabaena cylindrica', common: 'anabaena', tier: 'micro', habitats: ['pond'], locomotion: 'filament', body: 'chain', size: 5, colors: [0x2f8f6f, 0x60c0a0], fact: 'Cyanobacteria invented photosynthesis — the first to fill the air with oxygen.' }),
  s({ id: 'streptomyces', kingdom: 'Monera', phylum: 'Actinomycetota', klass: 'Actinomycetes', binomial: 'Streptomyces coelicolor', common: 'streptomyces', tier: 'micro', habitats: ['soil'], locomotion: 'filament', body: 'branching', size: 1, colors: [0x8a8ad0, 0xc0c0f0], fact: 'The smell of rain on earth is this bacterium’s perfume, geosmin.' }),
  s({ id: 'micrococcus', kingdom: 'Monera', phylum: 'Actinomycetota', klass: 'Actinomycetes', binomial: 'Micrococcus luteus', common: 'micrococcus', tier: 'micro', habitats: ['leaf', 'soil', 'bark'], locomotion: 'divide', body: 'coccus', size: 1.5, colors: [0xf0d060, 0xf8e8a0], fact: 'Luteus means yellow — its colonies look like drops of butter.' }),
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map(sp => [sp.id, sp]));

export function findSpecies(query: string): Species | undefined {
  const q = query.trim().toLowerCase();
  return SPECIES.find(sp => sp.id === q || sp.binomial.toLowerCase() === q || sp.common.toLowerCase() === q)
    ?? SPECIES.find(sp => sp.binomial.toLowerCase().includes(q) || sp.common.toLowerCase().includes(q) || q.includes(sp.common.toLowerCase()));
}

export function speciesFor(habitat: Habitat, tier: Tier): Species[] {
  return SPECIES.filter(sp => sp.tier === tier && sp.habitats.includes(habitat));
}

/** Genus is the first word of the binomial, by definition. */
export const genus = (sp: Species) => sp.binomial.split(' ')[0];
