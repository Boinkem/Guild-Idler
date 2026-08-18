import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { OnboardingTour } from './OnboardingTour';
import { ChainDiscoveryModal } from './ChainDiscoveryModal';
import { formatGold, formatNumber } from '../game/util';
import { attentionCounts } from '../game/attention';
import { PeddlerManager } from '../game/managers/PeddlerManager';
import { playSound } from '../game/sound';
import { useCountUp } from './useCountUp';
import { useFlyTargetRef, registerFlyTarget } from './flyTarget';
import { QuestPanel } from './panels/QuestPanel';
import { DiscoveredQuestsPanel } from './panels/DiscoveredQuestsPanel';
import { HeroesPanel } from './panels/HeroesPanel';
import { TrainingPanel } from './panels/TrainingPanel';
import { EquipmentPanel } from './panels/EquipmentPanel';
import { VendorsPanel } from './panels/VendorsPanel';
import { GuildPanel } from './panels/GuildPanel';
import { HarvestPanel } from './panels/HarvestPanel';
import { HatcheryPanel } from './panels/HatcheryPanel';
import { PeddlerPanel } from './panels/PeddlerPanel';
import { GuidePanel } from './panels/GuidePanel';
import { LorePanel } from './panels/LorePanel';
import { RaidsPanel } from './panels/RaidsPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { StatsPanel } from './panels/StatsPanel';
import { PrestigePanel } from './panels/PrestigePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { TestingPanel } from './panels/TestingPanel';
import { TESTING_TOOLS_ENABLED } from '../game/testingTools';

/**
 * Grouped rather than one flat 13-entry list -- the nav had grown past the
 * point a plain list stays scannable. Dashboard stays pinned/ungrouped
 * (it's home, not a category); everything else clusters by what kind of
 * session moment it belongs to. Guide sits with Adventure rather than off
 * alone, since it's reference material *for* those systems specifically,
 * not a general-purpose destination. Statistics and Settings pair up as
 * the two "not actively playing" destinations.
 *
 * Kept as one const-asserted structure (not a runtime-built one) so TabId
 * below stays derived from the literal ids rather than widened to `string`.
 */
