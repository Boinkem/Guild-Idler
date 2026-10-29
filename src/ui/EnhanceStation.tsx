import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { EquipmentManager, MAX_PLUS } from '../game/managers/EquipmentManager';
import { backgroundSrc } from '../game/settings';
import { formatGold, formatModValue, scaleMods, MOD_LABEL, STAT_LABEL, RARITY_COLOR } from '../game/util';
import { Modifiers, Stats } from '../game/types';
import { ItemIcon } from './icons';
import { ItemPreviewModal, PickerModal, SlotBox } from './CraftingStation';
import type { PickerOption, Rect } from './CraftingStation';
import { buyWithFx, fxMs, fxSpeed, SealStamp } from './purchaseFx';
import { at } from './resultFx';
import { RelevelPanel } from './RelevelPanel';
import { TransformHover } from './transformHover';
import type { TransformRow } from './transformHover';
import { shardLabel } from '../game/data/shards';

/**
 * Two slots now (patch 0360, direct design request, with commissioned
 * art to match) -- left is "what you have," right is "what one more
 * Enhance gets you," hand-measured against the new enhance.jpg/
 * bright/enhance.jpg's own 1402x1122 canvas the same way the old single
 * SLOT_RECT was. Both slots sit at the same vertical band the art's own
 * painted chevron (>>>) points between.
 */
const LEFT_SLOT_RECT: Rect = { left: 29.7, top: 39.3, width: 14.3, height: 17.5 };
const RIGHT_SLOT_RECT: Rect = { left: 56.3, top: 39.3, width: 14.3, height: 17.5 };

const ENHANCE_BG = './lore/crafting/enhance.jpg';

/** Same flat-multiplier-only scaling `scaleMods` (util.ts) already does
 *  for Modifiers, mirrored for Stats -- both are plain `Record<string,
 *  number>` shapes under the hood, but kept as two small functions
 *  rather than one generic to match scaleMods' own existing signature
 *  instead of touching it. Preview-only: this is deliberately NOT the
 *  real `(1 + plus*0.15) * gearRelevance(...)` formula HeroManager uses
 *  for actual combat power (see HeroManager.equipmentStats/equipmentMods)
 *  -- gearRelevance needs a specific wearer's level, which an unequipped
 *  stash item (or one being previewed before a hero's chosen at all)
 *  doesn't have. This shows the item's own contribution at a given plus
 *  level in isolation, same "the item's own numbers, not a specific
 *  hero's final total" scope every other item-preview modal in the game
 *  (ItemPreviewModal, shop cards) already sticks to.
 */
function scaleStats(stats: Partial<Stats> | undefined, factor: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  if (!stats) return out;
  for (const key of Object.keys(stats) as (keyof Stats)[]) {
    out[key] = (stats[key] ?? 0) * factor;
  }
  return out;
}

/**
 * One "Label current -> next" line, next value in `.good` (green) --
 * direct request: "green text showing the new increased stats." Shared
 * between the Modifiers and Stats halves of the preview below; `format`
 * is the one thing that differs between them (formatModValue knows which
 * Modifiers keys are %, which are flat; a Stat is always just a flat
 * rounded number).
 */
function DeltaLine({ label, current, next, format }: { label: string; current: number; next: number; format: (n: number) => string }) {
  if (current === 0 && next === 0) return null;
  return (
    <div className="stat-row" style={{ justifyContent: 'flex-start', gap: 6 }}>
      <span className="tiny muted">{label}</span>
      <span className="tiny">{format(current)}</span>
      <span className="tiny muted">{'\u2192'}</span>
      <span className="tiny good">{format(next)}</span>
    </div>
  );
}

/**
 * The "Refine" (+N) mechanic, moved here from a per-item button buried in
 * each equipped item's expanded card on the Inventory tab -- now a
 * dedicated click-select-confirm station on the Blacksmith's own page,
 * matching Crafting's visual pattern with commissioned art (a single slot
 * here, since there's only one real choice: which item).
 *
 * Correction from an earlier pass: this was originally wired to plain
 * durability *repair* (`engine.repair`, restoring current durability back
 * up to whatever the existing cap already was), based on a literal read
 * of "enhance its durability." What was actually meant was the item's
 * `plus` upgrade -- `EquipmentManager.upgrade`/`engine.upgradeItem` --
 * which *raises* the durability cap itself (`maxDurability` scales with
 * `item.plus`) and tops the item off to that new, higher cap as part of
 * the same action. Plain repair (restore to whatever the cap already is,
 * no cap increase) stays as a quick action back on the Inventory tab
 * instead -- it was never the button being asked to move.
 *
 * Patch 0360, direct design request, with new two-slot art to match:
 * left slot shows the item as it is now, right slot previews what one
 * more Enhance gets you (icon plus a green stat-delta readout), and the
 * Enhance button flashes both icons before settling into the new
 * "current / next" pair -- no need to reselect the item to keep going,
 * the left slot's own item.plus already ticks up live off the same
 * engine state this component already reads every render.
 *
 * Patch 0425 -- a forge beat per +level (hammer, arrows, streak, roll;
 * +5 and +10 are milestones), and a refinement bar under the stat lines:
 * tap a pip to aim for that +level and the button pays for the whole
 * run at once (engine.upgradeItemTo), replayed step by step.
 */
