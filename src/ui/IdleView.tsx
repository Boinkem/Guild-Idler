import { useEffect, useRef, useState } from 'react';
import { useEngine, useNow } from './useEngine';
import { useSettings } from './useSettings';
import { PixelSprite, QUEST_MARK } from './sprites/PixelSprite';
import { HeroAnimation, HeroSprite } from './sprites/HeroSprite';
import { PetSprite } from './sprites/PetSprite';
import { PET_BY_ID } from '../game/data/pets';
import { formatDuration, formatGold } from '../game/util';

type Anim = 'idle' | 'walking' | 'departing' | 'returning';

/** A quest needs to run at least this long for a mid-quest attack flash to be
 * worth scheduling — a 5-minute quest would be over before it read clearly. */
const MIN_DURATION_FOR_FLASH_MS = 20 * 60 * 1000;
const ATTACK_VARIANTS: HeroAnimation[] = ['attack_1', 'attack_2', 'attack_3'];

export function IdleView({ onOpenMenu }: { onOpenMenu: () => void }) {
  const engine = useEngine();
  const now = useNow();
  const { settings, update: updateSettings } = useSettings();
  const hero = engine.displayedHero;
  const quest = engine.activeQuestFor(hero.id);
  const [anim, setAnim] = useState<Anim>(quest ? 'walking' : 'idle');
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

  // Tracks the previously shown hero/quest pair so that cycling to a
  // different hero snaps straight to their real state, while an actual
  // departure or return (same hero, quest status changes) still gets the
  // one-off transition animation.
  const prev = useRef<{ heroId: string; questId: string | null }>({ heroId: hero.id, questId: quest?.id ?? null });

  useEffect(() => {
    const sameHero = prev.current.heroId === hero.id;
    const questChanged = prev.current.questId !== (quest?.id ?? null);
    prev.current = { heroId: hero.id, questId: quest?.id ?? null };

    if (!sameHero || !questChanged) {
      // Switched to a different hero (or nothing actually changed): show
      // their current state directly, no transition animation.
      setAnim(quest ? 'walking' : 'idle');
      return;
    }

    if (quest) {
      setAnim('departing');
      const id = window.setTimeout(() => setAnim('walking'), 900);
      return () => window.clearTimeout(id);
    }
    setAnim('returning');
    const id = window.setTimeout(() => setAnim('idle'), 900);
    return () => window.clearTimeout(id);
  }, [hero.id, quest?.id]);

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

  const questsReady = engine.state.questBoard.length;
  const injured = hero.injuries.length > 0;

  // The desktop companion shows at most one pet -- the first equipped slot
  // -- trailing beside the hero rather than a full party lineup, which
  // would crowd a window this small fast. Its animation deliberately
  // mirrors the hero's own coarse state (idle vs moving) rather than
  // tracking the hero's fuller attack-flash detail, since most equipped
  // species (red panda, crow) don't have anything analogous to attack
  // frames anyway.
  const equippedPet = engine.state.pets.find((p) => p.uid === engine.state.equippedPetIds[0]);
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
    : injured
      ? `${hero.injuries[0].name}. Heals in ${formatDuration(hero.injuries[0].healsAt - now)}.`
      : questsReady > 0
        ? `${questsReady} contracts on the board`
        : 'Waiting for work';

  const others = engine.state.heroes.filter((h) => h.id !== hero.id);
  const othersQuesting = others.filter((h) => h.status === 'questing').length;
  const otherHint = others.length === 0
    ? null
    : othersQuesting > 0
      ? `+${others.length} more at the guild · ${othersQuesting} also questing`
      : `+${others.length} more at the guild`;

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
        {!quest && questsReady > 0 && (
          <PixelSprite frame={QUEST_MARK} scale={2.5} className="quest-mark" title="Quests available" />
        )}

        <div className="hero-carousel">
          {others.length > 0 && (
            <button
              className="carousel-arrow"
              onClick={() => engine.cycleFocusedHero(-1)}
              title="Show the previous hero"
              aria-label="Show the previous hero"
            >
              ‹
            </button>
          )}

          <button
            className={`knight-button ${anim}`}
            onClick={onOpenMenu}
            title={`${hero.title ? hero.title + ' ' : ''}${hero.name} — click to open the guild menu`}
            aria-label={`${hero.title ? hero.title + ' ' : ''}${hero.name}, level ${hero.level}. Open the guild menu.`}
          >
            <HeroSprite
              heroClass={hero.heroClass}
              skin={hero.skin}
              animation={spriteAnimation}
              flip={facingReturn}
              height={Math.round(120 * settings.spriteScale)}
              title={`${hero.title ? hero.title + ' ' : ''}${hero.name}, level ${hero.level}`}
            />
            {floatingText && (
              <div className="floating-reward" key={floatingText.key}>
                {floatingText.xp > 0 && <span className="floating-xp">+{floatingText.xp} XP</span>}
                {floatingText.gold > 0 && <span className="floating-gold">+{floatingText.gold} gold</span>}
              </div>
            )}
          </button>

          {others.length > 0 && (
            <button
              className="carousel-arrow"
              onClick={() => engine.cycleFocusedHero(1)}
              title="Show the next hero"
              aria-label="Show the next hero"
            >
              ›
            </button>
          )}
        </div>
        <div className="knight-shadow" />

        {equippedPet && petDef && (
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

        <div className="idle-plate">
          <span className="gold">◆ {formatGold(engine.state.gold)}</span>
          <span className="lvl">Lv {hero.level}</span>
          <span className="muted">{hero.name}</span>
        </div>
        <div className="idle-status">{status}</div>
        {otherHint && <div className="idle-status muted">{otherHint}</div>}
        {awayBanner && (
          <button className="idle-away-banner" onClick={onOpenMenu}>{awayBanner}</button>
        )}
        {chainBanner && (
          <button className="idle-away-banner idle-chain-banner" onClick={onOpenMenu}>{chainBanner}</button>
        )}
        {raidBanner && (
          <button className="idle-away-banner idle-chain-banner" onClick={onOpenMenu}>{raidBanner}</button>
        )}
        {hatchReadyBanner && (
          <button className="idle-away-banner idle-chain-banner" onClick={onOpenMenu}>{hatchReadyBanner}</button>
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
