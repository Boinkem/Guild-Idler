import { ActiveQuest, GameState, Hero, HeroClass, QuestOffer, QuestResult, Rarity, RaidDifficulty, RaidResult } from './types';
import { createRng, uid } from './rng';
import { HeroManager } from './managers/HeroManager';
import { QuestManager, BOARD_REFRESH_MS, CHAIN_BY_ID } from './managers/QuestManager';
import { RaidManager } from './managers/RaidManager';
import { ShopManager } from './managers/ShopManager';
import { SaveManager, SaveAdapter, defaultAdapter, createInitialState } from './managers/SaveManager';
import { EquipmentManager } from './managers/EquipmentManager';
import { InventoryManager } from './managers/InventoryManager';
import { GuildManager } from './managers/GuildManager';
import { PrestigeManager } from './managers/PrestigeManager';
import { ModifierManager } from './managers/ModifierManager';
import { AchievementManager } from './managers/AchievementManager';
import { GuidanceManager, GuidanceTopic } from './managers/GuidanceManager';
import { SKIN_BY_ID, SKIN_PRICE, AUTO_CHAIN_RANGES, xpForLevel } from './data/progression';
import { EQUIPMENT_BY_ID, SET_BY_ID } from './data/equipment';
import { RAID_BY_ID } from './data/raids';
import { playSound } from './sound';
import { TESTING_TOOLS_ENABLED } from './testingTools';

const TICK_MS = 1000;
const AUTOSAVE_MS = 15_000;

export interface OfflineReport {
  elapsedMs: number;
  results: QuestResult[];
  raidResults: RaidResult[];
  goldGained: number;
  xpGained: number;
}

/** Data for the "Story Chain Complete" overlay -- transient like lastResult
 *  and offlineReport, not part of GameState/the save. */
export interface ChainCelebration {
  chainId: string;
  chainName: string;
  title?: string;
  rewardGold: number;
  rewardRenown: number;
  items: { defId: string; name: string; rarity: Rarity }[];
}

type Listener = () => void;

/**
 * The engine owns the single mutable GameState. React never mutates it directly;
 * it calls actions here and re-renders on notify(). Keeping mutation in one
 * place makes offline catch-up and live play share exactly the same code path.
 */
export class GameEngine {
  state: GameState;
  offlineReport: OfflineReport | null = null;
  lastResult: QuestResult | null = null;
  lastRaidResult: RaidResult | null = null;
  /**
   * Queued rather than a single overwritable value -- simultaneous events
   * (a quest finishing right as it unlocks something) now show one after
   * another instead of the second silently clobbering the first. `toast`
   * stays a plain getter reading the front of the queue, so Toast.tsx
   * needs zero changes: `engine.toast` behaves exactly as it always has,
   * it just advances instead of going straight to null.
   */
  private toastQueue: string[] = [];
  get toast(): string | null {
    return this.toastQueue[0] ?? null;
  }
  /**
   * Set the moment a chain's final stage resolves successfully, cleared by
   * dismissChainCelebration. Separate from lastResult -- a chain completion
   * gets its own full "Story Chain Complete" overlay (see ChainCompleteModal)
   * rather than being folded into the regular per-quest result card.
   */
  completedChainCelebration: ChainCelebration | null = null;
  /**
   * Transient (unsaved) request to open the menu on a specific tab -- e.g.
   * "View in Lore" on a chain-completion result. Not part of GameState since
   * it's a one-shot UI intent, not save data. Consumed once by MenuWindow on
   * mount, same pattern as lastResult/toast being read-then-cleared.
   */
  requestedTab: string | null = null;

  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private lastTick = Date.now();
  private lastSave = 0;
  private adapter: SaveAdapter;

  constructor(state: GameState, adapter: SaveAdapter = defaultAdapter()) {
    this.state = state;
    this.adapter = adapter;
  }

  static async boot(adapter: SaveAdapter = defaultAdapter()): Promise<GameEngine> {
    const { state, isNew } = await SaveManager.load(adapter);
    const engine = new GameEngine(state, adapter);
    if (!isNew) engine.catchUpOffline();
    engine.refreshWorld(Date.now());
    engine.start();
    return engine;
  }

