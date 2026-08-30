import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { HeroManager } from '../../game/managers/HeroManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { HERO_CLASSES, HeroClassDef, PRESTIGE_MIN_LEVEL, RECRUIT_COST, SKINS, TOMBSTONE_STYLES, TOMBSTONE_STYLE_BY_ID } from '../../game/data/progression';
import { heroMilestoneUnlocked } from '../../game/data/heroMilestones';
import { Tuning } from '../../game/data/tuning';
import type { GameEngine } from '../../game/engine';
import { HeroClass, Hero } from '../../game/types';
import { describeMods, formatGold } from '../../game/util';
import { HeroStatusList } from '../HeroStatusBar';
import { GearScoreBadge } from '../GearScoreBadge';
import { useLevelUpFlash, LevelUpFlash } from '../levelFlash';
import { useReviveFlash, ReviveFlash } from '../reviveFlash';
import { HeroBlock } from '../HeroBlock';

/**
 * Patch 0296. Recruit-card portrait for a hero class -- mirrors
 * chainBannerSrc's own convention exactly (see QuestPanel.tsx): an unset
 * `portrait` override just falls back to `<id>.png` in a well-known
 * folder at dead-center focus, so art can be dropped in by filename alone
 * with no DevTool trip required, but a class whose source sprite needs a
 * tighter/looser crop can still be nudged via HeroClassDef.portrait (same
 * {path, focusX, focusY, scale} shape a chain's banner already uses).
 * `.png` rather than banners' `.jpg` convention on purpose -- portrait art
 * ships with a transparent background (see hero-portrait-generation-
 * prompt.md in the project docs), not a full-bleed photo/painting.
 */
export function heroPortraitSrc(heroId: string, portrait?: HeroClassDef['portrait']): string {
  return portrait?.path ? `./lore/${portrait.path}` : `./lore/hero-portraits/${heroId}.png`;
}

/** Shared backgroundPosition/backgroundSize for a portrait div, same
 *  conditional-scale convention as LorePanel's ChainBanner -- cover
 *  (the CSS class default) unless a custom zoom was set in DevTools. */
function heroPortraitStyle(portrait?: HeroClassDef['portrait']): CSSProperties {
  return {
    backgroundPosition: `${portrait?.focusX ?? 50}% ${portrait?.focusY ?? 50}%`,
    ...(portrait?.scale && portrait.scale !== 100 ? { backgroundSize: `${portrait.scale}%` } : {}),
  };
}

/** Everything the recruit chip row and its detail modal both need per
 *  class, computed once and shared -- mirrors GuildManager.recruit's own
 *  cost logic exactly (see the original inline computation this replaces)
 *  so the displayed price/affordability never drifts from what a click
 *  would actually charge. */
interface RecruitStatus {
  def: HeroClassDef;
  unlocked: boolean;
  milestoneMet: boolean;
  cost: number;
  tavernUnlocked: boolean;
  slotsFull: boolean;
  alreadyRecruited: boolean;
}

function recruitStatusFor(
  engine: GameEngine,
  id: HeroClass,
  recruitable: HeroClass[],
  slots: number,
): RecruitStatus {
  const state = engine.state;
  const def = HERO_CLASSES[id];
  const unlocked = recruitable.includes(id);
  const milestoneMet = heroMilestoneUnlocked(state, id);
  const cost = (def.milestoneGoldCost != null && milestoneMet) ? def.milestoneGoldCost : RECRUIT_COST[id];
  const tavernUnlocked = GuildManager.facilityLevel(state, 'tavern') >= def.unlockTavernLevel;
  const slotsFull = state.heroes.length >= slots;
  // One of every hero (patch 0219) -- once a class has a living hero in
  // the roster, it's permanently done recruiting; see GuildManager.
  // classAlreadyRecruited's own comment for why this never needs to
  // un-set later.
  const alreadyRecruited = GuildManager.classAlreadyRecruited(state, id);
  return { def, unlocked, milestoneMet, cost, tavernUnlocked, slotsFull, alreadyRecruited };
}

