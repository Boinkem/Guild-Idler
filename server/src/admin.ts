import { timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getPool } from './db.js';
import { AppConfig } from './config.js';

/**
 * Admin usage stats (patch 0459) -- how much the Auction House actually
 * gets used. Read only. Consumed by the DevTool's Auction House tab
 * (tools/devtool), never by the game client.
 *
 * `GET /admin/stats` with `Authorization: Bearer <AH_ADMIN_TOKEN>`.
 * Registered only when both DATABASE_URL and AH_ADMIN_TOKEN are set
 * (index.ts), and let through the AH_ENABLED gate so the numbers can be
 * read while the Auction House is switched off.
 *
 * No migration. Listing outcomes (listed / sold / expired / cancelled,
 * sell-through, deposits forfeited) are a COHORT -- listings POSTED in the
 * window and how each has ended so far -- because a cancel has no
 * timestamp of its own. Sales, volume and buyers go by sale time. An
 * `active` row past its expiry that the sweep hasn't reached counts as
 * expired. System-seeded (broker) listings have a NULL seller and are
 * excluded from every "players" count.
 *
 * Every BIGINT/numeric becomes a JS number here.
 */

const DAILY_DAYS = 30;
const TOP_LIMIT = 10;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function requireAdmin(config: AppConfig) {
  const expected = Buffer.from(config.adminToken);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '');
    const ok = given.length === expected.length && expected.length > 0 && timingSafeEqual(given, expected);
    if (!ok) {
      reply.code(401);
      throw new Error('Missing or invalid admin token.');
    }
  };
}

