/* =========================================================================
 * Guildbound — shared type definitions
 * Every manager reads and writes the same GameState shape defined here.
 * ========================================================================= */

export const SAVE_VERSION = 48;

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

/**
 * A hero's combat role -- Melee/Ranged/Caster. Separate from `HeroClass`
 * entirely: class still drives stats/growth/mods/preferred-tag bonus
 * exactly as before, role is a purely additive layer scoped to raid
 * party composition only (see RaidDef.requiredRoles below and
 * guild-idler-status.md's "Melee/Ranged/Caster hero roles" backlog
 * entry for the full design/scope reasoning -- ordinary board/chain
 * quest success math deliberately does not read this at all).
 */
export type Role = 'melee' | 'ranged' | 'caster';

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

export type HeroStatus = 'idle' | 'questing' | 'resting' | 'fallen';

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
  /**
   * Flat bonus added directly to a hero's Max Health pool (see
   * HeroManager.maxHealth) -- gear/consumable sourced, same additive
   * pool every other modifier already sums through via sumMods. See
   * guild-idler-status.md's Health stat + Fallen/death mechanic section.
   */
  health: number;
  /**
   * Percentage points shaved off HeroManager.revivalCost -- Undertaker's
   * Favor's own effect, deliberately separate from Infirmary's free
   * auto-revive-at-max-level so paying-it-down and waiting-it-out are two
   * independent investment targets. Percentage-flavoured like every
   * other key except health, so the shared pct() formatter (via
   * describeMods) needs no special case for this one.
   */
  revivalDiscount: number;
  /**
   * Flat bonus to PetManager.maxHealth -- deliberately a SEPARATE key
   * from `health` above rather than reused, since these two pools sum
   * through the exact same generic Modifiers/sumMods machinery and
   * reusing one key would incorrectly let a hero-health source (e.g. a
   * shield's `health` mod) bleed into pet Max Health and vice versa.
   * Sourced from Companion Vitality (Upgrade) and a future Companion
   * Legacy Renown Perk -- the pet-specific parallels to Vitality
   * Training/Vital Legacy. See guild-idler-status.md's Pet Health/Fallen
   * entry.
   */
  petHealth: number;
  /** Pet-specific parallel to revivalDiscount above, from Kennel
   *  Keeper's Favor -- same reasoning for staying a separate key. */
  petRevivalDiscount: number;
  /**
   * Percentage points shaved off EquipmentManager.repairCost, from the
   * Blacksmith's own Smith's Discount vendor upgrade -- separate from
   * Workshop's existing repair discount (which is a flat facility-wide
   * effect) since this one is specifically a reward for training up the
   * Blacksmith's own vendor level. Same "own key, own percentage,
   * explicitly summed rather than folded into an existing one" reasoning
   * as revivalDiscount/petRevivalDiscount above.
   */
  repairDiscount: number;
  /**
   * Percentage bonus to EquipmentManager.scrapValue, from the
   * Blacksmith's Bulk Scrapper vendor upgrade -- see
   * guild-idler-status.md's Vendor Upgrades Consolidation entry.
   */
  scrapBonus: number;
  /**
   * Percentage points shaved off a consumable's shop price, from the
   * Alchemist's own Apothecary's Discount vendor upgrade.
   */
  consumableDiscount: number;
  /**
   * Percentage points shaved off the gold cost of Weapon Enchanting,
   * Armour Infusion, and the gem recipes that back both, from the
   * Enchanter's own Arcane Discount vendor upgrade.
   */
  enchantDiscount: number;
  /**
   * Percentage points shaved off Black Market price markup, from
   * Enchanted Seal's top-tier Enchanter perk -- alongside its existing
   * Legendary-quest unlock, replacing the flat success bonus it used to
   * carry (folded into Barracks instead, see guild-idler-status.md's
   * Vendor Upgrades Consolidation entry).
   */
  blackMarketDiscount: number;
}

export const ZERO_MODS: Modifiers = {
  success: 0, gold: 0, xp: 0, loot: 0, injuryResist: 0, speed: 0, durability: 0, health: 0, revivalDiscount: 0,
  petHealth: 0, petRevivalDiscount: 0, repairDiscount: 0, scrapBonus: 0, consumableDiscount: 0, enchantDiscount: 0,
  blackMarketDiscount: 0,
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
  /** Drives the same rarity-banner card treatment EquipmentDef.rarity
   *  already gives shop equipment (RARITY_BANNER/RARITY_COLOR in
   *  util.ts) -- added so the Alchemist's stock cards can finally match
   *  the Blacksmith's, and so ShopManager.rollConsumables can weight its
   *  picks by RARITY_WEIGHT the same way rollEquipment already does
   *  instead of offering every consumable in the game at once. Every
   *  hand-authored entry in consumables.json has one; a crafted
   *  customConsumables variant inherits its base item's rarity via the
   *  `...baseDef` spread in CraftingManager, so nothing extra was needed
   *  there. */
  rarity: Rarity;
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
    /** Same "unused by hand-authored recipes, typed for completeness
     *  against Modifiers" note as durability above -- a crafted
     *  variant could grant a flat Max Health bonus this way. Distinct
     *  from restoreHealth below: this widens the pool, restoreHealth
     *  fills it. */
    health?: number;
    preventInjury?: boolean;
    guaranteedGoodEvent?: boolean;
    healInjury?: boolean;
    /**
     * Percentage of Max Health restored immediately on use, via the
     * same bandage-style "Apply" action healInjury already uses
     * (InventoryManager.useOnHero / engine.useConsumable) -- not a
     * per-quest loadout effect. See guild-idler-status.md's Health stat
     * + Fallen/death mechanic section.
     */
    restoreHealth?: number;
    /**
     * Percentage reduction applied to Health damage on the one quest
     * this is equipped for -- a loadout effect (per-quest, consumed at
     * send time), distinct from restoreHealth's immediate-use-anytime
     * shape. Mitigates before damage lands rather than healing after.
     * See InventoryManager.loadoutEffects and ActiveQuest.healthDamageReduction.
     */
    healthDamageReduction?: number;
    /** Unused by any current recipe -- included only so the full
     *  `keyof Modifiers` range types cleanly against this object
     *  (CraftingManager.craftConsumable indexes it generically). A
     *  consumable granting a standing gold discount on reviving a
     *  Fallen hero doesn't fit the "per-quest or immediate-use" shape
     *  every other effect here has, so this stays Upgrade-only
     *  (Undertaker's Favor) rather than ever being craftable. */
    revivalDiscount?: number;
    /** Same "unused by any current recipe, typed for completeness against
     *  Modifiers" note as durability/revivalDiscount above -- pet Max
     *  Health and pet revival discount are Upgrade/Renown-Perk-only
     *  sources (Companion Vitality, Kennel Keeper's Favor), not
     *  consumable effects. */
    petHealth?: number;
    petRevivalDiscount?: number;
    /** Unused by any current recipe -- typed for completeness against
     *  Modifiers, same reasoning as revivalDiscount/petHealth above.
     *  repairDiscount/scrapBonus/consumableDiscount/enchantDiscount/
     *  blackMarketDiscount are all Upgrade-only sources (Smith's
     *  Discount, Bulk Scrapper, Apothecary's Discount, Arcane Discount,
     *  Enchanted Seal), not consumable effects. */
    repairDiscount?: number;
    scrapBonus?: number;
    consumableDiscount?: number;
    enchantDiscount?: number;
    blackMarketDiscount?: number;
    /**
     * Flat reduction to GameState.questsSinceGrimsby, applied immediately
     * on use -- NOT routed through InventoryManager.useOnHero (this isn't
     * hero-targeted at all, it's a guild-wide counter), see
     * GameEngine.usePeddlerCharm instead. Only ever set on "enticement"
     * consumables (Beckoning Charm being the first); every other
     * consumable leaves this undefined. See PeddlerManager for the
     * counter/threshold this actually reduces.
     */
    peddlerCounterReduction?: number;
    /**
     * Fortune Charms (patch 0215) -- biases a procedural loot roll
     * (QuestManager.resolve's loot loop -> rollProceduralItem) toward one
     * specific Modifiers category instead of the flat uniform pick every
     * other roll uses. `lootWeightStat` names which category
     * (`'gold'`/`'xp'`/`'success'`/`'loot'`, the categories actually
     * authored so far); `lootWeightMultiplier` is how much more often
     * that category gets picked per affix slot relative to every other
     * category's own weight of 1 -- e.g. 2 for a Minor charm, 3.5 for a
     * standard one. A very large multiplier (999) is the "Greater" tier's
     * full-override shape: every slot lands on the chosen category. Both
     * fields are ignored by every quest that doesn't actually drop a
     * procedural item -- equipping one on a quest with no loot table, or
     * one that only drops hand-authored/Set gear, simply does nothing,
     * same as any other situational consumable effect that doesn't apply.
     */
    lootWeightStat?: keyof Modifiers | keyof Stats;
    lootWeightMultiplier?: number;
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
   * True for the Heroic/Legendary tiered variants introduced alongside raid
   * loot pools -- these only ever exist to be raid loot table entries and
   * were never meant to be independently purchasable or craftable. Shop
   * and Black Market stock generation both filter this out; a "Legendary"
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
  /**
   * True for items whose only intended source is a specific Quest Chain's
   * guaranteed `rewardItems` payout (see QuestChainDef.rewardItems below) --
   * same "own dedicated source, not the general pool" shape raidExclusive
   * and craftable already have, added after a direct content review found
   * 34 items that were nominally chain rewards but had no flag actually
   * keeping them out of ordinary Shop/Black Market stock or random quest
   * loot, meaning a player could buy or randomly loot e.g. Dragonplate
   * Armor before ever touching the chain that's supposed to be its real
   * source. Shop, quest-loot, and Peddler-card generation all filter this
   * out the same way the other two flags already do. Unlike raidExclusive/
   * craftable, this doesn't imply anything about rarity or tiering --
   * chain-reward items span the same common-to-legendary range as ordinary
   * gear, this flag is purely about which pool they're allowed to surface
   * in.
   */
  chainExclusive?: boolean;
  /**
   * Overrides HeroManager.gearScore's flat per-rarity value
   * (GEAR_SCORE_BY_RARITY) for this specific item. Exists for cases
   * where rarity alone doesn't capture how strong a piece actually is --
   * e.g. a future high-level raid (say, a level-60 raid) dropping
   * "legendary" armour that should read as a bigger Gear Score jump than
   * an ordinary legendary from earlier content, without inventing a new
   * rarity tier just for that. Optional; unset items fall back to the
   * normal flat rarity table exactly as before.
   */
  gearScoreOverride?: number;
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
   * Set only on procedurally-generated items (patch 0214) -- the rolled
   * display name (bonus-roll prefix + bracketed source tag, e.g.
   * "Fortunate Iron Sword [Hard]"), since a blank template's own def.name
   * is just the plain base name shared by every roll of it. See
   * proceduralLoot.ts's rollProceduralItem. Falls back to def.name
   * wherever this is absent -- every hand-authored item (including every
   * Set piece) never sets this at all.
   */
  proceduralName?: string;
  /**
   * Set only on procedurally-generated items (patch 0214), and updated by
   * Blacksmith re-leveling (patch 0215) -- the level this specific
   * instance's mods/stats were actually rolled against, distinct from
   * `def.reqLevel` (the shared template's equip-*minimum*, not its
   * power level). Fixes a real gap in the original patch 0214 rollout:
   * gearRelevance() used to read def.reqLevel for every item, which is
   * correct for hand-authored gear (equip-minimum and power level are
   * the same authored number there) but wrong for procedural gear -- a
   * `reqLevel: 1` template rolled at itemLevel 50 was decaying to the
   * relevance floor almost immediately, regardless of how big a budget
   * it actually rolled with. See HeroManager.gearRelevance.
   */
  rolledItemLevel?: number;
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
  /**
   * Set via the Vault toggle on a stash item's card. Purely a stash-side
   * flag -- equipped items never set this, since they're already outside
   * every destructive picker's reach by virtue of not being in
   * `state.stash`. Checked by the same three stash-only destructive
   * actions that already refuse an equipped uid (ShopManager.sell,
   * ShopManager.scrapItem, ShopManager.sellBelowRarity) so the guard
   * lives at the mutation layer, not just in picker UI filtering --
   * matches the project's own "one mutation path, not just a UI opinion"
   * convention (see the Raid unlock-gating fix's own reasoning). Never
   * touched by Enhance/Infuse/Enchant, which aren't destructive and
   * still need to reach a locked item the same as any other.
   */
  locked?: boolean;
}

