import { useState } from 'react';
import { useEngine } from '../useEngine';
import { AchievementManager } from '../../game/managers/AchievementManager';
import { formatGold, formatPlayTime } from '../../game/util';
import { ConfirmModal } from '../ConfirmModal';

export function StatsPanel() {
  const engine = useEngine();
  const stats = engine.state.stats;
  const successRate = stats.totalQuests > 0
    ? `${Math.round((stats.successes / stats.totalQuests) * 100)}%`
    : '—';
  const achProgress = AchievementManager.progress(engine.state);
  // Both previously native `window.alert()`/`window.confirm()` calls --
  // unstyled OS dialogs, out of place next to every other prompt in the
  // game already routed through ConfirmModal (Recall, sell confirmations).
  // See guild-idler-status.md's polish-pass entry for the full writeup.
  const [saveLocationMessage, setSaveLocationMessage] = useState<string | null>(null);
  const [pendingHardReset, setPendingHardReset] = useState(false);

  const rows: [string, string][] = [
    ['Total quests', stats.totalQuests.toLocaleString()],
    ['Successes', stats.successes.toLocaleString()],
    ['Failures', stats.failures.toLocaleString()],
    ['Success rate', successRate],
    ['Gold earned', formatGold(stats.goldEarned)],
    ['Gold spent', formatGold(stats.goldSpent)],
    ['Highest single reward', formatGold(stats.highestReward)],
    ['Items found', stats.itemsFound.toLocaleString()],
    ['Legendary items found', stats.legendaryItemsFound.toLocaleString()],
    ['Injuries suffered', stats.injuriesSuffered.toLocaleString()],
    ['Items broken', stats.itemsBroken.toLocaleString()],
    ['Quest chains completed', stats.chainsCompleted.toLocaleString()],
    ['Total play time', formatPlayTime(stats.playTimeMs)],
    ['Total offline time', formatPlayTime(stats.offlineTimeMs)],
    ['Retirements', stats.prestigeCount.toLocaleString()],
    ['Guild founded', new Date(stats.firstPlayedAt).toLocaleDateString()],
  ];

  return (
    <>
      <h2>Statistics</h2>
      <p className="subtitle">Everything the guild scribe has bothered to write down.</p>

      <div className="section-heading">Achievements ({achProgress.unlocked}/{achProgress.total})</div>
      <div className="grid three" style={{ marginBottom: 8 }}>
        {AchievementManager.list().map((def) => {
          const unlockedAt = engine.state.unlockedAchievements[def.id];
          const unlocked = unlockedAt !== undefined;
          const showHidden = def.hidden && !unlocked;
          return (
            <div key={def.id} className={`card achievement-card ${unlocked ? 'unlocked' : ''}`} style={{ marginBottom: 0 }}>
              <div className="card-title" style={{ fontSize: 11 }}>
                {unlocked ? '🏆' : '🔒'} {showHidden ? '???' : def.name}
              </div>
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                {showHidden ? 'Hidden until unlocked.' : def.description}
              </p>
              {unlocked && (
                <p className="tiny" style={{ margin: '4px 0 0', color: 'var(--brass)' }}>
                  {new Date(unlockedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid two">
        {rows.map(([label, value]) => (
          <div key={label} className="spread card" style={{ marginBottom: 0 }}>
            <span className="small muted">{label}</span>
            <b className="small">{value}</b>
          </div>
        ))}
      </div>

      <div className="section-heading">Recent quests</div>
      {engine.state.log.length === 0 && <p className="small muted">No quests yet. The board is waiting.</p>}
      {engine.state.log.slice(0, 20).map((result) => (
        <div key={result.questId} className={`card ${result.difficulty}`}>
          <div className="spread">
            <span className="card-title">{result.questName}</span>
            <span className={`small ${result.success ? 'good' : 'bad'}`}>
              {result.success ? 'Success' : 'Failed'}
            </span>
          </div>
          <div className="stat-row" style={{ marginTop: 4 }}>
            <span>{result.heroName}</span>
            <span className="gold-text">+{formatGold(result.gold)}</span>
            <span>+{result.xp} xp</span>
            {result.loot.map((l) => <span key={l.defId}>◇ {l.name}</span>)}
            {result.injury && <span className="bad">{result.injury.name}</span>}
            <span className="muted">{new Date(result.resolvedAt).toLocaleString()}</span>
          </div>
        </div>
      ))}

      <div className="section-heading">Save data</div>
      <div className="row wrap">
        <button onClick={() => void engine.saveNow()}>Save now</button>
        <button
          onClick={async () => {
            const folder = await window.littleKnight?.saveFolder();
            engine.clearToast();
            setSaveLocationMessage(folder ? `Save file lives in:\n${folder}` : 'Running in a browser: the save is in localStorage.');
          }}
        >
          Where is my save?
        </button>
        <button
          className="btn-danger"
          onClick={() => setPendingHardReset(true)}
        >
          Start a new guild
        </button>
      </div>

      {saveLocationMessage && (
        <ConfirmModal
          title="Where is my save?"
          message={saveLocationMessage}
          infoOnly
          onConfirm={() => setSaveLocationMessage(null)}
          onCancel={() => setSaveLocationMessage(null)}
        />
      )}
      {pendingHardReset && (
        <ConfirmModal
          title="Start a new guild"
          message="Delete this guild and start over? This cannot be undone."
          confirmLabel="Delete & start over"
          danger
          onConfirm={() => { engine.hardReset(); setPendingHardReset(false); }}
          onCancel={() => setPendingHardReset(false)}
        />
      )}
    </>
  );
}
