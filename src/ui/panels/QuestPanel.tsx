import { useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { DIFFICULTIES } from '../../game/data/quests';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { QuestOffer } from '../../game/types';
import { formatDuration, formatGold, RARITY_COLOR } from '../../game/util';

/** Full-detail popout for a single board contract, opened by clicking its
 * card. Reuses the same data the card already has -- this is a closer look,
 * not a second data source -- plus the full loot list without wrapping into
 * a cramped row. */
function QuestDetailModal({
  offer, hero, chance, duration, locked, onSend, onClose,
}: {
  offer: QuestOffer;
  hero: { name: string; level: number };
  chance: number;
  duration: number;
  locked: boolean;
  onSend: () => void;
  onClose: () => void;
}) {
  const cfg = DIFFICULTIES[offer.difficulty];
  const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{offer.name}</h3>
          <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
          {offer.chain && (
            <span className="tag" style={{ color: 'var(--blood)' }}>
              Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
            </span>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          {chain ? `${chain.description} — ${offer.flavour}` : offer.flavour}
        </p>

        <div className="stat-row" style={{ marginBottom: 10 }}>
          <span>Success <b className={chance >= 60 ? 'good' : chance >= 35 ? '' : 'bad'}>{Math.round(chance)}%</b></span>
          <span>Time <b>{formatDuration(duration)}</b></span>
          <span>Gold <b className="gold-text">{formatGold(offer.rewardGold)}</b></span>
          <span>XP <b>{offer.rewardXp}</b></span>
        </div>

        <div className="section-heading">Possible loot</div>
        <div className="quest-popout-loot">
          {QuestManager.lootPreview(offer).map((entry) => (
            <span key={entry.name} className="small" style={{ color: RARITY_COLOR[entry.rarity] }}>
              ◇ {entry.name}
            </span>
          ))}
        </div>

        <div className="row end" style={{ marginTop: 12, gap: 8 }}>
          {locked && <span className="tiny muted">Requires level {offer.reqLevel}</span>}
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" disabled={locked} onClick={onSend}>
            Send {hero.name}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuestPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const [heroId, setHeroId] = useState<string>(() => idleHeroes[0]?.id ?? state.heroes[0].id);
  const [loadout, setLoadout] = useState<string[]>([]);
  const [detailOffer, setDetailOffer] = useState<QuestOffer | null>(null);

  const hero = state.heroes.find((h) => h.id === heroId) ?? state.heroes[0];
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

  const send = (offer: QuestOffer) => {
    engine.startQuest(hero.id, offer, loadout.filter((id) => InventoryManager.count(state, id) > 0));
    setLoadout([]);
    setDetailOffer(null);
  };

  // The offer object backing an open modal can go stale once the board
  // rotates (the offer scrolls off, or is re-rolled with the same id
  // reused by a fresh window) -- re-resolve against the live board each
  // render rather than trusting the snapshot captured at click time.
  const liveDetailOffer = detailOffer ? board.find((o) => o.id === detailOffer.id) ?? null : null;

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
      <div className="section-heading">Send a hero</div>
      {idleHeroes.length === 0 ? (
        <p className="small muted">Everyone is out. Wait for a return, or recruit another hero in the Guild Hall.</p>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            {idleHeroes.map((h) => (
              <button
                key={h.id}
                className={h.id === hero.id ? 'btn-primary' : ''}
                onClick={() => setHeroId(h.id)}
              >
                {h.name} · Lv {h.level}
              </button>
            ))}
          </div>

          {hero.injuries.length > 0 && (
            <p className="small bad">
              Injured: {hero.injuries.map((i) => i.name).join(', ')}. Treat it in the Heroes tab for better odds.
            </p>
          )}

          <div className="row wrap" style={{ marginBottom: 12 }}>
            {owned.length === 0
              ? <span className="small muted">No consumables. The shop stocks potions and charms.</span>
              : owned.map(({ def, count }) => (
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
      <p className="tiny muted" style={{ marginTop: -8, marginBottom: 10 }}>Click a contract for the full details.</p>
      {board.length === 0 && <p className="small muted">The board is empty. New contracts arrive shortly.</p>}

      {board.map((offer) => {
        const cfg = DIFFICULTIES[offer.difficulty];
        const chance = QuestManager.previewSuccess(engine.state, hero, offer, loadout, now);
        const duration = QuestManager.previewDuration(engine.state, hero, offer, now);
        const locked = hero.level < offer.reqLevel || hero.status === 'questing';
        const chain = offer.chain ? CHAIN_BY_ID[offer.chain.chainId] : undefined;

        return (
          <div
            key={offer.id}
            className={`card quest-card ${offer.difficulty} ${offer.chain ? 'chain' : ''}`}
            onClick={() => setDetailOffer(offer)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailOffer(offer); } }}
          >
            <div className="card-head">
              <span className="card-title quest-title">{offer.name}</span>
              <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>
              {offer.chain && (
                <span className="tag" style={{ color: 'var(--blood)' }}>
                  Chain {offer.chain.stage + 1}/{offer.chain.totalStages}
                </span>
              )}
            </div>
            <p className="card-flavour">{chain ? `${chain.description} — ${offer.flavour}` : offer.flavour}</p>
            <div className="stat-row" style={{ marginBottom: 8 }}>
              <span>Success <b className={chance >= 60 ? 'good' : chance >= 35 ? '' : 'bad'}>{Math.round(chance)}%</b></span>
              <span>Time <b>{formatDuration(duration)}</b></span>
              <span>Gold <b className="gold-text">{formatGold(offer.rewardGold)}</b></span>
              <span>XP <b>{offer.rewardXp}</b></span>
            </div>
            <div className="row wrap" style={{ marginBottom: 8 }}>
              {QuestManager.lootPreview(offer).map((entry) => (
                <span key={entry.name} className="tiny" style={{ color: RARITY_COLOR[entry.rarity] }}>
                  ◇ {entry.name}
                </span>
              ))}
            </div>
            <div className="row end">
              {locked && <span className="tiny muted">Requires level {offer.reqLevel}</span>}
              <button
                className="btn-primary"
                disabled={locked}
                onClick={(e) => { e.stopPropagation(); send(offer); }}
              >
                Send {hero.name}
              </button>
            </div>
          </div>
        );
      })}

      {liveDetailOffer && (
        <QuestDetailModal
          offer={liveDetailOffer}
          hero={hero}
          chance={QuestManager.previewSuccess(engine.state, hero, liveDetailOffer, loadout, now)}
          duration={QuestManager.previewDuration(engine.state, hero, liveDetailOffer, now)}
          locked={hero.level < liveDetailOffer.reqLevel || hero.status === 'questing'}
          onSend={() => send(liveDetailOffer)}
          onClose={() => setDetailOffer(null)}
        />
      )}
    </>
  );
}
