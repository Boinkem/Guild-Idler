import { ChainReplayDifficulty, ChainReplayDifficultyConfig, ChainReplayTierDef, GameState } from '../types';
import { Tuning } from './tuning';

/**
 * Replayable Quest Chains (patch 0224 on) -- see guild-idler-status.md's
 * Backlog entry for the full design. Lives in its own file for the same
 * reason RAID_DIFFICULTIES/RAID_UPGRADES live apart from the general
 * quest data: this is a deliberately separable system, not an extension
 * of ordinary quest-chain logic.
 *
 * Normal's numbers are all baseline zero-point (no penalty, no bonus,
 * x1 duration) rather than meaningfully "tunable" values, so they stay
 * literal here, same precedent RAID_DIFFICULTIES' own `normal` entry
 * already established. Heroic/Legendary read every field from the
 * tuning registry -- editable live via the devtool's Tuning tab, see
 * tuning.ts and tuning.json.
 *
 * Deliberately softer than RAID_DIFFICULTIES' own Heroic/Legendary
 * (20/50 successPenalty there vs 15/35 here) -- raids' brutal curve was
 * an explicit design choice for genuinely hard party content; chain
 * replay is meant to be a lighter-weight, solo-hero repeatable activity,
 * not a second raid ladder wearing a different name. First-pass numbers,
 * same "flagged for Balance Sandbox verification before treated as
 * final" caveat every other new economy number in this codebase gets.
 */
/**
 * Replayable Quest Chains (patch 0224 on) -- see guild-idler-status.md's
 * Backlog entry for the full design. Lives in its own file for the same
 * reason RAID_DIFFICULTIES/RAID_UPGRADES live apart from the general
 * quest data: this is a deliberately separable system, not an extension
 * of ordinary quest-chain logic.
 *
 * Normal's numbers are all baseline zero-point (no penalty, no bonus,
 * x1 duration) rather than meaningfully "tunable" values, so they stay
 * literal here, same precedent RAID_DIFFICULTIES' own `normal` entry
 * already established. Heroic/Mythic/Legendary read every field from
 * the tuning registry -- editable live via the devtool's Tuning tab, see
 * tuning.ts and tuning.json.
 *
 * Deliberately softer than RAID_DIFFICULTIES' own Heroic/Mythic/Legendary
 * (20/50/70 successPenalty there vs 15/35/50 here) -- raids' brutal curve
 * was an explicit design choice for genuinely hard party content; chain
 * replay is meant to be a lighter-weight, solo-hero repeatable activity,
 * not a second raid ladder wearing a different name. First-pass numbers,
 * same "flagged for Balance Sandbox verification before treated as
 * final" caveat every other new economy number in this codebase gets.
 *
 * Patch 0317 (Prestige/Retirement Rework): 'mythic' is new, inserted
 * between 'heroic' and 'legendary' -- the existing 'legendary' entry
 * below keeps its name/tuning keys/values unchanged, it's just one rung
 * higher on a longer ladder now, same shared vocabulary as raids' own
 * Normal/Heroic/Mythic/Legendary. Mythic and Legendary both now pay
 * Renown on a clear (see renownForChainReplayClear in progression.ts);
 * Normal/Heroic stay gold-only, unchanged.
 */
export const CHAIN_REPLAY_DIFFICULTIES: Record<ChainReplayDifficulty, ChainReplayDifficultyConfig> = {
  normal: { difficulty: 'normal', successPenalty: 0, lootBonus: 0, durationMultiplier: 1 },
  heroic: {
    difficulty: 'heroic',
    successPenalty: Tuning.get('chain_replay_difficulty.heroic.successPenalty'),
    lootBonus: Tuning.get('chain_replay_difficulty.heroic.lootBonus'),
    durationMultiplier: Tuning.get('chain_replay_difficulty.heroic.durationMultiplier'),
  },
  mythic: {
    difficulty: 'mythic',
    successPenalty: Tuning.get('chain_replay_difficulty.mythic.successPenalty'),
    lootBonus: Tuning.get('chain_replay_difficulty.mythic.lootBonus'),
    durationMultiplier: Tuning.get('chain_replay_difficulty.mythic.durationMultiplier'),
  },
  legendary: {
    difficulty: 'legendary',
    successPenalty: Tuning.get('chain_replay_difficulty.legendary.successPenalty'),
    lootBonus: Tuning.get('chain_replay_difficulty.legendary.lootBonus'),
    durationMultiplier: Tuning.get('chain_replay_difficulty.legendary.durationMultiplier'),
  },
};

