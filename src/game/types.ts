/* =========================================================================
 * Guildbound — shared type definitions
 * Every manager reads and writes the same GameState shape defined here.
 * ========================================================================= */

export const SAVE_VERSION = 33;

export type Difficulty = 'easy' | 'normal' | 'hard' | 'epic' | 'legendary';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A weapon's infused damage type, or an enemy's own vulnerability/attack
 * type. Deliberately a flat, small set rather than tied to any existing
 * taxonomy (Rarity, Difficulty) -- an element is a property of a weapon,
 * a piece of armor, or a quest/raid encounter, not of a hero or a class.
 */
export type ElementType = 'fire' | 'frost' | 'lightning' | 'poison';

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'shield' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'cloak';

/**
 * One material per Harvest/Gathering node. Deliberately 1:1 with the node
 * itself (the Quarry only ever produces ore, etc.) -- see
 * guild-idler-status.md's "Harvest/Gathering + Crafting" section for the
 * full design this and everything below it implements.
 */
export type MaterialId = 'ore' | 'timber' | 'herbs' | 'fish';

/**
 * Plain string rather than a closed union, same reasoning as HeroSkin --
 * a new hero class (including a future DLC one, see HeroClassDef.
 * requiresDlc) only ever needs a new data entry plus new sprite art, not
 * a code change to this type. Confirmed safe to widen: nothing in the
 * codebase switches or compares on a literal class id, every consumer
 * already goes through a HERO_CLASSES/RECRUIT_COST lookup (or, since
 * this round, DlcManager.heroClassDef/recruitCost for a DLC-aware one).
 */
export type HeroClass = string;

/** Cosmetic recolour skins, applied per hero. */

/**
 * Any skin id from SKINS (progression.ts), plain string rather than a
 * closed union -- a new skin (including a future DLC one, see
 * SkinDef.requiresDlc) only ever needs a new data entry, never a code
 * change to this type. The 5 base skins ('original'/'necrotic'/'holy'/
 * 'infernal'/'frost') aren't enumerated here anymore; SKIN_BY_ID is the
 * actual source of truth for what's valid.
 */
export type HeroSkin = string;

export type HeroStatus = 'idle' | 'questing' | 'resting';

export type QuestTag = 'combat' | 'escort' | 'explore' | 'arcane' | 'stealth' | 'defense';

/** Every numeric modifier in the game funnels through these keys. */
export interface Modifiers {
  /** Flat percentage points added to success chance, e.g. 5 = +5%. */
  success: number;
  /** Multiplier percentage on gold, e.g. 10 = +10% gold. */
  gold: number;
  /** Multiplier percentage on experience. */
  xp: number;
  /** Flat percentage points added to rare loot chance. */
  loot: number;
  /** Flat percentage points removed from injury chance. */
  injuryResist: number;
  /** Percentage reduction of quest duration. */
  speed: number;
  /** Percentage reduction of durability lost per quest. */
  durability: number;
}

export const ZERO_MODS: Modifiers = {
  success: 0, gold: 0, xp: 0, loot: 0, injuryResist: 0, speed: 0, durability: 0,
};

export interface Stats {
  strength: number;
  endurance: number;
  luck: number;
  wisdom: number;
}

/* ----------------------------- items ----------------------------- */

export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  glyph: string;
  /** Relative path under the item-icons folder, same convention as
   *  EquipmentDef.icon -- falls back to `glyph` when unset, same
   *  "missing file just fails to paint, never a broken image" rule. */
  icon?: string;
  effect: {
    success?: number;
    gold?: number;
    /** xp/loot/injuryResist/speed are only ever populated on a
     *  custom-crafted variant (see CraftingManager's consumable path) --
     *  every hand-authored consumable in consumables.json sticks to
     *  success/gold/preventInjury/guaranteedGoodEvent/healInjury. Same
     *  units as Modifiers: xp/gold are % multipliers, loot/injuryResist
     *  are flat percentage points, speed is a % duration reduction. */
    xp?: number;
    loot?: number;
    injuryResist?: number;
    speed?: number;
    /** Unused by any current recipe -- included only so the full
     *  `keyof Modifiers` range types cleanly against this object
     *  (CraftingManager.craftConsumable indexes it generically). */
    durability?: number;
    preventInjury?: boolean;
    guaranteedGoodEvent?: boolean;
    healInjury?: boolean;
  };
}

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  /** Minimum hero level that can equip it. */
  reqLevel: number;
  maxDurability: number;
  mods: Partial<Modifiers>;
  stats?: Partial<Stats>;
  setId?: string;
  /** Base shop price; loot value is derived from it. */
  value: number;
  /**
   * Relative path under public/item-icons/ (e.g. "weapons/sword_03.png"),
   * assigned manually via the devtool's Icon Library. Optional -- items
   * without one fall back to a per-slot placeholder glyph in the UI, so this
   * can be filled in gradually rather than all at once.
   */
  icon?: string;
  /**
   * True for the Heroic/Mythic tiered variants introduced alongside raid
   * loot pools -- these only ever exist to be raid loot table entries and
   * were never meant to be independently purchasable or craftable. Shop
   * and Black Market stock generation both filter this out; a "Mythic"
   * common-tier item showing up for sale never made sense in the first
   * place, since the tier label only means something in the context of
   * which raid difficulty dropped it.
   */
  raidExclusive?: boolean;
  /**
   * True for bases that only ever exist as a Crafting result -- never sold,
   * never dropped as loot. Shop/black-market/loot-table generation all
   * filter this out the same way raidExclusive already gets filtered from
   * the opposite direction (a raid-exclusive item never appears in the
   * shop; a craftable base never appears anywhere BUT crafting). Its own
   * `mods` here should stay empty -- a crafted instance's real mods live on
   * the EquipmentItem itself, see customMods below, not the def.
   */
  craftable?: boolean;
}

