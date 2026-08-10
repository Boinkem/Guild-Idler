import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES } from '../../game/data/progression';
import { UpgradeDef } from '../../game/types';
import { describeMods, formatGold } from '../../game/util';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';

function chainRangeText(level: number): string {
  const range = AUTO_CHAIN_RANGES[level];
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}

export function GuildPanel() {
  const engine = useEngine();
  const state = engine.state;
  const global = ModifierManager.global(state);

  const facilities = GuildManager.facilities();
  // General upgrades (no vendor field) used to live alone in the old
  // Upgrades tab -- moved here so upgrades don't need two different
  // destinations. Vendor-specific upgrades (Blacksmith/Alchemist/
  // Enchanter) moved onto each vendor's own page in Vendors instead --
  // see VendorsPanel.tsx.
  const generalUpgrades = GuildManager.upgrades().filter((u) => !u.vendor);
  const { flashes, dismiss } = useMaxFlash([
    ...facilities.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.facilityLevel(state, def.id), maxLevel: def.maxLevel,
    })),
    ...generalUpgrades.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.upgradeLevel(state, def.id), maxLevel: def.maxLevel,
    })),
  ]);
  // Same combined facilities+upgrades list useMaxFlash above already
  // builds, just tracking every level change (not only "just hit max")
  // for the "Level N/M" pulse -- see usePulsesOnChange's own doc comment
  // for why this has to be a single batch hook call rather than one per
  // card.
  const levelPulses = usePulsesOnChange([
    ...facilities.map((def) => ({ id: def.id, value: GuildManager.facilityLevel(state, def.id) })),
    ...generalUpgrades.map((def) => ({ id: def.id, value: GuildManager.upgradeLevel(state, def.id) })),
  ]);

  function upgradeCard(def: UpgradeDef) {
    const level = GuildManager.upgradeLevel(state, def.id);
    const cost = GuildManager.nextUpgradeCost(state, def.id);
    const maxed = cost === null && level >= def.maxLevel;
    // Highlighted the moment it's actually buyable, not just "cheaper than
    // the most expensive thing in the tab" -- affordable means the exact
    // next-purchase cost is covered by current gold right now.
    const affordable = !maxed && cost !== null && state.gold >= cost;
    const flash = flashes[def.id];
    const pulsing = levelPulses[def.id];
    return (
      <div key={def.id} className={`card ${affordable ? 'affordable' : ''}`} style={{ marginBottom: 0 }}>
        <div className="spread">
          <span className="card-title">{def.name}</span>
          <span className={`small muted ${pulsing ? 'purchase-pulse' : ''}`}>{level}/{def.maxLevel}</span>
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
          className="btn-yellow"
          disabled={maxed || cost === null || state.gold < cost}
          onClick={() => engine.buyUpgrade(def.id)}
        >
          {maxed ? 'Fully upgraded' : `Buy · ${formatGold(cost ?? 0)}`}
        </button>
        {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(def.id)} />}
      </div>
    );
  }

  return (
    <>
      <h2>Guild Hall</h2>
      <p className="subtitle">
        Facility levels apply to every hero, now and after every retirement.
        Gold storage: {formatGold(ModifierManager.goldStorage(state))}.
      </p>

      <div className="grid two">
        {facilities.map((def) => {
          const level = GuildManager.facilityLevel(state, def.id);
          const cost = GuildManager.nextCost(state, def.id);
          const maxed = cost === null;
          const affordable = !maxed && state.gold >= cost;
          const flash = flashes[def.id];
          const pulsing = levelPulses[def.id];
          return (
            <div key={def.id} className={`card ${affordable ? 'affordable' : ''}`} style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{def.name}</span>
                <span className={`small muted ${pulsing ? 'purchase-pulse' : ''}`}>Level {level}/{def.maxLevel}</span>
              </div>
              <p className="card-flavour">{def.description}</p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
                {def.storagePerLevel && <span>+{formatGold(def.storagePerLevel)} storage per level</span>}
                {def.heroSlotsPerLevel && <span className="gold-text">+1 hero slot per level</span>}
              </div>
              <button
                className="btn-yellow"
                disabled={maxed || state.gold < cost}
                onClick={() => engine.upgradeFacility(def.id)}
              >
                {maxed ? 'Fully built' : `Build · ${formatGold(cost)}`}
              </button>
              {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(def.id)} />}
            </div>
          );
        })}
      </div>

      <div className="section-heading">Permanent Upgrades</div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Bought once, kept forever — retirement does not take these away. Vendor-specific upgrades
        (Blacksmith, Alchemist, Enchanter) live on each vendor's own page in Vendors instead.
      </p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">Current guild bonuses</div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          {describeMods(global).length === 0
            ? <span className="muted">None yet.</span>
            : describeMods(global).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
      <div className="grid two">
        {generalUpgrades.map(upgradeCard)}
      </div>
    </>
  );
}
