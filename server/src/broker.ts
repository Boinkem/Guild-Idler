import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, withTransaction } from './db.js';
import { recordSale } from './listings.js';
import { GameItems, RarityWeights, loadGameItems } from './gameItems.js';

/**
 * Auction House Broker (patch 0462) -- keeps the market alive while real
 * player numbers are low, and fades out by itself as they grow. Designed
 * with the developer after playtest feedback; full spec in
 * guild-idler-status.md's "Auction House Broker" entry and patch 0462's
 * log entry.
 *
 * Invisible on purpose: a Broker listing is an ordinary `listings` row
 * with a NULL seller (the "system-seeded" shape the schema always had),
 * and a Broker buyout is an ordinary sale with a NULL buyer (migration
 * 003), written by the same `recordSale` the player buy route uses. Public
 * routes never expose seller/buyer IDs, so players can't tell them apart.
 * Only the admin dashboard (/admin/stats) separates Broker from real.
 *
 * Each tick:
 *  1. SUPPLY -- gear is stocked per level bracket, consumables as one pool.
 *     A bracket's target is `target` (+ `activeBracketBonus` when real
 *     players listed or bought gear in that bracket in the last 7 days).
 *     Real listings count against the target, so where players keep a
 *     bracket stocked the Broker posts nothing there. Posts trickle in
 *     (chance per tick, scaled by how empty the bracket is), backdated a
 *     little so timestamps don't line up with the tick. If the Broker has
 *     no listings at all (first run, or after a long outage) it seeds
 *     every bracket up to target at once, backdated across several days so
 *     the market looks established rather than freshly stocked.
 *  2. DEMAND -- buys real players' gear/consumable listings (never Shard
 *     stacks, never its own) by price vs the game's shop value for that
 *     exact item: each `bands` entry sets a hazard rate (median hours to
 *     sell, or chance over 24h) up to its `maxRatio`; above the last band
 *     it never buys. Scrap-priced listings compare against shop value /
 *     economy.scrapToGoldRatio. At most `dailyCapPerSeller` Broker buyouts
 *     per seller in any rolling 24h. The whole rate scales down as real
 *     sales approach `realSalesTarget24h` (never below `minDemandScale`).
 *
 * Every Broker buyout pays the seller real gold/scrap (a faucet); every
 * Broker listing a player buys removes it (a sink). The admin dashboard
 * shows both so the net can be watched and the config tuned.
 *
 * Config: server/broker.config.json, re-read every tick (edit it live,
 * no restart). On/off: AH_BROKER_ENABLED in .env (default off).
 */

type Rng = () => number;

interface Band { maxRatio: number; medianHours?: number; chanceOver24h?: number }
interface BrokerConfig {
  tickMinutes: number;
  listingHours: number;
  priceRange: [number, number];
  scrapShare: number;
  gearBrackets: { min: number; max: number; target: number; rarity: RarityWeights }[];
  activeBracketBonus: number;
  consumables: { target: number; rarity: RarityWeights };
  postChancePerTick: number;
  postBackdateMinutes: number;
  seedBackdateHours: number;
  buyout: {
    enabled: boolean;
    dailyCapPerSeller: number;
    minListingAgeMinutes: number;
    bands: Band[];
    realSalesTarget24h: number;
    minDemandScale: number;
  };
}

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'broker.config.json');

export function readBrokerConfig(): BrokerConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as BrokerConfig;
}

export interface TickResult {
  posted: number;
  seeded: boolean;
  bought: number;
  boughtGold: number;
  boughtScrap: number;
}

/** Price: shop value x a random point in priceRange, nudged off round numbers. */
export function brokerPrice(shopValue: number, cfg: BrokerConfig, rng: Rng, scrapRatio: number, currency: 'gold' | 'scrap'): number {
  const [lo, hi] = cfg.priceRange;
  const gold = shopValue * (lo + rng() * (hi - lo));
  let price = Math.max(1, Math.round(currency === 'scrap' ? gold / scrapRatio : gold));
  if (price >= 20 && price % 5 === 0) price += rng() < 0.5 ? -(1 + Math.floor(rng() * 2)) : 1 + Math.floor(rng() * 2);
  const ceiling = Math.max(1, Math.floor(currency === 'scrap' ? shopValue / scrapRatio : shopValue));
  return Math.max(1, Math.min(price, ceiling));
}

