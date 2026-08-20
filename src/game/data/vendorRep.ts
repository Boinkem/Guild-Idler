import { Tuning } from './tuning';

/**
 * Vendor Rep -- a loyalty level derived from lifetime gold spent at a
 * given vendor (or Grimsby), same sqrt-diminishing-curve shape Fund the
 * Guild's Power formula already uses (see that patch's own writeup in
 * guild-idler-status.md), reused deliberately rather than inventing a
 * new curve: level 1 is cheap, every level after costs more, with no
 * single breakpoint.
 *
 * Deliberately NOT stored as its own field -- it's a pure function of
 * whichever lifetime-gold-spent counter already exists for that source
 * (GameState.vendorGoldSpent[vendorId] for the three shop vendors,
 * GameState.stats.peddlerGoldSpent for Grimsby), so there's nothing to
 * migrate or get out of sync if the formula's constants ever get
 * retuned via the devtool.
 *
 * Never decreases -- the underlying gold-spent counters are lifetime
 * totals, same as peddlerGoldSpent already was before this patch.
 */
export function vendorRepLevel(lifetimeGoldSpent: number): number {
  return Math.floor(Math.sqrt(lifetimeGoldSpent / Tuning.get('vendorRep.goldPerLevelBase')));
}

/**
 * The level, capped -- level keeps climbing as pure fame past the cap,
 * but the bonus itself stops growing. Read this (never vendorRepLevel
 * directly) anywhere a discount or bonus percentage is being computed;
 * read vendorRepLevel directly only for display (the ring's own number).
 */
export function vendorRepCappedLevel(lifetimeGoldSpent: number): number {
  return Math.min(vendorRepLevel(lifetimeGoldSpent), Tuning.get('vendorRep.maxDiscountLevel'));
}

/**
 * Percentage points (e.g. 5, meaning 5%) of discount-or-bonus at this
 * spend level -- same (1 - percent / 100) / (1 + percent / 100)
 * convention every other percentage-based modifier in this codebase
 * already uses (see ModifierManager, InventoryManager.price's own
 * consumableDiscount handling), so call sites don't need their own
 * unit conversion.
 */
export function vendorRepPercent(lifetimeGoldSpent: number): number {
  return vendorRepCappedLevel(lifetimeGoldSpent) * Tuning.get('vendorRep.discountPerLevel');
}

/** Applies vendorRepPercent as a price discount, floored at 1 gold so
 *  compounding discounts can never make something literally free --
 *  same floor InventoryManager.price already uses for consumableDiscount. */
export function applyVendorRepDiscount(basePrice: number, lifetimeGoldSpent: number): number {
  const percent = vendorRepPercent(lifetimeGoldSpent);
  return Math.max(1, Math.round(basePrice * (1 - percent / 100)));
}
