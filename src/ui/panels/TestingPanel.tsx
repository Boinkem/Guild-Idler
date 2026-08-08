import { useState } from 'react';
import { useEngine } from '../useEngine';
import { formatGold, formatDuration, RARITY_ORDER } from '../../game/util';
import { PETS } from '../../game/data/pets';

const HOUR = 3600000;

export function TestingPanel() {
  const engine = useEngine();
  const state = engine.state;
  const questing = state.heroes.filter((h) => h.status === 'questing');
  const injured = state.heroes.filter((h) => h.injuries.length > 0);
  const [levelTarget, setLevelTarget] = useState<Record<string, string>>({});

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
        passed — not a free-win button, just not waiting for the clock. Without Auto-Chain, a hero
        only resolves whatever they were already questing, exactly like real play.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => engine.testSkipTime(HOUR)}>+1 hour</button>
        <button onClick={() => engine.testSkipTime(24 * HOUR)}>+1 day</button>
        <button onClick={() => engine.testSkipTime(7 * 24 * HOUR)}>+1 week</button>
        <button onClick={() => engine.testSkipTime(30 * 24 * HOUR)}>+1 month</button>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        Skips now force a board refresh automatically. Use this on its own if Auto-Chain has
        emptied the board and you don't want to skip more time to restock it.
      </p>
      <button style={{ marginTop: 4 }} onClick={() => engine.testRefreshBoard()}>Refresh quest board now</button>

      <div className="section-heading">Currency</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => engine.testAddGold(1000)}>+1,000 gold</button>
        <button onClick={() => engine.testAddGold(10000)}>+10,000 gold</button>
        <button onClick={() => engine.testAddGold(100000)}>+100,000 gold</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={() => engine.testAddRenown(5)}>+5 renown</button>
        <button onClick={() => engine.testAddRenown(50)}>+50 renown</button>
        <button onClick={() => engine.testAddRenown(500)}>+500 renown</button>
      </div>

      <div className="section-heading">Heroes</div>
      {injured.length > 0 && (
        <button style={{ marginBottom: 10 }} onClick={() => engine.testHealAllInjuries()}>
          Heal all injuries ({injured.length})
        </button>
      )}
      {state.heroes.map((hero) => (
        <div key={hero.id} className="spread card" style={{ marginBottom: 8 }}>
          <div>
            <div className="card-title">{hero.name}</div>
            <div className="tiny muted">Level {hero.level}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <input
              type="number" min={hero.level + 1} placeholder="Lv"
              value={levelTarget[hero.id] ?? ''}
              onChange={(e) => setLevelTarget((s) => ({ ...s, [hero.id]: e.target.value }))}
              style={{ width: 56, background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--parchment)', padding: '4px 6px' }}
            />
            <button
              onClick={() => {
                const target = parseInt(levelTarget[hero.id] ?? '', 10);
                if (target > hero.level) engine.testSetHeroLevel(hero.id, target);
              }}
            >
              Set level
            </button>
          </div>
        </div>
      ))}

      <div className="section-heading">Complete a quest now</div>
      {questing.length === 0 && <p className="small muted">No heroes currently questing.</p>}
      {questing.length > 1 && (
        <button style={{ marginBottom: 8 }} onClick={() => engine.testCompleteAllActiveQuests()}>
          Complete all ({questing.length})
        </button>
      )}
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

      <div className="section-heading">Hatchery</div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        {state.hatcheryUnlocked ? 'Hatchery already unlocked.' : 'Hatchery is locked -- any button below unlocks it automatically.'}
      </p>
      <p className="tiny muted" style={{ marginBottom: 4 }}>Add an egg to storage:</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {RARITY_ORDER.map((rarity) => (
          <button key={rarity} onClick={() => engine.testAddEgg(rarity)}>+ {rarity} egg</button>
        ))}
      </div>
      <p className="tiny muted" style={{ marginBottom: 4 }}>Hatch a specific species directly (skips the egg entirely):</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {PETS.map((def) => (
          <button key={def.id} onClick={() => engine.testAddPet(def.id)}>+ {def.name}</button>
        ))}
      </div>

      <div className="section-heading">Current state</div>
      <p className="small muted">
        Gold: {formatGold(state.gold)} · Renown: {state.renown} · Prestige streak: {state.prestigeStreak}
      </p>
    </>
  );
}
