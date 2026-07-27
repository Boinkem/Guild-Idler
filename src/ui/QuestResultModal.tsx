import { useEffect } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { formatGold, RARITY_COLOR } from '../game/util';

/** Shown when a quest resolves while the player is watching. */
export function QuestResultModal() {
  const engine = useEngine();
  const { settings } = useSettings();
  const result = engine.lastResult;

  useEffect(() => {
    if (result && !settings.questResultPopups) engine.dismissResult();
  }, [result, settings.questResultPopups, engine]);

  if (!result || !settings.questResultPopups) return null;

  return (
    <div className="overlay" onClick={() => engine.dismissResult()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{result.heroName} is back</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{result.questName}</p>

        <p className={result.success ? 'good' : 'bad'} style={{ fontSize: 12 }}>
          {result.success ? 'The contract is fulfilled.' : 'The contract failed.'}
        </p>

        <div className="reward-burst">
          {result.xp > 0 && <span className="burst-xp">+{result.xp} XP</span>}
          {result.gold > 0 && <span className="burst-gold">+{formatGold(result.gold)} gold</span>}
        </div>
        {result.levelsGained > 0 && <p className="good burst-levelup">Level up ×{result.levelsGained}!</p>}

        {result.loot.length > 0 && (
          <>
            <div className="section-heading">Loot</div>
            {result.loot.map((item) => (
              <div key={item.defId} style={{ color: RARITY_COLOR[item.rarity], fontSize: 11 }}>◇ {item.name}</div>
            ))}
          </>
        )}

        {result.events.length > 0 && (
          <>
            <div className="section-heading">On the road</div>
            {result.events.map((event) => (
              <div key={event.id} style={{ marginBottom: 6 }}>
                <div className={`small ${event.kind === 'positive' ? 'good' : event.kind === 'negative' ? 'bad' : ''}`}>
                  {event.name}
                </div>
                <div className="tiny muted">{event.description}</div>
              </div>
            ))}
          </>
        )}

        {(result.injury || result.brokenItems.length > 0) && (
          <>
            <div className="section-heading">Damage report</div>
            {result.injury && (
              <div className="small bad">{result.injury.name} — {result.injury.description}</div>
            )}
            {result.brokenItems.length > 0 && (
              <div className="small bad">Broken: {result.brokenItems.join(', ')}</div>
            )}
          </>
        )}

        {result.chainAdvanced && (
          <p className="small" style={{ color: 'var(--brass)' }}>
            {result.chainAdvanced.completed
              ? 'The expedition is complete. Rewards delivered to the guild.'
              : `Expedition progress: stage ${result.chainAdvanced.stage + 1} of ${result.chainAdvanced.totalStages}.`}
          </p>
        )}

        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={() => engine.dismissResult()}>Good work</button>
        </div>
      </div>
    </div>
  );
}
