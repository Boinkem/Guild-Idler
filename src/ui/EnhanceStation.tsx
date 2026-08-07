import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { formatGold } from '../game/util';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/**
 * Percent-based slot rect, hand-measured against enhance.jpg's own
 * 1402x1122 canvas -- one single, larger centered slot rather than the
 * three CraftingStation uses, matching that image's own painted frame.
 * Same "scene container locked to the image's own aspect ratio via CSS"
 * approach, see .craft-scene in app.css.
 */
const SLOT_RECT: Rect = { left: 40.9, top: 37.0, width: 18.7, height: 23.1 };

/**
 * Durability repair, moved here from a per-item button buried in each
 * equipped item's expanded card on the Inventory tab -- now a dedicated
 * click-select-confirm station on the Blacksmith's own page, matching
 * Crafting's visual pattern with commissioned art (a single slot here,
 * since there's only one real choice: which item). Still calls the exact
 * same `engine.repair` the old per-item button did -- this only moves
 * *where* that action lives, not what it does. The Inventory tab's
 * top-level "Repair everything" bulk button is unrelated and untouched.
 */
export function EnhanceStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;

  const [targetUid, setTargetUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;
  const cost = item ? EquipmentManager.repairCost(item, workshop) : 0;
  const maxDurability = item ? EquipmentManager.maxDurability(item) : 0;
  const needsRepair = cost > 0;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const full = i.durability >= EquipmentManager.maxDurability(i);
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${full ? 'full durability' : `${i.durability}/${EquipmentManager.maxDurability(i)} durability`}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={64} />,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleEnhance() {
    if (!item) return;
    engine.repair(item.uid);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Enhance</span>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="craft-scene" style={{ backgroundImage: 'url(./lore/crafting/enhance.jpg)' }}>
          <SlotBox
            rect={SLOT_RECT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
            label="Choose an item to enhance"
            onOpen={() => setOpenPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name}{item.plus > 0 ? ` +${item.plus}` : ''} &mdash;{' '}
            {needsRepair ? `${item.durability}/${maxDurability} durability, ${formatGold(cost)} to fully restore` : 'already at full durability'}
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item to see its condition.</p>
        )}

        <button className="btn-purple" disabled={!item || !needsRepair} onClick={handleEnhance}>
          Enhance
        </button>
      </div>

      {openPicker && (
        <PickerModal
          title="Choose an item"
          options={options}
          onPick={(key) => setTargetUid(key)}
          onClose={() => setOpenPicker(false)}
        />
      )}
    </div>
  );
}
