import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { ShopManager } from '../../game/managers/ShopManager';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { describeMods, formatDuration, formatGold, RARITY_COLOR } from '../../game/util';

export function ShopPanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const now = useNow();
  const state = engine.state;

  return (
    <>
      <h2>Shop</h2>
      <p className="subtitle">
        Stock rotates in {formatDuration(ShopManager.timeUntilRefresh(state, now))}. The armourer buys as well as sells.
      </p>

      <div className="section-heading">Arms and armour</div>
      {state.shop.equipment.length === 0 && <p className="small muted">Sold out. Come back after the next delivery.</p>}
      <div className="grid two">
        {state.shop.equipment.map((entry) => {
          const def = EQUIPMENT_BY_ID[entry.defId];
          if (!def) return null;
          return (
            <div key={entry.uid} className="card" style={{ marginBottom: 0 }}>
              <div style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700, fontSize: 11 }}>{def.name}</div>
              <div className="tiny muted">{def.slot} · {def.rarity} · requires level {def.reqLevel}</div>
              <div className="stat-row" style={{ margin: '6px 0 8px' }}>
                {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
              </div>
              <button
                className="btn-primary"
                disabled={state.gold < entry.price}
                onClick={() => engine.buyShopEquipment(entry.uid)}
              >
                Buy · {formatGold(entry.price)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-heading">Supplies</div>
      <div className="grid three">
        {state.shop.consumables.map((entry) => {
          const def = CONSUMABLE_BY_ID[entry.defId];
          if (!def) return null;
          return (
            <div key={entry.defId} className="card" style={{ marginBottom: 0 }}>
              <div className="card-title">{def.glyph} {def.name}</div>
              <p className="card-flavour">{def.description}</p>
              <button
                disabled={state.gold < def.cost}
                onClick={() => engine.buyConsumable(def.id)}
              >
                Buy · {formatGold(def.cost)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-heading">Sell from the stash</div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare to sell.</p>}
      <div className="grid two">
        {state.stash.map((item) => {
          const def = EQUIPMENT_BY_ID[item.defId];
          if (!def) return null;
          return (
            <div key={item.uid} className="spread card" style={{ marginBottom: 0 }}>
              <span style={{ color: RARITY_COLOR[def.rarity], fontSize: 11 }}>
                {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
              </span>
              <button onClick={() => { if (!settings.confirmSell || confirm(`Sell this item?`)) engine.sellItem(item.uid); }}>
                Sell · {formatGold(EquipmentManager.sellValue(item))}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
