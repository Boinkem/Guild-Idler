import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Patch 0476 -- see vite.config.ts.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/**
 * Browser-only config. No Electron plugin, so this runs even when the Electron
 * binary is missing or broken.
 *
 * The renderer detects the absence of `window.littleKnight` and falls back to
 * localStorage for saves (see defaultAdapter() in SaveManager.ts), so the whole
 * game is playable here. The only things that do nothing are the window
 * controls: "Hide", "On top", and "Where is my save?".
 *
 *   npm run dev:web
 */
export default defineConfig(({ mode }) => ({
  base: './',
  // Patch 0438 -- `vite --config vite.web.config.ts --mode demo` for a
  // browser demo build; see vite.config.ts / src/game/demo.ts.
  define: { __GUILDBOUND_DEMO__: JSON.stringify(mode === 'demo'), __GUILDBOUND_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: { open: true },
}));
