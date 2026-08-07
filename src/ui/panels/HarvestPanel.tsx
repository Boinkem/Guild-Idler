import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine, useNow } from '../useEngine';
import { MATERIALS, MATERIAL_BY_ID, NODE_ORDER } from '../../game/data/materials';
import {
  HARVEST_TOOL_BY_NODE, TRADE_ROUTE_COST, WAREHOUSE_UPGRADE,
  harvestToolCost, warehouseUpgradeCost,
} from '../../game/data/harvestUpgrades';
import { HarvestManager } from '../../game/managers/HarvestManager';
import { MaterialId } from '../../game/types';
import { formatGold } from '../../game/util';
import { MaxFlash, useMaxFlash } from '../maxFlash';

type SubTab = 'warehouse' | 'fields';

/**
 * Stable pseudo-random 0-100 position per spawn, remapped into that node's
 * own lane within the one shared scene -- ore always left-most, then
 * timber, herbs, fish, matching NODE_ORDER. Four even 25%-wide lanes, a
 * little padding inside each so nothing sits right on a lane boundary.
 * Deterministic on (spawnedAt, nodeId) so it doesn't jitter on every
 * re-render, but still varies spawn to spawn.
 */
function spawnPositionPercent(spawnedAt: number, nodeId: MaterialId): number {
  const laneIndex = NODE_ORDER.indexOf(nodeId);
  const laneWidth = 100 / NODE_ORDER.length;
  const laneStart = laneIndex * laneWidth;
  const seed = spawnedAt + nodeId.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  const padding = laneWidth * 0.12;
  return laneStart + padding + frac * (laneWidth - padding * 2);
}

const BURST_PARTICLES = [
  { dx: -18, dy: -70, rot: -12, delay: 0 },
  { dx: 10, dy: -84, rot: 10, delay: 40 },
  { dx: 32, dy: -58, rot: 18, delay: 90 },
];

export function HarvestPanel() {
  const engine = useEngine();
  const state = engine.state;
  const [subTab, setSubTab] = useState<SubTab>('warehouse');

  return (
    <>
      <h2>Harvest</h2>
      <p className="subtitle">
        Idle heroes gather instead of doing nothing. Click a shiny while it&rsquo;s here, then spend the stock
        with each vendor's own Crafting, over in Vendors.
      </p>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <button className={subTab === 'warehouse' ? 'btn-primary' : ''} onClick={() => setSubTab('warehouse')}>
          Warehouse
        </button>
        <button className={subTab === 'fields' ? 'btn-primary' : ''} onClick={() => setSubTab('fields')}>
          Fields
        </button>
      </div>

      {subTab === 'warehouse' ? <WarehouseTab /> : <FieldsTab />}

      {/* Not gated on which sub-tab is open -- an idle hero should feed
          every node's spawn timer regardless of which one you happen to be
          looking at, same "the world doesn't pause just because you're not
          looking at it" principle the quest board and shop already follow. */}
      <p className="tiny muted" style={{ marginTop: 4 }}>
        {HarvestManager.idleHeroCount(state)} idle hero{HarvestManager.idleHeroCount(state) === 1 ? '' : 'es'} feeding
        every node right now -- more idle heroes, faster spawns everywhere, not just here.
      </p>
    </>
  );
}

/**
 * One shared scene, one background image split into four even blocks
 * (see the image note in guild-idler-status.md's Harvest section) --
 * ore drops in the left-most quarter, then timber, herbs, fish, matching
 * NODE_ORDER left to right. Each node's own falling item, click handling,
 * and catch-burst are still fully independent (four NodeLane instances),
 * just positioned within that node's own 25%-wide slice instead of the
 * full width a dedicated per-node scene used to have.
 */
function FieldsTab() {
  const state = useEngine().state;
  return (
    <>
      <div className="harvest-scene" style={{ backgroundImage: 'url(./lore/harvest/fields.jpg)' }}>
        {NODE_ORDER.map((nodeId) => <NodeLane key={nodeId} nodeId={nodeId} />)}
      </div>
      <div className="row wrap" style={{ gap: 12 }}>
        {MATERIALS.map((m) => (
          <span key={m.id} className="tiny muted">
            {m.name}: {state.materials[m.id]}/{HarvestManager.capacity(state)}
          </span>
        ))}
      </div>
    </>
  );
}

