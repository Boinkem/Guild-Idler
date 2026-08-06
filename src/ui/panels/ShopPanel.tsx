import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { ShopManager } from '../../game/managers/ShopManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { EquipmentDef, ConsumableDef } from '../../game/types';
import { describeMods, formatDuration, formatGold, RARITY_COLOR } from '../../game/util';
import { ItemIcon, ConsumableIcon } from '../icons';

export function ShopPanel() {
  const engine = useEngine();
  const { settings } = useSettings();
  const now = useNow();
  const state = engine.state;
  const blackMarketUnlocked = ModifierManager.hasUnlock(state, 'blackMarket');

  return (
    <>
      <h2>Shop</h2>
      <p className="subtitle">
        Stock rotates in {formatDuration(ShopManager.timeUntilRefresh(state, now))}. The armourer buys as well as sells.
      </p>

      <div className="section-heading">Arms and armour</div>
      {state.shop.equipment.length === 0 && <p className="small muted">Sold out. Come back after the next delivery.</p>}
      <div className="grid two">
        {state.shop.equipment.map((entry) => (
          <EquipmentShopCard
            key={entry.uid}
            def={EQUIPMENT_BY_ID[entry.defId]}
            price={entry.price}
            canAfford={state.gold >= entry.price}
            onBuy={() => engine.buyShopEquipment(entry.uid)}
          />
        ))}
      </div>

      <div className="section-heading">Supplies</div>
      <div className="grid three">
        {state.shop.consumables.map((entry) => (
          <ConsumableShopCard
            key={entry.defId}
            def={CONSUMABLE_BY_ID[entry.defId]}
            canAfford={state.gold >= (CONSUMABLE_BY_ID[entry.defId]?.cost ?? Infinity)}
            onBuy={() => engine.buyConsumable(entry.defId)}
          />
        ))}
      </div>

      <div className="section-heading">Black Market</div>
      {!blackMarketUnlocked ? (
        <p className="small muted">
          Rumour is there's a contact who deals in rarer stock — for a price. Unlock via the
          Black Market Contact upgrade in the Upgrades tab.
        </p>
      ) : (
        <>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Rare, epic, and legendary only. No haggling. Stock turns over in{' '}
            {formatDuration(ShopManager.timeUntilBlackMarketRefresh(state, now))}.
          </p>
          {state.blackMarket.equipment.length === 0 && (
            <p className="small muted">The contact has nothing worth showing right now.</p>
          )}
          <div className="grid two">
            {state.blackMarket.equipment.map((entry) => (
              <EquipmentShopCard
                key={entry.uid}
                def={EQUIPMENT_BY_ID[entry.defId]}
                price={entry.price}
                canAfford={state.gold >= entry.price}
                onBuy={() => engine.buyBlackMarketEquipment(entry.uid)}
                blackMarket
              />
            ))}
          </div>
        </>
      )}

      <div className="section-heading">Sell from the stash</div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare to sell.</p>}
      <div className="grid two">
        {state.stash.map((item) => {
          const def = EQUIPMENT_BY_ID[item.defId];
          if (!def) return null;
          return (
            <div key={item.uid} className="spread card" style={{ marginBottom: 0 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <ItemIcon slot={def.slot} icon={def.icon} size={28} />
                <span style={{ color: RARITY_COLOR[def.rarity], fontSize: 11 }}>
                  {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                </span>
              </div>
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

/**
 * Collapsed summary (icon, name, price) only -- clicking opens a detail
 * modal instead of showing slot/rarity/mods inline on every card at once.
 * Same "click opens an overlay, doesn't extend the card" convention
 * RaidCard/RaidDetailModal already established.
 */
function EquipmentShopCard({
  def, price, canAfford, onBuy, blackMarket,
}: {
  def: EquipmentDef | undefined; price: number; canAfford: boolean; onBuy: () => void; blackMarket?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  if (!def) return null;

  return (
    <>
      <div
        className={`card ${blackMarket ? 'black-market-item' : ''}`}
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <ItemIcon slot={def.slot} icon={def.icon} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700, fontSize: 11 }}>{def.name}</div>
            <div className="tiny muted">Lv {def.reqLevel} · {formatGold(price)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ItemIcon slot={def.slot} icon={def.icon} size={48} />
              <div>
                <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
                <div className="tiny muted">{def.slot} · {def.rarity} · requires level {def.reqLevel}</div>
              </div>
            </div>
            <div className="stat-row" style={{ margin: '6px 0 12px' }}>
              {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
            </div>
            <div className="row end" style={{ gap: 8 }}>
              <button onClick={() => setShowModal(false)}>Close</button>
              <button
                className="btn-primary"
                disabled={!canAfford}
                onClick={() => { onBuy(); setShowModal(false); }}
              >
                Buy · {formatGold(price)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConsumableShopCard({
  def, canAfford, onBuy,
}: {
  def: ConsumableDef | undefined; canAfford: boolean; onBuy: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  if (!def) return null;

  return (
    <>
      <div
        className="card"
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <ConsumableIcon icon={def.icon} glyph={def.glyph} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="card-title">{def.name}</div>
            <div className="tiny muted">{formatGold(def.cost)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
              <span className="card-title">{def.name}</span>
            </div>
            <p className="card-flavour">{def.description}</p>
            <div className="row end" style={{ gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowModal(false)}>Close</button>
              <button
                className="btn-primary"
                disabled={!canAfford}
                onClick={() => { onBuy(); setShowModal(false); }}
              >
                Buy · {formatGold(def.cost)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
