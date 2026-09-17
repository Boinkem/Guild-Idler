export type AhConnectionStatus = 'offline' | 'checking' | 'online' | 'unreachable';

/**
 * Auction House client module -- status flag + connection check, same
 * shape leaderboard.ts's LEADERBOARD_READY/fetchLeaderboard already
 * established for "a real backend exists, but might not be reachable"
 * UI. See guild-idler-status.md's Auction House entry for the full
 * design and build order.
 *
 * `AH_READY` is false until there's an actual domain to point at -- DNS/
 * TLS aren't live yet (see server/README.md). `AH_BACKEND_URL` is
 * deliberately left empty rather than pointing at `localhost`: a shipped
 * client hitting a player's own localhost would hang, error, or (worse)
 * hit some unrelated local service -- none of those are "needs a
 * connection", they're a bug. Checking `AH_READY` first means
 * `checkAhConnection()` never even attempts a network call until a real
 * URL exists to try.
 */
export const AH_READY = false;

/** Set once the real domain/subdomain from the design doc's
 *  infrastructure section is actually live -- see server/README.md. */
export const AH_BACKEND_URL = '';

const HEALTH_CHECK_TIMEOUT_MS = 4000;

/**
 * Mirrors fetchLeaderboard's shape: a real network attempt when
 * possible, graceful fallback otherwise, never a thrown error the UI
 * has to handle separately. Resolves 'offline' immediately, with no
 * network attempt at all, whenever AH_READY is false or no URL is
 * configured -- see the module comment above for why that's a
 * deliberate short-circuit, not just an early return.
 */
export async function checkAhConnection(): Promise<AhConnectionStatus> {
  if (!AH_READY || !AH_BACKEND_URL) return 'offline';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${AH_BACKEND_URL}/health`, { signal: controller.signal });
    if (!response.ok) return 'unreachable';
    const body = await response.json();
    return body?.ahEnabled ? 'online' : 'offline';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Short, stable string naming this game as the consuming service --
 * Valve's own best-practice recommendation for GetAuthTicketForWebApi's
 * `identity` parameter (one per real consuming service, not per
 * request). See electron/main.ts's own steam:getAuthTicketForWebApi
 * handler for the full design.
 */
const AH_AUTH_IDENTITY = 'guildbound-ah';

/**
 * Fetches a Steam auth ticket from the main process (patch 0405) and
 * returns it as a hex-encoded string, ready to send to the AH backend's
 * verification route -- the client-side half of the design doc's Steam
 * auth flow. Returns `null` whenever Steam can't answer at all (not
 * running, request failed or timed out, or this build has no Electron
 * bridge at all -- e.g. the plain-browser dev fallback) -- same "null
 * means couldn't check" contract every other Steam call in this game
 * already uses, never a thrown error the caller has to wrap in its own
 * try/catch.
 *
 * Deliberately NOT called from anywhere yet -- there's no backend route
 * to send this ticket to until the "core listings + buyout" build-order
 * step exists (see guild-idler-status.md's Auction House entry). This
 * is the client-side half, built and ready ahead of that.
 */
export async function fetchAuctionHouseAuthTicket(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.littleKnight?.getAuthTicketForWebApi) return null;
  try {
    return await window.littleKnight.getAuthTicketForWebApi(AH_AUTH_IDENTITY);
  } catch {
    return null;
  }
}
