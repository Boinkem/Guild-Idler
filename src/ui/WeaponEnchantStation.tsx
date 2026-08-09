import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CraftingManager } from '../game/managers/CraftingManager';
import { ELEMENT_TYPES, ELEMENT_LABEL, ELEMENT_GLYPH } from '../game/data/elements';
import { ElementType } from '../game/types';
import { formatGold } from '../game/util';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/** Hand-measured against infuse.jpg's own 1402x1122 canvas -- one slot
 *  cutout, same rect Armour Infusion's predecessor (the old dual-purpose
 *  Infuse station) already used. */
const ITEM_SLOT: Rect = { left: 42.4, top: 38.7, width: 15.1, height: 19.6 };

/**
 * Weapon-only now -- moved here from the Blacksmith (was a single
 * "Infuse" station handling both weapons and armor) per direct request,
 * split into this and the Enchanter's separate Armour Infusion station.
 * Also collapsed from a two-step "craft a gem, then spend it" flow into
 * one: picking an element that isn't already in inventory crafts a fresh
 * gem on the spot as part of the same Infuse click (see
 * CraftingManager.craftAndInfuse), so this screen never needs to send
 * the player somewhere else first.
 */
export function WeaponEnchantStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;

  const itemOptions: PickerOption[] = EquipmentManager.allItems(state)
    .filter(({ item: i }) => EquipmentManager.def(i)?.slot === 'weapon')
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const current = i.elementalDamage ? ELEMENT_LABEL[i.elementalDamage] : 'Uninfused';
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${current}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleInfuse() {
    if (!item || !element) return;
    engine.infuseItem(item.uid, element);
    setElement(null);
  }

  const cost = element ? CraftingManager.gemCost(state, true, element) : null;
  const canAfford = !cost || cost.ready || (state.gold >= cost.goldCost && state.scrap >= cost.scrapCost);
  const canInfuse = !!item && !!element && canAfford;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Weapon Enchanting</span>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="craft-scene" style={{ backgroundImage: 'url(./lore/crafting/infuse.jpg)' }}>
          <SlotBox
            rect={ITEM_SLOT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
            label="Choose a weapon to enchant"
            onOpen={() => setOpenItemPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- infusing replaces whatever element it currently carries{item.elementalDamage ? ` (currently ${ELEMENT_LABEL[item.elementalDamage]})` : ''}.
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose a weapon, then an element, below.</p>
        )}

        {/* Element row -- each option shows "Ready" if a gem is already in
            inventory, otherwise the fresh-craft cost (charged automatically
            on Infuse, no separate crafting step). */}
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {ELEMENT_TYPES.map((el) => {
            const elCost = CraftingManager.gemCost(state, true, el);
            const selected = element === el;
            const affordable = elCost.ready || (state.gold >= elCost.goldCost && state.scrap >= elCost.scrapCost);
            return (
              <button
                key={el}
                className={`chip ${selected ? 'on' : ''}`}
                disabled={!item || !affordable}
                onClick={() => setElement(el)}
                title={elCost.ready ? `${ELEMENT_LABEL[el]} Gem -- ready` : `${ELEMENT_LABEL[el]} Gem -- ${elCost.scrapCost} Scrap + ${formatGold(elCost.goldCost)}`}
              >
                {ELEMENT_GLYPH[el]} {ELEMENT_LABEL[el]} {elCost.ready ? '(Ready)' : `(${elCost.scrapCost} Scrap + ${formatGold(elCost.goldCost)})`}
              </button>
            );
          })}
        </div>

        <button className="btn-purple" disabled={!canInfuse} onClick={handleInfuse}>
          Infuse
        </button>
      </div>

      {openItemPicker && (
        <PickerModal
          title="Choose a weapon"
          options={itemOptions}
          onPick={(key) => { setTargetUid(key); setElement(null); }}
          onClose={() => setOpenItemPicker(false)}
        />
      )}
    </div>
  );
}
