import { useState, CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { scrapIconFor } from '../game/data/elements';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';

/** Hand-measured against scrap.png's own 1402x1122 canvas, same convention
 *  every other station's SLOT_RECT already uses. */
const SLOT_RECT: Rect = { left: 41.6, top: 39.7, width: 16.8, height: 20.6 };

const BURST_PARTICLES = [
  { dx: -18, dy: -70, rot: -12, delay: 0 },
  { dx: 10, dy: -84, rot: 10, delay: 40 },
  { dx: 32, dy: -58, rot: 18, delay: 90 },
];

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
  const [burst, setBurst] = useState<{ key: number; gained: number; icon: string } | null>(null);

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;
  const value = item ? EquipmentManager.scrapValue(item) : 0;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      return {
        key: i.uid,
        label: d.name,
        sublabel: `${owner} -- ${EquipmentManager.scrapValue(i)} Scrap`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
      };
    })
    .filter((o): o is PickerOption => o !== null);

  function handleScrap() {
    if (!item) return;
    const gained = EquipmentManager.scrapValue(item);
    engine.scrapItem(item.uid);
    const now = Date.now();
    setBurst({ key: now, gained, icon: scrapIconFor(now) });
    setTargetUid('');
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Scrap</span>
          <button onClick={onClose}>Close</button>
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
          onPick={(key) => setTargetUid(key)}
          onClose={() => setOpenPicker(false)}
        />
      )}
    </div>
  );
}