// Each group gets its OWN `as const` rather than one wrapping the whole
// array -- a single outer `as const` can't correctly type a `tabs` field
// that's a different-length, different-content tuple per group; TS tries
// to force one uniform literal shape across every element and silently
// picks the first group's (dashboard-only), which is why every other
// group's tab ids failed to typecheck. Individually-const-asserted groups
// combined into a plain array let TS form the union correctly instead.
const DASHBOARD_GROUP = {
  label: null,
  tabs: [
    { id: 'dashboard', label: 'The Guild', Panel: DashboardPanel, tooltip: 'Overview of your guild, active heroes, and what needs attention.' },
  ],
} as const;
const GUILD_GROUP = {
  label: 'Guild',
  tabs: [
    { id: 'heroes', label: 'Heroes', Panel: HeroesPanel, tooltip: 'Recruit, level, and manage your roster of heroes.' },
    { id: 'training', label: 'Training', Panel: TrainingPanel, tooltip: 'Reassign a hero\u2019s Melee/Ranged/Caster role for raid parties.' },
    { id: 'equipment', label: 'Inventory', Panel: EquipmentPanel, tooltip: 'Gear and consumables in your stash, and what each hero has equipped.' },
    { id: 'vendors', label: 'Vendors', Panel: VendorsPanel, tooltip: 'Buy from the Blacksmith, Alchemist, and Enchanter, or craft your own gear.' },
    { id: 'guild', label: 'Guild Hall', Panel: GuildPanel, tooltip: 'Facility and permanent upgrades that boost the whole guild.' },
    { id: 'harvest', label: 'Harvest', Panel: HarvestPanel, tooltip: 'Idle heroes gather materials here -- spend the stock crafting or sell it.' },
    { id: 'hatchery', label: 'Hatchery', Panel: HatcheryPanel, tooltip: 'Incubate eggs into pets, then equip one to accompany the guild.' },
    { id: 'peddler', label: 'Grimsby', Panel: PeddlerPanel, tooltip: 'A wandering chance merchant -- pay for a card, see what happens.' },
  ],
} as const;
const ADVENTURE_GROUP = {
  label: 'Adventure',
  tabs: [
    { id: 'quests', label: 'Quests', Panel: QuestPanel, tooltip: 'The quest board -- each hero\'s own contracts, scaled to their level.' },
    { id: 'chains', label: 'Discovered Quests', Panel: DiscoveredQuestsPanel, tooltip: 'Story quest chains your heroes have uncovered on the board.' },
    { id: 'raids', label: 'Raids', Panel: RaidsPanel, tooltip: 'Multi-encounter raids for a full party, with their own difficulty tiers.' },
    { id: 'lore', label: 'Lore', Panel: LorePanel, tooltip: 'The story so far -- every quest chain you\u2019ve uncovered.' },
    { id: 'guide', label: 'Guide', Panel: GuidePanel, tooltip: 'Notification log and how-to reference for the guild\u2019s systems.' },
  ],
} as const;
const PROGRESSION_GROUP = {
  label: 'Progression',
  tabs: [
    { id: 'prestige', label: 'Prestige', Panel: PrestigePanel, tooltip: 'Retire your guild for renown and permanent perks, and start again.' },
  ],
} as const;
const META_GROUP = {
  label: 'Meta',
  tabs: [
    { id: 'stats', label: 'Statistics', Panel: StatsPanel, tooltip: 'Lifetime stats and achievements for this guild.' },
    { id: 'settings', label: 'Settings', Panel: SettingsPanel, tooltip: 'Display, sound, and gameplay preferences.' },
    ...(TESTING_TOOLS_ENABLED ? [{ id: 'testing', label: 'Testing', Panel: TestingPanel, tooltip: 'Developer-only tools for skipping ahead and spawning test content.' }] as const : []),
  ],
} as const;

// TabId built from each group's OWN literal type individually, not by
// indexing into a combined array -- combining differently-shaped readonly
// tuples into one array and asking TS to infer *that* array's element type
// hits the same "tries to force one common tuple shape" problem as the
// outer `as const` did, just one level later. Deriving the union directly
// from each still-precisely-typed group sidesteps it entirely.
type TabId =
  | (typeof DASHBOARD_GROUP)['tabs'][number]['id']
  | (typeof GUILD_GROUP)['tabs'][number]['id']
  | (typeof ADVENTURE_GROUP)['tabs'][number]['id']
  | (typeof PROGRESSION_GROUP)['tabs'][number]['id']
  | (typeof META_GROUP)['tabs'][number]['id'];

interface TabGroup {
  label: string | null;
  tabs: readonly { id: TabId; label: string; Panel: () => JSX.Element; tooltip: string }[];
}

// Explicit TabGroup[] annotation here, rather than letting TS infer the
// array's type from the literal -- this is what actually breaks the
// inference problem: each group widens to fit the given interface instead
// of TS trying to compute a common shape across all five on its own.
const TAB_GROUPS: TabGroup[] = [DASHBOARD_GROUP, GUILD_GROUP, ADVENTURE_GROUP, PROGRESSION_GROUP, META_GROUP];

/** Flattened purely for runtime lookup (finding the active Panel) -- the
 *  grouped structure above is what actually drives rendering and typing. */
const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);

/**
 * The "?" breakdown for whichever tab is currently open -- a few bullet
 * points on exactly what lives in and can be done from that tab, on
 * demand rather than only during the first-run tour. Same relationship to
 * the tab's own one-line `tooltip` above as OnboardingTour's
 * STEP_DESCRIPTIONS has to a tour step's label: the tooltip is a glance,
 * this is the actual explanation. Kept as its own map here (not folded
 * into each tab's config object above) for the same reason
 * STEP_DESCRIPTIONS lives in OnboardingTour.tsx rather than in TAB_GROUPS
 * -- this is content for one specific piece of UI, not nav config.
 * `Partial` + a missing-entry fallback (see the render site) means a
 * future new tab never breaks this by needing an entry here first;
 * 'testing' has none on purpose, same as it's excluded from the main
 * tour's own steps.
 */
