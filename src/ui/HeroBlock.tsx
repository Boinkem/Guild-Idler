import { useState } from 'react';
import { HeroManager } from '../game/managers/HeroManager';
import { GuildManager } from '../game/managers/GuildManager';
import { ModifierManager } from '../game/managers/ModifierManager';
import { PrestigeManager } from '../game/managers/PrestigeManager';
import { InventoryManager } from '../game/managers/InventoryManager';
import { rerollsUsedToday } from '../game/data/reroll';
import { HERO_CLASSES, SKINS, infirmaryAutoReviveUnlocked, statResetCost } from '../game/data/progression';
import { Tuning } from '../game/data/tuning';
import { Hero } from '../game/types';
import { describeMods, formatDuration, formatGold, formatNumber, HOUR } from '../game/util';
import { HeroSprite } from './sprites/HeroSprite';
import { GearScoreBadge } from './GearScoreBadge';
import { RoleIcon } from './RoleIcon';
import { registerFlyTarget } from './flyTarget';
import { statEffectBlocks, formatEffect } from './heroStatEffects';

/**
 * The hero card, rebuilt as a character block (hero-card redesign).
 *
 * Replaces the old flat card body in HeroesPanel: a portrait plate with
 * level/class/lifetime figures down the left, the identity + status header
 * across the top, XP and Health side by side, then the attribute grid --
 * where each stat now states which modifiers it feeds, its computed
 * contribution, and the marginal value of the next point (see
 * heroStatEffects.ts). Nothing about the underlying model changed; this is
 * presentation only, and every number still comes from the same managers
 * the old card read.
 *
 * Styling lives in src/styles/hero-card.css, on the existing app.css
 * tokens -- no new colours were introduced.
 */

function Tombstone({ height, icon }: { height: number; icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="hero-block-portrait-fallback" style={{ fontSize: height * 0.55 }}>💀</div>;
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

function Meter({ ratio, tint, className }: { ratio: number; tint?: string; className?: string }) {
  return (
    <div className={`hero-block-meter ${className ?? ''}`}>
      <span style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: tint }} />
    </div>
  );
}

export interface HeroBlockProps {
  hero: Hero;
  /** The live engine (useEngine()) -- every action button calls straight
   *  through to it, exactly as the old inline card did. */
  engine: any;
  now: number;
  settings: { spriteScale: number };
  tombstoneIcon: string;
  isOpen: boolean;
  onToggle: () => void;
  /** Level-up / revive flash overlays, still owned by HeroesPanel. */
  children?: React.ReactNode;
}

