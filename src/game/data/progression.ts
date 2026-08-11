import { GuildDef, HeroClass, Modifiers, QuestTag, RenownPerkDef, Stats, UpgradeDef, VendorId } from '../types';
import { Tuning } from './tuning';

/* --------------------------- permanent upgrades --------------------------- */

export const UPGRADES: UpgradeDef[] = [
  // Every baseCost/costGrowth/maxLevel and per-level bonus value below
  // reads from the tuning registry (tuning.json, category
  // 'vendor_upgrades') rather than being a literal -- editable live via
  // the devtool's Tuning tab without touching this file. See tuning.ts.
  {
    id: 'weapons_training', name: 'Better Weapons Training',
    description: 'Drill the fundamentals until they are boring.',
    baseCost: Tuning.get('upgrade.weapons_training.baseCost'),
    costGrowth: Tuning.get('upgrade.weapons_training.costGrowth'),
    maxLevel: Tuning.get('upgrade.weapons_training.maxLevel'),
    modsPerLevel: { success: Tuning.get('upgrade.weapons_training.successPerLevel') }, vendor: 'blacksmith',
  },
  {
    id: 'efficient_adventuring', name: 'Efficient Adventuring',
    description: 'Negotiate the contract before drawing the sword.',
    baseCost: Tuning.get('upgrade.efficient_adventuring.baseCost'),
    costGrowth: Tuning.get('upgrade.efficient_adventuring.costGrowth'),
    maxLevel: Tuning.get('upgrade.efficient_adventuring.maxLevel'),
    modsPerLevel: { gold: Tuning.get('upgrade.efficient_adventuring.goldPerLevel') },
  },
  {
    id: 'veteran_explorer', name: 'Alchemical Assay',
    description: 'Acid, flame, and a practiced eye separate true ore from slag before the cart even leaves the ruin.',
    baseCost: Tuning.get('upgrade.veteran_explorer.baseCost'),
    costGrowth: Tuning.get('upgrade.veteran_explorer.costGrowth'),
    maxLevel: Tuning.get('upgrade.veteran_explorer.maxLevel'),
    modsPerLevel: { loot: Tuning.get('upgrade.veteran_explorer.lootPerLevel') }, vendor: 'alchemist',
  },
  {
    id: 'mounted_travel', name: 'Mounted Travel',
    description: 'A good horse shortens every road.',
    baseCost: Tuning.get('upgrade.mounted_travel.baseCost'),
    costGrowth: Tuning.get('upgrade.mounted_travel.costGrowth'),
    maxLevel: Tuning.get('upgrade.mounted_travel.maxLevel'),
    modsPerLevel: { speed: Tuning.get('upgrade.mounted_travel.speedPerLevel') }, vendor: 'blacksmith',
  },
  {
    id: 'field_medicine', name: 'Restorative Tinctures',
    description: 'Bitter draughts, brewed to knit flesh faster than they have any business doing.',
    baseCost: Tuning.get('upgrade.field_medicine.baseCost'),
    costGrowth: Tuning.get('upgrade.field_medicine.costGrowth'),
    maxLevel: Tuning.get('upgrade.field_medicine.maxLevel'),
    modsPerLevel: { injuryResist: Tuning.get('upgrade.field_medicine.injuryResistPerLevel') }, vendor: 'alchemist',
  },
  {
    id: 'armourers_contract', name: "Armourer's Contract",
    description: 'Standing repairs mean gear lasts noticeably longer.',
    baseCost: Tuning.get('upgrade.armourers_contract.baseCost'),
    costGrowth: Tuning.get('upgrade.armourers_contract.costGrowth'),
    maxLevel: Tuning.get('upgrade.armourers_contract.maxLevel'),
    modsPerLevel: { durability: Tuning.get('upgrade.armourers_contract.durabilityPerLevel') }, vendor: 'blacksmith',
  },
  {
    id: 'war_stories', name: 'Runic Insight',
    description: 'Wards etched into a hero\'s gear murmur half-remembered lessons back to whoever carries them.',
    baseCost: Tuning.get('upgrade.war_stories.baseCost'),
    costGrowth: Tuning.get('upgrade.war_stories.costGrowth'),
    maxLevel: Tuning.get('upgrade.war_stories.maxLevel'),
    modsPerLevel: { xp: Tuning.get('upgrade.war_stories.xpPerLevel') }, vendor: 'enchanter',
  },
  {
    id: 'master_adventurer', name: 'Enchanted Seal',
    description: 'A ward pressed into the guild charter unlocks Legendary contracts on the quest board -- and lends every hero its quiet protection.',
    baseCost: Tuning.get('upgrade.master_adventurer.baseCost'),
    costGrowth: Tuning.get('upgrade.master_adventurer.costGrowth'),
    maxLevel: Tuning.get('upgrade.master_adventurer.maxLevel'),
    modsPerLevel: { success: Tuning.get('upgrade.master_adventurer.successPerLevel') }, unlocks: 'legendaryQuests', vendor: 'enchanter',
  },
  {
    id: 'guild_charter', name: 'Guild Charter',
    description: 'Unlocks multi-day quest chains.',
    baseCost: Tuning.get('upgrade.guild_charter.baseCost'),
    costGrowth: Tuning.get('upgrade.guild_charter.costGrowth'),
    maxLevel: Tuning.get('upgrade.guild_charter.maxLevel'),
    modsPerLevel: {}, unlocks: 'chains',
  },
  {
    id: 'black_market_contact', name: 'Black Market Contact',
    description: "Someone who knows someone. Unlocks a second, pricier stock rotation biased toward rare and legendary gear — often stock the regular armourer would never touch.",
    baseCost: Tuning.get('upgrade.black_market_contact.baseCost'),
    costGrowth: Tuning.get('upgrade.black_market_contact.costGrowth'),
    maxLevel: Tuning.get('upgrade.black_market_contact.maxLevel'),
    modsPerLevel: {}, unlocks: 'blackMarket',
  },
  {
    id: 'auto_chain', name: 'Auto-Chain',
    description: 'A hero keeps taking the next contract on their own instead of waiting for orders — for a while. Each level lets the streak run longer before it needs a fresh send.',
    baseCost: Tuning.get('upgrade.auto_chain.baseCost'),
    costGrowth: Tuning.get('upgrade.auto_chain.costGrowth'),
    maxLevel: Tuning.get('upgrade.auto_chain.maxLevel'),
    modsPerLevel: {}, unlocks: 'autoChain',
  },
  {
    id: 'raid_charter', name: 'Raid Charter',
    description: 'A standing agreement to send the guild in force, not just a hero at a time. Unlocks Normal-difficulty raids -- longer, harder, and paid out per encounter cleared rather than all at once.',
    // Cut from 15000 -- this was gating the entire raid system behind a
    // cost that felt out of step with how early Blackford Keep itself is
    // (reqLevel 8). Difficulty is now the real gate, via the two upgrades
    // below, rather than the base Charter price doing double duty as both
    // "can the guild raid at all" and "can it raid at the hardest tiers."
    baseCost: Tuning.get('upgrade.raid_charter.baseCost'),
    costGrowth: Tuning.get('upgrade.raid_charter.costGrowth'),
    maxLevel: Tuning.get('upgrade.raid_charter.maxLevel'),
    modsPerLevel: {}, unlocks: 'raids',
  },
  {
    id: 'raid_heroic_clearance', name: 'Heroic Clearance',
    description: 'Formal sign-off to run raids at Heroic difficulty -- harsher odds, longer expeditions, and loot worth the extra risk.',
    baseCost: Tuning.get('upgrade.raid_heroic_clearance.baseCost'),
    costGrowth: Tuning.get('upgrade.raid_heroic_clearance.costGrowth'),
    maxLevel: Tuning.get('upgrade.raid_heroic_clearance.maxLevel'),
    modsPerLevel: {}, unlocks: 'raidsHeroic',
  },
  {
    id: 'raid_mythic_clearance', name: 'Mythic Clearance',
    description: "The guild's word that it can handle Mythic difficulty -- the hardest raiding gets, and the only tier where the very best loot actually drops.",
    baseCost: Tuning.get('upgrade.raid_mythic_clearance.baseCost'),
    costGrowth: Tuning.get('upgrade.raid_mythic_clearance.costGrowth'),
    maxLevel: Tuning.get('upgrade.raid_mythic_clearance.maxLevel'),
    modsPerLevel: {}, unlocks: 'raidsMythic',
  },
  {
    id: 'potion_belt', name: 'Potion Belt',
    description: "Extra loops and pouches on a hero's kit -- room to carry more into a quest without digging through the stash first.",
    // Base slot count (1) lives in ModifierManager.consumableSlots as the
    // floor; this upgrade's 2 levels take it to a max of 3, matching the
    // backlog's "1 base, up to 3 via upgrade" spec exactly.
    baseCost: Tuning.get('upgrade.potion_belt.baseCost'),
    costGrowth: Tuning.get('upgrade.potion_belt.costGrowth'),
    maxLevel: Tuning.get('upgrade.potion_belt.maxLevel'),
    modsPerLevel: {}, consumableSlotsPerLevel: Tuning.get('upgrade.potion_belt.consumableSlotsPerLevel'),
  },
  {
    id: 'nest_expansion', name: 'Nest Expansion',
    description: "More room in the Hatchery for eggs to incubate at once -- doesn't speed up any single one, just lets more happen in parallel.",
    // Base (1, pets.baseIncubationSlots via ModifierManager.incubationSlots)
    // starts deliberately low -- the 2nd nest is meant to be this upgrade's
    // own first purchase, not something every player already has. 3 levels
    // take it to a max of 4.
    baseCost: Tuning.get('upgrade.nest_expansion.baseCost'),
    costGrowth: Tuning.get('upgrade.nest_expansion.costGrowth'),
    maxLevel: Tuning.get('upgrade.nest_expansion.maxLevel'),
    modsPerLevel: {}, incubationSlotsPerLevel: Tuning.get('upgrade.nest_expansion.incubationSlotsPerLevel'),
  },
  {
    id: 'companion_bond', name: 'Companion Bond',
    description: 'A second (then third) pet can accompany the guild at once, each contributing its own bonus.',
    // Same "1 base, more via upgrade" shape as Potion Belt -- base slot (1)
    // lives in ModifierManager.petSlots as the floor.
    baseCost: Tuning.get('upgrade.companion_bond.baseCost'),
    costGrowth: Tuning.get('upgrade.companion_bond.costGrowth'),
    maxLevel: Tuning.get('upgrade.companion_bond.maxLevel'),
    modsPerLevel: {}, petSlotsPerLevel: Tuning.get('upgrade.companion_bond.petSlotsPerLevel'),
  },
  {
    id: 'board_runner', name: 'Board Runner',
    description: "A retained courier who'll fetch a fresh set of contracts on request -- extra free quest-board rerolls per day before the price starts climbing.",
    // Base (1 free/day) lives in ModifierManager.questFreeRerolls as the
    // floor. 3 levels take it to 4 total, matching the "up to 4" spec.
    baseCost: Tuning.get('upgrade.board_runner.baseCost'),
    costGrowth: Tuning.get('upgrade.board_runner.costGrowth'),
    maxLevel: Tuning.get('upgrade.board_runner.maxLevel'),
    modsPerLevel: {}, questFreeRerollsPerLevel: Tuning.get('upgrade.board_runner.questFreeRerollsPerLevel'),
  },
  {
    id: 'trade_favor', name: 'Trade Favor',
    description: 'A standing favor with every stall in the market -- extra free restocks per day before you start paying the vendors to hurry.',
    // Same shape as Board Runner, independent counter -- see
    // ModifierManager.vendorFreeRerolls.
    baseCost: Tuning.get('upgrade.trade_favor.baseCost'),
    costGrowth: Tuning.get('upgrade.trade_favor.costGrowth'),
    maxLevel: Tuning.get('upgrade.trade_favor.maxLevel'),
    modsPerLevel: {}, vendorFreeRerollsPerLevel: Tuning.get('upgrade.trade_favor.vendorFreeRerollsPerLevel'),
  },
  {
    id: 'board_warden', name: 'Board Warden',
    description: "A standing order to hold one contract back from the board's own churn -- freeze it in place through the next refresh, reroll, or restock. Each level buys an extra freeze per day; letting a contract go is always free.",
    // Base (1 freeze per day) lives in ModifierManager.freezeChangesPerDay
    // as the floor. 2 levels take it to 3 total, matching the "up to 3
    // times" spec. Freezing itself never costs gold -- only the daily
    // number of times a *new* contract can be frozen is gated, same "free
    // action, limited frequency" shape as the reroll systems' free-tier
    // count. Unfreezing is deliberately NOT gated by this at all -- see
    // QuestManager.unfreezeOffer -- so running out of freezes for the day
    // can never trap a player holding one they no longer want.
    baseCost: Tuning.get('upgrade.board_warden.baseCost'),
    costGrowth: Tuning.get('upgrade.board_warden.costGrowth'),
    maxLevel: Tuning.get('upgrade.board_warden.maxLevel'),
    modsPerLevel: {}, freezeChangesPerLevel: Tuning.get('upgrade.board_warden.freezeChangesPerLevel'),
  },
  {
    id: 'vitality_training', name: 'Vitality Training',
    description: 'Conditioning that has nothing to do with winning a fight and everything to do with surviving one.',
    baseCost: Tuning.get('upgrade.vitality_training.baseCost'),
    costGrowth: Tuning.get('upgrade.vitality_training.costGrowth'),
    maxLevel: Tuning.get('upgrade.vitality_training.maxLevel'),
    modsPerLevel: { health: Tuning.get('upgrade.vitality_training.healthPerLevel') },
  },
  {
    id: 'undertakers_favor', name: "Undertaker's Favor",
    description: 'A standing arrangement -- the guild pays less to bring someone back, whether or not it ever needs to.',
    baseCost: Tuning.get('upgrade.undertakers_favor.baseCost'),
    costGrowth: Tuning.get('upgrade.undertakers_favor.costGrowth'),
    maxLevel: Tuning.get('upgrade.undertakers_favor.maxLevel'),
    modsPerLevel: { revivalDiscount: Tuning.get('upgrade.undertakers_favor.discountPerLevel') },
  },
];

