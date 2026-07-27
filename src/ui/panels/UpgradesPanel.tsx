import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES, VENDORS, vendorUpgrades } from '../../game/data/progression';
import { VendorId, UpgradeDef } from '../../game/types';
import { describeMods, formatGold } from '../../game/util';
import { VendorSprite } from '../sprites/VendorSprite';

type Tab = 'general' | VendorId;

function chainRangeText(level: number): string {
  const range = AUTO_CHAIN_RANGES[level];
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}

/* ------------------------------ max-level flash ----------------------------- */

/** A small fixed burst pattern -- eight points around a circle -- reused for
 * every flash. No need for randomness; the star delays below give it enough
 * life that it doesn't read as mechanical. */
const STAR_BURST: { dx: number; dy: number; rot: number }[] = [
  { dx: 0, dy: -36, rot: -12 },
  { dx: 27, dy: -24, rot: 16 },
  { dx: 36, dy: 3, rot: -20 },
  { dx: 23, dy: 30, rot: 24 },
  { dx: -4, dy: 36, rot: -9 },
  { dx: -29, dy: 23, rot: 18 },
  { dx: -36, dy: -4, rot: -22 },
  { dx: -21, dy: -29, rot: 13 },
];

function MaxFlash({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="max-flash-layer" aria-hidden="true">
      <span className="max-flash-text">Fully upgraded — {label}</span>
      {STAR_BURST.map((s, i) => (
        <span
          key={i}
          className="max-flash-star"
          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--rot': `${s.rot}deg`, animationDelay: `${i * 25}ms` } as CSSProperties}
        >
          ★
        </span>
      ))}
    </div>
  );
}

interface FlashTarget { id: string; name: string; level: number; maxLevel: number }

/** Fires a one-off flash the moment any tracked item's level first reaches
 * its cap -- not on mount, so re-opening the panel on an already-maxed
 * upgrade doesn't replay it. */
