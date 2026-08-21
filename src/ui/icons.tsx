import { useState } from 'react';
import { EquipSlot } from '../game/types';

/**
 * Emoji placeholder per slot, shown whenever an item has no icon assigned
 * yet -- devtool icon assignment is manual and ongoing, so most won't have
 * one right away. Same "always show something legible, never a broken
 * image" approach used elsewhere for missing art.
 */
const SLOT_FALLBACK: Record<EquipSlot, string> = {
  weapon: '⚔️', helmet: '🪖', chest: '🎽', shield: '🛡️',
  gloves: '🧤', boots: '👢', ring: '💍', amulet: '📿', cloak: '🧣',
};

const CATEGORY_FALLBACK: Record<'gear' | 'consumable' | 'enchant' | 'gem' | 'charm', string> = {
  gear: '⚔️', consumable: '🧪', enchant: '✨', gem: '💎', charm: '🍀',
};

function IconBox({ icon, size, fallback }: { icon?: string; size: number; fallback: string }) {
  // Falls back to the glyph on a 404, not just when `icon` is unset --
  // the common path for a brand-new material assigned an icon path in
  // DevTool before the actual file has been dropped into item-icons/ yet
  // (see MaterialIcon below), same "graceful degradation, never a broken
  // image" HarvestGlyph already established for the Harvest scene's own
  // spawn icons. Keyed on `icon` so switching to a different (working)
  // icon path retries rather than staying stuck failed forever.
  const [failed, setFailed] = useState(false);
  const showImage = icon && !failed;
  return (
    <div className="item-icon" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>
      {showImage
        ? <img key={icon} src={`./item-icons/${icon}`} alt="" onError={() => setFailed(true)} />
        // The emoji fallback (no real icon assigned yet) still gets its
        // own backdrop -- .item-icon itself dropped its background/border
        // in patch 0247 so a real, already-transparent icon PNG actually
        // renders transparent instead of sitting on a painted grey square,
        // but an emoji glyph has no transparency of its own to preserve
        // and needs SOME backdrop to stay legible against whatever art is
        // behind it (a bright background, a busy crafting scene, etc.).
        : <span className="item-icon-fallback" aria-hidden="true">{fallback}</span>}
    </div>
  );
}

export function ItemIcon({ slot, icon, size = 40 }: { slot: EquipSlot; icon?: string; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={SLOT_FALLBACK[slot]} />;
}

/** Falls back to the consumable's own glyph (not a generic placeholder) when no icon is assigned. */
export function ConsumableIcon({ icon, glyph, size = 40 }: { icon?: string; glyph: string; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={glyph} />;
}

/** Falls back to a per-category glyph (gear/consumable/enchant/gem/charm) when a recipe has no icon assigned. */
export function RecipeIcon({ icon, category, size = 40 }: { icon?: string; category: 'gear' | 'consumable' | 'enchant' | 'gem' | 'charm'; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={CATEGORY_FALLBACK[category]} />;
}

/** Falls back to the material's own glyph when no icon is assigned yet --
 *  same shape as ConsumableIcon. Used for static/stable material displays
 *  (Crafting's materials-needed list, Warehouse stock, scrap fly-up
 *  particles) -- NOT the Harvest scene's own falling-item art, which
 *  uses HarvestGlyph/harvestIconFor's separate spawn-variety pool instead. */
export function MaterialIcon({ icon, glyph, size = 40 }: { icon?: string; glyph: string; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={glyph} />;
}

/** Falls back to the curio's own glyph when no icon is assigned yet --
 *  same shape as MaterialIcon/ConsumableIcon. Used wherever a curio
 *  needs a static display: the Inventory tab's Curios section, and
 *  Grimsby's own PeddlerOutcomeIcon for kind: 'curio'. */
export function CurioIcon({ icon, glyph, size = 40 }: { icon?: string; glyph: string; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={glyph} />;
}
