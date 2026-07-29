import { useEngine } from './useEngine';
import { RarityPill } from './RarityPill';
import { formatGold } from '../game/util';

/**
 * Shown when a raid resolves. Always mounted regardless of view mode, only
 * renders while `active` (menu open, properly sized) -- same reasoning as
 * every other transient result modal this session; IdleView shows a
 * compact banner instead and opens the menu on click.
 */
export function RaidResultModal({ active, onViewLore }: { active: boolean; onViewLore: () => void }) {
  const engine = useEngine();
  const result = engine.lastRaidResult;
  if (!active || !result) return null;

  const viewLore = () => {
    engine.requestTab('lore');
    onViewLore();
    engine.dismissRaidResult();
  };

  return (
    <div className="overlay">
      <div className={`modal ${result.fullClear ? 'raid-full-clear' : ''}`}>
        <h3>{result.raidName} — {result.difficulty[0].toUpperCase()}{result.difficulty.slice(1)}</h3>
        <p className={`small ${result.fullClear ? 'good' : result.encountersCleared > 0 ? '' : 'bad'}`} style={{ marginTop: 0 }}>
          {result.fullClear
            ? 'Full clear.'
            : result.encountersCleared > 0
              ? `Cleared ${result.encountersCleared} of ${result.totalEncounters} encounters before the party had to fall back.`
              : 'The party was turned back at the first encounter.'}
        </p>

        <div className="stat-row" style={{ margin: '10px 0' }}>
          <span className="gold-text">+{formatGold(result.gold)} gold</span>
          <span>+{result.xp} xp</span>
        </div>

        {result.loot.length > 0 && (
          <>
            <div className="section-heading">Loot</div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
              {result.loot.map((item, i) => (
                <span key={`${item.defId}-${i}`} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <span className="tiny">{item.name}</span>
                  <RarityPill rarity={item.rarity} />
                </span>
              ))}
            </div>
          </>
        )}

        {result.injuries.length > 0 && (
          <>
            <div className="section-heading">Damage report</div>
            {result.injuries.map((i) => (
              <div key={i.heroId} className="small bad">{i.heroName}: {i.injury.name}</div>
            ))}
          </>
        )}

        <div className="row end" style={{ marginTop: 12, gap: 8 }}>
          <button onClick={() => engine.dismissRaidResult()}>Close</button>
          <button className="btn-primary" onClick={viewLore}>View in Lore</button>
        </div>
      </div>
    </div>
  );
}
