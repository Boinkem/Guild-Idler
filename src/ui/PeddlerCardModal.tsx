import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { backgroundSrc } from '../game/settings';
import { PeddlerCardDef, PeddlerCardTier } from '../game/types';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { CURIO_BY_ID } from '../game/data/curios';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { RARITY_COLOR, formatGold } from '../game/util';
import { GrimsbySprite } from './sprites/GrimsbySprite';
import { ItemIcon, MaterialIcon, ConsumableIcon, CurioIcon } from './icons';
import { EggIcon } from './EggIcon';
import { measureFlyOffset } from './flyTarget';
import { RewardGlowParticle } from './RewardGlowParticle';
import { GrimsbyBustCard } from './GrimsbyBustCard';
import { vendorRepPercent } from '../game/data/vendorRep';
import { fxMs, fxSpeed } from './purchaseFx';

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

/* The two unpicked cards now fade during the picked card's 'tell' (see
   TELL_MS below) instead of gating the summary on their own 960ms timer
   -- .peddler-card-fading-out in app.css runs 700ms (scaled by animation
   speed) to land inside the shortest tell. */

/** How many little glow particles fly off for a given outcome -- keyed
 *  to the outcome's own tier rather than a raw gold/material amount,
 *  since those two aren't on a comparable scale to begin with (a flat
 *  gold amount vs. a refund percentage vs. a material count) but tier
 *  is already a normalized 1-5 "how big a deal is this" signal every
 *  outcome already carries. Reads as "more flourish for a better pull,"
 *  which is what "more depending on the amount" is really getting at. */
/**
 * Patch 0421 -- every tier gets its own reveal (mocked up and signed off
 * on the Design canvas first). The engine resolves the pick instantly;
 * these only pace what the player sees:
 *   'tell'  -- picked card lifts, still face-down, while the other two
 *              fade. A Good find gets one blue glint across the back; a
 *              Jackpot trembles, leaks gold light and dims the table for
 *              noticeably longer. Bust/Refund/Modest give nothing away.
 *   'flip'  -- the card turns over (FLIP_MS).
 *   'settled' -- the tier's own moment plays (CSS, .fx-t-<tier>) and the
 *              existing reward flight / result summary / BUST card show.
 * Times are at 1x and scale with Settings > Animation speed; Reduce
 * motion skips straight to 'settled'.
 */
const TELL_MS: Record<PeddlerCardTier, number> = {
  bust: 700, refund: 700, modest: 700, good: 950, jackpot: 1600,
};
const FLIP_MS = 450;

/** How many little glow particles fly off for a given outcome -- keyed
 *  to tier, not raw amount (see the original note this replaced in
 *  guild-idler-status.md). Refund went 1 -> 3 in patch 0421 so its slow
 *  trickle reads as a trickle. Doubled for High Roller. */
const BURST_PARTICLE_COUNT: Record<PeddlerCardTier, number> = {
  bust: 1, refund: 3, modest: 2, good: 3, jackpot: 5,
};
/** Gap between reward particles -- a refund's coins trickle back slowly,
 *  almost reluctantly, where every other tier's go together. */
const BURST_SPACING_MS: Record<PeddlerCardTier, number> = {
  bust: 90, refund: 260, modest: 90, good: 90, jackpot: 70,
};
/** Tiers Grimsby nods along to; he just shrugs (idle) at a bust or refund. */
const CHEER_TIERS: PeddlerCardTier[] = ['modest', 'good', 'jackpot'];

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
    case 'curio':
      return 'inventory';
    default:
      return null;
  }
}

