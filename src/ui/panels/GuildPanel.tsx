import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { describeMods, formatGold } from '../../game/util';
import { MaxFlash, useMaxFlash } from '../maxFlash';

export function GuildPanel() {
  const engine = useEngine();
  const state = engine.state;

  const facilities = GuildManager.facilities();
  const { flashes, dismiss } = useMaxFlash(
    facilities.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.facilityLevel(state, def.id), maxLevel: def.maxLevel,
    })),
  );

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
          const flash = flashes[def.id];
          return (
            <div key={def.id} className="card" style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{def.name}</span>
                <span key={level} className="small muted purchase-pulse">Level {level}/{def.maxLevel}</span>
              </div>
              <p className="card-flavour">{def.description}</p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
                {def.storagePerLevel && <span>+{formatGold(def.storagePerLevel)} storage per level</span>}
                {def.heroSlotsPerLevel && <span className="gold-text">+1 hero slot per level</span>}
              </div>
              <button
                className="btn-primary"
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
    </>
  );
}
