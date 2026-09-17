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
}

export const STEAM_APP_ID_DEFAULT = '5143490';

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
  };
}
