import { ReactNode, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { PickerModal, PickerOption, Rect } from './CraftingStation';
import { GuildHallDecorManager } from '../game/managers/GuildHallDecorManager';
import { GUILD_HALL_THEME_BY_ID } from '../game/data/guildHallSlots';
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
 *
 * Exported as of patch 0209 -- `GuildHallMenuBackdrop.tsx` reuses this
 * exact same rendering for the general menu backdrop's own decoration
 * layer, so a placed item looks identical there and in this dedicated
 * Customize scene, same "one art-rendering primitive, every consumer
 * matches" reasoning already behind reusing this from the DevTool.
 */
export function DecorationArt({ decoration }: { decoration: GuildHallDecorationDef }) {
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
    } else if (def.acquisitionKind === 'gold') {
      const cost = def.goldCost ?? 0;
      const affordable = state.gold >= cost;
      sublabel = affordable
        ? `${formatGold(cost)} to unlock`
        : `${formatGold(cost)} -- not enough gold`;
      disabled = !affordable;
    } else if (def.acquisitionKind === 'achievement') {
      sublabel = 'Locked -- earned via achievement';
      disabled = true;
    } else if (def.acquisitionKind === 'grimsby') {
      sublabel = 'Locked -- a rare Grimsby find';
      disabled = true;
    } else {
      // Malformed/unrecognized acquisition data (e.g. hand-edited JSON,
      // or content saved before patch 0211's flat-field fix) -- never
      // crash the whole Customize scene over one bad content row. See
      // GuildHallDecorAcquisitionKind's own doc comment in types.ts for
      // the crash this used to cause.
      sublabel = 'Locked';
      disabled = true;
    }
    options.push({ key: def.id, label: def.name, sublabel, icon: <DecorationThumb decoration={def} />, disabled });
  }
  return options;
}

/** Same readout format as the DevTool's own slot layout editor
 *  (`updateSlotLayoutReadout`, app.js) -- "12.3%, 40.1% · 15.0×20.0%". */
function formatRect(rect: Rect): string {
  return `${rect.left.toFixed(1)}%, ${rect.top.toFixed(1)}% · ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}%`;
}

/** Clamps a moved rect so it can never leave the scene's own 0-100%
 *  bounds -- same clamp `GuildHallDecorManager.setSlotRect` applies when
 *  the drag actually commits, duplicated here only so the drag *looks*
 *  right the whole time it's in progress, not just once it lands. */
function clampMove(start: Rect, dxPct: number, dyPct: number): Rect {
  const left = Math.max(0, Math.min(100 - start.width, start.left + dxPct));
  const top = Math.max(0, Math.min(100 - start.height, start.top + dyPct));
  return { ...start, left, top };
}

/** Same shape as clampMove, resizing from the bottom-right corner
 *  instead -- floored at a 2% minimum in each dimension (matches
 *  GuildHallDecorManager's own MIN_SLOT_SIZE) and capped at the scene's
 *  own right/bottom edge. */
function clampResize(start: Rect, dxPct: number, dyPct: number): Rect {
  const width = Math.max(2, Math.min(100 - start.left, start.width + dxPct));
  const height = Math.max(2, Math.min(100 - start.top, start.height + dyPct));
  return { ...start, width, height };
}

/**
 * A single Guild Hall slot in the Customize scene -- either a plain
 * click-to-open frame (`SlotBox` would do fine on its own for this half)
 * or, while `rearranging` is on, a draggable/resizable one, so this is a
 * bespoke sibling to `SlotBox` rather than an extension of it: `SlotBox`
 * is shared by three other stations (CraftingStation.tsx) that have no
 * concept of rearranging at all, and bolting drag/resize onto its own
 * props would leak Guild-Hall-only behaviour into every one of them.
 *
 * The drag/resize math itself (percent-of-container pointer delta,
 * clamped to the scene's own bounds, floored at a 2% minimum size) is
 * ported from the DevTool's own slot layout editor
 * (`wireSlotLayoutDrag`/`wireSlotLayoutResize`, app.js) -- same feel for
 * an admin repositioning a slot for everyone and a player repositioning
 * their own copy of it. Differences from that version: React pointer
 * handlers instead of raw DOM listeners, a local in-progress preview
 * (`drag`) that only commits to real state on pointer-up rather than
 * writing state on every pointer-move (a save-on-every-frame drag would
 * hammer `saveNow()` far harder than this game's "one user action, one
 * save" convention intends), and no explicit Save button -- releasing
 * the drag *is* the save, same immediacy every other Customize action
 * (equip/unequip/buy) already has.
 */
