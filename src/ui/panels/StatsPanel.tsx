import { useEffect, useState } from 'react';
import { useEngine } from '../useEngine';
import { isTabUnread } from '../../game/attention';
import { AchievementManager } from '../../game/managers/AchievementManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { GUILD_FACILITIES, UPGRADES } from '../../game/data/progression';
import { RAID_UPGRADES } from '../../game/data/raidUpgrades';
import { ITEM_SETS } from '../../game/data/equipment';
import { RAIDS, RAID_DIFFICULTY_LABEL } from '../../game/data/raids';
import { PETS } from '../../game/data/pets';
import { QuestResult, RaidResult, RaidDifficulty } from '../../game/types';
import { formatGold, formatPlayTime, RARITY_COLOR } from '../../game/util';
import { ConfirmModal } from '../ConfirmModal';
import { RarityPill } from '../RarityPill';
import { MATERIAL_BY_ID } from '../../game/data/materials';
import { CURIO_BY_ID } from '../../game/data/curios';

/** Same rarity-parallel palette RaidsPanel/OfflineReportModal already use
 *  for Normal/Heroic/Legendary -- kept local rather than shared, matching
 *  how OfflineReportModal already duplicates this same small map rather
 *  than importing it from RaidsPanel. */
const RAID_DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, legendary: RARITY_COLOR.epic,
};

/** One row of the merged Recent Results feed -- a quest and a raid outcome
 *  carry different shapes (QuestResult vs RaidResult), so this is a thin
 *  discriminated wrapper just for sorting/rendering the two side by side,
 *  same "tag + keep the real object" shape DashboardPanel's own
 *  RecentOutcomesCard already uses for its home-tab version of this same
 *  merge. `key`/`resolvedAt` are pulled out once here rather than
 *  re-derived at every render site below. */
type ResultEntry =
  | { kind: 'quest'; key: string; resolvedAt: number; data: QuestResult }
  | { kind: 'raid'; key: string; resolvedAt: number; data: RaidResult };

/**
 * Full breakdown for a single past quest or raid -- gold, XP, every item
 * found, injuries/breakages, opened from clicking its compact card in the
 * Recent Results tab. Deliberately NOT QuestResultModal/RaidResultModal
 * reused wholesale: those are live-moment celebrations (count-up numbers,
 * particle bursts, a dismiss timer) built for the instant something
 * resolves, not for browsing something that already happened and finished
 * animating minutes or days ago. This is the plain, static "what happened"
 * read of the same result data instead, closer in spirit to
 * OfflineReportModal's own already-resolved-so-just-show-it cards.
 */