/** A concrete item the player owns. */
export interface EquipmentItem {
  uid: string;
  defId: string;
  durability: number;
  /** Number of times upgraded at the workshop. */
  plus: number;
  /**
   * Set only on Crafting results. Overrides the def's own `mods` entirely
   * (a craftable def's `mods` is always empty, see EquipmentDef.craftable)
   * with whichever mod types the player picked at craft time, each at the
   * recipe's fixed strength -- this is the actual point of crafting: choice
   * instead of a random roll. Every other read of an item's mods
   * (HeroManager.equipmentMods, EquipmentPanel's display) checks this first
   * and falls back to the def's mods otherwise, so nothing needs to know
   * whether a given item came from crafting or not beyond that one check.
   */
  customMods?: Partial<Modifiers>;
  /**
   * Set by Enchanting -- additive on top of whatever the def's own `stats`
   * already give (unlike customMods, which replaces rather than adds; an
   * enchantment is a modification of an item you already own, not a fresh
   * roll, so it stacks with what was already there). See
   * HeroManager.equipmentStats for where this actually gets applied.
   */
  enchantStats?: Partial<Stats>;
  /**
   * Set by the Blacksmith's Infuse station, weapon slot only -- the
   * element this weapon deals. A single value, not a set: infusing again
   * with a different element replaces it (this is meant to read as
   * "changing what the weapon is infused with," not stacking multiple
   * damage types onto one blade). See QuestManager.previewSuccess and
   * RaidManager.elementalBonus for where this actually matters -- it
   * matches against a quest/encounter's own `vulnerableTo` list for a
   * success bonus, nullified if the encounter also lists that element
   * under `immuneTo`.
   */
  elementalDamage?: ElementType;
  /**
   * Set by the Blacksmith's Infuse station, non-weapon slots -- how much
   * this piece resists each element, additive per element if infused
   * again (same "stacks with itself" shape EquipmentItem.enchantStats
   * already established, unlike elementalDamage above which replaces).
   * Matches against a quest/encounter's own `dealsElement` list -- framed
   * to the player as extra effective endurance against that element's
   * attacks, mechanically just another additive success contribution.
   */
  elementalResist?: Partial<Record<ElementType, number>>;
}

export interface ItemSet {
  id: string;
  name: string;
  pieces: string[];
  bonuses: { count: number; mods: Partial<Modifiers>; label: string }[];
}

/* ----------------------------- heroes ----------------------------- */

export interface Injury {
  id: string;
  name: string;
  description: string;
  /** Epoch ms when it heals on its own. */
  healsAt: number;
  mods: Partial<Modifiers>;
  treatmentCost: number;
}

export interface Hero {
  id: string;
  name: string;
  heroClass: HeroClass;
  level: number;
  xp: number;
  stats: Stats;
  statPoints: number;
  equipment: Partial<Record<EquipSlot, EquipmentItem>>;
  injuries: Injury[];
  status: HeroStatus;
  activeQuestId: string | null;
  /** Total quests finished by this hero, used for flavour and stats. */
  questsCompleted: number;
  /** Currently worn cosmetic skin. */
  skin: HeroSkin;
  /**
   * Permanent scaling gifts applied to this specific hero from quest rewards
   * and training items — lets an expensive late hire catch up. Flat additions
   * to base stats.
   */
  bonusStats: Stats;
  /** Earned by completing certain quest chains. Cleared on retirement. */
  title?: string;
  /**
   * Times this specific hero identity has been retired. Persists and grows
   * across retirements (unlike title, which is cleared), and grants a small
   * permanent stat bonus via bonusStats — see PrestigeManager.retire.
   */
  ascension: number;
  /** How many quests this hero has auto-chained in the current streak. */
  autoChainCount: number;
  /**
   * How many quests the current streak will run before stopping and prompting
   * for a manual restart, or null if no streak is active (needs a manual
   * send to start one). Rerolled within the upgrade's current tier range each
   * time a fresh streak begins.
   */
  autoChainTarget: number | null;
  /**
   * Consumable defIds currently slotted on this hero -- persistent, not a
   * per-send pick. A quest automatically uses whatever's equipped here
   * rather than needing a loadout chosen at send time (see the Quest Board
   * rework). Capped at ModifierManager.consumableSlots(state), not a fixed
   * array size -- optional so existing saves pre-dating this system don't
   * need HeroManager touched just to add a default; the migration below
   * backfills it to [] for anything already saved.
   */
  equippedConsumables?: string[];
  /**
   * Set when this hero was sent via the "Chain Quest Steps" option on a
   * story-chain offer -- the chainId being auto-advanced. Independent of
   * autoChainTarget/autoChainCount (the ordinary Auto-Chain bounty streak):
   * this hero auto-continues *this specific chain's* remaining stages,
   * regardless of whether the Auto-Chain upgrade is even owned. Cleared the
   * moment the chain finishes (every stage done) or a stage fails -- a
   * failure always stops the chain right there ("as far as you can go"),
   * it never silently retries. Optional/undefined for any hero not
   * currently chain-stepping, same defensive-optional convention as
   * equippedConsumables above -- no migration needed for existing saves.
   */
  autoAdvanceChainId?: string | null;
  /**
   * Day window (see data/reroll.ts's rerollDay -- same UTC-epoch-day
   * division every other daily system in this game already uses) this
   * hero last received the daily first-burst bonus for. A once-per-day
   * event can afford to be generous without reopening the exact
   * dominance problem fastQuestCapsPerHour exists to prevent --
   * repeating it doesn't get you more of it, unlike every other lever in
   * the burst reward formula. Optional/undefined for any hero who hasn't
   * claimed it yet, same defensive-optional convention as
   * equippedConsumables/autoAdvanceChainId above -- no migration needed.
   */
  lastBurstBonusDay?: number;
}

/* ----------------------------- quests ----------------------------- */

export interface LootRoll {
  defId: string;
  chance: number;
}

export interface QuestOffer {
  id: string;
  name: string;
  flavour: string;
  difficulty: Difficulty;
  tag: QuestTag;
  /** Milliseconds. */
  duration: number;
  baseSuccess: number;
  rewardGold: number;
  rewardXp: number;
  loot: LootRoll[];
  reqLevel: number;
  /** Set when this offer is one stage of a chain. */
  chain?: { chainId: string; stage: number; totalStages: number };
  /**
   * Rolled at generation time (see QuestManager.rollElementTags) -- what
   * this quest's opposition is weak to (a matching weapon's
   * elementalDamage adds a success bonus) and what it attacks with (a
   * matching piece of armor's elementalResist adds a bonus in turn).
   * Independent lists, can overlap, either or both can be empty --
   * harder difficulty tiers roll a higher ceiling on how many of each a
   * single offer can carry, not a guarantee of any.
   */
  vulnerableTo?: ElementType[];
  dealsElement?: ElementType[];
}

