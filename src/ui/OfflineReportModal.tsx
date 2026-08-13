import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { RaidDifficulty } from '../game/types';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { formatDuration, formatGold, RARITY_COLOR } from '../game/util';
import { useCountUp } from './useCountUp';

/** Same rarity-parallel palette RaidsPanel already uses for Normal/Heroic/
 *  Mythic -- kept local rather than shared, matching how RaidResultModal
 *  already duplicates its own small particle arrays rather than importing
 *  them from QuestResultModal. */
const RAID_DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic,
};

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
/** Same shape as QuestResultModal/RaidResultModal's own legendary star
 *  burst -- offline catch-up finding a legendary item deserves the same
 *  moment finding one while watching does, not less just because nobody
 *  was there to see it happen live. */
const LEGENDARY_PARTICLES = [
  { dx: -70, dy: -100, rot: -20, delay: 0 },
  { dx: -30, dy: -130, rot: -8, delay: 60 },
  { dx: 10, dy: -140, rot: 4, delay: 20 },
  { dx: 50, dy: -125, rot: 14, delay: 100 },
  { dx: 85, dy: -85, rot: 26, delay: 40 },
];

/**
 * Summarises everything that happened while the app was closed -- the
 * classic idle-game "welcome back" payoff moment, and previously the
 * flattest-reading screen in the game: a plain stat-row of numbers, no
 * particle burst, no rarity coloring on loot, no mention of levels
 * gained, and raid results resolved offline weren't shown at all even
 * though their gold/xp were already correctly folded into the totals
 * (see report.goldGained/xpGained in engine.ts) -- the totals were right,
 * the breakdown just silently dropped half of where they came from.
 *
 * Always mounted regardless of view mode (see App.tsx) so the auto-dismiss
 * effect below keeps running even while the idle companion is what's
 * showing -- but only actually renders its full-detail content when
 * `active` (i.e. the menu window, properly sized, is open). Showing this
 * full report cropped inside the tiny idle-companion window was the
 * original bug; IdleView now shows a compact banner instead and opens the
 * menu on click, which is what makes `active` true.
 */
export function OfflineReportModal({ active }: { active: boolean }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const report = engine.offlineReport;

  // If the player turned the summary off, still collect the rewards (the engine
  // already applied them) but skip the interruption.
  useEffect(() => {
    if (report && !settings.offlineReportOnLaunch) engine.dismissOfflineReport();
  }, [report, settings.offlineReportOnLaunch, engine]);

  // Called unconditionally (Rules of Hooks) even though the component can
  // return null right below -- falls back to 0 when there's no report yet
  // rather than being skipped, so this hook always runs the same number of
  // times across renders regardless of report's own presence.
  const displayGold = useCountUp(report?.goldGained ?? 0, { from: 0, durationMs: 900 });
  const displayXp = useCountUp(report?.xpGained ?? 0, { from: 0, durationMs: 900 });

  if (!active || !report || !settings.offlineReportOnLaunch) return null;

  const hasAnyResults = report.results.length > 0 || report.raidResults.length > 0;
  const levelsGained = report.results.reduce((sum, r) => sum + r.levelsGained, 0);
  const hasLegendary = report.results.some((r) => r.loot.some((l) => l.rarity === 'legendary'))
    || report.raidResults.some((r) => r.loot.some((l) => l.rarity === 'legendary'));

  return (
    <div className="overlay" onClick={() => engine.dismissOfflineReport()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>While you were away</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          The guild ran for {formatDuration(report.elapsedMs)} without you.
        </p>

        {!hasAnyResults ? (
          <p className="small">Nothing finished in that time. Everyone is still on the road or waiting for orders.</p>
        ) : (
          <>
            <div className="stat-row" style={{ marginBottom: 10 }}>
              <span className="gold-text">+{formatGold(displayGold)} gold</span>
              <span>+{displayXp} experience</span>
              {levelsGained > 0 && <span className="good">+{levelsGained} level{levelsGained === 1 ? '' : 's'}</span>}
              <span>
                {report.results.length > 0 && `${report.results.length} quest${report.results.length === 1 ? '' : 's'}`}
                {report.results.length > 0 && report.raidResults.length > 0 && ', '}
                {report.raidResults.length > 0 && `${report.raidResults.length} raid${report.raidResults.length === 1 ? '' : 's'}`}
                {' resolved'}
              </span>
            </div>
            {report.results.map((result) => (
              <div key={result.questId} className={`card ${result.difficulty}`}>
                <div className="spread">
                  <span className="card-title">{result.questName}</span>
                  <span className={`small ${result.success ? 'good' : 'bad'}`}>
                    {result.success ? 'Success' : 'Failed'}
                  </span>
                </div>
                <div className="stat-row" style={{ marginTop: 4 }}>
                  <span>{result.heroName}</span>
                  <span className="gold-text">+{formatGold(result.gold)}</span>
                  <span>+{result.xp} xp</span>
                  {result.loot.map((l) => (
                    <span
                      key={l.defId}
                      className={l.rarity === 'legendary' ? 'legendary-loot-name' : undefined}
                      style={{ color: RARITY_COLOR[l.rarity] }}
                    >
                      ◇ {l.name}
                    </span>
                  ))}
                  {result.injury && <span className="bad">{result.injury.name}</span>}
                </div>
              </div>
            ))}
            {report.raidResults.map((raid) => (
              <div
                key={`${raid.raidId}-${raid.resolvedAt}`}
                className="card"
                style={{ borderLeftColor: RAID_DIFFICULTY_COLOR[raid.difficulty] }}
              >
                <div className="spread">
                  <span className="card-title">
                    {raid.raidName} — {raid.difficulty[0].toUpperCase()}{raid.difficulty.slice(1)}
                  </span>
                  <span className={`small ${raid.fullClear ? 'good' : raid.encountersCleared > 0 ? '' : 'bad'}`}>
                    {raid.fullClear ? 'Full clear' : `${raid.encountersCleared}/${raid.totalEncounters}`}
                  </span>
                </div>
                <div className="stat-row" style={{ marginTop: 4 }}>
                  <span className="gold-text">+{formatGold(raid.gold)}</span>
                  <span>+{raid.xp} xp</span>
                  {raid.loot.map((l, i) => (
                    <span
                      key={`${l.defId}-${i}`}
                      className={l.rarity === 'legendary' ? 'legendary-loot-name' : undefined}
                      style={{ color: RARITY_COLOR[l.rarity] }}
                    >
                      ◇ {l.name}
                    </span>
                  ))}
                  {raid.injuries.map((inj) => (
                    <span key={inj.heroId} className="bad">{inj.heroName}: {inj.injury.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={() => engine.dismissOfflineReport()}>Back to work</button>
        </div>

        {/* Fires on arrival, same reasoning as ChainCompleteModal's own
            burst -- this modal has no exit animation to time a burst
            against, and the reward should be the first thing the player
            sees rather than something revealed only after dismissing.
            Only shows the kinds of particles actually earned, same
            convention QuestResultModal/RaidResultModal already use. */}
        {hasAnyResults && (
          <div className="collect-burst" aria-hidden="true">
            {report.goldGained > 0 && COIN_PARTICLES.map((p, i) => (
              <span
                key={`coin-${i}`}
                className="collect-particle coin"
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
              >
                ◆
              </span>
            ))}
            {report.xpGained > 0 && XP_PARTICLES.map((p, i) => (
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
      </div>
    </div>
  );
}
