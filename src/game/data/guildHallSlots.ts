import { GuildHallSlotDef, GuildHallSlotId, GuildHallSlotType } from '../types';
import guildhallSlotLayoutJson from './json/guildhall-slot-layout.json';

/**
 * The 30 physical Guild Hall decoration slots. Split across two sources,
 * merged here at import time:
 *
 * - `SLOT_IDENTITY` below (id/label/slotType) is a plain hardcoded array,
 *   same "code owns fixed, code-defined content" convention
 *   data/progression.ts's UPGRADES or data/raidUpgrades.ts already use --
 *   which 30 slots exist and which content pool each draws from is
 *   load-bearing for `GuildHallSlotId` (a closed union, not a plain
 *   string -- see that type's own doc comment) and is meant to change
 *   rarely, as a deliberate code review, not routine content authoring.
 * - `json/guildhall-slot-layout.json` (geometry only -- top/left/width/
 *   height, % of the background art's own bounding box) IS DevTool-
 *   editable (patch 0205's "Guild Hall Slot Layout" tool in the DevTool,
 *   under World Content) -- repositioning/resizing a slot is exactly the
 *   kind of routine, no-code-patch-needed tweak the DevTool exists for,
 *   unlike adding or removing a slot entirely.
 *
 * The DevTool's own save-time validation (server.mjs's
 * `guildhall-slot-layout` special case in `validateArray`) rejects a
 * layout file that doesn't have geometry for exactly these 30 ids -- it
 * can edit numbers, not add or remove slots -- so in the DevTool-authored
 * common case every identity id below always has a matching geometry
 * entry. The lookups below still degrade gracefully (a console.warn and
 * a small fallback rect) rather than throwing if that invariant is ever
 * violated some other way (a hand-edited JSON file, a merge conflict) --
 * same "content may drift out from under old assumptions, don't crash
 * the game over it" convention CurioManager.owned/GuildHallDecorManager's
 * own resolve-and-skip methods already follow, just applied to slots
 * instead of decorations.
 */

interface SlotGeometry { id: string; top: number; left: number; width: number; height: number; }

const SLOT_GEOMETRY = guildhallSlotLayoutJson as SlotGeometry[];
const SLOT_GEOMETRY_BY_ID: Record<string, SlotGeometry> = Object.fromEntries(
  SLOT_GEOMETRY.map((g) => [g.id, g]),
);

/** A small, visibly-wrong-on-purpose rect (top-left corner, tiny) so a
 *  missing geometry entry is obvious in the DevTool/in-game rather than
 *  silently overlapping some other slot at a plausible-looking 0,0. */
const FALLBACK_GEOMETRY: Omit<SlotGeometry, 'id'> = { top: 0, left: 0, width: 4, height: 4 };

/**
 * Which 30 slots exist and which content pool each draws from -- see
 * this file's own top comment for why this half is code-owned while
 * geometry is DevTool-owned. `label` is the short mockup-era name (e.g.
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

export const GUILD_HALL_SLOTS: GuildHallSlotDef[] = SLOT_IDENTITY.map((identity) => {
  const geometry = SLOT_GEOMETRY_BY_ID[identity.id];
  if (!geometry) {
    // eslint-disable-next-line no-console
    console.warn(`guildHallSlots: no layout geometry for slot "${identity.id}" -- falling back to a tiny top-left placeholder rect. Re-save the Guild Hall Slot Layout tool in the DevTool to fix.`);
  }
  const { top, left, width, height } = geometry ?? FALLBACK_GEOMETRY;
  return { ...identity, top, left, width, height };
});

export const GUILD_HALL_SLOT_BY_ID: Record<GuildHallSlotId, GuildHallSlotDef> = Object.fromEntries(
  GUILD_HALL_SLOTS.map((s) => [s.id, s]),
) as Record<GuildHallSlotId, GuildHallSlotDef>;
