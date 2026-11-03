import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipSlot, EquipmentItem, Hero, Rarity } from '../game/types';
import { MAIN_STAT_TOOLTIP, RARITY_BANNER, RARITY_COLOR, RARITY_ORDER, describeMods, describeStats, formatGold } from '../game/util';
import { EQUIPMENT_BY_ID, EQUIP_SLOTS, gearScoreForInstance, itemDisplayName } from '../game/data/equipment';
import { EquipmentManager } from '../game/managers/EquipmentManager';
import { auctionItemLevel, auctionItemName, auctionItemRarity, auctionShopValue, goldToScrap, priceInGold } from '../game/ahItems';
import { ElementalInfoLine, RarityPill, SetInfoBlock, SetPill, isGearUpgrade } from './panels/EquipmentPanel';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { ItemIcon, ConsumableIcon } from './icons';
import { AhItemType, LISTING_HOURS_BASE, LISTING_HOURS_EXTENDED, ListingHours, ServerListingRow } from '../game/auctionHouse';
import { MAX_SHARDS_PER_LISTING, SHARD_GLYPH, SHARD_ICON, SHARD_NAME, shardLabel } from '../game/data/shards';
import { GuildManager } from '../game/managers/GuildManager';
import { flyIcon, flyTokens, fxMs, fxSpeed } from './purchaseFx';
import { AuctionLedger } from './AuctionLedger';

/**
 * Real Auction House browse/sell UI, patch 0411, extended patch 0413 to
 * close five real gaps: listing filters, a "my listings" view,
 * cancelling a listing, deposit fees, and the 48h duration tier. See
 * listings.ts's own header comment (server) for the two genuinely
 * economic calls made there (deposit percentage, the 48h gate).
 *
 * Four tabs now: Browse, Sell, My Listings, My Ledger (patch 0458 --
 * the player's own trading dashboard, AuctionLedger.tsx).
 */