function GuildHallSlotBox({
  sceneRef, rect, filled, label, rearranging, onOpen, onCommitRect,
}: {
  sceneRef: React.RefObject<HTMLDivElement>;
  rect: Rect;
  filled: ReactNode | null;
  label: string;
  rearranging: boolean;
  onOpen: () => void;
  onCommitRect: (rect: Rect) => void;
}) {
  // `drag` is real React state -- both the in-progress rect (rendered
  // immediately, every pointer-move) and which handle started it (for
  // the dragging/resizing CSS state), so a render always reflects the
  // gesture actually in flight. `dragStartRef` is pure bookkeeping (the
  // pointer's own start position, and the rect it started from) that
  // `move` needs to compute a delta from -- never read for rendering, so
  // a plain ref (not state) is correct here, same "ref for math the DOM
  // doesn't need to see, state for what should render" split the rest of
  // this codebase already follows.
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; rect: Rect } | null>(null);
  const dragStartRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Rect } | null>(null);

  const shown = drag?.rect ?? rect;

  function begin(e: React.PointerEvent, mode: 'move' | 'resize') {
    if (!rearranging) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragStartRef.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
    setDrag({ mode, rect });
  }
  function move(e: React.PointerEvent) {
    const start = dragStartRef.current;
    if (!start || !sceneRef.current) return;
    const sceneRect = sceneRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - start.startX) / sceneRect.width) * 100;
    const dyPct = ((e.clientY - start.startY) / sceneRect.height) * 100;
    const next = start.mode === 'move' ? clampMove(start.start, dxPct, dyPct) : clampResize(start.start, dxPct, dyPct);
    setDrag({ mode: start.mode, rect: next });
  }
  function end() {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const finalRect = drag?.rect ?? rect;
    setDrag(null);
    onCommitRect(finalRect);
  }

  return (
    <div
      className={`craft-slot guildhall-slot ${filled ? 'filled' : ''} ${rearranging ? 'rearranging' : ''} ${drag ? (drag.mode === 'move' ? 'gh-dragging' : 'gh-resizing') : ''}`}
      style={{ left: `${shown.left}%`, top: `${shown.top}%`, width: `${shown.width}%`, height: `${shown.height}%` }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onClick={rearranging ? undefined : onOpen}
      aria-label={label}
      title={label}
    >
      {filled ?? <span className="craft-slot-plus" aria-hidden="true">+</span>}
      {drag && <span className="gh-layout-readout">{formatRect(drag.rect)}</span>}
      {rearranging && (
        <div
          className="gh-layout-resize-handle"
          onPointerDown={(e) => begin(e, 'resize')}
          onPointerMove={move}
          onPointerUp={end}
        />
      )}
    </div>
  );
}

/**
 * Inline "Customize" mode for the Guild Hall tab (see GuildPanel.tsx,
 * which swaps this in for its own normal facility/upgrade content rather
 * than opening a separate window -- the "Inline edit mode on Guild Hall
 * tab" option picked during the original design brainstorm). Full-bleed
 * background art (per the active theme, patch 0207 -- see
 * `GuildHallDecorManager.activeThemeId`) with that theme's own visible
 * slots (up to 30, possibly fewer -- see `slotsForTheme` in
 * guildHallSlots.ts) overlaid as clickable frames (`GuildHallSlotBox`,
 * which also carries this scene's own "Rearrange" drag/resize mode as of
 * patch 0212), reusing `PickerModal`/`Rect` from CraftingStation.tsx the
 * same way EggSelectModal.tsx already does for its own single-slot
 * picker, just scaled up to many slots instead of 1-3.
 */
export function GuildHallCustomizeScene({ onDone }: { onDone: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [openSlotId, setOpenSlotId] = useState<GuildHallSlotId | null>(null);
  // "Rearrange" is its own local mode, separate from Customize mode
  // itself (that toggle lives one level up, in GuildPanel.tsx) -- off by
  // default so the common case (placing decorations) is exactly the
  // click-to-open experience this scene has always had; turning it on
  // swaps every slot from click-to-pick to drag-to-move/resize instead of
  // trying to make one gesture mean both (see GuildHallSlotBox's own
  // comment for why click and drag don't safely coexist on one box).
  // Local, unpersisted UI state -- same as this scene's own openSlotId.
  const [rearranging, setRearranging] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  // Both resolved against the active theme (patch 0207) -- see
  // GuildHallDecorManager.activeThemeId's own comment for how a deleted/
  // unknown theme id degrades safely rather than breaking this scene.
  const activeTheme = GUILD_HALL_THEME_BY_ID[GuildHallDecorManager.activeThemeId(state)];
  // Already resolved through any player drag/resize override (patch
  // 0212 -- see GuildHallDecorManager.slots's own comment), so a moved
  // slot shows up moved here with zero extra plumbing in this file.
  const slots = GuildHallDecorManager.slots(state);
  const openSlot = openSlotId ? GuildHallDecorManager.slot(state, openSlotId) : null;
  const hasCustomLayout = GuildHallDecorManager.hasCustomLayout(state);

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
            {rearranging
              ? 'Drag a frame to move it, drag its brass handle to resize -- both stay inside the hall’s own walls.'
              : 'Click any open frame to place a decoration. Purely cosmetic -- no effect on stats.'}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {rearranging && (
            <button className="btn-ghost" disabled={!hasCustomLayout} onClick={() => engine.resetGuildHallLayout()}>
              Reset Layout
            </button>
          )}
          <button className={rearranging ? 'btn-primary' : 'btn-ghost'} onClick={() => setRearranging((v) => !v)}>
            {rearranging ? 'Done Rearranging' : 'Rearrange'}
          </button>
          <button className="btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>

      <div
        ref={sceneRef}
        className="guildhall-customize-scene"
        style={activeTheme ? { backgroundImage: `url(./guildhall-customize/${activeTheme.background})` } : undefined}
      >
        {slots.map((slot) => {
          const decoration = GuildHallDecorManager.equippedDecoration(state, slot.id);
          return (
            <GuildHallSlotBox
              key={slot.id}
              sceneRef={sceneRef}
              rect={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height } as Rect}
              filled={decoration ? <DecorationArt decoration={decoration} /> : null}
              label={decoration ? decoration.name : `Empty ${slot.label} slot`}
              rearranging={rearranging}
              onOpen={() => setOpenSlotId(slot.id)}
              onCommitRect={(rect) => engine.setGuildHallSlotRect(slot.id, rect)}
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
