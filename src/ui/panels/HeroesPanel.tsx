import { useRef, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { HeroManager } from '../../game/managers/HeroManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { rerollsUsedToday } from '../../game/data/reroll';
import { HERO_CLASSES, PRESTIGE_MIN_LEVEL, RECRUIT_COST, SKINS, infirmaryAutoReviveUnlocked, TOMBSTONE_STYLES, TOMBSTONE_STYLE_BY_ID } from '../../game/data/progression';
import { heroMilestoneUnlocked } from '../../game/data/heroMilestones';
import { Tuning } from '../../game/data/tuning';
import { HeroClass, Hero, Stats } from '../../game/types';
import { describeMods, formatDuration, formatGold, HOUR, roleAwareStatLabel } from '../../game/util';
import { HeroSprite } from '../sprites/HeroSprite';
import { HeroStatusList } from '../HeroStatusBar';
import { GearScoreBadge } from '../GearScoreBadge';
import { RoleIcon } from '../RoleIcon';
import { useLevelUpFlash, LevelUpFlash } from '../levelFlash';
import { useReviveFlash, ReviveFlash } from '../reviveFlash';
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
      <div className="tiny muted">Auto Heal, full in {formatDuration(eta)}</div>
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

  // Hero Comparison table (patch 0249) -- behind its own button rather
  // than shown by default, direct request. See HeroComparisonModal's own
  // comment for the counters it reads.
  const [showComparison, setShowComparison] = useState(false);

  const { flashes: levelFlashes, dismiss: dismissLevelFlash } = useLevelUpFlash(
    state.heroes.map((h) => ({ id: h.id, level: h.level })),
  );
  const { flashes: reviveFlashes, dismiss: dismissReviveFlash } = useReviveFlash(
    state.heroes.map((h) => ({ id: h.id, fallen: h.status === 'fallen' })),
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
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/heroes.jpg)' }}>
      <div className="tab-scene-content">
      <h2>Heroes</h2>
      <p className="subtitle">{state.heroes.length} of {slots} slots filled. Every hero shares the guild's gold and bonuses.</p>

      {state.heroes.length > 1 && (
        <button className="chip" style={{ marginBottom: 10 }} onClick={() => setShowComparison(true)}>
          Compare Heroes
        </button>
      )}
      {showComparison && <HeroComparisonModal heroes={state.heroes} onClose={() => setShowComparison(false)} />}

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
              title={owned ? style.description : `${style.description}, ${formatGold(style.cost)}`}
              onClick={() => (owned ? engine.selectTombstoneStyle(style.id) : engine.buyTombstoneStyle(style.id))}
              disabled={!owned && state.gold < style.cost}
            >
              {style.name}{!owned && ` · ${formatGold(style.cost)}`}
            </button>
          );
        })}
      </div>

      {settings.heroStatusBars ? (
        // Status bars (Settings > Knight) -- a compact, sorted list of
        // every hero's current status instead of the full per-hero card
        // grid below. Deliberately a full replacement, not a toggle on
        // each card: the whole point is a faster "what's about to
        // finish" scan across the roster, which a card-by-card sprite
        // swap wouldn't give. Recruiting/comparison/tombstone-style
        // controls above stay visible either way -- only the roster
        // body itself swaps.
        <HeroStatusList engine={engine} now={now} />
      ) : (
      state.heroes.map((hero) => {
        const classDef = HERO_CLASSES[hero.heroClass];
        const total = HeroManager.totalStats(hero);
        const toNext = HeroManager.xpToNext(hero);
        // Same reasoning as DashboardPanel's own Ring -- a maxed hero's
        // xp is zeroed the instant it hits the cap (HeroManager.grantXp),
        // so both bars below need this to read as "full/done" rather than
        // a stalled-at-0 bar with no level left to actually fill it.
        const maxed = HeroManager.isMaxLevel(hero);
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
            {reviveFlashes[hero.id] && (
              <ReviveFlash
                key={reviveFlashes[hero.id].key}
                onDone={() => dismissReviveFlash(hero.id)}
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
                    {hero.name}
                    {HeroManager.displayTitle(hero) && <span className="hero-title">, {HeroManager.displayTitle(hero)}</span>}
                  </span>
                  <span className="small muted">
                    <RoleIcon role={HeroManager.activeRole(hero)} size={14} /> {HeroManager.roleDisplayName(hero)} · Level {hero.level}
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
                  <span style={{ width: `${maxed ? 100 : (hero.xp / toNext) * 100}%` }} />
                </div>
                <HealthBar hero={hero} compact />
                <AutoHealBar hero={hero} infirmaryLevel={infirmaryLevel} />
                {!isOpen && (
                  <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                    {hero.status === 'fallen'
                      ? <span className="bad">Fallen</span>
                      : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                    {hero.status === 'questing' && (() => {
                      // Direct request: a hero mid-chain showed nowhere
                      // that they're on stage N of M without going back
                      // into Discovered Quests -- Discovered Quests and
                      // the Lore tab both already showed this, this card
                      // was the one place that didn't. Covers replay
                      // stages too (ActiveQuest.offer.chain is set either
                      // way); no chain name shown here, matching
                      // DiscoveredQuestsPanel's own compact "Chain N/M"
                      // wording rather than a longer line.
                      const active = state.activeQuests.find((q) => q.heroId === hero.id);
                      const chain = active?.offer.chain;
                      return chain ? <span> · Chain {chain.stage + 1}/{chain.totalStages}</span> : null;
                    })()}
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
                <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button
                    className={`chip ${showingOnDesktop ? 'on' : ''}`}
                    onClick={() => engine.setFocusedHero(hero.id)}
                    disabled={showingOnDesktop}
                    title="Shows this hero on the desktop companion"
                  >
                    {showingOnDesktop ? '● Showing on desktop' : 'Show on desktop'}
                  </button>
                  {/* Patch 0287, direct request -- free cosmetic reroll from
                      the hero's own class name pool, same "no confirmation
                      needed, nothing lost" shape as the skin picker below.
                      Exists mainly to fix same-class name collisions (each
                      class only had 5 names before this patch's pool
                      expansion) without having to retire a hero over it. */}
                  <button
                    className="chip"
                    onClick={() => engine.rerollHeroName(hero.id)}
                    title="Rerolls this hero's name from their class's name pool"
                  >
                    ⟲ Reroll Name
                  </button>
                </div>
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
                  {maxed ? 'Max level' : `Experience ${hero.xp} / ${toNext}`}
                </div>
                <div className="bar xp"><span style={{ width: `${maxed ? 100 : (hero.xp / toNext) * 100}%` }} /></div>

                <div className="small muted" style={{ marginTop: 8, marginBottom: 3 }}>
                  Health
                </div>
                <HealthBar hero={hero} />
                <AutoHealBar hero={hero} infirmaryLevel={infirmaryLevel} />
                <div className="stat-row" style={{ marginTop: 8 }}>
                  {STAT_KEYS.map((key) => (
                    <span key={key}>
                      {roleAwareStatLabel(key, HeroManager.activeRole(hero))} <b>{Math.round(total[key])}</b>
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
                          {injury.name}, heals in {formatDuration(injury.healsAt - now)}
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
                          ? ', recovers on its own, or pay to skip'
                          : ', needs to be revived before being sent out again'}
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
                          <div className="tiny muted">Auto-revive, ready in {formatDuration(remainingMs)}</div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <p className="tiny muted" style={{ marginTop: 8 }}>
                  Prefers {classDef.preferred.join(', ')} contracts (+{classDef.preferredBonus}% success) ·
                  {' '}{hero.questsCompleted} quests completed ·
                  {' '}{hero.status === 'fallen' ? 'Fallen' : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                  {hero.status === 'questing' && (() => {
                    const active = state.activeQuests.find((q) => q.heroId === hero.id);
                    const chain = active?.offer.chain;
                    return chain ? <> (Chain {chain.stage + 1}/{chain.totalStages})</> : null;
                  })()}
                </p>
                <p className="tiny muted" style={{ marginTop: 2 }}>
                  Role: <RoleIcon role={HeroManager.activeRole(hero)} size={13} /> {HeroManager.roleDisplayName(hero)} -- change it from the Training tab.
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
                        title={owned ? sk.name : `${sk.name}, buy in the Skins shop below`}
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
      })
      )}

      <div className="section-heading">Recruit</div>
      {state.heroes.length >= slots && (
        <>
          <p className="small muted">
            No free slots. The Tavern adds one per level up to 5; beyond that, retire a hero at
            level {PRESTIGE_MIN_LEVEL}+ in the Prestige tab for Heroic Renown, then spend it on Extra Banner
            (up to 4 more). {slots} is not necessarily your ceiling.
          </p>
          {/* Two possible paths named in the prose above, so two links --
              same "jump to and highlight the requirement" treatment every
              other locked-purchase message in the game now gets. */}
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <button className="btn-ghost" onClick={() => engine.requestTab('guild', 'tavern')}>
              Go to Tavern →
            </button>
            <button className="btn-ghost" onClick={() => engine.requestTab('prestige', 'extra_banner')}>
              Go to Prestige →
            </button>
          </div>
        </>
      )}
      <div className="grid three">
        {(Object.keys(HERO_CLASSES) as HeroClass[]).map((id) => {
          const def = HERO_CLASSES[id];
          const unlocked = recruitable.includes(id);
          // Patch 0251 -- mirrors GuildManager.recruit's own cost logic
          // exactly (milestoneGoldCost once the milestone is met, plain
          // RECRUIT_COST otherwise), so the displayed price and afford
          // check never drift from what a click would actually charge.
          const milestoneMet = heroMilestoneUnlocked(state, id);
          const cost = (def.milestoneGoldCost != null && milestoneMet) ? def.milestoneGoldCost : RECRUIT_COST[id];
          const tavernUnlocked = GuildManager.facilityLevel(state, 'tavern') >= def.unlockTavernLevel;
          const slotsFull = state.heroes.length >= slots;
          // One of every hero (patch 0219) -- once a class has a living
          // hero in the roster, it's permanently done recruiting; see
          // GuildManager.classAlreadyRecruited's own comment for why
          // this never needs to un-set later.
          const alreadyRecruited = GuildManager.classAlreadyRecruited(state, id);
          return (
            <div key={id} className="card" style={{ marginBottom: 0 }}>
              <div className="card-title">{def.name}</div>
              <p className="card-flavour">{def.blurb}</p>
              <div className="stat-row" style={{ marginBottom: 8 }}>
                {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
              </div>
              {/* Patch 0251 -- shown for any class with a milestone path,
                  locked or not, so the alternate route is always visible
                  rather than only appearing once it's already met. Once
                  met, the checkmark line replaces the plain description
                  so it reads as "done" rather than repeating an
                  instruction that's no longer relevant. */}
              {def.milestoneUnlockDescription && (
                <p className="tiny muted" style={{ margin: '0 0 6px' }}>
                  {milestoneMet
                    ? <span className="good">✓ Milestone met -- {formatGold(def.milestoneGoldCost ?? 0)} recruit unlocked</span>
                    : <>Or: {def.milestoneUnlockDescription}</>}
                </p>
              )}
              <button
                className="btn-primary"
                disabled={!unlocked || state.gold < cost || slotsFull || alreadyRecruited}
                onClick={() => engine.recruit(id)}
              >
                {alreadyRecruited
                  ? 'Already Recruited'
                  : !unlocked
                    ? `Tavern level ${def.unlockTavernLevel}`
                    : slotsFull ? 'No free slots' : `Recruit · ${formatGold(cost)}`}
              </button>
              {/* Direct feedback: a locked purchase should link straight to
                  where the blocking requirement actually gets fixed, not
                  just name it. Jumps to the Guild Hall and glows the
                  Tavern card itself (see GuildPanel's highlightId/
                  UpgradeCard) rather than leaving the player to hunt for
                  it among every facility card by hand. Skipped once the
                  class is only still locked because of the milestone (the
                  Tavern route wouldn't even be the reason to follow) --
                  tavernUnlocked distinguishes "locked, Tavern would help"
                  from "unlocked via milestone, Tavern link irrelevant". */}
              {!unlocked && !tavernUnlocked && (
                <button
                  className="btn-ghost"
                  style={{ width: '100%', marginTop: 4, fontSize: '0.6875rem' }}
                  onClick={() => engine.requestTab('guild', 'tavern')}
                >
                  Go to Tavern →
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-heading">Skins</div>
      <p className="small muted">
        Cosmetic liveries, unlocked once for the whole guild and usable by any hero.
        A pure gold sink, no effect on stats.
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
      </div>
    </div>
  );
}

type CompareSortKey = 'name' | 'level' | 'gearScore' | 'quests' | 'raids' | 'gold' | 'xp';

/**
 * Hero Comparison table (patch 0249) -- direct request: "something where
 * you can compare your heroes' individual actions/success/gold." Behind
 * its own button rather than shown by default (HeroesPanel's own
 * "Compare Heroes" chip), and only offered at all once there's more than
 * one hero to actually compare.
 *
 * Every column beyond Gear Score reads from the five new lifetime
 * counters on Hero (see that type's own comment for the full reasoning
 * on scope/attribution) -- Gear Score itself needed no new tracking at
 * all, HeroManager.gearScore(hero) already existed and is computed live
 * here, not stored.
 *
 * Quests/Raids show success rate as "won/attempted (pct%)" rather than
 * just a raw count -- a hero with 40 successful quests out of 40 sent
 * and one with 40 out of 80 both show "40" if only the numerator is
 * shown, which erases exactly the comparison this table exists to make.
 */
function HeroComparisonModal({ heroes, onClose }: { heroes: Hero[]; onClose: () => void }) {
  const [sortKey, setSortKey] = useState<CompareSortKey>('gearScore');
  const [sortDesc, setSortDesc] = useState(true);

  const rows = heroes.map((h) => {
    const gearScore = HeroManager.gearScore(h);
    const questRate = h.questsCompleted > 0 ? h.questsSucceeded / h.questsCompleted : 0;
    const raidRate = h.raidsParticipated > 0 ? h.raidsSucceeded / h.raidsParticipated : 0;
    return { hero: h, gearScore, questRate, raidRate };
  });

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.hero.name.localeCompare(b.hero.name); break;
      case 'level': cmp = a.hero.level - b.hero.level; break;
      case 'gearScore': cmp = a.gearScore - b.gearScore; break;
      case 'quests': cmp = a.hero.questsSucceeded - b.hero.questsSucceeded; break;
      case 'raids': cmp = a.hero.raidsSucceeded - b.hero.raidsSucceeded; break;
      case 'gold': cmp = a.hero.goldEarnedLifetime - b.hero.goldEarnedLifetime; break;
      case 'xp': cmp = a.hero.xpEarnedLifetime - b.hero.xpEarnedLifetime; break;
    }
    return sortDesc ? -cmp : cmp;
  });

  function sortBy(key: CompareSortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  const arrow = (key: CompareSortKey) => (key === sortKey ? (sortDesc ? ' \u25be' : ' \u25b4') : '');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Compare Heroes</span>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table className="hero-compare-table">
            <thead>
              <tr>
                <th onClick={() => sortBy('name')}>Hero{arrow('name')}</th>
                <th onClick={() => sortBy('level')}>Lvl{arrow('level')}</th>
                <th onClick={() => sortBy('gearScore')}>Gear{arrow('gearScore')}</th>
                <th onClick={() => sortBy('quests')}>Quests{arrow('quests')}</th>
                <th onClick={() => sortBy('raids')}>Raids{arrow('raids')}</th>
                <th onClick={() => sortBy('gold')}>Gold{arrow('gold')}</th>
                <th onClick={() => sortBy('xp')}>XP{arrow('xp')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ hero, gearScore, questRate, raidRate }) => (
                <tr key={hero.id}>
                  <td>{hero.name}</td>
                  <td>{hero.level}</td>
                  <td><GearScoreBadge score={gearScore} size="small" /></td>
                  <td title={`${hero.questsSucceeded} won of ${hero.questsCompleted} sent`}>
                    {hero.questsCompleted > 0 ? `${hero.questsSucceeded}/${hero.questsCompleted} (${Math.round(questRate * 100)}%)` : '\u2014'}
                  </td>
                  <td title={`${hero.raidsSucceeded} cleared of ${hero.raidsParticipated} joined`}>
                    {hero.raidsParticipated > 0 ? `${hero.raidsSucceeded}/${hero.raidsParticipated} (${Math.round(raidRate * 100)}%)` : '\u2014'}
                  </td>
                  <td>{formatGold(hero.goldEarnedLifetime)}</td>
                  <td>{Math.round(hero.xpEarnedLifetime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Click a column to sort. Quests/Raids show wins out of attempts. Tracking started with this
          update, so older heroes' totals only count from here forward.
        </p>
      </div>
    </div>
  );
}
