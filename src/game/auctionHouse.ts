import { TESTING_TOOLS_ENABLED } from './testingTools';

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
  sessionToken?: string;
  error?: string;
}

/**
 * In-memory only -- never persisted to the save file. Session tokens
 * expire in 1 hour (server/src/sessions.ts) and are cheap to re-obtain,
 * so there's no reason to carry one across app restarts; a fresh
 * verifyAuctionHouseAuth() call gets a new one whenever needed.
 */
let cachedSessionToken: string | null = null;

/**
 * Testing-only (patch 0412) -- lets TestingPanel inject a real,
 * validly-signed session token minted locally via
 * `server/scripts/mint-test-session.mjs`, bypassing the Steam ticket
 * fetch entirely for local UI testing. Gated by TESTING_TOOLS_ENABLED,
 * same as every other test-only capability in this game -- this isn't a
 * new server-side bypass (the server can't tell this token apart from a
 * genuine one, by design, since it's signed with the same real
 * SESSION_SECRET), it's a client-side shortcut around needing a live
 * Steam session for local dev iteration.
 */
export function setDevSessionToken(token: string): void {
  if (!TESTING_TOOLS_ENABLED) return;
  cachedSessionToken = token;
}

/**
 * Full round trip (patch 0407) -- fetches a real ticket, sends it to the
 * real backend's `/auth/verify`, returns the real result. Now also
 * caches the returned session token (patch 0410) for
 * `getSessionToken()`/`syncMailboxFromServer` (engine.ts) to reuse,
 * rather than every mailbox action re-fetching a fresh Steam ticket.
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
    const body = (await response.json()) as AhAuthResult;
    if (body.ok && body.sessionToken) {
      cachedSessionToken = body.sessionToken;
    }
    return body;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Returns a usable session token -- the cached one if there is one,
 * otherwise runs the full verify round trip to get a fresh one. Every
 * mailbox function below goes through this rather than assuming
 * `cachedSessionToken` is already set, so a first-ever call (or one
 * after the 1-hour expiry) still works without a separate "log in"
 * step -- there's no such step anywhere in this game, by design; the
 * Steam ticket itself already proves identity.
 */
async function getSessionToken(): Promise<string | null> {
  if (cachedSessionToken) return cachedSessionToken;
  const result = await verifyAuctionHouseAuth();
  return result.ok ? (result.sessionToken ?? null) : null;
}

/** Raw shape of one row from the server's GET /mailbox (server/src/
 *  listings.ts) -- snake_case, matching the Postgres columns directly,
 *  converted into the client's own camelCase MailboxEntry shape by
 *  engine.ts's syncMailboxFromServer, not here -- this module stays a
 *  thin network layer, the conversion is orchestration. */
export interface ServerMailboxRow {
  id: string;
  type: string;
  amount: string | null; // Postgres BIGINT comes back as a string over JSON
  item_payload: unknown;
  note: string | null;
  created_at: string;
}

/**
 * Fetches the caller's own unclaimed server-side mailbox rows. Returns
 * `null` for any failure -- no session obtainable, network failure, a
 * non-200 response -- same "null means couldn't check" contract this
 * whole module already uses throughout.
 */
export async function fetchServerMailbox(): Promise<ServerMailboxRow[] | null> {
  const token = await getSessionToken();
  if (!token || !AH_READY || !AH_BACKEND_URL) return null;
  try {
    const response = await fetch(`${AH_BACKEND_URL}/mailbox`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body?.mailbox) ? body.mailbox : null;
  } catch {
    return null;
  }
}

/**
 * Tells the server a mailbox entry has been claimed. Called AFTER the
 * local claim already succeeded (engine.ts's claimMailboxEntry) -- this
 * is cleanup, not a gate: the player already has their gold/item either
 * way, this just stops the server handing the same row out again.
 * Returns whether the server actually acknowledged it; a `false` here
 * doesn't undo anything locally -- see `claimedServerMailboxIds`'s own
 * comment (types.ts) for how a failed ack here is still handled safely.
 */
