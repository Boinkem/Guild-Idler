import { useEffect, useRef, useState } from 'react';
import { useEngine, useNow } from './useEngine';
import { useSettings } from './useSettings';
import { PixelSprite, QUEST_MARK } from './sprites/PixelSprite';
import { HeroAnimation, HeroSprite } from './sprites/HeroSprite';
import { RaidPartySprites } from './sprites/RaidPartySprites';
import { PetSprite } from './sprites/PetSprite';
import { PET_BY_ID } from '../game/data/pets';
import { HeroManager } from '../game/managers/HeroManager';
import { formatDuration, formatGold } from '../game/util';

type Anim = 'idle' | 'walking' | 'departing' | 'returning';

/** A quest needs to run at least this long for a mid-quest attack flash to be
 * worth scheduling — a 5-minute quest would be over before it read clearly. */
const MIN_DURATION_FOR_FLASH_MS = 20 * 60 * 1000;
const ATTACK_VARIANTS: HeroAnimation[] = ['attack_1', 'attack_2', 'attack_3'];
/** Mirrors electron/main.ts's own IDLE_SIZE.width -- not shared as an
 *  actual import (main/preload and the renderer are separate build
 *  targets in this project, nothing currently bridges a constant between
 *  them), so this needs to stay numerically in sync with that file by
 *  hand if it ever changes. Used only to restore the companion's normal
 *  width once Raid View's widened state (see the effect below) is no
 *  longer needed. */
const IDLE_DEFAULT_WIDTH = 260;

