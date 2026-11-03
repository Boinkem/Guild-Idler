import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Loader for the Broker's game-item bridge (patch 0462) -- see
 * server/items/gameItems.ts for what it is and why it lives outside src.
 *
 * Production (`npm run build` + `npm start`): loads the esbuild bundle
 * dist-items/gameItems.mjs. Dev (`npm run dev`, tsx): falls back to the
 * .ts source, which tsx can import directly. If neither loads, returns
 * null and the Broker stays off (logged once) -- the rest of the Auction
 * House is unaffected.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type RarityWeights = Partial<Record<Rarity, number>>;

export interface BrokerItem {
  itemType: 'equipment' | 'consumable';
  payload: unknown;
  shopValue: number;
  level: number | null;
  rarity: Rarity;
  name: string;
}

export interface GameItems {
  SCRAP_TO_GOLD_RATIO: number;
  rollGear(minLevel: number, maxLevel: number, weights: RarityWeights, seed: string): BrokerItem | null;
  rollConsumable(weights: RarityWeights, seed: string): BrokerItem | null;
  listingInfo(itemType: string, payload: unknown): { shopValue: number; level: number | null; rarity: Rarity } | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..');

let cached: GameItems | null | undefined;

export async function loadGameItems(log: (msg: string) => void = console.warn): Promise<GameItems | null> {
  if (cached !== undefined) return cached;
  const candidates = [join(serverDir, 'dist-items', 'gameItems.mjs'), join(serverDir, 'items', 'gameItems.ts')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      cached = (await import(pathToFileURL(file).href)) as GameItems;
      return cached;
    } catch (err) {
      log(`Broker: could not load ${file}: ${(err as Error).message}`);
    }
  }
  log('Broker: game item code not available -- run `npm run build` (bundles dist-items/gameItems.mjs). Broker stays off.');
  cached = null;
  return cached;
}
