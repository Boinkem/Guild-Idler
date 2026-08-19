import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { PeddlerManager } from '../../game/managers/PeddlerManager';
import { formatGold, formatDuration } from '../../game/util';
import { GrimsbySprite } from '../sprites/GrimsbySprite';
import { PeddlerCardModal } from '../PeddlerCardModal';

/**
 * Same "vendor-card" presentation the Blacksmith/Alchemist/Enchanter
 * already use (VendorsPanel.tsx) -- sprite + name on a dark card,
 * blurb, action button -- rather than a bespoke full-scene background.
 * The actual card game lives in its own modal (PeddlerCardModal), same
 * "tab is a plain destination, the special moment is its own overlay"
 * shape CraftingStation/EnhanceStation etc. already use from each
 * vendor's own page. peddler-bg.png stays as the tab's faded backdrop
 * (wired at the MenuWindow level, same as hatchery-bg.jpg/raids-bg.jpg)
 * -- it doesn't also need to be a bold foreground element here too.
 */
export function PeddlerPanel() {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(1000);
  const [openModal, setOpenModal] = useState<'none' | 'regular' | 'highRoller'>('none');
  // Stake multiplier -- a player-chosen multiplier on top of whichever
  // fee this already is (regular or High Roller), for a proportionally
  // bigger reward. One shared control for both, per direct request
  // ("same with the high roller function"), rather than two independent
  // pickers -- see PeddlerManager.STAKE_OPTIONS/resolveFlip's own comment
  // for how the two multiply together. Local UI state, not persisted --
  // same "picked fresh each visit" shape junkRarity (EquipmentPanel) uses
  // for its own transient selector.
  const [stake, setStake] = useState<number>(1);

  const present = PeddlerManager.isPresent(state);
  const fee = PeddlerManager.feeWithStake(state, false, stake);
  const canAfford = state.gold >= fee;
  const charmCount = state.inventory.beckoning_charm ?? 0;

  const highRollerUnlocked = state.grimsbyHighRollerUnlocked;
  const highRollerFee = PeddlerManager.feeWithStake(state, true, stake);
  const canAffordHighRoller = state.gold >= highRollerFee;
  const multiplier = PeddlerManager.highRollerMultiplier();
  const unlockCost = PeddlerManager.highRollerUnlockCost();
  const canAffordUnlock = PeddlerManager.canUnlockHighRoller(state);

  return (
    <>
      <h2>Grimsby</h2>
      <p className="subtitle">
        A cart, a cart, and absolutely nothing more, according to him. Pay for a card, pick one, see what
        happens -- he swears the odds are fair. He would say that either way.
      </p>

      <div className="card vendor-card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <GrimsbySprite animation="idle" height={144} />
          <div style={{ flex: 1 }}>
            <div className="spread">
              <span className="card-title">Grimsby</span>
              {present && (
                <span className="tiny muted">
                  {formatDuration(Math.max(0, (state.grimsbyLeavesAt ?? now) - now))} left
                </span>
              )}
            </div>

            {present ? (
              <>
                <p className="card-flavour">
                  "Well? Card's a card. Fair chance, for a fair price."
                </p>
                {/* Stake selector -- raises the fee (and the eventual
                    reward) for BOTH buttons below at once, see this
                    component's own `stake` state comment above. */}
                <div className="row wrap" style={{ gap: 4, alignItems: 'center', marginBottom: 6 }}>
                  <span className="tiny muted">Stakes</span>
                  {PeddlerManager.STAKE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className={`chip ${stake === s ? 'on' : ''}`}
                      onClick={() => setStake(s)}
                      title={s === 1 ? 'Standard fee and payout' : `${s}x the fee, for ${s}x the payout`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button
                    className="btn-purple"
                    disabled={!canAfford}
                    onClick={() => setOpenModal('regular')}
                    title={canAfford ? undefined : 'Not enough gold'}
                  >
                    Pick Your Card -- {formatGold(fee)} gold
                  </button>
                  {highRollerUnlocked && (
                    <button
                      className="btn-primary"
                      disabled={!canAffordHighRoller}
                      onClick={() => setOpenModal('highRoller')}
                      title={canAffordHighRoller ? 'Same cards, bigger stakes.' : 'Not enough gold'}
                    >
                      High Roller -- {formatGold(highRollerFee)} gold
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="card-flavour muted">
                  The cart's not here right now. He turns up unannounced, every so often, and doesn't
                  stick around long once he does.
                </p>
                {charmCount > 0 && (
                  <button onClick={() => engine.usePeddlerCharm('beckoning_charm')}>
                    Use a Beckoning Charm ({charmCount})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Permanent, one-time unlock -- not tied to whether he's actually
          here right now, same "buy it whenever, use it on the next
          visit" shape a vendor upgrade already has. Once bought, this
          card is gone for good; the second button above is the only
          remaining trace of it. */}
      {!highRollerUnlocked && (
        <div className="card locked-upgrade">
          <div className="card-title">High Roller</div>
          <p className="card-flavour muted">
            He's noticed you've got the goods now. Same cards, same odds --
            {' '}{multiplier}x the fee, {multiplier}x the payout.
          </p>
          <button
            className="btn-primary"
            disabled={!canAffordUnlock}
            onClick={() => engine.unlockHighRoller()}
            title={canAffordUnlock ? undefined : 'Not enough gold'}
          >
            Unlock -- {formatGold(unlockCost)} gold
          </button>
        </div>
      )}

      {openModal !== 'none' && (
        <PeddlerCardModal highRoller={openModal === 'highRoller'} stake={stake} onClose={() => setOpenModal('none')} />
      )}
    </>
  );
}
