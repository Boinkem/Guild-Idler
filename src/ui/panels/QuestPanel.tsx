import { useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { DIFFICULTIES } from '../../game/data/quests';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { formatDuration, formatGold, RARITY_COLOR } from '../../game/util';

export function QuestPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const [loadout, setLoadout] = useState<string[]>([]);

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

  const owned = InventoryManager.owned(state).filter((e) => !e.def.effect.healInjury);

  const board = useMemo(
    () => [...state.questBoard].sort((a, b) => a.duration - b.duration),
    [state.questBoard],
  );

  const toggleConsumable = (defId: string) => {
    setLoadout((current) => {
      if (current.includes(defId)) return current.filter((id) => id !== defId);
      if (InventoryManager.count(state, defId) <= current.filter((id) => id === defId).length) return current;
      return [...current, defId];
    });
  };

  const send = (offer: (typeof board)[number], targetHeroId: string) => {
    engine.startQuest(targetHeroId, offer, loadout.filter((id) => InventoryManager.count(state, id) > 0));
    setLoadout([]);
    setAssigning(null);
  };

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

      {/* ------------------------------ loadout ------------------------------ */}
      {idleHeroes.length === 0 ? (
        <p className="small muted">Everyone is out. Wait for a return, or recruit another hero in the Guild Hall.</p>
      ) : owned.length > 0 && (
        <>
          <div className="section-heading">Ready to send</div>
          <div className="row wrap" style={{ marginBottom: 12 }}>
            {owned.map(({ def, count }) => (
              <button
                key={def.id}
                className={`chip ${loadout.includes(def.id) ? 'on' : ''}`}
                onClick={() => toggleConsumable(def.id)}
                title={def.description}
              >
                {def.glyph} {def.name} ×{count}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------- board ------------------------------- */}
      <div className="section-heading">Available contracts</div>
      {board.length === 0 && <p className="small muted">The board is empty. New contracts arrive shortly.</p>}

      {board.map((offer) => {
        const cfg = DIFFICULTIES[offer.difficulty];
        const isOpen = expanded.has(offer.id);
        const isAssigning = assigning?.offerId === offer.id;
        const pickedHero = isAssigning ? state.heroes.find((h) => h.id === assigning!.heroId) : undefined;
        const statHero = pickedHero ?? previewHero;
        const chance = QuestManager.previewSuccess(engine.state, statHero, offer, loadout, now);
        const duration = QuestManager.previewDuration(engine.state, statHero, offer, now);
        const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;
        const anyEligible = idleHeroes.some((h) => h.level >= offer.reqLevel);

        return (
          <div key={offer.id} className={`card quest-card ${offer.difficulty} ${offer.chain ? 'chain' : ''}`}>
            <div
              className="card-head hero-card-summary"
              onClick={() => toggleExpanded(offer.id)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(offer.id); } }}
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
                <div className="row wrap quest-popout-loot">
                  {QuestManager.lootPreview(offer).map((entry) => (
                    <span key={entry.name} className="tiny" style={{ color: RARITY_COLOR[entry.rarity] }}>
                      ◇ {entry.name}
                    </span>
                  ))}
                </div>
              </>
            )}

            {isAssigning ? (
              <div className="row wrap end" style={{ marginTop: 8, gap: 6 }} onClick={(e) => e.stopPropagation()}>
                {idleHeroes.map((h) => {
                  const eligible = h.level >= offer.reqLevel;
                  const selected = assigning?.heroId === h.id;
                  return (
                    <button
                      key={h.id}
                      className={`chip ${selected ? 'on' : ''}`}
                      disabled={!eligible}
                      title={eligible ? undefined : `Requires level ${offer.reqLevel}`}
                      onClick={() => setAssigning({ offerId: offer.id, heroId: h.id })}
                    >
                      {h.name} · Lv {h.level}{h.injuries.length > 0 ? ' ⚑' : ''}
                    </button>
                  );
                })}
                <button className="btn-ghost" onClick={() => setAssigning(null)}>Cancel</button>
                <button
                  className="btn-primary"
                  disabled={!pickedHero}
                  onClick={() => pickedHero && send(offer, pickedHero.id)}
                >
                  {pickedHero ? `Send ${pickedHero.name}` : 'Pick a hero'}
                </button>
              </div>
            ) : (
              <div className="row end" style={{ marginTop: 4, gap: 8 }}>
                <button
                  className="btn-ghost hero-card-expand"
                  onClick={(e) => { e.stopPropagation(); toggleExpanded(offer.id); }}
                >
                  {isOpen ? 'Less ▲' : 'Details ▼'}
                </button>
                {idleHeroes.length > 0 && (
                  <>
                    {!anyEligible && <span className="tiny muted">Requires level {offer.reqLevel}</span>}
                    <button
                      className="btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssigning({ offerId: offer.id, heroId: previewHero.id });
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
      })}
    </>
  );
}