export function IdleView({ onOpenMenu }: { onOpenMenu: () => void }) {
  const engine = useEngine();
  const now = useNow();
  const { settings, update: updateSettings } = useSettings();
  const hero = engine.displayedHero;
  const displayTitle = HeroManager.displayTitle(hero);
  const quest = engine.activeQuestFor(hero.id);
  // A hero sent on a raid is exactly as unavailable as one on a quest, but
  // raids never populate activeQuestFor (they're tracked separately, via
  // the single guild-wide state.activeRaid.heroIds) -- so a raiding hero
  // fell through every "quest ? ... : ..." branch below as if they were
  // just standing around idle, complete with the "!" quest-available icon
  // still showing over their head. `busy` folds both together for anywhere
  // this companion only cares about "is this hero off doing something,"
  // while `quest` itself is kept around for the few spots that need the
  // actual quest details (status text, chain progress).
  const raiding = engine.state.activeRaid?.heroIds.includes(hero.id) ?? false;
  const busy = !!quest || raiding;
  const [anim, setAnim] = useState<Anim>(busy ? 'walking' : 'idle');
  // Shared by HeroSprite's own `height` prop and .hero-carousel's fixed
  // wrapper height below -- see that element's own comment for why both
  // need to agree on the exact same number.
  const knightHeight = Math.round(120 * settings.spriteScale);
  const [locked, setLocked] = useState(true);
  const [flashAttack, setFlashAttack] = useState<HeroAnimation | null>(null);
  const [floatingText, setFloatingText] = useState<{ gold: number; xp: number; key: number } | null>(null);

  useEffect(() => {
    void window.littleKnight?.getLocked().then((v) => setLocked(v ?? true));
  }, []);

  const toggleLocked = async () => {
    const next = !locked;
    const confirmed = await window.littleKnight?.setLocked(next);
    setLocked(confirmed ?? next);
  };

  // Tracks the previously shown hero/busy-key pair so that cycling to a
  // different hero snaps straight to their real state, while an actual
  // departure or return (same hero, quest/raid status changes) still gets
  // the one-off transition animation. Keyed off `busy` (quest OR raid, see
  // above) rather than just the quest id, so heading out on a raid gets
  // the same "departing" flourish a quest send-off already had, and coming
  // back from one gets "returning" instead of snapping straight to idle.
  const busyKey = quest?.id ?? (raiding ? 'raid' : null);
  const prev = useRef<{ heroId: string; busyKey: string | null }>({ heroId: hero.id, busyKey });

  useEffect(() => {
    const sameHero = prev.current.heroId === hero.id;
    const busyChanged = prev.current.busyKey !== busyKey;
    prev.current = { heroId: hero.id, busyKey };

    if (!sameHero || !busyChanged) {
      // Switched to a different hero (or nothing actually changed): show
      // their current state directly, no transition animation.
      setAnim(busy ? 'walking' : 'idle');
      return;
    }

    if (busy) {
      setAnim('departing');
      const id = window.setTimeout(() => setAnim('walking'), 900);
      return () => window.clearTimeout(id);
    }
    setAnim('returning');
    const id = window.setTimeout(() => setAnim('idle'), 900);
    return () => window.clearTimeout(id);
  }, [hero.id, busyKey, busy]);

  // A brief attack animation partway through a long enough quest — pure
  // flavour, timed once per quest at a random point so it doesn't feel
  // metronomic across many quests in a row.
  const flashTimers = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
  useEffect(() => {
    setFlashAttack(null);
    if (!quest) return undefined;
    const duration = quest.endsAt - quest.startedAt;
    if (duration < MIN_DURATION_FOR_FLASH_MS) return undefined;

    const flashAt = duration * (0.35 + Math.random() * 0.3); // 35%-65% through
    flashTimers.current.start = window.setTimeout(() => {
      setFlashAttack(ATTACK_VARIANTS[Math.floor(Math.random() * ATTACK_VARIANTS.length)]);
      flashTimers.current.end = window.setTimeout(() => setFlashAttack(null), 1800);
    }, flashAt);

    return () => {
      if (flashTimers.current.start) window.clearTimeout(flashTimers.current.start);
      if (flashTimers.current.end) window.clearTimeout(flashTimers.current.end);
      flashTimers.current = { start: null, end: null };
    };
  }, [quest?.id]);

  // A floating "+XP / +Gold" moment whenever a new result comes in — visible
  // even with the menu closed, since the idle companion is the one surface
  // that's always on screen. Keyed by questId so re-renders don't re-trigger.
  const lastResultId = useRef<string | null>(null);
  useEffect(() => {
    const result = engine.lastResult;
    if (!result || result.questId === lastResultId.current) return;
    lastResultId.current = result.questId;
    if (result.gold > 0 || result.xp > 0) {
      setFloatingText({ gold: result.gold, xp: result.xp, key: Date.now() });
      const id = window.setTimeout(() => setFloatingText(null), 2200);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [engine.lastResult]);

  // This hero's own contracts, plus whatever's currently on the shared
  // chain board that THIS hero is actually high-level enough to take --
  // the companion sprite stands in for one hero at a time, so "ready"
  // should mean ready for *them*, not the whole roster pooled together
  // the way it did before the Quest Tab hero-log rework. Chain discovery
  // itself stays guild-wide (generateChainBoard gates that on the guild's
  // single highest-level hero), but a chain being *discovered* doesn't
  // mean every hero can act on it -- same reqLevel filter QuestPanel's own
  // chainOffers now applies, so this badge and that list always agree.
  const questsReady = (engine.state.questBoards[hero.id]?.length ?? 0)
    + engine.state.chainBoard.filter((o) => hero.level >= o.reqLevel).length;
  const injured = hero.injuries.length > 0;

  // The desktop companion shows this hero's own paired pet (see
  // Hero.equippedPetId) trailing beside them, rather than a full party
  // lineup, which would crowd a window this small fast. Its animation
  // deliberately mirrors the hero's own coarse state (idle vs moving)
  // rather than tracking the hero's fuller attack-flash detail, since
  // most equipped species (red panda, crow) don't have anything
  // analogous to attack frames anyway.
  const equippedPet = hero.equippedPetId ? engine.state.pets.find((p) => p.uid === hero.equippedPetId) : undefined;
  const petDef = equippedPet ? PET_BY_ID[equippedPet.defId] : null;

  /**
   * Free-drag the pet to a custom spot, reusing the SAME lock/unlock state
   * the whole companion window already uses -- deliberately not its own
   * separate toggle, per how this was actually asked for. Real click-vs-
   * drag disambiguation is needed here (unlike the window's own OS-level
   * drag, which Chromium already handles for free): a plain click still
   * has to open the guild, exactly like the hero, and only an actual
   * mouse-move during the hold should count as a drag. window-level
   * mousemove/mouseup listeners (not onMouseMove on the button itself) so
   * dragging keeps tracking even if the cursor slips off the small sprite
   * mid-drag.
   */
  const petDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const petJustDraggedRef = useRef(false);

  const handlePetMouseDown = (e: React.MouseEvent) => {
    if (locked) return; // locked: plain click only, same as the hero
    e.preventDefault();
    petDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      origX: settings.petOffsetX, origY: settings.petOffsetY,
      moved: false,
    };
    window.addEventListener('mousemove', handlePetMouseMove);
    window.addEventListener('mouseup', handlePetMouseUp);
  };
  const handlePetMouseMove = (e: MouseEvent) => {
    const drag = petDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // A few px of slop before it counts as a real drag -- otherwise every
    // ordinary click (which always jitters the mouse a pixel or two) would
    // register as a drag and silently eat the click-to-open-guild behaviour.
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    petJustDraggedRef.current = true;
    updateSettings('petOffsetX', drag.origX + dx);
    updateSettings('petOffsetY', drag.origY + dy);
  };
  const handlePetMouseUp = () => {
    window.removeEventListener('mousemove', handlePetMouseMove);
    window.removeEventListener('mouseup', handlePetMouseUp);
    petDragRef.current = null;
  };
  const handlePetClick = () => {
    // Consume the flag rather than checking drag.moved directly -- mouseup
    // (which clears petDragRef) always fires before click in standard DOM
    // event order, so by the time this runs petDragRef is already null.
    if (petJustDraggedRef.current) {
      petJustDraggedRef.current = false;
      return;
    }
    onOpenMenu();
  };

  // "Desktop when back from failed quest -- damage" (fox-specific request,
  // but harmless to request generically -- PetSprite.resolveAnimation just
  // falls back to idle for species without a damage animation of their
  // own). Same lastResult-watching shape as the floatingText effect above,
  // its own ref since both effects independently react to the same value.
  const lastPetResultId = useRef<string | null>(null);
  const [petFlashDamage, setPetFlashDamage] = useState(false);
  useEffect(() => {
    const result = engine.lastResult;
    if (!result || result.questId === lastPetResultId.current) return undefined;
    lastPetResultId.current = result.questId;
    if (result.success) return undefined;
    setPetFlashDamage(true);
    const id = window.setTimeout(() => setPetFlashDamage(false), 1400);
    return () => window.clearTimeout(id);
  }, [engine.lastResult]);

  const petAnimation = petFlashDamage
    ? 'damage'
    : anim === 'idle' ? 'idle' : 'movement';

  const spriteAnimation: HeroAnimation =
    flashAttack && (anim === 'walking')
      ? flashAttack
      : anim === 'departing' ? 'run'
        : anim === 'walking' ? 'walk'
          : anim === 'returning' ? 'walk'
            : injured ? 'hurt'
              : 'idle';

  // Faces away heading out, faces back (mirrored) coming home.
  const facingReturn = anim === 'returning';

  const chainProgress = hero.autoChainTarget !== null
    ? ` (auto-chain ${hero.autoChainCount}/${hero.autoChainTarget})`
    : '';
  const status = quest
    ? `${quest.offer.name} — ${formatDuration(quest.endsAt - now)} left${chainProgress}`
    : raiding
      ? `On a raid — ${formatDuration((engine.state.activeRaid?.endsAt ?? now) - now)} left`
      : injured
        ? `${hero.injuries[0].name}. Heals in ${formatDuration(hero.injuries[0].healsAt - now)}.`
        : questsReady > 0
          ? `${questsReady} contracts on the board`
          : 'Waiting for work';

  const others = engine.state.heroes.filter((h) => h.id !== hero.id);

  // Raid View (Settings > Knight) -- the whole raid party as a row of
  // running sprites instead of the single cycling hero, for as long as a
  // raid is active. `hero` above stays whichever hero cycleFocusedHero
  // last focused (unaffected by this -- switching Raid View off mid-raid
  // should show that same hero exactly as if it had never been on), this
  // is purely an additional display mode layered on top.
  const activeRaidParty = engine.state.activeRaid
    ? engine.state.heroes.filter((h) => engine.state.activeRaid!.heroIds.includes(h.id))
    : [];
  const showRaidPartyView = settings.raidPartyView && !settings.hideHeroSprite && activeRaidParty.length > 0;

  /**
   * Widens the actual OS window (Electron only -- no-op via optional
   * chaining in a plain browser tab) for the duration of Raid View, and
   * always restores IDLE_DEFAULT_WIDTH on the way out, whichever path
   * gets there: the raid ending, the setting being switched off, or this
   * component unmounting outright. Estimated rather than measured --
   * HeroSprite's real per-class frame width lives inside its own manifest
   * data, not exposed up here, so this only needs to be in the right
   * neighborhood; main.ts's own clampToWorkArea keeps it from ever asking
   * for more than the actual screen can give regardless. Standard sprite
   * height (knightHeight, same as the single-hero view) per direct
   * design call -- sprites don't shrink to fit a party, the window grows
   * to fit them instead.
   */
  useEffect(() => {
    if (!showRaidPartyView) {
      void window.littleKnight?.setIdleWidth(IDLE_DEFAULT_WIDTH);
      return undefined;
    }
    const spriteWidthEstimate = knightHeight * 0.75;
    const gap = 6;
    const horizontalPadding = 48;
    const requested = activeRaidParty.length * spriteWidthEstimate
      + Math.max(0, activeRaidParty.length - 1) * gap + horizontalPadding;
    void window.littleKnight?.setIdleWidth(Math.round(requested));
    return () => { void window.littleKnight?.setIdleWidth(IDLE_DEFAULT_WIDTH); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRaidPartyView, activeRaidParty.length, knightHeight]);

  // Used to just report "+N more at the guild" -- accurate as a headcount,
  // but gave no sense of whether those heroes were doing anything, so a
  // full roster sitting idle read identically to one that was fully out
  // on quests/raids. Split into idle/busy/injured counts instead (direct
  // request: "should say how many heroes are idle"). Injured heroes are
  // neither idle (they can't be sent out) nor "questing," so they get
  // their own clause rather than being folded into either -- only shown
  // when non-zero, so the common case still reads as the simple
  // "N idle, N questing" the request asked for.
  const otherIdle = others.filter((h) => (
    h.injuries.length === 0
    && !engine.activeQuestFor(h.id)
    && !(engine.state.activeRaid?.heroIds.includes(h.id))
  )).length;
  const otherInjured = others.filter((h) => h.injuries.length > 0).length;
  const otherQuesting = others.length - otherIdle - otherInjured;
  const otherHint = others.length === 0
    ? null
    : [
      `${otherIdle} idle`,
      `${otherQuesting} questing`,
      ...(otherInjured > 0 ? [`${otherInjured} injured`] : []),
    ].join(', ');

  // Compact stand-in for the full "while you were away" report while still
  // in the tiny idle-companion window -- clicking it opens the menu, where
  // OfflineReportModal (now gated on being active there) shows the real
  // detail. Never shown at all if the setting to skip the report is off.
  const report = engine.offlineReport;
  const awayBanner = report && settings.offlineReportOnLaunch
    ? report.results.length > 0
      ? `While you were away: ${report.results.length} quest${report.results.length === 1 ? '' : 's'}, +${formatGold(report.goldGained)} gold →`
      : 'While you were away: nothing finished yet →'
    : null;

  // Same compact-banner-instead-of-cropped-modal treatment as awayBanner
  // above -- the full celebration (ChainCompleteModal) only renders once
  // the menu is open and properly sized.
  const celebration = engine.completedChainCelebration;
  const chainBanner = celebration ? `Story Chain Complete: ${celebration.chainName} →` : null;

  // Same compact-banner-instead-of-cropped-modal treatment as awayBanner
  // above -- the full result (RaidResultModal) only renders once the menu
  // is open and properly sized.
  const raidResult = engine.lastRaidResult;
  const raidBanner = raidResult
    ? raidResult.fullClear
      ? `Raid cleared: ${raidResult.raidName} →`
      : `Raid ended: ${raidResult.raidName} (${raidResult.encountersCleared}/${raidResult.totalEncounters}) →`
    : null;

  // Same treatment again -- HatchReadyModal only renders full detail once
  // the menu is open, and an egg finishing incubation is just as likely to
  // land mid-quest while the companion window is the only thing showing.
  const hatchReadyBanner = engine.state.pendingHatchReadyNotice ? 'An egg is ready to hatch! →' : null;

  return (
    <div className={`idle-root ${locked ? '' : 'unlocked'}`}>
      <div className="idle-stage">
        {!busy && questsReady > 0 && (
          <PixelSprite frame={QUEST_MARK} scale={2.5} className="quest-mark" title="Quests available" />
        )}

        {/*
          Fixed height, tied to the exact same value passed to HeroSprite's
          own `height` prop below -- HeroSprite scales its rendered box down
          per-class (HERO_DISPLAY_SCALE, see that component's own comment:
          gladiator/adventurer/wizard/dwarf all render SMALLER than the
          nominal height), so .hero-carousel's previous auto-height (sized
          to whatever the current hero's sprite box happened to be) shrank
          and grew every time cycleFocusedHero swapped in a different class.
          The arrows are `top: 50%` of THIS element (app.css), so that
          drifting height is exactly why they'd sit lower/higher depending
          on which hero was showing -- and since the height changed mid-
          interaction, a click could land after the arrow had already
          hopped a few pixels out from under the cursor, reading as
          "sometimes just doesn't respond." Pinning this to a class-
          independent height keeps the arrows in one universal spot
          regardless of whose sprite is centered inside it.
        */}
        <div className={`hero-carousel ${showRaidPartyView ? 'raid-view' : ''}`} style={{ height: knightHeight }}>
          {showRaidPartyView ? (
            // Raid View -- replaces the single cycling hero (and its
            // arrows, which have nothing to cycle through while this is
            // showing) with the whole party running in place side by
            // side. The window itself has already been widened to fit
            // them by the effect above; this element just needs to get
            // out of the way and let the row lay out naturally.
            <RaidPartySprites heroes={activeRaidParty} height={knightHeight} />
          ) : (
            <>
              {!settings.hideHeroSprite && others.length > 0 && (
                <button
                  className="carousel-arrow"
                  onClick={() => engine.cycleFocusedHero(-1)}
                  title="Show the previous hero"
                  aria-label="Show the previous hero"
                >
                  ‹
                </button>
              )}

              {!settings.hideHeroSprite && (
                <button
                  className={`knight-button ${anim}`}
                  onClick={onOpenMenu}
                  title={`${hero.name}${displayTitle ? ', ' + displayTitle : ''} — click to open the guild menu`}
                  aria-label={`${hero.name}${displayTitle ? ', ' + displayTitle : ''}, level ${hero.level}. Open the guild menu.`}
                >
                  <HeroSprite
                    heroClass={hero.heroClass}
                    skin={hero.skin}
                    animation={spriteAnimation}
                    flip={facingReturn}
                    height={knightHeight}
                    title={`${hero.name}${displayTitle ? ', ' + displayTitle : ''}, level ${hero.level}`}
                  />
                  {floatingText && (
                    <div className="floating-reward" key={floatingText.key}>
                      {floatingText.xp > 0 && <span className="floating-xp">+{floatingText.xp} XP</span>}
                      {floatingText.gold > 0 && <span className="floating-gold">+{floatingText.gold} gold</span>}
                    </div>
                  )}
                </button>
              )}

              {!settings.hideHeroSprite && others.length > 0 && (
                <button
                  className="carousel-arrow"
                  onClick={() => engine.cycleFocusedHero(1)}
                  title="Show the next hero"
                  aria-label="Show the next hero"
                >
                  ›
                </button>
              )}
            </>
          )}
        </div>
        {!settings.hideHeroSprite && <div className="knight-shadow" />}

        {settings.hideHeroSprite && (
          // The sprite button is gone, so something still needs to open the
          // guild menu on a click over the stage itself -- idle-actions'
          // own "Open guild" button already covers this, but a bare empty
          // stage otherwise looks broken rather than intentionally minimal.
          // Kept deliberately plain (no sprite-shaped chrome) so it doesn't
          // read as a placeholder waiting for art.
          <button className="btn-ghost" onClick={onOpenMenu} style={{ margin: '20px 0' }}>
            {hero.name} — open guild
          </button>
        )}

        {equippedPet && petDef && !settings.hidePetSprite && (
          <button
            type="button"
            className="pet-companion-button"
            onMouseDown={handlePetMouseDown}
            onClick={handlePetClick}
            style={{ '--pet-drag-x': `${settings.petOffsetX}px`, '--pet-drag-y': `${settings.petOffsetY}px` } as React.CSSProperties}
            title={equippedPet.name}
            aria-label={`${equippedPet.name} — open guild, or drag to reposition while unlocked`}
          >
            <PetSprite
              species={petDef.spriteFolder}
              rarity={equippedPet.rarity}
              animation={petAnimation}
              flip={facingReturn}
              height={Math.round(90 * settings.petSpriteScale)}
              title={equippedPet.name}
              fallback={<span style={{ fontSize: '1.4rem' }}>{petDef.glyph}</span>}
            />
          </button>
        )}

        {!settings.hideIdleInfo && (
          <>
            <div className="idle-plate">
              <span className="gold">◆ {formatGold(engine.state.gold)}</span>
              <span className="lvl">Lv {hero.level}</span>
              <span className="muted">{hero.name}</span>
            </div>
            <div className="idle-status">{status}</div>
            {otherHint && <div className="idle-status muted">{otherHint}</div>}
            {/* Each of these acknowledges the notification log too, not just
                navigating to the menu -- offline catch-up can archive its own
                entries (guidance topics resolved while away) into
                state.notifications, and without this, opening the menu right
                after reading one of these compact summaries could immediately
                trigger the header's own NotificationBanner for something
                covering the exact same offline stretch, reading as "the same
                notification coming back" even though it's technically a
                different (if related) piece of information. Acknowledging
                here gives these summaries the "memory" they were missing --
                once you've seen the headline, the detail-level log entry
                underneath it doesn't also demand separate attention. */}
            {awayBanner && (
              <button className="idle-away-banner" onClick={() => { engine.markNotificationsSeen(); onOpenMenu(); }}>{awayBanner}</button>
            )}
            {chainBanner && (
              <button className="idle-away-banner idle-chain-banner" onClick={() => { engine.markNotificationsSeen(); onOpenMenu(); }}>{chainBanner}</button>
            )}
            {raidBanner && (
              <button className="idle-away-banner idle-chain-banner" onClick={() => { engine.markNotificationsSeen(); onOpenMenu(); }}>{raidBanner}</button>
            )}
            {hatchReadyBanner && (
              <button className="idle-away-banner idle-chain-banner" onClick={() => { engine.markNotificationsSeen(); onOpenMenu(); }}>{hatchReadyBanner}</button>
            )}
          </>
        )}

        <div className="idle-actions">
          <button className="btn-ghost" onClick={onOpenMenu}>Open guild</button>
          <button
            className="btn-ghost"
            onClick={toggleLocked}
            title={locked ? 'Unlock to drag the companion to a new spot' : 'Lock the companion in its current spot'}
          >
            {locked ? '🔒' : '🔓'}
          </button>
          <button className="btn-ghost" onClick={() => window.littleKnight?.minimize()}>Hide</button>
        </div>
      </div>
    </div>
  );
}
