/* =========================================================================
 * Guild Idler — shared type definitions
 * Every manager reads and writes the same GameState shape defined here.
 * ========================================================================= */

export const SAVE_VERSION = 17;

export type Difficulty = 'easy' | 'normal' | 'hard' | 'epic' | 'legendary';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type EquipSlot = 'weapon' | 'helmet' | 'chest' | 'shield' | 'gloves' | 'boots' | 'ring' | 'amulet';

export type HeroClass = 'adventurer' | 'knight' | 'gladiator' | 'samurai' | 'witch' | 'pyromancer' | 'lizardman' | 'wizard' | 'dwarf';

/** Cosmetic recolour skins, applied per hero. */

export type HeroSkin = 'original' | 'necrotic' | 'holy' | 'infernal' | 'frost';

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
  effect: {
    success?: number;
    gold?: number;
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
}

/** A concrete item the player owns. */
export interface EquipmentItem {
  uid: string;
  defId: string;
  durability: number;
  /** Number of times upgraded at the workshop. */
  plus: number;
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
  unlocks?: 'legendaryQuests' | 'chains' | 'blackMarket' | 'autoChain' | 'raids';
  /**
   * Which vendor offers this upgrade. Undefined means it's a general guild
   * upgrade with no vendor attached (unlocks like Guild Charter or Black
   * Market Contact are administrative/structural rather than a craft, so
   * they stay here rather than being forced into one of the three vendors).
   * Vendor upgrades are additionally gated by vendorLevel — see
   * ModifierManager.vendorUpgradeIndex.
   */
  vendor?: VendorId;
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
  stash: EquipmentItem[];

  questBoard: QuestOffer[];
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
   * Ids of one-time "how to" guidance topics already shown (see
   * GuidanceManager) -- once a topic's fired, it never fires again.
   */
  seenGuidance: string[];
}
