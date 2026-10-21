import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { GuildManager } from '../../game/managers/GuildManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { AUTO_CHAIN_RANGES } from '../../game/data/progression';
import { CHAIN_REPLAY_TIER_BY_ID } from '../../game/data/chainReplay';
import { describeMods, formatGold, formatNumber, pct } from '../../game/util';
import { GuildHallCategory } from '../../game/types';
import { usePulsesOnChange } from '../maxFlash';
import { buyWithFx, flyTokens, fxMs, LevelRoll, SealStamp, shownValue, usePurchaseBeats } from '../purchaseFx';
import type { Beat } from '../purchaseFx';
import { UnlockFx, useJustUnlocked } from '../unlockFx';
import { GuildHallCustomizeScene } from '../GuildHallCustomizeScene';
import { GUILD_HALL_DECOR_ENABLED } from '../../game/data/guildHallDecor';
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
  buyLabel: string; buyDisabled: boolean; onBuy: (btn?: HTMLElement | null) => void; onClose: () => void;
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
          <button className="btn-yellow" disabled={buyDisabled} onClick={(e) => onBuy(e.currentTarget)}>{buyLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Row's category label colour -- matches Design Handoff's CAT_FG table
 *  exactly (Combat -> --blood, Economy -> --brass-dim, Roster -> --sky,
 *  Care -> --moss, Unlocks -> --violet). Quests/Raids added patch 0351
 *  when their own upgrade trees moved in from the Quest Board/Raids tabs
 *  -- every other theme accent is already spoken for by the original
 *  five, so Quests reuses plain --brass (distinct enough from Economy's
 *  --brass-dim at a glance) and Raids reuses Combat's --blood (raids are
 *  inherently combat content, so sharing the tint reads as related
 *  rather than confusing). */
const CATEGORY_FG: Record<GuildHallCategory, string> = {
  Combat: 'var(--blood)',
  Economy: 'var(--brass-dim)',
  Roster: 'var(--sky)',
  Care: 'var(--moss)',
  Unlocks: 'var(--violet)',
  Quests: 'var(--brass)',
  Raids: 'var(--blood)',
};

