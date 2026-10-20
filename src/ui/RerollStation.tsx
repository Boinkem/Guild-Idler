import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { CraftingManager } from '../game/managers/CraftingManager';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { isProceduralTemplate } from '../game/data/proceduralLoot';
import { formatGold, RARITY_COLOR, STAT_LABEL } from '../game/util';
import { Stats } from '../game/types';
import { ItemIcon } from './icons';
import { PickerModal } from './CraftingStation';
import type { PickerOption } from './CraftingStation';
import { buyWithFx, fxMs, fxSpeed } from './purchaseFx';

/**
 * Patch 0426 -- the Enchanter's reroll, finally reachable. The logic
 * (CraftingManager.reroll / rerollCost) shipped in patch 0215 with no
 * caller, same oversight as Blacksmith re-leveling.
 *
 * Re-runs the procedural roll on a random-stat item's `rolledStats` at
 * the item's current level (so re-level first, then reroll). Hand-
 * authored gear (fixed stats, set pieces, named legendaries) isn't
 * offered. Enchant/Infusion stats are never touched.
 *
 * The moment: the rune circle around the item spins up, every stat line
 * scrambles, then they settle one by one with a green/red change against
 * the old roll, and the roll total gives a verdict. The roll replaces the
 * old one -- there's no undo, and the station says so before you pay.
 * With motion off the new numbers simply appear (the deltas still show).
 */
const STAT_KEYS = Object.keys(STAT_LABEL) as (keyof Stats)[];
const SCRAMBLE_MS = 700;
const SETTLE_GAP = 180;

type Roll = Partial<Stats>;
const total = (r: Roll) => STAT_KEYS.reduce((s, k) => s + (r[k] ?? 0), 0);