/**
 * Auto-Chain quest-count range per upgrade level, indexed 1-4. A streak's
 * actual length is rolled within this range each time a fresh one starts
 * (via a manual send), so the exact stopping point stays a little
 * unpredictable rather than a metronomic "always exactly 3."
 */
export const AUTO_CHAIN_RANGES: Record<number, { min: number; max: number }> = {
  1: { min: Tuning.get('auto_chain_range.1.min'), max: Tuning.get('auto_chain_range.1.max') },
  2: { min: Tuning.get('auto_chain_range.2.min'), max: Tuning.get('auto_chain_range.2.max') },
  3: { min: Tuning.get('auto_chain_range.3.min'), max: Tuning.get('auto_chain_range.3.max') },
  4: { min: Tuning.get('auto_chain_range.4.min'), max: Tuning.get('auto_chain_range.4.max') },
};

/* --------------------------------- vendors --------------------------------- */

export interface VendorDef {
  id: VendorId;
  name: string;
  blurb: string;
}

export const VENDORS: VendorDef[] = [
  { id: 'blacksmith', name: 'The Blacksmith', blurb: 'Weapons, armour, and a horse that actually listens.' },
  { id: 'alchemist', name: 'The Alchemist', blurb: 'Salves, remedies, and an eye for what a ruin is really worth.' },
  { id: 'enchanter', name: 'The Enchanter', blurb: 'Old books, older favours, and a taste for the theatrical.' },
];

