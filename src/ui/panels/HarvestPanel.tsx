import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { MATERIALS, MATERIAL_BY_ID, NODE_ORDER, harvestIconFor } from '../../game/data/materials';
import {
  HARVEST_TOOL_BY_NODE, OVERSEER_UPGRADE, TRADE_ROUTE_COST, WAREHOUSE_UPGRADE,
  harvestToolCost, overseerRescueChancePercent, overseerUpgradeCost, warehouseUpgradeCost,
} from '../../game/data/harvestUpgrades';
import { HarvestManager } from '../../game/managers/HarvestManager';
import { Tuning } from '../../game/data/tuning';
import { MaterialId } from '../../game/types';
import { formatDuration, formatGold, formatMaterial } from '../../game/util';
import { isTabUnread } from '../../game/attention';
import { Ring } from './DashboardPanel';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import { useFlyTargetRef, measureFlyOffset } from '../flyTarget';
import { backgroundSrc } from '../../game/settings';

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

// Two little "+ Ore!" pings per catch (was five, cut down per direct
// feedback that a single catch spawned too much "+item" text at once),
// purely a visual flourish -- none of them carry the actual gained
// amount anymore (see the burst render below for why: showing a
// fraction of the real total on every single one of several particles
// read as if that fraction had been gained several times over, when
// only one lot was ever actually caught). The real number lives solely
// in the counter above, via useCountUpDisplay.
const BURST_PARTICLES = [
  { dx: -18, dy: -70, rot: -10, delay: 0 },
  { dx: 20, dy: -84, rot: 12, delay: 90 },
];

/**
 * Renders one of `material.icons` (via `harvestIconFor`) if a pool exists
 * and the chosen file actually loads, otherwise the plain text glyph --
 * covers both "no icons configured yet" (icon is null) and "icons are
 * configured but the real files haven't been dropped into
 * public/harvest-icons/ yet" (the <img> 404s, onError catches it) with the
 * same fallback, so this is safe to leave wired up before any art exists.
 */
