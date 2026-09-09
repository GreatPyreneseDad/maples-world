/**
 * The Animal Protector Guild. Quests are generated from the living world, never scripted
 * against fixed coordinates: the world tells the Guild who needs help, the Guild tells the player.
 *
 * Shared so the genie can read the same quest vocabulary the game uses.
 */
import { SPECIES, SPECIES_BY_ID, type Species } from './taxonomy.ts';

export type QuestKind = 'feed' | 'shelter' | 'free' | 'habitat';

export interface QuestTemplate {
  kind: QuestKind;
  title: (sp: Species, food?: Species) => string;
  brief: (sp: Species, food?: Species) => string;
  /** Rank points on completion. */
  points: number;
}

export const QUEST_TEMPLATES: Record<QuestKind, QuestTemplate> = {
  feed: {
    kind: 'feed', points: 10,
    title: (sp, food) => `Feed the ${sp.common}`,
    brief: (sp, food) => `A ${sp.common} (${sp.binomial}) is hungry. Its favourite food is ${food!.common} (${food!.binomial}). Plant it within a few steps of the animal — seeds from the pouch — and let it grow. When it eats, it will trust you.`,
  },
  shelter: {
    kind: 'shelter', points: 15,
    title: sp => `Shelter the ${sp.common}`,
    brief: sp => `A ${sp.common} (${sp.binomial}) has been left out in the weather. Build it a shelter nearby: a roof overhead and at least three walls. It will walk in on its own when it feels safe.`,
  },
  free: {
    kind: 'free', points: 12,
    title: sp => `Free the ${sp.common}`,
    brief: sp => `A ${sp.common} (${sp.binomial}) is trapped under a rockfall. Break the stones to let it out — gently, from the side.`,
  },
  habitat: {
    kind: 'habitat', points: 20,
    title: sp => `A home for the ${sp.common}`,
    brief: (sp, food) => `${sp.common[0].toUpperCase() + sp.common.slice(1)}s (${sp.binomial}) need a place to live. Make a patch of habitat near the marker: ${habitatRecipe(sp, food)}`,
  },
};

/** What "habitat" means per species — countable in the world. */
export interface HabitatNeed { block?: string; species?: string; count: number; radius: number; label: string }
export function habitatNeed(sp: Species, food?: Species): HabitatNeed {
  if (sp.habitats.includes('water') || sp.id === 'common-frog') return { block: 'water', count: 9, radius: 6, label: 'a pond of at least nine water blocks' };
  if (sp.id === 'honey-bee') return { species: 'dandelion', count: 5, radius: 8, label: 'five dandelions (Taraxacum officinale)' };
  if (sp.id === 'roman-snail') return { species: 'haircap-moss', count: 4, radius: 6, label: 'four cushions of haircap moss for damp shade' };
  if (food) return { species: food.id, count: 4, radius: 8, label: `four ${food.common} plants (${food.binomial})` };
  return { block: 'leaves', count: 12, radius: 8, label: 'twelve leaf blocks of cover' };
}
const habitatRecipe = (sp: Species, food?: Species) => habitatNeed(sp, food).label + '.';

/** Animals that can hold a quest: macro, Animalia, with a known diet or domestic. */
export const QUEST_ANIMALS: Species[] = SPECIES.filter(s => s.kingdom === 'Animalia' && s.tier === 'macro' && (s.diet?.length || s.domestic));
export const foodOf = (sp: Species): Species | undefined => sp.diet?.length ? SPECIES_BY_ID[sp.diet[0]] : undefined;

export const RANKS = [
  { name: 'Apprentice Protector', at: 0 },
  { name: 'Warden of Small Things', at: 30 },
  { name: 'Keeper of Habitats', at: 80 },
  { name: 'Guardian of the Five Kingdoms', at: 160 },
];
export const rankFor = (points: number) => [...RANKS].reverse().find(r => points >= r.at)!;
