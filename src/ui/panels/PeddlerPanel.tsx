import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { PeddlerManager } from '../../game/managers/PeddlerManager';
import { MATERIAL_BY_ID } from '../../game/data/materials';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { PeddlerCardDef, PeddlerCardTier } from '../../game/types';
import { formatGold, formatDuration, RARITY_COLOR } from '../../game/util';
import { GrimsbySprite } from '../sprites/GrimsbySprite';

/**
 * Random one-liners Grimsby fires off the moment the cards spawn --
 * deliberately separate from PeddlerCardDef.flavorText (which is tied to
 * a SPECIFIC resolved outcome and only makes sense once a card is
 * flipped). These are just "waiting for you to pick" filler, small
 * enough to keep inline here rather than needing their own DevTool
 * content type for six lines of banter.
 */
const BROWSING_LINES = [
  "\"Don't overthink it. That's MY job.\"",
  '"Every one of these is a winner. Statistically, that\u2019s a lie, but every one of these is a winner."',
  '"Pick with your heart. Or your least favorite hand, doesn\u2019t matter to me."',
  '"I\u2019d pick the middle one. Or maybe that\u2019s what I want you to think."',
  '"No refunds. Well -- sometimes. Depends on the card, doesn\u2019t it."',
  '"Careful now. These have been shuffled at least once."',
];

const TIER_LABEL: Record<PeddlerCardTier, string> = {
  bust: 'Nothing', refund: 'Partial Refund', modest: 'Modest Find', good: 'Good Find', jackpot: 'JACKPOT',
};

function outcomeDisplayName(outcome: PeddlerCardDef): string {
  switch (outcome.kind) {
    case 'nothing': return 'Nothing';
    case 'joke': return outcome.jokeItemName ?? 'A Joke, Apparently';
    case 'goldFlat': return `${outcome.goldAmount ?? 0} Gold`;
    case 'goldRefund': return 'Partial Refund';
    case 'material': return MATERIAL_BY_ID[outcome.materialId!]?.name ?? 'Materials';
    case 'scrap': return `${outcome.scrapAmount ?? 0} Scrap`;
    case 'equipment': return EQUIPMENT_BY_ID[outcome.itemId!]?.name ?? 'Mystery Gear';
    case 'egg': return `${outcome.eggRarity ?? 'common'} Egg`;
    default: return 'Something';
  }
}

/** One face-down or revealed card. Hover-shake is CSS-only (see
 *  app.css's .peddler-card:hover), no JS animation needed. */
function PeddlerCard({
  faceUp, backIndex, outcome, isPicked, onClick, disabled,
}: {
  faceUp: boolean;
  backIndex: number;
  outcome?: PeddlerCardDef;
  isPicked?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (!faceUp) {
    return (
      <button
        type="button"
        className="peddler-card peddler-card-facedown"
        style={{ backgroundImage: `url(./peddler/cards/back_${backIndex}.png)` }}
        onClick={onClick}
        disabled={disabled}
        aria-label="Pick this card"
      />
    );
  }
  const tierColor = outcome?.tier === 'jackpot' ? RARITY_COLOR.legendary
    : outcome?.tier === 'good' ? RARITY_COLOR.rare
      : outcome?.tier === 'modest' ? RARITY_COLOR.uncommon
        : 'var(--muted)';
  return (
    <div className={`peddler-card peddler-card-revealed ${isPicked ? 'peddler-card-picked' : ''}`}>
      <div className="tiny muted" style={{ marginBottom: 4 }}>{isPicked ? 'You picked this one' : 'You didn\u2019t pick this one'}</div>
      <div className="card-title" style={{ color: tierColor, fontSize: 13 }}>
        {outcome ? TIER_LABEL[outcome.tier] : ''}
      </div>
      <div style={{ margin: '6px 0' }}>{outcome ? outcomeDisplayName(outcome) : ''}</div>
      <p className="tiny muted" style={{ fontStyle: 'italic' }}>{outcome?.flavorText}</p>
    </div>
  );
}

export function PeddlerPanel() {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(1000);
  const [showCards, setShowCards] = useState(false);
  const [localBacks] = useState<[number, number, number]>(() => [
    Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3),
  ]);
  const [browsingLine] = useState(() => BROWSING_LINES[Math.floor(Math.random() * BROWSING_LINES.length)]);

  const present = PeddlerManager.isPresent(state);
  const result = engine.lastGrimsbyResult;
  const fee = PeddlerManager.feeCost(state);
  const canAfford = state.gold >= fee;
  const charmCount = state.inventory.beckoning_charm ?? 0;

  const handlePick = (index: number) => {
    engine.pickPeddlerCard(index as 0 | 1 | 2);
  };

  const handleCollect = () => {
    engine.dismissGrimsbyResult();
    setShowCards(false);
  };

  return (
    <>
      <h2>Grimsby</h2>
      <p className="subtitle">
        A cart, a cart, and absolutely nothing more, according to him. Pay for a card, pick one, see what
        happens -- he swears the odds are fair. He would say that either way.
      </p>

      <div
        className="peddler-scene"
        style={{ backgroundImage: 'url(./lore/peddler-bg.png)' }}
      >
        <GrimsbySprite
          animation={showCards && !result ? 'wave' : present ? 'approval' : 'idle2'}
          height={110}
        />

        {!present && (
          <div className="peddler-waiting">
            <p>The cart's not here right now. He turns up unannounced, every so often, and doesn't stick around long once he does.</p>
            {charmCount > 0 && (
              <button onClick={() => engine.usePeddlerCharm('beckoning_charm')}>
                Use a Beckoning Charm ({charmCount})
              </button>
            )}
          </div>
        )}

        {present && !showCards && !result && (
          <div className="peddler-offer">
            <p>"Well? Card's a card. Fair chance, for a fair price." <span className="tiny muted">({formatDuration(Math.max(0, (state.grimsbyLeavesAt ?? now) - now))} left before he wanders off)</span></p>
            <button
              className="btn-primary"
              disabled={!canAfford}
              onClick={() => setShowCards(true)}
              title={canAfford ? undefined : 'Not enough gold'}
            >
              Pick Your Card -- {formatGold(fee)} gold
            </button>
          </div>
        )}

        {present && showCards && !result && (
          <>
            <p className="peddler-corner-comment tiny">{browsingLine}</p>
            <div className="peddler-card-row">
              {localBacks.map((back, i) => (
                <PeddlerCard key={i} faceUp={false} backIndex={back} onClick={() => handlePick(i)} />
              ))}
            </div>
          </>
        )}

        {present && result && (
          <>
            <div className="peddler-card-row">
              {result.cards.map((c, i) => (
                <PeddlerCard
                  key={i}
                  faceUp
                  backIndex={c.backIndex}
                  outcome={c.outcome}
                  isPicked={i === result.pickedIndex}
                />
              ))}
            </div>
            <div className="peddler-result-summary">
              <p><b>You got:</b> {result.rewardSummary}</p>
              <button className="btn-primary" onClick={handleCollect}>Thanks, I think</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