const VENDOR_LEVEL_BASE_COST = Tuning.get('vendor_level.baseCost');
const VENDOR_LEVEL_COST_GROWTH = Tuning.get('vendor_level.costGrowth');

/** Every upgrade a given vendor offers, in the fixed order they unlock at vendor levels 1, 2, 3... */
export function vendorUpgrades(vendorId: VendorId): UpgradeDef[] {
  return UPGRADES.filter((u) => u.vendor === vendorId);
}

/**
 * Applied to every leveled cost formula in this file (upgrades, guild
 * facilities, renown perks, vendor levels) -- a guild's very first purchase
 * of anything costs a fraction of the "real" formula price, then the
 * discount fades out over the next few levels until the original curve
 * takes back over completely. This is a spending-side fix only; nothing
 * about quest rewards changes, so it can't shift which difficulty tier is
 * "worth" farming relative to another -- it just makes the early game less
 * of a wall before any of that economy gets to matter.
 */
const EARLY_TIER_DISCOUNT = [
  Tuning.get('early_tier_discount.level0'),
  Tuning.get('early_tier_discount.level1'),
  Tuning.get('early_tier_discount.level2'),
  Tuning.get('early_tier_discount.level3'),
]; // level 4+ = 1.0, full price

export function earlyTierDiscount(level: number): number {
  return level < EARLY_TIER_DISCOUNT.length ? EARLY_TIER_DISCOUNT[level] : 1;
}