  /* --------------------------- subscriptions --------------------------- */

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  /** Archives every message into the persistent notification log, capped
   *  at 100, regardless of whether the toast queue is currently empty. */
  private archive(message: string) {
    this.state.notifications.unshift({ id: uid('note'), message, timestamp: Date.now() });
    if (this.state.notifications.length > 100) this.state.notifications.length = 100;
  }

  private say(message: string) {
    this.archive(message);
    this.toastQueue.push(message);
    this.notify();
  }

  /** Fires every message a newly-triggered guidance topic has, in order,
   *  onto the same toast queue -- see GuidanceManager for the topics
   *  themselves. */
  private reportGuidance(topics: GuidanceTopic[]) {
    for (const topic of topics) {
      for (const message of topic.messages) this.say(message);
    }
  }

  /** Sound, toast, and the Steam stub, for every achievement id that just unlocked. */
  private reportAchievements(ids: string[]) {
    if (ids.length === 0) return;
    for (const id of ids) {
      const def = AchievementManager.list().find((a) => a.id === id);
      playSound('achievement');
      this.say(`Achievement unlocked: ${def?.name ?? id}`);
      void window.littleKnight?.unlockAchievement(id);
    }
  }

  /**
   * Called right after a quest resolves for a hero with an active Auto-Chain
   * streak. Either starts the next quest and extends the streak, or ends it
   * (cap reached, upgrade somehow no longer active, or nothing eligible on
   * the board) and resets the hero's counters. Shared by live tick() and
   * offline catch-up — offline continuation works the same way, just without
   * the toast/sound treatment live play gets, and using generateBoard's own
   * time-seeded determinism to reproduce what the board would have shown at
   * that historical moment rather than needing a separate simulation.
   */
  private tryContinueAutoChain(hero: Hero, now: number): { continued: boolean; completedCount: number; target: number } | null {
    if (hero.autoChainTarget === null) return null;
    const target = hero.autoChainTarget;

    const giveUp = (): { continued: boolean; completedCount: number; target: number } => {
      const completedCount = hero.autoChainCount;
      hero.autoChainTarget = null;
      hero.autoChainCount = 0;
      return { continued: false, completedCount, target };
    };

    if (hero.autoChainCount >= target) return giveUp();
    const level = this.state.upgrades['auto_chain'] ?? 0;
    if (level <= 0) return giveUp();

    this.state.questBoard = QuestManager.generateBoard(this.state, now);
    const offer = QuestManager.pickBestQuest(this.state, hero, now);
    if (!offer) return giveUp();

    const { error } = QuestManager.start(this.state, hero, offer, [], now);
    if (error) return giveUp();

    hero.autoChainCount += 1;
    return { continued: true, completedCount: hero.autoChainCount, target };
  }

  clearToast() {
    this.toastQueue.shift();
    this.notify();
  }

  /**
   * Public entry point for a UI-triggered informational toast that isn't
   * tied to a specific game action -- everything else reaches the queue
   * through the private say() called internally by recruit/repair/start
   * quest/etc. This is for things like "discover this item first" on an
   * undiscovered raid loot entry, which isn't really an "action" with a
   * success/failure outcome, just a nudge.
   */
  showToast(message: string) {
    this.say(message);
  }

  dismissOfflineReport() {
    this.offlineReport = null;
    this.notify();
  }

  dismissResult() {
    this.lastResult = null;
    this.notify();
  }

  dismissRaidResult() {
    this.lastRaidResult = null;
    this.notify();
  }

  dismissChainCelebration() {
    this.completedChainCelebration = null;
    this.notify();
  }

  /* ------------------------------ lifecycle ---------------------------- */