const PANEL_BREAKDOWNS: Partial<Record<TabId, string[]>> = {
  dashboard: [
    'Needs attention flags idle heroes, ready eggs, broken gear, and harvest nodes waiting on you.',
    'Recent outcomes shows your last few quests and raids -- View all opens the full log in Statistics.',
    "Tap the Guild Power number for a breakdown of exactly what it's made of.",
  ],
  heroes: [
    'Your roster -- stats, gear, and skins for every hero recruited so far.',
    'Recruit fills an empty slot; slots expand as the guild grows.',
    "Skins are cosmetic only, separate from a hero's own gear.",
  ],
  training: [
    "Reassign a hero's battlefield role -- Melee, Ranged, or Caster -- for a gold cost.",
    "Role only matters for raid party composition; quests don't care which role a hero is set to.",
    "Unlocks once the guild clears its first raid, Blackford Keep.",
  ],
  equipment: [
    "Everything the guild owns: gear worn by each hero, the shared stash, and consumables.",
    'Crafting materials and curios live here too, alongside anything not currently equipped.',
    'Broken gear shows up here (and on the nav badge) until repaired or replaced.',
  ],
  vendors: [
    'The Blacksmith, Alchemist, and Enchanter -- each has its own stock, upgrades, and crafting.',
    'Buy from current stock, or spend materials crafting your own gear and consumables.',
    'Sell from the stash for gold, with a limited-time buyback if you change your mind.',
  ],
  guild: [
    'Guild Hall: permanent Facility and general Upgrades that apply to every hero, guild-wide.',
    'Costs scale with level -- there’s always a next tier to save toward.',
  ],
  harvest: [
    'Idle heroes gather materials automatically -- click a shiny node while it lasts for a bonus.',
    'Warehouse holds the stock; Fields shows what’s currently growing and ready to collect.',
    'Spend the stock crafting with a vendor, or sell it directly.',
  ],
  hatchery: [
    'Eggs incubate here, hatching as your heroes earn XP -- no separate timer to manage.',
    'A hatched pet can be equipped to lend the whole guild a small bonus.',
    "Unlocks once the guild's first egg actually drops.",
  ],
  peddler: [
    'Grimsby is a wandering chance merchant -- pay for a card, see what happens.',
    'He shows up on his own schedule; the nav badge flags it when he’s around.',
    "Unlocks after completing his own introductory questline.",
  ],
  quests: [
    'The quest board -- each hero keeps their own pool of contracts, sized to their own level.',
    'Send a hero out, or chain multiple quests in a row once Auto-Chain unlocks.',
    "Discovered story chains show here too, once a hero's high enough level to attempt them.",
  ],
  raids: [
    'Multi-hero expeditions -- bigger rewards, longer odds, and the whole party is committed until it resolves.',
    'Pick a difficulty tier and see each encounter’s odds before sending the party in.',
    "The Quartermaster's Den holds raid-only upgrades that never affect regular quests.",
  ],
  lore: [
    "The story so far -- every quest chain your guild has uncovered, underway or completed.",
    'Raids and the Collection (item sets found) each get their own sub-tab here too.',
  ],
  guide: [
    "A running log of what's happened -- notifications archive here once read.",
    'Also doubles as a quick reference for how the guild’s systems actually work.',
  ],
  prestige: [
    'Retire a hero for Renown, spent on permanent guild-wide perks.',
    'Renown and its perks persist even through a full guild reset.',
  ],
  stats: [
    'Overview -- lifetime totals for the guild: quests run, gold earned, and more.',
    'Achievements -- every milestone unlocked so far.',
    'Recent results -- a browsable log of past quests and raids; click a card for the full breakdown.',
  ],
  settings: [
    'Appearance, sound, and gameplay preferences -- all per-device, saved instantly.',
    "Never touches your guild's actual progress or save file.",
  ],
};

