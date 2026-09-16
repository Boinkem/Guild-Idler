export interface AppConfig {
  port: number;
  ahEnabled: boolean;
}

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
  };
}
