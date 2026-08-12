import { ActiveQuest, ElementType, GameState, Hero, HeroClass, MaterialId, Modifiers, Pet, PeddlerFlipResult, QuestOffer, QuestResult, Rarity, RaidDifficulty, RaidResult, Stats } from './types';
import { createRng, uid } from './rng';
import { HeroManager } from './managers/HeroManager';
import { QuestManager, BOARD_REFRESH_MS, CHAIN_BY_ID } from './managers/QuestManager';
import { RaidManager } from './managers/RaidManager';
import { ShopManager } from './managers/ShopManager';
import { SaveManager, SaveAdapter, defaultAdapter, createInitialState } from './managers/SaveManager';
import { EquipmentManager } from './managers/EquipmentManager';
import { InventoryManager } from './managers/InventoryManager';
import { DlcManager } from './managers/DlcManager';
import { GuildManager } from './managers/GuildManager';
import { PrestigeManager } from './managers/PrestigeManager';
import { ModifierManager } from './managers/ModifierManager';
import { AchievementManager } from './managers/AchievementManager';
import { GuidanceManager, GuidanceTopic } from './managers/GuidanceManager';
import { HarvestManager } from './managers/HarvestManager';
import { PetManager } from './managers/PetManager';
import { PeddlerManager } from './managers/PeddlerManager';
import { CraftingManager } from './managers/CraftingManager';
import { SKIN_BY_ID, SKIN_PRICE, TOMBSTONE_STYLE_BY_ID, AUTO_CHAIN_RANGES, xpForLevel } from './data/progression';
import { EQUIPMENT_BY_ID, SET_BY_ID, GEAR_SCORE_BY_RARITY, EQUIP_SLOTS } from './data/equipment';
import { RAID_BY_ID } from './data/raids';
import { Tuning } from './data/tuning';
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
   * Set by hatchEgg, cleared by dismissHatchedPet -- same transient
   * (unsaved), read-then-cleared shape as lastResult/lastRaidResult. Feeds
   * HatchRevealModal, the "the egg hatched into 'xx'" card shown the
   * moment a player opens a ready egg from the Nests tab. Genuinely
   * transient rather than persisted: if the app closes before it's
   * dismissed, there's nothing to restore -- the pet itself is already
   * safely in state.pets either way, this is only the one-shot reveal.
   */
  lastHatchedPet: Pet | null = null;
  /** Set by pickPeddlerCard, cleared by dismissGrimsbyResult -- same
   *  transient (unsaved), read-then-cleared shape as lastResult/
   *  lastHatchedPet. Feeds PeddlerPanel's three-card reveal. */
  lastGrimsbyResult: PeddlerFlipResult | null = null;
  /**
   * Queued rather than a single overwritable value -- simultaneous events
   * (a quest finishing right as it unlocks something) now show one after
   * another instead of the second silently clobbering the first. `toast`
   * stays a plain getter reading the front of the queue, so Toast.tsx
   * needs zero changes: `engine.toast` behaves exactly as it always has,
   * it just advances instead of going straight to null.
   */
  private toastQueue: { message: string; seq: number }[] = [];
  private nextToastSeq = 0;
  /**
   * `seq` exists purely so two back-to-back toasts with identical text
   * (e.g. levelling the same vendor twice in under 3.2s) are still
   * distinguishable. Toast.tsx's own auto-dismiss effect is keyed on
   * `[toast, engine]`, and React only re-runs an effect when a dependency
   * actually changes by value -- if the message text is unchanged, the
   * effect doesn't re-fire and the OLD timer (already consumed by the
   * first toast) never gets rescheduled for the second one. Confirmed as
   * the actual cause of a notification "not going away": it wasn't stuck,
   * it just never had a timer running for it in the first place.
   */
  get toast(): { message: string; seq: number } | null {
    return this.toastQueue[0] ?? null;
  }
  /**
   * Separate from the toast queue entirely -- an achievement unlock gets
   * its own dedicated, richer popup (see AchievementPopup.tsx) rather than
   * a plain text toast, since these are Steam-tracked and meant to read as
   * a genuinely different kind of moment. Still archived into the Guide's
   * notification log the same way everything else is (see
   * reportAchievements below), just not also duplicated as a plain toast.
   */
  private achievementQueue: string[] = [];
  get currentAchievement() {
    const id = this.achievementQueue[0];
    if (!id) return null;
    return AchievementManager.list().find((a) => a.id === id) ?? null;
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
    // Fire-and-forget, not awaited -- checking for owned DLC packs
    // shouldn't hold up the game's own startup, and today KNOWN_DLC_PACKS
    // is empty anyway (this resolves instantly with nothing found). Not
    // wired into any live UI yet; see DlcManager's own doc comment for
    // what a future consumer (a skin picker, a pet roster) needs to do to
    // pick up a pack that finishes loading after that UI's first render.
    void DlcManager.loadInstalledPacks();
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
   *  at 100, regardless of whether the toast queue is currently empty.
   *  `banner` marks it as a candidate for the top NotificationBanner, on
   *  top of the ordinary Toast every archived message already gets --
   *  see NotificationEntry.banner's own comment for why this exists and
   *  defaults false. */
  private archive(message: string, targetTab?: string, banner = false) {
    this.state.notifications.unshift({
      id: uid('note'), message, timestamp: Date.now(), targetTab, banner,
    });
    if (this.state.notifications.length > 100) this.state.notifications.length = 100;
  }

  private say(message: string, targetTab?: string, banner = false) {
    this.archive(message, targetTab, banner);
    this.toastQueue.push({ message, seq: this.nextToastSeq++ });
    this.notify();
  }

  /** Fires every message a newly-triggered guidance topic has, in order,
   *  onto the same toast queue -- see GuidanceManager for the topics
   *  themselves. Every guidance message earns the top banner (banner:
   *  true) -- these one-time "how to" / "you've unlocked X" nudges are
   *  exactly the "worth surfacing prominently" moments the banner exists
   *  for, unlike the vast majority of other say() call sites (routine
   *  action confirmations), which stay Toast-only. */
  private reportGuidance(topics: GuidanceTopic[]) {
    for (const topic of topics) {
      // The scripted tour's own final beat -- shown as a standalone modal
      // rather than a toast easy to miss, since this is specifically the
      // "you found the thing the tour was building toward" moment. Still
      // archived into the Notifications log exactly like every other
      // topic (via archive() inside say() normally) -- just archived
      // directly here instead, since it isn't also going through the
      // toast queue. Deliberately not banner:true either -- the modal
      // itself is already the prominent treatment; stacking a banner on
      // top would be the same "two big moments competing" issue already
      // avoided elsewhere (see the chain-completion flourish revert).
      if (topic.id === 'first_chain_seen') {
        for (const message of topic.messages) this.archive(message, topic.targetTab);
        this.state.pendingChainDiscovery = true;
        this.notify();
        continue;
      }
      for (const message of topic.messages) this.say(message, topic.targetTab, true);
    }
  }

  /** Marks the scripted first-run tour as seen -- called identically
   *  whether the player finishes every step or hits Skip on step one.
   *  Never shown again either way. */
  dismissOnboarding() {
    this.state.seenOnboarding = true;
    void this.saveNow();
  }

  /** Dismisses the "you've discovered a quest chain" modal -- the tour's
   *  own finale, triggered independently of the scripted steps since it
   *  depends on the board actually rolling a chain, not a fixed step count. */
  dismissChainDiscovery() {
    this.state.pendingChainDiscovery = false;
    void this.saveNow();
  }

  /**
   * Sound, the dedicated popup queue, the Guide notification log, and the
   * Steam stub, for every achievement id that just unlocked. Archives
   * directly (not via say()) so this doesn't also produce a redundant
   * plain-text toast on top of the richer popup -- one moment, not two.
   */
  private reportAchievements(ids: string[]) {
    if (ids.length === 0) return;
    for (const id of ids) {
      const def = AchievementManager.list().find((a) => a.id === id);
      playSound('achievement');
      this.archive(`Achievement unlocked: ${def?.name ?? id}`);
      this.achievementQueue.push(id);
      void window.littleKnight?.unlockAchievement(id);
    }
    this.notify();
  }

  /**
   * Called right after a quest resolves for a hero who might auto-continue
   * into another one. Two independent mechanisms live here, checked in
   * order:
   *
   * 1. **Chain-stepping** (`hero.autoAdvanceChainId`) -- set by startQuest
   *    when a chain offer was sent via "Chain Quest Steps" rather than
   *    "Send on Quest". Auto-continues *that specific chain's* remaining
   *    stages, independent of whether the Auto-Chain upgrade is owned.
   * 2. **Auto-Chain bounty streak** (`hero.autoChainTarget`) -- the
   *    existing upgrade-gated repeat mechanic. Deliberately still never
   *    picks up chain offers itself (see pickBestQuest) -- it's a fallback
   *    for ordinary board contracts, not a second way to advance a story.
   *
   * A finished chain (every stage done) hands off to #2 to spend whatever
   * streak budget is left, so "auto-queue a chain" reads as: run the whole
   * chain, then keep going on ordinary contracts. A *failed* stage, in
   * either mechanism, stops everything outright instead of continuing --
   * the as-far-as-you-can-go rule: one failure ends the run and returns the
   * hero to idle for the player to decide what's next, rather than quietly
   * grinding through more attempts (or more contracts) on its own.
   *
   * Shared by live tick() and offline catch-up — offline continuation works
   * the same way, just without the toast/sound treatment live play gets.
   */
  private tryContinueAutoChain(
    hero: Hero, now: number, prevSuccess: boolean,
  ): { continued: boolean; completedCount: number; target: number; via: 'chain' | 'streak'; stoppedByFailure?: boolean } | null {
    if (hero.autoAdvanceChainId) {
      const chainId = hero.autoAdvanceChainId;
      if (!prevSuccess) {
        // As far as you can go: a failed stage stops the chain right here,
        // and takes the ordinary bounty streak down with it too, so the
        // hero doesn't quietly wander back into contracts right after a
        // chain stage went wrong -- the player should notice and decide.
        hero.autoAdvanceChainId = null;
        hero.autoChainTarget = null;
        hero.autoChainCount = 0;
        return { continued: false, completedCount: 0, target: 0, via: 'chain', stoppedByFailure: true };
      }
      const chain = CHAIN_BY_ID[chainId];
      const active = this.state.activeChains.find((c) => c.chainId === chainId);
      if (chain && active && active.stage < chain.stages.length) {
        const rng = createRng(uid('autoAdvanceChain'));
        const offer = QuestManager.chainOffer(chain, active.stage, rng);
        const { error } = QuestManager.start(this.state, hero, offer, [], now);
        if (!error) {
          return { continued: true, completedCount: active.stage + 1, target: chain.stages.length, via: 'chain' };
        }
      }
      // Chain complete (or nothing left to advance) -- fall through to the
      // ordinary Auto-Chain bounty streak below, if one is still active,
      // to spend whatever budget remains.
      hero.autoAdvanceChainId = null;
    }

    if (hero.autoChainTarget === null) return null;
    const target = hero.autoChainTarget;

    const giveUp = (stoppedByFailure = false): { continued: boolean; completedCount: number; target: number; via: 'streak'; stoppedByFailure?: boolean } => {
      const completedCount = hero.autoChainCount;
      hero.autoChainTarget = null;
      hero.autoChainCount = 0;
      return { continued: false, completedCount, target, via: 'streak', stoppedByFailure };
    };

    if (!prevSuccess) return giveUp(true);
    if (hero.autoChainCount >= target) return giveUp();
    const level = this.state.upgrades['auto_chain'] ?? 0;
    if (level <= 0) return giveUp();

    // Regenerated fresh (not just filled-in-if-empty) so a streaking hero
    // always has a next contract to grab, same guarantee the old shared
    // board gave this call -- but scoped to this hero's own pool only now,
    // so it can no longer refill offers other heroes were relying on.
    // Frozen offer (if any) survives this restock too -- see
    // QuestManager.applyFrozenOffer.
    this.state.questBoards[hero.id] = QuestManager.applyFrozenOffer(
      this.state, hero, QuestManager.generateContractsForHero(this.state, hero, now),
    );
    const offer = QuestManager.pickBestQuest(this.state, hero, now);
    if (!offer) return giveUp();

    const { error } = QuestManager.start(this.state, hero, offer, [], now);
    if (error) return giveUp();

    hero.autoChainCount += 1;
    return { continued: true, completedCount: hero.autoChainCount, target, via: 'streak' };
  }

  clearToast() {
    this.toastQueue.shift();
    this.notify();
  }

  dismissAchievement() {
    this.achievementQueue.shift();
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
    const infirmaryLevel = this.state.guild.infirmary ?? 0;
    for (const hero of this.state.heroes) {
      const before = hero.injuries.length;
      HeroManager.pruneInjuries(hero, now);
      if (hero.injuries.length !== before) changed = true;
      HeroManager.regenHealth(hero, delta, infirmaryLevel, hero.status === 'questing');
      if (hero.status === 'fallen' && HeroManager.autoReviveDue(hero, now)) {
        HeroManager.revive(hero);
        changed = true;
        this.say(`${hero.name} has recovered and returns to the roster.`, 'heroes');
      }
    }

    // Pets regen/auto-revive independently of their paired hero's own
    // status -- a benched (unpaired) pet still heals over time, same as
    // an unpaired one would just sit there otherwise. See
    // guild-idler-status.md's Pet Health/Fallen entry.
    const kennelLevel = this.state.guild.kennel ?? 0;
    for (const pet of this.state.pets) {
      PetManager.regenHealth(this.state, pet, delta, kennelLevel);
      if (PetManager.isFallen(pet) && PetManager.autoReviveDue(pet, now)) {
        PetManager.revive(this.state, pet);
        changed = true;
        this.say(`${pet.name} has recovered.`, 'heroes');
      }
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
      // The "egg is ready" moment now gets its own dedicated prompt
      // (HatchReadyModal, plus an idle-view banner) rather than a toast --
      // set directly on state.pendingHatchReadyNotice inside
      // QuestManager.resolve, nothing to do here. A toast was too easy to
      // miss for something the player has to act on (open the Hatchery,
      // click the ready egg) rather than just read.
      if (result.eggDropped) {
        this.say(`Found a ${result.eggDropped.rarity} egg! Equip it in the Hatchery to start it incubating.`, 'hatchery');
      }
      // Grimsby's arrival -- same "live play only, offline catch-up never
      // reaches here" treatment as everything else in this block. A
      // flavor-first banner rather than a plain announcement, matching
      // his character; "Go to" points straight at his tab.
      if (result.grimsbyArrived) {
        this.say('A cart rattles up outside the gate, one wheel squeaking like it\u2019s begging to be replaced.', 'peddler');
      }
      this.reportAchievements(AchievementManager.checkAll(this.state, now));
      this.reportGuidance(GuidanceManager.checkAll(this.state));

      const chainHero = this.state.heroes.find((h) => h.id === quest.heroId);
      if (chainHero) {
        const chainResult = this.tryContinueAutoChain(chainHero, now, result.success);
        if (chainResult) {
          if (chainResult.continued) {
            playSound('depart');
            const label = chainResult.via === 'chain' ? 'chain step' : 'streak';
            this.say(`${chainHero.name} keeps going — ${chainResult.completedCount}/${chainResult.target} in this ${label}.`, 'quests');
          } else if (chainResult.stoppedByFailure) {
            playSound('quest_fail');
            const note = chainResult.via === 'chain' ? 'a failed stage' : 'a failed quest';
            this.say(`${chainHero.name}'s run stops after ${note} and waits for new orders.`, 'quests');
          } else {
            playSound('chain_complete');
            const n = chainResult.completedCount;
            this.say(`${chainHero.name} has chained ${n} quest${n === 1 ? '' : 's'} and is waiting for new orders.`, 'quests');
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

  /** Regenerates the quest boards and shop when their windows roll over. */
  private refreshWorld(now: number): boolean {
    let changed = false;
    const window = Math.floor(now / BOARD_REFRESH_MS);
    const windowRolledOver = this.state.boardRefreshedAt !== window;
    if (windowRolledOver) this.state.boardRefreshedAt = window;

    const active = new Set(this.state.activeQuests.map((q) => q.offer.id));
    // Each hero's own board regenerates on the same window rollover as
    // before, but also whenever that specific hero has no board yet --
    // covers a brand-new recruit, a hero reset by Retire (same id, back to
    // level 1), and a save migrated from before this rework, none of which
    // should have to wait out the rest of the current window for a board.
    for (const hero of this.state.heroes) {
      const existing = this.state.questBoards[hero.id];
      if (windowRolledOver || !existing || existing.length === 0) {
        // Frozen offer (if any) survives this regeneration too -- see
        // QuestManager.applyFrozenOffer, the same splice used by a paid
        // reroll and an Auto-Chain restock.
        this.state.questBoards[hero.id] = QuestManager.applyFrozenOffer(
          this.state, hero,
          QuestManager.generateContractsForHero(this.state, hero, now).filter((o) => !active.has(o.id)),
        );
        changed = true;
      }
    }
    // Early Retirement actually removes a hero from the roster (unlike a
    // normal Retire, which reuses the same id) -- drop their now-orphaned
    // board rather than letting it sit in the save forever.
    for (const heroId of Object.keys(this.state.questBoards)) {
      if (!this.state.heroes.some((h) => h.id === heroId)) {
        delete this.state.questBoards[heroId];
        changed = true;
      }
    }
    // Unlike a per-hero board, an empty chainBoard is a legitimate steady
    // state (nothing currently unlocked, or everything completed) rather
    // than a sign it was never generated -- so only the window rollover
    // (which also covers a fresh save/migration, since boardRefreshedAt
    // starts far behind the real current window) should trigger this.
    if (windowRolledOver) {
      this.state.chainBoard = QuestManager.generateChainBoard(this.state, now).filter((o) => !active.has(o.id));
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
    if (HarvestManager.ensureSpawns(this.state, now)) changed = true;
    // Grimsby leaves if ignored -- same "the world doesn't pause just
    // because you're not looking at it" tick as Harvest's own despawn
    // timer just above. Fires even during offline catch-up (refreshWorld
    // itself doesn't distinguish live vs. offline, unlike the quest-
    // resolution loop above) -- same as Harvest items quietly expiring
    // while the app was closed, nothing to announce retroactively.
    if (PeddlerManager.checkExpiry(this.state, now)) {
      changed = true;
      this.say('The cart\u2019s gone when you look again. Guess he had somewhere else to be.', 'peddler');
    }
    // Auto-repair -- opt-in (GameState.autoRepairEnabled), ticks every
    // refreshWorld call the same way Harvest's spawn timer does. Uses the
    // exact same EquipmentManager.allItems(state) scope repairAll() uses
    // for its manual "Repair Everything" button (equipped AND stashed,
    // not equipped-only), since this is meant to automate that same
    // action, not a narrower one. Self-limiting by nature: repairing an
    // item restores it to full durability, so it stops qualifying for the
    // threshold check on the very next tick -- this never spends gold
    // repeatedly on the same item once it's already been repaired. Never
    // spends past what the guild can currently afford, same affordability
    // gate repairAll() already has, one item at a time rather than an
    // all-or-nothing batch (so a guild that can afford 2 of 5 needed
    // repairs this tick still gets those 2 done now, the rest as gold
    // allows on a later tick).
    if (this.state.autoRepairEnabled) {
      const workshop = this.state.guild.workshop ?? 0;
      const threshold = this.state.autoRepairThresholdPercent / 100;
      for (const { item } of EquipmentManager.allItems(this.state)) {
        const max = EquipmentManager.maxDurability(item);
        if (max <= 0 || item.durability / max > threshold) continue;
        const cost = EquipmentManager.repairCost(item, workshop);
        if (cost > 0 && this.state.gold >= cost) {
          EquipmentManager.repair(this.state, item, workshop);
          changed = true;
        }
      }
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
        for (const message of topic.messages) this.archive(message, topic.targetTab);
      }

      const hero = this.state.heroes.find((h) => h.id === quest.heroId);
      if (hero) this.tryContinueAutoChain(hero, quest.endsAt, result.success);
    }
    for (const hero of this.state.heroes) HeroManager.pruneInjuries(hero, now);

    // Health regen and auto-revive across the offline gap -- reuses the
    // same `elapsed` this whole function already computed from
    // lastSeen, rather than a per-tick delta (there were no ticks while
    // the app was closed). Approximates each hero's status as constant
    // across the whole gap (whatever it settled to after the quest/raid
    // resolution above) rather than slicing sub-intervals around exactly
    // when each quest finished -- consistent with how offline catch-up
    // already treats other systems somewhat coarsely.
    {
      const infirmaryLevel = this.state.guild.infirmary ?? 0;
      for (const hero of this.state.heroes) {
        HeroManager.regenHealth(hero, elapsed, infirmaryLevel, hero.status === 'questing');
        if (hero.status === 'fallen' && HeroManager.autoReviveDue(hero, now)) {
          HeroManager.revive(hero);
          this.archive(`${hero.name} has recovered and returns to the roster.`, 'heroes');
        }
      }
      const kennelLevel = this.state.guild.kennel ?? 0;
      for (const pet of this.state.pets) {
        PetManager.regenHealth(this.state, pet, elapsed, kennelLevel);
        if (PetManager.isFallen(pet) && PetManager.autoReviveDue(pet, now)) {
          PetManager.revive(this.state, pet);
          this.archive(`${pet.name} has recovered.`, 'heroes');
        }
      }
    }

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
        for (const message of topic.messages) this.archive(message, topic.targetTab);
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

  /** Unlocks the Hatchery directly, bypassing the intro chain -- testing
   *  eggs/pets otherwise means actually playing `the_last_clutch` first
   *  every single time. */
  testUnlockHatchery() {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.hatcheryUnlocked = true;
    this.notify();
    void this.saveNow();
  }

  /** Unlocks Harvest directly, bypassing `the_first_haul` -- same
   *  reasoning as testUnlockHatchery just above. */
  testUnlockHarvest() {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.harvestUnlocked = true;
    this.notify();
    void this.saveNow();
  }

  /** Unlocks Grimsby's tab directly and forces him to arrive right now,
   *  bypassing both the intro chain and the quest-count cooldown --
   *  testing the card-flip flow otherwise means actually playing "The
   *  Man Who Sells Maybe" and then grinding out 5-10 real quests every
   *  single time. */
  testForceGrimsbyArrival() {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.peddlerUnlocked = true;
    PeddlerManager.arrive(this.state, Date.now());
    this.notify();
    void this.saveNow();
  }

  /** Drops an egg straight into storage, same as a real quest/raid roll --
   *  see PetManager.grantEgg. Also force-unlocks the Hatchery if it isn't
   *  already, since an egg with nowhere to be equipped isn't much of a
   *  test. */
  testAddEgg(rarity: Rarity, dedicatedPetId?: string) {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.hatcheryUnlocked = true;
    PetManager.grantEgg(this.state, rarity, dedicatedPetId, Date.now());
    this.notify();
    void this.saveNow();
  }

  /** Hatches a specific species directly, skipping the egg/incubation
   *  step entirely -- for testing a pet's bonus/happiness/feeding/sprite
   *  without needing to grind out a real hatch first. Reuses
   *  PetManager.hatch with a throwaway EggInstance rather than duplicating
   *  its bonus-roll logic. */
  testAddPet(defId: string, rarity: Rarity = 'common') {
    if (!TESTING_TOOLS_ENABLED) return;
    this.state.hatcheryUnlocked = true;
    PetManager.hatch(this.state, { uid: uid('egg'), rarity, dedicatedPetId: defId, hatchXp: 0, startedAt: Date.now() }, Date.now());
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

  /**
   * How many notifications have arrived since the player last actually
   * looked at the log -- see GameState.notificationsSeenId's own doc
   * comment for what counts as "looked at," and why this is id-based
   * (array position) rather than timestamp-based. Computed live rather
   * than stored, so it's always correct regardless of when/how
   * notifications arrived. `notifications` is newest-first (unshift), so
   * this is simply "how many entries come before the last-seen id."
   */
  get unreadNotificationCount(): number {
    if (this.state.notificationsSeenId === null) return this.state.notifications.length;
    const idx = this.state.notifications.findIndex((n) => n.id === this.state.notificationsSeenId);
    // Not found means the last-seen entry has since aged out past the
    // 100-entry cap -- everything currently in the log postdates it, so
    // the whole log counts as unread rather than guessing at a boundary
    // that no longer exists.
    return idx === -1 ? this.state.notifications.length : idx;
  }

  /** Marks every notification currently in the log as seen -- called when
   *  the player opens the Guide tab's Notifications list, clicks the
   *  header notification icon, or clicks through a banner. Deliberately
   *  NOT called when a banner simply times out unclicked -- that's what
   *  keeps a missed notification counted as unread. */
  markNotificationsSeen() {
    if (this.state.notifications.length === 0) return;
    const newestId = this.state.notifications[0].id;
    if (this.state.notificationsSeenId !== newestId) {
      this.state.notificationsSeenId = newestId;
      this.notify();
      void this.saveNow();
    }
  }

  /** Marks a banner-worthy notification as having actually been displayed
   *  -- called by NotificationBanner.tsx the instant it decides to show
   *  one, not on dismiss/timeout/click, so quitting mid-display never
   *  replays it on the next launch either. Separate from
   *  markNotificationsSeen/notificationsSeenId (acknowledgment) above --
   *  "shown once" and "acknowledged" are different things: a banner that
   *  times out unclicked still only ever displays once, but still counts
   *  as unread until the player actually opens the Notifications list or
   *  clicks it. */
  markBannerShown(id: string) {
    if (this.state.lastBannerShownId === id) return;
    this.state.lastBannerShownId = id;
    void this.saveNow();
  }

  /** Requests that the menu open (or switch) to a specific tab id. */
  requestTab(id: string) {
    this.requestedTab = id;
    // Needed so MenuWindow can react to a request made while it's already
    // mounted (e.g. a Guide notification's "Go to" button), not just pick
    // it up on the next fresh mount -- see MenuWindow's own effect for the
    // other half of this.
    this.notify();
  }

  /** Reads and clears the pending tab request. Called once by MenuWindow on mount. */
  consumeRequestedTab(): string | null {
    const id = this.requestedTab;
    this.requestedTab = null;
    return id;
  }

  /**
   * Same "transient, consume-once" shape as requestedTab/consumeRequestedTab
   * just above, one level deeper -- requestTab only knows about MenuWindow's
   * own top-level tabs, not a panel's internal sub-tab state (HatcheryPanel
   * manages 'home'/'pets' itself via useState). Only Hatchery needs this
   * today (HatchRevealModal's "Go to Pets"); kept specific rather than a
   * generic sub-tab system until a second panel actually needs one.
   */
  requestedHatcherySubTab: 'home' | 'pets' | null = null;
  requestHatcherySubTab(subTab: 'home' | 'pets') {
    this.requestedTab = 'hatchery';
    this.requestedHatcherySubTab = subTab;
    this.notify();
  }
  consumeRequestedHatcherySubTab(): 'home' | 'pets' | null {
    const sub = this.requestedHatcherySubTab;
    this.requestedHatcherySubTab = null;
    return sub;
  }

  /** What the corner sprite should be doing right now. */
  get companionStatus(): 'idle' | 'questing' | 'injured' | 'ready' {
    const heroes = this.state.heroes;
    if (heroes.some((h) => h.status === 'questing')) return 'questing';
    if (heroes.some((h) => h.injuries.length > 0)) return 'injured';
    const anyReady = this.state.chainBoard.length > 0
      || heroes.some((h) => (this.state.questBoards[h.id]?.length ?? 0) > 0);
    if (anyReady) return 'ready';
    return 'idle';
  }

  /* -------------------------------- actions ---------------------------- */

  /**
   * The third parameter is accepted but ignored -- kept only so existing
   * call sites that still pass [] don't need a second edit just for this.
   * Consumables now come from the hero's own equipped slots (see
   * equipConsumable/unequipConsumable below) instead of a loadout picked at
   * send time, matching how equipped gear already works: what's slotted is
   * what gets used, no separate per-send choice.
   *
   * `chainSteps` is the "Chain Quest Steps" option on a chain offer's send
   * picker (QuestPanel), as opposed to plain "Send on Quest" -- only
   * meaningful when `offer.chain` is set, ignored otherwise. It sets
   * `autoAdvanceChainId` so tryContinueAutoChain auto-continues this exact
   * chain's remaining stages once this stage resolves, independent of
   * whatever the Auto-Chain (bounty streak) upgrade is doing.
   */
  startQuest(heroId: string, offer: QuestOffer, _consumables?: string[], chainSteps = false) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (this.state.autoEquipConsumablesOnSend) this.fillEmptyConsumableSlots(heroId);
    const { error } = QuestManager.start(this.state, hero, offer, hero.equippedConsumables ?? [], Date.now());
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
    // Same "manual send always resets prior streak state" reasoning applies
    // here -- any hero being sent by hand either opts into chain-stepping
    // right now (via the offer just picked) or isn't chain-stepping at all,
    // regardless of what they were doing before.
    hero.autoAdvanceChainId = (chainSteps && offer.chain) ? offer.chain.chainId : null;

    playSound('depart');
    this.say(`${hero.name} sets out: ${offer.name}`, 'quests');
    void this.saveNow();
  }

  /**
   * Sends every idle hero (not currently questing) on their own best
   * contract, via the same QuestManager.pickBestQuest scoring Quick-assign
   * already uses on the currently-open hero -- this is the roster-wide
   * version of that button. Skips any hero with nothing eligible on their
   * own board rather than failing the whole batch over one hero with an
   * empty pool. Gives each sent hero the same Auto-Chain streak setup a
   * manual single send would (see startQuest above), but deliberately
   * never opts a hero into chain-stepping -- a bulk "send everyone"
   * action picking a specific chain stage to auto-advance on a player's
   * behalf would be a much bigger decision than this button should make
   * silently. One summary toast and one save at the end, not one per hero
   * -- same "don't spam the toast queue for a bulk action" shape as
   * repairAll(). Returns how many heroes were actually sent.
   */
  sendAllIdle(): number {
    const now = Date.now();
    const level = this.state.upgrades['auto_chain'] ?? 0;
    let sent = 0;
    for (const hero of this.state.heroes) {
      if (hero.status === 'questing') continue;
      if (this.state.autoEquipConsumablesOnSend) this.fillEmptyConsumableSlots(hero.id);
      const offer = QuestManager.pickBestQuest(this.state, hero, now);
      if (!offer) continue;
      const { error } = QuestManager.start(this.state, hero, offer, hero.equippedConsumables ?? [], now);
      if (error) continue;
      if (level > 0) {
        const range = AUTO_CHAIN_RANGES[level];
        hero.autoChainTarget = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
        hero.autoChainCount = 1;
      } else {
        hero.autoChainTarget = null;
        hero.autoChainCount = 0;
      }
      hero.autoAdvanceChainId = null;
      sent++;
    }
    if (sent > 0) {
      playSound('depart');
      this.say(sent === 1 ? '1 hero sent out on a contract.' : `${sent} heroes sent out on contracts.`, 'quests');
      void this.saveNow();
    } else {
      this.say('No idle heroes have an open contract right now.');
    }
    return sent;
  }

  /**
   * Cancels a hero's active quest early and brings them straight home --
   * no reward, no failure penalty, just a clean cut. Also stops any
   * Auto-Chain streak or chain-stepping the hero had queued up, since
   * pulling a hero back mid-run is a deliberate "stop everything, let me
   * decide" action -- it shouldn't quietly resume a streak or a chain the
   * moment they're home. Confirmed with the player before this is ever
   * called (see QuestPanel's Recall button).
   */
  recallHero(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const quest = this.activeQuestFor(heroId);
    if (!quest) return;
    this.state.activeQuests = this.state.activeQuests.filter((q) => q.id !== quest.id);
    hero.status = 'idle';
    hero.activeQuestId = null;
    hero.autoChainTarget = null;
    hero.autoChainCount = 0;
    hero.autoAdvanceChainId = null;
    playSound('depart');
    this.say(`${hero.name} is recalled and heads back to the guild.`, 'quests');
    void this.saveNow();
  }

  /** Replaces this hero's own quest-board contracts with a fresh set --
   *  free once a day (more via Board Runner), gold cost climbing after
   *  that. See QuestManager.rerollContractsForHero for the cost/state math. */
  rerollQuestBoard(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = QuestManager.rerollContractsForHero(this.state, hero, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say(`${hero.name}'s contracts refreshed.`);
    void this.saveNow();
  }

  /** Freezes one of this hero's own board contracts so it survives the
   *  board's next refresh, reroll, or Auto-Chain restock -- one frozen
   *  slot per hero, spends today's freeze-change allowance (more via Board
   *  Warden). See QuestManager.freezeOffer. */
  freezeQuestOffer(heroId: string, offerId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = QuestManager.freezeOffer(this.state, hero, offerId, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say(`${hero.name}'s contract frozen -- it'll stay on the board.`);
    void this.saveNow();
  }

  /** Clears whichever contract is frozen for this hero, if any -- always
   *  free, never gated by the daily freeze allowance. See
   *  QuestManager.unfreezeOffer. */
  unfreezeQuestOffer(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = QuestManager.unfreezeOffer(this.state, hero, Date.now());
    if (error) return this.say(error);
    void this.saveNow();
  }

  /** Adds a consumable to a hero's equipped slots -- persists until removed
   *  or consumed by a quest, capped at ModifierManager.consumableSlots. Does
   *  not touch state.inventory; that deduction still happens at quest-start
   *  time inside QuestManager.start, same as it always did. */
  equipConsumable(heroId: string, defId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const current = hero.equippedConsumables ?? [];
    const maxSlots = ModifierManager.consumableSlots(this.state);
    if (current.length >= maxSlots) return this.say('No free consumable slots.');
    hero.equippedConsumables = [...current, defId];
    playSound('equip');
    void this.saveNow();
  }

  /** Removes one instance of a consumable from a hero's equipped slots. */
  unequipConsumable(heroId: string, defId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const current = hero.equippedConsumables ?? [];
    const index = current.indexOf(defId);
    if (index === -1) return;
    hero.equippedConsumables = [...current.slice(0, index), ...current.slice(index + 1)];
    void this.saveNow();
  }

  /**
   * Fills each of a hero's EMPTY consumable slots with the highest-cost
   * owned consumable still actually available -- the bulk counterpart to
   * picking one slot at a time. `cost` stands in for "how good it is" the
   * same way rarity does for gear (consumables have no rarity of their
   * own), highest first. Only fills gaps; never swaps out or unequips
   * something already slotted, unlike equipBestGear's tie-breaking --
   * there's no obvious "better" ordering between two already-chosen
   * consumables to justify displacing a manual pick the way a higher Gear
   * Score item justifies displacing worse gear. Availability is computed
   * the same "owned minus reserved on this hero or any other" way the
   * manual per-slot picker already does (EquipmentPanel's own
   * `equippedElsewhereCount`), including reservations made earlier in
   * this same batch, so it can never try to equip more of one consumable
   * than the guild actually owns. Returns how many slots were filled.
   */
  equipBestConsumables(heroId: string): number {
    const hero = this.hero(heroId);
    if (!hero) return 0;
    const filled = this.fillEmptyConsumableSlots(heroId);
    if (filled > 0) {
      playSound('equip');
      this.say(`Equipped ${filled} consumable${filled === 1 ? '' : 's'} on ${hero.name}.`);
      void this.saveNow();
    } else {
      this.say(`Nothing spare to equip on ${hero.name}.`);
    }
    return filled;
  }

  /** The actual slot-filling logic behind equipBestConsumables, split out
   *  so autoEquipConsumablesOnSend (see startQuest/sendAllIdle) can reuse
   *  it silently -- a toast every single automatic send would be far
   *  noisier than the opt-in itself is worth, same reasoning as every
   *  other automation preference (autoRepairEnabled, autoEquipOnLoot) not
   *  narrating its own routine upkeep. */
  private fillEmptyConsumableSlots(heroId: string): number {
    const hero = this.hero(heroId);
    if (!hero) return 0;
    const maxSlots = ModifierManager.consumableSlots(this.state);
    const working = [...(hero.equippedConsumables ?? [])];
    let filled = 0;
    while (working.length < maxSlots) {
      const reservedElsewhere = (defId: string) => this.state.heroes.reduce((sum, other) => {
        const list = other.id === hero.id ? working : (other.equippedConsumables ?? []);
        return sum + list.filter((id) => id === defId).length;
      }, 0);
      const available = InventoryManager.owned(this.state)
        .filter(({ def }) => reservedElsewhere(def.id) < InventoryManager.count(this.state, def.id))
        .sort((a, b) => b.def.cost - a.def.cost);
      if (available.length === 0) break;
      working.push(available[0].def.id);
      filled++;
    }
    if (filled > 0) hero.equippedConsumables = working;
    return filled;
  }

  /** Opt-in, off by default -- see GameState.autoEquipConsumablesOnSend. */
  setAutoEquipConsumablesOnSend(enabled: boolean) {
    this.state.autoEquipConsumablesOnSend = enabled;
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
    this.say(`The guild marches on ${RAID_BY_ID[raidId]?.name ?? 'the raid'}. ${heroIds.length} strong.`, 'raids');
    void this.saveNow();
  }

  equip(heroId: string, itemUid: string) {
    const hero = this.hero(heroId);
    const item = this.state.stash.find((i) => i.uid === itemUid);
    if (!hero || !item) return;
    const error = EquipmentManager.equip(this.state, hero, item);
    if (error) return this.say(error);
    playSound('equip');
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
        this.say(`${set.name} — ${bonus.label} unlocked!`, 'equipment');
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
    playSound('repair');
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
    if (spent > 0) playSound('repair');
    this.say(spent > 0 ? `Repaired everything for ${spent} gold.` : 'Nothing needed repairing.');
    void this.saveNow();
  }

  /** Turns auto-repair on/off, and optionally updates its threshold in the
   *  same call (the toggle row in EquipmentPanel does both from one
   *  control). Threshold clamped to 1-99 -- see GameState.
   *  autoRepairThresholdPercent's own comment for why 0/100 are excluded. */
  setAutoRepair(enabled: boolean, thresholdPercent?: number) {
    this.state.autoRepairEnabled = enabled;
    if (thresholdPercent !== undefined) {
      this.state.autoRepairThresholdPercent = Math.max(1, Math.min(99, Math.round(thresholdPercent)));
    }
    void this.saveNow();
  }

  setAutoEquipOnLoot(enabled: boolean) {
    this.state.autoEquipOnLoot = enabled;
    void this.saveNow();
  }

  upgradeItem(itemUid: string) {
    const found = EquipmentManager.allItems(this.state).find((e) => e.item.uid === itemUid);
    if (!found) return;
    const error = EquipmentManager.upgrade(this.state, found.item, this.state.guild.workshop ?? 0);
    if (error) return this.say(error);
    playSound('enhance');
    this.say(`Refined to +${found.item.plus}.`);
    void this.saveNow();
  }

  sellItem(itemUid: string) {
    const error = ShopManager.sell(this.state, itemUid);
    if (error) return this.say(error);
    playSound('sell');
    this.say('Sold.');
    void this.saveNow();
  }

  /** Bulk-sells every stash item at or below `maxRarity` in one action --
   *  the "clear out the junk" counterpart to selling one item at a time.
   *  Crafted and enchanted items are skipped regardless of rarity (see
   *  ShopManager.sellBelowRarity's own comment). One summary toast, not
   *  one per item sold. */
  sellJunk(maxRarity: Rarity) {
    const { count, gold } = ShopManager.sellBelowRarity(this.state, maxRarity);
    if (count === 0) return this.say('Nothing in the stash qualifies.');
    playSound('sell');
    this.say(`Sold ${count} item${count === 1 ? '' : 's'} for ${gold} gold.`);
    void this.saveNow();
  }

  /**
   * For each of a hero's 9 equipment slots, equips the highest-Gear-Score
   * eligible item currently sitting in the stash if it beats what's
   * already equipped there -- the bulk counterpart to picking through the
   * Stash one item at a time. Gear Score is the same flat, rarity-tier
   * value HeroManager.gearScore already sums (see GEAR_SCORE_BY_RARITY);
   * ties are left alone rather than swapped for swapping's sake. Skips
   * anything the hero can't wear yet (reqLevel), same as a manual equip
   * would refuse. Loops slot-by-slot via EquipmentManager.equip itself so
   * a displaced item lands back in the stash exactly the way a manual
   * equip already handles it, and a later slot can immediately see an
   * item the earlier slot's displacement just freed up. Returns how many
   * slots actually changed. */
  equipBestGear(heroId: string): number {
    const hero = this.hero(heroId);
    if (!hero) return 0;
    if (hero.status === 'questing') {
      this.say(`${hero.name} is away on a quest.`);
      return 0;
    }
    let changed = 0;
    // Tracked across all slots so the failure message can actually say why
    // nothing happened, instead of always blaming "already equipped" --
    // that phrasing was flatly wrong whenever the hero had nothing
    // equipped at all and the real reason was a level-gated stash item.
    let anyAlreadyEquipped = false;
    let anyLevelGated = false;
    let anyCandidateSeen = false;
    for (const slot of EQUIP_SLOTS) {
      const currentItem = hero.equipment[slot];
      if (currentItem) anyAlreadyEquipped = true;
      const currentDef = currentItem ? EQUIPMENT_BY_ID[currentItem.defId] : undefined;
      const currentScore = currentDef ? GEAR_SCORE_BY_RARITY[currentDef.rarity] ?? 0 : -1;
      let best: typeof currentItem = undefined;
      let bestScore = currentScore;
      for (const item of this.state.stash) {
        const def = EQUIPMENT_BY_ID[item.defId];
        if (!def || def.slot !== slot) continue;
        anyCandidateSeen = true;
        if (hero.level < def.reqLevel) { anyLevelGated = true; continue; }
        const score = GEAR_SCORE_BY_RARITY[def.rarity] ?? 0;
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (best) {
        const error = EquipmentManager.equip(this.state, hero, best);
        if (!error) changed++;
      }
    }
    if (changed > 0) {
      playSound('equip');
      this.checkSetBonusMilestones(hero);
      this.say(`Equipped ${changed} better item${changed === 1 ? '' : 's'} on ${hero.name}.`);
      void this.saveNow();
    } else if (anyAlreadyEquipped) {
      this.say(`Nothing in the stash outranks what ${hero.name} already has equipped.`);
    } else if (anyLevelGated) {
      this.say(`${hero.name} isn't a high enough level to equip what's in the stash yet.`);
    } else if (anyCandidateSeen) {
      this.say(`Nothing in the stash is an upgrade for ${hero.name} right now.`);
    } else {
      this.say(`There's nothing in the stash for ${hero.name} to equip.`);
    }
    return changed;
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

  /** Restocks the Vendors shop (equipment + consumables) early -- free
   *  once a day (more via Trade Favor), gold cost climbing after that.
   *  Doesn't touch the black market. See ShopManager.rerollShop. */
  rerollShop() {
    const error = ShopManager.rerollShop(this.state, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say('The vendors restock early.');
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

  /**
   * Pay-to-skip instant revive for a Fallen hero -- the only path below
   * Infirmary's max level (see infirmaryAutoReviveUnlocked); still
   * available even once auto-revive is unlocked, for anyone who doesn't
   * want to wait out the timer. Mirrors treatInjury's exact shape. See
   * guild-idler-status.md's Health stat + Fallen/death mechanic section.
   */
  reviveHero(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (hero.status !== 'fallen') return;
    const cost = HeroManager.revivalCost(hero, ModifierManager.global(this.state).revivalDiscount ?? 0);
    if (this.state.gold < cost) return this.say('Not enough gold for revival.');
    this.state.gold -= cost;
    this.state.stats.goldSpent += cost;
    HeroManager.revive(hero);
    this.say(`${hero.name} is revived and returns to the roster.`, 'heroes');
    void this.saveNow();
  }

  /**
   * Revives every currently-Fallen hero at once, at a small bulk discount
   * (health.bulkReviveDiscount) off the sum of each hero's own
   * (already-Undertaker's-Favor-discounted) individual revivalCost -- a
   * convenience purchase, not a separate pricing mechanism. No-ops
   * quietly if nobody is Fallen, so it's safe to always show the button.
   */
  reviveAllFallen() {
    const fallen = this.state.heroes.filter((h) => h.status === 'fallen');
    if (fallen.length === 0) return;
    const discount = ModifierManager.global(this.state).revivalDiscount ?? 0;
    const individual = fallen.map((h) => HeroManager.revivalCost(h, discount));
    const total = Math.round(individual.reduce((a, b) => a + b, 0) * (1 - Tuning.get('health.bulkReviveDiscount')));
    if (this.state.gold < total) return this.say('Not enough gold to revive everyone.');
    this.state.gold -= total;
    this.state.stats.goldSpent += total;
    for (const hero of fallen) HeroManager.revive(hero);
    this.say(`${fallen.length} Fallen heroes are revived and return to the roster.`, 'heroes');
    void this.saveNow();
  }

  buyUpgrade(id: string) {
    const error = GuildManager.buyUpgrade(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    // Some upgrades flip an unlock (legendaryQuests, blackMarket, raids --
    // see UpgradeDef.unlocks) that a GuidanceManager topic is watching
    // for. Checked here, immediately, rather than waiting for whatever
    // unrelated action happens to call reportGuidance next -- "you've
    // unlocked X" should land the moment X is actually bought, not
    // whenever the player next resolves a quest.
    this.reportGuidance(GuidanceManager.checkAll(this.state));
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
    this.say(`${def?.name ?? 'The vendor'} has more to offer now.`, 'vendors');
    void this.saveNow();
  }

  upgradeFacility(id: Parameters<typeof GuildManager.upgradeFacility>[1]) {
    const error = GuildManager.upgradeFacility(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    // Same immediate-check reasoning as buyUpgrade above -- Music Hall's
    // first level is the one facility purchase with its own guidance
    // topic (music_hall_unlocked) today, but this covers any future
    // facility-tied guidance the same way without needing its own
    // special case.
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    this.notify();
    void this.saveNow();
  }

  /** Catches whatever's pending at a node, if anything -- returns what was gained for the UI's particle feedback. */
  catchMaterial(nodeId: MaterialId): { gained: number; bonus: boolean } {
    const result = HarvestManager.catch(this.state, nodeId, Date.now());
    if (result.gained > 0) {
      playSound('collect');
      this.notify();
      void this.saveNow();
    }
    return result;
  }

  sellMaterial(materialId: MaterialId, amount: number) {
    const error = HarvestManager.sell(this.state, materialId, amount);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  unlockTradeRoute() {
    const error = HarvestManager.unlockTradeRoute(this.state);
    if (error) return this.say(error);
    playSound('purchase');
    this.say('The Trade Route is open -- materials can be sold for gold from here on.', 'harvest');
    void this.saveNow();
  }

  upgradeHarvestTool(nodeId: MaterialId) {
    const error = HarvestManager.upgradeTool(this.state, nodeId);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  upgradeWarehouse() {
    const error = HarvestManager.upgradeWarehouse(this.state);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  /* ------------------------------ Pets / Hatchery ----------------------------- */

  /** Dismisses the one-time "you've unlocked the Hatchery" spotlight --
   *  same pattern as dismissChainDiscovery above. */
  dismissHatcherySpotlight() {
    this.state.pendingHatcherySpotlight = false;
    void this.saveNow();
  }

  /** Dismisses the "an egg is ready" prompt -- see
   *  GameState.pendingHatchReadyNotice's own doc comment for why this
   *  doesn't track which egg specifically. */
  dismissHatchReadyNotice() {
    this.state.pendingHatchReadyNotice = false;
    void this.saveNow();
  }

  /** The actual hatch, explicit and player-triggered -- see
   *  PetManager.hatchReadyEgg. Stores the result in lastHatchedPet for
   *  HatchRevealModal rather than returning it directly, same "mutate
   *  state, UI reads a transient field" shape every other action here
   *  uses (see lastResult/lastRaidResult). */
  hatchEgg(eggUid: string) {
    const pet = PetManager.hatchReadyEgg(this.state, eggUid, Date.now());
    if (!pet) return this.say('That egg is not ready to hatch yet.');
    this.lastHatchedPet = pet;
    playSound('legendary_drop');
    this.notify();
    void this.saveNow();
  }

  dismissHatchedPet() {
    this.lastHatchedPet = null;
    this.notify();
  }

  equipEgg(eggUid: string) {
    const error = PetManager.equipEgg(this.state, eggUid);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  unequipEgg(eggUid: string) {
    PetManager.unequipEgg(this.state, eggUid);
    this.notify();
    void this.saveNow();
  }

  feedPetMaterial(petUid: string, materialId: MaterialId) {
    const error = PetManager.feedMaterial(this.state, petUid, materialId);
    if (error) return this.say(error);
    playSound('collect');
    this.notify();
    void this.saveNow();
  }

  feedPetCrafted(petUid: string) {
    const error = PetManager.feedCrafted(this.state, petUid);
    if (error) return this.say(error);
    playSound('collect');
    this.notify();
    void this.saveNow();
  }

  /** Pairs a pet with a specific hero -- see Hero.equippedPetId and
   *  PetManager.equip for the full per-hero pairing design. */
  equipPet(heroId: string, petUid: string) {
    const error = PetManager.equip(this.state, heroId, petUid);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  unequipPet(heroId: string) {
    PetManager.unequip(this.state, heroId);
    this.notify();
    void this.saveNow();
  }

  /** Pay-to-skip instant revive for a Fallen pet -- pet-specific parallel
   *  to engine.reviveHero, smaller gold scale, own discount source
   *  (Kennel Keeper's Favor via petRevivalDiscount). */
  revivePet(petUid: string) {
    const pet = this.state.pets.find((p) => p.uid === petUid);
    if (!pet) return;
    if (!PetManager.isFallen(pet)) return;
    const discount = ModifierManager.global(this.state).petRevivalDiscount ?? 0;
    const cost = PetManager.revivalCost(pet, discount);
    if (this.state.gold < cost) return this.say('Not enough gold for revival.');
    this.state.gold -= cost;
    this.state.stats.goldSpent += cost;
    PetManager.revive(this.state, pet);
    this.say(`${pet.name} is revived.`, 'heroes');
    void this.saveNow();
  }

  /** Pet-specific parallel to engine.reviveAllFallen. */
  reviveAllFallenPets() {
    const fallen = this.state.pets.filter((p) => PetManager.isFallen(p));
    if (fallen.length === 0) return;
    const discount = ModifierManager.global(this.state).petRevivalDiscount ?? 0;
    const total = Math.round(
      fallen.reduce((sum, p) => sum + PetManager.revivalCost(p, discount), 0)
        * (1 - Tuning.get('pets.bulkReviveDiscount')),
    );
    if (this.state.gold < total) return this.say('Not enough gold to revive every companion.');
    this.state.gold -= total;
    this.state.stats.goldSpent += total;
    for (const pet of fallen) PetManager.revive(this.state, pet);
    this.say(`${fallen.length} Fallen companions are revived.`, 'heroes');
    void this.saveNow();
  }

  renamePet(petUid: string, name: string) {
    const error = PetManager.rename(this.state, petUid, name);
    if (error) return this.say(error);
    this.notify();
    void this.saveNow();
  }

  craftGear(recipeId: string, chosenMods: (keyof Modifiers)[]) {
    const error = CraftingManager.craftGear(this.state, recipeId, chosenMods);
    if (error) return this.say(error);
    playSound('craft');
    this.say('A new piece, built to spec, lands in the stash.', 'equipment');
    void this.saveNow();
  }

  craftConsumable(recipeId: string, chosenMods: (keyof Modifiers)[] = []) {
    const error = CraftingManager.craftConsumable(this.state, recipeId, chosenMods);
    if (error) return this.say(error);
    playSound('craft');
    this.notify();
    void this.saveNow();
  }

  enchantItem(recipeId: string, itemUid: string, chosenStats: (keyof Stats)[]) {
    const error = CraftingManager.enchantItem(this.state, recipeId, itemUid, chosenStats);
    if (error) return this.say(error);
    playSound('enchant');
    this.say('The Enchanter\u2019s work takes -- the piece carries it now.', 'equipment');
    void this.saveNow();
  }

  craftGem(recipeId: string) {
    const error = CraftingManager.craftGem(this.state, recipeId);
    if (error) return this.say(error);
    playSound('craft');
    this.say('A new gem, ready for the Blacksmith\u2019s Infuse station.', 'vendors');
    void this.saveNow();
  }

  /** Breaks a stash item down into Scrap instead of selling it for gold --
   *  see EquipmentManager.scrapValue/ShopManager.scrapItem. */
  scrapItem(itemUid: string) {
    const error = ShopManager.scrapItem(this.state, itemUid);
    if (error) return this.say(error);
    playSound('scrap');
    this.say('Broken down into scrap.', 'vendors');
    void this.saveNow();
  }

  /** Blacksmith's Infuse action -- spends a gem (which pool depends on the
   *  item's own slot, weapon vs everything else, see
   *  EquipmentManager.infuse) on an owned item. */
  /** Weapon Enchanting (weapons) and Armour Infusion (everything else) --
   *  see CraftingManager.craftAndInfuse for the combined craft-then-apply
   *  flow, which uses an already-owned gem if one exists or crafts one
   *  fresh otherwise. */
  infuseItem(itemUid: string, element: ElementType) {
    const error = CraftingManager.craftAndInfuse(this.state, itemUid, element);
    if (error) return this.say(error);
    playSound('infuse');
    this.say('The infusion takes.', 'equipment');
    void this.saveNow();
  }

  recruit(heroClass: HeroClass) {
    // Checked here rather than relying on GuildManager's own error, so the
    // message can point at the actual fix (upgrades or a Renown perk)
    // instead of a generic "no room" -- this is exactly the kind of thing
    // a player new to the systems wouldn't otherwise know to go looking for.
    if (this.state.heroes.length >= this.heroSlots) {
      return this.say("The guild is out of hero slots. Expand the roster via Guild Hall upgrades or a Renown perk.", 'guild');
    }
    const error = GuildManager.recruit(this.state, heroClass, createRng(uid('recruit')));
    if (error) return this.say(error);
    this.say('A new hero joins the guild.', 'heroes');
    this.reportAchievements(AchievementManager.checkAll(this.state));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    void this.saveNow();
  }

  buyPerk(id: string) {
    const error = PrestigeManager.buyPerk(this.state, id);
    if (error) return this.say(error);
    playSound('prestige_upgrade');
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

  /**
   * Early Retirement -- see PrestigeManager.earlyRetire's own comment for
   * why this exists. No renown, no ascension, no streak; just frees the
   * slot immediately regardless of level.
   */
  earlyRetire(heroId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const outcome = PrestigeManager.earlyRetire(this.state, hero);
    if (outcome && 'error' in outcome) return this.say(outcome.error);
    this.say(`${hero.name} leaves the guild. The slot is free.`);
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

  /** Buys a tombstone cosmetic style -- global, not per-hero. See TombstoneStyleDef. */
  buyTombstoneStyle(styleId: string) {
    const unlocked = this.state.unlockedTombstoneStyles ?? ['plain'];
    if (unlocked.includes(styleId)) return this.say('Already owned.');
    const def = TOMBSTONE_STYLE_BY_ID[styleId];
    if (!def) return this.say('Unknown style.');
    if (this.state.gold < def.cost) return this.say('Not enough gold.');
    playSound('purchase');
    this.state.gold -= def.cost;
    this.state.stats.goldSpent += def.cost;
    this.state.unlockedTombstoneStyles = [...unlocked, styleId];
    this.say(`${def.name} tombstone style unlocked.`);
    void this.saveNow();
  }

  /** Applies an owned tombstone style guild-wide. Free once unlocked. */
  selectTombstoneStyle(styleId: string) {
    const unlocked = this.state.unlockedTombstoneStyles ?? ['plain'];
    if (styleId !== 'plain' && !unlocked.includes(styleId)) {
      return this.say('That tombstone style is not unlocked yet.');
    }
    this.state.selectedTombstoneStyle = styleId;
    this.notify();
    void this.saveNow();
  }

  /* ------------------------- Grimsby / the peddler ------------------------- */

  /** Dismisses the one-time "you've unlocked Grimsby" spotlight -- same
   *  pattern as dismissHatcherySpotlight. */
  dismissPeddlerSpotlight() {
    this.state.pendingPeddlerSpotlight = false;
    void this.saveNow();
  }

  /* ------------------------------- Harvest ------------------------------- */

  /** Dismisses the one-time "you've unlocked Harvest" spotlight -- same
   *  pattern as dismissHatcherySpotlight/dismissPeddlerSpotlight. Never
   *  actually reached for a save that came through the SaveManager
   *  migration's grandfather path instead of the real chain, since that
   *  path deliberately never sets pendingHarvestSpotlight true in the
   *  first place -- see GameState.harvestUnlocked's own comment. */
  dismissHarvestSpotlight() {
    this.state.pendingHarvestSpotlight = false;
    void this.saveNow();
  }

  /**
   * The "Pick Your Card" action -- pays the fee, resolves all three
   * cards (see PeddlerManager.resolveFlip), and stores the result in
   * lastGrimsbyResult for PeddlerPanel to render, same "mutate state, UI
   * reads a transient field" shape lastResult/lastHatchedPet already use.
   * Jackpot gets its own sound cue (reusing legendary_drop, same one a
   * real legendary quest loot roll or a fresh hatch already uses) rather
   * than blending into the ordinary purchase/collect cues -- it's meant
   * to stand out the same way those moments already do. `highRoller`
   * plays the exact same way, just at peddler.highRollerMultiplier's
   * fee/reward scale -- see PeddlerManager.resolveFlip's own comment.
   */
  pickPeddlerCard(cardIndex: 0 | 1 | 2, highRoller = false) {
    if (!PeddlerManager.isPresent(this.state)) return this.say('There\u2019s no one there right now.');
    if (highRoller && !this.state.grimsbyHighRollerUnlocked) return this.say('High Roller isn\u2019t unlocked yet.');
    const fee = highRoller ? PeddlerManager.highRollerFeeCost(this.state) : PeddlerManager.feeCost(this.state);
    if (this.state.gold < fee) return this.say('Not enough gold.');
    const result = PeddlerManager.resolveFlip(this.state, cardIndex, Date.now(), highRoller);
    if (!result) return this.say('Something about that didn\u2019t work.');
    this.lastGrimsbyResult = result;
    playSound(result.cards[result.pickedIndex].outcome.tier === 'jackpot' ? 'legendary_drop' : 'purchase');
    this.notify();
    void this.saveNow();
  }

  dismissGrimsbyResult() {
    this.lastGrimsbyResult = null;
    this.notify();
  }

  /** Buys the High Roller unlock -- see PeddlerManager.unlockHighRoller
   *  and GameState.grimsbyHighRollerUnlocked's own comments. */
  unlockHighRoller() {
    if (!PeddlerManager.canUnlockHighRoller(this.state)) return this.say('Not enough gold.');
    PeddlerManager.unlockHighRoller(this.state);
    playSound('purchase');
    this.say('Grimsby raises an eyebrow. \u201cOh, you\u2019ve got the goods now, do you?\u201d', 'peddler');
    void this.saveNow();
  }

  /**
   * Uses an enticement consumable (e.g. Beckoning Charm) -- deliberately
   * NOT routed through InventoryManager.useOnHero the way healing/injury
   * consumables are, since this isn't hero-targeted at all, it's a flat
   * reduction to the guild-wide questsSinceGrimsby counter. Reuses
   * InventoryManager.remove directly for the same inventory-decrement
   * behavior useOnHero itself relies on.
   */
  usePeddlerCharm(defId: string) {
    const def = InventoryManager.resolveDef(this.state, defId);
    const reduction = def?.effect.peddlerCounterReduction ?? 0;
    if (!def || reduction <= 0) return this.say('That doesn\u2019t do anything here.');
    if (!InventoryManager.remove(this.state, defId)) return this.say('None left.');
    this.state.questsSinceGrimsby = Math.max(0, this.state.questsSinceGrimsby - reduction);
    playSound('collect');
    this.notify();
    void this.saveNow();
  }

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