function HarvestGlyph({ icon, glyph }: { icon: string | null; glyph: string }) {
  const [failed, setFailed] = useState(false);
  if (!icon || failed) return <>{glyph}</>;
  return (
    <img
      src={`./harvest-icons/${icon}`}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

export function HarvestPanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const [subTab, setSubTab] = useState<SubTab>('warehouse');

  // Deep-link support for a notification's "Go to Warehouse" button (see
  // the Trade Route unlock's targetSubTab in engine.ts) -- same
  // consume-once shape every other sub-tabbed panel uses.
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested === 'warehouse' || requested === 'fields') setSubTab(requested);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever sub-tab is currently open -- on mount (the
  // default Warehouse) and again on every switch -- clearing the nav
  // shimmer for a banner-worthy notification targeting this specific
  // sub-tab (patch 0191).
  useEffect(() => {
    engine.acknowledgeTab('harvest', subTab);
  }, [engine, subTab]);

  return (
    // Whole-panel background (patch 0306, direct report) -- both
    // sub-tabs now share the one farmland scene, same `.tab-scene`/
    // `.tab-scene-content` shape every other panel in the game already
    // uses, rather than a background that only ever lived in a small
    // boxed inset around the Fields node-clicking area (see FieldsTab's
    // own comment for what moved out of there). Warehouse had no
    // background of its own before this -- what showed behind it was
    // always just the generic ambient menu backdrop bleeding through,
    // unrelated to Harvest specifically.
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/harvest/fields.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <h2>Harvest</h2>
      <p className="subtitle">
        Idle heroes gather instead of doing nothing. Click a shiny while it&rsquo;s here, then spend the stock
        with each vendor's own Crafting, over in Vendors.
      </p>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`btn-subtab ${subTab === 'warehouse' ? 'on' : ''} ${isTabUnread(state, 'harvest', 'warehouse') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('warehouse')}
        >
          Warehouse
        </button>
        <button
          className={`btn-subtab ${subTab === 'fields' ? 'on' : ''} ${isTabUnread(state, 'harvest', 'fields') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('fields')}
        >
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
      </div>
    </div>
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
/** How long a caught material's icon takes to fly from the node lane to
 *  the Fields tab's own material counter above -- also when that
 *  counter's own arrival flash fires. Longer than Scrap's own 650ms
 *  (bigger, more satisfying moment per direct request; Harvest catches
 *  happen far more often than a Scrap action, but the flourish is
 *  cheap/ambient enough that a longer one here doesn't get tiring the
 *  way a longer one on every single quest result might). */
const HARVEST_FLY_MS = 900;
const HARVEST_FLASH_MS = 700;

function FieldsTab() {
  const state = useEngine().state;
  const cap = HarvestManager.capacity(state);
  const [flashing, setFlashing] = useState<Partial<Record<MaterialId, boolean>>>({});
  const flashTimeouts = useRef<Partial<Record<MaterialId, number>>>({});

  const triggerFlash = (materialId: MaterialId) => {
    setFlashing((cur) => ({ ...cur, [materialId]: true }));
    const existing = flashTimeouts.current[materialId];
    if (existing !== undefined) window.clearTimeout(existing);
    flashTimeouts.current[materialId] = window.setTimeout(() => {
      setFlashing((cur) => ({ ...cur, [materialId]: false }));
    }, HARVEST_FLASH_MS);
  };

  useEffect(() => () => {
    for (const id of Object.values(flashTimeouts.current)) if (id !== undefined) window.clearTimeout(id);
  }, []);

  return (
    <>
      <div className="row wrap" style={{ gap: 12, marginBottom: 8 }}>
        {MATERIALS.map((m) => (
          <MaterialCounter key={m.id} materialId={m.id} amount={state.materials[m.id]} cap={cap} flashing={!!flashing[m.id]} />
        ))}
      </div>
      <SpawnTimerBar />
      {/* Own background layer removed (patch 0306, direct report) -- this
       *  box used to carry its own private copy of fields.jpg, cropped to
       *  its own locked aspect ratio, sitting inside a panel whose
       *  surrounding chrome (header, sub-tab buttons, Warehouse) showed a
       *  completely different, unrelated backdrop. HarvestPanel's own
       *  wrapper now carries that same image as one continuous background
       *  for the whole tab (both sub-tabs), so this box just needs to stay
       *  a positioned, appropriately-sized container for NodeLane's
       *  percentage-based item placement -- transparent, letting the
       *  shared panel background show through underneath instead of a
       *  second independently-cropped copy of it. See this box's own CSS
       *  comment in app.css for the sizing rationale that's unchanged. */}
      <div className="harvest-scene">
        {NODE_ORDER.map((nodeId) => <NodeLane key={nodeId} nodeId={nodeId} onCatch={triggerFlash} />)}
      </div>
    </>
  );
}

/**
 * Countdown to the SOONEST upcoming spawn across all 4 nodes -- reworked
 * from a single shared wave countdown back to this after spawning itself
 * reverted to independent per-node timing (see HarvestManager.
 * spawnIntervalMs's own comment). There's no longer one shared "next
 * spawn" moment to point at, so this shows whichever node is closest,
 * recomputed fresh each tick since a different node can become the
 * soonest one from moment to moment (a catch resets that node's own
 * timer, which can leapfrog past whichever node was previously
 * soonest). A node that already has something pending doesn't count
 * toward this at all -- "next spawn" means the next NEW item appearing,
 * not one already sitting there waiting to be caught.
 */
function SpawnTimerBar() {
  const state = useEngine().state;
  const now = useNow(1000);
  const waitingNodes = NODE_ORDER.filter((id) => !state.harvestNodes[id].pending);
  if (waitingNodes.length === 0) {
    // Every node already has something pending -- there's no "next spawn"
    // to count down to right now, so the bar would be meaningless. Shown
    // as a quiet "all set" state instead of a confusing frozen/empty bar.
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span className="tiny muted">Everything's out there waiting to be caught.</span>
      </div>
    );
  }
  const soonest = waitingNodes.reduce((earliest, id) => {
    const at = state.harvestNodes[id].nextSpawnAt;
    return at < state.harvestNodes[earliest].nextSpawnAt ? id : earliest;
  }, waitingNodes[0]);
  const total = HarvestManager.spawnIntervalMs(state, soonest);
  const remaining = Math.max(0, state.harvestNodes[soonest].nextSpawnAt - now);
  const ratio = total > 0 ? Math.min(1, remaining / total) : 0;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
      <span className="tiny muted" style={{ flex: 'none' }}>Next spawn</span>
      <div className="bar" style={{ flex: 1 }} title={`${Math.ceil(remaining / 1000)}s until the next spawn`}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="tiny muted" style={{ flex: 'none', width: 28, textAlign: 'right' }}>
        {Math.ceil(remaining / 1000)}s
      </span>
    </div>
  );
}

/**
 * Animates a displayed number toward `value` over a short tween instead of
 * jumping straight to it -- direct feedback that the counter's own text
 * used to update in one instant, silent jump the moment a catch landed,
 * which read as disconnected from the catch-burst's own multi-particle
 * flourish playing out in the lane at the same time (the burst looked like
 * several small catches, but the counter visibly moved only once, with no
 * per-particle correspondence). Restarts from whatever's currently
 * displayed if `value` changes again mid-tween, so a rapid run of catches
 * keeps chasing the latest total smoothly rather than queuing up separate
 * animations.
 */
function useCountUpDisplay(value: number, durationMs = 550): number {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === display) return undefined;
    const from = display;
    const delta = value - from;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(from + delta * t);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}