  start() {
    if (this.timer !== null) return;
    this.lastTick = Date.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    this.state.stats.playTimeMs += Math.max(0, Math.min(delta, TICK_MS * 5));
    this.state.lastSeen = now;

    let changed = false;
    for (const hero of this.state.heroes) {
      const before = hero.injuries.length;
      HeroManager.pruneInjuries(hero, now);
      if (hero.injuries.length !== before) changed = true;
    }

    const due = this.state.activeQuests.filter((q) => q.endsAt <= now);
    for (const quest of due) {
      const result = QuestManager.resolve(this.state, quest, quest.endsAt);
      this.lastResult = result;
      changed = true;
      // Biggest news first, and only one cue per resolution — a chain
      // completion is a bigger deal than a routine level-up, which is a
      // bigger deal than a plain success. Offline catch-up never reaches
      // here, so this only fires for quests you were actually watching.
      if (result.chainAdvanced?.completed) {
        playSound('chain_complete');
        const chain = CHAIN_BY_ID[result.chainAdvanced.chainId];
        if (chain) {
          this.completedChainCelebration = {
            chainId: chain.id,
            chainName: chain.name,
            title: chain.title,
            rewardGold: chain.rewardGold,
            rewardRenown: chain.rewardRenown,
            items: chain.rewardItems
              .map((defId) => {
                const def = EQUIPMENT_BY_ID[defId];
                return def ? { defId, name: def.name, rarity: def.rarity } : null;
              })
              .filter((x): x is { defId: string; name: string; rarity: Rarity } => x !== null),
          };
        }
      } else if (result.loot.some((l) => l.rarity === 'legendary')) playSound('legendary_drop');
      else if (result.levelsGained > 0) playSound('level_up');
      else playSound(result.success ? 'quest_success' : 'quest_fail');
      this.reportAchievements(AchievementManager.checkAll(this.state, now));
      this.reportGuidance(GuidanceManager.checkAll(this.state));

      const chainHero = this.state.heroes.find((h) => h.id === quest.heroId);
      if (chainHero) {
        const chainResult = this.tryContinueAutoChain(chainHero, now);
        if (chainResult) {
          if (chainResult.continued) {
            playSound('depart');
            this.say(`${chainHero.name} keeps going — ${chainResult.completedCount}/${chainResult.target} in this streak.`);
          } else {
            playSound('chain_complete');
            const n = chainResult.completedCount;
            this.say(`${chainHero.name} has chained ${n} quest${n === 1 ? '' : 's'} and is waiting for new orders.`);
          }
        }
      }
    }

    if (this.state.activeRaid && this.state.activeRaid.endsAt <= now) {
      const raidResult = RaidManager.resolve(this.state, this.state.activeRaid, now);
      this.lastRaidResult = raidResult;
      changed = true;
      playSound(raidResult.fullClear ? 'chain_complete' : raidResult.encountersCleared > 0 ? 'quest_success' : 'quest_fail');
      this.reportAchievements(AchievementManager.checkAll(this.state, now));
      this.reportGuidance(GuidanceManager.checkAll(this.state));
    }

    if (this.refreshWorld(now)) changed = true;

    if (now - this.lastSave >= AUTOSAVE_MS) {
      this.lastSave = now;
      void SaveManager.save(this.adapter, this.state);
    }

    // Timers tick every second regardless, so always notify.
    this.notify();
    if (changed) void SaveManager.save(this.adapter, this.state);
  }

  /** Regenerates the quest board and shop when their windows roll over. */
  private refreshWorld(now: number): boolean {
    let changed = false;
    const window = Math.floor(now / BOARD_REFRESH_MS);
    if (this.state.boardRefreshedAt !== window || this.state.questBoard.length === 0) {
      this.state.boardRefreshedAt = window;
      const active = new Set(this.state.activeQuests.map((q) => q.offer.id));
      this.state.questBoard = QuestManager.generateBoard(this.state, now).filter((o) => !active.has(o.id));
      changed = true;
    }
    if (ShopManager.needsRefresh(this.state, now) || this.state.shop.equipment.length === 0) {
      ShopManager.refresh(this.state, now, true);
      changed = true;
    }
    if (ModifierManager.hasUnlock(this.state, 'blackMarket')
      && (ShopManager.blackMarketNeedsRefresh(this.state, now) || this.state.blackMarket.equipment.length === 0)) {
      ShopManager.refreshBlackMarket(this.state, now, true);
      changed = true;
    }
    return changed;
  }

  /**
   * Resolves everything that finished while the app was closed. Quests resolve
   * in chronological order so chains advance correctly across multiple stages.
   */
  catchUpOffline() {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.state.lastSeen);
    if (elapsed < 60_000) return;

