import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { verifySteamTicket } from './steamAuth.js';

const config = loadConfig();
const app = Fastify({ logger: true });

/**
 * Always live, regardless of AH_ENABLED. This is the one route the whole
 * "host prep + backend skeleton" build step exists to prove reachable over
 * HTTPS through the real domain -- DNS, TLS, the Windows Service, and the
 * firewall chain, before any real Auction House logic exists behind it.
 */
app.get('/health', async () => ({
  status: 'ok',
  ahEnabled: config.ahEnabled,
  mode: config.ahEnabled ? 'online' : 'offline',
}));

/**
 * Steam ticket verification (patch 0405) -- the one genuine remaining
 * blocker from the Auction House build order. Takes the hex-encoded
 * ticket the client got via GetAuthTicketForWebApi (see
 * auctionHouse.ts's fetchAuctionHouseAuthTicket) and verifies it against
 * Steam's real Web API. Returns a verified SteamID on success.
 *
 * Deliberately does NOT issue a session token yet -- what happens after
 * verification (a short-lived signed session vs. re-verifying a fresh
 * ticket on every request) is still an open design question, noted in
 * guild-idler-status.md's Auction House entry rather than decided here.
 * This route is scoped to exactly what its name says: verify a ticket,
 * nothing more.
 */
app.post<{ Body: { ticket?: string } }>('/auth/verify', async (request, reply) => {
  const ticket = request.body?.ticket;
  if (!ticket || typeof ticket !== 'string') {
    reply.code(400);
    return { ok: false, error: 'Missing "ticket" in request body.' };
  }

  const result = await verifySteamTicket(config, ticket);
  if (!result.ok) {
    reply.code(401);
    return result;
  }
  return result;
});

/**
 * Off-state gate. No real AH routes exist yet (core listings/buyout is a
 * later build step -- see guild-idler-status.md) -- this hook is here so
 * that the moment real routes start landing, they come up behind this gate
 * by construction, rather than needing every future route handler to
 * remember its own AH_ENABLED check individually.
 */
app.addHook('onRequest', async (request, reply) => {
  if (config.ahEnabled) return;
  if (request.raw.url === '/health') return;

  reply.code(503).send({
    error: 'auction_house_offline',
    message: 'The Auction House is not enabled on this server yet.',
  });
});


app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(
      `Guildbound AH backend listening on :${config.port} (ahEnabled=${config.ahEnabled})`
    );
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