/** The Fields tab's own always-visible material counter -- doubles as the
 *  fly target every node lane's catch flight aims at (see NodeLane's own
 *  `onCatch`), registered under `material:<id>` the same way
 *  ScrapStation's counter registered `scrap`/MenuWindow's registers
 *  `gold`. Deliberately the Fields tab's own summary row, not the
 *  Warehouse tab's stock rows -- those live on a different sub-tab that
 *  isn't mounted at the same time a catch actually happens, so they'd
 *  never be a valid fly target in the first place. */
function MaterialCounter({ materialId, amount, cap, flashing }: { materialId: MaterialId; amount: number; cap: number; flashing: boolean }) {
  const ref = useFlyTargetRef<HTMLSpanElement>(`material:${materialId}`);
  const material = MATERIAL_BY_ID[materialId];
  const displayAmount = useCountUpDisplay(amount);
  return (
    <span ref={ref} className={`tiny muted counter-flash-target ${flashing ? 'flash' : ''}`}>
      {material.name}: {formatMaterial(displayAmount)}/{cap}
    </span>
  );
}

function NodeLane({ nodeId, onCatch }: { nodeId: MaterialId; onCatch: (materialId: MaterialId) => void }) {
  const engine = useEngine();
  const state = engine.state;
  // 400ms tick -- fast enough that the fade-out near despawn reads as
  // smooth, without ticking so often it'd be wasteful for something this
  // low-stakes.
  const now = useNow(400);
  const [burst, setBurst] = useState<{ key: number; left: number; gained: number; bonus: boolean; icon: string | null } | null>(null);
  const [flight, setFlight] = useState<{ key: number; dx: number; dy: number; left: number; icon: string | null } | null>(null);
  const burstTimeoutRef = useRef<number | null>(null);
  const flightTimeoutRef = useRef<number | null>(null);

  // Neither `burst` nor `flight` was ever reset back to null after its own
  // animation finished -- both used a `key`-based remount so a NEW catch
  // correctly replayed the animation, but the OLD (already-finished, CSS
  // `forwards`-held-at-opacity-0) element just stayed mounted forever
  // rather than actually being cleared, since nothing ever set the state
  // back to null. Confirmed as the actual cause of reported "the text
  // continues to ping until a new node spawns" -- not literally a replay
  // loop, but stale burst/flight state accumulating indefinitely, which
  // this fixes the same way ScrapStation's own burst/flight state already
  // does: an explicit timeout, matched to each animation's own duration,
  // clears it back to null once it's actually done. Cleared on unmount
  // too, so navigating away mid-animation can't fire a state update on an
  // unmounted component.
  useEffect(() => () => {
    if (burstTimeoutRef.current !== null) window.clearTimeout(burstTimeoutRef.current);
    if (flightTimeoutRef.current !== null) window.clearTimeout(flightTimeoutRef.current);
  }, []);
  const { settings } = useSettings();

  const material = MATERIAL_BY_ID[nodeId];
  const node = state.harvestNodes[nodeId];
  const pending = node.pending;

  /*
   * Whether *this specific* spawn should still play its fall-in animation.
   * Two real bugs lived in the previous version of this (a separate effect
   * + a hardcoded 1200ms setTimeout to flip it back off):
   *
   * 1. That 1200ms was hardcoded, but the CSS animation it's gating
   *    (`.harvest-item.fresh`'s `harvest-fall`) scales with
   *    `--anim-speed` (`calc(2000ms / max(var(--anim-speed, 1), 0.001))`,
   *    slowed from an original 900ms per direct request -- the fall
   *    reads noticeably more of a gentle drift now, not a quick drop).
   *    At the default 1x speed that's 2000ms; at Settings > Animation
   *    speed "Slow" (0.5x) the real CSS duration stretches to 4000ms, so
   *    a fixed hardcoded gate would cut the fall off (and the fall
   *    animation got yanked mid-flight, right as it was easing into its
   *    landing bounce) well before it was actually done playing.
   * 2. On the very first render where a fresh `pending` appears, the
   *    effect hasn't run yet, so `isFresh` started out `false` for one
   *    frame -- the item's first paint used the *settled* (already-at-
   *    rest, mid-pulse) class, then flipped to `fresh` a moment later,
   *    which could read as the item never really falling at all.
   *
   * Computing this directly from the already-ticking `now` above fixes
   * both at once: it mirrors the CSS's own duration formula exactly (so
   * it can never cut the animation short at any speed setting), and it's
   * correct on the very first render since there's no separate state to
   * catch up to.
   */
  const animSpeed = settings.reduceMotion ? 0 : settings.animationSpeed;
  const fallDurationMs = 2000 / Math.max(animSpeed, 0.001);
  const isFresh = pending ? (now - pending.spawnedAt) < fallDurationMs + 300 : false;

  const msLeft = pending ? pending.expiresAt - now : 0;
  const fadingOpacity = pending && msLeft < 1500 ? Math.max(0, msLeft / 1500) : 1;
  const leftPercent = pending ? spawnPositionPercent(pending.spawnedAt, nodeId) : 0;
  const icon = pending ? harvestIconFor(nodeId, pending.spawnedAt) : null;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const result = engine.catchMaterial(nodeId);
    if (result.gained > 0) {
      const key = Date.now();
      setBurst({ key, left: leftPercent, gained: result.gained, bonus: result.bonus, icon });
      if (burstTimeoutRef.current !== null) window.clearTimeout(burstTimeoutRef.current);
      // 1200ms matches .collect-particle.harvest-catch's own animation-
      // duration exactly -- same "the JS clear has to mirror the CSS
      // timing" requirement the falling-animation fix elsewhere in this
      // file already established, for the same reason: clearing early
      // would cut the animation off mid-flight, and clearing late just
      // leaves a finished (invisible) element sitting around doing
      // nothing, which is the exact bug this whole change fixes.
      burstTimeoutRef.current = window.setTimeout(() => setBurst(null), 1200);

      const offset = measureFlyOffset(e.currentTarget, `material:${nodeId}`);
      if (offset) {
        setFlight({ key, ...offset, left: leftPercent, icon });
        if (flightTimeoutRef.current !== null) window.clearTimeout(flightTimeoutRef.current);
        flightTimeoutRef.current = window.setTimeout(() => {
          setFlight(null);
          onCatch(nodeId);
        }, HARVEST_FLY_MS);
      }
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
          <HarvestGlyph icon={icon} glyph={material.glyph} />
        </button>
      )}

      {burst && (
        <div
          className="collect-burst"
          aria-hidden="true"
          style={{ left: `${burst.left}%`, bottom: 'auto', top: '62%' }}
          key={burst.key}
        >
          {/* Every particle reads the same plain "+ Ore!"/"+ Bonus Ore!" --
              no amount on any of them. The real gained total shows once,
              counting up on the always-visible MaterialCounter above,
              instead of a fraction of it being repeated on each of several
              particles and reading like it was gained that many times. */}
          {BURST_PARTICLES.map((p, i) => (
            <span
              key={i}
              className="collect-particle material harvest-catch"
              style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
            >
              + {burst.bonus ? 'Bonus ' : ''}{material.name}!
            </span>
          ))}
        </div>
      )}

      {/* The actual "flies up to the counter" particle -- separate from
          the local burst above, which stays as in-place flavor at the
          spawn's own position. This one travels the real measured
          distance to the Fields tab's own material counter (see
          MaterialCounter/measureFlyOffset), landing exactly on it
          regardless of where in the lane the catch happened. Positioned
          at the spawn's own last on-screen spot (same left% the item
          itself was showing at), not the scene's origin, since that's
          where the actual catch visually happened. */}
      {flight && (
        <span
          key={flight.key}
          className="fly-particle"
          aria-hidden="true"
          style={{
            left: `${flight.left}%`, top: '62%',
            '--fly-dx': `${flight.dx}px`, '--fly-dy': `${flight.dy}px`,
            animationDuration: `${HARVEST_FLY_MS}ms`,
            position: 'absolute', fontSize: '1.25rem',
          } as CSSProperties}
        >
          <HarvestGlyph icon={flight.icon} glyph={material.glyph} />
        </span>
      )}
    </>
  );
}

