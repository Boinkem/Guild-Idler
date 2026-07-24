import { useEffect, useState } from 'react';
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
  const hero = engine.primaryHero;
  const quest = engine.activeQuestFor(hero.id);
  const [anim, setAnim] = useState<Anim>('idle');


  // Departure and return each get a short one-off animation.
  useEffect(() => {
    if (quest) {
      setAnim('departing');
      const id = window.setTimeout(() => setAnim('walking'), 900);
      return () => window.clearTimeout(id);
    }
    setAnim('returning');
    const id = window.setTimeout(() => setAnim('idle'), 900);
    return () => window.clearTimeout(id);
  }, [quest?.id]);

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

  return (
    <div className="idle-root">
      <div className="idle-stage">
        {!quest && questsReady > 0 && (
          <PixelSprite frame={QUEST_MARK} scale={3} className="quest-mark" title="Quests available" />
        )}

        <button
          className={`knight-button ${anim}`}
          onClick={onOpenMenu}
          title={`${hero.name} — click to open the guild menu`}
          aria-label={`${hero.name}, level ${hero.level}. Open the guild menu.`}
        >
          <HeroSprite
            heroClass={hero.heroClass}
            animation={spriteAnimation}
            scale={Math.max(1, Math.round(3 * settings.spriteScale))}
            title={`${hero.name}, level ${hero.level}`}
          />
        </button>
        <div className="knight-shadow" />

        <div className="idle-plate">
          <span className="gold">◆ {formatGold(engine.state.gold)}</span>
          <span className="lvl">Lv {hero.level}</span>
          <span className="muted">{hero.name}</span>
        </div>
        <div className="idle-status">{status}</div>

        <div className="idle-actions">
          <button className="btn-ghost" onClick={onOpenMenu}>Open guild</button>
          <button className="btn-ghost" onClick={() => window.littleKnight?.minimize()}>Hide</button>
        </div>
      </div>
    </div>
  );
}
