import { GameState, GuildFacility, MaterialId, SAVE_VERSION } from '../types';
import { createRng } from '../rng';
import { HeroManager } from './HeroManager';
import { AchievementManager } from './AchievementManager';
import { UPGRADES, vendorUpgrades } from '../data/progression';
import { NODE_ORDER } from '../data/materials';
import { Tuning } from '../data/tuning';
import { PeddlerManager } from './PeddlerManager';

/** Storage abstraction so the game also runs in a plain browser tab for testing. */
export interface SaveAdapter {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
}

declare global {
  interface Window {
    littleKnight?: {
      readSave(): Promise<string | null>;
      writeSave(json: string): Promise<boolean>;
      saveFolder(): Promise<string>;
      setWindowMode(mode: 'idle' | 'menu'): Promise<void>;
      setAlwaysOnTop(value: boolean): Promise<boolean>;
      getAlwaysOnTop(): Promise<boolean>;
      setLocked(value: boolean): Promise<boolean>;
      getLocked(): Promise<boolean>;
      minimize(): Promise<void>;
      quit(): Promise<void>;
      unlockAchievement(steamApiName: string): Promise<boolean>;
      /** Main-to-renderer only -- the tray's "Show Guild Hall" item. See
       *  preload.ts's own comment on this same method for the full reasoning. */
      onOpenGuildHall(callback: () => void): () => void;
      /** Main-to-renderer only -- main is about to close/quit and needs a
       *  final save flushed first. See preload.ts's own comment for why. */
      onRequestFlushSave(callback: () => void | Promise<void>): () => void;
    };
  }
}

const LOCAL_KEY = 'little-knight-save';

export const electronAdapter: SaveAdapter = {
  read: () => window.littleKnight!.readSave(),
  write: async (json) => { await window.littleKnight!.writeSave(json); },
};

export const localStorageAdapter: SaveAdapter = {
  read: async () => window.localStorage.getItem(LOCAL_KEY),
  write: async (json) => { window.localStorage.setItem(LOCAL_KEY, json); },
};

export function defaultAdapter(): SaveAdapter {
  return window.littleKnight ? electronAdapter : localStorageAdapter;
}

const EMPTY_GUILD: Record<GuildFacility, number> = {
  barracks: 0, treasury: 0, workshop: 0, library: 0, tavern: 0, infirmary: 0, kennel: 0, music_hall: 0,
};

export function createInitialState(now = Date.now()): GameState {
  const rng = createRng(`start:${now}`);
  const starter = HeroManager.create('adventurer', rng);
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    gold: 50,
    renown: 0,
    heroes: [starter],
    heroSlots: 1,
    roster: ['adventurer'],
    inventory: { healing_potion: 1 },
    customConsumables: {},
    stash: [],
    questBoards: {},
    chainBoard: [],
    questRerollDay: 0,
    questRerollsUsedToday: 0,
    vendorRerollDay: 0,
    vendorRerollsUsedToday: 0,
    frozenQuestOffers: {},
    freezeChangeDay: 0,
    freezeChangesUsedToday: 0,
    boardRefreshedAt: 0,
    activeQuests: [],
    activeChains: [],
    completedChains: [],
    upgrades: {},
    guild: { ...EMPTY_GUILD },
    renownPerks: {},
    shop: { refreshedAt: 0, consumables: [], equipment: [] },
    blackMarket: { refreshedAt: 0, consumables: [], equipment: [] },
    stats: {
      totalQuests: 0, successes: 0, failures: 0,
      goldEarned: 0, goldSpent: 0, highestReward: 0,
      legendaryItemsFound: 0, itemsFound: 0, injuriesSuffered: 0,
      itemsBroken: 0, chainsCompleted: 0,
      playTimeMs: 0, offlineTimeMs: 0, prestigeCount: 0, bestPrestigeStreak: 0,
      lowestSuccessfulChance: null, blackMarketPurchases: 0, firstPlayedAt: now,
    },
    log: [],
    discoveredItems: [],
    unlockedSkins: ['original'],
    focusedHeroId: null,
    prestigeStreak: 0,
    lastPrestigeAt: null,
    unlockedAchievements: {},
    vendorLevels: { blacksmith: 0, alchemist: 0, enchanter: 0 },
    guildName: '',
    notifiedSetBonuses: [],
    activeRaid: null,
    completedRaids: [],
    raidLog: [],
    completedRaidDifficulties: [],
    notifications: [],
    notificationsSeenId: null,
    seenGuidance: [],
    raidUpgrades: {},
    seenOnboarding: false,
    pendingChainDiscovery: false,
    materials: emptyMaterials(),
    harvestNodes: Object.fromEntries(
      NODE_ORDER.map((id) => [id, { nextSpawnAt: now + Tuning.get('harvest.baseSpawnIntervalMs'), pending: null }]),
    ) as GameState['harvestNodes'],
    harvestTools: emptyMaterials(),
    warehouseLevel: 0,
    tradeRouteUnlocked: false,
    scrap: 0,
    gems: {},
    resistGems: {},
    hatcheryUnlocked: false,
    pendingHatcherySpotlight: false,
    incubatingEggs: [],
    eggStorage: [],
    pets: [],
    autoRepairEnabled: false,
    autoRepairThresholdPercent: 50,
    autoEquipOnLoot: false,
    autoEquipConsumablesOnSend: false,
    pendingHatchReadyNotice: false,
    peddlerUnlocked: false,
    pendingPeddlerSpotlight: false,
    questsSinceGrimsby: 0,
    grimsbyThreshold: PeddlerManager.rollThreshold(),
    grimsbyArrivedAt: null,
    grimsbyLeavesAt: null,
    grimsbyHighRollerUnlocked: false,
  };
}

