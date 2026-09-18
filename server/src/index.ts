/**
 * Loads server/.env into process.env before anything else runs -- a real
 * gap until now, not a hypothetical one. `.env.example` always implied
 * "copy this to .env and it'll work" (its own header comment says exactly
 * that), but nothing in this file ever actually read the file -- only
 * variables already present in the shell's own environment (e.g. a manual
 * $env:AH_ENABLED="true" in PowerShell) ever reached loadConfig(). Caught
 * live: a real deploy attempt where AH_ENABLED flipped correctly (set
 * manually in-session) but STEAM_WEB_API_KEY silently stayed unset (only
 * ever written to .env, never actually loaded) -- production config
 * silently ignored, not a startup crash, the worse kind of bug to carry.
 * Must be the first import in the file -- config.ts's loadConfig() reads
 * process.env at call time, so anything importing config.ts before this
 * line runs would still see an empty environment.
 */
import 'dotenv/config';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { verifySteamTicket } from './steamAuth.js';
import { issueSessionToken } from './sessions.js';
import { registerListingsRoutes } from './listings.js';

const config = loadConfig();
const app = Fastify({ logger: true });

/**
 * Always live, regardless of AH_ENABLED. This is the one route the whole
 * "host prep + backend skeleton" build step exists to prove reachable over
 * HTTPS through the real domain -- DNS, TLS, the Windows Service, and the
 * firewall chain, before any real Auction House logic exists behind it.
 *
 * `steamKeyConfigured` added (patch 0408) after a real live-deploy
 * session where `STEAM_WEB_API_KEY` silently stayed unset (patch 0406's
 * own bug) and the only way to notice was a failed `/auth/verify` call --
 * a boolean here means DevTools (or anyone else) can see that at a
 * glance, no auth attempt needed. Deliberately just a boolean, never the
 * key's actual value -- same "never send the secret anywhere, not even
 * to a trusted internal tool" rule steamAuth.ts's own comments already
 * establish for this key.
 */
app.get('/health', async () => ({
  status: 'ok',
  ahEnabled: config.ahEnabled,
  mode: config.ahEnabled ? 'online' : 'offline',
  steamKeyConfigured: !!config.steamWebApiKey,
}));

/**
 * Steam ticket verification (patch 0405), now issuing a session token on
 * success (patch 0409) -- resolves the open question this route's own
 * comment used to flag. Session token per direct decision: re-verifying
 * with a fresh Steam ticket on every single AH action would mean bugging
 * Steam's API on every button press, not just once per session. See
 * sessions.ts for the token itself -- a plain signed JWT, no server-side
 * session table, expires in 1 hour.
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
  if (!config.sessionSecret) {
    reply.code(500);
    return { ok: false, error: 'SESSION_SECRET is not configured on this server.' };
  }

  // verifySteamTicket's own contract: result.ok === true always pairs
  // with a real steamId -- see steamAuth.ts's SteamAuthResult.
  const sessionToken = issueSessionToken(result.steamId!, config.sessionSecret);
  return { ...result, sessionToken };
});

/**
 * Core listings + buyout routes (patch 0409) -- only registered when a
 * database is actually configured. Same "fail safe, not fail loud" shape
 * AH_ENABLED's own default already establishes: a host that hasn't set up
 * Postgres yet gets a plain 404 on these routes instead of every request
 * crashing on an undefined connection pool.
 */
if (config.databaseUrl) {
  registerListingsRoutes(app, config);
} else {
  app.log.warn('DATABASE_URL not set -- listings/mailbox/buyout routes are not registered.');
}

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
