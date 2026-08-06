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
}

export const MATERIALS: MaterialDef[] = [
  {
    id: 'ore', name: 'Ore', nodeName: 'Quarry',
    description: 'Raw stone and metal, hauled up from the guild\u2019s own quarry pit.',
    glyph: '\u26cf\ufe0f',
  },
  {
    id: 'timber', name: 'Timber', nodeName: 'Woodyard',
    description: 'Felled and split lumber, stacked to season by the woodyard.',
    glyph: '\ud83e\udeb5',
  },
  {
    id: 'herbs', name: 'Herbs', nodeName: 'Herb Garden',
    description: 'Cuttings and roots from the herb garden -- the backbone of every potion.',
    glyph: '\ud83c\udf3f',
  },
  {
    id: 'fish', name: 'Fish', nodeName: 'Fish Weir',
    description: 'The day\u2019s catch from the guild\u2019s fish weir, salted for the road.',
    glyph: '\ud83c\udfa3',
  },
];

export const MATERIAL_BY_ID: Record<MaterialId, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
) as Record<MaterialId, MaterialDef>;

/** Stable iteration order for anything that needs "all four nodes, always in this order". */
export const NODE_ORDER: MaterialId[] = ['ore', 'timber', 'herbs', 'fish'];
