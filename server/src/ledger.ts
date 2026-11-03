import { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db.js';
import { AppConfig } from './config.js';
import { MAX_ACTIVE_LISTINGS_PER_SELLER, requireAuth } from './listings.js';

/**
 * My Ledger (patch 0458) -- the player's own Auction House dashboard.
 * One authenticated route, `GET /ledger?period=7d|30d|all&tzOffset=<min>`,
 * everything scoped to the caller's SteamID. See AuctionLedger.tsx.
 *
 * No migration. Timestamps used are ones that already exist:
 * `transactions.created_at` (a sale), `listings.created_at` (a listing
 * posted), `listings.sold_at`. A cancel has no timestamp of its own, so
 * listed / expired / cancelled / sell-through / deposits lost are a
 * COHORT: the listings the player POSTED in the period, and how each has
 * ended so far. Sales, purchases, earned and spent are by the time of the
 * sale. An `active` row whose expiry has passed but hasn't been swept yet
 * counts as expired (its deposit is forfeit either way).
 *
 * `tzOffset` is the client's `Date.getTimezoneOffset()` (minutes, UTC
 * minus local) so the 14-day chart buckets on the player's own midnight,
 * not the server's. Bounded to +-14h; anything else falls back to UTC.
 *
 * All BIGINT/numeric values are converted to JS numbers here.
 */

type Period = '7d' | '30d' | 'all';
const PERIOD_INTERVAL: Record<Period, string | null> = { '7d': '7 days', '30d': '30 days', all: null };
const RECENT_LIMIT = 10;
const DAILY_DAYS = 14;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

interface LedgerTrade {
  side: 'sold' | 'bought';
  itemType: string;
  itemPayload: unknown;
  currency: string;
  price: number;
  at: string;
  minutesToSell?: number;
}

function toTrade(row: Record<string, unknown>): LedgerTrade {
  const trade: LedgerTrade = {
    side: row.side as 'sold' | 'bought',
    itemType: row.item_type as string,
    itemPayload: row.item_payload,
    currency: row.currency as string,
    price: num(row.price),
    at: new Date(row.at as string).toISOString(),
  };
  if (trade.side === 'sold' && row.minutes_to_sell != null) trade.minutesToSell = Math.round(num(row.minutes_to_sell));
  return trade;
}

/** Every trade the player was on either side of, with its listing's item.
 *  `$1` = steamId. Used as a CTE by the queries below. */
const MY_TRADES = `
  SELECT CASE WHEN t.seller_steam_id = $1 THEN 'sold' ELSE 'bought' END AS side,
         l.item_type, l.item_payload, t.currency, t.price, t.created_at AS at,
         extract(epoch FROM (t.created_at - l.created_at)) / 60 AS minutes_to_sell
  FROM transactions t
  JOIN listings l ON l.id = t.listing_id
  WHERE t.seller_steam_id = $1 OR t.buyer_steam_id = $1`;

export async function computeLedger(steamId: string, period: Period, tzOffsetMinutes: number) {
  const pool = getPool();
  const interval = PERIOD_INTERVAL[period];
  // $2 is always the window start; 'all' uses -infinity so every query keeps one shape.
  const since = interval ? `now() - interval '${interval}'` : `'-infinity'::timestamptz`;

  const [totals, cohort, active, best, recent, daily] = await Promise.all([
    pool.query(
      `WITH mine AS (${MY_TRADES})
       SELECT count(*) FILTER (WHERE side = 'sold')::int AS sold,
              count(*) FILTER (WHERE side = 'bought')::int AS bought,
              coalesce(sum(price) FILTER (WHERE side = 'sold' AND currency = 'gold'), 0) AS gold_earned,
              coalesce(sum(price) FILTER (WHERE side = 'bought' AND currency = 'gold'), 0) AS gold_spent,
              coalesce(sum(price) FILTER (WHERE side = 'sold' AND currency = 'scrap'), 0) AS scrap_earned,
              coalesce(sum(price) FILTER (WHERE side = 'bought' AND currency = 'scrap'), 0) AS scrap_spent,
              avg(minutes_to_sell) FILTER (WHERE side = 'sold') AS avg_minutes
       FROM mine WHERE at > ${since}`,
      [steamId]
    ),
    pool.query(
      `SELECT count(*)::int AS listed,
              count(*) FILTER (WHERE status = 'sold')::int AS sold,
              count(*) FILTER (WHERE status = 'expired' OR (status = 'active' AND expires_at <= now()))::int AS expired,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              coalesce(sum(deposit_amount) FILTER (WHERE currency = 'gold'
                AND (status IN ('expired', 'cancelled') OR (status = 'active' AND expires_at <= now()))), 0) AS gold_lost,
              coalesce(sum(deposit_amount) FILTER (WHERE currency = 'scrap'
                AND (status IN ('expired', 'cancelled') OR (status = 'active' AND expires_at <= now()))), 0) AS scrap_lost
       FROM listings
       WHERE seller_steam_id = $1 AND created_at > ${since}`,
      [steamId]
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM listings
       WHERE seller_steam_id = $1 AND status = 'active' AND expires_at > now()`,
      [steamId]
    ),
    // Best sale / biggest buy: gold and scrap aren't comparable, so gold
    // wins when the player has any gold trade in the period, else scrap.
    pool.query(
      `WITH mine AS (${MY_TRADES}), ranked AS (
         SELECT *, row_number() OVER (PARTITION BY side ORDER BY (currency = 'gold') DESC, price DESC, at DESC) AS rn
         FROM mine WHERE at > ${since}
       )
       SELECT * FROM ranked WHERE rn = 1`,
      [steamId]
    ),
    pool.query(
      `WITH mine AS (${MY_TRADES})
       SELECT * FROM mine WHERE at > ${since} ORDER BY at DESC LIMIT ${RECENT_LIMIT}`,
      [steamId]
    ),
    // Always the last 14 local days, whatever the period.
    pool.query(
      `WITH mine AS (${MY_TRADES}),
       today AS (SELECT (now() AT TIME ZONE 'UTC' - make_interval(mins => $2))::date AS d),
       days AS (
         SELECT generate_series((SELECT d FROM today) - ${DAILY_DAYS - 1}, (SELECT d FROM today), interval '1 day')::date AS day
       ), bucketed AS (
         SELECT (at AT TIME ZONE 'UTC' - make_interval(mins => $2))::date AS day, side, currency, price FROM mine
         WHERE at > now() - interval '${DAILY_DAYS + 1} days'
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              coalesce(sum(b.price) FILTER (WHERE b.side = 'sold' AND b.currency = 'gold'), 0) AS gold_earned,
              coalesce(sum(b.price) FILTER (WHERE b.side = 'bought' AND b.currency = 'gold'), 0) AS gold_spent,
              coalesce(sum(b.price) FILTER (WHERE b.side = 'sold' AND b.currency = 'scrap'), 0) AS scrap_earned,
              coalesce(sum(b.price) FILTER (WHERE b.side = 'bought' AND b.currency = 'scrap'), 0) AS scrap_spent
       FROM days LEFT JOIN bucketed b ON b.day = days.day
       GROUP BY days.day ORDER BY days.day`,
      [steamId, tzOffsetMinutes]
    ),
  ]);

  const t = totals.rows[0];
  const c = cohort.rows[0];
  const resolved = c.sold + c.expired + c.cancelled;
  const bestSale = best.rows.find((r) => r.side === 'sold');
  const biggestBuy = best.rows.find((r) => r.side === 'bought');

  return {
    period,
    gold: { earned: num(t.gold_earned), spent: num(t.gold_spent), depositsLost: num(c.gold_lost) },
    scrap: { earned: num(t.scrap_earned), spent: num(t.scrap_spent), depositsLost: num(c.scrap_lost) },
    sold: t.sold,
    bought: t.bought,
    listed: c.listed,
    expired: c.expired,
    cancelled: c.cancelled,
    sellThrough: resolved > 0 ? c.sold / resolved : null,
    avgMinutesToSell: t.avg_minutes == null ? null : Math.round(num(t.avg_minutes)),
    active: active.rows[0].n,
    activeCap: MAX_ACTIVE_LISTINGS_PER_SELLER,
    bestSale: bestSale ? toTrade(bestSale) : null,
    biggestBuy: biggestBuy ? toTrade(biggestBuy) : null,
    daily: daily.rows.map((r) => ({
      day: r.day as string,
      goldEarned: num(r.gold_earned),
      goldSpent: num(r.gold_spent),
      scrapEarned: num(r.scrap_earned),
      scrapSpent: num(r.scrap_spent),
    })),
    recent: recent.rows.map(toTrade),
  };
}

export function registerLedgerRoutes(app: FastifyInstance, config: AppConfig) {
  const auth = requireAuth(config);
  app.get<{ Querystring: { period?: string; tzOffset?: string } }>('/ledger', { preHandler: auth }, async (request) => {
    const steamId = (request as FastifyRequest & { steamId: string }).steamId;
    const period: Period = request.query.period === '30d' || request.query.period === 'all' ? request.query.period : '7d';
    const offset = Number(request.query.tzOffset);
    const tzOffset = Number.isInteger(offset) && Math.abs(offset) <= 14 * 60 ? offset : 0;
    return { ledger: await computeLedger(steamId, period, tzOffset) };
  });
}
