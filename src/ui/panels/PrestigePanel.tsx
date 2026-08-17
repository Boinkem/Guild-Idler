import { useEffect, useRef, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PRESTIGE_MIN_LEVEL, PRESTIGE_STREAK_WINDOW_MS, renownEffectiveMaxLevel } from '../../game/data/progression';
import { describeMods, formatDuration, formatNumber } from '../../game/util';
import { usePulsesOnChange } from '../maxFlash';
import { Hero } from '../../game/types';

/**
 * Replaces the native browser confirm() previously used for both Retire
 * and Early Retire -- a plain OS dialog box read as visually broken next
 * to everything else in this game having its own themed chrome ("card is
 * unstyled" was the actual feedback). Same .overlay/.modal shape every
 * other in-game confirmation/detail popup already uses (PeddlerCard's
 * detail overlay, the Vendors shop item modals). `tone` picks which
 * button color signals the stakes: 'primary' (brass) for the real
 * Retire, which is a genuine reward; 'ghost' (plain) for Early Retire,
 * which gives up the renown/streak entirely and shouldn't look inviting.
 */
function RetireConfirmModal({
  title, body, confirmLabel, tone, onConfirm, onCancel,
}: {
  title: string; body: string; confirmLabel: string; tone: 'primary' | 'ghost';
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="small muted">{body}</p>
        <div className="row end" style={{ gap: 8, marginTop: 12 }}>
          <button onClick={onCancel}>Cancel</button>
          <button className={tone === 'primary' ? 'btn-primary' : 'btn-ghost'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One hero's retire row -- owns its own confirm-modal visibility (which
 *  of Retire/Early Retire, if either, is currently confirming) rather
 *  than PrestigePanel tracking that per-hero itself. */
function HeroRetireCard({
  hero, state, now, confirmRetire, justRetired, onRetire, onEarlyRetire,
}: {
  hero: Hero;
  state: Parameters<typeof PrestigeManager.streakPreview>[0];
  now: number;
  confirmRetire: boolean;
  justRetired: { heroId: string; amount: number; key: number } | null;
  onRetire: (heroId: string, amount: number) => void;
  onEarlyRetire: (heroId: string) => void;
}) {
  const [confirming, setConfirming] = useState<'retire' | 'early' | null>(null);
  const eligible = PrestigeManager.canRetire(hero);
  const preview = PrestigeManager.streakPreview(state, hero, now);
  const rank = PrestigeManager.rankFor(hero);

  const doRetire = () => { setConfirming(null); onRetire(hero.id, preview.total); };
  const doEarlyRetire = () => { setConfirming(null); onEarlyRetire(hero.id); };

  return (
    <div className="spread card" style={{ position: 'relative' }}>
      {justRetired?.heroId === hero.id && (
        <span key={justRetired.key} className="retire-burst" aria-hidden="true">
          +{justRetired.amount} ✦
        </span>
      )}
      <div>
        <div className="card-title">
          {rank && <span className="hero-rank-badge">{rank}</span>}
          {hero.name}
          {hero.ascension > 0 && <span className="tiny muted" style={{ marginLeft: 6 }}>ascended ×{hero.ascension}</span>}
        </div>
        <div className="tiny muted">
          Level {hero.level} · {hero.questsCompleted} quests · would grant{' '}
          <b className="gold-text">✦ {formatNumber(preview.total)}</b>
          {preview.bonusPct > 0 && <span> (base {PrestigeManager.renownPreview(hero)} + streak {preview.bonusPct}%)</span>}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button
          className="btn-primary"
          disabled={!eligible}
          onClick={() => { if (confirmRetire) setConfirming('retire'); else doRetire(); }}
        >
          {eligible ? 'Retire' : `Needs level ${PRESTIGE_MIN_LEVEL}`}
        </button>
        {/* Only offered before a hero actually qualifies for a real
            Retire -- once eligible, early retirement is strictly
            worse (same freed slot, nothing gained), so there's
            nothing left for this to usefully offer. */}
        {!eligible && PrestigeManager.canEarlyRetire(hero) && (
          <button className="btn-ghost" onClick={() => setConfirming('early')}>
            Early Retire
          </button>
        )}
      </div>

      {confirming === 'retire' && (
        <RetireConfirmModal
          title={`Retire ${hero.name}?`}
          body={`They return to level 1 and the guild gains ${formatNumber(preview.total)} renown. This can't be undone.`}
          confirmLabel="Retire"
          tone="primary"
          onConfirm={doRetire}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'early' && (
        <RetireConfirmModal
          title={`Early-retire ${hero.name}?`}
          body={`No renown, no bonus -- this just frees the slot right now instead of waiting for level ${PRESTIGE_MIN_LEVEL}.`}
          confirmLabel="Early Retire"
          tone="ghost"
          onConfirm={doEarlyRetire}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/**
 * One renown perk's card -- pulled out of PrestigePanel's own inline
 * `.map()` so it can own a ref for the "jump to and highlight" treatment
 * (`highlighted`/`onDismissHighlight`), same shape GuildPanel's
 * UpgradeCard already established for the exact same feature (patch
 * 0179/0180) -- scrolls itself into view and glows briefly when it's the
 * answer to a locked-purchase link elsewhere (e.g. HeroesPanel's "No free
 * slots" message pointing at Extra Banner). Every prop here is exactly
 * what the old inline block already computed per-def; nothing about the
 * markup itself changed.
 */
function RenownPerkCard({
  def, level, cost, maxed, affordable, cap, inTier2, justUnlocked, pulsing, onBuy, highlighted, onDismissHighlight,
}: {
  def: ReturnType<typeof PrestigeManager.perks>[number];
  level: number; cost: number | null; maxed: boolean; affordable: boolean; cap: number; inTier2: boolean; justUnlocked: boolean;
  pulsing?: boolean; onBuy: () => void; highlighted?: boolean; onDismissHighlight?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);
  return (
    <div
      ref={cardRef}
      className={`card ${inTier2 ? 'renown-tier2' : ''} ${highlighted ? 'requirement-highlight' : ''}`}
      style={{ marginBottom: 0 }}
      onClick={onDismissHighlight}
    >
      <div className="spread">
        <span className="card-title">
          {def.name}
          {inTier2 && <span className="tag" style={{ color: 'var(--violet)', marginLeft: 6 }}>Tier II</span>}
        </span>
        <span className={`small muted ${pulsing ? 'purchase-pulse' : ''}`}>{level}/{cap}</span>
      </div>
      <p className="card-flavour">
        {justUnlocked && def.tier2 ? def.tier2.unlockFlavour : def.description}
      </p>
      <div className="stat-row" style={{ marginBottom: 8 }}>
        {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
        {def.heroSlotsPerLevel && <span className="gold-text">+1 hero slot per level</span>}
      </div>
      <button
        className="btn-yellow"
        disabled={maxed || !affordable}
        onClick={(e) => { e.stopPropagation(); onBuy(); }}
      >
        {maxed ? 'Maxed' : `Buy · ✦ ${formatNumber(cost ?? 0)}`}
      </button>
    </div>
  );
}

export function PrestigePanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const now = useNow();
  const state = engine.state;

  // Retirement has no dedicated overlay -- a brief inline burst on the
  // specific hero's card instead, matching the reward-burst treatment
  // elsewhere but sized for a card rather than a modal. Amount is captured
  // at click time rather than read back afterward, since engine.retire()
  // immediately resets the hero to level 1 -- by the time this re-renders,
  // `preview.total` for that hero id would already be recomputed against
  // the now-reset hero and show the wrong (tiny) number.
  const [justRetired, setJustRetired] = useState<{ heroId: string; amount: number; key: number } | null>(null);

  // "Jump to and highlight the requirement" landing -- same consume-once
  // shape GuildPanel's own highlightId already uses (patch 0179), reused
  // here so a locked-purchase link elsewhere in the game (e.g. HeroesPanel's
  // "No free slots" message) can point straight at a specific renown perk.
  const [highlightId, setHighlightId] = useState<string | null>(
    () => engine.consumeRequestedHighlight(),
  );
  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => setHighlightId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // Same "only pulse on a real change, not on every tab-switch remount"
  // fix Guild Hall/Vendors/Harvest already got -- see usePulsesOnChange's
  // own doc comment in maxFlash.tsx.
  const perkLevelPulses = usePulsesOnChange(
    PrestigeManager.perks().map((def) => ({ id: def.id, value: PrestigeManager.perkLevel(state, def.id) })),
  );

  const streakActive = state.lastPrestigeAt !== null
    && now - state.lastPrestigeAt <= PRESTIGE_STREAK_WINDOW_MS;
  const streakExpiresIn = state.lastPrestigeAt !== null
    ? PRESTIGE_STREAK_WINDOW_MS - (now - state.lastPrestigeAt)
    : 0;

  return (
    <>
      <h2>Prestige</h2>
      <p className="subtitle">
        Retire a hero at level {PRESTIGE_MIN_LEVEL} or above. They hand in their level, XP, and gear;
        the guild keeps everything else, and gains Heroic Renown. Not there yet? Early Retirement frees
        the slot immediately instead, with no renown or bonus attached.
      </p>

      <div className="card">
        <div className="spread">
          <span className="card-title">Heroic Renown</span>
          <b style={{ color: 'var(--violet)' }}>✦ {formatNumber(state.renown)}</b>
        </div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          {describeMods(ModifierManager.renownMods(state)).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <span className="card-title">Prestige Streak</span>
          <b style={{ color: streakActive ? 'var(--brass)' : 'var(--muted)' }}>
            {streakActive ? `×${state.prestigeStreak}` : 'inactive'}
          </b>
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {streakActive
            ? `Retiring again within ${formatDuration(streakExpiresIn)} keeps it going and pushes the bonus higher. Let it lapse and the next retirement starts a fresh streak.`
            : state.stats.prestigeCount === 0
              ? 'Your first retirement starts a streak. Keep retiring within three days of the last one to build a renown bonus, up to +50%.'
              : 'The streak lapsed. Your next retirement starts a new one from scratch.'}
        </p>
        {state.stats.bestPrestigeStreak > 0 && (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>Best streak so far: ×{state.stats.bestPrestigeStreak}</p>
        )}
      </div>

      <div className="section-heading">Retire a hero</div>
      {state.heroes.map((hero) => (
        <HeroRetireCard
          key={hero.id}
          hero={hero}
          state={state}
          now={now}
          confirmRetire={settings.confirmRetire}
          justRetired={justRetired}
          onRetire={(heroId, amount) => {
            setJustRetired({ heroId, amount, key: Date.now() });
            window.setTimeout(() => setJustRetired(null), 2200);
            engine.retire(heroId);
          }}
          onEarlyRetire={(heroId) => engine.earlyRetire(heroId)}
        />
      ))}

      <div className="section-heading">Spend renown</div>
      <div className="grid two">
        {PrestigeManager.perks().map((def) => {
          const level = PrestigeManager.perkLevel(state, def.id);
          const cost = PrestigeManager.nextPerkCost(state, def.id);
          const maxed = cost === null;
          const affordable = !maxed && cost !== null && state.renown >= cost;
          const cap = renownEffectiveMaxLevel(def);
          const inTier2 = PrestigeManager.perkInTier2(state, def.id);
          const justUnlocked = PrestigeManager.perkTier2JustUnlocked(state, def.id);
          return (
            <RenownPerkCard
              key={def.id}
              def={def}
              level={level}
              cost={cost}
              maxed={maxed}
              affordable={affordable}
              cap={cap}
              inTier2={inTier2}
              justUnlocked={justUnlocked}
              pulsing={perkLevelPulses[def.id]}
              onBuy={() => engine.buyPerk(def.id)}
              highlighted={def.id === highlightId}
              onDismissHighlight={() => setHighlightId(null)}
            />
          );
        })}
      </div>
    </>
  );
}
