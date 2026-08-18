import { useEffect, useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { GuildManager } from '../../game/managers/GuildManager';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, ChainDef, QUEST_TAG_BY_ID,
} from '../../game/data/quests';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { QuestOffer, Hero, AutoChainWeightBy } from '../../game/types';
import { formatDuration, formatGold } from '../../game/util';
import { RarityPill } from '../RarityPill';
import { EggIcon } from '../EggIcon';
import { ConfirmModal } from '../ConfirmModal';

export type Offer = QuestOffer;

/** Banner strip for a chain's quest-board entry, matching ChainBanner in
 *  LorePanel and RaidBanner in RaidsPanel exactly -- same asset, same
 *  "missing file just fails to paint" convention, so a chain's art shows
 *  up here automatically once it exists, no separate art needed. `banner`
 *  is the same optional DevTool-assigned override + focus point ChainBanner
 *  reads (ChainDef.banner) -- see its own comment in LorePanel.tsx. */
export function ChainQuestBanner({ chainId, banner }: { chainId: string; banner?: ChainDef['banner'] }) {
  const src = banner?.path ? `./lore/${banner.path}` : `./lore/chains/${chainId}.jpg`;
  return (
    <div
      aria-hidden="true"
      style={{
        backgroundImage: `url(${src})`,
        // See ChainBanner's own comment in LorePanel.tsx (patch 0164) --
        // same optional zoom, same fallback to plain 'cover'.
        backgroundSize: banner?.scale && banner.scale !== 100 ? `${banner.scale}%` : 'cover',
        backgroundPosition: `${banner?.focusX ?? 50}% ${banner?.focusY ?? 50}%`,
        height: 70,
        marginBottom: 8,
        borderRadius: 4,
      }}
    />
  );
}

/** Faint, full-card backdrop matching a quest's own tag (Combat, Escort,
 *  Explore, Arcane, Stealth, Defense) -- same optional-art-override +
 *  focus-point shape as ChainQuestBanner/ChainDef.banner just above, but
 *  rendered as a subtle absolutely-positioned wash behind the whole card
 *  (see .quest-tag-banner in app.css) rather than a bold reserved-height
 *  strip. Every quest offer has a tag, so this always has something to
 *  show once QUEST_TAG_BY_ID[tag].banner exists; a tag with no banner art
 *  assigned yet just renders nothing, same "missing file fails to paint
 *  quietly" convention as ChainQuestBanner.
 *
 *  Chain-quest offers skip this entirely (see the caller below) -- a
 *  chain already owns its own banner treatment (ChainQuestBanner), and
 *  most chains don't have dedicated art yet, so layering the generic tag
 *  wash behind them read as the tag art *replacing* the chain's own
 *  banner rather than a subtle backdrop next to it. */
function QuestTagBanner({ tag }: { tag: Offer['tag'] }) {
  const def = QUEST_TAG_BY_ID[tag];
  if (!def?.banner) return null;
  const src = def.banner.path ? `./lore/${def.banner.path}` : `./lore/quest-tags/${tag}.jpg`;
  const { scale } = def.banner;
  return (
    <div
      aria-hidden="true"
      className="quest-tag-banner"
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: `${def.banner.focusX ?? 50}% ${def.banner.focusY ?? 50}%`,
        // .quest-tag-banner's own `background-size: cover` (app.css)
        // covers the omitted/100 case already -- only overridden inline
        // when an actual zoom (patch 0164) has been set via the DevTool.
        ...(scale && scale !== 100 ? { backgroundSize: `${scale}%` } : {}),
      }}
    />
  );
}

export interface QuestCardProps {
  offer: Offer;
  isOpen: boolean;
  hero: Hero;
  now: number;
  onToggleExpanded: (offerId: string) => void;
  onSend: (offer: Offer, chainSteps?: boolean) => void;
  /** Freeze is only meaningful for a hero's own board contracts -- chain
   *  stages are guild-wide and always omit these. */
  isFrozen?: boolean;
  canFreeze?: boolean;
  onToggleFreeze?: (offer: Offer) => void;
}