export function HeroesPanel() {
  const engine = useEngine();
  const now = useNow();
  const { settings } = useSettings();
  const state = engine.state;
  const slots = engine.heroSlots;
  const recruitable = GuildManager.recruitableClasses(state);

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

  // Recruit tier chips (patch 0296) -- which class's detail modal (full
  // stats + Purchase button) is currently open, if any. Direct request:
  // short named chips grouped by tier, click opens the modal with
  // everything the old inline card used to show up front.
  const [selectedRecruitId, setSelectedRecruitId] = useState<HeroClass | null>(null);

  const { flashes: levelFlashes, dismiss: dismissLevelFlash } = useLevelUpFlash(
    state.heroes.map((h) => ({ id: h.id, level: h.level })),
  );
  const { flashes: reviveFlashes, dismiss: dismissReviveFlash } = useReviveFlash(
    state.heroes.map((h) => ({ id: h.id, fallen: h.status === 'fallen' })),
  );

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
        <button className="chip chip-blue" style={{ marginBottom: 10 }} onClick={() => setShowComparison(true)}>
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
      state.heroes.map((hero) => (
        <HeroBlock
          key={hero.id}
          hero={hero}
          engine={engine}
          now={now}
          settings={settings}
          tombstoneIcon={tombstoneIcon}
          isOpen={expanded.has(hero.id)}
          onToggle={() => toggleExpanded(hero.id)}
        >
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
        </HeroBlock>
      ))
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
          {/* Patch 0297, direct request ("Recruit buttons (prestige and
              tavern) need to be coloured too") -- Tavern gets the same
              brass .btn-primary every other Guild Hall/gold action uses,
              Prestige gets .btn-purple, matching the violet Renown already
              reads as everywhere else in that tab (PrestigePanel's own
              Heroic Renown readout, RenownPerkCard). Reusing existing
              category colours rather than inventing new ones, so each
              button's colour already means "that destination" elsewhere
              in the game. */}
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <button className="btn-primary" onClick={() => engine.requestTab('guild', 'tavern')}>
              Go to Tavern →
            </button>
            <button className="btn-purple" onClick={() => engine.requestTab('prestige', 'extra_banner')}>
              Go to Prestige →
            </button>
          </div>
        </>
      )}
      {/* Patch 0296 -- tiered short chips replacing the old flat
          `.grid.three` of full stat cards, direct request: "Hero's are now
          shown in their tiered brackets, not clumped together", "cards are
          short - on-click opens a new modal". Tiers grouped by
          HeroClassDef.tier, in ascending order; within a tier, classes stay
          in HERO_CLASSES' own declared order (already tier-ascending in
          hero-classes.json, so this never needs a secondary sort). */}
      {(() => {
        const tierGroups: { tier: number; ids: HeroClass[] }[] = [];
        for (const id of Object.keys(HERO_CLASSES) as HeroClass[]) {
          const tier = HERO_CLASSES[id].tier;
          let group = tierGroups.find((g) => g.tier === tier);
          if (!group) { group = { tier, ids: [] }; tierGroups.push(group); }
          group.ids.push(id);
        }
        tierGroups.sort((a, b) => a.tier - b.tier);

        return tierGroups.map(({ tier, ids }) => (
          <div key={tier}>
            <div className="recruit-tier-heading">Tier {tier}</div>
            <div className="recruit-row">
              {ids.map((id) => {
                const { def, unlocked, cost, alreadyRecruited } = recruitStatusFor(engine, id, recruitable, slots);
                const badgeText = alreadyRecruited ? 'Recruited' : !unlocked ? 'Locked' : formatGold(cost);
                const badgeClass = alreadyRecruited ? 'good' : !unlocked ? 'locked' : 'view';
                return (
                  <button
                    key={id}
                    type="button"
                    className={`recruit-chip ${alreadyRecruited ? 'recruited' : ''}`}
                    onClick={() => setSelectedRecruitId(id)}
                  >
                    <span
                      className="chip-icon-frame"
                      style={{ backgroundImage: `url(${heroPortraitSrc(id, def.portrait)})`, ...heroPortraitStyle(def.portrait) }}
                    />
                    <span className="chip-name">{def.name}</span>
                    <span className={`chip-badge ${badgeClass}`}>{badgeText}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {/* Recruit detail modal (patch 0296) -- the short chip above just
          picks a class; every stat/blurb/milestone/Purchase decision the
          old inline card used to show up front now lives here instead,
          verbatim same logic (unlocked/cost/slotsFull/alreadyRecruited
          disable rules, milestone note, Tavern-link fallback) just moved
          behind a click. */}
      {selectedRecruitId && (() => {
        const id = selectedRecruitId;
        const { def, unlocked, milestoneMet, cost, tavernUnlocked, slotsFull, alreadyRecruited } =
          recruitStatusFor(engine, id, recruitable, slots);
        return (
          <div className="overlay" onClick={() => setSelectedRecruitId(null)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="spread" style={{ marginBottom: 10 }}>
                <span className="card-title">{def.name}</span>
                <button className="btn-ghost" onClick={() => setSelectedRecruitId(null)}>Close</button>
              </div>
              <div className="row" style={{ alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <span
                  className="recruit-modal-icon-frame"
                  style={{ backgroundImage: `url(${heroPortraitSrc(id, def.portrait)})`, ...heroPortraitStyle(def.portrait) }}
                />
                <p className="card-flavour" style={{ margin: 0, flex: 1 }}>{def.blurb}</p>
              </div>
              <div className="stat-row" style={{ marginBottom: 10 }}>
                {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
              </div>
              {/* Patch 0251 -- shown for any class with a milestone path,
                  locked or not, so the alternate route is always visible
                  rather than only appearing once it's already met. Once
                  met, the checkmark line replaces the plain description
                  so it reads as "done" rather than repeating an
                  instruction that's no longer relevant. */}
              {def.milestoneUnlockDescription && (
                <p className="tiny muted" style={{ margin: '0 0 10px' }}>
                  {milestoneMet
                    ? <span className="good">✓ Milestone met -- {formatGold(def.milestoneGoldCost ?? 0)} recruit unlocked</span>
                    : <>Or: {def.milestoneUnlockDescription}</>}
                </p>
              )}
              <div className="spread">
                <span className="gold-text" style={{ fontWeight: 700 }}>{!alreadyRecruited && formatGold(cost)}</span>
                <button
                  className="btn-primary"
                  disabled={!unlocked || state.gold < cost || slotsFull || alreadyRecruited}
                  onClick={() => { engine.recruit(id); setSelectedRecruitId(null); }}
                >
                  {alreadyRecruited
                    ? 'Already Recruited'
                    : !unlocked
                      ? `Tavern level ${def.unlockTavernLevel}`
                      : slotsFull ? 'No free slots' : `Recruit · ${formatGold(cost)}`}
                </button>
              </div>
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
                  style={{ width: '100%', marginTop: 10, fontSize: '0.6875rem' }}
                  onClick={() => { setSelectedRecruitId(null); engine.requestTab('guild', 'tavern'); }}
                >
                  Go to Tavern →
                </button>
              )}
            </div>
          </div>
        );
      })()}

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
