import { useEffect, useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import {
  HeroTab, ChainQuestBanner, chainIconSrc, Offer,
} from './QuestPanel';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { CHAIN_REPLAY_TIERS, CHAIN_REPLAY_DIFFICULTIES, chainReplayTierForChain, chainReplayBandPercent } from '../../game/data/chainReplay';
import { scaleDedicatedItem } from '../../game/data/proceduralLoot';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { DIFFICULTIES, ChainDef } from '../../game/data/quests';
import { Hero, ChainReplayDifficulty, ChainReplayTierDef, EquipmentDef } from '../../game/types';
import { isTabUnread } from '../../game/attention';
import { RarityPill } from '../RarityPill';
import { EggIcon } from '../EggIcon';
import {
  formatDuration, formatGold, describeMods, describeStats, RARITY_COLOR,
} from '../../game/util';
import { Tuning } from '../../game/data/tuning';

const REPLAY_DIFFICULTY_ORDER: ChainReplayDifficulty[] = ['normal', 'heroic', 'legendary'];
const REPLAY_DIFFICULTY_LABEL: Record<ChainReplayDifficulty, string> = { normal: 'N', heroic: 'H', legendary: 'L' };
const REPLAY_DIFFICULTY_NAME: Record<ChainReplayDifficulty, string> = { normal: 'Normal', heroic: 'Heroic', legendary: 'Legendary' };
const REPLAY_DIFFICULTY_COLOR: Record<ChainReplayDifficulty, string> = {
  normal: 'var(--parchment)', heroic: 'var(--brass)', legendary: 'var(--violet)',
};
/** Same graceful icon-with-text-fallback shape RAID_DIFFICULTY_ICON already
 *  uses (see RaidsPanel's own DifficultyCircle) -- dedicated icon assets
 *  for these three are still to come; until they land in
 *  public/chain-replay-icons/, every circle just shows its N/H/L letter,
 *  same as a raid difficulty circle would before its own icon loaded. */
const REPLAY_DIFFICULTY_ICON: Record<ChainReplayDifficulty, string> = {
  normal: './chain-replay-icons/normal.png',
  heroic: './chain-replay-icons/heroic.png',
  legendary: './chain-replay-icons/legendary.png',
};

/**
 * Quest chains, split out of the Quest Board tab into its own destination
 * (patch 0190) -- previously a "Discovered Quests" section tacked onto the
 * bottom of a hero's ordinary Contracts list, easy to miss under a long
 * board and requiring a scroll past every regular contract to even notice
 * a chain was waiting. Sits next to Quests in the Adventure group now,
 * same tier as Contracts rather than a subsection of it, with its own nav
 * shimmer (originally chain-specific in patch 0190, generalized into the
 * notification-driven isNavTabUnread system in patch 0191 -- see
 * attention.ts and .nav-tab-unread in app.css) so a newly-discovered
 * chain is visible from the tab bar itself, not just after opening the
 * tab. The discovery notification itself fires from GameEngine's
 * chainBoard-regeneration block, targeting this tab ('chains').
 *
 * Rebuilt (patch 0201) from a stack of full QuestCards -- one per chain,
 * each the same full height as a raid banner card used to be -- into
 * compact rows, same shape RaidsPanel's own list already collapsed into
 * (thumbnail + name + a one-line summary + chevron). QuestCard itself
 * (QuestPanel.tsx) is unchanged and still what the Quests & Contracts
 * board uses -- this tab specifically was the one that read as too
 * dense; a hero's own contract list wasn't part of that complaint. A row
 * click opens ChainDetailModal below with the full stat row, flavour
 * text, loot preview, and both send buttons -- everything QuestCard used
 * to show inline, now behind a tap, matching how tapping a raid already
 * opens RaidDetailModal instead of showing everything in the list.
 */
export function DiscoveredQuestsPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  const [subTab, setSubTab] = useState<'board' | 'memories'>('board');

  // Deep-link support for a notification's "Go to" button targeting a
  // specific chains sub-tab -- same consume-once shape every other
  // sub-tabbed panel uses (see attention.ts's TAB_SUBTABS -- 'chains' is
  // the 7th panel to join that list).
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested === 'board' || requested === 'memories') setSubTab(requested);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever sub-tab is currently open -- on mount (the
  // default Board) and again on every switch.
  useEffect(() => {
    engine.acknowledgeTab('chains', subTab);
  }, [engine, subTab]);

  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(state.heroes[0]?.id ?? null);
  const selectedHero = state.heroes.find((h) => h.id === selectedHeroId) ?? state.heroes[0];
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const [openReplayChainId, setOpenReplayChainId] = useState<string | null>(null);

  // Same per-hero level filter QuestPanel's old chainOffers used -- a
  // chain's discovery is guild-wide (generateChainBoard gates on the
  // guild's single highest-level hero), but that only means every hero
  // eventually sees it, not that a fresh recruit should see stages dozens
  // of levels above anything they could act on today.
  const chainOffers = useMemo(
    () => selectedHero
      ? [...state.chainBoard]
        .filter((offer) => selectedHero.level >= offer.reqLevel)
        .sort((a, b) => a.duration - b.duration)
      : [],
    [state.chainBoard, selectedHero],
  );

  const openOffer = openOfferId ? chainOffers.find((o) => o.id === openOfferId) ?? null : null;

  const send = (offer: Offer, chainSteps = false) => {
    if (!selectedHero) return;
    engine.startQuest(selectedHero.id, offer, [], chainSteps);
    setOpenOfferId(null);
  };

  if (!selectedHero) {
    return (
      <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/quests.jpg)' }}>
        <div className="tab-scene-content">
        <h2>Story Quests</h2>
        <p className="subtitle">Recruit a hero first -- quest chains open up once you have someone to send.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/quests.jpg)' }}>
      <div className="tab-scene-content">
      <h2>Story Quests</h2>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`btn-subtab ${subTab === 'board' ? 'on' : ''} ${isTabUnread(state, 'chains', 'board') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('board')}
        >
          Board
        </button>
        <button
          className={`btn-subtab ${subTab === 'memories' ? 'on' : ''} ${isTabUnread(state, 'chains', 'memories') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('memories')}
        >
          Replay Memories
        </button>
      </div>

      {subTab === 'board' ? (
        <>
          <p className="subtitle">
            Story quest chains your heroes have uncovered on the board. Pick a hero below to see which
            chains are open to them right now.
          </p>

          <div className="section-heading">Heroes</div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {state.heroes.map((h) => (
              <HeroTab key={h.id} hero={h} selected={h.id === selectedHero.id} onSelect={() => setSelectedHeroId(h.id)} />
            ))}
          </div>

          {selectedHero.status === 'questing' ? (
            <p className="small muted">{selectedHero.name} is already out -- see the Quests tab's "On the road" list.</p>
          ) : chainOffers.length === 0 ? (
            <p className="small muted">
              No quest chains open to {selectedHero.name} yet. Chains appear here once discovered on the
              board and this hero meets their level requirement.
            </p>
          ) : (
            <div className="raid-list">
              {chainOffers.map((offer) => (
                <ChainRow
                  key={offer.id}
                  offer={offer}
                  hero={selectedHero}
                  now={now}
                  onOpen={() => setOpenOfferId(offer.id)}
                />
              ))}
            </div>
          )}

          {openOffer && (
            <ChainDetailModal
              offer={openOffer}
              hero={selectedHero}
              now={now}
              onClose={() => setOpenOfferId(null)}
              onSend={send}
            />
          )}
        </>
      ) : (
        <ReplayMemoriesView
          heroes={state.heroes}
          selectedHero={selectedHero}
          onSelectHero={setSelectedHeroId}
          openReplayChainId={openReplayChainId}
          onOpenReplayChain={setOpenReplayChainId}
        />
      )}
      </div>
    </div>
  );
}

