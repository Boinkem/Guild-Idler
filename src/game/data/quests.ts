import { Difficulty, QuestTag } from '../types';
import { HOUR, MINUTE } from '../util';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  baseSuccess: number;
  minDuration: number;
  maxDuration: number;
  minGold: number;
  maxGold: number;
  xpMultiplier: number;
  /** Chance that any loot roll happens at all. */
  lootChance: number;
  reqLevel: number;
  /** Weight when generating the board. */
  weight: number;
  color: string;
  /**
   * A second, short duration range rolled with `burstChance` probability
   * instead of the normal min/maxDuration. A single wide uniform range
   * mostly rolls near its own middle — verified directly, widening Easy's
   * floor to 90s on its own left the *typical* roll still around an hour,
   * so a genuinely fast early hook needs a guaranteed-frequent short mode,
   * not just a wider tail on the existing one.
   */
  burstChance?: number;
  burstMinDuration?: number;
  burstMaxDuration?: number;
  /**
   * Burst quests get their OWN reward range rather than a proportional slice
   * of the full range. A strict proportional slice was tried first and
   * measured directly: it rounded to 1-2 XP per burst quest, which is
   * mathematically fair but reads as insulting rather than "numbers going
   * up" -- exactly what this was supposed to deliver. Onboarding rewards get
   * to be a little generous on purpose.
   */
  burstMinGold?: number;
  burstMaxGold?: number;
  burstMinXp?: number;
  burstMaxXp?: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy', label: 'Easy', baseSuccess: 90,
    // The original 1-2h range stays the norm; a `burst` chance rolls a short
    // 90s-8min contract instead, giving new players frequent fast turnaround
    // without diluting the typical Easy quest into something that's usually
    // neither fast nor properly idle-friendly.
    minDuration: 1 * HOUR, maxDuration: 2 * HOUR,
    burstChance: 45, burstMinDuration: 90 * 1000, burstMaxDuration: 8 * MINUTE,
    burstMinGold: 8, burstMaxGold: 16, burstMinXp: 10, burstMaxXp: 20,
    minGold: 8, maxGold: 25, xpMultiplier: 1, lootChance: 12,
    reqLevel: 1, weight: 30, color: '#79a86b',
  },
  normal: {
    id: 'normal', label: 'Normal', baseSuccess: 75,
    minDuration: 2 * HOUR, maxDuration: 4 * HOUR,
    minGold: 25, maxGold: 60, xpMultiplier: 2.4, lootChance: 20,
    reqLevel: 3, weight: 28, color: '#5b8fd6',
  },
  hard: {
    id: 'hard', label: 'Hard', baseSuccess: 60,
    minDuration: 4 * HOUR, maxDuration: 6 * HOUR,
    minGold: 60, maxGold: 150, xpMultiplier: 5, lootChance: 30,
    reqLevel: 8, weight: 22, color: '#c98b3a',
  },
  epic: {
    id: 'epic', label: 'Epic', baseSuccess: 40,
    minDuration: 6 * HOUR, maxDuration: 12 * HOUR,
    minGold: 150, maxGold: 400, xpMultiplier: 11, lootChance: 45,
    reqLevel: 15, weight: 14, color: '#a874d6',
  },
  legendary: {
    id: 'legendary', label: 'Legendary', baseSuccess: 25,
    minDuration: 12 * HOUR, maxDuration: 24 * HOUR,
    minGold: 500, maxGold: 2000, xpMultiplier: 26, lootChance: 70,
    reqLevel: 25, weight: 6, color: '#d9a441',
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'epic', 'legendary'];

/** Quest names are assembled from a verb, a subject, and an optional place. */
interface Template {
  verb: string;
  subjects: string[];
  tag: QuestTag;
  flavour: string[];
  /**
   * Reserves grandiose "raid boss" templates for the difficulty tiers that
   * deserve them. Omit for a template usable at any difficulty.
   */
  minDifficulty?: Difficulty;
}

/**
 * Quest name templates live in json/quest-templates.json so they can be edited
 * via tools/devtool without touching TypeScript. This file just types and
 * re-exports them.
 */
import questTemplatesJson from './json/quest-templates.json';
export const QUEST_TEMPLATES: Template[] = questTemplatesJson as Template[];

import questPrefixesJson from './json/quest-prefixes.json';
export const QUEST_PREFIXES: string[] = questPrefixesJson as string[];

/* --------------------------- multi-day chains --------------------------- */

