import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { PeddlerManager } from '../../game/managers/PeddlerManager';
import { formatGold, formatDuration } from '../../game/util';
import { PeddlerCardModal } from '../PeddlerCardModal';
import { PeddlerDiceModal } from '../PeddlerDiceModal';
import { PeddlerTabModal } from '../PeddlerTabModal';
import { ReputationRing } from '../ReputationRing';
import { vendorRepLevel, vendorRepPercent } from '../../game/data/vendorRep';

/**
 * Grimsby tab redesign -- Claude Design handoff, direct request. The
 * card-per-vendor-sprite shape VendorsPanel's own cards use (see the
 * pre-redesign version of this file, still the shape every other vendor
 * page follows) put the SAME animated GrimsbySprite on four separate
 * cards in a row, which read as one screenshot repeated four times once
 * Grimsby had four separate games/upgrades instead of one. Fixed here by
 * dropping the sprite from every card on this tab entirely -- Grimsby
 * still appears, animated, inside each game's own modal (PeddlerCardModal/
 * PeddlerDiceModal/PeddlerTabModal all keep their own GrimsbySprite
 * untouched) -- and replacing the four vendor-cards with one ruled,
 * numbered game grid instead. Every engine call, guard, and piece of
 * copy below is identical to what the old version had; only the chrome
 * around them changed.
 */