export function MenuWindow({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const { settings, update } = useSettings();
  const [tab, setTab] = useState<TabId>(() => (engine.consumeRequestedTab() as TabId) ?? 'dashboard');
  const [onTop, setOnTop] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // Forces the full first-run tour back open on demand, regardless of
  // `state.seenOnboarding` -- set by the header's "?" button below. Local
  // UI state, not persisted: replaying the tour is a one-off ask each
  // time, not something that itself needs to survive a restart.
  const [manualTourOpen, setManualTourOpen] = useState(false);
  // Whether the current tab's PANEL_BREAKDOWNS popover is open -- also
  // local/unpersisted, and explicitly closed on every tab switch below so
  // switching tabs never leaves a stale breakdown floating over the new
  // panel.
  const [showPanelHelp, setShowPanelHelp] = useState(false);
  useEffect(() => setShowPanelHelp(false), [tab]);

  // Nav-bar hover/focus tick (see sound.ts's `hover` cue). Sweeping the
  // pointer across the whole tab list -- or holding Tab to move focus
  // through it -- can fire this many times a second; the throttle keeps
  // rapid re-triggers from overlapping into a buzz instead of a row of
  // distinct ticks. A plain mutable ref rather than state, since the
  // value only needs to gate a side effect and should never itself
  // trigger a re-render.
  const lastTabTick = useRef(0);
  const tickTabHover = () => {
    const now = Date.now();
    if (now - lastTabTick.current < 50) return;
    lastTabTick.current = now;
    playSound('hover');
  };

  useEffect(() => {
    void window.littleKnight?.getAlwaysOnTop().then(setOnTop);
  }, []);

  useEffect(() => {
    void window.littleKnight?.getFullscreen().then(setFullscreen);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Handles a tab request made AFTER this component already mounted --
  // the initial useState above only ever reads consumeRequestedTab() once,
  // at mount, which is correct for "menu opened via a request" but does
  // nothing for "menu already open, something inside it (e.g. a Guide
  // notification's Go-to button) wants to switch tabs." engine.requestTab()
  // now calls notify() specifically so this effect re-runs when a new
  // request comes in while already mounted, not just on the next mount.
  useEffect(() => {
    if (engine.requestedTab) {
      setTab(engine.consumeRequestedTab() as TabId);
    }
  }, [engine, engine.requestedTab]);

  // Looked up once and reused below for both the rendered Panel and the
  // "?" breakdown popover's title -- previously just `.Panel` was pulled
  // off this same find(), so this is the same lookup, not an extra one.
  const activeTabDef = ALL_TABS.find((t) => t.id === tab)!;
  const Panel = activeTabDef.Panel;
  const panelBreakdown = PANEL_BREAKDOWNS[tab];
  // Shared by the nav filter below and the tour's own step list --
  // previously the tour hardcoded its own separate exclusion list
  // ('hatchery'/'peddler' always skipped, regardless of whether they'd
  // actually unlocked), which only happened to match the nav because a
  // brand-new save always has both locked at the exact moment the
  // first-run tour fires. That coupling breaks for an on-demand replay
  // later in the game, once either (or Harvest/Training) really has
  // unlocked -- a replay should show every tab actually in the nav right
  // now, not the fresh-save snapshot. One predicate, used both places, so
  // they can't drift apart again the way that duplication already had.
  const isTabVisible = (id: TabId) => (id === 'hatchery' ? engine.state.hatcheryUnlocked
    : id === 'peddler' ? engine.state.peddlerUnlocked
    : id === 'harvest' ? engine.state.harvestUnlocked
    : id === 'training' ? engine.state.completedRaids.includes('blackford_keep') : true);
  const { idleHeroes, eggsReady, brokenGear, harvestReady, chainQuestAvailable } = attentionCounts(engine.state);
  // Nav gold/renown count up to a new value rather than snapping -- the
  // numeric equivalent of the .bar fill transition. No animation on first
  // mount/app launch (see useCountUp's own doc comment); only on values
  // that change after that.
  const displayGold = useCountUp(engine.state.gold);
  const goldRef = useFlyTargetRef<HTMLSpanElement>('gold');
  const displayRenown = useCountUp(engine.state.renown);
  const unreadCount = engine.unreadNotificationCount;

  return (
    <div className="menu-root" style={{ position: 'relative' }}>
      {/*
        Subtle background art behind the whole menu tool. Faded via a
        separate layer (not the image's own opacity) so it never washes out
        the panel content drawn on top. A missing file just paints nothing,
        so this is safe to ship before art lands -- same pattern as the Lore
        tab's per-chain card backgrounds.
      */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${tab === 'raids' ? './lore/raids-bg.jpg' : tab === 'hatchery' ? './lore/hatchery-bg.jpg' : tab === 'peddler' ? './lore/peddler-bg.png' : './lore/guild-hall-bg.jpg'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
      <header className="titlebar" style={{ position: 'relative' }}>
        <h1>{engine.state.guildName || 'Guildbound'}</h1>
        <div className="resources">
          <span ref={goldRef} className="gold">◆ {formatGold(displayGold)} / {formatGold(engine.goldStorage)}</span>
          <span className="renown">✦ {formatNumber(displayRenown)} renown</span>
          <button
            className="header-notif-icon"
            onClick={() => engine.requestTab('guide')}
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
          >
            🔔
            {unreadCount > 0 && (
              <span className="header-notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
        </div>
        <div className="spacer" />
        {/* Quick mute -- same underlying settings as Settings -> Sound /
            Settings -> Music (soundEnabled + musicEnabled together), just
            reachable without leaving whatever tab you're on. Reflects
            "is anything actually audible right now" (either one being on
            counts as unmuted) and toggles both to the opposite of that
            combined state -- a genuine master mute/unmute, not a third
            independent setting to keep in sync with the other two. */}
        <button
          className="btn-ghost"
          onClick={() => {
            const next = !(settings.soundEnabled || settings.musicEnabled);
            update('soundEnabled', next);
            update('musicEnabled', next);
          }}
          title={settings.soundEnabled || settings.musicEnabled ? 'Mute all audio' : 'Unmute audio'}
        >
          {settings.soundEnabled || settings.musicEnabled ? '\ud83d\udd0a' : '\ud83d\udd07'}
        </button>
        <button
          className="btn-ghost"
          onClick={async () => {
            const next = await window.littleKnight?.setAlwaysOnTop(!onTop);
            setOnTop(next ?? !onTop);
          }}
        >
          {onTop ? 'On top: on' : 'On top: off'}
        </button>
        {/* Menu-only -- the idle companion is never fullscreenable in the
            first place (see electron/main.ts's own window:setMode), so this
            button only ever renders here, not anywhere the companion shows.
            Falls back to a plain toggle of local state (`!fullscreen`) if
            littleKnight is unavailable (the browser dev:web build), same
            shape the "On top" button above already uses. */}
        <button
          className="btn-ghost"
          onClick={async () => {
            const next = await window.littleKnight?.setFullscreen(!fullscreen);
            setFullscreen(next ?? !fullscreen);
          }}
          title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {fullscreen ? '🗗 Windowed' : '⛶ Fullscreen'}
        </button>
        {/* Brings the first-run tour back on demand -- previously it only
            ever ran once (gated on !state.seenOnboarding, see below), with
            no way to see it again short of a hard reset. Sets local
            `manualTourOpen` rather than clearing state.seenOnboarding
            itself, so replaying it doesn't also re-arm it to auto-fire
            again on the next launch. */}
        <button
          className="btn-ghost"
          onClick={() => setManualTourOpen(true)}
          title="Replay the guild tour"
        >
          ❓ Tour
        </button>
        <button className="btn-ghost" onClick={onClose}>Back to desktop</button>
      </header>

      <div className="menu-body" style={{ position: 'relative' }}>
        <nav className="tabs" aria-label="Guild sections">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label ?? `pinned-${gi}`} className="tabs-group">
              {group.label && <div className="tabs-group-label">{group.label}</div>}
              {group.tabs
                // Hatchery/Grimsby/Harvest are the nav entries that don't
                // always exist -- all three hidden entirely until their
                // own intro chain completes, rather than shown-but-locked
                // the way e.g. Raids' own internal gating works. Training
                // (patch 0142) is a fourth: hidden until Blackford Keep
                // is cleared (the guild's first raid, "the Siege" --
                // narratively the moment training stops being optional),
                // derived directly from state.completedRaids rather than
                // its own boolean flag -- completedRaids already exists
                // and is reliable on every save, so there's no migration
                // to write and no second source of truth to keep in sync.
                // Once visible, it still shows a locked screen internally
                // (a "Fund Training" purchase) same as Raids' own pattern
                // -- see TrainingPanel.tsx. Every other tab id has no
                // visibility condition at all, hence `?? true`. Harvest is
                // the odd one out here (see GameState.harvestUnlocked's
                // own comment) -- it's the only one of the three that
                // could already be true for a save that predates this
                // gate entirely, via the SaveManager migration's
                // grandfather path rather than ever actually completing
                // the_first_haul.
                .filter((t) => isTabVisible(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    data-tab-id={t.id}
                    aria-current={t.id === tab}
                    onClick={() => setTab(t.id)}
                    onMouseEnter={tickTabHover}
                    onFocus={tickTabHover}
                    title={t.tooltip}
                    // The Equipment tab (labeled "Inventory") doubles as the
                    // shared 'inventory' fly-target -- anywhere a
                    // material/equipment/egg reward flies toward "the
                    // inventory" (see Grimsby's own reward-burst) lands
                    // here, same registry gold already uses for its own
                    // header target just below in this same nav.
                    ref={t.id === 'equipment' ? (el) => registerFlyTarget('inventory', el) : undefined}
                    // Rotating border-light rather than a numeric badge --
                    // see chainQuestAvailable's own comment in attention.ts
                    // for why a boolean fits this signal better than a
                    // count. className stays plain (no ternary-into-empty-
                    // string) since every other tab button already omits
                    // a className entirely; conditionally adding one here
                    // only for 'chains' keeps that same "absent unless
                    // needed" shape rather than every button carrying a
                    // now-always-present empty className.
                    className={t.id === 'chains' && chainQuestAvailable ? 'chain-available' : undefined}
                  >
                    {t.label}
                    {t.id === 'quests' && idleHeroes > 0 ? <span className="tab-badge">{idleHeroes}</span> : null}
                    {t.id === 'hatchery' && eggsReady > 0 ? <span className="tab-badge">{eggsReady}</span> : null}
                    {t.id === 'equipment' && brokenGear > 0 ? <span className="tab-badge broken">{brokenGear}</span> : null}
                    {t.id === 'harvest' && harvestReady > 0 ? <span className="tab-badge">{harvestReady}</span> : null}
                    {t.id === 'peddler' && engine.state.peddlerUnlocked && PeddlerManager.isPresent(engine.state) ? <span className="tab-badge">!</span> : null}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <main className="panel">
          <Panel />
        </main>
        {/* Per-tab "what can I do in here" breakdown -- lives in this
            outer, non-scrolling `.menu-body` (already `position:
            relative`) rather than inside `.panel` itself, so the button
            stays pinned in the corner instead of scrolling away with a
            long panel's own content. Only renders a button at all when
            PANEL_BREAKDOWNS actually has an entry for the current tab, same
            "quietly absent rather than a broken/empty popover" fallback
            STEP_DESCRIPTIONS' own missing-id case already uses. */}
        {panelBreakdown && (
          <>
            <button
              className="btn-ghost panel-help-btn"
              style={{ position: 'absolute', top: 10, right: 16, zIndex: 5 }}
              onClick={() => setShowPanelHelp((v) => !v)}
              title={`What can I do in ${activeTabDef.label}?`}
              aria-expanded={showPanelHelp}
            >
              ?
            </button>
            {showPanelHelp && (
              <div className="card panel-help-card" style={{ position: 'absolute', top: 42, right: 16, width: 260, zIndex: 6 }}>
                <div className="spread">
                  <span className="card-title">{activeTabDef.label}</span>
                  <button className="btn-ghost" onClick={() => setShowPanelHelp(false)} aria-label="Close">×</button>
                </div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                  {panelBreakdown.map((line, i) => (
                    <li key={i} className="small" style={{ marginBottom: 4 }}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Both prompts below are gated on the guild already having a name.
          Without this, a brand-new save (or a hardReset()) lands here with
          guildName === '' and seenOnboarding === false at the same time --
          MenuWindow mounts to give GuildNamingModal room to render (see
          App.tsx), but nothing previously stopped the tour from also
          starting right then. The tour's z-index is deliberately way above
          normal modals (see the onboarding-tour comment in app.css), so it
          won a fight it should never have been in: naming has to resolve
          first, only then prompts. */}
      {/* Fires automatically the first time (!seenOnboarding), or any time
          after that via the header's "Tour" button (manualTourOpen) --
          see isTabVisible above for why 'hatchery'/'peddler' no longer
          need a hardcoded exclusion here: on a fresh save they're simply
          not unlocked yet, so isTabVisible already drops them the exact
          same way it does for the nav itself, and a later replay
          correctly includes them once they are unlocked. They still get
          their own one-off single-step spotlight the moment each first
          unlocks (pendingHatcherySpotlight/pendingPeddlerSpotlight below)
          -- that's a separate, timing-driven nudge, not a substitute for
          seeing them in a full replay. */}
      {engine.state.guildName !== '' && (!engine.state.seenOnboarding || manualTourOpen) && (
        <OnboardingTour
          steps={ALL_TABS.filter((t) => t.id !== 'testing' && isTabVisible(t.id)).map((t) => ({ id: t.id, label: t.label }))}
          onTabChange={(id) => setTab(id as TabId)}
          onDone={() => { engine.dismissOnboarding(); setManualTourOpen(false); }}
        />
      )}
      {engine.state.guildName !== '' && engine.state.pendingChainDiscovery && (
        <ChainDiscoveryModal
          onView={() => { setTab('quests'); engine.dismissChainDiscovery(); }}
          onClose={() => engine.dismissChainDiscovery()}
        />
      )}
      {/* One-step reuse of the same OnboardingTour spotlight component,
          fired the moment the Hatchery chain completes rather than as part
          of the fixed first-run tour above (its timing depends on when the
          player finishes that chain, not a fixed step count -- same
          reasoning as pendingChainDiscovery's own standalone modal). */}
      {engine.state.guildName !== '' && engine.state.pendingHatcherySpotlight && (
        <OnboardingTour
          steps={[{ id: 'hatchery', label: 'Hatchery' }]}
          onTabChange={(id) => setTab(id as TabId)}
          onDone={() => engine.dismissHatcherySpotlight()}
        />
      )}
      {/* Same one-step reuse again, fired the moment "The Man Who Sells
          Maybe" completes rather than a fixed tour step -- his timing
          depends on when that chain finishes, not a fixed step count,
          same reasoning as the Hatchery's own spotlight just above. */}
      {engine.state.guildName !== '' && engine.state.pendingPeddlerSpotlight && (
        <OnboardingTour
          steps={[{ id: 'peddler', label: 'Grimsby' }]}
          onTabChange={(id) => setTab(id as TabId)}
          onDone={() => engine.dismissPeddlerSpotlight()}
        />
      )}
      {/* Same one-step reuse again, fired the moment `the_first_haul`
          completes rather than a fixed tour step -- see
          pendingHarvestSpotlight's own comment for why a save that
          reached harvestUnlocked via the SaveManager migration's
          grandfather path instead never actually reaches this block. */}
      {engine.state.guildName !== '' && engine.state.pendingHarvestSpotlight && (
        <OnboardingTour
          steps={[{ id: 'harvest', label: 'Harvest' }]}
          onTabChange={(id) => setTab(id as TabId)}
          onDone={() => engine.dismissHarvestSpotlight()}
        />
      )}
    </div>
  );
}