async function windowStats(interval: string) {
  const pool = getPool();
  const [sales, cohort, traders] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS sales,
              count(DISTINCT buyer_steam_id)::int AS buyers,
              count(DISTINCT seller_steam_id)::int AS sellers_paid,
              coalesce(sum(price) FILTER (WHERE currency = 'gold'), 0) AS gold_volume,
              coalesce(sum(price) FILTER (WHERE currency = 'scrap'), 0) AS scrap_volume,
              count(*) FILTER (WHERE currency = 'gold')::int AS gold_sales,
              count(*) FILTER (WHERE currency = 'scrap')::int AS scrap_sales
       FROM transactions WHERE created_at > now() - $1::interval`,
      [interval]
    ),
    pool.query(
      `SELECT count(*)::int AS listed,
              count(DISTINCT seller_steam_id)::int AS sellers,
              count(*) FILTER (WHERE seller_steam_id IS NULL)::int AS broker,
              count(*) FILTER (WHERE status = 'sold')::int AS sold,
              count(*) FILTER (WHERE status = 'expired' OR (status = 'active' AND expires_at <= now()))::int AS expired,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE status = 'active' AND expires_at > now())::int AS active,
              coalesce(sum(deposit_amount) FILTER (WHERE currency = 'gold' AND (status IN ('expired', 'cancelled')
                OR (status = 'active' AND expires_at <= now()))), 0) AS gold_forfeit,
              coalesce(sum(deposit_amount) FILTER (WHERE currency = 'scrap' AND (status IN ('expired', 'cancelled')
                OR (status = 'active' AND expires_at <= now()))), 0) AS scrap_forfeit,
              avg(extract(epoch FROM (sold_at - created_at)) / 60) FILTER (WHERE status = 'sold') AS avg_minutes
       FROM listings WHERE created_at > now() - $1::interval`,
      [interval]
    ),
    // Anyone who listed, bought or sold in the window.
    pool.query(
      `SELECT count(DISTINCT id)::int AS n FROM (
         SELECT seller_steam_id AS id FROM listings WHERE created_at > now() - $1::interval
         UNION SELECT buyer_steam_id FROM transactions WHERE created_at > now() - $1::interval
       ) x WHERE id IS NOT NULL`,
      [interval]
    ),
  ]);
  const s = sales.rows[0];
  const c = cohort.rows[0];
  const resolved = c.sold + c.expired + c.cancelled;
  return {
    activePlayers: traders.rows[0].n,
    sales: s.sales,
    buyers: s.buyers,
    goldVolume: num(s.gold_volume),
    scrapVolume: num(s.scrap_volume),
    goldSales: s.gold_sales,
    scrapSales: s.scrap_sales,
    listed: c.listed,
    sellers: c.sellers,
    brokerListed: c.broker,
    outcome: { sold: c.sold, expired: c.expired, cancelled: c.cancelled, active: c.active },
    sellThrough: resolved > 0 ? c.sold / resolved : null,
    avgMinutesToSell: c.avg_minutes == null ? null : Math.round(num(c.avg_minutes)),
    depositsForfeited: { gold: num(c.gold_forfeit), scrap: num(c.scrap_forfeit) },
  };
}

export async function computeAdminStats() {
  const pool = getPool();
  const [live, mailbox, allTime, day, week, month, daily, topItems, topTraders] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS active,
              count(*) FILTER (WHERE item_type = 'equipment')::int AS equipment,
              count(*) FILTER (WHERE item_type = 'consumable')::int AS consumable,
              count(*) FILTER (WHERE item_type = 'shard')::int AS shard,
              count(*) FILTER (WHERE currency = 'gold')::int AS gold,
              count(*) FILTER (WHERE currency = 'scrap')::int AS scrap,
              count(DISTINCT seller_steam_id)::int AS sellers,
              count(*) FILTER (WHERE seller_steam_id IS NULL)::int AS broker,
              count(*) FILTER (WHERE expires_at <= now() + interval '1 hour')::int AS expiring,
              coalesce(sum((item_payload->>'amount')::bigint) FILTER (WHERE item_type = 'shard'), 0) AS shards,
              coalesce(sum(price) FILTER (WHERE currency = 'gold'), 0) AS gold_value,
              coalesce(sum(price) FILTER (WHERE currency = 'scrap'), 0) AS scrap_value
       FROM listings WHERE status = 'active' AND expires_at > now()`
    ),
    // Unclaimed server mailbox -- items/currency waiting for players to collect.
    pool.query(
      `SELECT count(*)::int AS entries,
              count(DISTINCT owner_steam_id)::int AS players,
              coalesce(sum(amount) FILTER (WHERE type = 'gold'), 0) AS gold,
              coalesce(sum(amount) FILTER (WHERE type = 'scrap'), 0) AS scrap,
              count(*) FILTER (WHERE type IN ('equipment', 'consumable', 'shard'))::int AS items,
              min(created_at) AS oldest
       FROM mailbox WHERE claimed_at IS NULL`
    ),
    pool.query(
      `SELECT (SELECT count(*)::int FROM transactions) AS sales,
              (SELECT coalesce(sum(price), 0) FROM transactions WHERE currency = 'gold') AS gold_volume,
              (SELECT coalesce(sum(price), 0) FROM transactions WHERE currency = 'scrap') AS scrap_volume,
              (SELECT count(*)::int FROM listings) AS listings,
              (SELECT count(DISTINCT id)::int FROM (
                 SELECT seller_steam_id AS id FROM listings UNION SELECT buyer_steam_id FROM transactions
               ) x WHERE id IS NOT NULL) AS players,
              (SELECT min(created_at) FROM listings) AS first_listing`
    ),
    windowStats('24 hours'),
    windowStats('7 days'),
    windowStats('30 days'),
    pool.query(
      `WITH days AS (
         SELECT generate_series((now() AT TIME ZONE 'UTC')::date - ${DAILY_DAYS - 1}, (now() AT TIME ZONE 'UTC')::date, interval '1 day')::date AS day
       ), s AS (
         SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS sales,
                coalesce(sum(price) FILTER (WHERE currency = 'gold'), 0) AS gold,
                coalesce(sum(price) FILTER (WHERE currency = 'scrap'), 0) AS scrap
         FROM transactions WHERE created_at > now() - interval '${DAILY_DAYS + 1} days' GROUP BY 1
       ), l AS (
         SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS listed
         FROM listings WHERE created_at > now() - interval '${DAILY_DAYS + 1} days' GROUP BY 1
       ), p AS (
         SELECT day, count(DISTINCT id)::int AS players FROM (
           SELECT (created_at AT TIME ZONE 'UTC')::date AS day, seller_steam_id AS id FROM listings
             WHERE created_at > now() - interval '${DAILY_DAYS + 1} days'
           UNION SELECT (created_at AT TIME ZONE 'UTC')::date, buyer_steam_id FROM transactions
             WHERE created_at > now() - interval '${DAILY_DAYS + 1} days'
         ) x WHERE id IS NOT NULL GROUP BY 1
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              coalesce(s.sales, 0) AS sales, coalesce(s.gold, 0) AS gold, coalesce(s.scrap, 0) AS scrap,
              coalesce(l.listed, 0) AS listed, coalesce(p.players, 0) AS players
       FROM days LEFT JOIN s USING (day) LEFT JOIN l USING (day) LEFT JOIN p USING (day)
       ORDER BY days.day`
    ),
    pool.query(
      `SELECT l.item_type, l.item_payload->>'defId' AS def_id, t.currency,
              count(*)::int AS sales,
              sum(CASE WHEN l.item_type = 'shard' THEN greatest(1, coalesce((l.item_payload->>'amount')::bigint, 1)) ELSE 1 END) AS units,
              sum(t.price) AS total,
              min(t.price::numeric / CASE WHEN l.item_type = 'shard' THEN greatest(1, coalesce((l.item_payload->>'amount')::bigint, 1)) ELSE 1 END) AS lowest,
              max(t.price::numeric / CASE WHEN l.item_type = 'shard' THEN greatest(1, coalesce((l.item_payload->>'amount')::bigint, 1)) ELSE 1 END) AS highest
       FROM transactions t JOIN listings l ON l.id = t.listing_id
       WHERE t.created_at > now() - interval '30 days'
       GROUP BY 1, 2, 3
       ORDER BY sales DESC, total DESC
       LIMIT ${TOP_LIMIT}`
    ),
    // Busiest players over 30 days, by trades either side -- for spotting
    // who's carrying the market, and anything that looks off.
    pool.query(
      `WITH sides AS (
         SELECT seller_steam_id AS id, 1 AS sold, 0 AS bought,
                CASE WHEN currency = 'gold' THEN price ELSE 0 END AS gold_in, 0 AS gold_out,
                CASE WHEN currency = 'scrap' THEN price ELSE 0 END AS scrap_in, 0 AS scrap_out
         FROM transactions WHERE created_at > now() - interval '30 days' AND seller_steam_id IS NOT NULL
         UNION ALL
         SELECT buyer_steam_id, 0, 1, 0, CASE WHEN currency = 'gold' THEN price ELSE 0 END,
                0, CASE WHEN currency = 'scrap' THEN price ELSE 0 END
         FROM transactions WHERE created_at > now() - interval '30 days'
       ), active AS (
         SELECT seller_steam_id AS id, count(*)::int AS n FROM listings
         WHERE status = 'active' AND expires_at > now() AND seller_steam_id IS NOT NULL GROUP BY 1
       )
       SELECT sides.id, sum(sold)::int AS sold, sum(bought)::int AS bought,
              sum(gold_in) AS gold_in, sum(gold_out) AS gold_out,
              sum(scrap_in) AS scrap_in, sum(scrap_out) AS scrap_out,
              coalesce(max(active.n), 0) AS active
       FROM sides LEFT JOIN active ON active.id = sides.id
       GROUP BY sides.id
       ORDER BY sum(sold) + sum(bought) DESC, sum(gold_in) + sum(gold_out) DESC
       LIMIT ${TOP_LIMIT}`
    ),
  ]);

  const v = live.rows[0];
  const m = mailbox.rows[0];
  const a = allTime.rows[0];
  return {
    generatedAt: new Date().toISOString(),
    live: {
      active: v.active,
      byType: { equipment: v.equipment, consumable: v.consumable, shard: v.shard },
      byCurrency: { gold: v.gold, scrap: v.scrap },
      sellers: v.sellers,
      brokerListings: v.broker,
      expiringWithinHour: v.expiring,
      shardsListed: num(v.shards),
      goldValue: num(v.gold_value),
      scrapValue: num(v.scrap_value),
    },
    mailbox: {
      entries: m.entries,
      players: m.players,
      gold: num(m.gold),
      scrap: num(m.scrap),
      items: m.items,
      oldest: m.oldest ? new Date(m.oldest).toISOString() : null,
    },
    allTime: {
      sales: a.sales,
      goldVolume: num(a.gold_volume),
      scrapVolume: num(a.scrap_volume),
      listings: a.listings,
      players: a.players,
      firstListing: a.first_listing ? new Date(a.first_listing).toISOString() : null,
    },
    windows: { day, week, month },
    daily: daily.rows.map((r) => ({
      day: r.day as string,
      sales: num(r.sales),
      goldVolume: num(r.gold),
      scrapVolume: num(r.scrap),
      listed: num(r.listed),
      players: num(r.players),
    })),
    topItems: topItems.rows.map((r) => {
      const units = Math.max(1, num(r.units));
      return {
        itemType: r.item_type as string,
        defId: r.def_id as string | null,
        currency: r.currency as string,
        sales: r.sales as number,
        units,
        avgEach: Math.round(num(r.total) / units),
        lowestEach: Math.round(num(r.lowest)),
        highestEach: Math.round(num(r.highest)),
      };
    }),
    topTraders: topTraders.rows.map((r) => ({
      steamId: r.id as string,
      sold: r.sold as number,
      bought: r.bought as number,
      goldIn: num(r.gold_in),
      goldOut: num(r.gold_out),
      scrapIn: num(r.scrap_in),
      scrapOut: num(r.scrap_out),
      activeListings: num(r.active),
    })),
  };
}

export function registerAdminRoutes(app: FastifyInstance, config: AppConfig) {
  const admin = requireAdmin(config);
  app.get('/admin/stats', { preHandler: admin }, async () => ({ stats: await computeAdminStats() }));
}
