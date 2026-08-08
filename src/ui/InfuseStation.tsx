import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { ELEMENT_TYPES, ELEMENT_LABEL, ELEMENT_GLYPH } from '../game/data/elements';
import { ElementType } from '../game/types';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/** Hand-measured against infuse.jpg's own 1402x1122 canvas -- only one
 *  slot cutout painted into this art (unlike gear/consumable/enchant's
 *  three-slot scenes), so gem choice is a row of buttons below the frame
 *  instead of a second SlotBox on the image. */
const ITEM_SLOT: Rect = { left: 42.4, top: 38.7, width: 15.1, height: 19.6 };

export function InfuseStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;
  // Which gem pool this item actually draws from is decided entirely by
  // its own slot (weapon vs everything else) -- see
  // EquipmentManager.infuse's own comment for why there's no separate
  // "kind" choice for the player to make.
  const isWeapon = def?.slot === 'weapon';
  const gemPool = isWeapon ? state.gems : state.resistGems;

  const itemOptions: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const current = d.slot === 'weapon'
        ? (i.elementalDamage ? ELEMENT_LABEL[i.elementalDamage] : 'Uninfused')
        : (Object.keys(i.elementalResist ?? {}).length > 0
          ? Object.entries(i.elementalResist ?? {}).map(([el, v]) => `${ELEMENT_LABEL[el as ElementType]} +${v}%`).join(', ')
          : 'No resist yet');
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

  const canInfuse = !!item && !!element && (gemPool[element] ?? 0) >= 1;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Infuse</span>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="craft-scene" style={{ backgroundImage: 'url(./lore/crafting/infuse.jpg)' }}>
          <SlotBox
            rect={ITEM_SLOT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
            label="Choose an item to infuse"
            onOpen={() => setOpenItemPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- {isWeapon
              ? `weapon: infusing replaces whatever element it currently carries${item.elementalDamage ? ` (currently ${ELEMENT_LABEL[item.elementalDamage]})` : ''}.`
              : 'armor: infusing adds to (stacks with) any resist it already carries.'}
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item, then a gem, below.</p>
        )}

        {/* Gem row -- only meaningful once an item is chosen (it decides
            which pool/label set applies), so it's disabled rather than
            hidden beforehand to keep the layout stable. */}
        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
          {ELEMENT_TYPES.map((el) => {
            const have = gemPool[el] ?? 0;
            const selected = element === el;
            return (
              <button
                key={el}
                className={`chip ${selected ? 'on' : ''}`}
                disabled={!item || have < 1}
                onClick={() => setElement(el)}
                title={`${ELEMENT_LABEL[el]} ${isWeapon ? 'Gem' : 'Resistance Gem'} -- have ${have}`}
              >
                {ELEMENT_GLYPH[el]} {ELEMENT_LABEL[el]} ({have})
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
          title="Choose an item"
          options={itemOptions}
          onPick={(key) => { setTargetUid(key); setElement(null); }}
          onClose={() => setOpenItemPicker(false)}
        />
      )}
    </div>
  );
}
