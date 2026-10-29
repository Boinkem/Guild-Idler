/**
 * Vendor Commissions (patch 0455). Once a day each vendor posts an order
 * for Scrap plus one Harvest material; filling it pays Vendor Rep and one
 * reward roll. Meant as a fun place to dump surplus Scrap -- deliberately
 * no Guild Power, and vendor levels themselves are untouched.
 *
 * Everything scales with the vendor's own level (capped at 4): a young
 * guild's level-1 vendors ask for what it actually has, and the reward
 * ceiling climbs with the level -- L1 tops out at Uncommon, L2 at Rare,
 * L3 at Epic, L4 has a small Legendary chance. Every number is a tuning
 * entry (category "commissions") so it can be retuned in the DevTool.
 */
import { MaterialId, Rarity, VendorId } from '../types';
import { Tuning } from './tuning';
import { RARITY_ORDER } from '../util';

export const COMMISSION_MAX_LEVEL = 4;

/** The Harvest material each vendor's order asks for alongside Scrap. */
export const COMMISSION_MATERIAL: Record<VendorId, MaterialId> = {
  blacksmith: 'ore',
  alchemist: 'herbs',
  enchanter: 'timber',
};

/** Order title shown on the commission card and the stamped slip. */
export const COMMISSION_TITLE: Record<VendorId, string> = {
  blacksmith: 'Melt-down order',
  alchemist: 'Still-room order',
  enchanter: 'Focus-carving order',
};

export const COMMISSION_FLAVOUR: Record<VendorId, string> = {
  blacksmith: 'Bring scrap and ore; the forge needs feeding.',
  alchemist: 'Scrap for the copper stills, herbs for the vats.',
  enchanter: 'Scrap for settings, timber for wands and frames.',
};

/** Stencil on the crate, sigil on the reward card's back. */
export const COMMISSION_CRATE_MARK: Record<VendorId, string> = { blacksmith: 'FORGE', alchemist: 'HANDLE WITH CARE', enchanter: 'ARCANE' };
export const COMMISSION_SIGIL: Record<VendorId, string> = { blacksmith: '⚒', alchemist: '⚗', enchanter: '✦' };

export interface CommissionOrder {
  level: number;
  scrap: number;
  materialId: MaterialId;
  material: number;
  /** Vendor Rep, in the same gold-spent units Vendor Rep is measured in. */
  rep: number;
}

/** The order at this vendor level (1..4; 0 means no commissions yet). */
export function commissionOrder(vendorId: VendorId, vendorLevel: number): CommissionOrder | null {
  const level = Math.min(COMMISSION_MAX_LEVEL, vendorLevel);
  if (level < 1) return null;
  return {
    level,
    scrap: Tuning.get(`commission.scrapL${level}`),
    materialId: COMMISSION_MATERIAL[vendorId],
    material: Tuning.get(`commission.materialL${level}`),
    rep: Tuning.get(`commission.repL${level}`),
  };
}

/** Percent weights per rarity at this vendor level. */
export function commissionOdds(vendorLevel: number): Record<Rarity, number> {
  const level = Math.max(1, Math.min(COMMISSION_MAX_LEVEL, vendorLevel));
  const out = {} as Record<Rarity, number>;
  for (const r of RARITY_ORDER) out[r] = Tuning.get(`commission.oddsL${level}.${r}`);
  return out;
}

/** Stack size for an Alchemist (consumable) or Enchanter (gem) reward. */
export function commissionQty(vendorId: VendorId, rarity: Rarity): number {
  if (vendorId === 'alchemist') return Tuning.get(`commission.alchemistQty.${rarity}`);
  if (vendorId === 'enchanter') return Tuning.get(`commission.enchanterQty.${rarity}`);
  return 1;
}
