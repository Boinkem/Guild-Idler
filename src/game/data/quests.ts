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
}

export const QUEST_TEMPLATES: Template[] = [
  {
    verb: 'Hunt', tag: 'combat',
    subjects: ['Dire Wolf', 'Bog Lurker', 'Frost Boar', 'Marsh Hydra', 'Ashen Wyvern', 'Thicket Stalker'],
    flavour: ['Tracks lead north past the old mill.', 'The farmers have stopped counting their losses.', 'It hunts at dusk. So will we.'],
  },
  {
    verb: 'Escort', tag: 'escort',
    subjects: ['Merchant', 'Pilgrim Caravan', 'Wandering Scholar', 'Salt Trader', 'Envoy of Highmoor'],
    flavour: ['Pays well and complains loudly.', 'The road is quiet lately. Suspiciously quiet.', 'Three carts, one bridge, no patience.'],
  },
  {
    verb: 'Defend', tag: 'defense',
    subjects: ['Village', 'River Crossing', 'Grain Stores', 'Watchtower', 'Chapel of Embers'],
    flavour: ['They asked for soldiers. They got you.', 'Hold until the horn sounds.', 'Bring rope. Bring more rope.'],
  },
  {
    verb: 'Explore', tag: 'explore',
    subjects: ['Ancient Ruins', 'Sunken Aqueduct', 'Fogbound Vale', 'Collapsed Library', 'Hollow Beneath Oakfell'],
    flavour: ['Nobody has mapped it properly. Nobody has come back to try.', 'The stones are older than the kingdom.', 'Bring a lantern and a strong stomach.'],
  },
  {
    verb: 'Clear', tag: 'combat',
    subjects: ['Goblin Camp', 'Bandit Hideout', 'Spider Warren', 'Kobold Tunnels', 'Deserter Stockade'],
    flavour: ['Small problem. Growing fast.', 'They took the tax cart. Twice.', 'In and out before the moon rises.'],
  },
  {
    verb: 'Slay', tag: 'combat',
    subjects: ['Cave Troll', 'Bone Warden', 'Blight Ogre', 'Sunless Chimera', 'The Thing in the Weir'],
    flavour: ['The bounty has been raised four times.', 'It has a name. That is never a good sign.', 'Two knights went. Neither returned.'],
  },
  {
    verb: 'Recover', tag: 'explore',
    subjects: ['Sacred Relic', 'Stolen Crown Jewel', 'Guild Ledger', 'Warden\'s Signet', 'Reliquary of Saint Aldwin'],
    flavour: ['The temple is offering gold and no questions.', 'It was never supposed to leave the vault.', 'Discretion is part of the fee.'],
  },
  {
    verb: 'Investigate', tag: 'arcane',
    subjects: ['Haunted Mine', 'Silent Village', 'Weeping Standing Stones', 'Drowned Shrine', 'Cursed Orchard'],
    flavour: ['Lights underground. No miners left to hold them.', 'The bell rings on its own.', 'Everyone left in one night. Doors still open.'],
  },
  {
    verb: 'Infiltrate', tag: 'stealth',
    subjects: ['Smuggler Warehouse', 'Cult Sanctum', 'Rival Guild Hall', 'Blackrock Keep'],
    flavour: ['Quiet work. Quiet pay.', 'Get in, read the ledger, leave nothing behind.', 'No banners. No noise.'],
  },
  {
    verb: 'Break', tag: 'arcane',
    subjects: ['Binding Ward', 'Curse of Hollowmere', 'Sealed Gate', 'Witch\'s Pact'],
    flavour: ['The scholars have theories. You have a sword.', 'Undo it carefully or not at all.', 'The old words still hold. Barely.'],
  },
];

export const QUEST_PREFIXES = ['Urgent:', 'Contract:', 'Bounty:', 'Request:', 'Sealed Orders:'];

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
];