export async function claimServerMailboxEntry(entryId: string): Promise<boolean> {
  const token = await getSessionToken();
  if (!token || !AH_READY || !AH_BACKEND_URL) return false;
  try {
    const response = await fetch(`${AH_BACKEND_URL}/mailbox/${entryId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Raw shape of one row from the server's GET /listings (server/src/
 *  listings.ts) -- snake_case, matching the Postgres columns directly.
 *  `price`/`deposit_amount` come back as strings over JSON (Postgres
 *  BIGINT), same as ServerMailboxRow's own `amount` field.
 *  `deposit_amount` only present on /listings/mine rows -- public
 *  browse rows don't include it, there's no reason for anyone but the
 *  seller to see it. */
export interface ServerListingRow {
  id: string;
  seller_steam_id: string | null;
  item_type: 'equipment' | 'consumable';
  item_payload: unknown;
  currency: 'gold' | 'scrap';
  price: string;
  deposit_amount?: string;
  created_at: string;
  expires_at: string;
}

export interface ListingFilters {
  itemType?: 'equipment' | 'consumable';
  currency?: 'gold' | 'scrap';
}

/**
 * Browse active listings -- public, no session token needed (matches
 * the server route's own "browsing doesn't need to know who's asking"
 * design, listings.ts). Returns `null` only on a genuine failure to
 * reach the backend, never for "zero listings right now" -- that comes
 * back as an empty array, a normal state, not an error one.
 *
 * `filters` (patch 0413) maps straight onto the server's own query
 * params -- rarity is deliberately NOT one of them, see listings.ts's
 * own comment on why that's filtered client-side instead
 * (AuctionHouseTrade.tsx).
 */
export async function fetchActiveListings(filters: ListingFilters = {}): Promise<ServerListingRow[] | null> {
  if (!AH_READY || !AH_BACKEND_URL) return null;
  try {
    const params = new URLSearchParams();
    if (filters.itemType) params.set('itemType', filters.itemType);
    if (filters.currency) params.set('currency', filters.currency);
    const query = params.toString();
    const response = await fetch(`${AH_BACKEND_URL}/listings${query ? `?${query}` : ''}`);
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body?.listings) ? body.listings : null;
  } catch {
    return null;
  }
}

/** The caller's own active listings (patch 0413) -- the "my listings"
 *  view's data source. `null` on failure (including no session
 *  obtainable), same contract as fetchServerMailbox. */
export async function fetchMyListings(): Promise<ServerListingRow[] | null> {
  const token = await getSessionToken();
  if (!token || !AH_READY || !AH_BACKEND_URL) return null;
  try {
    const response = await fetch(`${AH_BACKEND_URL}/listings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body?.listings) ? body.listings : null;
  } catch {
    return null;
  }
}

export interface CreateListingResult {
  ok: boolean;
  listing?: { id: string; created_at: string; expires_at: string; deposit_amount: string };
  error?: string;
}

/**
 * Creates a listing for the given item. `itemPayload` is sent exactly
 * as-is -- the server doesn't re-derive or validate it against anything
 * (see listings.ts's own comment on this trust boundary), so this
 * function doesn't either; the caller (AuctionHouseTrade.tsx) is
 * responsible for passing the real item straight from the player's own
 * stash/inventory. `durationHours` (patch 0413) is trusted the same way
 * -- it's the caller's job to only offer 48 once the player's own
 * Charter level actually allows it; the server accepts either valid
 * value at face value regardless.
 */
export async function createListing(
  itemType: 'equipment' | 'consumable',
  itemPayload: unknown,
  currency: 'gold' | 'scrap',
  price: number,
  durationHours: 24 | 48 = 24
): Promise<CreateListingResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'Could not get a Steam ticket -- Steam may not be running.' };
  if (!AH_READY || !AH_BACKEND_URL) return { ok: false, error: 'AH_BACKEND_URL is not configured on this build.' };

  try {
    const response = await fetch(`${AH_BACKEND_URL}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemType, itemPayload, currency, price, durationHours }),
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    return { ok: true, listing: body.listing };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface BuyListingResult {
  ok: boolean;
  error?: string;
}

/**
 * Buys a listing. On success, the item and gold/scrap route through
 * mailbox server-side (listings.ts's buyout transaction) -- this
 * function doesn't touch local inventory/stash/gold at all, and
 * deliberately doesn't trigger a mailbox sync itself either; the next
 * automatic sync (AuctionHousePanel.tsx's own effect) picks up the
 * purchase, same as any other server-side mailbox change would.
 */
export async function buyListing(listingId: string): Promise<BuyListingResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'Could not get a Steam ticket -- Steam may not be running.' };
  if (!AH_READY || !AH_BACKEND_URL) return { ok: false, error: 'AH_BACKEND_URL is not configured on this build.' };

  try {
    const response = await fetch(`${AH_BACKEND_URL}/listings/${listingId}/buy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface CancelListingResult {
  ok: boolean;
  error?: string;
}

/**
 * Cancels the caller's own listing (patch 0413). On success the item
 * routes back through mailbox server-side (listings.ts) -- the deposit
 * is forfeited, deliberately, see that route's own comment; this
 * function doesn't touch local gold either way, there's nothing to
 * refund on this side.
 */
export async function cancelListing(listingId: string): Promise<CancelListingResult> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: 'Could not get a Steam ticket -- Steam may not be running.' };
  if (!AH_READY || !AH_BACKEND_URL) return { ok: false, error: 'AH_BACKEND_URL is not configured on this build.' };

  try {
    const response = await fetch(`${AH_BACKEND_URL}/listings/${listingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

