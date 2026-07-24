import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { QUEST_CHAINS } from '../../game/data/quests';
import { describeMods, formatGold } from '../../game/util';

export function GuildPanel() {
  const engine = useEngine();
  const state = engine.state;

  return (
    <>
      <h2>Guild Hall</h2>
      <p className="subtitle">
        Facility levels apply to every hero, now and after every retirement.
        Gold storage: {formatGold(ModifierManager.goldStorage(state))}.
      </p>

      <div className="grid two">
        {GuildManager.facilities().map((def) => {
          const level = GuildManager.facilityLevel(state, def.id);
          const cost = GuildManager.nextCost(state, def.id);
          const maxed = cost === null;
          return (
            <div key={def.id} className="card" style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{def.name}</span>
                <span className="small muted">Level {level}/{def.maxLevel}</span>
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
            </div>
          );
        })}
      </div>

      <div className="section-heading">Quest chains</div>
      {!ModifierManager.hasUnlock(state, 'chains') && (
        <p className="small muted">Buy the Guild Charter upgrade to take on multi-day expeditions.</p>
      )}
      {QUEST_CHAINS.map((chain) => {
        const active = state.activeChains.find((c) => c.chainId === chain.id);
        const done = state.completedChains.includes(chain.id);
        const stage = done ? chain.stages.length : active?.stage ?? 0;
        return (
          <div key={chain.id} className={`card ${done ? '' : 'chain'}`}>
            <div className="spread">
              <span className="card-title">{chain.name}</span>
              <span className="small muted">
                {done ? 'Completed' : `Stage ${stage + 1} of ${chain.stages.length}`}
              </span>
            </div>
            <p className="card-flavour">{chain.description}</p>
            <div className="bar" style={{ marginBottom: 6 }}>
              <span style={{ width: `${(stage / chain.stages.length) * 100}%` }} />
            </div>
            <div className="tiny muted">
              Requires level {chain.reqLevel} · Completion reward {formatGold(chain.rewardGold)} gold,
              {' '}{chain.rewardRenown} renown, and unique gear
              {active && active.failedStages > 0 ? ` · ${active.failedStages} failed attempts` : ''}
            </div>
            <div className="tiny muted" style={{ marginTop: 4 }}>
              {CHAIN_BY_ID[chain.id].stages.map((s, i) => (
                <span key={s.name} style={{ marginRight: 8, color: i < stage ? 'var(--moss)' : undefined }}>
                  {i < stage ? '✔' : '·'} {s.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
