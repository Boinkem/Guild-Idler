import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CraftingManager } from '../game/managers/CraftingManager';
import { ELEMENT_TYPES, ELEMENT_LABEL, ELEMENT_GLYPH, GEM_TIERS, GEM_TIER_LABEL } from '../game/data/elements';
import { ElementType, GemTier } from '../game/types';
import { formatGold, RARITY_COLOR } from '../game/util';
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
  // Reset alongside element (see setElementAndResetTier below) -- a tier
  // choice from one element carries no meaning against a different one,
  // each element/tier combo is priced and stocked independently.
  const [tier, setTier] = useState<GemTier | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;

  const setElementAndResetTier = (el: ElementType) => {
    setElement(el);
    setTier(null);
  };

  const itemOptions: PickerOption[] = EquipmentManager.allItems(state)
    .filter(({ item: i }) => EquipmentManager.def(i)?.slot === 'weapon')
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const current = i.elementalDamage
        ? `${GEM_TIER_LABEL[i.elementalDamageTier ?? 'common']} ${ELEMENT_LABEL[i.elementalDamage]}`
        : 'Uninfused';
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${current}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleInfuse() {
    if (!item || !element || !tier) return;
    engine.infuseItem(item.uid, element, tier);
    setElement(null);
    setTier(null);
  }

  const cost = element && tier ? CraftingManager.gemCost(state, true, element, tier) : null;
  const canAfford = !cost || cost.ready || (state.gold >= cost.goldCost && state.scrap >= cost.scrapCost);
  const canInfuse = !!item && !!element && !!tier && canAfford;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Weapon Enchanting</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
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
            {def.name} -- infusing replaces whatever element (and tier) it currently carries
            {item.elementalDamage ? ` (currently ${GEM_TIER_LABEL[item.elementalDamageTier ?? 'common']} ${ELEMENT_LABEL[item.elementalDamage]})` : ''}.
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose a weapon, then an element and tier, below.</p>
        )}

        {/* Element row -- picks WHICH element, tier picked separately
            below once an element is chosen (patch 0237, "Tiered
            Enchanting/Infusion"). No per-option Ready/cost here anymore --
            that now depends on tier too, so it moved to the tier row. */}
        <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
          {ELEMENT_TYPES.map((el) => {
            const selected = element === el;
            return (
              <button
                key={el}
                className={`chip ${selected ? 'on' : ''}`}
                disabled={!item}
                onClick={() => setElementAndResetTier(el)}
                title={ELEMENT_LABEL[el]}
              >
                {ELEMENT_GLYPH[el]} {ELEMENT_LABEL[el]}
              </button>
            );
          })}
        </div>

        {/* Tier row -- only once an element is picked. Each option shows
            "Ready" if a gem of that exact element+tier is already in
            inventory, otherwise the fresh-craft cost (charged
            automatically on Infuse, no separate crafting step). Higher
            tiers cost more but land a bigger match bonus -- see
            elemental.tierEffectivenessPercent in the tuning registry. */}
        {element && (
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {GEM_TIERS.map((t) => {
              const tCost = CraftingManager.gemCost(state, true, element, t);
              const selected = tier === t;
              const affordable = tCost.ready || (state.gold >= tCost.goldCost && state.scrap >= tCost.scrapCost);
              return (
                <button
                  key={t}
                  className={`chip ${selected ? 'on' : ''}`}
                  disabled={!affordable}
                  onClick={() => setTier(t)}
                  style={{ borderColor: RARITY_COLOR[t] }}
                  title={tCost.ready ? `${GEM_TIER_LABEL[t]} ${ELEMENT_LABEL[element]} Gem -- ready` : `${GEM_TIER_LABEL[t]} ${ELEMENT_LABEL[element]} Gem -- ${tCost.scrapCost} Scrap + ${formatGold(tCost.goldCost)}`}
                >
                  <span style={{ color: RARITY_COLOR[t] }}>{GEM_TIER_LABEL[t]}</span> {tCost.ready ? '(Ready)' : `(${tCost.scrapCost} Scrap + ${formatGold(tCost.goldCost)})`}
                </button>
              );
            })}
          </div>
        )}

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
