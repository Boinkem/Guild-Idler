import { useEffect, useRef, useState, CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { ModifierManager } from '../game/managers/ModifierManager';
import { scrapIconFor } from '../game/data/elements';
import { ItemIcon } from './icons';
import { ItemPreviewModal, PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';
import { useCountUp } from './useCountUp';

/** Hand-measured against scrap.png's own 1402x1122 canvas, same convention
 *  every other station's SLOT_RECT already uses. */
const SLOT_RECT: Rect = { left: 41.6, top: 39.7, width: 16.8, height: 20.6 };

const BURST_PARTICLES = [
  { dx: -18, dy: -70, rot: -12, delay: 0 },
  { dx: 10, dy: -84, rot: 10, delay: 40 },
  { dx: 32, dy: -58, rot: 18, delay: 90 },
];

/** How long the icon takes to fly from the item slot to the corner Scrap
 *  counter -- also when the counter's own arrival flash fires, so the two
 *  feel connected rather than the flash firing on a timer unrelated to
 *  when the icon actually gets there. */
const FLY_MS = 650;
const FLASH_MS = 550;

/**
 * Breaks an owned item down into Scrap -- moved here from a per-item
 * button buried in the Vendors "Sell from the stash" list, now its own
 * dedicated station on the Blacksmith's page (next to Enhance and
 * Infuse), matching the pattern every other single-choice gear action on
 * this page already uses. Plain sale (for gold) stays on the stash list;
 * this is specifically the "break it down for materials instead" path.
 */
export function ScrapStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;

  const [targetUid, setTargetUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  // Shown once, right after a pick -- direct feedback that going straight
  // from "picked an item" to the Scrap button being live made it easy to
  // commit an irreversible action against the wrong piece of gear without
  // really looking at it first. Same shape as EnhanceStation's own
  // previewUid -- see ItemPreviewModal's own doc comment
  // (CraftingStation.tsx). Scrap is destructive and permanent, arguably
  // the station this step matters most for.
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const [burst, setBurst] = useState<{ key: number; gained: number; icon: string } | null>(null);
  const [flight, setFlight] = useState<{ key: number; dx: number; dy: number; icon: string } | null>(null);
  const [counterFlash, setCounterFlash] = useState(false);

  // Counts up toward the new Scrap total rather than snapping -- state.scrap
  // is already updated by the time this renders (engine.scrapItem runs
  // synchronously in handleScrap below), so this starts climbing the same
  // moment the flight particle starts its own travel.
  const displayScrap = useCountUp(state.scrap);

  // originRef anchors the flight's real starting point (the item slot's
  // center) for measurement only -- always rendered, not just while
  // bursting, so it's already mounted and measurable the instant a scrap
  // actually happens. counterRef is the actual on-screen Scrap counter in
  // the header. Both are measured live via getBoundingClientRect rather
  // than a hardcoded dx/dy (like BURST_PARTICLES' small local pop still
  // uses) because the real on-screen distance between them depends on
  // this modal's rendered size, which isn't fixed the way SLOT_RECT's own
  // percentage-based position within the scene is.
  const originRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  // Stash-only lookup -- matches ShopManager.scrapItem's own scope exactly
  // (it already refuses an equipped uid with "That item is equipped or
  // missing."). Previously sourced from EquipmentManager.allItems(state),
  // which also surfaces every hero's *equipped* gear -- so the picker let
  // you select something Scrap could never actually act on, and hitting
  // the button on it silently failed. No allItems/heroId lookup needed
  // anymore, since every stash entry is unowned by definition.
  const item = targetUid ? state.stash.find((i) => i.uid === targetUid) : undefined;
  const def = item ? EquipmentManager.def(item) : undefined;
  const scrapBonus = ModifierManager.global(state).scrapBonus ?? 0;
  const value = item ? EquipmentManager.scrapValue(item, scrapBonus) : 0;

  const previewItem = previewUid ? state.stash.find((i) => i.uid === previewUid) : undefined;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;
  const previewValue = previewItem ? EquipmentManager.scrapValue(previewItem, scrapBonus) : 0;

  // Locked (Vaulted) items stay in the list rather than being hidden --
  // per the Vault design, a destructive picker should show what's
  // protected, not quietly omit it -- but render disabled, matching the
  // greyed-out treatment every other unselectable picker row already
  // uses (see PickerModal). ShopManager.scrapItem itself already refuses
  // a locked uid regardless, so this is UI-layer only, not the actual
  // guard.
  const options: PickerOption[] = state.stash
    .map((i): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      return {
        key: i.uid,
        label: d.name,
        sublabel: i.locked ? '\uD83D\uDD12 Locked in Vault' : `${EquipmentManager.scrapValue(i, scrapBonus)} Scrap`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
        disabled: i.locked,
        rarity: d.rarity,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleScrap() {
    if (!item) return;
    const gained = EquipmentManager.scrapValue(item, scrapBonus);
    engine.scrapItem(item.uid);
    const now = Date.now();
    setBurst({ key: now, gained, icon: scrapIconFor(now) });
    if (originRef.current && counterRef.current) {
      const originRect = originRef.current.getBoundingClientRect();
      const targetRect = counterRef.current.getBoundingClientRect();
      const dx = (targetRect.left + targetRect.width / 2) - (originRect.left + originRect.width / 2);
      const dy = (targetRect.top + targetRect.height / 2) - (originRect.top + originRect.height / 2);
      setFlight({ key: now, dx, dy, icon: scrapIconFor(now + 1) });
    }
    setTargetUid('');
  }

  // Neither `burst` nor `flight` was ever reset back to null after its own
  // animation finished -- confirmed as a real, pre-existing bug (not
  // unique to Harvest's own copy of this pattern, which inherited it from
  // here): the CSS animation correctly finishes and holds at opacity 0
  // via `forwards`, but nothing ever cleared the state, so the element
  // just stayed mounted (invisible, but present) indefinitely instead of
  // actually being removed. Fixed the same way HarvestPanel.tsx's own
  // catch flash now is: an explicit timeout, matched to each animation's
  // own duration, clears it back to null once it's actually done.
  useEffect(() => {
    if (!burst) return undefined;
    const id = window.setTimeout(() => setBurst(null), 750);
    return () => window.clearTimeout(id);
  }, [burst]);

  // Flashes the counter once the flight particle actually lands, timed to
  // FLY_MS rather than firing immediately -- so the flash reads as "it
  // arrived" rather than going off before the icon visibly gets there.
  useEffect(() => {
    if (!flight) return undefined;
    const arrive = window.setTimeout(() => setCounterFlash(true), FLY_MS);
    const clear = window.setTimeout(() => setCounterFlash(false), FLY_MS + FLASH_MS);
    const clearFlight = window.setTimeout(() => setFlight(null), FLY_MS);
    return () => { window.clearTimeout(arrive); window.clearTimeout(clear); window.clearTimeout(clearFlight); };
  }, [flight]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Scrap</span>
          <span ref={counterRef} className={`tiny counter-flash-target ${counterFlash ? 'flash' : ''}`}>
            ⚙ {displayScrap}
          </span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>

        <div style={{ position: 'relative' }}>
          <div className="craft-scene" style={{ backgroundImage: 'url(./lore/crafting/scrap.png)' }}>
            <SlotBox
              rect={SLOT_RECT}
              filled={def && item ? <ItemIcon slot={def.slot} icon={def.icon} size={88} /> : null}
              label="Choose an item to scrap"
              onOpen={() => setOpenPicker(true)}
            />
          </div>

          {/* Invisible, always mounted (not just while bursting) so it's
              already measurable the instant a scrap happens -- see
              handleScrap's getBoundingClientRect call. Marks the flight's
              real starting point: the item slot's own center. */}
          <div
            ref={originRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${SLOT_RECT.left + SLOT_RECT.width / 2}%`,
              top: `${SLOT_RECT.top + SLOT_RECT.height / 2}%`,
              width: 1, height: 1,
            }}
          />

          {/* Pops from the item's own slot and fades away -- same
              collect-burst/collect-particle convention Harvest catches
              and quest/raid reward bursts already use, just anchored to
              this station's fixed slot position instead of a moving
              on-screen click point. Sits as a sibling of .craft-scene
              rather than nested inside it, so its particles flying
              upward aren't clipped by that element's own
              `overflow: hidden` (needed there to keep the background art
              cleanly cropped to the frame). */}
          {burst && (
            <div
              className="collect-burst"
              aria-hidden="true"
              style={{
                left: `${SLOT_RECT.left + SLOT_RECT.width / 2}%`,
                top: `${SLOT_RECT.top + SLOT_RECT.height / 2}%`,
                bottom: 'auto',
              }}
              key={burst.key}
            >
              <span
                className="collect-particle scrap"
                style={{ '--dx': `${BURST_PARTICLES[0].dx}px`, '--dy': `${BURST_PARTICLES[0].dy}px`, '--rot': `${BURST_PARTICLES[0].rot}deg` } as CSSProperties}
              >
                +{burst.gained} Scrap
              </span>
              {BURST_PARTICLES.slice(1).map((p, i) => (
                <span
                  key={i}
                  className="collect-particle scrap"
                  style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms`, width: 20, height: 20 } as CSSProperties}
                >
                  <img src={`./item-icons/${burst.icon}`} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                </span>
              ))}
            </div>
          )}

          {/* The actual "flies up and over to the corner counter" particle
              -- separate from the local burst above, which stays as
              in-place flavor. This one travels the real measured distance
              to counterRef (see handleScrap), landing exactly on the
              Scrap counter regardless of modal size, and its arrival is
              what triggers the counter's own flash (see the useEffect
              above, timed to FLY_MS). */}
          {flight && (
            <span
              key={flight.key}
              className="fly-particle"
              aria-hidden="true"
              style={{
                left: `${SLOT_RECT.left + SLOT_RECT.width / 2}%`,
                top: `${SLOT_RECT.top + SLOT_RECT.height / 2}%`,
                '--fly-dx': `${flight.dx}px`,
                '--fly-dy': `${flight.dy}px`,
                animationDuration: `${FLY_MS}ms`,
              } as CSSProperties}
            >
              <img src={`./item-icons/${flight.icon}`} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            </span>
          )}
        </div>

        {item && def ? (
          <p className="tiny muted" style={{ margin: '8px 0' }}>
            {def.name}{item.plus > 0 ? ` +${item.plus}` : ''} &mdash; breaks down for {value} Scrap. This cannot be undone.
          </p>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item to see its scrap value.</p>
        )}

        <button className="btn-purple" disabled={!item} onClick={handleScrap}>
          Scrap
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
              Breaks down for {previewValue} Scrap. This cannot be undone.
            </p>
          )}
        />
      )}
    </div>
  );
}
