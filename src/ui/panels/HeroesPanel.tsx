import { useRef, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { HeroManager } from '../../game/managers/HeroManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { rerollsUsedToday } from '../../game/data/reroll';
import { HERO_CLASSES, RECRUIT_COST, SKINS, ROLES, infirmaryAutoReviveUnlocked, TOMBSTONE_STYLES, TOMBSTONE_STYLE_BY_ID } from '../../game/data/progression';
import { Tuning } from '../../game/data/tuning';
import { HeroClass, Hero, Stats } from '../../game/types';
import { describeMods, formatDuration, formatGold, HOUR } from '../../game/util';
import { HeroSprite } from '../sprites/HeroSprite';
import { GearScoreBadge } from '../GearScoreBadge';
import { useLevelUpFlash, LevelUpFlash } from '../levelFlash';
import { registerFlyTarget } from '../flyTarget';

const STAT_KEYS: (keyof Stats)[] = ['strength', 'endurance', 'luck', 'wisdom'];

/**
 * Static art for a Fallen hero, deliberately NOT the existing `death`
 * sprite animation -- a looping death animation standing around the idle
 * guild view would read as broken/distressing rather than as a status.
 * Same graceful-missing-asset pattern HarvestPanel's HarvestGlyph already
 * uses: falls back to a plain glyph if the real file (dropped into
 * public/hero-status/tombstone.png) hasn't been added yet, rather than a
 * broken image icon. See guild-idler-status.md's Health stat + Fallen/
 * death mechanic section.
 */
/**
 * Static art for a Fallen hero, deliberately NOT the existing `death`
 * sprite animation -- a looping death animation standing around the idle
 * guild view would read as broken/distressing rather than as a status.
 * Same graceful-missing-asset pattern HarvestPanel's HarvestGlyph already
 * uses: falls back to a plain glyph if the real file (dropped into
 * public/hero-status/<icon>) hasn't been added yet, rather than a broken
 * image icon. `icon` comes from the globally-selected TombstoneStyleDef
 * (see TOMBSTONE_STYLES) -- `key={icon}` forces a fresh mount whenever the
 * style changes, so a previous style's fallback state doesn't leak onto a
 * newly-selected one that might have real art. See guild-idler-status.md's
 * Health stat + Fallen/death mechanic section and its Health-related gold
 * sinks follow-up (tombstone variants).
 */
function Tombstone({ height, icon }: { height: number; icon: string }) {
  return <TombstoneImg key={icon} height={height} icon={icon} />;
}

function TombstoneImg({ height, icon }: { height: number; icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ height, width: height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: height * 0.6 }}>
        💀
      </div>
    );
  }
  return (
    <img
      src={`./hero-status/${icon}`}
      alt="Fallen"
      onError={() => setFailed(true)}
      style={{ height, width: 'auto', objectFit: 'contain' }}
    />
  );
}

/**
 * Mirrors DurabilityBar (EquipmentPanel.tsx) exactly -- same `.bar`
 * class, same `low` threshold/red-tint behaviour, just reading Health
 * instead of gear durability. Two equally-visible, equally-styled bars a
 * player tracks the same way, rather than Health being a hidden number
 * you only discover after a bad string of injuries.
 */
/**
 * Auto Heal countdown -- a slim second bar directly under Health, DRAINING
 * from full to empty as the hero's passive Infirmary regen closes the gap
 * to full Health (mirrors the "full in Xm" text that already exists for
 * the Fallen/auto-revive timer below, just for the ordinary regen case).
 * `eta` is the live, currently-projected time-to-full from
 * HeroManager.healthRegenEtaMs; `initialEta` is captured once via a ref on
 * mount/health-change so the bar has a stable denominator to drain
 * against rather than recomputing its own total every render (which would
 * make it read as permanently ~empty, since remaining-time-over-itself is
 * always ~1). Renders nothing once the hero is at full Health, Fallen, or
 * Infirmary hasn't been built yet (healTimeMinutes still applies at
 * Infirmary level 0, so this is really just "hero is already full" in
 * practice pre-Infirmary too).
 */
function AutoHealBar({ hero, infirmaryLevel }: { hero: Hero; infirmaryLevel: number }) {
  const eta = HeroManager.healthRegenEtaMs(hero, infirmaryLevel);
  const initialEtaRef = useRef<{ health: number | undefined; eta: number } | null>(null);
  if (eta <= 0) {
    initialEtaRef.current = null;
    return null;
  }
  if (!initialEtaRef.current || initialEtaRef.current.health !== hero.health) {
    initialEtaRef.current = { health: hero.health, eta };
  }
  const total = Math.max(initialEtaRef.current.eta, eta);
  const ratio = total > 0 ? Math.max(0, Math.min(1, eta / total)) : 0;
  return (
    <>
      <div className="bar heal-timer" style={{ marginTop: 2 }} title="Time until fully healed at the current Infirmary rate">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="tiny muted">Auto Heal — full in {formatDuration(eta)}</div>
    </>
  );
}

