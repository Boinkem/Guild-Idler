import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager, MAX_PLUS } from '../game/managers/EquipmentManager';
import { formatGold } from '../game/util';
import { ItemIcon } from './icons';
import { ItemPreviewModal, PickerModal, SlotBox } from './CraftingStation';
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
 * The "Refine" (+N) mechanic, moved here from a per-item button buried in
 * each equipped item's expanded card on the Inventory tab -- now a
 * dedicated click-select-confirm station on the Blacksmith's own page,
 * matching Crafting's visual pattern with commissioned art (a single slot
 * here, since there's only one real choice: which item).
 *
 * Correction from an earlier pass: this was originally wired to plain
 * durability *repair* (`engine.repair`, restoring current durability back
 * up to whatever the existing cap already was), based on a literal read
 * of "enhance its durability." What was actually meant was the item's
 * `plus` upgrade -- `EquipmentManager.upgrade`/`engine.upgradeItem` --
 * which *raises* the durability cap itself (`maxDurability` scales with
 * `item.plus`) and tops the item off to that new, higher cap as part of
 * the same action. Plain repair (restore to whatever the cap already is,
 * no cap increase) stays as a quick action back on the Inventory tab
 * instead -- it was never the button being asked to move.
 */
export function EnhanceStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;

  const [targetUid, setTargetUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  // Shown once, right after a pick -- direct feedback that going straight
  // from "picked an item" to "the Enhance button is now live" made it easy
  // to commit gold against the wrong piece of gear without really looking
  // at it. See ItemPreviewModal's own doc comment (CraftingStation.tsx).
  const [previewUid, setPreviewUid] = useState<string | null>(null);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;
  const cost = item ? EquipmentManager.upgradeCost(item, workshop) : 0;
  const maxDurability = item ? EquipmentManager.maxDurability(item) : 0;
  const maxed = item ? item.plus >= MAX_PLUS : false;
  // Same formula EquipmentManager.maxDurability itself uses, evaluated one
  // plus level ahead -- just for the "here's what you'd get" preview line.
  const nextMaxDurability = def ? Math.floor(def.maxDurability * (1 + ((item?.plus ?? 0) + 1) * 0.1)) : 0;

  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;
  const previewMaxed = previewItem ? previewItem.plus >= MAX_PLUS : false;
  const previewMaxDurability = previewItem ? EquipmentManager.maxDurability(previewItem) : 0;
  const previewNextMaxDurability = previewDef
    ? Math.floor(previewDef.maxDurability * (1 + ((previewItem?.plus ?? 0) + 1) * 0.1)) : 0;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const atMax = i.plus >= MAX_PLUS;
      return {
        key: i.uid,
        label: `${d.name}${i.plus > 0 ? ` +${i.plus}` : ''}`,
        sublabel: `${owner} -- ${atMax ? 'max refinement' : `+${i.plus}/${MAX_PLUS}`}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
        rarity: d.rarity,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleEnhance() {
    if (!item) return;
    engine.upgradeItem(item.uid);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Enhance</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
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
            {maxed
              ? 'already at maximum refinement'
              : `+${item.plus} \u2192 +${item.plus + 1} (durability cap ${maxDurability} \u2192 ${nextMaxDurability})`}
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item to see its refinement level.</p>
        )}

        {/* Cost now lives on the button itself, same "Buy · <cost>" /
            "Level up · <cost>" convention VendorsPanel already uses for
            every other paid action in the game -- it used to only appear
            at the tail end of the muted preview sentence above, easy to
            miss since nothing else in that sentence was a cost. */}
        <button className="btn-purple" disabled={!item || maxed || state.gold < cost} onClick={handleEnhance}>
          {!item ? 'Enhance' : maxed ? 'Max refinement' : (
            <>Enhance {'\u00b7'} <span className="gold-text">{'\u25c6'} {formatGold(cost)}</span></>
          )}
        </button>
      </div>

      {openPicker && (
        <PickerModal
          title="Choose an item"
          options={options}
          onPick={(key) => setPreviewUid(key)}
          onClose={() => setOpenPicker(false)}
        />
      )}

      {previewItem && previewDef && (
        <ItemPreviewModal
          item={previewItem}
          def={previewDef}
          onBack={() => { setPreviewUid(null); setOpenPicker(true); }}
          onContinue={() => { setTargetUid(previewItem.uid); setPreviewUid(null); }}
          extra={(
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {previewMaxed
                ? 'Already at maximum refinement.'
                : `Refine: +${previewItem.plus} → +${previewItem.plus + 1} (durability cap ${previewMaxDurability} → ${previewNextMaxDurability})`}
            </p>
          )}
        />
      )}
    </div>
  );
}
