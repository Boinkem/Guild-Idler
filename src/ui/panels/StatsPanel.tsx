import { useState } from 'react';
import { useEngine } from '../useEngine';
import { AchievementManager } from '../../game/managers/AchievementManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { GUILD_FACILITIES, UPGRADES } from '../../game/data/progression';
import { RAID_UPGRADES } from '../../game/data/raidUpgrades';
import { ITEM_SETS } from '../../game/data/equipment';
import { RAIDS, RAID_DIFFICULTY_LABEL } from '../../game/data/raids';
import { PETS } from '../../game/data/pets';
import { RaidDifficulty } from '../../game/types';
import { formatGold, formatPlayTime, RARITY_COLOR } from '../../game/util';
import { ConfirmModal } from '../ConfirmModal';

/** Same rarity-parallel palette RaidsPanel/OfflineReportModal already use
 *  for Normal/Heroic/Legendary -- kept local rather than shared, matching
 *  how OfflineReportModal already duplicates this same small map rather
 *  than importing it from RaidsPanel. */
const RAID_DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, legendary: RARITY_COLOR.epic,
};

export function StatsPanel() {
  const engine = useEngine();
  const state = engine.state;
  const stats = state.stats;
  const successRate = stats.totalQuests > 0
    ? `${Math.round((stats.successes / stats.totalQuests) * 100)}%`
    : '—';
  const achProgress = AchievementManager.progress(state);
  // Both previously native `window.alert()`/`window.confirm()` calls --
  // unstyled OS dialogs, out of place next to every other prompt in the
  // game already routed through ConfirmModal (Recall, sell confirmations).
  // See guild-idler-status.md's polish-pass entry for the full writeup.
  const [saveLocationMessage, setSaveLocationMessage] = useState<string | null>(null);
  const [pendingHardReset, setPendingHardReset] = useState(false);

  // Sets completed -- every ITEM_SETS entry (raid, chain-reward, material-
  // tier, and craft-only alike, not just raid sets), same "every piece
  // discovered" definition LorePanel's own Collection tab and RaidsPanel's
  // SetProgressLine already use (set.pieces.filter(p =>
  // discoveredItems.includes(p))), just counting whole sets here instead
  // of individual pieces.
  const setsCompleted = ITEM_SETS.filter(
    (s) => s.pieces.every((p) => state.discoveredItems.includes(p)),
  ).length;

  // Upgrades completed -- every facility, general/vendor upgrade, and raid
  // upgrade at its own max level, combined into one number. Three
  // separate level accessors (facilityLevel/upgradeLevel/raidUpgradeLevel)
  // since each tree is tracked in its own state slice, but they're all
  // "a permanent upgrade fully bought out" in the same sense, so they
  // read as one combined stat here rather than three separate rows.
  const upgradesMaxed = GUILD_FACILITIES.filter((d) => GuildManager.facilityLevel(state, d.id) >= d.maxLevel).length
    + UPGRADES.filter((d) => GuildManager.upgradeLevel(state, d.id) >= d.maxLevel).length
    + RAID_UPGRADES.filter((d) => GuildManager.raidUpgradeLevel(state, d.id) >= d.maxLevel).length;
  const upgradesTotal = GUILD_FACILITIES.length + UPGRADES.length + RAID_UPGRADES.length;

  // Pet breeds collected -- pets have no release/delete path anywhere in
  // the game (a hatch is permanent), so state.pets is already safe to
  // read as "every species ever hatched," not just currently owned, same
  // reasoning AchievementManager's own ALL_PETS_COLLECTED check already
  // relies on -- no separate discovered-pets ledger needed the way
  // discoveredItems exists for equipment.
  const petBreedsCollected = new Set(state.pets.map((p) => p.defId)).size;

  const rows: [string, string][] = [
    ['Total quests', stats.totalQuests.toLocaleString()],
    ['Successes', stats.successes.toLocaleString()],
    ['Failures', stats.failures.toLocaleString()],
    ['Success rate', successRate],
    ['Gold earned', formatGold(stats.goldEarned)],
    ['Gold spent', formatGold(stats.goldSpent)],
    ['Highest single reward', formatGold(stats.highestReward)],
    ['Items found', stats.itemsFound.toLocaleString()],
    ['Legendary items found', stats.legendaryItemsFound.toLocaleString()],
    ['Injuries suffered', stats.injuriesSuffered.toLocaleString()],
    ['Items broken', stats.itemsBroken.toLocaleString()],
    ['Quest chains completed', stats.chainsCompleted.toLocaleString()],
    ['Raids completed', `${state.completedRaids.length}/${RAIDS.length}`],
    ['Sets completed', `${setsCompleted}/${ITEM_SETS.length}`],
    ['Upgrades completed', `${upgradesMaxed}/${upgradesTotal}`],
    ['Pet breeds collected', `${petBreedsCollected}/${PETS.length}`],
    ['Total play time', formatPlayTime(stats.playTimeMs)],
    ['Total offline time', formatPlayTime(stats.offlineTimeMs)],
    ['Retirements', stats.prestigeCount.toLocaleString()],
    ['Guild founded', new Date(stats.firstPlayedAt).toLocaleDateString()],
  ];

  return (
    <>
      <h2>Statistics</h2>
      <p className="subtitle">Everything the guild scribe has bothered to write down.</p>

      <div className="section-heading">Achievements ({achProgress.unlocked}/{achProgress.total})</div>
      <div className="grid three" style={{ marginBottom: 8 }}>
        {AchievementManager.list().map((def) => {
          const unlockedAt = engine.state.unlockedAchievements[def.id];
          const unlocked = unlockedAt !== undefined;
          const showHidden = def.hidden && !unlocked;
          return (
            <div key={def.id} className={`card achievement-card ${unlocked ? 'unlocked' : ''}`} style={{ marginBottom: 0 }}>
              <div className="card-title" style={{ fontSize: 11 }}>
                {unlocked ? '🏆' : '🔒'} {showHidden ? '???' : def.name}
              </div>
              <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                {showHidden ? 'Hidden until unlocked.' : def.description}
              </p>
              {unlocked && (
                <p className="tiny" style={{ margin: '4px 0 0', color: 'var(--brass)' }}>
                  {new Date(unlockedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid two">
        {rows.map(([label, value]) => (
          <div key={label} className="spread card" style={{ marginBottom: 0 }}>
            <span className="small muted">{label}</span>
            <b className="small">{value}</b>
          </div>
        ))}
      </div>

      <div className="section-heading">Recent quests</div>
      {engine.state.log.length === 0 && <p className="small muted">No quests yet. The board is waiting.</p>}
      {engine.state.log.slice(0, 20).map((result) => (
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
            {result.loot.map((l) => <span key={l.defId}>◇ {l.name}</span>)}
            {result.injury && <span className="bad">{result.injury.name}</span>}
            <span className="muted">{new Date(result.resolvedAt).toLocaleString()}</span>
          </div>
        </div>
      ))}

      {/* Raids resolve into `state.raidLog` exactly the same way quests
          resolve into `state.log` above (see RaidManager.resolve, capped
          at 30 entries the same way `log` is capped at 60) -- that log
          was already being written on every raid, live or offline, it
          just had nowhere to be read back afterward. Reported directly:
          raids had no way to look back at what happened once the
          transient RaidResultModal/OfflineReportModal card was
          dismissed, unlike quests which always had this section. Mirrors
          "Recent quests" above card-for-card, just keyed on
          raidId+resolvedAt (a raid has no single stable id the way a
          quest's questId is unique per attempt) and colored by
          difficulty the same way OfflineReportModal's own raid cards
          already are. */}
      <div className="section-heading">Recent raids</div>
      {engine.state.raidLog.length === 0 && <p className="small muted">No raids yet. Send the guild once raids unlock.</p>}
      {engine.state.raidLog.slice(0, 20).map((raid) => (
        <div
          key={`${raid.raidId}-${raid.resolvedAt}`}
          className="card"
          style={{ borderLeftColor: RAID_DIFFICULTY_COLOR[raid.difficulty] }}
        >
          <div className="spread">
            <span className="card-title">{raid.raidName} — {RAID_DIFFICULTY_LABEL[raid.difficulty]}</span>
            <span className={`small ${raid.fullClear ? 'good' : raid.encountersCleared > 0 ? '' : 'bad'}`}>
              {raid.fullClear ? 'Full clear' : `${raid.encountersCleared}/${raid.totalEncounters}`}
            </span>
          </div>
          <div className="stat-row" style={{ marginTop: 4 }}>
            <span className="gold-text">+{formatGold(raid.gold)}</span>
            <span>+{raid.xp} xp</span>
            {raid.loot.map((l, i) => <span key={`${l.defId}-${i}`}>◇ {l.name}</span>)}
            {raid.injuries.map((inj) => <span key={inj.heroId} className="bad">{inj.heroName}: {inj.injury.name}</span>)}
            <span className="muted">{new Date(raid.resolvedAt).toLocaleString()}</span>
          </div>
        </div>
      ))}

      <div className="section-heading">Save data</div>
      <div className="row wrap">
        <button onClick={() => void engine.saveNow()}>Save now</button>
        <button
          onClick={async () => {
            const folder = await window.littleKnight?.saveFolder();
            engine.clearToast();
            setSaveLocationMessage(folder ? `Save file lives in:\n${folder}` : 'Running in a browser: the save is in localStorage.');
          }}
        >
          Where is my save?
        </button>
        <button
          className="btn-danger"
          onClick={() => setPendingHardReset(true)}
        >
          Start a new guild
        </button>
      </div>

      {saveLocationMessage && (
        <ConfirmModal
          title="Where is my save?"
          message={saveLocationMessage}
          infoOnly
          onConfirm={() => setSaveLocationMessage(null)}
          onCancel={() => setSaveLocationMessage(null)}
        />
      )}
      {pendingHardReset && (
        <ConfirmModal
          title="Start a new guild"
          message="Delete this guild and start over? This cannot be undone."
          confirmLabel="Delete & start over"
          danger
          onConfirm={() => { engine.hardReset(); setPendingHardReset(false); }}
          onCancel={() => setPendingHardReset(false)}
        />
      )}
    </>
  );
}