/** One reversible sale -- see GameState.buyback's own comment. */
export interface BuybackEntry {
  item: EquipmentItem;
  /** What it actually sold for -- the buyback price is this times
   *  shop.buybackMarkup (see Tuning), always MORE than this, never less,
   *  so undoing a sale is a convenience worth paying for, not a way to
   *  print gold by selling and rebuying the same item. */
  soldFor: number;
  soldAt: number;
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
  /**
   * Every title this hero has ever earned -- from completing a quest
   * chain (ChainDef.title) or fully clearing a raid (RaidDef.title),
   * append-only, in the order earned. Duplicate grants (re-clearing the
   * same raid, say) are skipped rather than appended again -- see
   * HeroManager.grantTitle. Cleared on retirement, same as the old
   * single-title field always was.
   */
  titles: string[];
  /**
   * Which entry in `titles` is currently displayed next to this hero's
   * name -- always a member of `titles` when non-null. `null` means
   * "show nothing," which is also what a hero with an empty `titles`
   * array resolves to regardless. Auto-set to the newest title the
   * moment one's earned (matching the old single-field's "just show
   * what you got" behavior as the default), but the player can pick any
   * earlier one instead via the title picker -- see
   * HeroManager.displayTitle for the read side, EquipmentPanel/
   * HeroesPanel for the picker UI.
   */
  activeTitle: string | null;
  /**
   * Currently active combat role (Melee/Ranged/Caster) -- only ever read
   * for raid party composition (RaidManager.roleMismatchPenalty), never
   * board/chain quest math. Optional/undefined for any hero who's never
   * been trained, same defensive-optional convention as
   * equippedConsumables/lastBurstBonusDay elsewhere in this file --
   * HeroManager.activeRole(hero) is the one place the "fall back to the
   * class's native role" default should be applied, so callers never
   * repeat that fallback themselves. No save migration needed.
   */
  role?: Role;
  /**
   * Every role this hero has ever paid the (higher, one-time) Training
   * unlock cost for -- always includes the class's native role for free
   * once accessed via HeroManager.unlockedRoles(hero), which is the read
   * side for this same "optional, computed default" reasoning `role`
   * above uses. Swapping to a role already in this list only costs the
   * small repeatable swap fee; swapping to one that isn't costs the
   * unlock fee AND adds it here, permanently. See HeroManager.roleCost/
   * trainRole.
   */
  unlockedRoles?: Role[];
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
   * Vestigial as of patch 0195 -- previously drove a Chain Tactics
   * time-budget override that let a streak run past the upgrade tier's
   * own fixed count (e.g. tier 4's exactly-10 cap) for as long as a
   * player-set time budget allowed. Removed: it directly fought the
   * tier system's own "exactly 10, deliberately capped" ceiling rather
   * than complementing it. Field kept (not deleted) purely for save-shape
   * continuity -- SAVE_VERSION 44 already shipped with it present on
   * every hero, and yanking a field out from under an existing save
   * struct is a real migration hazard for no benefit here. Always null
   * going forward; nothing sets it to anything else anymore.
   */
  autoChainMinutesRemaining: number | null;
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
   * Whether this hero has already spent their one-time free Treat --
   * every hero's very first injury cure is free, on the guild,
   * regardless of Physician's Charity's daily allowance (see
   * GameEngine.consumeFreeHeal, which checks the guild's own renewable
   * daily freebie first and falls back to this one-time-per-hero freebie
   * second, so a fresh recruit is never blocked by a starting-gold
   * shortfall the way the very first injury/repair economy pass turned
   * out to be -- see guild-idler-status.md's "new-player injury economy"
   * entry for the actual numbers that motivated this). Optional/
   * undefined (same as equippedConsumables above) rather than migrated,
   * since undefined already reads correctly as "hasn't used it yet."
   */
  usedFreeTreat?: boolean;
  /** Same shape as usedFreeTreat, for a hero's first equipped-gear
   *  Repair instead of an injury Treat -- see GameEngine.consumeFreeRepair. */
  usedFreeRepair?: boolean;
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
  /**
   * Current Health, out of HeroManager.maxHealth(hero). Optional/undefined
   * for any hero who hasn't taken health damage yet -- same defensive
   * convention as equippedConsumables/lastBurstBonusDay above, so no
   * save migration is needed. Treat as "full" (maxHealth(hero)) wherever
   * undefined; HeroManager.currentHealth(hero) is the one place that
   * default should be applied, so callers never repeat the `?? max`
   * fallback themselves. Reaches 0 -> hero.status becomes 'fallen' (see
   * guild-idler-status.md's Health stat + Fallen/death mechanic section
   * for the full design, including why there's deliberately no floor
   * above 0).
   */
  health?: number;
  /**
   * Epoch ms when this hero's Health hit 0 and they became 'fallen', or
   * null once revived/never applicable. Drives the free auto-revive
   * timer (HeroManager.autoReviveDue) once Infirmary reaches max level --
   * see guild-idler-status.md's Health stat + Fallen/death mechanic
   * section. Optional/undefined for any hero who has never been Fallen,
   * same defensive convention as health above.
   */
  fallenAt?: number | null;
  /**
   * The one pet paired with this hero, replacing the old guild-wide
   * `GameState.equippedPetIds` list entirely -- a pet now genuinely
   * accompanies a SPECIFIC hero rather than passively boosting every
   * quest regardless of who's sent. Enforced at PetManager.equip: a pet
   * can only be assigned to one hero at a time, and the total count of
   * heroes with a pet assigned across the roster is capped at
   * ModifierManager.petSlots(state), same cap concept as before, just
   * counted differently. Optional/undefined for any hero with no pet
   * assigned. See guild-idler-status.md's Pet Health/Fallen entry.
   */
  equippedPetId?: string | null;
}

/* ----------------------------- quests ----------------------------- */

export interface LootRoll {
  defId: string;
  chance: number;
}

/**
 * What QuestManager.pickBestQuest sorts viable (above-floor) offers by,
 * once the Chain Tactics upgrade unlocks the choice -- 'gold' matches
 * the picker's original hardcoded behavior exactly. 'loot' uses an
 * offer's own loot.length as a stand-in for "prefers items" (offers
 * don't carry a single scalar loot value the way gold/xp do), 'balanced'
 * blends all three into one score rather than picking just one axis.
 */
export type AutoChainWeightBy = 'gold' | 'xp' | 'loot' | 'balanced';

/** See GameState.autoChainTactics' own comment. */
export interface AutoChainTactics {
  /**
   * Minimum previewSuccess() a board offer must clear to be considered
   * "viable" by pickBestQuest -- 50 matches the picker's original
   * hardcoded floor exactly, so this is a strict tightening only (70/80/
   * 90), never a loosening below the original default.
   */
  successFloor: number;
  weightBy: AutoChainWeightBy;
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
  /**
   * Set only on a procedurally-rolled "Gathering Bounty" offer (see
   * QuestManager.generateGatheringOffer) -- guarantees a flat amount of
   * one Harvest material on success instead of (or alongside) the usual
   * gold/xp/loot, sending a hero off to fetch it rather than clicking the
   * Harvest minigame in person. Only ever rolled once `harvestUnlocked`
   * is true (see GameState.harvestUnlocked / `the_first_haul`'s own
   * grantsHarvest). `amount` is calibrated below full manual-clicking
   * yield on purpose -- see quest.gatheringMaterialPerHour's own tuning
   * description for the exact math.
   */
  materialReward?: { materialId: MaterialId; amount: number };
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
  /** Passive resist only -- upgrades/facilities/renown/gear/stats. NOT
   *  the preventInjury consumable's full immunity anymore (see
   *  injuryImmune below); kept as a plain number with no magic
   *  sentinel value so stacking passive sources can never accidentally
   *  reach the same full-immunity effect a deliberate consumable grants. */
  injuryResist: number;
  /** True only when the preventInjury loadout consumable was used --
   *  a deliberate, active choice for this specific quest, fully separate
   *  from passive injuryResist stacking. See QuestManager.resolve's own
   *  comment for why this used to be encoded as injuryResist===100 and
   *  why that was a real bug (passive upgrades could reach 100 too). */
  injuryImmune: boolean;
  consumables: string[];
  guaranteedGoodEvent: boolean;
  /**
   * Percentage reduction applied to Health damage on THIS quest only,
   * from a Guardian's Retainer-style loadout consumable -- baked in at
   * send time the same way injuryResist/guaranteedGoodEvent already are,
   * since the consumable itself is consumed before resolve() runs. See
   * ConsumableDef.effect.healthDamageReduction and
   * guild-idler-status.md's Health-related gold sinks entry. Optional so
   * pre-existing saved ActiveQuests (from before this field existed)
   * default to 0 via `?? 0` at the one read site rather than needing a
   * migration.
   */
  healthDamageReduction?: number;
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
  /** Material actually credited from a Gathering Bounty offer (see
   *  QuestOffer.materialReward), if this quest carried one -- the full
   *  amount on success, a reduced consolation amount on failure (same
   *  15%-of-full shape gold's own failure consolation already uses),
   *  clamped by warehouse capacity same as a manual Harvest catch. Purely
   *  informational for the result modal; the actual materials mutation
   *  already happened in QuestManager.resolve by the time this is read. */
  materialGained?: { materialId: MaterialId; amount: number };
  /** Set to the chain's title text if this quest's chain just completed
   *  and HeroManager.grantTitle actually granted it (i.e. the hero didn't
   *  already hold it) -- purely informational, the grant itself already
   *  happened in resolve() by the time this is read. Drives the toast in
   *  engine.ts; not set on a repeat/no-op grant so re-clearing old
   *  content never re-announces a title the hero already has. */
  titleGranted?: string;
  /** True if THIS quest's health damage (see QuestManager.resolve's
   *  injury block) was what dropped the hero to 0 and flipped
   *  hero.status to 'fallen' -- deliberately separate from `injury`
   *  above, which fires on any injury regardless of whether it happened
   *  to be the killing blow. `injury` alone already reads as "a routine
   *  scrape," so the UI needs its own signal to call out "this hero
   *  can't be sent again until revived" as a distinct beat rather than
   *  leaving it buried in the ordinary Damage report line. Not set for
   *  a hero who was already Fallen going in (can't happen in practice --
   *  a Fallen hero can't be sent -- but matches applyHealthDamage's own
   *  no-op-if-already-fallen guard for safety). */
  heroFallen?: boolean;
  /** Same reasoning as heroFallen, for this hero's own paired pet if the
   *  same damage roll happened to drop IT to 0 too (see
   *  PetManager.applyHealthDamage, called right alongside the hero's own
   *  in QuestManager.resolve). Independent of heroFallen -- different max
   *  health curves mean one can fall without the other. */
  petFallen?: { petName: string };
  /** An ordinary curio drop rolled this quest, if any -- same shape and
   *  same "flat % chance on success, scaled by difficulty" pattern as
   *  eggDropped above, just for QuestManager's own curio-drop roll
   *  instead of PetManager's egg one. Purely informational for the
   *  result modal; the actual `state.curios` mutation already happened
   *  in QuestManager.resolve by the time this is read. */
  curioGained?: { curioId: string; amount: number };
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
  /** True when this specific quest's completion pushed
   *  questsSinceGrimsby past its threshold and triggered his arrival --
   *  purely informational, GameEngine reads this to fire the arrival
   *  banner at the one call site that actually calls resolve(), rather
   *  than diffing GameState.grimsbyArrivedAt before/after at every call
   *  site (of which there are several -- the live tick loop and offline
   *  catch-up both resolve quests). See PeddlerManager.registerQuestCompletion. */
  grimsbyArrived?: boolean;
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
  /**
   * Companion to targetTab -- names a specific sub-tab within that tab
   * (e.g. 'enchanter' within the 'vendors' tab's own Blacksmith/
   * Alchemist/Enchanter switcher) for panels that have one. Omitted for
   * a notification about a tab's main content, or for any tab with no
   * sub-tabs at all. Only meaningful paired with targetTab -- a
   * targetSubTab with no targetTab is never produced. See
   * tabAcknowledged's own comment in GameState for how this drives the
   * nav shimmer/unread system, and TAB_SUBTABS in attention.ts for which
   * tabs actually have sub-tabs to target.
   */
  targetSubTab?: string;
  /**
   * Whether this entry is prominent enough to earn the top banner
   * (NotificationBanner.tsx), on top of the ordinary bottom Toast every
   * archived message already gets. Defaults to false/omitted -- routine
   * confirmations (repair, craft, sell, equip, etc.) stay Toast-only, same
   * as they always have. Only GuidanceManager's one-time "how to" nudges
   * set this true today (see GameEngine.reportGuidance), since those are
   * exactly the "worth surfacing prominently" moments the banner was
   * originally meant for -- see guild-idler-status.md's notification
   * banner/Toast dedup writeup for why this exists: before this field,
   * every single archived message triggered the banner too, not just
   * genuinely notable ones.
   */
  banner?: boolean;
}

export interface ActiveChain {
  chainId: string;
  stage: number;
  startedAt: number;
  failedStages: number;
}

/**
 * Replayable Quest Chains (patch 0224 on) -- see guild-idler-status.md's
 * Backlog entry for the full design. Deliberately its own difficulty
 * union rather than reusing RaidDifficulty, even though the values are
 * identical strings today -- a replay's difficulty config
 * (ChainReplayDifficultyConfig below) has a genuinely different shape
 * from RaidDifficultyConfig (no partySize/roleMismatchCap, no
 * rewardMultiplier), and keeping the type distinct means a future change
 * to one can't silently type-check against the other by accident.
 */
export type ChainReplayDifficulty = 'normal' | 'heroic' | 'legendary';

export interface ChainReplayDifficultyConfig {
  difficulty: ChainReplayDifficulty;
  /** Flat percentage points subtracted from every stage's success chance
   *  throughout a replay attempt at this difficulty -- applied every
   *  stage, not just the final one (confirmed design decision). */
  successPenalty: number;
  /** Flat percentage points added to the dedicated item's drop chance,
   *  and passed through to the procedural padding-loot budget multiplier
   *  for this difficulty (see LootSourceTag 'chainReplayHeroic'/
   *  'chainReplayLegendary' in proceduralLoot.ts once that lands).
   *  Deliberately the only reward lever difficulty has here -- no
   *  rewardMultiplier, confirmed loot-only. */
  lootBonus: number;
  /** Multiplies total replay duration, same "harder tiers take longer
   *  too" shape RaidDifficultyConfig already uses. */
  durationMultiplier: number;
}

/**
 * A chain replay attempt in progress -- deliberately NOT ActiveChain.
 * Same reasoning RaidManager already established for ActiveRaid being
 * its own thing rather than bolted onto quest infrastructure: a
 * replay's failure behavior is a genuine fork from a first clear's (see
 * `stage` below), not just the same shape reused. A hero can have at
 * most one of these at a time, same "one active thing per hero" rule
 * ActiveChain/regular quests already enforce -- checked the same way,
 * against `heroId`, not against `chainId` (so two different heroes could
 * in principle be replaying the same or different chains at once).
 */
export interface ActiveChainReplay {
  chainId: string;
  heroId: string;
  difficulty: ChainReplayDifficulty;
  /** Which stage (0-indexed, same numbering ActiveChain.stage uses) is
   *  currently in progress. Unlike ActiveChain, a failed stage during a
   *  replay does not retry in place -- the whole attempt resets `stage`
   *  back to 0 (see QuestManager's replay resolution once it lands),
   *  confirmed design decision, not a bug to fix later. */
  stage: number;
  startedAt: number;
  /** Total attempts at this replay that have failed at some stage and
   *  been reset to stage 0 -- a simple counter, same role
   *  ActiveChain.failedStages plays for a first clear, but counting
   *  full-attempt resets here instead of same-stage retries. */
  resetCount: number;
}

/**
 * One replay result, distinct from ChainCompleteModal's own first-clear
 * result shape -- a replay never re-grants the chain's guaranteed
 * base-tier rewardGold/rewardRenown/rewardItems/rewardEgg/title/
 * hatchery-unlock (all first-clear-only, confirmed design), so a
 * replay's result only ever needs to describe what it actually can
 * grant: loot.
 */
export interface ChainReplayResult {
  chainId: string;
  chainName: string;
  difficulty: ChainReplayDifficulty;
  heroId: string;
  success: boolean;
  /** True only if the dedicated item's chance roll hit this run -- see
   *  ChainReplayDifficultyConfig.lootBonus for how difficulty affects
   *  the odds. Never true at 'normal' (confirmed: the dedicated item's
   *  Heroic/Legendary counterparts are the entire point of replaying
   *  above Normal in the first place). */
  dedicatedItemDropped: boolean;
  loot: { defId: string; name: string; rarity: Rarity }[];
}

/**
 * A guild-upgrade-gated "saga band" -- which chains a player is allowed
 * to replay at all, independent of how the loot itself scales (that's
 * entirely the procedural system's job once the resolution logic lands,
 * not this def's). Deliberately its own type, not a reuse of
 * UpgradeDef.unlocks -- that's a simple boolean-flag union with no way
 * to carry per-entry data like a saga's own name/level-range/chain
 * membership, same reason raid upgrades got RaidUpgradeDef instead of
 * joining the general UPGRADES list. Flat one-time gold cost,
 * deliberately NOT leveled like RaidUpgradeDef (confirmed: gold-only, no
 * growth curve -- there's exactly one of each band to ever buy).
 */
export interface ChainReplayTierDef {
  id: string;
  /** e.g. "The Founding Days" -- see the Backlog's saga-name table for
   *  the full list of six, plus the one master unlock (id 'master',
   *  sagaName/levelRange unused for that entry -- see its own comment
   *  in chainReplayTiers.ts). */
  sagaName: string;
  /** Display string, e.g. "Levels 1-7" -- not used for any eligibility
   *  math, purely descriptive; actual gating is entirely via chainIds. */
  levelRange: string;
  /** States plainly what buying this does, for the shop card -- e.g.
   *  "Lets your guild replay The Founding Days for a chance at Heroic
   *  gear," not flavor text (confirmed design requirement). */
  description: string;
  /** Which chains this band covers -- see the Backlog's saga table for
   *  the authoritative chain-to-band mapping. Empty for the 'master'
   *  entry, which gates Replay Memories existing at all rather than any
   *  specific chains. */
  chainIds: string[];
  goldCost: number;
}

/* -------------------------------- raids -------------------------------- */

export type RaidDifficulty = 'normal' | 'heroic' | 'legendary';

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
   * Difficulty-specific loot pools, WoW-style -- Heroic/Legendary rolls
   * point at genuinely different (usually stat-boosted) item variants
   * rather than just the same items at a better chance. Optional and
   * independent, so this can roll out encounter by encounter: a tier with
   * no list here falls back to `loot`, the same pool every difficulty used
   * before this existed. See lootForDifficulty in raids.ts.
   */
  lootHeroic?: string[];
  lootLegendary?: string[];
  /**
   * "<rarity>[:<dedicatedPetId>]@chance" strings -- same reused-string-list
   * convention as `loot` above (see parseEggLootEntry), just a different
   * token shape since an egg roll picks a Rarity (and optionally locks in
   * a specific dedicated-pool pet) rather than an equipment defId. Rolled
   * independently of `loot`/lootHeroic/lootLegendary, same
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
  /**
   * Optional banner-art override + focus point, editable via the DevTool's
   * banner picker (see server.mjs's `bannerImage` field type). `path` is
   * relative to public/lore/ (e.g. "raids/foo.jpg") and overrides the
   * default raids/<id>.jpg naming convention RaidBanner otherwise falls
   * back to -- omitted entirely, nothing changes from before this existed.
   * focusX/focusY are 0-100 percentages fed straight into CSS
   * backgroundPosition (50/50 = center, the same default every banner used
   * unconditionally before this). `scale` (patch 0164) is an optional
   * 100-300 zoom, independent of focusX/focusY, fed into backgroundSize --
   * omitted (or 100) means the exact same plain 'cover' every banner used
   * before this existed.
   */
  banner?: { path?: string; focusX?: number; focusY?: number; scale?: number };
  /**
   * Flat percentage points added directly to every encounter's success
   * chance in this raid, independent of RAID_DIFFICULTIES' Normal/Heroic/
   * Legendary tiers -- a raid-level knob for "this specific raid should read
   * as harder (or easier) than its baseSuccess numbers alone suggest,"
   * without hand-editing every encounter's baseSuccess or distorting the
   * shared N/H/M tier promise every other raid relies on (see raids.ts's
   * own comment on why those stay global constants). Usually negative
   * (harder); a positive value is valid too, just currently unused.
   * Introduced for `silence_the_loom`, a single-encounter raid that
   * wanted a small extra difficulty bump the standard tier system
   * couldn't express on its own. See RaidManager.previewEncounterSuccess/
   * resolve for the read side, and server.mjs's `raids` schema for the
   * DevTool field.
   */
  successModifier?: number;
  /**
   * An epithet granted to every hero in the party on a full clear -- same
   * Hero.titles/HeroManager.grantTitle mechanism ChainDef.title already
   * uses, just granted to the whole clearing party at once instead of a
   * single hero (a raid is a group effort; a quest chain is solo).
   * Granted at most once per hero per raid regardless of how many times
   * it's re-cleared -- grantTitle skips a title the hero already holds.
   */
  title?: string;
  /**
   * Per-raid configurable role-slot minimums (e.g. `{ melee: 2 }`) --
   * optional, defaults to no requirement at all, same "raids without the
   * field behave exactly as today" reasoning successModifier already
   * follows. Not a hard block on committing the party (raids don't gate
   * on anything else today either); an unmet slot instead costs a flat
   * per-slot success penalty, see RaidManager.roleMismatchPenalty and
   * the "Raid role requirements" section of guild-idler-status.md's
   * hero-roles backlog entry for the full design.
   */
  requiredRoles?: Partial<Record<Role, number>>;
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
  /**
   * A hard ceiling on final per-encounter success while the party doesn't
   * meet a raid's `requiredRoles` minimums -- undefined (Normal) means no
   * ceiling at all, so a mismatched-but-overleveled-and-geared party can
   * still climb all the way to MAX_SUCCESS the same as today. Heroic and
   * Legendary define one via the tuning registry instead: no matter how far
   * gear/level push the raw computed success, an unmet role requirement
   * caps it there. This is layered ON TOP of roleMismatchPenalty (the
   * existing flat per-unmet-slot subtraction), not a replacement for it --
   * the subtraction still applies and still scales with how many slots
   * are unmet; the cap only ever pulls a result *down* to itself, never up,
   * and only takes effect once the party is actually missing something.
   * See RaidManager.hasRoleMismatch / the "Role mismatch success ceiling"
   * writeup in guild-idler-status.md for the full reasoning.
   */
  roleMismatchCap?: number;
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
  /** Set if this was a full clear and the raid carries a title that at
   *  least one hero in the clearing party didn't already hold --
   *  `titledHeroNames` is the actual subset who newly earned it this run
   *  (not the whole party -- a hero who already held the title from a
   *  prior clear is left out, same guard HeroManager.grantTitle already
   *  applies per-hero), so the toast in engine.ts credits exactly who
   *  earned it, never the roster at large. */
  titleGranted?: string;
  titledHeroNames?: string[];
  /** Heroes whose own health damage this run dropped to 0, flipping them
   *  to 'fallen' -- a subset of `injuries` above (a heroId can appear in
   *  both), kept as its own field for the same reason
   *  QuestResult.heroFallen is separate from QuestResult.injury: an
   *  ordinary injury line reads as routine, and Fallen changes what the
   *  player can actually do with that hero right now, so it needs its
   *  own callout rather than being buried in the Damage report list. */
  heroesFallen?: { heroId: string; heroName: string }[];
  /** Same reasoning, for any paired pets that fell alongside their hero
   *  this run -- see QuestResult.petFallen's own comment. */
  petsFallen?: { petName: string }[];
}