export function AuctionHouseTrade() {
  const [tab, setTab] = useState<'browse' | 'sell' | 'mine' | 'ledger'>('browse');
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={tab === 'browse' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('browse')}>Browse</button>
        <button className={tab === 'sell' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('sell')}>Sell</button>
        <button className={tab === 'mine' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('mine')} data-ah-mine="">My Listings</button>
        <button className={tab === 'ledger' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('ledger')}>My Ledger</button>
      </div>
      {tab === 'browse' ? <BrowseTab /> : tab === 'sell' ? <SellTab /> : tab === 'mine' ? <MyListingsTab /> : <AuctionLedger />}
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

/** Patch 0462 -- a gear listing's item level (rolled level, else the
 *  item's own required level). Null for consumables and Shard stacks,
 *  which have no level and always pass the "Near my level" filter. */
function listingLevel(row: ServerListingRow): number | null {
  if (row.item_type !== 'equipment') return null;
  const item = row.item_payload as EquipmentItem;
  const def = EQUIPMENT_BY_ID[item?.defId];
  return def ? item.rolledItemLevel ?? def.reqLevel : null;
}

/** Patch 0462 -- "Near my level": from 3 below the guild's lowest hero to
 *  3 above its highest, so gear for any hero on the roster shows. */
const NEAR_LEVEL_MARGIN = 3;
function nearLevelRange(heroLevels: number[]): { min: number; max: number } {
  if (heroLevels.length === 0) return { min: 1, max: 1 + NEAR_LEVEL_MARGIN };
  return { min: Math.max(1, Math.min(...heroLevels) - NEAR_LEVEL_MARGIN), max: Math.max(...heroLevels) + NEAR_LEVEL_MARGIN };
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

type BrowseSort = 'newest' | 'priceAsc' | 'priceDesc' | 'level' | 'ending';

/** Patch 0463 -- "6d 4h left" from a listing's expiry. */
function timeLeft(expiresAt: string): string {
  const mins = Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 60000);
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m left`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h left` : `${Math.floor(h / 24)}d ${h % 24}h left`;
}

/** Patch 0463 -- heroes this gear would be an upgrade for (same check the
 *  Inventory's "Upgrade" pill uses), biggest gear-score gain first, so the
 *  hero named on a card is the one who benefits most. Empty for non-gear. */
function upgradeHeroes(row: ServerListingRow, heroes: Hero[]): Hero[] {
  if (row.item_type !== 'equipment') return [];
  const item = row.item_payload as EquipmentItem;
  const def = EQUIPMENT_BY_ID[item?.defId];
  if (!def) return [];
  const score = gearScoreForInstance(item, def);
  const gain = (h: Hero) => {
    const worn = h.equipment[def.slot];
    const wornDef = worn ? EQUIPMENT_BY_ID[worn.defId] : undefined;
    return score - (worn && wornDef ? gearScoreForInstance(worn, wornDef) : -1);
  };
  return heroes.filter((h) => isGearUpgrade(h, item, def)).sort((a, b) => gain(b) - gain(a));
}

/** Patch 0463 -- the "Upgrade tags" dropdown: off, all heroes, or one
 *  hero by id. Remembered per browser/app install (localStorage, wrapped --
 *  it can be unavailable); falls back to 'all' if that hero is gone. */
type UpgradeTagMode = 'off' | 'all' | string;
const UPGRADE_TAG_KEY = 'guildbound-ah-upgrade-tags';
function loadUpgradeTagMode(): UpgradeTagMode {
  try { return window.localStorage.getItem(UPGRADE_TAG_KEY) || 'all'; } catch { return 'all'; }
}
function saveUpgradeTagMode(mode: UpgradeTagMode) {
  try { window.localStorage.setItem(UPGRADE_TAG_KEY, mode); } catch { /* not persisted -- fine */ }
}
/** Which heroes a card's tag may name under the chosen mode. */
function taggedHeroes(row: ServerListingRow, heroes: Hero[], mode: UpgradeTagMode): Hero[] {
  if (mode === 'off') return [];
  const upgrades = upgradeHeroes(row, heroes);
  return mode === 'all' ? upgrades : upgrades.filter((h) => h.id === mode);
}

const SELECT_STYLE = { background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '6px 8px' } as const;

function BrowseTab() {
  const engine = useEngine();
  const [listings, setListings] = useState<ServerListingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [itemTypeFilter, setItemTypeFilter] = useState<'' | AhItemType>('');
  const [rarityFilter, setRarityFilter] = useState<'' | Rarity>('');
  const [nearLevel, setNearLevel] = useState(true);
  // Patch 0463 -- search, slot filter, sort, inspect.
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'' | EquipSlot>('');
  const [sort, setSort] = useState<BrowseSort>('newest');
  const [inspecting, setInspecting] = useState<ServerListingRow | null>(null);
  const heroes = engine.state.heroes;
  const [tagModeRaw, setTagModeRaw] = useState<UpgradeTagMode>(loadUpgradeTagMode);
  const tagMode: UpgradeTagMode = tagModeRaw === 'off' || tagModeRaw === 'all' || heroes.some((h) => h.id === tagModeRaw) ? tagModeRaw : 'all';
  const setTagMode = (mode: UpgradeTagMode) => { setTagModeRaw(mode); saveUpgradeTagMode(mode); };
  const range = nearLevelRange(heroes.map((h) => h.level));

  const refresh = () => {
    setLoading(true);
    engine.fetchAuctionListings(itemTypeFilter ? { itemType: itemTypeFilter } : {}).then((rows) => {
      setListings(rows);
      setLoading(false);
    });
  };

  // Refetch from the server on itemType changes (a real query param) --
  // everything else is filtered client-side below, no refetch needed.
  useEffect(() => { refresh(); }, [itemTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Patch 0428 -- the buy moment: coins into the Buy button, YOURS
  // stamped on the card, which folds into a letter for the mailbox (where
  // the item actually arrives). The list refreshes once it's played.
  // Buying from the inspect window passes no button: no fx, just refresh.
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
    window.setTimeout(() => { void flyIcon(card, 'mailbox', { glyph: '✉' }, { size: 30, duration: 560 }); }, fxMs(1150));
    window.setTimeout(() => { setBoughtId(null); refresh(); }, fxMs(1750));
  };

  const needle = search.trim().toLowerCase();
  const visible = (listings ?? []).filter((row) => {
    if (rarityFilter && rarityOf(row) !== rarityFilter) return false;
    if (slotFilter) {
      if (row.item_type !== 'equipment') return false;
      if (EQUIPMENT_BY_ID[(row.item_payload as EquipmentItem)?.defId]?.slot !== slotFilter) return false;
    }
    if (needle && !auctionItemName(row.item_type, row.item_payload).toLowerCase().includes(needle)) return false;
    if (!nearLevel) return true;
    const lvl = listingLevel(row);
    return lvl == null || (lvl >= range.min && lvl <= range.max);
  });
  const goldPrice = (row: ServerListingRow) => priceInGold(Number(row.price), row.currency);
  if (sort === 'priceAsc') visible.sort((a, b) => goldPrice(a) - goldPrice(b));
  else if (sort === 'priceDesc') visible.sort((a, b) => goldPrice(b) - goldPrice(a));
  else if (sort === 'level') visible.sort((a, b) => (listingLevel(b) ?? -1) - (listingLevel(a) ?? -1));
  else if (sort === 'ending') visible.sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());

  const showSlot = itemTypeFilter === '' || itemTypeFilter === 'equipment';

  return (
    <>
      <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..."
          aria-label="Search listings by name"
          style={{ ...SELECT_STYLE, flex: 1, minWidth: 0, padding: '7px 8px' }}
        />
        <button className="btn-ghost" onClick={refresh}>Refresh</button>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={itemTypeFilter} onChange={(e) => { setItemTypeFilter(e.target.value as typeof itemTypeFilter); if (e.target.value && e.target.value !== 'equipment') setSlotFilter(''); }} style={SELECT_STYLE}>
          <option value="">All types</option>
          <option value="equipment">Gear</option>
          <option value="consumable">Consumables</option>
          <option value="shard">Legendary Shards</option>
        </select>
        {showSlot && (
          <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as typeof slotFilter)} style={SELECT_STYLE} aria-label="Gear slot">
            <option value="">All slots</option>
            {EQUIP_SLOTS.map((slot) => <option key={slot} value={slot}>{slot[0].toUpperCase() + slot.slice(1)}</option>)}
          </select>
        )}
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as typeof rarityFilter)} style={SELECT_STYLE}>
          <option value="">All rarities</option>
          {RARITY_ORDER.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as BrowseSort)} style={SELECT_STYLE} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="priceAsc">Price: low to high</option>
          <option value="priceDesc">Price: high to low</option>
          <option value="level">Level: high to low</option>
          <option value="ending">Ending soon</option>
        </select>
        <select value={tagMode} onChange={(e) => setTagMode(e.target.value)} style={SELECT_STYLE} aria-label="Upgrade tags"
          title="Tag gear that's an upgrade over what a hero has equipped">
          <option value="off">Upgrade tags: off</option>
          <option value="all">Upgrade tags: all heroes</option>
          {heroes.map((h) => <option key={h.id} value={h.id}>Upgrade tags: {h.name} (Lv {h.level})</option>)}
        </select>
        <label className="tiny" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title={`Gear from level ${range.min} to ${range.max} -- 3 levels either side of your heroes. Consumables always show.`}>
          <input type="checkbox" checked={nearLevel} onChange={(e) => setNearLevel(e.target.checked)} />
          Near my level ({range.min}-{range.max})
        </label>
      </div>

      {loading ? (
        <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Loading listings...</p></div>
      ) : listings === null ? (
        <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Couldn't load listings right now -- try again in a moment.</p></div>
      ) : visible.length === 0 ? (
        <div className="card">
          <p className="tiny muted" style={{ margin: 0 }}>
            {listings.length === 0 ? 'Nothing listed right now -- check back later, or list something yourself.'
              : needle ? `Nothing matches "${search.trim()}"${nearLevel ? ' near your heroes\' levels -- try unticking "Near my level"' : ''}.`
              : nearLevel ? 'Nothing near your heroes\' levels right now -- untick "Near my level" to see everything.' : 'Nothing matches those filters.'}
          </p>
        </div>
      ) : (
        <>
          <p className="tiny muted" style={{ margin: '0 0 6px' }}>{visible.length} of {listings.length} listings · click one to inspect it</p>
          <div className="item-card-grid">
            {visible.map((row) => (
              <ListingCard key={row.id} row={row} heroes={heroes} tagMode={tagMode} buying={buyingId === row.id} bought={boughtId === row.id}
                onBuy={(btn) => handleBuy(row, btn)} onInspect={() => setInspecting(row)} />
            ))}
          </div>
        </>
      )}

      {inspecting && (
        <ListingInspectModal
          row={inspecting} heroes={heroes} buying={buyingId === inspecting.id}
          onClose={() => setInspecting(null)}
          onBuy={() => { const row = inspecting; setInspecting(null); void handleBuy(row, null); }}
        />
      )}
    </>
  );
}

