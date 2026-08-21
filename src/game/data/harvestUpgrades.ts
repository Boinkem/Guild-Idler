import { MaterialId } from '../types';
import { NODE_ORDER, MATERIAL_BY_ID } from './materials';
import { Tuning } from './tuning';

/** One per node -- Pickaxe/Woodaxe/Sickle/Net. Bumps that node's yield and spawn rate per level. */
export interface HarvestToolDef {
  nodeId: MaterialId;
  name: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
  yieldBonusPerLevel: number;
  spawnBonusMsPerLevel: number;
}

// "Net" stays as the fish/food node's tool name even after the material's
// display identity broadened to a general "Food" theme -- the dock scene
// in fields.jpg (shared background art, not something this patch can
// redraw) still visually shows fishing nets specifically, so the tool
// name still matches what's actually on screen.
const TOOL_NAME: Record<MaterialId, string> = {
  ore: 'Pickaxe', timber: 'Woodaxe', herbs: 'Sickle', fish: 'Net',
};

export const HARVEST_TOOLS: HarvestToolDef[] = NODE_ORDER.map((nodeId) => ({
  nodeId,
  name: TOOL_NAME[nodeId],
  baseCost: Tuning.get(`harvest_tool.${nodeId}.baseCost`),
  costGrowth: Tuning.get(`harvest_tool.${nodeId}.costGrowth`),
  maxLevel: Tuning.get(`harvest_tool.${nodeId}.maxLevel`),
  yieldBonusPerLevel: Tuning.get(`harvest_tool.${nodeId}.yieldBonusPerLevel`),
  spawnBonusMsPerLevel: Tuning.get(`harvest_tool.${nodeId}.spawnBonusMsPerLevel`),
}));

export const HARVEST_TOOL_BY_NODE: Record<MaterialId, HarvestToolDef> = Object.fromEntries(
  HARVEST_TOOLS.map((t) => [t.nodeId, t]),
) as Record<MaterialId, HarvestToolDef>;

/** Cost to raise a node's tool from currentLevel to currentLevel+1, or null once maxed. */
export function harvestToolCost(nodeId: MaterialId, currentLevel: number): number | null {
  const def = HARVEST_TOOL_BY_NODE[nodeId];
  if (currentLevel >= def.maxLevel) return null;
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

export const WAREHOUSE_UPGRADE = {
  name: 'Warehouse',
  baseCost: Tuning.get('harvest.warehouse.baseCost'),
  costGrowth: Tuning.get('harvest.warehouse.costGrowth'),
  maxLevel: Tuning.get('harvest.warehouse.maxLevel'),
  capacityPerLevel: Tuning.get('harvest.warehouse.capacityPerLevel'),
};

export function warehouseUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= WAREHOUSE_UPGRADE.maxLevel) return null;
  return Math.floor(WAREHOUSE_UPGRADE.baseCost * Math.pow(WAREHOUSE_UPGRADE.costGrowth, currentLevel));
}

export function warehouseCapacity(warehouseLevel: number): number {
  return Tuning.get('harvest.baseWarehouseCapacity') + warehouseLevel * WAREHOUSE_UPGRADE.capacityPerLevel;
}

export const TRADE_ROUTE_COST = Tuning.get('harvest.tradeRoute.cost');

/**
 * "Overseer" -- a 3-level, gold-only upgrade (Warehouse sub-tab, same
 * cost-curve shape as WAREHOUSE_UPGRADE) that gives every Harvest node a
 * chance to auto-catch a spawn that would otherwise despawn unclicked.
 * Deliberately linear and deliberately capped short of 100% -- see
 * GameState.overseerLevel's own doc comment for why this stays a
 * background safety net rather than a click-replacement.
 */
export const OVERSEER_UPGRADE = {
  name: 'Overseer',
  baseCost: Tuning.get('harvest.overseer.baseCost'),
  costGrowth: Tuning.get('harvest.overseer.costGrowth'),
  maxLevel: Tuning.get('harvest.overseer.maxLevel'),
  rescueChancePercentPerLevel: Tuning.get('harvest.overseer.rescueChancePercentPerLevel'),
};

export function overseerUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= OVERSEER_UPGRADE.maxLevel) return null;
  return Math.floor(OVERSEER_UPGRADE.baseCost * Math.pow(OVERSEER_UPGRADE.costGrowth, currentLevel));
}

/** 0 at level 0 (no Overseer bought yet), otherwise level * rescueChancePercentPerLevel. */
export function overseerRescueChancePercent(level: number): number {
  return level * OVERSEER_UPGRADE.rescueChancePercentPerLevel;
}

// Re-exported so callers of this file don't also need to import materials.ts
// just to name a node in error messages/UI labels.
export { MATERIAL_BY_ID };
