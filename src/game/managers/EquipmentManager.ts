import { EQUIPMENT_BY_ID, RARITY_PRICE_MULT } from '../data/equipment';
import { EquipmentDef, EquipmentItem, ElementType, GameState, Hero } from '../types';
import { uid } from '../rng';
import { clamp } from '../util';
import { Tuning } from '../data/tuning';

export const MAX_PLUS = 10;

export const EquipmentManager = {
  instantiate(defId: string): EquipmentItem | null {
    const def = EQUIPMENT_BY_ID[defId];
    if (!def) return null;
    return { uid: uid('it'), defId, durability: def.maxDurability, plus: 0 };
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

  upgradeCost(item: EquipmentItem, workshopLevel: number): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const base = def.value * 0.6 * Math.pow(1.65, item.plus);
    const discount = 1 - Math.min(0.4, workshopLevel * 0.04);
    return Math.ceil(base * discount);
  },

  sellValue(item: EquipmentItem): number {
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return 0;
    const condition = 0.4 + 0.6 * (item.durability / EquipmentManager.maxDurability(item));
    return Math.max(1, Math.floor(def.value * 0.35 * condition * (1 + item.plus * 0.25)));
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

  shopPrice(def: EquipmentDef): number {
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
   * Blacksmith's Infuse action -- consumes 1 gem, sets/adds the item's own
   * elemental field. Which gem pool and which field depends entirely on
   * the item's own slot (weapon vs everything else), not a separate
   * player choice -- a weapon can only take elemental damage, everything
   * else can only take resist, so there's nothing to pick beyond item +
   * element. Weapon side REPLACES (matches EquipmentItem.elementalDamage's
   * own "changing what it's infused with" framing); armor side ADDS
   * (matches elementalResist's own "stacks with itself" framing, same
   * shape CraftingManager.enchantItem already uses for enchantStats).
   * Same stash-or-equipped search scope as repair()/enchantItem().
   */
  infuse(state: GameState, itemUid: string, element: ElementType): string | null {
    const found = EquipmentManager.allItems(state).find((e) => e.item.uid === itemUid);
    if (!found) return 'That item can\u2019t be found.';
    const { item } = found;
    const def = EquipmentManager.def(item);
    if (!def) return 'That item no longer exists.';

    if (def.slot === 'weapon') {
      if ((state.gems[element] ?? 0) < 1) return 'Not enough Elemental Gems.';
      state.gems[element] = (state.gems[element] ?? 0) - 1;
      item.elementalDamage = element;
    } else {
      if ((state.resistGems[element] ?? 0) < 1) return 'Not enough Resistance Gems.';
      state.resistGems[element] = (state.resistGems[element] ?? 0) - 1;
      const updated = { ...item.elementalResist };
      updated[element] = (updated[element] ?? 0) + Tuning.get('elemental.bonusPerMatchPercent');
      item.elementalResist = updated;
    }
    return null;
  },
};
