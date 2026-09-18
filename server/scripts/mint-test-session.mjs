/**
 * Mints a real, validly-signed session token -- for local UI testing
 * only, without needing a live Steam session at all.
 *
 * Why this is safe to have: it reads SESSION_SECRET from THIS machine's
 * own server/.env (the same secret the real server already trusts) and
 * signs a token exactly the way sessions.ts's real issueSessionToken()
 * does. It doesn't call Steam, doesn't touch the network, and doesn't
 * add any new server route -- there is no new attack surface here, just
 * a local script standing in for "click a button and get a session",
 * which is normally gated behind an actual Steam ticket. Never run this
 * against a real production SESSION_SECRET you'd mind a test SteamID
 * having a token for.
 *
 * Usage (from server/):
 *   npm run mint-test-session
 *   npm run mint-test-session -- 76561198000000001
 *
 * Paste the printed token into TestingPanel's "Auction House dev
 * session" field (patch 0412) to fully exercise Browse/Sell/Buy in a
 * local dev build without Steam running at all.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const secret = process.env.SESSION_SECRET;
if (!secret) {
  console.error('SESSION_SECRET is not set in server/.env -- nothing to sign with.');
  process.exit(1);
}

const steamId = process.argv[2] || '76561198000000001';
const token = jwt.sign({ steamId }, secret, { expiresIn: '1h' });

console.log(`\nTest session for SteamID ${steamId} (valid 1 hour):\n`);
console.log(token);
console.log('\nPaste this into TestingPanel -> Auction House dev session -> Set token.\n');