/**
 * The master unlock (reveals Replay Memories existing at all, same role
 * `'chains'` plays for Discovered Quests) plus the 6 saga bands -- see
 * the Backlog's saga-name table for the authoritative chain-to-band
 * mapping this was built from. `chainIds` is empty for `master` since it
 * gates the feature itself, not any specific chains. No forced
 * prerequisite ordering between entries (checked purchase-side, not
 * encoded here) -- same as raidsHeroic/raidsLegendary today, cost alone
 * naturally encourages roughly-in-order buying.
 *
 * goldCost values are first-pass, same Balance Sandbox caveat as the
 * difficulty numbers above -- not yet verified against a real playtest
 * curve.
 */
export const CHAIN_REPLAY_TIERS: ChainReplayTierDef[] = [
  {
    id: 'master',
    sagaName: 'Replay Memories',
    levelRange: '',
    description: 'Unlocks the Replay Memories tab -- revisit completed story chains for a chance at Heroic, Mythic, and Legendary gear.',
    chainIds: [],
    goldCost: Tuning.get('chain_replay_tier.master.goldCost'),
  },
  {
    // Patch 0303 -- Saga Auto-Pilot. Sits right under 'master' in this
    // array (the very next Replay Memories upgrade card, direct
    // request) rather than after the 6 bands: it's a capability that
    // applies across every band, same "gates the feature, not any
    // specific chains" shape 'master' itself already uses (chainIds:
    // []), so it belongs beside master conceptually as well as visually.
    // Bought like any other tier (GuildManager.buyChainReplayTier
    // already handles an arbitrary tier id generically, no code change
    // needed there) and requires 'master' first, same "canBuy" gating
    // TierCard already applies to every non-master entry.
    id: 'autopilot',
    sagaName: 'Saga Auto-Pilot',
    levelRange: '',
    description: 'Once unlocked, a saga band card gets a "Queue Auto-Pilot" option -- send a hero through every replayable chain in that band, back-to-back, at one chosen difficulty, with no manual re-send between stages or chains. A failed stage still stops the whole run right there.',
    chainIds: [],
    goldCost: Tuning.get('chain_replay_tier.autopilot.goldCost'),
  },
  {
    id: 'band1',
    sagaName: 'The Founding Days',
    levelRange: 'Levels 1-7',
    description: 'Lets your guild replay The Founding Days (The First Haul, The Miller\'s Problem, Bandits on the Old Road, The Last Clutch, The Man Who Sells "Maybe", Goblin Warband, The Third Crown) for a chance at Heroic, Mythic, and Legendary gear.',
    chainIds: [
      'the_first_haul', 'millers_problem', 'bandits_on_the_old_road', 'the_last_clutch',
      'the_man_who_sells_maybe', 'goblin_warband', 'the_gathering_horde',
    ],
    goldCost: Tuning.get('chain_replay_tier.band1.goldCost'),
  },
  {
    id: 'band2',
    sagaName: "The Harrower's Shadow",
    levelRange: 'Levels 8-14',
    description: "Lets your guild replay The Harrower's Shadow (Crow's Warning, Search for the Ancient Crown, Harrower's Foot, Something Big in the Foothills, Lost Kingdom Expedition) for a chance at Heroic, Mythic, and Legendary gear.",
    chainIds: [
      'crows_warning', 'ancient_crown', 'harrowers_foot', 'something_big_in_the_foothills', 'lost_kingdom',
    ],
    goldCost: Tuning.get('chain_replay_tier.band2.goldCost'),
  },
  {
    id: 'band3',
    sagaName: 'The Wyrmfire Years',
    levelRange: 'Levels 15-19',
    description: "Lets your guild replay The Wyrmfire Years (The Demon General's Ledger, Proving the Bastion, Full Moon Over Ashvale, Dragon Hunt, What the Culled Become) for a chance at Heroic, Mythic, and Legendary gear.",
    chainIds: [
      'demon_generals_ledger', 'proving_the_bastion', 'full_moon_over_ashvale', 'dragon_hunt', 'what_the_culled_become',
    ],
    goldCost: Tuning.get('chain_replay_tier.band3.goldCost'),
  },
  {
    id: 'band4',
    sagaName: 'The Fortress Campaign',
    levelRange: 'Levels 20-26',
    description: 'Lets your guild replay The Fortress Campaign (Granite Crossing, Demon Fortress Assault, Farm at the Edge, The Hollow Choir) for a chance at Heroic, Mythic, and Legendary gear.',
    chainIds: ['granite_crossing', 'demon_fortress', 'farm_at_the_edge', 'hollow_choir'],
    goldCost: Tuning.get('chain_replay_tier.band4.goldCost'),
  },
  {
    id: 'band5',
    sagaName: 'The Ashen Vigil',
    levelRange: 'Levels 29-35',
    description: 'Lets your guild replay The Ashen Vigil (The Body Snatcher Problem, The Pale Rider, World-Ender, Quiet in Millbrook) for a chance at Heroic, Mythic, and Legendary gear.',
    chainIds: ['body_snatcher_problem', 'the_pale_rider', 'world_ender', 'quiet_in_millbrook'],
    goldCost: Tuning.get('chain_replay_tier.band5.goldCost'),
  },
  {
    id: 'band6',
    sagaName: 'The Last Reckoning',
    levelRange: 'Levels 37-45',
    description: 'Lets your guild replay The Last Reckoning (Hunt-a-Lich, The Loom Beneath, The Last Pilgrimage, The Hollow King) for a chance at Heroic, Mythic, and Legendary gear.',
    chainIds: ['hunt_a_lich', 'the_loom_beneath', 'last_pilgrimage', 'hollow_king'],
    goldCost: Tuning.get('chain_replay_tier.band6.goldCost'),
  },
];

