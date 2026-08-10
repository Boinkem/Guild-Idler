import { RaidUpgradeDef } from '../types';
import { Tuning } from './tuning';

/**
 * A dedicated upgrade tree affecting raids only, fully separate from the
 * general quest UPGRADES/GUILD_FACILITIES/RENOWN_PERKS in progression.ts --
 * lives in its own file for the same reason RAID_DIFFICULTIES lives in
 * raids.ts rather than quests.ts: raids are a deliberately separable
 * system, not an extension of the quest one.
 *
 * Starting with a single entry, Raid Speed -- the lever 0061 explicitly
 * left empty when it severed raid duration from the shared quest-speed
 * pool (Mounted Travel etc. no longer touch raid duration at all). More
 * raid-only levers (loot odds, failure odds, party capacity) can be added
 * here the same way later, same "starter set, grows over time" precedent
 * as ACHIEVEMENTS and GuidanceManager's topics.
 */
export const RAID_UPGRADES: RaidUpgradeDef[] = [
  {
    id: 'raid_speed',
    name: 'Raid Speed',
    description: 'Faster marches, tighter logistics -- shaves real time off every raid, regardless of difficulty.',
    // Every numeric field here reads from the tuning registry
    // (tuning.json) rather than being a literal -- editable live via the
    // devtool's Tuning tab without touching this file. See tuning.ts.
    modsPerLevel: { speed: Tuning.get('raid_speed.speedPerLevel') },
    goldBaseCost: Tuning.get('raid_speed.goldBaseCost'),
    goldCostGrowth: Tuning.get('raid_speed.goldCostGrowth'),
    goldTierMaxLevel: Tuning.get('raid_speed.goldTierMaxLevel'),
    renownBaseCost: Tuning.get('raid_speed.renownBaseCost'),
    renownCostGrowth: Tuning.get('raid_speed.renownCostGrowth'),
    maxLevel: Tuning.get('raid_speed.maxLevel'),
  },
  /**
   * Both now read from the tuning registry the same way raid_speed above
   * does -- the earlier comment here (kept below for context) predates
   * actually having tuning.json in hand; migrating them was exactly the
   * small, low-risk follow-up it anticipated.
   *
   * Both are built with exactly 3 levels (0-2) on purpose, to match the
   * 3-image sprite progression in the Raid Quartermaster's Den 1:1 with no
   * banding needed -- unlike raid_speed's existing 10-level curve, which
   * predates this visual system and gets banded onto the same 3 states
   * instead (see roomSpriteLevel in RaidsPanel.tsx).
   */
  {
    id: 'raid_loot',
    name: 'Raid Loot',
    description: 'Better odds and richer hauls from every raid encounter -- the difference between an empty vault and one worth the trip.',
    modsPerLevel: { loot: Tuning.get('raid_loot.lootPerLevel'), gold: Tuning.get('raid_loot.goldPerLevel') },
    goldBaseCost: Tuning.get('raid_loot.goldBaseCost'),
    goldCostGrowth: Tuning.get('raid_loot.goldCostGrowth'),
    goldTierMaxLevel: Tuning.get('raid_loot.goldTierMaxLevel'),
    renownBaseCost: Tuning.get('raid_loot.renownBaseCost'),
    renownCostGrowth: Tuning.get('raid_loot.renownCostGrowth'),
    maxLevel: Tuning.get('raid_loot.maxLevel'),
  },
  {
    id: 'raid_recovery',
    name: 'Raid Recovery',
    description: 'Better field triage and hardier gear -- heroes come back from raids in noticeably better shape.',
    modsPerLevel: { injuryResist: Tuning.get('raid_recovery.injuryResistPerLevel') },
    goldBaseCost: Tuning.get('raid_recovery.goldBaseCost'),
    goldCostGrowth: Tuning.get('raid_recovery.goldCostGrowth'),
    goldTierMaxLevel: Tuning.get('raid_recovery.goldTierMaxLevel'),
    renownBaseCost: Tuning.get('raid_recovery.renownBaseCost'),
    renownCostGrowth: Tuning.get('raid_recovery.renownCostGrowth'),
    maxLevel: Tuning.get('raid_recovery.maxLevel'),
  },
];

export const RAID_UPGRADE_BY_ID: Record<string, RaidUpgradeDef> = Object.fromEntries(
  RAID_UPGRADES.map((u) => [u.id, u]),
);

/**
 * Levels 0..goldTierMaxLevel-1 cost gold on the usual baseCost*growth^level
 * curve; every level from goldTierMaxLevel onward costs Renown instead, on
 * its own independent curve (same "tier2 restarts its own curve rather
 * than compounding on the first" reasoning as RenownPerkDef.tier2). Returns
 * null once maxLevel is reached.
 */
export function raidUpgradeCost(
  def: RaidUpgradeDef, currentLevel: number,
): { cost: number; currency: 'gold' | 'renown' } | null {
  if (currentLevel >= def.maxLevel) return null;
  if (currentLevel < def.goldTierMaxLevel) {
    return { cost: Math.floor(def.goldBaseCost * Math.pow(def.goldCostGrowth, currentLevel)), currency: 'gold' };
  }
  const renownLevel = currentLevel - def.goldTierMaxLevel;
  return { cost: Math.floor(def.renownBaseCost * Math.pow(def.renownCostGrowth, renownLevel)), currency: 'renown' };
}