    const results: QuestResult[] = [];
    const raidResults: RaidResult[] = [];
    // Auto-Chain can inject a newly-started quest into this same pass — if
    // it also ends before `now`, it needs resolving in this same offline
    // catch-up rather than waiting for the next time the app opens. Capped
    // generously as a pure safety net: a streak stops itself at its target
    // and needs a manual send to resume, so no single hero can ever produce
    // more than ~10 (the highest tier) extra iterations from this regardless
    // of how long the offline gap was.
    let guard = 0;
    while (guard++ < 500) {
      const due = this.state.activeQuests.filter((q) => q.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
      if (due.length === 0) break;
      const quest = due[0];
      const result = QuestManager.resolve(this.state, quest, quest.endsAt);
      results.push(result);
      // Unlocks still register (and Steam still gets notified) for progress
      // made while the app was closed — just quietly, without the toast/sound
      // treatment live play gets, since a barrage of those on launch would be
      // more annoying than celebratory.
      for (const id of AchievementManager.checkAll(this.state, quest.endsAt)) {
        void window.littleKnight?.unlockAchievement(id);
      }
      // Guidance topics still get marked seen and archived to the log for
      // progress made offline -- same "quietly, no toast" treatment as
      // achievements above, so reopening the app after a long stretch away
      // doesn't dump a wall of tutorial toasts all at once.
      for (const topic of GuidanceManager.checkAll(this.state)) {
        for (const message of topic.messages) this.archive(message);
      }

      const hero = this.state.heroes.find((h) => h.id === quest.heroId);
      if (hero) this.tryContinueAutoChain(hero, quest.endsAt);
    }
    for (const hero of this.state.heroes) HeroManager.pruneInjuries(hero, now);

    // A raid resolves as a single event when its total duration has
    // elapsed, same as the loop above does for individual quests -- only
    // ever one active at a time, so no guard loop needed here.
    if (this.state.activeRaid && this.state.activeRaid.endsAt <= now) {
      const raidEndsAt = this.state.activeRaid.endsAt;
      const raidResult = RaidManager.resolve(this.state, this.state.activeRaid, raidEndsAt);
      raidResults.push(raidResult);
      for (const id of AchievementManager.checkAll(this.state, raidEndsAt)) {
        void window.littleKnight?.unlockAchievement(id);
      }
      for (const topic of GuidanceManager.checkAll(this.state)) {
        for (const message of topic.messages) this.archive(message);
      }
    }

    this.state.stats.offlineTimeMs += elapsed;
    this.state.lastSeen = now;

    if (results.length > 0 || raidResults.length > 0 || elapsed > 5 * 60_000) {
      this.offlineReport = {
        elapsedMs: elapsed,
        results,
        raidResults,
        goldGained: results.reduce((sum, r) => sum + r.gold, 0) + raidResults.reduce((sum, r) => sum + r.gold, 0),
        xpGained: results.reduce((sum, r) => sum + r.xp, 0) + raidResults.reduce((sum, r) => sum + r.xp, 0),
      };
    }
  }

  saveNow() {
    return SaveManager.save(this.adapter, this.state);
  }

  // --- TESTING TOOLS (delete this block to remove) ---
  // Gated by TESTING_TOOLS_ENABLED at the UI level (MenuWindow only shows the
  // tab when it's true) and again here, so these no-op even if somehow
  // called directly. Everything testing-related in this file lives in this
  // one fenced block.

  /**
   * Rewinds lastSeen and runs the real offline catch-up on it — the exact
   * same event-driven logic (including Auto-Chain continuation) that a
   * genuine multi-day absence would trigger, just without waiting. This is
   * deliberately not an "instantly win" cheat: a tester skipping a month
   * sees what a month of real play would actually have produced.
   */
  testSkipTime(ms: number) {
    if (!TESTING_TOOLS_ENABLED) return;
    // endsAt on an active quest is an absolute real-world timestamp fixed at
    // departure, independent of lastSeen -- rewinding lastSeen alone updates
    // the offline-report bookkeeping but does nothing to make an in-flight
    // quest actually due. Verified this directly: an early version of this
    // method reported a correct 24h elapsed gap while resolving zero quests,
    // because the quest's own endsAt hadn't moved. Shifting every active
    // quest's endsAt back by the same amount is what actually makes time-
    // based completion trigger.
    for (const quest of this.state.activeQuests) {
      quest.endsAt -= ms;
    }
    this.state.lastSeen = Math.max(0, this.state.lastSeen - ms);
    this.catchUpOffline();
    // catchUpOffline resolves due quests but never touches the board --
    // refreshWorld's own regeneration is keyed to a real-wall-clock 30-min
    // window, which usually hasn't rolled over during a *simulated* skip.
    // Auto-Chain can burn through an entire unrefreshed board well before
    // that window naturally ticks over, especially across a multi-day/week
    // skip where hero levels (and so board eligibility) have moved a lot.
    // Force it here so post-skip levels are reflected immediately rather
    // than needing a manual refresh afterward.
    this.forceRefreshBoard(Date.now());
    this.notify();
    void this.saveNow();
  }