function ResultDetailModal({ entry, onClose }: { entry: ResultEntry; onClose: () => void }) {
  const isQuest = entry.kind === 'quest';
  const quest = isQuest ? (entry.data as QuestResult) : null;
  const raid = !isQuest ? (entry.data as RaidResult) : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {quest && (
          <>
            <h3>{quest.questName}</h3>
            <p className="small muted" style={{ marginTop: 0 }}>{quest.heroName}</p>
            <p className={quest.success ? 'good' : 'bad'} style={{ fontSize: 12 }}>
              {quest.success ? 'The contract is fulfilled.' : 'The contract failed.'}
            </p>
          </>
        )}
        {raid && (
          <>
            <h3>{raid.raidName}, {RAID_DIFFICULTY_LABEL[raid.difficulty]}</h3>
            <p className={`small ${raid.fullClear ? 'good' : raid.encountersCleared > 0 ? '' : 'bad'}`} style={{ marginTop: 0 }}>
              {raid.fullClear
                ? 'Full clear.'
                : raid.encountersCleared > 0
                  ? `Cleared ${raid.encountersCleared} of ${raid.totalEncounters} encounters before the party had to fall back.`
                  : 'The party was turned back at the first encounter.'}
            </p>
          </>
        )}

        <div className="stat-row" style={{ marginBottom: 10 }}>
          <span className="gold-text">+{formatGold(entry.data.gold)} gold</span>
          <span>+{entry.data.xp} xp</span>
          {quest && quest.levelsGained > 0 && <span className="good">+{quest.levelsGained} level{quest.levelsGained === 1 ? '' : 's'}</span>}
        </div>

        {((quest?.loot.length ?? 0) > 0 || (raid?.loot.length ?? 0) > 0) && (
          <>
            <div className="section-heading">Loot</div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              {(quest?.loot ?? raid?.loot ?? []).map((item, i) => (
                <span key={`${item.defId}-${i}`} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="tiny" style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</span>
                  <RarityPill rarity={item.rarity} />
                </span>
              ))}
            </div>
          </>
        )}

        {quest && (quest.materialGained || quest.eggDropped || quest.curioGained) && (
          <>
            <div className="section-heading">Also found</div>
            {quest.materialGained && quest.materialGained.amount > 0 && (
              <div className="small" style={{ marginBottom: 2 }}>
                +{quest.materialGained.amount} {MATERIAL_BY_ID[quest.materialGained.materialId]?.name ?? quest.materialGained.materialId}
              </div>
            )}
            {quest.eggDropped && (
              <div className="small" style={{ marginBottom: 2, color: RARITY_COLOR[quest.eggDropped.rarity] }}>
                A {quest.eggDropped.rarity} egg
              </div>
            )}
            {quest.curioGained && (
              <div className="small" style={{ marginBottom: 2 }}>
                {CURIO_BY_ID[quest.curioGained.curioId]?.name ?? 'A curio'}
                {quest.curioGained.amount > 1 ? ` ×${quest.curioGained.amount}` : ''}
              </div>
            )}
          </>
        )}

        {quest && (quest.injury || quest.brokenItems.length > 0) && (
          <>
            <div className="section-heading">Damage report</div>
            {quest.heroFallen && (
              <div className="small bad" style={{ fontWeight: 700 }}>
                {quest.heroName} has fallen. Revive them from the Heroes tab before sending them out again.
              </div>
            )}
            {quest.petFallen && (
              <div className="small bad" style={{ fontWeight: 700 }}>
                {quest.petFallen.petName} has fallen. Revive them from the Heroes tab.
              </div>
            )}
            {quest.injury && <div className="small bad">{quest.injury.name}. {quest.injury.description}</div>}
            {quest.brokenItems.length > 0 && <div className="small bad">Broken: {quest.brokenItems.join(', ')}</div>}
          </>
        )}

        {raid && (raid.injuries.length > 0 || raid.heroesFallen?.length || raid.petsFallen?.length) && (
          <>
            <div className="section-heading">Damage report</div>
            {raid.heroesFallen?.map((h) => (
              <div key={`fallen-${h.heroId}`} className="small bad" style={{ fontWeight: 700 }}>
                {h.heroName} has fallen. Revive them from the Heroes tab before sending them out again.
              </div>
            ))}
            {raid.petsFallen?.map((p, i) => (
              <div key={`pet-fallen-${i}`} className="small bad" style={{ fontWeight: 700 }}>
                {p.petName} has fallen. Revive them from the Heroes tab.
              </div>
            ))}
            {raid.injuries.map((i) => (
              <div key={i.heroId} className="small bad">{i.heroName}: {i.injury.name}</div>
            ))}
          </>
        )}

        <p className="tiny muted" style={{ marginTop: 10 }}>{new Date(entry.resolvedAt).toLocaleString()}</p>

        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

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

  // Same `btn-subtab` switcher RaidsPanel's Raids/Quartermaster split
  // already established -- Achievements and the stat-number grid used to
  // just be two stacked sections on one long page, with "Recent quests"/
  // "Recent raids" stacked below them; split into tabs directly per
  // request ("recent results new tab next to achievements") rather than
  // adding a 4th stacked section.
  const [subTab, setSubTab] = useState<'overview' | 'achievements' | 'results'>('overview');

  // Deep-link support for a notification's "Go to" button targeting a
  // specific Statistics sub-tab -- same consume-once shape every other
  // sub-tabbed panel uses.
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested === 'overview' || requested === 'achievements' || requested === 'results') setSubTab(requested);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever sub-tab is currently open -- on mount (the
  // default Overview) and again on every switch -- clearing the nav
  // shimmer for a banner-worthy notification targeting this specific
  // sub-tab (patch 0191).
  useEffect(() => {
    engine.acknowledgeTab('stats', subTab);
  }, [engine, subTab]);
  // Which past result's full detail (gold/items/xp) is currently open --
  // set by clicking a compact card in the Results tab below, cleared on
  // close. Holds the whole ResultEntry (not just an id) since a raid has
  // no single stable id to look it back up by, the same reasoning
  // "Recent raids" above already keys its rows on raidId+resolvedAt.
  const [selectedEntry, setSelectedEntry] = useState<ResultEntry | null>(null);

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
    // Per-source gold breakdown (patch 0268) -- a second, independent view
    // of the same overall gold flow above, split into where it actually
    // came from. Doesn't need to sum to `goldEarned`: that flat counter
    // has only ever tracked ordinary quest reward gold (see QuestManager.
    // resolve's own comment), never chain-completion bonus gold, raids,
    // or Grimsby, so this breakdown is deliberately the more complete
    // picture, not a re-slicing of the same total.
    ['Gold from quests', formatGold(stats.goldBySource.quests)],
    ['Gold from raids', formatGold(stats.goldBySource.raids)],
    ['Gold from selling items', formatGold(stats.goldBySource.sellingItems)],
    ['Gold from selling materials', formatGold(stats.goldBySource.sellingMaterials)],
    ['Gold from Grimsby', formatGold(stats.goldBySource.grimsby)],
    // Grimsby-specific -- reads its own dedicated counters (peddlerGoldSpent/
    // peddlerBusts, patch 0197) rather than deriving from the general
    // totals above, which mix in every other gold sink/loss in the game.
    // peddlerJackpots already existed (tracked since patch 0191-era work)
    // but was never actually surfaced anywhere on this tab until now.
    ['Gold spent at Grimsby', formatGold(stats.peddlerGoldSpent)],
    ['Grimsby jackpots', stats.peddlerJackpots.toLocaleString()],
    ['Grimsby busts', stats.peddlerBusts.toLocaleString()],
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

  // Merged, newest-first feed for the Recent Results tab -- same merge
  // DashboardPanel's own RecentOutcomesCard does for its home-tab
  // version, just unsliced here (both source logs are already capped --
  // 60 quests, 30 raids -- so at most 90 rows, fine for a dedicated,
  // scrollable tab rather than a glanceable home-tab card).
  const resultEntries: ResultEntry[] = [
    ...state.log.map((r): ResultEntry => ({ kind: 'quest', key: `quest-${r.questId}`, resolvedAt: r.resolvedAt, data: r })),
    ...state.raidLog.map((r): ResultEntry => ({ kind: 'raid', key: `raid-${r.raidId}-${r.resolvedAt}`, resolvedAt: r.resolvedAt, data: r })),
  ].sort((a, b) => b.resolvedAt - a.resolvedAt);

  return (
    <div className="tab-scene" style={{ backgroundImage: 'url(./lore/panels/settings.jpg)' }}>
      <div className="tab-scene-content">
      <h2>Statistics</h2>
      <p className="subtitle">Everything the guild scribe has bothered to write down.</p>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`btn-subtab ${subTab === 'overview' ? 'on' : ''} ${isTabUnread(state, 'stats', 'overview') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('overview')}
        >
          Overview
        </button>
        <button
          className={`btn-subtab ${subTab === 'achievements' ? 'on' : ''} ${isTabUnread(state, 'stats', 'achievements') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('achievements')}
        >
          Achievements ({achProgress.unlocked}/{achProgress.total})
        </button>
        <button
          className={`btn-subtab ${subTab === 'results' ? 'on' : ''} ${isTabUnread(state, 'stats', 'results') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('results')}
        >
          Recent results ({resultEntries.length})
        </button>
      </div>

      {subTab === 'overview' && (
        <div className="grid two">
          {rows.map(([label, value]) => (
            <div key={label} className="spread card" style={{ marginBottom: 0 }}>
              <span className="small muted">{label}</span>
              <b className="small">{value}</b>
            </div>
          ))}
        </div>
      )}

      {subTab === 'achievements' && (
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
      )}

      {/* Recent Results -- merged state.log/state.raidLog (see
          resultEntries above), newest first. Cards are deliberately
          condensed -- name, hero/difficulty, outcome, timestamp only --
          with gold/XP/loot/injuries moved behind a click into
          ResultDetailModal, same "collapsed list, full detail behind a
          click" shape RaidCard/RaidDetailModal already use elsewhere in
          this game, rather than repeating the older inline-everything
          card style "Recent quests"/"Recent raids" used before this tab
          existed. */}
      {subTab === 'results' && (
        <>
          {resultEntries.length === 0 && (
            <p className="small muted">Nothing finished yet. Send a hero out or start a raid.</p>
          )}
          {resultEntries.map((entry) => {
            const isQuest = entry.kind === 'quest';
            const quest = isQuest ? entry.data as QuestResult : null;
            const raid = !isQuest ? entry.data as RaidResult : null;
            const success = quest ? quest.success : raid!.fullClear;
            const outcomeLabel = quest
              ? (quest.success ? 'Success' : 'Failed')
              : (raid!.fullClear ? 'Full clear' : raid!.encountersCleared > 0 ? `${raid!.encountersCleared}/${raid!.totalEncounters}` : 'Retreated');
            return (
              <div
                key={entry.key}
                className="card result-card"
                style={{
                  cursor: 'pointer',
                  borderLeftColor: raid ? RAID_DIFFICULTY_COLOR[raid.difficulty] : undefined,
                }}
                onClick={() => setSelectedEntry(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedEntry(entry); } }}
              >
                <div className="spread">
                  <span className="card-title">
                    {raid ? '⚔ ' : ''}{quest ? quest.questName : raid!.raidName}
                  </span>
                  <span className={`small ${success ? 'good' : 'bad'}`}>{outcomeLabel}</span>
                </div>
                <div className="spread" style={{ marginTop: 2 }}>
                  <span className="tiny muted">{quest ? quest.heroName : RAID_DIFFICULTY_LABEL[raid!.difficulty]}</span>
                  <span className="tiny muted">{new Date(entry.resolvedAt).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {selectedEntry && <ResultDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}

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
      </div>
    </div>
  );
}
