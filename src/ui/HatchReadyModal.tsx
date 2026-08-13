import { useEngine } from './useEngine';

/**
 * Shown whenever state.pendingHatchReadyNotice is true -- same "gated on
 * active, IdleView shows a compact banner instead" treatment
 * ChainCompleteModal/RaidResultModal already use, since a quest resolving
 * (and pushing an egg over its threshold) can happen while the player is
 * sitting in either view. Doesn't say which egg or how many -- see the
 * flag's own doc comment on GameState; the Nests tab marks each ready card
 * individually once they get there.
 */
export function HatchReadyModal({ active, onView }: { active: boolean; onView: () => void }) {
  const engine = useEngine();
  if (!active || !engine.state.pendingHatchReadyNotice) return null;

  const goToHatchery = () => {
    engine.requestTab('hatchery');
    onView();
    engine.dismissHatchReadyNotice();
  };

  return (
    <div className="overlay" onClick={() => engine.dismissHatchReadyNotice()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>An Egg is Ready!</h3>
        <p className="small" style={{ marginTop: 0 }}>
          One of your incubating eggs has grown enough to hatch. Head to the Hatchery's Nests
          tab and open it to see what came out.
        </p>
        <div className="row end" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn-primary" onClick={() => engine.dismissHatchReadyNotice()}>Close</button>
          <button className="btn-primary" onClick={goToHatchery}>Go to Hatchery</button>
        </div>
      </div>
    </div>
  );
}
