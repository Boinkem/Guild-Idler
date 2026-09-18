import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentItem } from '../game/types';
import { RARITY_BANNER, RARITY_COLOR, formatGold } from '../game/util';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { ItemIcon, ConsumableIcon } from './icons';
import { ServerListingRow } from '../game/auctionHouse';

/**
 * Real Auction House browse/sell UI (patch 0411) -- the actual
 * player-facing piece every prior Auction House patch has been building
 * toward, since patch 0401's panel shell. Rendered by
 * AuctionHousePanel.tsx only once `status === 'online'` (a real,
 * confirmed connection) -- see that file's own comment for why the
 * offline state is correct production behaviour, not a stub, whenever
 * this can't render.
 *
 * Two tabs, kept deliberately simple for v1: Browse (fetch + display +
 * Buy) and Sell (pick an eligible item, set a price, list it). No
 * filtering/pagination on Browse yet, no "my listings" view, no cancel
 * -- all flagged as still-open in guild-idler-status.md's Auction House
 * entry, not overlooked here.
 */
export function AuctionHouseTrade() {
  const [tab, setTab] = useState<'browse' | 'sell'>('browse');
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={tab === 'browse' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('browse')}>Browse</button>
        <button className={tab === 'sell' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('sell')}>Sell</button>
      </div>
      {tab === 'browse' ? <BrowseTab /> : <SellTab />}
    </div>
  );
}

function BrowseTab() {
  const engine = useEngine();
  const [listings, setListings] = useState<ServerListingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    engine.fetchAuctionListings().then((rows) => {
      setListings(rows);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBuy = async (id: string) => {
    setBuyingId(id);
    const ok = await engine.buyListing(id);
    setBuyingId(null);
    if (ok) refresh();
  };

  if (loading) {
    return <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Loading listings...</p></div>;
  }
  if (listings === null) {
    return <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Couldn't load listings right now -- try again in a moment.</p></div>;
  }
  if (listings.length === 0) {
    return (
      <div className="card">
        <p className="tiny muted" style={{ margin: 0 }}>Nothing listed right now -- check back later, or list something yourself.</p>
      </div>
    );
  }

  return (
    <>
      <div className="row end" style={{ marginBottom: 8 }}>
        <button className="btn-ghost" onClick={refresh}>Refresh</button>
      </div>
      <div className="item-card-grid">
        {listings.map((row) => (
          <ListingCard key={row.id} row={row} buying={buyingId === row.id} onBuy={() => handleBuy(row.id)} />
        ))}
      </div>
    </>
  );
}

function ListingCard({ row, buying, onBuy }: { row: ServerListingRow; buying: boolean; onBuy: () => void }) {
  if (row.item_type === 'equipment') {
    const item = row.item_payload as EquipmentItem;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return null;
    return (
      <div className="item-card rarity-card">
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>
              {itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}
            </div>
            <div className="tiny muted">{formatGold(Number(row.price))} {row.currency}</div>
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} disabled={buying} onClick={onBuy}>
          {buying ? 'Buying...' : 'Buy'}
        </button>
      </div>
    );
  }

  const payload = row.item_payload as { defId?: string };
  const def = payload.defId ? CONSUMABLE_BY_ID[payload.defId] : undefined;
  if (!def) return null;
  return (
    <div className="item-card rarity-card">
      <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
      <div className="item-card-summary">
        <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</div>
          <div className="tiny muted">{formatGold(Number(row.price))} {row.currency}</div>
        </div>
      </div>
      <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} disabled={buying} onClick={onBuy}>
        {buying ? 'Buying...' : 'Buy'}
      </button>
    </div>
  );
}

type SellDraft =
  | { kind: 'equipment'; item: EquipmentItem }
  | { kind: 'consumable'; consumableId: string };

function SellTab() {
  const engine = useEngine();
  const state = engine.state;
  const [draft, setDraft] = useState<SellDraft | null>(null);

  if (draft) {
    return <SellForm draft={draft} onDone={() => setDraft(null)} />;
  }

  const sellableStash = state.stash.filter((i) => !i.locked);
  const ownedConsumables = Object.entries(state.inventory).filter(([, qty]) => qty > 0);

  return (
    <div>
      <p className="tiny muted" style={{ marginBottom: 8 }}>
        Pick something to list. It stays yours -- untouched -- until the listing is actually
        confirmed by the server, not before.
      </p>

      <div className="section-heading">Gear ({sellableStash.length})</div>
      {sellableStash.length === 0 ? (
        <p className="tiny muted">Nothing sellable in your stash (Vault-locked items can't be listed).</p>
      ) : (
        <div className="item-card-grid">
          {sellableStash.map((item) => {
            const def = EQUIPMENT_BY_ID[item.defId];
            if (!def) return null;
            return (
              <div key={item.uid} className="item-card rarity-card">
                <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
                <div className="item-card-summary">
                  <ItemIcon slot={def.slot} icon={def.icon} size={48} />
                  <div className="item-card-body">
                    <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>
                      {itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}
                    </div>
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => setDraft({ kind: 'equipment', item })}>
                  List for sale →
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-heading" style={{ marginTop: 14 }}>Consumables</div>
      {ownedConsumables.length === 0 ? (
        <p className="tiny muted">Nothing to list.</p>
      ) : (
        <div className="item-card-grid">
          {ownedConsumables.map(([consumableId, qty]) => {
            const def = CONSUMABLE_BY_ID[consumableId];
            if (!def) return null;
            return (
              <div key={consumableId} className="item-card rarity-card">
                <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
                <div className="item-card-summary">
                  <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
                  <div className="item-card-body">
                    <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name} ×{qty}</div>
                    <div className="tiny muted">Lists 1 at a time</div>
                  </div>
                </div>
                <button className="btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => setDraft({ kind: 'consumable', consumableId })}>
                  List for sale →
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SellForm({ draft, onDone }: { draft: SellDraft; onDone: () => void }) {
  const engine = useEngine();
  const [currency, setCurrency] = useState<'gold' | 'scrap'>('gold');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const name = draft.kind === 'equipment'
    ? (() => {
        const def = EQUIPMENT_BY_ID[draft.item.defId];
        return def ? itemDisplayName(draft.item, def) : draft.item.defId;
      })()
    : CONSUMABLE_BY_ID[draft.consumableId]?.name ?? draft.consumableId;

  const submit = async () => {
    const value = Number(price);
    setSubmitting(true);
    const ok = draft.kind === 'equipment'
      ? await engine.listEquipmentForSale(draft.item.uid, currency, value)
      : await engine.listConsumableForSale(draft.consumableId, currency, value);
    setSubmitting(false);
    if (ok) onDone();
  };

  return (
    <div className="card">
      <div className="card-title">List: {name}</div>
      <div className="row" style={{ gap: 8, margin: '10px 0' }}>
        <button className={currency === 'gold' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('gold')}>Gold</button>
        <button className={currency === 'scrap' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('scrap')}>Scrap</button>
      </div>
      <input
        type="number" min="1" placeholder="Price" value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: '100%', background: 'var(--panel2)', border: '1px solid var(--panel3)', color: 'var(--text)', padding: '7px 8px', marginBottom: 10 }}
      />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn-primary" disabled={submitting || !price} onClick={submit}>
          {submitting ? 'Listing...' : 'Confirm listing'}
        </button>
        <button onClick={onDone} disabled={submitting}>Cancel</button>
      </div>
    </div>
  );
}
