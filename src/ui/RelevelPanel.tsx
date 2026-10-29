import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { HeroManager } from '../game/managers/HeroManager';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { formatGold, formatModValue, scaleMods, MOD_LABEL, STAT_LABEL } from '../game/util';
import { EquipmentItem, Modifiers, Stats } from '../game/types';
import { ItemIcon } from './icons';
import { PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';
import { buyWithFx, fxMs, fxSpeed } from './purchaseFx';
import { at } from './resultFx';
import { useSettings } from './useSettings';
import { backgroundSrc } from '../game/settings';
import { TransformHover, strengthColor } from './transformHover';
import { shardLabel } from '../game/data/shards';

/**
 * Patch 0426 -- the Enhance station's second tab: Blacksmith re-leveling.
 *
 * The logic (EquipmentManager.relevel / relevelCost) shipped in patch 0215
 * but nothing in the game ever called it, so outleveled gear could only be
 * replaced, never brought back. This is that missing station, mocked up on
 * the Design canvas ("Enhance — Re-level tab") and signed off:
 *
 *  - (patch 0427) the same two-box art as Refine (it was first built on
 *    gearenhance.jpg, which turned out to be old art): the item on the
 *    left, its replica at the target level on the right (hover it for the
 *    before/after), the item's level above them and a "Stat strength"
 *    bar below them (HeroManager.gearRelevance -- itemLevel / heroLevel,
 *    floored), so it's obvious what re-leveling buys;
 *  - capped at the WEARER's level (direct decision), so only equipped
 *    items can be picked; a stashed item has nothing to aim at;
 *  - the same tap-to-target track as the Refine tab: one pip per level up
 *    to the wearer's, tap one to stop short, and the button pays for the
 *    whole run at once (engine.relevelItem);
 *  - the moment: the item heats, its level ticks up one at a time with
 *    embers while the strength bar climbs, then a quench in steam;
 *    reaching the wearer's level stamps FULL STRENGTH.
 *
 * With motion off the run applies straight away.
 */

/** Patch 0427 -- the same two-box enhance.jpg art the Refine tab uses
 *  (gearenhance.jpg was old art): the left box holds the item, the right
 *  box is its replica at the target level. Same hand-measured rects as
 *  EnhanceStation's LEFT/RIGHT_SLOT_RECT. */
const LEFT_RECT: Rect = { left: 29.7, top: 39.3, width: 14.3, height: 17.5 };
const RIGHT_RECT: Rect = { left: 56.3, top: 39.3, width: 14.3, height: 17.5 };
const RELEVEL_BG = './lore/crafting/enhance.jpg';

function itemLevelOf(item: EquipmentItem): number {
  const def = EQUIPMENT_BY_ID[item.defId];
  return item.rolledItemLevel ?? def?.reqLevel ?? 1;
}

/** The item's own stat/mod lines at a given item level, for its wearer --
 *  the same maths HeroManager.equipmentStats/equipmentMods use. */
function linesAt(item: EquipmentItem, itemLevel: number, heroLevel: number): { key: string; label: string; value: string }[] {
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return [];
  const scale = (1 + item.plus * 0.15) * HeroManager.gearRelevance(itemLevel, heroLevel);
  const out: { key: string; label: string; value: string }[] = [];
  for (const key of Object.keys(STAT_LABEL) as (keyof Stats)[]) {
    const raw = (def.stats?.[key] ?? 0) + (item.enchantStats?.[key] ?? 0) + (item.rolledStats?.[key] ?? 0);
    if (raw) out.push({ key, label: STAT_LABEL[key], value: `+${Math.round(raw * scale)}` });
  }
  const mods = scaleMods(item.customMods ?? def.mods ?? {}, scale) as Partial<Modifiers>;
  for (const key of Object.keys(MOD_LABEL) as (keyof Modifiers)[]) {
    const v = mods[key];
    if (v) out.push({ key, label: MOD_LABEL[key], value: formatModValue(key, Math.round(v * 10) / 10) });
  }
  return out;
}

export function RelevelPanel({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;
  const [uid, setUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  const [aim, setAim] = useState<number | null>(null);
  const [run, setRun] = useState<{ start: number; shown: number; prev: number; to: number; tick: number; glow: boolean; quench: boolean; stamp: string | null } | null>(null);
  const [doneStamp, setDoneStamp] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, fxMs(ms))); };
  const busy = run !== null;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const found = uid ? EquipmentManager.allItems(state).find((e) => e.item.uid === uid) : undefined;
  const item = found?.item;
  const def = item ? EQUIPMENT_BY_ID[item.defId] : undefined;
  const hero = found?.heroId ? state.heroes.find((h) => h.id === found.heroId) : undefined;
  const realLv = item ? itemLevelOf(item) : 0;
  const shownLv = run ? run.shown : realLv;
  const heroLv = hero?.level ?? 0;
  const full = !!hero && shownLv >= heroLv;
  const goal = !item || !hero ? 0 : run ? run.to : Math.min(heroLv, aim && aim > realLv ? aim : heroLv);
  const stopShort = !run && !!aim && aim > realLv && aim < heroLv;
  const bill = item && hero && !run ? EquipmentManager.relevelCost(item, Math.max(0, goal - realLv)) : { gold: 0, scrap: 0, shards: 0 };
  const canAfford = state.gold >= bill.gold && state.scrap >= bill.scrap
    && (state.legendaryShards ?? 0) >= bill.shards;
  const relNow = hero ? HeroManager.gearRelevance(shownLv, heroLv) : 1;
  const relGoal = hero ? HeroManager.gearRelevance(goal, heroLv) : 1;
  const nowLines = item && hero ? linesAt(item, shownLv, heroLv) : [];
  const goalLines = item && hero ? linesAt(item, goal, heroLv) : [];
  const trackStart = run ? run.start : realLv;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .filter((e) => !!e.heroId)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EQUIPMENT_BY_ID[i.defId];
      const h = state.heroes.find((x) => x.id === heroId);
      if (!d || !h) return null;
      const lv = itemLevelOf(i);
      const pct = Math.round(HeroManager.gearRelevance(lv, h.level) * 100);
      return {
        key: i.uid,
        label: `${itemDisplayName(i, d)}${i.plus > 0 ? ` +${i.plus}` : ''}`,
        sublabel: `${h.name} -- Lv ${lv}/${h.level} · ${pct}% strength`,
        icon: <ItemIcon slot={d.slot} icon={d.icon} size={40} />,
        rarity: d.rarity,
        tags: [h.id],
      };
    })
    .filter((o): o is PickerOption => o !== null);
  const tabs = state.heroes.map((h) => ({ id: h.id, label: h.name }));

  const pick = (lv: number) => {
    if (busy || !hero || lv <= realLv) return;
    setAim(lv >= heroLv ? null : lv);
  };

  function handleRelevel(btn: HTMLElement) {
    if (!item || !hero || busy || full) return;
    const from = realLv;
    const to = goal;
    let gained = 0;
    buyWithFx(engine, btn, () => { gained = engine.relevelItem(item.uid, to); });
    setAim(null);
    setDoneStamp(null);
    if (gained <= 0 || fxSpeed() <= 0) return;
    const end = from + gained;
    const reachedFull = end >= hero.level;
    setRun({ start: from, shown: from, prev: from, to: end, tick: 0, glow: false, quench: false, stamp: null });
    later(420, () => setRun((r) => r && { ...r, glow: true }));
    const per = Math.max(70, Math.min(170, 1100 / gained));
    for (let i = 1; i <= gained; i++) {
      later(620 + i * per, () => setRun((r) => r && { ...r, prev: r.shown, shown: r.shown + 1, tick: r.tick + 1 }));
    }
    const t = 620 + gained * per;
    const stamp = reachedFull ? 'Full strength' : `Lv ${end}`;
    later(t + 120, () => setRun((r) => r && { ...r, glow: false, quench: true }));
    later(t + 320, () => setRun((r) => r && { ...r, stamp }));
    later(t + 1900, () => { setRun(null); if (reachedFull) setDoneStamp(stamp); });
  }

  const stamp = run?.stamp ?? doneStamp;

  return (
    <>
      <div className={`craft-scene rlx-scene ${run?.quench && full ? 'rlx-shake' : ''}`} style={{ backgroundImage: `url(${backgroundSrc(RELEVEL_BG, settings.backgroundMood)})` }}>
        {item && hero && (
          <div className="rlx-read" aria-live="polite">
            <span className="rlx-lbl">Lv</span>
            <span className={`rlx-now ${run?.tick ? 'tick' : ''}`} key={run?.tick ?? 'n'}>
              {run?.tick ? <span className="rlx-old">{run.prev}</span> : null}
              <span className="rlx-new">{shownLv}</span>
            </span>
            {!full && shownLv < goal && <><span className="rlx-arrow">{'\u2192'}</span><span className="rlx-goal">{goal}</span></>}
          </div>
        )}
        <SlotBox
          rect={LEFT_RECT}
          disabled={busy}
          filled={def && item ? (
            <span className={`enhance-slot-icon rlx-item ${hero && relNow < 1 && !busy ? 'dim' : ''}`}>
              {run?.glow && <span className="rlx-glow" aria-hidden="true" />}
              <ItemIcon slot={def.slot} icon={def.icon} size={72} />
              <span className="ehx-plus">Lv {shownLv}</span>
              {run?.tick ? (
                <span className="rlx-embers" key={run.tick} aria-hidden="true">
                  {[-18, -6, 8, 20, 0].map((x) => <i key={x} style={{ ['--x' as string]: `${x}px` }} />)}
                </span>
              ) : null}
            </span>
          ) : null}
          label="Choose a worn item to re-level"
          onOpen={() => setOpenPicker(true)}
        />
        {/* The replica: the same item at the target level. Hover it to see
            what it was and what it's turning into. */}
        <div
          className={`craft-slot enhance-preview-slot thx-slot ${def && item && hero && !full ? 'filled' : ''}`}
          tabIndex={def && item && hero && !full ? 0 : -1}
          style={{ left: `${RIGHT_RECT.left}%`, top: `${RIGHT_RECT.top}%`, width: `${RIGHT_RECT.width}%`, height: `${RIGHT_RECT.height}%` }}
        >
          {def && item && hero && !full ? (
            <>
              <span className="enhance-slot-icon ehx-preview">
                <ItemIcon slot={def.slot} icon={def.icon} size={72} />
                <span className="ehx-plus">Lv {goal}</span>
              </span>
              {!busy && (
                <TransformHover
                  title={itemDisplayName(item, def)}
                  fromLabel={`Lv ${shownLv} · ${Math.round(relNow * 100)}%`}
                  toLabel={`Lv ${goal} · ${Math.round(relGoal * 100)}%`}
                  fromColor={strengthColor(relNow)}
                  toColor={strengthColor(relGoal)}
                  rows={nowLines.map((l) => ({ key: l.key, label: l.label, from: l.value, to: goalLines.find((g) => g.key === l.key)?.value ?? l.value }))}
                />
              )}
            </>
          ) : null}
        </div>
        {/* One quick forge beat per level: the arrows chase and a streak
            carries the glow into the replica. */}
        {run?.tick ? (
          <div key={run.tick} className="ehx-beat quick fx-forge" aria-hidden="true">
            {[0, 1, 2].map((i) => <span key={i} className="ehx-chev" style={at(i * 45, { left: `${46.2 + i * 2.4}%` })} />)}
            <span className="ehx-streak" style={at(120)} />
          </div>
        ) : null}
        {run?.quench && (
          <>
            <span className="rlx-steam" style={{ left: `${RIGHT_RECT.left + RIGHT_RECT.width / 2}%` }} aria-hidden="true">
              {[-24, -6, 14, 28].map((x, i) => <i key={x} style={{ ['--x' as string]: `${x}px`, animationDelay: `calc(var(--fx-t) * ${i * 60})` }} />)}
            </span>
            <span className="ehx-flash" aria-hidden="true" />
          </>
        )}
        {item && hero && (
          <div className="rlx-meter">
            <div className="rlx-cap">
              <span>Stat strength</span>
              <span>
                <b className={relNow >= 1 ? 'full' : ''}>{Math.round(relNow * 100)}%</b>
                {!full && shownLv < goal && <> {'→'} <b className="full">{Math.round(relGoal * 100)}%</b></>}
              </span>
            </div>
            <div className="rlx-track">
              {!full && <span className="rlx-ghost" style={{ width: `${relGoal * 100}%` }} />}
              <span className="rlx-fill" style={{ width: `${relNow * 100}%` }} />
            </div>
          </div>
        )}
        {item && !hero && <div className="rlx-empty">In the stash. Equip it on a hero to re-level it to their level.</div>}
        {stamp && <div className="rlx-stamp" key={stamp}><span>{stamp}</span></div>}
      </div>

      {item && def ? (
        <>
          <p className="tiny muted" style={{ margin: '8px 0 2px' }}>
            {itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}
            {hero ? ` -- worn by ${hero.name}, Lv ${hero.level}` : ' -- in the stash'}
          </p>
          <p className="tiny" style={{ margin: '0 0 6px', color: 'var(--muted)' }}>
            {!hero
              ? 'Re-leveling raises an item to the level of the hero wearing it.'
              : full
                ? `Matches ${hero.name}'s level. It's giving everything it has.`
                : `${hero.name} has outgrown this by ${heroLv - shownLv} level${heroLv - shownLv === 1 ? '' : 's'}, so it only gives ${Math.round(relNow * 100)}% of its stats. Re-leveling brings that back.`}
          </p>
          {hero && nowLines.length > 0 && (
            <div className={`ehx-lines ${run?.tick ? 'pulse' : ''}`} key={run?.tick ?? 'l'} style={{ margin: '4px 0 8px' }}>
              {nowLines.map((l) => {
                const next = goalLines.find((g) => g.key === l.key);
                return (
                  <div key={l.key} className="stat-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
                    <span className="tiny muted">{l.label}</span>
                    <span className="tiny">{l.value}</span>
                    {!full && next && next.value !== l.value && <><span className="tiny muted">{'→'}</span><span className="tiny good">{next.value}</span></>}
                  </div>
                );
              })}
            </div>
          )}
          {hero && !full && heroLv > trackStart && (
            <>
              <div className="ehx-ladder" role="group" aria-label="Re-level target">
                {Array.from({ length: heroLv - trackStart }, (_, i) => {
                  const lv = trackStart + i + 1;
                  const done = lv <= shownLv;
                  return (
                    <button
                      key={lv} type="button"
                      className={`ehx-pip ${done ? 'on' : ''} ${!done && lv <= goal ? 'plan' : ''} ${stopShort && lv === goal ? 'tgt' : ''} ${run && lv === run.shown && run.tick ? 'pop' : ''}`}
                      onClick={() => pick(lv)}
                      disabled={busy || done}
                      title={done ? `Lv ${lv} reached` : `Re-level to ${lv}`}
                      aria-label={done ? `Lv ${lv} reached` : `Re-level to ${lv}`}
                    />
                  );
                })}
              </div>
              <div className="rlx-ladn" aria-hidden="true">
                <span>Lv {trackStart}</span>
                {stopShort && <b>{'→'} Lv {goal}</b>}
                <span>Lv {heroLv}</span>
              </div>
              {!busy && (
                <p className="tiny muted" style={{ margin: '0 0 8px' }}>
                  {stopShort ? `Stopping short at Lv ${goal}. Tap the end for full strength.` : `Tap the track to stop short of Lv ${heroLv}.`}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <p className="tiny muted" style={{ margin: '8px 0' }}>Choose a worn item. Gear gives less once its wearer outlevels it; re-leveling brings it back up to their level.</p>
      )}

      <button
        className="btn-purple"
        disabled={!item || !hero || full || busy || !canAfford}
        onClick={(e) => handleRelevel(e.currentTarget)}
      >
        {!item ? 'Re-level' : busy ? `Re-leveling… Lv ${shownLv}` : !hero ? 'Equip it first' : full ? 'Already full strength' : (
          <>Re-level to {goal} {'·'} <span className="gold-text">{'◆'} {formatGold(bill.gold)}</span> {bill.scrap > 0 && <> + {formatGold(bill.scrap)} Scrap</>}{bill.shards > 0 && <> + {shardLabel(bill.shards)}</>}</>
        )}
      </button>

      {openPicker && (
        <PickerModal
          title="Choose a worn item"
          options={options}
          tabs={tabs}
          onPick={(key) => { setUid(key); setAim(null); setDoneStamp(null); }}
          onClose={() => setOpenPicker(false)}
        />
      )}
    </>
  );
}
