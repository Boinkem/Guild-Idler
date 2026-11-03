import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { EquipmentItem, Rarity } from '../game/types';
import { RARITY_COLOR, formatGold } from '../game/util';
import { EQUIPMENT_BY_ID, itemDisplayName } from '../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../game/data/items';
import { ItemIcon, ConsumableIcon } from './icons';
import { SHARD_GLYPH, SHARD_ICON, shardLabel } from '../game/data/shards';
import { AhLedger, AhLedgerPeriod, AhLedgerTrade } from '../game/auctionHouse';

/**
 * My Ledger -- the player's own Auction House dashboard. Everything here
 * is about this player only: gold and scrap in/out, what they've sold
 * and bought, how their listings tend to do, and their recent trades.
 * Data: GET /ledger?period= (server/src/ledger.ts). Patch 0458.
 */

const PERIODS: { id: AhLedgerPeriod; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All time' },
];

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '--';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${Math.round(minutes % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  return `${formatDuration(mins).split(' ')[0]} ago`;
}

/** 'YYYY-MM-DD' -> a local Date at midnight. `new Date('2026-11-02')` would
 *  parse as UTC and land on the wrong day west of Greenwich. */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatGold(Math.abs(n))}`;
}

function tradeItem(t: AhLedgerTrade): { name: string; rarity: Rarity | null; icon: JSX.Element | null } {
  if (t.itemType === 'shard') {
    const amount = Math.max(1, Math.floor(Number((t.itemPayload as { amount?: number })?.amount) || 1));
    return { name: shardLabel(amount), rarity: 'legendary', icon: <ConsumableIcon icon={SHARD_ICON} glyph={SHARD_GLYPH} size={32} /> };
  }
  if (t.itemType === 'equipment') {
    const item = t.itemPayload as EquipmentItem;
    const def = EQUIPMENT_BY_ID[item?.defId];
    if (!def) return { name: item?.defId ?? 'Unknown gear', rarity: null, icon: null };
    return {
      name: `${itemDisplayName(item, def)}${item.plus > 0 ? ` +${item.plus}` : ''}`,
      rarity: def.rarity,
      icon: <ItemIcon slot={def.slot} icon={def.icon} size={32} />,
    };
  }
  const defId = (t.itemPayload as { defId?: string })?.defId;
  const def = defId ? CONSUMABLE_BY_ID[defId] : undefined;
  if (!def) return { name: defId ?? 'Unknown item', rarity: null, icon: null };
  return { name: def.name, rarity: def.rarity, icon: <ConsumableIcon icon={def.icon} glyph={def.glyph} size={32} /> };
}

function CurrencyCard({ kind, earned, spent, depositsLost }: { kind: 'gold' | 'scrap'; earned: number; spent: number; depositsLost: number }) {
  const net = earned - spent - depositsLost;
  return (
    <div className={`ahl-currency ahl-${kind}`}>
      <div className="ahl-currency-head">{kind === 'gold' ? '🪙 Gold' : '⚙️ Scrap'}</div>
      <div className={`ahl-net ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>{signed(net)}</div>
      <div className="ahl-currency-rows">
        <span>Earned</span><b className="up">{formatGold(earned)}</b>
        <span>Spent</span><b className="down">{formatGold(spent)}</b>
        {depositsLost > 0 && (<><span>Deposits lost</span><b className="down">{formatGold(depositsLost)}</b></>)}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ahl-tile">
      <div className="ahl-tile-label">{label}</div>
      <div className="ahl-tile-value">{value}</div>
      {sub && <div className="ahl-tile-sub">{sub}</div>}
    </div>
  );
}

