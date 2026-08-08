import { useEffect, useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../game/data/quests';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { QuestOffer, Hero } from '../../game/types';
import { formatDuration, formatGold } from '../../game/util';
import { RarityPill } from '../RarityPill';
import { EggIcon } from '../EggIcon';

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
  hero: Hero;
  now: number;
  onToggleExpanded: (offerId: string) => void;
  onSend: (offer: Offer, chainSteps?: boolean) => void;
}

/** Shared card body for both a hero's own Contracts and their Discovered
 *  Quests -- identical behaviour either way, the only difference is the
 *  banner art shown for a chain entry specifically. Always renders against
 *  whichever hero's tab is currently open (see QuestPanel) -- there's no
 *  separate hero picker inside the card anymore, since picking the hero is
 *  now the very first thing the player does on this tab. */
function QuestCard({
  offer, isOpen, hero, now, onToggleExpanded, onSend,
}: QuestCardProps) {
  const engine = useEngine();
  const state = engine.state;
  const cfg = DIFFICULTIES[offer.difficulty];
  const chance = QuestManager.previewSuccess(state, hero, offer, [], now);
  const duration = QuestManager.previewDuration(state, hero, offer, now);
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
  const levelGap = Math.max(0, offer.reqLevel - hero.level);

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
  );
}

/** One hero's tab -- name, level, and at-a-glance status. Selected state
 *  reuses the same chip/on treatment the old hero-assign picker already
 *  used inside a card; injury/questing status reuse the same glyphs too,
 *  so switching to a hero-first flow doesn't also invent a new visual
 *  language for something players already recognise. */
function HeroTab({ hero, selected, onSelect }: { hero: Hero; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`chip ${selected ? 'on' : ''} ${hero.injuries.length > 0 ? 'risky' : ''}`}
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

  // This hero's own contract pool, sorted by difficulty tier ascending --
  // the closest board-offer analogue to "rarity", since a plain quest
  // offer has no rarity field of its own.
  const contractOffers = useMemo(
    () => [...(state.questBoards[selectedHero.id] ?? [])]
      .sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)),
    [state.questBoards, selectedHero.id],
  );

  // Chain-stage offers are still guild-wide -- a chain's progress is
  // tracked once, not per hero, so every hero's tab shows the same current
  // stage rather than each getting their own copy of the story.
  const chainOffers = useMemo(
    () => [...state.chainBoard].sort((a, b) => a.duration - b.duration),
    [state.chainBoard],
  );

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
  // click.
  const recall = (heroId: string) => {
    if (confirm('Cancel the current quest and bring the hero home?')) engine.recallHero(heroId);
  };

  // Quick-assign now acts on whichever hero's tab is open, sending them on
  // the best contract from their own board -- the per-hero equivalent of
  // the old board-wide "first idle hero, first contract they qualify for"
  // shortcut.
  const autoChainDef = GuildManager.upgrades().find((u) => u.unlocks === 'autoChain');
  const autoChainOwned = !!autoChainDef && GuildManager.upgradeLevel(state, autoChainDef.id) > 0;
  const quickAssign = () => {
    const offer = QuestManager.pickBestQuest(state, selectedHero, now);
    if (offer) send(offer);
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
      <div className="section-heading">Heroes</div>
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
            />
          ))}

          {/* --------------------------- discovered quests --------------------------- */}
          {chainOffers.length > 0 && (
            <>
              <div className="section-heading">Discovered Quests</div>
              {chainOffers.map((offer) => (
                <QuestCard
                  key={offer.id}
                  offer={offer}
                  isOpen={expanded.has(offer.id)}
                  hero={selectedHero}
                  now={now}
                  onToggleExpanded={toggleExpanded}
                  onSend={send}
                />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