/** Cost to raise a vendor from currentLevel to currentLevel+1, or null if they're already at their cap. */
export function vendorLevelCost(vendorId: VendorId, currentLevel: number): number | null {
  const cap = vendorUpgrades(vendorId).length;
  if (currentLevel >= cap) return null;
  return Math.floor(VENDOR_LEVEL_BASE_COST * Math.pow(VENDOR_LEVEL_COST_GROWTH, currentLevel) * earlyTierDiscount(currentLevel));
}

/** Whether a specific upgrade is currently visible/purchasable given the vendor's level. */
export function isVendorUpgradeUnlocked(vendorLevel: number, vendorId: VendorId, upgradeId: string): boolean {
  const list = vendorUpgrades(vendorId);
  const index = list.findIndex((u) => u.id === upgradeId);
  if (index === -1) return true; // not a vendor upgrade at all -- not gated
  return vendorLevel >= index + 1;
}

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function upgradeCost(def: UpgradeDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel) * earlyTierDiscount(currentLevel));
}

/* ------------------------------- guild hall ------------------------------- */

// Every baseCost/costGrowth/maxLevel and the single modsPerLevel effect
// strength below reads from the tuning registry (tuning.json) rather than
// being a literal -- editable live via the devtool's Tuning tab without
// touching this file. Same "beyond raid coefficients" expansion the
// backlog flagged, mirroring raid_speed's exact pattern in
// raidUpgrades.ts. storagePerLevel and heroSlotsPerLevel stay hardcoded
// deliberately -- structural fields (how many currencies/systems a
// facility touches), not balance knobs someone tunes live, same
// distinction raid_speed already draws by leaving its own structural
// fields (which currency, how many tiers) untouched.
export const GUILD_FACILITIES: GuildDef[] = [
  {
    id: 'barracks', name: 'Barracks',
    description: 'Training yard and drill sergeant. Every hero fights better.',
    baseCost: Tuning.get('guild_facility.barracks.baseCost'),
    costGrowth: Tuning.get('guild_facility.barracks.costGrowth'),
    maxLevel: Tuning.get('guild_facility.barracks.maxLevel'),
    modsPerLevel: { success: Tuning.get('guild_facility.barracks.successPerLevel') },
  },
  {
    id: 'treasury', name: 'Treasury',
    description: 'Raises how much gold the guild can hold at once.',
    baseCost: Tuning.get('guild_facility.treasury.baseCost'),
    costGrowth: Tuning.get('guild_facility.treasury.costGrowth'),
    maxLevel: Tuning.get('guild_facility.treasury.maxLevel'),
    modsPerLevel: { gold: Tuning.get('guild_facility.treasury.goldPerLevel') },
    storagePerLevel: 5000,
  },
  {
    id: 'workshop', name: 'Workshop',
    description: 'Gear wears down more slowly and upgrades cost less.',
    baseCost: Tuning.get('guild_facility.workshop.baseCost'),
    costGrowth: Tuning.get('guild_facility.workshop.costGrowth'),
    maxLevel: Tuning.get('guild_facility.workshop.maxLevel'),
    modsPerLevel: { durability: Tuning.get('guild_facility.workshop.durabilityPerLevel') },
  },
  {
    id: 'library', name: 'Library',
    description: 'Maps, bestiaries, and a very patient archivist.',
    baseCost: Tuning.get('guild_facility.library.baseCost'),
    costGrowth: Tuning.get('guild_facility.library.costGrowth'),
    maxLevel: Tuning.get('guild_facility.library.maxLevel'),
    modsPerLevel: { xp: Tuning.get('guild_facility.library.xpPerLevel') },
  },
  {
    id: 'tavern', name: 'Tavern',
    description: 'Where new heroes are found. Each level opens a hero slot.',
    baseCost: Tuning.get('guild_facility.tavern.baseCost'),
    costGrowth: Tuning.get('guild_facility.tavern.costGrowth'),
    maxLevel: Tuning.get('guild_facility.tavern.maxLevel'),
    modsPerLevel: { loot: Tuning.get('guild_facility.tavern.lootPerLevel') },
    heroSlotsPerLevel: 1,
  },
  {
    id: 'infirmary', name: 'Infirmary',
    description: 'A cot, clean bandages, and someone who knows how to use '
      + 'them. Heroes recover from Health loss faster -- and at its best, '
      + "no one stays down for good without you choosing it.",
    baseCost: Tuning.get('guild_facility.infirmary.baseCost'),
    costGrowth: Tuning.get('guild_facility.infirmary.costGrowth'),
    maxLevel: Tuning.get('guild_facility.infirmary.maxLevel'),
    // No generic Modifiers bonus -- Infirmary's effect (heal-time
    // reduction, and the free auto-revive unlock at max level) isn't
    // expressible as a flat Modifiers key, same reasoning Tavern's own
    // heroSlotsPerLevel already uses instead of a mod.
    modsPerLevel: {},
    healTimeReductionMinutesPerLevel: Tuning.get('guild_facility.infirmary.healTimeReductionMinutesPerLevel'),
  },
];

export const GUILD_BY_ID: Record<string, GuildDef> = Object.fromEntries(GUILD_FACILITIES.map((g) => [g.id, g]));

