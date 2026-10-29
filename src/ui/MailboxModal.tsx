import { useRef } from 'react';
import { useEngine } from './useEngine';
import { flyIcon, flyTokens, ghostOut } from './purchaseFx';
import { MailboxEntry } from '../game/types';
import { RARITY_BANNER, RARITY_COLOR, formatGold } from '../game/util';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { ItemIcon, ConsumableIcon } from './icons';
import { SHARD_GLYPH, SHARD_ICON, shardLabel } from '../game/data/shards';

/**
 * Gold has no rarity of its own to key a banner lookup on -- per direct
 * request, its card reuses the Common rarity banner for now (same "no
 * dedicated art yet, borrow the closest existing thing" treatment
 * CurioCard's own empty-slot precedent uses elsewhere). Revisit once
 * gold gets its own card art.
 */
const GOLD_BANNER = RARITY_BANNER.common;

/**
 * Icon path for a mailbox gold entry, same `./item-icons/<icon>` convention
 * IconBox already reads from (icons.tsx) -- falls back to the 💰 glyph via
 * ConsumableIcon until a real file exists at that path, same "renders once
 * present, silently absent until then" convention every other icon in this
 * game already follows. Drop the real art at public/item-icons/gold.png.
 */
const GOLD_ICON = 'gold.png';

/** Same reasoning as GOLD_ICON/GOLD_BANNER above -- no dedicated Scrap
 *  mailbox art yet, same Common-banner/glyph-fallback treatment until
 *  real art exists. Drop the real art at public/item-icons/scrap.png. */
const SCRAP_ICON = 'scrap.png';


/**
 * Auction House mailbox -- build-order item from guild-idler-status.md's
 * Auction House entry. Same overlay/modal shape LeaderboardModal/
 * FundGuildModal already use. Every entry renders as an item card
 * (mirrors StashCard/ConsumableInfoCard's own `.item-card.rarity-card`
 * shape from EquipmentPanel.tsx) with a single Claim action -- no
 * hero-equip logic needed here, unlike those two, so this is its own
 * simpler card rather than reusing those components directly.
 */
export function MailboxModal({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const state = engine.state;
  const entries = state.mailbox;
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Patch 0424 -- claiming plays the letter leaving: its wax seal pops,
  // the card slides out, and what was inside flies to its own counter
  // (coins to gold, shards to scrap, the item to the Inventory tab). The
  // engine claim runs first and only entries that actually left the
  // mailbox animate, so a gold letter held back by the storage cap stays.
  const playClaimed = (ids: string[], before: MailboxEntry[]) => {
    ids.forEach((id, i) => {
      const el = cardRefs.current[id];
      const entry = before.find((e) => e.id === id);
      if (!el || !entry) return;
      const r = el.getBoundingClientRect();
      const from = { x: r.left + r.width / 2, y: r.top + r.height * 0.35 };
      const delay = i * 120;
      ghostOut(el, delay);
      if (entry.type === 'gold') flyTokens(from, 'gold', 'coin', 6, delay + 260);
      else if (entry.type === 'scrap') flyTokens(from, 'scrap', 'shard', 5, delay + 260);
      else if (entry.type === 'equipment' && entry.item) {
        const def = EQUIPMENT_BY_ID[entry.item.defId];
        void flyIcon(el, 'inventory', { icon: def?.icon, glyph: '✦' }, { delay: delay + 260 });
      } else if (entry.type === 'consumable' && entry.consumableId) {
        const def = CONSUMABLE_BY_ID[entry.consumableId];
        void flyIcon(el, 'inventory', { icon: def?.icon, glyph: def?.glyph }, { delay: delay + 260 });
      }
    });
  };
  const claimOne = (id: string) => {
    const before = [...entries];
    engine.claimMailboxEntry(id);
    if (!engine.state.mailbox.some((e) => e.id === id)) playClaimed([id], before);
  };
  const claimAll = () => {
    const before = [...entries];
    engine.claimAllMailbox();
    const left = new Set(engine.state.mailbox.map((e) => e.id));
    playClaimed(before.filter((e) => !left.has(e.id)).map((e) => e.id), before);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">📬 Mailbox</div>
        <p className="tiny muted" style={{ marginBottom: 10 }}>
          Gold from sales and items you've bought or sold land here to be claimed.
        </p>

        {entries.length === 0 ? (
          <div className="card">
            <p className="tiny muted" style={{ margin: 0 }}>Nothing to claim right now.</p>
          </div>
        ) : (
          <>
            <div className="row end" style={{ marginBottom: 8 }}>
              <button className="btn-ghost" onClick={claimAll}>
                Claim all ({entries.length})
              </button>
            </div>
            <div className="item-card-grid">
              {entries.map((entry) => (
                <div key={entry.id} ref={(el) => { cardRefs.current[entry.id] = el; }} className="mfx-card">
                  <MailboxCard entry={entry} onClaim={() => claimOne(entry.id)} />
                  <span className="mfx-seal" aria-hidden="true" />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function MailboxCard({ entry, onClaim }: { entry: MailboxEntry; onClaim: () => void }) {
  if (entry.type === 'gold') {
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${GOLD_BANNER})` }} />
        <div className="item-card-summary">
          <ConsumableIcon icon={GOLD_ICON} glyph="💰" size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR.common }}>{formatGold(entry.amount ?? 0)} gold</div>
            {entry.note && <div className="tiny muted">{entry.note}</div>}
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={onClaim}>Claim</button>
      </div>
    );
  }

  if (entry.type === 'scrap') {
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${GOLD_BANNER})` }} />
        <div className="item-card-summary">
          <ConsumableIcon icon={SCRAP_ICON} glyph="🔩" size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR.common }}>{(entry.amount ?? 0).toLocaleString()} scrap</div>
            {entry.note && <div className="tiny muted">{entry.note}</div>}
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={onClaim}>Claim</button>
      </div>
    );
  }

  if (entry.type === 'shard') {
    // Patch 0454 -- Legendary Shards (AH purchase, or a shard listing
    // coming back from cancel/expiry). Legendary banner, glyph icon until
    // real art exists.
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER.legendary})` }} />
        <div className="item-card-summary">
          <ConsumableIcon icon={SHARD_ICON} glyph={SHARD_GLYPH} size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR.legendary }}>{shardLabel(entry.amount ?? 0)}</div>
            {entry.note && <div className="tiny muted">{entry.note}</div>}
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={onClaim}>Claim</button>
      </div>
    );
  }

  if (entry.type === 'equipment' && entry.item) {
    const def = EQUIPMENT_BY_ID[entry.item.defId];
    if (!def) return null;
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>
              {itemDisplayName(entry.item, def)}{entry.item.plus > 0 ? ` +${entry.item.plus}` : ''}
            </div>
            {entry.note && <div className="tiny muted">{entry.note}</div>}
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={onClaim}>Claim</button>
      </div>
    );
  }

  if (entry.type === 'consumable' && entry.consumableId) {
    const def = CONSUMABLE_BY_ID[entry.consumableId];
    if (!def) return null;
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>
              {def.name}{(entry.amount ?? 1) > 1 ? ` ×${entry.amount}` : ''}
            </div>
            {entry.note && <div className="tiny muted">{entry.note}</div>}
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={onClaim}>Claim</button>
      </div>
    );
  }

  return null;
}
