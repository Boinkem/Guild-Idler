import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES } from '../../game/data/progression';
import { describeMods, formatGold } from '../../game/util';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import { GuildHallCustomizeScene } from '../GuildHallCustomizeScene';
import { FundGuildModal } from '../FundGuildModal';
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

  // Inline "Customize" mode -- per the original design brainstorm's own
  // pick ("Inline edit mode on Guild Hall tab"), swapping this panel's
  // normal facility/upgrade content out for GuildHallCustomizeScene
  // entirely rather than opening a separate window. Local, unpersisted --
  // same "just a view toggle, not game state" shape `expanded` (a Set)
  // uses elsewhere in this codebase; leaving Customize mode open when you
  // switch tabs and back isn't a real requirement here, so it resets on
  // every remount, same as `highlightId`'s own consume-once shape above.
  //
  // The button that flips this used to live on this panel's own header --
  // moved to the Guild home tab (DashboardPanel, patch 0213) as a bigger,
  // coloured call-to-action, since Customize is a whole-guild cosmetic
  // action, not specifically a Guild Hall/facilities one. Getting here
  // from that new button reuses the existing requestTab(id, highlightId,
  // subTab) plumbing rather than adding a new one-shot field: Dashboard
  // calls requestTab('guild', undefined, 'customize'), and this panel
  // consumes that sentinel via consumeRequestedSubTab the same way
  // Harvest/Hatchery/Lore/Raids/Stats/Vendors already consume their own
  // sub-tab requests -- GuildPanel just isn't one of those panels
  // otherwise, so the id can't collide with a real sub-tab anywhere.
  const [customizing, setCustomizing] = useState(() => engine.consumeRequestedSubTab() === 'customize');

  // "Fund the Guild" modal -- patch 0220, its own local view toggle, same
  // "just a view flag, not game state" shape `customizing` above uses.
  const [fundingOpen, setFundingOpen] = useState(false);

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
      // Chain Tactics (unlocks: 'autoChainTactics') had no case here at
      // all -- direct report: its card showed nothing but a Buy button,
      // same "blank body" bug the slot-upgrade fix just below already
      // covers for a different cause. Nothing per-level to report (it's a
      // single-purchase unlock, maxLevel 1), so this is a flat line
      // rather than a level-scaling one like autoChain's own pair above.
      ...(def.unlocks === 'autoChainTactics'
        ? [<span key="unlock-tactics" className="gold-text">Unlocks Chain Tactics -- a success-rate floor and priority weighting for Auto-Chain</span>] : []),
      // consumableSlotsPerLevel/incubationSlotsPerLevel/petSlotsPerLevel
      // (Potion Belt/Nest Expansion/Companion Bond) don't route through
      // modsPerLevel or the unlocks field at all -- ModifierManager reads
      // them directly (see consumableSlots/incubationSlots/petSlots) -- so
      // without their own line here these three cards showed nothing but
      // a Buy button, same blank-body gap the unlocks cases above had.
      // questFreeRerollsPerLevel/freezeChangesPerLevel (Board Runner/Board
      // Warden) are the same story -- confirmed neither one was rendered
      // ANYWHERE in the UI, not just here, before this fix.
      ...(def.consumableSlotsPerLevel ? [<span key="slots-consumable">+{def.consumableSlotsPerLevel} consumable slot per level</span>] : []),
      ...(def.incubationSlotsPerLevel ? [<span key="slots-incubation">+{def.incubationSlotsPerLevel} incubation slot per level</span>] : []),
      ...(def.petSlotsPerLevel ? [<span key="slots-pet">+{def.petSlotsPerLevel} pet slot per level</span>] : []),
      ...(def.questFreeRerollsPerLevel ? [<span key="slots-reroll">+{def.questFreeRerollsPerLevel} free quest board reroll per level</span>] : []),
      ...(def.freezeChangesPerLevel ? [<span key="slots-freeze">+{def.freezeChangesPerLevel} contract freeze per level</span>] : []),
      ...(def.stashCapacityPerLevel ? [<span key="slots-stash">+{def.stashCapacityPerLevel} stash space per level</span>] : []),
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
    // healTimeReductionMinutesPerLevel/freeHealsPerLevel/freeRepairsPerLevel
    // (Infirmary, Kennel, Physician's Charity, Smith's Charity) don't route
    // through modsPerLevel/storagePerLevel/heroSlotsPerLevel at all -- same
    // "blank body" gap generalUpgradeCard's own statLines had before its
    // 0199 fix, just on this card function instead. Confirmed via grep none
    // of these three fields were rendered anywhere else either.
    const statLines: ReactNode[] = [
      ...describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>),
      ...(def.storagePerLevel ? [<span key="storage">+{formatGold(def.storagePerLevel)} storage per level</span>] : []),
      ...(def.heroSlotsPerLevel ? [<span key="hero-slots" className="gold-text">+1 hero slot per level</span>] : []),
      ...(def.healTimeReductionMinutesPerLevel ? [<span key="heal-time">-{def.healTimeReductionMinutesPerLevel} min heal time per level</span>] : []),
      ...(def.freeHealsPerLevel ? [<span key="free-heals">+{def.freeHealsPerLevel} free Treat per day, per level</span>] : []),
      ...(def.freeRepairsPerLevel ? [<span key="free-repairs">+{def.freeRepairsPerLevel} free Repair per day, per level</span>] : []),
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

  // Customize mode replaces this entire panel's body -- facility/upgrade
  // grids, the storage plaque, everything below -- with the full-bleed
  // decoration scene, exactly the "hide the statistics and other panels...
  // then when you're done, they can come back" behaviour asked for when
  // this was first brainstormed. Nothing else on this tab renders at all
  // while customizing is true; GuildHallCustomizeScene's own "Done" button
  // is the only way back.
  if (customizing) {
    return <GuildHallCustomizeScene onDone={() => setCustomizing(false)} />;
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/guildhall.jpg)' }}>
      <div className="tab-scene-content">
      <div>
        <h2>Guild Hall</h2>
        <p className="subtitle">
          Facility levels apply to every hero, now and after every retirement.
        </p>
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="guild-storage-plaque" style={{ margin: 0 }}>
          <span className="guild-storage-label">Gold Storage</span>
          <span className="guild-storage-amount">{formatGold(ModifierManager.goldStorage(state))}</span>
        </div>
        {/* "Fund the Guild" -- patch 0220, direct request. An open-ended
            gold sink with no catalog and no max level: opens a modal to
            enter any amount, which feeds a small, permanently-diminishing
            slice of Guild Power (see power.ts's donations component) --
            see GuildManager.donateToGuild's own comment for the full
            reasoning on why the curve isn't linear. */}
        <button className="btn-primary" onClick={() => setFundingOpen(true)}>
          Fund the Guild
        </button>
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

      {/* Treasury -- patch 0220, direct request. Gold-for-Renown exchange:
          a one-time unlock, then a deliberately harsh flat rate (see
          GuildManager.goldPerRenown's own comment) -- an outlet for
          genuinely excess gold, never a substitute for actually retiring
          a hero. Same locked-upgrade card shape Grimsby's own High
          Roller/Permanent Spot cards use. */}
      <div className="section-heading guild-section-heading">Treasury</div>
      {!state.goldRenownExchangeUnlocked ? (
        <div className="card locked-upgrade">
          <div className="card-title">Gold-for-Renown Exchange</div>
          <p className="card-flavour muted">
            Turn a real fortune into a trickle of Renown -- {formatGold(GuildManager.goldPerRenown())} gold
            per 1 Renown once unlocked. Never worth it over actually retiring a hero; just somewhere for
            excess gold to go.
          </p>
          <button
            className="btn-primary"
            disabled={!GuildManager.canUnlockRenownExchange(state)}
            onClick={() => engine.unlockRenownExchange()}
            title={GuildManager.canUnlockRenownExchange(state) ? undefined : 'Not enough gold'}
          >
            Unlock -- {formatGold(GuildManager.renownExchangeUnlockCost())} gold
          </button>
        </div>
      ) : (
        <RenownExchangeCard />
      )}

      {fundingOpen && <FundGuildModal onClose={() => setFundingOpen(false)} />}
      </div>
    </div>
  );
}

