import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { DiceFace, HighLowCall } from '../game/types';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { Tuning } from '../game/data/tuning';
import { formatGold } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { DiceSprite } from './sprites/DiceSprite';
import { DicePickerFace } from './sprites/DicePickerFace';
import { GrimsbyBustCard } from './GrimsbyBustCard';

const FACES: DiceFace[] = [1, 2, 3, 4, 5, 6];

/** How long the tumble animation plays before the actual (already-rolled,
 *  by then) result is revealed -- purely theatrical, same "let the flip
 *  read as a moment" reasoning PeddlerCardModal's own UNPICKED_FADE_MS
 *  gives the card reveal. Long enough to read as a real roll, short
 *  enough not to feel like a loading spinner. Shared by both games below. */
const ROLL_DURATION_MS = 1100;

const OUTCOME_LABEL: Record<'jackpot' | 'partial' | 'bust', string> = {
  jackpot: 'Dead on!', partial: 'So close.', bust: 'Bust.',
};

const HIGH_LOW_LABEL: Record<HighLowCall, string> = { under: 'Under', middle: 'Middle', over: 'Over' };

/**
 * Grimsby's dice cart -- two games sharing one modal shell, switched by
 * an internal sub-tab (direct request off two separate mockups, folded
 * into one modal rather than a second vendor-card button, since both
 * are "roll a die against a wager" at the same table):
 *
 * - **Call a Number** (unchanged mechanic) -- pick an exact face, name a
 *   wager, roll. Land it exactly for 3x, land a neighbor for half back,
 *   anything else busts. The chip-row number picker is replaced here
 *   with DicePickerFace's own pixel-dice buttons (Snoblin pack) -- hover
 *   pops the die up, click presses it down before locking in the pick.
 * - **High or Low** (new) -- WoW's unofficial dueling-die wager, reskinned
 *   as a solo roll against the house. Call Under or Over (a coin-flip,
 *   2x payout) or, once High Roller is unlocked and staked high enough,
 *   Under/Middle/Over (a one-in-three call, 3x payout). See
 *   PeddlerManager.rollHighLow for the exact band math.
 *
 * Both tabs keep their own independent wager/result/rolling state so
 * switching tabs mid-roll never clears or blends the other game's own
 * pending result -- see lastGrimsbyDiceResult/lastGrimsbyHighLowResult's
 * own comments in engine.ts.
 */