export interface ActiveQuest {
  id: string;
  heroId: string;
  offer: QuestOffer;
  startedAt: number;
  endsAt: number;
  /** Success chance locked in at departure, after every modifier. */
  finalSuccess: number;
  goldMultiplier: number;
  xpMultiplier: number;
  lootBonus: number;
  injuryResist: number;
  consumables: string[];
  guaranteedGoodEvent: boolean;
}

export interface QuestEventResult {
  id: string;
  name: string;
  description: string;
  kind: 'positive' | 'neutral' | 'negative';
}

export interface QuestResult {
  questId: string;
  heroId: string;
  heroName: string;
  questName: string;
  difficulty: Difficulty;
  success: boolean;
  resolvedAt: number;
  gold: number;
  xp: number;
  loot: { defId: string; name: string; rarity: Rarity }[];
  events: QuestEventResult[];
  injury?: Injury;
  durabilityLost: number;
  brokenItems: string[];
  levelsGained: number;
  chainAdvanced?: { chainId: string; stage: number; totalStages: number; completed: boolean };
  /** An ordinary egg drop rolled this quest, if any -- independent of
   *  hatchXp progress (a freshly-dropped egg goes to storage, unequipped,
   *  not straight into a nest -- see PetManager.grantEgg). Same
   *  optional/not-migrated reasoning as other result-log additions. */
  eggDropped?: { rarity: Rarity };
  /** True when this hero's daily first-burst bonus applied to gold/xp
   *  above (already folded into the numbers, not a separate reward) --
   *  see Hero.lastBurstBonusDay. Purely informational, for the result
   *  modal to call it out. */
  dailyBurstBonus?: boolean;
  /** True when a Critical Burst (see quest.critChance in tuning.json)
   *  multiplied gold/xp above -- already folded into the numbers, purely
   *  informational for the result modal's celebration. Independent of,
   *  and can stack with, dailyBurstBonus on the same quest. */
  critBonus?: boolean;
}

/**
 * Every notification the guild has ever received, archived automatically
 * the moment it's toasted (see GameEngine.say) -- this is the persistent
 * "Notifications" half of the Guide tab. Capped like `log`/`raidLog`.
 */
export interface NotificationEntry {
  id: string;
  message: string;
  timestamp: number;
  /** Optional menu tab this notification is actionable from -- rendered as
   *  a "Go to" button in the Guide tab's Notifications list. Omitted for
   *  messages with no obvious single destination (most of them). */
  targetTab?: string;
}

export interface ActiveChain {
  chainId: string;
  stage: number;
  startedAt: number;
  failedStages: number;
}

/* -------------------------------- raids -------------------------------- */

export type RaidDifficulty = 'normal' | 'heroic' | 'mythic';

export interface RaidEncounterDef {
  id: string;
  name: string;
  flavour: string;
  /** Baseline success chance before difficulty penalty and party modifiers. */
  baseSuccess: number;
  /** Milliseconds -- this encounter's own slice of the raid's total duration. */
  duration: number;
  rewardGold: number;
  rewardXp: number;
  /**
   * "defId@chance" strings, e.g. "dragon_blade@6" -- reuses the devtool's
   * existing plain string-list editor rather than needing a new field type
   * for a repeatable {defId, chance} shape. Parsed via parseLootEntry.
   */
  loot: string[];
  /**
   * Difficulty-specific loot pools, WoW-style -- Heroic/Mythic rolls point
   * at genuinely different (usually stat-boosted) item variants rather than
   * just the same items at a better chance. Optional and independent, so
   * this can roll out encounter by encounter: a tier with no list here
   * falls back to `loot`, the same pool every difficulty used before this
   * existed. See lootForDifficulty in raids.ts.
   */
  lootHeroic?: string[];
  lootMythic?: string[];
  /**
   * "<rarity>[:<dedicatedPetId>]@chance" strings -- same reused-string-list
   * convention as `loot` above (see parseEggLootEntry), just a different
   * token shape since an egg roll picks a Rarity (and optionally locks in
   * a specific dedicated-pool pet) rather than an equipment defId. Rolled
   * independently of `loot`/lootHeroic/lootMythic, same
   * economy.loot/diffCfg.lootBonus scaling either way.
   */
  eggLoot?: string[];
  /**
   * Authored, not rolled -- raid encounters are a small curated list
   * (unlike quest offers, which are procedurally generated per board),
   * so these are hand-set per encounter via the devtool the same way
   * `loot` already is, defaulting to none. Same meaning as QuestOffer's
   * own vulnerableTo/dealsElement -- see RaidManager.elementalBonus.
   */
  vulnerableTo?: ElementType[];
  dealsElement?: ElementType[];
  /**
   * Raid-only -- an element this specific encounter is immune to,
   * nullifying the weapon-matching half of elementalBonus for any hero
   * whose weapon is infused with a listed element (armor's
   * elementalResist side is unaffected; immunity describes the
   * encounter's own resilience, not its attack). "A fire dragon, immune
   * to fire damage" was the motivating example -- no equivalent concept
   * exists for ordinary quest offers.
   */
  immuneTo?: ElementType[];
}

export interface RaidDef {
  id: string;
  name: string;
  /** Prologue, shown before starting and in the Lore tab. */
  description: string;
  epilogue: string;
  reqLevel: number;
  /** Ordered encounter ids -- resolved sequentially, stopping at the first failure. */
  encounterIds: string[];
  /** Completing this raid at any difficulty unlocks this one next, if set. */
  unlocksRaidId?: string;
  /**
   * A quest chain that must appear in state.completedChains before this
   * raid is visible at all -- mirrors ChainDef.requiresChainId's exact
   * reasoning, just gating a raid on a chain instead of a chain on
   * another chain. Independent of unlocksRaidId (raid-to-raid); a raid
   * can be gated by a chain, another raid, both, or neither.
   */
  requiresChainId?: string;
}