/** Per-hour buy hazard for a listing at `ratio` of its shop value; 0 = never. */
export function hazardPerHour(ratio: number, bands: Band[]): number {
  for (const band of bands) {
    if (ratio <= band.maxRatio) {
      if (band.medianHours && band.medianHours > 0) return Math.LN2 / band.medianHours;
      if (band.chanceOver24h && band.chanceOver24h > 0) return -Math.log(1 - Math.min(0.999, band.chanceOver24h)) / 24;
      return 0;
    }
  }
  return 0;
}

function levelOf(items: GameItems, itemType: string, payload: unknown): number | null {
  return items.listingInfo(itemType, payload)?.level ?? null;
}

/** Gear levels real players listed or bought in the last 7 days -- a
 *  bracket containing any of them is "busy" and gets activeBracketBonus.
 *  Shared with the admin dashboard so both show the same targets. */
export async function recentPlayerGearLevels(items: GameItems): Promise<number[]> {
  const { rows: recent } = await getPool().query(
    `SELECT l.item_payload FROM listings l
     WHERE l.item_type = 'equipment' AND l.seller_steam_id IS NOT NULL AND l.created_at > now() - interval '7 days'
     UNION ALL
     SELECT l.item_payload FROM transactions t JOIN listings l ON l.id = t.listing_id
     WHERE l.item_type = 'equipment' AND t.buyer_steam_id IS NOT NULL AND t.created_at > now() - interval '7 days'`
  );
  return recent.map((r) => levelOf(items, 'equipment', r.item_payload)).filter((l): l is number => l != null);
}

/** A bracket's effective target this tick. */
export function bracketTarget(b: { min: number; max: number; target: number }, cfg: BrokerConfig, recentLevels: number[]): number {
  return b.target + (recentLevels.some((l) => l >= b.min && l <= b.max) ? cfg.activeBracketBonus : 0);
}

async function supply(items: GameItems, cfg: BrokerConfig, rng: Rng, now: Date): Promise<{ posted: number; seeded: boolean }> {
  const pool = getPool();
  const { rows: active } = await pool.query(
    `SELECT seller_steam_id, item_type, item_payload FROM listings
     WHERE status = 'active' AND expires_at > now() AND item_type IN ('equipment', 'consumable')`
  );
  const recentLevels = await recentPlayerGearLevels(items);

  const brokerActive = active.filter((r) => r.seller_steam_id == null).length;
  const seeding = brokerActive === 0;

  const posts: { itemType: string; payload: unknown; currency: 'gold' | 'scrap'; price: number }[] = [];
  const queue = (item: ReturnType<GameItems['rollGear']>) => {
    if (!item) return;
    const currency: 'gold' | 'scrap' = rng() < cfg.scrapShare ? 'scrap' : 'gold';
    posts.push({ itemType: item.itemType, payload: item.payload, currency, price: brokerPrice(item.shopValue, cfg, rng, items.SCRAP_TO_GOLD_RATIO, currency) });
  };
  const fill = (deficit: number, target: number, roll: () => ReturnType<GameItems['rollGear']>) => {
    if (deficit <= 0) return;
    if (seeding) {
      for (let i = 0; i < deficit; i++) queue(roll());
    } else if (rng() < cfg.postChancePerTick * Math.min(1, deficit / Math.max(1, target))) {
      queue(roll());
    }
  };

  for (const b of cfg.gearBrackets) {
    const inBracket = (lvl: number | null) => lvl != null && lvl >= b.min && lvl <= b.max;
    const have = active.filter((r) => r.item_type === 'equipment' && inBracket(levelOf(items, 'equipment', r.item_payload))).length;
    const target = bracketTarget(b, cfg, recentLevels);
    fill(target - have, target, () => items.rollGear(b.min, b.max, b.rarity, `broker:${now.getTime()}:${b.min}:${rng()}`));
  }
  const haveConsumables = active.filter((r) => r.item_type === 'consumable').length;
  fill(cfg.consumables.target - haveConsumables, cfg.consumables.target,
    () => items.rollConsumable(cfg.consumables.rarity, `broker:${now.getTime()}:c:${rng()}`));

  for (const p of posts) {
    const backdateMin = seeding ? rng() * cfg.seedBackdateHours * 60 : rng() * cfg.postBackdateMinutes;
    await pool.query(
      `INSERT INTO listings (seller_steam_id, item_type, item_payload, currency, price, deposit_amount, created_at, expires_at)
       VALUES (NULL, $1, $2, $3, $4, 0, now() - $5 * interval '1 minute', now() - $5 * interval '1 minute' + $6 * interval '1 hour')`,
      [p.itemType, JSON.stringify(p.payload), p.currency, p.price, backdateMin, cfg.listingHours]
    );
  }
  return { posted: posts.length, seeded: seeding && posts.length > 0 };
}

