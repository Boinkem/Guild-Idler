import { useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CraftingManager } from '../game/managers/CraftingManager';
import { ELEMENT_TYPES, ELEMENT_LABEL, ELEMENT_GLYPH, GEM_TIERS, GEM_TIER_LABEL } from '../game/data/elements';
import { ElementType, GemTier } from '../game/types';
import { formatGold, RARITY_COLOR } from '../game/util';
import { backgroundSrc } from '../game/settings';
import { ItemIcon } from './icons';
import { ItemPreviewModal, PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/**
 * Dim-mode path for this station's scene -- named constant (patch 0345,
 * matching the convention EnhanceStation's own ENHANCE_BG established in
 * 0344) so it can run through backgroundSrc() below. A
 * lore/crafting/bright/infuse.jpg counterpart ships alongside this
 * patch's new night art. Exported (patch 0346) so ArmourInfusionStation
 * can reuse the exact same art -- direct report: Armour Infusion now
 * shares this station's own two-slot scene rather than getting its own
 * dedicated background.
 */
export const INFUSE_BG = './lore/crafting/infuse.jpg';

/**
 * Two slots now -- item up top, which enchant (element+tier) below --
 * originally matched Armour Infusion's own GEAR_SLOT/GEM_SLOT layout
 * (patch 0345, direct report); as of patch 0346 Armour Infusion imports
 * these exact same rects instead of keeping its own copy, since both
 * stations now share this identical infuse.jpg scene outright -- see
 * ArmourInfusionStation.tsx's own doc comment. Replaces the old single
 * ITEM_SLOT plus a pair of chip rows underneath the scene for element
 * then tier; that picker now lives in the bottom slot's own PickerModal
 * table instead, same "click a slot, get a table" shape every other
 * station already uses. Hand-measured against the new commissioned
 * infuse.jpg's own 1402x1122 canvas via the same connected-components
 * pass as every other station's real art.
 */
export const ITEM_SLOT: Rect = { left: 41.6, top: 23.3, width: 16.6, height: 21.0 };
export const ENCHANT_SLOT: Rect = { left: 41.6, top: 49.5, width: 16.7, height: 20.9 };

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
  const { settings } = useSettings();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [tier, setTier] = useState<GemTier | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);
  const [openEnchantPicker, setOpenEnchantPicker] = useState(false);
  // Shown once, right after a pick -- same reasoning ItemPreviewModal's
  // own doc comment gives (CraftingStation.tsx): a straight pick-to-live
  // transition made it easy to commit gold against the wrong weapon
  // without really looking at it first.
  const [previewUid, setPreviewUid] = useState<string | null>(null);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;

  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;

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
        rarity: d.rarity,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  // One option per element/tier combo, same table Armour Infusion's own
  // gemOptions already builds (patch 0237's "Tiered Enchanting/Infusion",
  // reused here as-is on 0345) -- key encodes both (`fire::rare`) since
  // PickerModal.onPick only carries a single string back. Grouped by
  // element, then ascending tier within each, so a player scanning for
  // "the best Fire gem I can afford" reads top-to-bottom within one
  // block rather than hunting across the whole list. `true` here (vs
  // Armour Infusion's `false`) is CraftingManager.gemCost's own
  // isWeapon flag -- same cost table, different gem pool.
  const enchantOptions: PickerOption[] = ELEMENT_TYPES.flatMap((el) => GEM_TIERS.map((t) => {
    const tCost = CraftingManager.gemCost(state, true, el, t);
    const affordable = tCost.ready || (state.gold >= tCost.goldCost && state.scrap >= tCost.scrapCost);
    return {
      key: `${el}::${t}`,
      label: `${GEM_TIER_LABEL[t]} ${ELEMENT_LABEL[el]} Gem`,
      sublabel: tCost.ready ? 'Ready' : `${tCost.scrapCost} Scrap + ${formatGold(tCost.goldCost)}`,
      icon: <span style={{ fontSize: '1.4rem', color: RARITY_COLOR[t] }}>{ELEMENT_GLYPH[el]}</span>,
      disabled: !affordable,
    };
  }));

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

        <div className="craft-scene" style={{ backgroundImage: `url(${backgroundSrc(INFUSE_BG, settings.backgroundMood)})` }}>
          <SlotBox
            rect={ITEM_SLOT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
            label="Choose a weapon to enchant"
            onOpen={() => setOpenItemPicker(true)}
          />
          <SlotBox
            rect={ENCHANT_SLOT}
            filled={element && tier ? (
              <span className="craft-slot-label" style={{ fontSize: '1.6rem', color: RARITY_COLOR[tier] }}>{ELEMENT_GLYPH[element]}</span>
            ) : null}
            disabled={!item}
            label="Choose an enchant"
            onOpen={() => setOpenEnchantPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- infusing replaces whatever element (and tier) it currently carries
            {item.elementalDamage ? ` (currently ${GEM_TIER_LABEL[item.elementalDamageTier ?? 'common']} ${ELEMENT_LABEL[item.elementalDamage]})` : ''}.
            {element && tier && <> Selected: <span style={{ color: RARITY_COLOR[tier] }}>{GEM_TIER_LABEL[tier]}</span> {ELEMENT_LABEL[element]}.</>}
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose a weapon, then an enchant, above.</p>
        )}

        <button className="btn-purple" disabled={!canInfuse} onClick={handleInfuse}>
          Infuse
        </button>
      </div>

      {openItemPicker && (
        <PickerModal
          title="Choose a weapon"
          options={itemOptions}
          onPick={(key) => setPreviewUid(key)}
          onClose={() => setOpenItemPicker(false)}
          layout="grid"
        />
      )}

      {previewItem && previewDef && (
        <ItemPreviewModal
          item={previewItem}
          def={previewDef}
          onBack={() => { setPreviewUid(null); setOpenItemPicker(true); }}
          onContinue={() => { setTargetUid(previewItem.uid); setElement(null); setPreviewUid(null); }}
          extra={(
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {previewItem.elementalDamage
                ? `Currently ${GEM_TIER_LABEL[previewItem.elementalDamageTier ?? 'common']} ${ELEMENT_LABEL[previewItem.elementalDamage]} -- infusing replaces it.`
                : 'Uninfused -- no elemental damage yet.'}
            </p>
          )}
        />
      )}
      {openEnchantPicker && (
        <PickerModal
          title="Choose an enchant"
          options={enchantOptions}
          onPick={(key) => {
            const [el, t] = key.split('::') as [ElementType, GemTier];
            setElement(el);
            setTier(t);
          }}
          onClose={() => setOpenEnchantPicker(false)}
          layout="grid"
        />
      )}
    </div>
  );
}