/** Patch 0463 -- a listing card is clickable (opens the inspect window);
 *  the Buy button still buys straight away without opening it. */
function ListingCard({ row, heroes, tagMode, buying, bought = false, onBuy, onInspect }: {
  row: ServerListingRow; heroes: Hero[]; tagMode: UpgradeTagMode; buying: boolean; bought?: boolean;
  onBuy: (btn: HTMLElement | null) => void; onInspect: () => void;
}) {
  const cardProps = {
    className: `item-card rarity-card ah-listing ${bought ? 'ahx-bought fx-ah' : ''}`,
    onClick: onInspect,
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onInspect(); } },
  };
  const buyButton = (
    <button className="btn-primary item-card-action" disabled={buying || bought} onClick={(e) => { e.stopPropagation(); onBuy(e.currentTarget); }}>
      {buying ? 'Buying...' : bought ? 'Bought' : 'Buy'}
    </button>
  );
  if (row.item_type === 'shard') {
    if (shardAmountOf(row) < 1) return null;
    return (
      <div {...cardProps}>
        <ShardListingSummary row={row} />
        {buyButton}
        {bought && <span className="ahx-stamp">Yours</span>}
      </div>
    );
  }
  if (row.item_type === 'equipment') {
    const item = row.item_payload as EquipmentItem;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return null;
    const upgrades = taggedHeroes(row, heroes, tagMode);
    return (
      <div {...cardProps}>
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} size={48} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>
              {itemDisplayName(item, def)}{item.plus > 0 ? ` +${item.plus}` : ''}
            </div>
            <div className="tiny muted">Lv {item.rolledItemLevel ?? def.reqLevel} · {formatGold(Number(row.price))} {row.currency}</div>
            {upgrades.length > 0 && (
              <div className="tiny good ah-upgrade" title={`Better than what ${upgrades.map((h) => h.name).join(', ')} ${upgrades.length === 1 ? 'has' : 'have'} equipped`}>
                ▲ Upgrade for {upgrades[0].name}{upgrades.length > 1 ? ` +${upgrades.length - 1}` : ''}
              </div>
            )}
          </div>
        </div>
        {buyButton}
        {bought && <span className="ahx-stamp">Yours</span>}
      </div>
    );
  }

  const payload = row.item_payload as { defId?: string };
  const def = payload.defId ? CONSUMABLE_BY_ID[payload.defId] : undefined;
  if (!def) return null;
  return (
    <div {...cardProps}>
      <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
      <div className="item-card-summary">
        <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
        <div className="item-card-body">
          <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</div>
          <div className="tiny muted">{formatGold(Number(row.price))} {row.currency}</div>
        </div>
      </div>
      {buyButton}
      {bought && <span className="ahx-stamp">Yours</span>}
    </div>
  );
}

