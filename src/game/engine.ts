import { ActiveQuest, AutoChainTactics, ChainReplayDifficulty, DiceFace, DiceRollResult, ElementType, GameState, GuildHallSlotId, GuildHallSlotRect, Hero, HeroClass, MaterialId, Modifiers, Pet, PeddlerFlipResult, PeddlerTabRunResult, QuestOffer, QuestResult, Rarity, RaidDifficulty, RaidResult, Role, Stats } from './types';
import { createRng, uid } from './rng';
import { HeroManager } from './managers/HeroManager';
import { QuestManager, BOARD_REFRESH_MS, CHAIN_BY_ID } from './managers/QuestManager';
import { CHAIN_REPLAY_TIER_BY_ID } from './data/chainReplay';
import { RaidManager } from './managers/RaidManager';
import { ShopManager } from './managers/ShopManager';
import { SaveManager, SaveAdapter, defaultAdapter, createInitialState } from './managers/SaveManager';
import { EquipmentManager } from './managers/EquipmentManager';
import { InventoryManager } from './managers/InventoryManager';
import { CurioManager } from './managers/CurioManager';
import { GuildHallDecorManager } from './managers/GuildHallDecorManager';
import { GUILD_HALL_DECORATIONS } from './data/guildHallDecor';
import { DlcManager } from './managers/DlcManager';
import { GuildManager } from './managers/GuildManager';
import { PrestigeManager } from './managers/PrestigeManager';
import { ModifierManager } from './managers/ModifierManager';
import { AchievementManager } from './managers/AchievementManager';
import { ACHIEVEMENT_BY_ID } from './data/achievements';
import { BARD_TRACK_BY_ID } from './data/bard';
import { GuidanceManager, GuidanceTopic } from './managers/GuidanceManager';
import { HarvestManager } from './managers/HarvestManager';
import { OVERSEER_UPGRADE } from './data/harvestUpgrades';
import { PetManager } from './managers/PetManager';
import { PeddlerManager } from './managers/PeddlerManager';
import { CraftingManager } from './managers/CraftingManager';
import { SKIN_BY_ID, SKIN_PRICE, TOMBSTONE_STYLE_BY_ID, AUTO_CHAIN_RANGES, xpForLevel } from './data/progression';
import { EQUIPMENT_BY_ID, SET_BY_ID, gearScoreForItem, EQUIP_SLOTS } from './data/equipment';
import { RAID_BY_ID } from './data/raids';
import { Tuning } from './data/tuning';
import { rerollDay, rerollsUsedToday } from './data/reroll';
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
  /** Overseer auto-harvest credit for the gap, keyed by material -- only
   *  nonzero entries, empty for a save with no Overseer level bought.
   *  See HarvestManager.offlineAutoHarvest for how this is estimated. */
  materialsGained: Partial<Record<MaterialId, number>>;
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
  /** Same shape as lastGrimsbyResult just above, for the Dice game
   *  instead of Pick Your Card -- set by rollGrimsbyDice, cleared by
   *  dismissGrimsbyDiceResult. Feeds PeddlerDiceModal's own reveal. */
  lastGrimsbyDiceResult: DiceRollResult | null = null;
  /** Same shape again, for a single "Run it up" push in Grimsby's Tab --
   *  set by runUpGrimsbyTab, cleared by dismissGrimsbyTabResult. The
   *  ONGOING tab itself lives in GameState.peddlerTab (persisted,
   *  survives a reload); this is just "what happened on the last push,"
   *  same one-shot-reveal role lastGrimsbyResult/lastGrimsbyDiceResult
   *  already play for their own games. */
  lastGrimsbyTabResult: PeddlerTabRunResult | null = null;
  /**
   * Queued rather than a single overwritable value -- simultaneous events
   * (a quest finishing right as it unlocks something) now show one after
   * another instead of the second silently clobbering the first. `toast`
   * stays a plain getter reading the front of the queue, so Toast.tsx
   * needs zero changes: `engine.toast` behaves exactly as it always has,
   * it just advances instead of going straight to null.
   */
  private toastQueue: { message: string; seq: number; long?: boolean }[] = [];
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
  get toast(): { message: string; seq: number; long?: boolean } | null {
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
  /**
   * Companion to requestedTab above -- an optional id for whatever this tab
   * request should draw attention to once the player lands there (e.g. a
   * specific GuildPanel facility/upgrade card, matched against its own
   * `def.id`). Same transient/unsaved, consume-once shape. Introduced for
   * "requires a higher Tavern level" style locked-purchase buttons (see
   * HeroesPanel's recruit cards) so a player blocked on a requirement can
   * jump straight to it instead of hunting for the right tab and card by
   * hand. Left null for every requestTab call that doesn't pass one, so
   * every existing call site keeps working unchanged.
   */
  requestedHighlightId: string | null = null;

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
  private archive(message: string, targetTab?: string, banner = false, targetSubTab?: string) {
    this.state.notifications.unshift({
      id: uid('note'), message, timestamp: Date.now(), targetTab, banner, targetSubTab,
    });
    if (this.state.notifications.length > 100) this.state.notifications.length = 100;
  }

  private say(message: string, targetTab?: string, banner = false, targetSubTab?: string) {
    this.archive(message, targetTab, banner, targetSubTab);
    // Reuses `banner` as the "this deserves more reading time" signal
    // too, rather than a separate parameter -- banner already means
    // "significant enough for the top NotificationBanner + nav shimmer,"
    // and a moment significant enough for that is exactly the kind of
    // thing (a guidance topic, a real milestone) that also deserves
    // longer than the default 3.2s toast window. See Toast.tsx's own
    // duration constants.
    this.toastQueue.push({ message, seq: this.nextToastSeq++, long: banner });
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
   *
   * Also the single chokepoint every AchievementManager.checkAll() call
   * site in this file already funnels through, which makes it the
   * correct (and only) place to grant a bard track tied to an
   * achievement (AchievementDef.unlocksTrackId) -- every quest/raid/
   * peddler/purchase action that can newly unlock an achievement
   * therefore grants its track for free, with no separate hook needed
   * at each of those call sites. Folded into the same archived line
   * rather than a second toast, same "one moment, not two" reasoning as
   * the achievement popup itself.
   */
  private reportAchievements(ids: string[]) {
    if (ids.length === 0) return;
    for (const id of ids) {
      const def = ACHIEVEMENT_BY_ID[id];
      playSound('achievement');
      let message = `Achievement unlocked: ${def?.name ?? id}`;
      if (def?.unlocksTrackId && !this.state.unlockedBardTracks.includes(def.unlocksTrackId)) {
        this.state.unlockedBardTracks.push(def.unlocksTrackId);
        const track = BARD_TRACK_BY_ID[def.unlocksTrackId];
        if (track) message += `. New track for the guild bard: "${track.name}."`;
      }
      this.archive(message);
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
        hero.autoChainMinutesRemaining = null;
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
      hero.autoChainMinutesRemaining = null;
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
        this.say(`${hero.name} has recovered and returns to the roster.`, 'heroes', true);
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
        this.say(`${pet.name} has recovered.`, 'heroes', true);
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
        this.say(`Found a ${result.eggDropped.rarity} egg! Equip it in the Hatchery to start it incubating.`, 'hatchery', true);
      }
      // Grimsby's arrival -- same "live play only, offline catch-up never
      // reaches here" treatment as everything else in this block. A
      // flavor-first banner rather than a plain announcement, matching
      // his character; "Go to" points straight at his tab.
      if (result.grimsbyArrived) {
        this.say('A cart rattles up outside the gate, one wheel squeaking like it\u2019s begging to be replaced.', 'peddler');
      }
      // First title ever earned gets the prominent banner treatment
      // (matches every other genuine "first time" milestone that goes
      // through reportGuidance with banner:true); every title after that
      // is a smaller, ordinary Toast -- same say()/banner split, just
      // driven by hasEarnedFirstTitle instead of a GuidanceTopic.
      if (result.titleGranted) {
        const isFirst = !this.state.hasEarnedFirstTitle;
        this.state.hasEarnedFirstTitle = true;
        this.say(`${result.heroName} has earned the title "${result.titleGranted}"!`, 'heroes', isFirst);
      }
      // Fallen is a bigger deal than an ordinary injury -- routine
      // injuries get no toast at all, just the modal/log -- because it
      // changes what the player can actually do with this hero (or pet)
      // right now, not just their odds on the next send. Same banner
      // treatment recovering from Fallen already gets a few lines up in
      // the tick loop above; going in deserves the same prominence
      // coming out does.
      if (result.heroFallen) {
        this.say(`${result.heroName} has fallen and needs to be revived before questing again.`, 'heroes', true);
      }
      if (result.petFallen) {
        this.say(`${result.petFallen.petName} has fallen and needs to be revived.`, 'heroes', true);
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
      // Only the heroes who actually cleared the raid earn its title --
      // titledHeroNames is already that exact subset (RaidManager.resolve
      // excludes anyone who already held it from a prior clear), so the
      // toast names them directly rather than crediting the guild at
      // large. Same first-title-ever banner split as the quest-chain path
      // above.
      if (raidResult.titleGranted && raidResult.titledHeroNames?.length) {
        const isFirst = !this.state.hasEarnedFirstTitle;
        this.state.hasEarnedFirstTitle = true;
        const names = raidResult.titledHeroNames;
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const verb = names.length === 1 ? 'has' : 'have';
        this.say(`${who} ${verb} earned the title "${raidResult.titleGranted}"!`, 'heroes', isFirst);
      }
      // Same "Fallen earns its own prominent callout" treatment as the
      // quest path above -- see that comment for the full reasoning.
      // Grouped into one toast per kind (heroes / pets) rather than one
      // per faller, same "credit everyone in one line" shape the title
      // toast just above already uses for a multi-hero party.
      if (raidResult.heroesFallen?.length) {
        const names = raidResult.heroesFallen.map((h) => h.heroName);
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const verb = names.length === 1 ? 'has' : 'have';
        const noun = names.length === 1 ? 'needs' : 'need';
        this.say(`${who} ${verb} fallen and ${noun} to be revived before questing again.`, 'heroes', true);
      }
      if (raidResult.petsFallen?.length) {
        const names = raidResult.petsFallen.map((p) => p.petName);
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const verb = names.length === 1 ? 'has' : 'have';
        const noun = names.length === 1 ? 'needs' : 'need';
        this.say(`${who} ${verb} fallen and ${noun} to be revived.`, 'heroes', true);
      }
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

      // New quest-chain discovery notification (patch 0191) -- fires once
      // per chain id, the very first time any of its stages appears on
      // chainBoard, using chainsSeenOnBoard as the "have we shown this one
      // before" ledger (see that field's own comment in GameState for why
      // it's a broader signal than completedChains/activeChains -- a
      // chain sitting offered-but-unclaimed still needs to count). The
      // guild's very first chain ever is deliberately excluded from this
      // notification (see wasFirstEver below): that exact moment is the
      // one guidance topic promoted to the standalone ChainDiscoveryModal
      // instead, in the reportGuidance call right after this block --
      // stacking a banner notification on top of that modal would be the
      // same "two big moments competing" issue that call's own comment
      // already avoids. Still recorded into chainsSeenOnBoard regardless,
      // so the first chain is never retroactively (re-)notified once the
      // modal's been seen and dismissed.
      const wasFirstEver = this.state.chainsSeenOnBoard.length === 0;
      const newlyDiscovered = [...new Set(
        this.state.chainBoard
          .map((o) => o.chain?.chainId)
          .filter((id): id is string => !!id && !this.state.chainsSeenOnBoard.includes(id)),
      )];
      for (const chainId of newlyDiscovered) this.state.chainsSeenOnBoard.push(chainId);
      if (!wasFirstEver) {
        for (const chainId of newlyDiscovered) {
          const chain = CHAIN_BY_ID[chainId];
          this.say(`A new story has surfaced: "${chain?.name ?? chainId}."`, 'chains', true);
        }
      }

      // Checked immediately, right here, rather than left to whichever
      // unrelated action (buying an upgrade, resolving an unrelated
      // quest...) happens to next call GuidanceManager.checkAll elsewhere
      // -- first_chain_seen is the one guidance topic promoted to a
      // standalone MODAL rather than a toast (see MenuWindow.tsx), so it
      // reads as a genuine non-sequitur when it surfaces attached to
      // something the player was doing for an entirely different reason,
      // in a way a milder toast mistiming wouldn't. Confirmed via a real
      // repro: setting a hero to level 100 via Testing populates
      // chainBoard on the very next tick here, well before the player's
      // next real action -- previously that meant the very next unrelated
      // thing they did (a Black Market purchase, in the field report that
      // caught this) triggered the modal instead. checkAll is still safe
      // to call from every other site unchanged: once seen here, it's
      // marked seen and every later call is simply a no-op for this topic.
      this.reportGuidance(GuidanceManager.checkAll(this.state));
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
      const repairDiscount = ModifierManager.global(this.state).repairDiscount ?? 0;
      const threshold = this.state.autoRepairThresholdPercent / 100;
      for (const { item } of EquipmentManager.allItems(this.state)) {
        const max = EquipmentManager.maxDurability(item);
        if (max <= 0 || item.durability / max > threshold) continue;
        const cost = EquipmentManager.repairCost(item, workshop, repairDiscount);
        if (cost > 0 && this.state.gold >= cost) {
          EquipmentManager.repair(this.state, item, workshop, repairDiscount);
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
      // Same information as the live-play toasts above, same "quietly,
      // no toast" treatment as titles/achievements/guidance already get
      // for offline progress -- still archived to the Notifications log
      // (and still visible in the offline report itself, via
      // result.heroFallen/petFallen) so it's not lost, just not a wall
      // of banners on reopen.
      if (result.heroFallen) {
        this.archive(`${result.heroName} fell while you were away and needs to be revived before questing again.`, 'heroes');
      }
      if (result.petFallen) {
        this.archive(`${result.petFallen.petName} fell while you were away and needs to be revived.`, 'heroes');
      }
      if (result.titleGranted) {
        this.state.hasEarnedFirstTitle = true;
        this.archive(`${result.heroName} has earned the title "${result.titleGranted}"!`, 'heroes');
      }
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
          this.archive(`${hero.name} has recovered and returns to the roster.`, 'heroes', true);
        }
      }
      const kennelLevel = this.state.guild.kennel ?? 0;
      for (const pet of this.state.pets) {
        PetManager.regenHealth(this.state, pet, elapsed, kennelLevel);
        if (PetManager.isFallen(pet) && PetManager.autoReviveDue(pet, now)) {
          PetManager.revive(this.state, pet);
          this.archive(`${pet.name} has recovered.`, 'heroes', true);
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
      // Same quiet offline treatment as the quest loop above.
      if (raidResult.heroesFallen?.length) {
        const names = raidResult.heroesFallen.map((h) => h.heroName);
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const verb = names.length === 1 ? 'has' : 'have';
        this.archive(`${who} ${verb} fallen and need to be revived before questing again.`, 'heroes');
      }
      if (raidResult.petsFallen?.length) {
        const names = raidResult.petsFallen.map((p) => p.petName);
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        this.archive(`${who} ${names.length === 1 ? 'has' : 'have'} fallen and need to be revived.`, 'heroes');
      }
      if (raidResult.titleGranted && raidResult.titledHeroNames?.length) {
        this.state.hasEarnedFirstTitle = true;
        const names = raidResult.titledHeroNames;
        const who = names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
        const verb = names.length === 1 ? 'has' : 'have';
        this.archive(`${who} ${verb} earned the title "${raidResult.titleGranted}"!`, 'heroes');
      }
      for (const id of AchievementManager.checkAll(this.state, raidEndsAt)) {
        void window.littleKnight?.unlockAchievement(id);
      }
      for (const topic of GuidanceManager.checkAll(this.state)) {
        for (const message of topic.messages) this.archive(message, topic.targetTab);
      }
    }

    // Overseer auto-harvest credit -- see HarvestManager.offlineAutoHarvest
    // for the estimation shape. No-ops (returns {}) for a save with no
    // Overseer level bought, so this is a free no-op for the vast
    // majority of existing saves. Deliberately placed after the quest/raid
    // loops above so it reads idle-hero count (which those loops can
    // change, heroes returning from quests) as it stands at the end of
    // the gap, not the start.
    const materialsGained = HarvestManager.offlineAutoHarvest(this.state, elapsed);

    this.state.stats.offlineTimeMs += elapsed;
    this.state.lastSeen = now;

    const hasMaterialsGained = Object.values(materialsGained).some((v) => (v ?? 0) > 0);
    if (results.length > 0 || raidResults.length > 0 || hasMaterialsGained || elapsed > 5 * 60_000) {
      this.offlineReport = {
        elapsedMs: elapsed,
        results,
        raidResults,
        goldGained: results.reduce((sum, r) => sum + r.gold, 0) + raidResults.reduce((sum, r) => sum + r.gold, 0),
        xpGained: results.reduce((sum, r) => sum + r.xp, 0) + raidResults.reduce((sum, r) => sum + r.xp, 0),
        materialsGained,
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
    // Same reasoning as quests just above -- an active raid's endsAt is
    // also an absolute real-world timestamp fixed at commit time,
    // independent of lastSeen, so a skip that only rewound lastSeen would
    // report elapsed time correctly while leaving an in-flight raid
    // completely untouched. Reported directly: skip-time buttons "don't
    // affect raids."
    if (this.state.activeRaid) {
      this.state.activeRaid.endsAt -= ms;
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
    // Found during a broader checkAll audit: this directly mutates
    // state.pets, exactly the field FIRST_PET_HATCHED/ALL_PETS_COLLECTED
    // check, but never checked achievements -- so a developer using this
    // testing tool to verify ALL_PETS_COLLECTED (adding all 10 species
    // one at a time) would never actually see it unlock from here, only
    // whenever some unrelated later action happened to trigger a check.
    // A genuinely useful testing tool should reflect real game behavior
    // immediately, not require an extra unrelated step to prove out.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
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

  /** Raid equivalent of testCompleteActiveQuest -- resolves the current
   *  activeRaid immediately using its own already-locked-in partySuccessBonus,
   *  not a guaranteed clear, just not waiting for the clock. No-op if
   *  nothing's actually raiding. Reported directly alongside testSkipTime
   *  above: neither the skip-time buttons nor "complete a quest now" had
   *  any raid equivalent at all. */
  testCompleteActiveRaid() {
    if (!TESTING_TOOLS_ENABLED) return;
    if (!this.state.activeRaid) return;
    const raidResult = RaidManager.resolve(this.state, this.state.activeRaid, this.state.activeRaid.endsAt);
    this.lastRaidResult = raidResult;
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    this.notify();
    void this.saveNow();
  }

  /** Grants every Guild Hall decoration currently in content, regardless
   *  of acquisition kind -- bypasses the gold/achievement/Grimsby gate
   *  entirely (calls GuildHallDecorManager.grant directly, not purchase),
   *  so the Customize scene's item picker can be exercised with a full
   *  pool without grinding out real acquisition paths first. Direct
   *  request from the original design brainstorm ("ensure for testing
   *  purposes we can have all items available"). */
  testGrantAllGuildHallDecorations() {
    if (!TESTING_TOOLS_ENABLED) return;
    for (const def of GUILD_HALL_DECORATIONS) {
      GuildHallDecorManager.grant(this.state, def.id);
    }
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

  /**
   * Marks a tab (or a specific sub-tab within one) as having just been
   * visited -- clears the nav shimmer for any banner-worthy notification
   * targeting it (patch 0191). Same "pin to the current newest
   * notification id" shape acknowledgeTab's sibling markNotificationsSeen
   * uses above, for the same reason: it's a simple, always-correct
   * boundary marker regardless of how many matching/non-matching
   * notifications have piled up since. Called from MenuWindow (bare tab,
   * on every tab switch) and from each sub-tabbed panel's own effect
   * (its currently-active sub-tab, on mount and every switch) -- see
   * isTabUnread in attention.ts for the read side.
   *
   * Deliberately no explicit saveNow() here, unlike most other state
   * mutations in this file -- this can fire on every single tab click,
   * and forcing a disk write that often would be needless churn for a
   * marker that only matters again after a restart. Relies on the
   * existing periodic autosave to eventually persist it, same tradeoff
   * already accepted for plenty of other low-stakes UI state.
   */
  acknowledgeTab(tab: string, subTab?: string) {
    if (this.state.notifications.length === 0) return;
    const key = subTab ? `${tab}:${subTab}` : tab;
    const newestId = this.state.notifications[0].id;
    if (this.state.tabAcknowledged[key] !== newestId) {
      this.state.tabAcknowledged[key] = newestId;
      this.notify();
    }
  }

  /**
   * Requests that the menu open (or switch) to a specific tab id. The
   * optional `highlightId` is picked up by that tab's own panel (currently
   * just GuildPanel, via consumeRequestedHighlight below) to spotlight one
   * specific card -- e.g. "jump to the Guild Hall and highlight the
   * Tavern" for a recruit blocked on Tavern level. The optional `subTab`
   * is picked up by whichever of the 6 sub-tabbed panels this targets
   * (Vendors, Harvest, Lore, Raids, Statistics, Hatchery) -- e.g. "jump to
   * Vendors and open Enchanter specifically" for a notification's own
   * "Go to" button (see NotificationBanner.tsx/GuidePanel.tsx). Generic
   * replacement for what used to be a Hatchery-only
   * requestedHatcherySubTab/requestHatcherySubTab pair -- that comment
   * explicitly deferred generalizing until a second panel needed one;
   * patch 0191's per-vendor/per-sub-tab notification targeting is that
   * second (and third through sixth) panel.
   */
  requestTab(id: string, highlightId?: string, subTab?: string) {
    this.requestedTab = id;
    this.requestedHighlightId = highlightId ?? null;
    this.requestedSubTab = subTab ?? null;
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

  /** Reads and clears the pending highlight request -- same consume-once
   *  shape as consumeRequestedTab, called once by the destination panel
   *  itself (not MenuWindow, since only that panel knows its own card ids). */
  consumeRequestedHighlight(): string | null {
    const id = this.requestedHighlightId;
    this.requestedHighlightId = null;
    return id;
  }

  /**
   * Transient, consume-once request for which sub-tab a destination panel
   * should open on, alongside requestedTab/requestedHighlightId above.
   * `requestedSubTab` itself declared near those two fields further up
   * this class; consumed once by whichever sub-tabbed panel actually
   * mounts to match (an id that doesn't match any of that panel's own
   * sub-tab ids is simply ignored by the panel, same "safe to be generic"
   * shape targetTab/highlightId already have elsewhere).
   */
  consumeRequestedSubTab(): string | null {
    const sub = this.requestedSubTab;
    this.requestedSubTab = null;
    return sub;
  }

  /**
   * Same "transient, consume-once" shape as requestedTab/consumeRequestedTab
   * above, one level deeper -- requestTab only knows about MenuWindow's own
   * top-level tabs; this is what a request actually meant for one of a
   * panel's own internal sub-tabs (Vendors, Harvest, Lore, Raids,
   * Statistics, Hatchery) resolves to once that panel mounts and consumes
   * it. See requestTab/consumeRequestedSubTab further up this class for
   * the write/read pair.
   */
  requestedSubTab: string | null = null;

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
   *
   * `startStreak` is that same choice's ordinary-contract counterpart --
   * "Send Once" vs "Send & Chain" on a standard (non-chain) offer's own
   * card, once Auto-Chain is owned. Previously a manual send always
   * silently rolled a fresh streak with no way to opt out short of not
   * owning the upgrade at all; defaults to `true` so existing behaviour
   * (and every other call site that doesn't pass it) is unchanged.
   * `false` clears any streak state instead of rolling one, same shape
   * rollAutoChainStreak's own level-0 branch already uses.
   */
  startQuest(heroId: string, offer: QuestOffer, _consumables?: string[], chainSteps = false, startStreak = true) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (this.state.autoEquipConsumablesOnSend) this.fillEmptyConsumableSlots(heroId);
    const { error } = QuestManager.start(this.state, hero, offer, hero.equippedConsumables ?? [], Date.now());
    if (error) return this.say(error);
    this.state.focusedHeroId = heroId;

    // A manual send always (re)starts a fresh Auto-Chain streak if the
    // upgrade is owned — choosing to send by hand again implicitly abandons
    // whatever streak state was there before. Unless the player explicitly
    // asked for a one-off send (startStreak === false), in which case the
    // streak is cleared instead, same as the upgrade not being owned.
    if (startStreak) {
      this.rollAutoChainStreak(hero);
    } else {
      hero.autoChainTarget = null;
      hero.autoChainCount = 0;
      hero.autoChainMinutesRemaining = null;
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
   * Sends a hero to replay one stage of a completed chain -- the Replay
   * Memories counterpart to startQuest above. Deliberately its own
   * action rather than a startQuest variant: eligibility (band owned AND
   * chain already completed, both required -- see
   * GuildManager.isChainReplayEligible's own comment) and offer
   * generation (QuestManager.chainReplayOffer, not chainOffer) are both
   * genuinely different from an ordinary send, not just a flag on the
   * same path.
   *
   * Picking a difficulty that doesn't match an already-in-progress
   * replay attempt for this hero+chain starts fresh at stage 0 --
   * simplest coherent rule for an edge case that shouldn't come up often
   * (the UI only ever offers a picker before a fresh attempt begins),
   * rather than trying to carry partial progress across a difficulty
   * switch that was never really defined.
   */
  startChainReplay(heroId: string, chainId: string, difficulty: ChainReplayDifficulty) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (!GuildManager.isChainReplayEligible(this.state, chainId)) {
      return this.say("This chain isn't open for replay yet.");
    }
    const chain = CHAIN_BY_ID[chainId];
    if (!chain) return;
    const existing = this.state.activeChainReplays.find((r) => r.heroId === heroId && r.chainId === chainId);
    const stage = existing?.difficulty === difficulty ? existing.stage : 0;
    const rng = createRng(`chainReplayOffer:${chainId}:${heroId}:${Date.now()}`);
    const offer = QuestManager.chainReplayOffer(chain, stage, difficulty, rng);
    const { error } = QuestManager.start(this.state, hero, offer, hero.equippedConsumables ?? [], Date.now());
    if (error) return this.say(error);
    this.state.focusedHeroId = heroId;
    // Deliberately no Auto-Chain streak interaction here, same reasoning
    // pickBestQuest's own comment already gives for excluding chain
    // offers from automation entirely -- a replay is even more clearly a
    // deliberate, noticed choice than a first-clear chain stage is.
    hero.autoAdvanceChainId = null;
    playSound('depart');
    this.say(`${hero.name} sets out to replay ${chain.name}.`, 'chains');
    void this.saveNow();
  }

  /**
   * Buys one Replay Memories tier (the master unlock or one of the 6
   * saga bands) -- see GuildManager.buyChainReplayTier's own comment for
   * the flat one-time-cost shape.
   */
  buyChainReplayTier(tierId: string) {
    const error = GuildManager.buyChainReplayTier(this.state, tierId);
    if (error) return this.say(error);
    playSound('purchase');
    const tier = CHAIN_REPLAY_TIER_BY_ID[tierId];
    // No targetTab/banner here, unlike most unlock messages -- the only
    // way to click this purchase at all is from inside Replay Memories
    // itself (see DiscoveredQuestsPanel.tsx's TierCard), so a "Go to
    // Discovered Quests" banner and nav shimmer would both be pointing
    // at the tab the player is already looking at. Direct feedback from
    // reviewing this exact flow.
    this.say(`${tier?.sagaName ?? 'Replay tier'} unlocked.`);
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
  /**
   * Shared by startQuest and sendAllIdle -- rolls (or clears) a fresh
   * Auto-Chain bounty streak for a hero who was just sent: a random count
   * within AUTO_CHAIN_RANGES[level] (2-3 at level 1, up through a fixed
   * 10 at maxed level 4). Level 0 (upgrade not owned) clears the streak
   * fields entirely. Pulled out into its own helper (previously
   * duplicated inline in both call sites) as part of patch 0194's Chain
   * Tactics work -- that patch also added a time-budget override here,
   * removed again in patch 0195 (see autoChainMinutesRemaining's own
   * comment for why) once it became clear it fought the maxed tier's own
   * deliberately fixed 10-quest cap rather than complementing it.
   */
  private rollAutoChainStreak(hero: Hero) {
    const level = this.state.upgrades['auto_chain'] ?? 0;
    if (level <= 0) {
      hero.autoChainTarget = null;
      hero.autoChainCount = 0;
      hero.autoChainMinutesRemaining = null;
      return;
    }
    const range = AUTO_CHAIN_RANGES[level];
    hero.autoChainTarget = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
    hero.autoChainCount = 1;
    hero.autoChainMinutesRemaining = null;
  }

  sendAllIdle(): number {
    const now = Date.now();
    let sent = 0;
    for (const hero of this.state.heroes) {
      if (hero.status === 'questing') continue;
      if (this.state.autoEquipConsumablesOnSend) this.fillEmptyConsumableSlots(hero.id);
      const offer = QuestManager.pickBestQuest(this.state, hero, now);
      if (!offer) continue;
      const { error } = QuestManager.start(this.state, hero, offer, hero.equippedConsumables ?? [], now);
      if (error) continue;
      this.rollAutoChainStreak(hero);
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
    hero.autoChainMinutesRemaining = null;
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
   *  time inside QuestManager.start, same as it always did.
   *
   *  Blocked while the hero is away questing, same "can't touch a hero's
   *  loadout mid-quest" rule EquipmentManager.canEquip already enforces for
   *  gear -- this was a real gap (bug report): a deployed hero couldn't be
   *  re-geared, but could still be handed a fresh consumable loadout, which
   *  makes no more sense for a potion slotted for THIS run than it does for
   *  a sword. */
  equipConsumable(heroId: string, defId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (hero.status === 'questing') return this.say(`${hero.name} is away on a quest.`);
    const current = hero.equippedConsumables ?? [];
    const maxSlots = ModifierManager.consumableSlots(this.state);
    if (current.length >= maxSlots) return this.say('No free consumable slots.');
    hero.equippedConsumables = [...current, defId];
    playSound('equip');
    void this.saveNow();
  }

  /** Removes one instance of a consumable from a hero's equipped slots.
   *  Same deployed-hero guard as equipConsumable above -- matches
   *  EquipmentManager.unequip's own "can't touch gear on a questing hero"
   *  rule for the gear side. */
  unequipConsumable(heroId: string, defId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (hero.status === 'questing') return this.say(`${hero.name} is away on a quest.`);
    const current = hero.equippedConsumables ?? [];
    const index = current.indexOf(defId);
    if (index === -1) return;
    hero.equippedConsumables = [...current.slice(0, index), ...current.slice(index + 1)];
    playSound('unequip');
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
    // Same deployed-hero guard as equipConsumable/unequipConsumable above --
    // this is the bulk "Equip best" button, so it needs the check too, not
    // just the single-slot picker. fillEmptyConsumableSlots itself stays
    // unguarded since startQuest/sendAllIdle call it BEFORE flipping the
    // hero to 'questing', for the autoEquipConsumablesOnSend path.
    if (hero.status === 'questing') {
      this.say(`${hero.name} is away on a quest.`);
      return 0;
    }
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
        this.say(`${set.name} — ${bonus.label} unlocked!`, 'equipment', true);
      }
    }
  }

  unequip(heroId: string, slot: Parameters<typeof EquipmentManager.unequip>[2]) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = EquipmentManager.unequip(this.state, hero, slot);
    if (error) return this.say(error);
    playSound('unequip');
    this.notify();
    void this.saveNow();
  }

  repair(itemUid: string) {
    const found = EquipmentManager.allItems(this.state).find((e) => e.item.uid === itemUid);
    if (!found) return;
    const repairDiscount = ModifierManager.global(this.state).repairDiscount ?? 0;
    const cost = EquipmentManager.repairCost(found.item, this.state.guild.workshop ?? 0, repairDiscount);
    if (cost === 0) return this.say('Already in perfect condition.');
    const free = this.consumeFreeRepair(found.heroId, Date.now());
    if (free) {
      found.item.durability = EquipmentManager.maxDurability(found.item);
    } else {
      const error = EquipmentManager.repair(this.state, found.item, this.state.guild.workshop ?? 0, repairDiscount);
      if (error) return this.say(error);
    }
    playSound('repair');
    this.say(free ? 'Repaired, on the house.' : 'Repaired.');
    void this.saveNow();
  }

  repairAll() {
    const workshop = this.state.guild.workshop ?? 0;
    const repairDiscount = ModifierManager.global(this.state).repairDiscount ?? 0;
    const now = Date.now();
    let spent = 0;
    let freeCount = 0;
    for (const { item, heroId } of EquipmentManager.allItems(this.state)) {
      const cost = EquipmentManager.repairCost(item, workshop, repairDiscount);
      if (cost === 0) continue;
      const free = this.consumeFreeRepair(heroId, now);
      if (free) {
        item.durability = EquipmentManager.maxDurability(item);
        freeCount += 1;
      } else if (this.state.gold >= cost) {
        EquipmentManager.repair(this.state, item, workshop, repairDiscount);
        spent += cost;
      }
    }
    if (spent > 0 || freeCount > 0) playSound('repair');
    if (spent === 0 && freeCount === 0) {
      this.say('Nothing needed repairing.');
    } else if (freeCount > 0 && spent === 0) {
      this.say(freeCount === 1 ? 'Repaired one item, on the house.' : `Repaired ${freeCount} items, on the house.`);
    } else if (freeCount > 0) {
      this.say(`Repaired everything for ${spent} gold (${freeCount} free).`);
    } else {
      this.say(`Repaired everything for ${spent} gold.`);
    }
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
    const error = ShopManager.sell(this.state, itemUid, Date.now());
    if (error) return this.say(error);
    playSound('sell');
    this.say('Sold.');
    void this.saveNow();
  }

  /** Flips a stash item's Vault lock -- see EquipmentManager.toggleLock's
   *  own comment. Locked items stay fully visible everywhere (Enhance/
   *  Infuse/Enchant, equip, the plain stash grid) -- only the three
   *  destructive stash actions (Sell, Sell Junk, Scrap) refuse to touch
   *  one while it's locked, enforced at ShopManager's own mutation layer
   *  so a picker UI forgetting to filter one out can't bypass it. No
   *  toast on success -- same "quiet, no confirmation needed" treatment
   *  a settings toggle gets, not an action with a consequence worth
   *  announcing. */
  toggleItemLock(itemUid: string) {
    const error = EquipmentManager.toggleLock(this.state, itemUid);
    if (error) return this.say(error);
    void this.saveNow();
  }

  /**
   * Updates the guild-wide Auto-Chain override settings (Chain Tactics
   * upgrade). Merges rather than replaces, so a caller changing just one
   * field (e.g. the floor dropdown) doesn't need to know or resend the
   * other. Only ever meaningful once the upgrade is owned -- the settings
   * object can still be written before then (harmless, just inert),
   * matching how autoRepairEnabled/autoEquipOnLoot etc. are
   * always-present preferences rather than gated fields. No toast, same
   * quiet-settings-change treatment toggleItemLock above already uses.
   * A change here only affects streaks rolled AFTER this call -- an
   * already-running streak keeps whatever floor/weight it started with,
   * same as every other "preference read once at roll time, not
   * re-checked mid-streak" convention this system already established.
   */
  setAutoChainTactics(partial: Partial<AutoChainTactics>) {
    const current = this.state.autoChainTactics ?? { successFloor: 50, weightBy: 'gold' };
    this.state.autoChainTactics = { ...current, ...partial };
    void this.saveNow();
  }

  /** Reverses a sale from the Blacksmith's own buyback list -- see
   *  ShopManager.buyBack's own comment. */
  buyBackItem(itemUid: string) {
    const error = ShopManager.buyBack(this.state, itemUid);
    if (error) return this.say(error);
    playSound('purchase');
    this.say('Bought back.');
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

  /** Sells the full stack of one curio -- see CurioManager.sellAll's own
   *  comment for why this is "whole stack" not "pick a quantity". */
  sellCurio(curioId: string) {
    const gold = CurioManager.sellAll(this.state, curioId);
    if (gold === 0) return this.say("You don't have any of those.");
    playSound('sell');
    this.say(`Sold for ${gold} gold.`);
    void this.saveNow();
  }

  /** Bulk-sells every owned curio in one action -- the Curios-section
   *  counterpart to sellJunk above. */
  sellAllCurios() {
    const { count, gold } = CurioManager.sellEverything(this.state);
    if (count === 0) return this.say('No curios to sell.');
    playSound('sell');
    this.say(`Sold ${count} curio${count === 1 ? '' : 's'} for ${gold} gold.`);
    void this.saveNow();
  }

  /**
   * For each of a hero's 9 equipment slots, equips the highest-Gear-Score
   * eligible item currently sitting in the stash if it beats what's
   * already equipped there -- the bulk counterpart to picking through the
   * Stash one item at a time. Gear Score is the same per-item value
   * HeroManager.gearScore already sums (see gearScoreForItem in
   * data/equipment.ts); ties are left alone rather than swapped for
   * swapping's sake. Skips anything the hero can't wear yet (reqLevel),
   * same as a manual equip would refuse. Loops slot-by-slot via
   * EquipmentManager.equip itself so a displaced item lands back in the
   * stash exactly the way a manual equip already handles it, and a later
   * slot can immediately see an item the earlier slot's displacement just
   * freed up. Returns how many slots actually changed. */
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
      const currentScore = currentDef ? gearScoreForItem(currentDef) : -1;
      let best: typeof currentItem = undefined;
      let bestScore = currentScore;
      for (const item of this.state.stash) {
        const def = EQUIPMENT_BY_ID[item.defId];
        if (!def || def.slot !== slot) continue;
        anyCandidateSeen = true;
        if (hero.level < def.reqLevel) { anyLevelGated = true; continue; }
        const score = gearScoreForItem(def);
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

  /** Restocks the Blacksmith's own gear stock early -- free once a day
   *  (more via Trade Favor: Blacksmith), gold cost climbing after that.
   *  Independent of the Alchemist/Enchanter's own reroll tracks. See
   *  ShopManager.rerollBlacksmith. */
  rerollBlacksmith() {
    const error = ShopManager.rerollBlacksmith(this.state, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say('The Blacksmith restocks early.');
    void this.saveNow();
  }

  /** Same shape as rerollBlacksmith, for the Alchemist's own supplies
   *  stock. See ShopManager.rerollAlchemist. */
  rerollAlchemist() {
    const error = ShopManager.rerollAlchemist(this.state, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say('The Alchemist restocks early.');
    void this.saveNow();
  }

  /** Same shape again, for the Enchanter's Black Market -- previously had
   *  no manual reroll at all. See ShopManager.rerollEnchanter. */
  rerollEnchanter() {
    const error = ShopManager.rerollEnchanter(this.state, Date.now());
    if (error) return this.say(error);
    playSound('purchase');
    this.say("The Enchanter's black-market contact turns over early.");
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
    // Reuses `enhance` -- a quick magical uplift, same character as an
    // item refine landing. Previously silent.
    playSound('enhance');
    this.say(`${hero.name} is patched up.`);
    void this.saveNow();
  }

  /**
   * The guild's own renewable daily allowance (Physician's Charity)
   * spends first, so a fresh recruit's one-time usedFreeTreat is saved
   * for whenever that daily allowance is already used up rather than
   * burned the moment they're hurt even if the guild could have covered
   * it. Mutates state (the day counter or the hero flag) only when it's
   * actually going to grant a free Treat -- callers should check for a
   * real failure condition (not enough gold, etc.) *before* calling
   * this, since there's no way to "give back" a freebie once granted.
   * See guild-idler-status.md's "new-player injury economy" entry for
   * why this exists at all: starting gold alone couldn't afford either
   * existing cure.
   */
  private consumeFreeHeal(hero: Hero, now: number): boolean {
    const usedToday = rerollsUsedToday(this.state.freeHealsUsedToday, this.state.freeHealDay, now);
    if (usedToday < ModifierManager.freeHealsPerDay(this.state)) {
      this.state.freeHealDay = rerollDay(now);
      this.state.freeHealsUsedToday = usedToday + 1;
      return true;
    }
    if (!hero.usedFreeTreat) {
      hero.usedFreeTreat = true;
      return true;
    }
    return false;
  }

  /**
   * Smith's Charity's twin of consumeFreeHeal above, for Repair instead
   * of Treat. `heroId` is null for a stashed item (no owning hero) --
   * the guild's own daily allowance still applies to those (repairing
   * is repairing, whether the item is worn or sitting in the stash),
   * but the one-time-per-hero fallback obviously can't, since there's
   * no hero to charge it to.
   */
  private consumeFreeRepair(heroId: string | null, now: number): boolean {
    const usedToday = rerollsUsedToday(this.state.freeRepairsUsedToday, this.state.freeRepairDay, now);
    if (usedToday < ModifierManager.freeRepairsPerDay(this.state)) {
      this.state.freeRepairDay = rerollDay(now);
      this.state.freeRepairsUsedToday = usedToday + 1;
      return true;
    }
    if (heroId) {
      const hero = this.hero(heroId);
      if (hero && !hero.usedFreeRepair) {
        hero.usedFreeRepair = true;
        return true;
      }
    }
    return false;
  }

  treatInjury(heroId: string, injuryId: string) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const injury = hero.injuries.find((i) => i.id === injuryId);
    if (!injury) return;
    const free = this.consumeFreeHeal(hero, Date.now());
    if (!free && this.state.gold < injury.treatmentCost) return this.say('Not enough gold for treatment.');
    if (!free) {
      this.state.gold -= injury.treatmentCost;
      this.state.stats.goldSpent += injury.treatmentCost;
    }
    hero.injuries = hero.injuries.filter((i) => i !== injury);
    // Reuses `repair` -- mending a hero and mending gear are the same
    // gesture by ear. Previously silent.
    playSound('repair');
    this.say(free
      ? `${hero.name} is treated for ${injury.name.toLowerCase()}, on the house.`
      : `${hero.name} is treated for ${injury.name.toLowerCase()}.`);
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
    playSound('revive');
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
    playSound('revive');
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
    // BLACKSMITH_MAXED/ALCHEMIST_MAXED/ENCHANTER_MAXED/COMPLETIONIST all
    // gate on every UPGRADES entry (this method's own domain) reaching
    // maxLevel -- same "check immediately, don't wait for an unrelated
    // action" reasoning as the reportGuidance call just above, applied
    // to achievements instead of guidance topics.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
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
    this.say(`${def?.name ?? 'The vendor'} has more to offer now.`, 'vendors', true, vendorId);
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    void this.saveNow();
  }

  upgradeFacility(id: Parameters<typeof GuildManager.upgradeFacility>[1]) {
    const error = GuildManager.upgradeFacility(this.state, id);
    if (error) return this.say(error);
    playSound('purchase');
    // Same immediate-check reasoning as buyUpgrade above -- no facility
    // purchase has its own guidance topic today, but this covers any
    // future facility-tied guidance the same way without needing its
    // own special case.
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    // GUILD_HALL_MAXED/COMPLETIONIST gate on this -- same reasoning as buyUpgrade above.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
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
    this.say('The Trade Route is open -- materials can be sold for gold from here on.', 'harvest', true, 'warehouse');
    void this.saveNow();
  }

  upgradeHarvestTool(nodeId: MaterialId) {
    const error = HarvestManager.upgradeTool(this.state, nodeId);
    if (error) return this.say(error);
    playSound('purchase');
    // ALL_TOOLS_MAXED/COMPLETIONIST gate on this -- same reasoning as buyUpgrade above.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  upgradeWarehouse() {
    const error = HarvestManager.upgradeWarehouse(this.state);
    if (error) return this.say(error);
    playSound('purchase');
    // WAREHOUSE_MAXED/COMPLETIONIST gate on this -- same reasoning as buyUpgrade above.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  upgradeOverseer() {
    const error = HarvestManager.upgradeOverseer(this.state);
    if (error) return this.say(error);
    playSound('purchase');
    const level = this.state.overseerLevel;
    this.say(
      level >= OVERSEER_UPGRADE.maxLevel
        ? 'Your Overseer now catches as much as they ever will on their own -- still worth checking in yourself.'
        : 'Your Overseer will start rescuing a share of whatever you miss.',
      'harvest', true, 'warehouse',
    );
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
    // FIRST_PET_HATCHED/ALL_PETS_COLLECTED gate on this -- same
    // missing-checkAll gap as the peddler/purchase methods above, found
    // and fixed the same way.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
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
    playSound('revive');
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
    playSound('revive');
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
    playSound('recruit');
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
    // Reuses `depart` -- a hero leaving the guild, same shape as a hero
    // leaving on a quest, deliberately not the triumphant cue retire()
    // gets, since this earns no renown or streak.
    playSound('depart');
    this.say(`${hero.name} leaves the guild. The slot is free.`);
    void this.saveNow();
  }

  allocateStat(heroId: string, stat: keyof Hero['stats']) {
    const hero = this.hero(heroId);
    if (!hero || hero.statPoints <= 0) return;
    hero.statPoints -= 1;
    hero.stats[stat] += 1;
    playSound('allocate');
    this.notify();
    void this.saveNow();
  }

  /**
   * Trains a hero into `role` -- see HeroManager.trainRole for the actual
   * cost/mutation logic (unlock price the first time into a given role,
   * cheap repeatable swap price after that). Purely a raid-party-
   * composition lever; doesn't touch board/chain quest math at all, see
   * guild-idler-status.md's hero-roles backlog entry for the scope
   * reasoning.
   */
  trainRole(heroId: string, role: Role) {
    const hero = this.hero(heroId);
    if (!hero) return;
    const error = HeroManager.trainRole(this.state, hero, role);
    if (error) return this.say(error);
    playSound('purchase');
    this.say(`${hero.name} trained as ${HeroManager.roleDisplayName(hero)}.`);
    this.notify();
    void this.saveNow();
  }

  /** Switches which of a hero's already-earned titles displays next to
   *  their name -- purely cosmetic, no gold/gameplay effect, so no error
   *  path beyond "hero not found" or "doesn't actually hold this title"
   *  (both silently no-op rather than a user-facing error -- the picker
   *  UI only ever offers titles the hero actually has, so either
   *  condition means something's out of sync, not a real user mistake
   *  worth surfacing). */
  setActiveTitle(heroId: string, title: string | null) {
    const hero = this.hero(heroId);
    if (!hero) return;
    if (title !== null && !hero.titles.includes(title)) return;
    hero.activeTitle = title;
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
    // Reuses `equip` -- putting a livery on is the same gesture as
    // putting gear on. Previously silent (buySkin already plays
    // `purchase` when the livery is unlocked, but wearing it did not).
    playSound('equip');
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

  /* ------------------------- Guild Hall decorations ------------------------ */
  /* Patch 0203 built the state + engine plumbing; patch 0204 is the first
   * real caller -- GuildHallCustomizeScene.tsx, the inline "Customize"
   * mode on the Guild Hall tab (see GuildPanel.tsx). */

  /** Buys a gold-kind decoration outright. Achievement/Grimsby decorations
   *  have no purchase path -- see GuildHallDecorManager.purchase. */
  purchaseGuildHallDecoration(decorationId: string) {
    const error = GuildHallDecorManager.purchase(this.state, decorationId);
    if (error) return this.say(error);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  /** Places an owned decoration into a physical slot, displacing whatever
   *  was there before (still owned, just unequipped). */
  equipGuildHallDecoration(slotId: GuildHallSlotId, decorationId: string) {
    const error = GuildHallDecorManager.equip(this.state, slotId, decorationId);
    if (error) return this.say(error);
    playSound('equip');
    this.notify();
    void this.saveNow();
  }

  /** Empties a slot. The decoration stays owned. */
  unequipGuildHallDecoration(slotId: GuildHallSlotId) {
    GuildHallDecorManager.unequip(this.state, slotId);
    playSound('unequip');
    this.notify();
    void this.saveNow();
  }

  /** Buys an unowned gold-kind decoration and immediately places it into
   *  the slot whose picker was open when it was bought, in one click and
   *  one save -- what GuildHallCustomizeScene's item picker actually
   *  calls for an unowned row, rather than forcing a buy-then-reopen-
   *  the-picker-then-equip round trip. Two manager calls (purchase, then
   *  equip), one sound/notify/save, same "one user action, one save"
   *  shape every other engine method here already follows. The equip
   *  step should never actually fail here -- purchase already confirmed
   *  the def exists and just granted ownership -- but its error is still
   *  surfaced rather than assumed away, in case a future change to
   *  either manager method's validation drifts the two apart. */
  purchaseAndEquipGuildHallDecoration(slotId: GuildHallSlotId, decorationId: string) {
    const purchaseError = GuildHallDecorManager.purchase(this.state, decorationId);
    if (purchaseError) return this.say(purchaseError);
    const equipError = GuildHallDecorManager.equip(this.state, slotId, decorationId);
    if (equipError) return this.say(equipError);
    playSound('purchase');
    this.notify();
    void this.saveNow();
  }

  /** Moves and/or resizes a slot for the active theme (patch 0212) --
   *  the Customize scene's own "Rearrange" mode calls this once per
   *  completed drag or resize gesture (on pointer-up), not on every
   *  intermediate pointer-move -- the drag itself renders from local
   *  component state for a smooth in-progress feel, and only commits
   *  here once the gesture ends, same "one user action, one save" shape
   *  every other engine method in this section already follows. No sound
   *  -- a drag/resize is a continuous, silent adjustment, not a discrete
   *  purchase/equip moment. */
  setGuildHallSlotRect(slotId: GuildHallSlotId, rect: GuildHallSlotRect) {
    const clamped = GuildHallDecorManager.setSlotRect(this.state, slotId, rect);
    if (!clamped) return;
    this.notify();
    void this.saveNow();
  }

  /** Clears every player-moved/resized slot for the active theme, back to
   *  the DevTool-authored default layout -- the Customize scene's own
   *  "Reset Layout" button. Placed decorations are untouched. */
  resetGuildHallLayout() {
    GuildHallDecorManager.resetLayout(this.state);
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
  pickPeddlerCard(cardIndex: 0 | 1 | 2, highRoller = false, stake = 1) {
    if (!PeddlerManager.isPresent(this.state)) return this.say('There\u2019s no one there right now.');
    if (highRoller && !this.state.grimsbyHighRollerUnlocked) return this.say('High Roller isn\u2019t unlocked yet.');
    const fee = PeddlerManager.feeWithStake(this.state, highRoller, stake);
    if (this.state.gold < fee) return this.say('Not enough gold.');
    const result = PeddlerManager.resolveFlip(this.state, cardIndex, Date.now(), highRoller, stake);
    if (!result) return this.say('Something about that didn\u2019t work.');
    this.lastGrimsbyResult = result;
    playSound(result.cards[result.pickedIndex].outcome.tier === 'jackpot' ? 'legendary_drop' : 'purchase');
    // Real, pre-existing gap found while wiring the new Grimsby
    // achievements: this method never once called checkAll, so nothing a
    // flip could grant (gold/equipment/eggs, and now the jackpot/flip
    // counters below) was ever actually checked against the achievement
    // list from here -- a jackpot achievement would have sat unearned
    // until some unrelated later action happened to trigger a check.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  dismissGrimsbyResult() {
    this.lastGrimsbyResult = null;
    this.notify();
  }

  /**
   * The Dice game's own "place your wager" action -- same shape as
   * pickPeddlerCard just above (validate, resolve, stash the transient
   * result, play a sound, check achievements, notify, save), just against
   * PeddlerManager.rollDice instead of resolveFlip. `wager` is validated
   * here (not just left to rollDice's own defensive floor/positivity
   * check) so a bad input gets its own clear message rather than a silent
   * no-op.
   */
  rollGrimsbyDice(wager: number, chosen: DiceFace) {
    if (!PeddlerManager.isPresent(this.state)) return this.say('There’s no one there right now.');
    const stake = Math.floor(wager);
    if (!Number.isFinite(stake) || stake <= 0) return this.say('Wager something first.');
    if (this.state.gold < stake) return this.say('Not enough gold.');
    const result = PeddlerManager.rollDice(this.state, stake, chosen);
    if (!result) return this.say('Something about that didn’t work.');
    this.lastGrimsbyDiceResult = result;
    playSound(result.outcome === 'jackpot' ? 'legendary_drop' : result.outcome === 'partial' ? 'purchase' : 'quest_fail');
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  dismissGrimsbyDiceResult() {
    this.lastGrimsbyDiceResult = null;
    this.notify();
  }

  /**
   * Opens a new Tab at the given tier (0-3, low to high stake -- see
   * PeddlerManager.tabTierBuyIn). Gated behind Permanent Spot, same
   * precondition-checked-here-not-in-the-manager shape
   * pickPeddlerCard/rollGrimsbyDice already use. No transient result to
   * stash -- GameState.peddlerTab itself IS the ongoing UI state from
   * here on, read directly rather than through a one-shot reveal field.
   */
  openGrimsbyTab(tier: number) {
    if (!this.state.grimsbyPermanentSpotUnlocked) return this.say('The Tab is only open once Grimsby has a permanent spot.');
    if (this.state.peddlerTab) return this.say('A tab is already open.');
    const buyIn = PeddlerManager.tabTierBuyIn(tier);
    if (this.state.gold < buyIn) return this.say('Not enough gold.');
    const tab = PeddlerManager.openTab(this.state, tier);
    if (!tab) return this.say('Something about that didn\u2019t work.');
    playSound('purchase');
    this.reportGuidance(GuidanceManager.checkAll(this.state));
    this.notify();
    void this.saveNow();
  }

  /**
   * The "Run it up" action -- pays the tab's tier buy-in again, rolls
   * for the next round. Success or bust, the result goes to
   * lastGrimsbyTabResult for the UI's own reveal beat (see that field's
   * comment); GameState.peddlerTab reflects the new ongoing state
   * either way (grown, or null on a bust) by the time this returns.
   */
  runUpGrimsbyTab() {
    const tab = this.state.peddlerTab;
    if (!tab) return this.say('No tab is open.');
    const buyIn = PeddlerManager.tabTierBuyIn(tab.tier);
    if (this.state.gold < buyIn) return this.say('Not enough gold.');
    const result = PeddlerManager.runItUp(this.state);
    if (!result) return this.say('Something about that didn\u2019t work.');
    this.lastGrimsbyTabResult = result;
    playSound(result.success ? 'purchase' : 'quest_fail');
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  /** Banks the open tab's current value and closes it. */
  settleGrimsbyTab() {
    const value = PeddlerManager.settleTab(this.state);
    if (value === null) return this.say('No tab is open.');
    playSound('purchase');
    this.say(`Settled for ${value}g.`, 'peddler');
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  dismissGrimsbyTabResult() {
    this.lastGrimsbyTabResult = null;
    this.notify();
  }

  /** Buys the High Roller unlock -- see PeddlerManager.unlockHighRoller
   *  and GameState.grimsbyHighRollerUnlocked's own comments. */
  unlockHighRoller() {
    if (!PeddlerManager.canUnlockHighRoller(this.state)) return this.say('Not enough gold.');
    PeddlerManager.unlockHighRoller(this.state);
    playSound('purchase');
    this.say('Grimsby raises an eyebrow. \u201cOh, you\u2019ve got the goods now, do you?\u201d', 'peddler');
    // Also found while wiring HIGH_ROLLER_UNLOCKED below: this method
    // never called checkAll (so the new achievement would sit unearned
    // until some unrelated action happened to trigger a check) OR
    // notify() (so the UI wouldn't reactively reflect the unlock -- the
    // gold deduction and grimsbyHighRollerUnlocked flip both already
    // happened in state, just never announced). Both fixed alongside the
    // achievement wiring rather than filed separately.
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  /** Buys "A Permanent Spot" -- same shape as unlockHighRoller above,
   *  see PeddlerManager.unlockPermanentSpot and
   *  GameState.grimsbyPermanentSpotUnlocked's own comments. */
  unlockGrimsbyPermanentSpot() {
    if (!PeddlerManager.canUnlockPermanentSpot(this.state)) return this.say('Not enough gold.');
    PeddlerManager.unlockPermanentSpot(this.state);
    playSound('purchase');
    this.say('Grimsby grins. \u201cWell, don\u2019t mind if I do.\u201d', 'peddler');
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  /** Buys the Gold-for-Renown exchange unlock -- see
   *  GuildManager.unlockRenownExchange and
   *  GameState.goldRenownExchangeUnlocked's own comments. */
  unlockRenownExchange() {
    if (!GuildManager.canUnlockRenownExchange(this.state)) return this.say('Not enough gold.');
    GuildManager.unlockRenownExchange(this.state);
    playSound('purchase');
    this.reportAchievements(AchievementManager.checkAll(this.state, Date.now()));
    this.notify();
    void this.saveNow();
  }

  /** Spends `goldOffered` gold for as much Renown as it actually buys --
   *  see GuildManager.exchangeGoldForRenown's own comment for why this
   *  can charge less than the full amount entered. */
  exchangeGoldForRenown(goldOffered: number) {
    const result = GuildManager.exchangeGoldForRenown(this.state, goldOffered);
    if (!result) return this.say('Not enough gold for even 1 Renown at the current rate.');
    playSound('purchase');
    this.notify();
    void this.saveNow();
    return result;
  }

  /** "Fund the Guild" -- see GuildManager.donateToGuild's own comment.
   *  Returns the amount actually donated (for the modal's own live
   *  feedback) or undefined if the amount was invalid/unaffordable. */
  donateToGuild(amount: number) {
    const donated = GuildManager.donateToGuild(this.state, amount);
    if (donated === null) return this.say('Enter a valid amount first.');
    playSound('purchase');
    this.notify();
    void this.saveNow();
    return donated;
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
