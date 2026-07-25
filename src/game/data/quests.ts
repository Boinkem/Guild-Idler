import { Difficulty, QuestTag } from '../types';
import { HOUR } from '../util';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDuration: number;
  maxDuration: number;
  minGold: number;
  maxGold: number;
  xpMultiplier: number;
  /** Chance that any loot roll happens at all. */
  lootChance: number;
  reqLevel: number;
  /** Weight when generating the board. */
  weight: number;
  color: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy', label: 'Easy', baseSuccess: 90,
    minDuration: 1 * HOUR, maxDuration: 2 * HOUR,
    minGold: 10, maxGold: 25, xpMultiplier: 1, lootChance: 12,
    reqLevel: 1, weight: 30, color: '#79a86b',
  },
  normal: {
    id: 'normal', label: 'Normal', baseSuccess: 75,
    minDuration: 2 * HOUR, maxDuration: 4 * HOUR,
    minGold: 25, maxGold: 60, xpMultiplier: 2.4, lootChance: 20,
    reqLevel: 3, weight: 28, color: '#5b8fd6',
  },
  hard: {
    id: 'hard', label: 'Hard', baseSuccess: 60,
    minDuration: 4 * HOUR, maxDuration: 6 * HOUR,
    minGold: 60, maxGold: 150, xpMultiplier: 5, lootChance: 30,
    reqLevel: 8, weight: 22, color: '#c98b3a',
  },
  epic: {
    id: 'epic', label: 'Epic', baseSuccess: 40,
    minDuration: 6 * HOUR, maxDuration: 12 * HOUR,
    minGold: 150, maxGold: 400, xpMultiplier: 11, lootChance: 45,
    reqLevel: 15, weight: 14, color: '#a874d6',
  },
  legendary: {
    id: 'legendary', label: 'Legendary', baseSuccess: 25,
    minDuration: 12 * HOUR, maxDuration: 24 * HOUR,
    minGold: 500, maxGold: 2000, xpMultiplier: 26, lootChance: 70,
    reqLevel: 25, weight: 6, color: '#d9a441',
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'epic', 'legendary'];

/** Quest names are assembled from a verb, a subject, and an optional place. */
interface Template {
  verb: string;
  subjects: string[];
  tag: QuestTag;
  flavour: string[];
  /**
   * Reserves grandiose "raid boss" templates for the difficulty tiers that
   * deserve them. Omit for a template usable at any difficulty.
   */
  minDifficulty?: Difficulty;
}

/**
 * Quest name templates live in json/quest-templates.json so they can be edited
 * via tools/devtool without touching TypeScript. This file just types and
 * re-exports them.
 */
import questTemplatesJson from './json/quest-templates.json';
export const QUEST_TEMPLATES: Template[] = questTemplatesJson as Template[];

import questPrefixesJson from './json/quest-prefixes.json';
export const QUEST_PREFIXES: string[] = questPrefixesJson as string[];

/* --------------------------- multi-day chains --------------------------- */

export interface ChainStageDef {
  name: string;
  flavour: string;
  difficulty: Difficulty;
  duration: number;
  goldMultiplier: number;
}

export interface ChainDef {
  id: string;
  name: string;
  description: string;
  reqLevel: number;
  stages: ChainStageDef[];
  /** Guaranteed reward on completion. */
  rewardGold: number;
  rewardItems: string[];
  rewardRenown: number;
}

