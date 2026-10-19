import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { formatGold, formatNumber } from './../game/util';
import { Tuning } from '../game/data/tuning';
import { useCountUp } from './useCountUp';
import { flyTokens, fxMs, fxSpeed } from './purchaseFx';

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

  // Patch 0424 -- coins stream from the header gold into the coffer, its
  // lid gulps, "+N Power" rises out of it, blue sparks fly to the Power
  // figure below and the lifetime totals count up.
  const cofferRef = useRef<HTMLSpanElement>(null);
  const powerRef = useRef<HTMLElement>(null);
  const [gulp, setGulp] = useState<{ key: number; gain: number } | null>(null);
  const shownTotal = useCountUp(state.guildDonationsTotal, { durationMs: Math.max(1, fxMs(700)) });
  const shownPower = powerFor(shownTotal);
  useEffect(() => {
    if (!gulp) return undefined;
    const id = window.setTimeout(() => setGulp(null), fxMs(1300));
    return () => window.clearTimeout(id);
  }, [gulp]);

  const handleFund = () => {
    if (!canAfford) return;
    const gain = previewGain;
    const donated = engine.donateToGuild(amount);
    if (donated) {
      setJustDonated(donated);
      setAmountText('');
      if (fxSpeed() > 0 && cofferRef.current) {
        const n = Math.min(12, 4 + Math.round(Math.log10(donated) * 2));
        flyTokens('gold', cofferRef.current, 'coin', n);
        window.setTimeout(() => {
          setGulp({ key: Date.now(), gain });
          if (cofferRef.current && powerRef.current) flyTokens(cofferRef.current, powerRef.current, 'spark', 3, fxMs(250));
        }, fxMs(420 + n * 45));
      }
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

            <span ref={cofferRef} className={`gfx-coffer ${gulp ? 'gfx-gulp' : ''}`} key={gulp?.key ?? 'idle'} aria-hidden="true">
              <span className="gfx-pile">
                {Array.from({ length: Math.min(24, 4 + Math.floor(Math.sqrt(state.guildDonationsTotal) / 20)) }, (_, i) => <i key={i} />)}
              </span>
              <svg viewBox="0 0 120 96" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
                <path d="M14 40h92v46H14z" fill="oklch(30% 0.05 60)" /><path d="M14 56h92M52 50h16v14H52z" />
                <g className="gfx-lid"><path d="M14 40c0-16 12-24 46-24s46 8 46 24z" fill="oklch(34% 0.06 60)" /><path d="M30 22v16M90 22v16" /></g>
              </svg>
              {gulp && gulp.gain > 0 && <span className="gfx-gain">+{gulp.gain} Power</span>}
            </span>

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

            <div className="gfx-ledger">
              <span>Lifetime given<b>{formatNumber(shownTotal)}</b></span>
              <span>Power from donations<b ref={powerRef} className="p">{shownPower}</b></span>
            </div>
            {justDonated !== null && (
              <p className="tiny" style={{ marginTop: 8, color: 'var(--brass)' }}>
                Donated {formatGold(justDonated)} gold.
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
