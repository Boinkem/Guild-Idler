import { useState } from 'react';
import { useEngine } from './useEngine';
import { formatGold, formatNumber } from './../game/util';
import { Tuning } from '../game/data/tuning';

/**
 * "Fund the Guild" -- patch 0220, direct request. An open-ended, uncapped
 * gold sink: enter any amount, donate it, watch the lifetime total (and
 * the small Guild Power bonus it buys) tick up. No catalog, no max level --
 * see GuildManager.donateToGuild/power.ts's own comments for the full
 * reasoning on why the curve is sqrt rather than linear.
 *
 * Same overlay/modal/background-scene shape PeddlerDiceModal already uses
 * for Grimsby's own table -- a `.fund-guild-scene` div with its own
 * background-image sits behind the form, ready for whatever art gets
 * dropped in at `./lore/guild-hall/fund-guild.jpg` later (falls back to a
 * plain dark panel until then, same "renders once present, silently
 * absent until then" convention every other not-yet-illustrated spot in
 * this game already follows -- nothing here is blocked on that file
 * existing). Deliberately background-size: cover rather than the exact-
 * ratio treatment CraftingStation's own scenes use -- this has no painted
 * hit-targets that need to land on specific pixels, just a form floating
 * over art, so it doesn't need to know the art's exact dimensions ahead
 * of time.
 *
 * Stays open after a successful donation (same "another round without
 * re-opening" shape PeddlerDiceModal's own die already has) rather than
 * closing automatically -- funding the guild is exactly the kind of
 * repeatable action a player might do several times in a row.
 */
export function FundGuildModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [amountText, setAmountText] = useState('');
  const [justDonated, setJustDonated] = useState<number | null>(null);

  const weight = Tuning.get('treasury.donationPowerWeight');
  const powerFor = (total: number) => Math.floor(weight * Math.sqrt(total));

  const amount = Math.floor(Number(amountText));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const canAfford = validAmount && state.gold >= amount;

  const currentPower = powerFor(state.guildDonationsTotal);
  const previewPower = validAmount ? powerFor(state.guildDonationsTotal + amount) : currentPower;
  const previewGain = previewPower - currentPower;

  const setMax = () => setAmountText(String(state.gold));

  const handleFund = () => {
    if (!canAfford) return;
    const donated = engine.donateToGuild(amount);
    if (donated) {
      setJustDonated(donated);
      setAmountText('');
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal fund-guild-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fund-guild-scene" style={{ backgroundImage: 'url(./lore/guild-hall/fund-guild.jpg)' }}>
          <div className="fund-guild-content">
            <div className="card-title">Fund the Guild</div>
            <p className="tiny muted" style={{ marginBottom: 10 }}>
              Every gold given adds to the guild's standing -- a small, permanent sliver of Guild Power, forever.
            </p>

            <div className="row wrap" style={{ gap: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <input
                type="number"
                min={1}
                max={state.gold}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="Gold"
                autoFocus
                style={{
                  width: 130, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                  color: 'var(--parchment)', padding: '6px 10px', fontSize: '0.875rem', textAlign: 'center',
                }}
              />
              <button type="button" className="btn-ghost" onClick={setMax} style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}>
                Max
              </button>
            </div>

            <p className="tiny muted" style={{ marginBottom: 12 }}>◆ {formatGold(state.gold)} on hand</p>

            <button
              className="btn-primary"
              disabled={!canAfford}
              onClick={handleFund}
              title={canAfford ? undefined : 'Enter an amount you can afford'}
            >
              Fund Power{validAmount ? ` -- +${previewGain} Power` : ''}
            </button>

            {justDonated !== null && (
              <p className="tiny" style={{ marginTop: 10, color: 'var(--brass)' }}>
                Donated {formatGold(justDonated)} gold. Lifetime total: {formatNumber(state.guildDonationsTotal)} gold
                {' '}-- {currentPower} Power from Donations.
              </p>
            )}
          </div>
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