/** Shared card body for both a hero's own Contracts and their Discovered
 *  Quests -- identical behaviour either way, the only difference is the
 *  banner art shown for a chain entry specifically. Always renders against
 *  whichever hero's tab is currently open (see QuestPanel) -- there's no
 *  separate hero picker inside the card anymore, since picking the hero is
 *  now the very first thing the player does on this tab. */
export function QuestCard({
  offer, isOpen, hero, now, onToggleExpanded, onSend,
  isFrozen, canFreeze, onToggleFreeze,
}: QuestCardProps) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chance = QuestManager.previewSuccess(state, hero, offer, hero.equippedConsumables ?? [], now);
  const duration = QuestManager.previewDuration(state, hero, offer, now);
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const levelGap = Math.max(0, offer.reqLevel - hero.level);

  return (
    <div className={`card quest-card ${offer.difficulty} ${offer.chain ? 'chain' : ''}`}>
      {!offer.chain && <QuestTagBanner tag={offer.tag} />}
      <div className="quest-card-content">
      {offer.chain && <ChainQuestBanner chainId={offer.chain.chainId} banner={chain?.banner} />}
      <div
        className="card-head hero-card-summary"
        onClick={() => onToggleExpanded(offer.id)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpanded(offer.id); } }}
      >
        <span className="card-title quest-title hero-card-name">{offer.name}</span>
        <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
        {isFrozen && (
          <span className="tag" style={{ color: 'var(--sky)' }} title="This contract is frozen -- it won't be replaced by a board refresh, reroll, or restock">
            ❄ Frozen
          </span>
        )}
        {offer.chain && (
          <span className="tag" style={{ color: 'var(--blood)' }}>
            Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
          </span>
        )}
      </div>

      <div className="stat-row" style={{ margin: '6px 0' }}>
        {levelGap > 0 && (
          <span className="tiny" style={{ color: 'var(--blood)' }}>
            {levelGap} level{levelGap === 1 ? '' : 's'} under -- reduced success chance
          </span>
        )}
        <span>Success <b className={chance >= 60 ? 'good' : chance >= 35 ? '' : 'bad'}>{Math.round(chance)}%</b></span>
        <span>Time <b>{formatDuration(duration)}</b></span>
        <span>Gold <b className="gold-text">{formatGold(offer.rewardGold)}</b></span>
        <span>XP <b>{offer.rewardXp}</b></span>
      </div>

      {isOpen && (
        <>
          <p className="card-flavour">{chain ? `${chain.description} — ${offer.flavour}` : offer.flavour}</p>
          {QuestManager.previewLoot(state, hero, offer, [], now).length > 0 && (
            <>
              <div className="tiny muted" style={{ marginBottom: 2 }}>Chance to find</div>
              <div className="row wrap quest-popout-loot" style={{ gap: 6, alignItems: 'center' }}>
                {QuestManager.previewLoot(state, hero, offer, [], now).map((entry) => (
                  <span key={entry.name} className="row" style={{ gap: 4, alignItems: 'center' }}>
                    <span className="tiny">{entry.name}</span>
                    <span className="tiny muted">{Math.round(entry.chance)}%</span>
                    <RarityPill rarity={entry.rarity} />
                  </span>
                ))}
              </div>
            </>
          )}
          {chain && offer.chain && offer.chain.stage + 1 === offer.chain.totalStages && (() => {
            const completion = QuestManager.chainCompletionPreview(chain);
            return (
              <>
                <div className="tiny muted" style={{ marginTop: 8, marginBottom: 2 }}>
                  Guaranteed on completion
                </div>
                <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="tiny gold-text">+{formatGold(completion.rewardGold)} gold</span>
                  {completion.rewardRenown > 0 && (
                    <span className="tiny" style={{ color: 'var(--violet)' }}>+{completion.rewardRenown} renown</span>
                  )}
                  {completion.items.map((item) => (
                    <span key={item.name} className="row" style={{ gap: 4, alignItems: 'center' }}>
                      <span className="tiny">{item.name}</span>
                      <RarityPill rarity={item.rarity} />
                    </span>
                  ))}
                  {completion.egg && (
                    <span className="row" style={{ gap: 4, alignItems: 'center' }}>
                      <EggIcon rarity={completion.egg.rarity} size={16} />
                      <span className="tiny">Egg</span>
                      <RarityPill rarity={completion.egg.rarity} />
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </>
      )}

      <div className="row end" style={{ marginTop: 8, gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-ghost hero-card-expand"
          onClick={() => onToggleExpanded(offer.id)}
        >
          {isOpen ? 'Less ▲' : 'More ▼'}
        </button>
        {!offer.chain && onToggleFreeze && (
          <button
            className="btn-ghost"
            onClick={() => onToggleFreeze(offer)}
            disabled={!isFrozen && !canFreeze}
            title={isFrozen
              ? 'Unfreeze -- always free, this contract will refresh normally again'
              : canFreeze
                ? "Freeze -- keep this contract on the board through the next refresh, reroll, or restock"
                : 'No freezes left today'}
          >
            {isFrozen ? '❄ Unfreeze' : '❄ Freeze'}
          </button>
        )}
        {offer.chain && offer.chain.stage + 1 < offer.chain.totalStages ? (
          <>
            <button
              className="btn-ghost"
              title="Send this stage only -- return to the board afterward"
              onClick={() => onSend(offer, false)}
            >
              Send on Quest
            </button>
            <button
              className="btn-primary"
              title="Automatically continue this hero through the rest of the chain"
              onClick={() => onSend(offer, true)}
            >
              Chain Quest Steps
            </button>
          </>
        ) : (
          <button className="btn-primary" onClick={() => onSend(offer)}>
            Send {hero.name}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

/** One hero's tab -- name, level, and at-a-glance status. Selected state
 *  reuses the same chip/on treatment the old hero-assign picker already
 *  used inside a card; injury/questing status reuse the same glyphs too,
 *  so switching to a hero-first flow doesn't also invent a new visual
 *  language for something players already recognise. */
export function HeroTab({ hero, selected, onSelect }: { hero: Hero; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`hero-tab-chip ${selected ? 'on' : ''} ${hero.injuries.length > 0 ? 'risky' : ''}`}
      onClick={onSelect}
    >
      {hero.name} · Lv {hero.level}
      {hero.status === 'questing' ? ' ⏳' : ''}
      {hero.injuries.length > 0 ? ' ⚑' : ''}
    </button>
  );
}

export function QuestPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  // Condensed by default, same pattern as the Heroes tab -- a full board of
  // contracts used to run the panel very long. Flavour text and the full
  // loot list live behind the per-card toggle now.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (offerId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(offerId)) next.delete(offerId); else next.add(offerId);
      return next;
    });
  };

  // Which hero's own log is currently open. A large, level-varied roster
  // used to share one 6-slot board -- messy, since the board's difficulty
  // mix was scaled around whichever hero happened to be the guild's top
  // level, and everyone competed for the same handful of slots. Each hero
  // now generates and keeps their own pool (see
  // QuestManager.generateContractsForHero), so picking a hero here picks
  // whose pool you're looking at, not who to send on a shared offer.
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(state.heroes[0]?.id ?? null);
  useEffect(() => {
    // Falls back to the first hero if the previously-selected one no longer
    // exists. Only Early Retirement actually removes a hero from the
    // roster outright (an ordinary Retire reuses the same id, reset to
    // level 1) -- but a fresh save or an imported one could also just not
    // contain whatever id was last selected.
    if (!state.heroes.some((h) => h.id === selectedHeroId)) {
      setSelectedHeroId(state.heroes[0]?.id ?? null);
    }
  }, [state.heroes, selectedHeroId]);
  const selectedHero = state.heroes.find((h) => h.id === selectedHeroId) ?? state.heroes[0];

  // How the contract board is currently ordered -- tier ascending was
  // always the only option; once the freeze slot and reroll put more
  // contracts in front of a player at once, sorting by what actually
  // matters (odds, or payout) became worth having too.
  const [sortMode, setSortMode] = useState<'tier' | 'success' | 'reward'>('tier');

  // This hero's own contract pool, sorted by difficulty tier ascending --
  // the closest board-offer analogue to "rarity", since a plain quest
  // offer has no rarity field of its own.
  //
  // Deliberately depends on the hero's own board array (state.questBoards
  // [selectedHero.id]), not the outer state.questBoards Record itself.
  // The engine always reassigns that inner array on every regeneration
  // (see QuestManager.rerollContractsForHero, engine.refreshWorld, and the
  // Auto-Chain restock) but mutates it INTO the same outer Record object
  // rather than ever replacing the Record -- so the Record's own reference
  // never changes, and a dependency on it alone would never trigger a
  // recompute. This was the actual cause of "Reroll spends gold but the
  // board doesn't visibly change": the board really did rotate in state,
  // this memo just kept returning its stale cached value against an
  // unchanged Record reference.
  const contractOffers = useMemo(() => {
    const offers = [...(state.questBoards[selectedHero.id] ?? [])];
    if (sortMode === 'success') {
      return offers.sort((a, b) => QuestManager.previewSuccess(state, selectedHero, b, selectedHero.equippedConsumables ?? [], now)
        - QuestManager.previewSuccess(state, selectedHero, a, selectedHero.equippedConsumables ?? [], now));
    }
    if (sortMode === 'reward') {
      return offers.sort((a, b) => b.rewardGold - a.rewardGold);
    }
    return offers.sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty));
  }, [state.questBoards[selectedHero.id], selectedHero, sortMode, now]);

  // Consumables no longer live on this tab -- quests automatically use
  // whatever's equipped on the sent hero's own consumable slots instead of
  // a loadout picked at send time.
  const send = (offer: Offer, chainSteps = false) => {
    engine.startQuest(selectedHero.id, offer, [], chainSteps);
  };

  // Confirmed before cancelling anything -- pulling a hero back mid-quest
  // forfeits whatever that quest would have paid out, and (per
  // recallHero) also drops any Auto-Chain streak or chain-stepping they
  // had queued up, so this isn't something to trigger by an accidental
  // click. Routed through the in-theme ConfirmModal (state holds which
  // hero, if any, is pending a recall confirmation) instead of a native
  // `confirm()` -- that dialog rendered as an unstyled OS text box, out
  // of place next to everything else in the game. See
  // guild-idler-status.md's "Recall confirmation -- fixed" entry.
  const [pendingRecallHeroId, setPendingRecallHeroId] = useState<string | null>(null);
  const recall = (heroId: string) => setPendingRecallHeroId(heroId);
  const confirmRecall = () => {
    if (pendingRecallHeroId) engine.recallHero(pendingRecallHeroId);
    setPendingRecallHeroId(null);
  };

  // Roster-wide count of heroes not currently questing -- drives the "Send
  // All Idle" button (see engine.sendAllIdle). Doesn't check whether each
  // idle hero actually has an eligible contract; sendAllIdle itself skips
  // anyone with nothing open rather than the button needing to know that
  // in advance.
  const idleCount = state.heroes.filter((h) => h.status !== 'questing').length;

  // Quick-assign now acts on whichever hero's tab is open, sending them on
  // the best contract from their own board -- the per-hero equivalent of
  // the old board-wide "first idle hero, first contract they qualify for"
  // shortcut.
  const autoChainDef = GuildManager.upgrades().find((u) => u.unlocks === 'autoChain');
  const autoChainOwned = !!autoChainDef && GuildManager.upgradeLevel(state, autoChainDef.id) > 0;
  const chainTacticsDef = GuildManager.upgrades().find((u) => u.unlocks === 'autoChainTactics');
  const chainTacticsOwned = !!chainTacticsDef && GuildManager.upgradeLevel(state, chainTacticsDef.id) > 0;
  const tactics = state.autoChainTactics ?? { successFloor: 50, weightBy: 'gold' as const };
  const quickAssign = () => {
    const offer = QuestManager.pickBestQuest(state, selectedHero, now);
    if (offer) send(offer);
  };

  // Free once a day (more via the Board Runner guild upgrade), then an
  // escalating gold cost -- see QuestManager.questRerollCost. The
  // free/paid count is account-wide, shared across every hero's board, not
  // reset per hero.
  const rerollCost = QuestManager.questRerollCost(state, now);
  const reroll = () => engine.rerollQuestBoard(selectedHero.id);

  // Freeze/unfreeze -- one slot per hero. Freezing is gated on a shared
  // daily allowance (more via Board Warden); unfreezing is always free and
  // never blocked by it, so running out of freezes can't trap a player
  // holding one they no longer want. See QuestManager.freezeChangesRemaining.
  const frozenOfferId = state.frozenQuestOffers[selectedHero.id]?.id;
  const freezeChangesLeft = QuestManager.freezeChangesRemaining(state, now);
  const toggleFreeze = (offer: Offer) => {
    if (frozenOfferId === offer.id) engine.unfreezeQuestOffer(selectedHero.id);
    else engine.freezeQuestOffer(selectedHero.id, offer.id);
  };

  return (
    <>
      <h2>Quest Board</h2>
      <p className="subtitle">
        Each hero keeps their own contracts, scaled to their own level. Pick a hero below to see
        what's open to them.
      </p>

      {/* --------------------------- active quests --------------------------- */}
      {state.activeQuests.length > 0 && (
        <>
          <div className="section-heading">On the road</div>
          {state.activeQuests.map((quest) => {
            const questHero = state.heroes.find((h) => h.id === quest.heroId);
            const total = quest.endsAt - quest.startedAt;
            const progress = Math.min(100, ((now - quest.startedAt) / total) * 100);
            return (
              <div key={quest.id} className={`card ${quest.offer.difficulty}`}>
                <div className="spread">
                  <span className="card-title quest-title">{quest.offer.name}</span>
                  <span className="small gold-text">{formatDuration(quest.endsAt - now)}</span>
                </div>
                <div className="stat-row" style={{ margin: '4px 0 6px' }}>
                  <span>{questHero?.name ?? 'A hero'}</span>
                  <span>Success <b>{Math.round(quest.finalSuccess)}%</b></span>
                  <span>Reward <b className="gold-text">{formatGold(quest.offer.rewardGold * quest.goldMultiplier)}</b></span>
                  {quest.consumables.length > 0 && (
                    <span>Used {quest.consumables.map((c) => InventoryManager.resolveDef(state, c)?.name).join(', ')}</span>
                  )}
                </div>
                <div className="bar"><span style={{ width: `${progress}%` }} /></div>
                <div className="row end" style={{ marginTop: 6 }}>
                  <button
                    className="btn-ghost"
                    style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
                    onClick={() => recall(quest.heroId)}
                  >
                    Recall
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ------------------------------- hero tabs ------------------------------- */}
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>Heroes</div>
        {idleCount > 0 && (
          <button
            className="btn-green"
            style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
            onClick={() => engine.sendAllIdle()}
            title="Send every idle hero on their own best contract"
          >
            Send All Idle ({idleCount})
          </button>
        )}
      </div>

      {/* Chain Tactics -- guild-wide overrides for what the Auto-Chain
          bounty streak's own picker (pickBestQuest) considers "best".
          Only rendered once the upgrade is owned; a change here only
          affects streaks rolled after this point, not one already
          running (see engine.setAutoChainTactics's own comment). */}
      {chainTacticsOwned && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>Chain Tactics</div>
          <p className="tiny muted" style={{ margin: '0 0 8px' }}>
            Overrides what Auto-Chain picks for a streaking hero. Applies to streaks started after you change these.
          </p>
          <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
            <label className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="tiny muted">Minimum success</span>
              <select
                value={tactics.successFloor}
                onChange={(e) => engine.setAutoChainTactics({ successFloor: Number(e.target.value) })}
                style={{
                  background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                  color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
                }}
              >
                <option value={50}>Default (50%)</option>
                <option value={70}>70%</option>
                <option value={80}>80%</option>
                <option value={90}>90%</option>
              </select>
            </label>
            <label className="row" style={{ gap: 6, alignItems: 'center' }}>
              <span className="tiny muted">Prioritize</span>
              <select
                value={tactics.weightBy}
                onChange={(e) => engine.setAutoChainTactics({ weightBy: e.target.value as AutoChainWeightBy })}
                style={{
                  background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                  color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
                }}
              >
                <option value="gold">Gold</option>
                <option value="xp">XP</option>
                <option value="loot">Loot</option>
                <option value="balanced">Balanced</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {state.heroes.map((h) => (
          <HeroTab key={h.id} hero={h} selected={h.id === selectedHero.id} onSelect={() => setSelectedHeroId(h.id)} />
        ))}
      </div>

      {selectedHero.status === 'questing' ? (
        <p className="small muted">{selectedHero.name} is already out -- see "On the road" above.</p>
      ) : (
        <>
          {/* ------------------------------- contracts ------------------------------- */}
          <div className="spread" style={{ alignItems: 'center' }}>
            <div className="section-heading" style={{ marginBottom: 0 }}>{selectedHero.name}'s Contracts</div>
            <div className="row" style={{ gap: 6 }}>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                title="Sort this hero's contracts"
                style={{
                  background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                  color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
                }}
              >
                <option value="tier">Sort: Tier</option>
                <option value="success">Sort: Best odds</option>
                <option value="reward">Sort: Best reward</option>
              </select>
              <button
                className="btn-ghost"
                style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
                onClick={reroll}
                disabled={rerollCost > state.gold}
                title={rerollCost > 0
                  ? `Reroll this hero's contracts for ${rerollCost} gold`
                  : "Reroll this hero's contracts -- free today"}
              >
                {rerollCost > 0 ? `Reroll · ${formatGold(rerollCost)}` : 'Reroll · Free'}
              </button>
              <span className="tiny" style={{ color: 'var(--sky)' }} title="Freezes left today -- unfreezing is always free">
                ❄ {freezeChangesLeft} freeze{freezeChangesLeft === 1 ? '' : 's'} left today
              </span>
              {autoChainOwned && contractOffers.length > 0 && (
                <button
                  className="btn-ghost"
                  style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
                  onClick={quickAssign}
                  title="Send this hero on the best contract from their own board"
                >
                  Quick-assign
                </button>
              )}
            </div>
          </div>
          {contractOffers.length === 0 && <p className="small muted">Nothing open right now. New contracts arrive within the half hour.</p>}
          {contractOffers.map((offer) => (
            <QuestCard
              key={offer.id}
              offer={offer}
              isOpen={expanded.has(offer.id)}
              hero={selectedHero}
              now={now}
              onToggleExpanded={toggleExpanded}
              onSend={send}
              isFrozen={frozenOfferId === offer.id}
              canFreeze={freezeChangesLeft > 0}
              onToggleFreeze={toggleFreeze}
            />
          ))}
        </>
      )}

      {pendingRecallHeroId && (
        <ConfirmModal
          title="Recall hero"
          message="Cancel the current quest and bring the hero home? The quest's reward is forfeited."
          confirmLabel="Recall"
          cancelLabel="Keep going"
          onConfirm={confirmRecall}
          onCancel={() => setPendingRecallHeroId(null)}
        />
      )}
    </>
  );
}
