import { useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { HeroManager } from '../game/managers/HeroManager';
import { itemDef, itemDisplayName } from '../game/data/equipment';
import { ATTUNE_AFFIX_BY_ID, ATTUNE_AFFIXES, canAttune, describeAttunement, attuneLevel } from '../game/data/attunement';
import { shardLabel } from '../game/data/shards';
import { Tuning } from '../game/data/tuning';
import { RARITY_COLOR } from '../game/util';
import { ItemIcon, ShardMark } from './icons';
import { PickerModal } from './CraftingStation';
import type { PickerOption } from './CraftingStation';
import { buyWithFx } from './purchaseFx';

/**
 * Patch 0484 -- the Enchanter's Attunement bench: give a Legendary one
 * extra bonus line for Legendary Shards, or reroll the one it has. Same
 * station shape as RerollStation (pick an item, see what it has, pay).
 * Any Legendary is offered -- hand-authored, procedural or Heirloom.
 */
export function AttuneStation({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const [uid, setUid] = useState('');
  const [openPicker, setOpenPicker] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const found = uid ? EquipmentManager.allItems(state).find((e) => e.item.uid === uid) : undefined;
  const item = found?.item;
  const def = item ? itemDef(item) : undefined;
  const wearer = found?.heroId ? state.heroes.find((h) => h.id === found.heroId) : undefined;
  const away = !!wearer && HeroManager.isAway(wearer);
  const cost = item ? EquipmentManager.attuneShardCost(item) : Tuning.get('economy.attuneShardCost');
  const have = state.legendaryShards ?? 0;

  const options: PickerOption[] = EquipmentManager.allItems(state)
    .map(({ item: i, heroId }): PickerOption | null => {
      const d = itemDef(i);
      if (!d || !canAttune(i)) return null;
      const owner = heroId ? state.heroes.find((h) => h.id === heroId)?.name ?? 'Stash' : 'Stash';
      return {
        key: i.uid,
        label: `${itemDisplayName(i, d)}${i.plus > 0 ? ` +${i.plus}` : ''}`,
        sublabel: `${owner} -- ${i.attunement ? describeAttunement(i.attunement) : 'not attuned'}`,
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

  function handleAttune(btn: HTMLElement) {
    if (!item) return;
    const before = item.attunement ? describeAttunement(item.attunement) : null;
    let ok = false;
    buyWithFx(engine, btn, () => { ok = engine.attuneItem(item.uid); });
    if (ok) setPrevious(before);
  }

  const signature = item?.attunement && ATTUNE_AFFIX_BY_ID[item.attunement.affix]?.kind === 'signature';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rrx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">Attunement</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Bind one extra bonus into a Legendary. {Tuning.get('economy.attuneSignatureChance')}% of the time it&apos;s a signature line found nowhere else.
          Its strength follows the item&apos;s level, so re-level it at the Blacksmith first.
        </p>

        <button type="button" className="rrx-stage" onClick={() => setOpenPicker(true)} aria-label="Choose a Legendary to attune">
          <svg className="rrx-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="92" strokeWidth="1.4" strokeDasharray="3 8" />
            <circle cx="100" cy="100" r="78" strokeWidth="1" strokeDasharray="22 7 3 7" />
          </svg>
          {def ? <ItemIcon slot={def.slot} icon={def.icon} size={64} /> : <span className="craft-slot-plus" aria-hidden="true">+</span>}
        </button>

        {item && def ? (
          <div style={{ textAlign: 'center', margin: '6px 0 10px' }}>
            <div className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <div className="tiny muted">Lv {attuneLevel(item)} · {wearer ? `worn by ${wearer.name}` : 'in the stash'}</div>
            <div className={`attune-line ${signature ? 'signature' : ''}`} style={{ marginTop: 8 }}>
              {item.attunement ? <>{'✦'} {describeAttunement(item.attunement)}</> : <span className="muted">Not attuned yet</span>}
            </div>
            {previous && <div className="tiny muted">was: {previous}</div>}
            {item.attunement && <p className="tiny" style={{ color: 'var(--blood)', margin: '8px 0 0' }}>Re-attuning replaces this line with a different one. There&apos;s no undo.</p>}
          </div>
        ) : (
          <p className="tiny muted" style={{ margin: '8px 0', textAlign: 'center' }}>
            {options.length === 0 ? 'You have no Legendary items yet.' : 'Choose a Legendary item.'}
          </p>
        )}

        <button
          className="btn-purple"
          disabled={!item || away || have < cost}
          title={away ? `${wearer?.name} is still out` : have < cost ? `Needs ${shardLabel(cost)} (you have ${have})` : undefined}
          onClick={(e) => handleAttune(e.currentTarget)}
        >
          {item?.attunement ? 'Re-attune' : 'Attune'} {'·'} {cost} <ShardMark /> <span className="tiny muted">({have} held)</span>
        </button>

        <button className="btn-ghost tiny" style={{ marginTop: 8 }} onClick={() => setShowList((v) => !v)}>
          {showList ? 'Hide' : 'Show'} possible lines
        </button>
        {showList && (
          <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {ATTUNE_AFFIXES.map((a) => (
              <li key={a.id} className={a.kind === 'signature' ? 'attune-line signature' : undefined}>
                {a.describe(a.max)}{a.fixed ? '' : ' (at item level 50, best roll)'}
              </li>
            ))}
          </ul>
        )}
      </div>

      {openPicker && (
        <PickerModal
          title="Choose a Legendary to attune"
          options={options}
          tabs={itemTabs}
          onPick={(key) => { setUid(key); setPrevious(null); }}
          onClose={() => setOpenPicker(false)}
        />
      )}
    </div>
  );
}
