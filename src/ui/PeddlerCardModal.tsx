import { useState } from 'react';
import { useEngine } from './useEngine';
import { PeddlerCardDef, PeddlerCardTier } from '../game/types';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { RARITY_COLOR } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { ItemIcon, MaterialIcon } from './icons';
import { EggIcon } from './EggIcon';

/**
 * Random one-liners Grimsby fires off the moment the cards spawn --
 * deliberately separate from PeddlerCardDef.flavorText (which is tied to
 * a SPECIFIC resolved outcome and only makes sense once a card is
 * flipped). Small enough to keep inline here rather than needing their
 * own DevTool content type for six lines of banter.
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

/**
 * Resolves a card outcome to a real, already-established icon component
 * wherever one exists (ItemIcon for equipment, MaterialIcon for
 * materials, EggIcon for eggs -- all reused as-is, same fallback-to-
 * glyph behavior every other item display in this game already has),
 * and to a plain glyph-in-a-box (matching the same `.item-icon` styling)
 * for the kinds that were never real items to begin with (gold, scrap,
 * joke/nothing).
 */
function PeddlerOutcomeIcon({ outcome, size = 48 }: { outcome: PeddlerCardDef; size?: number }) {
  switch (outcome.kind) {
    case 'material': {
      const def = outcome.materialId ? MATERIAL_BY_ID[outcome.materialId] : undefined;
      return <MaterialIcon icon={def?.icon} glyph={def?.glyph ?? outcome.glyph ?? '\u2753'} size={size} />;
    }
    case 'equipment': {
      const def = outcome.itemId ? EQUIPMENT_BY_ID[outcome.itemId] : undefined;
      if (!def) return <div className="item-icon" style={{ width: size, height: size, fontSize: size * 0.55 }}>?</div>;
      return <ItemIcon slot={def.slot} icon={def.icon} size={size} />;
    }
    case 'egg':
      return <EggIcon rarity={outcome.eggRarity ?? 'common'} size={size} />;
    case 'goldFlat':
    case 'goldRefund':
      return (
        <div className="item-icon" style={{ width: size, height: size }}>
          <span aria-hidden="true" style={{ fontSize: size * 0.5 }}>◆</span>
        </div>
      );
    case 'scrap':
      return (
        <div className="item-icon" style={{ width: size, height: size }}>
          <span aria-hidden="true" style={{ fontSize: size * 0.5 }}>{outcome.glyph ?? '\ud83d\udd29'}</span>
        </div>
      );
    case 'nothing':
    case 'joke':
    default:
      return (
        <div className="item-icon" style={{ width: size, height: size }}>
          <span aria-hidden="true" style={{ fontSize: size * 0.5 }}>{outcome.glyph ?? '\u2753'}</span>
        </div>
      );
  }
}

/** One face-down or revealed card. Face-down: plain highlight on hover
 *  (border/outline color change only -- no shake/transform, which used
 *  to intermittently blank the large background-image mid-animation).
 *  Revealed: icon + short name always visible, flavor text (and the
 *  tier label) tucked behind a click-to-expand toggle -- both a native
 *  `title` tooltip AND a click work, covering hover-capable and
 *  touch-only alike. */
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
  const [expanded, setExpanded] = useState(false);

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
    <button
      type="button"
      className={`peddler-card peddler-card-revealed ${isPicked ? 'peddler-card-picked' : ''}`}
      onClick={() => setExpanded((v) => !v)}
      title={outcome?.flavorText}
    >
      <div className="tiny muted">{isPicked ? 'You picked this one' : 'Not picked'}</div>
      {outcome && <PeddlerOutcomeIcon outcome={outcome} size={48} />}
      <div className="peddler-card-name">{outcome ? outcomeDisplayName(outcome) : ''}</div>
      {expanded && outcome && (
        <div className="peddler-card-details">
          <div className="tiny" style={{ color: tierColor, fontWeight: 'bold' }}>{TIER_LABEL[outcome.tier]}</div>
          <p className="tiny muted" style={{ fontStyle: 'italic' }}>{outcome.flavorText}</p>
        </div>
      )}
    </button>
  );
}

export function PeddlerCardModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const [showCards, setShowCards] = useState(false);
  const [localBacks] = useState<[number, number, number]>(() => [
    Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3),
  ]);
  const [browsingLine] = useState(() => BROWSING_LINES[Math.floor(Math.random() * BROWSING_LINES.length)]);

  const result = engine.lastGrimsbyResult;

  const handlePick = (index: number) => {
    setShowCards(true); // already true by the time this is reachable, kept for clarity
    engine.pickPeddlerCard(index as 0 | 1 | 2);
  };

  const handleClose = () => {
    if (result) engine.dismissGrimsbyResult();
    onClose();
  };

  return (
    <div className="overlay" onClick={handleClose}>
      <div
        className="modal peddler-modal"
        style={{ backgroundImage: 'url(./lore/peddler-table.png)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="peddler-modal-header">
          <GrimsbySprite animation={result ? 'approval' : 'wave'} height={80} />
          {!result && <p className="peddler-corner-comment tiny">{browsingLine}</p>}
        </div>

        {!showCards && !result && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => setShowCards(true)}>Lay out the cards</button>
          </div>
        )}

        {showCards && !result && (
          <div className="peddler-card-row">
            {localBacks.map((back, i) => (
              <PeddlerCard key={i} faceUp={false} backIndex={back} onClick={() => handlePick(i)} />
            ))}
          </div>
        )}

        {result && (
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
            </div>
          </>
        )}

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>{result ? 'Thanks, I think' : 'Never mind'}</button>
        </div>
      </div>
    </div>
  );
}