function emptyMaterials(): Record<MaterialId, number> {
  return { ore: 0, timber: 0, herbs: 0, fish: 0 };
}

/**
 * Migrations run in order. Each one takes a save at version N and returns a
 * save at version N+1, so old saves keep working across releases.
 */
type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  1: (save) => ({
    ...save,
    version: 2,
    activeChains: save.activeChains ?? [],
    completedChains: save.completedChains ?? [],
    discoveredItems: save.discoveredItems ?? [],
  }),
  2: (save) => ({
    ...save,
    version: 3,
    renownPerks: save.renownPerks ?? {},
    roster: save.roster ?? ['knight'],
  }),
  3: (save) => {
    // Classes were reworked from recolours to distinct characters. Any hero on
    // a retired class id is remapped to the nearest equivalent so old saves keep
    // their roster instead of losing heroes.
    const remap: Record<string, string> = {
      squire: 'gladiator', archer: 'gladiator', rogue: 'witch',
      mage: 'wizard', paladin: 'dwarf',
    };
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      const cls = h.heroClass as string;
      if (remap[cls]) h.heroClass = remap[cls];
      h.skin = h.skin ?? 'original';
      h.bonusStats = h.bonusStats ?? { strength: 0, endurance: 0, luck: 0, wisdom: 0 };
    }
    return {
      ...save,
      version: 4,
      heroes,
      unlockedSkins: (save.unlockedSkins as string[]) ?? ['original'],
      roster: ['knight'],
    };
  },
  4: (save) => {
    // The Adventurer joined as the new default starter, but Knight remains a
    // real recruitable class (now a cheap early hire rather than the free
    // starter). Existing knight heroes are untouched — nothing to remap here,
    // this migration just carries the save forward to the new version.
    return { ...save, version: 5 };
  },
  5: (save) => ({
    ...save,
    version: 6,
    focusedHeroId: (save.focusedHeroId as string | null | undefined) ?? null,
  }),
  6: (save) => ({
    ...save,
    version: 7,
    blackMarket: (save.blackMarket as unknown) ?? { refreshedAt: 0, consumables: [], equipment: [] },
  }),
  7: (save) => {
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      h.ascension = h.ascension ?? 0;
    }
    const stats = (save.stats as Record<string, unknown>) ?? {};
    stats.bestPrestigeStreak = stats.bestPrestigeStreak ?? 0;
    return {
      ...save,
      version: 8,
      heroes,
      stats,
      prestigeStreak: (save.prestigeStreak as number | undefined) ?? 0,
      lastPrestigeAt: (save.lastPrestigeAt as number | null | undefined) ?? null,
    };
  },
  8: (save) => {
    const stats = (save.stats as Record<string, unknown>) ?? {};
    stats.lowestSuccessfulChance = stats.lowestSuccessfulChance ?? null;
    stats.blackMarketPurchases = stats.blackMarketPurchases ?? 0;
    const next = {
      ...save,
      version: 9,
      stats,
      unlockedAchievements: (save.unlockedAchievements as Record<string, number> | undefined) ?? {},
    } as unknown as GameState;
    // Achievements are a new system, but the conditions for most of them
    // (total quests, legendary finds, ascension, etc.) could already be true
    // in an existing save. Check once here so nobody has to "do it again"
    // just because the update landed after they'd already earned it. Every
    // future checkAll() call skips ids that are already unlocked, so this is
    // also the only chance to push a retroactive grant to Steam — do it here
    // rather than leaving it silently un-synced forever.
    const granted = AchievementManager.checkAll(next, Date.now());
    for (const id of granted) {
      void (typeof window !== 'undefined' ? window.littleKnight?.unlockAchievement(id) : undefined);
    }
    return next as unknown as Record<string, unknown>;
  },
  9: (save) => {
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      h.autoChainCount = h.autoChainCount ?? 0;
      h.autoChainTarget = h.autoChainTarget ?? null;
    }
    return { ...save, version: 10, heroes };
  },
  10: (save) => {
    const existing = (save.vendorLevels as Record<string, number> | undefined) ?? {};
    const owned = (save.upgrades as Record<string, number> | undefined) ?? {};
    // Existing saves may already have levels in upgrades that are now
    // vendor-gated (e.g. weapons_training bought under the old flat list).
    // Retroactively grant enough vendor level to keep anything already
    // purchased visible and further-upgradable — a save shouldn't lose
    // access to something it earned just because the upgrade moved house.
    const vendorLevels: Record<string, number> = {
      blacksmith: existing.blacksmith ?? 0,
      alchemist: existing.alchemist ?? 0,
      enchanter: existing.enchanter ?? 0,
    };
    for (const def of UPGRADES) {
      if (!def.vendor) continue;
      if ((owned[def.id] ?? 0) <= 0) continue;
      const index = vendorUpgrades(def.vendor).findIndex((u) => u.id === def.id);
      vendorLevels[def.vendor] = Math.max(vendorLevels[def.vendor], index + 1);
    }
    return { ...save, version: 11, vendorLevels };
  },
  11: (save) => ({
    ...save,
    version: 12,
    guildName: (save.guildName as string | undefined) ?? '',
  }),
  12: (save) => {
    // bulwark_of_the_war_saint and empyrean_aegis moved from the "chest"
    // slot to a genuine new "shield" slot. A hero with either equipped has
    // it sitting under the old key -- Hero.equipment is keyed by slot, so
    // without this it would go stale (the item def now says shield, but
    // nothing looks under that key for it). Only equipped items need this;
    // stash/shop entries just reference a defId and pick up the new slot
    // automatically via EQUIPMENT_BY_ID, no per-item migration needed there.
    const RECLASSIFIED_TO_SHIELD = new Set(['bulwark_of_the_war_saint', 'empyrean_aegis']);
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      const equipment = (h.equipment as Record<string, { defId?: string }> | undefined) ?? {};
      const chestItem = equipment.chest;
      if (chestItem && RECLASSIFIED_TO_SHIELD.has(chestItem.defId ?? '')) {
        equipment.shield = chestItem;
        delete equipment.chest;
      }
      h.equipment = equipment;
    }
    return { ...save, version: 13, heroes };
  },
  13: (save) => ({
    ...save,
    version: 14,
    notifiedSetBonuses: (save.notifiedSetBonuses as string[] | undefined) ?? [],
  }),
  14: (save) => ({
    ...save,
    version: 15,
    activeRaid: (save.activeRaid as unknown) ?? null,
    completedRaids: (save.completedRaids as string[] | undefined) ?? [],
    raidLog: (save.raidLog as unknown[] | undefined) ?? [],
  }),
  15: (save) => ({
    ...save,
    version: 16,
    completedRaidDifficulties: (save.completedRaidDifficulties as string[] | undefined) ?? [],
  }),
  16: (save) => ({
    ...save,
    version: 17,
    notifications: (save.notifications as unknown[] | undefined) ?? [],
    seenGuidance: (save.seenGuidance as string[] | undefined) ?? [],
  }),
  17: (save) => ({
    ...save,
    version: 18,
    raidUpgrades: (save.raidUpgrades as Record<string, number> | undefined) ?? {},
  }),
  18: (save) => {
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      h.equippedConsumables = (h.equippedConsumables as string[] | undefined) ?? [];
    }
    return { ...save, version: 19, heroes };
  },
  19: (save) => ({
    ...save,
    version: 20,
    // An existing save is, by definition, already past onboarding -- the
    // scripted tour is for a genuinely fresh start only, never retrofitted
    // onto a save that's already been playing.
    seenOnboarding: true,
    pendingChainDiscovery: (save.pendingChainDiscovery as boolean | undefined) ?? false,
  }),
  20: (save) => {
    const now = Date.now();
    const existingMaterials = (save.materials as Record<string, number> | undefined) ?? {};
    const existingTools = (save.harvestTools as Record<string, number> | undefined) ?? {};
    const existingNodes = (save.harvestNodes as Record<string, unknown> | undefined) ?? {};
    const materials: Record<string, number> = {};
    const harvestTools: Record<string, number> = {};
    const harvestNodes: Record<string, unknown> = {};
    for (const id of NODE_ORDER) {
      materials[id] = existingMaterials[id] ?? 0;
      harvestTools[id] = existingTools[id] ?? 0;
      harvestNodes[id] = existingNodes[id] ?? { nextSpawnAt: now + Tuning.get('harvest.baseSpawnIntervalMs'), pending: null };
    }
    return {
      ...save,
      version: 21,
      materials,
      harvestTools,
      harvestNodes,
      warehouseLevel: (save.warehouseLevel as number | undefined) ?? 0,
      tradeRouteUnlocked: (save.tradeRouteUnlocked as boolean | undefined) ?? false,
    };
  },
  21: (save) => ({
    ...save,
    version: 22,
    customConsumables: (save.customConsumables as Record<string, unknown> | undefined) ?? {},
  }),
  22: (save) => ({
    ...save,
    version: 23,
    hatcheryUnlocked: (save.hatcheryUnlocked as boolean | undefined) ?? false,
    pendingHatcherySpotlight: (save.pendingHatcherySpotlight as boolean | undefined) ?? false,
    incubatingEggs: (save.incubatingEggs as unknown[] | undefined) ?? [],
    pets: (save.pets as unknown[] | undefined) ?? [],
  }),
  23: (save) => ({
    ...save,
    version: 24,
    // Eggs stopped auto-incubating on grant this patch (see PetManager) --
    // any egg an existing save already has mid-incubation stays exactly
    // where it is (incubatingEggs is untouched here), it just now also has
    // an empty storage pool alongside it rather than nothing.
    eggStorage: (save.eggStorage as unknown[] | undefined) ?? [],
  }),
  24: (save) => ({
    ...save,
    version: 25,
    // Hatching also stopped being automatic this patch -- any egg already
    // sitting past its threshold on an existing save (there's no way to
    // tell from old data alone) will just show "Ready to Hatch!" the next
    // time its Nest card renders, computed fresh from isReady() rather
    // than a stored flag. This only backfills the notice flag itself.
    pendingHatchReadyNotice: (save.pendingHatchReadyNotice as boolean | undefined) ?? false,
  }),
  25: (save) => {
    // Quest Tab hero-log rework: the one shared 6-slot questBoard is
    // replaced by a per-hero questBoards map (contract offers, scaled to
    // each hero's own level) plus a separate guild-wide chainBoard
    // (story-chain stage offers, unchanged -- a chain's progress was
    // never owned by a specific hero). The old shared board can't be
    // salvaged into the new per-hero shape -- its offers were never
    // scoped to any one hero -- so it's simply dropped; refreshWorld
    // regenerates every hero's own board and the chain board from
    // scratch on the very next tick, the same "missing data just
    // regenerates" contract every board refresh already relies on.
    const { questBoard: _oldBoard, ...rest } = save;
    return {
      ...rest,
      version: 26,
      questBoards: {},
      chainBoard: [],
    };
  },
  26: (save) => ({
    ...save,
    version: 27,
    // Reroll counters -- 0/0 is exactly "no rerolls used yet today", the
    // correct starting state for a save that predates this system, not a
    // placeholder that needs correcting on first use.
    questRerollDay: (save.questRerollDay as number | undefined) ?? 0,
    questRerollsUsedToday: (save.questRerollsUsedToday as number | undefined) ?? 0,
    vendorRerollDay: (save.vendorRerollDay as number | undefined) ?? 0,
    vendorRerollsUsedToday: (save.vendorRerollsUsedToday as number | undefined) ?? 0,
  }),
  27: (save) => ({
    ...save,
    version: 28,
    // Elemental infusion system -- 0/empty is exactly correct for a save
    // that predates this, not a placeholder needing correction. Existing
    // equipment items simply have no elementalDamage/elementalResist yet
    // (both optional fields, no migration needed on the items themselves).
    scrap: (save.scrap as number | undefined) ?? 0,
    gems: (save.gems as GameState['gems'] | undefined) ?? {},
    resistGems: (save.resistGems as GameState['resistGems'] | undefined) ?? {},
  }),
  28: (save) => ({
    ...save,
    version: 29,
    // Quest-board freeze slot -- empty/0 is exactly "nothing frozen yet,
    // no changes used today", the correct starting state for a save that
    // predates this system, not a placeholder needing correction.
    frozenQuestOffers: (save.frozenQuestOffers as GameState['frozenQuestOffers'] | undefined) ?? {},
    freezeChangeDay: (save.freezeChangeDay as number | undefined) ?? 0,
    freezeChangesUsedToday: (save.freezeChangesUsedToday as number | undefined) ?? 0,
  }),
  29: (save) => ({
    ...save,
    version: 30,
    // Both auto-repair/auto-equip default to off -- opt-in automation, a
    // save that predates this should never suddenly start spending gold
    // or swapping gear on its own the moment it loads.
    autoRepairEnabled: (save.autoRepairEnabled as boolean | undefined) ?? false,
    autoRepairThresholdPercent: (save.autoRepairThresholdPercent as number | undefined) ?? 50,
    autoEquipOnLoot: (save.autoEquipOnLoot as boolean | undefined) ?? false,
  }),
  30: (save) => ({
    ...save,
    version: 31,
    // Points at whatever's currently the newest entry in the existing
    // log (or null if there's no log yet), not a fresh timestamp -- a
    // save that predates this system already has up to 100 old
    // notifications sitting in its log, and treating every single one of
    // them as newly "unread" would slap a jarring "100 unread" badge on
    // a guild that's been running fine for ages. Pointing at the current
    // newest means only notifications that actually arrive AFTER the
    // update count toward it, which is what "unread" should mean here.
    notificationsSeenId: (save.notifications as { id: string }[] | undefined)?.[0]?.id ?? null,
  }),
  31: (save) => {
    const oldNodes = (save.harvestNodes as Record<string, { nextSpawnAt?: number; pending: unknown }> | undefined) ?? {};
    // Old per-node nextSpawnAt values get dropped (that field no longer
    // exists on HarvestNodeState) rather than migrated forward -- picking
    // any one of the 4 old values to seed the new shared timer would be
    // arbitrary anyway, so this just starts the first synchronized wave
    // one full base interval from whenever the save loads, the same
    // "fresh cycle starting now" shape a genuinely new save already gets
    // in createInitialState. Each node's own `pending` (whatever's
    // already sitting there, if anything) carries over untouched -- a
    // player mid-catch when this update lands doesn't lose an item
    // they can already see on screen.
    const harvestNodes: Record<string, { pending: unknown }> = {};
    for (const [id, node] of Object.entries(oldNodes)) {
      harvestNodes[id] = { pending: node.pending };
    }
    return {
      ...save,
      version: 32,
      harvestNodes,
      harvestNextSpawnAt: Date.now() + Tuning.get('harvest.baseSpawnIntervalMs'),
    };
  },
  32: (save) => {
    // Reverting the 31->32 migration above -- synchronized spawning
    // looked bad in practice (overlapping burst text across nodes,
    // confirmed with a screenshot) and was rolled back after direct
    // follow-up feedback. Each node gets its own independent
    // `nextSpawnAt` again; picking a fresh one-interval-out start (same
    // "fresh cycle starting now" shape a genuinely new save gets) rather
    // than trying to reconstruct 4 different values from the single
    // shared timestamp this save currently has, which wouldn't mean
    // anything meaningful per-node anyway. `pending` (whatever's already
    // sitting there, if anything) carries over untouched either way.
    const oldNodes = (save.harvestNodes as Record<string, { pending: unknown }> | undefined) ?? {};
    const harvestNodes: Record<string, { nextSpawnAt: number; pending: unknown }> = {};
    for (const [id, node] of Object.entries(oldNodes)) {
      harvestNodes[id] = { nextSpawnAt: Date.now() + Tuning.get('harvest.baseSpawnIntervalMs'), pending: node.pending };
    }
    const rest = { ...save } as Record<string, unknown>;
    delete rest.harvestNextSpawnAt;
    return {
      ...rest,
      version: 33,
      harvestNodes,
    };
  },
  33: (save) => ({
    ...save,
    version: 34,
    // Grimsby/peddler system -- false/0/null is exactly "never unlocked
    // yet, no visits, nothing pending," the correct starting state for a
    // save that predates this entirely, not a placeholder needing
    // correction. A save already past the unlock chain's reqLevel band
    // still has to actually complete "The Man Who Sells Maybe" like any
    // other chain -- same "undiscovered content stays undiscovered,
    // never force-unlocked by a migration" treatment grantsHatchery got.
    peddlerUnlocked: (save.peddlerUnlocked as boolean | undefined) ?? false,
    pendingPeddlerSpotlight: (save.pendingPeddlerSpotlight as boolean | undefined) ?? false,
    questsSinceGrimsby: (save.questsSinceGrimsby as number | undefined) ?? 0,
    grimsbyThreshold: (save.grimsbyThreshold as number | undefined) ?? PeddlerManager.rollThreshold(),
    grimsbyArrivedAt: (save.grimsbyArrivedAt as number | null | undefined) ?? null,
    grimsbyLeavesAt: (save.grimsbyLeavesAt as number | null | undefined) ?? null,
    grimsbyHighRollerUnlocked: (save.grimsbyHighRollerUnlocked as boolean | undefined) ?? false,
  }),
};

