import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PRESTIGE_MIN_LEVEL } from '../../game/data/progression';
import { describeMods } from '../../game/util';

export function PrestigePanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;

  return (
    <>
      <h2>Prestige</h2>
      <p className="subtitle">
        Retire a hero at level {PRESTIGE_MIN_LEVEL} or above. They hand in their level and stats;
        the guild keeps their gear, gold, upgrades, and facilities, and gains Heroic Renown.
      </p>

      <div className="card">
        <div className="spread">
          <span className="card-title">Heroic Renown</span>
          <b style={{ color: 'var(--violet)' }}>✦ {state.renown}</b>
        </div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          {describeMods(ModifierManager.renownMods(state)).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>

      <div className="section-heading">Retire a hero</div>
      {state.heroes.map((hero) => {
        const eligible = PrestigeManager.canRetire(hero);
        const gain = PrestigeManager.renownPreview(hero);
        return (
          <div key={hero.id} className="spread card">
            <div>
              <div className="card-title">{hero.name}</div>
              <div className="tiny muted">
                Level {hero.level} · {hero.questsCompleted} quests · would grant ✦ {gain}
              </div>
            </div>
            <button
              className="btn-primary"
              disabled={!eligible}
              onClick={() => {
                if (!settings.confirmRetire
                  || confirm(`Retire ${hero.name}? They return to level 1 and the guild gains ${gain} renown.`)) {
                  engine.retire(hero.id);
                }
              }}
            >
              {eligible ? 'Retire' : `Needs level ${PRESTIGE_MIN_LEVEL}`}
            </button>
          </div>
        );
      })}

      <div className="section-heading">Spend renown</div>
      <div className="grid two">
        {PrestigeManager.perks().map((def) => {
          const level = PrestigeManager.perkLevel(state, def.id);
          const cost = PrestigeManager.nextPerkCost(state, def.id);
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
                {def.heroSlotsPerLevel && <span className="gold-text">+1 hero slot per level</span>}
              </div>
              <button
                className="btn-primary"
                disabled={maxed || state.renown < cost}
                onClick={() => engine.buyPerk(def.id)}
              >
                {maxed ? 'Maxed' : `Buy · ✦ ${cost}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
