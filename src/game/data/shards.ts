/**
 * Legendary Shards (patch 0454) -- the high-end currency. See
 * guild-idler-status.md's "Legendary Shards" entry for the full design.
 *
 * Sources: Heroic/Mythic/Legendary raid full clears, a small chance on a
 * successful Epic/Legendary quest, and scrapping a Legendary item.
 * Uses: Legendary Repair (1 Shard + the normal gold, no Scrap -- the
 * cheap route; the fallback is gold + Scrap at
 * economy.legendaryRepairFallbackMultiplier), and trading on the
 * Auction House. Later: Legendary Enhance / re-levelling.
 *
 * Stored as a plain counter (GameState.legendaryShards), same "standalone
 * currency, not a MaterialId" reasoning GameState.scrap gives.
 */
import { RaidDifficulty, Difficulty } from '../types';
import { Tuning } from './tuning';
import currenciesJson from './json/currencies.json';

/** Patch 0455 -- name/glyph/icon now come from json/currencies.json so
 *  the DevTool's Currencies tab can set the Shard's art. */
interface CurrencyDef { id: string; name: string; description: string; glyph: string; icon?: string }
const SHARD_DEF = (currenciesJson as CurrencyDef[]).find((c) => c.id === 'legendary_shard');

export const SHARD_NAME = SHARD_DEF?.name || 'Legendary Shard';
export const SHARD_GLYPH = SHARD_DEF?.glyph || '\u{1F4A0}'; // diamond with a dot
export const SHARD_DESCRIPTION = SHARD_DEF?.description ?? '';
/** Path under public/item-icons/, or undefined until art is picked. */
export const SHARD_ICON: string | undefined = SHARD_DEF?.icon || undefined;
/** The `defId` an Auction House shard listing carries in its payload --
 *  the server's payload check requires a defId on every listing. */
export const SHARD_DEF_ID = 'legendary_shard';
/** Upper bound on one AH listing's stack size (matches the server). */
export const MAX_SHARDS_PER_LISTING = 999;

export function shardLabel(amount: number): string {
  return `${amount} ${SHARD_NAME}${amount === 1 ? '' : 's'}`;
}

/** Shards for a FULL raid clear at this difficulty (0 for Normal). */
export function raidShardReward(difficulty: RaidDifficulty): number {
  if (difficulty === 'heroic') return Tuning.get('economy.legendaryShardsRaidHeroic');
  if (difficulty === 'mythic') return Tuning.get('economy.legendaryShardsRaidMythic');
  if (difficulty === 'legendary') return Tuning.get('economy.legendaryShardsRaidLegendary');
  return 0;
}

/** Percent chance a SUCCESSFUL quest at this difficulty drops 1 Shard. */
export function questShardChance(difficulty: Difficulty): number {
  if (difficulty === 'epic') return Tuning.get('economy.legendaryShardQuestChanceEpic');
  if (difficulty === 'legendary') return Tuning.get('economy.legendaryShardQuestChanceLegendary');
  return 0;
}
