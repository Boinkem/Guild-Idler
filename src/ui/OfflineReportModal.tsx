import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { GameEngine, OfflineReport } from '../game/engine';
import { QuestResult, RaidResult, Rarity } from '../game/types';
import { RAID_BY_ID, RAID_DIFFICULTY_LABEL } from '../game/data/raids';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { EQUIPMENT_BY_ID } from '../game/data/equipment';
import { HERO_CLASSES } from '../game/data/progression';
import { MATERIAL_BY_ID, NODE_ORDER } from '../game/data/materials';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { formatDuration, formatGold, formatMaterial, RARITY_COLOR } from '../game/util';
import { measureFlyOffset } from './flyTarget';
import { ItemIcon, MaterialIcon } from './icons';
import { heroPortraitSrc } from './panels/HeroesPanel';
import { raidBannerSrc } from './panels/RaidsPanel';
import { at, useDelayedCount } from './resultFx';
import waxSealComplete from '../assets/wax-seal-complete.png';

/** Patch 0302 -- same dismiss timing every other result modal in the game
 *  uses, so the gold-fly particle has time to finish its travel before the
 *  modal actually unmounts. */
const DISMISS_DELAY_MS = 640;
/** Pips shown per hero row before the rest fold into "+N more". */
const MAX_PIPS = 16;
/** Chips shown per row before the rest fold into "+N more". */
const MAX_CHIPS = 6;

const RAID_DIFFICULTY_COLOR = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic, legendary: RARITY_COLOR.legendary,
} as const;

/**
 * Summarises everything that happened while the app was closed -- the
 * classic idle-game "welcome back" payoff moment.
 *
 * Always mounted regardless of view mode (see App.tsx) so the auto-dismiss
 * effect below keeps running even while the idle companion is what's
 * showing -- but only actually renders its full-detail content when
 * `active` (i.e. the menu window, properly sized, is open). Showing this
 * full report cropped inside the tiny idle-companion window was the
 * original bug; IdleView now shows a compact banner instead and opens the
 * menu on click, which is what makes `active` true.
 *
 * Patch 0423 -- rebuilt as an animated ledger card to match the quest,
 * story and raid cards (see resultFx.tsx for the shared CSS-timeline
 * approach). An hourglass flips and drains while the time away counts up,
 * the totals pop in and count up, highlight badges stamp in for the big
 * moments (a chain finished, a legendary find, titles, levels, anyone who
 * fell), then the ledger writes itself in -- one row per hero rather than
 * one per quest. Each hero's quests become a strip of pips ticking green
 * or red in order, so a week of Auto-Chain reads as a run, not thirty
 * cards. Raids and the Overseer get rows of their own. Back to work flies
 * the gold to the header and folds the card shut.
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

  if (!active || !report || !settings.offlineReportOnLaunch) return null;
  return <AwayCard report={report} engine={engine} />;
}

interface Chip { key: string; text: string; color?: string; icon?: ReactNode; cls?: string }
interface LedgerRow {
  key: string;
  kind: 'hero' | 'raid' | 'overseer' | 'road';
  name: string;
  sub: string;
  subColor?: string;
  avatar?: string;
  avatarStyle?: CSSProperties;
  avatarNode?: ReactNode;
  initial?: string;
  pips: { ok: boolean; chain: boolean }[];
  morePips: number;
  stamp?: { text: string; cls: string };
  gold: number;
  xp: number;
  chips: Chip[];
  road?: string;
}

function itemChip(key: string, defId: string, name: string, rarity: Rarity): Chip {
  const def = EQUIPMENT_BY_ID[defId];
  return {
    key, text: name, color: RARITY_COLOR[rarity], cls: rarity === 'legendary' ? 'legend' : undefined,
    icon: def ? <ItemIcon slot={def.slot} icon={def.icon} size={18} hideFallback /> : undefined,
  };
}

function capChips(chips: Chip[]): Chip[] {
  if (chips.length <= MAX_CHIPS) return chips;
  return [...chips.slice(0, MAX_CHIPS - 1), { key: 'more', text: `+${chips.length - (MAX_CHIPS - 1)} more`, cls: 'more' }];
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function heroAvatar(engine: GameEngine, heroId: string): Pick<LedgerRow, 'avatar' | 'avatarStyle'> {
  const hero = engine.state.heroes.find((h) => h.id === heroId);
  const def = hero ? HERO_CLASSES[hero.heroClass] : undefined;
  if (!hero || !def) return {};
  return {
    avatar: heroPortraitSrc(hero.heroClass, def.portrait),
    avatarStyle: def.portrait ? { backgroundPosition: `${def.portrait.focusX ?? 50}% ${def.portrait.focusY ?? 50}%` } : undefined,
  };
}

/** One row per hero, in the order their first quest finished. */
function heroRows(engine: GameEngine, results: QuestResult[]): LedgerRow[] {
  const byHero = new Map<string, QuestResult[]>();
  for (const r of results) {
    const list = byHero.get(r.heroId);
    if (list) list.push(r);
    else byHero.set(r.heroId, [r]);
  }
  return [...byHero.entries()].map(([heroId, list]) => {
    const chains = [...new Set(list.map((r) => r.chainAdvanced?.chainId).filter((id): id is string => !!id))];
    const chainName = chains.length === 1 ? CHAIN_BY_ID[chains[0]]?.name : undefined;
    const sub = list.length === 1
      ? list[0].questName
      : `${list.length} quests${chainName ? ` · ${chainName}` : list.some((r) => r.autoChainStreak) ? ' · Auto-Chain' : ''}`;
    const chips: Chip[] = [];
    list.forEach((r, i) => r.loot.forEach((l, j) => chips.push(itemChip(`l${i}-${j}`, l.defId, l.name, l.rarity))));
    const last = list[list.length - 1];
    if (list.some((r) => r.heroFallen)) chips.push({ key: 'fallen', text: 'Fell and needs reviving', cls: 'hurt' });
    else if (last.injury) chips.push({ key: 'injury', text: last.injury.name, cls: 'hurt' });
    for (const r of list) if (r.petFallen) chips.push({ key: `pet-${r.questId}`, text: `${r.petFallen.petName} fell`, cls: 'hurt' });
    return {
      key: `hero-${heroId}`,
      kind: 'hero',
      name: list[0].heroName,
      sub,
      ...heroAvatar(engine, heroId),
      initial: list[0].heroName.charAt(0),
      pips: list.slice(0, MAX_PIPS).map((r) => ({ ok: r.success, chain: !!r.chainAdvanced })),
      morePips: Math.max(0, list.length - MAX_PIPS),
      gold: list.reduce((s, r) => s + r.gold, 0),
      xp: list.reduce((s, r) => s + r.xp, 0),
      chips: capChips(chips),
    };
  });
}