export interface RaidDifficultyConfig {
  difficulty: RaidDifficulty;
  /** Exact party size required -- not a minimum. */
  partySize: number;
  /** Flat percentage points subtracted from every encounter's success chance at this difficulty. */
  successPenalty: number;
  /** Multiplies gold/xp rewards. */
  rewardMultiplier: number;
  /**
   * Flat percentage points added to every loot roll at this difficulty --
   * reversed from the original design (which deliberately left loot chance
   * untouched by difficulty, treating more attempts at Normal as the real
   * compensation). Harder tiers now trade success for better odds too, not
   * just bigger gold/xp.
   */
  lootBonus: number;
  /**
   * Multiplies total raid duration -- harder tiers take longer too, not
   * just riskier and better-paying. Applied before the party's own speed
   * factor, which (for raids specifically) no longer includes account-wide
   * quest-speed upgrades like Mounted Travel -- see partyEconomyMods in
   * RaidManager. Guild-wide speed investment collapsing a 9-hour raid to
   * its 25% floor by default wasn't the intended interaction; raids are
   * meant to have their own separate speed levers eventually (dedicated
   * Raid Upgrades), not inherit quest ones for free.
   */
  durationMultiplier: number;
}

/**
 * The raid-only upgrade lever left deliberately empty by 0061 -- a
 * dedicated Raid Guild Upgrade tree, fully separate from the general
 * quest UpgradeDef/GuildDef/RenownPerkDef trees (state.upgrades,
 * state.guild, state.renownPerks). Applied via ModifierManager.raid(),
 * never ModifierManager.global() -- raids intentionally don't inherit
 * quest-side progression for free.
 *
 * Same two-currency shape as RenownPerkDef's tier2 (same upgrade, cost
 * curve changes after a level threshold), extended to also switch
 * *currency*, not just growth rate: levels 1..goldTierMaxLevel cost gold
 * on the usual baseCost*growth^level curve; every level after that costs
 * Renown instead, on its own independent curve. Ties raid power to the
 * prestige loop for the higher tiers, while staying gold-affordable (like
 * everything else early) at the entry point.
 */
export interface RaidUpgradeDef {
  id: string;
  name: string;
  description: string;
  /** Per raid-upgrade level, applied via ModifierManager.raid(). */
  modsPerLevel: Partial<Modifiers>;
  goldBaseCost: number;
  goldCostGrowth: number;
  /** Levels 0..goldTierMaxLevel-1 cost gold; goldTierMaxLevel is also where the Renown tier's own level-0 begins. */
  goldTierMaxLevel: number;
  renownBaseCost: number;
  renownCostGrowth: number;
  /** Absolute level cap across both tiers combined. */
  maxLevel: number;
}

/** A raid attempt in progress. Locked in at commit time, resolved encounter by encounter. */
export interface ActiveRaid {
  raidId: string;
  difficulty: RaidDifficulty;
  heroIds: string[];
  startedAt: number;
  endsAt: number;
  /** Which encounter (index into RaidDef.encounterIds) is currently in progress. */
  currentEncounter: number;
  /**
   * Success chance for the whole run, locked in once at commit time using
   * the weakest-link party calculation -- not recomputed per encounter,
   * since the party doesn't change mid-raid. Each encounter still rolls
   * independently against (its own baseSuccess - difficulty penalty + this).
   */
  partySuccessBonus: number;
}

export interface RaidLootDrop {
  defId: string;
  name: string;
  rarity: Rarity;
  encounterId: string;
}

export interface RaidResult {
  raidId: string;
  raidName: string;
  difficulty: RaidDifficulty;
  heroIds: string[];
  encountersCleared: number;
  totalEncounters: number;
  fullClear: boolean;
  gold: number;
  xp: number;
  loot: RaidLootDrop[];
  /** Eggs rolled off eggLoot entries this run -- separate from loot above
   *  the same way QuestResult.hatchedPets is separate from QuestResult.loot,
   *  since an egg isn't an EquipmentDef drop. Optional, not migrated --
   *  same reasoning as QuestResult.hatchedPets/eggDropped: old raidLog
   *  entries predate this field, and every read already treats a missing
   *  value as "nothing found." */
  eggsFound?: { rarity: Rarity; encounterId: string }[];
  injuries: { heroId: string; heroName: string; injury: Injury }[];
  resolvedAt: number;
}

/* -------------------------- progression -------------------------- */

export type VendorId = 'blacksmith' | 'alchemist' | 'enchanter';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  modsPerLevel: Partial<Modifiers>;
  unlocks?: 'legendaryQuests' | 'chains' | 'blackMarket' | 'autoChain' | 'raids' | 'raidsHeroic' | 'raidsMythic';
  /**
   * Which vendor offers this upgrade. Undefined means it's a general guild
   * upgrade with no vendor attached (unlocks like Guild Charter or Black
   * Market Contact are administrative/structural rather than a craft, so
   * they stay here rather than being forced into one of the three vendors).
   * Vendor upgrades are additionally gated by vendorLevel — see
   * ModifierManager.vendorUpgradeIndex.
   */
  vendor?: VendorId;
  /** Grants this many extra hero consumable-equip slots per level -- same
   *  special-purpose-field pattern as RenownPerkDef.heroSlotsPerLevel and
   *  GuildFacilityDef.storagePerLevel, since a slot count isn't expressible
   *  through the generic Modifiers shape. Only Potion Belt uses this. */
  consumableSlotsPerLevel?: number;
  /** Grants this many extra Hatchery incubation slots per level -- same
   *  special-purpose-field shape as consumableSlotsPerLevel above. Only
   *  Nest Expansion uses this. */
  incubationSlotsPerLevel?: number;
  /** Grants this many extra equipped-pet slots per level -- same shape
   *  again. Only Companion Bond uses this. */
  petSlotsPerLevel?: number;
  /** Grants this many extra free quest-board rerolls per day, per level --
   *  same special-purpose-field shape as the slot-count fields above. Only
   *  Board Runner uses this. */
  questFreeRerollsPerLevel?: number;
  /** Same shape again, for free Vendors-shop restock rerolls per day. Only
   *  Trade Favor uses this. */
  vendorFreeRerollsPerLevel?: number;
  /** Grants this many extra quest-board freeze changes per day, per level
   *  -- same special-purpose-field shape as questFreeRerollsPerLevel above,
   *  independent counter. Only gates freezing a new contract; unfreezing
   *  is always free (see QuestManager.unfreezeOffer). Only Board Warden
   *  uses this. */
  freezeChangesPerLevel?: number;
}

export type GuildFacility = 'barracks' | 'treasury' | 'workshop' | 'library' | 'tavern';

export interface GuildDef {
  id: GuildFacility;
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  modsPerLevel: Partial<Modifiers>;
  /** Treasury adds storage; tavern adds hero slots. */
  storagePerLevel?: number;
  heroSlotsPerLevel?: number;
}