function NodeLane({ nodeId }: { nodeId: MaterialId }) {
  const engine = useEngine();
  const state = engine.state;
  // 400ms tick -- fast enough that the fade-out near despawn reads as
  // smooth, without ticking so often it'd be wasteful for something this
  // low-stakes.
  const now = useNow(400);
  const [burst, setBurst] = useState<{ key: number; left: number; gained: number; bonus: boolean } | null>(null);

  const material = MATERIAL_BY_ID[nodeId];
  const node = state.harvestNodes[nodeId];
  const pending = node.pending;

  // Whether *this specific* spawn should still play its fall-in animation.
  // Tied directly to pending.spawnedAt via the effect below rather than
  // comparing against the periodically-ticking `now` above -- one fewer
  // moving part, and it can't be thrown off by how those two independent
  // ticks happen to line up on any given render.
  const [freshSpawnedAt, setFreshSpawnedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!pending) return undefined;
    setFreshSpawnedAt(pending.spawnedAt);
    const timeout = window.setTimeout(() => setFreshSpawnedAt((prev) => (prev === pending.spawnedAt ? null : prev)), 1200);
    return () => window.clearTimeout(timeout);
  }, [pending?.spawnedAt]);
  const isFresh = pending ? freshSpawnedAt === pending.spawnedAt : false;

  const msLeft = pending ? pending.expiresAt - now : 0;
  const fadingOpacity = pending && msLeft < 1500 ? Math.max(0, msLeft / 1500) : 1;
  const leftPercent = pending ? spawnPositionPercent(pending.spawnedAt, nodeId) : 0;

  function handleClick() {
    const result = engine.catchMaterial(nodeId);
    if (result.gained > 0) {
      setBurst({ key: Date.now(), left: leftPercent, gained: result.gained, bonus: result.bonus });
    }
  }

  return (
    <>
      {pending && (
        <button
          key={pending.spawnedAt}
          className={`harvest-item ${isFresh ? 'fresh' : 'settled'} ${pending.bonus ? 'bonus' : ''}`}
          style={{ left: `${leftPercent}%`, opacity: fadingOpacity }}
          onClick={handleClick}
          aria-label={`Collect ${material.name}`}
        >
          {material.glyph}
        </button>
      )}

      {burst && (
        <div
          className="collect-burst"
          aria-hidden="true"
          style={{ left: `${burst.left}%`, bottom: 'auto', top: '62%' }}
          key={burst.key}
        >
          <span
            className="collect-particle material"
            style={{ '--dx': `${BURST_PARTICLES[0].dx}px`, '--dy': `${BURST_PARTICLES[0].dy}px`, '--rot': `${BURST_PARTICLES[0].rot}deg` } as CSSProperties}
          >
            +{burst.gained} {material.name}{burst.bonus ? ' bonus!' : ''}
          </span>
          {BURST_PARTICLES.slice(1).map((p, i) => (
            <span
              key={i}
              className="collect-particle material"
              style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
            >
              {material.glyph}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function ToolUpgradeCard({ nodeId }: { nodeId: MaterialId }) {
  const engine = useEngine();
  const state = engine.state;
  const tool = HARVEST_TOOL_BY_NODE[nodeId];
  const level = state.harvestTools[nodeId] ?? 0;
  const cost = harvestToolCost(nodeId, level);
  const maxed = cost === null;
  const { flashes, dismiss } = useMaxFlash([{ id: nodeId, name: tool.name, level, maxLevel: tool.maxLevel }]);
  const flash = flashes[nodeId];

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="spread">
        <span className="card-title">{tool.name}</span>
        <span key={level} className="small muted purchase-pulse">Level {level}/{tool.maxLevel}</span>
      </div>
      <p className="card-flavour">
        +{tool.yieldBonusPerLevel} yield and a faster respawn per level. ({MATERIAL_BY_ID[nodeId].nodeName})
      </p>
      <button className="btn-primary" disabled={maxed || state.gold < (cost ?? 0)} onClick={() => engine.upgradeHarvestTool(nodeId)}>
        {maxed ? 'Fully upgraded' : `Upgrade · ${formatGold(cost ?? 0)}`}
      </button>
      {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(nodeId)} />}
    </div>
  );
}

function WarehouseTab() {
  const engine = useEngine();
  const state = engine.state;
  const cap = HarvestManager.capacity(state);
  const warehouseCost = warehouseUpgradeCost(state.warehouseLevel);
  const warehouseMaxed = warehouseCost === null;

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">Warehouse</div>
        <p className="card-flavour">
          One shared storage cap, applied to every material. {WAREHOUSE_UPGRADE.capacityPerLevel} more per level.
        </p>
        {MATERIALS.map((m) => (
          <div key={m.id} className="harvest-stock-row" style={{ marginBottom: 4 }}>
            <span className="tiny muted" style={{ width: 70 }}>{m.name}</span>
            <div className="harvest-stock-bar">
              <span style={{ width: `${Math.min(100, (state.materials[m.id] / cap) * 100)}%` }} />
            </div>
            <span className="tiny muted" style={{ width: 60, textAlign: 'right' }}>
              {state.materials[m.id]}/{cap}
            </span>
          </div>
        ))}
        <button
          className="btn-primary"
          style={{ marginTop: 8 }}
          disabled={warehouseMaxed || state.gold < (warehouseCost ?? 0)}
          onClick={() => engine.upgradeWarehouse()}
        >
          {warehouseMaxed ? 'Fully built' : `Expand · ${formatGold(warehouseCost ?? 0)}`}
        </button>
      </div>

      <TradeRouteCard />

      <div className="section-heading">Tools</div>
      <p className="tiny muted" style={{ marginBottom: 8 }}>
        Moved here from each node's own view -- one shared spot for every tool upgrade, same as everything
        else Warehouse-related.
      </p>
      <div className="grid two">
        {NODE_ORDER.map((nodeId) => <ToolUpgradeCard key={nodeId} nodeId={nodeId} />)}
      </div>
    </>
  );
}

function TradeRouteCard() {
  const engine = useEngine();
  const state = engine.state;

  if (!state.tradeRouteUnlocked) {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">Trade Route</div>
        <p className="card-flavour">
          Opens a market for the guild&rsquo;s surplus materials. Without it, everything gathered has to be used,
          not sold.
        </p>
        <button className="btn-primary" disabled={state.gold < TRADE_ROUTE_COST} onClick={() => engine.unlockTradeRoute()}>
          Open · {formatGold(TRADE_ROUTE_COST)}
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Trade Route</div>
      <p className="card-flavour">Sell surplus materials for gold, 4 gold per unit.</p>
      <div className="row wrap" style={{ gap: 6 }}>
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            className="btn-ghost"
            style={{ minHeight: 26 }}
            disabled={state.materials[m.id] < 10}
            onClick={() => engine.sellMaterial(m.id, 10)}
          >
            Sell 10 {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
