import { GameState, MaterialId } from '../types';
import { NODE_ORDER } from '../data/materials';
import {
  HARVEST_TOOL_BY_NODE, TRADE_ROUTE_COST, WAREHOUSE_UPGRADE,
  harvestToolCost, warehouseCapacity, warehouseUpgradeCost,
} from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';

export const HarvestManager = {
  idleHeroCount(state: GameState): number {
    return state.heroes.filter((h) => h.status !== 'questing').length;
  },

  /** Time until this node's next spawn, given the current idle-hero count and tool level. */
  spawnIntervalMs(state: GameState, nodeId: MaterialId): number {
    const base = Tuning.get('harvest.baseSpawnIntervalMs');
    const min = Tuning.get('harvest.minSpawnIntervalMs');
    const perHero = Tuning.get('harvest.spawnReductionPerIdleHeroMs');
    const tool = HARVEST_TOOL_BY_NODE[nodeId];
    const toolLevel = state.harvestTools[nodeId] ?? 0;
    const reduction = HarvestManager.idleHeroCount(state) * perHero + toolLevel * tool.spawnBonusMsPerLevel;
    return Math.max(min, base - reduction);
  },

  capacity(state: GameState): number {
    return warehouseCapacity(state.warehouseLevel);
  },

  /**
   * Advances every node's spawn/despawn state to `now`. Called from
   * GameEngine.refreshWorld the same way the quest board and shop
   * rotations already are -- a node keeps spawning (and expiring) items
   * even while its own tab isn't the one open, same "the world doesn't
   * pause just because you're not looking at it" principle as everything
   * else that ticks.
   */
  ensureSpawns(state: GameState, now: number): boolean {
    let changed = false;
    for (const nodeId of NODE_ORDER) {
      const node = state.harvestNodes[nodeId];
      if (node.pending && now >= node.pending.expiresAt) {
        node.pending = null;
        node.nextSpawnAt = now + HarvestManager.spawnIntervalMs(state, nodeId);
        changed = true;
      }
      if (!node.pending && now >= node.nextSpawnAt) {
        const bonusChance = Tuning.get('harvest.bonusChancePercent') / 100;
        node.pending = {
          spawnedAt: now,
          expiresAt: now + Tuning.get('harvest.despawnWindowMs'),
          bonus: Math.random() < bonusChance,
        };
        changed = true;
      }
    }
    return changed;
  },

  /**
   * Catches whatever's currently pending at a node, if anything. Returns
   * the amount gained (0 if there was nothing to catch, already expired,
   * or the warehouse is already full), and whether it was a bonus glint,
   * for the UI's collect-particle feedback.
   */
  catch(state: GameState, nodeId: MaterialId, now: number): { gained: number; bonus: boolean } {
    const node = state.harvestNodes[nodeId];
    if (!node.pending || now >= node.pending.expiresAt) return { gained: 0, bonus: false };
    const tool = HARVEST_TOOL_BY_NODE[nodeId];
    const toolLevel = state.harvestTools[nodeId] ?? 0;
    const base = Tuning.get('harvest.baseYieldPerCatch') + toolLevel * tool.yieldBonusPerLevel;
    const bonus = node.pending.bonus;
    const raw = bonus ? base * Tuning.get('harvest.bonusMultiplier') : base;
    const cap = HarvestManager.capacity(state);
    const gained = Math.max(0, Math.min(raw, cap - state.materials[nodeId]));
    state.materials[nodeId] += gained;
    node.pending = null;
    node.nextSpawnAt = now + HarvestManager.spawnIntervalMs(state, nodeId);
    return { gained, bonus };
  },

  sell(state: GameState, materialId: MaterialId, amount: number): string | null {
    if (!state.tradeRouteUnlocked) return 'The Trade Route hasn\u2019t been opened yet.';
    if (amount <= 0) return null;
    if (state.materials[materialId] < amount) return 'Not enough in stock.';
    state.materials[materialId] -= amount;
    state.gold += amount * Tuning.get('harvest.sellPricePerUnit');
    return null;
  },

  unlockTradeRoute(state: GameState): string | null {
    if (state.tradeRouteUnlocked) return 'Already unlocked.';
    if (state.gold < TRADE_ROUTE_COST) return 'Not enough gold.';
    state.gold -= TRADE_ROUTE_COST;
    state.stats.goldSpent += TRADE_ROUTE_COST;
    state.tradeRouteUnlocked = true;
    return null;
  },

  upgradeTool(state: GameState, nodeId: MaterialId): string | null {
    const level = state.harvestTools[nodeId] ?? 0;
    const cost = harvestToolCost(nodeId, level);
    if (cost === null) return 'Already at maximum level.';
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.harvestTools[nodeId] = level + 1;
    return null;
  },

  upgradeWarehouse(state: GameState): string | null {
    const cost = warehouseUpgradeCost(state.warehouseLevel);
    if (cost === null) return 'Already at maximum level.';
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.warehouseLevel += 1;
    return null;
  },
};

export { WAREHOUSE_UPGRADE };