const FILTERS: ('All' | GuildHallCategory)[] = ['All', 'Combat', 'Economy', 'Roster', 'Care', 'Unlocks', 'Quests', 'Raids'];

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
  /** Gets the clicked button so the spend can fly into it (patch 0420). */
  onBuy: (btn?: HTMLElement | null) => void;
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
    ...(def.unlocks === 'raidsMythic' ? [{ text: 'Unlocks Mythic raid difficulty', gold: true }] : []),
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
  row, beat, highlighted, onDismissHighlight,
}: {
  row: RowData;
  /** Patch 0420 -- this row's purchase beat, if one is playing (see
   *  usePurchaseBeats in purchaseFx.tsx). Replaces the old level-number
   *  pulse and MaxFlash star burst. */
  beat?: Beat;
  highlighted?: boolean; onDismissHighlight?: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  // While the coins are still in the air the row keeps showing the level
  // it had before the purchase, so the rule fill and the "Lv" roll land
  // together with the coins rather than a beat ahead of them.
  const shownLevel = shownValue(beat, row.level);
  const shownMaxed = shownLevel >= row.maxLevel;
  const pct2 = Math.min(100, (shownLevel / row.maxLevel) * 100);
  const rowRef = useRef<HTMLDivElement>(null);
  // Landed here via a "jump to the requirement" link -- scroll the exact
  // row into view rather than relying on the player to spot the glow
  // somewhere off-screen in a long list.
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);
  const beatClass = beat?.phase === 'levelup' ? 'fx-levelup'
    : beat?.phase === 'stamp' ? 'fx-stamped'
    : beat?.phase === 'file' ? 'fx-stamped fx-filing' : '';
  return (
    <div
      ref={rowRef}
      className={`guild-upgrade-row ${beatClass} ${highlighted ? 'card requirement-highlight' : ''}`}
      onClick={() => { setShowDetail(true); onDismissHighlight?.(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetail(true); onDismissHighlight?.(); } }}
    >
      <span style={{ minWidth: 0 }}>
        <span className="guild-row-head">
          <span className="guild-row-name">{row.name}</span>
          <span className="guild-row-cat" style={{ color: CATEGORY_FG[row.category] }}>{row.category}</span>
          <span className="guild-row-level">
            <LevelRoll beat={beat} value={row.level} render={(v) => `Lv ${v}/${row.maxLevel}`} />
          </span>
        </span>
        <span className="guild-row-effect">{row.effectText}</span>
        <span className="guild-row-rule">
          <span style={{ width: `${pct2}%`, background: shownMaxed ? 'var(--moss)' : 'var(--brass)' }} />
        </span>
      </span>
      <button
        className={`guild-buy-btn ${!row.buyDisabled ? 'affordable' : ''}`}
        disabled={row.buyDisabled}
        onClick={(e) => { e.stopPropagation(); row.onBuy(e.currentTarget); }}
      >
        {row.buyLabel}
      </button>
      {(beat?.phase === 'stamp' || beat?.phase === 'file') && (
        <SealStamp label={row.buyLabel} className="guild-row-stamp" />
      )}
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
  // Patch 0437 -- decorations on ice: a stray 'customize' request is still
  // consumed (so it can't leak into another tab) but never opens the scene.
  const [customizing, setCustomizing] = useState(() => engine.consumeRequestedSubTab() === 'customize' && GUILD_HALL_DECOR_ENABLED);

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
  // Raid Quartermaster's 3 upgrades and Quest Board's 2 fast-chance
  // upgrades, folded into this one unified list (patch 0351, direct
  // request: "unify all upgrade paths to a central spot, aside from
  // prestige items"). Both trees already lived entirely in
  // GuildManager/state (raidUpgrades/questFastUpgrades) -- only the UI
  // that rendered them is moving, not the underlying data or cost math.
  // The Replay Memories tab's own 'master' unlock tier (its literal
  // "buy the feature" upgrade) moves in the same way; the 6 saga bands
  // and the autopilot/autopilot_recover tiers stay on the Replay
  // Memories tab itself, same as vendor-specific upgrades staying on
  // each vendor's own page -- their cost/description only make sense
  // in the context of the saga list right next to them.
  const raidUpgradeDefs = GuildManager.raidUpgrades();
  const questFastUpgradeDefs = GuildManager.questFastUpgrades();
  const replayMasterTier = CHAIN_REPLAY_TIER_BY_ID['master'];
  // Patch 0420 -- one purchase beat per row (coin flight, level roll,
  // and on the final level the wax-seal stamp and file-away into the
  // Fully built strip). Replaces the separate useMaxFlash star burst and
  // usePulsesOnChange level pulse this list used to run side by side.
  const beats = usePurchaseBeats([
    ...facilities.map((def) => ({ id: def.id, value: GuildManager.facilityLevel(state, def.id), max: def.maxLevel })),
    ...generalUpgrades.map((def) => ({ id: def.id, value: GuildManager.upgradeLevel(state, def.id), max: def.maxLevel })),
    ...raidUpgradeDefs.map((def) => ({ id: def.id, value: GuildManager.raidUpgradeLevel(state, def.id), max: def.maxLevel })),
    ...questFastUpgradeDefs.map((def) => ({ id: def.id, value: GuildManager.questFastUpgradeLevel(state, def.id), max: def.maxLevel })),
    ...(replayMasterTier
      ? [{ id: replayMasterTier.id, value: GuildManager.hasChainReplayTier(state, replayMasterTier.id) ? 1 : 0, max: 1 }]
      : []),
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
      onBuy: (btn) => buyWithFx(engine, btn, () => engine.upgradeFacility(def.id)),
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
      onBuy: (btn) => buyWithFx(engine, btn, () => engine.buyUpgrade(def.id)),
    };
  }

  /**
   * Raid Quartermaster's 3 upgrades (patch 0351 -- previously their own
   * RaidUpgradeRow component inside RaidsPanel's now-retired Quartermaster
   * sub-tab). Dual gold-then-Renown pricing (nextRaidUpgradeCost), unlike
   * every other row above which is gold-only -- RowData.cost only ever
   * carried the gold figure, so a Renown-priced row reports `cost: null`
   * (same shape a maxed row already used) and bakes the real Renown price
   * into buyLabel/buyDisabled directly instead, since nothing else in this
   * file actually reads row.cost back out once buyLabel exists (confirmed
   * -- it's otherwise a dead field on RowData already).
   */
  function raidUpgradeRow(def: (typeof raidUpgradeDefs)[number]): RowData {
    const level = GuildManager.raidUpgradeLevel(state, def.id);
    const next = GuildManager.nextRaidUpgradeCost(state, def.id);
    const maxed = next === null;
    const affordable = !maxed && (next!.currency === 'gold' ? state.gold >= next!.cost : state.renown >= next!.cost);
    const entries = describeMods(def.modsPerLevel).map((line) => ({ text: `${line} per level` }));
    return {
      id: def.id, name: def.name, description: def.description,
      category: 'Raids', level, maxLevel: def.maxLevel, maxed, affordable,
      cost: next?.currency === 'gold' ? next.cost : null,
      effectText: entries.map((e) => e.text).join(' · '),
      statLines: entries.map((e) => <span key={e.text}>{e.text}</span>),
      buyLabel: maxed
        ? 'Fully upgraded'
        : next!.currency === 'gold' ? `Buy · ${formatGold(next!.cost)}` : `Buy · ${formatNumber(next!.cost)} renown`,
      buyDisabled: maxed || !affordable,
      onBuy: (btn) => buyWithFx(engine, btn, () => engine.buyRaidUpgrade(def.id)),
    };
  }

  /** Quest Board's 2 fast-chance upgrades (patch 0351 -- previously their
   *  own QuestFastUpgradeRow component inline on the Quest Board tab).
   *  Same dual-currency shape raidUpgradeRow above uses. */
  function questFastUpgradeRow(def: (typeof questFastUpgradeDefs)[number]): RowData {
    const level = GuildManager.questFastUpgradeLevel(state, def.id);
    const next = GuildManager.nextQuestFastUpgradeCost(state, def.id);
    const maxed = next === null;
    const affordable = !maxed && (next!.currency === 'gold' ? state.gold >= next!.cost : state.renown >= next!.cost);
    const effectText = def.fastChancePctPerLevel
      ? `+${def.fastChancePctPerLevel}% Fast chance per level, every difficulty`
      : `+${def.successPenaltyRecoveryPerLevel}% success back per level on Fast rolls`;
    return {
      id: def.id, name: def.name, description: def.description,
      category: 'Quests', level, maxLevel: def.maxLevel, maxed, affordable,
      cost: next?.currency === 'gold' ? next.cost : null,
      effectText,
      statLines: [<span key={effectText}>{effectText}</span>],
      buyLabel: maxed
        ? 'Fully upgraded'
        : next!.currency === 'gold' ? `Buy · ${formatGold(next!.cost)}` : `Buy · ${formatNumber(next!.cost)} renown`,
      buyDisabled: maxed || !affordable,
      onBuy: (btn) => buyWithFx(engine, btn, () => engine.buyQuestFastUpgrade(def.id)),
    };
  }

  /** Replay Memories' own "buy the feature" tier (patch 0351 -- the 6 saga
   *  bands and the autopilot/autopilot_recover tiers stay on the Replay
   *  Memories tab itself, see this file's own comment above on why).
   *  One-off gold purchase, modeled the same way every other binary
   *  unlock in generalUpgrades already is (maxLevel 1, level 0 or 1). */
  function replayMasterRow(tier: NonNullable<typeof replayMasterTier>): RowData {
    const owned = GuildManager.hasChainReplayTier(state, tier.id);
    const affordable = !owned && state.gold >= tier.goldCost;
    const effectText = 'Unlocks the Replay Memories tab -- revisit completed story chains for a chance at Heroic, Mythic, and Legendary gear.';
    return {
      id: tier.id, name: tier.sagaName, description: tier.description,
      category: 'Quests', level: owned ? 1 : 0, maxLevel: 1, maxed: owned, affordable,
      cost: tier.goldCost,
      effectText,
      statLines: [<span key={effectText} className="gold-text">{effectText}</span>],
      buyLabel: owned ? 'Unlocked' : `Buy · ${formatGold(tier.goldCost)}`,
      buyDisabled: owned || !affordable,
      onBuy: (btn) => buyWithFx(engine, btn, () => engine.buyChainReplayTier(tier.id)),
    };
  }

  // Facilities first, then permanent upgrades, then the raid/quest/replay
  // trees folded in from their own former tabs (patch 0351), source order
  // preserved within each group -- matches the design handoff's "single
  // list, not two grids" spec, extended rather than restructured.
  const rows: RowData[] = [
    ...facilities.map(facilityRow),
    ...generalUpgrades.map(upgradeRow),
    ...raidUpgradeDefs.map(raidUpgradeRow),
    ...questFastUpgradeDefs.map(questFastUpgradeRow),
    ...(replayMasterTier ? [replayMasterRow(replayMasterTier)] : []),
  ];

  // A row that just hit max stays in the main list for as long as its
  // purchase beat is still playing (stamp, then file-away), then drops
  // into Built on the render right after the beat ends.
  const active = rows.filter((r) => (!r.maxed || beats[r.id]) && (filter === 'All' || r.category === filter));
  const built = rows.filter((r) => r.maxed && !beats[r.id]);
  // The strip's own "one more filed" pop -- only on a real increase, never
  // on mount (same rule usePulsesOnChange always follows).
  const builtPulse = usePulsesOnChange([{ id: 'built', value: built.length }]).built;
  const exchangeJustUnlocked = useJustUnlocked('renownExchange', state.goldRenownExchangeUnlocked);
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
          <div className="card">
            <p className="small muted" style={{ margin: 0 }}>
              Facility levels apply to every hero, now and after every retirement. Vendor-specific
              upgrades (Blacksmith, Alchemist, Enchanter) live on each vendor's own page instead.
            </p>
          </div>
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
            beat={beats[row.id]}
            highlighted={row.id === highlightId}
            onDismissHighlight={() => setHighlightId(null)}
          />
        ))}
      </div>

      <div className={`guild-built-strip ${builtPulse ? 'fx-built-pulse' : ''}`}>
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
            onClick={(e) => buyWithFx(engine, e.currentTarget, () => engine.unlockRenownExchange())}
            title={GuildManager.canUnlockRenownExchange(state) ? undefined : 'Not enough gold'}
          >
            Unlock -- {formatGold(GuildManager.renownExchangeUnlockCost())} gold
          </button>
        </div>
      ) : (
        <RenownExchangeCard justUnlocked={exchangeJustUnlocked} />
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
function RenownExchangeCard({ justUnlocked }: { justUnlocked: boolean }) {
  const engine = useEngine();
  const state = engine.state;
  const [offerText, setOfferText] = useState('');
  const rate = GuildManager.goldPerRenown();
  const offer = Math.floor(Number(offerText));
  const validOffer = Number.isFinite(offer) && offer > 0;
  const renownPreview = validOffer ? Math.floor(offer / rate) : 0;
  const canExchange = validOffer && renownPreview >= 1 && state.gold >= renownPreview * rate;
  // Patch 0421 -- this card only mounts once the exchange is unlocked, so
  // "just unlocked" is simply "mounted because the flag flipped while the
  // Treasury section was on screen" -- tracked one level up, passed in.
  return (
    <div className={`card fx-unlock-host ${justUnlocked ? 'fx-unlocking' : ''}`}>
      {justUnlocked && <UnlockFx />}
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
          onClick={(e) => {
            // Patch 0424 -- coins fly into the button, then the renown it
            // bought flies back up to the header's renown counter.
            const btn = e.currentTarget;
            const renown0 = engine.state.renown;
            buyWithFx(engine, btn, () => engine.exchangeGoldForRenown(offer));
            const gained = engine.state.renown - renown0;
            if (gained > 0) flyTokens(btn, 'renown', 'gem', Math.min(6, 2 + gained), fxMs(380));
            setOfferText('');
          }}
          title={renownPreview >= 1 ? `Get ${renownPreview} Renown for ${formatGold(renownPreview * rate)} gold` : `Offer at least ${formatGold(rate)} gold`}
        >
          Exchange{renownPreview >= 1 ? ` -- ${renownPreview} Renown` : ''}
        </button>
      </div>
    </div>
  );
}
