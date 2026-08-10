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

  /**
   * Time until the NEXT synchronized spawn wave (all 4 nodes at once) --
   * replaces what used to be a per-node spawnIntervalMs. Idle-hero-count
   * still speeds this up the same way it always has; tool level's own
   * bonus is now the BEST of the 4 nodes' own levels rather than each
   * node's individual one, since there's only one shared timer left to
   * apply a bonus to -- upgrading any single tool still speeds up the
   * whole wave, it just no longer matters WHICH one you upgraded for
   * timing purposes (yield-per-catch is still fully per-node/per-tool,
   * unaffected by this).
   */
  globalSpawnIntervalMs(state: GameState): number {
    const base = Tuning.get('harvest.baseSpawnIntervalMs');
    const min = Tuning.get('harvest.minSpawnIntervalMs');
    const perHero = Tuning.get('harvest.spawnReductionPerIdleHeroMs');
    const bestToolBonus = Math.max(0, ...NODE_ORDER.map((nodeId) => {
      const tool = HARVEST_TOOL_BY_NODE[nodeId];
      const level = state.harvestTools[nodeId] ?? 0;
      return level * tool.spawnBonusMsPerLevel;
    }));
    const reduction = HarvestManager.idleHeroCount(state) * perHero + bestToolBonus;
    return Math.max(min, base - reduction);
  },

  capacity(state: GameState): number {
    return warehouseCapacity(state.warehouseLevel);
  },

  /**
   * Advances the shared spawn wave and every node's own despawn to `now`.
   * Called from GameEngine.refreshWorld the same way the quest board and
   * shop rotations already are -- the fields keep spawning (and expiring)
   * even while the Harvest tab isn't the one open, same "the world
   * doesn't pause just because you're not looking at it" principle as
   * everything else that ticks.
   *
   * Two independent things happen here, on purpose: an individual node's
   * pending item still despawns on its own schedule (no penalty, it just
   * disappears) if it sits uncaught past its own expiresAt, but nothing
   * about that reschedules that one node's own next spawn anymore --
   * only the shared `harvestNextSpawnAt` firing does that, for every node
   * at once. A node whose item is still sitting there uncaught when the
   * next wave fires gets overwritten with a fresh one rather than
   * skipped -- see GameState.harvestNextSpawnAt's own doc comment for
   * why that's the intended behavior, not a bug.
   */
  ensureSpawns(state: GameState, now: number): boolean {
    let changed = false;
    for (const nodeId of NODE_ORDER) {
      const node = state.harvestNodes[nodeId];
      if (node.pending && now >= node.pending.expiresAt) {
        node.pending = null;
        changed = true;
      }
    }
    if (now >= state.harvestNextSpawnAt) {
      const bonusChance = Tuning.get('harvest.bonusChancePercent') / 100;
      for (const nodeId of NODE_ORDER) {
        state.harvestNodes[nodeId].pending = {
          spawnedAt: now,
          expiresAt: now + Tuning.get('harvest.despawnWindowMs'),
          bonus: Math.random() < bonusChance,
        };
      }
      state.harvestNextSpawnAt = now + HarvestManager.globalSpawnIntervalMs(state);
      changed = true;
    }
    return changed;
  },

  /**
   * Catches whatever's currently pending at a node, if anything. Returns
   * the amount gained (0 if there was nothing to catch, already expired,
   * or the warehouse is already full), and whether it was a bonus glint,
   * for the UI's collect-particle feedback. No longer reschedules this
   * node's own next spawn -- that's the shared wave timer's job now, not
   * something an individual catch influences.
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
