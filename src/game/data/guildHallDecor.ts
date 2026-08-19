import { GuildHallDecorationDef } from '../types';

/**
 * Guild Hall decoration content -- lives in json/guild-hall-decorations.json
 * so an item (and its DevTool-tuned placement art) can be added or edited
 * without a code patch, same "own JSON file, own schema" pattern
 * equipment.ts/curios.ts already use for their own data. See GuildHall-
 * DecorationDef's own doc comment in types.ts for the field shapes, and
 * server.mjs's 'guild-hall-decorations' schema entry for the DevTool side.
 *
 * This is deliberately foundation-only for now (patch 0202): the content
 * type, its DevTool authoring tools, and this loader exist so real items
 * can be authored immediately, but nothing in the engine/UI consumes this
 * list yet -- the 30 physical slot instances (position/size/pool) and the
 * in-game Customize mode are a separate, later patch. Starts empty; the
 * DevTool is the intended way to populate it, not hand-editing the JSON.
 */
import guildHallDecorationsJson from './json/guild-hall-decorations.json';
export const GUILD_HALL_DECORATIONS: GuildHallDecorationDef[] = guildHallDecorationsJson as GuildHallDecorationDef[];

export const GUILD_HALL_DECORATION_BY_ID: Record<string, GuildHallDecorationDef> = Object.fromEntries(
  GUILD_HALL_DECORATIONS.map((d) => [d.id, d]),
);
