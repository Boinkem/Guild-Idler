export type AhConnectionStatus = 'offline' | 'checking' | 'online' | 'unreachable';

/**
 * Auction House client module -- status flag + connection check, same
 * shape leaderboard.ts's LEADERBOARD_READY/fetchLeaderboard already
 * established for "a real backend exists, but might not be reachable"
 * UI. See guild-idler-status.md's Auction House entry for the full
 * design and build order.
 *
 * `AH_READY` -- flipped live (patch 0407) now that `ah.guildbound.dev` is
 * confirmed genuinely working end to end (Cloudflare Tunnel, TLS, the
 * real backend's /health route, all tested against the actual live
 * domain, not just in dev). `checkAhConnection()` below now makes a real
 * network attempt whenever the AH panel is unlocked, correctly
 * reflecting `ahEnabled` off/on based on the server's current `.env`
 * state -- see server/README.md.
 */
export const AH_READY = true;

/** Real domain, confirmed working end to end -- see this constant's own
 *  comment above and server/README.md's deploy checklist. */
export const AH_BACKEND_URL = 'https://ah.guildbound.dev';

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
 */
export async function fetchAuctionHouseAuthTicket(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.littleKnight?.getAuthTicketForWebApi) return null;
  try {
    return await window.littleKnight.getAuthTicketForWebApi(AH_AUTH_IDENTITY);
  } catch {
    return null;
  }
}

export interface AhAuthResult {
  ok: boolean;
  steamId?: string;
  error?: string;
}

/**
 * Full round trip (patch 0407) -- fetches a real ticket, sends it to the
 * real backend's `/auth/verify`, returns the real result. Still only
 * called from TestingPanel.tsx right now, not any real gameplay path --
 * there's no listing/buyout flow yet that would need to authenticate a
 * player for real (core listings + buyout, still not built). This is
 * what makes it possible to prove the whole chain works, end to end,
 * ahead of that -- same "build the proof-of-life ahead of the real
 * feature" shape every other Auction House patch has followed since the
 * skeleton's own /health route.
 *
 * Every failure mode -- no ticket available, the backend unreachable,
 * AH_ENABLED off, Steam genuinely rejecting the ticket -- comes back as
 * `{ ok: false, error }`, never a thrown exception, so callers never
 * need their own try/catch.
 */
export async function verifyAuctionHouseAuth(): Promise<AhAuthResult> {
  const ticket = await fetchAuctionHouseAuthTicket();
  if (!ticket) {
    return { ok: false, error: 'Could not get a Steam ticket -- Steam may not be running, or this build has no Steamworks bridge.' };
  }
  if (!AH_READY || !AH_BACKEND_URL) {
    return { ok: false, error: 'AH_BACKEND_URL is not configured on this build.' };
  }

  try {
    const response = await fetch(`${AH_BACKEND_URL}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    const body = await response.json();
    return body as AhAuthResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
