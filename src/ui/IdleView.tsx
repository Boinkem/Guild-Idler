import { useEffect, useRef, useState } from 'react';
import { useEngine, useNow } from './useEngine';
import { useSettings } from './useSettings';
import { PixelSprite, QUEST_MARK } from './sprites/PixelSprite';
import { HeroAnimation, HeroSprite } from './sprites/HeroSprite';
import { formatDuration, formatGold } from '../game/util';

type Anim = 'idle' | 'walking' | 'departing' | 'returning';

export function IdleView({ onOpenMenu }: { onOpenMenu: () => void }) {
  const engine = useEngine();
  const now = useNow();
  const { settings } = useSettings();
  const hero = engine.displayedHero;
  const quest = engine.activeQuestFor(hero.id);
  const [anim, setAnim] = useState<Anim>(quest ? 'walking' : 'idle');
  const [locked, setLocked] = useState(true);

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

  const questsReady = engine.state.questBoard.length;
  const injured = hero.injuries.length > 0;

  const spriteAnimation: HeroAnimation =
    anim === 'departing' ? 'run'
      : anim === 'walking' ? 'walk'
        : anim === 'returning' ? 'walk'
          : injured ? 'hurt'
            : 'idle';

  const status = quest
    ? `${quest.offer.name} — ${formatDuration(quest.endsAt - now)} left`
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

  return (
    <div className={`idle-root ${locked ? '' : 'unlocked'}`}>
      <div className="idle-stage">
        {!quest && questsReady > 0 && (
          <PixelSprite frame={QUEST_MARK} scale={3} className="quest-mark" title="Quests available" />
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
              height={Math.round(120 * settings.spriteScale)}
              title={`${hero.title ? hero.title + ' ' : ''}${hero.name}, level ${hero.level}`}
            />
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

        <div className="idle-plate">
          <span className="gold">◆ {formatGold(engine.state.gold)}</span>
          <span className="lvl">Lv {hero.level}</span>
          <span className="muted">{hero.name}</span>
        </div>
        <div className="idle-status">{status}</div>
        {otherHint && <div className="idle-status muted">{otherHint}</div>}

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