/**
 * Minutes for a hero to fully heal Health while idle at the guild, at a
 * given Infirmary level. 60 minutes at level 0, -10 per level, floored at
 * 10 -- Infirmary's own maxLevel (5) is exactly the number of -10 steps
 * needed to walk 60 down to that floor with nothing wasted, so this
 * doesn't need re-deriving if maxLevel ever changes; it already reads
 * from the same Tuning values the facility's own cost curve uses. See
 * guild-idler-status.md's Health stat + Fallen/death mechanic section.
 */
export function infirmaryHealTimeMinutes(infirmaryLevel: number): number {
  const base = Tuning.get('guild_facility.infirmary.baseHealTimeMinutes');
  const perLevel = GUILD_BY_ID.infirmary?.healTimeReductionMinutesPerLevel ?? 0;
  const min = Tuning.get('guild_facility.infirmary.minHealTimeMinutes');
  return Math.max(min, base - perLevel * infirmaryLevel);
}

/**
 * Free auto-revive for Fallen heroes is deliberately NOT available below
 * Infirmary's max level -- pay-to-skip (see HeroManager's revival cost)
 * is the only path until this facility is fully built. Reaching max
 * level is what turns it on, at guild_facility.infirmary.autoReviveHours.
 */
export function infirmaryAutoReviveUnlocked(infirmaryLevel: number): boolean {
  const max = GUILD_BY_ID.infirmary?.maxLevel ?? Infinity;
  return infirmaryLevel >= max;
}

export function guildCost(def: GuildDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel) * earlyTierDiscount(currentLevel));
}

export const BASE_GOLD_STORAGE = 10_000;

/* ----------------------------- renown perks ------------------------------ */

export const RENOWN_PERKS: RenownPerkDef[] = [
  {
    id: 'renowned_skill', name: 'Renowned Skill',
    description: 'Every retired knight leaves behind hard-won technique.',
    // Every numeric field here reads from the tuning registry
    // (tuning.json) rather than being a literal -- editable live via the
    // devtool's Tuning tab without touching this file. See tuning.ts.
    cost: Tuning.get('renown_perk.renowned_skill.cost'),
    costGrowth: Tuning.get('renown_perk.renowned_skill.costGrowth'),
    maxLevel: Tuning.get('renown_perk.renowned_skill.maxLevel'),
    modsPerLevel: { success: Tuning.get('renown_perk.renowned_skill.successPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.renowned_skill.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.renowned_skill.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.renowned_skill.tier2CostGrowth'),
      unlockFlavour: 'The old masters take on students of their own.',
    },
  },
  {
    id: 'legacy_of_wealth', name: 'Legacy of Wealth',
    description: 'The guild coffers remember better days.',
    cost: Tuning.get('renown_perk.legacy_of_wealth.cost'),
    costGrowth: Tuning.get('renown_perk.legacy_of_wealth.costGrowth'),
    maxLevel: Tuning.get('renown_perk.legacy_of_wealth.maxLevel'),
    modsPerLevel: { gold: Tuning.get('renown_perk.legacy_of_wealth.goldPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.legacy_of_wealth.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.legacy_of_wealth.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.legacy_of_wealth.tier2CostGrowth'),
      unlockFlavour: 'Word of the guild reaches courts that used to ignore it.',
    },
  },
  {
    id: 'swift_legend', name: 'Swift Legend',
    description: 'Reputation opens gates that used to take days.',
    cost: Tuning.get('renown_perk.swift_legend.cost'),
    costGrowth: Tuning.get('renown_perk.swift_legend.costGrowth'),
    maxLevel: Tuning.get('renown_perk.swift_legend.maxLevel'),
    modsPerLevel: { speed: Tuning.get('renown_perk.swift_legend.speedPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.swift_legend.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.swift_legend.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.swift_legend.tier2CostGrowth'),
      unlockFlavour: 'Roads that were never built start showing up on the map.',
    },
  },
  {
    id: 'collectors_eye', name: "Collector's Eye",
    description: 'You know exactly what is worth carrying home.',
    cost: Tuning.get('renown_perk.collectors_eye.cost'),
    costGrowth: Tuning.get('renown_perk.collectors_eye.costGrowth'),
    maxLevel: Tuning.get('renown_perk.collectors_eye.maxLevel'),
    modsPerLevel: { loot: Tuning.get('renown_perk.collectors_eye.lootPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.collectors_eye.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.collectors_eye.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.collectors_eye.tier2CostGrowth'),
      unlockFlavour: 'Things that should stay buried start feeling curious about you too.',
    },
  },
  {
    id: 'enduring_legend', name: 'Enduring Legend',
    description: 'Heroes trained on your legend get hurt far less.',
    cost: Tuning.get('renown_perk.enduring_legend.cost'),
    costGrowth: Tuning.get('renown_perk.enduring_legend.costGrowth'),
    maxLevel: Tuning.get('renown_perk.enduring_legend.maxLevel'),
    modsPerLevel: { injuryResist: Tuning.get('renown_perk.enduring_legend.injuryResistPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.enduring_legend.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.enduring_legend.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.enduring_legend.tier2CostGrowth'),
      unlockFlavour: 'New recruits flinch less on their first day than veterans used to on their hundredth.',
    },
  },
  {
    id: 'extra_banner', name: 'Extra Banner',
    description: 'A permanent additional hero slot.',
    cost: Tuning.get('renown_perk.extra_banner.cost'),
    costGrowth: Tuning.get('renown_perk.extra_banner.costGrowth'),
    maxLevel: Tuning.get('renown_perk.extra_banner.maxLevel'),
    modsPerLevel: {}, heroSlotsPerLevel: Tuning.get('renown_perk.extra_banner.heroSlotsPerLevel'),
    // Deliberately no tier2: hero slots stay a small, fixed number rather
    // than scaling indefinitely — the roster is meant to stay a roster.
  },
  {
    id: 'scholars_legacy', name: "Scholar's Legacy",
    description: 'New heroes learn from every campaign that came before.',
    cost: Tuning.get('renown_perk.scholars_legacy.cost'),
    costGrowth: Tuning.get('renown_perk.scholars_legacy.costGrowth'),
    maxLevel: Tuning.get('renown_perk.scholars_legacy.maxLevel'),
    modsPerLevel: { xp: Tuning.get('renown_perk.scholars_legacy.xpPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.scholars_legacy.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.scholars_legacy.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.scholars_legacy.tier2CostGrowth'),
      unlockFlavour: 'The guild library runs out of shelf space again.',
    },
  },
  {
    id: 'vital_legacy', name: 'Vital Legacy',
    description: 'Every retired knight leaves the ones still standing a little harder to put down.',
    cost: Tuning.get('renown_perk.vital_legacy.cost'),
    costGrowth: Tuning.get('renown_perk.vital_legacy.costGrowth'),
    maxLevel: Tuning.get('renown_perk.vital_legacy.maxLevel'),
    modsPerLevel: { health: Tuning.get('renown_perk.vital_legacy.healthPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.vital_legacy.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.vital_legacy.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.vital_legacy.tier2CostGrowth'),
      unlockFlavour: 'The old wounds that used to end a career barely slow one down now.',
    },
  },
];

