import { useEngine } from './useEngine';
import { HeroManager } from '../game/managers/HeroManager';
import { HERO_CLASSES } from '../game/data/progression';
import { HeroSprite } from './sprites/HeroSprite';
import { at } from './resultFx';

/**
 * Hero Tier-Up's own dedicated celebration -- direct request: "Milestone
 * prompt, or like 'Adventurer Tiered Up! (up arrow)'," and a follow-up
 * choice for a real modal over a small corner popup (unlike
 * AchievementPopup.tsx, this blocks and requires a click to dismiss --
 * a hero permanently gaining power is a moment worth pausing on, not a
 * passive announcement that clears itself).
 *
 * Reads everything live off `engine.state.pendingHeroTierUpId` at render
 * time rather than a snapshotted payload -- same "read-then-cleared, not
 * a data payload" shape ChainDiscoveryModal's own pendingChainDiscovery
 * flag already uses. Renders nothing if the hero has since been retired
 * (id no longer resolves) rather than crashing on a stale reference --
 * dismisses itself automatically in that edge case via the same onClose
 * path a normal Close click takes.
 */
export function HeroTierUpModal() {
  const engine = useEngine();
  const state = engine.state;
  const heroId = state.pendingHeroTierUpId;
  const hero = heroId ? state.heroes.find((h) => h.id === heroId) : undefined;

  if (!heroId) return null;
  if (!hero) {
    engine.dismissHeroTierUp();
    return null;
  }

  const def = HERO_CLASSES[hero.heroClass];
  const newTier = HeroManager.effectiveTier(hero);
  const oldTier = newTier - 1;

  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const maxed = HeroManager.nextTierUpStep(hero) === null;
  const snap = engine.lastTierUpStats?.heroId === hero.id ? engine.lastTierUpStats.before : null;
  const STAT_ROWS: { key: keyof typeof hero.stats; label: string }[] = [
    { key: 'strength', label: 'STR' }, { key: 'endurance', label: 'END' }, { key: 'luck', label: 'LCK' }, { key: 'wisdom', label: 'WIS' },
  ];
  const scale = Math.max(1, ...STAT_ROWS.map((r) => hero.stats[r.key])) * 1.25;

  // Patch 0424 -- one CSS timeline (resultFx.tsx): a pillar of light rises
  // behind the hero, chevrons climb through it and the tier badge flips to
  // the new numeral; then the tier track fills its next pip and each stat
  // bar grows by what the tier added. Tier 5 stamps MAX TIER.
  return (
    <div className="overlay" onClick={() => engine.dismissHeroTierUp()}>
      <div className={`modal tfx-card ${maxed ? 'tfx-maxed' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="tfx-stage" aria-hidden="true">
          <span className="tfx-pillar" style={at(300)} />
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="tfx-ember" style={at(500 + i * 110, { left: `${38 + ((i * 7) % 24)}%` })} />
          ))}
          <span className="tfx-frame" style={at(700)}>
            <HeroSprite heroClass={hero.heroClass} skin={hero.skin} height={88} />
          </span>
          <span className="tfx-ring" style={at(700)} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="tfx-chev" style={at(450 + i * 160)}>
              <svg viewBox="0 0 46 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17 L23 4 L42 17" /></svg>
            </span>
          ))}
          <span className="tfx-badge">
            <span className="tfx-shield" />
            <span className="tfx-dg old" style={at(700)}>{ROMAN[oldTier] ?? oldTier}</span>
            <span className="tfx-dg new" style={at(950)}>{ROMAN[newTier] ?? newTier}</span>
          </span>
        </div>
        <div className="tfx-kick" style={at(1000)}>Tier up</div>
        <h3 className="tfx-title" style={at(1100, { marginBottom: 2 })}>{def?.name ?? hero.heroClass} Tiered Up!</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{hero.name}</p>
        <div className="tfx-track">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={`tfx-tp ${n < newTier ? 'had' : n === newTier ? 'new' : ''}`} style={at(1250)} />
          ))}
        </div>
        <div className="tiny muted">Tier {oldTier} → Tier {newTier}</div>
        <div className="tfx-stats">
          {STAT_ROWS.map((r, i) => {
            const now = hero.stats[r.key];
            const was = snap ? snap[r.key] : now;
            return (
              <div key={r.key} className="tfx-st" style={at(1500 + i * 140)}>
                <span className="tfx-k">{r.label}</span>
                <span className="tfx-bar">
                  <span className="tfx-old" style={{ width: `${(was / scale) * 100}%` }} />
                  <span className="tfx-gain" style={at(1650 + i * 140, { left: `${(was / scale) * 100}%`, width: `${(Math.max(0, now - was) / scale) * 100}%` })} />
                </span>
                <span className="tfx-v">{now}{now > was && <i>+{now - was}</i>}</span>
              </div>
            );
          })}
        </div>
        {maxed && <div className="tfx-seal" style={at(2300)}>MAX TIER</div>}
        <p className="small tfx-note" style={at(2300)}>
          {hero.name}'s stats now match a Tier {newTier} hero. Same class, same look, permanently stronger.
        </p>
        <div className="row end tfx-acts" style={at(2600, { marginTop: 14 })}>
          <button className="btn-primary" onClick={() => engine.dismissHeroTierUp()}>Close</button>
        </div>
      </div>
    </div>
  );
}
