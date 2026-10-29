import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GameEngine } from '../game/engine';
import { QuestResult } from '../game/types';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { playSound } from '../game/sound';
import { formatGold, RARITY_COLOR } from '../game/util';
import { RarityPill } from './RarityPill';
import { ItemIcon } from './icons';
import { at, useDelayedCount, TickMark } from './resultFx';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { chainBannerSrc, chainIconSrc, questTagBannerSrc, questTagIconSrc } from './panels/QuestPanel';
import waxSealComplete from '../assets/wax-seal-complete.png';
import { measureFlyOffset } from './flyTarget';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { CURIO_BY_ID } from '../game/data/curios';
import { RECIPE_SCROLL_BY_ID } from '../game/data/recipeScrolls';
import { CRAFTING_RECIPE_BY_ID } from '../game/data/craftingRecipes';
import { shardLabel } from '../game/data/shards';

/** How long the pop-out + coin/XP burst plays before the modal actually
 * unmounts. Matches the CSS: modal-pop-out is 320ms, collect-fly is 750ms
 * (staggered up to ~120ms), so this gives the longest particle time to
 * finish fading rather than getting cut off mid-flight. */
const DISMISS_DELAY_MS = 640;

const COIN_PARTICLES = [
  { dx: -46, dy: -92, rot: -18, delay: 0 },
  { dx: -6, dy: -112, rot: 8, delay: 50 },
  { dx: 40, dy: -88, rot: 20, delay: 20 },
  { dx: 62, dy: -60, rot: 26, delay: 110 },
  { dx: -60, dy: -55, rot: -24, delay: 90 },
];
const XP_PARTICLES = [
  { dx: -22, dy: -104, rot: -10, delay: 30 },
  { dx: 24, dy: -100, rot: 12, delay: 70 },
  { dx: 2, dy: -118, rot: 2, delay: 130 },
];
/** Extra particles layered on top of COIN_PARTICLES/XP_PARTICLES for a
 * Critical Burst -- same fly-and-fade language, just a fuller burst so a
 * crit visibly reads as "more" rather than only the text turning gold. */
const CRIT_EXTRA_COIN_PARTICLES = [
  { dx: -80, dy: -30, rot: -30, delay: 60 },
  { dx: 80, dy: -30, rot: 30, delay: 100 },
  { dx: 0, dy: -50, rot: 0, delay: 20 },
];
/** A legendary item dropping gets its own star burst, same fly-and-fade
 * shape as the coin/XP particles but wider and slower (bigger moment,
 * bigger spread) -- fires once per result regardless of how many
 * legendary items actually dropped, since stacking multiple full bursts
 * would read as chaotic rather than special. */
const LEGENDARY_PARTICLES = [
  { dx: -70, dy: -100, rot: -20, delay: 0 },
  { dx: -30, dy: -130, rot: -8, delay: 60 },
  { dx: 10, dy: -140, rot: 4, delay: 20 },
  { dx: 50, dy: -125, rot: 14, delay: 100 },
  { dx: 85, dy: -85, rot: 26, delay: 40 },
];

/**
 * Shown when a quest resolves while the player is watching. Split into an
 * outer component that just decides whether to show anything, and an inner
 * card keyed by result.questId.
 *
 * The key matters: Auto-Chain can resolve a fresh quest (a new lastResult)
 * before the previous card's ~640ms dismiss animation finishes -- e.g. a
 * hero mid-streak finishing back to back. Without the key, React reuses the
 * same component instance across that swap, so its `dismissing` state (and
 * the pending dismiss timeout from the *previous* result) carried over onto
 * the new one: the card could get stuck faded to invisible mid-pop-out
 * while the still-fully-opaque .overlay behind it kept blocking every
 * click, with no visible dialog left to dismiss it. The key forces a full
 * unmount/remount per result instead, so a new result always starts clean,
 * and the effect below cancels any in-flight timeout from the one it
 * replaced rather than letting it fire against state it no longer owns.
 */
