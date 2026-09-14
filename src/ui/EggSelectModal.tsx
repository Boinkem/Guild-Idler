import { useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { backgroundSrc } from '../game/settings';
import { SlotBox, PickerModal, PickerOption, Rect } from './CraftingStation';
import { EggIcon } from './EggIcon';

/**
 * Percent-based rect for the single content window painted into
 * hatchery-select.jpg, hand-measured against that art's own 1402x1122
 * canvas -- same reasoning as CraftingStation's SLOT_RECTS. Just the one
 * slot here (unlike Crafting's three), since choosing an egg is a single
 * step, not a multi-part assembly.
 *
 * Re-measured for the patch-0390 art refresh (new day/night pair, same
 * 1402x1122 canvas as the crafting scenes -- see app.css's updated
 * aspect-ratio comment). The window sits noticeably larger and slightly
 * lower/left of where the old art placed it, so this replaces rather than
 * nudges the previous values.
 */
const WINDOW_RECT: Rect = { left: 40.5, top: 38.5, width: 18.7, height: 21.1 };

export function EggSelectModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const [pickerOpen, setPickerOpen] = useState(false);

  const options: PickerOption[] = state.eggStorage.map((egg) => ({
    key: egg.uid,
    label: `${egg.rarity.charAt(0).toUpperCase()}${egg.rarity.slice(1)} Egg`,
    sublabel: egg.dedicatedPetId ? 'A special clutch' : undefined,
    icon: <EggIcon rarity={egg.rarity} size={36} />,
  }));

  function handlePick(eggUid: string) {
    engine.equipEgg(eggUid);
    onClose();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Choose an Egg</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>

        <div className="hatchery-select-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/hatchery-select.jpg', settings.backgroundMood)})` }}>
          <SlotBox
            rect={WINDOW_RECT}
            filled={null}
            label="Choose an egg to equip"
            onOpen={() => setPickerOpen(true)}
          />
        </div>

        <p className="tiny muted" style={{ margin: '8px 0' }}>
          {state.eggStorage.length === 0
            ? 'No eggs in storage yet -- they arrive as quest and raid rewards.'
            : `${state.eggStorage.length} egg${state.eggStorage.length === 1 ? '' : 's'} in storage.`}
        </p>
      </div>

      {pickerOpen && (
        <PickerModal
          title="Choose an egg"
          options={options}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
