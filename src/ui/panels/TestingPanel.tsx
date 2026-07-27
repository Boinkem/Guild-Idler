import { useEngine } from '../useEngine';
import { formatGold, formatDuration } from '../../game/util';

const HOUR = 3600000;

export function TestingPanel() {
  const engine = useEngine();
  const state = engine.state;
  const questing = state.heroes.filter((h) => h.status === 'questing');

  return (
    <>
      <h2>Testing Tools</h2>
      <p className="subtitle" style={{ color: 'var(--brass)' }}>
        Not part of the real game. Set TESTING_TOOLS_ENABLED to false in src/game/testingTools.ts
        before any build that isn't going to a tester.
      </p>

      <div className="section-heading">Skip time</div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Runs the real offline catch-up (including Auto-Chain) as if this much time had actually
        passed — not a free-win button, just not waiting for the clock.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => engine.testSkipTime(HOUR)}>+1 hour</button>
        <button onClick={() => engine.testSkipTime(24 * HOUR)}>+1 day</button>
        <button onClick={() => engine.testSkipTime(7 * 24 * HOUR)}>+1 week</button>
        <button onClick={() => engine.testSkipTime(30 * 24 * HOUR)}>+1 month</button>
      </div>

      <div className="section-heading">Gold</div>
      <div className="row" style={{ gap: 8 }}>
        <button onClick={() => engine.testAddGold(1000)}>+1,000</button>
        <button onClick={() => engine.testAddGold(10000)}>+10,000</button>
        <button onClick={() => engine.testAddGold(100000)}>+100,000</button>
      </div>

      <div className="section-heading">Complete a quest now</div>
      {questing.length === 0 && <p className="small muted">No heroes currently questing.</p>}
      {questing.map((hero) => {
        const quest = state.activeQuests.find((q) => q.heroId === hero.id);
        return (
          <div key={hero.id} className="spread card" style={{ marginBottom: 8 }}>
            <div>
              <div className="card-title">{hero.name}</div>
              <div className="tiny muted">
                {quest?.offer.name} — {quest ? formatDuration(quest.endsAt - Date.now()) : '?'} left
              </div>
            </div>
            <button className="btn-primary" onClick={() => engine.testCompleteActiveQuest(hero.id)}>
              Complete now
            </button>
          </div>
        );
      })}

      <div className="section-heading">Current state</div>
      <p className="small muted">
        Gold: {formatGold(state.gold)} · Renown: {state.renown} · Prestige streak: {state.prestigeStreak}
      </p>
    </>
  );
}
