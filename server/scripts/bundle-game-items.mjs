/**
 * Patch 0462 -- bundles server/items/gameItems.ts (the Broker's bridge to
 * the game's real item code in src/game) into one self-contained ES module,
 * dist-items/gameItems.mjs, with the game's JSON data baked in. Runs as
 * part of `npm run build`, after tsc. The compiled server loads it at
 * runtime (src/gameItems.ts). Uses esbuild, which tsx already brings in.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(serverDir, 'items', 'gameItems.ts')],
  outfile: join(serverDir, 'dist-items', 'gameItems.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'warning',
  legalComments: 'none',
});
console.log('Bundled game item code -> dist-items/gameItems.mjs');
