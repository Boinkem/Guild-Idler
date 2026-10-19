export interface AppConfig {
  port: number;
  ahEnabled: boolean;
  /**
   * Steam Web API key -- a real production secret, generated via the
   * Steamworks partner site, never the same thing as the App ID. Needed
   * to call ISteamUserAuth/AuthenticateUserTicket. Empty string (not
   * undefined) when unset, so every call site can check truthiness the
   * same simple way rather than juggling `string | undefined`.
   */
  steamWebApiKey: string;
  /** GuildBound's real App ID (5143490, per guild-idler-status.md) --
   *  required alongside the ticket on every AuthenticateUserTicket call. */
  steamAppId: string;
  /** Postgres connection string (patch 0409) -- empty until Postgres is
   *  actually installed on the host. Empty string, not undefined, same
   *  "every call site checks truthiness the same simple way" reasoning
   *  steamWebApiKey already uses. */
  databaseUrl: string;
  /** Signs/verifies session tokens (patch 0409, sessions.ts) -- a real
   *  production secret, generated once and never rotated casually (every
   *  existing session token becomes invalid the moment this changes). */
  sessionSecret: string;
  /** Patch 0418 -- the identity string the client stamps onto its
   *  GetAuthTicketForWebApi ticket (src/game/auctionHouse.ts's
   *  AH_AUTH_IDENTITY). Steam requires AuthenticateUserTicket to be
   *  called with the SAME identity, or it rejects the ticket -- the
   *  server never sent one before this patch, so every real Steam
   *  sign-in would have failed. Only override if the client's constant
   *  ever changes. */
  steamTicketIdentity: string;
}

export const STEAM_APP_ID_DEFAULT = '5143490';
/** Must match AH_AUTH_IDENTITY in src/game/auctionHouse.ts. */
export const STEAM_TICKET_IDENTITY_DEFAULT = 'guildbound-ah';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

/**
 * Loads config from environment variables.
 *
 * `ahEnabled` deliberately defaults to `false`: a fresh checkout with no
 * `.env`, a missing `AH_ENABLED` line, or a typo'd value should all fail
 * safe to "disabled", never silently turn on a live marketplace nobody
 * meant to turn on. See guild-idler-status.md's Auction House entry --
 * this stays false until DNS, TLS, and Postgres are all actually in
 * place on the host.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    ahEnabled: parseBool(env.AH_ENABLED, false),
    steamWebApiKey: env.STEAM_WEB_API_KEY?.trim() ?? '',
    steamAppId: env.STEAM_APP_ID?.trim() || STEAM_APP_ID_DEFAULT,
    databaseUrl: env.DATABASE_URL?.trim() ?? '',
    sessionSecret: env.SESSION_SECRET?.trim() ?? '',
    steamTicketIdentity: env.STEAM_TICKET_IDENTITY?.trim() || STEAM_TICKET_IDENTITY_DEFAULT,
  };
}
