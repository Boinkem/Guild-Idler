import { GameState, GuildFacility, SAVE_VERSION } from '../types';
import { createRng } from '../rng';
import { HeroManager } from './HeroManager';
import { AchievementManager } from './AchievementManager';
import { UPGRADES, vendorUpgrades } from '../data/progression';

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
  barracks: 0, treasury: 0, workshop: 0, library: 0, tavern: 0,
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
    stash: [],
    questBoard: [],
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
    seenGuidance: [],
  };
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
