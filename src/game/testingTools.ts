/**
 * Controls whether the Testing tab exists in the build at all.
 *
 * This is the ONE thing to check before a real release (Steam, or handing a
 * build to anyone outside closed testing). Flip this to false and the tab
 * disappears entirely -- MenuWindow only registers it when this is true, so
 * with it false a real player has no way to discover it exists.
 *
 * To remove it completely rather than just disable it, delete:
 *   src/game/testingTools.ts               (this file)
 *   src/ui/panels/TestingPanel.tsx         (the UI)
 * and cut the block in src/game/engine.ts marked
 *   // --- TESTING TOOLS (delete this block to remove) ---
 *   // --- end testing tools ---
 * Everything testing-related lives inside that one fenced block; nothing
 * else in engine.ts references it.
 */
// Patch 0438 -- always off in the demo build: the demo is the first build
// that goes out publicly, so it can never ship the Testing tab.
// Patch 0443 -- off in the full game too, for the first public Steam
// build.
// Patch 0503 -- on automatically in the dev server (`npm run dev`, Vite's
// import.meta.env.DEV) and off in every build (`npm run build`, package,
// demo), so nothing has to be flipped before an upload. Settings shows the
// tab's "..." button at the bottom when this is on. FORCE_TESTING_TOOLS
// turns it on in a build too -- keep it false for anything a player gets.
// Read defensively: the DevTool's sim scripts import game code under tsx,
// where import.meta.env doesn't exist.
const FORCE_TESTING_TOOLS = false;
const IS_DEV_SERVER = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
export const TESTING_TOOLS_ENABLED = FORCE_TESTING_TOOLS || IS_DEV_SERVER;