export function HeroBlock({
  hero, engine, now, settings, tombstoneIcon, isOpen, onToggle, children,
}: HeroBlockProps) {
  const state = engine.state;
  const classDef = HERO_CLASSES[hero.heroClass];
  const role = HeroManager.activeRole(hero);
  const total = HeroManager.totalStats(hero);
  const maxed = HeroManager.isMaxLevel(hero);
  const toNext = HeroManager.xpToNext(hero);
  const xpRatio = maxed ? 1 : hero.xp / toNext;

  const maxHealth = HeroManager.maxHealth(hero);
  const health = HeroManager.currentHealth(hero);
  const healthRatio = maxHealth > 0 ? health / maxHealth : 0;

  const infirmaryLevel = GuildManager.facilityLevel(state, 'infirmary');
  const healEta = HeroManager.healthRegenEtaMs(hero, infirmaryLevel);

  const mods = HeroManager.heroMods(state, hero, now);
  const sets = HeroManager.activeSetBonuses(hero);
  const blocks = statEffectBlocks(total, role, hero.heroClass, hero.level);
  const bandages = InventoryManager.count(state, 'field_bandage');
  const revivalDiscount = ModifierManager.global(state).revivalDiscount ?? 0;
  const healsUsedToday = rerollsUsedToday(state.freeHealsUsedToday, state.freeHealDay, now);
  const freeTreat = healsUsedToday < ModifierManager.freeHealsPerDay(state) || !hero.usedFreeTreat;
  const showingOnDesktop = engine.displayedHero.id === hero.id;
  const fallen = hero.status === 'fallen';
  const activeChain = state.activeQuests.find((q: any) => q.heroId === hero.id)?.offer.chain;
  const spriteHeight = Math.round(96 * settings.spriteScale);

  // Collapsed by default (patch 0295) -- direct feedback: with the full
  // portrait/vitals/attribute grid always rendered per hero, a roster of
  // even three or four heroes ate most of the screen. Mirrors the
  // pre-redesign card's own "condensed by default, click to expand" shape
  // (see HeroesPanel's own `expanded` Set, which still gates the SEPARATE
  // bottom detail panel once this card is open -- two independent levels
  // of disclosure, not one). Local state, not lifted to HeroesPanel: each
  // card remembers its own collapse state independently and doesn't need
  // to survive a re-render the way the detail panel's isOpen does (no
  // level-up/revive flash timing depends on it).
  const [collapsed, setCollapsed] = useState(true);

  if (collapsed) {
    return (
      <div className={`card hero-block hero-block-summary ${fallen ? 'fallen' : ''}`}>
        {children}
        <div
          className="hero-block-summary-row"
          onClick={() => setCollapsed(false)}
          role="button"
          tabIndex={0}
          aria-expanded={false}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(false); } }}
        >
          <div className="hero-block-summary-sprite">
            {fallen
              ? <Tombstone height={Math.round(44 * settings.spriteScale)} icon={tombstoneIcon} />
              : (
                <HeroSprite
                  heroClass={hero.heroClass}
                  skin={hero.skin}
                  animation={hero.injuries.length > 0 ? 'hurt' : 'idle'}
                  height={Math.round(44 * settings.spriteScale)}
                />
              )}
          </div>
          <div className="hero-block-summary-body">
            <div className="spread">
              <span className="hero-block-summary-name">
                {hero.name}
                <span className="tiny muted"> Lv {hero.level} {classDef.name}</span>
              </span>
              <span className={`tiny ${fallen ? 'bad' : 'good'}`}>
                {fallen ? 'Fallen' : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                {activeChain && ` · Chain ${activeChain.stage + 1}/${activeChain.totalStages}`}
              </span>
            </div>
            {/* Same fly-target key as the expanded XP bar below -- only one
                of the two is ever mounted at a time (collapsed vs. not),
                and registerFlyTarget just re-points to whichever is
                currently in the DOM, same pattern the pre-redesign card's
                own compact/expanded split already relied on. */}
            <div ref={(el) => registerFlyTarget(`heroXp:${hero.id}`, el)} className="bar xp mini">
              <span style={{ width: `${xpRatio * 100}%` }} />
            </div>
            <div className={`bar health mini ${healthRatio < 0.25 ? 'low' : ''}`}>
              <span style={{ width: `${healthRatio * 100}%` }} />
            </div>
          </div>
          <span className="hero-block-summary-expand" aria-hidden="true">▼</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`card hero-block ${fallen ? 'fallen' : ''}`}>
      {children}
      <div className="hero-block-grid">

        <div className="hero-block-portrait">
          <div className="hero-block-plate">
            {fallen
              ? <Tombstone height={spriteHeight} icon={tombstoneIcon} />
              : (
                <HeroSprite
                  heroClass={hero.heroClass}
                  skin={hero.skin}
                  animation={hero.injuries.length > 0 ? 'hurt' : 'idle'}
                  height={spriteHeight}
                />
              )}
          </div>
          <div className="hero-block-level">
            <span className="hero-block-level-num">Lv {hero.level}</span>
            <span className="tiny muted">{classDef.name}</span>
          </div>
          {hero.ascension > 0 && (
            <div className="tiny hero-block-ascension">
              ★ {PrestigeManager.rankFor(hero) ?? `Ascended ×${hero.ascension}`}
            </div>
          )}
          <div className="hero-block-ledger">
            <div><span>Gear score</span><GearScoreBadge score={HeroManager.gearScore(hero)} size="small" /></div>
            <div><span>Quests won</span><b>{hero.questsSucceeded} / {hero.questsCompleted}</b></div>
            <div><span>Lifetime gold</span><b>{formatGold(hero.goldEarnedLifetime)}</b></div>
            <div><span>Lifetime xp</span><b>{formatNumber(hero.xpEarnedLifetime)}</b></div>
            {/* Renown-from-retirement preview (patch 0295) -- reuses the
                exact same PrestigeManager call PrestigePanel's own retire
                list already uses, just surfaced here too so a player
                doesn't have to leave the Heroes tab to check whether a
                hero's worth retiring yet. Shown regardless of eligibility
                (same as PrestigePanel), since watching it grow while
                under-level is itself part of the motivation. */}
            <div><span>Retire for</span><b className="gold-text">✦ {formatNumber(PrestigeManager.streakPreview(state, hero, now).total)}</b></div>
          </div>
        </div>

        <div className="hero-block-body">

          <div className="hero-block-head">
            <div className="hero-block-identity">
              <div className="hero-block-name">
                {hero.name}
                {HeroManager.displayTitle(hero) && <span className="hero-title">, {HeroManager.displayTitle(hero)}</span>}
              </div>
              <div className="hero-block-meta">
                <span className="hero-block-role"><RoleIcon role={role} size={12} /> {HeroManager.roleDisplayName(hero)}</span>
                <span className={fallen ? 'bad' : 'good'}>
                  ● {fallen ? 'Fallen' : (hero.status === 'questing' ? 'away on a quest' : 'at the guild')}
                  {activeChain && ` · Chain ${activeChain.stage + 1}/${activeChain.totalStages}`}
                </span>
                <span>prefers {classDef.preferred.join(', ')} <span className="good">+{classDef.preferredBonus}% success</span></span>
              </div>
            </div>
            <div className="hero-block-actions">
              <button
                className={`chip ${showingOnDesktop ? 'on' : ''}`}
                disabled={showingOnDesktop}
                onClick={() => engine.setFocusedHero(hero.id)}
                title="Shows this hero on the desktop companion"
              >
                {showingOnDesktop ? '● On desktop' : 'Show on desktop'}
              </button>
              <button className="btn-ghost hero-block-expand" onClick={onToggle}>
                {isOpen ? 'Less ▲' : 'More ▼'}
              </button>
              <button
                className="btn-ghost hero-block-expand"
                onClick={() => setCollapsed(true)}
                title="Collapse this card back to a summary row"
              >
                ⌃ Collapse
              </button>
            </div>
          </div>

          <div className="hero-block-vitals">
            <div>
              <div className="hero-block-vital-head">
                <span>EXPERIENCE</span>
                <span>{maxed ? 'Max level' : `${hero.xp.toLocaleString()} / ${toNext.toLocaleString()}`}</span>
              </div>
              <div ref={(el) => registerFlyTarget(`heroXp:${hero.id}`, el)} className="bar xp">
                <span style={{ width: `${xpRatio * 100}%` }} />
              </div>
              <div className="tiny muted">
                {maxed ? 'no further levels' : `${Math.max(0, Math.round(toNext - hero.xp)).toLocaleString()} xp to level ${hero.level + 1}`}
              </div>
            </div>
            <div>
              <div className="hero-block-vital-head">
                <span>HEALTH</span>
                <span>{Math.round(health)} / {maxHealth}</span>
              </div>
              <div className={`bar health ${healthRatio < 0.25 ? 'low' : ''}`}>
                <span style={{ width: `${healthRatio * 100}%` }} />
              </div>
              {healEta > 0 ? (
                <div className="tiny muted">Auto heal · full in {formatDuration(healEta)}</div>
              ) : (
                <div className="tiny muted">{fallen ? 'needs reviving' : 'at full health'}</div>
              )}
            </div>
          </div>

          <div className="hero-block-rule">
            <span className="hero-block-rule-label">ATTRIBUTES</span>
            {hero.statPoints > 0 && <span className="hero-block-points">{hero.statPoints} training points</span>}
            {/* Stat reset (patch 0295), direct request: no way to walk back
                a mis-allocated point before this. Only offered once a
                hero's past level 1 -- a level-1 hero has never had a point
                granted yet, so there's nothing to undo. Gold-gated via the
                same statResetCost the engine call itself charges, so the
                button's disabled state never drifts from what clicking it
                would actually do. */}
            {hero.level > 1 && (
              <button
                className="btn-ghost hero-block-reset"
                onClick={() => engine.resetHeroStats(hero.id)}
                disabled={state.gold < statResetCost(hero.level)}
                title={`Refunds every spent training point back to unspent, for ${formatGold(statResetCost(hero.level))}. Gear and ascension bonuses are untouched.`}
              >
                ⟲ Reset · {formatGold(statResetCost(hero.level))}
              </button>
            )}
          </div>

          <div className="hero-block-stats">
            {blocks.map((block) => (
              <div key={block.key} className="hero-stat" style={{ borderLeftColor: block.tint }}>
                <div className="hero-stat-head">
                  <span className="hero-stat-glyph" style={{ borderColor: block.tint, color: block.tint }}>{block.glyph}</span>
                  <span className="hero-stat-name">
                    <b>{block.label}</b>
                    <span className="tiny muted">{block.blurb}</span>
                  </span>
                  <span className="hero-stat-value">{block.value}</span>
                  {hero.statPoints > 0 && (
                    <button
                      className="btn-ghost hero-stat-add"
                      onClick={() => engine.allocateStat(hero.id, block.key)}
                      title={`Spend a training point on ${block.label}`}
                    >+</button>
                  )}
                </div>
                <div className="hero-stat-lines">
                  {block.lines.map((line) => (
                    <div key={line.label} className="hero-stat-line">
                      <span className="hero-stat-line-label">{line.label}</span>
                      <Meter ratio={line.ratio} tint={line.tint} />
                      <b>{formatEffect(line.value, line.format)}</b>
                    </div>
                  ))}
                  <div className="tiny hero-stat-marginal">
                    Next point: <span>{block.marginal}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isOpen && (
            <div className="hero-block-details">
              <div className="hero-block-panels">
                <div className="hero-block-panel">
                  <div className="hero-block-panel-label">TOTAL MODIFIERS</div>
                  <div className="hero-block-mods">
                    {describeMods(mods).map((line) => <span key={line}>{line}</span>)}
                  </div>
                  {sets.length > 0 && (
                    <div className="tiny hero-block-sets">
                      {sets.map((s: any) => `${s.setName}: ${s.label}`).join(' · ')}
                    </div>
                  )}
                </div>

                {(hero.injuries.length > 0 || fallen) && (
                  <div className="hero-block-panel hero-block-panel-danger">
                    <div className="hero-block-panel-label">{fallen ? 'FALLEN' : 'INJURIES'}</div>
                    {hero.injuries.map((injury) => (
                      <div key={injury.id} className="hero-block-injury">
                        <div>
                          <div className="small bad">{injury.name}</div>
                          <div className="tiny muted">heals in {formatDuration(injury.healsAt - now)}</div>
                        </div>
                        <div className="row">
                          <button
                            className="btn-primary"
                            onClick={() => engine.treatInjury(hero.id, injury.id)}
                            disabled={!freeTreat && state.gold < injury.treatmentCost}
                            title={freeTreat ? 'Free -- on the guild' : undefined}
                          >
                            {freeTreat ? 'Treat · Free' : `Treat · ${formatGold(injury.treatmentCost)}`}
                          </button>
                          <button
                            className="btn-primary"
                            onClick={() => engine.useConsumable(hero.id, 'field_bandage')}
                            disabled={bandages === 0}
                          >
                            Bandage ×{bandages}
                          </button>
                        </div>
                      </div>
                    ))}
                    {fallen && (
                      <div className="hero-block-injury">
                        <div className="tiny muted">
                          {infirmaryAutoReviveUnlocked(infirmaryLevel) && hero.fallenAt
                            ? `Auto-revive in ${formatDuration(hero.fallenAt + Tuning.get('guild_facility.infirmary.autoReviveHours') * HOUR - now)}`
                            : 'needs reviving before being sent out again'}
                        </div>
                        <button
                          className="btn-primary"
                          onClick={() => engine.reviveHero(hero.id)}
                          disabled={state.gold < HeroManager.revivalCost(hero, revivalDiscount)}
                        >
                          Revive · {formatGold(HeroManager.revivalCost(hero, revivalDiscount))}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="card-flavour">{classDef.blurb}</p>

              {hero.titles.length > 0 && (
                <div className="row hero-block-title-row">
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

              <div className="row wrap hero-block-livery">
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
                <button className="chip" onClick={() => engine.rerollHeroName(hero.id)} title="Rerolls this hero's name from their class's name pool">
                  ⟲ Reroll Name
                </button>
              </div>

              <p className="tiny muted hero-block-footnote">
                Success / gold / xp / injury resist / quest speed are additive points summed with class,
                gear and guild bonuses. Success also smooths out at high totals (diminishing returns
                past a point), so a very geared hero's real quest odds can land a little under the sum
                of these lines. Rare loot is a separate multiplier on drop chance — don't add it
                to the others. Role is changed from the Training tab.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
