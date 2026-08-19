/**
 * Display labels for the tab ids notifications/banners can point at --
 * kept here rather than importing MenuWindow's own tab structure (which
 * isn't exported and shouldn't need to be just for this), and kept in
 * ONE place rather than duplicated per consumer. GuidePanel's own local
 * copy of this exact list had gone stale before this file existed
 * ('shop'/'upgrades' hadn't been real tab ids since the Vendors
 * restructure, and 'harvest'/'hatchery' were missing entirely) --
 * factoring it out here is specifically to avoid a second copy drifting
 * out of sync with MenuWindow's real tab ids the same way.
 */
export const TAB_LABELS: Record<string, string> = {
  dashboard: 'the Guild', heroes: 'Heroes', equipment: 'Inventory', vendors: 'Vendors',
  guild: 'Guild Hall', harvest: 'Harvest', hatchery: 'Hatchery', peddler: 'Grimsby', quests: 'Quests & Contracts',
  // 'chains' was missing here entirely before -- the lookup at each call
  // site already has a `?? n.targetTab` fallback, so any "Go to <tab>"
  // notification pointing at it (see GameEngine.refreshWorld's own
  // `this.say(..., 'chains', true)` for a newly-discovered story) was
  // rendering the raw id "chains" instead of a real label. Added
  // alongside the Discovered Quests -> Story Quests rename.
  chains: 'Story Quests',
  raids: 'Raids', lore: 'Lore', guide: 'Guide', prestige: 'Prestige',
  stats: 'Statistics', settings: 'Settings',
};