export const QUEST_CHAINS: ChainDef[] = [
  {
    id: 'dragon_hunt',
    name: 'The Dragon Hunt',
    description: 'Something is burning the northern holdfasts. Four stages, several days, one dragon.',
    reqLevel: 18,
    rewardGold: 4000,
    rewardItems: ['dragon_helm', 'dragon_blade'],
    rewardRenown: 2,
    stages: [
      { name: 'Follow the Ash Trail', flavour: 'Cold ash, warm ground. It passed here recently.', difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'Question the Survivors', flavour: 'They describe wings the width of the valley.', difficulty: 'normal', duration: 6 * HOUR, goldMultiplier: 1.5 },
      { name: 'Scale the Cinder Pass', flavour: 'The only way up is the way it flies down.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2 },
      { name: 'The Dragon of Emberfell', flavour: 'No retreat from here. Bring everything.', difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3 },
    ],
  },
  {
    id: 'lost_kingdom',
    name: 'Lost Kingdom Expedition',
    description: 'A kingdom that maps forgot. Long roads, older ruins, and a very well-paid patron.',
    reqLevel: 14,
    rewardGold: 2600,
    rewardItems: ['crown_of_the_lost'],
    rewardRenown: 1,
    stages: [
      { name: 'Chart the Grey Marches', flavour: 'Six days of nothing, then a road that should not exist.', difficulty: 'normal', duration: 10 * HOUR, goldMultiplier: 1.6 },
      { name: 'Cross the Silent Bridge', flavour: 'It holds. That is the surprising part.', difficulty: 'hard', duration: 12 * HOUR, goldMultiplier: 1.8 },
      { name: 'Open the Sunken Vault', flavour: 'Whatever they locked away, they locked it well.', difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'demon_fortress',
    name: 'Demon Fortress Assault',
    description: 'The guild is gathering banners. Your knight has been asked to lead the breach.',
    reqLevel: 22,
    rewardGold: 6500,
    rewardItems: ['dragon_armor', 'amulet_of_fortune'],
    rewardRenown: 3,
    stages: [
      { name: 'Break the Outer Siege', flavour: 'Ladders, fire, and a very long night.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 2 },
      { name: 'Silence the Warding Choir', flavour: 'The singing has not stopped in nine years.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.4 },
      { name: 'The Iron Gate', flavour: 'Held by something that remembers the last siege.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
      { name: 'Descend to the Throne', flavour: 'One door left. It is already open.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.5 },
    ],
  },
  {
    id: 'ancient_crown',
    name: 'Search for the Ancient Crown',
    description: 'Three fragments, three regions, one very persistent rumour.',
    reqLevel: 10,
    rewardGold: 1800,
    rewardItems: ['lucky_ring'],
    rewardRenown: 1,
    stages: [
      { name: 'The Fragment in the Fen', flavour: 'Wet, cold, and guarded by something patient.', difficulty: 'normal', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'The Fragment in the Vault', flavour: 'The banker insists it is a paperweight.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Fragment in the Fire', flavour: 'Last seen inside an active forge. Naturally.', difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.2 },
    ],
  },
  {
    id: 'goblin_warband',
    name: "The Goblin King's Warband",
    description: 'A goblin chieftain has united three warbands under one crown. Someone should un-unite them.',
    reqLevel: 6,
    rewardGold: 550,
    rewardItems: ['warband_cleaver'],
    rewardRenown: 1,
    stages: [
      { name: 'Scatter the Outriders', flavour: 'They ride ahead of the warband, loud and badly armoured.', difficulty: 'normal', duration: 3 * HOUR, goldMultiplier: 1.3 },
      { name: "The Chieftain's Camp", flavour: 'He wears three crowns. None of them fit. All of them are stolen.', difficulty: 'hard', duration: 5 * HOUR, goldMultiplier: 1.6 },
    ],
  },
  {
    id: 'hollow_choir',
    name: 'The Hollow Choir',
    description: 'Something has been singing in the old cathedral for nine years straight. It never breathes.',
    reqLevel: 26,
    rewardGold: 5200,
    rewardItems: ['choir_mask', 'silenced_bell'],
    rewardRenown: 2,
    stages: [
      { name: 'Follow the Hymn', flavour: 'It carries for miles and never repeats a verse.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Choir Loft', flavour: 'No singers. Just mouths, carved into the stone, still moving.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.2 },
      { name: 'Silence the Chord', flavour: 'Whatever it is building toward, it is almost finished.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
    ],
  },
  {
    id: 'world_ender',
    name: "The World-Ender's Vigil",
    description:
      'A capstone expedition for guilds that have already retired a hero or two. Five stages, ' +
      'no easy ones, and a patron who refuses to say what is actually waiting at the end.',
    reqLevel: 34,
    rewardGold: 22000,
    rewardItems: ['voidforged_blade', 'voidforged_crown', 'voidforged_plate', 'voidforged_signet'],
    rewardRenown: 6,
    stages: [
      { name: 'The Road That Should Not Exist', flavour: 'It appeared on the map three nights ago. It has always been on the ground.', difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.6 },
      { name: 'The Watchers in the Dark Between Stars', flavour: 'They have been counting something. You do not want to know what.', difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3.2 },
      { name: 'The Court of the Unmade King', flavour: 'He ruled before the first kingdom. He intends to rule after the last.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.6 },
      { name: 'The Breaking of the Vigil', flavour: 'Whatever has been holding it back is tired. So are you. Keep going anyway.', difficulty: 'legendary', duration: 28 * HOUR, goldMultiplier: 4.0 },
      { name: 'The World-Ender', flavour: 'It does not have a name. It has never needed one. This ends here, one way or the other.', difficulty: 'legendary', duration: 32 * HOUR, goldMultiplier: 5.0 },
    ],
  },
];
