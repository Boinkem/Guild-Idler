import { useEngine } from './useEngine';
import { RarityPill } from './RarityPill';
import { formatGold } from '../game/util';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { rankTierForLevel } from '../game/data/guildRank';
import { Rarity } from '../game/types';

/**
 * The big "Story Chain Complete" overlay -- separate from the regular
 * per-quest QuestResultModal, since a chain finishing is the payoff of
 * everything the Lore tab has been building toward and deserves to read as
 * a genuinely different kind of moment, not just another quest card.
 *
 * Always mounted regardless of view mode (same reasoning as
 * OfflineReportModal/QuestResultModal): the underlying state clears on
 * dismiss either way, but only actually renders while `active` -- showing
 * this cropped inside the tiny idle-companion window would repeat the
 * original offline-report bug. IdleView shows a compact banner instead and
 * opens the menu on click.
 */
export function ChainCompleteModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const celebration = engine.completedChainCelebration;
  if (!active || !celebration) return null;

  const chain = CHAIN_BY_ID[celebration.chainId];
  const tier = chain ? rankTierForLevel(chain.reqLevel) : null;

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore();
    engine.dismissChainCelebration();
  };

  return (
    <div className="overlay chain-complete-overlay">
      <div
        className="modal chain-complete-modal"
        style={tier ? { borderColor: tier.color, boxShadow: `0 0 24px ${tier.color}55` } : undefined}
      >
        <div className="chain-complete-kicker" style={tier ? { color: tier.color } : undefined}>
          Story Chain Complete
        </div>
        <h2 style={{ marginTop: 4 }}>{celebration.chainName}</h2>
        {celebration.title && (
          <p className="small muted" style={{ marginTop: 0 }}>Title earned: {celebration.title}</p>
        )}

        <div className="stat-row" style={{ margin: '10px 0' }}>
          <span className="gold-text">+{formatGold(celebration.rewardGold)} gold</span>
          <span style={{ color: 'var(--violet)' }}>+{celebration.rewardRenown} renown</span>
        </div>

        {celebration.items.length > 0 && (
          <>
            <div className="section-heading">Rewards</div>
            <div className="row wrap" style={{ gap: 8, marginBottom: 4 }}>
              {celebration.items.map((it) => (
                <span key={it.defId} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="tiny">{it.name}</span>
                  <RarityPill rarity={it.rarity as Rarity} />
                </span>
              ))}
            </div>
          </>
        )}

        <div className="row end" style={{ marginTop: 16, gap: 8 }}>
          <button onClick={() => engine.dismissChainCelebration()}>Close</button>
          <button className="btn-primary" onClick={viewLore}>View in Lore</button>
        </div>
      </div>
    </div>
  );
}