export function EnhanceStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const { settings } = useSettings();
  const state = engine.state;
  const workshop = state.guild.workshop ?? 0;

  const [targetUid, setTargetUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  // Shown once, right after a pick -- direct feedback that going straight
  // from "picked an item" to "the Enhance button is now live" made it easy
  // to commit gold against the wrong piece of gear without really looking
  // at it. See ItemPreviewModal's own doc comment (CraftingStation.tsx).
  const [previewUid, setPreviewUid] = useState<string | null>(null);

  // Patch 0425 -- the +level to aim for (null = just the next one), set
  // by tapping a pip on the refinement bar.
  const [aim, setAim] = useState<number | null>(null);
  // Patch 0425 -- the forge replay. The engine applies the whole run at
  // once; `run` holds what the scene is showing while it plays: the +level
  // currently displayed, where the run ends, and the step being struck.
  const [run, setRun] = useState<{ shown: number; to: number; step: { key: number; quick: boolean; milestone: boolean } | null; mile: string | null; rolled: number } | null>(null);
  const [justMaxed, setJustMaxed] = useState(false);
  // Patch 0426 -- second tab: Re-level (RelevelPanel.tsx).
  const [mode, setMode] = useState<'refine' | 'relevel'>('refine');
  const [relevelBusy, setRelevelBusy] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, fxMs(ms))); };

  const found = targetUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === targetUid) : undefined;
  const item = found?.item;
  const def = item ? EquipmentManager.def(item) : undefined;
  const busy = run !== null || relevelBusy;
  const basePlus = run ? run.shown : (item?.plus ?? 0);
  const maxed = item ? basePlus >= MAX_PLUS : false;
  const goal = !item ? 0 : run ? run.to : Math.min(MAX_PLUS, aim && aim > item.plus ? aim : item.plus + 1);
  const multi = !!item && !run && goal > item.plus + 1;
  const bill = item && !run ? EquipmentManager.upgradeCostTo(item, goal, workshop) : { gold: 0, scrap: 0, shards: 0 };
  const canAfford = state.gold >= bill.gold && state.scrap >= bill.scrap
    && (state.legendaryShards ?? 0) >= bill.shards;
  const durAt = (p: number) => (def ? Math.floor(def.maxDurability * (1 + p * 0.1)) : 0);

  // The item's own base mods/stats, unscaled -- see scaleStats' own
  // comment above for why this preview intentionally stops at the
  // plus-multiplier and doesn't attempt gearRelevance.
  const baseMods: Partial<Modifiers> = item?.customMods ?? def?.mods ?? {};
  const baseStats: Partial<Stats> = item?.rolledStats ?? def?.stats ?? {};
  const currentScale = 1 + basePlus * 0.15;
  const nextScale = 1 + goal * 0.15;
  const currentMods = scaleMods(baseMods, currentScale);
  const nextMods = scaleMods(baseMods, nextScale);
  const currentStats = scaleStats(baseStats, currentScale);
  const nextStats = scaleStats(baseStats, nextScale);
  // Patch 0427 -- the right box's hover card: each line, now -> after.
  const hoverRows: TransformRow[] = !item ? [] : [
    { key: 'dur', label: 'Durability cap', from: `${durAt(basePlus)}`, to: `${durAt(goal)}` },
    ...(Object.keys(MOD_LABEL) as (keyof Modifiers)[])
      .filter((k) => (currentMods[k] ?? 0) !== 0 || (nextMods[k] ?? 0) !== 0)
      .map((k) => ({ key: k, label: MOD_LABEL[k], from: formatModValue(k, Math.round((currentMods[k] ?? 0) * 10) / 10), to: formatModValue(k, Math.round((nextMods[k] ?? 0) * 10) / 10) })),
    ...(Object.keys(STAT_LABEL) as (keyof Stats)[])
      .filter((k) => (currentStats[k] ?? 0) !== 0 || (nextStats[k] ?? 0) !== 0)
      .map((k) => ({ key: k, label: STAT_LABEL[k], from: `+${Math.round(currentStats[k] ?? 0)}`, to: `+${Math.round(nextStats[k] ?? 0)}` })),
  ];
  const crosses = item ? [5, 10].filter((m) => m > basePlus && m <= goal) : [];

  const previewFound = previewUid ? EquipmentManager.allItems(state).find((e) => e.item.uid === previewUid) : undefined;
  const previewItem = previewFound?.item;
  const previewDef = previewItem ? EquipmentManager.def(previewItem) : undefined;
  const previewMaxed = previewItem ? previewItem.plus >= MAX_PLUS : false;
  const previewMaxDurability = previewItem ? EquipmentManager.maxDurability(previewItem) : 0;
  const previewNextMaxDurability = previewDef
    ? Math.floor(previewDef.maxDurability * (1 + ((previewItem?.plus ?? 0) + 1) * 0.1)) : 0;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = EquipmentManager.def(i);
      if (!d) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      const atMax = i.plus >= MAX_PLUS;
      return {
        key: i.uid,
        label: `${d.name}${i.plus > 0 ? ` +${i.plus}` : ''}`,
        sublabel: `${owner} -- ${atMax ? 'max refinement' : `+${i.plus}/${MAX_PLUS}`}`,
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

  const pickTarget = (lv: number) => {
    if (!item || busy || lv <= item.plus) return;
    setAim(lv === item.plus + 1 ? null : lv);
  };

  // One refinement step of the replay. The first step of a run plays in
  // full (two strikes); the rest are quick (one strike, fast arrows).
  // Returns the 1x time the step lands, relative to the run's start.
  const scheduleStep = (p: number, start: number, quick: boolean) => {
    const np = p + 1;
    const milestone = np === 5 || np === MAX_PLUS;
    const land = start + (quick ? 430 : 1140);
    later(start, () => setRun((r) => r && { ...r, step: { key: Date.now() + p, quick, milestone } }));
    later(land, () => setRun((r) => r && {
      ...r, shown: np, rolled: Date.now(),
      mile: milestone ? (np === MAX_PLUS ? `+${MAX_PLUS} · Fully refined` : `+${np} milestone`) : r.mile,
    }));
    return land;
  };

  function handleEnhance(btn: HTMLElement) {
    if (!item || busy || maxed) return;
    const from = item.plus;
    const to = goal;
    let gained = 0;
    buyWithFx(engine, btn, () => { gained = engine.upgradeItemTo(item.uid, to); });
    setAim(null);
    if (gained <= 0 || fxSpeed() <= 0) return;
    const end = from + gained;
    setRun({ shown: from, to: end, step: null, mile: null, rolled: 0 });
    let start = 420;
    let land = 0;
    for (let p = from; p < end; p++) {
      land = scheduleStep(p, start, p > from);
      start = land + 330;
    }
    const sawMile = [5, MAX_PLUS].some((m) => m > from && m <= end);
    later(land + 330, () => setRun((r) => r && { ...r, step: null }));
    if (end >= MAX_PLUS) later(land + 200, () => setJustMaxed(true));
    later(land + (sawMile ? 1700 : 500), () => setRun(null));
  }

  const step = run?.step;

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal craft-station-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Enhance</span>
          <button className="btn-primary" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <div className="ehx-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'refine'} className={`ehx-tab ${mode === 'refine' ? 'on' : ''}`} disabled={busy} onClick={() => setMode('refine')}>Refine +N</button>
          <button type="button" role="tab" aria-selected={mode === 'relevel'} className={`ehx-tab ${mode === 'relevel' ? 'on' : ''}`} disabled={busy} onClick={() => setMode('relevel')}>Re-level</button>
        </div>

        {mode === 'relevel' ? <RelevelPanel onBusyChange={setRelevelBusy} /> : (<>

        <div className="craft-scene ehx-scene" style={{ backgroundImage: `url(${backgroundSrc(ENHANCE_BG, settings.backgroundMood)})` }}>
          <SlotBox
            rect={LEFT_SLOT_RECT}
            disabled={busy}
            filled={def && item ? (
              <span className="enhance-slot-icon ehx-item">
                <ItemIcon slot={def.slot} icon={def.icon} size={72} />
                <span key={run?.rolled || 'p'} className={`ehx-plus ${run?.rolled ? 'ehx-roll' : ''}`}>+{basePlus}</span>
              </span>
            ) : null}
            label="Choose an item to enhance"
            onOpen={() => setOpenPicker(true)}
          />
          {/* Right slot is a preview only, not a picker of its own -- same
              rect shape as SlotBox but with no click handler, since
              there's nothing to choose here, just something to look at. */}
          <div
            className={`craft-slot enhance-preview-slot thx-slot ${def && item && !maxed ? 'filled' : ''}`}
            tabIndex={def && item && !maxed ? 0 : -1}
            style={{
              left: `${RIGHT_SLOT_RECT.left}%`, top: `${RIGHT_SLOT_RECT.top}%`,
              width: `${RIGHT_SLOT_RECT.width}%`, height: `${RIGHT_SLOT_RECT.height}%`,
            }}
          >
            {def && item && !maxed ? (
              <>
                <span className="enhance-slot-icon ehx-preview">
                  <ItemIcon slot={def.slot} icon={def.icon} size={72} />
                  <span className="ehx-plus">+{goal}</span>
                </span>
                {!busy && (
                  <TransformHover
                    title={def.name}
                    fromLabel={`+${basePlus}`}
                    toLabel={`+${goal}`}
                    fromColor={RARITY_COLOR[def.rarity]}
                    toColor={RARITY_COLOR[def.rarity]}
                    rows={hoverRows}
                  />
                )}
              </>
            ) : null}
          </div>

          {/* Patch 0425 -- the forge beat, re-keyed for every step. */}
          {step && (
            <div key={step.key} className={`ehx-beat fx-forge ${step.quick ? 'quick' : ''} ${step.milestone ? 'mile' : ''}`} aria-hidden="true">
              <svg className="ehx-runes" style={at(0)} viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="95" strokeWidth="1.4" strokeDasharray="3 8" />
                <circle cx="100" cy="100" r="80" strokeWidth="1" strokeDasharray="22 7 3 7" />
                <circle cx="100" cy="100" r="68" strokeWidth="1.6" strokeDasharray="1 10" />
              </svg>
              <span className="ehx-anvil" style={at(0)} />
              <span className="ehx-heat" style={at(0, { left: `${LEFT_SLOT_RECT.left}%`, top: `${LEFT_SLOT_RECT.top}%`, width: `${LEFT_SLOT_RECT.width}%`, height: `${LEFT_SLOT_RECT.height}%` })} />
              {(step.quick ? [0] : [100, 360]).map((ms) => (
                <span key={ms} className="ehx-strike" style={{ left: `${LEFT_SLOT_RECT.left + LEFT_SLOT_RECT.width * 0.55}%`, top: `${LEFT_SLOT_RECT.top - 4}%` }}>
                  <svg className="ehx-hammer" style={at(ms)} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round"><path d="M8 20l12-12 8 8-12 12z" /><path d="M24 24l18 18" /></svg>
                  <span className="ehx-sparks">
                    {[-70, -35, 0, 35, 70, -110, 110].map((a) => <i key={a} style={at(ms + 190, { ['--a' as string]: `${a}deg` })} />)}
                  </span>
                </span>
              ))}
              {[0, 1, 2].map((i) => (
                <span key={i} className="ehx-chev" style={at(step.quick ? 200 + i * 55 : 660 + i * 120, { left: `${46.2 + i * 2.4}%` })} />
              ))}
              <span className="ehx-streak" style={at(step.quick ? 310 : 900)} />
              <span className="ehx-flash" style={at(step.quick ? 430 : 1140)} />
            </div>
          )}
          {run?.mile && <div key={run.mile} className="ehx-mile fx-forge">{run.mile}</div>}
          {item && item.plus >= MAX_PLUS && !busy && justMaxed && (
            <span className="ehx-seal-wrap" style={{ left: `${LEFT_SLOT_RECT.left + LEFT_SLOT_RECT.width * 0.7}%`, top: `${LEFT_SLOT_RECT.top + LEFT_SLOT_RECT.height * 0.75}%` }}>
              <SealStamp label="Max refinement" />
            </span>
          )}
        </div>

        {item && def ? (
          <>
            <p className="tiny muted" style={{ margin: '8px 0 4px' }}>
              {def.name}{basePlus > 0 ? ` +${basePlus}` : ''} &mdash;{' '}
              {maxed
                ? 'already at maximum refinement'
                : `+${basePlus} → +${goal}${crosses.length ? ` (passes the +${crosses.join(' and +')} milestone${crosses.length > 1 ? 's' : ''})` : ''}`}
            </p>
            {!maxed && (
              <div className={`ehx-lines ${run?.rolled ? 'pulse' : ''}`} key={run?.rolled || 'l'} style={{ margin: '4px 0 8px' }}>
                <DeltaLine label="Durability cap" current={durAt(basePlus)} next={durAt(goal)} format={(n) => `${Math.round(n)}`} />
                {(Object.keys(MOD_LABEL) as (keyof Modifiers)[]).map((key) => (
                  <DeltaLine
                    key={key} label={MOD_LABEL[key]}
                    current={currentMods[key] ?? 0} next={nextMods[key] ?? 0}
                    format={(n) => formatModValue(key, Math.round(n * 10) / 10)}
                  />
                ))}
                {(Object.keys(STAT_LABEL) as (keyof Stats)[]).map((key) => (
                  <DeltaLine
                    key={key} label={STAT_LABEL[key]}
                    current={currentStats[key] ?? 0} next={nextStats[key] ?? 0}
                    format={(n) => `+${Math.round(n)}`}
                  />
                ))}
              </div>
            )}
            {/* Patch 0425 -- the refinement bar: one pip per +level, +5 and
                +10 marked as milestones. Tap a pip further along to aim for
                it; the striped pips are the path the button will pay for. */}
            <div className="ehx-ladder" role="group" aria-label="Refinement target">
              {Array.from({ length: MAX_PLUS }, (_, i) => {
                const lv = i + 1;
                const mile = lv === 5 || lv === MAX_PLUS;
                const done = lv <= basePlus;
                const plan = !maxed && lv > basePlus && lv <= goal;
                const isTarget = multi && lv === goal;
                return (
                  <button
                    key={lv} type="button"
                    className={`ehx-pip ${done ? 'on' : ''} ${plan ? 'plan' : ''} ${isTarget ? 'tgt' : ''} ${mile ? 'mile' : ''} ${run && lv === run.shown && run.rolled ? 'pop' : ''}`}
                    onClick={() => pickTarget(lv)}
                    disabled={busy || done}
                    title={done ? `+${lv} reached` : `Aim for +${lv}`}
                    aria-label={done ? `+${lv} reached` : `Aim for +${lv}`}
                  />
                );
              })}
            </div>
            <div className="ehx-ladder-labels" aria-hidden="true">
              {Array.from({ length: MAX_PLUS }, (_, i) => {
                const lv = i + 1;
                const isTarget = multi && lv === goal;
                const mile = lv === 5 || lv === MAX_PLUS;
                return <span key={lv} className={isTarget ? 'tgt' : mile ? 'mile' : ''}>{isTarget || mile ? `+${lv}` : ''}</span>;
              })}
            </div>
            {!maxed && !busy && (
              <p className="tiny muted" style={{ margin: '0 0 8px' }}>
                {multi
                  ? (canAfford ? `${goal - item.plus} steps in one go. Tap +${item.plus + 1} for just one.` : `Not enough for all ${goal - item.plus} steps.`)
                  : 'Tap a pip further along to aim higher.'}
              </p>
            )}
          </>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0' }}>Choose an item to see its refinement level.</p>
        )}

        {/* Cost now lives on the button itself, same "Buy · <cost>" /
            "Level up · <cost>" convention VendorsPanel already uses for
            every other paid action in the game -- it used to only appear
            at the tail end of the muted preview sentence above, easy to
            miss since nothing else in that sentence was a cost. */}
        <button
          className="btn-purple"
          disabled={!item || maxed || busy || !canAfford}
          onClick={(e) => handleEnhance(e.currentTarget)}
        >
          {!item ? 'Enhance' : busy ? `Refining… +${basePlus}` : maxed ? 'Max refinement' : (
            <>{multi ? `Enhance to +${goal}` : 'Enhance'} {'·'} <span className="gold-text">{'◆'} {formatGold(bill.gold)}</span> {bill.scrap > 0 && <> + {formatGold(bill.scrap)} Scrap</>}{bill.shards > 0 && <> + {shardLabel(bill.shards)}</>}</>
          )}
        </button>
        </>)}
      </div>

      {openPicker && (
        <PickerModal
          title="Choose an item"
          options={options}
          tabs={itemTabs}
          onPick={(key) => setPreviewUid(key)}
          onClose={() => setOpenPicker(false)}
        />
      )}

      {previewItem && previewDef && (
        <ItemPreviewModal
          item={previewItem}
          def={previewDef}
          onBack={() => { setPreviewUid(null); setOpenPicker(true); }}
          onContinue={() => { setTargetUid(previewItem.uid); setPreviewUid(null); setAim(null); setJustMaxed(false); }}
          extra={(
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>
              {previewMaxed
                ? 'Already at maximum refinement.'
                : `Refine: +${previewItem.plus} → +${previewItem.plus + 1} (durability cap ${previewMaxDurability} → ${previewNextMaxDurability})`}
            </p>
          )}
        />
      )}
    </div>
  );
}
