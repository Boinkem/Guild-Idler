import { useEffect, useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { GuildManager } from '../../game/managers/GuildManager';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, ChainDef, QUEST_TAG_BY_ID, TUTORIAL_QUEST_ID,
} from '../../game/data/quests';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { QuestOffer, Hero, AutoChainWeightBy } from '../../game/types';
import { formatDuration, formatGold } from '../../game/util';
import { RarityPill } from '../RarityPill';
import { EggIcon } from '../EggIcon';
import { ConfirmModal } from '../ConfirmModal';

export type Offer = QuestOffer;

/** Pulled out of ChainQuestBanner below so DiscoveredQuestsPanel's own
 *  compact row thumbnail (ChainRow) can resolve the exact same image
 *  without duplicating the fallback logic -- same asset, same "missing
 *  file just fails to paint" convention either way. */
export function chainBannerSrc(chainId: string, banner?: ChainDef['banner']): string {
  return banner?.path ? `./lore/${banner.path}` : `./lore/chains/${chainId}.jpg`;
}

/**
 * Patch 0270. The collapsed-card version of chainBannerSrc above -- used
 * ONLY by ChainRow's own `.raid-card-thumb` (this file's QuestRow, and
 * DiscoveredQuestsPanel's ChainRow), never by ChainQuestBanner or any
 * modal, both of which keep showing the full banner exactly as before.
 * Prefers the chain's dedicated `icon` when one has actually been
 * assigned; falls back to chainBannerSrc's own banner-crop result
 * otherwise -- deliberately not a guessed `chains-icons/<id>.jpg`
 * convention path, since no icon art exists anywhere yet and guessing
 * would blank out every existing chain card's thumb at once. See
 * ChainDef.icon's own comment in quests.ts for the full reasoning.
 */
export function chainIconSrc(chainId: string, icon?: ChainDef['icon'], banner?: ChainDef['banner']): string {
  return icon?.path ? `./lore/${icon.path}` : chainBannerSrc(chainId, banner);
}

/** Banner strip for a chain's quest-board entry, matching ChainBanner in
 *  LorePanel and RaidBanner in RaidsPanel exactly -- same asset, same
 *  "missing file just fails to paint" convention, so a chain's art shows
 *  up here automatically once it exists, no separate art needed. `banner`
 *  is the same optional DevTool-assigned override + focus point ChainBanner
 *  reads (ChainDef.banner) -- see its own comment in LorePanel.tsx.
 *  `height`/`className` default to the original 70px inline-card strip;
 *  ChainDetailModal passes its own 90px height to match RaidDetailModal's
 *  own banner strip instead of introducing a third size. Always shows the
 *  full banner, never the collapsed-card `icon` (patch 0270) -- every call
 *  site of this component is already a detail/board strip, not a
 *  collapsed card thumb. */
export function ChainQuestBanner({
  chainId, banner, height = 70, className,
}: { chainId: string; banner?: ChainDef['banner']; height?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundImage: `url(${chainBannerSrc(chainId, banner)})`,
        // See ChainBanner's own comment in LorePanel.tsx (patch 0164) --
        // same optional zoom, same fallback to plain 'cover'.
        backgroundSize: banner?.scale && banner.scale !== 100 ? `${banner.scale}%` : 'cover',
        backgroundPosition: `${banner?.focusX ?? 50}% ${banner?.focusY ?? 50}%`,
        height,
        marginBottom: 8,
        borderRadius: 4,
      }}
    />
  );
}

/** Resolves a quest tag's own banner art (Combat, Escort, Explore, Arcane,
 *  Stealth, Defense) to a plain image src -- same source QUEST_TAG_BY_ID
 *  [tag].banner has always used, just returned as a string instead of
 *  rendered as its own absolutely-positioned wash. Used two places now:
 *  QuestRow's 56×56 thumbnail (background-image + object-fit-equivalent
 *  cover, same technique ChainRow already uses for chainBannerSrc in
 *  DiscoveredQuestsPanel.tsx) and QuestDetailModal's full-width banner
 *  strip. Returns undefined if the tag has no banner art yet -- same
 *  "missing file just fails to paint quietly" convention as
 *  chainBannerSrc, the caller's own background-color fallback
 *  (.raid-card-thumb / .raid-detail-banner) carries the blank case. */
export function questTagBannerSrc(tag: Offer['tag']): string | undefined {
  const def = QUEST_TAG_BY_ID[tag];
  if (!def?.banner) return undefined;
  return def.banner.path ? `./lore/${def.banner.path}` : `./lore/quest-tags/${tag}.jpg`;
}

/**
 * Patch 0270. The collapsed-card version of questTagBannerSrc above --
 * used ONLY by QuestRow's own `.raid-card-thumb` for a standard (non-chain)
 * offer, never by QuestDetailModal, which keeps showing the full banner
 * exactly as before. Same "prefer the dedicated icon, fall back to the
 * banner crop, never guess a convention path" reasoning as chainIconSrc
 * above -- see QuestTagDef.icon's own comment in quests.ts.
 */