function useMaxFlash(items: FlashTarget[]) {
  const prevRef = useRef<Record<string, number> | null>(null);
  const [flashes, setFlashes] = useState<Record<string, { name: string; key: number }>>({});

  const signature = items.map((i) => `${i.id}:${i.level}`).join('|');
  useEffect(() => {
    const prev = prevRef.current;
    const next: Record<string, number> = {};
    const newlyMaxed: FlashTarget[] = [];
    for (const item of items) {
      next[item.id] = item.level;
      const before = prev?.[item.id];
      if (prev && item.level >= item.maxLevel && before !== undefined && before < item.maxLevel) {
        newlyMaxed.push(item);
      }
    }
    prevRef.current = next;
    if (newlyMaxed.length > 0) {
      setFlashes((cur) => {
        const merged = { ...cur };
        for (const item of newlyMaxed) merged[item.id] = { name: item.name, key: Date.now() + Math.random() };
        return merged;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const dismiss = (id: string) => setFlashes((cur) => {
    if (!(id in cur)) return cur;
    const rest = { ...cur };
    delete rest[id];
    return rest;
  });

  return { flashes, dismiss };
}

export function UpgradesPanel() {
  const engine = useEngine();
  const state = engine.state;
  const global = ModifierManager.global(state);
  const [tab, setTab] = useState<Tab>('general');

  const generalUpgrades = GuildManager.upgrades().filter((u) => !u.vendor);
  const allUpgrades = GuildManager.upgrades();

  const flashTargets: FlashTarget[] = [
    ...allUpgrades.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.upgradeLevel(state, def.id), maxLevel: def.maxLevel,
    })),
    ...VENDORS.map((v) => ({
      id: `vendor:${v.id}`, name: `${v.name} — fully trained`,
      level: GuildManager.vendorLevel(state, v.id), maxLevel: vendorUpgrades(v.id).length,
    })),
  ];
  const { flashes, dismiss } = useMaxFlash(flashTargets);

  function upgradeCard(def: UpgradeDef) {
    const level = GuildManager.upgradeLevel(state, def.id);
    const cost = GuildManager.nextUpgradeCost(state, def.id);
    const maxed = cost === null && level >= def.maxLevel;
    const flash = flashes[def.id];
    return (
      <div key={def.id} className="card" style={{ marginBottom: 0 }}>
        <div className="spread">
          <span className="card-title">{def.name}</span>
          <span key={level} className="small muted purchase-pulse">{level}/{def.maxLevel}</span>
        </div>
        <p className="card-flavour">{def.description}</p>
        <div className="stat-row" style={{ marginBottom: 8 }}>
          {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
          {def.unlocks === 'legendaryQuests' && <span className="gold-text">Unlocks Legendary quests</span>}
          {def.unlocks === 'chains' && <span className="gold-text">Unlocks multi-day quest chains</span>}
          {def.unlocks === 'blackMarket' && <span className="gold-text">Unlocks the Black Market</span>}
          {def.unlocks === 'autoChain' && level > 0 && (
            <span className="gold-text">Currently chains {chainRangeText(level)} quests per streak</span>
          )}
          {def.unlocks === 'autoChain' && !maxed && (
            <span className="muted">Next tier: {chainRangeText(level + 1)} quests per streak</span>
          )}
        </div>
        <button
          className="btn-primary"
          disabled={maxed || cost === null || state.gold < cost}
          onClick={() => engine.buyUpgrade(def.id)}
        >
          {maxed ? 'Fully upgraded' : `Buy · ${formatGold(cost ?? 0)}`}
        </button>
        {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(def.id)} />}
      </div>
    );
  }

  function lockedCard(vendorId: VendorId, requiredLevel: number) {
    return (
      <div key={`locked-${requiredLevel}`} className="card locked-upgrade" style={{ marginBottom: 0 }}>
        <div className="card-title muted">???</div>
        <p className="card-flavour muted">Level up {VENDORS.find((v) => v.id === vendorId)?.name} to level {requiredLevel} to see this.</p>
      </div>
    );
  }

  return (
    <>
      <h2>Permanent Upgrades</h2>
      <p className="subtitle">Bought once, kept forever — retirement does not take these away.</p>

      <div className="card">
        <div className="card-title">Current guild bonuses</div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          {describeMods(global).length === 0
            ? <span className="muted">None yet.</span>
            : describeMods(global).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>

      <div className="row vendor-tabs" style={{ gap: 6, marginBottom: 12 }}>
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>General</button>
        {VENDORS.map((v) => (
          <button key={v.id} className={tab === v.id ? 'active' : ''} onClick={() => setTab(v.id)}>{v.name}</button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="grid two">
          {generalUpgrades.map(upgradeCard)}
        </div>
      )}

      {VENDORS.filter((v) => v.id === tab).map((vendorDef) => {
        const level = GuildManager.vendorLevel(state, vendorDef.id);
        const cost = GuildManager.nextVendorLevelCost(state, vendorDef.id);
        const list = vendorUpgrades(vendorDef.id);
        const maxed = cost === null;
        const vendorFlash = flashes[`vendor:${vendorDef.id}`];
        return (
          <div key={vendorDef.id}>
            <div className="card vendor-card">
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <VendorSprite vendor={vendorDef.id} height={72} animate />
                <div style={{ flex: 1 }}>
                  <div className="spread">
                    <span className="card-title">{vendorDef.name}</span>
                    <span key={level} className="small muted purchase-pulse">Level {level}/{list.length}</span>
                  </div>
                  <p className="card-flavour">{vendorDef.blurb}</p>
                  <button
                    className="btn-primary"
                    disabled={maxed || cost === null || state.gold < cost}
                    onClick={() => engine.levelUpVendor(vendorDef.id)}
                  >
                    {maxed ? 'Nothing more to teach' : `Level up · ${formatGold(cost ?? 0)}`}
                  </button>
                </div>
              </div>
              {vendorFlash && <MaxFlash key={vendorFlash.key} label={vendorFlash.name} onDone={() => dismiss(`vendor:${vendorDef.id}`)} />}
            </div>

            <div className="grid two">
              {list.map((def, index) => (level >= index + 1 ? upgradeCard(def) : lockedCard(vendorDef.id, index + 1)))}
            </div>
          </div>
        );
      })}
    </>
  );
}
