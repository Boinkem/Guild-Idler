import { useState } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES, VENDORS, vendorUpgrades } from '../../game/data/progression';
import { VendorId, UpgradeDef } from '../../game/types';
import { describeMods, formatGold } from '../../game/util';
import { VendorSprite } from '../sprites/VendorSprite';
import { MaxFlash, useMaxFlash, FlashTarget } from '../maxFlash';

type Tab = 'general' | VendorId;

function chainRangeText(level: number): string {
  const range = AUTO_CHAIN_RANGES[level];
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
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
