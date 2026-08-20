import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { VENDORS, vendorUpgrades, xpForLevel } from '../../game/data/progression';
import { AchievementManager } from '../../game/managers/AchievementManager';
import { attentionCounts } from '../../game/attention';
import { guildPowerBreakdown, levelTierColor, levelTierName } from '../../game/power';
import { currentGuildRank, nextGuildRank, powerToNextRank } from '../../game/data/guildRank';
import { RAID_DIFFICULTY_LABEL } from '../../game/data/raids';
import { formatGold, formatNumber } from '../../game/util';

// Same shape as GuidePanel's own timeAgo -- kept local rather than shared,
// matching how small formatting helpers already get duplicated per-file
// across this codebase (see RAID_DIFFICULTY_COLOR in OfflineReportModal/
// StatsPanel for the same convention) rather than pulled into util.ts for
// a single extra caller.
function timeAgo(ts: number, now: number): string {
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type OutcomeEntry = {
  key: string;
  kind: 'quest' | 'raid';
  name: string;
  sub: string;
  success: boolean;
  gold: number;
  xp: number;
  resolvedAt: number;
};

/**
 * Combined, newest-first feed of what the guild has actually been up to --
 * reads the two capped history logs `state.log`/`state.raidLog` that
 * QuestManager.resolve/RaidManager.resolve already write on every
 * completion (live or offline), the same ones StatsPanel's "Recent
 * quests"/"Recent raids" sections read. No new state or persistence: both
 * logs already existed, this just surfaces the newest handful of either
 * kind together on the Guild home tab, rather than a player needing to
 * catch a transient result modal in time or go dig through the
 * Statistics tab to see what just happened. Renders a friendly empty
 * state rather than nothing at all, since (unlike AttentionDigest) an
 * empty guild record is itself informative on a brand new save.
 */
function RecentOutcomesCard() {
  const engine = useEngine();
  const state = engine.state;
  const now = Date.now();

  const entries: OutcomeEntry[] = [
    ...state.log.map((r): OutcomeEntry => ({
      key: `quest-${r.questId}`,
      kind: 'quest',
      name: r.questName,
      sub: r.heroName,
      success: r.success,
      gold: r.gold,
      xp: r.xp,
      resolvedAt: r.resolvedAt,
    })),
    ...state.raidLog.map((r): OutcomeEntry => ({
      key: `raid-${r.raidId}-${r.resolvedAt}`,
      kind: 'raid',
      name: r.raidName,
      sub: RAID_DIFFICULTY_LABEL[r.difficulty],
      success: r.fullClear,
      gold: r.gold,
      xp: r.xp,
      resolvedAt: r.resolvedAt,
    })),
  ]
    .sort((a, b) => b.resolvedAt - a.resolvedAt)
    .slice(0, 6);

  return (
    <div className="card">
      <div className="spread">
        <span className="card-title">Recent outcomes</span>
        <button
          className="btn-ghost"
          style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
          onClick={() => engine.requestTab('stats')}
        >
          View all
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Nothing finished yet -- send a hero out or start a raid.
        </p>
      ) : (
        entries.map((e) => (
          <div key={e.key} className="spread" style={{ alignItems: 'center', marginTop: 6 }}>
            <span className="small">
              {e.kind === 'raid' ? '⚔ ' : ''}{e.name}
              <span className="tiny muted" style={{ marginLeft: 6 }}>{e.sub}</span>
            </span>
            <span className="tiny" style={{ textAlign: 'right', flexShrink: 0 }}>
              <span className={e.success ? 'good' : 'bad'}>
                {e.success ? (e.kind === 'raid' ? 'Cleared' : 'Success') : (e.kind === 'raid' ? 'Retreated' : 'Failed')}
              </span>
              {' · '}<span className="gold-text">+{formatGold(e.gold)}</span>
              {' · '}<span className="muted">{timeAgo(e.resolvedAt, now)}</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * "Needs attention" digest -- one glanceable card for state that's sitting
 * around waiting on the player, instead of hunting across tabs for it.
 * Reads attentionCounts() (game/attention.ts) -- the same three signals
 * that also drive the small numeric badges on the Hatchery/Equipment nav
 * tabs themselves (see MenuWindow), so this card and those badges can
 * never say two different things. Renders nothing at all when every
 * signal is empty, rather than an empty "all clear" card taking up space
 * on every single visit.
 */
function AttentionDigest() {
  const engine = useEngine();
  const state = engine.state;
  const { idleHeroes, eggsReady, brokenGear, harvestReady } = attentionCounts(state);

  const items: { key: string; label: string; tab: string }[] = [];
  if (idleHeroes > 0) {
    items.push({
      key: 'idle',
      label: `${idleHeroes} hero${idleHeroes === 1 ? '' : 's'} idle with nothing sent out`,
      tab: 'quests',
    });
  }
  if (eggsReady > 0) {
    items.push({
      key: 'eggs',
      label: `${eggsReady} egg${eggsReady === 1 ? '' : 's'} ready to hatch`,
      tab: 'hatchery',
    });
  }
  if (brokenGear > 0) {
    items.push({
      key: 'broken',
      label: `${brokenGear} piece${brokenGear === 1 ? '' : 's'} of equipped gear broken`,
      tab: 'equipment',
    });
  }
  if (harvestReady > 0) {
    items.push({
      key: 'harvest',
      label: `${harvestReady} Harvest node${harvestReady === 1 ? '' : 's'} ready to collect`,
      tab: 'harvest',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 4 }}>Needs attention</div>
      {items.map((item) => (
        <div key={item.key} className="spread" style={{ alignItems: 'center', marginTop: 4 }}>
          <span className="small">{item.label}</span>
          <button
            className="btn-ghost"
            style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
            onClick={() => engine.requestTab(item.tab)}
          >
            Go to {item.tab === 'quests' ? 'Quests & Contracts' : item.tab === 'hatchery' ? 'Hatchery' : item.tab === 'harvest' ? 'Harvest' : 'Inventory'}
          </button>
        </div>
      ))}
    </div>
  );
}

export function Ring({
  progress, color, size, children, title,
}: {
  progress: number; color: string; size: number; children: ReactNode; title?: string;
}) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div
      className="progress-ring"
      title={title}
      style={{
        width: size, height: size,
        background: `conic-gradient(${color} ${pct}%, var(--panel-3) 0)`,
        boxShadow: `0 0 10px ${color}66`,
      }}
    >
      <div className="progress-ring-inner">{children}</div>
    </div>
  );
}

export function DashboardPanel() {
  const engine = useEngine();
  const state = engine.state;
  const breakdown = guildPowerBreakdown(state);
  const power = breakdown.total;
  const rank = currentGuildRank(state);
  const next = nextGuildRank(state);
  const powerNeeded = powerToNextRank(state);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const achProgress = AchievementManager.progress(state);
  const guildAgeDays = Math.max(0, Math.floor((Date.now() - state.createdAt) / (24 * 3600000)));

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(state.guildName);

  const saveName = () => {
    engine.setGuildName(nameDraft);
    setEditingName(false);
  };

  return (
    <>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>The Guild</h2>
          <p className="subtitle">Everything the guild has built, at a glance.</p>
        </div>
        {/* Moved here from the Guild Hall tab's own header (patch 0213) --
            Customize decorates the whole guild's home, not specifically a
            facility, so it reads better as a home-tab call-to-action than
            a small header button buried on the Guild Hall tab. Bigger and
            its own colour (.btn-teal-lg) rather than the plain .btn-ghost
            it used to be, so it actually stands out here. Navigates to
            the Guild Hall tab with the 'customize' sub-tab sentinel,
            which GuildPanel consumes once on mount to open straight into
            GuildHallCustomizeScene instead of the normal facilities view. */}
        <button
          className="btn-teal-lg"
          onClick={() => engine.requestTab('guild', undefined, 'customize')}
          title="Decorate the Guild Hall with trophies, banners, and shelf trinkets -- purely cosmetic"
        >
          🎨 Customize
        </button>
      </div>

      <AttentionDigest />

      <RecentOutcomesCard />

      <div className="card">
        {editingName || !state.guildName ? (
          <div className="row" style={{ gap: 8 }}>
            <input
              type="text"
              value={nameDraft}
              placeholder="Name your guild"
              maxLength={24}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
              style={{
                flex: 1, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                color: 'var(--parchment)', padding: '7px 8px',
              }}
            />
            <button onClick={saveName}>Save</button>
          </div>
        ) : (
          <div className="spread">
            <span className="card-title">{state.guildName}</span>
            <button
              className="btn-ghost"
              onClick={() => { setNameDraft(state.guildName); setEditingName(true); }}
            >
              Rename
            </button>
          </div>
        )}
        <div className="spread" style={{ marginTop: 6 }}>
          <span className="tiny muted">Guild Rank</span>
          <b className="gold-text">{rank.name}</b>
        </div>
        <p className="tiny muted" style={{ margin: '2px 0 0' }}>{rank.blurb}</p>
        {next && powerNeeded !== null && (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Next: {next.name} — {formatNumber(powerNeeded)} more Guild Power.
          </p>
        )}
      </div>

      <div
        className="card power-card"
        style={{ cursor: 'pointer' }}
        onClick={() => setShowBreakdown((v) => !v)}
        title="Tap to see what makes up this number. Combines hero stats, gear score, ascension, guild upgrades, renown perks, raid upgrades, and completed story chains."
      >
        <div className="tiny muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Guild Power</div>
        <div className="power-number">{power.toLocaleString()}</div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          <span className="gold-text">◆ {formatGold(state.gold)}</span>
          <span style={{ color: 'var(--violet)' }}>✦ {formatNumber(state.renown)} renown</span>
          <span className="muted">Day {guildAgeDays}</span>
        </div>
        {showBreakdown && (
          <div className="tiny muted" style={{ marginTop: 8, borderTop: '1px solid var(--panel-3)', paddingTop: 6 }}>
            <div className="spread"><span>Hero Levels &amp; Stats</span><span>{breakdown.heroStats.toLocaleString()}</span></div>
            <div className="spread"><span>Gear Score</span><span>{breakdown.gearScore.toLocaleString()}</span></div>
            <div className="spread"><span>Guild Facilities</span><span>{breakdown.facilities.toLocaleString()}</span></div>
            <div className="spread"><span>Vendor Upgrades</span><span>{breakdown.vendorUpgrades.toLocaleString()}</span></div>
            <div className="spread"><span>Raid Upgrades</span><span>{breakdown.raidUpgrades.toLocaleString()}</span></div>
            <div className="spread"><span>Renown Perks</span><span>{breakdown.renownPerks.toLocaleString()}</span></div>
            <div className="spread"><span>Completed Chains</span><span>{breakdown.completedChains.toLocaleString()}</span></div>
            <div className="spread"><span>Ascension</span><span>{breakdown.ascension.toLocaleString()}</span></div>
          </div>
        )}
      </div>

      <div className="section-heading">Heroes</div>
      <div className="dashboard-grid">
        {state.heroes.map((hero) => {
          const color = levelTierColor(hero.level);
          const needed = xpForLevel(hero.level);
          // A maxed hero's own xp is zeroed out the moment it hits the cap
          // (see HeroManager.grantXp) precisely so it never has a real
          // next level to show progress toward -- reads as a stalled-at-0
          // ring without this, rather than the "done" a capped hero
          // actually is. A full ring communicates that correctly instead.
          const maxed = HeroManager.isMaxLevel(hero);
          return (
            <div key={hero.id} className="dashboard-item">
              <Ring
                progress={maxed ? 1 : needed > 0 ? hero.xp / needed : 0}
                color={color}
                size={64}
                title={maxed ? 'Max level' : `${levelTierName(hero.level)} tier`}
              >
                <span style={{ color }}>{hero.level}</span>
              </Ring>
              <div className="tiny" style={{ marginTop: 4, textAlign: 'center' }}>{hero.name}</div>
              {hero.ascension > 0 && <div className="tiny muted">ascended ×{hero.ascension}</div>}
            </div>
          );
        })}
      </div>

      <div className="section-heading">Vendors</div>
      <div className="dashboard-grid">
        {VENDORS.map((vendor) => {
          const level = GuildManager.vendorLevel(state, vendor.id);
          const cap = vendorUpgrades(vendor.id).length;
          return (
            <div key={vendor.id} className="dashboard-item">
              <Ring progress={cap > 0 ? level / cap : 0} color="var(--brass)" size={56}>
                <span style={{ color: 'var(--brass)', fontSize: '0.75rem' }}>{level}/{cap}</span>
              </Ring>
              <div className="tiny" style={{ marginTop: 4, textAlign: 'center' }}>{vendor.name}</div>
            </div>
          );
        })}
      </div>

      <div className="section-heading">Guild record</div>
      <div className="grid three">
        <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
          <div className="dashboard-stat-number">{state.completedChains.length}</div>
          <div className="tiny muted">Stories completed</div>
        </div>
        <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
          <div className="dashboard-stat-number">{achProgress.unlocked}/{achProgress.total}</div>
          <div className="tiny muted">Achievements</div>
        </div>
        <div className="card" style={{ marginBottom: 0, textAlign: 'center' }}>
          <div className="dashboard-stat-number">{state.stats.prestigeCount}</div>
          <div className="tiny muted">Retirements</div>
        </div>
      </div>
    </>
  );
}
