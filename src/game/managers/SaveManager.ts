import { GameState, GuildFacility, MaterialId, SAVE_VERSION } from '../types';
import { createRng } from '../rng';
import { HeroManager } from './HeroManager';
import { AchievementManager } from './AchievementManager';
import { UPGRADES, vendorUpgrades } from '../data/progression';
import { BARD_TRACKS } from '../data/bard';
import { ACHIEVEMENT_BY_ID } from '../data/achievements';
import { NODE_ORDER } from '../data/materials';
import { Tuning } from '../data/tuning';
import { PeddlerManager } from './PeddlerManager';
import { EquipmentManager } from './EquipmentManager';
import { tutorialQuestOffer } from '../data/quests';

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
      setFullscreen(value: boolean): Promise<boolean>;
      getFullscreen(): Promise<boolean>;
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
  physicians_charity: 0, smiths_charity: 0,
};

export function createInitialState(now = Date.now()): GameState {
  const rng = createRng(`start:${now}`);
  const starter = HeroManager.create('adventurer', rng);
  // A starter Wooden Practice Sword, equipped from the very first
  // moment -- HeroManager.create leaves `equipment` empty by default
  // (a recruited hero buys/finds their own gear), but the tutorial
  // quest below is built specifically around this hero having something
  // to break. Deliberately equipped directly here rather than routed
  // through EquipmentManager.equip -- there's no prior item to displace
  // into a stash that doesn't have anything in it yet either.
  const woodenSword = EquipmentManager.instantiate('wooden_sword');
  if (woodenSword) starter.equipment.weapon = woodenSword;
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    gold: 50,
    renown: 0,
    heroes: [starter],
    heroSlots: 1,
    roster: ['adventurer'],
    // 2 free Field Bandages -- a fresh guild's starting gold (50) can't
    // actually afford either cure for a real injury (Treat costs
    // 70-90g, buying a bandage costs 60g), so without this a brand new
    // player's first injury was mathematically un-curable except by
    // waiting it out. See guild-idler-status.md's "new-player injury
    // economy" entry. Doubles now as the tutorial quest's own healing
    // lesson -- the potion/bandages were already here waiting; the
    // tutorial quest below is what actually gives a new player a reason
    // to reach for one on quest one instead of quest ten.
    inventory: { healing_potion: 1, field_bandage: 2 },
    customConsumables: {},
    stash: [],
    buyback: [],
    // The starter hero's board isn't left empty for the normal
    // procedural generator to fill -- it's seeded directly with the
    // scripted tutorial quest (see quests.ts's own tutorialQuestOffer
    // doc comment), so it's both guaranteed present and the ONLY
    // choice, rather than competing for attention against 2-3 ordinary
    // freshly-rolled offers a brand new player has no context to
    // evaluate yet. refreshWorld's own regeneration only replaces a
    // hero's board once it's empty or a window rolls over, so this
    // survives untouched until the tutorial quest is actually sent.
    questBoards: { [starter.id]: [tutorialQuestOffer()] },
    chainBoard: [],
    questRerollDay: 0,
    questRerollsUsedToday: 0,
    blacksmithRerollDay: 0,
    blacksmithRerollsUsedToday: 0,
    alchemistRerollDay: 0,
    alchemistRerollsUsedToday: 0,
    enchanterRerollDay: 0,
    enchanterRerollsUsedToday: 0,
    frozenQuestOffers: {},
    freezeChangeDay: 0,
    freezeChangesUsedToday: 0,
    freeHealDay: 0,
    freeHealsUsedToday: 0,
    freeRepairDay: 0,
    freeRepairsUsedToday: 0,
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
      peddlerFlips: 0, peddlerJackpots: 0, peddlerHighRollerJackpots: 0,
    },
    log: [],
    discoveredItems: [],
    unlockedSkins: ['original'],
    focusedHeroId: null,
    prestigeStreak: 0,
    lastPrestigeAt: null,
    unlockedAchievements: {},
    unlockedBardTracks: [],
    vendorLevels: { blacksmith: 0, alchemist: 0, enchanter: 0 },
    guildName: '',
    notifiedSetBonuses: [],
    activeRaid: null,
    completedRaids: [],
    raidLog: [],
    completedRaidDifficulties: [],
    notifications: [],
    notificationsSeenId: null,
    lastBannerShownId: null,
    seenGuidance: [],
    raidUpgrades: {},
    seenOnboarding: false,
    pendingChainDiscovery: false,
    materials: emptyMaterials(),
    curios: {},
    harvestNodes: Object.fromEntries(
      NODE_ORDER.map((id) => [id, { nextSpawnAt: now + Tuning.get('harvest.baseSpawnIntervalMs'), pending: null }]),
    ) as GameState['harvestNodes'],
    harvestTools: emptyMaterials(),
    warehouseLevel: 0,
    tradeRouteUnlocked: false,
    harvestUnlocked: false,
    pendingHarvestSpotlight: false,
    scrap: 0,
    gems: {},
    resistGems: {},
    hatcheryUnlocked: false,
    pendingHatcherySpotlight: false,
    hasEarnedFirstTitle: false,
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
  34: (save) => {
    // Harvest gets an intro chain (the_first_haul) for the first time --
    // deliberately NOT the same "never force-unlock, undiscovered content
    // stays undiscovered" treatment migration 33 above gives Grimsby.
    // Grimsby/Hatchery were both brand-new systems nobody had ever had
    // access to before their own unlock chains existed, so defaulting an
    // old save to locked took nothing away. Harvest is different: every
    // save at this version already had the tab fully, unconditionally
    // visible with no gate at all, so defaulting all of them to locked
    // here would be a real regression -- a save with real Warehouse
    // levels, tool levels, and stored materials suddenly finding the tab
    // gone. Grandfathered instead: any save showing genuine prior
    // Harvest activity (materials in stock, a tool leveled up, the
    // Warehouse upgraded, or Trade Route bought) unlocks immediately,
    // matching what it already had. A save with none of that -- which
    // in practice means "never actually opened the tab," functionally
    // identical to a save that predates Harvest entirely -- goes through
    // the_first_haul like a new game would, same as everyone going
    // forward. pendingHarvestSpotlight deliberately stays false either
    // way: a grandfathered save doesn't need a "here's your new tab"
    // tour for a tab it's already used, and a freshly-locked save hasn't
    // earned the completion moment that spotlight represents yet.
    const materials = (save.materials as Record<string, number> | undefined) ?? {};
    const harvestTools = (save.harvestTools as Record<string, number> | undefined) ?? {};
    const hasHarvestActivity =
      Object.values(materials).some((v) => (v ?? 0) > 0) ||
      Object.values(harvestTools).some((v) => (v ?? 0) > 0) ||
      ((save.warehouseLevel as number | undefined) ?? 0) > 0 ||
      (save.tradeRouteUnlocked as boolean | undefined) === true;
    return {
      ...save,
      version: 35,
      harvestUnlocked: hasHarvestActivity,
      pendingHarvestSpotlight: false,
    };
  },
  35: (save) => {
    // New Statistics counters for the Grimsby-related achievement batch
    // (PEDDLER_FIRST_FLIP/PEDDLER_JACKPOT/PEDDLER_HIGH_ROLLER_JACKPOT) --
    // a save from before these existed has simply never had a flip
    // counted toward them, same "0, not a placeholder needing
    // correction" reasoning migration 33 already used for Grimsby's own
    // fields. Nested under `stats`, so (unlike a top-level GameState
    // field) SaveManager.migrate's own `{...base, ...save}` merge would
    // NOT backfill these automatically -- `save.stats` already exists as
    // a whole object by this point, so the merge takes it wholesale
    // rather than filling in just the missing keys underneath it. Spelled
    // out explicitly here rather than relying on the `undefined >= 1`
    // being falsy anyway (true, but a counter silently stuck at
    // `undefined` forever is still wrong, not just harmless).
    const stats = (save.stats as Record<string, unknown> | undefined) ?? {};
    return {
      ...save,
      version: 36,
      stats: {
        ...stats,
        peddlerFlips: (stats.peddlerFlips as number | undefined) ?? 0,
        peddlerJackpots: (stats.peddlerJackpots as number | undefined) ?? 0,
        peddlerHighRollerJackpots: (stats.peddlerHighRollerJackpots as number | undefined) ?? 0,
      },
    };
  },
  36: (save) => {
    // Hero.title (single, overwritten by each new chain completion) split
    // into Hero.titles (full history, append-only) + Hero.activeTitle
    // (which one displays) -- see HeroManager.grantTitle/displayTitle.
    // An old save's single title becomes a one-entry history with that
    // same title active, so nothing about what's currently displayed
    // changes for anyone migrating through this -- the only new thing is
    // that a second title earned from here on adds to the list instead
    // of silently overwriting the first.
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    for (const h of heroes) {
      const oldTitle = h.title as string | undefined;
      h.titles = oldTitle ? [oldTitle] : [];
      h.activeTitle = oldTitle ?? null;
      delete h.title;
    }
    return { ...save, version: 37, heroes };
  },
  37: (save) => {
    // Vendor Upgrades Consolidation -- weapons_training/armourers_contract/
    // veteran_explorer/war_stories/efficient_adventuring are gone (their
    // Success/Durability/Loot/XP/Gold bonuses folded into Barracks/
    // Workshop/Tavern/Library/Treasury instead), and the shared trade_favor
    // upgrade is split into three per-vendor ones. See
    // guild-idler-status.md's Vendor Upgrades Consolidation entry for the
    // full reasoning.
    //
    // A save that already spent gold leveling any of the five removed
    // upgrades gets that gold refunded (using each upgrade's own retired
    // cost curve, the same earlyTierDiscount-adjusted formula
    // upgradeCost() still uses for every other upgrade) rather than just
    // silently losing the levels -- losing a bonus is one thing, losing
    // the gold spent buying it with no recourse is another. Removed
    // upgrade keys are deleted from `upgrades` afterward since
    // UPGRADE_BY_ID no longer has definitions for them; leaving them
    // would just be dead weight ModifierManager.upgradeMods already
    // skips harmlessly, but deleting is cleaner and matches migration
    // 36's own "clean up what changed" precedent.
    const discount = (level: number) => (level < 4 ? [0.15, 0.35, 0.6, 0.85][level] : 1);
    const refundCost = (baseCost: number, costGrowth: number, level: number) => {
      let total = 0;
      for (let l = 0; l < level; l++) total += Math.floor(baseCost * Math.pow(costGrowth, l) * discount(l));
      return total;
    };
    const REMOVED: Record<string, { baseCost: number; costGrowth: number }> = {
      weapons_training: { baseCost: 200, costGrowth: 1.75 },
      armourers_contract: { baseCost: 500, costGrowth: 1.9 },
      veteran_explorer: { baseCost: 400, costGrowth: 1.9 },
      war_stories: { baseCost: 450, costGrowth: 1.89 },
      efficient_adventuring: { baseCost: 250, costGrowth: 1.84 },
    };
    const upgrades = { ...(save.upgrades as Record<string, number> | undefined ?? {}) };
    let refund = 0;
    for (const [id, { baseCost, costGrowth }] of Object.entries(REMOVED)) {
      const level = upgrades[id] ?? 0;
      if (level > 0) refund += refundCost(baseCost, costGrowth, level);
      delete upgrades[id];
    }
    // trade_favor (shared, general) becomes trade_favor_blacksmith +
    // trade_favor_alchemist at the SAME level it already was (both
    // vendors used to share the one reroll pool it fed, so this doesn't
    // change anyone's total free-reroll allowance today) -- and
    // trade_favor_enchanter, which starts at 0 since the Enchanter never
    // had a manual reroll to buy free charges for before now.
    const oldTradeFavorLevel = upgrades.trade_favor ?? 0;
    delete upgrades.trade_favor;
    if (oldTradeFavorLevel > 0) {
      upgrades.trade_favor_blacksmith = oldTradeFavorLevel;
      upgrades.trade_favor_alchemist = oldTradeFavorLevel;
    }

    // Reroll counters: blacksmithRerolls*/alchemistRerolls* both inherit
    // the old shared vendorRerolls* value (see the trade_favor note
    // above -- both vendors used to restock together off one counter),
    // enchanterRerolls* starts fresh at 0/0, the correct starting state
    // for a reroll track that's brand new this patch.
    const oldRerollDay = (save.vendorRerollDay as number | undefined) ?? 0;
    const oldRerollUsed = (save.vendorRerollsUsedToday as number | undefined) ?? 0;

    return {
      ...save,
      version: 38,
      gold: (save.gold as number | undefined ?? 0) + refund,
      upgrades,
      blacksmithRerollDay: oldRerollDay,
      blacksmithRerollsUsedToday: oldRerollUsed,
      alchemistRerollDay: oldRerollDay,
      alchemistRerollsUsedToday: oldRerollUsed,
      enchanterRerollDay: 0,
      enchanterRerollsUsedToday: 0,
    };
  },
  38: (save) => ({
    ...save,
    version: 39,
    // New Curios system -- see CurioDef's own doc comment in types.ts.
    // A save from before this existed has simply never owned any, same
    // "empty record, not a placeholder needing correction" reasoning
    // every other new Record<string, number> bucket (materials, back
    // when it was introduced) already used.
    curios: (save.curios as Record<string, number> | undefined) ?? {},
  }),
  39: (save) => ({
    ...save,
    version: 40,
    // New vendor buyback system -- an existing save has simply never
    // sold anything through it yet, same "empty list, nothing to
    // correct" reasoning every other new array/record field already
    // uses on introduction. Deliberately NOT retrofitting the starter
    // Wooden Practice Sword or the scripted tutorial quest onto existing
    // saves here -- both are createInitialState-only, seeded once for a
    // genuinely fresh guild, same "never retrofitted onto anyone already
    // playing" precedent the onboarding tour itself already set (see
    // seenOnboarding's own migration).
    buyback: (save.buyback as GameState['buyback'] | undefined) ?? [],
  }),
  40: (save) => {
    // Music Hall (buy a level, unlock a track) removed -- bard tracks are
    // now earned as achievement rewards instead (see achievements.json's
    // unlocksTrackId, engine.ts's reportAchievements). Two things need
    // grandfathering forward here, both one-time, so nobody's existing
    // progress silently loses a track:
    //
    // 1. A save that had already spent real gold leveling Music Hall up
    //    gets the first N tracks in BARD_TRACKS' own list order, N being
    //    whatever level it had reached -- the exact same tracks
    //    resolveTrackSrc would have offered it under the old level-gated
    //    system. `guild.music_hall` itself is left alone (still 0 on
    //    every save going forward, since nothing can buy it anymore) --
    //    this migration only ever reads it, once.
    // 2. reportAchievements only ever grants a track at the moment an
    //    achievement newly unlocks (AchievementManager.checkAll only
    //    returns NEWLY-unlocked ids) -- a save that already has, say,
    //    CHAIN_MILLERS_PROBLEM from long before this system existed
    //    would otherwise never receive Sacred Springs, since that
    //    achievement will never fire as "new" again. Same "retroactively
    //    credit anything already true" reasoning achievements.ts's own
    //    top comment already documents for the v8->v9 migration --
    //    applied here to track grants instead of the achievements
    //    themselves.
    const musicHallLevel = ((save.guild as Record<string, number> | undefined)?.music_hall as number | undefined) ?? 0;
    const grandfathered = BARD_TRACKS.slice(0, musicHallLevel).map((t) => t.id);
    const alreadyUnlockedAchievements = Object.keys(
      (save.unlockedAchievements as Record<string, number> | undefined) ?? {},
    );
    const retroactive = alreadyUnlockedAchievements
      .map((id) => ACHIEVEMENT_BY_ID[id]?.unlocksTrackId)
      .filter((trackId): trackId is string => !!trackId);
    const existing = (save.unlockedBardTracks as string[] | undefined) ?? [];
    return {
      ...save,
      version: 41,
      unlockedBardTracks: Array.from(new Set([...existing, ...grandfathered, ...retroactive])),
    };
  },
  41: (save) => {
    // New hasEarnedFirstTitle flag (see GameState's own comment) -- backfilled
    // true for any save that already has a titled hero by this point, so
    // nobody who's held a title since before this patch gets a retroactive
    // "first title!" banner the next time any hero earns a new one.
    const heroes = Array.isArray(save.heroes) ? save.heroes as Record<string, unknown>[] : [];
    const alreadyHasTitle = heroes.some((h) => Array.isArray(h.titles) && (h.titles as unknown[]).length > 0);
    return {
      ...save,
      version: 42,
      hasEarnedFirstTitle: alreadyHasTitle,
    };
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
