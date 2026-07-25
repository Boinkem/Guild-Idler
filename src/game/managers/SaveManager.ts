import { GameState, GuildFacility, SAVE_VERSION } from '../types';
import { createRng } from '../rng';
import { HeroManager } from './HeroManager';
import { AchievementManager } from './AchievementManager';

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