export const CHAIN_REPLAY_TIER_BY_ID: Record<string, ChainReplayTierDef> = Object.fromEntries(
  CHAIN_REPLAY_TIERS.map((t) => [t.id, t]),
);

/** Which saga band (if any) a given chain id belongs to -- null for the
 *  'master' entry itself, which covers no specific chains. Used both by
 *  eligibility checks (is this chain's band owned?) and by the Replay
 *  Memories UI (which band card does this chain's difficulty picker sit
 *  under?). */
export function chainReplayTierForChain(chainId: string): ChainReplayTierDef | undefined {
  return CHAIN_REPLAY_TIERS.find((t) => t.chainIds.includes(chainId));
}

/**
 * Percentage of a saga band's own chains that have been replay-cleared at
 * AT LEAST the given difficulty -- added in patch 0251 for the Replay
 * Memories "% complete" display, updating live as the person switches
 * between the N/H/L tabs (direct request). "At least" rather than "exactly"
 * matches how the difficulty picker itself reads: a chain already cleared
 * at Legendary obviously also satisfies "cleared at Heroic or better." The
 * 'master' entry (chainIds: []) always returns 0 -- it gates the feature
 * itself, not any specific chains, so "% complete" has no meaning there;
 * callers should simply not render this for it.
 */
export function chainReplayBandPercent(state: GameState, bandId: string, difficulty: ChainReplayDifficulty): number {
  const band = CHAIN_REPLAY_TIER_BY_ID[bandId];
  if (!band || band.chainIds.length === 0) return 0;
  const atLeast = (cleared: ChainReplayDifficulty[]) => {
    if (difficulty === 'normal') return cleared.length > 0;
    if (difficulty === 'heroic') return cleared.includes('heroic') || cleared.includes('mythic') || cleared.includes('legendary');
    if (difficulty === 'mythic') return cleared.includes('mythic') || cleared.includes('legendary');
    return cleared.includes('legendary');
  };
  const done = band.chainIds.filter((id) => atLeast(state.chainReplayCompletions[id] ?? [])).length;
  return Math.round((done / band.chainIds.length) * 100);
}

/** True once every chain in a band has been replay-cleared at least at the
 *  given difficulty -- thin wrapper around chainReplayBandPercent for
 *  callers that just need a yes/no (e.g. Kobold's milestone unlock, see
 *  heroMilestones.ts). */
export function chainReplayBandComplete(state: GameState, bandId: string, difficulty: ChainReplayDifficulty): boolean {
  return chainReplayBandPercent(state, bandId, difficulty) >= 100;
}