export function RerollStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [uid, setUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  // The roll being replayed: the old numbers, and which lines have settled.
  const [fx, setFx] = useState<{ key: number; old: Roll; settled: number; scramble: Record<string, number>; done: boolean } | null>(null);
  const [last, setLast] = useState<{ old: Roll } | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); }); timers.current = []; };
  useEffect(() => clear, []);
  const busy = !!fx && !fx.done;

  const found = uid ? EquipmentManager.allItems(state).find((e) => e.item.uid === uid) : undefined;
  const item = found?.item;
  const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
  const wearer = found?.heroId ? state.heroes.find((h) => h.id === found.heroId) : undefined;
  const cost = item ? CraftingManager.rerollCost(state, item) : null;
  const herbs = state.materials.herbs ?? 0;
  const canAfford = !!cost && state.gold >= cost.gold && herbs >= cost.herbs;
  const roll: Roll = item?.rolledStats ?? {};
  const compareTo = fx?.old ?? last?.old;
  const keys = STAT_KEYS.filter((k) => (roll[k] ?? 0) !== 0 || (compareTo?.[k] ?? 0) !== 0);

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EQUIPMENT_BY_ID[i.defId];
      if (!d || !isProceduralTemplate(d)) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      return {
        key: i.uid,
        label: `${itemDisplayName(i, d)}${i.plus > 0 ? ` +${i.plus}` : ''}`,
        sublabel: `${owner} -- Lv ${i.rolledItemLevel ?? d.reqLevel} · roll total ${total(i.rolledStats ?? {})}`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
        rarity: d.rarity,
        tags: heroId ? ['equipped', heroId] : ['unequipped'],
      };
    })
    .filter((o): o is PickerOption => o !== null);
  const itemTabs = [
    { id: 'equipped', label: 'Equipped' },
    { id: 'unequipped', label: 'Unequipped' },
    ...state.heroes.map((h) => ({ id: h.id, label: h.name })),
  ];

  function handleReroll(btn: HTMLElement) {
    if (!item || busy) return;
    const old: Roll = { ...(item.rolledStats ?? {}) };
    let ok = false;
    buyWithFx(engine, btn, () => { ok = engine.rerollItem(item.uid); });
    if (!ok) return;
    clear();
    setLast({ old });
    if (fxSpeed() <= 0) { setFx(null); return; }
    const lines = STAT_KEYS.filter((k) => (item.rolledStats?.[k] ?? 0) !== 0 || (old[k] ?? 0) !== 0);
    const top = Math.max(4, ...lines.map((k) => Math.max(item.rolledStats?.[k] ?? 0, old[k] ?? 0)));
    const jumble = () => Object.fromEntries(lines.map((k) => [k, 1 + Math.floor(Math.random() * top * 1.4)]));
    setFx({ key: Date.now(), old, settled: 0, scramble: jumble(), done: false });
    const iv = window.setInterval(() => setFx((f) => f && { ...f, scramble: jumble() }), Math.max(40, fxMs(60)));
    timers.current.push(iv);
    lines.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setFx((f) => f && { ...f, settled: i + 1 }), fxMs(SCRAMBLE_MS + i * SETTLE_GAP)));
    });
    timers.current.push(window.setTimeout(() => {
      window.clearInterval(iv);
      setFx((f) => f && { ...f, settled: lines.length, done: true });
    }, fxMs(SCRAMBLE_MS + lines.length * SETTLE_GAP)));
  }

  const oldTotal = compareTo ? total(compareTo) : null;
  const newTotal = total(roll);
  const showVerdict = !!compareTo && (!fx || fx.done);
  const verdict = oldTotal === null ? '' : newTotal > oldTotal ? 'Better roll' : newTotal < oldTotal ? 'Worse roll' : 'Same total';

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal rrx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Reroll stats</span>
          <button className="btn-primary" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Re-roll a random-stat item&apos;s bonuses for a fresh spread, at the item&apos;s current level. Re-level it at the Blacksmith first to get the most out of it. Enchanting and Infusion stay as they are.
        </p>

        <button type="button" className={`rrx-stage ${fx && !fx.done ? 'spin' : ''}`} onClick={() => setOpenPicker(true)} disabled={busy} aria-label="Choose an item to reroll">
          <svg className="rrx-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="92" strokeWidth="1.4" strokeDasharray="3 8" />
            <circle cx="100" cy="100" r="78" strokeWidth="1" strokeDasharray="22 7 3 7" />
            <circle cx="100" cy="100" r="66" strokeWidth="1.6" strokeDasharray="1 10" />
          </svg>
          {fx && <span className="rrx-burst" key={fx.key} aria-hidden="true" />}
          {def ? <ItemIcon slot={def.slot} icon={def.icon} size={64} /> : <span className="craft-slot-plus" aria-hidden="true">+</span>}
        </button>

        {item && def ? (
          <>
            <div style={{ textAlign: 'center', margin: '6px 0 10px' }}>
              <div className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
              <div className="tiny muted">Lv {item.rolledItemLevel ?? def.reqLevel} · {wearer ? `worn by ${wearer.name}` : 'in the stash'}</div>
            </div>
            <div className="rrx-lines">
              {keys.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>No rolled stats yet.</p>}
              {keys.map((k, i) => {
                const settled = !fx || fx.done || i < fx.settled;
                const value = settled ? (roll[k] ?? 0) : fx!.scramble[k] ?? 0;
                const before = compareTo?.[k] ?? 0;
                const delta = (roll[k] ?? 0) - before;
                return (
                  <div key={k} className={`rrx-line ${settled ? 'settled' : 'rolling'}`}>
                    <span className="tiny muted">{STAT_LABEL[k]}</span>
                    <span className="rrx-val" key={settled ? 's' : 'r'}>+{value}</span>
                    {compareTo && settled && delta !== 0 && (
                      <span className={`rrx-delta ${delta > 0 ? 'up' : 'dn'}`}>{delta > 0 ? '+' : ''}{delta}</span>
                    )}
                  </div>
                );
              })}
              {keys.length > 0 && (
                <div className="rrx-line rrx-total">
                  <span className="tiny muted">Roll total</span>
                  <span className="rrx-val">{showVerdict && oldTotal !== null ? <>{oldTotal} {'→'} {newTotal}</> : newTotal}</span>
                  {showVerdict && <span className={`rrx-verdict ${newTotal > (oldTotal ?? 0) ? 'up' : newTotal < (oldTotal ?? 0) ? 'dn' : ''}`} key={fx?.key ?? 'v'}>{verdict}</span>}
                </div>
              )}
            </div>
            <p className="tiny" style={{ color: 'var(--blood)', margin: '8px 0' }}>The new roll replaces the current one. There&apos;s no undo.</p>
          </>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0', textAlign: 'center' }}>Choose a random-stat item. Set pieces and named gear have fixed stats.</p>
        )}

        <button className="btn-purple" disabled={!item || !cost || busy || !canAfford} onClick={(e) => handleReroll(e.currentTarget)}>
          {!item ? 'Reroll' : busy ? 'Rerolling…' : !cost ? 'Fixed stats' : (
            <>Reroll {'·'} <span className="gold-text">{'◆'} {formatGold(cost.gold)}</span> + {cost.herbs} Herbs <span className="tiny muted">({formatGold(herbs)} held)</span></>
          )}
        </button>
      </div>

      {openPicker && (
        <PickerModal
          title="Choose an item to reroll"
          options={options}
          tabs={itemTabs}
          onPick={(key) => { setUid(key); setLast(null); setFx(null); clear(); }}
          onClose={() => setOpenPicker(false)}
        />
      )}
    </div>
  );
}
