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

export interface SessionPayload {
  steamId: string;
}

/**
 * Signs a new session token for a verified SteamID. Throws if
 * SESSION_SECRET isn't configured -- callers (the /auth/verify route)
 * are expected to check `config.sessionSecret` before reaching this, same
 * "fail loud in code, fail safe in behaviour" shape steamAuth.ts's own
 * missing-key check already uses.
 */
export function issueSessionToken(steamId: string, secret: string): string {
  const payload: SessionPayload = { steamId };
  return jwt.sign(payload, secret, { expiresIn: SESSION_TOKEN_EXPIRY });
}

/**
 * Verifies a session token, returning the SteamID it was issued for, or
 * `null` for anything wrong with it -- expired, tampered, wrong secret,
 * malformed. Never throws: an invalid session is a normal, expected
 * outcome (tokens expire after an hour by design), not an exceptional
 * one, so callers check for `null` rather than wrapping this in
 * try/catch.
 */
export function verifySessionToken(token: string, secret: string): string | null {
  try {
    const decoded = jwt.verify(token, secret) as SessionPayload;
    return decoded.steamId ?? null;
  } catch {
    return null;
  }
}
