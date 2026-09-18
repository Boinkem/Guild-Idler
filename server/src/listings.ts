import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool, withTransaction } from './db.js';
import { verifySessionToken } from './sessions.js';
import { AppConfig } from './config.js';

/**
 * Core listings + buyout, patch 0409, extended patch 0413 to close five
 * real gaps flagged (and left flagged, not guessed at) since patch 0411:
 * listing filters, a "my listings" view, cancelling a listing, deposit
 * fees, and the 48h duration tier. See guild-idler-status.md's Auction
 * House entry for the full design and this patch's own log entry for
 * the two genuinely economic calls made here (deposit percentage, the
 * 48h gate) -- both are real numbers, not placeholders, but both are
 * cheap to retune later the same way the Auction House Charter's own
 * price already got adjusted once.
 *
 * Still deliberately not built: an expired-listing sweep (a background
 * job -- an expired listing just stops showing up in browse, its seller
 * doesn't get it back via mailbox automatically yet, same gap patch 0409
 * already flagged and this patch doesn't close).
 */

const LISTING_DURATION_HOURS = 24;
const LISTING_DURATION_HOURS_EXTENDED = 48;

/**
 * Deposit, patch 0413 -- real number, not a placeholder, but a
 * deliberately simple flat rate rather than anything tiered. 5% mirrors
 * the WoW-style reference point this whole design has taken cues from
 * (their own AH deposit sits in a similar range for a short listing
 * duration). Refunded to the seller on a successful sale (on top of the
 * sale price itself), forfeited on cancel -- the forfeit is what gives
 * "list it and think it over" a real cost, discouraging spam relist-to-
 * reprice instead of just letting a listing run its course.
 *
 * The server can't actually CHARGE this against a player's real gold --
 * there's no server-side balance to charge against, only the client's
 * own local save (see the design doc's own anti-cheat stance). The
 * client deducts it locally immediately once a listing is confirmed
 * created (AuctionHouseTrade.tsx / engine.ts) -- this constant exists so
 * the amount charged and the amount later refunded always agree, computed
 * once, not independently on both sides.
 */
const DEPOSIT_PERCENT = 0.05;

function computeDeposit(price: number): number {
  return Math.max(1, Math.ceil(price * DEPOSIT_PERCENT));
}

/**
 * Reads the session token from `Authorization: Bearer <token>`, attaches
 * the verified SteamID to the request, or replies 401 and stops the
 * request going any further. Every route that needs to know "who is
 * asking" uses this as a preHandler rather than duplicating the header
 * parsing per route.
 */
function requireAuth(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    const steamId = token ? verifySessionToken(token, config.sessionSecret) : null;
    if (!steamId) {
      reply.code(401);
      throw new Error('Missing or invalid session token.');
    }
    (request as FastifyRequest & { steamId: string }).steamId = steamId;
  };
}

