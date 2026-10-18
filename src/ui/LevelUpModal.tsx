import { useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { HERO_CLASSES, xpForLevel } from '../game/data/progression';
import { heroTierUpStatMultiplier } from '../game/data/heroTierUp';
import { HeroSprite } from './sprites/HeroSprite';
import { playSound } from '../game/sound';
import type { Hero } from '../game/types';
import type { LevelUpEvent } from '../game/engine';

/**
 * Hero Level-Up card (patch 0414) -- the animated "LEVEL UP!" moment, one
 * card per hero who levelled, shown LAST: GameEngine.currentLevelUp stays
 * null while any quest/raid/chain result, offline report, hatch or tier-up
 * prompt is still up (see levelUpBlocked), so the card lands after the
 * rewards that caused it.
 *
 * Two layouts from the same queue:
 *  - menu (default): the full card over a dimmed Guild Hall.
 *  - compact: fills the tiny idle-companion window instead of trying to
 *    squeeze the full card into 260x340, same reasoning the idle view's
 *    own compact banners give. "Open guild" switches to the menu, where
 *    the same card (still first in the queue) plays at full size.
 *
 * All timing lives in app.css (.lu-*). Every duration divides by
 * --anim-speed like the rest of the app, and Settings' Reduce motion
 * (data-motion='off') collapses it straight to the final frame.
 *
 * Stat gains are recomputed from the class growth x tier-up growth
 * multiplier -- exactly what HeroManager.grantXp added per level -- rather
 * than snapshotting stats, so training-point spends or a stat reset made
 * while the card was queued can't show up as "gains".
 */

const STAT_ROWS: { key: keyof Hero['stats']; label: string; color: string }[] = [
  { key: 'strength', label: 'STR', color: 'oklch(70% 0.16 30)' },
  { key: 'endurance', label: 'END', color: 'oklch(72% 0.12 72)' },
  { key: 'luck', label: 'LCK', color: 'oklch(72% 0.13 142)' },
  { key: 'wisdom', label: 'WIS', color: 'oklch(72% 0.09 232)' },
];

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function LevelUpModal({ compact = false, onOpenMenu }: { compact?: boolean; onOpenMenu?: () => void }) {
  const engine = useEngine();
  const event = engine.currentLevelUp;
  const hero = event ? engine.state.heroes.find((h) => h.id === event.heroId) : undefined;
  if (!event || !hero) return null;
  // Keyed per hero + level range so the next card in the queue (or the
  // same hero levelling again) always remounts and replays from frame 0.
  const key = `${event.heroId}:${event.fromLevel}:${event.toLevel}:${compact ? 'c' : 'm'}`;
  return compact
    ? <LevelUpCompact key={key} event={event} hero={hero} onOpenMenu={onOpenMenu} />
    : <LevelUpCard key={key} event={event} hero={hero} />;
}

function useLevelUpData(event: LevelUpEvent, hero: Hero) {
  return useMemo(() => {
    const def = HERO_CLASSES[hero.heroClass];
    const levels = Math.max(1, event.toLevel - event.fromLevel);
    const growthMult = heroTierUpStatMultiplier(hero.tierUpLevel).growth;
    const stats = STAT_ROWS.map((row, i) => ({
      ...row,
      value: fmt(hero.stats[row.key]),
      gain: `+${fmt(def.growth[row.key] * growthMult * levels)}`,
      i,
    }));
    const need = xpForLevel(hero.level);
    const xpPct = need > 0 ? Math.min(100, Math.max(0, (hero.xp / need) * 100)) : 100;
    return { def, levels, stats, need, xpPct };
  }, [event, hero]);
}

function LevelUpCard({ event, hero }: { event: LevelUpEvent; hero: Hero }) {
  const engine = useEngine();
  const { def, levels, stats, need, xpPct } = useLevelUpData(event, hero);
  const batch = engine.levelUpBatchSize;
  const position = engine.levelUpShownInBatch + 1;
  const moreQueued = engine.levelUpQueue.length > 1;
  const multi = levels > 1;

  useEffect(() => { playSound('level_up'); }, []);

  const proceed = () => engine.dismissLevelUp();
  const spend = () => {
    engine.dismissLevelUp();
    engine.requestTab('heroes', undefined, 'heroes');
  };

  return (
    <div className="overlay lu-overlay" onClick={proceed}>
      <div className="lu-backdrop" aria-hidden="true">
        <div className="lu-rays" />
        <div className="lu-burst" />
      </div>
      <div
        className={`lu-card${multi ? ' lu-multi' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${hero.name} reached level ${event.toLevel}`}
        onClick={(e) => e.stopPropagation()}
      >
        {batch > 1 && (
          <div className="lu-queue" aria-label={`Hero ${position} of ${batch}`}>
            {Array.from({ length: batch }, (_, i) => (
              <span key={i} className={i < position - 1 ? 'done' : i === position - 1 ? 'on' : ''} />
            ))}
            <span className="lu-queue-label">{position} of {batch} heroes</span>
          </div>
        )}

        <h2 className="lu-title" aria-hidden="true">
          {'LEVEL UP!'.split('').map((ch, i) => (
            <span key={i} className="lu-letter" style={{ '--i': i } as CSSProperties}>{ch === ' ' ? ' ' : ch}</span>
          ))}
        </h2>

        <div className="lu-stage">
          <div className="lu-shadow" />
          <div className="lu-hero">
            <HeroSprite heroClass={hero.heroClass} skin={hero.skin} height={150} title={hero.name} />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="lu-spark" style={{ '--i': i } as CSSProperties} />)}
        </div>

        <div className="lu-name">
          <div className="lu-hero-name">{hero.name}</div>
          <div className="lu-class">{def.name} · {cap(def.role)}</div>
        </div>

        <div className="lu-level">
          <span className="lu-lv">LV</span>
          <div className="lu-num">
            <span className="lu-old">{event.fromLevel}</span>
            {multi && <span className="lu-mid">{event.toLevel - 1}</span>}
            <span className="lu-ring" />
            <span className="lu-new">{event.toLevel}</span>
            {multi && <span className="lu-plus">+{levels}</span>}
          </div>
        </div>

        <div className="lu-xp">
          <div className="lu-xp-head"><span>XP</span><span>{Math.floor(hero.xp).toLocaleString()} / {need.toLocaleString()}</span></div>
          <div className="lu-xp-track">
            <div className="lu-xp-fill" style={{ '--xp': `${xpPct}%` } as CSSProperties} />
          </div>
        </div>

        <div className="lu-stats">
          {stats.map((s) => (
            <div key={s.key} className="lu-stat" style={{ '--i': s.i } as CSSProperties}>
              <span className="lu-stat-key" style={{ color: s.color }}>{s.label}</span>
              <span className="lu-stat-val">{s.value}</span>
              <span className="lu-gain">{s.gain}</span>
            </div>
          ))}
        </div>

        <div className="lu-point">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="3" strokeLinecap="square" /></svg>
          {levels} Training Point{levels === 1 ? '' : 's'} to spend
        </div>

        <div className="lu-actions">
          <button type="button" className="lu-btn lu-btn-ghost" onClick={spend}>
            Spend point{levels === 1 ? '' : 's'}
          </button>
          <button type="button" className="lu-btn lu-btn-primary" onClick={proceed} autoFocus>
            {moreQueued ? 'Next hero' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelUpCompact({ event, hero, onOpenMenu }: { event: LevelUpEvent; hero: Hero; onOpenMenu?: () => void }) {
  const engine = useEngine();
  const { levels } = useLevelUpData(event, hero);
  useEffect(() => { playSound('level_up'); }, []);
  return (
    <div className="lu-compact" role="dialog" aria-label={`${hero.name} reached level ${event.toLevel}`}>
      <div className="lu-c-rays" aria-hidden="true" />
      <div className="lu-c-burst" aria-hidden="true" />
      <div className="lu-c-banner">LEVEL UP!</div>
      <div className="lu-c-hero">
        <HeroSprite heroClass={hero.heroClass} skin={hero.skin} height={120} title={hero.name} />
      </div>
      <div className="lu-c-info">
        <div className="lu-c-chip lu-c-d0">
          <span className="lu-c-name">{hero.name}</span>
          <span className="lu-c-from">Lv {event.fromLevel}</span>
          <span aria-hidden="true">→</span>
          <span className="lu-c-to">Lv {event.toLevel}</span>
        </div>
        <div className="lu-c-chip lu-c-points lu-c-d1">+{levels} training point{levels === 1 ? '' : 's'}</div>
        <div className="lu-c-actions lu-c-d2">
          <button type="button" className="lu-c-btn lu-c-btn-gold" onClick={() => onOpenMenu?.()}>Open guild</button>
          <button type="button" className="lu-c-btn" onClick={() => engine.dismissLevelUp()}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
