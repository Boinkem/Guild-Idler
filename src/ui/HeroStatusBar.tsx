import type { GameEngine } from '../game/engine';
import { HERO_CLASSES, infirmaryAutoReviveUnlocked } from '../game/data/progression';
import { RAID_BY_ID } from '../game/data/raids';
import { GuildManager } from '../game/managers/GuildManager';
import { Tuning } from '../game/data/tuning';
import { Hero } from '../game/types';
import { formatDuration, MINUTE } from '../game/util';

/**
 * Patch 0269. One computed row for a single hero, shared by both the
 * roster's "Status bars" view (HeroesPanel.tsx, Settings > Knight) and the
 * corner companion's own status view (IdleView.tsx). Kept as one function
 * rather than two near-identical implementations so "what counts as ready,
 * what a Fallen hero's bar shows" can't quietly drift apart between the two
 * surfaces over time.
 */
export interface HeroStatusInfo {
  hero: Hero;
  /** Short present-tense line: "Questing — <offer name>", "Raiding —
   *  <raid name>", "Fallen", "Idle", etc. */
  statusLine: string;
  /** Right-aligned readout: "32m left", "Ready", "Fallen", "Idle". */
  timeLabel: string;
  /** 0-100. */
  percent: number;
  /** Milliseconds remaining, used purely for sorting -- 0 for anything
   *  already finished/ready, Infinity for anything with no timer at all
   *  (idle, or Fallen with no auto-revive path available yet). */
  remainingMs: number;
  /** Which semantic bucket this row's bar should render in -- drives the
   *  bar's tint the same way DurabilityBar/HealthBar's own `low` class
   *  already switches color by threshold, just keyed to status instead. */
  kind: 'quest' | 'raid' | 'ready' | 'fallen' | 'idle';
}

export function heroStatusInfo(engine: GameEngine, now: number, hero: Hero): HeroStatusInfo {
  const activeRaid = engine.state.activeRaid;
  const onRaid = !!activeRaid?.heroIds.includes(hero.id);

  if (hero.status === 'fallen') {
    // Only a hero with the free Infirmary auto-revive path unlocked has any
    // real ETA to show -- everyone else is stuck until the player pays or
    // manually revives, so there's no honest percentage to render for them
    // (see HeroManager.autoReviveDue's own comment). `fallenAt` is always
    // set alongside `status === 'fallen'` in practice (HeroManager.
    // applyHealthDamage sets both together), but optional on the type --
    // treated as "no ETA available" if somehow missing rather than crashing.
    const infirmaryLevel = GuildManager.facilityLevel(engine.state, 'infirmary');
    if (hero.fallenAt && infirmaryAutoReviveUnlocked(infirmaryLevel)) {
      const hours = Tuning.get('guild_facility.infirmary.autoReviveHours');
      const totalMs = hours * 60 * MINUTE;
      const elapsed = now - hero.fallenAt;
      const pct = Math.max(0, Math.min(100, Math.round((elapsed / totalMs) * 100)));
      return {
        hero,
        statusLine: 'Recovering — cannot be sent',
        timeLabel: pct >= 100 ? 'Revive ready' : 'Fallen',
        percent: pct,
        remainingMs: Math.max(0, totalMs - elapsed),
        kind: 'fallen',
      };
    }
    // No free auto-revive path available yet (Infirmary below max level) --
    // there's genuinely no ETA to show, so the bar sits at 0 rather than
    // implying progress toward something that isn't happening on its own.
    return {
      hero, statusLine: 'Recovering — cannot be sent', timeLabel: 'Fallen',
      percent: 0, remainingMs: Number.POSITIVE_INFINITY, kind: 'fallen',
    };
  }

  if (onRaid && activeRaid) {
    const remaining = Math.max(0, activeRaid.endsAt - now);
    const total = Math.max(1, activeRaid.endsAt - activeRaid.startedAt);
    const pct = Math.round(((total - remaining) / total) * 100);
    const raidName = RAID_BY_ID[activeRaid.raidId]?.name ?? 'a raid';
    return {
      hero,
      statusLine: `Raiding — ${raidName}`,
      timeLabel: remaining <= 0 ? 'Ready to claim' : `${formatDuration(remaining)} left`,
      percent: Math.min(100, pct),
      remainingMs: remaining,
      kind: remaining <= 0 ? 'ready' : 'raid',
    };
  }

  const quest = engine.activeQuestFor(hero.id);
  if (quest) {
    const remaining = Math.max(0, quest.endsAt - now);
    const total = Math.max(1, quest.endsAt - quest.startedAt);
    const pct = Math.round(((total - remaining) / total) * 100);
    return {
      hero,
      statusLine: `Questing — ${quest.offer.name}`,
      timeLabel: remaining <= 0 ? 'Ready to claim' : `${formatDuration(remaining)} left`,
      percent: Math.min(100, pct),
      remainingMs: remaining,
      kind: remaining <= 0 ? 'ready' : 'quest',
    };
  }

  return {
    hero, statusLine: 'Available for a contract', timeLabel: 'Idle',
    percent: 0, remainingMs: Number.POSITIVE_INFINITY, kind: 'idle',
  };
}

