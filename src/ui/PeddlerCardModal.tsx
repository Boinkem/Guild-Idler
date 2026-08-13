import { useEffect, useRef, useState, CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { PeddlerCardDef, PeddlerCardTier } from '../game/types';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { RARITY_COLOR } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { ItemIcon, MaterialIcon, ConsumableIcon } from './icons';
import { EggIcon } from './EggIcon';
import { measureFlyOffset } from './flyTarget';

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

/** Same cards, same odds -- just a bit more personality for the bigger-
 *  stakes version, since that's the one moment High Roller actually
 *  looks different from the regular game. */
const HIGH_ROLLER_LINES = [
  '"Ah, THIS deck. Careful now -- these ones bite harder, both ways."',
  '"Big spender. I like that. I also like your gold either way."',
  '"Same cart, same cards. Just... more feeling behind the flip, isn\u2019t there?"',
];

const TIER_LABEL: Record<PeddlerCardTier, string> = {
  bust: 'Nothing', refund: 'Partial Refund', modest: 'Modest Find', good: 'Good Find', jackpot: 'JACKPOT',
};

/** How long the two unpicked cards take to fade away before the result
 *  summary appears -- shared between the CSS animation (see .peddler-
 *  card-fading-out in app.css) and the setTimeout that gates the summary,
 *  so they can never drift out of sync with each other. Doubled from 480
 *  -- the original fade read as too abrupt to actually register as a
 *  fade rather than a snap. */
const UNPICKED_FADE_MS = 960;

/** How many little glow particles fly off for a given outcome -- keyed
 *  to the outcome's own tier rather than a raw gold/material amount,
 *  since those two aren't on a comparable scale to begin with (a flat
 *  gold amount vs. a refund percentage vs. a material count) but tier
 *  is already a normalized 1-5 "how big a deal is this" signal every
 *  outcome already carries. Reads as "more flourish for a better pull,"
 *  which is what "more depending on the amount" is really getting at. */
const BURST_PARTICLE_COUNT: Record<PeddlerCardTier, number> = {
  bust: 1, refund: 1, modest: 2, good: 3, jackpot: 5,
};

/** Which shared fly-target (see flyTarget.ts) this outcome's reward
 *  particles head toward, or null for kinds with nothing to fly at all
 *  (nothing/joke). Gold-shaped kinds fly to the header's own 'gold'
 *  display (same target QuestResultModal/RaidResultModal already use);
 *  everything else flies to the Equipment tab (registered as
 *  'inventory' in MenuWindow.tsx), matching "fly into the inventory"
 *  directly. */
function burstTargetFor(kind: PeddlerCardDef['kind']): string | null {
  switch (kind) {
    case 'goldFlat':
    case 'goldRefund':
      return 'gold';
    case 'material':
    case 'scrap':
    case 'equipment':
    case 'egg':
      return 'inventory';
    default:
      return null;
  }
}

/** Glow color per outcome -- rarity for the two kinds that actually
 *  have one (equipment/egg both carry a real Rarity), brass for gold
 *  (matching every other gold flourish in the game), a neutral moss
 *  tone for material/scrap (no rarity concept to hang a color on). */
function burstColorFor(outcome: PeddlerCardDef): string {
  switch (outcome.kind) {
    case 'goldFlat':
    case 'goldRefund':
      return 'var(--brass)';
    case 'equipment': {
      const def = outcome.itemId ? EQUIPMENT_BY_ID[outcome.itemId] : undefined;
      return def ? RARITY_COLOR[def.rarity] : 'var(--brass)';
    }
    case 'egg':
      return RARITY_COLOR[outcome.eggRarity ?? 'common'];
    default:
      return 'var(--moss)';
  }
}

/**
 * One flying reward particle -- a colored circular glow (always
 * present) with an optional icon centered inside it. Deliberately built
 * so the glow works standalone (today: gold/material/scrap/egg all have
 * no per-outcome icon set yet) AND continues working once real icons
 * are assigned via the DevTool later -- `outcome.icon` is the exact
 * same field PeddlerOutcomeIcon already reads for the revealed card
 * face, so assigning one there lights up both places at once, not just
 * this burst. No icon set -> just the glow circle, never a broken-image
 * placeholder.
 */
function RewardGlowParticle({
  color, icon, x, y, dx, dy, delay, durationMs,
}: {
  color: string; icon?: string; x: number; y: number; dx: number; dy: number; delay: number; durationMs: number;
}) {
  return (
    <span
      className="fly-particle reward-glow-particle"
      aria-hidden="true"
      style={{
        position: 'fixed', left: x, top: y,
        '--fly-dx': `${dx}px`, '--fly-dy': `${dy}px`, '--glow-color': color,
        animationDuration: `${durationMs}ms`, animationDelay: `${delay}ms`,
      } as CSSProperties}
    >
      {icon && <img src={`./item-icons/${icon}`} alt="" />}
    </span>
  );
}

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

function tierColorFor(tier: PeddlerCardTier): string {
  return tier === 'jackpot' ? RARITY_COLOR.legendary
    : tier === 'good' ? RARITY_COLOR.rare
      : tier === 'modest' ? RARITY_COLOR.uncommon
        : 'var(--muted)';
}

/**
 * Resolves a card outcome to a real, already-established icon component
 * wherever one exists (ItemIcon for equipment, MaterialIcon for
 * materials, EggIcon for eggs -- all reused as-is, same fallback-to-
 * glyph behavior every other item display in this game already has). The
 * generic kinds that were never real items to begin with (gold, scrap,
 * joke/nothing) now reuse ConsumableIcon instead of a hardcoded glyph
 * box -- same icon-falls-back-to-glyph shape everything else already
 * has, just reading PeddlerCardDef's own `icon` field (see its comment
 * in types.ts) rather than a def looked up elsewhere. This is what lets
 * the DevTool assign a real "sack of gold" icon to a goldFlat card
 * instead of being stuck with an emoji.
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
      return <ConsumableIcon icon={outcome.icon} glyph={outcome.glyph ?? '\u25c6'} size={size} />;
    case 'scrap':
      return <ConsumableIcon icon={outcome.icon} glyph={outcome.glyph ?? '\ud83d\udd29'} size={size} />;
    case 'nothing':
    case 'joke':
    default:
      return <ConsumableIcon icon={outcome.icon} glyph={outcome.glyph ?? '\u2753'} size={size} />;
  }
}

/** One face-down or revealed card.
 *
 *  Face-down: plain highlight on hover (border/outline color change only
 *  -- no shake/transform, which used to intermittently blank the large
 *  background-image mid-animation). Also used, disabled and optionally
 *  fading, for the two cards that weren't picked once a result comes
 *  back -- they never flip (see PeddlerCardModal below for why).
 *
 *  Revealed: icon + short name always visible. Clicking opens the detail
 *  overlay (tier + flavor text) as a new card laid over the top, via
 *  onOpenDetails -- deliberately NOT an inline expand-in-place anymore,
 *  since growing the card itself inside the fixed-size modal read as the
 *  whole thing "zooming." */
function PeddlerCard({
  faceUp, backIndex, outcome, onClick, onOpenDetails, disabled, fadingOut,
}: {
  faceUp: boolean;
  backIndex: number;
  outcome?: PeddlerCardDef;
  onClick?: () => void;
  onOpenDetails?: () => void;
  disabled?: boolean;
  fadingOut?: boolean;
}) {
  if (!faceUp) {
    return (
      <button
        type="button"
        className={`peddler-card peddler-card-facedown ${fadingOut ? 'peddler-card-fading-out' : ''}`}
        style={{ backgroundImage: `url(./peddler/cards/back_${backIndex}.png)` }}
        onClick={onClick}
        disabled={disabled}
        aria-label="Pick this card"
      />
    );
  }

  return (
    <button
      type="button"
      className="peddler-card peddler-card-revealed peddler-card-picked"
      onClick={onOpenDetails}
      title={outcome?.flavorText}
    >
      {outcome && <PeddlerOutcomeIcon outcome={outcome} size={48} />}
      <div className="peddler-card-name">{outcome ? outcomeDisplayName(outcome) : ''}</div>
    </button>
  );
}

/** The "new card laid over the top" detail view for the picked card --
 *  an absolutely-positioned layer inside .peddler-modal (which is
 *  already `position: relative` via .modal) rather than a growing inline
 *  block, so opening it never resizes or reflows the modal around it. */
function PeddlerCardDetailOverlay({ outcome, onClose }: { outcome: PeddlerCardDef; onClose: () => void }) {
  return (
    <div className="peddler-card-detail-overlay" onClick={onClose}>
      <div className="peddler-card-detail-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="peddler-card-detail-close" onClick={onClose} aria-label="Close">×</button>
        <PeddlerOutcomeIcon outcome={outcome} size={64} />
        <div className="peddler-card-name">{outcomeDisplayName(outcome)}</div>
        <div className="tiny" style={{ color: tierColorFor(outcome.tier), fontWeight: 'bold' }}>
          {TIER_LABEL[outcome.tier]}
        </div>
        <p className="tiny muted" style={{ fontStyle: 'italic' }}>{outcome.flavorText}</p>
      </div>
    </div>
  );
}

export function PeddlerCardModal({ highRoller = false, onClose }: { highRoller?: boolean; onClose: () => void }) {
  const engine = useEngine();
  const [showCards, setShowCards] = useState(false);
  const [localBacks] = useState<[number, number, number]>(() => [
    Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3),
  ]);
  const [browsingLine] = useState(() => {
    const pool = highRoller ? HIGH_ROLLER_LINES : BROWSING_LINES;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const [detailOpen, setDetailOpen] = useState(false);
  // 'idle' until a result comes in, then 'fading' while the two unpicked
  // cards animate away, then 'settled' once only the picked card (and the
  // result summary) remain. Local UI sequencing, independent of the
  // engine's own (instant) result resolution -- see the effect below.
  const [revealStage, setRevealStage] = useState<'idle' | 'fading' | 'settled'>('idle');
  // Grimsby's header sprite used to loop 'wave'/'approval' indefinitely --
  // both are one-shot gestures (a wave hello, a nod of approval), not
  // idle loops, so they should play once and settle back to 'idle'
  // rather than repeating for as long as the modal happens to stay open.
  // Two separate flags (not one) since a player can watch the wave
  // finish, then still see the approval gesture play out fresh once a
  // result comes in -- collapsing to a single "seenGesture" boolean would
  // wrongly skip the second one.
  const [waveDone, setWaveDone] = useState(false);
  const [approvalDone, setApprovalDone] = useState(false);
  // The picked card's own reward -- gold/material/equipment/egg -- flies
  // off toward the header gold display or the Equipment ("Inventory")
  // nav tab once the reveal settles, same fly-to-counter shape Harvest/
  // Scrap/quest rewards already use (see flyTarget.ts). Computed once
  // (guarded by the `!burstParticles` check below) rather than on every
  // render, since measuring/generating it twice would just restart the
  // same flight from scratch.
  const burstOriginRef = useRef<HTMLDivElement>(null);
  const [burstParticles, setBurstParticles] = useState<{
    x: number; y: number; dx: number; dy: number; color: string; icon?: string; delay: number;
  }[] | null>(null);

  const result = engine.lastGrimsbyResult;

  useEffect(() => {
    if (result && revealStage === 'idle') {
      setRevealStage('fading');
      const t = window.setTimeout(() => setRevealStage('settled'), UNPICKED_FADE_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [result, revealStage]);

  useEffect(() => {
    if (revealStage !== 'settled' || !result || burstParticles || !burstOriginRef.current) return;
    const outcome = result.cards[result.pickedIndex].outcome;
    const targetKey = burstTargetFor(outcome.kind);
    if (!targetKey) return; // nothing/joke -- nothing to fly, on purpose
    const offset = measureFlyOffset(burstOriginRef.current, targetKey);
    if (!offset) return; // target not currently mounted -- skip gracefully, same as every other flight in this game
    const rect = burstOriginRef.current.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const color = burstColorFor(outcome);
    const count = BURST_PARTICLE_COUNT[outcome.tier];
    setBurstParticles(Array.from({ length: count }, (_, i) => ({
      ...origin, dx: offset.dx, dy: offset.dy, color, icon: outcome.icon, delay: i * 90,
    })));
  }, [revealStage, result, burstParticles]);

  const handlePick = (index: number) => {
    setShowCards(true); // already true by the time this is reachable, kept for clarity
    engine.pickPeddlerCard(index as 0 | 1 | 2, highRoller);
  };

  const handleClose = () => {
    if (result) engine.dismissGrimsbyResult();
    onClose();
  };

  const pickedCard = result?.cards[result.pickedIndex];
  const headerAnimation = result
    ? (approvalDone ? 'idle' : 'approval')
    : (waveDone ? 'idle' : 'wave');

  return (
    <div className="overlay" onClick={handleClose}>
      <div
        className="modal peddler-modal"
        style={{ backgroundImage: 'url(./lore/peddler-table.png)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="peddler-modal-header">
          <GrimsbySprite
            animation={headerAnimation}
            height={160}
            once={headerAnimation !== 'idle'}
            onComplete={() => {
              if (headerAnimation === 'wave') setWaveDone(true);
              else if (headerAnimation === 'approval') setApprovalDone(true);
            }}
          />
          {highRoller && <div className="high-roller-badge">HIGH ROLLER</div>}
        </div>

        {/* Everything that varies by state lives in this one flex-centered
            body now (see .peddler-modal-body in app.css) -- previously the
            button/card row was a direct child of .peddler-modal alongside
            a tall header and a thin footer, and plain space-between across
            those three very unevenly-sized siblings is what was reading
            as "cards pushed low, clipped at the top." Grimsby's corner-
            comment also moved down here, after the cards/button, per
            playtest feedback -- it used to sit in the header, above them. */}
        <div className="peddler-modal-body">
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

          {!result && <p className="peddler-corner-comment tiny">{browsingLine}</p>}

          {result && (
            <>
              <div className="peddler-card-row" ref={burstOriginRef}>
                {result.cards.map((c, i) => {
                  const isPicked = i === result.pickedIndex;
                  if (!isPicked && revealStage === 'settled') return null;
                  // Unpicked cards never flip -- they just fade away face-
                  // down, so their outcome is never shown at all (see the
                  // reasoning in app.css next to .peddler-card-fading-out).
                  if (!isPicked) {
                    return (
                      <PeddlerCard
                        key={i}
                        faceUp={false}
                        backIndex={c.backIndex}
                        disabled
                        fadingOut={revealStage === 'fading'}
                      />
                    );
                  }
                  return (
                    <PeddlerCard
                      key={i}
                      faceUp
                      backIndex={c.backIndex}
                      outcome={c.outcome}
                      onOpenDetails={() => setDetailOpen(true)}
                    />
                  );
                })}
              </div>
              {revealStage === 'settled' && (
                <div className="peddler-result-summary">
                  <p><b>You got:</b> {result.rewardSummary}</p>
                </div>
              )}
              {burstParticles && burstParticles.map((p, i) => (
                <RewardGlowParticle
                  key={i}
                  x={p.x} y={p.y} dx={p.dx} dy={p.dy}
                  color={p.color} icon={p.icon} delay={p.delay}
                  durationMs={700}
                />
              ))}
              {detailOpen && pickedCard && (
                <PeddlerCardDetailOverlay outcome={pickedCard.outcome} onClose={() => setDetailOpen(false)} />
              )}
            </>
          )}
        </div>

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={handleClose}>{result ? 'Thanks, I think' : 'Never mind'}</button>
        </div>
      </div>
    </div>
  );
}
