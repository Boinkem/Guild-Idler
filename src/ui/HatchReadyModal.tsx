import { useEngine } from './useEngine';
import { PetManager } from '../game/managers/PetManager';
import { RARITY_COLOR } from '../game/util';
import { EggIcon } from './EggIcon';

/**
 * Shown whenever state.pendingHatchReadyNotice is true -- same "gated on
 * active, IdleView shows a compact banner instead" treatment
 * ChainCompleteModal/RaidResultModal already use, since a quest resolving
 * (and pushing an egg over its threshold) can happen while the player is
 * sitting in either view. Doesn't say which egg or how many -- see the
 * flag's own doc comment on GameState; the Nests tab marks each ready card
 * individually once they get there.
 *
 * Patch 0424 -- the first ready egg now sits in a nest on the card,
 * wobbling and glowing its rarity colour, so it reads as "something is
 * about to happen" before the player has clicked anything.
 */
export function HatchReadyModal({ active, onView }: { active: boolean; onView: () => void }) {
  const engine = useEngine();
  if (!active || !engine.state.pendingHatchReadyNotice) return null;
  const readyEgg = engine.state.incubatingEggs.find((e) => PetManager.isReady(e));

  const goToHatchery = () => {
    engine.requestTab('hatchery');
    onView();
    engine.dismissHatchReadyNotice();
  };

  return (
    <div className="overlay" onClick={() => engine.dismissHatchReadyNotice()}>
      <div className="modal hfx-ready" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="hfx-nest-stage" style={{ color: RARITY_COLOR[readyEgg?.rarity ?? 'common'] }} aria-hidden="true">
          <span className="hfx-halo" />
          <span className="hfx-spark s1" /><span className="hfx-spark s2" /><span className="hfx-spark s3" />
          <span className="hfx-wobble"><EggIcon rarity={readyEgg?.rarity ?? 'common'} size={72} /></span>
          <span className="hfx-nest" />
        </div>
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
