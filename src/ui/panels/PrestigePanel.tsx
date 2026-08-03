import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PRESTIGE_MIN_LEVEL, PRESTIGE_STREAK_WINDOW_MS, renownEffectiveMaxLevel } from '../../game/data/progression';
import { describeMods, formatDuration, formatNumber } from '../../game/util';

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
        the guild keeps everything else, and gains Heroic Renown.
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
      {state.heroes.map((hero) => {
        const eligible = PrestigeManager.canRetire(hero);
        const preview = PrestigeManager.streakPreview(state, hero, now);
        const rank = PrestigeManager.rankFor(hero);
        return (
          <div key={hero.id} className="spread card" style={{ position: 'relative' }}>
            {justRetired?.heroId === hero.id && (
              <span key={justRetired.key} className="retire-burst" aria-hidden="true">
                +{justRetired.amount} ✦
              </span>
            )}
            <div>
              <div className="card-title">
                {rank && <span className="hero-title">{rank}</span>}
                {hero.name}
                {hero.ascension > 0 && <span className="tiny muted" style={{ marginLeft: 6 }}>ascended ×{hero.ascension}</span>}
              </div>
              <div className="tiny muted">
                Level {hero.level} · {hero.questsCompleted} quests · would grant{' '}
                <b className="gold-text">✦ {formatNumber(preview.total)}</b>
                {preview.bonusPct > 0 && <span> (base {PrestigeManager.renownPreview(hero)} + streak {preview.bonusPct}%)</span>}
              </div>
            </div>
            <button
              className="btn-primary"
              disabled={!eligible}
              onClick={() => {
                if (!settings.confirmRetire
                  || confirm(`Retire ${hero.name}? They return to level 1 and the guild gains ${formatNumber(preview.total)} renown.`)) {
                  setJustRetired({ heroId: hero.id, amount: preview.total, key: Date.now() });
                  window.setTimeout(() => setJustRetired(null), 2200);
                  engine.retire(hero.id);
                }
              }}
            >
              {eligible ? 'Retire' : `Needs level ${PRESTIGE_MIN_LEVEL}`}
            </button>
          </div>
        );
      })}

      <div className="section-heading">Spend renown</div>
      <div className="grid two">
        {PrestigeManager.perks().map((def) => {
          const level = PrestigeManager.perkLevel(state, def.id);
          const cost = PrestigeManager.nextPerkCost(state, def.id);
          const maxed = cost === null;
          const cap = renownEffectiveMaxLevel(def);
          const inTier2 = PrestigeManager.perkInTier2(state, def.id);
          const justUnlocked = PrestigeManager.perkTier2JustUnlocked(state, def.id);
          return (
            <div key={def.id} className={`card ${inTier2 ? 'renown-tier2' : ''}`} style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">
                  {def.name}
                  {inTier2 && <span className="tag" style={{ color: 'var(--violet)', marginLeft: 6 }}>Tier II</span>}
                </span>
                <span key={level} className="small muted purchase-pulse">{level}/{cap}</span>
              </div>
              <p className="card-flavour">
                {justUnlocked && def.tier2 ? def.tier2.unlockFlavour : def.description}
              </p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
                {def.heroSlotsPerLevel && <span className="gold-text">+1 hero slot per level</span>}
              </div>
              <button
                className="btn-primary"
                disabled={maxed || state.renown < cost}
                onClick={() => engine.buyPerk(def.id)}
              >
                {maxed ? 'Maxed' : `Buy · ✦ ${formatNumber(cost)}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