/**
 * Patch 0321: converted from a full .card to the shared dense upgrade
 * row -- see .upgrade-row's own comment in app.css. Only 4 of these
 * exist (one per material node), same as Overseer right below it.
 */
function ToolUpgradeRow({ nodeId }: { nodeId: MaterialId }) {
  const engine = useEngine();
  const state = engine.state;
  const [showDetail, setShowDetail] = useState(false);
  const tool = HARVEST_TOOL_BY_NODE[nodeId];
  const level = state.harvestTools[nodeId] ?? 0;
  const cost = harvestToolCost(nodeId, level);
  const maxed = cost === null;
  const { flashes, dismiss } = useMaxFlash([{ id: nodeId, name: tool.name, level, maxLevel: tool.maxLevel }]);
  const flash = flashes[nodeId];
  const levelPulses = usePulsesOnChange([{ id: nodeId, value: level }]);
  const effectText = `+${tool.yieldBonusPerLevel} yield and a faster respawn per level`;
  const pctFill = Math.min(100, (level / tool.maxLevel) * 100);
  const buyLabel = maxed ? 'Fully upgraded' : `Upgrade · ${formatGold(cost ?? 0)}`;
  return (
    <div
      className="upgrade-row"
      onClick={() => setShowDetail(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetail(true); } }}
    >
      <span style={{ minWidth: 0 }}>
        <span className="upgrade-row-head">
          <span className="upgrade-row-name">{tool.name}</span>
          <span className={`upgrade-row-level ${levelPulses[nodeId] ? 'purchase-pulse' : ''}`}>Lv {level}/{tool.maxLevel}</span>
        </span>
        <span className="upgrade-row-effect">{effectText}</span>
        <span className="upgrade-row-rule">
          <span style={{ width: `${pctFill}%`, background: maxed ? 'var(--moss)' : 'var(--brass)' }} />
        </span>
      </span>
      <button
        className={`upgrade-buy-btn ${!maxed && state.gold >= (cost ?? 0) ? 'affordable' : ''}`}
        disabled={maxed || state.gold < (cost ?? 0)}
        onClick={(e) => { e.stopPropagation(); engine.upgradeHarvestTool(nodeId); }}
      >
        {buyLabel}
      </button>
      {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(nodeId)} />}
      {showDetail && (
        <div className="overlay" onClick={(e) => { e.stopPropagation(); setShowDetail(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="spread">
              <span className="card-title">{tool.name}</span>
              <span className="small muted">Lv {level}/{tool.maxLevel}</span>
            </div>
            <p className="card-flavour" style={{ marginTop: 6 }}>
              {effectText}. ({MATERIAL_BY_ID[nodeId].nodeName})
            </p>
            <div className="row end" style={{ marginTop: 14, gap: 8 }}>
              <button onClick={() => setShowDetail(false)}>Close</button>
              <button className="btn-yellow" disabled={maxed || state.gold < (cost ?? 0)} onClick={() => engine.upgradeHarvestTool(nodeId)}>{buyLabel}</button>
            </div>
          </div>
        </div>
      )}
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
        <div className="spread">
          <div className="card-title">Warehouse</div>
          <Ring
            progress={state.heroes.length > 0 ? HarvestManager.idleHeroCount(state) / state.heroes.length : 0}
            color="var(--brass)"
            size={40}
            title={`${HarvestManager.idleHeroCount(state)} idle hero${HarvestManager.idleHeroCount(state) === 1 ? '' : 'es'} feeding every node's spawn timer right now`}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{HarvestManager.idleHeroCount(state)}</span>
          </Ring>
        </div>
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
              {formatMaterial(state.materials[m.id])}/{cap}
            </span>
          </div>
        ))}
        <button
          className="btn-yellow"
          style={{ marginTop: 8 }}
          disabled={warehouseMaxed || state.gold < (warehouseCost ?? 0)}
          onClick={() => engine.upgradeWarehouse()}
        >
          {warehouseMaxed ? 'Fully built' : `Expand · ${formatGold(warehouseCost ?? 0)}`}
        </button>
      </div>

      <TradeRouteCard />
      <OverseerRow />

      <div className="section-heading">Tools</div>
      <p className="tiny muted" style={{ marginBottom: 8 }}>
        Moved here from each node's own view -- one shared spot for every tool upgrade, same as everything
        else Warehouse-related.
      </p>
      <div className="upgrade-row-list">
        {NODE_ORDER.map((nodeId) => <ToolUpgradeRow key={nodeId} nodeId={nodeId} />)}
      </div>
    </>
  );
}