/* -------------------------- progression -------------------------- */

export type VendorId = 'blacksmith' | 'alchemist' | 'enchanter';

/**
 * One entry per Role -- name/icon only, devtool-editable via the new
 * `roles` content type (roles.json). `icon` reuses the exact same
 * `picker: 'icon'` machinery equipment/consumables/crafting recipes
 * already have (rooted at public/item-icons/, just a new `roles/`
 * subfolder within it) -- falls back to a plain text label wherever
 * it's shown if unset or the file's missing, same "missing file just
 * fails to paint" convention every other optional icon in this game
 * already follows.
 */
export interface RoleDef {
  id: Role;
  name: string;
  icon?: string;
  /**
   * Short flavour text for what this role generally does in a raid party --
   * shown as real, visible copy on the Hero Training tab's role cards
   * (patch 0141), not a tooltip. Deliberately general/mechanic-agnostic
   * rather than numeric, since Role itself carries no combat stats of its
   * own -- it only ever affects raid party composition (RaidDef.
   * requiredRoles) -- see Role's own comment above for that scope decision.
   */
  description?: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  modsPerLevel: Partial<Modifiers>;
  unlocks?: 'legendaryQuests' | 'chains' | 'blackMarket' | 'autoChain' | 'raids' | 'raidsHeroic' | 'raidsLegendary' | 'training' | 'autoChainTactics';
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
  /** Grants this many extra stash slots per level, on top of the 10-slot
   *  base floor -- same special-purpose-field shape as the slot-count
   *  fields above. See ModifierManager.stashCapacity for the base + this
   *  math, and ShopManager.buyEquipment/buyBlackMarketEquipment/buyBack
   *  and CraftingManager.craftGear for where the resulting cap is
   *  actually enforced. Only Stash Expansion uses this. */
  stashCapacityPerLevel?: number;
}