/**
 * Patch 0463 -- inspect a listing before buying: the same detail the
 * Inventory's item window shows (stats, enchantments, elements, set
 * bonus, durability), which of your heroes it would upgrade, and the
 * price next to what the game's shop would charge for that exact item.
 */
function ListingInspectModal({ row, heroes, buying, onClose, onBuy }: {
  row: ServerListingRow; heroes: Hero[]; buying: boolean; onClose: () => void; onBuy: () => void;
}) {
  const price = Number(row.price);
  const shop = auctionShopValue(row.item_type, row.item_payload);
  const rarity = auctionItemRarity(row.item_type, row.item_payload) ?? 'common';
  const name = auctionItemName(row.item_type, row.item_payload);

  let icon: JSX.Element | null = null;
  let subtitle = '';
  let details: JSX.Element | null = null;

  if (row.item_type === 'equipment') {
    const item = row.item_payload as EquipmentItem;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (def) {
      const topHero = [...heroes].sort((a, b) => b.level - a.level)[0];
      const upgrades = upgradeHeroes(row, heroes);
      const canWear = heroes.filter((h) => h.level >= def.reqLevel);
      const statLines = [
        ...describeMods(item.customMods ?? def.mods ?? {}),
        ...describeStats(def.stats, true),
        ...(item.rolledStats ? describeStats(item.rolledStats, true) : []),
      ];
      icon = <ItemIcon slot={def.slot} icon={def.icon} size={48} broken={EquipmentManager.isBroken(item)} />;
      subtitle = `${def.slot} · item level ${item.rolledItemLevel ?? def.reqLevel} · requires level ${def.reqLevel}`;
      details = (
        <>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            <RarityPill rarity={def.rarity} />
            {def.setId && <SetPill />}
          </div>
          <div className="tiny muted">{statLines.length > 0 ? statLines.join(' · ') : 'No bonuses'}</div>
          {item.enchantStats && Object.keys(item.enchantStats).length > 0 && (
            <div className="tiny" style={{ marginTop: 2, color: 'var(--brass)' }} title={item.enchantStats.strength ? MAIN_STAT_TOOLTIP : undefined}>
              Enchanted: {describeStats(item.enchantStats, true).join(' · ')}
            </div>
          )}
          <ElementalInfoLine item={item} />
          {def.setId && topHero && <SetInfoBlock hero={upgrades[0] ?? topHero} setId={def.setId} equipped={false} />}
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {item.durability === 0 ? 'Broken, no bonuses until repaired' : `Durability ${item.durability}/${EquipmentManager.maxDurability(item)}`}
          </div>
          <div className="tiny" style={{ marginTop: 6 }}>
            {upgrades.length > 0
              ? <span className="good">▲ Upgrade for {upgrades.map((h) => `${h.name} (Lv ${h.level})`).join(', ')}</span>
              : canWear.length === 0
                ? <span style={{ color: 'var(--blood)' }}>None of your heroes can wear this yet (needs level {def.reqLevel}).</span>
                : <span className="muted">Not an upgrade over what your heroes have equipped.</span>}
          </div>
        </>
      );
    }
  } else if (row.item_type === 'consumable') {
    const defId = (row.item_payload as { defId?: string })?.defId;
    const def = defId ? CONSUMABLE_BY_ID[defId] : undefined;
    if (def) {
      icon = <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />;
      subtitle = 'consumable';
      details = (
        <>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}><RarityPill rarity={def.rarity} /></div>
          <div className="tiny muted">{def.description}</div>
        </>
      );
    }
  } else if (row.item_type === 'shard') {
    const amount = shardAmountOf(row);
    icon = <ConsumableIcon icon={SHARD_ICON} glyph={SHARD_GLYPH} size={48} />;
    subtitle = 'Legendary Shard stack';
    details = (
      <div className="tiny muted">
        {SHARD_NAME}s repair and enhance Legendary gear.{amount > 1 ? ` ${formatGold(Math.ceil(price / amount))} ${row.currency} each.` : ''}
      </div>
    );
  }

  const shopInCurrency = shop == null ? null : row.currency === 'scrap' ? goldToScrap(shop) : shop;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Inspect ${name}`}>
        <div className="modal-banner" style={{ backgroundImage: `url(${RARITY_BANNER[rarity]})` }} />
        <div className="modal-banner-scrim">
          <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
            {icon}
            <div>
              <span className="card-title" style={{ color: RARITY_COLOR[rarity] }}>{name}</span>
              {subtitle && <div className="tiny muted" style={{ textTransform: 'none' }}>{subtitle}</div>}
            </div>
          </div>
          {details}
          <div className="ah-inspect-price">
            <div><span className="muted tiny">Price</span> <b>{formatGold(price)} {row.currency}</b></div>
            {shopInCurrency != null && (
              <div className="tiny muted" title="What the game's own shop would charge for this exact item">
                Shop price {formatGold(shopInCurrency)} {row.currency}
                {shopInCurrency > 0 && price < shopInCurrency ? <span className="good"> · {Math.round(100 - (price / shopInCurrency) * 100)}% under</span> : null}
                {shopInCurrency > 0 && price > shopInCurrency ? <span style={{ color: 'var(--blood)' }}> · {Math.round((price / shopInCurrency) * 100 - 100)}% over</span> : null}
              </div>
            )}
            <div className="tiny muted">{timeLeft(row.expires_at)}</div>
          </div>
          <div className="row end wrap" style={{ gap: 8, marginTop: 12 }}>
            <button onClick={onClose}>Close</button>
            <button className="btn-primary" disabled={buying} onClick={onBuy}>{buying ? 'Buying...' : `Buy for ${formatGold(price)} ${row.currency}`}</button>
          </div>
        </div>
      </div>
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
  const [duration, setDuration] = useState<ListingHours>(LISTING_HOURS_BASE);
  const [submitting, setSubmitting] = useState(false);
  // Patch 0454 -- stack size, shard drafts only.
  const shardsOwned = engine.state.legendaryShards ?? 0;
  const [shardQty, setShardQty] = useState('1');

  const hasExtended = GuildManager.upgradeLevel(engine.state, 'auction_house_charter') >= 2;
  const priceNum = Number(price) || 0;
  const estDeposit = priceNum > 0 ? Math.max(1, Math.ceil(priceNum * 0.05)) : 0;

  // Patch 0463 -- pricing help: shop price for this exact item and the
  // cheapest similar listing up now, with one-tap fills.
  const draftType = draft.kind;
  const draftPayload = draft.kind === 'equipment' ? draft.item : draft.kind === 'consumable' ? { defId: draft.consumableId } : { defId: 'legendary_shard' };
  const shopGold = auctionShopValue(draftType, draftPayload);
  const [similar, setSimilar] = useState<ServerListingRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    engine.fetchAuctionListings({ itemType: draftType }).then((rows) => { if (!cancelled) setSimilar(rows ?? []); });
    return () => { cancelled = true; };
  }, [draftType]); // eslint-disable-line react-hooks/exhaustive-deps
  const qty = draft.kind === 'shard' ? Math.max(1, Math.floor(Number(shardQty) || 1)) : 1;
  const myLevel = auctionItemLevel(draftType, draftPayload);
  const matches = (similar ?? []).filter((row) => {
    if (row.currency !== currency) return false;
    if (draft.kind === 'shard') return true;
    if ((row.item_payload as { defId?: string })?.defId !== (draftPayload as { defId: string }).defId) return false;
    if (myLevel == null) return true;
    const lvl = auctionItemLevel(row.item_type, row.item_payload);
    return lvl != null && Math.abs(lvl - myLevel) <= 3;
  });
  // Shard stacks compare per Shard, scaled to the stack being listed.
  const unitPrice = (row: ServerListingRow) => Number(row.price) / (draft.kind === 'shard' ? Math.max(1, shardAmountOf(row)) : 1);
  const cheapestUnit = matches.length > 0 ? Math.min(...matches.map(unitPrice)) : null;
  const cheapest = cheapestUnit == null ? null : Math.max(1, Math.round(cheapestUnit * qty));
  const shopInCurrency = shopGold == null ? null : currency === 'scrap' ? goldToScrap(shopGold) : shopGold;
  const suggested = shopInCurrency == null ? null : Math.max(1, Math.round(shopInCurrency * 0.9));

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
      <div className="ah-price-help tiny">
        {shopInCurrency != null && (
          <div title="What the game's own shop charges for this exact item">Shop price: <b>{formatGold(shopInCurrency)} {currency}</b></div>
        )}
        <div>
          {similar === null ? <span className="muted">Checking current listings...</span>
            : cheapest != null ? <>Cheapest similar up now: <b>{formatGold(cheapest)} {currency}</b>{draft.kind === 'shard' && qty > 1 ? ` for ${qty}` : ''} <span className="muted">({matches.length} listed)</span></>
            : <span className="muted">No similar {currency}-priced listings up right now.</span>}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {cheapest != null && cheapest > 1 && (
            <button className="btn-ghost" onClick={() => setPrice(String(cheapest - 1))}>Undercut: {formatGold(cheapest - 1)}</button>
          )}
          {suggested != null && (
            <button className="btn-ghost" onClick={() => setPrice(String(suggested))}>A bit under shop: {formatGold(suggested)}</button>
          )}
        </div>
        {shopInCurrency != null && <div className="muted" style={{ marginTop: 4 }}>Listings a little under shop price tend to sell well.</div>}
      </div>
      <input
        type="number" min="1" placeholder={draft.kind === 'shard' ? 'Price for the whole stack' : 'Price'} value={price}
        onChange={(e) => setPrice(e.target.value)}
        style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--text)', padding: '7px 8px', marginBottom: 10 }}
      />
      <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
        {/* Patch 0461 -- 7 / 14 days (were 24h / 48h). */}
        <button className={duration === LISTING_HOURS_BASE ? 'btn-primary' : 'btn-ghost'} onClick={() => setDuration(LISTING_HOURS_BASE)}>7 days</button>
        <button className={duration === LISTING_HOURS_EXTENDED ? 'btn-primary' : 'btn-ghost'} disabled={!hasExtended} onClick={() => setDuration(LISTING_HOURS_EXTENDED)}>14 days</button>
        {!hasExtended && <span className="tiny muted">Auction House Charter level 2 unlocks 14-day listings</span>}
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