export function questTagIconSrc(tag: Offer['tag']): string | undefined {
  const def = QUEST_TAG_BY_ID[tag];
  if (def?.icon?.path) return `./lore/${def.icon.path}`;
  return questTagBannerSrc(tag);
}

/**
 * Collapsed row -- same shape as RaidsPanel's own .raid-card (thumbnail +
 * name/meta + chevron) and DiscoveredQuestsPanel's ChainRow, reusing that
 * exact class family rather than inventing a parallel one. A chain offer's
 * thumbnail uses ChainQuestBanner's own source (chainBannerSrc); a
 * standard offer uses its tag's art (questTagBannerSrc) instead of the
 * old full-width wash strip. Difficulty/Chain/Frozen tags plus a quick
 * success%/gold glance keep the odds and payout visible without opening
 * the detail modal -- same four data points the old always-expanded card
 * showed in its header + stat row, condensed onto one line.
 */
export function QuestRow({
  offer, hero, now, isFrozen, onOpen,
}: { offer: Offer; hero: Hero; now: number; isFrozen?: boolean; onOpen: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const chance = QuestManager.previewSuccess(state, hero, offer, hero.equippedConsumables ?? [], now);
  const thumbSrc = offer.chain
    ? chainIconSrc(offer.chain.chainId, chain?.icon, chain?.banner)
    : questTagIconSrc(offer.tag);
  // Patch 0288: the same rotating gold-ring shimmer a nav tab gets when it
  // has something unread (.nav-tab-unread in app.css), reused here as a
  // "do this next" nudge on specific quest cards -- the scripted tutorial
  // quest itself (always the only offer on a fresh guild's board, see
  // tutorialQuestOffer), then every burst-mode offer once
  // pendingBurstQuestSpotlight arms (see that field's own comment in
  // types.ts for why it targets the whole burst category rather than one
  // specific offer instance).
  const isSpotlighted = offer.id === TUTORIAL_QUEST_ID
    || (state.pendingBurstQuestSpotlight && QuestManager.isBurstOffer(offer));

  return (
    <div
      className={`card raid-card${isSpotlighted ? ' quest-card-spotlight' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <div
        className="raid-card-thumb"
        style={thumbSrc ? { backgroundImage: `url(${thumbSrc})` } : undefined}
      />
      <div className="raid-card-body">
        <div className="raid-card-name">{offer.name}</div>
        <div className="raid-card-meta">
          <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
          {offer.chain && (
            <span className="tag" style={{ color: 'var(--blood)' }}>
              Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
            </span>
          )}
          {isFrozen && (
            <span className="tag" style={{ color: 'var(--sky)' }} title="This contract is frozen -- it won't be replaced by a board refresh, reroll, or restock">
              ❄ Frozen
            </span>
          )}
          <span className="tiny">{Math.round(chance)}% success</span>
          <span className="tiny gold-text">{formatGold(offer.rewardGold)} gold</span>
        </div>
      </div>
      <span className="raid-card-chevron" aria-hidden="true">›</span>
    </div>
  );
}

/**
 * Full detail, opened by tapping a QuestRow -- same overlay/modal shell
 * RaidDetailModal/ChainDetailModal already use, content directly in the
 * modal (no nested .card). Everything here previously lived inline on
 * QuestCard once expanded: the 90px banner, full stat row, always-visible
 * flavour text (opening the modal *is* "more" now, no separate toggle),
 * loot preview, guaranteed-on-completion block for a chain's final stage,
 * and every action button -- all four branches preserved exactly, just
 * living in the modal footer instead of the card footer. Shared by both
 * a hero's own Contracts (freeze/autoChain-aware) and, indirectly, the
 * same shape DiscoveredQuestsPanel's own ChainDetailModal already used
 * for Story Quests.
 */
export function QuestDetailModal({
  offer, hero, now, onClose, onSend,
  isFrozen, canFreeze, onToggleFreeze, autoChainOwned,
}: {
  offer: Offer; hero: Hero; now: number; onClose: () => void;
  onSend: (offer: Offer, chainSteps?: boolean, startStreak?: boolean) => void;
  /** Freeze is only meaningful for a hero's own board contracts. */
  isFrozen?: boolean;
  canFreeze?: boolean;
  onToggleFreeze?: (offer: Offer) => void;
  /** Only meaningful for a standard (non-chain) offer -- gates the
   *  "Send Once"/"Send & Chain" choice below. */
  autoChainOwned?: boolean;
}) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chance = QuestManager.previewSuccess(state, hero, offer, hero.equippedConsumables ?? [], now);
  const duration = QuestManager.previewDuration(state, hero, offer, now);
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const levelGap = Math.max(0, offer.reqLevel - hero.level);
  const loot = QuestManager.previewLoot(state, hero, offer, [], now);
  const completion = chain && offer.chain && offer.chain.stage + 1 === offer.chain.totalStages
    ? QuestManager.chainCompletionPreview(chain) : null;
  const tagSrc = !offer.chain ? questTagBannerSrc(offer.tag) : undefined;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
        {offer.chain ? (
          <ChainQuestBanner chainId={offer.chain.chainId} banner={chain?.banner} height={90} />
        ) : tagSrc ? (
          <div className="raid-detail-banner" style={{ backgroundImage: `url(${tagSrc})` }} />
        ) : null}
        <div className="spread">
          <span className="card-title hero-card-name">{offer.name}</span>
          <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        {offer.chain && (
          // Patch 0275: the stage name lives here now, not glued onto the
          // card's own title (see QuestOffer.stageName's own comment in
          // types.ts) -- a comma, not the em dash the card's title used
          // to use, since this is a direct request to drop that
          // separator everywhere it showed up.
          <div className="tag" style={{ color: 'var(--blood)', display: 'inline-block', marginTop: 4 }}>
            Chain {offer.chain.stage + 1}/{offer.chain.totalStages}{offer.stageName ? `, ${offer.stageName}` : ''}
          </div>
        )}
        {isFrozen && (
          <div className="tag" style={{ color: 'var(--sky)', display: 'inline-block', marginTop: 4 }}>
            ❄ Frozen
          </div>
        )}
        <p className="card-flavour">{chain ? `${chain.description} ${offer.flavour}` : offer.flavour}</p>

        {levelGap > 0 && (
          <p className="tiny" style={{ color: 'var(--blood)', margin: '0 0 6px' }}>
            {levelGap} level{levelGap === 1 ? '' : 's'} under -- reduced success chance
          </p>
        )}
        <div className="stat-row" style={{ margin: '6px 0' }}>
          <span>Success <b className={chance >= 60 ? 'good' : chance >= 35 ? '' : 'bad'}>{Math.round(chance)}%</b></span>
          <span>Time <b>{formatDuration(duration)}</b></span>
          <span>Gold <b className="gold-text">{formatGold(offer.rewardGold)}</b></span>
          <span>XP <b>{offer.rewardXp}</b></span>
        </div>

        {loot.length > 0 && (
          <>
            <div className="tiny muted" style={{ marginBottom: 2 }}>Chance to find</div>
            <div className="row wrap quest-popout-loot" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
              {loot.map((entry) => (
                <span key={entry.name} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="tiny">{entry.name}</span>
                  <span className="tiny muted">{Math.round(entry.chance)}%</span>
                  <RarityPill rarity={entry.rarity} />
                </span>
              ))}
            </div>
          </>
        )}

        {completion && (
          <>
            <div className="tiny muted" style={{ marginTop: 8, marginBottom: 2 }}>
              Guaranteed on completion
            </div>
            <div className="row wrap" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
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
        )}

        <div className="row end" style={{ marginTop: 8, gap: 6 }}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
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
          ) : !offer.chain && autoChainOwned ? (
            // Standard-contract counterpart to the chain-stage pair above --
            // previously a plain "Send" here always silently rolled an
            // Auto-Chain bounty streak with no way to opt out short of not
            // owning the upgrade at all. See GameEngine.startQuest's own
            // `startStreak` doc comment.
            <>
              <button
                className="btn-ghost"
                title="Send just this one -- no Auto-Chain streak"
                onClick={() => onSend(offer, false, false)}
              >
                Send Once
              </button>
              <button
                className="btn-primary"
                title="Send, then automatically keep this hero chaining into further contracts"
                onClick={() => onSend(offer, false, true)}
              >
                Send &amp; Chain
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

  // Which row's detail modal is currently open -- replaces the old
  // per-card expand/collapse toggle now that a row opens a full modal
  // instead of expanding inline (same shape DiscoveredQuestsPanel already
  // uses for its own openOfferId).
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);

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

  const openContractOffer = openOfferId ? contractOffers.find((o) => o.id === openOfferId) ?? null : null;

  // Consumables no longer live on this tab -- quests automatically use
  // whatever's equipped on the sent hero's own consumable slots instead of
  // a loadout picked at send time.
  const send = (offer: Offer, chainSteps = false, startStreak = true) => {
    engine.startQuest(selectedHero.id, offer, [], chainSteps, startStreak);
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
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/quests.jpg)' }}>
      <div className="tab-scene-content">
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
          <div className="raid-list">
            {contractOffers.map((offer) => (
              <QuestRow
                key={offer.id}
                offer={offer}
                hero={selectedHero}
                now={now}
                isFrozen={frozenOfferId === offer.id}
                onOpen={() => setOpenOfferId(offer.id)}
              />
            ))}
          </div>
          {openContractOffer && (
            <QuestDetailModal
              offer={openContractOffer}
              hero={selectedHero}
              now={now}
              onClose={() => setOpenOfferId(null)}
              onSend={(offer, chainSteps, startStreak) => {
                send(offer, chainSteps, startStreak);
                setOpenOfferId(null);
              }}
              isFrozen={frozenOfferId === openContractOffer.id}
              canFreeze={freezeChangesLeft > 0}
              onToggleFreeze={toggleFreeze}
              autoChainOwned={autoChainOwned}
            />
          )}
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
      </div>
    </div>
  );
}
