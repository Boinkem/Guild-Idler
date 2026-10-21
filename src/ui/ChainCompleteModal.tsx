import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { RarityPill } from './RarityPill';
import { ItemIcon } from './icons';
import { formatGold, RARITY_COLOR } from '../game/util';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { rankTierForLevel } from '../game/data/guildRank';
import { Rarity } from '../game/types';
import { chainBannerSrc, chainIconSrc } from './panels/QuestPanel';
import { at, useDelayedCount, TickMark } from './resultFx';
import waxSealComplete from '../assets/wax-seal-complete.png';
import { DEMO, DEMO_BUILD, requestDemoWall } from '../game/demo';

/**
 * The big "Story Chain Complete" overlay -- separate from the regular
 * per-quest QuestResultModal, since a chain finishing is the payoff of
 * everything the Lore tab has been building toward and deserves to read as
 * a genuinely different kind of moment, not just another quest card. This
 * is also the ONLY place that celebration happens -- an earlier pass
 * briefly duplicated a smaller version of it directly inside
 * QuestResultModal, which meant the same completion fired two competing
 * celebratory UIs back to back; that was reverted in favor of putting all
 * the fanfare here, in the modal actually designed to be the big moment.
 *
 * Always mounted regardless of view mode (same reasoning as
 * OfflineReportModal/QuestResultModal): the underlying state clears on
 * dismiss either way, but only actually renders while `active` -- showing
 * this cropped inside the tiny idle-companion window would repeat the
 * original offline-report bug. IdleView shows a compact banner instead and
 * opens the menu on click. No local "dismissing" phase like the other
 * result modals have -- this one has no particle burst to wait out on
 * exit, since the burst fires on arrival instead (see below), so Close
 * can just call dismissChainCelebration() immediately.
 *
 * Patch 0422 -- rebuilt as an animated card: it unrolls from the middle,
 * the chain's banner settles and its icon pops onto the edge, every stage
 * ticks off one by one along a rail filling in the chain's tier colour,
 * then a wax seal slams down (ring, sparks, shake, drifting embers), the
 * title ribbon unfurls, gold and renown count up and the reward items
 * flip in. The old six-star arrival burst is replaced by the seal sparks.
 */
export function ChainCompleteModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const celebration = engine.completedChainCelebration;
  if (!active || !celebration) return null;
  return <ChainCompleteCard key={celebration.chainId} celebration={celebration} onViewLore={onViewLore} />;
}

type Celebration = NonNullable<ReturnType<typeof useEngine>['completedChainCelebration']>;

