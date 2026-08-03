import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { HeroManager } from '../../game/managers/HeroManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { HERO_CLASSES, RECRUIT_COST, SKINS } from '../../game/data/progression';
import { HeroClass, Stats } from '../../game/types';
import { describeMods, formatDuration, formatGold } from '../../game/util';
import { HeroSprite } from '../sprites/HeroSprite';

const STAT_KEYS: (keyof Stats)[] = ['strength', 'endurance', 'luck', 'wisdom'];

export function HeroesPanel() {
  const engine = useEngine();
  const now = useNow();
  const { settings } = useSettings();
  const state = engine.state;
  const slots = engine.heroSlots;
  const recruitable = GuildManager.recruitableClasses(state);
  const bandages = InventoryManager.count(state, 'field_bandage');

  // Condensed by default -- a guild of even three or four heroes used to eat
  // almost the whole screen. Each card opens on click for the full stat
  // breakdown, mods, injuries, and livery picker.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (heroId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(heroId)) next.delete(heroId); else next.add(heroId);
      return next;
    });
  };

  return (
    <>
      <h2>Heroes</h2>
      <p className="subtitle">{state.heroes.length} of {slots} slots filled. Every hero shares the guild's gold and bonuses.</p>

      {state.heroes.map((hero) => {
        const classDef = HERO_CLASSES[hero.heroClass];
        const total = HeroManager.totalStats(hero);
        const toNext = HeroManager.xpToNext(hero);
        const mods = HeroManager.heroMods(hero, now);
        const sets = HeroManager.activeSetBonuses(hero);
        const isOpen = expanded.has(hero.id);
        const showingOnDesktop = engine.displayedHero.id === hero.id;

        return (
          <div key={hero.id} className="card">
            <div
              className="row hero-card-summary"
              style={{ alignItems: 'center', gap: 12 }}
              onClick={() => toggleExpanded(hero.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(hero.id); } }}
            >
              <HeroSprite
                heroClass={hero.heroClass}
                skin={hero.skin}
                animation={hero.injuries.length > 0 ? 'hurt' : 'idle'}
                height={Math.round((isOpen ? 76 : 44) * settings.spriteScale)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spread">
                  <span className="card-title hero-card-name">
                    {hero.title && <span className="hero-title">{hero.title}</span>}
                    {hero.name}
                  </span>
                  <span className="small muted">
                    {classDef.name} · Level {hero.level}
                    {hero.ascension > 0 && (
                      <> · {PrestigeManager.rankFor(hero) ?? `ascended ×${hero.ascension}`}</>
                    )}
                  </span>
                </div>
                <div className="bar xp" style={{ marginTop: 6 }}><span style={{ width: `${(hero.xp / toNext) * 100}%` }} /></div>
                {!isOpen && (
                  <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                    {hero.status === 'questing' ? 'away on a quest' : 'at the guild'}
                    {hero.injuries.length > 0 && <span className="bad"> · {hero.injuries.map((i) => i.name).join(', ')}</span>}
                    {showingOnDesktop && <span className="good"> · showing on desktop</span>}
                  </p>
                )}
              </div>
              <button
                className="btn-ghost hero-card-expand"
                onClick={(e) => { e.stopPropagation(); toggleExpanded(hero.id); }}
              >
                {isOpen ? 'Less ▲' : 'More ▼'}
              </button>
            </div>

            {isOpen && (
              <div className="hero-card-details">
                <button
                  className={`chip ${showingOnDesktop ? 'on' : ''}`}
                  style={{ marginBottom: 8 }}
                  onClick={() => engine.setFocusedHero(hero.id)}
                  disabled={showingOnDesktop}
                  title="Shows this hero on the desktop companion"
                >
                  {showingOnDesktop ? '● Showing on desktop' : 'Show on desktop'}
                </button>
                <p className="card-flavour">{classDef.blurb}</p>

                <div className="small muted" style={{ marginBottom: 3 }}>
                  Experience {hero.xp} / {toNext}
                </div>
                <div className="bar xp"><span style={{ width: `${(hero.xp / toNext) * 100}%` }} /></div>

                <div className="stat-row" style={{ marginTop: 8 }}>
                  {STAT_KEYS.map((key) => (
                    <span key={key}>
                      {key} <b>{Math.round(total[key])}</b>
                      {hero.statPoints > 0 && (
                        <button
                          className="btn-ghost"
                          style={{ minHeight: 18, padding: '0 5px', marginLeft: 4 }}
                          onClick={() => engine.allocateStat(hero.id, key)}
                        >+</button>
                      )}
                    </span>
                  ))}
                </div>
                {hero.statPoints > 0 && (
                  <p className="tiny good" style={{ margin: '4px 0 0' }}>
                    {hero.statPoints} unspent training points.
                  </p>
                )}

                <div className="stat-row" style={{ marginTop: 8 }}>
                  {describeMods(mods).map((line) => <span key={line}>{line}</span>)}
                </div>

                {sets.length > 0 && (
                  <p className="tiny" style={{ color: 'var(--brass)', marginTop: 6 }}>
                    {sets.map((s) => `${s.setName}: ${s.label}`).join(' · ')}
                  </p>
                )}

                {hero.injuries.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {hero.injuries.map((injury) => (
                      <div key={injury.id} className="spread" style={{ marginBottom: 4 }}>
                        <span className="small bad">
                          {injury.name} — heals in {formatDuration(injury.healsAt - now)}
                        </span>
                        <span className="row">
                          <button
                            onClick={() => engine.treatInjury(hero.id, injury.id)}
                            disabled={state.gold < injury.treatmentCost}
                          >
                            Treat · {formatGold(injury.treatmentCost)}
                          </button>
                          <button
                            onClick={() => engine.useConsumable(hero.id, 'field_bandage')}
                            disabled={bandages === 0}
                          >
                            Bandage ×{bandages}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="tiny muted" style={{ marginTop: 8 }}>
                  Prefers {classDef.preferred.join(', ')} contracts (+{classDef.preferredBonus}% success) ·
                  {' '}{hero.questsCompleted} quests completed ·
                  {' '}{hero.status === 'questing' ? 'away on a quest' : 'at the guild'}
                </p>

                <div className="row wrap" style={{ marginTop: 6, alignItems: 'center' }}>
                  <span className="tiny muted">Livery:</span>
                  {SKINS.map((sk) => {
                    const owned = sk.id === 'original' || state.unlockedSkins.includes(sk.id);
                    const active = (hero.skin ?? 'original') === sk.id;
                    return (
                      <button
                        key={sk.id}
                        className={`skin-chip ${active ? 'on' : ''}`}
                        disabled={!owned}
                        title={owned ? sk.name : `${sk.name} — buy in the Skins shop below`}
                        onClick={() => engine.setHeroSkin(hero.id, sk.id)}
                      >
                        <span className="skin-dots">
                          <span style={{ background: sk.swatch[0] }} />
                          <span style={{ background: sk.swatch[1] }} />
                        </span>
                        {sk.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="section-heading">Recruit</div>
      {state.heroes.length >= slots && (
        <p className="small muted">
          No free slots. The Tavern adds one per level up to 5; beyond that, retire a hero at
          level 30+ in the Prestige tab for Heroic Renown, then spend it on Extra Banner
          (up to 4 more) — {slots} is not necessarily your ceiling.
        </p>
      )}
      <div className="grid three">
        {(Object.keys(HERO_CLASSES) as HeroClass[]).map((id) => {
          const def = HERO_CLASSES[id];
          const unlocked = recruitable.includes(id);
          const cost = RECRUIT_COST[id];
          const slotsFull = state.heroes.length >= slots;
          return (
            <div key={id} className="card" style={{ marginBottom: 0 }}>
              <div className="card-title">{def.name}</div>
              <p className="card-flavour">{def.blurb}</p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
              </div>
              <button
                className="btn-primary"
                disabled={!unlocked || state.gold < cost || slotsFull}
                onClick={() => engine.recruit(id)}
              >
                {!unlocked
                  ? `Tavern level ${def.unlockTavernLevel}`
                  : slotsFull ? 'No free slots' : `Recruit · ${formatGold(cost)}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-heading">Skins</div>
      <p className="small muted">
        Cosmetic liveries, unlocked once for the whole guild and usable by any hero.
        A pure gold sink — no effect on stats.
      </p>
      <div className="grid three">
        {SKINS.filter((sk) => sk.id !== 'original').map((sk) => {
          const owned = state.unlockedSkins.includes(sk.id);
          return (
            <div key={sk.id} className="card" style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{sk.name}</span>
                <span className="skin-dots">
                  <span style={{ background: sk.swatch[0] }} />
                  <span style={{ background: sk.swatch[1] }} />
                </span>
              </div>
              <p className="card-flavour">{sk.description}</p>
              <button
                className="btn-primary"
                disabled={owned || state.gold < sk.cost}
                onClick={() => engine.buySkin(sk.id)}
              >
                {owned ? 'Owned' : `Unlock · ${formatGold(sk.cost)}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