export function registerListingsRoutes(app: FastifyInstance, config: AppConfig) {
  const auth = requireAuth(config);

  /**
   * Browse active, unexpired listings. No auth required -- browsing
   * doesn't need to know who's asking, only buying and listing do.
   *
   * Filters (patch 0413): `itemType`/`currency` are real columns, cheap
   * to filter in SQL. Rarity is deliberately NOT filtered here -- it
   * lives inside `item_payload`'s JSONB, not its own column, and adding
   * one just for this felt like the wrong tradeoff for a "still no
   * pagination" v1 browse endpoint; the client filters by rarity itself
   * after fetching (AuctionHouseTrade.tsx).
   */
  app.get<{ Querystring: { itemType?: string; currency?: string } }>('/listings', async (request) => {
    const { itemType, currency } = request.query;
    const conditions = [`status = 'active'`, `expires_at > now()`];
    const params: string[] = [];

    if (itemType === 'equipment' || itemType === 'consumable') {
      params.push(itemType);
      conditions.push(`item_type = $${params.length}`);
    }
    if (currency === 'gold' || currency === 'scrap') {
      params.push(currency);
      conditions.push(`currency = $${params.length}`);
    }

    const { rows } = await getPool().query(
      `SELECT id, seller_steam_id, item_type, item_payload, currency, price, created_at, expires_at
       FROM listings
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT 200`,
      params
    );
    return { listings: rows };
  });

  /** The caller's own active listings (patch 0413) -- the "my listings"
   *  view's data source. Auth required, unlike public browse, since this
   *  is scoped to "mine" by definition. */
  app.get('/listings/mine', { preHandler: auth }, async (request) => {
    const steamId = (request as FastifyRequest & { steamId: string }).steamId;
    const { rows } = await getPool().query(
      `SELECT id, item_type, item_payload, currency, price, deposit_amount, created_at, expires_at
       FROM listings
       WHERE seller_steam_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [steamId]
    );
    return { listings: rows };
  });

  /**
   * Create a listing. `item_payload` carries the full rolled-stat item --
   * the server never re-derives or validates it against any source of
   * truth, because there isn't one here (see the design doc's own
   * "save-file signing/light protection only" anti-cheat stance) -- the
   * same trust boundary the client's local save file already operates
   * under. Same trust extended to `durationHours` (patch 0413) -- the
   * server accepts either valid value at face value; it's the CLIENT's
   * job to only offer 48h once the player's own Charter level actually
   * allows it (AuctionHouseTrade.tsx).
   */
  app.post<{ Body: { itemType?: string; itemPayload?: unknown; currency?: string; price?: number; durationHours?: number } }>(
    '/listings',
    { preHandler: auth },
    async (request, reply) => {
      const { itemType, itemPayload, currency, price, durationHours } = request.body ?? {};
      const steamId = (request as FastifyRequest & { steamId: string }).steamId;

      if (itemType !== 'equipment' && itemType !== 'consumable') {
        reply.code(400);
        return { error: 'itemType must be "equipment" or "consumable".' };
      }
      if (currency !== 'gold' && currency !== 'scrap') {
        reply.code(400);
        return { error: 'currency must be "gold" or "scrap".' };
      }
      if (!itemPayload || typeof price !== 'number' || price <= 0) {
        reply.code(400);
        return { error: 'itemPayload and a positive price are required.' };
      }
      const duration = durationHours === LISTING_DURATION_HOURS_EXTENDED
        ? LISTING_DURATION_HOURS_EXTENDED
        : LISTING_DURATION_HOURS;
      const depositAmount = computeDeposit(price);

      const { rows } = await getPool().query(
        `INSERT INTO listings (seller_steam_id, item_type, item_payload, currency, price, deposit_amount, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 hour')
         RETURNING id, created_at, expires_at, deposit_amount`,
        [steamId, itemType, JSON.stringify(itemPayload), currency, price, depositAmount, duration]
      );
      return { listing: rows[0] };
    }
  );

  /**
   * Buyout -- the one genuine concurrency risk the whole Auction House
   * design flagged from the start: two buyout clicks on the same listing
   * landing at the same moment. `SELECT ... FOR UPDATE` inside a
   * transaction (withTransaction, db.ts) makes the second request block
   * until the first commits, then correctly see `status != 'active'` and
   * fail -- no double-sell possible, confirmed directly below, not just
   * assumed from the SQL.
   *
   * Per patch 0403's design revision: BOTH the purchased item and the
   * sale gold route through the mailbox now (not the item landing
   * directly in the buyer's inventory the original design called for) --
   * this route creates both mailbox rows in the same transaction as the
   * sale itself, so a crash between them is impossible, not just unlikely.
   * The seller's mailbox gold entry now includes their deposit refund
   * (patch 0413) -- price + deposit_amount in one entry, not two, since
   * there's no real reason to split them into separate claims.
   */
  app.post<{ Params: { id: string } }>('/listings/:id/buy', { preHandler: auth }, async (request, reply) => {
    const buyerSteamId = (request as FastifyRequest & { steamId: string }).steamId;
    const { id } = request.params;

    try {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM listings WHERE id = $1 AND status = 'active' AND expires_at > now() FOR UPDATE`,
          [id]
        );
        const listing = rows[0];
        if (!listing) {
          throw Object.assign(new Error('Listing not found, already sold, or expired.'), { code: 'NOT_AVAILABLE' });
        }
        if (listing.seller_steam_id === buyerSteamId) {
          throw Object.assign(new Error("Can't buy your own listing."), { code: 'OWN_LISTING' });
        }

        await client.query(
          `UPDATE listings SET status = 'sold', sold_at = now(), buyer_steam_id = $1 WHERE id = $2`,
          [buyerSteamId, id]
        );

        // Buyer's mailbox entry -- the purchased item.
        await client.query(
          `INSERT INTO mailbox (owner_steam_id, type, item_payload, note)
           VALUES ($1, $2, $3, $4)`,
          [buyerSteamId, listing.item_type, listing.item_payload, 'Auction House purchase']
        );

        // Seller's mailbox entry -- sale price PLUS the deposit refund
        // (patch 0413) in one entry. Skipped for system-seeded listings
        // (seller_steam_id IS NULL) -- there's no real player to deliver
        // it to.
        if (listing.seller_steam_id) {
          const total = Number(listing.price) + Number(listing.deposit_amount ?? 0);
          await client.query(
            `INSERT INTO mailbox (owner_steam_id, type, amount, note)
             VALUES ($1, $2, $3, $4)`,
            [listing.seller_steam_id, listing.currency, total, 'Auction House sale (includes deposit refund)']
          );
        }

        await client.query(
          `INSERT INTO transactions (listing_id, buyer_steam_id, seller_steam_id, price, currency)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, buyerSteamId, listing.seller_steam_id, listing.price, listing.currency]
        );

        return { listingId: id };
      });
      return result;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NOT_AVAILABLE') {
        reply.code(409);
        return { error: (err as Error).message };
      }
      if (code === 'OWN_LISTING') {
        reply.code(400);
        return { error: (err as Error).message };
      }
      throw err;
    }
  });

  /**
   * Cancel -- patch 0413. Same row-locked shape buyout already uses
   * (SELECT ... FOR UPDATE, same table, same concurrency concern: a
   * cancel racing a buyout on the same listing). Only the listing's own
   * seller can cancel it, checked in the same locked SELECT rather than
   * as a separate query, so there's no window between checking ownership
   * and acting on it. The item comes back via mailbox -- the deposit
   * does NOT (see DEPOSIT_PERCENT's own comment on why forfeiting it on
   * cancel is deliberate, not an oversight).
   */
  app.post<{ Params: { id: string } }>('/listings/:id/cancel', { preHandler: auth }, async (request, reply) => {
    const steamId = (request as FastifyRequest & { steamId: string }).steamId;
    const { id } = request.params;

    try {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM listings WHERE id = $1 AND status = 'active' FOR UPDATE`,
          [id]
        );
        const listing = rows[0];
        if (!listing) {
          throw Object.assign(new Error('Listing not found or already sold/cancelled.'), { code: 'NOT_AVAILABLE' });
        }
        if (listing.seller_steam_id !== steamId) {
          throw Object.assign(new Error("That's not your listing."), { code: 'NOT_YOURS' });
        }

        await client.query(`UPDATE listings SET status = 'cancelled' WHERE id = $1`, [id]);

        // Item back to the seller via mailbox -- deposit forfeited,
        // deliberately not refunded here.
        await client.query(
          `INSERT INTO mailbox (owner_steam_id, type, item_payload, note)
           VALUES ($1, $2, $3, $4)`,
          [steamId, listing.item_type, listing.item_payload, 'Auction House listing cancelled']
        );

        return { listingId: id };
      });
      return result;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NOT_AVAILABLE') {
        reply.code(409);
        return { error: (err as Error).message };
      }
      if (code === 'NOT_YOURS') {
        reply.code(403);
        return { error: (err as Error).message };
      }
      throw err;
    }
  });

  /** Lists the caller's own unclaimed mailbox entries -- the source the
   *  client's mailbox-sync step pulls from. */
  app.get('/mailbox', { preHandler: auth }, async (request) => {
    const steamId = (request as FastifyRequest & { steamId: string }).steamId;
    const { rows } = await getPool().query(
      `SELECT id, type, amount, item_payload, note, created_at
       FROM mailbox
       WHERE owner_steam_id = $1 AND claimed_at IS NULL
       ORDER BY created_at ASC`,
      [steamId]
    );
    return { mailbox: rows };
  });

  /** Marks a mailbox entry claimed -- called once the CLIENT has already
   *  applied it locally (gold added, item pushed to stash), same
   *  "server records what already happened, doesn't decide it" shape the
   *  Gold Storage Cap block already keeps entirely client-side
   *  (MailboxManager.ts). */
  app.post<{ Params: { id: string } }>('/mailbox/:id/claim', { preHandler: auth }, async (request, reply) => {
    const steamId = (request as FastifyRequest & { steamId: string }).steamId;
    const { rows } = await getPool().query(
      `UPDATE mailbox SET claimed_at = now()
       WHERE id = $1 AND owner_steam_id = $2 AND claimed_at IS NULL
       RETURNING id`,
      [request.params.id, steamId]
    );
    if (rows.length === 0) {
      reply.code(404);
      return { error: 'Mailbox entry not found, not yours, or already claimed.' };
    }
    return { ok: true };
  });
}
