import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GameEngine } from '../game/engine';
import { RaidResult } from '../game/types';
import { RAID_BY_ID, RAID_DIFFICULTY_LABEL, RAID_ENCOUNTER_BY_ID, raidDifficultyIconSrc } from '../game/data/raids';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { ItemIcon } from './icons';
import { raidBannerSrc } from './panels/RaidsPanel';
import { at, useDelayedCount } from './resultFx';
import { useEngine } from './useEngine';
import { playSound } from '../game/sound';
import { RarityPill } from './RarityPill';
import { formatGold, RARITY_COLOR } from '../game/util';
import { measureFlyOffset } from './flyTarget';
import { RECIPE_SCROLL_BY_ID } from '../game/data/recipeScrolls';
import { CRAFTING_RECIPE_BY_ID } from '../game/data/craftingRecipes';

const DISMISS_DELAY_MS = 640;
/** Same dismiss timing as QuestResultModal, for the same reason -- gives the
 *  longest particle time to finish fading rather than getting cut off. */

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
/** Same legendary star burst as QuestResultModal -- raids are the single
 *  biggest time commitment in the game, so a legendary drop here deserves
 *  at least the same celebration an ordinary quest's legendary drop
 *  already gets, not less. */
const LEGENDARY_PARTICLES = [
  { dx: -70, dy: -100, rot: -20, delay: 0 },
  { dx: -30, dy: -130, rot: -8, delay: 60 },
  { dx: 10, dy: -140, rot: 4, delay: 20 },
  { dx: 50, dy: -125, rot: 14, delay: 100 },
  { dx: 85, dy: -85, rot: 26, delay: 40 },
];

/**
 * Shown when a raid resolves. Always mounted regardless of view mode, only
 * renders while `active` (menu open, properly sized) -- same reasoning as
 * every other transient result modal this session; IdleView shows a
 * compact banner instead and opens the menu on click.
 *
 * Brought up to QuestResultModal's own standard as part of a wider pass --
 * raids are the single biggest time commitment in the game and had
 * meaningfully less payoff feedback than an ordinary quest, which read as
 * backwards. Same split (outer decide-to-show, inner keyed card) and same
 * particle burst, just keyed on raidId+resolvedAt instead of a questId --
 * raids can't overlap the way Auto-Chain quests can (only one at a time,
 * hours long), so the remount-safety this key provides is cheap insurance
 * rather than a fix for a real collision case here.
 */
export function RaidResultModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const result = engine.lastRaidResult;
  if (!active || !result) return null;

  return (
    <RaidResultCard key={`${result.raidId}-${result.resolvedAt}`} result={result} engine={engine} onViewLore={onViewLore} />
  );
}

const DIFF_COLOR: Record<RaidResult['difficulty'], string> = {
  normal: '#79a86b', heroic: '#a874d6', mythic: '#e07a2a', legendary: '#d9a441',
};
const CONFETTI_COLORS = ['#d9a441', '#79a86b', '#5b8fd6', '#a874d6', '#f2e6cf'];

/** Skull glyph for one encounter row; the cross is drawn on when it falls. */
function EncounterSkull() {
  return (
    <svg className="rfx-skull" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c-4.4 0-8 3.1-8 7.3 0 2.4 1.2 4.3 3 5.5V19h10v-3.2c1.8-1.2 3-3.1 3-5.5C20 6.1 16.4 3 12 3z" />
      <circle cx="9" cy="11" r="1.6" fill="currentColor" />
      <circle cx="15" cy="11" r="1.6" fill="currentColor" />
      <path className="rfx-x" d="M3 3 L21 21 M21 3 L3 21" strokeWidth="2.2" />
    </svg>
  );
}

/**
 * Patch 0422 -- the animated raid card. The card drops in on the raid's
 * banner and the difficulty crest slams onto the corner, then the
 * encounter ladder resolves in order: each win gets a slash, a green
 * flash, its skull crossed out and a DEFEATED stamp; the encounter that
 * stopped the party shakes, cracks and is stamped FELL BACK, and the rest
 * grey out. A full clear sweeps a RAID CLEARED banner across the art with
 * confetti, the chest opens and the loot flies out of it (a legendary gets
 * a light beam), and the title ribbon names who earned it. A partial run
 * or wipe skips the banner and slides the damage report in instead.
 */
