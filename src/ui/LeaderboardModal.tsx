import { useState, useEffect } from 'react';
import { useEngine } from './useEngine';
import { formatNumber } from '../game/util';
import { fetchLeaderboard, LEADERBOARD_READY, LeaderboardEntry, LeaderboardScope } from '../game/leaderboard';

/**
 * Steam leaderboards UI -- patch 0363's shell, patch 0382's real data.
 * Design locked in guild-idler-status.md: Global + Friends, tracking
 * Guild Power. `fetchLeaderboard` is async now (a real Steam round trip
 * when available) -- loading/refetch-on-scope-change handled here with
 * a plain useState/useEffect pair, same pattern any other async-data
 * panel in this codebase already uses. Falls back to the same "just
 * your own row" preview whenever Steam can't answer, indistinguishable
 * from patch 0363's own placeholder except that it's now the real
 * fallback path, not the only path.
 *
 * Same overlay/modal shape FundGuildModal already uses.
 */
export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard(state, scope).then((result) => {
      if (!cancelled) {
        setEntries(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

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
          {loading ? (
            <p className="tiny muted" style={{ margin: 0 }}>Loading...</p>
          ) : entries.length === 0 ? (
            <p className="tiny muted" style={{ margin: 0 }}>No entries yet.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={`${entry.rank}-${entry.name}`}
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
