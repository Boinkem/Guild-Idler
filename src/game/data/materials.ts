import { MaterialId } from '../types';

/**
 * One entry per Harvest/Gathering node -- see guild-idler-status.md's
 * "Harvest/Gathering + Crafting" section for the full design. Each node is
 * its own sub-tab (own backdrop, own falling-item scene) producing exactly
 * one material; nothing here is a reusable pool the way raid encounters
 * are, since there's only ever one material per node.
 */
export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** Sub-tab label -- the node itself, not the material noun (e.g. "Quarry", not "Ore"). */
  nodeName: string;
  description: string;
  /** Single-glyph fallback shown wherever a material icon can't be sourced yet. */
  glyph: string;
  /**
   * A single stable icon representing this material wherever a static,
   * non-animated reference is needed -- the Crafting overlay's materials-
   * needed indicator, the Warehouse's stock display, and the scrap ->
   * material-counter fly-up particles. Relative path under
   * `public/item-icons/`, same convention as EquipmentDef.icon/
   * ConsumableDef.icon/RecipeDef.icon -- falls back to `glyph` when unset
   * (see MaterialIcon in icons.tsx). Deliberately separate from `icons`
   * below: that pool is for spawn-to-spawn *variety* in the falling-item
   * animation, this is for *consistency* everywhere else a material needs
   * to be recognizable as the same thing at a glance.
   */
  icon?: string;
  /**
   * Pool of real icon filenames for this material, read from
   * `public/harvest-icons/<filename>` -- one is picked at random per spawn
   * (see `harvestIconFor` below), so the same node doesn't show the exact
   * same sprite every single time. Left empty until real art exists; the
   * glyph above is the fallback for as long as that's true (and stays the
   * fallback per-spawn too, via `HarvestGlyph` in HarvestPanel.tsx, if a
   * listed file ever 404s instead of loading). Filenames match exactly
   * what was specified when this was scaffolded -- rename the files to
   * match, not this list, if that's ever easier.
   */
  icons?: string[];
}

/**
 * Materials live in json/materials.json so they can be edited via
 * tools/devtool without touching TypeScript -- same reasoning and same
 * pattern equipment.ts/consumables.ts already use for their own data.
 * Only 4 entries today (one per Harvest node), but a hardcoded TS array
 * meant `icon` above could only ever be set by hand-editing this file
 * directly; DevTool's schema-driven UI (adding a `materials` entry to
 * SCHEMAS in server.mjs was the only change needed -- the tab itself is
 * generated automatically from that) picks this straight up.
 */
import materialsJson from './json/materials.json';
export const MATERIALS: MaterialDef[] = materialsJson as MaterialDef[];

export const MATERIAL_BY_ID: Record<MaterialId, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
) as Record<MaterialId, MaterialDef>;

/** Stable iteration order for anything that needs "all four nodes, always in this order". */
export const NODE_ORDER: MaterialId[] = ['ore', 'timber', 'herbs', 'fish'];

/**
 * Deterministic pick from a material's icon pool, seeded on the spawn's
 * own timestamp -- same seeding approach `spawnPositionPercent` in
 * HarvestPanel.tsx already uses, so a given spawn shows the same icon
 * across every re-render (it doesn't flicker between pool entries on each
 * 400ms tick) while still varying spawn to spawn. Returns null -- meaning
 * "fall back to the glyph" -- if the pool is empty, so this is always safe
 * to call even before any real icon files exist.
 */
export function harvestIconFor(materialId: MaterialId, spawnedAt: number): string | null {
  const pool = MATERIAL_BY_ID[materialId].icons;
  if (!pool || pool.length === 0) return null;
  const seed = spawnedAt + materialId.split('').reduce((sum, c) => sum + c.charCodeAt(0) * 31, 0);
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return pool[Math.floor(frac * pool.length)];
}

/**
 * Materials a pet can be fed -- deliberately a subset of MATERIALS, not
 * all four. Ore and Timber are construction/crafting resources with no
 * natural "a pet would eat this" reading; Herbs and Food (fish) are the
 * two that do, and are the only two the Hatchery's feed dropdown offers.
 */
export const FEEDABLE_MATERIALS: MaterialDef[] = MATERIALS.filter((m) => m.id === 'herbs' || m.id === 'fish');

