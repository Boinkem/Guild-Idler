import { GuildHallSlotDef, GuildHallSlotId } from '../types';

/**
 * The 30 physical Guild Hall decoration slots -- locked design data, not
 * DevTool-editable (see the still-not-built "DevTool slot layout editor"
 * prototype noted in guild-idler-status.md's backlog entry for that). A
 * plain hardcoded array, same "code owns fixed, code-defined content"
 * convention data/progression.ts's UPGRADES or data/raidUpgrades.ts
 * already use, not the "own JSON file, DevTool schema" pattern the
 * decorations themselves (guildHallDecor.ts) use -- these 30 positions
 * came out of an interactive mockup pass and are meant to change rarely,
 * as a deliberate code review, not routine content authoring.
 *
 * Every id/top/left/width/height below is transcribed verbatim from
 * guild-idler-status.md's "Final locked slot coordinates" JSON block --
 * do not hand-tune these without updating that block to match, it's the
 * source of truth for what these numbers mean and where they came from.
 * `top`/`left`/`width`/`height` are all % of the Guild Hall background
 * art's own bounding box, matching how they were authored and exported
 * from the interactive layout tool.
 *
 * `slotType` assigns each physical slot to one of GuildHallSlotType's 9
 * content pools, per the locked design's 10 slot-type categories (Wall
 * 1/Wall 2 share the `wallCenterpiece` pool, the left/right bookshelf
 * trinket slots share one `wallTrinket` pool, and Corner L/Corner R
 * share one `corner` pool -- symmetric placement, same content pool).
 */
export const GUILD_HALL_SLOTS: GuildHallSlotDef[] = [
  { id: 'banner', label: 'Banner', slotType: 'banner', top: 9.01, left: 28.28, width: 13.48, height: 25.53 },
  { id: 'wall1', label: 'Wall 1', slotType: 'wallCenterpiece', top: 20, left: 4, width: 11.34, height: 26.18 },
  { id: 'wall2', label: 'Wall 2', slotType: 'wallCenterpiece', top: 20, left: 85.5, width: 9.75, height: 26 },
  { id: 'trophycase', label: 'Trophy Case', slotType: 'trophyCase', top: 36.6, left: 29.6, width: 10.7, height: 18.9 },
  { id: 'centerpiece', label: 'Centerpiece', slotType: 'centerpiece', top: 15.71, left: 49.84, width: 12.4, height: 25 },
  { id: 'floor', label: 'Floor Centerpiece', slotType: 'floorCenterpiece', top: 69.22, left: 21.74, width: 54, height: 24 },
  { id: 'cornerL', label: 'Corner L', slotType: 'corner', top: 48.92, left: 0.63, width: 14.9, height: 26.06 },
  { id: 'cornerR', label: 'Corner R', slotType: 'corner', top: 53.03, left: 85.36, width: 14.55, height: 24.63 },
  { id: 'left-0-0', label: 'L1', slotType: 'wallTrinket', top: 29.5, left: 16.2, width: 5.6, height: 5.4 },
  { id: 'left-0-1', label: 'L1', slotType: 'wallTrinket', top: 29.5, left: 22.4, width: 5.6, height: 5.4 },
  { id: 'left-1-0', label: 'L2a', slotType: 'wallTrinket', top: 34.9, left: 16.2, width: 5.6, height: 6.8 },
  { id: 'left-1-1', label: 'L2a', slotType: 'wallTrinket', top: 34.9, left: 22.4, width: 5.6, height: 6.8 },
  { id: 'left-2-0', label: 'L2b', slotType: 'wallTrinket', top: 41.7, left: 16.2, width: 5.6, height: 6.8 },
  { id: 'left-2-1', label: 'L2b', slotType: 'wallTrinket', top: 41.7, left: 22.4, width: 5.6, height: 6.8 },
  { id: 'left-3-0', label: 'L3', slotType: 'wallTrinket', top: 48.5, left: 16.2, width: 5.6, height: 8.4 },
  { id: 'left-3-1', label: 'L3', slotType: 'wallTrinket', top: 48.5, left: 22.4, width: 5.6, height: 8.4 },
  { id: 'right-0-0', label: 'R1', slotType: 'wallTrinket', top: 29.5, left: 73.6, width: 4.2, height: 5.4 },
  { id: 'right-0-1', label: 'R1', slotType: 'wallTrinket', top: 29.5, left: 78.4, width: 4.2, height: 5.4 },
  { id: 'right-1-0', label: 'R2a', slotType: 'wallTrinket', top: 34.9, left: 73.6, width: 4.2, height: 6.8 },
  { id: 'right-1-1', label: 'R2a', slotType: 'wallTrinket', top: 34.9, left: 78.4, width: 4.2, height: 6.8 },
  { id: 'right-2-0', label: 'R2b', slotType: 'wallTrinket', top: 41.7, left: 73.6, width: 4.2, height: 6.8 },
  { id: 'right-2-1', label: 'R2b', slotType: 'wallTrinket', top: 41.7, left: 78.4, width: 4.2, height: 6.8 },
  { id: 'right-3-0', label: 'R3', slotType: 'wallTrinket', top: 48.5, left: 73.6, width: 4.2, height: 8.4 },
  { id: 'right-3-1', label: 'R3', slotType: 'wallTrinket', top: 48.5, left: 78.4, width: 4.2, height: 8.4 },
  { id: 'center-0-0', label: 'Middle', slotType: 'middleShelf', top: 47.3, left: 49.3, width: 5.9, height: 4.6 },
  { id: 'center-0-1', label: 'Middle', slotType: 'middleShelf', top: 47.3, left: 55.8, width: 5.9, height: 4.6 },
  { id: 'center-1-0', label: 'LowerA', slotType: 'lowerShelf', top: 51.9, left: 49.3, width: 5.9, height: 6.75 },
  { id: 'center-1-1', label: 'LowerA', slotType: 'lowerShelf', top: 51.9, left: 55.8, width: 5.9, height: 6.75 },
  { id: 'center-2-0', label: 'LowerB', slotType: 'lowerShelf', top: 58.65, left: 49.3, width: 5.9, height: 6.75 },
  { id: 'center-2-1', label: 'LowerB', slotType: 'lowerShelf', top: 58.65, left: 55.8, width: 5.9, height: 6.75 },
];

export const GUILD_HALL_SLOT_BY_ID: Record<GuildHallSlotId, GuildHallSlotDef> = Object.fromEntries(
  GUILD_HALL_SLOTS.map((s) => [s.id, s]),
) as Record<GuildHallSlotId, GuildHallSlotDef>;