export interface RenownPerkTier2 {
  /** New absolute level cap once tier 2 is unlocked. */
  maxLevel: number;
  /**
   * Tier 2 has its own cost curve entirely — starting price and growth rate —
   * rather than multiplying the (already large) compounded base-tier price.
   * Compounding a multiplier on top of an already-exponential base blows up
   * fast: verified directly, a naive 3.5x multiplier on the base curve's own
   * growth rate over the same number of extra levels priced a full tier-2
   * clear at ~850,000 renown against a base tier that only costs ~20,000 —
   * a single retirement grants single-digit-to-low-double-digit renown, so
   * that's not a long-term goal, it's an unreachable one. An independent,
   * gentler curve keeps tier 2 a genuine but achievable stretch.
   */
  startCost: number;
  costGrowth: number;
  /** Shown once the base tier is maxed and tier 2 becomes visible. */
  unlockFlavour: string;
}

export interface RenownPerkDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  costGrowth: number;
  maxLevel: number;
  modsPerLevel: Partial<Modifiers>;
  heroSlotsPerLevel?: number;
  /**
   * A second tier that extends the level cap once the first is maxed, at a
   * steeper cost — so renown keeps having somewhere to go across many
   * prestiges instead of hard-capping. Perks with heroSlotsPerLevel don't
   * get one; extra hero slots stay a deliberately fixed, small number.
   */
  tier2?: RenownPerkTier2;
}

export interface ShopStock {
  refreshedAt: number;
  consumables: { defId: string; stock: number }[];
  equipment: { uid: string; defId: string; price: number }[];
}

export interface Statistics {
  totalQuests: number;
  successes: number;
  failures: number;
  goldEarned: number;
  goldSpent: number;
  highestReward: number;
  legendaryItemsFound: number;
  itemsFound: number;
  injuriesSuffered: number;
  itemsBroken: number;
  chainsCompleted: number;
  playTimeMs: number;
  offlineTimeMs: number;
  prestigeCount: number;
  bestPrestigeStreak: number;
  /** Lowest success chance a quest has ever WON at, or null if none yet. Powers the "Against the Odds" achievement, and lets it survive a save migration retroactively rather than only firing on the next lucky win. */
  lowestSuccessfulChance: number | null;
  blackMarketPurchases: number;
  firstPlayedAt: number;
}

export interface GameState {
  version: number;
  createdAt: number;
  lastSeen: number;

  gold: number;
  renown: number;

  heroes: Hero[];
  heroSlots: number;
  roster: HeroClass[];

  inventory: Record<string, number>;
  /**
   * Runtime-registered consumable variants produced by crafting with a
   * chosen mod bonus (see CraftingManager's consumable path) -- e.g.
   * "Trail Rations, but with +10% injury resist baked in" isn't one of
   * the hand-authored entries in consumables.json, so it's registered
   * here instead, keyed by a stable id derived from the base consumable
   * + the exact mod combo chosen (so re-crafting the same combo stacks
   * onto the same entry rather than spawning duplicates). Checked before
   * CONSUMABLE_BY_ID everywhere a consumable might be resolved by id --
   * see InventoryManager.resolveDef, the one place that lookup actually
   * happens.
   */
  customConsumables: Record<string, ConsumableDef>;
  stash: EquipmentItem[];

  /**
   * Contract offers, one pool per hero (keyed by hero id) -- each hero
   * generates and keeps their own set rather than the whole roster
   * competing over one shared board. Eligibility and burst caps scale off
   * that specific hero's own level (see QuestManager.generateContractsForHero),
   * not the guild's top hero, so a low-level recruit sees contracts sized
   * for them instead of leftovers from a high-level main. See the Quest
   * Tab hero-log rework.
   */
  questBoards: Record<string, QuestOffer[]>;
  /**
   * Chain-stage offers, still a single shared list -- a chain's progress
   * (ActiveChain.stage) is tracked once per chainId, not owned by a
   * specific hero, so every idle hero who qualifies sees the same current
   * stage rather than each getting their own copy.
   */
  chainBoard: QuestOffer[];
  /**
   * Daily reroll tracking for the quest board's Reroll button -- see
   * QuestManager.questRerollCost/rerollContractsForHero and
   * data/reroll.ts's shared day/cost math. `questRerollDay` is the day
   * window (see reroll.ts's `rerollDay`) `questRerollsUsedToday` was last
   * touched for; a stale day is treated as 0 used rather than reset
   * proactively, the same lazy-reset shape burst/shop windows already use.
   */
  questRerollDay: number;
  questRerollsUsedToday: number;
  /** Same shape again, independent counter, for the Vendors shop restock
   *  reroll -- see ShopManager.vendorRerollCost/rerollShop. */
  vendorRerollDay: number;
  vendorRerollsUsedToday: number;
  /**
   * At most one frozen contract per hero, keyed by hero id -- kept as the
   * actual offer object rather than just an id, since a regenerated board
   * assigns every offer a brand-new id on each window anyway (see
   * QuestManager.generateOffer's seedTag). A frozen offer is spliced back
   * into that hero's board in place of one freshly-generated slot on every
   * full regeneration (window refresh, paid reroll, or an Auto-Chain
   * restock) -- see QuestManager.applyFrozenOffer, the one place all three
   * of those paths converge. Cleared automatically once the hero is
   * actually sent on it (QuestManager.start), not just left to go stale.
   */
  frozenQuestOffers: Record<string, QuestOffer>;
  /**
   * Daily allowance tracking for freezing a contract -- unfreezing is
   * always free and never spends from this (see QuestManager.unfreezeOffer),
   * so running out never traps a player with an unwanted frozen contract.
   * Same lazy day-reset shape as questRerollDay/vendorRerollDay above.
   * Base 1/day, more via the Board Warden guild upgrade (see
   * ModifierManager.freezeChangesPerDay).
   */
  freezeChangeDay: number;
  freezeChangesUsedToday: number;
  boardRefreshedAt: number;
  activeQuests: ActiveQuest[];
  activeChains: ActiveChain[];
  completedChains: string[];
  /** The single raid attempt in progress, if any -- only one at a time, same as how a hero can only be on one quest. */
  activeRaid: ActiveRaid | null;
  /** Raid ids (any difficulty) that have been full-cleared at least once -- gates unlockNextRaidId progression. */
  completedRaids: string[];
  /** Recent raid outcomes, most recent first. Capped the same way `log` is. */
  raidLog: RaidResult[];
  /**
   * Difficulties (any raid) that have ever been full-cleared -- separate
   * from completedRaids since achievements care about "cleared a Mythic",
   * not "cleared this specific raid at Mythic". Persisted rather than
   * derived from raidLog, since that's capped and could evict the
   * evidence; this never shrinks.
   */
  completedRaidDifficulties: RaidDifficulty[];

