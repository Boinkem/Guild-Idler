import { GameState, MaterialId } from '../types';
import { NODE_ORDER } from '../data/materials';
import { ModifierManager } from './ModifierManager';
import {
  HARVEST_TOOL_BY_NODE, OVERSEER_UPGRADE, TRADE_ROUTE_COST, WAREHOUSE_UPGRADE,
  harvestToolCost, overseerRescueChancePercent, overseerUpgradeCost, warehouseCapacity, warehouseUpgradeCost,
} from '../data/harvestUpgrades';
import { Tuning } from '../data/tuning';
import { DIFFICULTIES } from '../data/quests';
import { bestUnlockedTier, expectedRatePerHour } from '../data/balance';
import { formatDuration } from '../util';

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

  /**
   * Target gold/hr Trade Route selling is capped toward -- exactly what a
   * hero currently earns at the guild's own best-unlocked quest tier
   * (same expectedRatePerHour/bestUnlockedTier formula balance.ts's
   * fastQuestCapsPerHour already reuses for the burst-quest cap), not a
   * separate hand-picked number. Self-corrects automatically if
   * DIFFICULTIES or the guild's own level ever changes -- no curve here
   * to re-tune by hand if quest rewards are rebalanced again later. This
   * is also the trader's maximum gold reserve (see currentTraderGold) --
   * "the trader has up to about an hour's worth of quest-tier gold on
   * hand" is the plain-language version of the whole mechanic.
   */
  sellGoldPerHourTarget(state: GameState): number {
    const topLevel = Math.max(1, ...state.heroes.map((h) => h.level));
    const legendaryUnlocked = ModifierManager.hasUnlock(state, 'legendaryQuests');
    const tier = DIFFICULTIES[bestUnlockedTier(topLevel, legendaryUnlocked)];
    return expectedRatePerHour(tier, 'gold', topLevel);
  },

  /**
   * Patch 0268 shipped a percentage taper (full/half/15%-floor price
   * depending on recent selling) anchored to this same target. Turned out
   * a fixed floor can never actually cap total earnings near the target
   * once raw production scales with tool/hero investment -- 15% of a
   * small number lands near the target, but 15% of a much larger number
   * (heavily-tooled, multi-node farming) is still a much larger number.
   * There's no single percentage that works at every investment level.
   * Replaced here with a genuine hard cap instead: the trader has a
   * gold reserve, capped at sellGoldPerHourTarget, that regenerates
   * continuously (linearly, filling from empty to full over
   * harvest.traderRegenTimeMs) and is spent down gold-for-gold by every
   * sale. A sale that would exceed the remaining reserve is blocked
   * outright rather than paid out at a reduced rate -- see sell() below.
   * This holds at ANY production rate, not just the ones it happened to
   * be tuned against, because it isn't a percentage of raw output at
   * all; it's a literal spending limit independent of how much material
   * a sale would have consumed.
   */
  currentTraderGold(state: GameState, now: number): number {
    const max = HarvestManager.sellGoldPerHourTarget(state);
    const elapsed = Math.max(0, now - state.harvestTraderGoldAt);
    const regenPerMs = max / Tuning.get('harvest.traderRegenTimeMs');
    return Math.min(max, state.harvestTraderGold + elapsed * regenPerMs);
  },

  /**
   * Milliseconds until the trader's reserve regenerates enough to afford
   * `cost` gold worth of selling, given its current level. 0 if it can
   * already afford it right now. Shared by sell()'s own "check back
   * later" error message and HarvestPanel.tsx's live reserve display, so
   * the two can never drift out of sync with each other.
   */
  timeUntilAffordable(state: GameState, now: number, cost: number): number {
    const reserve = HarvestManager.currentTraderGold(state, now);
    if (cost <= reserve) return 0;
    const max = HarvestManager.sellGoldPerHourTarget(state);
    const regenPerMs = max / Tuning.get('harvest.traderRegenTimeMs');
    return (cost - reserve) / regenPerMs;
  },

  /**
   * Sells `amount` of one material at Trade Route -- flat
   * harvest.sellPricePerUnit (0.1 by default; materials are cheap
   * individually on purpose, selling excess is meant to be a minor
   * convenience next to actually questing, not a competing income
   * source). Blocks the ENTIRE sale, materials untouched, if the
   * trader's current reserve can't cover it -- no partial fill, no
   * discounted fallback price, so a player always knows exactly what a
   * sale is worth going in rather than discovering it was quietly
   * devalued. The returned message includes a real ETA (formatDuration
   * against the reserve's own linear regen rate) for when there'll be
   * enough back to afford this same sale.
   */
  sell(state: GameState, materialId: MaterialId, amount: number, now = Date.now()): string | null {
    if (!state.tradeRouteUnlocked) return 'The Trade Route hasn\u2019t been opened yet.';
    if (amount <= 0) return null;
    if (state.materials[materialId] < amount) return 'Not enough in stock.';
    const value = Math.max(1, Math.floor(amount * Tuning.get('harvest.sellPricePerUnit')));
    const reserve = HarvestManager.currentTraderGold(state, now);
    if (value > reserve) {
      const etaMs = HarvestManager.timeUntilAffordable(state, now, value);
      return `The trader\u2019s short on coin for that right now -- check back in ${formatDuration(etaMs)}.`;
    }
    state.materials[materialId] -= amount;
    state.gold = Math.min(ModifierManager.goldStorage(state), state.gold + value);
    state.stats.goldBySource.sellingMaterials += value;
    state.harvestTraderGold = reserve - value;
    state.harvestTraderGoldAt = now;
    return null;
  },

  unlockTradeRoute(state: GameState, now = Date.now()): string | null {
    if (state.tradeRouteUnlocked) return 'Already unlocked.';
    if (state.gold < TRADE_ROUTE_COST) return 'Not enough gold.';
    state.gold -= TRADE_ROUTE_COST;
    state.stats.goldSpent += TRADE_ROUTE_COST;
    state.tradeRouteUnlocked = true;
    // Starts the trader's reserve full rather than empty -- a player who
    // just spent 5000 gold to open the Trade Route shouldn't immediately
    // hit "check back later" on their very first sale.
    state.harvestTraderGold = HarvestManager.sellGoldPerHourTarget(state);
    state.harvestTraderGoldAt = now;
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