export const RENOWN_BY_ID: Record<string, RenownPerkDef> = Object.fromEntries(RENOWN_PERKS.map((p) => [p.id, p]));

/** The real level ceiling for a perk, accounting for tier 2 if it has one. */
export function renownEffectiveMaxLevel(def: RenownPerkDef): number {
  return def.tier2?.maxLevel ?? def.maxLevel;
}

export function renownCost(def: RenownPerkDef, currentLevel: number): number {
  if (def.tier2 && currentLevel >= def.maxLevel) {
    const tier2Level = currentLevel - def.maxLevel;
    return Math.max(1, Math.floor(def.tier2.startCost * Math.pow(def.tier2.costGrowth, tier2Level)));
  }
  return Math.max(1, Math.floor(def.cost * Math.pow(def.costGrowth, currentLevel) * earlyTierDiscount(currentLevel)));
}

/* ------------------------------ hero classes ----------------------------- */

export interface HeroClassDef {
  id: HeroClass;
  name: string;
  blurb: string;
  baseStats: Stats;
  growth: Stats;
  mods: Partial<Modifiers>;
  /** Bonus success on preferred quest tags. */
  preferred: QuestTag[];
  preferredBonus: number;
  /** Tavern level needed to recruit. */
  unlockTavernLevel: number;
  /** Baseline power tier 0-3; higher hires start stronger to justify the cost. */
  tier: number;
  names: string[];
  /**
   * Unset for every base-game class (recruitable at HERO_CLASSES/
   * RECRUIT_COST's own values, exactly as today). Set to a DLC pack id
   * for a class that only exists once that pack is owned -- same shape
   * as SkinDef.requiresDlc/PetDef.requiresDlc. A DLC class's own recruit
   * cost lives in that pack's own manifest (DlcPackManifest.recruitCosts)
   * rather than the base RECRUIT_COST record, since RECRUIT_COST stays a
   * closed lookup for the 9 base classes only -- see DlcManager.
   * recruitCost for the merged, DLC-aware version.
   */
  requiresDlc?: string;
}

