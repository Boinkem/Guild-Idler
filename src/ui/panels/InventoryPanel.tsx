import { useEngine } from '../useEngine';
import { CONSUMABLES } from '../../game/data/items';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { formatGold } from '../../game/util';

function describeEffect(effect: (typeof CONSUMABLES)[number]['effect']): string {
  const parts: string[] = [];
  if (effect.success) parts.push(`+${effect.success}% success`);
  if (effect.gold) parts.push(`+${effect.gold}% gold`);
  if (effect.preventInjury) parts.push('prevents injury');
  if (effect.guaranteedGoodEvent) parts.push('guarantees a favourable event');
  if (effect.healInjury) parts.push('clears one injury');
  return parts.join(' · ');
}

export function InventoryPanel() {
  const engine = useEngine();
  const state = engine.state;

  return (
    <>
      <h2>Inventory</h2>
      <p className="subtitle">Consumables are chosen when you send a hero out, and are spent whatever the result.</p>

      <div className="grid two">
        {CONSUMABLES.map((def) => {
          const count = InventoryManager.count(state, def.id);
          return (
            <div key={def.id} className="card" style={{ marginBottom: 0 }}>
              <div className="spread">
                <span className="card-title">{def.glyph} {def.name}</span>
                <span className="small muted">×{count}</span>
              </div>
              <p className="card-flavour">{def.description}</p>
              <div className="small good" style={{ marginBottom: 8 }}>{describeEffect(def.effect)}</div>
              <div className="row">
                <button onClick={() => engine.buyConsumable(def.id)} disabled={state.gold < def.cost}>
                  Buy · {formatGold(def.cost)}
                </button>
                <button onClick={() => engine.buyConsumable(def.id, 5)} disabled={state.gold < def.cost * 5}>
                  Buy 5 · {formatGold(def.cost * 5)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