  upgrades: Record<string, number>;
  guild: Record<GuildFacility, number>;
  renownPerks: Record<string, number>;

  shop: ShopStock;
  /** A second rotating stock, epic/legendary-biased and pricier, unlocked separately. */
  blackMarket: ShopStock;
  stats: Statistics;
  log: QuestResult[];
  discoveredItems: string[];
  /** Skins the guild has purchased; usable by any hero of that class. */
  unlockedSkins: string[];
  /**
   * Which hero the desktop companion shows. Updates automatically whenever a
   * hero is sent on a quest (so departures are always visible), and can be
   * changed manually by cycling on the widget or picking in the Heroes panel.
   * Null falls back to heroes[0].
   */
  focusedHeroId: string | null;
  /** Consecutive retirements performed within the streak window of each other. */
  prestigeStreak: number;
  /** Epoch ms of the last retirement, or null if none yet. */
  lastPrestigeAt: number | null;
  /** Achievement id -> epoch ms when it unlocked. */
  unlockedAchievements: Record<string, number>;
  /** How far each vendor's relationship has been invested in — gates how many of their upgrades are visible. */
  vendorLevels: Record<VendorId, number>;
  /**
   * Player-chosen name for the guild itself, distinct from any hero's name.
   * Empty string means never set — the naming prompt is shown once on the
   * Dashboard until the player picks one. Editable afterward from the same
   * spot.
   */
  guildName: string;
  /**
   * "setId:count" keys for every set-bonus threshold that's already
   * triggered its one-time toast (see GameEngine.checkSetBonusMilestones).
   * Prevents re-notifying every time a piece is unequipped and re-equipped.
   */
  notifiedSetBonuses: string[];
  /** Every toast ever fired, newest first, capped at 100. */
  notifications: NotificationEntry[];
  /**
   * Id of the newest notification the player has actually acknowledged --
   * by opening the Guide tab's Notifications list, clicking the header
   * notification icon, or clicking through a banner (see
   * NotificationBanner.tsx). `null` means nothing has ever been
   * acknowledged (a genuinely fresh save). The unread count/badge is
   * computed live from this (how many entries in `notifications` come
   * before this id, since unshift keeps the array newest-first), not
   * stored as its own number, so it's always correct regardless of when
   * notifications arrived.
   *
   * Deliberately an id, not a timestamp -- an earlier version of this
   * compared `notification.timestamp > notificationsSeenAt`, which broke
   * whenever two notifications landed in the same millisecond (confirmed
   * directly via a runtime check, not theoretical): the strict `>`
   * comparison silently swallowed the second one. This is the exact same
   * class of bug already fixed once in this codebase for Toast.tsx's own
   * auto-dismiss timer (two toasts with identical text/timing used to
   * share one effect run) -- same root cause (relying on a value that
   * isn't guaranteed unique/ordered at sub-millisecond precision), same
   * fix shape (switch to something that IS guaranteed distinct -- Toast
   * used a seq counter, this uses the notification's own unique id).
   * A notification that arrives WHILE this points at the previous
   * newest one is unambiguously "after" it in array position, with no
   * timestamp precision to lose. A banner that times out WITHOUT being
   * clicked deliberately does NOT advance this -- that's the whole point
   * of "if missed, it counts as unread."
   */
  notificationsSeenId: string | null;
  /**
   * Ids of one-time "how to" guidance topics already shown (see
   * GuidanceManager) -- once a topic's fired, it never fires again.
   */
  seenGuidance: string[];
  /** Levels bought in the dedicated Raid Guild Upgrade tree -- see RaidUpgradeDef. */
  raidUpgrades: Record<string, number>;
  /** True once the scripted first-run tour (or its Skip button) has been
   *  seen -- never shown again after that, whether finished or skipped.
   *  Existing saves are migrated straight to true (already onboarded by
   *  definition); only a genuinely fresh save starts at false. */
  seenOnboarding: boolean;
  /**
   * Set the moment GuidanceManager's first_chain_seen topic triggers,
   * instead of that topic going through the normal toast queue like every
   * other one -- this is the scripted tour's own final beat, shown as a
   * standalone modal ("you've discovered a quest chain...") rather than a
   * toast easy to miss. Persisted (not just in-memory) so it reliably
   * shows even if the app closes before the player notices it.
   */
  pendingChainDiscovery: boolean;

  /* ------------------------- Harvest/Gathering ------------------------- */
  /** Current stock of each material, capped by warehouseCapacity(). */
  materials: Record<MaterialId, number>;
  /** Per-node spawn/pending-item state, including each node's own
   *  independent `nextSpawnAt` -- see HarvestManager. Was briefly one
   *  shared GameState-level timestamp for all 4 nodes ("harvest o'clock"),
   *  reverted after direct follow-up feedback (confirmed with a
   *  screenshot: synchronized catches meant every node's own burst text
   *  landed at once and visually overlapped into an unreadable pile) --
   *  see HarvestManager.spawnIntervalMs's own comment for the full story. */
  harvestNodes: Record<MaterialId, HarvestNodeState>;
  /** Levels bought in the per-node tool upgrade line (Pickaxe/Woodaxe/Sickle/Net). */
  harvestTools: Record<MaterialId, number>;
  /** Levels bought in the Warehouse capacity upgrade -- same storagePerLevel shape as Treasury. */
  warehouseLevel: number;
  /** True once the Trade Route upgrade is bought -- gates selling materials for gold. */
  tradeRouteUnlocked: boolean;

