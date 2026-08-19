import { GUILD_HALL_DECORATION_BY_ID } from '../data/guildHallDecor';
import { GUILD_HALL_SLOT_BY_ID } from '../data/guildHallSlots';
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
 */
export const GuildHallDecorManager = {
  /* ------------------------------- slots ------------------------------- */

  slot(slotId: GuildHallSlotId): GuildHallSlotDef | undefined {
    return GUILD_HALL_SLOT_BY_ID[slotId];
  },

  slots(): GuildHallSlotDef[] {
    return Object.values(GUILD_HALL_SLOT_BY_ID);
  },

  /* ----------------------------- ownership ------------------------------ */

  owns(state: GameState, decorationId: string): boolean {
    return (state.ownedGuildHallDecorations ?? []).includes(decorationId);
  },

  /** Everything currently owned, resolved against GUILD_HALL_DECORATION_BY_ID
   *  -- an owned id that no longer matches any def (content renamed/removed
   *  after it was already granted) is silently skipped, same "degrade
   *  gracefully" convention CurioManager.owned already follows. */
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

  /** The raw decoration id currently sitting in a slot, or undefined if
   *  empty -- not resolved against content, see equippedDecoration for
   *  that. */
  equippedId(state: GameState, slotId: GuildHallSlotId): string | undefined {
    return state.equippedGuildHallDecorations?.[slotId];
  },

  /** The resolved decoration currently sitting in a slot -- undefined if
   *  the slot is empty, or if whatever id is there no longer matches a
   *  real decoration (content drift, same degrade-gracefully convention
   *  as `owned` above). */
  equippedDecoration(state: GameState, slotId: GuildHallSlotId): GuildHallDecorationDef | undefined {
    const id = GuildHallDecorManager.equippedId(state, slotId);
    return id ? GUILD_HALL_DECORATION_BY_ID[id] : undefined;
  },

  /** Every currently-filled slot, resolved to its slot def + decoration
   *  def -- the shape a future Customize UI would actually render. Slots
   *  whose stored id no longer resolves to a real decoration are skipped
   *  rather than shown broken. */
  allEquipped(state: GameState): { slot: GuildHallSlotDef; decoration: GuildHallDecorationDef }[] {
    const equipped = state.equippedGuildHallDecorations ?? {};
    const result: { slot: GuildHallSlotDef; decoration: GuildHallDecorationDef }[] = [];
    for (const slotId of Object.keys(equipped) as GuildHallSlotId[]) {
      const slot = GUILD_HALL_SLOT_BY_ID[slotId];
      const decoration = GuildHallDecorManager.equippedDecoration(state, slotId);
      if (slot && decoration) result.push({ slot, decoration });
    }
    return result;
  },

  /** Places an owned decoration into a slot -- validates the slot exists,
   *  the decoration exists and is owned, and its `slotType` actually
   *  matches the slot's own pool (a wallTrinket item can't go in the
   *  Trophy Case, etc.). Silently overwrites whatever was in the slot
   *  before, same "equip displaces, doesn't fail" shape EquipmentManager's
   *  gear slots already use -- the displaced decoration isn't lost, it's
   *  just no longer equipped anywhere (still owned, still in the pool). */
  equip(state: GameState, slotId: GuildHallSlotId, decorationId: string): string | null {
    const slot = GUILD_HALL_SLOT_BY_ID[slotId];
    if (!slot) return 'Unknown slot.';
    const def = GUILD_HALL_DECORATION_BY_ID[decorationId];
    if (!def) return 'Unknown decoration.';
    if (!GuildHallDecorManager.owns(state, decorationId)) return `${def.name} isn't owned yet.`;
    if (def.slotType !== slot.slotType) return `${def.name} doesn't fit that slot.`;
    const equipped = state.equippedGuildHallDecorations ?? (state.equippedGuildHallDecorations = {});
    equipped[slotId] = decorationId;
    return null;
  },

  /** Empties a slot -- a no-op if it was already empty. The decoration
   *  itself stays owned, exactly like unequipping gear doesn't destroy
   *  it. */
  unequip(state: GameState, slotId: GuildHallSlotId): void {
    if (!state.equippedGuildHallDecorations) return;
    delete state.equippedGuildHallDecorations[slotId];
  },
};