function RaidResultCard({ result, engine, onViewLore }: { result: RaidResult; engine: GameEngine; onViewLore: () => void }) {
  const [dismissing, setDismissing] = useState(false);
  const rewardBurstRef = useRef<HTMLDivElement>(null);
  const [goldFlight, setGoldFlight] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const hasLegendary = result.loot.some((item) => item.rarity === 'legendary');

  const raid = RAID_BY_ID[result.raidId];
  const total = Math.max(1, result.totalEncounters);
  const cleared = Math.min(result.encountersCleared, total);
  const encounterNames = Array.from({ length: total }, (_, i) => {
    const id = raid?.encounterIds[i];
    return (id && RAID_ENCOUNTER_BY_ID[id]?.name) || `Encounter ${i + 1}`;
  });

  // ---- 1x timeline (ms) ----
  const encAt: number[] = [];
  let t = 950;
  for (let i = 0; i < total; i++) {
    if (i > cleared) break;
    encAt[i] = t;
    t += i < cleared ? 520 : 650;
  }
  const T_LOST = encAt[cleared] ?? t;
  const T_BANNER = result.fullClear ? t : -1;
  if (result.fullClear) t += 600;
  const T_SUM = t;
  const hasLoot = result.loot.length > 0;
  const T_CHEST = t + 300;
  const T_LOOT = t + 500;
  if (hasLoot) t += 500 + Math.min(result.loot.length, 6) * 220 + 300;
  const T_TITLE = t;
  if (result.titleGranted) t += 350;
  const T_PAY = t;
  t += 400;
  const T_DMG = t;
  const dmgCount = (result.heroesFallen?.length ?? 0) + (result.petsFallen?.length ?? 0) + result.injuries.length;
  if (dmgCount > 0 || result.eggsFound?.length || result.recipeScrollGained) t += 160 * Math.min(dmgCount, 4) + 240;
  const T_DONE = t + 300;

  const displayGold = useDelayedCount(result.gold, T_PAY, 800);
  // Gold-only flight (no XP flight, unlike QuestResultModal's own version)
  // -- a raid's reward XP goes to the whole party (result.heroIds), not
  // one specific hero, so there's no single obvious XP bar to aim at.
  const displayXp = useDelayedCount(result.xp, T_PAY, 800);
  const confetti = useMemo(
    () => (result.fullClear
      ? Array.from({ length: 40 }, (_, k) => ({
        x: (k * 41) % 98, c: CONFETTI_COLORS[k % 5],
        delay: T_BANNER + 200 + ((k * 97) % 1400), dur: 1600 + ((k * 131) % 1200),
      }))
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    playSound(hasLegendary ? 'legendary_drop' : 'collect');
    if (rewardBurstRef.current && result.gold > 0) {
      const originRect = rewardBurstRef.current.getBoundingClientRect();
      const offset = measureFlyOffset(rewardBurstRef.current, 'gold');
      if (offset) setGoldFlight({ x: originRect.left + originRect.width / 2, y: originRect.top, ...offset });
    }
    timeoutRef.current = window.setTimeout(() => engine.dismissRaidResult(), DISMISS_DELAY_MS);
  };

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore();
    handleDismiss();
  };

  const outcome = result.fullClear ? 'clear' : cleared > 0 ? 'partial' : 'wiped';
  let dmgIndex = 0;
  const dmgStyle = () => at(T_DMG + Math.min(dmgIndex++, 4) * 160);

  return (
    <div className="overlay rfx-overlay" onClick={handleDismiss}>
      {confetti.map((c, i) => (
        <span
          key={i}
          className="rfx-confetti"
          aria-hidden="true"
          style={at(c.delay, { left: `${c.x}%`, background: c.c, animationDuration: `calc(var(--fx-t) * ${c.dur})` })}
        />
      ))}
      <div
        className={`modal raid-result-modal rfx-card rfx-${outcome} ${result.fullClear ? 'raid-full-clear' : ''} ${dismissing ? 'dismissing' : ''}`}
        style={{ '--sum-at': `calc(var(--fx-t) * ${T_SUM})` } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rfx-banner" style={{ backgroundImage: `url(${raidBannerSrc(result.raidId, raid?.banner)})` }}>
          <div className="rfx-rname">
            {result.raidName}
            <span className="rfx-rdiff" style={{ color: DIFF_COLOR[result.difficulty] }}>{RAID_DIFFICULTY_LABEL[result.difficulty]}</span>
          </div>
          <img className="rfx-crest" src={raidDifficultyIconSrc(result.difficulty)} alt={RAID_DIFFICULTY_LABEL[result.difficulty]} style={at(350)} />
          {result.fullClear && <div className="rfx-cleared" style={at(T_BANNER)}>Raid Cleared</div>}
        </div>

        <div className="rfx-ladder">
          {encounterNames.map((name, i) => {
            const state = i < cleared ? 'won' : i === cleared ? 'lost' : 'skipped';
            const when = state === 'skipped' ? T_LOST : encAt[i];
            return (
              <div key={i} className={`rfx-enc ${state}`} style={at(when)}>
                <EncounterSkull />
                <span className="rfx-en">Encounter {i + 1}</span>
                <span className="rfx-bn">{name}</span>
                {state !== 'skipped' && <span className="rfx-stamp">{state === 'won' ? 'Defeated' : 'Fell back'}</span>}
                {state === 'won' && <span className="rfx-slash" />}
                {state === 'lost' && (
                  <svg className="rfx-crack" viewBox="0 0 560 40" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M380 0 L370 14 L388 22 L375 40" /><path d="M370 14 L350 20" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        <p className={`small rfx-summary ${result.fullClear ? 'good' : cleared > 0 ? '' : 'bad'}`} style={at(T_SUM)}>
          {result.fullClear
            ? 'Full clear.'
            : cleared > 0
              ? `Cleared ${cleared} of ${result.totalEncounters} encounters before the party had to fall back.`
              : 'The party was turned back at the first encounter.'}
        </p>

        {hasLoot && (
          <div className="rfx-lootrow">
            <span className="rfx-chest" style={at(T_CHEST)} aria-hidden="true">
              <span className="rfx-rays" />
              <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
                <path d="M8 30h48v26H8z" fill="oklch(30% 0.05 60)" /><path d="M8 40h48M28 36h8v8h-8z" />
                <g className="rfx-lid"><path d="M8 30c0-10 6-16 24-16s24 6 24 16z" fill="oklch(34% 0.06 60)" /></g>
              </svg>
            </span>
            <div className="rfx-loot">
              {result.loot.map((item, i) => {
                const def = EQUIPMENT_BY_ID[item.defId];
                const color = RARITY_COLOR[item.rarity];
                return (
                  <div
                    key={`${item.defId}-${i}`}
                    className={`rfx-drop ${item.rarity === 'legendary' ? 'legend' : ''}`}
                    style={at(T_LOOT + Math.min(i, 6) * 220, { borderColor: color })}
                  >
                    {def && <ItemIcon slot={def.slot} icon={def.icon} size={28} />}
                    <span className={`tiny ${item.rarity === 'legendary' ? 'legendary-loot-name' : ''}`} style={{ fontWeight: 700, color }}>
                      {item.name}
                    </span>
                    <RarityPill rarity={item.rarity} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {hasLegendary && <p className="legendary-drop-label" style={at(T_LOOT + 350)}>★ Legendary find!</p>}

        {result.titleGranted && (
          <div className="rfx-ribbon" style={at(T_TITLE)}>
            Title earned: <b>{result.titleGranted}</b>
            {result.titledHeroNames?.length ? ` · ${result.titledHeroNames.join(', ')}` : ''}
          </div>
        )}

        <div ref={rewardBurstRef} className="reward-burst rfx-cur" style={at(T_PAY)}>
          {result.xp > 0 && <span className="burst-xp" style={at(T_PAY)}>+{displayXp} XP</span>}
          {result.gold > 0 && <span className="burst-gold" style={at(T_PAY + 80)}>+{formatGold(displayGold)} gold</span>}
        </div>

        {/* Also-found extras -- same shape QuestResultModal's own
            "Also found" section already uses. */}
        {(result.eggsFound?.length || result.recipeScrollGained) && (
          <div className="rfx-late" style={at(T_DMG)}>
            <div className="section-heading">Also found</div>
            {result.eggsFound?.map((egg, i) => (
              <div key={i} className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 2 }}>
                <span className="small" style={{ color: RARITY_COLOR[egg.rarity] }}>A {egg.rarity} egg</span>
                <RarityPill rarity={egg.rarity} />
              </div>
            ))}
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
          </div>
        )}

        {dmgCount > 0 && (
          <>
            <div className="section-heading rfx-late" style={at(T_DMG)}>Damage report</div>
            {/* Fallen earns its own bolded line above the ordinary injury
                list, same as QuestResultModal. */}
            {result.heroesFallen?.map((h) => (
              <div key={`fallen-${h.heroId}`} className="small bad rfx-dmg" style={dmgStyle()}>
                <b>{h.heroName} has fallen. Revive them from the Heroes tab before sending them out again.</b>
              </div>
            ))}
            {result.petsFallen?.map((p, i) => (
              <div key={`pet-fallen-${i}`} className="small bad rfx-dmg" style={dmgStyle()}>
                <b>{p.petName} has fallen. Revive them from the Heroes tab.</b>
              </div>
            ))}
            {result.injuries.map((i) => (
              <div key={i.heroId} className="small bad rfx-dmg" style={dmgStyle()}>{i.heroName}: {i.injury.name}</div>
            ))}
          </>
        )}

        <div className="row end rfx-actions" style={at(T_DONE, { marginTop: 12, gap: 8 })}>
          <button className="btn-ghost" onClick={handleDismiss} disabled={dismissing}>Close</button>
          <button className="btn-primary" onClick={viewLore} disabled={dismissing}>View in Lore</button>
        </div>

        {dismissing && (
          <div className="collect-burst" aria-hidden="true">
            {/* Same particle burst as QuestResultModal, same reasoning --
                only shows the kinds of reward actually earned. */}
            {result.gold > 0 && COIN_PARTICLES.map((p, i) => (
              <span
                key={`coin-${i}`}
                className="collect-particle coin"
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

        {dismissing && goldFlight && (
          <span
            // Flies to the header's gold display, the real measured
            // distance -- same mechanism QuestResultModal's own gold
            // flight uses, see that component for the fuller
            // explanation. Silently renders nothing if the header
            // wasn't mounted to measure against (idle mode has no
            // header).
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
      </div>
    </div>
  );
}