  /* --------------------------- Elemental infusion --------------------------- */
  /**
   * A standalone currency, deliberately not folded into `materials`
   * (Record<MaterialId, ...>) -- scrap comes from breaking down owned
   * equipment (EquipmentManager.scrapValue, see engine.scrapItem), not
   * from a Harvest node, so it doesn't belong in that system's per-node
   * state (harvestNodes/harvestTools) the way ore/timber/herbs/food do.
   */
  scrap: number;
  /** Elemental Gems, one counter per element -- crafted at the Enchanter,
   *  spent at the Blacksmith's Infuse station on a weapon's
   *  elementalDamage. See CraftingManager.craftGem/engine.infuseItem. */
  gems: Partial<Record<ElementType, number>>;
  /** Resistance Gems, same shape again, spent on a non-weapon item's
   *  elementalResist instead. */
  resistGems: Partial<Record<ElementType, number>>;

  /* ---------------------------- Pets / Hatchery ---------------------------- */
  /** True once the intro chain that grants the Hatchery has been completed
   *  -- gates the Hatchery tab's visibility entirely (see MenuWindow). */
  hatcheryUnlocked: boolean;
  /** Set the moment hatcheryUnlocked flips true, same "own standalone
   *  moment, not a toast" treatment as pendingChainDiscovery -- shown as a
   *  single-step reuse of OnboardingTour spotlighting the new tab. */
  pendingHatcherySpotlight: boolean;
  /**
   * Eggs actively incubating -- the Hatchery's own "equipped" slots,
   * exactly the same relationship eggStorage has to this that state.stash
   * has to a hero's worn EquipmentItems. Capped at
   * ModifierManager.incubationSlots(state); PetManager.equipEgg/unequipEgg
   * move an EggInstance between here and eggStorage. Only eggs in here
   * accrue hatchXp (see PetManager.addHatchXp).
   */
  incubatingEggs: EggInstance[];
  /**
   * Eggs owned but not yet equipped into a Nest -- shown with a static
   * icon (no animation budget spent on eggs sitting in storage; the
   * animated hatch moment is reserved for the equipped/incubating egg
   * that's actually about to hatch). Unbounded, same as state.stash.
   * PetManager.grantEgg always adds here now, never straight into a nest
   * -- see the Hatchery/Pets status writeup for why this changed from the
   * original "auto-incubate on grant" behaviour.
   */
  eggStorage: EggInstance[];
  pets: Pet[];
  /**
   * True the moment ANY incubating egg first crosses its hatchXpThreshold,
   * cleared by dismissHatchReadyNotice. Deliberately NOT the trigger for
   * the actual hatch -- an egg reaching threshold just becomes eligible
   * (see PetManager.isReady); the player still has to open it themselves
   * from the Nests tab to see what it became. This flag exists purely to
   * get their attention, the same "persisted until acknowledged" shape as
   * pendingChainDiscovery/pendingHatcherySpotlight, not a queue of which
   * eggs specifically -- the Nests tab itself marks each ready card
   * individually once they get there.
   */
  pendingHatchReadyNotice: boolean;
  /** Which owned pets currently accompany the guild -- feeds ModifierManager's
   *  global mods and is the only thing that gains a pet post-hatch xp (see
   *  PetManager). Capped at ModifierManager.petSlots(state), same
   *  "array, not a fixed-size struct" shape as Hero.equippedConsumables. */
  equippedPetIds: string[];

  /* ------------------------- automation preferences -------------------------
     Both opt-in, both off by default. Live in GameState (not Settings) on
     purpose -- these spend the guild's own gold and touch its own gear,
     which makes them guild-progress preferences that belong with the save
     and should follow it through Steam Cloud, not local device cosmetics
     the way Settings' theme/font/density are documented to be. */
  /** When true, GameEngine.refreshWorld auto-repairs any equipped item that
   *  drops at or below autoRepairThresholdPercent of its own max durability,
   *  spending gold the same way a manual Repair Everything trip would --
   *  never repairs past what the guild can currently afford, same
   *  affordability gate repairAll() already uses. */
  autoRepairEnabled: boolean;
  /** 1-99. Repair triggers once current/max durability, as a percentage,
   *  drops to or below this. Deliberately not 0 or 100 -- 0 would mean
   *  "wait until fully broken" (defeats the point of *auto*-repair) and
   *  100 would repair on every single point of wear, spending gold
   *  constantly for no real benefit. */
  autoRepairThresholdPercent: number;
  /** When true, QuestManager.resolve auto-equips a loot drop straight onto
   *  the hero who earned it if it beats what they're already wearing in
   *  that slot (same GEAR_SCORE_BY_RARITY comparison engine.equipBestGear
   *  already uses for its own manual bulk-equip) instead of the drop
   *  always landing in the stash. Only ever checked against the earning
   *  hero, never the whole roster -- a stash drop had no "which hero"
   *  context before this, and inventing one (e.g. "whoever it helps most")
   *  would be a much bigger, more surprising behavior change than "the
   *  hero who found it gets first look at it." */
  autoEquipOnLoot: boolean;
  /** When true, GameEngine.startQuest/sendAllIdle silently fill each sent
   *  hero's EMPTY consumable slots (never swapping out something already
   *  slotted) via the same highest-cost-first logic the manual "Equip
   *  Best" button already uses, right before departure -- so a hero whose
   *  last potion got used up on a previous send doesn't sit there
   *  under-equipped until the player notices and revisits the Equipment
   *  tab by hand. */
  autoEquipConsumablesOnSend: boolean;
}

/**
 * One node's live gathering state. `pending` is the falling/settled item
 * currently on screen in that node's own tab, if any -- null means nothing
 * has spawned yet since the last catch or despawn. `nextSpawnAt` is this
 * node's own independent next-spawn time -- briefly moved to a single
 * shared GameState-level timer (all 4 nodes spawning together as one
 * synchronized wave) and reverted back after direct follow-up feedback,
 * confirmed with a screenshot: synchronized catches meant every node's own
 * burst text landed at the same moment and visually overlapped into an
 * unreadable pile. See HarvestManager.spawnIntervalMs's own comment for
 * the fuller story. Ticked forward in GameEngine.refreshWorld the same way
 * the quest board and shop rotations already are, so a node keeps spawning
 * (and expiring) items even while its own tab isn't the one open.
 */
export interface HarvestNodeState {
  nextSpawnAt: number;
  pending: { spawnedAt: number; expiresAt: number; bonus: boolean } | null;
}

/* ----------------------------- pets / hatchery ----------------------------- */

/**
 * Deliberately a small subset of Modifiers, not the full set -- a pet
 * bonus is meant to read as "a little extra luck/coin/knack," not another
 * full progression axis. `loot` stands in for what the design doc calls
 * "luck" (rare-find chance is the closest existing lever to that idea).
 */