function raidRow(raid: RaidResult): LedgerRow {
  const chips: Chip[] = raid.loot.map((l, i) => itemChip(`l${i}`, l.defId, l.name, l.rarity));
  raid.heroesFallen?.forEach((h) => chips.push({ key: `f-${h.heroId}`, text: `${h.heroName} fell`, cls: 'hurt' }));
  raid.petsFallen?.forEach((p, i) => chips.push({ key: `pf-${i}`, text: `${p.petName} fell`, cls: 'hurt' }));
  raid.injuries.forEach((inj) => chips.push({ key: `i-${inj.heroId}`, text: `${inj.heroName}: ${inj.injury.name}`, cls: 'hurt' }));
  return {
    key: `raid-${raid.raidId}-${raid.resolvedAt}`,
    kind: 'raid',
    name: raid.raidName,
    sub: RAID_DIFFICULTY_LABEL[raid.difficulty],
    subColor: RAID_DIFFICULTY_COLOR[raid.difficulty],
    avatar: raidBannerSrc(raid.raidId, RAID_BY_ID[raid.raidId]?.banner),
    pips: [],
    morePips: 0,
    stamp: raid.fullClear
      ? { text: 'Full clear', cls: 'clear' }
      : raid.encountersCleared > 0
        ? { text: `${raid.encountersCleared}/${raid.totalEncounters}`, cls: 'part' }
        : { text: 'Turned back', cls: 'fail' },
    gold: raid.gold,
    xp: raid.xp,
    chips: capChips(chips),
  };
}

