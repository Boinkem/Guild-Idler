import { useEffect, useRef, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { PrestigeManager } from '../../game/managers/PrestigeManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PRESTIGE_MIN_LEVEL, renownEffectiveMaxLevel } from '../../game/data/progression';
import { describeMods, formatNumber } from '../../game/util';
import { usePulsesOnChange } from '../maxFlash';
import { Hero } from '../../game/types';
import { backgroundSrc } from '../../game/settings';

/**
 * Replaces the native browser confirm() previously used for Retire and
 * Early Retire both -- a plain OS dialog box read as visually broken
 * next to everything else in this game having its own themed chrome
 * ("card is unstyled" was the actual feedback). Same .overlay/.modal
 * shape every other in-game confirmation/detail popup already uses
 * (PeddlerCard's detail overlay, the Vendors shop item modals).
 *
 * Patch 0317 (Prestige/Retirement Rework): classic Retire is gone, so
 * this only ever confirms Early Retirement now -- kept as its own
 * component rather than inlined, since a future second confirm-needing
 * action (should one ever exist here again) can reuse it.
 */
function RetireConfirmModal({
  title, body, confirmLabel, onConfirm, onCancel,
}: {
  title: string; body: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="small muted">{body}</p>
        <div className="row end" style={{ gap: 8, marginTop: 12 }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="btn-ghost" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One hero's row -- Early Retirement is the only removal path as of
 * patch 0317 (classic Retire, and this card's old renown-preview/streak
 * math, are both gone -- see guild-idler-status.md's patch-0317 entry).
 * A hero's ascension rank (from the OLD system, frozen at whatever it
 * held when this patch landed) still displays, since it's still real,
 * earned history -- there's just no way to earn more of it now.
 */
function HeroRetireCard({
  hero, confirmRetire, onEarlyRetire,
}: {
  hero: Hero;
  confirmRetire: boolean;
  onEarlyRetire: (heroId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const rank = PrestigeManager.rankFor(hero);

  const doEarlyRetire = () => { setConfirming(false); onEarlyRetire(hero.id); };

  return (
    <div className="spread card">
      <div>
        <div className="card-title">
          {rank && <span className="hero-rank-badge">{rank}</span>}
          {hero.name}
          {hero.ascension > 0 && <span className="tiny muted" style={{ marginLeft: 6 }}>ascended ×{hero.ascension}</span>}
        </div>
        <div className="tiny muted">
          Level {hero.level} · {hero.questsCompleted} quests
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {PrestigeManager.canEarlyRetire(hero) && (
          <button
            className="btn-ghost"
            onClick={() => { if (confirmRetire) setConfirming(true); else doEarlyRetire(); }}
          >
            Early Retire
          </button>
        )}
      </div>

      {confirming && (
        <RetireConfirmModal
          title={`Early-retire ${hero.name}?`}
          body="No renown, no bonus -- this just frees the slot right now. This can't be undone."
          confirmLabel="Early Retire"
          onConfirm={doEarlyRetire}
          onCancel={() => setConfirming(false)}
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

/**
 * New in patch 0317 -- one capped hero's row in the per-hero Renown perk
 * tree (HERO_RENOWN_PERKS, progression.ts). Deliberately a flatter, less
 * ornamented card than RenownPerkCard above: this tree's real content is
 * still being designed (see HERO_RENOWN_PERKS' own comment), so the
 * layout here favors "obviously functional" over "obviously finished."
 */
function HeroPerkRow({ hero, onBuy }: { hero: Hero; onBuy: (heroId: string, perkId: string) => void }) {
  const engine = useEngine();
  const state = engine.state;
  const eligible = PrestigeManager.heroPerkEligible(hero);
  return (
    <div className="card">
      <div className="spread">
        <span className="card-title">{hero.name}</span>
        <span className="tiny muted">Level {hero.level}</span>
      </div>
      {!eligible ? (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Needs level {PRESTIGE_MIN_LEVEL} before spending Renown here.
        </p>
      ) : (
        <div className="stat-row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
          {PrestigeManager.heroPerks().map((def) => {
            const level = PrestigeManager.heroPerkLevel(hero, def.id);
            const cost = PrestigeManager.nextHeroPerkCost(hero, def.id);
            const maxed = cost === null;
            const affordable = !maxed && state.renown >= cost;
            return (
              <div key={def.id} className="row spread" style={{ width: '100%', alignItems: 'center' }}>
                <span className="tiny">
                  {def.name} ({level}/{def.maxLevel})
                  {describeMods(def.modsPerLevel).map((line) => ` · ${line}/level`).join('')}
                </span>
                <button
                  className="btn-yellow"
                  disabled={maxed || !affordable}
                  onClick={() => onBuy(hero.id, def.id)}
                >
                  {maxed ? 'Maxed' : `Buy · ✦ ${formatNumber(cost ?? 0)}`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PrestigePanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  useNow();
  const state = engine.state;

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

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/prestige.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <h2>Prestige</h2>
      {/*
        Prestige/Retirement Rework (patch 0317). Classic Retire is gone --
        Early Retirement is the only way to remove a hero from the
        roster now, and it stays reward-free by design. Renown comes
        from playing capped heroes through Mythic/Legendary raids and
        Replay Memories instead -- see the Raids and Replay Memories tabs.
      */}
      <p className="subtitle">
        Early Retirement frees a hero's slot immediately, at any level -- no renown, no bonus attached.
        Heroic Renown itself comes from clearing raids and Replay Memories at Mythic or Legendary difficulty
        with your capped ({PRESTIGE_MIN_LEVEL}+) heroes.
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

      <div className="section-heading">Remove a hero</div>
      {state.heroes.map((hero) => (
        <HeroRetireCard
          key={hero.id}
          hero={hero}
          confirmRetire={settings.confirmRetire}
          onEarlyRetire={(heroId) => engine.earlyRetire(heroId)}
        />
      ))}

      <div className="section-heading">Spend renown -- guild-wide</div>
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

      {/*
        New in patch 0317 -- see HeroPerkRow's own comment. Only shown at
        all once at least one hero exists, same "nothing to show yet"
        guard the rest of this panel doesn't otherwise need (Early
        Retirement/guild perks both render fine with zero heroes/zero
        renown).
      */}
      {state.heroes.length > 0 && (
        <>
          <div className="section-heading">Spend renown -- per hero</div>
          <p className="small muted" style={{ marginTop: -4 }}>
            Extra power for a specific hero who&apos;s done leveling. Content here is still being expanded.
          </p>
          {state.heroes.map((hero) => (
            <HeroPerkRow key={hero.id} hero={hero} onBuy={(heroId, perkId) => engine.buyHeroPerk(heroId, perkId)} />
          ))}
        </>
      )}
      </div>
    </div>
  );
}