  /**
   * Forces the quest board to regenerate right now, bypassing the normal
   * 30-min real-time window check -- for restocking a board Auto-Chain has
   * emptied out during testing, without waiting for or faking more time to
   * pass. Also used internally by testSkipTime for the same reason.
   */
  private forceRefreshBoard(now: number) {
    this.state.boardRefreshedAt = -1;
    this.refreshWorld(now);
  }

  testRefreshBoard() {
    if (!TESTING_TOOLS_ENABLED) return;
    this.forceRefreshBoard(Date.now());
    this.notify();
    void this.saveNow();
  }

  testAddGold(amount: number) {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.gold = Math.max(0, this.state.gold + amount);
    this.notify();
    void this.saveNow();
  }

  testAddRenown(amount: number) {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.renown = Math.max(0, this.state.renown + amount);
    this.notify();
    void this.saveNow();
  }

  /**
   * Jumps a hero straight to a target level, for reaching level-gated
   * content without playing through everything below it. Reuses
   * HeroManager.grantXp rather than setting hero.level directly, so stat
   * growth per level stays exactly consistent with normal play — granting
   * precisely the cumulative XP needed lands exactly on the target level
   * with the same stats a hero who actually earned it would have.
   */
  testSetHeroLevel(heroId: string, targetLevel: number) {
    if (!TESTING_TOOLS_ENABLED) return;
    const hero = this.hero(heroId);
    if (!hero || targetLevel <= hero.level) return;
    let needed = -hero.xp; // cancel out whatever partial xp they already have
    for (let lvl = hero.level; lvl < targetLevel; lvl++) needed += xpForLevel(lvl);
    HeroManager.grantXp(hero, Math.max(0, needed));
    this.notify();
    void this.saveNow();
  }

  testHealAllInjuries() {
    if (!TESTING_TOOLS_ENABLED) return;
    for (const hero of this.state.heroes) hero.injuries = [];
    this.notify();
    void this.saveNow();
  }

  /** Resolves a hero's active quest immediately, using its own already-locked-in odds — not a guaranteed win, just not waiting for the clock. */
  testCompleteActiveQuest(heroId: string) {
    if (!TESTING_TOOLS_ENABLED) return;
    const quest = this.state.activeQuests.find((q) => q.heroId === heroId);
    if (!quest) return;
    const result = QuestManager.resolve(this.state, quest, quest.endsAt);
    this.lastResult = result;
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    this.notify();
    void this.saveNow();
  }

  testCompleteAllActiveQuests() {
    if (!TESTING_TOOLS_ENABLED) return;
    for (const quest of [...this.state.activeQuests]) {
      const result = QuestManager.resolve(this.state, quest, quest.endsAt);
      this.lastResult = result;
    }
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    this.notify();
    void this.saveNow();
  }

  // --- end testing tools ---

  /* -------------------------------- queries ---------------------------- */

  hero(id: string): Hero | undefined {
    return this.state.heroes.find((h) => h.id === id);
  }

  activeQuestFor(heroId: string): ActiveQuest | undefined {
    return this.state.activeQuests.find((q) => q.heroId === heroId);
  }

  get primaryHero(): Hero {
    return this.state.heroes[0];
  }

  /**
   * The hero the desktop companion shows. Follows whoever was most recently
   * sent on a quest (set by startQuest below), falling back to heroes[0] if
   * that hero no longer exists — e.g. after a hard reset.
   */
  get displayedHero(): Hero {
    const focused = this.state.focusedHeroId
      ? this.state.heroes.find((h) => h.id === this.state.focusedHeroId)
      : undefined;
    return focused ?? this.state.heroes[0];
  }

