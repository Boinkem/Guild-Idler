import { GameState, MaterialId } from '../types';
import { NODE_ORDER } from '../data/materials';
import { ModifierManager } from './ModifierManager';
import {
  HARVEST_TOOL_BY_NODE, OVERSEER_UPGRADE, TRADE_ROUTE_COST, WAREHOUSE_UPGRADE,
  harvestToolCost, overseerRescueChancePercent, overseerUpgradeCost, warehouseCapacity, warehouseUpgradeCost,
} from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';

export const HarvestManager = {
  idleHeroCount(state: GameState): number {
    return state.heroes.filter((h) => h.status !== 'questing').length;
  },

  /**
   * Time until THIS node's own next spawn, given the current idle-hero
   * count and its own tool level.
   *
   * This was briefly a single shared `globalSpawnIntervalMs` (all 4 nodes
   * spawning together as one synchronized wave) -- reverted after direct
   * follow-up feedback, confirmed with a screenshot: synchronized catches
   * meant every node's own burst text (`+0.5 Ore`, `+0.5 Timber`, etc.)
   * landed at the same moment and visually overlapped/stacked into an
   * unreadable pile, and clicking one node while the other 3 were still
   * pulsing (all having spawned in lockstep) read as noisy rather than
   * satisfying. Independent per-node timing spreads catches out over
   * time, which is both the originally-requested behavior and the fix
   * for the overlap -- see GameState.harvestNodes' own doc comment for
   * the current per-node `nextSpawnAt` field this restores.
   */
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

  /** Base yield for a normal (non-bonus) catch at this node, tool bonus
   *  included -- the exact number an auto-catch always uses (auto-catches
   *  never roll the bonus glint multiplier, only a manual click can). */
  baseYield(state: GameState, nodeId: MaterialId): number {
    const tool = HARVEST_TOOL_BY_NODE[nodeId];
    const toolLevel = state.harvestTools[nodeId] ?? 0;
    return Tuning.get('harvest.baseYieldPerCatch') + toolLevel * tool.yieldBonusPerLevel;
  },

  /**
   * Advances every node's own spawn/despawn state to `now`, independently.
   * Called from GameEngine.refreshWorld the same way the quest board and
   * shop rotations already are -- a node keeps spawning (and expiring)
   * items even while its own tab isn't the one open, same "the world
   * doesn't pause just because you're not looking at it" principle as
   * everything else that ticks.
   */
  ensureSpawns(state: GameState, now: number): boolean {
    let changed = false;
    const rescueChance = overseerRescueChancePercent(state.overseerLevel) / 100;
    for (const nodeId of NODE_ORDER) {
      const node = state.harvestNodes[nodeId];
      if (node.pending && now >= node.pending.expiresAt) {
        // Overseer rescue roll -- fires right at the moment an unclicked
        // spawn would otherwise be lost, so a player who did click never
        // notices any difference (this branch is unreachable once
        // `catch()` has already cleared `pending`). Always uses baseYield
        // (no bonus-glint multiplier, whether or not `pending.bonus` was
        // true this spawn) -- see GameState.overseerLevel's own comment
        // for why that's deliberate, not an oversight.
        if (rescueChance > 0 && Math.random() < rescueChance) {
          const cap = HarvestManager.capacity(state);
          const gained = Math.max(0, Math.min(HarvestManager.baseYield(state, nodeId), cap - state.materials[nodeId]));
          state.materials[nodeId] += gained;
        }
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
    const base = HarvestManager.baseYield(state, nodeId);
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
    const value = amount * Tuning.get('harvest.sellPricePerUnit');
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + value);
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

  upgradeOverseer(state: GameState): string | null {
    const cost = overseerUpgradeCost(state.overseerLevel);
    if (cost === null) return 'Already at maximum level.';
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    state.overseerLevel += 1;
    return null;
  },

  /**
   * Duration-scaled Overseer credit for the offline gap, called once from
   * GameEngine.catchUpOffline. `ensureSpawns` only ever resolves to a
   * single current pending/next-spawn state regardless of how long the
   * app was closed (there was never a reason to simulate multiple missed
   * cycles when nothing could auto-catch them) -- this is Harvest's first
   * mechanism that actually needs to know how many cycles were missed, so
   * it estimates rather than simulates: elapsed / this node's current
   * spawnIntervalMs (using idle-hero count and tool level as they stand
   * right now, same "settle to current state across the whole gap rather
   * than slicing sub-intervals" approximation the health-regen offline
   * catch-up just above it in engine.ts already uses) gives an expected
   * cycle count, times the rescue chance, times baseYield -- same formula
   * as the live rescue roll, just expressed as an expectation instead of
   * a per-event coin flip. Returns only the nonzero gains, for the
   * offline report to show; callers that don't care can ignore it.
   */
  offlineAutoHarvest(state: GameState, elapsedMs: number): Partial<Record<MaterialId, number>> {
    const rescueChance = overseerRescueChancePercent(state.overseerLevel) / 100;
    const gains: Partial<Record<MaterialId, number>> = {};
    if (rescueChance <= 0 || elapsedMs <= 0) return gains;
    const cap = HarvestManager.capacity(state);
    for (const nodeId of NODE_ORDER) {
      const interval = HarvestManager.spawnIntervalMs(state, nodeId);
      const expectedCycles = elapsedMs / interval;
      const raw = expectedCycles * rescueChance * HarvestManager.baseYield(state, nodeId);
      const gained = Math.max(0, Math.min(raw, cap - state.materials[nodeId]));
      if (gained > 0) {
        state.materials[nodeId] += gained;
        gains[nodeId] = gained;
      }
    }
    return gains;
  },
};

export { OVERSEER_UPGRADE, WAREHOUSE_UPGRADE };
