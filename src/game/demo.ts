/**
 * Steam demo build (patch 0438) -- every demo-only rule lives in this one
 * file, so a later "make the demo bigger/smaller" request is an edit here,
 * not a hunt through managers.
 *
 * The flag is compiled in, never read at runtime: `vite --mode demo` /
 * `vite build --mode demo` (npm run dev:demo / build:demo / package:demo)
 * defines `__GUILDBOUND_DEMO__` as `true`; every other build defines it
 * as `false`, and anything that runs without Vite at all (the DevTool's
 * tsx balance sim, tsc) sees it undefined -- both read as "full game".
 * Since it's a compile-time constant, a full-game build can't be flipped
 * into demo mode (or back) by editing a save or a settings file.
 *
 * What the demo is (direct request -- a wishlist driver for Steam
 * festivals, NOT a time-limited trial, which an idle game can't use):
 *  - Every leveled upgrade stops at rank `upgradeRankCap` (2). Rank 3+
 *    still shows with its real max ("Lv 2/10") and a "Full game" button
 *    that opens the wishlist card, so the player sees exactly how much
 *    further each one goes.
 *  - A few whole unlocks are full-game only (`lockedUpgradeIds`), plus
 *    Replay Memories.
 *  - One story chain (`storyChainId`) plus the chains that unlock whole
 *    systems (`featureChainIds`: Harvest, Hatchery, Peddler) -- every other
 *    chain simply never shows on the board. Finishing the story chain
 *    plays its normal celebration, then the wishlist card.
 *  - Heroes stop at level `heroLevelCap` (10).
 */

declare const __GUILDBOUND_DEMO__: boolean | undefined;

export const DEMO_BUILD: boolean = typeof __GUILDBOUND_DEMO__ !== 'undefined' && __GUILDBOUND_DEMO__ === true;

export const DEMO = {
  /** Highest rank any leveled upgrade/facility can reach in the demo. */
  upgradeRankCap: 2,
  /**
   * Bought outright in the full game, not available at all in the demo.
   * Heroic/Mythic Clearance -- the demo's raid ceiling is Normal.
   * Auction House Charter -- the AH server authenticates against the
   * full game's App ID, so a demo ticket would never verify anyway.
   */
  lockedUpgradeIds: ['raid_heroic_clearance', 'raid_mythic_clearance', 'auction_house_charter'] as readonly string[],
  /** Every Replay Memories tier (including the 'master' unlock itself). */
  lockChainReplay: true,
  /**
   * The one story chain the demo tells. Lv 2, 3 stages -- reachable in
   * a first session. (The Crow's Warning, lv 8, was the other candidate:
   * a stronger cliffhanger, but the balance sim puts lv 8 at day 2-3 of
   * play, longer than most festival players give a demo.)
   */
  storyChainId: 'millers_problem',
  /** Chains whose reward is a whole system (Harvest/Hatchery/Peddler) --
   *  kept so the demo shows off everything the game does. */
  featureChainIds: ['the_first_haul', 'the_last_clutch', 'the_man_who_sells_maybe'] as readonly string[],
  heroLevelCap: 10,
  /** The FULL game's App ID -- what the wishlist button opens, not the demo's own. */
  fullGameAppId: 5143490,
} as const;

export const DEMO_STORE_URL = `https://store.steampowered.com/app/${DEMO.fullGameAppId}/`;

/** Sentinel error string GuildManager returns for a demo-gated purchase --
 *  engine.ts checks for it to open the wishlist card instead of a toast. */
export const DEMO_LOCK_ERROR = 'Available in the full game.';

/**
 * Whether buying the NEXT rank of upgrade `id` (currently at
 * `currentLevel`) is blocked by the demo. 'unlock' = never available in
 * the demo at all, 'rank' = ranks up to the cap were fine, this one isn't.
 * Always null in the full game.
 */
export function demoLockKind(id: string, currentLevel: number): 'unlock' | 'rank' | null {
  if (!DEMO_BUILD) return null;
  if (DEMO.lockedUpgradeIds.includes(id)) return 'unlock';
  if (currentLevel >= DEMO.upgradeRankCap) return 'rank';
  return null;
}

export function demoRankLocked(id: string, currentLevel: number): boolean {
  return demoLockKind(id, currentLevel) !== null;
}

/** Replay Memories tiers -- all locked in the demo. */
export function demoReplayLocked(): boolean {
  return DEMO_BUILD && DEMO.lockChainReplay;
}

/** Whether a story chain is allowed onto the board. Always true in the full game. */
export function demoAllowsChain(chainId: string): boolean {
  if (!DEMO_BUILD) return true;
  return chainId === DEMO.storyChainId || DEMO.featureChainIds.includes(chainId);
}

/** The hero level cap actually in force -- the demo's, or the full game's. */
export function demoLevelCap(fullGameCap: number): number {
  return DEMO_BUILD ? Math.min(fullGameCap, DEMO.heroLevelCap) : fullGameCap;
}

/* ------------------------------ wishlist card ------------------------------ */
// A tiny event bus rather than engine state: the card is pure presentation
// (nothing about it is saved or affects play), and it has to be reachable
// from both the engine (a gated purchase that slipped past the UI) and
// plain UI code (a "Full game" button, the chain celebration closing).

export type DemoWallReason =
  | { kind: 'rank'; name?: string }
  | { kind: 'unlock'; name?: string }
  | { kind: 'story' }
  | { kind: 'level' }
  | { kind: 'badge' };

const listeners = new Set<(reason: DemoWallReason) => void>();

export function requestDemoWall(reason: DemoWallReason): void {
  if (!DEMO_BUILD) return;
  for (const fn of listeners) fn(reason);
}

export function onDemoWall(fn: (reason: DemoWallReason) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
