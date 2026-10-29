import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentItem, Rarity } from '../game/types';
import { RARITY_BANNER, RARITY_COLOR, RARITY_ORDER, formatGold } from '../game/util';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { ItemIcon, ConsumableIcon } from './icons';
import { AhItemType, ServerListingRow } from '../game/auctionHouse';
import { MAX_SHARDS_PER_LISTING, SHARD_GLYPH, SHARD_ICON, SHARD_NAME, shardLabel } from '../game/data/shards';
import { GuildManager } from '../game/managers/GuildManager';
import { flyIcon, flyTokens, fxMs, fxSpeed } from './purchaseFx';

/**
 * Real Auction House browse/sell UI, patch 0411, extended patch 0413 to
 * close five real gaps: listing filters, a "my listings" view,
 * cancelling a listing, deposit fees, and the 48h duration tier. See
 * listings.ts's own header comment (server) for the two genuinely
 * economic calls made there (deposit percentage, the 48h gate).
 *
 * Three tabs now: Browse, Sell, My Listings.
 */
export function AuctionHouseTrade() {
  const [tab, setTab] = useState<'browse' | 'sell' | 'mine'>('browse');
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={tab === 'browse' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('browse')}>Browse</button>
        <button className={tab === 'sell' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('sell')}>Sell</button>
        <button className={tab === 'mine' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('mine')} data-ah-mine="">My Listings</button>
      </div>
      {tab === 'browse' ? <BrowseTab /> : tab === 'sell' ? <SellTab /> : <MyListingsTab />}
    </div>
  );
}

/** Patch 0454 -- a shard listing's stack size, from its payload. */
function shardAmountOf(row: ServerListingRow): number {
  return Math.max(0, Math.floor(Number((row.item_payload as { amount?: number })?.amount) || 0));
}

/** Patch 0454 -- one card body for a stack of Legendary Shards, shared by
 *  Browse and My Listings. Price per Shard shown so stacks compare. */
