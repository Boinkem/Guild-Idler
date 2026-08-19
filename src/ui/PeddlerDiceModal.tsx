import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { DiceFace } from '../game/types';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { formatGold } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { DiceSprite } from './sprites/DiceSprite';

const FACES: DiceFace[] = [1, 2, 3, 4, 5, 6];

/** How long the tumble animation plays before the actual (already-rolled,
 *  by then) result is revealed -- purely theatrical, same "let the flip
 *  read as a moment" reasoning PeddlerCardModal's own UNPICKED_FADE_MS
 *  gives the card reveal. Long enough to read as a real roll, short
 *  enough not to feel like a loading spinner. */
const ROLL_DURATION_MS = 1100;

const OUTCOME_LABEL: Record<'jackpot' | 'partial' | 'bust', string> = {
  jackpot: 'Dead on!', partial: 'So close.', bust: 'Bust.',
};

/**
 * Grimsby's second game -- a gold-only wager against a rolling die,
 * alongside Pick Your Card. Same "vendor-table" backdrop template as
 * PeddlerCardModal (peddler-table.png inside .peddler-modal), per direct
 * request, rather than a bespoke scene of its own.
 *
 * Flow: pick a number, set a wager, click the die itself to roll (it
 * tumbles for ROLL_DURATION_MS, then the real result -- already decided
 * server-side, i.e. inside PeddlerManager.rollDice, the moment the roll
 * actually resolves -- reveals). The die stays clickable for another
 * round immediately after a result settles, so there's no separate
 * "Roll Again" button the way the card game needed one -- rolling again
 * IS just clicking the die again here.
 */
export function PeddlerDiceModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [chosen, setChosen] = useState<DiceFace>(1);
  // String, not number, so the field can sit genuinely empty mid-typing
  // rather than snapping to 0 -- same reasoning any controlled numeric
  // text input needs. Validated/clamped on roll, not on every keystroke.
  const [wagerText, setWagerText] = useState('');
  const [rolling, setRolling] = useState(false);
  const rollTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
  }, []);

  const result = engine.lastGrimsbyDiceResult;
  const present = PeddlerManager.isPresent(state);
  const wager = Math.floor(Number(wagerText));
  const validWager = Number.isFinite(wager) && wager > 0;
  const canAfford = validWager && state.gold >= wager;
  const canRoll = present && !rolling && canAfford;

  const setMax = () => setWagerText(String(state.gold));

  const handleRoll = () => {
    if (!canRoll) return;
    if (result) engine.dismissGrimsbyDiceResult();
    setRolling(true);
    rollTimer.current = window.setTimeout(() => {
      engine.rollGrimsbyDice(wager, chosen);
      setRolling(false);
      rollTimer.current = null;
    }, ROLL_DURATION_MS);
  };

  const handleClose = () => {
    if (result) engine.dismissGrimsbyDiceResult();
    onClose();
  };

  // The die shows: the tumble loop while rolling, the actual landed face
  // once a result has settled, or the currently-chosen number as a
  // preview beforehand -- so a player always sees exactly what they're
  // about to bet on before committing.
  const diceFace: DiceFace | null = rolling ? null : (result ? result.landed : chosen);

  const outcomeColor = result
    ? (result.outcome === 'jackpot' ? 'var(--brass)' : result.outcome === 'partial' ? 'var(--parchment)' : 'var(--muted)')
    : undefined;

  return (
    <div className="overlay" onClick={handleClose}>
      <div
        className="modal peddler-modal"
        style={{ backgroundImage: 'url(./lore/peddler-table.png)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="peddler-modal-header">
          <GrimsbySprite animation="idle" height={140} />
        </div>

        <div className="peddler-modal-body">
          <button
            type="button"
            className="dice-roll-button"
            onClick={handleRoll}
            disabled={!canRoll}
            title={!present ? 'He’s not here right now' : !validWager ? 'Enter a wager first' : !canAfford ? 'Not enough gold' : 'Roll the dice'}
          >
            <DiceSprite rolling={rolling} face={diceFace} height={96} title="Roll the dice" />
          </button>

          {result && !rolling ? (
            <p className="peddler-corner-comment tiny" style={{ color: outcomeColor }}>
              <b>{OUTCOME_LABEL[result.outcome]}</b>{' '}
              Landed on {result.landed} -- {result.payout > 0 ? `+${formatGold(result.payout)} gold back` : `lost the ${formatGold(result.wager)} gold wager`}
            </p>
          ) : (
            <p className="peddler-corner-comment tiny muted">
              Pick a number, name your wager, then click the die. Land it exactly and triple your gold back;
              land a face either side of it and get half back; anything else is a bust.
            </p>
          )}

          <div className="row wrap" style={{ gap: 4, justifyContent: 'center' }}>
            {FACES.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${chosen === f ? 'on' : ''}`}
                disabled={rolling}
                onClick={() => setChosen(f)}
                aria-pressed={chosen === f}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="row wrap" style={{ gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <span className="tiny muted">Wager</span>
            <input
              type="number"
              min={1}
              max={state.gold}
              value={wagerText}
              disabled={rolling}
              onChange={(e) => setWagerText(e.target.value)}
              placeholder="Gold"
              style={{
                width: 90, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.75rem',
              }}
            />
            <button type="button" className="btn-ghost" disabled={rolling} onClick={setMax} style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}>
              Max
            </button>
            <span className="tiny muted">◆ {formatGold(state.gold)} on hand</span>
          </div>
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
