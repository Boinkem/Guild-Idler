import jwt from 'jsonwebtoken';

/**
 * Session tokens, patch 0409 -- resolves the open question left in patch
 * 0405's own /auth/verify route ("re-verify every request" vs "issue a
 * short-lived session after one verification"). Session token, per
 * direct decision: re-verifying with a fresh Steam ticket on every single
 * AH action (list, buy, claim) would mean bugging Steam's API on every
 * button press, not just once per play session.
 *
 * Deliberately a plain signed JWT, not a database-backed session table --
 * no server-side state to store or clean up, verification is just
 * checking the signature and expiry, and revocation isn't a real
 * requirement yet (nothing here is sensitive enough to need
 * force-logout-everyone -- see the design doc's own "save-file signing/
 * light protection only" anti-cheat stance, the same low-stakes
 * reasoning applies here).
 */

const SESSION_TOKEN_EXPIRY = '1h';

/** Patch 0477 -- which Steam app the ticket behind a session was issued
 *  for. The demo is its own app (5488030); a demo session may only use the
 *  routes that explicitly allow it (realm events). Tokens issued before
 *  this patch carry no `app` and are read as 'full' -- only the full game
 *  could sign in then. */
export type SessionApp = 'full' | 'demo';

export interface SessionPayload {
  steamId: string;
  app?: SessionApp;
}

export interface Session {
  steamId: string;
  app: SessionApp;
}

export function issueSessionToken(steamId: string, secret: string, app: SessionApp = 'full'): string {
  const payload: SessionPayload = { steamId, app };
  return jwt.sign(payload, secret, { expiresIn: SESSION_TOKEN_EXPIRY });
}

/** Verifies a session token and says which app it belongs to. Null for a
 *  bad, expired or missing-secret token. */
export function verifySession(token: string, secret: string): Session | null {
  try {
    const decoded = jwt.verify(token, secret) as SessionPayload;
    if (!decoded.steamId) return null;
    return { steamId: decoded.steamId, app: decoded.app === 'demo' ? 'demo' : 'full' };
  } catch {
    return null;
  }
}

/**
 * Verifies a session token and returns the SteamID it was issued for, or
 * null if the token is invalid/expired/tampered with. Never throws.
 * FULL-GAME sessions only (patch 0477): a demo session reads as null here,
 * so anything still calling this refuses the demo by default.
 */
export function verifySessionToken(token: string, secret: string): string | null {
  const session = verifySession(token, secret);
  return session && session.app === 'full' ? session.steamId : null;
}
