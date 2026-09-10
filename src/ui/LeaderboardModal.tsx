import { useState } from 'react';
import { useEngine } from './useEngine';
import { formatNumber } from '../game/util';
import { fetchLeaderboard, LEADERBOARD_READY, LeaderboardScope } from '../game/leaderboard';

/**
 * Steam leaderboards UI shell -- patch 0363, direct request (a button
 * next to Guild Power on the Dashboard). Design locked in
 * guild-idler-status.md: Global + Friends, tracking Guild Power. No live
 * Steam connection exists yet (Steamworks SDK integration is still the
 * prerequisite -- see leaderboard.ts's own doc comment), so this renders
 * the real tab structure and the player's own row today, with a plain
 * "not live yet" notice rather than faking real rankings. Swapping in
 * DownloadLeaderboardEntries later only touches leaderboard.ts's
 * fetchLeaderboard() -- this component doesn't change.
 *
 * Same overlay/modal shape FundGuildModal already uses.
 */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [scope, setScope] = useState<LeaderboardScope>('global');

  const entries = fetchLeaderboard(state, scope);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">🏆 Leaderboard</div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>
          Ranked by Guild Power -- the same number shown on the Dashboard.
        </p>

        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <button
            type="button"
            className={scope === 'global' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setScope('global')}
          >
            Global
          </button>
          <button
            type="button"
            className={scope === 'friends' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setScope('friends')}
          >
            Friends
          </button>
        </div>

        {!LEADERBOARD_READY && (
          <p className="tiny muted" style={{ marginBottom: 10 }}>
            Steam leaderboards aren't live yet -- this is a preview of how standings will look. Only your own guild shows for now.
          </p>
        )}

        <div className="card" style={{ marginBottom: 0 }}>
          {entries.length === 0 ? (
            <p className="tiny muted" style={{ margin: 0 }}>No entries yet.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.rank}
                className="spread"
                style={{ padding: '4px 0', color: entry.isYou ? 'var(--brass)' : undefined }}
              >
                <span>#{entry.rank} {entry.name}{entry.isYou ? ' (you)' : ''}</span>
                <span>{formatNumber(entry.power)}</span>
              </div>
            ))
          )}
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
