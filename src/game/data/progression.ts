import { GuildDef, HeroClass, Modifiers, QuestTag, RenownPerkDef, Role, RoleDef, Stats, UpgradeDef, VendorId } from '../types';
import { Tuning } from './tuning';

/* --------------------------- permanent upgrades --------------------------- */

export const UPGRADES: UpgradeDef[] = [
  // Every baseCost/costGrowth/maxLevel and per-level bonus value below
  // reads from the tuning registry (tuning.json, category
  // 'vendor_upgrades') rather than being a literal -- editable live via
  // the devtool's Tuning tab without touching this file. See tuning.ts.
  // --- Vendor Upgrades Consolidation (see guild-idler-status.md) ---
  // weapons_training/armourers_contract/veteran_explorer/war_stories/
  // efficient_adventuring used to hand out the exact same generic
  // Success/Durability/Loot/XP/Gold bonuses the Guild Hall facilities
  // below already grant, just gated behind a second, unrelated grind.
  // That power is folded into Barracks/Workshop/Tavern/Library/Treasury
  // instead (see those facilities' own comments), and every vendor slot
  // it used to occupy is replaced with something actually themed to
  // that vendor's own services. Existing saves are refunded the gold
  // they spent on the removed upgrades -- see SaveManager migration 37.
  {
    id: 'smiths_discount', name: "Smith's Discount",
    description: "A standing account with the Blacksmith -- Repair costs less the longer you've kept it open.",
    baseCost: Tuning.get('upgrade.smiths_discount.baseCost'),
    costGrowth: Tuning.get('upgrade.smiths_discount.costGrowth'),
    maxLevel: Tuning.get('upgrade.smiths_discount.maxLevel'),
    modsPerLevel: { repairDiscount: Tuning.get('upgrade.smiths_discount.repairDiscountPerLevel') }, vendor: 'blacksmith',
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
    id: 'trade_favor_blacksmith', name: 'Trade Favor: Blacksmith',
    description: "A standing favor with the Blacksmith -- extra free gear restocks per day before you start paying to hurry.",
    baseCost: Tuning.get('upgrade.trade_favor_blacksmith.baseCost'),
    costGrowth: Tuning.get('upgrade.trade_favor_blacksmith.costGrowth'),
    maxLevel: Tuning.get('upgrade.trade_favor_blacksmith.maxLevel'),
    modsPerLevel: {}, vendorFreeRerollsPerLevel: Tuning.get('upgrade.trade_favor_blacksmith.vendorFreeRerollsPerLevel'), vendor: 'blacksmith',
  },
  {
    id: 'bulk_scrapper', name: 'Bulk Scrapper',
    description: "The Blacksmith's own trick for breaking gear down efficiently -- bonus Scrap on everything you scrap.",
    baseCost: Tuning.get('upgrade.bulk_scrapper.baseCost'),
    costGrowth: Tuning.get('upgrade.bulk_scrapper.costGrowth'),
    maxLevel: Tuning.get('upgrade.bulk_scrapper.maxLevel'),
    modsPerLevel: { scrapBonus: Tuning.get('upgrade.bulk_scrapper.scrapBonusPerLevel') }, vendor: 'blacksmith',
  },
  {
    id: 'apothecary_discount', name: "Apothecary's Discount",
    description: 'A regular customer discount at the Alchemist -- every potion and charm costs a little less.',
    baseCost: Tuning.get('upgrade.apothecary_discount.baseCost'),
    costGrowth: Tuning.get('upgrade.apothecary_discount.costGrowth'),
    maxLevel: Tuning.get('upgrade.apothecary_discount.maxLevel'),
    modsPerLevel: { consumableDiscount: Tuning.get('upgrade.apothecary_discount.consumableDiscountPerLevel') }, vendor: 'alchemist',
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
    id: 'trade_favor_alchemist', name: 'Trade Favor: Alchemist',
    description: "A standing favor with the Alchemist -- extra free supply restocks per day before you start paying to hurry.",
    baseCost: Tuning.get('upgrade.trade_favor_alchemist.baseCost'),
    costGrowth: Tuning.get('upgrade.trade_favor_alchemist.costGrowth'),
    maxLevel: Tuning.get('upgrade.trade_favor_alchemist.maxLevel'),
    modsPerLevel: {}, vendorFreeRerollsPerLevel: Tuning.get('upgrade.trade_favor_alchemist.vendorFreeRerollsPerLevel'), vendor: 'alchemist',
  },
  {
    id: 'arcane_discount', name: 'Arcane Discount',
    description: "The Enchanter's own courtesy rate -- Weapon Enchanting and Armour Infusion cost less, gems included.",
    baseCost: Tuning.get('upgrade.arcane_discount.baseCost'),
    costGrowth: Tuning.get('upgrade.arcane_discount.costGrowth'),
    maxLevel: Tuning.get('upgrade.arcane_discount.maxLevel'),
    modsPerLevel: { enchantDiscount: Tuning.get('upgrade.arcane_discount.enchantDiscountPerLevel') }, vendor: 'enchanter',
  },
  {
    id: 'trade_favor_enchanter', name: 'Trade Favor: Enchanter',
    description: "A standing favor with the Enchanter -- an extra free early Black Market turnover per day before you start paying to hurry.",
    baseCost: Tuning.get('upgrade.trade_favor_enchanter.baseCost'),
    costGrowth: Tuning.get('upgrade.trade_favor_enchanter.costGrowth'),
    maxLevel: Tuning.get('upgrade.trade_favor_enchanter.maxLevel'),
    modsPerLevel: {}, vendorFreeRerollsPerLevel: Tuning.get('upgrade.trade_favor_enchanter.vendorFreeRerollsPerLevel'), vendor: 'enchanter',
  },
  {
    id: 'master_adventurer', name: 'Enchanted Seal',
    description: 'A ward pressed into the guild charter unlocks Legendary contracts on the quest board -- and the Enchanter throws in a standing discount on Black Market prices, guild to guild.',
    baseCost: Tuning.get('upgrade.master_adventurer.baseCost'),
    costGrowth: Tuning.get('upgrade.master_adventurer.costGrowth'),
    maxLevel: Tuning.get('upgrade.master_adventurer.maxLevel'),
    modsPerLevel: { blackMarketDiscount: Tuning.get('upgrade.master_adventurer.blackMarketDiscountPerLevel') }, unlocks: 'legendaryQuests', vendor: 'enchanter',
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
    id: 'training_grounds', name: 'Training Grounds',
    description: "After Blackford Keep, the guild stopped treating a hero's battlefield role as fixed at recruitment. Funds a proper Training Grounds -- reassign any hero between Melee, Ranged, and Caster from one dedicated spot, instead of guessing from a class name.",
    // No `vendor` field -- same treatment as raid_charter/guild_charter/
    // black_market_contact just above and below: a one-time unlock, not
    // vendor-gated stock, so it shows in GuildPanel's general upgrades
    // list automatically. Also purchasable directly from the Training
    // tab's own locked screen via the same buyUpgrade('training_grounds')
    // call -- see TrainingPanel.tsx -- so a player never has to already
    // know to look in Guild Hall for it.
    baseCost: Tuning.get('upgrade.training_grounds.baseCost'),
    costGrowth: Tuning.get('upgrade.training_grounds.costGrowth'),
    maxLevel: Tuning.get('upgrade.training_grounds.maxLevel'),
    modsPerLevel: {}, unlocks: 'training',
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
    // id fully renamed as of patch 0166 (was 'raid_mythic_clearance',
    // display-only-renamed in patch 0165) -- confirmed with testers first
    // that no save has this upgrade purchased yet, so no migration needed
    // for the id change itself. See guild-idler-status.md's patch 0166
    // entry for the full sweep this was part of.
    id: 'raid_legendary_clearance', name: 'Legendary Clearance',
    description: "The guild's word that it can handle Legendary difficulty -- the hardest raiding gets, and the only tier where the very best loot actually drops.",
    baseCost: Tuning.get('upgrade.raid_legendary_clearance.baseCost'),
    costGrowth: Tuning.get('upgrade.raid_legendary_clearance.costGrowth'),
    maxLevel: Tuning.get('upgrade.raid_legendary_clearance.maxLevel'),
    modsPerLevel: {}, unlocks: 'raidsLegendary',
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
  {
    id: 'companion_vitality', name: 'Companion Vitality',
    description: "The same idea as Vitality Training, just aimed at whoever's riding along instead of whoever's swinging the sword.",
    baseCost: Tuning.get('upgrade.companion_vitality.baseCost'),
    costGrowth: Tuning.get('upgrade.companion_vitality.costGrowth'),
    maxLevel: Tuning.get('upgrade.companion_vitality.maxLevel'),
    modsPerLevel: { petHealth: Tuning.get('upgrade.companion_vitality.petHealthPerLevel') },
  },
  {
    id: 'kennel_keepers_favor', name: "Kennel Keeper's Favor",
    description: "Undertaker's Favor's own arrangement, extended to cover the guild's companions too.",
    baseCost: Tuning.get('upgrade.kennel_keepers_favor.baseCost'),
    costGrowth: Tuning.get('upgrade.kennel_keepers_favor.costGrowth'),
    maxLevel: Tuning.get('upgrade.kennel_keepers_favor.maxLevel'),
    modsPerLevel: { petRevivalDiscount: Tuning.get('upgrade.kennel_keepers_favor.discountPerLevel') },
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
    // successPerLevel absorbed the Blacksmith's old Better Weapons
    // Training vendor upgrade (and Enchanted Seal's old success bonus)
    // as part of the Vendor Upgrades Consolidation -- 3%/level -> 4%,
    // same 10-level cap, so the combined total (43%) barely moves (40%)
    // while costing what it used to cost to max Barracks *alone*
    // (costGrowth bumped 1.8 -> 1.87 to land close to what it used to
    // cost to grind all three sources together instead). See
    // guild-idler-status.md's Vendor Upgrades Consolidation entry for
    // the full worked numbers.
    baseCost: Tuning.get('guild_facility.barracks.baseCost'),
    costGrowth: Tuning.get('guild_facility.barracks.costGrowth'),
    maxLevel: Tuning.get('guild_facility.barracks.maxLevel'),
    modsPerLevel: { success: Tuning.get('guild_facility.barracks.successPerLevel') },
  },
  {
    id: 'treasury', name: 'Treasury',
    description: 'Raises how much gold the guild can hold at once.',
    // goldPerLevel absorbed the old Efficient Adventuring general
    // upgrade (which was never even vendor-tied) as part of the Vendor
    // Upgrades Consolidation -- 4%/level -> 12%, same 12-level mods cap,
    // landing at almost exactly what it used to cost to max both
    // sources (costGrowth bumped 1.74 -> 1.79). See
    // guild-idler-status.md's Vendor Upgrades Consolidation entry.
    baseCost: Tuning.get('guild_facility.treasury.baseCost'),
    costGrowth: Tuning.get('guild_facility.treasury.costGrowth'),
    // Extended 12 -> 20: Treasury is meant to keep working as a gold sink
    // (storage headroom) well past where its other, "real" balance
    // effects should keep growing. storagePerLevel below stays uncapped
    // and structural, same as before -- levels 13-20 are purely about
    // storage headroom, not more gold%. See modsMaxLevel below and
    // ModifierManager.guildMods for how that's actually enforced.
    maxLevel: Tuning.get('guild_facility.treasury.maxLevel'),
    modsPerLevel: { gold: Tuning.get('guild_facility.treasury.goldPerLevel') },
    // Gold% bonus still stops scaling at the old level-12 ceiling even
    // though the facility itself now goes to 20 -- levels 13-20 buy pure
    // storage, nothing else. Without this, extending maxLevel alone would
    // have silently taken Treasury's own gold bonus from 48% to 80% on
    // top of Efficient Adventuring's separate gold track, compounding the
    // exact kind of stacked-bonus bloat this pass is trying to trim
    // elsewhere (see Library/Runic Insight below). Hardcoded rather than
    // tuning-driven, same "structural, not a balance knob" reasoning
    // storagePerLevel/heroSlotsPerLevel already use.
    modsMaxLevel: 12,
    storagePerLevel: 5000,
  },
  {
    id: 'workshop', name: 'Workshop',
    description: 'Gear wears down more slowly and upgrades cost less.',
    // durabilityPerLevel absorbed the Blacksmith's old Armourer's
    // Contract vendor upgrade as part of the Vendor Upgrades
    // Consolidation -- 8%/level -> 14%, same 10-level cap, landing at
    // almost exactly what it used to cost to max both sources
    // (costGrowth bumped 1.85 -> 1.87). See guild-idler-status.md's
    // Vendor Upgrades Consolidation entry.
    baseCost: Tuning.get('guild_facility.workshop.baseCost'),
    costGrowth: Tuning.get('guild_facility.workshop.costGrowth'),
    maxLevel: Tuning.get('guild_facility.workshop.maxLevel'),
    modsPerLevel: { durability: Tuning.get('guild_facility.workshop.durabilityPerLevel') },
  },
  {
    id: 'library', name: 'Library',
    description: 'Maps, bestiaries, and a very patient archivist.',
    // xpPerLevel absorbed the Enchanter's old Runic Insight vendor
    // upgrade as part of the Vendor Upgrades Consolidation -- 6%/level
    // -> 12%, same 10-level cap, landing at almost exactly what it used
    // to cost to max both sources (costGrowth bumped 1.84 -> 1.9). See
    // guild-idler-status.md's Vendor Upgrades Consolidation entry.
    baseCost: Tuning.get('guild_facility.library.baseCost'),
    costGrowth: Tuning.get('guild_facility.library.costGrowth'),
    maxLevel: Tuning.get('guild_facility.library.maxLevel'),
    modsPerLevel: { xp: Tuning.get('guild_facility.library.xpPerLevel') },
  },
  {
    id: 'tavern', name: 'Tavern',
    description: 'Where new heroes are found. Each level opens a hero slot.',
    // lootPerLevel absorbed the Alchemist's old Alchemical Assay vendor
    // upgrade as part of the Vendor Upgrades Consolidation -- 2%/level
    // -> 7%, level cap bumped 5 -> 6 (a straight same-level-count fold
    // landed too cheap here, since Tavern's own curve is much steeper
    // than Alchemical Assay's was -- see guild-idler-status.md's Vendor
    // Upgrades Consolidation entry for the worked numbers behind both
    // the level bump and the costGrowth bump, 2.4 -> 2.47).
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
  {
    id: 'kennel', name: 'Kennel',
    description: 'A warm, dry place for a companion to actually rest, rather than just '
      + 'trailing along injured. Entirely separate from the Infirmary -- pets get '
      + 'their own corner of the guild, not a shared cot.',
    baseCost: Tuning.get('guild_facility.kennel.baseCost'),
    costGrowth: Tuning.get('guild_facility.kennel.costGrowth'),
    maxLevel: Tuning.get('guild_facility.kennel.maxLevel'),
    // Same reasoning as Infirmary: heal-time reduction and the free
    // auto-revive unlock at max level aren't flat Modifiers bonuses.
    modsPerLevel: {},
    healTimeReductionMinutesPerLevel: Tuning.get('guild_facility.kennel.healTimeReductionMinutesPerLevel'),
  },
  {
    id: 'physicians_charity', name: "Physician's Charity",
    description: 'The guild covers the first Treat of every day, no questions asked -- '
      + "everyone's gear and grit wear down eventually, and a hero shouldn't have to "
      + 'choose between paying for a cure and paying for anything else.',
    baseCost: Tuning.get('guild_facility.physicians_charity.baseCost'),
    costGrowth: Tuning.get('guild_facility.physicians_charity.costGrowth'),
    maxLevel: Tuning.get('guild_facility.physicians_charity.maxLevel'),
    // Not a flat Modifiers bonus -- see GuildDef.freeHealsPerLevel's own
    // comment.
    modsPerLevel: {},
    freeHealsPerLevel: Tuning.get('guild_facility.physicians_charity.freeHealsPerLevel'),
  },
  {
    id: 'smiths_charity', name: "Smith's Charity",
    description: "The guild smith fixes the first broken buckle or dulled edge of the day "
      + 'for free -- Physician\'s Charity\'s twin, for gear instead of injuries.',
    baseCost: Tuning.get('guild_facility.smiths_charity.baseCost'),
    costGrowth: Tuning.get('guild_facility.smiths_charity.costGrowth'),
    maxLevel: Tuning.get('guild_facility.smiths_charity.maxLevel'),
    modsPerLevel: {},
    freeRepairsPerLevel: Tuning.get('guild_facility.smiths_charity.freeRepairsPerLevel'),
  },
  // Music Hall (buy a level, unlock a track) removed -- bard tracks are
  // now earned as scattered rewards across quests/raids/achievements/
  // Grimsby instead of bought outright. See music.ts and
  // ACHIEVEMENT_BY_ID[id].unlocksTrackId. `state.guild.music_hall` is
  // left as a harmless frozen field on GameState/GuildFacility purely so
  // SaveManager's migration 40 can read a legacy level off it one last
  // time to grandfather already-leveled players -- nothing writes to it
  // anymore, and it no longer appears in this list, so it can never
  // increase again.
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

/** Pet-specific parallel to infirmaryHealTimeMinutes -- fully separate
 *  facility, own Tuning values, same formula shape. */
export function kennelHealTimeMinutes(kennelLevel: number): number {
  const base = Tuning.get('guild_facility.kennel.baseHealTimeMinutes');
  const perLevel = GUILD_BY_ID.kennel?.healTimeReductionMinutesPerLevel ?? 0;
  const min = Tuning.get('guild_facility.kennel.minHealTimeMinutes');
  return Math.max(min, base - perLevel * kennelLevel);
}

/** Pet-specific parallel to infirmaryAutoReviveUnlocked. */
export function kennelAutoReviveUnlocked(kennelLevel: number): boolean {
  const max = GUILD_BY_ID.kennel?.maxLevel ?? Infinity;
  return kennelLevel >= max;
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
  {
    id: 'companion_legacy', name: 'Companion Legacy',
    description: 'Vital Legacy, extended to whoever rides along -- every retirement toughens the guild\'s companions too.',
    cost: Tuning.get('renown_perk.companion_legacy.cost'),
    costGrowth: Tuning.get('renown_perk.companion_legacy.costGrowth'),
    maxLevel: Tuning.get('renown_perk.companion_legacy.maxLevel'),
    modsPerLevel: { petHealth: Tuning.get('renown_perk.companion_legacy.petHealthPerLevel') },
    tier2: {
      maxLevel: Tuning.get('renown_perk.companion_legacy.tier2MaxLevel'),
      startCost: Tuning.get('renown_perk.companion_legacy.tier2StartCost'),
      costGrowth: Tuning.get('renown_perk.companion_legacy.tier2CostGrowth'),
      unlockFlavour: "Even a scrap of the guild's fortune is enough to keep a companion standing.",
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
   * Native combat role -- see types.ts's Role for the full reasoning.
   * Fixed per class, only ever changed per-hero via Training
   * (HeroManager.trainRole), never here. Required (every base and DLC
   * class needs one) rather than optional-with-fallback, matching how
   * every other structural field on this def (baseStats, growth,
   * preferred, tier) is already required.
   */
  role: Role;
  /**
   * Display name per role -- native role's own entry should equal
   * `name` above; the other two are the flavour names Training swaps
   * the hero card's summary line to (see HeroManager.roleDisplayName).
   * Required, all three keys, matching this game's own "full naming
   * pass across every class" requirement for shipping the roles
   * feature -- see guild-idler-status.md's hero-roles backlog entry.
   */
  roleFlavors: Record<Role, string>;
  /**
   * Per-role flavour text to match roleFlavors' per-role name -- direct
   * request: since a hero's role name already changes per class (a Melee
   * Wizard reads as "Arcane Swordster," not "Melee"), the description
   * shown alongside it should too, rather than one generic paragraph per
   * role shared across every class. Required, all three keys, same
   * "full pass across every class" requirement roleFlavors itself
   * already has -- see the Hero Training tab's RoleCard (TrainingPanel.tsx)
   * for the one place this actually renders.
   */
  roleDescriptions: Record<Role, string>;
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

/**
 * HERO_CLASSES lives in json/hero-classes.json so it can be edited via
 * tools/devtool without touching TypeScript -- same pattern DIFFICULTIES
 * (quests.ts) already established. This was the single largest remaining
 * DevTool coverage gap in the game: the actual playable hero roster --
 * base stats, per-level growth curves, class mods, preferred-tag bonuses,
 * tavern unlock gates, and each class's 5-name pool -- was fully
 * hardcoded TypeScript with zero DevTool/Tuning access.
 *
 * `baseStats`/`growth` reuse the DevTool's existing generic `stats` field
 * type (already used by equipment.json's own `stats` field); `mods`
 * reuses the existing generic `mods` field type. Neither needed any new
 * DevTool machinery. `preferred` (a list of QuestTags) needed one small
 * new field type, `questTagList` -- the exact same shape `modKeyList`/
 * `statKeyList` already have for their own key-list fields, just
 * validated against the tag enum instead. See server.mjs's own
 * `questTagList` case and app.js's matching support.
 *
 * `RECRUIT_COST` is migrated separately (json/recruit-costs.json), not
 * folded into this file -- DlcManager.ts already documents exactly why:
 * recruit cost is deliberately kept as its own record alongside
 * HERO_CLASSES (and DLC packs follow the same split via their own
 * `recruitCosts` field), so merging it into HeroClassDef here would
 * fight that existing design rather than match it.
 *
 * Both HERO_CLASSES and RECRUIT_COST are reconstructed as
 * `Record<HeroClass, X>` at import time, matching every existing call
 * site exactly (`HERO_CLASSES[cls]`, `Object.keys(HERO_CLASSES)`,
 * `Object.values(HERO_CLASSES)`, `classId in HERO_CLASSES`, all used
 * across HeroManager/GuildManager/QuestManager/AchievementManager/
 * DlcManager/HeroesPanel) -- confirmed none of those call sites needed
 * to change, since a plain object built via Object.fromEntries behaves
 * identically to one written as a literal. Class order in the JSON
 * matches the original literal's order exactly, so `Object.keys`/
 * `Object.values` iteration order (which several UI call sites rely on
 * for display order) is unchanged.
 */
import heroClassesJson from './json/hero-classes.json';
export const HERO_CLASSES: Record<HeroClass, HeroClassDef> = Object.fromEntries(
  (heroClassesJson as HeroClassDef[]).map((c) => [c.id, c]),
) as Record<HeroClass, HeroClassDef>;

/**
 * Kept separate from HERO_CLASSES above -- see this section's own top
 * comment for why. Same Record-reconstruction pattern.
 *
 * Knight and Dwarf were cut significantly -- the pacing math showed a
 * fresh guild needed ~2 weeks of real time just to afford a 3-hero party
 * at the old prices, almost entirely due to compounding Tavern + recruit
 * costs. Everything from Gladiator up is untouched; the early on-ramp
 * specifically was the problem, not the overall curve.
 * Adventurer is priced at 150g (was 0) -- a free recruit sounds generous
 * but was a real trap: normal retirement requires level 30, so a player
 * who filled a slot with a free Adventurer had no way to ever get that
 * slot back except levelling that specific hero all the way up, even if
 * they immediately regretted the pick. Early Retirement (see
 * PrestigeManager) is the actual fix for the trap -- this price just
 * stops "free" from reading as "no real cost to filling a slot" in the
 * first place.
 */
import recruitCostsJson from './json/recruit-costs.json';
export const RECRUIT_COST: Record<HeroClass, number> = Object.fromEntries(
  (recruitCostsJson as { id: string; cost: number }[]).map((r) => [r.id, r.cost]),
) as Record<HeroClass, number>;

/**
 * Higher-tier heroes are expensive, so they start ahead: a fresh hire begins at
 * this level with stat points already banked, rather than at level 1. Combined
 * with per-hero training gifts (bonusStats) this lets a late recruit stay
 * relevant instead of spending days catching up.
 *
 * Lives in json/recruit-start-level.json (devtool-editable, new
 * `recruit-start-level` content type) rather than a hardcoded Record --
 * same small-flat-list treatment recruit-costs.json already got. Each
 * entry is `{id, tier, startLevel}`; `tier` is the actual lookup key
 * (matches HeroClassDef.tier), `id` exists only because the generic
 * id-keyed editor every other content type here uses requires one.
 */
import recruitStartLevelJson from './json/recruit-start-level.json';
export const RECRUIT_START_LEVEL: Record<number, number> = Object.fromEntries(
  (recruitStartLevelJson as { id: string; tier: number; startLevel: number }[]).map((r) => [r.tier, r.startLevel]),
);

/* --------------------------------- roles --------------------------------- */

/**
 * Roles live in json/roles.json (devtool-editable, new `roles` content
 * type -- see server.mjs) so an icon swap doesn't need a code patch, same
 * reasoning as every other content type in this game. Exactly 3 entries,
 * fixed -- unlike VENDORS this isn't expected to ever grow, but kept as
 * data rather than a hardcoded TS array anyway purely so the icon field
 * gets the existing DevTool icon picker for free.
 */
import rolesJson from './json/roles.json';
export const ROLES: RoleDef[] = rolesJson as RoleDef[];
export const ROLE_BY_ID: Record<Role, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<Role, RoleDef>;

/**
 * Training cost -- two-tier, same "base + per-level" shape
 * revivalCost/recruitCost already use. Unlocking a role a hero has never
 * held before (first entry into Hero.unlockedRoles) is a real decision,
 * priced accordingly; swapping back and forth between roles already
 * unlocked is meant to be closer to a repair bill -- cheap, repeatable,
 * no limit. See HeroManager.roleCost for the read side (which of the two
 * curves applies) and guild-idler-status.md's hero-roles backlog entry
 * for the full reasoning.
 */
export function roleUnlockCost(level: number): number {
  return Math.floor(Tuning.get('role.unlockBaseCost') + Tuning.get('role.unlockCostPerLevel') * level);
}
export function roleSwapCost(level: number): number {
  return Math.floor(Tuning.get('role.swapBaseCost') + Tuning.get('role.swapCostPerLevel') * level);
}

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

/** Flat gold price for a purchasable (non-DLC) skin -- tuning registry
 *  ('progression.skinPrice'), same devtool-editable convention every
 *  other standalone numeric constant in this file is migrating to. */
export const SKIN_PRICE = Tuning.get('progression.skinPrice');

/**
 * Lives in json/skins.json (devtool-editable, new `skins` content type)
 * rather than a hardcoded array -- same reasoning as tombstone-styles.json
 * before it: a new skin, or a swatch/price tweak on an existing one,
 * shouldn't need a code patch. Each entry's own `cost` is now a literal
 * on disk rather than reading SKIN_PRICE directly (Original stays 0,
 * every purchasable skin stays 3500 as authored) -- editing
 * `progression.skinPrice` in Tuning changes future intent, not these
 * already-authored entries; keeping them in sync is a manual edit here,
 * same as any other content file's numbers not being formula-derived.
 */
import skinsJson from './json/skins.json';
export const SKINS: SkinDef[] = skinsJson as SkinDef[];

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

// Lives in json/tombstone-styles.json, same devtool-editable-content-file
// convention peddler-cards.json/equipment.json/etc. already use -- moved
// out of a hardcoded array specifically so new styles (or icon swaps on
// existing ones) don't need a code patch. See server.mjs's own
// 'tombstone-styles' schema entry.
import tombstoneStylesJson from './json/tombstone-styles.json';
export const TOMBSTONE_STYLES: TombstoneStyleDef[] = tombstoneStylesJson as TombstoneStyleDef[];

export const TOMBSTONE_STYLE_BY_ID: Record<string, TombstoneStyleDef> = Object.fromEntries(
  TOMBSTONE_STYLES.map((s) => [s.id, s]),
);

/* ----------------------------- level curve ------------------------------ */

// XP curve, fully tuning-driven since patch 0173 (previously two bare
// literals). base * level^exponent is the same shape the curve has always
// had; xpCurveMultiplier layers a piecewise-linear "how much more than
// that shape alone" scalar on top, defined by breakpoint level/multiplier
// pairs. Below the lowest breakpoint's level the multiplier holds flat at
// that breakpoint's own value; between breakpoints it ramps linearly, so a
// designer can make levels progressively cost more without any level
// suddenly costing a visibly different amount than its neighbor; above the
// highest breakpoint it holds flat at that breakpoint's multiplier rather
// than extrapolating past the last defined point.
//
// Patch 0174 generalized this from a fixed 5-slot pair of parallel arrays
// (indexed, order-dependent) to a sorted list of {level, multiplier}
// pairs -- exactly the "6th breakpoint is a real, deliberately small
// follow-up" noted in patch 0173's own version of this comment, now
// actually needed. Sorting at construction time means new breakpoints can
// be registered in any order (their Tuning ids don't need to stay in level
// order) and a future 8th/9th point is just one more entry in this list
// plus two more Tuning registrations, not a restructure.
//
// Still a fixed-length list of named Tuning entries, not a variable-length
// array field -- the Tuning registry's whole convention is a flat,
// individually-editable id/value entry per coefficient (see tuning.ts's
// own header comment), not a structured array type. Adding a breakpoint
// is still a (small) code change, just a much smaller one than before.
//
// Current shape, agreed through several rounds of design discussion (see
// guild-idler-status.md's full writeup, including the level-gate audit --
// Prestige, Legendary tier, every raid -- confirming nothing is blocked by
// slowing the 50-55 stretch down): a marginal 1.25x from level 1, ramping
// through 30/35/40/45/50 with a steadily accelerating slope, then a real
// slog into 55 -- landing on ~62 days to hit the level cap with 5 heroes
// in the Balance Sandbox's Active preset, roughly double patch 0173's own
// ~31 days under the same conditions, confirmed by direct sim rather than
// computed by hand.
const XP_CURVE_BASE = Tuning.get('progression.xpCurveBase');
const XP_CURVE_EXPONENT = Tuning.get('progression.xpCurveExponent');
const XP_BREAKPOINTS = [
  { level: Tuning.get('progression.xpBreakLevel1'), multiplier: Tuning.get('progression.xpBreakMultiplier1') },
  { level: Tuning.get('progression.xpBreakLevel2'), multiplier: Tuning.get('progression.xpBreakMultiplier2') },
  { level: Tuning.get('progression.xpBreakLevel3'), multiplier: Tuning.get('progression.xpBreakMultiplier3') },
  { level: Tuning.get('progression.xpBreakLevel4'), multiplier: Tuning.get('progression.xpBreakMultiplier4') },
  { level: Tuning.get('progression.xpBreakLevel5'), multiplier: Tuning.get('progression.xpBreakMultiplier5') },
  { level: Tuning.get('progression.xpBreakLevel6'), multiplier: Tuning.get('progression.xpBreakMultiplier6') },
  { level: Tuning.get('progression.xpBreakLevel7'), multiplier: Tuning.get('progression.xpBreakMultiplier7') },
].sort((a, b) => a.level - b.level);

/**
 * The hard level cap -- derived from the breakpoints themselves (the
 * highest `level` among them, currently breakpoint 5 at 55) rather than a
 * second, separately-tuned number. The curve already "holds flat above
 * the highest breakpoint rather than extrapolating past it" (see this
 * file's own comment on XP_BREAKPOINTS above) -- a hero level 55+ was
 * always meant to be the design's actual ceiling (see guild-idler-status
 * .md's XP curve retune, "day 62 to hit the level cap"), it just wasn't
 * literally enforced anywhere before now. Deriving it here instead of
 * adding a parallel `progression.maxHeroLevel` Tuning entry means it can
 * never drift out of sync with wherever the curve's own top breakpoint
 * actually sits if that's retuned later -- the exact kind of two-sources-
 * of-truth bug this codebase has hit before (see MenuWindow.tsx's
 * isTabVisible writeup for a recent example of the same class of issue).
 * Retirement's own minimum level (PRESTIGE_MIN_LEVEL, below) is
 * deliberately a separate, independently-tuned number, not derived from
 * this one -- pushing retirement back to require the level cap was a
 * design choice about progression pacing, not a consequence of the cap's
 * own existence.
 */
export const MAX_HERO_LEVEL = Math.max(...XP_BREAKPOINTS.map((b) => b.level));

function xpCurveMultiplier(level: number): number {
  if (level <= XP_BREAKPOINTS[0].level) return XP_BREAKPOINTS[0].multiplier;
  for (let i = 1; i < XP_BREAKPOINTS.length; i++) {
    if (level <= XP_BREAKPOINTS[i].level) {
      const lo = XP_BREAKPOINTS[i - 1];
      const hi = XP_BREAKPOINTS[i];
      const t = (level - lo.level) / (hi.level - lo.level);
      return lo.multiplier + (hi.multiplier - lo.multiplier) * t;
    }
  }
  return XP_BREAKPOINTS[XP_BREAKPOINTS.length - 1].multiplier;
}

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
  //
  // That base shape itself is still unchanged as of patch 0174 --
  // xpCurveMultiplier above is a separate layer on top of it, not a
  // replacement, so this original reasoning still describes the
  // underlying curve exactly as written. As of patch 0174 the multiplier
  // is no longer a flat 1.0x for very early levels though (see the
  // breakpoint list's own comment) -- levels 1-19 get a deliberate,
  // marginal 1.25x now, a explicit choice made during this patch's design
  // discussion, not an oversight.
  return Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT) * xpCurveMultiplier(level));
}

export const PRESTIGE_MIN_LEVEL = Tuning.get('progression.prestigeMinLevel');

/**
 * Historical retirement gate this file's own patch-0178 comment flagged --
 * NOT the current gate (PRESTIGE_MIN_LEVEL, now 55, same as MAX_HERO_LEVEL).
 * Before 0178, a hero could retire the moment they hit level 30; the old
 * formula's level-scaling term was Math.pow(level - 30 + 1, 0.75), so
 * cashing out the instant you became eligible earned exactly 1 renown from
 * that term (Math.pow(1, 0.75)), while holding off all the way to the level
 * cap (55) earned Math.pow(26, 0.75) ≈ 11.51 -- roughly 10.51 renown of
 * "extra" purely for waiting. Kept as its own constant (not derived from
 * PRESTIGE_MIN_LEVEL) because it describes a fact about the OLD system; it
 * must NOT silently track PRESTIGE_MIN_LEVEL if that's retuned again later.
 */
const PRE_LEVEL_CAP_RETIRE_MIN_LEVEL = 30;

/**
 * Once 0178 pinned every retirement to the level cap (PRESTIGE_MIN_LEVEL
 * === MAX_HERO_LEVEL), the old level-scaling term above degenerated into a
 * flat constant (Math.pow(1, 0.75) = 1 every single time) -- flagged in
 * that patch's own status.md entry as "a real interaction, not fixed here."
 * Direct follow-up instruction: since retiring below the cap is no longer
 * possible, replace that dead term with a new flat baseline equal to 3/4 of
 * the "extra" a hero would have earned under the OLD formula for holding
 * off and retiring at 55 instead of cashing out the moment they hit the
 * OLD minimum (see PRE_LEVEL_CAP_RETIRE_MIN_LEVEL above) -- i.e. 3/4 of
 * (Math.pow(26, 0.75) - 1) ≈ 3/4 of 10.51 ≈ 7.89. The totalQuests/150 term
 * is untouched; only the level-scaling half of the old formula is being
 * replaced here.
 */
const RETIREMENT_LEVEL_BONUS = 0.75
  * (Math.pow(MAX_HERO_LEVEL - PRE_LEVEL_CAP_RETIRE_MIN_LEVEL + 1, 0.75) - 1);

/** Renown granted for retiring a hero at a given level. */
export function renownForRetirement(level: number, totalQuests: number): number {
  if (level < PRESTIGE_MIN_LEVEL) return 0;
  return Math.max(1, Math.floor(RETIREMENT_LEVEL_BONUS + totalQuests / 150));
}

/* ------------------------------ prestige streak ---------------------------- */

/** Retiring again within this window of the last retirement extends the streak. */
export const PRESTIGE_STREAK_WINDOW_MS = Tuning.get('progression.prestigeStreakWindowMs');
const PRESTIGE_STREAK_BONUS_PER_STEP = Tuning.get('progression.prestigeStreakBonusPerStep'); // percent
const PRESTIGE_STREAK_BONUS_CAP = Tuning.get('progression.prestigeStreakBonusCap'); // percent, reached at streak 11 at the default 5%/step

/** Percentage bonus applied to renown gained, based on the current streak. */
export function prestigeStreakBonusPct(streak: number): number {
  return Math.min((Math.max(1, streak) - 1) * PRESTIGE_STREAK_BONUS_PER_STEP, PRESTIGE_STREAK_BONUS_CAP);
}

/* -------------------------------- ascension -------------------------------- */

/** Flat permanent stat bonus per ascension level, applied to every stat. */
export const ASCENSION_STAT_BONUS = Tuning.get('progression.ascensionStatBonus');

/**
 * Lives in json/ascension-ranks.json (devtool-editable, new
 * `ascension-ranks` content type) rather than a hardcoded array -- a
 * rank name/threshold tweak no longer needs a code patch. Checked in
 * `ascensionRank` below in descending `min` order, same as the original
 * literal's own ordering (highest threshold first) -- the JSON preserves
 * that order and `ascensionRank` still relies on it, not resorted at
 * load time, so a future edit that reorders entries in the file would
 * need to keep them descending by `min` for the "first match wins" logic
 * to still pick the highest qualifying rank.
 */
import ascensionRanksJson from './json/ascension-ranks.json';
const ASCENSION_RANKS: { id: string; min: number; name: string }[] = ascensionRanksJson;

/** The rank label for a given ascension count, or null below the first threshold. */
export function ascensionRank(ascension: number): string | null {
  for (const rank of ASCENSION_RANKS) {
    if (ascension >= rank.min) return rank.name;
  }
  return null;
}
