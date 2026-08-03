import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { formatGold } from '../game/util';
import { QuestPanel } from './panels/QuestPanel';
import { HeroesPanel } from './panels/HeroesPanel';
import { EquipmentPanel } from './panels/EquipmentPanel';
import { ShopPanel } from './panels/ShopPanel';
import { UpgradesPanel } from './panels/UpgradesPanel';
import { GuildPanel } from './panels/GuildPanel';
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
    { id: 'dashboard', label: 'The Guild', Panel: DashboardPanel },
  ],
} as const;
const GUILD_GROUP = {
  label: 'Guild',
  tabs: [
    { id: 'heroes', label: 'Heroes', Panel: HeroesPanel },
    { id: 'equipment', label: 'Inventory', Panel: EquipmentPanel },
    { id: 'shop', label: 'Shop', Panel: ShopPanel },
    { id: 'guild', label: 'Guild Hall', Panel: GuildPanel },
  ],
} as const;
const ADVENTURE_GROUP = {
  label: 'Adventure',
  tabs: [
    { id: 'quests', label: 'Quests', Panel: QuestPanel },
    { id: 'raids', label: 'Raids', Panel: RaidsPanel },
    { id: 'lore', label: 'Lore', Panel: LorePanel },
    { id: 'guide', label: 'Guide', Panel: GuidePanel },
  ],
} as const;
const PROGRESSION_GROUP = {
  label: 'Progression',
  tabs: [
    { id: 'upgrades', label: 'Upgrades', Panel: UpgradesPanel },
    { id: 'prestige', label: 'Prestige', Panel: PrestigePanel },
  ],
} as const;
const META_GROUP = {
  label: 'Meta',
  tabs: [
    { id: 'stats', label: 'Statistics', Panel: StatsPanel },
    { id: 'settings', label: 'Settings', Panel: SettingsPanel },
    ...(TESTING_TOOLS_ENABLED ? [{ id: 'testing', label: 'Testing', Panel: TestingPanel }] as const : []),
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
  tabs: readonly { id: TabId; label: string; Panel: () => JSX.Element }[];
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

  const Panel = ALL_TABS.find((t) => t.id === tab)!.Panel;
  const idleHeroes = engine.state.heroes.filter((h) => h.status !== 'questing').length;

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
          backgroundImage: `url(${tab === 'raids' ? './lore/raids-bg.jpg' : './lore/guild-hall-bg.jpg'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
      <header className="titlebar" style={{ position: 'relative' }}>
        <h1>{engine.state.guildName || 'Guild Idler'}</h1>
        <div className="resources">
          <span className="gold">◆ {formatGold(engine.state.gold)} / {formatGold(engine.goldStorage)}</span>
          <span className="renown">✦ {engine.state.renown} renown</span>
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
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  aria-current={t.id === tab}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.id === 'quests' && idleHeroes > 0 ? <span className="tab-badge">{idleHeroes}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="panel">
          <Panel />
        </main>
      </div>
    </div>
  );
}
