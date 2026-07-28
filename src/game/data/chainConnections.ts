/**
 * Presentation-only metadata: which chains narratively continue into which
 * others. Deliberately kept separate from ChainDef/quests.ts rather than
 * added as a field there, since this doesn't affect gameplay at all -- it
 * only decides whether the Lore tab shows a "Continues in..." tag.
 *
 * A connection only ever renders once BOTH chains are in completedChains
 * (see LorePanel), so this can safely list a chain the player hasn't
 * reached yet without spoiling anything.
 */
export interface ChainConnection {
  from: string;
  to: string;
}

export const CHAIN_CONNECTIONS: ChainConnection[] = [
  // The demon lord's throne falls, but the warding choir it caged escapes
  // in the noise -- picked back up, and finally ended, in hollow_choir.
  { from: 'demon_fortress', to: 'hollow_choir' },
  // The barrow-ground left "stirring" here is what hollow_king reopens.
  { from: 'what_the_culled_become', to: 'hollow_king' },
  // last_god's own prologue explicitly calls back to both prior capstones --
  // the Watchers' count from world_ender, and the throne room from
  // hollow_king -- so it gets two incoming connections.
  { from: 'world_ender', to: 'last_god' },
  { from: 'hollow_king', to: 'last_god' },
];

/** Chain ids this chain leads into, that the player has actually reached. */
export function outgoingConnections(chainId: string, completedIds: Set<string>): string[] {
  return CHAIN_CONNECTIONS
    .filter((c) => c.from === chainId && completedIds.has(c.to))
    .map((c) => c.to);
}

/** Chain ids that lead into this chain, that the player has actually reached. */
export function incomingConnections(chainId: string, completedIds: Set<string>): string[] {
  return CHAIN_CONNECTIONS
    .filter((c) => c.to === chainId && completedIds.has(c.from))
    .map((c) => c.from);
}
