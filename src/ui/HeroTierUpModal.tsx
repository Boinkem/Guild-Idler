import { useEngine } from './useEngine';
import { HeroManager } from '../game/managers/HeroManager';
import { HERO_CLASSES } from '../game/data/progression';
import { HeroSprite } from './sprites/HeroSprite';

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

  return (
    <div className="overlay" onClick={() => engine.dismissHeroTierUp()}>
      <div className="modal" style={{ textAlign: 'center', maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'center', marginBottom: 4 }}>
          <HeroSprite heroClass={hero.heroClass} skin={hero.skin} height={72} />
        </div>
        <h3 style={{ marginBottom: 2 }}>{def?.name ?? hero.heroClass} Tiered Up!</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{hero.name}</p>
        <p className="card-title" style={{ color: 'var(--brass)', fontSize: '1.1rem', margin: '8px 0' }}>
          Tier {oldTier} <span aria-hidden="true">→</span> Tier {newTier}
        </p>
        <p className="small" style={{ marginTop: 4 }}>
          {hero.name}'s stats now match a Tier {newTier} hero -- same class, same look, permanently stronger.
        </p>
        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={() => engine.dismissHeroTierUp()}>Close</button>
        </div>
      </div>
    </div>
  );
}
