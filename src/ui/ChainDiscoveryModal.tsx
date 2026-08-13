/**
 * The scripted tour's actual finale, even though it isn't one of its fixed
 * steps -- this fires whenever the board first rolls a quest chain, which
 * could be immediately or much later depending on what the board happens
 * to generate. Kept as a plain standalone modal rather than another
 * spotlight step: the target (a specific quest-board card) is dynamic and
 * might not even be rendered if the player isn't currently on the Quests
 * tab, unlike the tour's fixed nav-tab targets.
 */
export function ChainDiscoveryModal({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>A Quest Chain Awaits</h3>
        <p className="small" style={{ marginTop: 0 }}>
          You've discovered a quest chain -- a story that unfolds across several stages, shown right on
          the Quest Board alongside everything else. Complete one stage, and the next becomes available.
        </p>
        <div className="row end" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={onView}>View on Quest Board</button>
        </div>
      </div>
    </div>
  );
}
