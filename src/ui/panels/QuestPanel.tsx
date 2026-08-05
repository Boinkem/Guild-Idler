import { useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../game/data/quests';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { QuestOffer, Hero } from '../../game/types';
import { formatDuration, formatGold } from '../../game/util';
import { RarityPill } from '../RarityPill';

type Offer = QuestOffer;

/** Banner strip for a chain's quest-board entry, matching ChainBanner in
 *  LorePanel and RaidBanner in RaidsPanel exactly -- same asset, same
 *  "missing file just fails to paint" convention, so a chain's art shows
 *  up here automatically once it exists, no separate art needed. */
function ChainQuestBanner({ chainId }: { chainId: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        backgroundImage: `url(./lore/chains/${chainId}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: 70,
        marginBottom: 8,
        borderRadius: 4,
      }}
    />
  );
}

interface QuestCardProps {
  offer: Offer;
  isOpen: boolean;
  isAssigning: boolean;
  pickedHeroId: string | null;
  previewHero: Hero;
  idleHeroes: Hero[];
  now: number;
  onToggleExpanded: (offerId: string) => void;
  onStartAssigning: (offerId: string, heroId: string) => void;
  onCancelAssigning: () => void;
  onSend: (offer: Offer, heroId: string) => void;
}

/** Shared card body for both Discovered Quests and Available Contracts --
 *  identical behaviour either way, the only difference is the banner art
 *  shown for a chain entry specifically. */
function QuestCard({
  offer, isOpen, isAssigning, pickedHeroId, previewHero, idleHeroes, now,
  onToggleExpanded, onStartAssigning, onCancelAssigning, onSend,
}: QuestCardProps) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const pickedHero = pickedHeroId ? state.heroes.find((h) => h.id === pickedHeroId) : undefined;
  const statHero = pickedHero ?? previewHero;
  const chance = QuestManager.previewSuccess(state, statHero, offer, [], now);
  const duration = QuestManager.previewDuration(state, statHero, offer, now);
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const anyEligible = idleHeroes.some((h) => h.level >= offer.reqLevel);

  return (
    <div className={`card quest-card ${offer.difficulty} ${offer.chain ? 'chain' : ''}`}>
      {offer.chain && <ChainQuestBanner chainId={offer.chain.chainId} />}
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
        {offer.chain && (
          <span className="tag" style={{ color: 'var(--blood)' }}>
            Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
          </span>
        )}
      </div>

      <div className="stat-row" style={{ margin: '6px 0' }}>
        {isAssigning && (
          <span className="muted">{pickedHero ? pickedHero.name : 'Pick a hero'}</span>
        )}
        <span>Success <b className={chance >= 60 ? 'good' : chance >= 35 ? '' : 'bad'}>{Math.round(chance)}%</b></span>
        <span>Time <b>{formatDuration(duration)}</b></span>
        <span>Gold <b className="gold-text">{formatGold(offer.rewardGold)}</b></span>
        <span>XP <b>{offer.rewardXp}</b></span>
      </div>

      {isOpen && (
        <>
          <p className="card-flavour">{chain ? `${chain.description} — ${offer.flavour}` : offer.flavour}</p>
          {QuestManager.previewLoot(state, statHero, offer, [], now).length > 0 && (
            <>
              <div className="tiny muted" style={{ marginBottom: 2 }}>Chance to find</div>
              <div className="row wrap quest-popout-loot" style={{ gap: 6, alignItems: 'center' }}>
                {QuestManager.previewLoot(state, statHero, offer, [], now).map((entry) => (
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
                </div>
              </>
            );
          })()}
        </>
      )}

      {isAssigning ? (
        <div className="row wrap end" style={{ marginTop: 8, gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {idleHeroes.map((h) => {
            const eligible = h.level >= offer.reqLevel;
            const selected = pickedHeroId === h.id;
            return (
              <button
                key={h.id}
                className={`chip ${selected ? 'on' : ''}`}
                disabled={!eligible}
                title={eligible ? undefined : `Requires level ${offer.reqLevel}`}
                onClick={() => onStartAssigning(offer.id, h.id)}
              >
                {h.name} · Lv {h.level}{h.injuries.length > 0 ? ' ⚑' : ''}
              </button>
            );
          })}
          <button className="btn-ghost" onClick={onCancelAssigning}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!pickedHero}
            onClick={() => pickedHero && onSend(offer, pickedHero.id)}
          >
            {pickedHero ? `Send ${pickedHero.name}` : 'Pick a hero'}
          </button>
        </div>
      ) : (
        <div className="row end" style={{ marginTop: 4, gap: 8 }}>
          <button
            className="btn-ghost hero-card-expand"
            onClick={(e) => { e.stopPropagation(); onToggleExpanded(offer.id); }}
          >
            {isOpen ? 'Less ▲' : 'More ▼'}
          </button>
          {idleHeroes.length > 0 && (
            <>
              {!anyEligible && <span className="tiny muted">Requires level {offer.reqLevel}</span>}
              <button
                className="btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartAssigning(offer.id, previewHero.id);
                }}
              >
                Assign hero
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');

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

  // Which quest card currently has its hero picker open, and which hero is
  // currently selected within it (not yet sent). Only one card's picker at
  // a time -- opening a new one closes whichever was already open.
  const [assigning, setAssigning] = useState<{ offerId: string; heroId: string } | null>(null);

  // Preview stats need *some* hero to preview against before a card's
  // picker is even opened. Once a picker is open, the stats below switch to
  // whichever hero is actually selected in it -- success/duration are hero-
  // stat-dependent, so showing one hero's odds while a different hero is
  // selected would be actively misleading, not just imprecise.
  const previewHero = idleHeroes[0] ?? state.heroes[0];

  // Split into two genuinely different things that used to share one list
  // and one label: chain-stage offers (a continuing story, discovered once
  // and then followed) versus ordinary board contracts (rotate every 30
  // minutes, no narrative continuity). Contracts sort by difficulty tier
  // ascending now rather than duration -- the closest board-offer analogue
  // to "rarity", since a plain quest offer has no rarity field of its own.
  const chainOffers = useMemo(
    () => state.questBoard.filter((o) => o.chain !== undefined).sort((a, b) => a.duration - b.duration),
    [state.questBoard],
  );
  const contractOffers = useMemo(
    () => [...state.questBoard]
      .filter((o) => o.chain === undefined)
      .sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)),
    [state.questBoard],
  );

  // Consumables no longer live on this tab -- picking a loadout at send
  // time is being replaced by per-hero equipped consumable slots (see the
  // Inventory rework). Quests now always send with an empty loadout; once
  // that rework lands, startQuest will read from the hero's own equipped
  // slots instead of needing anything passed in here at all.
  const send = (offer: Offer, targetHeroId: string) => {
    engine.startQuest(targetHeroId, offer, []);
    setAssigning(null);
  };

  // Same eligibility rule QuestCard's own "Requires level X" check uses --
  // first contract some idle hero actually qualifies for, first hero who
  // qualifies for it. A quick top-up action, not an optimal assignment.
  const autoChainDef = GuildManager.upgrades().find((u) => u.unlocks === 'autoChain');
  const autoChainOwned = !!autoChainDef && GuildManager.upgradeLevel(state, autoChainDef.id) > 0;
  const autoAssign = () => {
    for (const offer of contractOffers) {
      const hero = idleHeroes.find((h) => h.level >= offer.reqLevel);
      if (hero) { send(offer, hero.id); return; }
    }
  };

  const cardProps = (offer: Offer) => ({
    offer,
    isOpen: expanded.has(offer.id),
    isAssigning: assigning?.offerId === offer.id,
    pickedHeroId: assigning?.offerId === offer.id ? assigning.heroId : null,
    previewHero,
    idleHeroes,
    now,
    onToggleExpanded: toggleExpanded,
    onStartAssigning: (offerId: string, heroId: string) => setAssigning({ offerId, heroId }),
    onCancelAssigning: () => setAssigning(null),
    onSend: send,
  });

  return (
    <>
      <h2>Quest Board</h2>
      <p className="subtitle">Contracts rotate every half hour. Send someone before they expire.</p>

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
                    <span>Used {quest.consumables.map((c) => CONSUMABLE_BY_ID[c]?.name).join(', ')}</span>
                  )}
                </div>
                <div className="bar"><span style={{ width: `${progress}%` }} /></div>
              </div>
            );
          })}
        </>
      )}

      {idleHeroes.length === 0 && (
        <p className="small muted">Everyone is out. Wait for a return, or recruit another hero in the Guild Hall.</p>
      )}

      {/* --------------------------- discovered quests --------------------------- */}
      {chainOffers.length > 0 && (
        <>
          <div className="section-heading">Discovered Quests</div>
          {chainOffers.map((offer) => <QuestCard key={offer.id} {...cardProps(offer)} />)}
        </>
      )}

      {/* ------------------------------- contracts ------------------------------- */}
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>Available Contracts</div>
        {autoChainOwned && idleHeroes.length > 0 && contractOffers.length > 0 && (
          <button
            className="btn-ghost"
            style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
            onClick={autoAssign}
            title="Send the first idle hero on the first contract they qualify for"
          >
            Quick-assign
          </button>
        )}
      </div>
      {contractOffers.length === 0 && <p className="small muted">The board is empty. New contracts arrive shortly.</p>}
      {contractOffers.map((offer) => <QuestCard key={offer.id} {...cardProps(offer)} />)}
    </>
  );
}