/** Glow color per outcome -- rarity for the two kinds that actually
 *  have one (equipment/egg both carry a real Rarity), brass for gold
 *  (matching every other gold flourish in the game), a neutral moss
 *  tone for material/scrap/curio (no rarity concept to hang a color
 *  on -- curio falls through to the same default as material/scrap
 *  below, not called out as its own case). */
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
    case 'curio': return outcome.curioId ? (CURIO_BY_ID[outcome.curioId]?.name ?? 'A Curio') : 'A Curio';
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
    case 'curio': {
      const def = outcome.curioId ? CURIO_BY_ID[outcome.curioId] : undefined;
      return <CurioIcon icon={def?.icon} glyph={def?.glyph ?? outcome.glyph ?? '\u2753'} size={size} />;
    }
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
 *  whole thing "zooming." (`spotlight` below grows it a different way --
 *  see that prop's own note.) */
function PeddlerCard({
  faceUp, backIndex, outcome, onClick, onOpenDetails, disabled, fadingOut, resultBackIndex, spotlight,
}: {
  faceUp: boolean;
  backIndex: number;
  outcome?: PeddlerCardDef;
  onClick?: () => void;
  onOpenDetails?: () => void;
  disabled?: boolean;
  fadingOut?: boolean;
  /** Revealed cards only -- which of the 3 result_N.png backdrops this
   *  card uses. Picked once per result by the parent (see
   *  PeddlerCardModal's own `resultBackIndex` state below), not re-rolled
   *  per render, the same "pick once, hold it" shape `localBacks` already
   *  uses for the face-down cards' own back_N.png. */
  resultBackIndex?: number;
  /** True only once revealStage is 'settled' -- i.e. only once this is
   *  the sole card left in the row, the two unpicked ones already faded
   *  out and removed. Growing the card THEN (not throughout, and not via
   *  an inline "expand in place" the moment it's picked) is what keeps
   *  this safe against the exact "whole modal reads as zooming" issue
   *  the doc comment above warns about -- .peddler-modal's own height is
   *  fixed regardless (see app.css), and growing a card that's already
   *  the only flex item in its row doesn't reflow or resize anything
   *  else around it. */
  spotlight?: boolean;
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
      className={`peddler-card peddler-card-revealed peddler-card-picked ${spotlight ? 'peddler-card-spotlight' : ''}`}
      onClick={onOpenDetails}
      title={outcome?.flavorText}
      // One of 3 fixed result_N.png backdrops (see resultBackIndex's own
      // comment above) -- plain backgroundImage now, not the CSS-custom-
      // property indirection an earlier version of this used. That
      // indirection existed to let a single DevTool-configured image
      // stay optional/unset-able; these 3 files always exist and are
      // never individually unset, so there's nothing left for a fallback
      // var to do.
      style={{ backgroundImage: `url(./peddler/cards/result_${resultBackIndex ?? 0}.png)` }}
    >
      {/* The wrapping div (not the shared icon components themselves,
          which render elsewhere against very different backgrounds) is
          what gets the drop-shadow -- see .peddler-card-name's own
          comment in app.css for why one's needed at all now. */}
      {outcome && (
        <div className="peddler-card-icon-shadow">
          <PeddlerOutcomeIcon outcome={outcome} size={48} />
        </div>
      )}
      <div className="peddler-card-name">{outcome ? outcomeDisplayName(outcome) : ''}</div>
    </button>
  );
}

/**
 * Patch 0421 -- the picked card as a real two-sided card: face-down back
 * through the 'tell', turning over during 'flip', then carrying the
 * tier's own moment (rays, ring, burst, the bust sag) once settled. The
 * face-up side is the existing PeddlerCard, unchanged, passed as children.
 */
function PeddlerFlipCard({
  backIndex, tier, stage, children,
}: {
  backIndex: number; tier: PeddlerCardTier; stage: 'idle' | 'tell' | 'flip' | 'settled'; children: ReactNode;
}) {
  const flipped = stage === 'flip' || stage === 'settled';
  const moment = stage === 'settled';
  const burstCount = tier === 'jackpot' ? 24 : tier === 'good' ? 14 : tier === 'modest' ? 8 : 0;
  return (
    <div className={`peddler-flip ${stage === 'tell' ? `fx-tell-${tier}` : ''} ${moment ? `fx-moment fx-t-${tier}` : ''}`}>
      <span className="peddler-fx-rays" aria-hidden="true" />
      <span className="peddler-fx-ring" aria-hidden="true" />
      <div className={`peddler-flip-inner ${flipped ? 'flipped' : ''}`}>
        <div className="peddler-flip-front">{children}</div>
        <div className="peddler-flip-back" style={{ backgroundImage: `url(./peddler/cards/back_${backIndex}.png)` }} aria-hidden="true" />
      </div>
      {moment && burstCount > 0 && (
        <span className="peddler-fx-burst" aria-hidden="true">
          {Array.from({ length: burstCount }, (_, i) => (
            <span key={i} style={{ transform: `rotate(${Math.round((i * 360) / burstCount)}deg)` }}>
              <i className={`d${(i % 3) + 1}`} style={{ animationDelay: `${(i % 4) * 30}ms` }} />
            </span>
          ))}
        </span>
      )}
      {moment && tier === 'bust' && (
        <span className="peddler-fx-dust" aria-hidden="true"><i /><i /><i /><i /></span>
      )}
    </div>
  );
}

/** The tier's name over the result line -- JACKPOT slams in letter by
 *  letter, Good Find gets a shine pass, the rest just rise in. */
function PeddlerTierLabel({ tier }: { tier: PeddlerCardTier }) {
  if (tier === 'jackpot') {
    return (
      <div className="peddler-tier-label fx-t-jackpot" aria-label="Jackpot">
        {'JACKPOT'.split('').map((ch, i) => (
          <span key={i} style={{ animationDelay: `${fxMs(i * 90)}ms` }} aria-hidden="true">{ch}</span>
        ))}
      </div>
    );
  }
  return <div className={`peddler-tier-label fx-t-${tier}`} style={{ color: tierColorFor(tier) }}>{TIER_LABEL[tier]}</div>;
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

export function PeddlerCardModal({
  highRoller = false, stake = 1, onClose,
}: { highRoller?: boolean; stake?: number; onClose: () => void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const [showCards, setShowCards] = useState(false);
  // Re-rolled on every "Lay out the cards" AND on Roll Again (see
  // rollNewRound below) -- a fresh round should show fresh card backs,
  // not the same 3 the previous round happened to land on.
  const [localBacks, setLocalBacks] = useState<[number, number, number]>(() => [
    Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3),
  ]);
  // Which of the 3 result_N.png backdrops the revealed/picked card uses
  // -- rolled once per round (see rollNewRound), same "pick once, hold it
  // for the whole round" shape localBacks (above) already uses for the
  // face-down cards, even though this one won't actually render until a
  // result exists. Purely cosmetic/decorative, same reasoning as
  // localBacks -- not read or cared about by the engine at all.
  const [resultBackIndex, setResultBackIndex] = useState(() => Math.floor(Math.random() * 3));
  const [browsingLine] = useState(() => {
    const pool = highRoller ? HIGH_ROLLER_LINES : BROWSING_LINES;
    return pool[Math.floor(Math.random() * pool.length)];
  });
  const [detailOpen, setDetailOpen] = useState(false);
  // 'idle' until a result comes in, then 'fading' while the two unpicked
  // cards animate away, then 'settled' once only the picked card (and the
  // result summary) remain. Local UI sequencing, independent of the
  // engine's own (instant) result resolution -- see the effect below.
  const [revealStage, setRevealStage] = useState<'idle' | 'tell' | 'flip' | 'settled'>('idle');
  const revealTimers = useRef<number[]>([]);
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

  // Timers live in a ref rather than this effect's own cleanup: the
  // effect re-runs the moment it moves the stage to 'tell', and a cleanup
  // here would cancel the very timers it just scheduled.
  useEffect(() => {
    if (!result || revealStage !== 'idle') return;
    const tier = result.cards[result.pickedIndex].outcome.tier;
    if (fxSpeed() <= 0) { setRevealStage('settled'); return; }
    setRevealStage('tell');
    revealTimers.current.push(
      window.setTimeout(() => setRevealStage('flip'), fxMs(TELL_MS[tier])),
      window.setTimeout(() => setRevealStage('settled'), fxMs(TELL_MS[tier] + FLIP_MS)),
    );
  }, [result, revealStage]);
  useEffect(() => () => { revealTimers.current.forEach((t) => window.clearTimeout(t)); }, []);

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
    const count = BURST_PARTICLE_COUNT[outcome.tier] * (highRoller ? 2 : 1);
    const spacing = BURST_SPACING_MS[outcome.tier];
    setBurstParticles(Array.from({ length: count }, (_, i) => ({
      // A beat after the moment starts, so the reward leaves the card once
      // the tier has had its say rather than on top of it.
      ...origin, dx: offset.dx, dy: offset.dy, color, icon: outcome.icon, delay: 350 + i * spacing,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealStage, result, burstParticles]);

  const handlePick = (index: number) => {
    setShowCards(true); // already true by the time this is reachable, kept for clarity
    engine.pickPeddlerCard(index as 0 | 1 | 2, highRoller, stake);
  };

  const handleClose = () => {
    if (result) engine.dismissGrimsbyResult();
    onClose();
  };

  /**
   * "Roll Again" -- clears the settled result and resets every piece of
   * local reveal state back to "cards laid out, not yet picked" (fresh
   * card backs, fresh result backdrop, the wave/approval gestures free to
   * play again, no leftover burst particles), landing the player straight
   * back on the face-down card row rather than re-showing the "Lay out
   * the cards" button they've already gotten past once this session.
   * Doesn't charge anything itself -- picking a card is what pays the fee,
   * exactly like the very first round; this only shortcuts back to that
   * step instead of making the player close and reopen the whole modal.
   */
  const handleRollAgain = () => {
    revealTimers.current.forEach((t) => window.clearTimeout(t));
    revealTimers.current = [];
    engine.dismissGrimsbyResult();
    setLocalBacks([Math.floor(Math.random() * 3), Math.floor(Math.random() * 3), Math.floor(Math.random() * 3)]);
    setResultBackIndex(Math.floor(Math.random() * 3));
    setRevealStage('idle');
    setDetailOpen(false);
    setWaveDone(false);
    setApprovalDone(false);
    setBurstParticles(null);
  };

  const pickedCard = result?.cards[result.pickedIndex];
  const pickedTier = pickedCard?.outcome.tier;
  const settled = revealStage === 'settled';
  // Approval only once the card is face-up, and only for a result worth
  // nodding at -- a bust or refund gets his plain idle shrug instead.
  const cheering = !!pickedTier && settled && CHEER_TIERS.includes(pickedTier);
  const headerAnimation = result
    ? (cheering && !approvalDone ? 'approval' : 'idle')
    : (waveDone ? 'idle' : 'wave');
  // Jackpot's coin rain and confetti -- rolled once per result.
  const jackpotRain = useMemo(() => {
    if (pickedTier !== 'jackpot') return null;
    const coins = highRoller ? 56 : 28;
    const colors = ['var(--brass)', 'var(--moss)', 'var(--sky)', 'var(--pink)', 'var(--parchment)'];
    return {
      coins: Array.from({ length: coins }, () => ({
        left: Math.random() * 96, delay: Math.random() * 1400, dur: 1100 + Math.random() * 700,
      })),
      confetti: Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 98, delay: 200 + Math.random() * 1600, dur: 1600 + Math.random() * 1200, color: colors[i % colors.length],
      })),
    };
  }, [result, pickedTier, highRoller]);
  const modalFx = pickedTier === 'jackpot'
    ? (revealStage === 'tell' ? 'fx-jackpot-tell' : settled ? 'fx-jackpot-moment' : '')
    : '';

  // Same fee resolveFlip itself will actually charge on the next pick --
  // see PeddlerManager.feeWithStake's own comment for why this reads from
  // there rather than re-deriving it. Roll Again is only ever offered
  // once Grimsby has already sold this player a round, so `isPresent`
  // failing here means his leave-window timer expired while the modal was
  // open, not that anything about the purchase itself is wrong.
  const rollAgainFee = PeddlerManager.feeWithStake(engine.state, highRoller, stake);
  const canAffordRollAgain = PeddlerManager.isPresent(engine.state) && engine.state.gold >= rollAgainFee;

  return (
    <div className="overlay" onClick={handleClose}>
      <div
        className={`modal peddler-modal ${modalFx}`}
        style={{ backgroundImage: `url(${backgroundSrc('./lore/peddler-table.png', settings.backgroundMood)})` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="peddler-modal-topbar">
          <span>{highRoller ? 'High Roller' : 'Pick Your Card'}</span>
          <span className="peddler-modal-topbar-gold">{'\u25c6'} {formatGold(engine.state.gold)} on hand</span>
        </div>
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
                  if (!isPicked && (revealStage === 'flip' || revealStage === 'settled')) return null;
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
                        fadingOut={revealStage === 'tell'}
                      />
                    );
                  }
                  return (
                    <PeddlerFlipCard key={i} backIndex={c.backIndex} tier={c.outcome.tier} stage={revealStage}>
                      <PeddlerCard
                        faceUp
                        backIndex={c.backIndex}
                        outcome={c.outcome}
                        resultBackIndex={resultBackIndex}
                        spotlight={settled}
                        onOpenDetails={() => setDetailOpen(true)}
                      />
                    </PeddlerFlipCard>
                  );
                })}
              </div>
              {settled && (
                pickedCard?.outcome.tier === 'bust' ? (
                  <GrimsbyBustCard
                    subtitle="Nothing this time. Try again?"
                    onGoAgain={handleRollAgain}
                    goAgainDisabled={!canAffordRollAgain}
                    goAgainTitle={canAffordRollAgain ? undefined : (PeddlerManager.isPresent(engine.state) ? 'Not enough gold' : 'Grimsby’s already gone for now')}
                  />
                ) : (
                  <div className="peddler-result-summary">
                    {pickedTier && <PeddlerTierLabel tier={pickedTier} />}
                    <p><b>You got:</b> {result.rewardSummary}</p>
                  </div>
                )
              )}
              {burstParticles && burstParticles.map((p, i) => (
                <RewardGlowParticle
                  key={i}
                  x={p.x} y={p.y} dx={p.dx} dy={p.dy}
                  color={p.color} icon={p.icon} delay={p.delay}
                  durationMs={700}
                />
              ))}
              {settled && jackpotRain && (
                <div className="peddler-rain" aria-hidden="true">
                  {jackpotRain.coins.map((c, i) => (
                    <span key={`c${i}`} className="peddler-rain-coin" style={{ left: `${c.left}%`, animationDelay: `${fxMs(c.delay)}ms`, animationDuration: `${fxMs(c.dur)}ms` }} />
                  ))}
                  {jackpotRain.confetti.map((c, i) => (
                    <span key={`f${i}`} className="peddler-rain-confetti" style={{ left: `${c.left}%`, background: c.color, animationDelay: `${fxMs(c.delay)}ms`, animationDuration: `${fxMs(c.dur)}ms` }} />
                  ))}
                </div>
              )}
              {detailOpen && pickedCard && (
                <PeddlerCardDetailOverlay outcome={pickedCard.outcome} onClose={() => setDetailOpen(false)} />
              )}
            </>
          )}
        </div>

        {/* Patch 0297: the manual paddingTop/borderTop this used to carry
            inline are now baked into .peddler-facts-grid itself (full
            card background, not just a top rule) -- see that class's own
            comment in app.css. */}
        <dl className="peddler-facts-grid" style={{ marginBottom: 8 }}>
          <dt>Fee at 1x</dt>
          <dd style={{ color: 'var(--brass)' }}>{formatGold(PeddlerManager.feeCost(engine.state))} gold</dd>
          <dt>Outcome tiers</dt>
          <dd>
            Nothing {'\u00b7'} Partial Refund {'\u00b7'} Modest Find {'\u00b7'} Good Find {'\u00b7'} <span style={{ color: 'var(--brass)' }}>JACKPOT</span>
          </dd>
          <dt>Loyalty rebate</dt>
          <dd>{vendorRepPercent(engine.state.stats.peddlerGoldSpent)}%</dd>
        </dl>

        <div className="row end" style={{ marginTop: 0, gap: 8 }}>
          {revealStage === 'settled' && pickedCard?.outcome.tier !== 'bust' && (
            <button
              className="btn-purple"
              disabled={!canAffordRollAgain}
              onClick={handleRollAgain}
              title={canAffordRollAgain ? undefined : (PeddlerManager.isPresent(engine.state) ? 'Not enough gold' : 'Grimsby’s already gone for now')}
            >
              Roll Again -- {formatGold(rollAgainFee)} gold
            </button>
          )}
          <button onClick={handleClose}>{result ? 'Thanks, I think' : 'Never mind'}</button>
        </div>
      </div>
    </div>
  );
}
