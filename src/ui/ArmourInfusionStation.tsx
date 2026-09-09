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
import {
  ItemPreviewModal, OptionPreviewModal, PickerModal, SlotBox,
} from './CraftingStation';
import type { PickerOption } from './CraftingStation';
import { INFUSE_BG, ITEM_SLOT, ENCHANT_SLOT } from './WeaponEnchantStation';

/**
 * Armor-only -- renamed and rebuilt from what used to be "Gems" (a plain
 * recipe-crafting screen with no item selection at all). Works like
 * Weapon Enchanting: gear up top, infusion below, Infuse. Same collapsed
 * craft-then-apply flow Weapon Enchanting uses (see
 * CraftingManager.craftAndInfuse) -- picking an element that isn't
 * already in inventory crafts a fresh Resistance Gem on the spot as part
 * of the same Infuse click.
 *
 * Patch 0346, direct report: this station now shares Weapon Enchanting's
 * own two-slot scene outright (INFUSE_BG/ITEM_SLOT/ENCHANT_SLOT,
 * imported rather than duplicated) instead of its own dedicated
 * armor-infusion.jpg -- both stations paint onto the exact same
 * commissioned art now. The old armor-infusion.jpg (and its own
 * .armor-infusion-scene aspect-ratio class in app.css) are left in place
 * but unreferenced, same "orphaned rather than pruned" treatment
 * gearenhance.jpg already gets, in case dedicated Armour Infusion art
 * ever replaces this shared-scene arrangement again.
 */
export function ArmourInfusionStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [element, setElement] = useState<ElementType | null>(null);
  const [tier, setTier] = useState<GemTier | null>(null);
  const [openItemPicker, setOpenItemPicker] = useState(false);
  const [openGemPicker, setOpenGemPicker] = useState(false);
  // Same reasoning as WeaponEnchantStation's own previewUid -- see
  // ItemPreviewModal's doc comment (CraftingStation.tsx).
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  // Same confirm-before-it-commits step WeaponEnchantStation's own
  // previewEnchantKey adds (patch 0347, direct report) -- holds the
  // picked option's own key rather than the resolved element/tier so
  // OptionPreviewModal's onContinue can do the actual setElement/setTier
  // itself.
  const [previewGemKey, setPreviewGemKey] = useState<string | null>(null);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;

  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;

  const itemOptions: PickerOption[] = EquipmentManager.allItems(state)
    .filter(({ item: i }) => EquipmentManager.def(i)?.slot !== 'weapon')
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const current = Object.keys(i.elementalResist ?? {}).length > 0
        ? Object.entries(i.elementalResist ?? {}).map(([el, v]) => `${ELEMENT_LABEL[el as ElementType]} +${(v as number).toFixed(1)}%`).join(', ')
        : 'No resist yet';
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${current}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
        rarity: d.rarity,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  // One option per element/tier combo (patch 0237, "Tiered Enchanting/
  // Infusion") -- was one option per element only, since any gem was
  // equally effective before this. Key encodes both (`fire::rare`) since
  // PickerModal.onPick only carries a single string back. Grouped by
  // element, then ascending tier within each -- a player scanning for
  // "the best Fire gem I can afford" reads top-to-bottom within one
  // block rather than hunting across the whole list.
  const gemOptions: PickerOption[] = ELEMENT_TYPES.flatMap((el) => GEM_TIERS.map((t) => {
    const tCost = CraftingManager.gemCost(state, false, el, t);
    const affordable = tCost.ready || (state.gold >= tCost.goldCost && state.scrap >= tCost.scrapCost);
    return {
      key: `${el}::${t}`,
      label: `${GEM_TIER_LABEL[t]} ${ELEMENT_LABEL[el]} Resistance Gem`,
      sublabel: tCost.ready ? 'Ready' : `${tCost.scrapCost} Scrap + ${formatGold(tCost.goldCost)}`,
      // A real icon slot now, not text embedded in the label -- see
      // PickerModal's own comment on why an option without one used to
      // truncate its whole label to almost nothing.
      icon: <span style={{ fontSize: '1.4rem', color: RARITY_COLOR[t] }}>{ELEMENT_GLYPH[el]}</span>,
      disabled: !affordable,
      tags: [el],
    };
  }));

  // "Deals x type damage is the filter" (patch 0348, direct report) --
  // one tab per element, same as Weapon Enchanting's own enchantTabs.
  const gemTabs = ELEMENT_TYPES.map((el) => ({ id: el, label: ELEMENT_LABEL[el] }));

  function handleInfuse() {
    if (!item || !element || !tier) return;
    engine.infuseItem(item.uid, element, tier);
    setElement(null);
    setTier(null);
  }

  const cost = element && tier ? CraftingManager.gemCost(state, false, element, tier) : null;
  const canAfford = !cost || cost.ready || (state.gold >= cost.goldCost && state.scrap >= cost.scrapCost);
  const canInfuse = !!item && !!element && !!tier && canAfford;

  const previewGemOption = previewGemKey ? gemOptions.find((o) => o.key === previewGemKey) : undefined;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Armour Infusion</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>

        <div className="craft-scene" style={{ backgroundImage: `url(${backgroundSrc(INFUSE_BG, settings.backgroundMood)})` }}>
          <SlotBox
            rect={ITEM_SLOT}
            filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
            label="Choose armor to infuse"
            onOpen={() => setOpenItemPicker(true)}
          />
          <SlotBox
            rect={ENCHANT_SLOT}
            filled={element && tier ? (
              <span className="craft-slot-label" style={{ fontSize: '1.6rem', color: RARITY_COLOR[tier] }}>{ELEMENT_GLYPH[element]}</span>
            ) : null}
            disabled={!item}
            label="Choose a resistance gem"
            onOpen={() => setOpenGemPicker(true)}
          />
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name} -- infusing adds to (stacks with) any resist it already carries. A higher-tier gem adds more per infusion -- see elemental.tierEffectivenessPercent.
            {element && tier && <> Selected: <span style={{ color: RARITY_COLOR[tier] }}>{GEM_TIER_LABEL[tier]}</span> {ELEMENT_LABEL[element]}.</>}
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
              {Object.keys(previewItem.elementalResist ?? {}).length > 0
                ? `Current resist: ${Object.entries(previewItem.elementalResist ?? {}).map(([el, v]) => `${ELEMENT_LABEL[el as ElementType]} +${(v as number).toFixed(1)}%`).join(', ')} -- infusing adds to it.`
                : 'No resist yet.'}
            </p>
          )}
        />
      )}
      {openGemPicker && (
        <PickerModal
          title="Choose a resistance gem"
          options={gemOptions}
          tabs={gemTabs}
          onPick={(key) => setPreviewGemKey(key)}
          onClose={() => setOpenGemPicker(false)}
          layout="grid"
        />
      )}
      {previewGemOption && (() => {
        const [el, t] = previewGemKey!.split('::') as [ElementType, GemTier];
        return (
          <OptionPreviewModal
            icon={previewGemOption.icon}
            title={<span style={{ color: RARITY_COLOR[t] }}>{previewGemOption.label}</span>}
            detail={previewGemOption.sublabel}
            onBack={() => { setPreviewGemKey(null); setOpenGemPicker(true); }}
            onContinue={() => { setElement(el); setTier(t); setPreviewGemKey(null); }}
          />
        );
      })()}
    </div>
  );
}
