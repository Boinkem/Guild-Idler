import { useEffect } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { formatDuration, formatGold } from '../game/util';

/**
 * Summarises everything that happened while the app was closed.
 *
 * Always mounted regardless of view mode (see App.tsx) so the auto-dismiss
 * effect below keeps running even while the idle companion is what's
 * showing -- but only actually renders its full-detail content when
 * `active` (i.e. the menu window, properly sized, is open). Showing this
 * full report cropped inside the tiny idle-companion window was the
 * original bug; IdleView now shows a compact banner instead and opens the
 * menu on click, which is what makes `active` true.
 */
export function OfflineReportModal({ active }: { active: boolean }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const report = engine.offlineReport;

  // If the player turned the summary off, still collect the rewards (the engine
  // already applied them) but skip the interruption.
  useEffect(() => {
    if (report && !settings.offlineReportOnLaunch) engine.dismissOfflineReport();
  }, [report, settings.offlineReportOnLaunch, engine]);

  if (!active || !report || !settings.offlineReportOnLaunch) return null;

  return (
    <div className="overlay">
      <div className="modal">
        <h3>While you were away</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          The guild ran for {formatDuration(report.elapsedMs)} without you.
        </p>

        {report.results.length === 0 ? (
          <p className="small">Nothing finished in that time. Everyone is still on the road or waiting for orders.</p>
        ) : (
          <>
            <div className="stat-row" style={{ marginBottom: 10 }}>
              <span className="gold-text">+{formatGold(report.goldGained)} gold</span>
              <span>+{report.xpGained} experience</span>
              <span>{report.results.length} quests resolved</span>
            </div>
            {report.results.map((result) => (
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
                </div>
              </div>
            ))}
          </>
        )}

        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={() => engine.dismissOfflineReport()}>Back to work</button>
        </div>
      </div>
    </div>
  );
}
