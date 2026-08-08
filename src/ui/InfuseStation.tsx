import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { ELEMENT_TYPES, ELEMENT_LABEL, ELEMENT_GLYPH } from '../game/data/elements';
import { ElementType } from '../game/types';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/**
 * Two side-by-side slots (item, then gem) on the same "commissioned art +
 * click-select-confirm" pattern EnhanceStation established -- no real art
 * for this one yet either, so these are placeholder rects (same
 * proportions as EnhanceStation's own single slot, just mirrored left and
 * right of center) pending an actual infuse.jpg. Recalibrate both once
 * real art exists, the same note EnhanceStation's own SLOT_RECT carries.
 */
const ITEM_SLOT: Rect = { left: 22.0, top: 37.0, width: 18.7, height: 23.1 };
const GEM_SLOT: Rect = { left: 59.5, top: 37.0, width: 18.7, height: 23.1 };

export function InfuseStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);
  const [openGemPicker, setOpenGemPicker] = useState(false);

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

  const gemOptions: PickerOption[] = ELEMENT_TYPES.map((el) => ({
    key: el,
    label: `${ELEMENT_GLYPH[el]} ${ELEMENT_LABEL[el]} ${isWeapon ? 'Gem' : 'Resistance Gem'}`,
    sublabel: `Have ${gemPool[el] ?? 0}`,
    disabled: (gemPool[el] ?? 0) < 1,
  }));

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
          <SlotBox
            rect={GEM_SLOT}
            filled={element ? <span className="craft-slot-label" style={{ fontSize: '1.6rem' }}>{ELEMENT_GLYPH[element]}</span> : null}
            disabled={!item}
            label="Choose a gem"
            onOpen={() => setOpenGemPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- {isWeapon
              ? `weapon: infusing replaces whatever element it currently carries${item.elementalDamage ? ` (currently ${ELEMENT_LABEL[item.elementalDamage]})` : ''}.`
              : 'armor: infusing adds to (stacks with) any resist it already carries.'}
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item to see what it can carry.</p>
        )}

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
      {openGemPicker && (
        <PickerModal
          title="Choose a gem"
          options={gemOptions}
          onPick={(key) => setElement(key as ElementType)}
          onClose={() => setOpenGemPicker(false)}
        />
      )}
    </div>
  );
}
