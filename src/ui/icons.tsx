import { EquipSlot } from '../game/types';

/**
 * Emoji placeholder per slot, shown whenever an item has no icon assigned
 * yet -- devtool icon assignment is manual and ongoing, so most won't have
 * one right away. Same "always show something legible, never a broken
 * image" approach used elsewhere for missing art.
 */
const SLOT_FALLBACK: Record<EquipSlot, string> = {
  weapon: '⚔️', helmet: '🪖', chest: '🎽', shield: '🛡️',
  gloves: '🧤', boots: '👢', ring: '💍', amulet: '📿',
};

const CATEGORY_FALLBACK: Record<'gear' | 'consumable' | 'enchant', string> = {
  gear: '⚔️', consumable: '🧪', enchant: '✨',
};

function IconBox({ icon, size, fallback }: { icon?: string; size: number; fallback: string }) {
  return (
    <div className="item-icon" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>
      {icon
        ? <img src={`./item-icons/${icon}`} alt="" />
        : <span aria-hidden="true">{fallback}</span>}
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

/** Falls back to a per-category glyph (gear/consumable/enchant) when a recipe has no icon assigned. */
export function RecipeIcon({ icon, category, size = 40 }: { icon?: string; category: 'gear' | 'consumable' | 'enchant'; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={CATEGORY_FALLBACK[category]} />;
}