export function PeddlerDiceModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const present = PeddlerManager.isPresent(state);

  const [tab, setTab] = useState<'exact' | 'highlow'>('exact');

  // ---- Call a Number state ----
  const [chosen, setChosen] = useState<DiceFace>(1);
  const [wagerText, setWagerText] = useState('');
  const [rolling, setRolling] = useState(false);
  const rollTimer = useRef<number | null>(null);
  // Patch 0261, direct request: a bust used to just leave the picker/die
  // sitting there the whole time with only a small inline "Bust." line to
  // notice -- nothing stopped a player from immediately picking a new
  // number and rolling again without the bust ever really registering.
  // This gates the picker/die/wager row behind a deliberate "Go Again"
  // click on the shared BUST card (GrimsbyBustCard.tsx) instead, same
  // pattern as the other two games below. Set the instant a bust result
  // lands (an effect, not the roll handler itself, so it also catches a
  // bust that resolves from a source this component didn't personally
  // trigger the roll for -- consistent with how PeddlerTabModal's own
  // bust-detection effect already reasons about this exact thing).
  const [bustPending, setBustPending] = useState(false);

  // ---- High or Low state ----
  const [hlHighRoller, setHlHighRoller] = useState(false);
  const [hlCall, setHlCall] = useState<HighLowCall>('under');
  const [hlWagerText, setHlWagerText] = useState('');
  const [hlRolling, setHlRolling] = useState(false);
  const hlRollTimer = useRef<number | null>(null);
  const [hlBustPending, setHlBustPending] = useState(false);

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    if (hlRollTimer.current !== null) window.clearTimeout(hlRollTimer.current);
  }, []);

  const result = engine.lastGrimsbyDiceResult;
  const hlResult = engine.lastGrimsbyHighLowResult;

  useEffect(() => {
    if (result && !rolling && result.outcome === 'bust') setBustPending(true);
  }, [result, rolling]);
  useEffect(() => {
    if (hlResult && !hlRolling && !hlResult.win) setHlBustPending(true);
  }, [hlResult, hlRolling]);

  const wager = Math.floor(Number(wagerText));
  const validWager = Number.isFinite(wager) && wager > 0;
  const canAfford = validWager && state.gold >= wager;
  const canRoll = present && !rolling && canAfford;

  const hlWager = Math.floor(Number(hlWagerText));
  const hlMinWager = PeddlerManager.highLowMinWager(hlHighRoller);
  const hlValidWager = Number.isFinite(hlWager) && hlWager >= hlMinWager;
  const hlCanAfford = hlValidWager && state.gold >= hlWager;
  const hlCanRoll = present && !hlRolling && hlCanAfford && (!hlHighRoller || state.grimsbyHighRollerUnlocked);

  const setMax = () => setWagerText(String(state.gold));
  const setHlMax = () => setHlWagerText(String(state.gold));

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

  const handleHlRoll = () => {
    if (!hlCanRoll) return;
    if (hlResult) engine.dismissGrimsbyHighLowResult();
    setHlRolling(true);
    hlRollTimer.current = window.setTimeout(() => {
      engine.rollGrimsbyHighLow(hlWager, hlCall, hlHighRoller);
      setHlRolling(false);
      hlRollTimer.current = null;
    }, ROLL_DURATION_MS);
  };

  const handleClose = () => {
    if (result) engine.dismissGrimsbyDiceResult();
    if (hlResult) engine.dismissGrimsbyHighLowResult();
    onClose();
  };

  const handleGoAgain = () => {
    engine.dismissGrimsbyDiceResult();
    setBustPending(false);
  };
  const handleHlGoAgain = () => {
    engine.dismissGrimsbyHighLowResult();
    setHlBustPending(false);
  };

  // The die shows: the tumble loop while rolling, the actual landed face
  // once a result has settled, or (Call a Number only) the currently-
  // chosen number as a preview beforehand -- High/Low has no single
  // "chosen face" to preview, so it just shows a blank die until rolled.
  const diceFace: DiceFace | null = rolling ? null : (result ? result.landed : chosen);
  const hlDiceFace: DiceFace | null = hlRolling ? null : (hlResult ? hlResult.landed : null);

  const outcomeColor = result
    ? (result.outcome === 'jackpot' ? 'var(--brass)' : result.outcome === 'partial' ? 'var(--parchment)' : 'var(--muted)')
    : undefined;
  const hlOutcomeColor = hlResult ? (hlResult.win ? 'var(--brass)' : 'var(--muted)') : undefined;

  const hlZones: HighLowCall[] = hlHighRoller ? ['under', 'middle', 'over'] : ['under', 'over'];
  const hlPayoutMultiplier = Tuning.get(
    hlHighRoller ? 'peddler.highLow.highRollerPayoutMultiplier' : 'peddler.highLow.standardPayoutMultiplier',
  );

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

        <div className="dice-tab-row">
          <button className={`btn-subtab ${tab === 'exact' ? 'on' : ''}`} onClick={() => setTab('exact')}>
            Call a Number
          </button>
          <button className={`btn-subtab ${tab === 'highlow' ? 'on' : ''}`} onClick={() => setTab('highlow')}>
            High or Low
          </button>
        </div>

        {tab === 'exact' ? (
          <div className="peddler-modal-body">
            {bustPending ? (
              <GrimsbyBustCard
                subtitle={`Landed on ${result?.landed} -- lost the ${formatGold(result?.wager ?? 0)} gold wager.`}
                onGoAgain={handleGoAgain}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="dice-roll-button"
                  onClick={handleRoll}
                  disabled={!canRoll}
                  title={!present ? 'He\u2019s not here right now' : !validWager ? 'Enter a wager first' : !canAfford ? 'Not enough gold' : 'Roll the dice'}
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

                <div className="row wrap" style={{ gap: 2, justifyContent: 'center' }}>
                  {FACES.map((f) => (
                    <DicePickerFace key={f} face={f} selected={chosen === f} disabled={rolling} onSelect={setChosen} size={40} />
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
                  <span className="tiny muted">\u25c6 {formatGold(state.gold)} on hand</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="peddler-modal-body">
            {hlBustPending ? (
              <GrimsbyBustCard
                subtitle={`Landed on ${hlResult?.landed} -- lost the ${formatGold(hlResult?.wager ?? 0)} gold wager.`}
                onGoAgain={handleHlGoAgain}
              />
            ) : (
              <>
                <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className={`chip ${!hlHighRoller ? 'on' : ''}`}
                    disabled={hlRolling}
                    onClick={() => { setHlHighRoller(false); setHlCall('under'); }}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    className={`chip risky ${hlHighRoller ? 'on' : ''}`}
                    disabled={hlRolling || !state.grimsbyHighRollerUnlocked}
                    onClick={() => { setHlHighRoller(true); setHlCall('under'); }}
                    title={state.grimsbyHighRollerUnlocked ? undefined : 'Unlock High Roller on Grimsby\u2019s own page first'}
                  >
                    Highroller
                  </button>
                </div>

                {hlResult && !hlRolling ? (
                  <p className="peddler-corner-comment tiny" style={{ color: hlOutcomeColor }}>
                    <b>{hlResult.win ? 'Winner!' : 'Bust.'}</b>{' '}
                    Landed on {hlResult.landed} -- {hlResult.payout > 0 ? `+${formatGold(hlResult.payout)} gold back` : `lost the ${formatGold(hlResult.wager)} gold wager`}
                  </p>
                ) : (
                  <p className="peddler-corner-comment tiny muted">
                    Call Under or Over -- or, at High Roller stakes, Under, Middle, or Over -- name your wager, then
                    roll. Land inside your call and get paid out; anything else is a bust.
                  </p>
                )}

                <div className="row wrap" style={{ gap: 10, justifyContent: 'center' }}>
                  {hlZones.map((call) => (
                    <HighLowZone
                      key={call}
                      call={call}
                      highRoller={hlHighRoller}
                      selected={hlCall === call}
                      disabled={hlRolling}
                      payoutMultiplier={hlPayoutMultiplier}
                      onSelect={setHlCall}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="dice-roll-button"
                  onClick={handleHlRoll}
                  disabled={!hlCanRoll}
                  title={
                    !present ? 'He\u2019s not here right now'
                      : hlHighRoller && !state.grimsbyHighRollerUnlocked ? 'Unlock High Roller first'
                        : !hlValidWager ? `Minimum wager is ${hlMinWager} gold`
                          : !hlCanAfford ? 'Not enough gold' : 'Roll the dice'
                  }
                >
                  <DiceSprite rolling={hlRolling} face={hlDiceFace} height={72} title="Roll the dice" />
                </button>

                <div className="row wrap" style={{ gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <span className="tiny muted">Wager (min {hlMinWager})</span>
                  <input
                    type="number"
                    min={hlMinWager}
                    max={state.gold}
                    value={hlWagerText}
                    disabled={hlRolling}
                    onChange={(e) => setHlWagerText(e.target.value)}
                    placeholder="Gold"
                    style={{
                      width: 90, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                      color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.75rem',
                    }}
                  />
                  <button type="button" className="btn-ghost" disabled={hlRolling} onClick={setHlMax} style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}>
                    Max
                  </button>
                  <span className="tiny muted">\u25c6 {formatGold(state.gold)} on hand</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** Face ranges for each High/Low band -- must mirror PeddlerManager's own
 *  HIGH_LOW_BANDS exactly, since this only drives the zone's display
 *  (which dice icons + range text it shows); the actual win check happens
 *  server-side in PeddlerManager.rollHighLow. Kept as a small local table
 *  rather than importing the manager's own private constant, same
 *  "display-only mirror, not a shared source of truth" shape other
 *  preview UIs (e.g. QuestPanel's previewSuccess) already accept. */
const HIGH_LOW_ZONE_FACES: Record<'standard' | 'highRoller', Partial<Record<HighLowCall, DiceFace[]>>> = {
  standard: { under: [1, 2, 3], over: [4, 5, 6] },
  highRoller: { under: [1, 2], middle: [3, 4], over: [5, 6] },
};

/**
 * One clickable High/Low betting zone -- groups 2-3 pixel-dice icons
 * under one call, so hovering/clicking ANY die in the zone lifts/presses
 * the zone as a single target rather than each die being its own
 * independent pick (unlike Call a Number's row, where every face is its
 * own distinct choice). Reimplements the same normal/hover/dragging
 * sprite-swap DicePickerFace uses locally rather than nesting several
 * DicePickerFace instances inside one button, since a nested
 * button-in-button isn't valid HTML and the group needs one shared
 * hover/press state anyway.
 */
function HighLowZone({
  call, highRoller, selected, disabled, payoutMultiplier, onSelect,
}: {
  call: HighLowCall; highRoller: boolean; selected: boolean; disabled: boolean; payoutMultiplier: number;
  onSelect: (call: HighLowCall) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [pressing, setPressing] = useState(false);

  const faces = HIGH_LOW_ZONE_FACES[highRoller ? 'highRoller' : 'standard'][call] ?? [];
  const range = faces.length > 0 ? `${faces[0]}\u2013${faces[faces.length - 1]}` : '';
  const spriteState = pressing ? 'dragging' : hovering ? 'hover' : 'normal';

  const handleClick = () => {
    if (disabled) return;
    setHovering(false);
    setPressing(true);
    window.setTimeout(() => {
      setPressing(false);
      onSelect(call);
    }, 200);
  };

  return (
    <button
      type="button"
      className={`high-low-zone ${selected ? 'selected' : ''} ${hovering && !pressing ? 'hover' : ''} ${pressing ? 'pressed' : ''}`}
      disabled={disabled}
      onMouseEnter={() => !pressing && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      aria-pressed={selected}
    >
      <div className="high-low-zone-dice">
        {faces.map((f) => (
          <img key={f} src={`./peddler/dice/picker/dice_${f}_${spriteState}.png`} alt="" />
        ))}
      </div>
      <span className="zone-label tiny" style={{ fontWeight: 700 }}>{HIGH_LOW_LABEL[call]}</span>
      <span className="tiny muted">{range}</span>
      <span className="tiny" style={{ color: 'var(--moss)' }}>{payoutMultiplier}x payout</span>
    </button>
  );
}
