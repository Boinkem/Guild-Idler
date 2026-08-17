import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES } from '../../game/data/progression';
import { describeMods, formatGold } from '../../game/util';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import waxSealComplete from '../../assets/wax-seal-complete.png';

function chainRangeText(level: number): string {
  const range = AUTO_CHAIN_RANGES[level];
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}

/**
 * Full detail behind a click -- name, the flavour text hidden from the
 * compact card below, level/max, every stat line, and the same Buy
 * action the card itself offers (so opening this isn't a dead end if
 * that's how a player happens to get here). Shared by both Facilities
 * and Permanent Upgrades rather than two near-identical modals, the same
 * "generic presentational component fed pre-computed props" shape
 * ResultDetailModal (StatsPanel) already uses for its own two-shape
 * (quest/raid) merge.
 */
function GuildUpgradeDetailModal({
  name, description, level, maxLevel, statLines, buyLabel, buyDisabled, onBuy, onClose,
}: {
  name: string; description: string; level: number; maxLevel: number; statLines: ReactNode[];
  buyLabel: string; buyDisabled: boolean; onBuy: () => void; onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <span className="card-title">{name}</span>
          <span className="small muted">Level {level}/{maxLevel}</span>
        </div>
        <p className="card-flavour" style={{ marginTop: 6 }}>{description}</p>
        {statLines.length > 0 && <div className="stat-row" style={{ marginBottom: 4 }}>{statLines}</div>}
        <div className="row end" style={{ marginTop: 14, gap: 8 }}>
          <button onClick={onClose}>Close</button>
          {/* Deliberately doesn't close on buy -- a player who opened this
              to read the flavour text first, then decides to buy (maybe
              more than once in a row), shouldn't have the modal vanish
              out from under them after the first click. */}
          <button className="btn-yellow" disabled={buyDisabled} onClick={onBuy}>{buyLabel}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The compact card itself -- icon, name, level, the level rail, stat
 * lines, and Buy, with the flavour text that used to sit between the
 * name and the rail removed entirely (moved into GuildUpgradeDetailModal
 * instead). Direct request: the tab-menu grid should show "what's being
 * upgraded, cost and values," not prose, and every card should read as
 * the same size regardless of how much flavour text its def happens to
 * have -- variable-length flavour text was the single biggest source of
 * card-height variance before this (some descriptions are one line,
 * others three-plus), so removing it from this view was most of the
 * uniformity fix by itself; `.guild-facility-card`'s own `height: 100%`
 * (app.css) handles the rest by stretching every card in a grid row to
 * match its tallest sibling, same as CSS Grid already does by default.
 *
 * The whole card is clickable to open the detail modal (same "collapsed
 * card, click for the rest" shape RaidCard/RaidDetailModal already
 * established) -- except the Buy button itself, which stops propagation
 * so a player can still buy directly off the compact card in one click
 * without being forced through the modal first. Buying is the single
 * most repeated action on this tab; gating it behind an extra click
 * would have been a real regression to the core loop, not just a visual
 * change, so it deliberately stayed on the card itself.
 */
function UpgradeCard({
  name, description, level, maxLevel, maxed, affordable, statLines, buyLabel, buyDisabled, onBuy, flash, onDismissFlash, pulsing,
  highlighted, onDismissHighlight,
}: {
  name: string; description: string; level: number; maxLevel: number; maxed: boolean; affordable: boolean;
  statLines: ReactNode[]; buyLabel: string; buyDisabled: boolean; onBuy: () => void;
  flash?: { key: number; name: string }; onDismissFlash: () => void; pulsing?: boolean;
  highlighted?: boolean; onDismissHighlight?: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const pct = Math.min(100, (level / maxLevel) * 100);
  const cardRef = useRef<HTMLDivElement>(null);
  // Landed here via a "jump to the requirement" link (e.g. HeroesPanel's
  // recruit cards) -- scroll the exact card into view rather than relying
  // on the player to spot the glow somewhere off-screen in a long grid.
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);
  return (
    <div className="guild-card-wrap">
      {maxed && <img className="guild-seal" src={waxSealComplete} alt="" />}
      <div
        ref={cardRef}
        className={`card guild-facility-card ${affordable ? 'affordable' : ''} ${maxed ? 'guild-maxed' : ''} ${highlighted ? 'requirement-highlight' : ''}`}
        onClick={() => { setShowDetail(true); onDismissHighlight?.(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetail(true); onDismissHighlight?.(); } }}
      >
        <div className="guild-facility-icon" aria-hidden="true">{name.charAt(0)}</div>
        <div className={`guild-facility-body ${maxed ? 'guild-maxed-body' : ''}`}>
          <div className="spread">
            <span className="card-title">{name}</span>
            <span className={`small muted ${pulsing ? 'purchase-pulse' : ''}`}>Level {level}/{maxLevel}</span>
          </div>
          <div className={`guild-level-rail ${maxed ? 'maxed' : ''}`}><span style={{ width: `${pct}%` }} /></div>
          <button
            className="btn-yellow"
            disabled={buyDisabled}
            onClick={(e) => { e.stopPropagation(); onBuy(); }}
          >
            {buyLabel}
          </button>
          <div className="stat-row" style={{ marginTop: 8 }}>{statLines}</div>
          {flash && <MaxFlash key={flash.key} label={flash.name} onDone={onDismissFlash} />}
        </div>
      </div>
      {showDetail && (
        <GuildUpgradeDetailModal
          name={name}
          description={description}
          level={level}
          maxLevel={maxLevel}
          statLines={statLines}
          buyLabel={buyLabel}
          buyDisabled={buyDisabled}
          onBuy={onBuy}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}

export function GuildPanel() {
  const engine = useEngine();
  const state = engine.state;
  const global = ModifierManager.global(state);

  // "Jump to and highlight the requirement" landing -- consumed once on
  // mount (this panel remounts fresh each time the nav switches to it, so
  // this only ever fires right after a requestTab(..., highlightId) call
  // actually brought the player here, not on every re-render). Cleared
  // automatically a few seconds later, or the instant the highlighted card
  // itself is opened -- see UpgradeCard's onDismissHighlight.
  const [highlightId, setHighlightId] = useState<string | null>(
    () => engine.consumeRequestedHighlight(),
  );
  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => setHighlightId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const facilities = GuildManager.facilities();
  // General upgrades (no vendor field) used to live alone in the old
  // Upgrades tab -- moved here so upgrades don't need two different
  // destinations. Vendor-specific upgrades (Blacksmith/Alchemist/
  // Enchanter) moved onto each vendor's own page in Vendors instead --
  // see VendorsPanel.tsx.
  const generalUpgrades = GuildManager.upgrades().filter((u) => !u.vendor);
  const { flashes, dismiss } = useMaxFlash([
    ...facilities.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.facilityLevel(state, def.id), maxLevel: def.maxLevel,
    })),
    ...generalUpgrades.map((def) => ({
      id: def.id, name: def.name,
      level: GuildManager.upgradeLevel(state, def.id), maxLevel: def.maxLevel,
    })),
  ]);
  // Same combined facilities+upgrades list useMaxFlash above already
  // builds, just tracking every level change (not only "just hit max")
  // for the "Level N/M" pulse -- see usePulsesOnChange's own doc comment
  // for why this has to be a single batch hook call rather than one per
  // card.
  const levelPulses = usePulsesOnChange([
    ...facilities.map((def) => ({ id: def.id, value: GuildManager.facilityLevel(state, def.id) })),
    ...generalUpgrades.map((def) => ({ id: def.id, value: GuildManager.upgradeLevel(state, def.id) })),
  ]);

  function generalUpgradeCard(def: (typeof generalUpgrades)[number]) {
    const level = GuildManager.upgradeLevel(state, def.id);
    const cost = GuildManager.nextUpgradeCost(state, def.id);
    const maxed = cost === null && level >= def.maxLevel;
    // Highlighted the moment it's actually buyable, not just "cheaper than
    // the most expensive thing in the tab" -- affordable means the exact
    // next-purchase cost is covered by current gold right now.
    const affordable = !maxed && cost !== null && state.gold >= cost;
    const statLines: ReactNode[] = [
      ...describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>),
      ...(def.unlocks === 'legendaryQuests' ? [<span key="unlock-lq" className="gold-text">Unlocks Legendary quests</span>] : []),
      ...(def.unlocks === 'chains' ? [<span key="unlock-chains" className="gold-text">Unlocks multi-day quest chains</span>] : []),
      ...(def.unlocks === 'blackMarket' ? [<span key="unlock-bm" className="gold-text">Unlocks the Black Market</span>] : []),
      ...(def.unlocks === 'raids' ? [<span key="unlock-raids" className="gold-text">Unlocks Normal-difficulty raids</span>] : []),
      ...(def.unlocks === 'raidsHeroic' ? [<span key="unlock-raids-h" className="gold-text">Unlocks Heroic raid difficulty</span>] : []),
      ...(def.unlocks === 'raidsLegendary' ? [<span key="unlock-raids-l" className="gold-text">Unlocks Legendary raid difficulty</span>] : []),
      ...(def.unlocks === 'training' ? [<span key="unlock-training" className="gold-text">Unlocks the Training tab -- reassign any hero's role</span>] : []),
      ...(def.unlocks === 'autoChain' && level > 0
        ? [<span key="ac-current" className="gold-text">Currently chains {chainRangeText(level)} quests per streak</span>] : []),
      ...(def.unlocks === 'autoChain' && !maxed
        ? [<span key="ac-next" className="muted">Next tier: {chainRangeText(level + 1)} quests per streak</span>] : []),
      // consumableSlotsPerLevel/incubationSlotsPerLevel/petSlotsPerLevel
      // (Potion Belt/Nest Expansion/Companion Bond) don't route through
      // modsPerLevel or the unlocks field at all -- ModifierManager reads
      // them directly (see consumableSlots/incubationSlots/petSlots) -- so
      // without their own line here these three cards showed nothing but
      // a Buy button, same blank-body gap the unlocks cases above had.
      ...(def.consumableSlotsPerLevel ? [<span key="slots-consumable">+{def.consumableSlotsPerLevel} consumable slot per level</span>] : []),
      ...(def.incubationSlotsPerLevel ? [<span key="slots-incubation">+{def.incubationSlotsPerLevel} incubation slot per level</span>] : []),
      ...(def.petSlotsPerLevel ? [<span key="slots-pet">+{def.petSlotsPerLevel} pet slot per level</span>] : []),
    ];
    return (
      <UpgradeCard
        key={def.id}
        name={def.name}
        description={def.description}
        level={level}
        maxLevel={def.maxLevel}
        maxed={maxed}
        affordable={affordable}
        statLines={statLines}
        buyLabel={maxed ? 'Fully upgraded' : `Buy · ${formatGold(cost ?? 0)}`}
        buyDisabled={maxed || cost === null || state.gold < cost}
        onBuy={() => engine.buyUpgrade(def.id)}
        flash={flashes[def.id]}
        onDismissFlash={() => dismiss(def.id)}
        pulsing={levelPulses[def.id]}
        highlighted={def.id === highlightId}
        onDismissHighlight={() => setHighlightId(null)}
      />
    );
  }

  function facilityCard(def: (typeof facilities)[number]) {
    const level = GuildManager.facilityLevel(state, def.id);
    const cost = GuildManager.nextCost(state, def.id);
    const maxed = cost === null;
    const affordable = !maxed && state.gold >= cost;
    const statLines: ReactNode[] = [
      ...describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>),
      ...(def.storagePerLevel ? [<span key="storage">+{formatGold(def.storagePerLevel)} storage per level</span>] : []),
      ...(def.heroSlotsPerLevel ? [<span key="hero-slots" className="gold-text">+1 hero slot per level</span>] : []),
    ];
    return (
      <UpgradeCard
        key={def.id}
        name={def.name}
        description={def.description}
        level={level}
        maxLevel={def.maxLevel}
        maxed={maxed}
        affordable={affordable}
        statLines={statLines}
        buyLabel={maxed ? 'Fully built' : `Build · ${formatGold(cost ?? 0)}`}
        buyDisabled={maxed || state.gold < (cost ?? 0)}
        onBuy={() => engine.upgradeFacility(def.id)}
        flash={flashes[def.id]}
        onDismissFlash={() => dismiss(def.id)}
        pulsing={levelPulses[def.id]}
        highlighted={def.id === highlightId}
        onDismissHighlight={() => setHighlightId(null)}
      />
    );
  }

  return (
    <>
      <h2>Guild Hall</h2>
      <p className="subtitle">
        Facility levels apply to every hero, now and after every retirement.
      </p>
      <div className="guild-storage-plaque">
        <span className="guild-storage-label">Gold Storage</span>
        <span className="guild-storage-amount">{formatGold(ModifierManager.goldStorage(state))}</span>
      </div>

      <div className="section-heading guild-section-heading">Facilities</div>
      <div className="grid two guild-facility-grid">
        {facilities.map(facilityCard)}
      </div>

      <div className="section-heading guild-section-heading">Permanent Upgrades</div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Bought once, kept forever — retirement does not take these away. Vendor-specific upgrades
        (Blacksmith, Alchemist, Enchanter) live on each vendor's own page in Vendors instead.
      </p>
      <div className="card guild-bonus-plaque">
        <div className="card-title">Current guild bonuses</div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          {describeMods(global).length === 0
            ? <span className="muted">None yet.</span>
            : describeMods(global).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
      <div className="grid two guild-facility-grid">
        {generalUpgrades.map(generalUpgradeCard)}
      </div>
    </>
  );
}
