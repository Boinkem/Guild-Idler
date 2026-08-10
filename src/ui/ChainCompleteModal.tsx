import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { RarityPill } from './RarityPill';
import { formatGold } from '../game/util';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { rankTierForLevel } from '../game/data/guildRank';
import { Rarity } from '../game/types';

/**
 * Wide, full spread -- finishing a multi-stage story chain is the single
 * biggest moment either this modal or QuestResultModal/RaidResultModal can
 * show, so this deliberately outdoes their own legendary-drop bursts
 * rather than matching them. Colored per-particle at render time to the
 * chain's own rank tier (falls back to violet, the game's general
 * "story/chain" accent, when a chain's tier can't be resolved) so the
 * burst always matches this modal's own dynamically-colored border rather
 * than being a fixed color independent of it.
 */
const CHAIN_COMPLETE_PARTICLES = [
  { dx: -95, dy: -70, rot: -24, delay: 0 },
  { dx: -60, dy: -120, rot: -12, delay: 50 },
  { dx: -20, dy: -145, rot: -4, delay: 90 },
  { dx: 20, dy: -145, rot: 4, delay: 30 },
  { dx: 60, dy: -120, rot: 12, delay: 110 },
  { dx: 95, dy: -70, rot: 24, delay: 70 },
];

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
 */
export function ChainCompleteModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const celebration = engine.completedChainCelebration;
  if (!active || !celebration) return null;

  const chain = CHAIN_BY_ID[celebration.chainId];
  const tier = chain ? rankTierForLevel(chain.reqLevel) : null;
  const accentColor = tier?.color ?? 'var(--violet)';

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
        <p className="chain-complete-label" style={{ color: accentColor, textShadow: `0 0 12px ${accentColor}cc, 0 0 24px ${accentColor}73` }}>
          🏆 Expedition Complete!
        </p>
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

        {/* Fires on arrival, not on dismiss -- unlike QuestResultModal/
            RaidResultModal's bursts (which wait for the player to close the
            card, so the fly-out has somewhere to go), this modal has no
            equivalent exit moment worth waiting for, and the celebration
            should be the first thing the player sees, not something they
            have to click through to at all. Colored to accentColor
            (the chain's own rank tier, same as the border) via inline
            style rather than the fixed --brass/--violet a CSS class alone
            would give, so every tier's celebration reads as visually
            "its own" rather than every chain completion looking identical
            regardless of how far into the game it is. */}
        <div className="collect-burst" aria-hidden="true">
          {CHAIN_COMPLETE_PARTICLES.map((p, i) => (
            <span
              key={`chain-${i}`}
              className="collect-particle chain"
              style={{
                '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms`,
                color: accentColor,
                textShadow: `0 0 10px ${accentColor}d9, 0 0 22px ${accentColor}80`,
              } as CSSProperties}
            >
              ✦
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
