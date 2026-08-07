import { useState } from 'react';
import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { GuildManager } from '../../game/managers/GuildManager';
import { VENDORS, vendorUpgrades, xpForLevel } from '../../game/data/progression';
import { AchievementManager } from '../../game/managers/AchievementManager';
import { guildPowerLevel, levelTierColor, levelTierName } from '../../game/power';
import { currentGuildRank, nextGuildRank } from '../../game/data/guildRank';
import { formatGold, formatNumber } from '../../game/util';

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
  const power = guildPowerLevel(state);
  const rank = currentGuildRank(state);
  const next = nextGuildRank(state);
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
      <h2>The Guild</h2>
      <p className="subtitle">Everything the guild has built, at a glance.</p>

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
                flex: 1, background: 'var(--panel2)', border: '1px solid var(--panel3)',
                color: 'var(--text)', padding: '7px 8px',
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
        {next && (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Next: {next.name} — reach level {next.minLevel} or complete a chain at that level.
          </p>
        )}
      </div>

      <div
        className="card power-card"
        title="Combines hero stats, ascension, Renown, vendor relationships, guild upgrades, and completed story chains into one number."
      >
        <div className="tiny muted" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Guild Power</div>
        <div className="power-number">{power.toLocaleString()}</div>
        <div className="stat-row" style={{ marginTop: 6 }}>
          <span className="gold-text">◆ {formatGold(state.gold)}</span>
          <span style={{ color: 'var(--violet)' }}>✦ {formatNumber(state.renown)} renown</span>
          <span className="muted">Day {guildAgeDays}</span>
        </div>
      </div>

      <div className="section-heading">Heroes</div>
      <div className="dashboard-grid">
        {state.heroes.map((hero) => {
          const color = levelTierColor(hero.level);
          const needed = xpForLevel(hero.level);
          return (
            <div key={hero.id} className="dashboard-item">
              <Ring
                progress={needed > 0 ? hero.xp / needed : 0}
                color={color}
                size={64}
                title={`${levelTierName(hero.level)} tier`}
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