function ShardListingSummary({ row }: { row: ServerListingRow }) {
  const amount = shardAmountOf(row);
  const price = Number(row.price);
  return (
    <>
      <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER.legendary})` }} />
      <div className="item-card-summary">
        <ConsumableIcon icon={SHARD_ICON} glyph={SHARD_GLYPH} size={48} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR.legendary }}>{shardLabel(amount)}</div>
          <div className="tiny muted">
            {formatGold(price)} {row.currency}
            {amount > 1 && ` (${formatGold(Math.ceil(price / amount))} each)`}
          </div>
          {row.deposit_amount && <div className="tiny muted">Deposit: {row.deposit_amount} {row.currency}</div>}
        </div>
      </div>
    </>
  );
}

function rarityOf(row: ServerListingRow): Rarity | null {
  if (row.item_type === 'shard') return 'legendary';
  if (row.item_type === 'equipment') {
    const item = row.item_payload as EquipmentItem;
    return EQUIPMENT_BY_ID[item.defId]?.rarity ?? null;
  }
  const payload = row.item_payload as { defId?: string };
  if (!payload.defId) return null;
  return CONSUMABLE_BY_ID[payload.defId]?.rarity ?? null;
}

function BrowseTab() {
  const engine = useEngine();
  const [listings, setListings] = useState<ServerListingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [itemTypeFilter, setItemTypeFilter] = useState<'' | AhItemType>('');
  const [rarityFilter, setRarityFilter] = useState<'' | Rarity>('');

  const refresh = () => {
    setLoading(true);
    engine.fetchAuctionListings(itemTypeFilter ? { itemType: itemTypeFilter } : {}).then((rows) => {
      setListings(rows);
      setLoading(false);
    });
  };

  // Refetch from the server on itemType changes (a real query param) --
  // rarity is filtered client-side below, no refetch needed for it.
  useEffect(() => { refresh(); }, [itemTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Patch 0428 -- the buy moment: coins into the Buy button, YOURS
  // stamped on the card, which folds into a letter for the mailbox (where
  // the item actually arrives). The list refreshes once it's played.
  const [boughtId, setBoughtId] = useState<string | null>(null);
  const handleBuy = async (row: ServerListingRow, btn: HTMLElement | null) => {
    setBuyingId(row.id);
    const ok = await engine.buyListing(row.id, Number(row.price), row.currency === 'scrap' ? 'scrap' : 'gold');
    setBuyingId(null);
    if (!ok) return;
    if (fxSpeed() <= 0 || !btn) { refresh(); return; }
    flyTokens(row.currency === 'scrap' ? 'scrap' : 'gold', btn, row.currency === 'scrap' ? 'shard' : 'coin', 6);
    setBoughtId(row.id);
    const card = btn.closest('.item-card');
    window.setTimeout(() => { void flyIcon(card, 'mailbox', { glyph: '\u2709' }, { size: 30, duration: 560 }); }, fxMs(1150));
    window.setTimeout(() => { setBoughtId(null); refresh(); }, fxMs(1750));
  };

  const visible = (listings ?? []).filter((row) => !rarityFilter || rarityOf(row) === rarityFilter);

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={itemTypeFilter} onChange={(e) => setItemTypeFilter(e.target.value as typeof itemTypeFilter)}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '6px 8px' }}>
          <option value="">All types</option>
          <option value="equipment">Gear</option>
          <option value="consumable">Consumables</option>
          <option value="shard">Legendary Shards</option>
        </select>
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as typeof rarityFilter)}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '6px 8px' }}>
          <option value="">All rarities</option>
          {RARITY_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={refresh}>Refresh</button>
      </div>

      {loading ? (
        <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Loading listings...</p></div>
      ) : listings === null ? (
        <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Couldn't load listings right now -- try again in a moment.</p></div>
      ) : visible.length === 0 ? (
        <div className="card">
          <p className="tiny muted" style={{ margin: 0 }}>
            {listings.length === 0 ? 'Nothing listed right now -- check back later, or list something yourself.' : 'Nothing matches those filters.'}
          </p>
        </div>
      ) : (
        <div className="item-card-grid">
          {visible.map((row) => (
            <ListingCard key={row.id} row={row} buying={buyingId === row.id} bought={boughtId === row.id} onBuy={(btn) => handleBuy(row, btn)} />
          ))}
        </div>
      )}
    </>
  );
}

function ListingCard({ row, buying, bought = false, onBuy }: { row: ServerListingRow; buying: boolean; bought?: boolean; onBuy: (btn: HTMLElement | null) => void }) {
  if (row.item_type === 'shard') {
    if (shardAmountOf(row) < 1) return null;
    return (
      <div className={`item-card rarity-card ${bought ? 'ahx-bought fx-ah' : ''}`}>
        <ShardListingSummary row={row} />
        <button className="btn-primary item-card-action" disabled={buying || bought} onClick={(e) => onBuy(e.currentTarget)}>
          {buying ? 'Buying...' : bought ? 'Bought' : 'Buy'}
        </button>
        {bought && <span className="ahx-stamp">Yours</span>}
      </div>
    );
  }
  if (row.item_type === 'equipment') {
    const item = row.item_payload as EquipmentItem;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return null;
    return (
      <div className={`item-card rarity-card ${bought ? 'ahx-bought fx-ah' : ''}`}>
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
        <button className="btn-primary item-card-action" disabled={buying || bought} onClick={(e) => onBuy(e.currentTarget)}>
          {buying ? 'Buying...' : bought ? 'Bought' : 'Buy'}
        </button>
        {bought && <span className="ahx-stamp">Yours</span>}
      </div>
    );
  }

  const payload = row.item_payload as { defId?: string };
  const def = payload.defId ? CONSUMABLE_BY_ID[payload.defId] : undefined;
  if (!def) return null;
  return (
    <div className={`item-card rarity-card ${bought ? 'ahx-bought fx-ah' : ''}`}>
      <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
      <div className="item-card-summary">
        <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</div>
          <div className="tiny muted">{formatGold(Number(row.price))} {row.currency}</div>
        </div>
      </div>
      <button className="btn-primary item-card-action" disabled={buying || bought} onClick={(e) => onBuy(e.currentTarget)}>
        {buying ? 'Buying...' : bought ? 'Bought' : 'Buy'}
      </button>
      {bought && <span className="ahx-stamp">Yours</span>}
    </div>
  );
}

type SellDraft =
  | { kind: 'equipment'; item: EquipmentItem }
  | { kind: 'consumable'; consumableId: string }
  | { kind: 'shard' };

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
        confirmed by the server, not before. A small deposit (refunded if it sells, forfeited if
        you cancel) is charged once that confirmation comes back.
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
                <button className="btn-primary item-card-action" onClick={() => setDraft({ kind: 'equipment', item })}>
                  List for sale →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Patch 0454 -- Legendary Shards list as a stack (choose how many in the form). */}
      {(state.legendaryShards ?? 0) > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: 14 }}>Legendary Shards</div>
          <div className="item-card-grid">
            <div className="item-card rarity-card">
              <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER.legendary})` }} />
              <div className="item-card-summary">
                <ConsumableIcon icon={SHARD_ICON} glyph={SHARD_GLYPH} size={48} />
                <div className="item-card-body">
                  <div className="item-card-name" style={{ color: RARITY_COLOR.legendary }}>{SHARD_NAME} ×{state.legendaryShards}</div>
                  <div className="tiny muted">Lists as a stack</div>
                </div>
              </div>
              <button className="btn-primary item-card-action" onClick={() => setDraft({ kind: 'shard' })}>
                List for sale →
              </button>
            </div>
          </div>
        </>
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
                <button className="btn-primary item-card-action" onClick={() => setDraft({ kind: 'consumable', consumableId })}>
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
  const [duration, setDuration] = useState<24 | 48>(24);
  const [submitting, setSubmitting] = useState(false);
  // Patch 0454 -- stack size, shard drafts only.
  const shardsOwned = engine.state.legendaryShards ?? 0;
  const [shardQty, setShardQty] = useState('1');

  const has48h = GuildManager.upgradeLevel(engine.state, 'auction_house_charter') >= 2;
  const priceNum = Number(price) || 0;
  const estDeposit = priceNum > 0 ? Math.max(1, Math.ceil(priceNum * 0.05)) : 0;

  const name = draft.kind === 'equipment'
    ? (() => {
        const def = EQUIPMENT_BY_ID[draft.item.defId];
        return def ? itemDisplayName(draft.item, def) : draft.item.defId;
      })()
    : draft.kind === 'shard'
      ? SHARD_NAME + 's'
      : CONSUMABLE_BY_ID[draft.consumableId]?.name ?? draft.consumableId;

  // Patch 0428 -- the listing moment: the deposit flies in, the item is
  // wrapped in paper, tied and sealed, then posted off to My Listings.
  const cardRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [post, setPost] = useState<'wrap' | 'fly' | null>(null);
  const [flyTo, setFlyTo] = useState<{ dx: number; dy: number } | null>(null);
  const submit = async () => {
    const value = Number(price);
    setSubmitting(true);
    const before = currency === 'gold' ? engine.state.gold : engine.state.scrap;
    const ok = draft.kind === 'equipment'
      ? await engine.listEquipmentForSale(draft.item.uid, currency, value, duration)
      : draft.kind === 'shard'
        ? await engine.listShardsForSale(Number(shardQty), currency, value, duration)
        : await engine.listConsumableForSale(draft.consumableId, currency, value, duration);
    setSubmitting(false);
    if (!ok) return;
    if (fxSpeed() <= 0) { onDone(); return; }
    const paid = before - (currency === 'gold' ? engine.state.gold : engine.state.scrap);
    if (paid > 0 && btnRef.current) flyTokens(currency, btnRef.current, currency === 'gold' ? 'coin' : 'shard', 3);
    setPost('wrap');
    window.setTimeout(() => {
      const r = cardRef.current?.getBoundingClientRect();
      const to = document.querySelector('[data-ah-mine]')?.getBoundingClientRect();
      setFlyTo(r && to ? { dx: to.left + to.width / 2 - (r.left + r.width / 2), dy: to.top + to.height / 2 - (r.top + r.height / 2) } : { dx: 0, dy: -160 });
      setPost('fly');
    }, fxMs(1250));
    window.setTimeout(onDone, fxMs(1850));
  };

  return (
    <div
      ref={cardRef}
      className={`card ${post ? 'ahx-wrap fx-ah' : ''} ${post === 'fly' ? 'ahx-post' : ''}`}
      style={flyTo ? { ['--dx' as string]: `${flyTo.dx}px`, ['--dy' as string]: `${flyTo.dy}px` } : undefined}
    >
      {post && (
        <span className="ahx-parcel" aria-hidden="true">
          <span className="ahx-paper" /><span className="ahx-twine h" /><span className="ahx-twine v" /><span className="ahx-seal" />
        </span>
      )}
      <div className="card-title">List: {name}</div>
      <div className="row" style={{ gap: 8, margin: '10px 0' }}>
        <button className={currency === 'gold' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('gold')}>Gold</button>
        <button className={currency === 'scrap' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('scrap')}>Scrap</button>
      </div>
      {draft.kind === 'shard' && (
        <label className="tiny muted" style={{ display: 'block', marginBottom: 10 }}>
          How many (you have {shardsOwned}, max {Math.min(shardsOwned, MAX_SHARDS_PER_LISTING)} per listing)
          <input
            type="number" min="1" max={Math.min(shardsOwned, MAX_SHARDS_PER_LISTING)} value={shardQty}
            onChange={(e) => setShardQty(e.target.value)}
            style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '7px 8px', marginTop: 4 }}
          />
        </label>
      )}
      <input
        type="number" min="1" placeholder={draft.kind === 'shard' ? 'Price for the whole stack' : 'Price'} value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '7px 8px', marginBottom: 10 }}
      />
      <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <button className={duration === 24 ? 'btn-primary' : 'btn-ghost'} onClick={() => setDuration(24)}>24h</button>
        <button className={duration === 48 ? 'btn-primary' : 'btn-ghost'} disabled={!has48h} onClick={() => setDuration(48)}>48h</button>
        {!has48h && <span className="tiny muted">Auction House Charter level 2 unlocks 48h listings</span>}
      </div>
      {priceNum > 0 && (
        <p className="tiny muted" style={{ marginBottom: 10 }}>
          Deposit: ~{estDeposit} {currency} (5%, refunded if it sells, forfeited if you cancel).
        </p>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button ref={btnRef} className="btn-primary" disabled={submitting || !price || !!post} onClick={submit}>
          {submitting ? 'Listing...' : 'Confirm listing'}
        </button>
        <button onClick={onDone} disabled={submitting}>Cancel</button>
      </div>
    </div>
  );
}