function HealthBar({ hero, compact = false }: { hero: Hero; compact?: boolean }) {
  const max = HeroManager.maxHealth(hero);
  const current = HeroManager.currentHealth(hero);
  const ratio = max > 0 ? current / max : 0;
  return (
    <>
      <div className={`bar health ${ratio < 0.25 ? 'low' : ''}`} style={{ marginTop: compact ? 2 : 4 }}>
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      {!compact && (
        <div className="tiny muted">
          Health {Math.round(current)}/{max}
        </div>
      )}
    </>
  );
}

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

  const { flashes: levelFlashes, dismiss: dismissLevelFlash } = useLevelUpFlash(
    state.heroes.map((h) => ({ id: h.id, level: h.level })),
  );

  const infirmaryLevel = GuildManager.facilityLevel(state, 'infirmary');
  const revivalDiscount = ModifierManager.global(state).revivalDiscount ?? 0;
  const fallenHeroes = state.heroes.filter((h) => h.status === 'fallen');
  const bulkReviveCost = Math.round(
    fallenHeroes.reduce((sum, h) => sum + HeroManager.revivalCost(h, revivalDiscount), 0)
      * (1 - Tuning.get('health.bulkReviveDiscount')),
  );
  const unlockedTombstoneStyles = state.unlockedTombstoneStyles ?? ['plain'];
  const selectedTombstoneStyleId = state.selectedTombstoneStyle ?? 'plain';
  const tombstoneIcon = TOMBSTONE_STYLE_BY_ID[selectedTombstoneStyleId]?.icon ?? 'tombstone.png';

  return (
    <>
      <h2>Heroes</h2>
      <p className="subtitle">{state.heroes.length} of {slots} slots filled. Every hero shares the guild's gold and bonuses.</p>

      {fallenHeroes.length > 1 && (
        <button
          className="chip"
          style={{ marginBottom: 10 }}
          onClick={() => engine.reviveAllFallen()}
          disabled={state.gold < bulkReviveCost}
          title={`Revive all ${fallenHeroes.length} Fallen heroes at once, ${Math.round(Tuning.get('health.bulkReviveDiscount') * 100)}% cheaper than one at a time`}
        >
          Revive All ({fallenHeroes.length}) · {formatGold(bulkReviveCost)}
        </button>
      )}

      <div className="row wrap" style={{ marginBottom: 12, alignItems: 'center' }}>
        <span className="tiny muted">Tombstone style:</span>
        {TOMBSTONE_STYLES.map((style) => {
          const owned = style.id === 'plain' || unlockedTombstoneStyles.includes(style.id);
          const active = selectedTombstoneStyleId === style.id;
          return (
            <button
              key={style.id}
              className={`chip ${active ? 'on' : ''}`}
              title={owned ? style.description : `${style.description} — ${formatGold(style.cost)}`}
              onClick={() => (owned ? engine.selectTombstoneStyle(style.id) : engine.buyTombstoneStyle(style.id))}
              disabled={!owned && state.gold < style.cost}
            >
              {style.name}{!owned && ` · ${formatGold(style.cost)}`}
            </button>
          );
        })}
      </div>

      {state.heroes.map((hero) => {
        const classDef = HERO_CLASSES[hero.heroClass];
        const total = HeroManager.totalStats(hero);
        const toNext = HeroManager.xpToNext(hero);
        const mods = HeroManager.heroMods(state, hero, now);
        const sets = HeroManager.activeSetBonuses(hero);
        const isOpen = expanded.has(hero.id);
        const showingOnDesktop = engine.displayedHero.id === hero.id;
        // Mirrors GameEngine.consumeFreeHeal's own priority (guild daily
        // allowance first, hero's one-time freebie second) purely for
        // the button label/enabled-state -- the engine call is still the
        // actual source of truth when Treat is actually clicked.
        const healsUsedToday = rerollsUsedToday(state.freeHealsUsedToday, state.freeHealDay, now);
        const heroFreeTreatAvailable = healsUsedToday < ModifierManager.freeHealsPerDay(state) || !hero.usedFreeTreat;

        return (
          <div key={hero.id} className="card">
            {levelFlashes[hero.id] && (
              <LevelUpFlash
                key={levelFlashes[hero.id].key}
                levels={levelFlashes[hero.id].levels}
                onDone={() => dismissLevelFlash(hero.id)}
              />
            )}
            <div
              className="row hero-card-summary"
              style={{ alignItems: 'center', gap: 12 }}
              onClick={() => toggleExpanded(hero.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(hero.id); } }}
            >
              {hero.status === 'fallen' ? (
                <Tombstone height={Math.round((isOpen ? 76 : 44) * settings.spriteScale)} icon={tombstoneIcon} />
              ) : (
                <HeroSprite
                  heroClass={hero.heroClass}
                  skin={hero.skin}
                  animation={hero.injuries.length > 0 ? 'hurt' : 'idle'}
                  height={Math.round((isOpen ? 76 : 44) * settings.spriteScale)}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spread">
                  <span className="card-title hero-card-name">
                    {HeroManager.displayTitle(hero) && <span className="hero-title">{HeroManager.displayTitle(hero)}</span>}
                    {hero.name}
                  </span>
                  <span className="small muted">
                    {HeroManager.roleDisplayName(hero)} · Level {hero.level}
                    {hero.ascension > 0 && (
                      <> · {PrestigeManager.rankFor(hero) ?? `ascended ×${hero.ascension}`}</>
                    )}
                    {' · '}<GearScoreBadge score={HeroManager.gearScore(hero)} size="small" />
                  </span>
                </div>
                <div
                  ref={(el) => registerFlyTarget(`heroXp:${hero.id}`, el)}
                  className="bar xp"
                  style={{ marginTop: 6 }}
                >
                  <span style={{ width: `${(hero.xp / toNext) * 100}%` }} />
                </div>
                <HealthBar hero={hero} compact />
                <AutoHealBar hero={hero} infirmaryLevel={infirmaryLevel} />
                {!isOpen && (
                  <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                    {hero.status === 'fallen'
                      ? <span className="bad">Fallen</span>
                      : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                    {hero.injuries.length > 0 && (
                      <span className="bad"> · {hero.injuries.map((i) => i.name).join(', ')} (expand to Treat)</span>
                    )}
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

                {hero.titles.length > 0 && (
                  <div className="row" style={{ alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span className="tiny muted">Title</span>
                    <select
                      value={hero.activeTitle ?? ''}
                      onChange={(e) => engine.setActiveTitle(hero.id, e.target.value || null)}
                    >
                      <option value="">None</option>
                      {hero.titles.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                <div className="small muted" style={{ marginBottom: 3 }}>
                  Experience {hero.xp} / {toNext}
                </div>
                <div className="bar xp"><span style={{ width: `${(hero.xp / toNext) * 100}%` }} /></div>

                <div className="small muted" style={{ marginTop: 8, marginBottom: 3 }}>
                  Health
                </div>
                <HealthBar hero={hero} />
                <AutoHealBar hero={hero} infirmaryLevel={infirmaryLevel} />

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
                            className="btn-primary"
                            onClick={() => engine.treatInjury(hero.id, injury.id)}
                            disabled={!heroFreeTreatAvailable && state.gold < injury.treatmentCost}
                            title={heroFreeTreatAvailable ? 'Free -- on the guild' : undefined}
                          >
                            {heroFreeTreatAvailable ? 'Treat · Free' : `Treat · ${formatGold(injury.treatmentCost)}`}
                          </button>
                          <button
                            className="btn-primary"
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

                {hero.status === 'fallen' && (
                  <div style={{ marginTop: 8 }}>
                    <div className="spread">
                      <span className="small bad">
                        Fallen
                        {infirmaryAutoReviveUnlocked(infirmaryLevel) && hero.fallenAt
                          ? ' — recovers on its own, or pay to skip'
                          : ' — needs to be revived before being sent out again'}
                      </span>
                      <button
                        onClick={() => engine.reviveHero(hero.id)}
                        disabled={state.gold < HeroManager.revivalCost(hero, revivalDiscount)}
                      >
                        Revive · {formatGold(HeroManager.revivalCost(hero, revivalDiscount))}
                      </button>
                    </div>
                    {infirmaryAutoReviveUnlocked(infirmaryLevel) && hero.fallenAt && (() => {
                      const totalMs = Tuning.get('guild_facility.infirmary.autoReviveHours') * HOUR;
                      const remainingMs = Math.max(0, hero.fallenAt + totalMs - now);
                      const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
                      return (
                        <>
                          <div className="bar heal-timer" style={{ marginTop: 4 }} title="Time until free auto-revive">
                            <span style={{ width: `${ratio * 100}%` }} />
                          </div>
                          <div className="tiny muted">Auto-revive — ready in {formatDuration(remainingMs)}</div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <p className="tiny muted" style={{ marginTop: 8 }}>
                  Prefers {classDef.preferred.join(', ')} contracts (+{classDef.preferredBonus}% success) ·
                  {' '}{hero.questsCompleted} quests completed ·
                  {' '}{hero.status === 'fallen' ? 'Fallen' : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                </p>

                <div className="row wrap" style={{ marginTop: 6, alignItems: 'center' }}>
                  <span className="tiny muted">Role (raid parties only):</span>
                  {ROLES.map((roleDef) => {
                    const unlocked = HeroManager.unlockedRoles(hero).includes(roleDef.id);
                    const active = HeroManager.activeRole(hero) === roleDef.id;
                    const cost = HeroManager.roleCost(hero, roleDef.id);
                    return (
                      <button
                        key={roleDef.id}
                        className={`skin-chip ${active ? 'on' : ''}`}
                        disabled={active || state.gold < cost}
                        title={active ? undefined : `Train as ${classDef.roleFlavors[roleDef.id]} -- ${unlocked ? 'swap' : 'unlock'} for ${formatGold(cost)}`}
                        onClick={() => engine.trainRole(hero.id, roleDef.id)}
                      >
                        {roleDef.name}{!active && ` · ${formatGold(cost)}`}
                      </button>
                    );
                  })}
                </div>

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
