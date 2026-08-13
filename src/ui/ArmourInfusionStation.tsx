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

/** Hand-measured against armor-infusion.jpg's own 1448x1086 canvas via a
 *  connected-components pass (largest dark region near each cutout),
 *  same method used for every other station's real art. */
const GEAR_SLOT: Rect = { left: 43.3, top: 27.3, width: 12.5, height: 17.2 };
const GEM_SLOT: Rect = { left: 44.4, top: 50.1, width: 12.1, height: 17.2 };

/**
 * Armor-only -- renamed and rebuilt from what used to be "Gems" (a plain
 * recipe-crafting screen with no item selection at all). Now works like
 * Crafting: gear up top, gem at the bottom, Infuse. Same collapsed
 * craft-then-apply flow Weapon Enchanting uses (see
 * CraftingManager.craftAndInfuse) -- picking an element that isn't
 * already in inventory crafts a fresh Resistance Gem on the spot as part
 * of the same Infuse click.
 */
export function ArmourInfusionStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);
  const [openGemPicker, setOpenGemPicker] = useState(false);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;

  const itemOptions: PickerOption[] = EquipmentManager.allItems(state)
    .filter(({ item: i }) => EquipmentManager.def(i)?.slot !== 'weapon')
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const current = Object.keys(i.elementalResist ?? {}).length > 0
        ? Object.entries(i.elementalResist ?? {}).map(([el, v]) => `${ELEMENT_LABEL[el as ElementType]} +${v}%`).join(', ')
        : 'No resist yet';
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${current}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  const gemOptions: PickerOption[] = ELEMENT_TYPES.map((el) => {
    const elCost = CraftingManager.gemCost(state, false, el);
    const affordable = elCost.ready || (state.gold >= elCost.goldCost && state.scrap >= elCost.scrapCost);
    return {
      key: el,
      label: `${ELEMENT_LABEL[el]} Resistance Gem`,
      sublabel: elCost.ready ? 'Ready' : `${elCost.scrapCost} Scrap + ${formatGold(elCost.goldCost)}`,
      // A real icon slot now, not text embedded in the label -- see
      // PickerModal's own comment on why an option without one used to
      // truncate its whole label to almost nothing.
      icon: <span style={{ fontSize: '1.4rem' }}>{ELEMENT_GLYPH[el]}</span>,
      disabled: !affordable,
    };
  });

  function handleInfuse() {
    if (!item || !element) return;
    engine.infuseItem(item.uid, element);
    setElement(null);
  }

  const cost = element ? CraftingManager.gemCost(state, false, element) : null;
  const canAfford = !cost || cost.ready || (state.gold >= cost.goldCost && state.scrap >= cost.scrapCost);
  const canInfuse = !!item && !!element && canAfford;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Armour Infusion</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>

        <div className="armor-infusion-scene" style={{ backgroundImage: 'url(./lore/crafting/armor-infusion.jpg)' }}>
          <SlotBox
            rect={GEAR_SLOT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={72} /> : null}
            label="Choose armor to infuse"
            onOpen={() => setOpenItemPicker(true)}
          />
          <SlotBox
            rect={GEM_SLOT}
            filled={element ? <span className="craft-slot-label" style={{ fontSize: '1.6rem' }}>{ELEMENT_GLYPH[element]}</span> : null}
            disabled={!item}
            label="Choose a resistance gem"
            onOpen={() => setOpenGemPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- infusing adds to (stacks with) any resist it already carries.
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose a piece of armor, then a gem, above.</p>
        )}

        <button className="btn-purple" disabled={!canInfuse} onClick={handleInfuse}>
          Infuse
        </button>
      </div>

      {openItemPicker && (
        <PickerModal
          title="Choose armor"
          options={itemOptions}
          onPick={(key) => { setTargetUid(key); setElement(null); }}
          onClose={() => setOpenItemPicker(false)}
        />
      )}
      {openGemPicker && (
        <PickerModal
          title="Choose a resistance gem"
          options={gemOptions}
          onPick={(key) => setElement(key as ElementType)}
          onClose={() => setOpenGemPicker(false)}
        />
      )}
    </div>
  );
}
