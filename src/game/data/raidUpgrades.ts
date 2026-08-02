import { RaidUpgradeDef } from '../types';

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
    modsPerLevel: { speed: 8 },
    goldBaseCost: 6000,
    goldCostGrowth: 1.9,
    goldTierMaxLevel: 4,
    renownBaseCost: 8,
    renownCostGrowth: 1.35,
    maxLevel: 10,
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