export const SaveManager = {
  serialize(state: GameState): string {
    return JSON.stringify({ ...state, version: SAVE_VERSION });
  },

  migrate(raw: Record<string, unknown>): GameState {
    let save = raw;
    let version = typeof save.version === 'number' ? save.version : 1;
    while (version < SAVE_VERSION) {
      const migration = MIGRATIONS[version];
      if (!migration) break;
      save = migration(save);
      version = typeof save.version === 'number' ? save.version : version + 1;
    }
    // Fill in anything a migration missed so a partial save never crashes the UI.
    const base = createInitialState();
    return { ...base, ...(save as unknown as GameState), version: SAVE_VERSION };
  },

  async load(adapter: SaveAdapter): Promise<{ state: GameState; isNew: boolean }> {
    try {
      const json = await adapter.read();
      if (!json) return { state: createInitialState(), isNew: true };
      const parsed = JSON.parse(json) as Record<string, unknown>;
      return { state: SaveManager.migrate(parsed), isNew: false };
    } catch (err) {
      console.error('Save could not be read, starting a fresh guild.', err);
      return { state: createInitialState(), isNew: true };
    }
  },

  async save(adapter: SaveAdapter, state: GameState): Promise<void> {
    try {
      await adapter.write(SaveManager.serialize(state));
    } catch (err) {
      console.error('Save failed.', err);
    }
  },

  exportToClipboard(state: GameState): string {
    return btoa(unescape(encodeURIComponent(SaveManager.serialize(state))));
  },

  importFromString(encoded: string): GameState | null {
    try {
      const json = decodeURIComponent(escape(atob(encoded.trim())));
      return SaveManager.migrate(JSON.parse(json) as Record<string, unknown>);
    } catch {
      return null;
    }
  },
};
