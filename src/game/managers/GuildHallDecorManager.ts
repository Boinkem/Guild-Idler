import { GUILD_HALL_DECORATION_BY_ID } from '../data/guildHallDecor';
import { DEFAULT_GUILD_HALL_THEME_ID, GUILD_HALL_THEME_BY_ID, slotForTheme, slotsForTheme } from '../data/guildHallSlots';
import { GameState, GuildHallDecorationDef, GuildHallSlotDef, GuildHallSlotId } from '../types';

/**
 * Owning/equipping Guild Hall decorations -- the state layer for patch
 * 0203's "slots + state, no UI" scope. Every method here already exists
 * and is already exercised (see this patch's own verification notes in
 * guild-idler-status.md); the in-game Customize UI planned for a later
 * patch should be able to call straight into this manager the same way
 * every other panel calls into its own manager, with no further engine
 * design work needed there.
 *
 * Deliberately does NOT wire achievement completion or Grimsby pulls to
 * actually grant a decoration yet -- `grant` below is the shared
 * primitive any of the three acquisition paths (gold purchase, an
 * achievement firing, a Grimsby card resolving) will call, but only the
 * gold path (`purchase`) is wired to a caller in this patch, same
 * "acquisition is deliberately mixed per item" design already recorded
 * against GuildHallDecorAcquisition's own comment -- the achievement/
 * Grimsby wiring is real follow-up work, not done here.
 *
 * As of patch 0207, this manager is theme-aware: which slots exist and
 * which decoration sits in which slot are both resolved against
 * `activeThemeId(state)`, not one flat theme-blind set the way patch
 * 0203-0206 had it. `GuildHallCustomizeScene.tsx` (the actual in-game
 * "Customize" mode, patch 0204) needed zero changes for this -- it was
 * always going through this manager's own equip/unequip/slots methods
 * rather than reading state directly, so making those methods
 * theme-aware under the hood is invisible to it. There is still no
 * in-game control to change the active theme (`setActiveTheme` below has
 * no caller yet) -- that's real follow-up work, not done here.
 */
