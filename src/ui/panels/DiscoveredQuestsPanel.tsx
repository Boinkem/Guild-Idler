import { useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import {
  HeroTab, ChainQuestBanner, chainBannerSrc, Offer,
} from './QuestPanel';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { DIFFICULTIES } from '../../game/data/quests';
import { Hero } from '../../game/types';
import { RarityPill } from '../RarityPill';
import { EggIcon } from '../EggIcon';
import { formatDuration, formatGold } from '../../game/util';

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

  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(state.heroes[0]?.id ?? null);
  const selectedHero = state.heroes.find((h) => h.id === selectedHeroId) ?? state.heroes[0];
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);

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
      <>
        <h2>Story Quests</h2>
        <p className="subtitle">Recruit a hero first -- quest chains open up once you have someone to send.</p>
      </>
    );
  }

  return (
    <>
      <h2>Story Quests</h2>
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
        style={{ backgroundImage: `url(${chainBannerSrc(offer.chain?.chainId ?? '', chain?.banner)})` }}
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
          <div className="tag" style={{ color: 'var(--blood)', display: 'inline-block', marginTop: 4 }}>
            Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
          </div>
        )}
        <p className="card-flavour">{chain ? `${chain.description} — ${offer.flavour}` : offer.flavour}</p>

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