function DailyChart({ daily }: { daily: AhLedger['daily'] }) {
  const [currency, setCurrency] = useState<'gold' | 'scrap'>('gold');
  const rows = daily.map((d) => ({
    day: d.day,
    earned: currency === 'gold' ? d.goldEarned : d.scrapEarned,
    spent: currency === 'gold' ? d.goldSpent : d.scrapSpent,
  }));
  const max = Math.max(1, ...rows.map((r) => Math.max(r.earned, r.spent)));
  const hasAny = rows.some((r) => r.earned > 0 || r.spent > 0);
  return (
    <div>
      <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span className="tiny muted">Last 14 days</span>
        <div style={{ flex: 1 }} />
        <button className={currency === 'gold' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('gold')}>Gold</button>
        <button className={currency === 'scrap' ? 'btn-primary' : 'btn-ghost'} onClick={() => setCurrency('scrap')}>Scrap</button>
      </div>
      {!hasAny ? (
        <p className="tiny muted" style={{ margin: 0 }}>No {currency} trades in the last 14 days.</p>
      ) : (
        <div className="ahl-chart">
          {rows.map((r) => {
            const date = parseDay(r.day);
            const label = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
            return (
              <div key={r.day} className="ahl-day" title={`${label}: earned ${formatGold(r.earned)}, spent ${formatGold(r.spent)} ${currency}`}>
                <div className="ahl-day-bars">
                  <span className="ahl-bar earned" style={{ height: `${(r.earned / max) * 100}%` }} />
                  <span className="ahl-bar spent" style={{ height: `${(r.spent / max) * 100}%` }} />
                </div>
                <span className="ahl-day-label">{date.getDate()}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="ahl-legend tiny muted">
        <span><i className="ahl-swatch earned" />Earned</span>
        <span><i className="ahl-swatch spent" />Spent</span>
      </div>
    </div>
  );
}

function TradeRow({ t }: { t: AhLedgerTrade }) {
  const { name, rarity, icon } = tradeItem(t);
  return (
    <div className="ahl-trade">
      <span className={`ahl-side ${t.side}`}>{t.side === 'sold' ? 'Sold' : 'Bought'}</span>
      <span className="ahl-trade-icon">{icon}</span>
      <span className="ahl-trade-name" style={rarity ? { color: RARITY_COLOR[rarity] } : undefined}>{name}</span>
      <span className={`ahl-trade-price ${t.side === 'sold' ? 'up' : 'down'}`}>
        {t.side === 'sold' ? '+' : '−'}{formatGold(t.price)} {t.currency}
      </span>
      <span className="tiny muted ahl-trade-when">
        {timeAgo(t.at)}{t.side === 'sold' && t.minutesToSell != null ? ` · sold in ${formatDuration(t.minutesToSell)}` : ''}
      </span>
    </div>
  );
}

function Highlight({ title, t }: { title: string; t: AhLedgerTrade | null }) {
  if (!t) return null;
  const { name, rarity, icon } = tradeItem(t);
  return (
    <div className="ahl-highlight">
      <div className="ahl-tile-label">{title}</div>
      <div className="ahl-highlight-body">
        {icon}
        <div style={{ minWidth: 0 }}>
          <div className="ahl-trade-name" style={rarity ? { color: RARITY_COLOR[rarity] } : undefined}>{name}</div>
          <div className="tiny muted">{formatGold(t.price)} {t.currency} · {timeAgo(t.at)}</div>
        </div>
      </div>
    </div>
  );
}

export function AuctionLedger() {
  const engine = useEngine();
  const [period, setPeriod] = useState<AhLedgerPeriod>('7d');
  const [ledger, setLedger] = useState<AhLedger | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (p: AhLedgerPeriod) => {
    setLoading(true);
    engine.fetchAuctionLedger(p).then((result) => {
      setLedger(result);
      setLoading(false);
    });
  };

  useEffect(() => { load(period); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
      {PERIODS.map((p) => (
        <button key={p.id} className={period === p.id ? 'btn-primary' : 'btn-ghost'} onClick={() => setPeriod(p.id)}>{p.label}</button>
      ))}
      <div style={{ flex: 1 }} />
      <button className="btn-ghost" onClick={() => load(period)} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
    </div>
  );

  if (loading && !ledger) {
    return <>{header}<div className="card"><p className="tiny muted" style={{ margin: 0 }}>Opening your ledger...</p></div></>;
  }
  if (!ledger) {
    return (
      <>
        {header}
        <div className="card"><p className="tiny muted" style={{ margin: 0 }}>Couldn't open your ledger right now -- it needs a Steam session and a connection. Try again in a moment.</p></div>
      </>
    );
  }

  const nothingYet = ledger.sold === 0 && ledger.bought === 0 && ledger.listed === 0;

  return (
    <div className="ahl">
      {header}

      {nothingYet ? (
        <div className="card">
          <p className="tiny muted" style={{ margin: 0 }}>
            Nothing in the ledger for this period -- list something on the Sell tab or buy from Browse and it'll show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="ahl-currencies">
            <CurrencyCard kind="gold" earned={ledger.gold.earned} spent={ledger.gold.spent} depositsLost={ledger.gold.depositsLost} />
            <CurrencyCard kind="scrap" earned={ledger.scrap.earned} spent={ledger.scrap.spent} depositsLost={ledger.scrap.depositsLost} />
          </div>

          <div className="ahl-tiles">
            <Tile label="Sold" value={formatGold(ledger.sold)} sub={`${ledger.listed} listed`} />
            <Tile label="Bought" value={formatGold(ledger.bought)} />
            <Tile label="Sell-through" value={ledger.sellThrough == null ? '--' : `${Math.round(ledger.sellThrough * 100)}%`}
              sub={`${ledger.expired} expired · ${ledger.cancelled} cancelled`} />
            <Tile label="Avg time to sell" value={formatDuration(ledger.avgMinutesToSell)} />
            <Tile label="Listed now" value={`${ledger.active} / ${ledger.activeCap}`} />
          </div>

          {(ledger.bestSale || ledger.biggestBuy) && (
            <div className="ahl-highlights">
              <Highlight title="Best sale" t={ledger.bestSale} />
              <Highlight title="Biggest purchase" t={ledger.biggestBuy} />
            </div>
          )}

          <div className="section-heading">Earned vs spent</div>
          <div className="card"><DailyChart daily={ledger.daily} /></div>

          <div className="section-heading">Recent trades</div>
          <div className="card">
            {ledger.recent.length === 0 ? (
              <p className="tiny muted" style={{ margin: 0 }}>No trades yet in this period.</p>
            ) : (
              <div className="ahl-trades">{ledger.recent.map((t, i) => <TradeRow key={`${t.at}-${i}`} t={t} />)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
