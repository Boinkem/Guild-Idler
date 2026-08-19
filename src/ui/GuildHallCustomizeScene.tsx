import { useState } from 'react';
import { useEngine } from './useEngine';
import { SlotBox, PickerModal, PickerOption, Rect } from './CraftingStation';
import { GuildHallDecorManager } from '../game/managers/GuildHallDecorManager';
import { GUILD_HALL_SLOTS, GUILD_HALL_SLOT_BY_ID } from '../game/data/guildHallSlots';
import { GUILD_HALL_DECORATIONS } from '../game/data/guildHallDecor';
import { GameState, GuildHallDecorationDef, GuildHallSlotDef, GuildHallSlotId } from '../game/types';
import { formatGold } from '../game/util';

/**
 * Renders a decoration's own placement art inside whatever positioned box
 * it's dropped into -- identical left/top/transform/object-fit math to the
 * DevTool's own `.decor-preview-img` (see `renderDecorationField` in
 * tools/devtool/public/app.js), so a decoration looks the same in-game as
 * it did to whoever placed it in the DevTool. `width`/`height: 80%` +
 * `object-fit: contain` (not max-width/max-height + auto) is deliberate --
 * see that same reasoning recorded against `.decor-preview-img` in
 * tools/devtool/public/style.css. Renders nothing for a decoration with no
 * art assigned yet, same as the DevTool's own empty state.
 */
function DecorationArt({ decoration }: { decoration: GuildHallDecorationDef }) {
  const path = decoration.image?.path;
  if (!path) return null;
  const focusX = decoration.image?.focusX ?? 50;
  const focusY = decoration.image?.focusY ?? 50;
  const scale = (decoration.image?.scale ?? 100) / 100;
  return (
    <img
      src={`./decor/${path}`}
      alt={decoration.name}
      style={{
        position: 'absolute',
        left: `${focusX}%`, top: `${focusY}%`,
        width: '80%', height: '80%', objectFit: 'contain',
        transform: `translate(-50%, -50%) scale(${scale})`,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    />
  );
}

/** Fixed-size wrapper around DecorationArt for a picker row's own icon
 *  column -- same "own positioned box, art absolutely fills it" shape as a
 *  full slot box, just a flat 32x32 instead of the box's own percent
 *  rect. */
function DecorationThumb({ decoration }: { decoration: GuildHallDecorationDef }) {
  return (
    <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
      <DecorationArt decoration={decoration} />
    </div>
  );
}

/** The "remove decoration" row is a synthetic option, not a real
 *  decoration id -- kept far outside any real slug shape so it can never
 *  collide with actual content. */
const UNEQUIP_KEY = '__unequip__';

/**
 * One slot's worth of picker rows -- every decoration in this slot's own
 * pool (GuildHallDecorationDef.slotType matching the slot's own), owned
 * ones first, each row explaining exactly why it's clickable or not:
 * owned (equip), affordable gold-kind (buy + equip in one pick), too
 * expensive, or locked behind achievement/Grimsby (no purchase path yet,
 * see GuildHallDecorManager's own top comment on what's deliberately not
 * wired up in this patch). A "Remove decoration" row is prepended only
 * when the slot currently has something equipped -- reuses PickerModal
 * as-is rather than a bespoke widget, same "generic table picker, richer
 * row content via icon+sublabel" shape EggSelectModal already uses.
 */
function buildOptions(slot: GuildHallSlotDef, state: GameState): PickerOption[] {
  const equippedId = GuildHallDecorManager.equippedId(state, slot.id);
  const pool = GUILD_HALL_DECORATIONS
    .filter((d) => d.slotType === slot.slotType)
    .sort((a, b) => {
      const ownedA = GuildHallDecorManager.owns(state, a.id);
      const ownedB = GuildHallDecorManager.owns(state, b.id);
      if (ownedA !== ownedB) return ownedA ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const options: PickerOption[] = [];
  if (equippedId) {
    options.push({ key: UNEQUIP_KEY, label: 'Remove decoration', sublabel: 'Empty this slot' });
  }
  for (const def of pool) {
    const owned = GuildHallDecorManager.owns(state, def.id);
    let sublabel: string;
    let disabled = false;
    if (owned) {
      sublabel = def.description;
    } else if (def.acquisition.kind === 'gold') {
      const affordable = state.gold >= def.acquisition.cost;
      sublabel = affordable
        ? `${formatGold(def.acquisition.cost)} to unlock`
        : `${formatGold(def.acquisition.cost)} -- not enough gold`;
      disabled = !affordable;
    } else if (def.acquisition.kind === 'achievement') {
      sublabel = 'Locked -- earned via achievement';
      disabled = true;
    } else {
      sublabel = 'Locked -- a rare Grimsby find';
      disabled = true;
    }
    options.push({ key: def.id, label: def.name, sublabel, icon: <DecorationThumb decoration={def} />, disabled });
  }
  return options;
}

/**
 * Inline "Customize" mode for the Guild Hall tab (see GuildPanel.tsx,
 * which swaps this in for its own normal facility/upgrade content rather
 * than opening a separate window -- the "Inline edit mode on Guild Hall
 * tab" option picked during the original design brainstorm). Full-bleed
 * background art with all 30 locked slots (guildHallSlots.ts) overlaid as
 * clickable frames, same `SlotBox`/`PickerModal`/`Rect` machinery
 * CraftingStation.tsx already built and EggSelectModal.tsx already reuses
 * for its own single-slot picker, just scaled up to 30 slots instead of
 * 1-3.
 */
export function GuildHallCustomizeScene({ onDone }: { onDone: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [openSlotId, setOpenSlotId] = useState<GuildHallSlotId | null>(null);
  const openSlot = openSlotId ? GUILD_HALL_SLOT_BY_ID[openSlotId] : null;

  function handlePick(slot: GuildHallSlotDef, key: string) {
    if (key === UNEQUIP_KEY) {
      engine.unequipGuildHallDecoration(slot.id);
      return;
    }
    if (GuildHallDecorManager.owns(state, key)) {
      engine.equipGuildHallDecoration(slot.id, key);
    } else {
      engine.purchaseAndEquipGuildHallDecoration(slot.id, key);
    }
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
        <div>
          <span className="card-title">Customize the Guild Hall</span>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>
            Click any open frame to place a decoration. Purely cosmetic -- no effect on stats.
          </p>
        </div>
        <button className="btn-primary" onClick={onDone}>Done</button>
      </div>

      <div className="guildhall-customize-scene" style={{ backgroundImage: 'url(./guildhall-customize/bg.jpg)' }}>
        {GUILD_HALL_SLOTS.map((slot) => {
          const decoration = GuildHallDecorManager.equippedDecoration(state, slot.id);
          return (
            <SlotBox
              key={slot.id}
              rect={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height } as Rect}
              filled={decoration ? <DecorationArt decoration={decoration} /> : null}
              label={decoration ? decoration.name : `Empty ${slot.label} slot`}
              onOpen={() => setOpenSlotId(slot.id)}
            />
          );
        })}
      </div>

      {openSlot && (
        <PickerModal
          title={`Choose a decoration -- ${openSlot.label}`}
          options={buildOptions(openSlot, state)}
          selectedKeys={(() => {
            const id = GuildHallDecorManager.equippedId(state, openSlot.id);
            return id ? [id] : [];
          })()}
          onPick={(key) => handlePick(openSlot, key)}
          onClose={() => setOpenSlotId(null)}
        />
      )}
    </>
  );
}
