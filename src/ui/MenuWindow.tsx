import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { OnboardingTour } from './OnboardingTour';
import { ChainDiscoveryModal } from './ChainDiscoveryModal';
import { formatGold, formatNumber } from '../game/util';
import { attentionCounts } from '../game/attention';
import { useCountUp } from './useCountUp';
import { useFlyTargetRef } from './flyTarget';
import { QuestPanel } from './panels/QuestPanel';
import { HeroesPanel } from './panels/HeroesPanel';
import { EquipmentPanel } from './panels/EquipmentPanel';
import { VendorsPanel } from './panels/VendorsPanel';
import { GuildPanel } from './panels/GuildPanel';
import { HarvestPanel } from './panels/HarvestPanel';
import { HatcheryPanel } from './panels/HatcheryPanel';
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
    { id: 'equipment', label: 'Inventory', Panel: EquipmentPanel, tooltip: 'Gear and consumables in your stash, and what each hero has equipped.' },
    { id: 'vendors', label: 'Vendors', Panel: VendorsPanel, tooltip: 'Buy from the Blacksmith, Alchemist, and Enchanter, or craft your own gear.' },
    { id: 'guild', label: 'Guild Hall', Panel: GuildPanel, tooltip: 'Facility and permanent upgrades that boost the whole guild.' },
    { id: 'harvest', label: 'Harvest', Panel: HarvestPanel, tooltip: 'Idle heroes gather materials here -- spend the stock crafting or sell it.' },
    { id: 'hatchery', label: 'Hatchery', Panel: HatcheryPanel, tooltip: 'Incubate eggs into pets, then equip one to accompany the guild.' },
  ],
} as const;
const ADVENTURE_GROUP = {
  label: 'Adventure',
  tabs: [
    { id: 'quests', label: 'Quests', Panel: QuestPanel, tooltip: 'The quest board and any quest chains your heroes have discovered.' },
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

export function MenuWindow({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const [tab, setTab] = useState<TabId>(() => (engine.consumeRequestedTab() as TabId) ?? 'dashboard');
  const [onTop, setOnTop] = useState(true);

  useEffect(() => {
    void window.littleKnight?.getAlwaysOnTop().then(setOnTop);
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

  const Panel = ALL_TABS.find((t) => t.id === tab)!.Panel;
  const { idleHeroes, eggsReady, brokenGear, harvestReady } = attentionCounts(engine.state);
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
          backgroundImage: `url(${tab === 'raids' ? './lore/raids-bg.jpg' : tab === 'hatchery' ? './lore/hatchery-bg.jpg' : './lore/guild-hall-bg.jpg'})`,
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
        <button
          className="btn-ghost"
          onClick={async () => {
            const next = await window.littleKnight?.setAlwaysOnTop(!onTop);
            setOnTop(next ?? !onTop);
          }}
        >
          {onTop ? 'On top: on' : 'On top: off'}
        </button>
        <button className="btn-ghost" onClick={onClose}>Back to desktop</button>
      </header>

      <div className="menu-body" style={{ position: 'relative' }}>
        <nav className="tabs" aria-label="Guild sections">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group.label ?? `pinned-${gi}`} className="tabs-group">
              {group.label && <div className="tabs-group-label">{group.label}</div>}
              {group.tabs
                // Hatchery is the one nav entry that doesn't always exist --
                // hidden entirely until its intro chain completes, rather
                // than shown-but-locked the way e.g. Raids' own internal
                // gating works. Every other tab id has no visibility
                // condition at all, hence the `?? true`.
                .filter((t) => (t.id === 'hatchery' ? engine.state.hatcheryUnlocked : true))
                .map((t) => (
                  <button
                    key={t.id}
                    data-tab-id={t.id}
                    aria-current={t.id === tab}
                    onClick={() => setTab(t.id)}
                    title={t.tooltip}
                  >
                    {t.label}
                    {t.id === 'quests' && idleHeroes > 0 ? <span className="tab-badge">{idleHeroes}</span> : null}
                    {t.id === 'hatchery' && eggsReady > 0 ? <span className="tab-badge">{eggsReady}</span> : null}
                    {t.id === 'equipment' && brokenGear > 0 ? <span className="tab-badge broken">{brokenGear}</span> : null}
                    {t.id === 'harvest' && harvestReady > 0 ? <span className="tab-badge">{harvestReady}</span> : null}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <main className="panel">
          <Panel />
        </main>
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
      {engine.state.guildName !== '' && !engine.state.seenOnboarding && (
        <OnboardingTour
          // 'hatchery' excluded here too -- a genuinely fresh save never has
          // it unlocked yet (see the nav filter above), so measuring its
          // (nonexistent) nav button would just return null and produce a
          // broken step. It gets its own single-step spotlight instead, the
          // moment it actually unlocks -- see pendingHatcherySpotlight below.
          steps={ALL_TABS.filter((t) => t.id !== 'testing' && t.id !== 'hatchery').map((t) => ({ id: t.id, label: t.label }))}
          onTabChange={(id) => setTab(id as TabId)}
          onDone={() => engine.dismissOnboarding()}
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
    </div>
  );
}