function AwayCard({ report, engine }: { report: OfflineReport; engine: GameEngine }) {
  const [dismissing, setDismissing] = useState(false);
  const goldRef = useRef<HTMLDivElement>(null);
  const [goldFlight, setGoldFlight] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  // Ordered the same as every other Harvest surface (NODE_ORDER), and only
  // the materials actually gathered.
  const materialsGained = NODE_ORDER
    .map((id) => ({ id, amount: report.materialsGained[id] ?? 0 }))
    .filter((m) => m.amount > 0);
  const hasAnyResults = report.results.length > 0 || report.raidResults.length > 0 || materialsGained.length > 0;
  const resolvedCount = report.results.length + report.raidResults.length;
  const levelsGained = report.results.reduce((s, r) => s + r.levelsGained, 0)
    + report.raidResults.reduce((s, r) => s + (r.heroesLeveledUp ?? []).reduce((a, h) => a + h.levelsGained, 0), 0);

  // ---- highlight badges: the big moments, biggest first ----
  const badges: { key: string; cls: string; text: string; seal?: boolean }[] = [];
  for (const r of report.results) {
    if (r.chainAdvanced?.completed) {
      badges.push({ key: `chain-${r.questId}`, cls: 'chain', seal: true, text: `Chain complete: ${CHAIN_BY_ID[r.chainAdvanced.chainId]?.name ?? 'a story chain'}` });
    }
  }
  const legendaries = [...report.results.flatMap((r) => r.loot), ...report.raidResults.flatMap((r) => r.loot)]
    .filter((l) => l.rarity === 'legendary');
  legendaries.slice(0, 2).forEach((l, i) => badges.push({ key: `leg-${i}`, cls: 'legend', text: `Legendary: ${l.name}` }));
  if (legendaries.length > 2) badges.push({ key: 'leg-more', cls: 'legend', text: `+${legendaries.length - 2} more legendary` });
  [
    ...report.results.filter((r) => r.titleGranted).map((r) => `${r.heroName} earned "${r.titleGranted}"`),
    ...report.raidResults.filter((r) => r.titleGranted && r.titledHeroNames?.length)
      .map((r) => `${joinNames(r.titledHeroNames!)} earned "${r.titleGranted}"`),
  ].forEach((text, i) => badges.push({ key: `title-${i}`, cls: 'title', text }));
  const leveledIds = new Set<string>([
    ...report.results.filter((r) => r.levelsGained > 0).map((r) => r.heroId),
    ...report.raidResults.flatMap((r) => (r.heroesLeveledUp ?? []).map((h) => h.heroId)),
  ]);
  const leveled = [...leveledIds]
    .map((id) => engine.state.heroes.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => !!h);
  leveled.slice(0, 3).forEach((h) => badges.push({ key: `lv-${h.id}`, cls: 'lvl', text: `${h.name} reached Lv ${h.level}` }));
  if (leveled.length > 3) badges.push({ key: 'lv-more', cls: 'lvl', text: `+${leveled.length - 3} more levelled up` });
  const fallen = new Set<string>([
    ...report.results.filter((r) => r.heroFallen).map((r) => r.heroName),
    ...report.raidResults.flatMap((r) => (r.heroesFallen ?? []).map((h) => h.heroName)),
  ]);
  fallen.forEach((name) => badges.push({ key: `fall-${name}`, cls: 'fall', text: `${name} fell and needs reviving` }));

  // ---- ledger rows ----
  const rows: LedgerRow[] = hasAnyResults
    ? [
      ...heroRows(engine, report.results),
      ...report.raidResults.map(raidRow),
      ...(materialsGained.length > 0 ? [{
        key: 'overseer', kind: 'overseer' as const, name: 'Overseer gathered', sub: '',
        avatarNode: <MaterialIcon icon={MATERIAL_BY_ID[materialsGained[0].id].icon} glyph={MATERIAL_BY_ID[materialsGained[0].id].glyph} size={22} />,
        pips: [], morePips: 0, gold: 0, xp: 0,
        chips: materialsGained.map((m) => {
          const def = MATERIAL_BY_ID[m.id];
          return { key: m.id, text: `+${formatMaterial(m.amount)} ${def.name}`, icon: <MaterialIcon icon={def.icon} glyph={def.glyph} size={18} /> };
        }),
      }] : []),
    ]
    // Nothing finished: show who's still out and when they're due back.
    : engine.state.activeQuests.slice(0, 4).map((q) => {
      const hero = engine.state.heroes.find((h) => h.id === q.heroId);
      return {
        key: `road-${q.id}`, kind: 'road' as const, name: hero?.name ?? 'A hero', sub: q.offer.name,
        ...heroAvatar(engine, q.heroId),
        initial: hero?.name.charAt(0), pips: [], morePips: 0, gold: 0, xp: 0, chips: [],
        road: `Back in ${formatDuration(q.endsAt - Date.now())}`,
      };
    });

  // ---- 1x timeline (ms) ----
  // The ledger writes in after the badges. A long week can mean a dozen
  // rows of pips and chips, so the whole ledger is squeezed to fit inside
  // LEDGER_MAX_MS rather than making the player wait for it.
  const T_BADGES = 1600;
  const LEDGER_MAX_MS = 2600;
  const ledgerStart = hasAnyResults ? T_BADGES + (badges.length ? badges.length * 160 + 150 : 0) : 800;
  let cursor = 0;
  const raw = rows.map((row) => {
    const start = cursor;
    const chipsAt = start + 160 + row.pips.length * 35 + 60;
    cursor = chipsAt + row.chips.length * 80 + 20;
    return { row, start, chipsAt };
  });
  const squeeze = cursor > LEDGER_MAX_MS ? LEDGER_MAX_MS / cursor : 1;
  const pipStep = 35 * squeeze;
  const timed = raw.map(({ row, start, chipsAt }) => ({
    row, start: ledgerStart + start * squeeze, pipsAt: ledgerStart + (start + 160) * squeeze, chipsAt: ledgerStart + chipsAt * squeeze,
  }));
  const T_DONE = ledgerStart + cursor * squeeze + 100;

  const elapsed = useDelayedCount(report.elapsedMs, 900, 1400);
  const gold = useDelayedCount(report.goldGained, 1000, 1100);
  const xp = useDelayedCount(report.xpGained, 1000, 1100);
  const quests = useDelayedCount(resolvedCount, 1000, 1100);
  const levels = useDelayedCount(levelsGained, 1000, 1100);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    if (goldRef.current && report.goldGained > 0) {
      const originRect = goldRef.current.getBoundingClientRect();
      const origin = { x: originRect.left + originRect.width / 2, y: originRect.top + originRect.height / 2 };
      const offset = measureFlyOffset(goldRef.current, 'gold');
      if (offset) setGoldFlight({ ...origin, ...offset });
    }
    timeoutRef.current = window.setTimeout(() => engine.dismissOfflineReport(), DISMISS_DELAY_MS);
  };

  const tiles = [
    { key: 'g', value: `+${formatGold(gold)}`, label: 'Gold' },
    { key: 'x', value: `+${xp}`, label: 'Experience' },
    { key: 'q', value: String(quests), label: report.raidResults.length ? 'Quests & raids' : 'Quests' },
    ...(levelsGained > 0 ? [{ key: 'lv', value: `+${levels}`, label: levelsGained === 1 ? 'Level' : 'Levels' }] : []),
  ];

  return (
    <div className="overlay" onClick={handleDismiss}>
      <div className={`modal ofx-card ${dismissing ? 'ofx-closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="ofx-head">
          <svg className="ofx-glass" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 5h24M10 39h24" />
            <path d="M13 5c0 9 9 11 9 17s-9 8-9 17M31 5c0 9-9 11-9 17s9 8 9 17" />
            <path className="ofx-sandtop" d="M15 10h14c-1 4-5 7-7 9-2-2-6-5-7-9z" fill="currentColor" stroke="none" opacity=".85" />
            <path className="ofx-stream" d="M22 21v12" strokeWidth="1.2" />
            <path className="ofx-sandbot" d="M15 37h14c-1-4-4-6-7-7-3 1-6 3-7 7z" fill="currentColor" stroke="none" opacity=".85" />
          </svg>
          <div>
            <div className="ofx-kick">While you were away</div>
            <div className="ofx-ttl">The guild ran for <b>{elapsed > 0 ? formatDuration(elapsed) : '0s'}</b></div>
          </div>
        </div>

        <div className="ofx-body">
          {hasAnyResults ? (
            <>
              <div className="ofx-tally">
                {tiles.map((tile, i) => (
                  <div key={tile.key} ref={tile.key === 'g' ? goldRef : undefined} className={`ofx-tile ${tile.key}`} style={at(700 + i * 120)}>
                    <div className="ofx-v">{tile.value}</div>
                    <div className="ofx-l">{tile.label}</div>
                    {tile.key === 'g' && report.goldGained > 0 && [-20, -8, 4, 16, 28].map((x, k) => (
                      <span key={k} className="ofx-coin" style={at(1000 + k * 90, { marginLeft: x })} aria-hidden="true" />
                    ))}
                  </div>
                ))}
              </div>
              {badges.length > 0 && (
                <div className="ofx-hl">
                  {badges.map((b, i) => (
                    <span key={b.key} className={`ofx-badge ${b.cls}`} style={at(T_BADGES + i * 160)}>
                      {b.seal ? <img src={waxSealComplete} alt="" /> : <i className="ofx-dot" />}
                      <span>{b.text}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="small muted ofx-quiet" style={at(600)}>
              Nothing finished in that time. Everyone is still on the road or waiting for orders.
            </p>
          )}

          {timed.length > 0 && (
            <div className="ofx-ledger">
              {timed.map(({ row, start, pipsAt, chipsAt }) => (
                <div key={row.key} className={`ofx-row ofx-${row.kind}`} style={at(start)}>
                  <span
                    className="ofx-ava"
                    style={row.avatar ? { backgroundImage: `url(${row.avatar})`, ...row.avatarStyle } : undefined}
                    aria-hidden="true"
                  >
                    {row.avatarNode ?? (!row.avatar && row.initial)}
                  </span>
                  <div className="ofx-mid">
                    <div className="ofx-who">
                      {row.name}
                      {row.sub && <small style={row.subColor ? { color: row.subColor } : undefined}>{row.sub}</small>}
                    </div>
                    {row.pips.length > 0 && (
                      <div className="ofx-pips">
                        {row.pips.map((p, k) => (
                          <span key={k} className={`ofx-pip ${p.ok ? 'ok' : 'no'} ${p.chain ? 'chain' : ''}`} style={at(pipsAt + k * pipStep)}>
                            <svg viewBox="0 0 12 12" aria-hidden="true"><path d={p.ok ? 'M2 6.3 L5 9 L10 3' : 'M3 3 L9 9 M9 3 L3 9'} /></svg>
                          </span>
                        ))}
                        {row.morePips > 0 && <span className="ofx-more">+{row.morePips} more</span>}
                      </div>
                    )}
                    {row.road && <div className="ofx-road">{row.road}<span className="qfx-dots" aria-hidden="true"><i /><i /><i /></span></div>}
                  </div>
                  <div className="ofx-sum">
                    {row.stamp && <span className={`ofx-st ${row.stamp.cls}`}>{row.stamp.text}</span>}
                    {row.gold > 0 && <span className="ofx-g">+{formatGold(row.gold)} gold</span>}
                    {row.xp > 0 && <span className="ofx-x">+{row.xp} XP</span>}
                  </div>
                  {row.chips.length > 0 && (
                    <div className="ofx-chips">
                      {row.chips.map((c, j) => (
                        <span
                          key={c.key}
                          className={`ofx-chip ${c.cls ?? ''}`}
                          style={at(chipsAt + j * 80 * squeeze, c.color ? { color: c.color } : undefined)}
                        >
                          {c.icon}{c.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="row end ofx-actions" style={at(T_DONE, { marginTop: 14 })}>
            <button className="btn-primary" onClick={handleDismiss} disabled={dismissing}>Back to work</button>
          </div>
        </div>
      </div>

      {/* Flies to the header's gold display, measured at the moment of
          dismissal (flyTarget.ts); silently skipped if that target isn't
          mounted (idle mode has no header). Outside the card so the card's
          fold-shut transform doesn't squash it. */}
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
    </div>
  );
}
