import { QuestFastUpgradeDef } from '../types';
import { Tuning } from './tuning';

/**
 * Patch 0332, direct request: "a new expensive upgrade to increase
 * chances" for how often a quest offer rolls Fast. Its own small file,
 * same reasoning RAID_UPGRADES (raidUpgrades.ts) already established for
 * living apart from the general UPGRADES/GUILD_FACILITIES/RENOWN_PERKS
 * tree in progression.ts -- this affects quest-board generation directly
 * (QuestManager.generateOffer), not a hero stat, so it doesn't belong in
 * ModifierManager's general mod system either.
 *
 * Started as a single entry -- same "starter set, grows over time"
 * precedent RAID_UPGRADES's own header comment already notes for itself
 * -- Steady Hands (patch 0333) is the first thing to grow it.
 */
export const QUEST_FAST_UPGRADES: QuestFastUpgradeDef[] = [
  {
    id: 'lucky_streak',
    name: 'Lucky Streak',
    description: 'Word gets around the guild hall about which contracts wrap up early -- a small, permanent nudge to how often ANY quest, at any difficulty, rolls Fast.',
    fastChancePctPerLevel: Tuning.get('quest_fast_upgrade.fastChancePctPerLevel'),
    goldBaseCost: Tuning.get('quest_fast_upgrade.goldBaseCost'),
    goldCostGrowth: Tuning.get('quest_fast_upgrade.goldCostGrowth'),
    goldTierMaxLevel: Tuning.get('quest_fast_upgrade.goldTierMaxLevel'),
    renownBaseCost: Tuning.get('quest_fast_upgrade.renownBaseCost'),
    renownCostGrowth: Tuning.get('quest_fast_upgrade.renownCostGrowth'),
    maxLevel: Tuning.get('quest_fast_upgrade.maxLevel'),
  },
  /**
   * Patch 0333, direct request: eases the new Fast success penalty
   * (quest.fastSuccessPenalty, see QuestManager.generateOffer's own
   * comment) by 1% per level, "perhaps another upgrade path to ease
   * that... another gold sink really." Gold-only -- goldTierMaxLevel
   * equals maxLevel, so questFastUpgradeCost's Renown branch is never
   * actually reached for this entry (see QuestFastUpgradeDef's own
   * comment on that field). Capped at 5 levels against a 7-point base
   * penalty on purpose, direct design goal confirmed during the
   * discussion: a Fast roll should stay a real tradeoff even fully
   * upgraded (a permanent 2-point residual), never fully free.
   */
  {
    id: 'steady_hands',
    name: 'Steady Hands',
    description: 'Drilled routines shave the risk off a rushed job -- claws back part of the success penalty every Fast roll carries, though a rushed job never gets entirely safe.',
    successPenaltyRecoveryPerLevel: Tuning.get('quest_steady_hands.recoveryPctPerLevel'),
    goldBaseCost: Tuning.get('quest_steady_hands.goldBaseCost'),
    goldCostGrowth: Tuning.get('quest_steady_hands.goldCostGrowth'),
    goldTierMaxLevel: Tuning.get('quest_steady_hands.maxLevel'),
    renownBaseCost: 0,
    renownCostGrowth: 1,
    maxLevel: Tuning.get('quest_steady_hands.maxLevel'),
  },
];

export const QUEST_FAST_UPGRADE_BY_ID: Record<string, QuestFastUpgradeDef> = Object.fromEntries(
  QUEST_FAST_UPGRADES.map((u) => [u.id, u]),
);

/**
 * Identical shape to raidUpgradeCost (raidUpgrades.ts) -- levels below
 * goldTierMaxLevel cost gold on the usual baseCost*growth^level curve,
 * every level from goldTierMaxLevel onward costs Renown instead on its
 * own independent curve. Returns null once maxLevel is reached.
 */
export function questFastUpgradeCost(
  def: QuestFastUpgradeDef, currentLevel: number,
): { cost: number; currency: 'gold' | 'renown' } | null {
  if (currentLevel >= def.maxLevel) return null;
  if (currentLevel < def.goldTierMaxLevel) {
    return { cost: Math.floor(def.goldBaseCost * Math.pow(def.goldCostGrowth, currentLevel)), currency: 'gold' };
  }
  const renownLevel = currentLevel - def.goldTierMaxLevel;
  return { cost: Math.floor(def.renownBaseCost * Math.pow(def.renownCostGrowth, renownLevel)), currency: 'renown' };
}
