import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool, withTransaction } from './db.js';
import { verifySessionToken } from './sessions.js';
import { AppConfig } from './config.js';

/**
 * Core listings + buyout, patch 0409 -- see guild-idler-status.md's
 * Auction House entry for the full design. Scoped deliberately: no
 * filtering/pagination on browse (the client panel that would need it
 * isn't built yet -- last item in the build order), no deposit-fee logic
 * (percentages still genuinely undecided, see the design entry's own
 * "Still open" list -- `deposit_amount` exists in the schema, unused,
 * rather than guessing at a real number), no 48h duration tier (same
 * "still open" reasoning -- every listing gets the 24h base for now), no
 * expired-listing sweep (a background job, not built this patch -- an
 * expired listing just stops showing up in browse results, but its
 * seller doesn't get it back via mailbox yet).
 */

const LISTING_DURATION_HOURS = 24;

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
   */
  app.get('/listings', async () => {
    const { rows } = await getPool().query(
      `SELECT id, seller_steam_id, item_type, item_payload, currency, price, created_at, expires_at
       FROM listings
       WHERE status = 'active' AND expires_at > now()
       ORDER BY created_at DESC
       LIMIT 200`
    );
    return { listings: rows };
  });

  /**
   * Create a listing. `item_payload` carries the full rolled-stat item --
   * the server never re-derives or validates it against any source of
   * truth, because there isn't one here (see the design doc's own
   * "save-file signing/light protection only" anti-cheat stance) -- the
   * same trust boundary the client's local save file already operates
   * under.
   */
  app.post<{ Body: { itemType?: string; itemPayload?: unknown; currency?: string; price?: number } }>(
    '/listings',
    { preHandler: auth },
    async (request, reply) => {
      const { itemType, itemPayload, currency, price } = request.body ?? {};
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

      const { rows } = await getPool().query(
        `INSERT INTO listings (seller_steam_id, item_type, item_payload, currency, price, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 hour')
         RETURNING id, created_at, expires_at`,
        [steamId, itemType, JSON.stringify(itemPayload), currency, price, LISTING_DURATION_HOURS]
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

        // Seller's mailbox entry -- the sale gold/scrap. Skipped for
        // system-seeded listings (seller_steam_id IS NULL) -- there's no
        // real player to deliver it to.
        if (listing.seller_steam_id) {
          await client.query(
            `INSERT INTO mailbox (owner_steam_id, type, amount, note)
             VALUES ($1, $2, $3, $4)`,
            [listing.seller_steam_id, listing.currency, listing.price, 'Auction House sale']
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

  /** Lists the caller's own unclaimed mailbox entries -- the source the
   *  client's mailbox-sync step (not built this patch) will pull from. */
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