  /** Manually focus a specific hero, e.g. from the Heroes panel or the widget's cycle arrows. */
  setFocusedHero(heroId: string) {
    if (!this.state.heroes.some((h) => h.id === heroId)) return;
    this.state.focusedHeroId = heroId;
    this.notify();
    void this.saveNow();
  }

  /** Cycles the companion to the next (or previous) hero in roster order. */
  cycleFocusedHero(direction: 1 | -1 = 1) {
    const heroes = this.state.heroes;
    if (heroes.length <= 1) return;
    const currentIndex = heroes.findIndex((h) => h.id === this.displayedHero.id);
    const nextIndex = (currentIndex + direction + heroes.length) % heroes.length;
    this.setFocusedHero(heroes[nextIndex].id);
  }

  /**
   * Sets or renames the guild. Trimmed and length-capped since this will
   * eventually show on a leaderboard; empty/whitespace-only input is a no-op
   * rather than clearing the name back out.
   */
  setGuildName(name: string) {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    this.state.guildName = trimmed;
    this.notify();
    void this.saveNow();
  }

  /** Requests that the menu open (or switch) to a specific tab id. */
  requestTab(id: string) {
    this.requestedTab = id;
  }

  /** Reads and clears the pending tab request. Called once by MenuWindow on mount. */
  consumeRequestedTab(): string | null {
    const id = this.requestedTab;
    this.requestedTab = null;
    return id;
  }

  /** What the corner sprite should be doing right now. */
  get companionStatus(): 'idle' | 'questing' | 'injured' | 'ready' {
    const heroes = this.state.heroes;
    if (heroes.some((h) => h.status === 'questing')) return 'questing';
    if (heroes.some((h) => h.injuries.length > 0)) return 'injured';
    if (this.state.questBoard.length > 0) return 'ready';
    return 'idle';
  }

  /* -------------------------------- actions ---------------------------- */

  startQuest(heroId: string, offer: QuestOffer, consumables: string[]) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const { error } = QuestManager.start(this.state, hero, offer, consumables, Date.now());
    if (error) return this.say(error);
    this.state.focusedHeroId = heroId;

    // A manual send always (re)starts a fresh Auto-Chain streak if the
    // upgrade is owned — choosing to send by hand again implicitly abandons
    // whatever streak state was there before.
    const level = this.state.upgrades['auto_chain'] ?? 0;
    if (level > 0) {
      const range = AUTO_CHAIN_RANGES[level];
      hero.autoChainTarget = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
      hero.autoChainCount = 1;
    } else {
      hero.autoChainTarget = null;
      hero.autoChainCount = 0;
    }