/**
 * Patch 0321: converted from a full .card to the shared dense upgrade
 * row -- see .upgrade-row's own comment in app.css. The row's own
 * effect line is a short live stat once hired (rescuing X% -> next
 * level's Y%) rather than the longer flavour text, which moves to the
 * detail modal along with the pre-hire flavour paragraph, unchanged.
 */
function OverseerRow() {
  const engine = useEngine();
  const state = engine.state;
  const [showDetail, setShowDetail] = useState(false);
  const level = state.overseerLevel;
  const cost = overseerUpgradeCost(level);
  const maxed = cost === null;
  const chance = overseerRescueChancePercent(level);
  const nextChance = overseerRescueChancePercent(level + 1);
  const { flashes, dismiss } = useMaxFlash([{ id: 'overseer', name: OVERSEER_UPGRADE.name, level, maxLevel: OVERSEER_UPGRADE.maxLevel }]);
  const flash = flashes.overseer;
  const levelPulses = usePulsesOnChange([{ id: 'overseer', value: level }]);
  const description = level === 0
    ? 'Hire someone to keep an eye on the Fields. A spawn that would otherwise despawn unclicked gets a chance to be caught anyway -- never the bonus glint, and never as reliable as watching yourself, but nothing goes to waste while you\u2019re elsewhere.'
    : `Currently rescuing ${chance}% of whatever you miss, on every node, including while the app is closed.`;
  const effectText = level === 0 ? 'Catches missed spawns while you\u2019re away' : `Rescuing ${chance}% of misses \u2192 ${nextChance}% next level`;
  const pctFill = Math.min(100, (level / OVERSEER_UPGRADE.maxLevel) * 100);
  const buyLabel = maxed ? 'Fully staffed' : `${level === 0 ? 'Hire' : 'Promote'} · ${formatGold(cost ?? 0)}`;
  return (
    <div
      className="upgrade-row"
      onClick={() => setShowDetail(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetail(true); } }}
    >
      <span style={{ minWidth: 0 }}>
        <span className="upgrade-row-head">
          <span className="upgrade-row-name">Overseer</span>
          <span className={`upgrade-row-level ${levelPulses.overseer ? 'purchase-pulse' : ''}`}>Lv {level}/{OVERSEER_UPGRADE.maxLevel}</span>
        </span>
        <span className="upgrade-row-effect">{effectText}</span>
        <span className="upgrade-row-rule">
          <span style={{ width: `${pctFill}%`, background: maxed ? 'var(--moss)' : 'var(--brass)' }} />
        </span>
      </span>
      <button
        className={`upgrade-buy-btn ${!maxed && state.gold >= (cost ?? 0) ? 'affordable' : ''}`}
        disabled={maxed || state.gold < (cost ?? 0)}
        onClick={(e) => { e.stopPropagation(); engine.upgradeOverseer(); }}
      >
        {buyLabel}
      </button>
      {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss('overseer')} />}
      {showDetail && (
        <div className="overlay" onClick={(e) => { e.stopPropagation(); setShowDetail(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="spread">
              <span className="card-title">Overseer</span>
              <span className="small muted">Lv {level}/{OVERSEER_UPGRADE.maxLevel}</span>
            </div>
            <p className="card-flavour" style={{ marginTop: 6 }}>{description}</p>
            <div className="row end" style={{ marginTop: 14, gap: 8 }}>
              <button onClick={() => setShowDetail(false)}>Close</button>
              <button className="btn-yellow" disabled={maxed || state.gold < (cost ?? 0)} onClick={() => engine.upgradeOverseer()}>{buyLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRouteCard() {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(2000);

  if (!state.tradeRouteUnlocked) {
    return (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">Trade Route</div>
        <p className="card-flavour">
          Opens a market for the guild&rsquo;s surplus materials. Without it, everything gathered has to be used,
          not sold.
        </p>
        <button className="btn-yellow" disabled={state.gold < TRADE_ROUTE_COST} onClick={() => engine.unlockTradeRoute()}>
          Open · {formatGold(TRADE_ROUTE_COST)}
        </button>
      </div>
    );
  }

  // Live trader reserve -- see HarvestManager.currentTraderGold's own
  // comment. Recomputed every render off the current clock (useNow ticks
  // this component every 2s) so the gauge visibly refills on its own
  // between sales, not just right after one.
  const reserve = HarvestManager.currentTraderGold(state, now);
  const maxReserve = HarvestManager.sellGoldPerHourTarget(state);
  const unitPrice = Tuning.get('harvest.sellPricePerUnit');
  const costPerSale = Math.max(1, Math.floor(10 * unitPrice));
  const canAfford = reserve >= costPerSale;
  const etaMs = HarvestManager.timeUntilAffordable(state, now, costPerSale);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title">Trade Route</div>
      <p className="card-flavour">
        Sell surplus materials for a little gold -- 10 units nets {costPerSale}. The trader only has so much to
        spend at once; it&rsquo;s meant as a top-up for what you don&rsquo;t need, not a strategy on its own.
      </p>
      <p className={`tiny ${canAfford ? 'muted' : 'bad'}`} style={{ marginTop: -4, marginBottom: 8 }}>
        {canAfford
          ? `Trader has ${Math.floor(reserve)} of ${Math.floor(maxReserve)} gold to spend`
          : `The trader is out of coin -- check back in ${formatDuration(etaMs)}`}
      </p>
      <div className="row wrap" style={{ gap: 6 }}>
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            className="btn-ghost"
            style={{ minHeight: 26 }}
            disabled={state.materials[m.id] < 10 || !canAfford}
            onClick={() => engine.sellMaterial(m.id, 10)}
          >
            Sell 10 {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