/**
 * The exchange itself, once unlocked -- own free-form gold amount input,
 * same string-state shape PeddlerDiceModal's wager field already uses
 * (empty while typing rather than snapping to 0), validated/floored on
 * submit. Split out from GuildPanel's main body purely so its own local
 * `offerText` state doesn't need to live alongside everything else that
 * component already tracks.
 */
function RenownExchangeCard() {
  const engine = useEngine();
  const state = engine.state;
  const [offerText, setOfferText] = useState('');
  const rate = GuildManager.goldPerRenown();
  const offer = Math.floor(Number(offerText));
  const validOffer = Number.isFinite(offer) && offer > 0;
  const renownPreview = validOffer ? Math.floor(offer / rate) : 0;
  const canExchange = validOffer && renownPreview >= 1 && state.gold >= renownPreview * rate;

  return (
    <div className="card">
      <div className="card-title">Gold-for-Renown Exchange</div>
      <p className="card-flavour muted">{formatGold(rate)} gold per 1 Renown.</p>
      <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
        <input
          type="number"
          min={rate}
          value={offerText}
          onChange={(e) => setOfferText(e.target.value)}
          placeholder="Gold to offer"
          style={{
            width: 130, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
            color: 'var(--parchment)', padding: '5px 8px', fontSize: '0.75rem',
          }}
        />
        <button
          className="btn-primary"
          disabled={!canExchange}
          onClick={() => { engine.exchangeGoldForRenown(offer); setOfferText(''); }}
          title={renownPreview >= 1 ? `Get ${renownPreview} Renown for ${formatGold(renownPreview * rate)} gold` : `Offer at least ${formatGold(rate)} gold`}
        >
          Exchange{renownPreview >= 1 ? ` -- ${renownPreview} Renown` : ''}
        </button>
      </div>
    </div>
  );
}