    playSound('depart');
    this.say(`${hero.name} sets out: ${offer.name}`);
    void this.saveNow();
  }

  /**
   * Commits a party to a raid. Deliberately no Auto-Chain interaction at
   * all -- raids never auto-continue into anything, on purpose, same
   * reasoning as chain quests being excluded from pickBestQuest: this is a
   * deliberate, noticed commitment, not something that should ever start
   * without the player choosing it.
   */
  startRaid(raidId: string, difficulty: RaidDifficulty, heroIds: string[]) {
    const { error } = RaidManager.start(this.state, raidId, difficulty, heroIds, Date.now());
    if (error) return this.say(error);
    playSound('depart');
    this.say(`The guild marches on ${RAID_BY_ID[raidId]?.name ?? 'the raid'}. ${heroIds.length} strong.`);
    void this.saveNow();
  }

  equip(heroId: string, itemUid: string) {
    const hero = this.hero(heroId);
    const item = this.state.stash.find((i) => i.uid === itemUid);
    if (!hero || !item) return;
    const error = EquipmentManager.equip(this.state, hero, item);
    if (error) return this.say(error);
    this.checkSetBonusMilestones(hero);
    this.notify();
    void this.saveNow();
  }

  /**
   * Fires a one-time flashy toast the first time any hero crosses a new
   * set-bonus piece-count threshold (e.g. first hero to hit 3/3 Voidforged).
   * Only checked on equip, never unequip -- crossing a threshold is only
   * ever something that happens by adding a piece, and re-notifying every
   * time someone swaps gear in and out would just be noise. Tracked in
   * state.notifiedSetBonuses so it only ever fires once per save, regardless
   * of how many times a hero re-equips into and back out of a set.
   */
  private checkSetBonusMilestones(hero: Hero) {
    const setCounts: Record<string, number> = {};
    for (const item of Object.values(hero.equipment)) {
      if (!item) continue;
      const def = EQUIPMENT_BY_ID[item.defId];
      if (def?.setId) setCounts[def.setId] = (setCounts[def.setId] ?? 0) + 1;
    }
    for (const [setId, count] of Object.entries(setCounts)) {
      const set = SET_BY_ID[setId];
      if (!set) continue;
      for (const bonus of set.bonuses) {
        if (count < bonus.count) continue;
        const key = `${setId}:${bonus.count}`;
        if (this.state.notifiedSetBonuses.includes(key)) continue;
        this.state.notifiedSetBonuses.push(key);
        playSound('legendary_drop');
        this.say(`${set.name} — ${bonus.label} unlocked!`);
      }
    }
  }

  unequip(heroId: string, slot: Parameters<typeof EquipmentManager.unequip>[2]) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = EquipmentManager.unequip(this.state, hero, slot);
    if (error) return this.say(error);
    this.notify();
    void this.saveNow();
  }

  repair(itemUid: string) {
    const found = EquipmentManager.allItems(this.state).find((e) => e.item.uid === itemUid);
    if (!found) return;
    const error = EquipmentManager.repair(this.state, found.item, this.state.guild.workshop ?? 0);
    if (error) return this.say(error);
    this.say('Repaired.');
    void this.saveNow();
  }

  repairAll() {
    const workshop = this.state.guild.workshop ?? 0;
    let spent = 0;
    for (const { item } of EquipmentManager.allItems(this.state)) {
      const cost = EquipmentManager.repairCost(item, workshop);
      if (cost > 0 && this.state.gold >= cost) {
        EquipmentManager.repair(this.state, item, workshop);
        spent += cost;
      }
    }
    this.say(spent > 0 ? `Repaired everything for ${spent} gold.` : 'Nothing needed repairing.');
    void this.saveNow();
  }

  upgradeItem(itemUid: string) {
    const found = EquipmentManager.allItems(this.state).find((e) => e.item.uid === itemUid);
    if (!found) return;
    const error = EquipmentManager.upgrade(this.state, found.item, this.state.guild.workshop ?? 0);
    if (error) return this.say(error);
    this.say(`Refined to +${found.item.plus}.`);
    void this.saveNow();
  }

  sellItem(itemUid: string) {
    const error = ShopManager.sell(this.state, itemUid);
    if (error) return this.say(error);
    this.say('Sold.');
    void this.saveNow();
  }

  buyConsumable(defId: string, amount = 1) {
    const error = InventoryManager.buy(this.state, defId, amount);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  buyShopEquipment(shopUid: string) {
    const error = ShopManager.buyEquipment(this.state, shopUid);
    if (error) return this.say(error);
    playSound('purchase');
    this.say('Added to the stash.');
    void this.saveNow();
  }

  buyBlackMarketEquipment(shopUid: string) {
    const error = ShopManager.buyBlackMarketEquipment(this.state, shopUid);
    if (error) return this.say(error);
    playSound('purchase');
    this.say('The contact melts back into the crowd. Added to the stash.');
    this.reportAchievements(AchievementManager.checkAll(this.state));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    void this.saveNow();
  }

  useConsumable(heroId: string, defId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = InventoryManager.useOnHero(this.state, hero, defId);
    if (error) return this.say(error);
    this.say(`${hero.name} is patched up.`);
    void this.saveNow();
  }

  treatInjury(heroId: string, injuryId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const injury = hero.injuries.find((i) => i.id === injuryId);
    if (!injury) return;
    if (this.state.gold < injury.treatmentCost) return this.say('Not enough gold for treatment.');
    this.state.gold -= injury.treatmentCost;
    this.state.stats.goldSpent += injury.treatmentCost;
    hero.injuries = hero.injuries.filter((i) => i !== injury);
    this.say(`${hero.name} is treated for ${injury.name.toLowerCase()}.`);
    void this.saveNow();
  }

  buyUpgrade(id: string) {
    const error = GuildManager.buyUpgrade(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  buyRaidUpgrade(id: string) {
    const error = GuildManager.buyRaidUpgrade(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  levelUpVendor(vendorId: Parameters<typeof GuildManager.levelUpVendor>[1]) {
    const error = GuildManager.levelUpVendor(this.state, vendorId);
    if (error) return this.say(error);
    playSound('purchase');
    const def = GuildManager.vendors().find((v) => v.id === vendorId);
    this.say(`${def?.name ?? 'The vendor'} has more to offer now.`);
    void this.saveNow();
  }

  upgradeFacility(id: Parameters<typeof GuildManager.upgradeFacility>[1]) {
    const error = GuildManager.upgradeFacility(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  recruit(heroClass: HeroClass) {
    // Checked here rather than relying on GuildManager's own error, so the
    // message can point at the actual fix (upgrades or a Renown perk)
    // instead of a generic "no room" -- this is exactly the kind of thing
    // a player new to the systems wouldn't otherwise know to go looking for.
    if (this.state.heroes.length >= this.heroSlots) {
      return this.say("The guild is out of hero slots. Expand the roster via Guild Hall upgrades or a Renown perk.");
    }
    const error = GuildManager.recruit(this.state, heroClass, createRng(uid('recruit')));
    if (error) return this.say(error);
    this.say('A new hero joins the guild.');
    this.reportAchievements(AchievementManager.checkAll(this.state));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    void this.saveNow();
  }

  buyPerk(id: string) {
    const error = PrestigeManager.buyPerk(this.state, id);
    if (error) return this.say(error);
    this.notify();
    void this.saveNow();
  }

  retire(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const outcome = PrestigeManager.retire(this.state, hero, createRng(uid('retire')), Date.now());
    if ('error' in outcome) return this.say(outcome.error);
    const streakNote = outcome.streak > 1 ? ` Streak ×${outcome.streak}!` : '';
    playSound(outcome.streak > 3 ? 'chain_complete' : 'level_up');
    this.say(`${hero.name} retires a legend. +${outcome.renownGained} Heroic Renown.${streakNote}`);
    this.reportAchievements(AchievementManager.checkAll(this.state));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    void this.saveNow();
  }

  allocateStat(heroId: string, stat: keyof Hero['stats']) {
    const hero = this.hero(heroId);
    if (!hero || hero.statPoints <= 0) return;
    hero.statPoints -= 1;
    hero.stats[stat] += 1;
    this.notify();
    void this.saveNow();
  }

  /** Buys a skin for the guild (usable by any hero of any class). */
  buySkin(skinId: string) {
    if (this.state.unlockedSkins.includes(skinId)) return this.say('Already owned.');
    const def = SKIN_BY_ID[skinId];
    if (!def) return this.say('Unknown skin.');
    if (this.state.gold < def.cost) return this.say('Not enough gold.');
    playSound('purchase');
    this.state.gold -= def.cost;
    this.state.stats.goldSpent += def.cost;
    this.state.unlockedSkins.push(skinId);
    this.say(`${def.name} livery unlocked for the whole guild.`);
    this.reportAchievements(AchievementManager.checkAll(this.state));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    void this.saveNow();
  }

  /** Applies an owned skin to one hero. Free once unlocked. */
  setHeroSkin(heroId: string, skinId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (skinId !== 'original' && !this.state.unlockedSkins.includes(skinId)) {
      return this.say('That livery is not unlocked yet.');
    }
    hero.skin = skinId as typeof hero.skin;
    this.notify();
    void this.saveNow();
  }

  get skinPrice() { return SKIN_PRICE; }

  hardReset() {
    this.state = createInitialState();
    this.offlineReport = null;
    this.lastResult = null;
    this.refreshWorld(Date.now());
    this.say('A new guild opens its doors.');
    void this.saveNow();
  }

  get goldStorage() {
    return ModifierManager.goldStorage(this.state);
  }

  get heroSlots() {
    return ModifierManager.heroSlots(this.state);
  }
}