export type GuildFacility = 'barracks' | 'treasury' | 'workshop' | 'library' | 'tavern' | 'infirmary' | 'kennel' | 'music_hall' | 'physicians_charity' | 'smiths_charity';

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
  /**
   * Infirmary's structural effect -- same "not expressible as a flat
   * Modifiers bonus" reasoning as storagePerLevel/heroSlotsPerLevel
   * above. Minutes shaved off the idle Health heal-time per level (see
   * progression.ts's infirmaryHealTimeMinutes) rather than a generic
   * mod. Infirmary's modsPerLevel is deliberately empty -- see
   * guild-idler-status.md's Health stat + Fallen/death mechanic section
   * for the full design, including the free-auto-revive payoff for
   * reaching this facility's max level.
   */
  healTimeReductionMinutesPerLevel?: number;
  /**
   * Caps how many levels' worth of `modsPerLevel` actually count, even
   * when `maxLevel` (the purchasable ceiling) goes higher -- lets a
   * facility keep scaling one structural effect (Treasury's own
   * `storagePerLevel`, uncapped) as a long-tail gold sink without its
   * flat Modifiers bonus (Treasury's `gold` %) silently growing right
   * alongside it forever. Undefined means no cap, same as before this
   * field existed. See ModifierManager.guildMods and
   * guild-idler-status.md's "Treasury -- extended to level 20" entry.
   */
  modsMaxLevel?: number;
  /**
   * Physician's Charity's structural effect -- same "not a flat Modifiers
   * bonus" reasoning as every other structural field above. How many
   * Treat-an-injury actions per calendar day are free, guild-wide,
   * regardless of which hero -- see ModifierManager.freeHealsPerDay for
   * the read side and GameEngine.consumeFreeHeal for how the daily
   * counter (GameState.freeHealDay/freeHealsUsedToday) actually gets
   * spent. Level 0 (not yet purchased) grants none -- the guild-wide
   * daily freebie is something to build toward, not a given; a brand
   * new hero's own one-time free first Treat (Hero.usedFreeTreat) is the
   * separate, always-available safety net for before this is built at
   * all. See guild-idler-status.md's "new-player injury economy" entry.
   */
  freeHealsPerLevel?: number;
  /** Smith's Charity's twin of freeHealsPerLevel above, for Repair
   *  instead of Treat -- see ModifierManager.freeRepairsPerDay and
   *  GameEngine.consumeFreeRepair. */
  freeRepairsPerLevel?: number;
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
  /** Total Grimsby card flips ever resolved (regular + High Roller both
   *  count) -- powers a simple "first flip" achievement. Incremented in
   *  PeddlerManager.resolveFlip regardless of outcome tier. */
  peddlerFlips: number;
  /** Flips that landed on the 'jackpot' tier specifically, regardless of
   *  whether it was a regular or High Roller flip -- see
   *  peddlerHighRollerJackpots below for the rarer subset. Also
   *  incremented by an exact-match Dice roll (PeddlerManager.rollDice) --
   *  Grimsby-wide, not per-game, same reasoning peddlerBusts below shares. */
  peddlerJackpots: number;
  /** Jackpot-tier flips that ALSO happened to be a High Roller flip (3x
   *  fee, 3x reward) -- a strict subset of peddlerJackpots above, kept as
   *  its own counter rather than derived, since a flip's tier and its
   *  highRoller flag are only ever together inside resolveFlip's own
   *  scope, not separately reconstructable from state afterward. */
  peddlerHighRollerJackpots: number;
  /**
   * Every gold spent at Grimsby's own stall specifically -- card-flip
   * fees (regular and High Roller both, at whatever stake multiplier was
   * used), the one-time High Roller unlock, and Dice game wagers.
   * Deliberately its OWN counter rather than reading the general
   * `goldSpent` above, which mixes in every other gold sink in the game
   * (shop, repairs, upgrades...) -- "how much have I fed into Grimsby"
   * isn't answerable from that combined total. StatsPanel's own "Gold
   * spent" row stays reading `goldSpent`; a new "Gold spent at Grimsby"
   * row reads this instead.
   */
  peddlerGoldSpent: number;
  /**
   * Bust-tier outcomes at Grimsby specifically -- card flips that landed
   * on the 'bust' tier, and Dice rolls that landed neither on the chosen
   * face nor either of its wheel-neighbors (see DiceRollResult's own
   * comment). Grouped under one Grimsby-wide counter rather than a
   * separate one per game, same treatment peddlerJackpots above already
   * gets extended to for Dice's own jackpot (exact-match) rolls -- both
   * represent the same player-facing idea: paid in, got nothing back.
   */
  peddlerBusts: number;
  /**
   * Tabs SETTLED at or past peddler.tab.jackpotRound (5 by default) --
   * deliberately requires an active choice to bank it, not just reaching
   * that round and busting past it on a later push. A strict subset of
   * peddlerJackpots above (every one of these also increments that
   * shared counter), same "own counter for the specific achievement,
   * shared counter for the general one" pattern
   * peddlerHighRollerJackpots already established.
   */
  peddlerTabJackpots: number;
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
  /** Recently sold equipment, newest first, capped at BUYBACK_MAX_ENTRIES
   *  (see ShopManager.sell) -- lets a sale be reversed at a markup rather
   *  than being permanently gone the instant "Sell" is pressed. Stores the
   *  exact EquipmentItem sold (durability/plus/customMods/enchantStats all
   *  intact, not just the defId) so buying it back hands back precisely
   *  what was sold, not a fresh-rolled equivalent. */
  buyback: BuybackEntry[];

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
  /**
   * Same shape again, but split three ways -- one independent
   * day/counter pair per vendor stall, since each now has its own
   * themed upgrades (and its own Trade Favor free-reroll allowance) and
   * rerolling one shouldn't spend or gate the others. Replaces the old
   * single shared vendorRerollDay/vendorRerollsUsedToday pair (migration
   * 37 carries an existing save's used-today count over to both
   * blacksmithRerolls* and alchemistRerolls*, since those two used to
   * restock together as one action; enchanterRerolls* starts fresh --
   * see ShopManager.blacksmithRerollCost/alchemistRerollCost/
   * enchanterRerollCost and their matching rerollBlacksmith/
   * rerollAlchemist/rerollEnchanter actions).
   */
  blacksmithRerollDay: number;
  blacksmithRerollsUsedToday: number;
  alchemistRerollDay: number;
  alchemistRerollsUsedToday: number;
  enchanterRerollDay: number;
  enchanterRerollsUsedToday: number;
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
  /**
   * Guild-wide daily free-Treat tracking (Physician's Charity) -- same
   * lazy day-reset shape as questRerollDay/vendorRerollDay/
   * freezeChangeDay above, reusing data/reroll.ts's day-bucket math even
   * though that file predates this specific use. Checked before a
   * hero's own one-time usedFreeTreat, so the renewable resource spends
   * first and the one-time one is saved for whenever the daily
   * allowance is already used up -- see GameEngine.consumeFreeHeal.
   */
  freeHealDay: number;
  freeHealsUsedToday: number;
  /** Same shape again, independent counter, for Smith's Charity's daily
   *  free Repair -- see GameEngine.consumeFreeRepair. */
  freeRepairDay: number;
  freeRepairsUsedToday: number;
  boardRefreshedAt: number;
  activeQuests: ActiveQuest[];
  activeChains: ActiveChain[];
  completedChains: string[];
  /**
   * Ids of ChainReplayTierDef entries the guild has bought -- the
   * master unlock plus however many of the 6 saga bands, in any order
   * (no forced prerequisite chain between bands, same as
   * raidsHeroic/raidsLegendary today -- cost alone naturally encourages
   * roughly-in-order buying). A chain is only actually replayable once
   * its own band's id is in this array AND the chain is in
   * completedChains above -- both required, neither alone sufficient
   * (confirmed: owning a band never bypasses a chain's first clear).
   */
  chainReplayTiersOwned: string[];
  /**
   * Chain replay attempts currently in progress -- see ActiveChainReplay
   * for why this is a separate array from activeChains, not a shared
   * shape. At most one entry per heroId, same "one active thing per
   * hero" rule the rest of the quest system already enforces.
   */
  activeChainReplays: ActiveChainReplay[];
  /** The single raid attempt in progress, if any -- only one at a time, same as how a hero can only be on one quest. */
  activeRaid: ActiveRaid | null;
  /** Raid ids (any difficulty) that have been full-cleared at least once -- gates unlockNextRaidId progression. */
  completedRaids: string[];
  /** Recent raid outcomes, most recent first. Capped the same way `log` is. */
  raidLog: RaidResult[];
  /**
   * Difficulties (any raid) that have ever been full-cleared -- separate
   * from completedRaids since achievements care about "cleared a
   * Legendary", not "cleared this specific raid at Legendary". Persisted
   * rather than derived from raidLog, since that's capped and could evict
   * the evidence; this never shrinks.
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
   * Tombstone cosmetics -- global rather than per-hero (see
   * TombstoneStyleDef's own comment), so these are just an unlocked-ids
   * list plus a single active choice, not something stored per hero.
   * Optional/undefined for any save from before this system existed --
   * same defensive convention as Hero.health -- default to `['plain']`/
   * `'plain'` wherever read rather than needing a migration.
   */
  unlockedTombstoneStyles?: string[];
  selectedTombstoneStyle?: string;
  /**
   * Guild Hall decoration ids the guild actually owns -- same "global,
   * unlocked-ids list, no per-hero anything" shape as unlockedSkins/
   * unlockedTombstoneStyles just above, and same reasoning: purely
   * cosmetic, account-wide. Optional/undefined for any save from before
   * this system existed -- default to `[]` wherever read, no migration
   * needed (see GuildHallDecorManager.owned).
   */
  ownedGuildHallDecorations?: string[];
  /**
   * Which decoration currently sits in which of the 30 physical slots,
   * per background theme -- guildhall-themes.json id ->
   * (GuildHallSlotId -> GuildHallDecorationDef.id). Nested rather than one
   * flat slot map, as of patch 0207: a theme switch should never clear a
   * look, so each theme silently keeps its own arrangement rather than
   * there being one arrangement shared across every theme (or worse, one
   * arrangement that gets wiped on switch) -- see
   * GuildHallDecorManager.activeThemeId's own comment for how "which
   * theme" is resolved. `Partial` at both levels, not a full `Record`,
   * because most slots (and, so far, every theme except the one shipped
   * one) start -- and may stay -- empty; same "sparse, absence means
   * empty" shape `Hero.equipment` already uses for its own gear slots.
   * Optional/undefined for any save from before this system existed --
   * default to `{}` wherever read, no migration needed (see
   * GuildHallDecorManager.equippedId). Before patch 0207 this was a flat
   * `Partial<Record<GuildHallSlotId, string>>` with no theme level at
   * all; no migration was written for that shape either, on purpose --
   * there was no real decoration content to equip anything from until
   * well after this field existed, so a save that somehow still has the
   * old flat shape just reads as "nothing equipped in the active theme"
   * once this patch is live, the same safe degrade as any other content
   * drift. A decoration id here is not necessarily still present in
   * `ownedGuildHallDecorations` or even still a real content id --
   * GuildHallDecorManager resolves and degrades gracefully, same "content
   * may drift out from under an old save" convention CurioManager.owned
   * already follows.
   */
  equippedGuildHallDecorations?: Partial<Record<string, Partial<Record<GuildHallSlotId, string>>>>;
  /**
   * Which Guild Hall background theme (guildhall-themes.json id) is
   * currently active -- undefined defaults to
   * `DEFAULT_GUILD_HALL_THEME_ID` (guildHallSlots.ts), same "optional
   * field, no migration needed" shape every other Guild Hall Decorations
   * field on this type already uses. Always resolve this through
   * `GuildHallDecorManager.activeThemeId(state)`, not by reading the raw
   * field -- that method also degrades safely if the stored id doesn't
   * match a real theme (a theme deleted in the DevTool after a save
   * picked it), which reading this field directly would not. There is no
   * in-game control to actually change this yet (patch 0207 is engine
   * state only) -- every save is effectively pinned to the default theme
   * until one exists.
   */
  activeGuildHallTheme?: string;
  /**
   * A player's own drag/resize override of a slot's default position and
   * size, per background theme -- guildhall-themes.json id ->
   * (GuildHallSlotId -> the slot's own moved/resized rect). Same nesting
   * shape as `equippedGuildHallDecorations` just above and the same
   * reasoning: switching themes should never lose a player's layout
   * tweaks, so each theme remembers its own overrides independently, and
   * a slot with no entry here simply renders at its DevTool-authored
   * default (see `GuildHallSlotDef`) -- this field only ever holds the
   * slots a player has actually touched, not a full copy of every slot's
   * geometry. Always resolve a slot's actual on-screen rect through
   * `GuildHallDecorManager.slot`/`.slots` (which merge this override over
   * the theme default), never by reading `GuildHallSlotDef`'s own
   * top/left/width/height directly once this field might be set.
   * Optional/undefined for any save from before this system existed, and
   * for any save that has simply never moved anything -- default to `{}`
   * wherever read, no migration needed, same convention every other
   * Guild Hall Decorations field on this type already follows. An id here
   * that no longer resolves to a real slot for the active theme (the
   * DevTool hid or removed it since) is skipped, not an error, same
   * degrade-gracefully convention as everywhere else in this feature.
   */
  customGuildHallSlotLayout?: Partial<Record<string, Partial<Record<GuildHallSlotId, GuildHallSlotRect>>>>;
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
  /**
   * BardTrack ids the guild has actually earned -- each one unlocks
   * alongside a specific achievement (see AchievementDef.unlocksTrackId),
   * granted in engine.ts's reportAchievements the moment that achievement
   * fires. Replaces the old buy-a-Music-Hall-level system entirely; see
   * music.ts's own top comment. A save with an already-leveled Music Hall
   * from before this system existed is grandfathered forward once, in
   * SaveManager's migration 40, rather than losing tracks already paid
   * for in gold.
   */
  unlockedBardTracks: string[];
  /** How far each vendor's relationship has been invested in — gates how many of their upgrades are visible. */
  vendorLevels: Record<VendorId, number>;
  /**
   * Lifetime gold spent at each of the three shop vendors specifically --
   * buys, rerolls, vendor-tied upgrade purchases, and (Enchanter) Black
   * Market buys all count. Deliberately its own counter rather than
   * reading the combined stats.goldSpent, same reasoning
   * stats.peddlerGoldSpent already established for Grimsby -- "how much
   * has this vendor specifically earned from me" isn't answerable from a
   * total that also includes the other two vendors and everything else.
   * Feeds vendorRep.ts's formula directly (see that file). Never
   * decreases -- deliberately distinct from vendorLevels above, which is
   * a separate spent-to-unlock-upgrades track, not a loyalty measure.
   */
  vendorGoldSpent: Record<VendorId, number>;
  /**
   * Grimsby's Tab -- a repeating push-your-luck game, gated behind
   * grimsbyPermanentSpotUnlocked (see PeddlerManager.canOpenTab). null
   * means no tab is currently open. tier indexes into TAB_TIERS
   * (PeddlerManager.ts); round starts at 1 the instant the tab opens (the
   * buy-in itself, no risk roll on it) and has no ceiling -- pushes
   * indefinitely toward the success-chance floor rather than capping at
   * a designed max round, by direct design request. value is what
   * Settle would currently bank.
   */
  peddlerTab: { tier: number; round: number; value: number } | null;
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
   * Per-(tab, optional sub-tab) "last acknowledged" marker driving the nav
   * shimmer/unread indicator (patch 0191) -- same id-based-not-timestamp
   * shape as notificationsSeenId just above, and for the identical reason:
   * comparing by array position sidesteps the same-millisecond collision
   * class of bug already found and fixed once for this codebase (see
   * notificationsSeenId's own doc comment, and Toast.tsx's auto-dismiss
   * fix before that). Keyed by tab id alone ("vendors") for a tab-level
   * acknowledgement, or "tab:subTab" ("vendors:enchanter") for a specific
   * sub-tab -- see TAB_SUBTABS/isTabUnread in attention.ts for the read
   * side of this. A missing key means "never acknowledged," equivalent to
   * notificationsSeenId's `null` for the whole log. Visiting a tab
   * acknowledges only that tab's own bare key; visiting a specific
   * sub-tab additionally acknowledges that sub-tab's own key -- the two
   * are independent, so a notification aimed at 'vendors:enchanter'
   * specifically doesn't clear just because the player opened Vendors and
   * stayed on Blacksmith (see MenuWindow's per-tab effect and each
   * sub-tabbed panel's own per-sub-tab effect).
   */
  tabAcknowledged: Record<string, string>;
  /**
   * Chain ids whose offer has ever appeared on state.chainBoard, tracked
   * specifically to detect a chain's FIRST appearance there -- see
   * GameEngine's chainBoard-regeneration block for where this drives the
   * "a new story has surfaced" notification (patch 0191). Deliberately
   * separate from completedChains/activeChains: a chain sitting unclaimed
   * on the board (offered, but no hero sent yet) is exactly the case this
   * needs to catch, and neither of those two fields reflects that -- both
   * only update once a hero actually gets sent on the chain's first
   * stage. Also deliberately NOT the same signal LorePanel's own
   * "Discovered Quests" bucket uses (completedChains ∪ activeChains) --
   * that's a stricter "actually engaged with" definition; this is the
   * looser "has ever been offered" one the new Discovered Quests tab and
   * its notification actually need. The very first chain the guild ever
   * sees is deliberately excluded from firing this notification (see the
   * engine's own comment there) since that moment already gets the
   * standalone ChainDiscoveryModal treatment via pendingChainDiscovery --
   * still recorded here so it's never re-notified, just not banner'd.
   */
  chainsSeenOnBoard: string[];
  /**
   * Id of the newest notification the top banner has ever actually been
   * displayed for -- separate from notificationsSeenId (acknowledgment)
   * above, and deliberately durable across app restarts rather than
   * living only in NotificationBanner's own component state. Updated the
   * instant a banner is shown (see GameEngine.markBannerShown), not on
   * dismiss/timeout/click -- so a banner the player quits the app before
   * even seeing time out never gets replayed on the next launch either.
   * `null` means no banner has ever been shown (a genuinely fresh save).
   * Only entries with `NotificationEntry.banner === true` are candidates
   * for this at all -- see that field's own comment.
   */
  lastBannerShownId: string | null;
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
  /** Current stock of each curio, keyed by CurioDef.id -- open-ended (any
   *  string key), unlike `materials` (a fixed 4-key Record). No capacity
   *  cap the way materials/warehouseCapacity has -- curios are pure
   *  flavor/sell-fodder, not a resource anything is built from, so
   *  there's no economy reason to bottleneck how many can pile up. */
  curios: Record<string, number>;
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
  /**
   * True once `the_first_haul` (the Harvest tab's own one-time intro
   * chain) has been completed -- gates the Harvest tab's visibility
   * entirely, same convention hatcheryUnlocked/peddlerUnlocked already
   * established (see MenuWindow's tab filter).
   *
   * Deliberately NOT given the same "never force-unlocked by a
   * migration" treatment those two got (see MIGRATIONS[34] in
   * SaveManager.ts and its own comment) -- Harvest, unlike Hatchery/
   * Grimsby, was already unconditionally visible to every existing save
   * before this field existed at all, so defaulting every old save to
   * locked here would be a real regression (potentially stranding
   * already-invested Warehouse levels/tool levels/stored materials
   * behind a chain that didn't exist when that progress was made), not
   * "undiscovered content staying undiscovered." The migration instead
   * grandfathers any save with real prior Harvest activity straight to
   * unlocked; only a save with zero prior activity (materials, tools,
   * Warehouse level, and Trade Route all still at their fresh-save
   * defaults) is treated as new enough to go through the chain like a
   * brand-new game would.
   */
  harvestUnlocked: boolean;
  /** Set the moment harvestUnlocked flips true via the chain (not via the
   *  migration's grandfather path, which sets harvestUnlocked directly
   *  without also queuing this) -- same one-time spotlight reuse of
   *  OnboardingTour that pendingHatcherySpotlight/pendingPeddlerSpotlight
   *  already do. */
  pendingHarvestSpotlight: boolean;

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
  /** Flips true the moment any hero's very first title is granted
   *  (chain or raid) -- engine.ts reads this to decide whether a title
   *  grant gets the prominent banner treatment (first one only) or an
   *  ordinary small Toast (every one after). Migrated true for any save
   *  that already has a titled hero by the time this field was added, so
   *  existing players don't get a retroactive "first title!" banner for
   *  a title they've had for patches already. */
  hasEarnedFirstTitle: boolean;
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
   *  that slot (same gearScoreForItem comparison engine.equipBestGear
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
  /**
   * Guild-wide overrides for the Auto-Chain bounty streak's own picker
   * (QuestManager.pickBestQuest), unlocked by the Chain Tactics upgrade
   * (`unlocks: 'autoChainTactics'`). Optional/undefined the same
   * defensive way autoRepairEnabled's siblings above are NOT (those are
   * required with a real default at save-creation time) -- this one is
   * optional instead because it only ever matters once the gating
   * upgrade is owned, so every read goes through
   * ModifierManager.hasUnlock(state, 'autoChainTactics') first and falls
   * back to pickBestQuest's original hardcoded behavior (50% floor,
   * gold-weighted) when it isn't. No SAVE_VERSION bump needed for the
   * field itself; see Hero.autoChainMinutesRemaining's own migration for
   * the one field this system did need to backfill.
   */
  autoChainTactics?: AutoChainTactics;

  /* ------------------------- Grimsby / the peddler ------------------------- */
  /** True once the intro chain that grants Grimsby has been completed --
   *  gates the tab's visibility entirely, same convention hatcheryUnlocked
   *  already established (see MenuWindow). */
  peddlerUnlocked: boolean;
  /** Set the moment peddlerUnlocked flips true -- same one-time spotlight
   *  reuse of OnboardingTour that pendingHatcherySpotlight already does. */
  pendingPeddlerSpotlight: boolean;
  /**
   * Non-burst quest completions since Grimsby's last visit (or since
   * unlock, if he's never visited yet). Burst-mode quests never increment
   * this -- identified the same way QuestManager.resolve's own
   * dailyBurstBonus check already does (duration within the tier's own
   * burst range) -- see the design writeup for why burst was explicitly
   * excluded (the exact class of exploit the original burst-taper fix was
   * about: a cheap, frequent action shouldn't be able to fast-forward a
   * separately-balanced system). Frozen (not incremented further) while
   * he's actually present -- see grimsbyArrivedAt.
   */
  questsSinceGrimsby: number;
  /** This cycle's randomized target for questsSinceGrimsby (5-10,
   *  re-rolled every time he leaves) -- see PeddlerManager.rollThreshold. */
  grimsbyThreshold: number;
  /** Epoch ms he arrived, or null if he's not currently here. Distinct
   *  from questsSinceGrimsby reaching 0 -- that also happens right after
   *  he leaves, this is the actual presence flag every UI/logic check
   *  should read instead of inferring presence from the counter. */
  grimsbyArrivedAt: number | null;
  /** Epoch ms he'll pack up and leave if never interacted with --
   *  computed once at arrival (grimsbyArrivedAt + the Tuning-driven
   *  leave window), not recomputed on every tick. Checked in
   *  GameEngine.refreshWorld the same place Harvest's own despawn timers
   *  already are. */
  grimsbyLeavesAt: number | null;
  /** True once the High Roller upgrade has been bought on Grimsby's own
   *  page -- a one-time, persistent unlock (not a per-level stacking
   *  upgrade), same "flip once, stays flipped" shape peddlerUnlocked
   *  itself already uses. Once true, PeddlerPanel offers a second,
   *  separate flip alongside the regular one: same card pool/format,
   *  fee and reward both scaled by peddler.highRollerMultiplier (see
   *  PeddlerManager.resolveFlip). Deliberately its own boolean rather
   *  than folded into the shared vendor UPGRADES list -- Grimsby isn't
   *  a vendor, and every other Grimsby-specific number already lives in
   *  its own `peddler.*` tuning namespace rather than that shared list. */
  grimsbyHighRollerUnlocked: boolean;
  /** True once "A Permanent Spot" has been bought on Grimsby's own page
   *  (patch 0220) -- a one-time, persistent unlock, same "flip once,
   *  stays flipped" shape grimsbyHighRollerUnlocked already uses.
   *  PeddlerManager.isPresent reads this alongside grimsbyArrivedAt, so
   *  once true, Pick Your Card/Dice/the "!" tab badge all read as
   *  present permanently, independent of the arrival/leave-timer cycle
   *  arrivedAt/leavesAt still drive for a player who hasn't bought this.
   *  grimsbyArrivedAt/grimsbyLeavesAt are left completely alone by this
   *  flag -- still tick normally underneath, just no longer the only
   *  thing presence depends on. */
  grimsbyPermanentSpotUnlocked: boolean;
  /** True once the Gold-for-Renown exchange has been unlocked (patch
   *  0220) -- one-time gold cost, same "flip once, stays flipped" shape
   *  as grimsbyHighRollerUnlocked. Deliberately its own boolean rather
   *  than a general UPGRADES entry: this isn't a stat bonus with
   *  modsPerLevel, it gates a standalone exchange action
   *  (GuildManager.exchangeGoldForRenown) instead. See
   *  Tuning "treasury.renownExchangeUnlockCost"/"treasury.goldPerRenown". */
  goldRenownExchangeUnlocked: boolean;
  /** Lifetime gold ever donated via "Fund the Guild" (patch 0220) --
   *  never decreases, survives prestige/retirement, same "counts up
   *  forever" shape state.stats' own lifetime counters use. Feeds a
   *  small, deliberately diminishing-returns component of Guild Power
   *  (see power.ts's guildPowerBreakdown -- sqrt of this value, not
   *  linear, so it stays "a very small portion" no matter how large this
   *  gets) rather than granting any stat bonus directly. */
  guildDonationsTotal: number;
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
  /**
   * Mirrors Hero.health exactly, including the "no floor, reaches 0 ->
   * Fallen" shape -- optional/undefined defaults to full via
   * PetManager.currentHealth, same defensive convention, no migration.
   * Takes the SAME damagePercent its paired hero does on an injury roll
   * (see QuestManager.resolve) -- not a separate roll, not scaled by the
   * pet's own stats (pets have none). See guild-idler-status.md's Pet
   * Health/Fallen entry.
   */
  health?: number;
  /**
   * Epoch ms this pet's Health hit 0, mirroring Hero.fallenAt -- drives
   * the free auto-revive timer once Kennel (the pet-specific parallel to
   * Infirmary) reaches its max level. A Fallen pet contributes zero
   * bonus while down (no soft penalty the way Hero's success roll gets --
   * a downed pet doesn't block its hero from still questing, so there's
   * no "auto-fail" problem to soften here).
   */
  fallenAt?: number | null;
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

/* ----------------------------- Grimsby / the peddler ----------------------------- */

export type PeddlerCardTier = 'bust' | 'refund' | 'modest' | 'good' | 'jackpot';

/**
 * One possible outcome living in a face-down card, defined in
 * json/peddler-cards.json (devtool-editable, own schema -- see
 * server.mjs's 'peddler-cards' entry). Deliberately its own content type
 * rather than reusing the general equipment/loot pool: an outcome needs
 * its own weight, its own flavor line, and a `kind` discriminator none
 * of the existing loot-table shapes carry, AND it needs to support pure
 * joke/flavor entries (kind: 'joke') that must never leak into the real
 * shop/black-market/quest-loot pools -- see the design doc's "Rock rule."
 *
 * Selection is two-level: PeddlerManager rolls a `tier` first, weighted
 * by the Tuning registry's peddler.tierWeight.* knobs (pure balance,
 * content-free), THEN picks one entry from that tier's own pool here,
 * weighted by this def's own `weight` (content, tier-probability-free).
 * See guild-idler-status.md's Grimsby writeup for the full design.
 */
export interface PeddlerCardDef {
  id: string;
  tier: PeddlerCardTier;
  /** Relative weight among other entries in the SAME tier, not global. */
  weight: number;
  kind: 'nothing' | 'joke' | 'goldFlat' | 'goldRefund' | 'material' | 'scrap' | 'equipment' | 'egg' | 'curio';
  /** Grimsby's own line when this specific card flips -- sleazy/comic
   *  register regardless of tier, even on a good outcome. */
  flavorText: string;
  /** kind: 'joke' only -- a display name for the flipped card ("A Rock").
   *  Never a real item id; nothing else reads this. */
  jokeItemName?: string;
  /** kind: 'goldFlat' only. */
  goldAmount?: number;
  /** kind: 'goldRefund' only -- percentage of the fee just paid. */
  refundPercent?: number;
  /** kind: 'material' only. */
  materialId?: MaterialId;
  materialAmount?: number;
  /** kind: 'scrap' only. */
  scrapAmount?: number;
  /**
   * kind: 'equipment' only. Two ways to specify what drops, resolved in
   * PeddlerManager.rollOneOutcome (baked into the outcome once at roll
   * time, so the revealed card and the actually-granted item are
   * guaranteed to be the same roll, not two independent ones):
   * - `itemRarity` set -> rolls a random EquipmentDef at that rarity
   *   from the general pool, excluding raidExclusive (Heroic/Legendary
   *   raid-only loot), craftable (empty-mods crafting bases, not real
   *   drops), and anything appearing in any ChainDef.rewardItems (a
   *   chain's own guaranteed reward shouldn't also be handed out as a
   *   random gamble). This is the intended, recommended way to author
   *   an equipment card now -- "a jackpot epic," not one specific item.
   * - `itemId` set instead (and `itemRarity` unset) -> the old fixed-
   *   item behavior, unchanged, for the rare case a specific named item
   *   is actually wanted here on purpose.
   * If `itemRarity`'s pool comes up empty (e.g. a rarity with nothing
   * eligible left after exclusions), falls back to whatever `itemId`
   * already was -- same "degrade gracefully, never throw" precedent
   * every other content-driven roll in this game already follows.
   */
  itemRarity?: Rarity;
  itemId?: string;
  /** kind: 'egg' only -- same shape as ChainDef.rewardEgg. */
  eggRarity?: Rarity;
  dedicatedPetId?: string;
  /** kind: 'curio' only -- see CurioDef's own doc comment. A specific
   *  named curio, not a rarity-pool roll like equipment's `itemRarity`
   *  -- curios have no rarity concept to roll against, just a flat
   *  `sellValue` per def, so there's nothing a pool roll would add over
   *  just picking the curio directly. */
  curioId?: string;
  /**
   * Single-emoji fallback shown in the icon-only card result display --
   * same role ConsumableDef.glyph/MaterialDef.glyph already play. Used
   * for kind: 'joke'/'nothing' (which have no real item to look an icon
   * up from) and as the final fallback for any other kind whose real
   * icon can't be resolved. Optional; PeddlerOutcomeIcon falls back to a
   * generic '?' if even this is unset.
   */
  glyph?: string;
  /**
   * Optional real icon for the generic (non-item-referencing) kinds --
   * 'nothing' / 'joke' / 'goldFlat' / 'goldRefund' / 'scrap' -- e.g. a
   * sack-of-gold icon for a goldFlat card. Same convention/picker as
   * MaterialDef.icon/ConsumableDef.icon (falls back to `glyph`, which
   * falls back to a generic '?'). 'material'/'equipment'/'egg'/'curio'
   * kinds keep pulling their icon from the referenced def instead (see
   * PeddlerOutcomeIcon) -- this field only matters for kinds that have
   * no def to look one up from.
   */
  icon?: string;
}

/**
 * Sellable odds-and-ends that are neither a crafting Material (fixed 4,
 * tied one-to-one to a Harvest node) nor a Consumable (has a quest-time
 * effect) nor Equipment (rolls stats, equips onto a hero) -- pure flavor
 * collectibles with exactly one thing you can do with them: sell for
 * gold. "Getting an actual Rock from Grimsby" is the founding example --
 * see PeddlerCardDef.kind's own 'curio' case, and QuestManager's ordinary
 * curio-drop roll (same shape as its ordinary egg-drop roll) for the
 * other way these enter play. Open-ended/DevTool-editable, same
 * "own JSON file, own schema" pattern as equipment/consumables/peddler-
 * cards -- NOT modeled on MaterialDef, which is a fixed, hand-authored
 * set of exactly 4 with no room to grow.
 */
export interface CurioDef {
  id: string;
  name: string;
  description: string;
  /** Flat gold value on sale -- curios have no other use, so this is the
   *  entire economic reason one is worth picking up at all. Deliberately
   *  wide-ranging across the pool ("might have a lot of value or not
   *  much") rather than clustered -- see curios.json's own entries. */
  sellValue: number;
  /** Single-glyph fallback, same role as MaterialDef.glyph/
   *  ConsumableDef.glyph. */
  glyph: string;
  /** Relative path under `public/item-icons/`, same convention/fallback
   *  chain (falls back to `glyph`, which falls back to a generic '?')
   *  every other def's own `icon` field already follows. */
  icon?: string;
}

/**
 * Which of the Guild Hall's fixed decoration slots a
 * GuildHallDecorationDef can be placed into. These are POOLS an item is
 * assigned to, not one of the 30 individual physical slot instances --
 * e.g. a single 'wallCenterpiece' item is equally valid in either of the
 * two Wall 1/Wall 2 slots, and a single 'wallTrinket' item is valid in
 * any of the 16 bookshelf compartment slots (8 per bookshelf). The 30
 * physical slot instances themselves (id, position, size, which pool
 * they draw from) are locked design data -- see guild-idler-status.md's
 * "Customizable Guild Hall background" backlog entry for the full
 * layout and coordinates -- and now exist in code as their own registry,
 * `GuildHallSlotDef`/`slotsForTheme` in guildHallSlots.ts (patch 0203,
 * made per-theme in patch 0207). This type only covers the content (the
 * decorations themselves); which physical slot a player has actually put
 * one into is `GameState.equippedGuildHallDecorations`, and the in-game
 * Customize UI that lets them do that lives in
 * GuildHallCustomizeScene.tsx (patch 0204).
 */
export type GuildHallSlotType =
  | 'banner'
  | 'wallCenterpiece'
  | 'trophyCase'
  | 'centerpiece'
  | 'middleShelf'
  | 'lowerShelf'
  | 'wallTrinket'
  | 'corner'
  | 'floorCenterpiece';

/**
 * How a GuildHallDecorationDef is obtained -- deliberately mixed per
 * item rather than one flat currency, so a fully-decorated Guild Hall
 * reads as "bought," "earned," and "got lucky," not a single grind.
 * `acquisitionKind` picks which of `goldCost`/`achievementId` actually
 * matters; the other is left unused for that row, same "category picks
 * which other fields matter" pairing the DevTool's own schema comment
 * describes (server.mjs's 'guild-hall-decorations' entry).
 *
 * Patch 0211: this used to be a nested discriminated union
 * (`acquisition: { kind: 'gold'; cost: number } | ...`), but the DevTool
 * schema was always flat fields (`acquisitionKind`/`goldCost`/
 * `achievementId` -- see server.mjs) with nothing converting between the
 * two shapes on save/load. Every decoration authored through the DevTool
 * therefore landed on disk with no `acquisition` object at all, so
 * `def.acquisition.kind` threw the instant a picker rendered a not-yet-
 * owned decoration (buildOptions in GuildHallCustomizeScene.tsx, and
 * GuildHallDecorManager.purchase) -- an uncaught render-time exception
 * with no ErrorBoundary anywhere in the tree unmounts the whole React
 * root, and since the entire app is one transparent frameless
 * BrowserWindow (electron/main.ts), that reads as the guild menu (and
 * the idle companion sprite, same window/root) simply vanishing while
 * the Electron process itself stays up -- exactly the crash reported
 * ("assigned a books image, clicked a middle shelf, the whole game
 * closed but the exe was still running"). Flattening this type to match
 * what the DevTool actually writes is the fix, rather than adding a
 * transform layer to server.mjs -- fewer moving parts, and the DevTool's
 * own schema comment already called flat fields the intended shape.
 */
export type GuildHallDecorAcquisitionKind = 'gold' | 'achievement' | 'grimsby';

/**
 * A single Guild Hall decoration: purely cosmetic, no stat effect.
 * Open-ended/DevTool-editable, same "own JSON file, own schema" pattern
 * as CurioDef just above -- see server.mjs's 'guild-hall-decorations'
 * schema entry and its new 'decorationImage' field type.
 */
export interface GuildHallDecorationDef {
  id: string;
  name: string;
  description: string;
  slotType: GuildHallSlotType;
  acquisitionKind: GuildHallDecorAcquisitionKind;
  /** Only meaningful when `acquisitionKind === 'gold'`. */
  goldCost?: number;
  /** Only meaningful when `acquisitionKind === 'achievement'` -- an
   *  achievements.json id, free text (matches the DevTool field). */
  achievementId?: string;
  /**
   * Placement art + fit, editable via the DevTool's decoration picker
   * (server.mjs's `decorationImage` field type). Deliberately NOT the
   * same shape as RaidDef.banner/ChainDef.banner above -- those render
   * with CSS `background-size: cover` (fills the box, cropping edges),
   * right for wide banner art but wrong for a discrete pixel-art item
   * that must never be cropped. `path` is relative to `public/decor/`.
   * `focusX`/`focusY` (0-100, default 50/50 = centered) position the
   * sprite's own center point within its slot via a CSS transform, not
   * backgroundPosition. `scale` (default 100 = the sprite's natural
   * `object-fit: contain` size within the slot) can go below 100 to
   * shrink an oversized source crop as easily as above 100 to enlarge a
   * small one -- unlike banner `scale` (100-300, zoom-only), decoration
   * art routinely needs shrinking to fit a small slot, not just zooming.
   */
  image?: { path?: string; focusX?: number; focusY?: number; scale?: number };
}

/**
 * One of the 30 physical decoration slots baked into the Guild Hall's
 * background art -- a closed union, not a plain string, because *which
 * slots exist* is fixed, hardcoded identity (see guildHallSlots.ts's
 * `SLOT_IDENTITY`), the same "code defines the fixed set" convention
 * `GuildFacility` already uses, not the "DevTool defines an open-ended
 * set" convention `HeroSkin`/decoration ids use. Adding, removing, or
 * renaming a slot is a code change, not a DevTool content edit. A slot's
 * *position*, on the other hand, is real DevTool content -- the "Guild
 * Hall Slot Layout" tool (patches 0205/0206) edits it per background
 * theme, no code change needed -- see `GuildHallSlotDef`/`slotsForTheme`
 * in guildHallSlots.ts for how identity and per-theme geometry combine.
 */
export type GuildHallSlotId =
  | 'banner' | 'wall1' | 'wall2' | 'trophycase' | 'centerpiece' | 'floor' | 'cornerL' | 'cornerR'
  | 'left-0-0' | 'left-0-1' | 'left-1-0' | 'left-1-1' | 'left-2-0' | 'left-2-1' | 'left-3-0' | 'left-3-1'
  | 'right-0-0' | 'right-0-1' | 'right-1-0' | 'right-1-1' | 'right-2-0' | 'right-2-1' | 'right-3-0' | 'right-3-1'
  | 'center-0-0' | 'center-0-1' | 'center-1-0' | 'center-1-1' | 'center-2-0' | 'center-2-1';

/**
 * A slot's own position + size, in % of the Guild Hall background art's
 * bounding box -- pulled out as its own shape (patch 0212) so it can be
 * reused both by `GuildHallSlotDef` (the DevTool-authored, per-theme
 * default) and by `GameState.customGuildHallSlotLayout` (a player's own
 * per-save override of that default -- see that field's own doc comment
 * for why moving/resizing a slot is a save-level override rather than a
 * new DevTool-owned geometry source).
 */
export interface GuildHallSlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Geometry + pool for one physical slot, in % of the Guild Hall
 * background art's own bounding box -- exactly the coordinates locked in
 * during the mockup pass (guild-idler-status.md's "Final locked slot
 * coordinates" JSON block), transcribed verbatim into guildHallSlots.ts
 * rather than re-derived. `slotType` is which `GuildHallDecorationDef`s
 * are eligible for this slot (matched against the def's own `slotType`);
 * `label` is the short mockup-era name (e.g. "L2a"), useful for
 * debugging/DevTool display, not shown to the player. This is the
 * *default* geometry a theme ships with -- a player can drag/resize a
 * slot away from it (patch 0212), which is layered on top per-save
 * rather than changing this DevTool-owned default; see
 * `GameState.customGuildHallSlotLayout`.
 */
export interface GuildHallSlotDef extends GuildHallSlotRect {
  id: GuildHallSlotId;
  label: string;
  slotType: GuildHallSlotType;
}

/**
 * NOTE: an earlier version of this file had a PeddlerConfigDef type here
 * -- a single DevTool-configurable "resultCardBackground" image. That
 * approach is gone now, superseded by three fixed result-card art files
 * (public/peddler/cards/result_0/1/2.png) chosen at random per reveal,
 * the exact same convention as the face-down cards' own back_0/1/2.png
 * already use -- see PeddlerCardModal.tsx's own comment on
 * `resultBackIndex` for the reasoning. No DevTool field needed for
 * this anymore, same as back_0/1/2.png never needed one either.
 */

/**
 * One concrete, already-rolled outcome ready to display and (for the
 * picked one) apply -- the resolved form of a PeddlerCardDef, with its
 * cosmetic card-back art attached. `backIndex` is purely which of the 3
 * uploaded card-back designs this card shows face-down (see
 * PeddlerManager.resolveFlip's own comment: this is randomized
 * independently of `outcome`, on purpose, so the art never telegraphs
 * the tier).
 */
export interface PeddlerFlipCard {
  backIndex: 0 | 1 | 2;
  outcome: PeddlerCardDef;
}

/** All three cards from one "Pick Your Card" flip -- `pickedIndex` is
 *  which of the three was actually chosen and paid out; the other two
 *  are shown too (per design: reveal all three, "so close" tension is
 *  the point), but their outcomes were never applied to GameState. */
export interface PeddlerFlipResult {
  cards: [PeddlerFlipCard, PeddlerFlipCard, PeddlerFlipCard];
  pickedIndex: 0 | 1 | 2;
  feePaid: number;
  /** Grimsby's own Vendor Rep rebate on this flip's fee -- already
   *  applied to GameState.gold on top of whatever the picked card
   *  granted; purely a display value from here on. 0 at rep level 0. */
  rebate: number;
  /** True if this was a High Roller flip (3x fee, 3x reward, same card
   *  pool/format) rather than the regular one -- see
   *  GameState.grimsbyHighRollerUnlocked's own comment. */
  highRoller: boolean;
  /** Concrete reward text for the picked card, already resolved against
   *  live game data (item name, etc.) -- UI display convenience so
   *  PeddlerPanel doesn't need to re-look-up EQUIPMENT_BY_ID/MATERIAL_BY_ID
   *  itself. */
  rewardSummary: string;
}

/** A face on Grimsby's dice -- 1 through 6, same as any six-sided die. */
export type DiceFace = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One resolved Dice game roll -- a second, gold-only wager game at
 * Grimsby's cart alongside Pick Your Card, with no card-tier content
 * pool of its own (see PeddlerManager.rollDice). The wager is a free-
 * form gold amount rather than a fixed fee, so there's no separate
 * "stake" concept here the way card flips have -- the wager itself
 * already is the stake.
 *
 * Payout is decided by CIRCULAR distance around the six faces (1-2-3-4-
 * 5-6-1, wrapping past 6 back to 1) between `chosen` and `landed`, not
 * plain numeric distance -- confirmed directly from the original ask's
 * own worked example ("1 or 5 for a 6"): 1 is numerically far from 6,
 * but is its wheel-neighbor once the ends wrap around, same as 2 and 6
 * both flank 1. Every face has exactly two neighbors this way, with no
 * special-cased edge faces.
 * - distance 0 (exact match): 'jackpot' -- payout is 3x the wager.
 * - distance 1 (either neighbor): 'partial' -- payout is half the wager
 *   (rounded down).
 * - distance 2 or 3 (anything else): 'bust' -- payout is 0, the wager is
 *   simply lost.
 */
export interface DiceRollResult {
  chosen: DiceFace;
  landed: DiceFace;
  wager: number;
  outcome: 'jackpot' | 'partial' | 'bust';
  /** Gold actually credited back from the game's OWN payout -- 0 for a
   *  bust. Already applied to GameState.gold (and clamped to gold
   *  storage) by the time this is returned; purely a display value from
   *  here on. Does NOT include rebate below -- kept separate so the UI
   *  can show "won 150g" and "+3g loyalty" as two distinct lines rather
   *  than one blended number. */
  payout: number;
  /** Grimsby's own Vendor Rep rebate on this roll's wager -- applied to
   *  GameState.gold on top of payout above, regardless of outcome (even
   *  a bust still gets this). 0 at rep level 0. */
  rebate: number;
}

/**
 * Result of a single "Run it up" push in Grimsby's Tab -- transient,
 * same "mutate state, UI reads a returned result" shape
 * PeddlerFlipResult/DiceRollResult already use for the other two games.
 * The ONGOING tab itself lives in GameState.peddlerTab (persists across
 * pushes, unlike this); this is just "what happened on THIS push."
 */
export interface PeddlerTabRunResult {
  success: boolean;
  /** The tab's round AFTER this push -- meaningless on a bust (the tab
   *  is gone), present anyway so a bust result can still show "made it
   *  to round N before busting." */
  round: number;
  /** The tab's value after this push -- 0 on a bust (see
   *  PeddlerManager.runItUp's own comment: no partial refund). */
  value: number;
  /** Grimsby's own Vendor Rep rebate on this push's fee -- applied to
   *  GameState.gold regardless of success/bust, same "he shaves you a
   *  little back either way" reasoning PeddlerManager.repRebate's own
   *  comment establishes. Purely a display value from here on. */
  rebate: number;
}