export type PetBonusType = 'success' | 'gold' | 'xp' | 'loot';

/**
 * A pet species/template, defined in json/pets.json (devtool-editable, same
 * pattern as EquipmentDef). Rarity/bonus/name are NOT here -- those are
 * rolled per-instance on hatch (see Pet below); this is just "what a
 * Cinderling looks like and where its sprite lives."
 */
export interface PetDef {
  id: string;
  name: string;
  description: string;
  /** Single-glyph fallback, same role as MaterialDef.glyph -- shown until
   *  real sprite files exist, or if one ever 404s. */
  glyph: string;
  /**
   * Sprites read from `public/pets/<id>/<file>.png` -- idle.png expected,
   * other filenames (e.g. a second idle variant) are optional and just
   * won't render if absent. Missing folder entirely = pure glyph fallback,
   * same "never a broken image" convention as every other art asset here.
   */
  spriteFolder: string;
  /** True if this pet can only hatch from a dedicated-reward egg (see
   *  EggInstance.dedicatedPetId) -- never rolled by the general pool. */
  dedicatedOnly?: boolean;
  /** Unset for every base-game species (rolls normally, or is
   *  dedicatedOnly as above). Set to a DLC pack id for a species that
   *  only exists once that pack is owned -- same shape and same
   *  DlcManager.owns gate as SkinDef.requiresDlc. A dedicatedOnly DLC
   *  pet (a pack's own signature species, granted by its own reward
   *  chain/egg) is a valid combination -- the two flags are independent. */
  requiresDlc?: string;
}

/**
 * One egg incubating toward a hatch. Rarity sets both how long it takes
 * (higher rarity = higher hatchXpThreshold, see EGG_TIERS) and the hatched
 * pet's own cosmetic rarity -- the pet SPECIES is a separate random roll
 * at hatch time, independent of this.
 */
export interface EggInstance {
  uid: string;
  rarity: Rarity;
  /**
   * Set only for eggs granted as a flagged dedicated-reward drop (see
   * QuestOffer/RaidEncounterDef pet-loot assignment) -- resolves to this
   * specific PetDef on hatch instead of a random pick from the general
   * pool. Undefined for every ordinary egg.
   */
  dedicatedPetId?: string;
  /** Progress toward this egg's own hatchXpThreshold -- see
   *  PetManager.addHatchXp. Driven by hero XP earned anywhere in the
   *  guild, not tied to a specific hero (see design notes in
   *  guild-idler-status.md's Pets section for why). */
  hatchXp: number;
  startedAt: number;
}

/** An owned, already-hatched pet. */
export interface Pet {
  uid: string;
  defId: string;
  /** Player-given name, defaults to the species name on hatch. */
  name: string;
  /** Cosmetic recolour tier only, for now -- does NOT affect bonusValue.
   *  See guild-idler-status.md's Pets section for the parked idea of
   *  rare variants eventually carrying their own bonus too. */
  rarity: Rarity;
  bonusType: PetBonusType;
  /** Rolled once at hatch; PetManager.effectiveBonus grows on top of this
   *  as the pet gains xp, and scales it down by happiness. */
  baseBonusValue: number;
  xp: number;
  /**
   * Happiness is stored lazily: `happiness` is the value AS OF
   * happinessUpdatedAt, decaying over real elapsed time from there rather
   * than being ticked down every second -- see PetManager.currentHappiness.
   * Same "store an absolute timestamp, compute on read" approach as
   * Injury.healsAt / HarvestNodeState.nextSpawnAt.
   */
  happiness: number;
  happinessUpdatedAt: number;
  hatchedAt: number;
}

/**
 * A Crafting recipe. Two shapes depending on `category`: a `gear` recipe
 * produces a fresh EquipmentItem with player-chosen customMods (see
 * EquipmentItem.customMods) rather than a fixed roll; a `consumable`
 * recipe just produces an existing ConsumableDef, materials+gold standing
 * in for the shop's gold-only price -- no per-craft customization, since
 * "choose your own stat spread" only makes sense for something you keep.
 */
export interface CraftingRecipeDef {
  id: string;
  name: string;
  description: string;
  category: 'gear' | 'consumable' | 'enchant' | 'gem';
  /** Relative path under the item-icons folder, same convention as
   *  EquipmentDef.icon/ConsumableDef.icon. No glyph fallback here since
   *  a recipe isn't itself an item -- falls all the way back to a plain
   *  emoji per category (see CATEGORY_FALLBACK in HarvestPanel.tsx). */
  icon?: string;
  materialCost: Partial<Record<MaterialId, number>>;
  goldCost: number;
  /** `gem` recipes only, in addition to materialCost/goldCost -- Scrap is
   *  its own standalone currency (see GameState.scrap), not a MaterialId,
   *  so it needs its own cost field rather than fitting into
   *  materialCost. Every gem recipe is expected to set this; 0/undefined
   *  would mean a gem that costs no scrap at all, which defeats the
   *  point of the scrapping loop. */
  scrapCost?: number;
  /** `gear` recipes only -- the craftable EquipmentDef this recipe produces. */
  resultDefId?: string;
  /** `gear` recipes only -- the eligible mod pool the player picks from. */
  modOptions?: (keyof Modifiers)[];
  /** `gear` recipes only -- how many of modOptions the player picks, e.g. 2. */
  modsToPick?: number;
  /** `gear` recipes only -- fixed strength applied to each picked mod. */
  modValue?: number;
  /** `consumable` recipes only -- the ConsumableDef this recipe produces. */
  resultConsumableId?: string;
  /** `enchant` recipes only -- the eligible stat pool the player picks from. */
  statOptions?: (keyof Stats)[];
  /** `enchant` recipes only -- how many of statOptions the player picks. */
  statsToPick?: number;
  /** `enchant` recipes only -- fixed strength applied to each picked stat, additive with anything already enchanted. */
  statValue?: number;
  /** `gem` recipes only -- which counter this recipe adds +1 to on craft
   *  (GameState.gems or resistGems, for the given element). No player
   *  choice involved at craft time, unlike gear/enchant -- a gem recipe
   *  is authored per element, same way Trail Rations vs Herbal Tonic are
   *  two separate consumable recipes rather than one with a picker. */
  resultGem?: { kind: 'elemental' | 'resist'; element: ElementType };
}
