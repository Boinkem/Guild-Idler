import { GuildHallSlotDef, GuildHallSlotId, GuildHallSlotType } from '../types';
import guildhallThemesJson from './json/guildhall-themes.json';
import guildhallSlotLayoutJson from './json/guildhall-slot-layout.json';

/**
 * The 30 physical Guild Hall decoration slots, and the background themes
 * they can be arranged against. Three sources, merged here at import time:
 *
 * - `SLOT_IDENTITY` below (id/label/slotType) is a plain hardcoded array,
 *   same "code owns fixed, code-defined content" convention
 *   data/progression.ts's UPGRADES or data/raidUpgrades.ts already use --
 *   which 30 slots exist and which content pool each draws from is
 *   load-bearing for `GuildHallSlotId` (a closed union, not a plain
 *   string -- see that type's own doc comment) and is meant to change
 *   rarely, as a deliberate code review, not routine content authoring.
 * - `json/guildhall-themes.json` (id/name/background) is which background
 *   art options exist -- DevTool-editable, unrestricted (add/edit/delete
 *   like any other content type, see server.mjs's 'guildhall-themes'
 *   schema), since adding a new theme doesn't touch `GuildHallSlotId` at
 *   all.
 * - `json/guildhall-slot-layout.json` (geometry only -- top/left/width/
 *   height, % of the background art's own bounding box, one row per
 *   theme+slot pair) IS DevTool-editable per theme (the "Guild Hall Slot
 *   Layout" tool in the DevTool, under World Content) -- repositioning or
 *   hiding a slot for a given theme is exactly the kind of routine,
 *   no-code-patch-needed tweak the DevTool exists for, unlike adding or
 *   removing a slot's identity entirely.
 *
 * As of patch 0207, which theme is actually active for a given save is
 * real state (`GameState.activeGuildHallTheme`, resolved through
 * `GuildHallDecorManager.activeThemeId` -- see that method's own comment
 * for how an invalid/deleted theme id degrades safely) -- this file just
 * provides the lookup (`slotsForTheme`/`slotForTheme`) the manager and,
 * eventually, the in-game UI resolve that active theme against. There is
 * still no in-game control to actually change it (that's the next real
 * step) -- everything defaults to `DEFAULT_GUILD_HALL_THEME_ID` until
 * there is.
 */

interface SlotGeometry { themeId: string; id: string; top: number; left: number; width: number; height: number; }

const SLOT_GEOMETRY = guildhallSlotLayoutJson as SlotGeometry[];

/**
 * Which 30 slots exist and which content pool each draws from -- see this
 * file's own top comment for why this half is code-owned while geometry
 * (per theme) is DevTool-owned. `label` is the short mockup-era name (e.g.
 * "L2a"), useful for DevTool/debugging display, not shown to the player.
 */
const SLOT_IDENTITY: { id: GuildHallSlotId; label: string; slotType: GuildHallSlotType }[] = [
  { id: 'banner', label: 'Banner', slotType: 'banner' },
  { id: 'wall1', label: 'Wall 1', slotType: 'wallCenterpiece' },
  { id: 'wall2', label: 'Wall 2', slotType: 'wallCenterpiece' },
  { id: 'trophycase', label: 'Trophy Case', slotType: 'trophyCase' },
  { id: 'centerpiece', label: 'Centerpiece', slotType: 'centerpiece' },
  { id: 'floor', label: 'Floor Centerpiece', slotType: 'floorCenterpiece' },
  { id: 'cornerL', label: 'Corner L', slotType: 'corner' },
  { id: 'cornerR', label: 'Corner R', slotType: 'corner' },
  { id: 'left-0-0', label: 'L1', slotType: 'wallTrinket' },
  { id: 'left-0-1', label: 'L1', slotType: 'wallTrinket' },
  { id: 'left-1-0', label: 'L2a', slotType: 'wallTrinket' },
  { id: 'left-1-1', label: 'L2a', slotType: 'wallTrinket' },
  { id: 'left-2-0', label: 'L2b', slotType: 'wallTrinket' },
  { id: 'left-2-1', label: 'L2b', slotType: 'wallTrinket' },
  { id: 'left-3-0', label: 'L3', slotType: 'wallTrinket' },
  { id: 'left-3-1', label: 'L3', slotType: 'wallTrinket' },
  { id: 'right-0-0', label: 'R1', slotType: 'wallTrinket' },
  { id: 'right-0-1', label: 'R1', slotType: 'wallTrinket' },
  { id: 'right-1-0', label: 'R2a', slotType: 'wallTrinket' },
  { id: 'right-1-1', label: 'R2a', slotType: 'wallTrinket' },
  { id: 'right-2-0', label: 'R2b', slotType: 'wallTrinket' },
  { id: 'right-2-1', label: 'R2b', slotType: 'wallTrinket' },
  { id: 'right-3-0', label: 'R3', slotType: 'wallTrinket' },
  { id: 'right-3-1', label: 'R3', slotType: 'wallTrinket' },
  { id: 'center-0-0', label: 'Middle', slotType: 'middleShelf' },
  { id: 'center-0-1', label: 'Middle', slotType: 'middleShelf' },
  { id: 'center-1-0', label: 'LowerA', slotType: 'lowerShelf' },
  { id: 'center-1-1', label: 'LowerA', slotType: 'lowerShelf' },
  { id: 'center-2-0', label: 'LowerB', slotType: 'lowerShelf' },
  { id: 'center-2-1', label: 'LowerB', slotType: 'lowerShelf' },
];

