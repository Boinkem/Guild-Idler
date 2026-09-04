import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES } from '../../game/data/progression';
import { describeMods, formatGold, pct } from '../../game/util';
import { GuildHallCategory } from '../../game/types';
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
 * compact row below, level/max, every stat line, and the same Buy
 * action the row itself offers (so opening this isn't a dead end if
 * that's how a player happens to get here). Unchanged by the patch
 * 0314 dense-list redesign below -- still shared by both Facilities and
 * Permanent Upgrades rather than two near-identical modals.
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

/** Row's category label colour -- matches Design Handoff's CAT_FG table
 *  exactly (Combat -> --blood, Economy -> --brass-dim, Roster -> --sky,
 *  Care -> --moss, Unlocks -> --violet). */
const CATEGORY_FG: Record<GuildHallCategory, string> = {
  Combat: 'var(--blood)',
  Economy: 'var(--brass-dim)',
  Roster: 'var(--sky)',
  Care: 'var(--moss)',
  Unlocks: 'var(--violet)',
};

const FILTERS: ('All' | GuildHallCategory)[] = ['All', 'Combat', 'Economy', 'Roster', 'Care', 'Unlocks'];

/** One row's worth of pre-computed data -- built once per render by
 *  facilityRow/upgradeRow below from a GuildDef or UpgradeDef, so the
 *  actual row/list-building JSX further down never has to branch on
 *  "is this a facility or an upgrade" again. */
interface RowData {
  id: string;
  name: string;
  description: string;
  category: GuildHallCategory;
  level: number;
  maxLevel: number;
  maxed: boolean;
  affordable: boolean;
  cost: number | null;
  effectText: string;
  statLines: ReactNode[];
  buyLabel: string;
  buyDisabled: boolean;
  onBuy: () => void;
}

/** describeMods's own per-line text, plus every field describeMods can't
 *  see (slot counts, heal-time minutes, unlock lines) -- one shared list
 *  builder feeding both the detail modal's full stat-row (each entry
 *  wrapped in a span, unlock/slot lines picking up the same gold-text
 *  treatment they always have) and the compact row's one-line effect
 *  text (every entry's plain text joined with " · "). Keeps the two
 *  views from drifting -- a stat added to one used to mean remembering
 *  to add it to the other by hand. */
function facilityEntries(def: ReturnType<typeof GuildManager.facilities>[number]): { text: string; gold?: boolean }[] {
  return [
    ...describeMods(def.modsPerLevel).map((line) => ({ text: `${line} per level` })),
    ...(def.storagePerLevel ? [{ text: `+${formatGold(def.storagePerLevel)} storage per level` }] : []),
    ...(def.heroSlotsPerLevel ? [{ text: '+1 hero slot per level', gold: true }] : []),
    // Patch 0287: "-10 min heal time per level" read as cryptic shorthand --
    // reworded to say plainly what the stat actually does.
    ...(def.healTimeReductionMinutesPerLevel
      ? [{ text: `Auto heal time decreased by ${def.healTimeReductionMinutesPerLevel} minutes per level` }] : []),
    ...(def.freeHealsPerLevel ? [{ text: `+${def.freeHealsPerLevel} free Treat per day, per level` }] : []),
    ...(def.freeRepairsPerLevel ? [{ text: `+${def.freeRepairsPerLevel} free Repair per day, per level` }] : []),
  ];
}

function upgradeEntries(
  def: ReturnType<typeof GuildManager.upgrades>[number], level: number, maxed: boolean,
): { text: string; gold?: boolean }[] {
  return [
    ...describeMods(def.modsPerLevel).map((line) => ({ text: `${line} per level` })),
    ...(def.unlocks === 'legendaryQuests' ? [{ text: 'Unlocks Legendary quests', gold: true }] : []),
    ...(def.unlocks === 'chains' ? [{ text: 'Unlocks multi-day quest chains', gold: true }] : []),
    ...(def.unlocks === 'blackMarket' ? [{ text: 'Unlocks the Black Market', gold: true }] : []),
    ...(def.unlocks === 'raids' ? [{ text: 'Unlocks Normal-difficulty raids', gold: true }] : []),
    ...(def.unlocks === 'raidsHeroic' ? [{ text: 'Unlocks Heroic raid difficulty', gold: true }] : []),
    ...(def.unlocks === 'raidsLegendary' ? [{ text: 'Unlocks Legendary raid difficulty', gold: true }] : []),
    ...(def.unlocks === 'training' ? [{ text: 'Unlocks the Training sub-tab under Heroes -- reassign any hero\'s role', gold: true }] : []),
    ...(def.unlocks === 'autoChain' && level > 0
      ? [{ text: `Currently chains ${chainRangeText(level)} quests per streak`, gold: true }] : []),
    ...(def.unlocks === 'autoChain' && !maxed
      ? [{ text: `Next tier: ${chainRangeText(level + 1)} quests per streak` }] : []),
    ...(def.unlocks === 'autoChainTactics'
      ? [{ text: 'Unlocks Chain Tactics -- a success-rate floor and priority weighting for Auto-Chain', gold: true }] : []),
    ...(def.consumableSlotsPerLevel ? [{ text: `+${def.consumableSlotsPerLevel} consumable slot per level` }] : []),
    ...(def.incubationSlotsPerLevel ? [{ text: `+${def.incubationSlotsPerLevel} incubation slot per level` }] : []),
    ...(def.petSlotsPerLevel ? [{ text: `+${def.petSlotsPerLevel} pet slot per level` }] : []),
    ...(def.questFreeRerollsPerLevel ? [{ text: `+${def.questFreeRerollsPerLevel} free quest board reroll per level` }] : []),
    ...(def.freezeChangesPerLevel ? [{ text: `+${def.freezeChangesPerLevel} contract freeze per level` }] : []),
    ...(def.stashCapacityPerLevel ? [{ text: `+${def.stashCapacityPerLevel} stash space per level` }] : []),
  ];
}

/**
 * The compact row itself -- name, category label, level, effect line,
 * progress rule, and Buy, replacing the old UpgradeCard grid tile
 * (patch 0314). Whole row is clickable to open the detail modal, same
 * "collapsed row, click for the rest" shape the old card used --
 * except the Buy button, which stops propagation so a player can still
 * buy directly off the row without being forced through the modal
 * first, unchanged from before.
 */
function GuildUpgradeRow({
  row, flash, onDismissFlash, pulsing, highlighted, onDismissHighlight,
}: {
  row: RowData;
  flash?: { key: number; name: string }; onDismissFlash: () => void; pulsing?: boolean;
  highlighted?: boolean; onDismissHighlight?: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const pct2 = Math.min(100, (row.level / row.maxLevel) * 100);
  const rowRef = useRef<HTMLDivElement>(null);
  // Landed here via a "jump to the requirement" link -- scroll the exact
  // row into view rather than relying on the player to spot the glow
  // somewhere off-screen in a long list.
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);
  return (
    <div
      ref={rowRef}
      className={`guild-upgrade-row ${highlighted ? 'card requirement-highlight' : ''}`}
      onClick={() => { setShowDetail(true); onDismissHighlight?.(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetail(true); onDismissHighlight?.(); } }}
    >
      <span style={{ minWidth: 0 }}>
        <span className="guild-row-head">
          <span className="guild-row-name">{row.name}</span>
          <span className="guild-row-cat" style={{ color: CATEGORY_FG[row.category] }}>{row.category}</span>
          <span className={`guild-row-level ${pulsing ? 'purchase-pulse' : ''}`}>Lv {row.level}/{row.maxLevel}</span>
        </span>
        <span className="guild-row-effect">{row.effectText}</span>
        <span className="guild-row-rule">
          <span style={{ width: `${pct2}%`, background: row.maxed ? 'var(--moss)' : 'var(--brass)' }} />
        </span>
      </span>
      <button
        className={`guild-buy-btn ${!row.buyDisabled ? 'affordable' : ''}`}
        disabled={row.buyDisabled}
        onClick={(e) => { e.stopPropagation(); row.onBuy(); }}
      >
        {row.buyLabel}
      </button>
      {flash && <MaxFlash key={flash.key} label={flash.name} onDone={onDismissFlash} />}
      {showDetail && (
        <GuildUpgradeDetailModal
          name={row.name}
          description={row.description}
          level={row.level}
          maxLevel={row.maxLevel}
          statLines={row.statLines}
          buyLabel={row.buyLabel}
          buyDisabled={row.buyDisabled}
          onBuy={row.onBuy}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}

/** A single collapsed row inside the expanded "Fully built" section --
 *  name, effect, and the 24px seal, no level/rule/buy button since
 *  there's nothing left to buy or track here. */
function GuildBuiltRow({ row }: { row: RowData }) {
  return (
    <div className="guild-built-row">
      <span className="guild-built-row-name">{row.name}</span>
      <span className="guild-built-row-effect">{row.effectText}</span>
      <img className="guild-built-row-seal" src={waxSealComplete} alt="Complete" />
    </div>
  );
}

export function GuildPanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const global = ModifierManager.global(state);

  // Inline "Customize" mode -- unchanged by this patch, see its own
  // longer-standing comment history in guild-idler-status.md.
  const [customizing, setCustomizing] = useState(() => engine.consumeRequestedSubTab() === 'customize');

  // "Fund the Guild" modal -- unchanged.
  const [fundingOpen, setFundingOpen] = useState(false);

  // "Jump to and highlight the requirement" landing -- unchanged.
  const [highlightId, setHighlightId] = useState<string | null>(
    () => engine.consumeRequestedHighlight(),
  );
  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => setHighlightId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // Category filter chips (patch 0314) -- view-only, same "not game
  // state" shape `customizing`/`fundingOpen` already use above. Never
  // persisted, never touches the built section.
  const [filter, setFilter] = useState<'All' | GuildHallCategory>('All');
  // Built section starts collapsed; forced open below whenever the
  // highlighted requirement turns out to already be maxed, so the row
  // it's pointing at actually exists on screen to scroll to.
  const [showBuilt, setShowBuilt] = useState(false);

  const facilities = GuildManager.facilities();
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
  const levelPulses = usePulsesOnChange([
    ...facilities.map((def) => ({ id: def.id, value: GuildManager.facilityLevel(state, def.id) })),
    ...generalUpgrades.map((def) => ({ id: def.id, value: GuildManager.upgradeLevel(state, def.id) })),
  ]);

  function facilityRow(def: (typeof facilities)[number]): RowData {
    const level = GuildManager.facilityLevel(state, def.id);
    const cost = GuildManager.nextCost(state, def.id);
    const maxed = cost === null;
    const affordable = !maxed && state.gold >= cost;
    const entries = facilityEntries(def);
    return {
      id: def.id, name: def.name, description: def.description,
      category: def.category ?? 'Unlocks', level, maxLevel: def.maxLevel, maxed, affordable, cost,
      effectText: def.shortEffect ?? entries.map((e) => e.text).join(' · '),
      statLines: entries.map((e) => <span key={e.text} className={e.gold ? 'gold-text' : undefined}>{e.text}</span>),
      buyLabel: maxed ? 'Fully built' : `Build · ${formatGold(cost ?? 0)}`,
      buyDisabled: maxed || state.gold < (cost ?? 0),
      onBuy: () => engine.upgradeFacility(def.id),
    };
  }

  function upgradeRow(def: (typeof generalUpgrades)[number]): RowData {
    const level = GuildManager.upgradeLevel(state, def.id);
    const cost = GuildManager.nextUpgradeCost(state, def.id);
    const maxed = cost === null && level >= def.maxLevel;
    const affordable = !maxed && cost !== null && state.gold >= cost;
    const entries = upgradeEntries(def, level, maxed);
    return {
      id: def.id, name: def.name, description: def.description,
      category: def.category ?? 'Unlocks', level, maxLevel: def.maxLevel, maxed, affordable, cost,
      effectText: def.shortEffect ?? entries.map((e) => e.text).join(' · '),
      statLines: entries.map((e) => <span key={e.text} className={e.gold ? 'gold-text' : undefined}>{e.text}</span>),
      buyLabel: maxed ? 'Fully upgraded' : `Buy · ${formatGold(cost ?? 0)}`,
      buyDisabled: maxed || cost === null || state.gold < cost,
      onBuy: () => engine.buyUpgrade(def.id),
    };
  }

  // Facilities first, then permanent upgrades, source order preserved --
  // matches the design handoff's "single list, not two grids" spec.
  const rows: RowData[] = [...facilities.map(facilityRow), ...generalUpgrades.map(upgradeRow)];

  // A row that just hit max stays in the main list for as long as its
  // MaxFlash is still playing (fires the flash "before it moves", per
  // the design handoff), then drops into Built on the render right
  // after MaxFlash's onDone calls dismiss(id).
  const active = rows.filter((r) => (!r.maxed || flashes[r.id]) && (filter === 'All' || r.category === filter));
  const built = rows.filter((r) => r.maxed && !flashes[r.id]);
  const builtHasHighlight = built.some((r) => r.id === highlightId);
  const builtExpanded = showBuilt || builtHasHighlight;

  if (customizing) {
    return <GuildHallCustomizeScene onDone={() => setCustomizing(false)} />;
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/guildhall.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <div className="guild-header-row">
        <div>
          <h2>Guild Hall</h2>
          <p className="subtitle">
            Facility levels apply to every hero, now and after every retirement. Vendor-specific
            upgrades (Blacksmith, Alchemist, Enchanter) live on each vendor's own page instead.
          </p>
        </div>
        <div className="guild-bonus-row">
          <span className="guild-bonus-chip" style={{ borderLeftColor: 'var(--blood)' }}>
            <span className="guild-bonus-chip-label">Success</span>
            <span className="guild-bonus-chip-value" style={{ color: 'var(--blood)' }}>{pct(global.success)}</span>
          </span>
          <span className="guild-bonus-chip" style={{ borderLeftColor: 'var(--brass)' }}>
            <span className="guild-bonus-chip-label">Gold</span>
            <span className="guild-bonus-chip-value" style={{ color: 'var(--brass)' }}>{pct(global.gold)}</span>
          </span>
          <span className="guild-bonus-chip" style={{ borderLeftColor: 'var(--sky)' }}>
            <span className="guild-bonus-chip-label">Hero XP</span>
            <span className="guild-bonus-chip-value" style={{ color: 'var(--sky)' }}>{pct(global.xp)}</span>
          </span>
          <span className="guild-bonus-chip" style={{ borderLeftColor: 'var(--moss)' }}>
            <span className="guild-bonus-chip-label">Durability</span>
            <span className="guild-bonus-chip-value" style={{ color: 'var(--moss)' }}>{pct(global.durability)}</span>
          </span>
        </div>
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="guild-storage-plaque" style={{ margin: 0 }}>
          <span className="guild-storage-label">Gold Storage Cap</span>
          <span className="guild-storage-amount">
            {formatGold(state.gold)} / {formatGold(ModifierManager.goldStorage(state))}
          </span>
        </div>
        <button className="btn-primary" onClick={() => setFundingOpen(true)}>
          Fund the Guild
        </button>
        {/* Lifetime Fund the Guild total -- direct request, so a player
            can see at a glance how much they've given away without
            having to open the modal to find the number. */}
        <div className="guild-donation-plaque">
          <span className="guild-donation-label">Gold Donated</span>
          <span className="guild-donation-amount">{formatGold(state.guildDonationsTotal)}</span>
        </div>
      </div>

      <div className="guild-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`guild-filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span className="guild-filter-gold">
          Gold <span className="guild-filter-gold-amount">{formatGold(state.gold)}</span> / {formatGold(ModifierManager.goldStorage(state))}
        </span>
      </div>

      <div className="guild-upgrade-list">
        {active.map((row) => (
          <GuildUpgradeRow
            key={row.id}
            row={row}
            flash={flashes[row.id]}
            onDismissFlash={() => dismiss(row.id)}
            pulsing={levelPulses[row.id]}
            highlighted={row.id === highlightId}
            onDismissHighlight={() => setHighlightId(null)}
          />
        ))}
      </div>

      <div className="guild-built-strip">
        <img className="guild-built-seal" src={waxSealComplete} alt="Complete" />
        <span className="guild-built-count">Fully built · {built.length}</span>
        <span className="guild-built-names">{built.map((r) => r.name).join(' · ')}</span>
        <button className="guild-built-toggle" onClick={() => setShowBuilt((v) => !v)}>
          {builtExpanded ? 'Hide' : 'Show'}
        </button>
      </div>
      {builtExpanded && (
        <div className="guild-upgrade-list">
          {built.map((row) => <GuildBuiltRow key={row.id} row={row} />)}
        </div>
      )}

      {/* Treasury -- patch 0220, direct request. Unchanged by this patch. */}
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
 * The exchange itself, once unlocked -- unchanged by this patch. See its
 * own original comment history for the offerText/rate/validOffer shape.
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