export function QuestResultModal({ onViewLore, onNeedsSpace }: { onViewLore?: () => void; onNeedsSpace?: () => Promise<void> | void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const result = engine.lastResult;

  useEffect(() => {
    if (result && !settings.questResultPopups) engine.dismissResult();
  }, [result, settings.questResultPopups, engine]);

  if (!result || !settings.questResultPopups) return null;

  return <QuestResultCard key={result.questId} result={result} engine={engine} onViewLore={onViewLore} onNeedsSpace={onNeedsSpace} />;
}

function QuestResultCard({ result, engine, onViewLore, onNeedsSpace }: {
  result: QuestResult; engine: GameEngine; onViewLore?: () => void; onNeedsSpace?: () => Promise<void> | void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const rewardBurstRef = useRef<HTMLDivElement>(null);
  const [goldFlight, setGoldFlight] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [xpFlight, setXpFlight] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const hasLegendary = result.loot.some((item) => item.rarity === 'legendary');
  // Gold/XP count-ups now live with the card timeline below (patch 0422),
  // so they start on the beat the reward row appears rather than at mount.

  // This card renders full detail regardless of whether the idle
  // companion window (260x340, see IDLE_SIZE in electron/main.ts) or the
  // full menu is what's showing -- unlike ChainCompleteModal/
  // RaidResultModal/HatchReadyModal, a quest result is frequent/routine
  // enough that it shouldn't be gated behind the full menu being open
  // already. But the companion window is small, and this card's content
  // (reward burst, loot list, chain/level-up text, dismiss button) can
  // easily run taller than it -- .modal's own `max-height: 100%;
  // overflow-y: auto;` then forced the player to scroll INSIDE the tiny
  // window just to reach the dismiss button, which was the reported bug.
  // Fixed the same way GuildNamingModal already requests more space:
  // `onNeedsSpace` resolves once Electron's own window resize has
  // actually finished, so the window grows to fit the card instead of the
  // card needing to shrink or scroll to fit the window. Once per result
  // (mount), not on every re-render.
  useEffect(() => {
    void onNeedsSpace?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.questId]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    playSound(result.critBonus || hasLegendary ? 'legendary_drop' : 'collect');
    // Measured right here, at the same moment the ordinary local coin/XP
    // burst below starts -- same "measure at the action that triggers the
    // burst" timing ScrapStation's own fly-to-counter already established.
    // Both gracefully resolve to null (no flight rendered) if their target
    // isn't currently mounted -- the header's gold display only exists in
    // full menu mode, and a hero's own XP bar only exists while the Heroes
    // tab happens to be open, neither of which this modal can assume.
    if (rewardBurstRef.current) {
      const originRect = rewardBurstRef.current.getBoundingClientRect();
      const origin = { x: originRect.left + originRect.width / 2, y: originRect.top };
      if (result.gold > 0) {
        const offset = measureFlyOffset(rewardBurstRef.current, 'gold');
        if (offset) setGoldFlight({ ...origin, ...offset });
      }
      if (result.xp > 0) {
        const offset = measureFlyOffset(rewardBurstRef.current, `heroXp:${result.heroId}`);
        if (offset) setXpFlight({ ...origin, ...offset });
      }
    }
    timeoutRef.current = window.setTimeout(() => engine.dismissResult(), DISMISS_DELAY_MS);
  };

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore?.();
    handleDismiss();
  };

  // ---- Patch 0422 card timeline (1x ms; see resultFx.tsx) ----
  // Card slides up, the tag icon pops onto the banner edge, the verdict
  // stamp lands, then (on an Auto-Chain streak) the pip track resolves,
  // then gold/XP count up, then level-up / loot / everything else.
  const streak = result.autoChainStreak;
  const T_STAMP = 450;
  let t = 900;
  let sealAt = 0;
  if (streak) {
    if (streak.outcome === 'complete') {
      sealAt = t + streak.target * 260 + 150;
      t = sealAt + 900;
    } else {
      t += 650;
    }
  }
  const T_PAY = t;
  const T_AFTER = T_PAY + 600;
  const T_LOOT = T_AFTER + (result.levelsGained > 0 ? 300 : 0);
  const T_DONE = T_LOOT + Math.min(result.loot.length, 4) * 120 + 350;
  const displayGold = useDelayedCount(result.gold, T_PAY);
  const displayXp = useDelayedCount(result.xp, T_PAY);
  const streakGold = useDelayedCount(streak?.totalGold ?? 0, sealAt + 500, 800);
  const streakXp = useDelayedCount(streak?.totalXp ?? 0, sealAt + 500, 800);

  const chain = result.chainAdvanced ? CHAIN_BY_ID[result.chainAdvanced.chainId] : undefined;
  const bannerSrc = chain
    ? chainBannerSrc(chain.id, chain.banner)
    : result.tag ? questTagBannerSrc(result.tag) : undefined;
  const iconSrc = chain
    ? chainIconSrc(chain.id, chain.icon, chain.banner)
    : result.tag ? questTagIconSrc(result.tag) : undefined;
  const coinCount = result.gold > 0 && result.success ? (result.critBonus ? 10 : 5) : 0;

  return (
    <div className="overlay" onClick={handleDismiss}>
      <div
        className={`modal qfx-card ${result.success ? 'qfx-win' : 'qfx-lose'} ${result.critBonus ? 'qfx-crit' : ''} ${dismissing ? 'dismissing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {result.critBonus && <span className="qfx-bolt" style={at(T_PAY)} aria-hidden="true" />}
        <div className="qfx-banner">
          <span className="qfx-art" style={bannerSrc ? { backgroundImage: `url(${bannerSrc})` } : undefined} aria-hidden="true" />
          {iconSrc && <span className="qfx-tagicon" style={at(250, { backgroundImage: `url(${iconSrc})` })} aria-hidden="true" />}
          <span className="qfx-stamp" style={at(T_STAMP)}>{result.success ? 'Fulfilled' : 'Failed'}</span>
        </div>

        <h3 className="qfx-who">{result.heroName} is back</h3>
        <p className="small muted" style={{ marginTop: 0 }}>{result.questName}</p>

        {streak && <StreakTrack streak={streak} heroName={result.heroName} sealAt={sealAt} gold={streakGold} xp={streakXp} />}

        <div ref={rewardBurstRef} className={`reward-burst qfx-rewards ${result.critBonus ? 'crit' : ''}`} style={at(T_PAY)}>
          {result.xp > 0 && <span className={`burst-xp ${result.critBonus ? 'crit' : ''}`} style={at(T_PAY)}>+{displayXp} XP</span>}
          {result.gold > 0 && <span className={`burst-gold ${result.critBonus ? 'crit' : ''}`} style={at(T_PAY + 80)}>+{formatGold(displayGold)} gold</span>}
          {Array.from({ length: coinCount }, (_, i) => (
            <span key={i} className="qfx-coin" style={at(T_PAY + i * 60, { left: `calc(50% + ${(i - (coinCount - 1) / 2) * 14}px)` })} aria-hidden="true" />
          ))}
        </div>
        {result.critBonus && <p className="crit-burst-label qfx-critlbl" style={at(T_PAY + 120)}>⚡ Critical Burst!</p>}
        {hasLegendary && <p className="legendary-drop-label" style={at(T_LOOT)}>★ Legendary find!</p>}
        {result.levelsGained > 0 && <p className="good burst-levelup qfx-lvl" style={at(T_AFTER)}>Level up ×{result.levelsGained}!</p>}
        {result.dailyBurstBonus && (
          <p className="good qfx-late" style={at(T_AFTER, { fontSize: '0.75rem' })}>
            ✨ First burst of the day -- reward boosted!
          </p>
        )}

        {result.loot.length > 0 && (
          <div className="qfx-late" style={at(T_LOOT)}>
            <div className="section-heading">Loot</div>
            <div className="qfx-loot">
              {result.loot.map((item, i) => {
                const def = EQUIPMENT_BY_ID[item.defId];
                return (
                  <div
                    key={`${item.defId}-${i}`}
                    className="qfx-drop"
                    style={at(T_LOOT + Math.min(i, 4) * 120, { borderColor: RARITY_COLOR[item.rarity] })}
                  >
                    {def && <ItemIcon slot={def.slot} icon={def.icon} size={26} />}
                    <span
                      className={item.rarity === 'legendary' ? 'legendary-loot-name' : undefined}
                      style={{ fontSize: 11, fontWeight: 700, color: RARITY_COLOR[item.rarity] }}
                    >
                      {item.name}
                    </span>
                    <RarityPill rarity={item.rarity} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="qfx-late" style={at(T_AFTER)}>
        {/* Gathering Bounty materials, an ordinary egg drop, and an
            ordinary curio drop -- all three were computed by QuestManager
            and sitting on `result` already, but none were actually read
            anywhere in this modal before now (confirmed: only `.loot`
            was ever displayed). Not a regression from adding curios --
            materialGained/eggDropped already had this gap; fixed here
            alongside curioGained rather than leaving two of three
            "purely informational for the result modal" fields silently
            broken right next to the one that's now wired up correctly. */}
        {(result.materialGained || result.scrapGained || result.shardsGained || result.eggDropped || result.curioGained || result.recipeScrollGained) && (
          <>
            <div className="section-heading">Also found</div>
            {result.shardsGained ? (
              <div className="small" style={{ marginBottom: 2, color: '#d9a441' }}>+{shardLabel(result.shardsGained)}</div>
            ) : null}
            {result.scrapGained ? (
              <div className="small" style={{ marginBottom: 2 }}>+{result.scrapGained} Scrap</div>
            ) : null}
            {result.materialGained && result.materialGained.amount > 0 && (
              <div className="small" style={{ marginBottom: 2 }}>
                +{result.materialGained.amount} {MATERIAL_BY_ID[result.materialGained.materialId]?.name ?? result.materialGained.materialId}
              </div>
            )}
            {result.eggDropped && (
              <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span className="small" style={{ color: RARITY_COLOR[result.eggDropped.rarity] }}>
                  A {result.eggDropped.rarity} egg
                </span>
                <RarityPill rarity={result.eggDropped.rarity} />
              </div>
            )}
            {result.curioGained && (
              <div className="small" style={{ marginBottom: 2 }}>
                {CURIO_BY_ID[result.curioGained.curioId]?.name ?? 'A curio'}
                {result.curioGained.amount > 1 ? ` ×${result.curioGained.amount}` : ''}
              </div>
            )}
            {result.recipeScrollGained && (() => {
              const scroll = RECIPE_SCROLL_BY_ID[result.recipeScrollGained.scrollId];
              const recipe = scroll ? CRAFTING_RECIPE_BY_ID[scroll.recipeId] : undefined;
              return (
                <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span className="small" style={{ color: scroll ? RARITY_COLOR[scroll.rarity] : undefined }}>
                    Recipe: {recipe?.name ?? 'a new recipe'}
                  </span>
                  {scroll && <RarityPill rarity={scroll.rarity} />}
                </div>
              );
            })()}
          </>
        )}

        {result.events.length > 0 && (
          <>
            <div className="section-heading">On the road</div>
            {result.events.map((event) => (
              <div key={event.id} style={{ marginBottom: 6 }}>
                <div className={`small ${event.kind === 'positive' ? 'good' : event.kind === 'negative' ? 'bad' : ''}`}>
                  {event.name}
                </div>
                <div className="tiny muted">{event.description}</div>
              </div>
            ))}
          </>
        )}

        {(result.injury || result.brokenItems.length > 0) && (
          <>
            <div className="section-heading">Damage report</div>
            {/* Fallen gets its own line, above the ordinary injury text and
                bolded -- an ordinary injury line reads as routine, but this
                hero can't be sent on another quest or raid until revived,
                which is worth calling out distinctly rather than leaving
                buried in the same line as any other scrape. */}
            {result.heroFallen && (
              <div className="small bad" style={{ fontWeight: 700 }}>
                {result.heroName} has fallen. Revive them from the Heroes tab before sending them out again.
              </div>
            )}
            {result.petFallen && (
              <div className="small bad" style={{ fontWeight: 700 }}>
                {result.petFallen.petName} has fallen. Revive them from the Heroes tab.
              </div>
            )}
            {result.injury && (
              <div className="small bad">{result.injury.name}. {result.injury.description}</div>
            )}
            {result.brokenItems.length > 0 && (
              <div className="small bad">Broken: {result.brokenItems.join(', ')}</div>
            )}
          </>
        )}

        {result.chainAdvanced && (
          <p className="small" style={{ color: 'var(--brass)' }}>
            {result.chainAdvanced.completed
              ? 'The expedition is complete. Rewards delivered to the guild.'
              : `Expedition progress: stage ${result.chainAdvanced.stage + 1} of ${result.chainAdvanced.totalStages}.`}
          </p>
        )}
        </div>

        {result.chainAdvanced?.completed && onViewLore && (
          <button className="btn-ghost" onClick={viewLore} style={{ marginBottom: 8 }}>
            View in Lore →
          </button>
        )}

        <div className="row end qfx-actions" style={at(T_DONE, { marginTop: 12 })}>
          <button className="btn-primary" onClick={handleDismiss} disabled={dismissing}>
            {result.success ? 'Good work' : 'Understood'}
          </button>
        </div>

        {/* Fires once, right as the card pops out -- gold coins and an XP
            sparkle flying up off the card and fading, matched to the
            'collect' sound cue. Only shows the kinds of reward actually
            earned, so a failed quest with nothing to show doesn't get a
            coin burst it didn't earn. */}
        {dismissing && (
          <div className="collect-burst" aria-hidden="true">
            {result.gold > 0 && COIN_PARTICLES.map((p, i) => (
              <span
                key={`coin-${i}`}
                className="collect-particle coin"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ◆
              </span>
            ))}
            {result.gold > 0 && result.critBonus && CRIT_EXTRA_COIN_PARTICLES.map((p, i) => (
              <span
                key={`crit-coin-${i}`}
                className="collect-particle coin crit"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ◆
              </span>
            ))}
            {result.xp > 0 && XP_PARTICLES.map((p, i) => (
              <span
                key={`xp-${i}`}
                className="collect-particle xp"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ✦
              </span>
            ))}
            {hasLegendary && LEGENDARY_PARTICLES.map((p, i) => (
              <span
                key={`legendary-${i}`}
                className="collect-particle legendary"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ★
              </span>
            ))}
          </div>
        )}

        {/* The actual "flies to where it belongs" particles -- separate
            from the local coin/XP burst above, which stays as in-place
            flavor at the reward-burst's own position. These travel the
            real measured distance (see handleDismiss) to the header's
            gold display and this hero's own XP bar, landing exactly on
            them and triggering their own arrival flash -- same mechanism
            ScrapStation's original fly-to-counter established, generalized
            via flyTarget.ts so it works across completely different,
            not-simultaneously-mounted panels. Silently render nothing if
            their target wasn't mounted to measure against (idle mode has
            no header; the Heroes tab might not be open) -- the local
            burst and the count-up on whatever numbers ARE visible already
            cover the reward being clearly communicated either way. */}
        {dismissing && goldFlight && (
          <span
            className="fly-particle"
            aria-hidden="true"
            style={{
              position: 'fixed', left: goldFlight.x, top: goldFlight.y,
              '--fly-dx': `${goldFlight.dx}px`, '--fly-dy': `${goldFlight.dy}px`,
              animationDuration: `${DISMISS_DELAY_MS}ms`, fontSize: '1.1rem', color: 'var(--brass)',
            } as CSSProperties}
          >
            ◆
          </span>
        )}
        {/* Patch 0302: XP's long-distance flight now matches the standard
            "small lettered green XP" language used everywhere else this
            patch touches (RaidResultModal, OfflineReportModal, and the
            Sell/Scrap flights' own silver -- see VendorsPanel.tsx) instead
            of a blue sparkle glyph, so XP reads as its own consistent
            signal (green, lettered) the same way gold (brass, ◆) and
            scrap (silver) each do. */}
        {dismissing && xpFlight && (
          <span
            className="fly-particle"
            aria-hidden="true"
            style={{
              position: 'fixed', left: xpFlight.x, top: xpFlight.y,
              '--fly-dx': `${xpFlight.dx}px`, '--fly-dy': `${xpFlight.dy}px`,
              animationDuration: `${DISMISS_DELAY_MS}ms`, fontSize: '0.7rem', fontWeight: 700, color: 'var(--moss)',
            } as CSSProperties}
          >
            XP
          </span>
        )}
      </div>
    </div>
  );
}

type Streak = NonNullable<QuestResult['autoChainStreak']>;

/**
 * Patch 0422 -- the Auto-Chain streak track: one pip per contract in the
 * streak, joined by a rail.
 *  - continues: earlier contracts already ticked, this one pops and
 *    ticks, the next one pulses while the hero sets off.
 *  - complete: every pip ticks in turn (same rhythm as a story chain's
 *    stage list), then a small wax seal and the streak's running totals.
 *  - stopped: this contract's pip shakes into a red cross and the rest
 *    of the streak goes dashed -- the run ends on a failure.
 */
function StreakTrack({ streak, heroName, sealAt, gold, xp }: { streak: Streak; heroName: string; sealAt: number; gold: number; xp: number }) {
  const n = Math.max(1, streak.target);
  const T0 = 900;
  // Index of the contract this card is about.
  const here = streak.outcome === 'continues' ? streak.finished - 1 : streak.outcome === 'stopped' ? streak.finished : n - 1;
  const span = Math.max(1, n - 1);
  const pct = (i: number) => `${(Math.max(0, Math.min(i, n - 1)) / span) * 100}%`;
  const trail = streak.outcome === 'complete'
    ? { from: '0%', to: '100%', delay: T0, dur: n * 260 }
    : streak.outcome === 'continues'
      ? { from: pct(here - 1), to: pct(here), delay: T0, dur: 300 }
      : { from: pct(here - 1), to: pct(here - 1), delay: T0, dur: 1 };
  const label = streak.outcome === 'stopped'
    ? `Stopped at ${streak.finished + 1} / ${n}`
    : `${Math.min(streak.outcome === 'complete' ? n : streak.finished, n)} / ${n}`;
  const noteAt = streak.outcome === 'complete' ? sealAt : T0 + 450;
  return (
    <div className={`qfx-streak qfx-streak-${streak.outcome}`}>
      <div className="qfx-slabel">Auto-Chain streak <b>{label}</b></div>
      <div className="qfx-track">
        <span className="qfx-trail">
          <span style={at(trail.delay, { '--from': trail.from, '--to': trail.to, animationDuration: `calc(var(--fx-t) * ${trail.dur})` } as CSSProperties)} />
        </span>
        {Array.from({ length: n }, (_, i) => {
          let cls = '';
          let delay = T0;
          if (streak.outcome === 'complete') { cls = 'now'; delay = T0 + i * 260; }
          else if (i < here) cls = 'done';
          else if (i === here) cls = streak.outcome === 'stopped' ? 'fail' : 'now';
          else if (streak.outcome === 'stopped') cls = 'dead';
          else if (i === here + 1) { cls = 'next'; delay = T0 + 450; }
          return (
            <span key={i} className={`qfx-pip ${cls}`} style={at(delay)}>
              <TickMark className="qfx-tk" />
              {cls === 'fail' && (
                <svg className="qfx-xx" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" /></svg>
              )}
              <span className="qfx-n">{i + 1}</span>
            </span>
          );
        })}
      </div>
      <div className="qfx-snote" style={at(noteAt)}>
        {streak.outcome === 'continues' && <>{heroName} sets off on the next contract<span className="qfx-dots" aria-hidden="true"><i /><i /><i /></span></>}
        {streak.outcome === 'stopped' && <>Run stops after a failed quest. {heroName} waits for new orders.</>}
        {streak.outcome === 'complete' && (
          <>
            Streak complete. {heroName} is waiting for new orders.
            <span className="qfx-sseal" aria-hidden="true"><img src={waxSealComplete} alt="" style={at(sealAt)} /></span>
          </>
        )}
      </div>
      {streak.outcome === 'complete' && (streak.totalGold || streak.totalXp) ? (
        <div className="qfx-total" style={at(sealAt + 300)}>
          Streak total: <b>+{formatGold(gold)} gold</b> · <i>+{xp} XP</i>
        </div>
      ) : null}
    </div>
  );
}
