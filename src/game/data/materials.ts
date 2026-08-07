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

export const MATERIALS: MaterialDef[] = [
  {
    id: 'ore', name: 'Ore', nodeName: 'Quarry',
    description: 'Raw stone and metal, hauled up from the guild\u2019s own quarry pit.',
    glyph: '\u26cf\ufe0f',
    icons: ['Ore1.png', 'Ore2.png', 'Ore3.png'],
  },
  {
    id: 'timber', name: 'Timber', nodeName: 'Woodyard',
    description: 'Felled and split lumber, stacked to season by the woodyard.',
    glyph: '\ud83e\udeb5',
    icons: ['Wood1.png', 'Wood2.png', 'Wood3.png'],
  },
  {
    id: 'herbs', name: 'Herbs', nodeName: 'Herb Garden',
    description: 'Cuttings and roots from the herb garden -- the backbone of every potion.',
    glyph: '\ud83c\udf3f',
    icons: ['herb1.png', 'herb2.png'],
  },
  {
    id: 'fish', name: 'Food', nodeName: 'Provisions Dock',
    // Broadened from a fish-only theme, per direct request -- "fish" as a
    // material was too narrow to build varied recipe flavor around (a
    // hunter's ration or a forager's bundle shouldn't have to pretend
    // they're made of fish just because that's the only food material
    // that exists). The underlying id stays 'fish' on purpose -- renaming
    // it would mean migrating every existing save's `materials.fish`,
    // `harvestNodes.fish`, and `harvestTools.fish` keys for a change
    // that's purely cosmetic, not worth the risk. The dock itself (and
    // its shared spot in fields.jpg) still visually reads as a fishing
    // wharf -- read as "where the guild's whole food supply comes
    // through," not just the catch itself, fish included but not
    // exclusive.
    description: 'Whatever the day\u2019s supply run brings in -- the catch off the dock, salted meat, foraged berries. Anything that keeps a hero fed on the road.',
    glyph: '\ud83e\udffa',
    // Named "Food" rather than "Fish" from the start of this icon prep --
    // see the comment above, this was scaffolded ahead of the
    // generalization landing, not after.
    icons: ['Food1.png', 'Food2.png', 'Food3.png', 'Food4.png'],
  },
];

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
