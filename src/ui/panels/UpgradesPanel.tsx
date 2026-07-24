import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { describeMods, formatGold } from '../../game/util';

export function UpgradesPanel() {
  const engine = useEngine();
  const state = engine.state;
  const global = ModifierManager.global(state);

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

      <div className="grid two">
        {GuildManager.upgrades().map((def) => {
          const level = GuildManager.upgradeLevel(state, def.id);
          const cost = GuildManager.nextUpgradeCost(state, def.id);
          const maxed = cost === null;
          return (
            <div key={def.id} className="card" style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{def.name}</span>
                <span className="small muted">{level}/{def.maxLevel}</span>
              </div>
              <p className="card-flavour">{def.description}</p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
                {def.unlocks === 'legendaryQuests' && <span className="gold-text">Unlocks Legendary quests</span>}
                {def.unlocks === 'chains' && <span className="gold-text">Unlocks multi-day quest chains</span>}
              </div>
              <button
                className="btn-primary"
                disabled={maxed || state.gold < cost}
                onClick={() => engine.buyUpgrade(def.id)}
              >
                {maxed ? 'Fully upgraded' : `Buy · ${formatGold(cost)}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