export const GuildHallDecorManager = {
  /* -------------------------------- theme -------------------------------- */

  /** Which theme is actually in effect for this save -- `state.
   *  activeGuildHallTheme` if it's set AND still resolves to a real theme
   *  (see `GUILD_HALL_THEME_BY_ID`), else `DEFAULT_GUILD_HALL_THEME_ID`.
   *  The "still resolves" check matters: a theme picked in a past session
   *  could have since been deleted in the DevTool, and reading the raw
   *  field in that case would hand every other method here an id with no
   *  slots and no background -- same "content may drift out from under an
   *  old save, don't crash over it" convention this manager's other
   *  resolve-and-skip methods already follow, just checked once here
   *  rather than separately in each of them. Every other method in this
   *  manager should resolve the active theme through this method, never
   *  by reading `state.activeGuildHallTheme` directly. */
  activeThemeId(state: GameState): string {
    const id = state.activeGuildHallTheme;
    if (id && GUILD_HALL_THEME_BY_ID[id]) return id;
    return DEFAULT_GUILD_HALL_THEME_ID;
  },

  /** Switches the active theme -- validates the theme actually exists
   *  first (an unknown id is a real error here, unlike activeThemeId's
   *  own quiet fallback, since this is the one place a bad id would
   *  actually be a caller mistake rather than old-save drift). Doesn't
   *  touch `equippedGuildHallDecorations` at all -- the whole point of
   *  storing it per theme (see that field's own doc comment in types.ts)
   *  is that switching themes never clears or migrates anything, each
   *  theme just keeps remembering its own arrangement independently. No
   *  caller yet -- the in-game theme picker that will actually call this
   *  is real follow-up work, not built in this patch. */
  setActiveTheme(state: GameState, themeId: string): string | null {
    if (!GUILD_HALL_THEME_BY_ID[themeId]) return 'Unknown theme.';
    state.activeGuildHallTheme = themeId;
    return null;
  },

  /* ------------------------------- slots ------------------------------- */

  /** The active theme's own definition for one slot -- undefined if the
   *  slot doesn't exist, or if the active theme hides it (see
   *  `slotForTheme`'s own comment on that distinction). */
  slot(state: GameState, slotId: GuildHallSlotId): GuildHallSlotDef | undefined {
    return slotForTheme(GuildHallDecorManager.activeThemeId(state), slotId);
  },

  /** Every slot visible in the active theme -- may be fewer than 30 if
   *  this theme hides some. */
  slots(state: GameState): GuildHallSlotDef[] {
    return slotsForTheme(GuildHallDecorManager.activeThemeId(state));
  },

  /* ----------------------------- ownership ------------------------------ */

  owns(state: GameState, decorationId: string): boolean {
    return (state.ownedGuildHallDecorations ?? []).includes(decorationId);
  },

  /** Everything currently owned, resolved against GUILD_HALL_DECORATION_BY_ID
   *  -- an owned id that no longer matches any def (content renamed/removed
   *  after it was already granted) is silently skipped, same "degrade
   *  gracefully" convention CurioManager.owned already follows. Ownership
   *  is global, not per-theme -- buying a decoration unlocks it for every
   *  theme's pool, not just whichever theme was active at purchase time. */
  owned(state: GameState): GuildHallDecorationDef[] {
    return (state.ownedGuildHallDecorations ?? [])
      .map((id) => GUILD_HALL_DECORATION_BY_ID[id])
      .filter((def): def is GuildHallDecorationDef => !!def);
  },

  /** Shared "you now own this" primitive -- idempotent (granting an
   *  already-owned decoration twice is a no-op), doesn't touch gold or
   *  anything else. The primitive every acquisition path (gold purchase,
   *  achievement grant, Grimsby pull) should call once it actually
   *  decides a decoration is earned. */
  grant(state: GameState, decorationId: string): void {
    const owned = state.ownedGuildHallDecorations ?? (state.ownedGuildHallDecorations = []);
    if (!owned.includes(decorationId)) owned.push(decorationId);
  },

  /** The gold-purchase acquisition path -- validates the def exists, is
   *  actually gold-kind, isn't already owned, and the guild can afford it,
   *  then spends the gold and grants it. Same "string|null error, gold
   *  spend + stats.goldSpent" shape GuildManager.upgradeFacility already
   *  uses. Achievement/Grimsby decorations have no purchase path -- this
   *  is gold-kind only, by design. */
  purchase(state: GameState, decorationId: string): string | null {
    const def = GUILD_HALL_DECORATION_BY_ID[decorationId];
    if (!def) return 'Unknown decoration.';
    if (def.acquisition.kind !== 'gold') return `${def.name} isn't purchased with gold.`;
    if (GuildHallDecorManager.owns(state, decorationId)) return `${def.name} is already owned.`;
    const cost = def.acquisition.cost;
    if (state.gold < cost) return 'Not enough gold.';
    state.gold -= cost;
    state.stats.goldSpent += cost;
    GuildHallDecorManager.grant(state, decorationId);
    return null;
  },

  /* ------------------------------ equipping ------------------------------ */

  /** The raw decoration id currently sitting in a slot *of the active
   *  theme*, or undefined if empty -- not resolved against content, see
   *  equippedDecoration for that. */
  equippedId(state: GameState, slotId: GuildHallSlotId): string | undefined {
    const theme = GuildHallDecorManager.activeThemeId(state);
    return state.equippedGuildHallDecorations?.[theme]?.[slotId];
  },

  /** The resolved decoration currently sitting in a slot of the active
   *  theme -- undefined if the slot is empty, or if whatever id is there
   *  no longer matches a real decoration (content drift, same
   *  degrade-gracefully convention as `owned` above). */
  equippedDecoration(state: GameState, slotId: GuildHallSlotId): GuildHallDecorationDef | undefined {
    const id = GuildHallDecorManager.equippedId(state, slotId);
    return id ? GUILD_HALL_DECORATION_BY_ID[id] : undefined;
  },

  /** Every currently-filled slot *of the active theme*, resolved to its
   *  slot def + decoration def -- the shape the Customize UI actually
   *  renders. Slots whose stored id no longer resolves to a real slot
   *  (hidden or removed from this theme since it was equipped) or a real
   *  decoration are skipped rather than shown broken. */
  allEquipped(state: GameState): { slot: GuildHallSlotDef; decoration: GuildHallDecorationDef }[] {
    const theme = GuildHallDecorManager.activeThemeId(state);
    const equipped = state.equippedGuildHallDecorations?.[theme] ?? {};
    const result: { slot: GuildHallSlotDef; decoration: GuildHallDecorationDef }[] = [];
    for (const slotId of Object.keys(equipped) as GuildHallSlotId[]) {
      const slot = slotForTheme(theme, slotId);
      const decoration = GuildHallDecorManager.equippedDecoration(state, slotId);
      if (slot && decoration) result.push({ slot, decoration });
    }
    return result;
  },

  /** Places an owned decoration into a slot of the active theme --
   *  validates the slot exists (and is actually visible in this theme --
   *  a slot this theme hides can't be equipped into, same as one that
   *  never existed), the decoration exists and is owned, and its
   *  `slotType` actually matches the slot's own pool (a wallTrinket item
   *  can't go in the Trophy Case, etc.). Silently overwrites whatever was
   *  in the slot before, same "equip displaces, doesn't fail" shape
   *  EquipmentManager's gear slots already use -- the displaced
   *  decoration isn't lost, it's just no longer equipped anywhere (still
   *  owned, still in the pool). Writing only ever touches the active
   *  theme's own bucket -- every other theme's arrangement is untouched,
   *  which is the entire point of storing this per theme. */
  equip(state: GameState, slotId: GuildHallSlotId, decorationId: string): string | null {
    const theme = GuildHallDecorManager.activeThemeId(state);
    const slot = slotForTheme(theme, slotId);
    if (!slot) return 'Unknown slot.';
    const def = GUILD_HALL_DECORATION_BY_ID[decorationId];
    if (!def) return 'Unknown decoration.';
    if (!GuildHallDecorManager.owns(state, decorationId)) return `${def.name} isn't owned yet.`;
    if (def.slotType !== slot.slotType) return `${def.name} doesn't fit that slot.`;
    const byTheme = state.equippedGuildHallDecorations ?? (state.equippedGuildHallDecorations = {});
    const equipped = byTheme[theme] ?? (byTheme[theme] = {});
    equipped[slotId] = decorationId;
    return null;
  },

  /** Empties a slot of the active theme -- a no-op if it was already
   *  empty. The decoration itself stays owned, exactly like unequipping
   *  gear doesn't destroy it. Only the active theme's own bucket is
   *  touched. */
  unequip(state: GameState, slotId: GuildHallSlotId): void {
    const theme = GuildHallDecorManager.activeThemeId(state);
    const equipped = state.equippedGuildHallDecorations?.[theme];
    if (!equipped) return;
    delete equipped[slotId];
  },
};
