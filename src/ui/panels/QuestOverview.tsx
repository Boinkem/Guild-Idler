import type { CSSProperties } from 'react';
import { useEngine } from '../useEngine';
import { QuestManager, CHAIN_BY_ID } from '../../game/managers/QuestManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { DIFFICULTIES } from '../../game/data/quests';
import { HERO_CLASSES } from '../../game/data/progression';
import { rerollsUsedToday } from '../../game/data/reroll';
import type { ActiveQuest, Hero, QuestOffer } from '../../game/types';
import { formatDuration, formatGold, formatNumber } from '../../game/util';
import { HeroSprite } from '../sprites/HeroSprite';
import { ambPhase } from '../ambient';
import { chainBannerSrc, questTagBannerSrc, questTagIconSrc, chainIconSrc } from './QuestPanel';
import { heroPortraitSrc, heroPortraitStyle } from './HeroesPanel';

/**
 * Patch 0467 -- the Quest Board's Overview sub-tab (Design canvas
 * "Guildbound Quest Board Rework", option A: hero lanes, signed off).
 *
 * One lane per hero, whatever they're doing, so every hero appears exactly
 * once on the page -- this replaces the old bottom-of-page "On the road"
 * list, which repeated the selected hero's own active quest right under
 * the copy of it shown in the Contracts slot.
 *  - On the road: quest art, difficulty, odds, reward, the walking
 *    progress track, time left, Recall (Auto-Chain streak pips if any).
 *  - Ready: the contract with the best success chance on their board and a
 *    Quick Send, or Pick another (opens Contracts on that hero).
 *  - Hurt (and not out): time to heal and Treat.
 *  - Fallen: points to the Heroes tab to revive.
 * The strip on top: how many are out / ready / recovering, who's back next,
 * the gold and Scrap on the way home, and Send All Idle. Just back: the
 * last three quest results.
 */

/** The contract with the best success chance for this hero right now
 *  (ties go to the bigger gold reward) -- Quick Send's pick. */
export function quickSendPick(state: ReturnType<typeof useEngine>['state'], hero: Hero, now: number):
  { offer: QuestOffer; success: number } | null {
  let best: { offer: QuestOffer; success: number } | null = null;
  for (const offer of state.questBoards[hero.id] ?? []) {
    const success = QuestManager.successBreakdown(state, hero, offer, hero.equippedConsumables ?? [], now).success;
    if (!best || success > best.success || (success === best.success && offer.rewardGold > best.offer.rewardGold)) {
      best = { offer, success };
    }
  }
  return best;
}

function offerBand(offer: QuestOffer): string | undefined {
  if (offer.chain) {
    const chain = CHAIN_BY_ID[offer.chain.chainId];
    return chainBannerSrc(offer.chain.chainId, chain?.banner);
  }
  return questTagBannerSrc(offer.tag);
}

function offerThumb(offer: QuestOffer): string | undefined {
  if (offer.chain) {
    const chain = CHAIN_BY_ID[offer.chain.chainId];
    return chainIconSrc(offer.chain.chainId, chain?.icon, chain?.banner);
  }
  return questTagIconSrc(offer.tag);
}

function DiffTag({ offer }: { offer: QuestOffer }) {
  const cfg = DIFFICULTIES[offer.difficulty];
  return <span className="tag" style={{ color: cfg.color }}>{cfg.label}</span>;
}

function Portrait({ hero, dim = false }: { hero: Hero; dim?: boolean }) {
  const cls = HERO_CLASSES[hero.heroClass];
  return (
    <span
      className={`qov-portrait ${dim ? 'dim' : ''}`}
      aria-hidden="true"
      style={{ backgroundImage: `url(${heroPortraitSrc(hero.heroClass, cls?.portrait)})`, ...heroPortraitStyle(cls?.portrait) }}
    />
  );
}

