import { useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { EquipmentManager, MAX_PLUS } from '../../game/managers/EquipmentManager';
import { EQUIPMENT_BY_ID, ITEM_SETS } from '../../game/data/equipment';
import { EquipSlot, EquipmentItem } from '../../game/types';
import { describeMods, formatGold, RARITY_COLOR } from '../../game/util';

const SLOTS: EquipSlot[] = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet'];

function ItemLine({ item, showBars = true }: { item: EquipmentItem; showBars?: boolean }) {
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return null;
  const max = EquipmentManager.maxDurability(item);
  const ratio = item.durability / max;
  return (
    <>
      <div style={{ color: RARITY_COLOR[def.rarity], fontSize: 11, fontWeight: 700 }}>
        {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
      </div>
      <div className="tiny muted">{describeMods(def.mods).join(' · ') || 'No bonuses'}</div>
      {showBars && (
        <>
          <div className={`bar dura ${ratio < 0.25 ? 'low' : ''}`} style={{ marginTop: 4 }}>
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
          <div className="tiny muted">
            {item.durability === 0 ? 'Broken — no bonuses' : `Durability ${item.durability}/${max}`}
          </div>
        </>
      )}
    </>
  );
}

export function EquipmentPanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;
  const [heroId, setHeroId] = useState(state.heroes[0].id);
  const hero = state.heroes.find((h) => h.id === heroId) ?? state.heroes[0];

  const repairBill = EquipmentManager.allItems(state)
    .reduce((sum, e) => sum + EquipmentManager.repairCost(e.item, workshop), 0);

  return (
    <>
      <h2>Equipment</h2>
      <p className="subtitle">Gear wears down on every quest. Broken pieces give nothing until repaired.</p>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        {state.heroes.map((h) => (
          <button key={h.id} className={h.id === hero.id ? 'btn-primary' : ''} onClick={() => setHeroId(h.id)}>
            {h.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => engine.repairAll()} disabled={repairBill === 0}>
          Repair everything · {formatGold(repairBill)}
        </button>
      </div>

      <div className="slot-grid">
        {SLOTS.map((slot) => {
          const item = hero.equipment[slot];
          return (
            <div key={slot} className={`slot ${item ? '' : 'empty'}`}>
              <div className="slot-name">{slot}</div>
              {item ? (
                <>
                  <ItemLine item={item} />
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <button
                      style={{ minHeight: 24, padding: '3px 6px' }}
                      onClick={() => engine.repair(item.uid)}
                      disabled={EquipmentManager.repairCost(item, workshop) === 0}
                    >
                      Repair {formatGold(EquipmentManager.repairCost(item, workshop))}
                    </button>
                    <button
                      style={{ minHeight: 24, padding: '3px 6px' }}
                      onClick={() => engine.upgradeItem(item.uid)}
                      disabled={item.plus >= MAX_PLUS}
                    >
                      Refine {formatGold(EquipmentManager.upgradeCost(item, workshop))}
                    </button>
                    <button
                      style={{ minHeight: 24, padding: '3px 6px' }}
                      onClick={() => engine.unequip(hero.id, slot)}
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <div className="tiny muted" style={{ marginTop: 4 }}>Empty</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-heading">Stash ({state.stash.length})</div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare. Loot drops from successful quests.</p>}
      <div className="grid two">
        {state.stash.map((item) => {
          const def = EQUIPMENT_BY_ID[item.defId];
          if (!def) return null;
          const canEquip = EquipmentManager.canEquip(hero, item);
          return (
            <div key={item.uid} className="card" style={{ marginBottom: 0 }}>
              <ItemLine item={item} />
              <div className="tiny muted" style={{ marginTop: 4 }}>
                {def.slot} · requires level {def.reqLevel}
              </div>
              <div className="row wrap" style={{ marginTop: 6 }}>
                <button
                  className="btn-primary"
                  style={{ minHeight: 26 }}
                  disabled={!canEquip.ok}
                  onClick={() => engine.equip(hero.id, item.uid)}
                  title={canEquip.reason}
                >
                  Equip on {hero.name}
                </button>
                <button style={{ minHeight: 26 }} onClick={() => { if (!settings.confirmSell || confirm(`Sell this item?`)) engine.sellItem(item.uid); }}>
                  Sell {formatGold(EquipmentManager.sellValue(item))}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-heading">Collection</div>
      <p className="small muted">
        {state.discoveredItems.length} of {Object.keys(EQUIPMENT_BY_ID).length} items discovered.
      </p>
      {ITEM_SETS.map((set) => {
        const found = set.pieces.filter((p) => state.discoveredItems.includes(p));
        return (
          <div key={set.id} className="card">
            <div className="spread">
              <span className="card-title">{set.name}</span>
              <span className="small muted">{found.length}/{set.pieces.length} found</span>
            </div>
            <div className="stat-row" style={{ marginTop: 6 }}>
              {set.pieces.map((pieceId) => (
                <span
                  key={pieceId}
                  style={{ color: state.discoveredItems.includes(pieceId) ? RARITY_COLOR.legendary : undefined }}
                >
                  {EQUIPMENT_BY_ID[pieceId]?.name ?? pieceId}
                </span>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {set.bonuses.map((b) => `${b.count}-piece ${b.label}: ${describeMods(b.mods).join(', ')}`).join(' · ')}
            </div>
          </div>
        );
      })}
    </>
  );
}