export interface ChainStageDef {
  name: string;
  flavour: string;
  difficulty: Difficulty;
  duration: number;
  goldMultiplier: number;
}

export interface ChainDef {
  id: string;
  name: string;
  description: string;
  reqLevel: number;
  stages: ChainStageDef[];
  /** Guaranteed reward on completion. */
  rewardGold: number;
  rewardItems: string[];
  rewardRenown: number;
  /**
   * An epithet granted to whichever hero completes the final stage, shown as
   * "<Title> <Name>". Cleared if that hero later retires.
   */
  title?: string;
  /** A short narrative recap shown on the Lore tab once this chain is completed. */
  epilogue?: string;
}

export const QUEST_CHAINS: ChainDef[] = [
  {
    id: 'millers_problem',
    name: "The Miller's Problem",
    description: "The guild's very first real job. It starts small. It does not stay small for long.",
    reqLevel: 2,
    rewardGold: 150,
    rewardItems: ['cellar_dwellers_tooth'],
    rewardRenown: 1,
    title: 'First Real Job',
    epilogue: 'The thing under the mill turned out to be older than anyone in town could explain, and prouder than it had any right to be. It is gone now. The miller still will not go down to the cellar.',
    stages: [
      { name: "The Miller's Cellar", flavour: "Rats, he says. Just rats. He will not go down there himself, though.", difficulty: 'easy', duration: 45 * MINUTE, goldMultiplier: 1.2 },
      { name: 'Whatever the Rats Were Fleeing', flavour: 'Rats do not usually flee upward. These did.', difficulty: 'easy', duration: 90 * MINUTE, goldMultiplier: 1.3 },
      { name: 'The Thing Under the Mill', flavour: "It has been down there longer than the mill has. It is patient. Twice, for just a moment, it looks at something that isn't you.", difficulty: 'normal', duration: 150 * MINUTE, goldMultiplier: 1.6 },
    ],
  },
  {
    id: 'crows_warning',
    name: "The Crow's Warning",
    description:
      "Thornhollow isn't burned, it's been searched — room by room, like whatever hit it wanted " +
      'something specific. Whoever it bit is not staying human for long, and there is no cure ' +
      'in the town to slow it down. A crow that will not stop following you might be the only ' +
      'reason one reaches Thornhollow in time.',
    reqLevel: 8,
    rewardGold: 900,
    rewardItems: ['crow_feather_charm'],
    rewardRenown: 1,
    title: 'Crow-Friend',
    epilogue: 'The cure held. Whatever bit the people of Thornhollow, it did not get to keep them. The crow never did explain itself, and never really left either.',
    stages: [
      { name: 'Smoke Over Thornhollow', flavour: 'The demons did not raze the town. They were looking for something in it.', difficulty: 'normal', duration: 4 * HOUR, goldMultiplier: 1.4 },
      { name: 'The Trail North', flavour: 'A crow lands on the ruined gate, looks at you, and does not fly off. It has not left since.', difficulty: 'normal', duration: 5 * HOUR, goldMultiplier: 1.5 },
      { name: "Greywick's Alchemist", flavour: 'She needs spider venom, fresh, and she needs it before the ones who were bitten stop being people.', difficulty: 'hard', duration: 6 * HOUR, goldMultiplier: 1.7 },
      { name: 'The Road to IronRest', flavour: 'Four vials, wrapped in cloth, carried like they might still bite.', difficulty: 'hard', duration: 6 * HOUR, goldMultiplier: 1.8 },
    ],
  },
  {
    id: 'harrowers_foot',
    name: "The Harrower's Foot",
    description:
      'A second village culled the same way as the last one — not burned, not looted. Searched. ' +
      'Whatever is directing these raids wants something specific, and it is getting closer to finding it.',
    reqLevel: 11,
    rewardGold: 1300,
    rewardItems: ['ashwoven_charm'],
    rewardRenown: 1,
    title: 'Ash-Reader',
    epilogue: "The pattern held right up until the demons stopped being able to follow it — someone, somewhere, is directing this. Nobody who fought them today learned who.",
    stages: [
      { name: 'The Pattern in the Ash', flavour: 'Every burned house was searched before it burned. That is not how raiding works. That is how looking works.', difficulty: 'normal', duration: 5 * HOUR, goldMultiplier: 1.5 },
      { name: 'What the Foot Soldiers Take', flavour: "They do not fight like animals. They fight like they are being watched by someone who will ask what they found.", difficulty: 'hard', duration: 7 * HOUR, goldMultiplier: 1.8 },
    ],
  },
  {
    id: 'demon_generals_ledger',
    name: "A Demon General's Ledger",
    description:
      'The foot soldiers answer to something larger — a column of demons moving with real ' +
      'discipline, led by something that gives orders instead of just following hunger.',
    reqLevel: 15,
    rewardGold: 2100,
    rewardItems: ['seized_glaive'],
    rewardRenown: 2,
    title: 'Tally-Breaker',
    epilogue: "The general kept records. Names, dates, places, tallied like inventory. One word appears in the margins more than any other, in a hand that is not the general's own: the Harrower. Nobody at IronRest has heard the name before. People have started asking around anyway.",
    stages: [
      { name: "The General's Column", flavour: 'It marches in formation. Demons do not march. Something taught it to.', difficulty: 'hard', duration: 9 * HOUR, goldMultiplier: 2.0 },
      { name: 'The Ledger', flavour: 'It kept count of everyone it took. It was going to keep counting after you, too.', difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'what_the_culled_become',
    name: 'What the Culled Become',
    description:
      "The Harrower's name means nothing yet, but the ledger's tally does — every village it culled has " +
      'reported graves opening from the inside in the weeks since. The people taken did not stay taken. They came back different.',
    reqLevel: 19,
    rewardGold: 2800,
    rewardItems: ['gravewatchers_band'],
    rewardRenown: 2,
    title: 'Grave-Watcher',
    epilogue:
      "Whatever the Harrower takes, it does not keep. It gives back — changed, obedient, still counted. " +
      'Somewhere in the old barrow-ground east of the culled villages, something that was buried a very long ' +
      'time ago has started, very quietly, to stir. Nobody has connected the two yet. Somebody should.',
    stages: [
      { name: 'The Empty Graves', flavour: 'Dug from beneath. No tool marks. No footprints leading away — only toward the old barrow-ground.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 2.1 },
      { name: 'The Harvest', flavour: 'They remember their own names. That is somehow worse than if they did not.', difficulty: 'epic', duration: 13 * HOUR, goldMultiplier: 2.5 },
      { name: 'Something Older Stirs', flavour: 'The barrow-ground has been quiet for three hundred years. It is not quiet tonight.', difficulty: 'epic', duration: 15 * HOUR, goldMultiplier: 2.7 },
    ],
  },
  {
    id: 'proving_the_bastion',
    name: 'Proving the Bastion',
    description:
      'The Thornhollow cure reached IronRest Bastion exactly as promised, carried the last leg ' +
      'by the same guild that ran the vials there in the first place. Captain Maeryn Thorne ' +
      'does not forget a debt like that — and she is long on work that needs trustworthy ' +
      'hands. Prove useful enough, and she has bigger work in mind.',
    reqLevel: 16,
    rewardGold: 3800,
    rewardItems: ['wardens_signet'],
    rewardRenown: 3,
    title: 'Lord of the Keep',
    epilogue: 'Captain Thorne kept her word, which surprised exactly no one who had met her. The Keep changed hands quietly, the way most important things do, and the guild has had a home worth defending ever since.',
    stages: [
      { name: 'Officers of IronRest', flavour: "Captain Thorne does not say please. She does not need to.", difficulty: 'normal', duration: 6 * HOUR, goldMultiplier: 1.6 },
      { name: 'Beasts on the Border', flavour: "Whatever is thinning the border patrols, it is not raiders. Raiders don't leave tracks like that.", difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 1.9 },
      { name: 'The Fort in the North-West', flavour: "Thorne's terms: take the fort back, and the Keep is yours — so long as IronRest can always call on it.", difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.4 },
      { name: "The Demon Lord's Throne", flavour: 'Whatever ruled here did not build a throne room to be comfortable. It built one to be seen from.', difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3.2 },
    ],
  },
  {
    id: 'granite_crossing',
    name: 'Granite Crossing',
    description:
      'The Keep is yours now, and the war table already has a name pinned to it: Granite ' +
      "Crossing, home of the west coast's Stone Masons Guild. IronRest has heard nothing from " +
      'it in weeks.',
    reqLevel: 20,
    rewardGold: 2400,
    rewardItems: ['bulwark_cuirass'],
    rewardRenown: 2,
    title: "Garrick's End",
    epilogue: "Garrick's raiders scattered the moment he stopped giving orders, which told its own story about what kind of leader he actually was. The Stone Masons Guild has not forgotten who reopened their gate.",
    stages: [
      { name: 'The Silent Quarry', flavour: 'Garrick and his raiders hold the town gate. The masons hold everything behind it, for now.', difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 2.0 },
      { name: "Garrick's Reckoning", flavour: 'He built his camp inside the quarry itself. Stonemasons do not forget who did that.', difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'farm_at_the_edge',
    name: 'The Farm at the Edge',
    description:
      "No word from the border farm in ten days, and IronRest's riders have not come back " +
      'either. The Keep sends its own this time.',
    reqLevel: 24,
    rewardGold: 3200,
    rewardItems: ['gravekeepers_gloves'],
    rewardRenown: 2,
    title: 'Farmwarden',
    epilogue: 'Whatever Vayne was turning into, it did not finish. The farmland recovered faster than the stories about what was found in that farmhouse basement did.',
    stages: [
      { name: 'No Word From the Farm', flavour: 'The fields are untouched. The farmhouse is not. Raiders, but dug in like they mean to stay.', difficulty: 'hard', duration: 9 * HOUR, goldMultiplier: 2.1 },
      { name: 'What Vayne Was Becoming', flavour: "Captain Vayne is mid-ritual when you find her — something is being poured into her, paid for with more than she has left to give.", difficulty: 'epic', duration: 13 * HOUR, goldMultiplier: 2.5 },
    ],
  },
  {
    id: 'the_pale_rider',
    name: 'The Pale Rider',
    description:
      "A squire is waiting at the Keep when you return — sent ahead by the Paladins of the " +
      'Ashen Hand, who arrive not long after asking for help few others would agree to. They ' +
      'are hunting something they call the Pale Rider, and they have been losing.',
    reqLevel: 32,
    rewardGold: 12000,
    rewardItems: ['sword_of_the_ashen_hand', 'bulwark_of_the_war_saint'],
    rewardRenown: 5,
    title: 'Ashen-Sworn',
    epilogue: 'He dismounted, in the end. The Paladins of the Ashen Hand do not talk about what that looked like, and nobody has pushed them to.',
    stages: [
      { name: "The Ashen Hand's Plea", flavour: 'They do not ask for help easily. That they are asking at all should worry you more than it does.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.6 },
      { name: 'The Road to Saint Aurlias Rest', flavour: 'An old war-cleric built a church there once, long before anyone needed protecting from what sleeps under it now. Hoofprints on this road, and only this road, for eleven miles.', difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.9 },
      { name: 'The Dead of Saint Aurlias', flavour: 'The graves emptied from the inside, same as everywhere else the Harrower has passed — except these are walking toward the church, not away from it, like something on the other side of that door is calling them home.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 3.1 },
      { name: 'The Rider in the Nave', flavour: 'He was waiting behind the doors the dead were so eager to reach. He does not dismount. He has not needed to in a very long time.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 4.0 },
    ],
  },
  {
    id: 'dragon_hunt',
    name: 'The Dragon Hunt',
    description: 'Something is burning Emberfell, northernmost of the holdfasts. Four stages, several days, one dragon.',
    reqLevel: 18,
    rewardGold: 4000,
    rewardItems: ['dragon_helm', 'dragon_blade'],
    rewardRenown: 2,
    title: 'Dragonbane',
    epilogue: "Emberfell does not burn anymore. The dragon's hoard more than covered the cost of rebuilding, which several holdfast elders have pointed out was a strange kind of silver lining.",
    stages: [
      { name: 'Follow the Ash Trail', flavour: 'Cold ash, warm ground. It passed here recently.', difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'Question the Survivors', flavour: 'They describe wings the width of the valley.', difficulty: 'normal', duration: 6 * HOUR, goldMultiplier: 1.5 },
      { name: 'Scale the Cinder Pass', flavour: 'The only way up is the way it flies down.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2 },
      { name: 'The Dragon of Emberfell', flavour: 'No retreat from here. Bring everything.', difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3 },
    ],
  },
  {
    id: 'lost_kingdom',
    name: 'Lost Kingdom Expedition',
    description: 'A kingdom that maps forgot. Long roads, older ruins, and a very well-paid patron.',
    reqLevel: 14,
    rewardGold: 2600,
    rewardItems: ['crown_of_the_lost'],
    rewardRenown: 1,
    title: 'Kingdom-Finder',
    epilogue: 'The vault gave up what it was built to protect, and the kingdom that built it stayed exactly as lost as it was before — some things are not meant to be found twice.',
    stages: [
      { name: 'Chart the Grey Marches', flavour: 'Six days of nothing, then a road that should not exist.', difficulty: 'normal', duration: 10 * HOUR, goldMultiplier: 1.6 },
      { name: 'Cross the Silent Bridge', flavour: 'It holds. That is the surprising part.', difficulty: 'hard', duration: 12 * HOUR, goldMultiplier: 1.8 },
      { name: 'Open the Sunken Vault', flavour: 'Whatever they locked away, they locked it well.', difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'demon_fortress',
    name: 'Demon Fortress Assault',
    description: 'The guild is gathering banners. Whoever you send has been asked to lead the breach.',
    reqLevel: 22,
    rewardGold: 6500,
    rewardItems: ['dragon_armor', 'amulet_of_fortune'],
    rewardRenown: 3,
    title: 'Hellgate Breaker',
    epilogue: "The iron gate finally opened for someone who wasn't trying to get out. The choir kept singing a while longer, as it turned out — but that is a story that starts somewhere else.",
    stages: [
      { name: 'Break the Outer Siege', flavour: 'Ladders, fire, and a very long night.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 2 },
      { name: 'Silence the Warding Choir', flavour: 'The singing has not stopped in nine years. It stops today — or you tell yourself that, going in.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.4 },
      { name: 'The Iron Gate', flavour: 'Held by something that remembers the last siege.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
      { name: 'Descend to the Throne', flavour: 'One door left. It is already open.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.5 },
    ],
  },
  {
    id: 'ancient_crown',
    name: 'Search for the Ancient Crown',
    description: 'Three fragments, three regions, one very persistent rumour.',
    reqLevel: 10,
    rewardGold: 1800,
    rewardItems: ['lucky_ring'],
    rewardRenown: 1,
    title: 'Crownbearer',
    epilogue: 'Three fragments, three very different hiding places, one crown that fits exactly as well as it should. Nobody has explained why it was worth hiding in the first place.',
    stages: [
      { name: 'The Fragment in the Fen', flavour: 'Wet, cold, and guarded by something patient.', difficulty: 'normal', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'The Fragment in the Vault', flavour: 'The banker insists it is a paperweight.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Fragment in the Fire', flavour: 'Last seen inside an active forge. Naturally.', difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.2 },
    ],
  },
  {
    id: 'goblin_warband',
    name: "The Goblin King's Warband",
    description: 'A goblin chieftain has united three warbands under one crown. Someone should un-unite them.',
    reqLevel: 6,
    rewardGold: 550,
    rewardItems: ['warband_cleaver'],
    rewardRenown: 1,
    title: 'Warband-Breaker',
    epilogue: "Three warbands, one crown, and considerably less unity than the goblin king was hoping for. The crown, it turns out, was stolen from someone else's story entirely — but that is a different job for a different day.",
    stages: [
      { name: 'Scatter the Outriders', flavour: 'They ride ahead of the warband, loud and badly armoured.', difficulty: 'normal', duration: 3 * HOUR, goldMultiplier: 1.3 },
      { name: "The Chieftain's Camp", flavour: 'He wears three crowns. None of them fit. All of them are stolen.', difficulty: 'hard', duration: 5 * HOUR, goldMultiplier: 1.6 },
    ],
  },
  {
    id: 'hollow_choir',
    name: 'The Hollow Choir',
    description:
      'The guild silenced a choir like this once before, at the fortress. It stopped for exactly ' +
      'as long as it took to relocate. Something has been singing in the old cathedral for nine ' +
      'years straight. It never breathes.',
    reqLevel: 26,
    rewardGold: 5200,
    rewardItems: ['choir_mask', 'silenced_bell'],
    rewardRenown: 2,
    title: 'Choir-Silencer',
    epilogue: 'The singing stopped for real this time — or at least, it has been quiet long enough that most people have stopped flinching at cathedral bells. Most people.',
    stages: [
      { name: 'Follow the Hymn', flavour: 'It carries for miles and never repeats a verse. You have heard something close to it before, at the fortress.', difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Choir Loft', flavour: 'No singers. Just mouths, carved into the stone, still moving.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.2 },
      { name: 'Silence the Chord', flavour: 'Whatever it is building toward, it is almost finished.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
    ],
  },
  {
    id: 'world_ender',
    name: "The World-Ender's Vigil",
    description:
      'A capstone expedition for guilds that have already retired a hero or two. Five stages, ' +
      'no easy ones, and a patron who refuses to say what is actually waiting at the end.',
    reqLevel: 34,
    rewardGold: 22000,
    rewardItems: ['voidforged_blade', 'voidforged_crown', 'voidforged_plate', 'voidforged_signet'],
    rewardRenown: 6,
    title: "World's End",
    epilogue: 'It did not have a name when this started, and it does not have one now. What it had, it does not have anymore. That will have to be enough of an ending.',
    stages: [
      { name: 'The Road That Should Not Exist', flavour: 'It appeared on the map three nights ago. It has always been on the ground.', difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.6 },
      { name: 'The Watchers in the Dark Between Stars', flavour: 'They have been counting something. You do not want to know what.', difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3.2 },
      { name: 'The Court of the Unmade King', flavour: 'He ruled before the first kingdom. He intends to rule after the last.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.6 },
      { name: 'The Breaking of the Vigil', flavour: 'Whatever has been holding it back is tired. So are you. Keep going anyway.', difficulty: 'legendary', duration: 28 * HOUR, goldMultiplier: 4.0 },
      { name: 'The World-Ender', flavour: 'It does not have a name. It has never needed one. This ends here, one way or the other.', difficulty: 'legendary', duration: 32 * HOUR, goldMultiplier: 5.0 },
    ],
  },
  {
    id: 'hollow_king',
    name: "The Hollow King's Return",
    description:
      'For guilds a run or two into prestige. The barrow-ground that stirred quietly for months has ' +
      'stopped being quiet. The king everyone thought was buried is not staying that way, and the ' +
      'things escorting him back are worse than he is.',
    reqLevel: 45,
    rewardGold: 42000,
    rewardItems: ['empyrean_blade', 'empyrean_halo', 'empyrean_aegis'],
    rewardRenown: 10,
    title: 'Kingslayer Twice Over',
    epilogue: 'He is buried again, properly this time, under considerably more stone than the last attempt. The court that followed him has not been seen since, which is either good news or the kind of quiet that precedes worse news.',
    stages: [
      { name: 'The Grave Reopens', flavour: 'The seal held for three hundred years. It held for one night less than it needed to.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.8 },
      { name: 'The Procession of the Dead Court', flavour: 'Every advisor he ever executed is walking behind him now, and none of them look angry anymore. That is worse.', difficulty: 'legendary', duration: 22 * HOUR, goldMultiplier: 3.4 },
      { name: 'The Bridge of Forgotten Oaths', flavour: 'It only holds the weight of those who never broke a promise. Cross carefully.', difficulty: 'legendary', duration: 26 * HOUR, goldMultiplier: 3.8 },
      { name: 'The Second Coronation', flavour: 'He is almost home. The crown remembers him even if the kingdom does not.', difficulty: 'legendary', duration: 30 * HOUR, goldMultiplier: 4.4 },
    ],
  },
  {
    id: 'last_god',
    name: 'Requiem for the Last God',
    description:
      'The deepest expedition the guild has ever chartered. There is no patron this time — nobody ' +
      'left to pay for it. The guild has stared down a nameless thing at the edge of the world and ' +
      'a king who would not stay buried; neither prepared anyone for this. You are doing this ' +
      'because someone has to, and everyone else already tried.',
    reqLevel: 55,
    rewardGold: 90000,
    rewardItems: ['the_last_ember'],
    rewardRenown: 20,
    title: 'Requiem-Bearer',
    epilogue: 'There is a difference between winning and being the one left standing when it is over. The guild is still deciding which of those this was.',
    stages: [
      { name: 'The Last Map', flavour: 'Every cartographer who charted this route stopped charting anything afterward.', difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 4.0 },
      { name: 'The Field of Failed Guilds', flavour: 'Banners, still standing, none of them yours. Yet.', difficulty: 'legendary', duration: 28 * HOUR, goldMultiplier: 4.5 },
      { name: 'The Silence Where Prayer Used to Work', flavour: 'Nothing answers here anymore. That used to be a comfort to something.', difficulty: 'legendary', duration: 32 * HOUR, goldMultiplier: 5.0 },
      { name: 'What Is Left of It', flavour: 'Not a battle. A kindness, if you can call it that. Someone has to finish the story.', difficulty: 'legendary', duration: 36 * HOUR, goldMultiplier: 6.0 },
    ],
  },
];