export const HERO_CLASSES: Record<HeroClass, HeroClassDef> = {
  adventurer: {
    id: 'adventurer', name: 'Adventurer', blurb: 'No banner, no order, just grit and a willingness to go first. The guild starts here.',
    baseStats: { strength: 6, endurance: 6, luck: 3, wisdom: 3 },
    growth: { strength: 1.2, endurance: 1.1, luck: 0.4, wisdom: 0.4 },
    mods: { injuryResist: 5 }, preferred: ['combat', 'defense'], preferredBonus: 6,
    unlockTavernLevel: 0, tier: 0,
    names: ['Finn', 'Robin', 'Cade', 'Briar', 'Wren Ashfield'],
  },
  knight: {
    id: 'knight', name: 'Knight', blurb: 'Sworn, drilled, and reliable in a way freelancers rarely are. Cheap for what it brings.',
    baseStats: { strength: 6, endurance: 7, luck: 2, wisdom: 3 },
    growth: { strength: 1.15, endurance: 1.25, luck: 0.3, wisdom: 0.4 },
    mods: { injuryResist: 10 }, preferred: ['combat', 'defense'], preferredBonus: 8,
    unlockTavernLevel: 0, tier: 0,
    names: ['Sir Pip', 'Sir Bramble', 'Dame Orla', 'Sir Corwin', 'Dame Wren'],
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf Warrior', blurb: 'A wall with an axe. Almost impossible to put down, in no particular hurry.',
    baseStats: { strength: 7, endurance: 9, luck: 2, wisdom: 3 },
    growth: { strength: 1.1, endurance: 1.5, luck: 0.3, wisdom: 0.5 },
    mods: { injuryResist: 22, durability: 15, speed: -12 }, preferred: ['defense'], preferredBonus: 12,
    unlockTavernLevel: 1, tier: 1,
    names: ['Brenna', 'Durgan', 'Thora', 'Balin', 'Greta Stoneheel'],
  },
  gladiator: {
    id: 'gladiator', name: 'Gladiator', blurb: 'Sword, net, and a bow for the ones that run. Fast and greedy for spoils.',
    baseStats: { strength: 7, endurance: 5, luck: 6, wisdom: 3 },
    growth: { strength: 1.1, endurance: 0.8, luck: 1.0, wisdom: 0.4 },
    mods: { speed: 12, loot: 5, gold: 8 }, preferred: ['combat', 'explore'], preferredBonus: 8,
    unlockTavernLevel: 1, tier: 1,
    names: ['Marcus', 'Livia', 'Crixus', 'Vela', 'Otho the Swift'],
  },
  samurai: {
    id: 'samurai', name: 'Samurai', blurb: 'One clean strike. Prizes a perfect kill and the rare blade it earns.',
    baseStats: { strength: 9, endurance: 6, luck: 5, wisdom: 5 },
    growth: { strength: 1.4, endurance: 0.9, luck: 0.7, wisdom: 0.7 },
    mods: { success: 6, loot: 8 }, preferred: ['combat'], preferredBonus: 12,
    unlockTavernLevel: 2, tier: 2,
    names: ['Kaede', 'Hiroshi', 'Ayame', 'Takeshi', 'Rin of the Reed'],
  },
  witch: {
    id: 'witch', name: 'Witch', blurb: 'Hexes, bargains, and a nose for what a ruin is really worth. Fragile.',
    baseStats: { strength: 3, endurance: 4, luck: 8, wisdom: 8 },
    growth: { strength: 0.5, endurance: 0.6, luck: 1.3, wisdom: 1.3 },
    mods: { loot: 12, gold: 22, injuryResist: -10 }, preferred: ['arcane', 'stealth'], preferredBonus: 12,
    unlockTavernLevel: 2, tier: 2,
    names: ['Morwenna', 'Hazel', 'Sybil', 'Nettle', 'Old Agatha'],
  },
  lizardman: {
    id: 'lizardman', name: 'Lizardman', blurb: 'Scales, claws, and a swamp-born refusal to die. Little sense for coin.',
    baseStats: { strength: 8, endurance: 8, luck: 4, wisdom: 3 },
    growth: { strength: 1.3, endurance: 1.3, luck: 0.5, wisdom: 0.3 },
    mods: { success: 8, injuryResist: 15, gold: -12 }, preferred: ['combat', 'explore'], preferredBonus: 10,
    unlockTavernLevel: 3, tier: 3,
    names: ['Sythiss', 'Vorak', 'Xala', 'Threelk', 'Marsh-King Ozz'],
  },
  pyromancer: {
    id: 'pyromancer', name: 'Pyromancer', blurb: 'Answers every problem with fire. Devastating, and made of paper.',
    baseStats: { strength: 4, endurance: 3, luck: 5, wisdom: 10 },
    growth: { strength: 0.5, endurance: 0.4, luck: 0.8, wisdom: 1.7 },
    mods: { xp: 30, gold: 25, injuryResist: -15 }, preferred: ['arcane'], preferredBonus: 16,
    unlockTavernLevel: 3, tier: 3,
    names: ['Ignatia', 'Cinder', 'Ravan', 'Ember', 'Lord Vaylen'],
  },
  wizard: {
    id: 'wizard', name: 'Wizard', blurb: 'Decades of study in a pointed hat. Unmatched on anything arcane.',
    baseStats: { strength: 3, endurance: 4, luck: 5, wisdom: 12 },
    growth: { strength: 0.4, endurance: 0.6, luck: 0.7, wisdom: 1.9 },
    mods: { xp: 25, success: 5, loot: 6, injuryResist: -6 }, preferred: ['arcane', 'explore'], preferredBonus: 14,
    unlockTavernLevel: 4, tier: 3,
    names: ['Alaric', 'Merewyn', 'Cassius', 'Elspeth', 'Grand Magus Vorn'],
  },
};

export const RECRUIT_COST: Record<HeroClass, number> = {
  // Knight and Dwarf cut significantly -- the pacing math showed a fresh
  // guild needed ~2 weeks of real time just to afford a 3-hero party at the
  // old prices, almost entirely due to compounding Tavern + recruit costs.
  // Everything from Gladiator up is untouched; the early on-ramp specifically
  // was the problem, not the overall curve.
  // Adventurer priced at 150g (was 0) -- a free recruit sounds generous but
  // was a real trap: normal retirement requires level 30, so a player who
  // filled a slot with a free Adventurer had no way to ever get that slot
  // back except levelling that specific hero all the way up, even if they
  // immediately regretted the pick. Early Retirement (see PrestigeManager)
  // is the actual fix for the trap -- this price just stops "free" from
  // reading as "no real cost to filling a slot" in the first place.
  adventurer: 150, knight: 150,
  dwarf: 500, gladiator: 1500,
  samurai: 5000, witch: 6500,
  lizardman: 16000, pyromancer: 20000, wizard: 32000,
};

/**
 * Higher-tier heroes are expensive, so they start ahead: a fresh hire begins at
 * this level with stat points already banked, rather than at level 1. Combined
 * with per-hero training gifts (bonusStats) this lets a late recruit stay
 * relevant instead of spending days catching up.
 */
export const RECRUIT_START_LEVEL: Record<number, number> = {
  0: 1, 1: 3, 2: 8, 3: 15,
};

/* -------------------------------- skins --------------------------------- */

export interface SkinDef {
  id: string;
  name: string;
  description: string;
  /** Flat gold price; every skin costs the same regardless of class.
   *  Meaningless for a DLC skin (see requiresDlc below) -- Steam
   *  ownership gates those, not gold, so `cost` on a DLC entry is
   *  cosmetic-only text ("free once you own the pack") rather than
   *  something ShopManager ever actually charges. */
  cost: number;
  /** Small swatch colours for the shop UI. */
  swatch: [string, string];
  /**
   * Unset for every base-game skin (gold-purchasable, always available).
   * Set to a DLC pack id for a skin that only exists once that pack is
   * owned -- see DlcManager.owns. A skin entry with this set can still
   * ship in the base game's own SKINS array (so the shop/picker UI knows
   * it exists and can show it as locked), but its actual sprite files
   * only arrive on disk once Steam installs the owned DLC depot; nothing
   * about this field alone makes content appear or disappear.
   */
  requiresDlc?: string;
}

