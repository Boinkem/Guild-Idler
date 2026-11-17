import type { CSSProperties, ReactNode } from 'react';
import { useEngine } from './useEngine';
import { GuildManager } from '../game/managers/GuildManager';
import { CHAIN_REPLAY_TIER_BY_ID } from '../game/data/chainReplay';
import type { GameState } from '../game/types';
import type { GameEngine } from '../game/engine';
import { demoLockKind, demoReplayLocked, requestDemoWall } from '../game/demo';

/**
 * Patch 0475 -- "if it's gated, it has a link". One small button for
 * every place a Guild Hall purchase is what stands between the player and
 * the thing in front of them (a locked feature, a full set of slots, a
 * daily allowance that has run out, a cost a facility would waive).
 * Clicking it opens the Guild Hall with that purchase pinned to the top
 * of the list under a "Needed for ..." banner (see GuildPanel's `pin`).
 *
 * Renders nothing once the purchase is fully bought, so call sites can
 * drop it in without checking levels themselves.
 */

/** Name and "nothing left to buy" for a Guild Hall row id: a facility, a
 *  general upgrade, or the Replay Memories unlock ('master'). Null for an
 *  id the Guild Hall doesn't sell. */
export function guildHallPurchase(state: GameState, id: string): { name: string; maxed: boolean } | null {
  const facility = GuildManager.facilities().find((f) => f.id === id);
  if (facility) return { name: facility.name, maxed: GuildManager.nextCost(state, facility.id) === null };
  const upgrade = GuildManager.upgrades().find((u) => u.id === id && !u.vendor);
  if (upgrade) return { name: upgrade.name, maxed: GuildManager.upgradeLevel(state, id) >= upgrade.maxLevel };
  const tier = id === 'master' ? CHAIN_REPLAY_TIER_BY_ID[id] : undefined;
  if (tier) return { name: tier.sagaName, maxed: GuildManager.hasChainReplayTier(state, id) };
  return null;
}

/**
 * Patch 0476 -- whether the next rank of a Guild Hall row is closed by the
 * demo build (rank cap, a full-game-only unlock, Replay Memories). Always
 * null in the full game.
 */
export function guildHallDemoLock(state: GameState, id: string): 'rank' | 'unlock' | null {
  if (id === 'master') return demoReplayLocked() ? 'unlock' : null;
  const level = GuildManager.facilities().some((f) => f.id === id)
    ? GuildManager.facilityLevel(state, id as never)
    : GuildManager.upgradeLevel(state, id);
  return demoLockKind(id, level);
}

/**
 * Patch 0476 -- every "go buy the thing you're missing" link goes through
 * here. Normally the Guild Hall with that row pinned (patch 0475); in the
 * demo, when the purchase can't be made there, the wishlist card instead
 * of a pinned row that only says "Full game".
 */
export function goToGuildHallPurchase(engine: GameEngine, id: string, reason: string) {
  const lock = guildHallDemoLock(engine.state, id);
  if (lock) {
    requestDemoWall({ kind: lock, name: guildHallPurchase(engine.state, id)?.name });
    return;
  }
  engine.requestTab('guild', id, undefined, reason);
}

export function PrereqLink({
  id, reason, children, className = 'btn-ghost prereq-link', style, onGo,
}: {
  /** The Guild Hall row to pin -- a facility/upgrade id, or 'master'. */
  id: string;
  /** Finishes the sentence "Needed for ..." on the Guild Hall's banner. */
  reason: string;
  /** Button text; defaults to "<purchase name> →". */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Runs first -- e.g. close the modal this link sits in. */
  onGo?: () => void;
}) {
  const engine = useEngine();
  const purchase = guildHallPurchase(engine.state, id);
  if (!purchase || purchase.maxed) return null;
  return (
    <button
      type="button"
      className={className}
      style={style}
      title={guildHallDemoLock(engine.state, id) ? `${purchase.name}: more in the full game` : `Go to the Guild Hall: ${purchase.name}`}
      onClick={(e) => { e.stopPropagation(); onGo?.(); goToGuildHallPurchase(engine, id, reason); }}
    >
      {children ?? <>{purchase.name} →</>}
    </button>
  );
}