/**
 * Collapsed row -- same shape as RaidsPanel's own .raid-card (thumbnail +
 * name/meta + chevron), reusing that exact class family rather than
 * inventing a parallel one, since the layout is identical down to the
 * pixel. Only the content inside is chain-specific: difficulty + Chain
 * X/Y badges, plus a quick success%/gold glance so the odds and payout
 * are still visible without opening the detail view.
 */
function ChainRow({
  offer, hero, now, onOpen,
}: { offer: Offer; hero: Hero; now: number; onOpen: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const chance = QuestManager.previewSuccess(state, hero, offer, hero.equippedConsumables ?? [], now);

  return (
    <div
      className="card raid-card"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <div
        className="raid-card-thumb"
        style={{ backgroundImage: `url(${chainIconSrc(offer.chain?.chainId ?? '', chain?.icon, chain?.banner)})` }}
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
          <span className="tiny">{Math.round(chance)}% success</span>
          <span className="tiny gold-text">{formatGold(offer.rewardGold)} gold</span>
        </div>
      </div>
      <span className="raid-card-chevron" aria-hidden="true">›</span>
    </div>
  );
}

/**
 * Full detail, opened by tapping a ChainRow -- same overlay/modal shell
 * RaidDetailModal already uses, content directly in the modal (no nested
 * .card) matching that same convention rather than wrapping QuestCard's
 * own inline-card markup in a second layer of chrome. Everything here
 * previously lived inline on QuestCard when a chain's row was expanded:
 * the 90px banner (matches RaidDetailModal's own strip height), full stat
 * row, always-visible flavour text (no separate More/Less toggle needed
 * once this *is* the detail view), loot preview, guaranteed-on-completion
 * block for a chain's final stage, and both send actions.
 */
function ChainDetailModal({
  offer, hero, now, onClose, onSend,
}: { offer: Offer; hero: Hero; now: number; onClose: () => void; onSend: (offer: Offer, chainSteps?: boolean) => void }) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chance = QuestManager.previewSuccess(state, hero, offer, hero.equippedConsumables ?? [], now);
  const duration = QuestManager.previewDuration(state, hero, offer, now);
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const levelGap = Math.max(0, offer.reqLevel - hero.level);
  const loot = QuestManager.previewLoot(state, hero, offer, [], now);
  const canContinueChain = !!offer.chain && offer.chain.stage + 1 < offer.chain.totalStages;
  const completion = chain && offer.chain && offer.chain.stage + 1 === offer.chain.totalStages
    ? QuestManager.chainCompletionPreview(chain) : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
        {offer.chain && (
          <ChainQuestBanner chainId={offer.chain.chainId} banner={chain?.banner} height={90} />
        )}
        <div className="spread">
          <span className="card-title hero-card-name">{offer.name}</span>
          <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        {offer.chain && (
          // Patch 0275: same name/stageName split as QuestDetailModal --
          // see that component's own comment in QuestPanel.tsx.
          <div className="tag" style={{ color: 'var(--blood)', display: 'inline-block', marginTop: 4 }}>
            Chain {offer.chain.stage + 1}/{offer.chain.totalStages}{offer.stageName ? `, ${offer.stageName}` : ''}
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
          {canContinueChain ? (
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

/**
 * Replay Memories -- the Board's sub-tab sibling (patch 0228). All 6
 * saga bands always visible regardless of ownership (name, level range,
 * chains covered, cost, Buy/Owned state) -- same "X more stories out
 * there" philosophy the Board tab already has, rather than hiding whole
 * systems from view. Within an owned band, only chains already in
 * completedChains open the replay detail -- everything else is
 * present but disabled with a plain explanation, not hidden.
 */
function ReplayMemoriesView({
  heroes, selectedHero, onSelectHero, openReplayChainId, onOpenReplayChain,
}: {
  heroes: Hero[]; selectedHero: Hero; onSelectHero: (id: string) => void;
  openReplayChainId: string | null; onOpenReplayChain: (id: string | null) => void;
}) {
  const openChain = openReplayChainId ? CHAIN_BY_ID[openReplayChainId] : undefined;
  const openTier = openReplayChainId ? chainReplayTierForChain(openReplayChainId) : undefined;

  return (
    <>
      <p className="subtitle">
        Revisit a story you&rsquo;ve already finished. Unlock a saga below, then replay any of its
        completed chains at Heroic or Legendary for a chance at their own tougher gear -- the story
        plays out again in full, so a failed step sends the whole attempt back to the beginning.
      </p>

      <div className="section-heading">Heroes</div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {heroes.map((h) => (
          <HeroTab key={h.id} hero={h} selected={h.id === selectedHero.id} onSelect={() => onSelectHero(h.id)} />
        ))}
      </div>

      <div className="section-heading">Sagas</div>
      <div className="raid-list">
        {CHAIN_REPLAY_TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} onOpenChain={onOpenReplayChain} />
        ))}
      </div>

      {openChain && openTier && (
        <ChainReplayDetailModal
          chain={openChain}
          tier={openTier}
          hero={selectedHero}
          onClose={() => onOpenReplayChain(null)}
        />
      )}
    </>
  );
}

/**
 * One saga's card -- the master unlock (id 'master', no chains of its
 * own) plus all 6 bands, each showing its cost, description, and (once
 * owned) every chain it covers as its own small button, disabled unless
 * that specific chain is already in completedChains.
 */
function TierCard({ tier, onOpenChain }: { tier: ChainReplayTierDef; onOpenChain: (chainId: string) => void }) {
  const engine = useEngine();
  const state = engine.state;
  const isMaster = tier.id === 'master';
  const owned = GuildManager.hasChainReplayTier(state, tier.id);
  const masterOwned = GuildManager.hasChainReplayTier(state, 'master');
  const canAfford = state.gold >= tier.goldCost;
  const canBuy = !owned && canAfford && (isMaster || masterOwned);
  // Direct request: a "% complete" figure on each saga band, updating as
  // the person switches which difficulty they're checking against --
  // defaults to Legendary since that's the tier most players actually
  // care about tracking toward. Own local tab state per card rather than
  // reusing ChainReplayDetailModal's own `difficulty` state, since that's
  // scoped to one open chain at a time and this needs to persist across
  // the whole band's card independent of any modal being open.
  const [percentDifficulty, setPercentDifficulty] = useState<ChainReplayDifficulty>('legendary');
  // Saga Loot table -- direct request: a band-wide view of every chain's
  // dedicated item (quest / item / slot / found?), rather than having to
  // open each chain's own replay modal one at a time just to check what's
  // still missing. Local to this card, same self-contained shape
  // openReplayChainId's modal would use if it weren't lifted to the
  // parent view for deep-link reasons -- this one has no deep-link need.
  const [showLoot, setShowLoot] = useState(false);

  const buyTitle = owned ? undefined
    : !masterOwned && !isMaster ? 'Unlock Replay Memories first'
      : !canAfford ? 'Not enough gold' : undefined;

  return (
    <div className="card raid-card" style={{ cursor: 'default' }}>
      <div className="raid-card-body" style={{ width: '100%' }}>
        <div className="spread">
          <div className="raid-card-name">{tier.sagaName}</div>
          {owned ? (
            <span className="tag" style={{ color: 'var(--brass)' }}>Owned</span>
          ) : (
            <button className="btn-primary" disabled={!canBuy} title={buyTitle} onClick={() => engine.buyChainReplayTier(tier.id)}>
              {formatGold(tier.goldCost)}
            </button>
          )}
        </div>
        {tier.levelRange && <div className="tiny muted">{tier.levelRange}</div>}
        <p className="tiny" style={{ margin: '4px 0' }}>{tier.description}</p>
        {owned && tier.chainIds.length > 0 && (
          <>
            <div className="row spread" style={{ alignItems: 'center', margin: '4px 0' }}>
              <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                <span className="tiny muted">Cleared at:</span>
                {(['normal', 'heroic', 'legendary'] as ChainReplayDifficulty[]).map((d) => (
                  <button
                    key={d}
                    className="btn-ghost tiny"
                    style={percentDifficulty === d ? { color: REPLAY_DIFFICULTY_COLOR[d], fontWeight: 'bold' } : undefined}
                    onClick={() => setPercentDifficulty(d)}
                  >
                    {REPLAY_DIFFICULTY_NAME[d]}
                  </button>
                ))}
                <span className="tiny muted">
                  {chainReplayBandPercent(state, tier.id, percentDifficulty)}%
                </span>
              </div>
              <button className="btn-ghost tiny" onClick={() => setShowLoot(true)}>
                Saga Loot
              </button>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {tier.chainIds.map((chainId) => {
                const chain = CHAIN_BY_ID[chainId];
                const completed = state.completedChains.includes(chainId);
                return (
                  <button
                    key={chainId}
                    className="btn-ghost"
                    disabled={!completed}
                    title={completed ? `Replay ${chain?.name ?? chainId}` : 'Complete this chain first'}
                    onClick={() => onOpenChain(chainId)}
                  >
                    {chain?.name ?? chainId}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {showLoot && <SagaLootModal tier={tier} onClose={() => setShowLoot(false)} />}
    </div>
  );
}

/**
 * Saga Loot -- a band-wide table of every chain's dedicated item (Quest /
 * Item / Slot / Found?), opened from a TierCard's own "Saga Loot" button.
 * Direct request: checking what's still missing shouldn't require opening
 * each chain's own ChainReplayDetailModal one at a time. "Found?" reads
 * state.discoveredItems the same way LootPreview (RaidsPanel.tsx) and the
 * Collection tab (LorePanel.tsx) already gate their own item reveals --
 * an undiscovered item's name stays hidden behind "???" here too, for the
 * same reason. A chain with no dedicated item (rewardItems empty, or the
 * id doesn't resolve to a real EquipmentDef) is simply skipped rather than
 * shown as a broken row -- every chain in every existing band does carry
 * one today, but this keeps the table honest if that ever isn't true.
 */
function SagaLootModal({ tier, onClose }: { tier: ChainReplayTierDef; onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [itemDetail, setItemDetail] = useState<string | null>(null);

  const rows = tier.chainIds
    .map((chainId) => {
      const chain = CHAIN_BY_ID[chainId];
      const dedicatedId = chain?.rewardItems[0];
      const def = dedicatedId ? EQUIPMENT_BY_ID[dedicatedId] : undefined;
      return chain && dedicatedId && def ? { chain, dedicatedId, def } : null;
    })
    .filter((r): r is { chain: ChainDef; dedicatedId: string; def: EquipmentDef } => r !== null);

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="spread">
            <span className="card-title hero-card-name">Saga Loot</span>
            <span className="tiny muted">{tier.sagaName}</span>
          </div>
          <p className="tiny muted" style={{ margin: '4px 0 10px' }}>
            The dedicated item each story chain in this saga can drop on replay.
          </p>

          {rows.length === 0 ? (
            <p className="small muted">No dedicated loot found for this saga yet.</p>
          ) : (
            <table className="saga-loot-table">
              <thead>
                <tr>
                  <th>Quest</th>
                  <th>Item</th>
                  <th>Slot</th>
                  <th>Found?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ chain, dedicatedId, def }) => {
                  const found = state.discoveredItems.includes(dedicatedId);
                  return (
                    <tr
                      key={chain.id}
                      className="saga-loot-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => (found ? setItemDetail(dedicatedId) : engine.showToast('Discover this item first.'))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (found) setItemDetail(dedicatedId); else engine.showToast('Discover this item first.');
                      }}
                    >
                      <td>{chain.name}</td>
                      <td className={found ? '' : 'muted'} style={found ? { color: RARITY_COLOR[def.rarity] } : undefined}>
                        {found ? def.name : '???'}
                      </td>
                      <td className="tiny muted">{found ? def.slot : '???'}</td>
                      <td>
                        {found ? (
                          <span className="tiny" style={{ color: 'var(--brass)' }}>Yes</span>
                        ) : (
                          <span className="tiny muted">No</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="row end" style={{ marginTop: 10 }}>
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
      {itemDetail && <SagaItemDetailOverlay defId={itemDetail} onClose={() => setItemDetail(null)} />}
    </>
  );
}

/** Same shape RaidsPanel's own module-private ItemDetailOverlay uses
 *  (name, rarity pill, slot + level, mod summary) -- duplicated locally
 *  rather than imported since that component isn't exported and the two
 *  panels are otherwise independent, same "small enough to just repeat"
 *  call every other cross-panel near-duplicate in this codebase makes. */
function SagaItemDetailOverlay({ defId, onClose }: { defId: string; onClose: () => void }) {
  const def = EQUIPMENT_BY_ID[defId];
  if (!def) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{def.name}</h3>
        <RarityPill rarity={def.rarity} />
        <p className="tiny muted" style={{ marginTop: 8 }}>{def.slot} · requires level {def.reqLevel}</p>
        <p className="small" style={{ marginTop: 8 }}>{describeMods(def.mods).join(' · ') || 'No bonuses'}</p>
        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The actual replay commit screen -- difficulty picker plus the loot
 * table view (Backlog's own requirement: "so people can see what they
 * are chasing"). The dedicated item's Heroic/Legendary rows are computed
 * live via scaleDedicatedItem -- a pure function, no rng needed for a
 * preview -- so this always matches exactly what a real drop would roll
 * TODAY, at `hero`'s current level (patch 0258, Dedicated Reward Level
 * Scaling -- see guild-idler-status.md). The preview updates naturally
 * as the hero levels up between visits to this modal, same as the real
 * drop would scale differently at a higher level -- nothing extra
 * needed to keep it in sync, it's the same formula either way.
 */
function ChainReplayDetailModal({
  chain, tier, hero, onClose,
}: { chain: ChainDef; tier: ChainReplayTierDef; hero: Hero; onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [difficulty, setDifficulty] = useState<ChainReplayDifficulty>('normal');

  const dedicatedId = chain.rewardItems[0];
  const dedicatedDef = dedicatedId ? EQUIPMENT_BY_ID[dedicatedId] : undefined;
  const baseDropChance = Tuning.get('chain_replay_dedicated.baseDropChance');

  const existing = state.activeChainReplays.find((r) => r.heroId === hero.id && r.chainId === chain.id);
  const heroBusy = hero.status === 'questing';

  const send = () => {
    engine.startChainReplay(hero.id, chain.id, difficulty);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
        <ChainQuestBanner chainId={chain.id} banner={chain.banner} height={90} />
        <div className="spread">
          <span className="card-title hero-card-name">{chain.name}</span>
          <span className="tiny muted">{tier.sagaName}</span>
        </div>
        <p className="card-flavour">{chain.description}</p>

        {existing && (
          <p className="tiny" style={{ color: 'var(--blood)', margin: '4px 0' }}>
            {hero.name} has a {REPLAY_DIFFICULTY_NAME[existing.difficulty]} attempt in progress --
            stage {existing.stage + 1}/{chain.stages.length}
            {existing.resetCount > 0 ? ` (reset ${existing.resetCount}×)` : ''}. Picking a different
            difficulty starts over from stage 1.
          </p>
        )}

        <div className="tiny muted" style={{ marginBottom: 4 }}>Difficulty</div>
        <div className="row" style={{ gap: 14, marginBottom: 10 }}>
          {REPLAY_DIFFICULTY_ORDER.map((d) => (
            <ReplayDifficultyCircle key={d} difficulty={d} active={difficulty === d} onClick={() => setDifficulty(d)} />
          ))}
        </div>

        {dedicatedDef && (
          <>
            <div className="tiny muted" style={{ marginBottom: 2 }}>The chase -- {dedicatedDef.name}</div>
            <div className="raid-list" style={{ marginBottom: 10 }}>
              <div className="row spread" style={{ padding: '4px 0' }}>
                <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <span className="tiny">First clear</span>
                  <RarityPill rarity={dedicatedDef.rarity} />
                </span>
                <span className="tiny muted">Already claimed, guaranteed once</span>
              </div>
              {(['heroic', 'legendary'] as const).map((d) => {
                const diffCfg = CHAIN_REPLAY_DIFFICULTIES[d];
                const scaled = scaleDedicatedItem(dedicatedDef, hero.level, d === 'heroic' ? 'chainReplayHeroic' : 'chainReplayLegendary');
                const modLines = describeMods(scaled.mods);
                const statLines = describeStats(scaled.rolledStats, true);
                return (
                  <div key={d} className="row spread" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span className="tiny" style={{ color: REPLAY_DIFFICULTY_COLOR[d] }}>{REPLAY_DIFFICULTY_NAME[d]}</span>
                      <RarityPill rarity={dedicatedDef.rarity} />
                    </span>
                    <span className="tiny" style={{ textAlign: 'right' }}>
                      <span className="muted">{Math.round(baseDropChance + diffCfg.lootBonus)}% chance · </span>
                      {[...modLines, ...statLines].join(', ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="tiny muted" style={{ marginBottom: 8 }}>
          Padding loot from every stage also rolls tougher at Heroic/Legendary, tagged separately from
          raid drops.
        </p>

        <div className="row end" style={{ marginTop: 8, gap: 6 }}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={heroBusy} title={heroBusy ? `${hero.name} is already out` : undefined} onClick={send}>
            {existing && existing.difficulty === difficulty ? `Continue (stage ${existing.stage + 1})` : 'Send'} {hero.name}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Same shape RaidsPanel's own DifficultyCircle uses -- icon with a
 *  graceful text-label fallback until the dedicated icon assets land
 *  (see REPLAY_DIFFICULTY_ICON's own comment). No "locked" state here --
 *  unlike a raid difficulty, which can itself be gated behind an
 *  upgrade, a chain replay's difficulty choice is always open once the
 *  chain itself is eligible; the gating already happened one screen
 *  earlier (band ownership + completedChains). */
function ReplayDifficultyCircle({
  difficulty, active, onClick,
}: { difficulty: ChainReplayDifficulty; active: boolean; onClick: () => void }) {
  const color = REPLAY_DIFFICULTY_COLOR[difficulty];
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="raid-diff-circle-wrap">
      <button
        className={`raid-diff-circle ${active ? 'active' : ''}`}
        style={{ borderColor: color, color: active ? 'var(--night)' : color, background: active ? color : undefined }}
        onClick={onClick}
        title={REPLAY_DIFFICULTY_NAME[difficulty]}
      >
        {!imgFailed ? (
          <img
            src={REPLAY_DIFFICULTY_ICON[difficulty]}
            alt=""
            onError={() => setImgFailed(true)}
            style={{ width: '70%', height: '70%', objectFit: 'contain' }}
          />
        ) : (
          REPLAY_DIFFICULTY_LABEL[difficulty]
        )}
      </button>
      <span className="tiny" style={{ color, fontWeight: 700 }}>{REPLAY_DIFFICULTY_LABEL[difficulty]}</span>
    </div>
  );
}
