import { EQUIPMENT_BY_ID, RARITY_PRICE_MULT } from '../data/equipment';
import { EquipmentDef, EquipmentItem, ElementType, GameState, GemTier, Hero, Stats } from '../types';
import { uid, Rng } from '../rng';
import { clamp } from '../util';
import { Tuning } from '../data/tuning';
import { matchBonusForTier } from '../data/elements';
import { isProceduralTemplate, rollProceduralItem, scaleDedicatedItem, LootSourceTag } from '../data/proceduralLoot';

export const MAX_PLUS = 10;

export const EquipmentManager = {
  /**
   * `roll`, if provided, is used to generate real mods/stats for a blank
   * procedural template (patch 0214) -- omitted entirely for hand-
   * authored items with no roll info at all (e.g. an ordinary first-clear
   * chain/raid reward grant, or a stray dev/test call), which just
   * instantiate exactly as before, no scaling of any kind.
   *
   * A second case (patch 0225, extended patch 0258 -- Dedicated Reward
   * Level Scaling, see guild-idler-status.md): any hand-authored item
   * (`!isProceduralTemplate` -- chainExclusive rewards AND ordinary raid
   * Set pieces alike, extended from chainExclusive-only in patch 0258)
   * gets real level-scaling when `roll.sourceTag` is one of the four
   * Heroic/Legendary tags (`chainReplayHeroic/Legendary`,
   * `raidHeroic/Legendary`) AND `roll.heroLevel` is provided -- see
   * scaleDedicatedItem's own comment in proceduralLoot.ts for the full
   * formula. `rolledItemLevel` IS now set to the hero's level at drop
   * time (patch 0258 reversed the old "deliberately does NOT set" -- see
   * that patch's own writeup for why leaving it unset was actively
   * undermining the point of scaling the item up in the first place).
   * Missing `roll.heroLevel` on an otherwise-eligible sourceTag falls
   * through untouched rather than crashing, same "missing data degrades
   * gracefully" convention as the procedural branch above -- every real
   * call site (QuestManager's replay resolution, RaidManager's loot
   * resolution) always passes one.
   */
  instantiate(defId: string, roll?: {
    itemLevel: number; sourceTag: LootSourceTag; rng: Rng;
    weightedKey?: keyof Stats; weightMultiplier?: number; heroLevel?: number;
  }): EquipmentItem | null {
    const def = EQUIPMENT_BY_ID[defId];
    if (!def) return null;
    const item: EquipmentItem = { uid: uid('it'), defId, durability: def.maxDurability, plus: 0 };
    const dedicatedTags: LootSourceTag[] = ['chainReplayHeroic', 'chainReplayLegendary', 'raidHeroic', 'raidLegendary'];
    if (roll && isProceduralTemplate(def)) {
      const result = rollProceduralItem(
        def.rarity, roll.itemLevel, roll.sourceTag, def.name, roll.rng, roll.weightedKey, roll.weightMultiplier,
      );
      // patch 0255: a procedural roll's power is entirely stats now (no
      // more direct Modifier affixes) -- lands in rolledStats, its own
      // field, never enchantStats (that field is Armour Infusion's own
      // additive purchases; see rolledStats' own comment in types.ts).
      item.rolledStats = result.stats;
      item.proceduralName = result.displayName;
      item.rolledItemLevel = roll.itemLevel;
    } else if (roll && !isProceduralTemplate(def) && roll.heroLevel != null
      && (dedicatedTags as string[]).includes(roll.sourceTag)) {
      const result = scaleDedicatedItem(
        def, roll.heroLevel,
        roll.sourceTag as 'chainReplayHeroic' | 'chainReplayLegendary' | 'raidHeroic' | 'raidLegendary',
      );
      item.rolledStats = result.rolledStats;
      // patch 0256/0257: def.mods on a hand-authored item is now only
      // ever the preserved durability/health pair (or empty) -- writing
      // the scaled version into customMods correctly REPLACES def.mods
      // wholesale (HeroManager.equipmentMods reads `item.customMods ??
      // def.mods`), same as a crafted item's mods already work.
      if (Object.keys(result.mods).length > 0) item.customMods = result.mods;
      item.proceduralName = result.displayName;
      item.rolledItemLevel = roll.heroLevel;
    }
    return item;
  },

  def(item: EquipmentItem): EquipmentDef | undefined {
    return EQUIPMENT_BY_ID[item.defId];
  },

  maxDurability(item: EquipmentItem): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 1;
    return Math.floor(def.maxDurability * (1 + item.plus * 0.1));
  },

  isBroken(item: EquipmentItem): boolean {
    return item.durability <= 0;
  },

  /**
   * Flips the Vault lock on one stash item. Stash-only, same "equipped or
   * missing" refusal every other stash-scoped action already returns --
   * an equipped item has no lock state to toggle in the first place (see
   * EquipmentItem.locked's own comment for why the flag never applies to
   * worn gear). Toggling, not two separate lock/unlock calls, since the
   * UI only ever needs "flip whatever it currently is" from a single
   * button/icon per item.
   */
  toggleLock(state: GameState, itemUid: string): string | null {
    const item = state.stash.find((i) => i.uid === itemUid);
    if (!item) return 'That item is equipped or missing.';
    item.locked = !item.locked;
    return null;
  },

  /**
   * Gold to fully repair. Scales with rarity and missing durability.
   *
   * perPoint dropped from 1.2 to 0.6, and the workshop discount now starts
   * at 15% even at Workshop level 0 (capping at 50% at max level, up from a
   * 0%-40% range) -- combined, roughly a 55-58% reduction throughout the
   * curve. Wear applies independently to every equipped slot (up to 7) on
   * every quest, so at the original rate a hero's full repair bill could
   * outpace Easy-tier gold income entirely, especially after 0039 deliberately
   * lowered early gold to fix the 95%-success-ceiling problem. This is
   * purely a spending-side fix -- durability still matters, it just no
   * longer eats the whole paycheck.
   */
  /**
   * `vendorDiscountPercent` is the Blacksmith's own Smith's Discount
   * vendor upgrade (ModifierManager.global(state).repairDiscount) --
   * applied as a second, independent multiplier on top of the existing
   * Workshop discount, same "own key, own percentage, explicitly summed"
   * shape revivalDiscount uses. Defaults to 0 so every existing call
   * site keeps working unchanged until it's threaded through.
   */
  repairCost(item: EquipmentItem, workshopLevel: number, vendorDiscountPercent = 0): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const missing = EquipmentManager.maxDurability(item) - item.durability;
    if (missing <= 0) return 0;
    const perPoint = 0.6 * RARITY_PRICE_MULT[def.rarity] * (1 + item.plus * 0.2);
    const discount = 1 - Math.min(0.5, 0.15 + workshopLevel * 0.035);
    const vendorDiscount = 1 - Math.min(0.6, vendorDiscountPercent / 100);
    return Math.max(1, Math.ceil(missing * perPoint * discount * vendorDiscount));
  },

  /**
   * Patch 0282: previously priced every refine off the flat, unscaled
   * `def.value` too -- same shape of bug `sellValue` had before patch
   * 0281, just biting in the opposite direction. A level-50 procedural
   * or dedicated-scaled item's refine cost tracked its bone-stock
   * template's low authored value, not its actual rolled power, so
   * high-level gear was UNDERPRICED to upgrade the stronger it got --
   * the mirror image of sellValue selling scaled gear for too little.
   * Now routes through the same referenceValue used for sell/shop
   * pricing, so refine cost scales with real power the same way selling
   * and buying already do.
   */
  upgradeCost(item: EquipmentItem, workshopLevel: number): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const reference = EquipmentManager.referenceValue(item, def);
    const base = reference * 0.6 * Math.pow(1.65, item.plus);
    const discount = 1 - Math.min(0.4, workshopLevel * 0.04);
    return Math.ceil(base * discount);
  },

  /**
   * The "what's this actually worth new" reference both sellValue
   * (patch 0281) and upgradeCost (patch 0282) price against. Mirrors
   * shopPrice's own level+rarity curve (patch 0241), but keyed on
   * `rolledItemLevel` being present rather than on `isProceduralTemplate`
   * -- gear now scales with level via TWO mechanisms (rollProceduralItem's
   * blank templates, patch 0214, AND scaleDedicatedItem's chain-replay/
   * raid dedicated rewards, patch 0258), and neither selling nor
   * upgrading an item should treat it differently just because its drop
   * happened to come from the dedicated path instead of the procedural
   * one. def.value (a template's own low, unscaled authored number -- a
   * wooden_sword's `value` is 2 gold no matter what it actually rolls
   * at) stays the reference for anything with no `rolledItemLevel` at
   * all: an ordinary hand-authored fixed-power item, or a first-clear
   * chain/raid grant with no roll info, where the authored value already
   * reflects the item's real power and was never stale in the first
   * place.
   */
  referenceValue(item: EquipmentItem, def: EquipmentDef): number {
    if (item.rolledItemLevel != null) {
      return Tuning.get('shop.baseValuePerLevel') * RARITY_PRICE_MULT[def.rarity]
        * (1 + item.rolledItemLevel * Tuning.get('shop.valueGrowthPerLevelPercent') / 100);
    }
    return def.value;
  },

  /**
   * Patch 0281: previously priced every item off the flat, unscaled
   * `def.value` regardless of how it actually rolled -- meaning a
   * level-50 procedural Legendary or a Legendary-tier raid replay drop
   * sold for the same pocket change as its bone-stock template, since
   * `def.value` on a blank template is anchored to its low base reqLevel
   * and a dedicated item's authored `value` never moved even after
   * scaleDedicatedItem scaled its actual stats up. Now routes through
   * referenceValue so a scaled item's sell price tracks the level it
   * actually rolled at, same as its shop price already has since 0241.
   */
  sellValue(item: EquipmentItem): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const condition = 0.4 + 0.6 * (item.durability / EquipmentManager.maxDurability(item));
    const reference = EquipmentManager.referenceValue(item, def);
    return Math.max(1, Math.floor(reference * 0.35 * condition * (1 + item.plus * 0.25)));
  },

  /**
   * Scrap gained from breaking an item down instead of selling it for
   * gold -- a straight rarity lookup (elemental.scrapValue.<rarity> in the
   * tuning registry), deliberately NOT scaled by condition/plus the way
   * sellValue is. Scrapping is meant to be the "I don't want this item but
   * it's still worth its rarity in raw material" option, not a second
   * gold-adjacent economy to min-max around -- the rarer the item, the
   * more scrap, full stop.
   */
  /**
   * `bonusPercent` is the Blacksmith's own Bulk Scrapper vendor upgrade
   * (ModifierManager.global(state).scrapBonus) -- applied as a straight
   * multiplier on the base rarity value. Defaults to 0 so every existing
   * call site keeps working unchanged until it's threaded through.
   */
  scrapValue(item: EquipmentItem, bonusPercent = 0): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const base = Tuning.get(`elemental.scrapValue.${def.rarity}`);
    return Math.max(1, Math.round(base * (1 + bonusPercent / 100)));
  },

  /**
   * `itemLevel`, patch 0241 -- the target power level this Shop/Black
   * Market slot was rolled against (see ShopManager.rollEquipment/
   * refreshBlackMarket). Only changes anything for a procedural template
   * (isProceduralTemplate(def)): its own authored `value` is anchored to
   * its low base reqLevel (a wooden_sword's `value` is 2 gold), so once
   * itemLevel decouples the item's real rolled power from that base --
   * the whole point of rolling it fresh rather than selling the bare
   * template -- pricing off the stale base value would badly undersell
   * it. Priced instead off a level+rarity baseline
   * (shop.baseValuePerLevel * RARITY_PRICE_MULT * a per-level growth
   * curve) that tracks the actual rolled power, ignoring `value`
   * entirely for this case. A hand-authored fixed-stat item (or any call
   * with no itemLevel, e.g. sell/repair pricing elsewhere reusing this
   * same function) is completely unaffected -- its power never moves, so
   * its existing authored `value` stays the only signal that matters,
   * same formula as before this patch.
   */
  shopPrice(def: EquipmentDef, itemLevel?: number): number {
    if (itemLevel !== undefined && isProceduralTemplate(def)) {
      const base = Tuning.get('shop.baseValuePerLevel') * RARITY_PRICE_MULT[def.rarity]
        * (1 + itemLevel * Tuning.get('shop.valueGrowthPerLevelPercent') / 100);
      return Math.ceil(base * 1.15);
    }
    return Math.ceil(def.value * 1.15);
  },

  canEquip(hero: Hero, item: EquipmentItem): { ok: boolean; reason?: string } {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return { ok: false, reason: 'Unknown item.' };
    if (hero.status === 'questing') return { ok: false, reason: `${hero.name} is away on a quest.` };
    if (hero.level < def.reqLevel) return { ok: false, reason: `Requires level ${def.reqLevel}.` };
    return { ok: true };
  },

  /** Moves an item from the stash onto a hero, returning any displaced item. */
  equip(state: GameState, hero: Hero, item: EquipmentItem): string | null {
    const check = EquipmentManager.canEquip(hero, item);
    if (!check.ok) return check.reason ?? 'Cannot equip.';
    const def = EQUIPMENT_BY_ID[item.defId]!;
    state.stash = state.stash.filter((i) => i.uid !== item.uid);
    const displaced = hero.equipment[def.slot];
    if (displaced) state.stash.push(displaced);
    hero.equipment[def.slot] = item;
    return null;
  },

  unequip(state: GameState, hero: Hero, slot: EquipmentDef['slot']): string | null {
    if (hero.status === 'questing') return `${hero.name} is away on a quest.`;
    const item = hero.equipment[slot];
    if (!item) return null;
    delete hero.equipment[slot];
    state.stash.push(item);
    return null;
  },

  /** Applies wear after a quest. Returns names of items that just broke. */
  applyWear(hero: Hero, amount: number, durabilityMod: number): string[] {
    const broken: string[] = [];
    const multiplier = clamp(1 - durabilityMod / 100, 0.15, 1);
    for (const item of Object.values(hero.equipment)) {
      if (!item) continue;
      const before = item.durability;
      if (before <= 0) continue;
      item.durability = Math.max(0, item.durability - Math.max(1, Math.round(amount * multiplier)));
      if (item.durability === 0) {
        broken.push(EQUIPMENT_BY_ID[item.defId]?.name ?? 'Unknown item');
      }
    }
    return broken;
  },

  repair(state: GameState, item: EquipmentItem, workshopLevel: number, vendorDiscountPercent = 0): string | null {
    const cost = EquipmentManager.repairCost(item, workshopLevel, vendorDiscountPercent);
    if (cost === 0) return 'Already in perfect condition.';
    if (state.gold < cost) return 'Not enough gold for the repair.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    item.durability = EquipmentManager.maxDurability(item);
    return null;
  },

  upgrade(state: GameState, item: EquipmentItem, workshopLevel: number): string | null {
    if (item.plus >= MAX_PLUS) return 'Already at maximum refinement.';
    const cost = EquipmentManager.upgradeCost(item, workshopLevel);
    if (state.gold < cost) return 'Not enough gold for the upgrade.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    item.plus += 1;
    item.durability = EquipmentManager.maxDurability(item);
    return null;
  },

  /**
   * Blacksmith re-leveling (patch 0215) -- only meaningful for a
   * procedurally-generated item (isProceduralTemplate(def)); a Set piece
   * or hand-authored legendary has no `rolledItemLevel` to raise, its
   * power is fixed by definition. Cost for raising ONE level -- deliberately
   * NOT multiplied by RARITY_PRICE_MULT on top of def.value the way
   * repairCost's flat per-durability-point rate needs to be: def.value
   * already scales with rarity on its own (a legendary's value is
   * already far above a common's), so adding RARITY_PRICE_MULT again
   * here would double-count it -- caught directly by testing this
   * against ring_of_endless_roads (legendary, value 7600) before this
   * shipped: the double-counted version priced +10 levels at 1.2 million
   * gold, wildly out of scale with the rest of the game's economy (the
   * fixed formula prices the same raise at 38,000). Same "coefficient *
   * def.value" shape upgradeCost already uses, just linear in
   * levelsToRaise instead of exponential in item.plus -- re-leveling is
   * meant to keep pace with normal leveling, not become its own separate
   * grind curve the way Workshop's `+N` refinement is. `levelsToRaise`
   * lets the caller quote (or pay for) raising several levels in one
   * action.
   */
  relevelCost(item: EquipmentItem, levelsToRaise: number): { gold: number; scrap: number } {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def || levelsToRaise <= 0) return { gold: 0, scrap: 0 };
    const gold = Math.ceil(def.value * 0.5 * levelsToRaise);
    const scrap = 2 * levelsToRaise;
    return { gold, scrap };
  },

  /**
   * Raises `item.rolledItemLevel` toward (never past) `heroLevel` --
   * `targetLevel` is clamped into [current rolledItemLevel, heroLevel]
   * so a caller can't accidentally re-level an item above the hero
   * wearing it, or "re-level" it downward.
   *
   * Patch 0258 (Dedicated Reward Level Scaling, see guild-idler-
   * status.md): opened up to hand-authored items too, previously a
   * flat no-op ("this item's power is fixed"). That restriction made
   * sense back when hand-authored items had no `rolledItemLevel`
   * concept at all -- patch 0258 gave dedicated Heroic/Legendary
   * chain/raid drops a real one (see EquipmentManager.instantiate's
   * own comment), and confirmed design is that those items are fixed
   * at whatever level they DROPPED at rather than continuing to
   * rescale live, so re-leveling here is the deliberate, paid
   * alternative to farming a fresh higher-level drop -- exactly the
   * design intent this function needed to actually support. Note this
   * only ever raises `gearRelevance`'s multiplier back toward 1.0
   * (undoing outleveled decay against whatever `rolledItemLevel`
   * already is) -- it does NOT recompute a bigger stat budget the way
   * a fresh drop does; there's no reroll-equivalent for a hand-
   * authored item's fixed stat proportions. An ordinary Set piece that
   * never had `rolledItemLevel` set at all (dropped at Normal, or any
   * first-clear grant) can now also be re-leveled the exact same way,
   * a deliberate side benefit -- previously EVERY hand-authored item
   * had zero player agency against outleveled decay; this closes that
   * gap for all of them, not just the new dedicated-scaling case.
   */
  relevel(state: GameState, item: EquipmentItem, targetLevel: number, heroLevel: number): string | null {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 'Unknown item.';
    const current = item.rolledItemLevel ?? def.reqLevel;
    const clampedTarget = Math.max(current, Math.min(targetLevel, heroLevel));
    const levelsToRaise = clampedTarget - current;
    if (levelsToRaise <= 0) return 'Already at its target level.';
    const cost = EquipmentManager.relevelCost(item, levelsToRaise);
    if (state.gold < cost.gold) return 'Not enough gold for re-leveling.';
    if (state.scrap < cost.scrap) return 'Not enough scrap for re-leveling.';
    state.gold -= cost.gold;
    state.stats.goldSpent += cost.gold;
    state.scrap -= cost.scrap;
    item.rolledItemLevel = clampedTarget;
    return null;
  },

  /** Every item the player owns, equipped or stashed. */
  allItems(state: GameState): { item: EquipmentItem; heroId: string | null }[] {
    const out: { item: EquipmentItem; heroId: string | null }[] = [];
    for (const item of state.stash) out.push({ item, heroId: null });
    for (const hero of state.heroes) {
      for (const item of Object.values(hero.equipment)) {
        if (item) out.push({ item, heroId: hero.id });
      }
    }
    return out;
  },

  /**
   * Blacksmith's Infuse action -- consumes 1 gem of the given tier, sets/
   * adds the item's own elemental field. Which gem pool and which field
   * depends entirely on the item's own slot (weapon vs everything else),
   * not a separate player choice -- a weapon can only take elemental
   * damage, everything else can only take resist, so there's nothing to
   * pick beyond item + element + tier. Weapon side REPLACES both the
   * element and its tier together (matches EquipmentItem.elementalDamage's
   * own "changing what it's infused with" framing -- a fresh Common
   * infusion genuinely downgrades a previously-Legendary one, on
   * purpose); armor side ADDS a tier-scaled amount (matches
   * elementalResist's own "stacks with itself" framing, same shape
   * CraftingManager.enchantItem already uses for enchantStats). Same
   * stash-or-equipped search scope as repair()/enchantItem().
   */
  infuse(state: GameState, itemUid: string, element: ElementType, tier: GemTier): string | null {
    const found = EquipmentManager.allItems(state).find((e) => e.item.uid === itemUid);
    if (!found) return 'That item can\u2019t be found.';
    const { item } = found;
    const def = EquipmentManager.def(item);
    if (!def) return 'That item no longer exists.';

    if (def.slot === 'weapon') {
      if ((state.gems[element]?.[tier] ?? 0) < 1) return 'Not enough gems of that tier.';
      state.gems[element] = { ...state.gems[element], [tier]: (state.gems[element]?.[tier] ?? 0) - 1 };
      item.elementalDamage = element;
      item.elementalDamageTier = tier;
    } else {
      if ((state.resistGems[element]?.[tier] ?? 0) < 1) return 'Not enough gems of that tier.';
      state.resistGems[element] = { ...state.resistGems[element], [tier]: (state.resistGems[element]?.[tier] ?? 0) - 1 };
      const updated = { ...item.elementalResist };
      updated[element] = (updated[element] ?? 0) + matchBonusForTier(tier);
      item.elementalResist = updated;
    }
    return null;
  },
};