async function demand(items: GameItems, cfg: BrokerConfig, rng: Rng): Promise<{ bought: number; gold: number; scrap: number }> {
  const out = { bought: 0, gold: 0, scrap: 0 };
  if (!cfg.buyout.enabled) return out;
  const pool = getPool();
  const { rows: realSalesRows } = await pool.query(
    `SELECT count(*)::int AS n FROM transactions WHERE buyer_steam_id IS NOT NULL AND created_at > now() - interval '24 hours'`
  );
  const scale = Math.max(cfg.buyout.minDemandScale, 1 - realSalesRows[0].n / Math.max(1, cfg.buyout.realSalesTarget24h));
  const { rows: capRows } = await pool.query(
    `SELECT seller_steam_id, count(*)::int AS n FROM transactions
     WHERE buyer_steam_id IS NULL AND seller_steam_id IS NOT NULL AND created_at > now() - interval '24 hours'
     GROUP BY 1`
  );
  const used = new Map<string, number>(capRows.map((r) => [r.seller_steam_id as string, r.n as number]));
  const { rows: candidates } = await pool.query(
    `SELECT id, seller_steam_id, item_type, item_payload, currency, price FROM listings
     WHERE status = 'active' AND expires_at > now() AND seller_steam_id IS NOT NULL
       AND item_type IN ('equipment', 'consumable')
       AND created_at < now() - $1 * interval '1 minute'`,
    [cfg.buyout.minListingAgeMinutes]
  );
  const tickHours = cfg.tickMinutes / 60;
  for (const row of candidates) {
    const seller = row.seller_steam_id as string;
    if ((used.get(seller) ?? 0) >= cfg.buyout.dailyCapPerSeller) continue;
    const info = items.listingInfo(row.item_type, row.item_payload);
    if (!info || info.shopValue <= 0) continue;
    const fair = row.currency === 'scrap' ? info.shopValue / items.SCRAP_TO_GOLD_RATIO : info.shopValue;
    const ratio = Number(row.price) / fair;
    const lambda = hazardPerHour(ratio, cfg.buyout.bands) * scale;
    if (lambda <= 0 || rng() >= 1 - Math.exp(-lambda * tickHours)) continue;

    const sold = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM listings WHERE id = $1 AND status = 'active' AND expires_at > now() FOR UPDATE`,
        [row.id]
      );
      if (!rows[0] || rows[0].seller_steam_id == null) return false;
      await recordSale(client, rows[0], null);
      return true;
    });
    if (!sold) continue;
    used.set(seller, (used.get(seller) ?? 0) + 1);
    out.bought++;
    if (row.currency === 'scrap') out.scrap += Number(row.price); else out.gold += Number(row.price);
  }
  return out;
}

/** One full Broker pass. Exported for tests and a manual DevTool nudge later. */
export async function brokerTick(items: GameItems, rng: Rng = Math.random, now = new Date()): Promise<TickResult> {
  const cfg = readBrokerConfig();
  const s = await supply(items, cfg, rng, now);
  const d = await demand(items, cfg, rng);
  return { posted: s.posted, seeded: s.seeded, bought: d.bought, boughtGold: d.gold, boughtScrap: d.scrap };
}

interface Logger { info(obj: object, msg?: string): void; warn(msg: string): void; error(obj: object, msg?: string): void }

/** Starts the Broker loop. Resolves false (and logs why) if it can't run. */
export async function startBroker(log: Logger): Promise<boolean> {
  const items = await loadGameItems((m) => log.warn(m));
  if (!items) return false;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await brokerTick(items);
      if (r.posted || r.bought) log.info({ broker: r }, 'broker tick');
    } catch (err) {
      log.error({ err }, 'broker tick failed');
    } finally {
      running = false;
    }
  };
  let minutes = 5;
  try { minutes = Math.max(1, readBrokerConfig().tickMinutes); } catch (err) { log.error({ err }, 'broker.config.json unreadable'); return false; }
  setInterval(tick, minutes * 60_000).unref();
  void tick();
  return true;
}
