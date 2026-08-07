import { useState } from 'react';
import { useEngine } from './useEngine';
import { SlotBox, PickerModal, PickerOption, Rect } from './CraftingStation';
import { EggIcon } from './EggIcon';

/**
 * Percent-based rect for the single content window painted into
 * hatchery-select-bg.jpg, hand-measured against that art's own 1448x1086
 * canvas -- same reasoning as CraftingStation's SLOT_RECTS. Just the one
 * slot here (unlike Crafting's three), since choosing an egg is a single
 * step, not a multi-part assembly.
 */
const WINDOW_RECT: Rect = { left: 42.6, top: 37.3, width: 14.1, height: 19.2 };

export function EggSelectModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
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
          <button onClick={onClose}>Close</button>
        </div>

        <div className="hatchery-select-scene" style={{ backgroundImage: 'url(./lore/hatchery-select-bg.jpg)' }}>
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