export const SKIN_PRICE = 3500;

export const SKINS: SkinDef[] = [
  { id: 'original', name: 'Original', description: 'The colours they arrived in. Always owned.', cost: 0, swatch: ['#8e8e8e', '#c0c0c0'] },
  { id: 'necrotic', name: 'Necrotic', description: 'Graveyard greens and a violet pallor.', cost: SKIN_PRICE, swatch: ['#3aa55d', '#7a4fa0'] },
  { id: 'holy', name: 'Holy', description: 'Bleached white and gilded edges.', cost: SKIN_PRICE, swatch: ['#fff6d9', '#e8c250'] },
  { id: 'infernal', name: 'Infernal', description: 'Ember reds banked over black.', cost: SKIN_PRICE, swatch: ['#c0331e', '#e07a2a'] },
  { id: 'frost', name: 'Frost', description: 'Glacier blues and pale teal.', cost: SKIN_PRICE, swatch: ['#5aa8d8', '#79c0c0'] },
];

export const SKIN_BY_ID: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

/* ---------------------------- tombstone styles --------------------------- */

/**
 * Purely cosmetic -- a global choice (not per-hero, unlike skins above),
 * since going Fallen is meant to stay rare enough that a per-hero
 * picker would be overkill. One style applies to whichever hero falls.
 * Same gold-sink shape as skins (buy once, unlocked forever, pick freely
 * among owned styles) -- see engine.buyTombstoneStyle/selectTombstoneStyle
 * and guild-idler-status.md's Health-related gold sinks entry.
 */
export interface TombstoneStyleDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** Filename under public/hero-status/ -- see the Tombstone component's
   *  own comment in HeroesPanel.tsx for the graceful-missing-asset
   *  fallback (shows a plain skull glyph until the real file exists). */
  icon: string;
}

export const TOMBSTONE_STYLES: TombstoneStyleDef[] = [
  {
    id: 'plain', name: 'Plain Marker',
    description: 'The one you already have. Always owned.',
    cost: 0, icon: 'tombstone.png',
  },
  {
    id: 'mossy', name: 'Mossy Marker',
    description: 'Reclaimed by moss and time, like something the ground decided to keep.',
    cost: 400, icon: 'tombstone-mossy.png',
  },
  {
    id: 'ornate', name: 'Ornate Monument',
    description: 'A grander marker than most heroes get. Premature, but appreciated.',
    cost: 1200, icon: 'tombstone-ornate.png',
  },
  {
    id: 'cursed', name: 'Cursed Headstone',
    description: 'Something about it makes people not want to look at it directly.',
    cost: 3000, icon: 'tombstone-cursed.png',
  },
];

export const TOMBSTONE_STYLE_BY_ID: Record<string, TombstoneStyleDef> = Object.fromEntries(
  TOMBSTONE_STYLES.map((s) => [s.id, s]),
);

/* ----------------------------- level curve ------------------------------ */

export function xpForLevel(level: number): number {
  // Revised after playtesting: 4.6/1.55 fixed the late-game blowup (the
  // original 55/1.55 curve simulated to ~1,540 days for a full 1->55 +
  // all-chains playthrough) but overcorrected the early game -- level 1->2
  // only cost 4 XP, so a single Easy quest skipped past two levels
  // instantly ("4 quests to level 6"). 15/1.15 keeps mid-to-late levels
  // almost unchanged from the 4.6/1.55 curve (level 20 needs 470 XP here
  // vs 477 there), but raises early levels to a meaningful fraction of a
  // quest's worth of XP instead of a rounding error. Full playthrough time
  // simulates to ~3.8 months, still comfortably inside the target range.
  return Math.floor(15 * Math.pow(level, 1.15));
}

export const PRESTIGE_MIN_LEVEL = 30;

/** Renown granted for retiring a hero at a given level. */
export function renownForRetirement(level: number, totalQuests: number): number {
  if (level < PRESTIGE_MIN_LEVEL) return 0;
  return Math.max(1, Math.floor(Math.pow(level - PRESTIGE_MIN_LEVEL + 1, 0.75) + totalQuests / 150));
}

/* ------------------------------ prestige streak ---------------------------- */

/** Retiring again within this window of the last retirement extends the streak. */
export const PRESTIGE_STREAK_WINDOW_MS = 72 * 60 * 60 * 1000; // 3 days
const PRESTIGE_STREAK_BONUS_PER_STEP = 5; // percent
const PRESTIGE_STREAK_BONUS_CAP = 50; // percent, reached at streak 11

/** Percentage bonus applied to renown gained, based on the current streak. */
export function prestigeStreakBonusPct(streak: number): number {
  return Math.min((Math.max(1, streak) - 1) * PRESTIGE_STREAK_BONUS_PER_STEP, PRESTIGE_STREAK_BONUS_CAP);
}

/* -------------------------------- ascension -------------------------------- */

/** Flat permanent stat bonus per ascension level, applied to every stat. */
export const ASCENSION_STAT_BONUS = 1;

const ASCENSION_RANKS: { min: number; name: string }[] = [
  { min: 10, name: 'Living Legend' },
  { min: 6, name: 'Elder' },
  { min: 3, name: 'Veteran' },
];

/** The rank label for a given ascension count, or null below the first threshold. */
export function ascensionRank(ascension: number): string | null {
  for (const rank of ASCENSION_RANKS) {
    if (ascension >= rank.min) return rank.name;
  }
  return null;
}