export function QuestOverview({
  now, onPickAnother, onRecall, onQuickSend,
}: {
  now: number;
  /** Open the Contracts sub-tab on this hero. */
  onPickAnother: (heroId: string) => void;
  onRecall: (heroId: string) => void;
  onQuickSend: (hero: Hero, offer: QuestOffer) => void;
}) {
  const engine = useEngine();
  const state = engine.state;

  const out = state.activeQuests;
  const idle = state.heroes.filter((h) => h.status !== 'questing' && h.status !== 'fallen');
  const recovering = state.heroes.filter((h) => h.status === 'fallen' || (h.status !== 'questing' && h.injuries.length > 0));
  const ready = idle.filter((h) => h.injuries.length === 0);
  const nextBack = [...out].sort((a, b) => a.endsAt - b.endsAt)[0];
  const nextBackHero = nextBack ? state.heroes.find((h) => h.id === nextBack.heroId) : undefined;
  const goldEnRoute = out.reduce((sum, q) => sum + Math.round(q.offer.rewardGold * q.goldMultiplier), 0);
  const scrapEnRoute = out.reduce((sum, q) => sum + (q.offer.scrapReward ?? 0), 0);
  const idleCount = state.heroes.filter((h) => h.status !== 'questing').length;

  const healsUsedToday = rerollsUsedToday(state.freeHealsUsedToday, state.freeHealDay, now);
  const justBack = state.log.slice().sort((a, b) => b.resolvedAt - a.resolvedAt).slice(0, 3);

  return (
    <div className="qov">
      <div className="card qov-strip">
        <div className="qov-k"><b>{out.length}</b><span>On the road</span></div>
        <div className="qov-k"><b className="good">{ready.length}</b><span>Ready for work</span></div>
        <div className="qov-k"><b className={recovering.length > 0 ? 'bad' : ''}>{recovering.length}</b><span>Recovering</span></div>
        {nextBack && (
          <div className="qov-k"><b className="gold-text">{formatDuration(nextBack.endsAt - now)}</b><span>Next back · {nextBackHero?.name ?? 'a hero'}</span></div>
        )}
        {out.length > 0 && (
          <div className="qov-k">
            <b><span className="gold-text">◆ {formatGold(goldEnRoute)}</span>{scrapEnRoute > 0 && <span className="qov-scrap"> + {formatNumber(scrapEnRoute)} Scrap</span>}</b>
            <span>On the way home</span>
          </div>
        )}
        <span style={{ flex: 1 }} />
        {idleCount > 0 && (
          <button
            className="btn-green"
            onClick={() => engine.sendAllIdle()}
            title="Send every idle hero on their own best contract"
          >
            Send All Idle ({idleCount})
          </button>
        )}
      </div>

      {state.heroes.map((hero) => {
        const quest = out.find((q) => q.heroId === hero.id);
        if (quest) return <RoadLane key={hero.id} hero={hero} quest={quest} now={now} onRecall={() => onRecall(hero.id)} />;
        if (hero.status === 'fallen') {
          return (
            <div key={hero.id} className="card qov-lane fallen">
              <div className="qov-who"><Portrait hero={hero} dim /><div><div className="qov-name">{hero.name} <span>Lv {hero.level}</span></div><div className="qov-state bad">Fallen</div></div></div>
              <div className="qov-job">
                <div className="qov-band qov-band-empty bad">Fallen in the field</div>
                <div className="qov-job-main"><div className="qov-job-title">Needs reviving before any more work</div></div>
                <div className="qov-actions"><button className="btn-ghost" onClick={() => engine.requestTab('heroes')}>Go to Heroes →</button></div>
              </div>
            </div>
          );
        }
        if (hero.injuries.length > 0) {
          const injury = [...hero.injuries].sort((a, b) => b.healsAt - a.healsAt)[0];
          const freeTreat = healsUsedToday < ModifierManager.freeHealsPerDay(state) || !hero.usedFreeTreat;
          return (
            <div key={hero.id} className="card qov-lane hurt amb-hurt">
              <div className="qov-who"><Portrait hero={hero} dim /><div><div className="qov-name">{hero.name} <span>Lv {hero.level}</span></div><div className="qov-state bad">Recovering</div></div></div>
              <div className="qov-job">
                <div className="qov-band qov-band-empty bad">{injury.name}</div>
                <div className="qov-job-main">
                  <div className="qov-job-title">Heals in {formatDuration(injury.healsAt - now)}</div>
                  <div className="qov-meta muted">Treat now, or wait it out{hero.injuries.length > 1 ? ` (${hero.injuries.length} injuries)` : ''}</div>
                </div>
                <div className="qov-actions">
                  <button
                    className="btn-primary"
                    onClick={() => engine.treatInjury(hero.id, injury.id)}
                    disabled={!freeTreat && state.gold < injury.treatmentCost}
                  >
                    {freeTreat ? 'Treat · Free' : `Treat · ${formatGold(injury.treatmentCost)}`}
                  </button>
                  <button className="btn-ghost" onClick={() => onPickAnother(hero.id)}>Contracts →</button>
                </div>
              </div>
            </div>
          );
        }
        const pick = quickSendPick(state, hero, now);
        const count = (state.questBoards[hero.id] ?? []).length;
        return (
          <div key={hero.id} className="card qov-lane ready">
            <div className="qov-who"><Portrait hero={hero} /><div><div className="qov-name">{hero.name} <span>Lv {hero.level}</span></div><div className="qov-state good">Ready{count > 0 ? ` · ${count} contract${count === 1 ? '' : 's'}` : ''}</div></div></div>
            {pick ? (
              <div className="qov-job">
                <div className="qov-band dim" style={offerBand(pick.offer) ? ({ backgroundImage: `url(${offerBand(pick.offer)})` } as CSSProperties) : undefined} />
                <div className="qov-job-main">
                  <div className="qov-eyebrow">Best odds for {hero.name}</div>
                  <div className="qov-job-title">{pick.offer.name}</div>
                  <div className="qov-meta">
                    <DiffTag offer={pick.offer} />
                    <span>Success <b>{Math.round(pick.success)}%</b></span>
                    <span>Reward <b className="gold-text">{formatGold(pick.offer.rewardGold)}</b></span>
                    {(pick.offer.scrapReward ?? 0) > 0 && <span>· {pick.offer.scrapReward} Scrap</span>}
                    <span className="muted">· {formatDuration(QuestManager.previewDuration(state, hero, pick.offer, now))}</span>
                  </div>
                </div>
                <div className="qov-actions">
                  <button
                    className="btn-green amb-glint"
                    style={ambPhase(hero.id, 6)}
                    onClick={() => onQuickSend(hero, pick.offer)}
                    title={`Send ${hero.name} on the contract with the best chance of success`}
                  >
                    Quick Send
                  </button>
                  <button className="btn-ghost" onClick={() => onPickAnother(hero.id)}>Pick another →</button>
                </div>
              </div>
            ) : (
              <div className="qov-job">
                <div className="qov-band qov-band-empty muted">No contracts</div>
                <div className="qov-job-main"><div className="qov-job-title muted">Nothing open right now. New contracts arrive within the half hour.</div></div>
                <div className="qov-actions"><button className="btn-ghost" onClick={() => onPickAnother(hero.id)}>Contracts →</button></div>
              </div>
            )}
          </div>
        );
      })}

      {justBack.length > 0 && (
        <>
          <div className="section-heading">Just back</div>
          <div className="qov-justback">
            {justBack.map((r) => (
              <div key={`${r.questId}-${r.resolvedAt}`} className="qov-result">
                <span><b className={r.success ? 'good' : 'bad'}>{r.success ? 'Fulfilled' : 'Failed'}</b> · {r.questName} · {r.heroName}</span>
                <span className={r.success ? 'gold-text' : 'bad'} style={{ marginLeft: 'auto' }}>
                  {r.success ? `+${formatGold(r.gold)}` : r.injury ? 'injured' : 'no reward'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RoadLane({ hero, quest, now, onRecall }: { hero: Hero; quest: ActiveQuest; now: number; onRecall: () => void }) {
  const state = useEngine().state;
  const total = Math.max(1, quest.endsAt - quest.startedAt);
  const progress = Math.min(100, ((now - quest.startedAt) / total) * 100);
  const band = offerBand(quest.offer);
  const thumb = offerThumb(quest.offer);
  const streak = hero.autoChainTarget != null && hero.autoChainTarget > 1;
  return (
    <div className="card qov-lane road">
      <div className="qov-who">
        <Portrait hero={hero} />
        <div>
          <div className="qov-name">{hero.name} <span>Lv {hero.level}</span></div>
          <div className="qov-state gold-text">
            {streak ? (
              <>
                {/* Patch 0469 -- label + count first, pips on their own line
                    underneath, so a 10-pip streak never pushes past the
                    hero column into the quest band. */}
                <span>Auto-Chain {Math.min(hero.autoChainCount + 1, hero.autoChainTarget!)}/{hero.autoChainTarget}</span>
                <span className="qov-pips" aria-label={`${hero.autoChainCount + 1} of ${hero.autoChainTarget}`}>
                  {Array.from({ length: hero.autoChainTarget! }, (_, i) => <i key={i} className={i <= hero.autoChainCount ? 'on' : ''} />)}
                </span>
              </>
            ) : 'On the road'}
          </div>
        </div>
      </div>
      <div className="qov-job">
        <div className="qov-band" style={band || thumb ? ({ backgroundImage: `url(${band ?? thumb})` } as CSSProperties) : undefined} />
        <div className="qov-job-main">
          <div className="qov-job-title">{quest.offer.name}</div>
          <div className="qov-meta">
            <DiffTag offer={quest.offer} />
            <span>Success <b>{Math.round(quest.finalSuccess)}%</b></span>
            <span>Reward <b className="gold-text">{formatGold(quest.offer.rewardGold * quest.goldMultiplier)}</b></span>
            {quest.consumables.length > 0 && (
              <span className="muted">Used {quest.consumables.map((c) => InventoryManager.resolveDef(state, c)?.name).filter(Boolean).join(', ')}</span>
            )}
          </div>
          <div className="qsx-track qov-track">
            <span className="qsx-rider" style={{ left: `${progress}%` }} aria-hidden="true">
              <HeroSprite heroClass={hero.heroClass} skin={hero.skin} animation="walk" height={24} />
            </span>
            <span className="qsx-flag" aria-hidden="true">⚑</span>
            <div className="bar amb-sheen-bar"><span style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
        <div className="qov-actions col">
          <span className="qov-eta gold-text">{formatDuration(quest.endsAt - now)}</span>
          <button className="btn-ghost" onClick={onRecall}>Recall</button>
        </div>
      </div>
    </div>
  );
}
