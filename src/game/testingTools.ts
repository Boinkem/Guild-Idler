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
import { DEMO_BUILD } from './demo';

// Patch 0438 -- always off in the demo build: the demo is the first build
// that goes out publicly, so it can never ship the Testing tab. The full
// game's own value is unchanged (still flipped by hand before release).
export const TESTING_TOOLS_ENABLED = !DEMO_BUILD;