/** One background theme option -- matches server.mjs's 'guildhall-themes'
 *  schema exactly (id/name/background). `background` is a path relative to
 *  GUILDHALL_ART_DIR (public/guildhall-customize/), e.g.
 *  "guild_hall/bg.jpg". */
export interface GuildHallThemeDef {
  id: string;
  name: string;
  background: string;
}

export const GUILD_HALL_THEMES: GuildHallThemeDef[] = guildhallThemesJson as GuildHallThemeDef[];

export const GUILD_HALL_THEME_BY_ID: Record<string, GuildHallThemeDef> = Object.fromEntries(
  GUILD_HALL_THEMES.map((t) => [t.id, t]),
);

/** The theme every save defaults to, and the one `GuildHallDecorManager.
 *  activeThemeId` falls back to if a save's stored theme id doesn't
 *  resolve to anything real. The `?? 'guild_hall'` tail is a last-resort
 *  fallback for the (should-never-happen) case of content shipping with
 *  zero themes at all -- ships with exactly one today. */
export const DEFAULT_GUILD_HALL_THEME_ID = GUILD_HALL_THEMES[0]?.id ?? 'guild_hall';

/**
 * A theme's own visible slots -- `SLOT_IDENTITY` merged with whichever
 * `SLOT_GEOMETRY` rows exist for `themeId`. An identity id with no
 * geometry row for this theme is simply omitted from the result, not an
 * error -- that's the DevTool's own per-theme show/hide checklist
 * (renderGuildHallSlotLayoutView in app.js) actually working: a room that
 * doesn't have a Trophy Case just doesn't get a Trophy Case slot.
 *
 * Assumes `themeId` is a real theme (see `GUILD_HALL_THEME_BY_ID`) --
 * callers wanting "whichever theme the player currently has active"
 * should resolve it through `GuildHallDecorManager.activeThemeId` first,
 * which already degrades safely (falls back to
 * `DEFAULT_GUILD_HALL_THEME_ID`, with a console warning) if the stored id
 * doesn't resolve to anything real. Passing an unknown id straight to this
 * function instead just yields an empty list, no slots at all -- correct
 * in the narrow sense (a theme that doesn't exist has no slots), but not
 * what a caller actually wants, which is why that resolution step exists
 * one level up rather than being duplicated here.
 */
export function slotsForTheme(themeId: string): GuildHallSlotDef[] {
  const geometryById: Record<string, SlotGeometry> = Object.fromEntries(
    SLOT_GEOMETRY.filter((g) => g.themeId === themeId).map((g) => [g.id, g]),
  );
  return SLOT_IDENTITY
    .filter((identity) => geometryById[identity.id])
    .map((identity) => {
      const g = geometryById[identity.id];
      return { ...identity, top: g.top, left: g.left, width: g.width, height: g.height };
    });
}

/** Single-slot convenience wrapper around `slotsForTheme` -- undefined if
 *  this theme doesn't have (or doesn't show) that slot. Rebuilds the
 *  theme's slot list on every call rather than caching a
 *  per-theme-per-slot index; fine at this scale (a handful of themes, 30
 *  slots each, called from UI event handlers, not a hot loop). */
export function slotForTheme(themeId: string, slotId: GuildHallSlotId): GuildHallSlotDef | undefined {
  return slotsForTheme(themeId).find((s) => s.id === slotId);
}