export function PeddlerPanel() {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(1000);
  const [openModal, setOpenModal] = useState<'none' | 'regular' | 'highRoller' | 'dice' | 'tab'>('none');
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
  const highRollerMultiplier = PeddlerManager.highRollerMultiplier();
  const highRollerUnlockCost = PeddlerManager.highRollerUnlockCost();
  const canAffordHighRollerUnlock = PeddlerManager.canUnlockHighRoller(state);

  const permanentSpotUnlocked = state.grimsbyPermanentSpotUnlocked;
  const permanentSpotCost = PeddlerManager.permanentSpotUnlockCost();
  const canAffordPermanentSpot = PeddlerManager.canUnlockPermanentSpot(state);

  const repLevel = vendorRepLevel(state.stats.peddlerGoldSpent);
  const repPercent = vendorRepPercent(state.stats.peddlerGoldSpent);

  const leavesIn = present && !permanentSpotUnlocked
    ? formatDuration(Math.max(0, (state.grimsbyLeavesAt ?? now) - now))
    : null;

  return (
    <>
      <div className="grimsby-header-row">
        <div>
          <div className="grimsby-kicker">Guild Hall / Vendors</div>
          <h2 style={{ margin: 0 }}>Grimsby</h2>
        </div>
        <p className="subtitle grimsby-header-subtitle">
          A cart, a cart, and absolutely nothing more, according to him. A card, a die, or -- once he's
          settled in -- a running tab: pay your way in, see what happens. He swears the odds are fair.
          He would say that either way.
        </p>
      </div>

      <div className="grimsby-status-strip">
        <div className="grimsby-status-cell">
          <div className="grimsby-status-label">Status</div>
          <div className="grimsby-status-value">
            <span className={`grimsby-status-dot ${present ? 'on' : ''}`} />
            {permanentSpotUnlocked ? 'Permanent spot' : present ? 'Cart is here' : 'Cart is gone'}
          </div>
        </div>
        <div className="grimsby-status-cell">
          <div className="grimsby-status-label">Leaves in</div>
          <div className="grimsby-status-value">
            {permanentSpotUnlocked ? 'Never' : leavesIn ?? '\u2014'}
          </div>
        </div>
        <div className="grimsby-status-cell">
          <div className="grimsby-status-label">Gold on hand</div>
          <div className="grimsby-status-value">{'\u25c6'} {formatGold(state.gold)}</div>
        </div>
        <div className="grimsby-status-cell">
          <div className="grimsby-status-label">Vendor rep</div>
          <div className="grimsby-status-value grimsby-status-rep">
            <ReputationRing goldSpent={state.stats.peddlerGoldSpent} size={18} />
            Level {repLevel} <span className="grimsby-status-rep-detail">{'\u00b7'} {repPercent}% back</span>
          </div>
        </div>
      </div>

      <div className="grimsby-game-grid">
        {/* 01 / CARDS -- unchanged mechanic (PeddlerCardModal), just no
            longer sharing a card with the High Roller button below. */}
        <div className="grimsby-game-card">
          <div className="grimsby-game-card-header">
            <span className="grimsby-game-card-index">01 / CARDS</span>
            <span className="grimsby-game-card-state" style={{ color: present ? 'var(--moss)' : 'var(--muted)' }}>
              {present ? 'Open' : 'Locked'}
            </span>
          </div>
          <div className="grimsby-game-card-title">Pick Your Card</div>
          <p className="card-flavour grimsby-game-card-flavour">
            "Well? Card's a card. Fair chance, for a fair price."
          </p>
          <div className="grimsby-game-stats">
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Fee</div>
              <div className="grimsby-game-stat-value" style={{ color: 'var(--brass)' }}>{formatGold(fee)} g</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Outcomes</div>
              <div className="grimsby-game-stat-value">5 tiers</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Stakes</div>
              <div className="grimsby-game-stat-value">1x {'\u2013'} 5x</div>
            </div>
          </div>
          <div className="grimsby-game-card-actions">
            {present && (
              <div className="row wrap" style={{ gap: 4, alignItems: 'center' }}>
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
            )}
            <button
              className="btn-purple"
              disabled={!present || !canAfford}
              onClick={() => setOpenModal('regular')}
              title={!present ? 'He\u2019s not here right now' : canAfford ? undefined : 'Not enough gold'}
            >
              Pick Your Card -- {formatGold(fee)} gold
            </button>
            {!present && charmCount > 0 && (
              <button onClick={() => engine.usePeddlerCharm('beckoning_charm')}>
                Use a Beckoning Charm ({charmCount})
              </button>
            )}
          </div>
        </div>

        {/* 02 / DICE -- own card, own flavour, no stake selector of its
            own (the wager amount already IS the stake, entered freely
            inside the modal). Uses PeddlerDiceModal, unchanged. */}
        <div className="grimsby-game-card">
          <div className="grimsby-game-card-header">
            <span className="grimsby-game-card-index">02 / DICE</span>
            <span className="grimsby-game-card-state" style={{ color: present ? 'var(--moss)' : 'var(--muted)' }}>
              {present ? 'Open' : 'Locked'}
            </span>
          </div>
          <div className="grimsby-game-card-title">Grimsby's Dice</div>
          <p className="card-flavour grimsby-game-card-flavour">
            "Dice don't care who you are. Call your number, back it with gold, see where it lands."
          </p>
          <div className="grimsby-game-stats">
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Buy-in</div>
              <div className="grimsby-game-stat-value">Your wager</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Games</div>
              <div className="grimsby-game-stat-value">2</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Top payout</div>
              <div className="grimsby-game-stat-value" style={{ color: 'var(--brass)' }}>3x</div>
            </div>
          </div>
          <div className="grimsby-game-card-actions">
            <button
              className="btn-green"
              disabled={!present}
              onClick={() => setOpenModal('dice')}
              title={present ? 'A gold-only wager against the dice.' : 'No cart, no dice -- he brings both or neither.'}
            >
              Roll the Dice
            </button>
          </div>
        </div>

        {/* 03 / THE TAB -- gated behind Permanent Spot; locked-card
            treatment (see .grimsby-game-card.locked below) until then,
            same skeleton as the unlocked state either way. */}
        <div className={`grimsby-game-card ${permanentSpotUnlocked ? '' : 'locked'}`}>
          <div className="grimsby-game-card-header">
            <span className="grimsby-game-card-index">03 / THE TAB</span>
            <span
              className="grimsby-game-card-state"
              style={{ color: !permanentSpotUnlocked ? 'var(--muted)' : state.peddlerTab ? 'var(--brass)' : present ? 'var(--moss)' : 'var(--muted)' }}
            >
              {!permanentSpotUnlocked ? 'Locked' : state.peddlerTab ? 'Tab open' : present ? 'Open' : 'Locked'}
            </span>
          </div>
          <div className="grimsby-game-card-title">The Tab</div>
          <p className="card-flavour grimsby-game-card-flavour">
            {permanentSpotUnlocked
              ? (state.peddlerTab
                ? `A tab's open -- ${formatGold(state.peddlerTab.value)} gold on it so far.`
                : '"Open a tab. Push it as far as you like. Just don\'t expect me to forget what you owe."')
              : 'Only for a regular with a permanent spot -- see below.'}
          </p>
          <div className="grimsby-game-stats">
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Tiers</div>
              <div className="grimsby-game-stat-value">{PeddlerManager.tabTierCount()}</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">On the tab</div>
              <div className="grimsby-game-stat-value" style={{ color: 'var(--brass)' }}>
                {state.peddlerTab ? `${formatGold(state.peddlerTab.value)} g` : '\u2014'}
              </div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">A bad push</div>
              <div className="grimsby-game-stat-value" style={{ color: 'var(--blood)' }}>Wipes it</div>
            </div>
          </div>
          {permanentSpotUnlocked && (
            <div className="grimsby-game-card-actions">
              <button
                className="btn-purple"
                onClick={() => setOpenModal('tab')}
                title="A repeating push-your-luck wager -- push further for more, or settle and walk away."
              >
                {state.peddlerTab ? 'Back to the tab' : 'Open a tab'}
              </button>
            </div>
          )}
        </div>

        {/* 04 / HIGH ROLLER -- folded into the grid: locked-card
            treatment + the "Unlock -- N gold" purchase action before
            grimsbyHighRollerUnlocked, the actual "High Roller -- fee"
            play action (same PeddlerCardModal, highRoller=true) after.
            Previously two separate elements (a standalone locked-upgrade
            card for the purchase, a second button crammed onto the Cards
            card for play) -- now one card that just changes state. */}
        <div className={`grimsby-game-card ${highRollerUnlocked ? '' : 'locked'}`}>
          <div className="grimsby-game-card-header">
            <span className="grimsby-game-card-index">04 / HIGH ROLLER</span>
            <span
              className="grimsby-game-card-state"
              style={{ color: !highRollerUnlocked ? 'var(--muted)' : present ? 'var(--moss)' : 'var(--muted)' }}
            >
              {!highRollerUnlocked ? 'Locked' : present ? 'Open' : 'Locked'}
            </span>
          </div>
          <div className="grimsby-game-card-title">High Roller</div>
          <p className="card-flavour grimsby-game-card-flavour">
            {highRollerUnlocked
              ? '"Ah, the good stuff. Same cart, same cards. Just... more feeling behind the flip, isn\u2019t there?"'
              : <>He's noticed you've got the goods now. Same cards, same odds -- {highRollerMultiplier}x the fee, {highRollerMultiplier}x the payout.</>}
          </p>
          <div className="grimsby-game-stats">
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Unlock</div>
              <div className="grimsby-game-stat-value" style={{ color: 'var(--brass)' }}>{formatGold(highRollerUnlockCost)} g</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">One-time</div>
              <div className="grimsby-game-stat-value">Permanent</div>
            </div>
            <div className="grimsby-game-stat">
              <div className="grimsby-status-label">Affects</div>
              <div className="grimsby-game-stat-value">Cards, dice</div>
            </div>
          </div>
          <div className="grimsby-game-card-actions">
            {highRollerUnlocked ? (
              <button
                className="btn-yellow"
                disabled={!present || !canAffordHighRoller}
                onClick={() => setOpenModal('highRoller')}
                title={!present ? 'He\u2019s not here right now' : canAffordHighRoller ? 'Same cards, bigger stakes.' : 'Not enough gold'}
              >
                High Roller -- {formatGold(highRollerFee)} gold
              </button>
            ) : (
              <button
                className="btn-yellow"
                disabled={!canAffordHighRollerUnlock}
                onClick={() => engine.unlockHighRoller()}
                title={canAffordHighRollerUnlock ? undefined : 'Not enough gold'}
              >
                Unlock -- {formatGold(highRollerUnlockCost)} gold
              </button>
            )}
          </div>
        </div>
      </div>

      {(openModal === 'regular' || openModal === 'highRoller') && (
        <PeddlerCardModal highRoller={openModal === 'highRoller'} stake={stake} onClose={() => setOpenModal('none')} />
      )}
      {openModal === 'dice' && (
        <PeddlerDiceModal onClose={() => setOpenModal('none')} />
      )}
      {openModal === 'tab' && (
        <PeddlerTabModal onClose={() => setOpenModal('none')} />
      )}

      {/* "A Permanent Spot" -- patch 0220, direct request. Not one of the
          four game cards above (the grid is deliberately exactly four),
          stays its own upsell below the grid, same .locked-upgrade shape
          it's always had -- once bought, this card is gone for good; The
          Tab card above (no longer locked) is the only remaining trace
          of it. */}
      {!permanentSpotUnlocked && (
        <div className="card locked-upgrade" style={{ marginTop: 12 }}>
          <div className="card-title">A Permanent Spot</div>
          <p className="card-flavour muted">
            He's tired of hauling that cart in and out of town. Buy him a real spot, and he stays for good.
          </p>
          <button
            className="btn-primary"
            disabled={!canAffordPermanentSpot}
            onClick={() => engine.unlockGrimsbyPermanentSpot()}
            title={canAffordPermanentSpot ? undefined : 'Not enough gold'}
          >
            Unlock -- {formatGold(permanentSpotCost)} gold
          </button>
        </div>
      )}
    </>
  );
}