function MyListingsTab() {
  const engine = useEngine();
  const [listings, setListings] = useState<ServerListingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    engine.fetchMyAuctionListings().then((rows) => {
      setListings(rows);
      setLoading(false);
    });
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    const ok = await engine.cancelListing(id);
    setCancellingId(null);
    if (ok) refresh();
  };

  if (loading) {
    return <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Loading your listings...</p></div>;
  }
  if (listings === null) {
    return <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Couldn't load your listings right now -- try again in a moment.</p></div>;
  }
  if (listings.length === 0) {
    return <div className="card"><p className="tiny muted" style={{ margin: 0 }}>You don't have anything listed right now.</p></div>;
  }

  return (
    <>
      <div className="row end" style={{ marginBottom: 8 }}>
        <button className="btn-ghost" onClick={refresh}>Refresh</button>
      </div>
      <div className="item-card-grid">
        {listings.map((row) => (
          <MyListingCard key={row.id} row={row} cancelling={cancellingId === row.id} onCancel={() => handleCancel(row.id)} />
        ))}
      </div>
    </>
  );
}

function MyListingCard({ row, cancelling, onCancel }: { row: ServerListingRow; cancelling: boolean; onCancel: () => void }) {
  const cancelButton = (
    <button className="btn-primary item-card-action" disabled={cancelling} onClick={onCancel}>
      {cancelling ? 'Cancelling...' : 'Cancel listing'}
    </button>
  );

  if (row.item_type === 'shard') {
    return (
      <div className="item-card rarity-card">
        <ShardListingSummary row={row} />
        {cancelButton}
      </div>
    );
  }

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
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{itemDisplayName(item, def)}</div>
            <div className="tiny muted">{formatGold(Number(row.price))} {row.currency}</div>
            {row.deposit_amount && <div className="tiny muted">Deposit: {row.deposit_amount} {row.currency}</div>}
          </div>
        </div>
        {cancelButton}
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
          {row.deposit_amount && <div className="tiny muted">Deposit: {row.deposit_amount} {row.currency}</div>}
        </div>
      </div>
      {cancelButton}
    </div>
  );
}