/**
 * Sorted soonest-completing/completed-first, per direct request: anything
 * already at 0 remaining (ready to claim) floats to the very top, then
 * active timers ascending by time left, then Fallen, then plain Idle heroes
 * last -- an idle hero has nothing to check back on, so it's the least
 * useful row to see first in a list that exists specifically to answer
 * "what's about to finish."
 */
export function sortedHeroStatuses(engine: GameEngine, now: number): HeroStatusInfo[] {
  const order: Record<HeroStatusInfo['kind'], number> = { ready: 0, raid: 1, quest: 1, fallen: 2, idle: 3 };
  return engine.state.heroes
    .map((h) => heroStatusInfo(engine, now, h))
    .sort((a, b) => {
      const bucket = order[a.kind] - order[b.kind];
      if (bucket !== 0) return bucket;
      return a.remainingMs - b.remainingMs;
    });
}

/**
 * The colored circle avatar -- class color, optional class icon, falls
 * back to a plain color-only circle when the class has no icon assigned
 * in DevTools yet, same graceful-missing-asset convention every other
 * optional icon field in this project already follows.
 *
 * Patch 0271: was sized/rendered for the tiny 16x16 pixel-art convention
 * every OTHER `picker: 'icon'` field in this project actually holds
 * (equipment, consumables, materials, etc) -- 60% of the circle's size,
 * `image-rendering: pixelated` so those blocky little sprites scale up
 * crisp instead of blurry. The real class icons that got uploaded and
 * assigned are ~300px framed, painterly art, a completely different
 * asset type than that convention assumes -- at 60% and pixelated, they
 * rendered as a tiny, blurry postage stamp floating in the middle of the
 * circle. Fixed to fill the full circle (`objectFit: 'cover'`, clipped
 * to the circle by the parent's own `overflow: hidden` + border-radius)
 * with normal smooth scaling instead of pixelated. The class `color`
 * moves from a fill (now entirely hidden behind a full-bleed icon) to a
 * thin ring around it instead, via `border` + `box-sizing: border-box`
 * (keeps the circle's total rendered size exactly `size`, same as
 * before) -- keeps the actual point of a *colored* avatar (a glance-able
 * class signal) intact even once every class has real icon art, rather
 * than the color becoming purely cosmetic set-dressing behind the icon.
 */
function ClassAvatar({ hero, size }: { hero: Hero; size: number }) {
  const def = HERO_CLASSES[hero.heroClass];
  const color = def?.color ?? '#888888';
  const icon = def?.icon ?? '';
  return (
    <div
      className="hero-status-avatar"
      style={{
        width: size, height: size, borderRadius: '50%', background: color,
        border: `2px solid ${color}`, boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {icon && (
        <img
          src={`./item-icons/${icon}`}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}

/** One row: avatar, name + right-aligned time label, status subtitle, and a
 *  progress bar tinted by `kind`. `compact` shrinks type/spacing for the
 *  tiny idle companion window; the roster view uses the roomier default.
 *  Reuses the game's existing shared `.bar` class (same one XP/Durability/
 *  Health already build on -- see app.css) rather than inventing new
 *  track/fill class names, so this gets the same width transition and
 *  `data-motion='off'` accessibility override every other bar already has
 *  for free. `kind` maps onto a `.bar` variant modifier the same way
 *  `.bar.dura`/`.bar.health` already switch tint by what they represent:
 *  quest/raid -> `.bar.xp` (sky blue, "in progress"), ready -> `.bar`
 *  default (moss green, matches a completed/good state), fallen ->
 *  `.bar.dura.low` (blood red, matches the existing "critical" tint),
 *  idle has nothing to fill so it's left at 0% on the plain default tint. */
export function HeroStatusRow({ info, compact }: { info: HeroStatusInfo; compact?: boolean }) {
  const avatarSize = compact ? 22 : 32;
  const barClass = info.kind === 'fallen' ? 'bar dura low' : info.kind === 'quest' || info.kind === 'raid' ? 'bar xp' : 'bar';
  return (
    <div className={`hero-status-row ${compact ? 'compact' : ''}`}>
      <ClassAvatar hero={info.hero} size={avatarSize} />
      <div className="hero-status-body">
        <div className="hero-status-top">
          <span className="hero-status-name">{info.hero.name}</span>
          <span className={`hero-status-time ${info.kind}`}>{info.timeLabel}</span>
        </div>
        {!compact && <div className="hero-status-subtitle muted">{info.statusLine}</div>}
        <div className={barClass}>
          <span style={{ width: `${info.percent}%` }} />
        </div>
      </div>
    </div>
  );
}

/** The full sorted list -- used as-is by both HeroesPanel's roster toggle
 *  and IdleView's companion toggle. `compact` is passed straight through
 *  to every row. */
export function HeroStatusList({ engine, now, compact }: { engine: GameEngine; now: number; compact?: boolean }) {
  const rows = sortedHeroStatuses(engine, now);
  return (
    <div className={`hero-status-list ${compact ? 'compact' : ''}`}>
      {rows.map((info) => (
        <HeroStatusRow key={info.hero.id} info={info} compact={compact} />
      ))}
    </div>
  );
}