function ChainCompleteCard({ celebration, onViewLore }: { celebration: Celebration; onViewLore: () => void }) {
  const engine = useEngine();
  const chain = CHAIN_BY_ID[celebration.chainId];
  const tier = chain ? rankTierForLevel(chain.reqLevel) : null;
  // Falls back to violet, the game's general "story/chain" accent, when a
  // chain's tier can't be resolved.
  const accent = tier?.color ?? 'var(--violet)';
  const stages = chain?.stages ?? [];

  // 1x timeline (ms): unroll 0, stages tick from 1100 every 280, then the seal.
  const T_STAGES = 1100;
  const SEAL = T_STAGES + Math.max(1, stages.length) * 280 + 150;
  const T_TITLE = SEAL + 700;
  const T_PAY = SEAL + 1100;
  const T_ITEMS = SEAL + 1500;
  const T_DONE = T_ITEMS + Math.min(celebration.items.length, 4) * 200 + 300;
  const gold = useDelayedCount(celebration.rewardGold, T_PAY, 800);
  const renown = useDelayedCount(celebration.rewardRenown, T_PAY, 800);
  const motes = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ x: 4 + ((i * 37) % 92), delay: (i * 211) % 3000, dur: 3500 + ((i * 173) % 2500) })),
    [],
  );

  // Patch 0438 -- finishing the demo's one story chain hands straight on
  // to the wishlist card once this celebration is dismissed (either way).
  const endOfDemoStory = DEMO_BUILD && celebration.chainId === DEMO.storyChainId;
  const close = () => {
    engine.dismissChainCelebration();
    if (endOfDemoStory) requestDemoWall({ kind: 'story' });
  };
  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore();
    engine.dismissChainCelebration();
    if (endOfDemoStory) requestDemoWall({ kind: 'story' });
  };

  return (
    <div className="overlay chain-complete-overlay sfx-overlay" style={{ '--tier': accent } as CSSProperties}>
      {motes.map((m, i) => (
        <span
          key={i}
          className="sfx-mote"
          aria-hidden="true"
          style={at(SEAL + m.delay, { left: `${m.x}%`, animationDuration: `calc(var(--fx-t) * ${m.dur})` })}
        />
      ))}
      <div className="modal chain-complete-modal sfx-card" style={{ '--seal-at': `calc(var(--fx-t) * ${SEAL + 310})`, '--glow-at': `calc(var(--fx-t) * ${SEAL})` } as CSSProperties}>
        <div className="sfx-banner" style={chain ? { backgroundImage: `url(${chainBannerSrc(chain.id, chain.banner)})` } : undefined}>
          {chain && <span className="sfx-chainicon" style={at(350, { backgroundImage: `url(${chainIconSrc(chain.id, chain.icon, chain.banner)})` })} aria-hidden="true" />}
        </div>
        <div className="sfx-body">
          <div className="chain-complete-kicker sfx-kicker" style={at(450)}>
            Story Chain Complete{tier ? ` · ${tier.name}` : ''}
          </div>
          <h2 className="sfx-title" style={at(600)}>{celebration.chainName}</h2>

          {stages.length > 0 && (
            <div className="sfx-stages">
              <span className="sfx-rail">
                <span style={at(T_STAGES, { animationDuration: `calc(var(--fx-t) * ${stages.length * 280})` })} />
              </span>
              {stages.map((st, i) => (
                <div key={i} className="sfx-stage" style={at(T_STAGES + i * 280)}>
                  <span className="sfx-pip"><TickMark /></span>
                  <span className="sfx-sname">{st.name}</span>
                </div>
              ))}
            </div>
          )}

          <span className="sfx-seal" aria-hidden="true">
            <span className="sfx-ring" style={at(SEAL + 310)} />
            <span className="sfx-sparks">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} style={{ transform: `rotate(${i * 30}deg)` }}><i style={at(SEAL + 320)} /></span>
              ))}
            </span>
            <span className="sfx-ink" style={at(SEAL + 340)}>Expedition Complete</span>
            <img src={waxSealComplete} alt="" style={at(SEAL)} />
          </span>

          {celebration.title && (
            <div className="sfx-ribbon" style={at(T_TITLE)}>
              <span style={at(T_TITLE + 250)}>Title earned: <b>{celebration.title}</b></span>
            </div>
          )}

          <div className="sfx-rewards">
            <span className="gold-text sfx-cur" style={at(T_PAY)}>+{formatGold(gold)} gold</span>
            {celebration.rewardRenown > 0 && (
              <span className="sfx-cur" style={at(T_PAY + 80, { color: 'var(--violet)' })}>+{renown} renown</span>
            )}
          </div>

          {celebration.items.length > 0 && (
            <div className="sfx-items">
              {celebration.items.map((it, i) => {
                const def = EQUIPMENT_BY_ID[it.defId];
                const color = RARITY_COLOR[it.rarity as Rarity];
                return (
                  <div key={`${it.defId}-${i}`} className="sfx-item" style={at(T_ITEMS + Math.min(i, 4) * 200, { borderColor: color })}>
                    {def && <ItemIcon slot={def.slot} icon={def.icon} size={30} />}
                    <span className="tiny" style={{ fontWeight: 700, color }}>{it.name}</span>
                    <RarityPill rarity={it.rarity as Rarity} />
                  </div>
                );
              })}
            </div>
          )}

          <div className="row end sfx-actions" style={at(T_DONE, { marginTop: 16, gap: 8 })}>
            <button className="btn-ghost" onClick={close}>Close</button>
            <button className="btn-primary" onClick={viewLore}>View in Lore</button>
          </div>
        </div>
      </div>
    </div>
  );
}
