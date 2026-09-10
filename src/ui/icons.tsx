import { useState } from 'react';
import { EquipSlot, Stats } from '../game/types';
import { STAT_GLYPH } from '../game/util';

/**
 * Emoji placeholder per slot, shown whenever an item has no icon assigned
 * yet -- devtool icon assignment is manual and ongoing, so most won't have
 * one right away. Same "always show something legible, never a broken
 * image" approach used elsewhere for missing art.
 */
const SLOT_FALLBACK: Record<EquipSlot, string> = {
  weapon: '⚔️', helmet: '🪖', chest: '🎽', shield: '🛡️',
  gloves: '🧤', boots: '👢', ring: '💍', amulet: '📿', cloak: '🧣', heirloom: '🏺',
};

const CATEGORY_FALLBACK: Record<'gear' | 'consumable' | 'enchant' | 'gem' | 'charm', string> = {
  gear: '⚔️', consumable: '🧪', enchant: '✨', gem: '💎', charm: '🍀',
};

function IconBox({
  icon, size, fallback, broken, hideFallback,
}: { icon?: string; size: number; fallback: string; broken?: boolean; hideFallback?: boolean }) {
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
    <div
      className={`item-icon ${broken ? 'item-icon-broken' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
    >
      {showImage
        ? <img key={icon} src={`./item-icons/${icon}`} alt="" onError={() => setFailed(true)} />
        // The emoji fallback (no real icon assigned yet) still gets its
        // own backdrop -- .item-icon itself dropped its background/border
        // in patch 0247 so a real, already-transparent icon PNG actually
        // renders transparent instead of sitting on a painted grey square,
        // but an emoji glyph has no transparency of its own to preserve
        // and needs SOME backdrop to stay legible against whatever art is
        // behind it (a bright background, a busy crafting scene, etc.).
        // `hideFallback` (patch 0343, direct request) skips this entirely
        // for an EMPTY gear slot specifically -- that slot's own outline
        // art (EMPTY_SLOT_FRAME, patch 0342) is already a complete,
        // closed shape on its own, and a generic weapon/helmet/etc. glyph
        // floating in the middle on top of it read as a stray placeholder
        // rather than a real icon. Every OTHER IconBox caller (an actual
        // owned item with no art yet, a consumable, a curio...) still
        // wants the glyph -- there's a real item there, it just needs
        // something to stand in for its missing art.
        // Patch 0365: no remaining callers pass hideFallback -- the empty
        // gear slot moved to EMPTY_SLOT_BANNER's fully-painted card
        // background (same .rarity-banner treatment every other reverted
        // card uses), where the fallback glyph reads as intentional again
        // rather than a stray placeholder. Prop left in place (harmless,
        // optional, defaults off) rather than removed, in case an
        // outline-style empty state is wanted again later.
        : (!hideFallback && <span className="item-icon-fallback" aria-hidden="true">{fallback}</span>)}
      {/* Broken-gear indicator (patch 0295), direct request: a red ring
          plus a small "!" badge, same corner-badge shape used elsewhere
          for at-a-glance state, so a durability-0 item reads as needing
          attention even collapsed in a dense grid, not just via the
          durability bar's own low-tint threshold. */}
      {broken && <span className="item-icon-broken-badge" aria-hidden="true">!</span>}
    </div>
  );
}

export function ItemIcon({
  slot, icon, size = 40, broken, hideFallback,
}: { slot: EquipSlot; icon?: string; size?: number; broken?: boolean; hideFallback?: boolean }) {
  return <IconBox icon={icon} size={size} fallback={SLOT_FALLBACK[slot]} broken={broken} hideFallback={hideFallback} />;
}

/** Falls back to the consumable's own glyph (not a generic placeholder) when no icon is assigned. */
export function ConsumableIcon({ icon, glyph, size = 40 }: { icon?: string; glyph: string; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={glyph} />;
}

/** Falls back to a per-category glyph (gear/consumable/enchant/gem/charm) when a recipe has no icon assigned. */
export function RecipeIcon({ icon, category, size = 40 }: { icon?: string; category: 'gear' | 'consumable' | 'enchant' | 'gem' | 'charm'; size?: number }) {
  return <IconBox icon={icon} size={size} fallback={CATEGORY_FALLBACK[category]} />;
}

/** Glyph-only, no image-path variant -- a Stat isn't a physical item, so
 *  there's nothing for it to fall back FROM the way every other IconBox
 *  user has an optional `icon` path. See STAT_GLYPH's own comment
 *  (util.ts) for why. Patch 0361, direct request: gear/enchant's own
 *  stat-choice pickers previously showed plain text rows with no icon
 *  column at all. */
export function StatIcon({ stat, size = 40 }: { stat: keyof Stats; size?: number }) {
  return <IconBox size={size} fallback={STAT_GLYPH[stat]} />;
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
