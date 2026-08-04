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
    // Base burst numbers, before the per-run level taper applied in
    // QuestManager.generateOffer -- reduced somewhat from their original
    // values on their own (10/20 xp, 8/16 gold), which measured out to
    // roughly 10-15x the normal per-hour rate for a hero at reqLevel 1.
    burstMinGold: 6, burstMaxGold: 12, burstMinXp: 8, burstMaxXp: 14,
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
    // xpMultiplier raised 11 -> 12. Verified directly: at 11, Epic's xp/hr
    // (17.0) was actually LOWER than Hard's (17.3) despite requiring a
    // higher level and harder odds -- the opposite of what progressing
    // through the tiers should feel like. 12 puts Epic at ~18.6 xp/hr,
    // clearing Hard with real margin. Gold is unaffected and already
    // climbs correctly tier over tier.
    minGold: 150, maxGold: 400, xpMultiplier: 12, lootChance: 45,
    reqLevel: 15, weight: 14, color: '#a874d6',
  },
  legendary: {
    id: 'legendary', label: 'Legendary', baseSuccess: 25,
    minDuration: 12 * HOUR, maxDuration: 24 * HOUR,
    // Same fix, same reasoning -- 26 put Legendary's xp/hr (16.5) below
    // BOTH Hard and Epic. 30 lands it at ~19.0 xp/hr, now the actual best
    // in the game, matching its own level requirement and odds.
    minGold: 500, maxGold: 2000, xpMultiplier: 30, lootChance: 70,
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
  /**
   * A prior chain that must appear in state.completedChains before this one
   * can ever be offered -- confirmed against the actual prose (each of
   * these chains directly references the one before it, not just shares a
   * loose theme), not gated purely on level the way every chain already is.
   * A gated chain otherwise behaves exactly like a level-gated one: it just
   * never appears on the board yet, counted the same as any other
   * undiscovered chain -- no new UI needed for this.
   */
  requiresChainId?: string;
}

export const QUEST_CHAINS: ChainDef[] = [
  {
    id: 'millers_problem',
    name: "The Miller's Problem",
    description: "The guild's very first real job, and it looks simple enough from the doorway: a miller, a locked cellar door, and a smell that has been getting worse for a week. It will not stay simple past the first step down.",
    reqLevel: 2,
    rewardGold: 150,
    rewardItems: ['cellar_dwellers_tooth'],
    rewardRenown: 1,
    title: 'First Real Job',
    epilogue: "Whatever lived under that mill was older than anyone in town could explain, and considerably prouder than it had any right to be. It's gone now, dragged out into daylight it clearly hadn't seen in a very long time. The miller still won't go down to that cellar, and probably never will again.",
    stages: [
      { name: "The Miller's Cellar", flavour: "The miller wrings his hat in both hands and swears it's just rats -- big ones, loud ones, but rats. He hasn't gone down those cellar stairs himself in three days, and isn't planning to start today either.", difficulty: 'easy', duration: 45 * MINUTE, goldMultiplier: 1.2 },
      { name: 'Whatever the Rats Were Fleeing', flavour: 'The rats are running the wrong way -- up the stairs, into the mill, anywhere but down -- and rats only run toward danger when whatever they left behind is worse.', difficulty: 'easy', duration: 90 * MINUTE, goldMultiplier: 1.3 },
      { name: 'The Thing Under the Mill', flavour: "It has waited under this mill longer than the mill has stood, patient in the particular way old things get patient. Twice now it turns its head toward a corner of the cellar that has nothing in it -- nothing you can see, anyway.", difficulty: 'normal', duration: 150 * MINUTE, goldMultiplier: 1.6 },
    ],
  },
  {
    id: 'crows_warning',
    name: "The Crow's Warning",
    description:
      "Thornhollow hasn't been burned -- it's been searched, room by room, drawer by drawer, like " +
      "whatever came through wanted something specific and didn't find it the first time. Whoever " +
      "it bit won't stay human much longer, and there's no cure anywhere in the ruins to slow that " +
      "down. A crow that refuses to stop following you might be the only reason one arrives in time.",
    reqLevel: 8,
    rewardGold: 900,
    rewardItems: ['crow_feather_charm'],
    rewardRenown: 1,
    title: 'Crow-Friend',
    epilogue: "The cure held. Whatever bit the people of Thornhollow got its teeth into them and nothing more -- they're still themselves, still filling the same tavern that used to be full. The crow never did explain itself, and it never really left either; it's still around, most days, watching from somewhere just out of reach.",
    stages: [
      { name: 'Smoke Over Thornhollow', flavour: "The demons didn't raze this town -- they went through it door by door, upending drawers and tearing up floorboards, looking for something specific and leaving everything else untouched. That's worse than raiding. Raiding you can understand.", difficulty: 'normal', duration: 4 * HOUR, goldMultiplier: 1.4 },
      { name: 'The Trail North', flavour: "A crow lands on the ruined gate as you leave, tilts its head, and doesn't fly off. It hasn't left your shoulder since -- through two towns and a river crossing -- like it knows exactly where this is going and isn't willing to risk you getting there without it.", difficulty: 'normal', duration: 5 * HOUR, goldMultiplier: 1.5 },
      { name: "Greywick's Alchemist", flavour: "She's already grinding spider venom before you finish explaining, hands moving faster than her questions. Fresh is the only word that matters here -- the ones who were bitten are still people right now, and every hour past fresh shortens how long that stays true.", difficulty: 'hard', duration: 6 * HOUR, goldMultiplier: 1.7 },
      { name: 'The Road to IronRest', flavour: "Four vials, wrapped in cloth thick enough that you can't feel them shift, carried the way you'd carry something that might still be alive. Every mile closer to IronRest is a mile further from the ones still waiting to find out if this works.", difficulty: 'hard', duration: 6 * HOUR, goldMultiplier: 1.8 },
    ],
  },
  {
    id: 'harrowers_foot',
    requiresChainId: 'crows_warning',
    name: "The Harrower's Foot",
    description:
      'A second village has been culled the exact same way as the last one -- not burned, not ' +
      'looted, searched, drawer by drawer, room by room. Whatever is directing these raids wants ' +
      'something specific, and every village it empties brings it a little closer to finding it.',
    reqLevel: 11,
    rewardGold: 1300,
    rewardItems: ['ashwoven_charm'],
    rewardRenown: 1,
    title: 'Ash-Reader',
    epilogue: "The pattern held right up until the demons stopped being able to explain it themselves -- something, somewhere, gave every one of those orders, and nobody who fought them today walked away knowing who.",
    stages: [
      { name: 'The Pattern in the Ash', flavour: "Every burned house in this village was searched before it burned, and searched thoroughly -- floorboards pried up, cellars emptied, nothing left to chance. That isn't how raiding works. That's how looking works, and looking means someone is still searching for something they haven't found yet.", difficulty: 'normal', duration: 5 * HOUR, goldMultiplier: 1.5 },
      { name: 'What the Foot Soldiers Take', flavour: "These demons don't fight like animals starving for the next kill -- they fight like soldiers being watched, like something is going to ask them afterward exactly what they found and where. Whatever's giving these orders expects a full report.", difficulty: 'hard', duration: 7 * HOUR, goldMultiplier: 1.8 },
    ],
  },
  {
    id: 'demon_generals_ledger',
    requiresChainId: 'harrowers_foot',
    name: "A Demon General's Ledger",
    description:
      "The foot soldiers answer to something bigger than hunger -- a column of demons on the move " +
      "with real discipline, boots landing in step, led by something that gives orders instead of " +
      "just following its next meal.",
    reqLevel: 15,
    rewardGold: 2100,
    rewardItems: ['seized_glaive'],
    rewardRenown: 2,
    title: 'Tally-Breaker',
    epilogue: "The general kept records -- meticulous ones, names and dates and places, tallied like a merchant's ledger rather than a monster's trophies. One word appears in the margins more than any other, in handwriting that clearly isn't the general's own: the Harrower. Nobody at IronRest has heard the name before. People have started asking around anyway, quietly, the way you ask about something you're hoping turns out to be nothing.",
    stages: [
      { name: "The General's Column", flavour: "It marches in formation, ranks holding even across broken ground, and demons do not march. Something taught it to -- drilled it, the same way you'd drill a soldier -- and that should worry you more than teeth ever could.", difficulty: 'hard', duration: 9 * HOUR, goldMultiplier: 2.0 },
      { name: 'The Ledger', flavour: "Names, dates, places -- every village it emptied, tallied like inventory in a hand too neat for a demon to have written it. It was already counting the space where your name would go before you ever arrived.", difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'what_the_culled_become',
    requiresChainId: 'demon_generals_ledger',
    name: 'What the Culled Become',
    description:
      "The Harrower's name still means nothing to anyone at IronRest, but the ledger's tally means " +
      "everything -- every single village it culled has reported graves opening from the inside in " +
      "the weeks since. The people it took didn't stay taken. They came back. They came back different.",
    reqLevel: 19,
    rewardGold: 2800,
    rewardItems: ['gravewatchers_band'],
    rewardRenown: 2,
    title: 'Grave-Watcher',
    epilogue:
      "Whatever the Harrower takes, it doesn't keep -- it gives them back, changed, obedient, still " +
      "somehow counted in that ledger. Somewhere east of the culled villages, in that old " +
      "barrow-ground, something buried a very long time ago has started, very quietly, to stir. " +
      "Nobody has connected the two yet. Somebody should, and soon.",
    stages: [
      { name: 'The Empty Graves', flavour: "Every grave here has been dug from beneath, dirt scattered outward in a ring, no tool marks and no footprints leading away -- only footprints leading toward the old barrow-ground east of town, dozens of them, walking in step like they'd all been given the same destination.", difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 2.1 },
      { name: 'The Harvest', flavour: "They remember their own names. They answer to them, even, when you say them out loud -- which is somehow so much worse than if they'd forgotten everything, because it means whatever they are now, they know exactly what they used to be.", difficulty: 'epic', duration: 13 * HOUR, goldMultiplier: 2.5 },
      { name: 'Something Older Stirs', flavour: 'The old barrow-ground has sat quiet for three hundred years, moss grown thick over every stone marker. It is not quiet tonight -- something underneath is moving for the first time in three centuries, and it is not moving slowly.', difficulty: 'epic', duration: 15 * HOUR, goldMultiplier: 2.7 },
    ],
  },
  {
    id: 'proving_the_bastion',
    requiresChainId: 'demon_generals_ledger',
    name: 'Proving the Bastion',
    description:
      "The Thornhollow cure reached IronRest Bastion exactly on schedule, carried the last leg by " +
      "the very guild that ran those vials there in the first place. Captain Maeryn Thorne doesn't " +
      "forget a debt like that, and she has no shortage of work that needs hands she can actually " +
      "trust. Prove useful enough, and she has bigger plans in mind.",
    reqLevel: 16,
    rewardGold: 3800,
    rewardItems: ['wardens_signet'],
    rewardRenown: 3,
    title: 'Lord of the Keep',
    epilogue: "Captain Thorne kept her word, which surprised exactly no one who'd ever dealt with her directly. The Keep changed hands quietly, the way most important things do, and the guild has had a real home -- walls, a gate, and a garrison that answers to them -- ever since.",
    stages: [
      { name: 'Officers of IronRest', flavour: "Captain Thorne doesn't say please, doesn't soften an order, and doesn't repeat herself. She's run this Bastion through worse than one guild's growing pains, and she expects you to keep up without being told twice.", difficulty: 'normal', duration: 6 * HOUR, goldMultiplier: 1.6 },
      { name: 'Beasts on the Border', flavour: "Something is thinning the border patrols one soldier at a time, and it isn't raiders -- raiders don't drag their kills forty feet into the treeline and leave the boots behind, still laced.", difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 1.9 },
      { name: 'The Fort in the North-West', flavour: "Thorne's terms are simple: take the fort back from whatever's squatting in it, and the Keep is yours to call home -- so long as IronRest can always call on it when the debt comes due.", difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.4 },
      { name: "The Demon Lord's Throne", flavour: "Whatever ruled this fort didn't build a throne room to be comfortable. It built one to be seen from every angle at once, by anyone unlucky enough to be standing in it.", difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3.2 },
    ],
  },
  {
    id: 'granite_crossing',
    requiresChainId: 'proving_the_bastion',
    name: 'Granite Crossing',
    description:
      "The Keep is finally the guild's own, and the war table already has a name pinned to it in " +
      "Thorne's own hand: Granite Crossing, home of the west coast's Stone Masons Guild. IronRest " +
      "hasn't heard a word from it in weeks, and silence from a place that busy is never good news.",
    reqLevel: 20,
    rewardGold: 2400,
    rewardItems: ['bulwark_cuirass'],
    rewardRenown: 2,
    title: "Garrick's End",
    epilogue: "Garrick's raiders scattered the moment he stopped giving orders -- which told its own story about exactly what kind of leader he'd actually been. The Stone Masons Guild hasn't forgotten who reopened their gate, and they've made sure everyone downriver knows it too.",
    stages: [
      { name: 'The Silent Quarry', flavour: "Garrick and his raiders have taken the town gate and dug in like they mean to stay a season. The stonemasons hold everything behind it -- for now, and the longer this drags on, the less certain that for now sounds.", difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 2.0 },
      { name: "Garrick's Reckoning", flavour: "He pitched his camp inside the quarry itself, right in the working pit, like he wanted the masons to watch him do it. Stonemasons remember who does that to their livelihood, and they remember for a very long time.", difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'farm_at_the_edge',
    name: 'The Farm at the Edge',
    description:
      "No word from the border farm in ten days, and now IronRest's own riders haven't come back " +
      "either. Whatever's out there has stopped being a farmer's problem. The Keep is sending its " +
      "own this time.",
    reqLevel: 24,
    rewardGold: 3200,
    rewardItems: ['gravekeepers_gloves'],
    rewardRenown: 2,
    title: 'Farmwarden',
    epilogue: "Whatever Vayne was turning into, it never got to finish. The farmland recovered faster than the stories about what was actually found in that farmhouse basement, and most people who hear both versions decide they'd rather not ask which one is true.",
    stages: [
      { name: 'No Word From the Farm', flavour: "The fields stand untouched, crops still ripening in neat rows -- but the farmhouse is anything but untouched. Raiders have dug in around it like they intend to winter there, not pass through.", difficulty: 'hard', duration: 9 * HOUR, goldMultiplier: 2.1 },
      { name: 'What Vayne Was Becoming', flavour: "Captain Vayne is mid-ritual when you find her, something dark being poured into her a measure at a time, paid for with more of herself than she has left to spend. Whatever this was supposed to make her into, it isn't finished yet -- which might be the only reason there's still time to stop it.", difficulty: 'epic', duration: 13 * HOUR, goldMultiplier: 2.5 },
    ],
  },
  {
    id: 'the_pale_rider',
    name: 'The Pale Rider',
    description:
      "A squire is waiting at the Keep by the time you return -- sent ahead by the Paladins of " +
      "the Ashen Hand, who arrive not long after, asking for a kind of help they clearly hate " +
      "having to ask for. They call it the Pale Rider, and by their own account, they've been " +
      "losing to it.",
    reqLevel: 32,
    rewardGold: 12000,
    rewardItems: ['sword_of_the_ashen_hand', 'bulwark_of_the_war_saint'],
    rewardRenown: 5,
    title: 'Ashen-Sworn',
    epilogue: "He dismounted, in the end. The Paladins of the Ashen Hand won't talk about what that actually looked like, and nobody who was there has tried to make them.",
    stages: [
      { name: "The Ashen Hand's Plea", flavour: "These paladins don't ask for help easily -- years of training see to that. That they're asking at all, standing here in armor that's seen real use, should worry you more than it visibly worries them.", difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.6 },
      { name: 'The Road to Saint Aurlias Rest', flavour: "An old war-cleric built a church out here once, long before anyone needed protecting from whatever sleeps beneath it now. Hoofprints mark this road and only this road for eleven straight miles, evenly spaced, never breaking stride.", difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.9 },
      { name: 'The Dead of Saint Aurlias', flavour: "These graves emptied from the inside same as every other place the Harrower has passed through -- except here, the dead are walking toward the church, not away from it, drawn like something behind that door is calling them home by name.", difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 3.1 },
      { name: 'The Rider in the Nave', flavour: "He was waiting behind the doors the dead were so eager to reach, seated and unmoving, and he does not dismount. He hasn't needed to in longer than anyone currently breathing has been alive.", difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 4.0 },
    ],
  },
  {
    id: 'dragon_hunt',
    name: 'The Dragon Hunt',
    description: 'Something is burning Emberfell, northernmost of the holdfasts, one farmstead at a time. Four stages, several days on the road, and one very large problem waiting at the end of it.',
    reqLevel: 18,
    rewardGold: 4000,
    rewardItems: ['dragon_helm', 'dragon_blade'],
    rewardRenown: 2,
    title: 'Dragonbane',
    epilogue: "Emberfell doesn't burn anymore. The dragon's hoard more than covered the cost of rebuilding every farmstead it ever touched, which several holdfast elders have pointed out, only half-joking, is a strange kind of silver lining to a burned town.",
    stages: [
      { name: 'Follow the Ash Trail', flavour: 'The ash here is cold, but the scorched ground underneath is still warm to the touch. Whatever did this passed through recently -- recently enough that it might still be close.', difficulty: 'hard', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'Question the Survivors', flavour: 'Every survivor tells the same story with the same wide-eyed disbelief: wings spanning the whole width of the valley, blotting out the sky before the fire even started falling.', difficulty: 'normal', duration: 6 * HOUR, goldMultiplier: 1.5 },
      { name: 'Scale the Cinder Pass', flavour: 'The only way up this mountain is the same route the dragon uses to come down -- a narrow, ash-choked pass with no cover and no second path if something goes wrong halfway.', difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2 },
      { name: 'The Dragon of Emberfell', flavour: "There is no retreat from this ledge, no fallback position, nowhere left to regroup. Bring everything the guild has, because everything is exactly what this is going to take.", difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3 },
    ],
  },
  {
    id: 'lost_kingdom',
    name: 'Lost Kingdom Expedition',
    description: 'A kingdom that every map simply forgot to mention. Long roads, older ruins than anyone can date, and a patron paying well enough not to ask too many questions about why.',
    reqLevel: 14,
    rewardGold: 2600,
    rewardItems: ['crown_of_the_lost'],
    rewardRenown: 1,
    title: 'Kingdom-Finder',
    epilogue: "The vault finally gave up whatever it was built to protect, and the kingdom that built it stayed exactly as lost as it was before anyone found this. Some things, it turns out, were never meant to be found twice -- and this one's going straight back to being a rumor.",
    stages: [
      { name: 'Chart the Grey Marches', flavour: 'Six straight days of featureless grey nothing, and then, without warning, a stone road that has no business existing this far from anywhere charted.', difficulty: 'normal', duration: 10 * HOUR, goldMultiplier: 1.6 },
      { name: 'Cross the Silent Bridge', flavour: "It holds your weight without so much as a creak, which is somehow the most unsettling part of a bridge that shouldn't still be standing at all.", difficulty: 'hard', duration: 12 * HOUR, goldMultiplier: 1.8 },
      { name: 'Open the Sunken Vault', flavour: "Whatever this lost kingdom locked away down here, they locked it away thoroughly -- layers of stone, then steel, then something that isn't quite either, all sealed around whatever waits at the center.", difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.4 },
    ],
  },
  {
    id: 'demon_fortress',
    name: 'Demon Fortress Assault',
    description: "The guild is gathering every banner it can call on. Whoever gets sent has been asked, personally, to lead the breach -- and there won't be a second attempt if this one fails.",
    reqLevel: 22,
    rewardGold: 6500,
    rewardItems: ['dragon_armor', 'amulet_of_fortune'],
    rewardRenown: 3,
    title: 'Hellgate Breaker',
    epilogue: "The demon lord who held that throne won't be sitting on it again. The gate stands open, the wards lie broken, and whatever was singing behind them isn't where the guild left it -- it got out in the confusion. It won't get far. But it isn't here anymore, either, and that's its own kind of unfinished business.",
    stages: [
      { name: 'Break the Outer Siege', flavour: "Ladders against the wall, fire in the ditch, and a night that refuses to end fast enough. This is the easy part, and it still costs plenty.", difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 2 },
      { name: 'Break the Warding Choir', flavour: "Nine years unbroken and thick enough to hold a whole fortress shut from the inside -- you're not here to silence it for good, just to make it stop mattering long enough to get past the gate it's guarding.", difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.4 },
      { name: 'The Iron Gate', flavour: "Whatever holds this gate remembers the last siege in detail, and it's had years to plan for the next one.", difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
      { name: 'Descend to the Throne', flavour: "One door left between the guild and whatever's been ruling behind it. It's already standing open, which is somehow worse than finding it locked.", difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.5 },
    ],
  },
  {
    id: 'ancient_crown',
    name: 'Search for the Ancient Crown',
    description: 'Three fragments, three regions, and one rumour persistent enough that half the taverns on the coast have their own version of it by now.',
    reqLevel: 10,
    rewardGold: 1800,
    rewardItems: ['lucky_ring'],
    rewardRenown: 1,
    title: 'Crownbearer',
    epilogue: "Three fragments, three wildly different hiding places, and a crown that fits together exactly as well as it should. Nobody involved has ever explained why it was worth hiding in three separate corners of the world in the first place -- and at this point, nobody's still asking.",
    stages: [
      { name: 'The Fragment in the Fen', flavour: 'Cold water to the knees, colder mud underneath, and something patient enough to have been guarding this fragment since long before the fen had a name.', difficulty: 'normal', duration: 8 * HOUR, goldMultiplier: 1.5 },
      { name: 'The Fragment in the Vault', flavour: "The banker insists, with a completely straight face, that it's just a paperweight -- which is exactly the kind of thing someone says about an object they know is worth killing over.", difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Fragment in the Fire', flavour: 'Last reported seen inside an active forge, sitting in coals hot enough to melt steel. Of course it was.', difficulty: 'epic', duration: 12 * HOUR, goldMultiplier: 2.2 },
    ],
  },
  {
    id: 'goblin_warband',
    name: "The Goblin King's Warband",
    description: "Three goblin warbands used to raid alone, tripping over each other's territory as often as they hit anything useful. Not anymore. A chieftain with more ambition than sense has welded them into one horde under a single stolen crown, and now they move together, burn together, answer to one voice. Silence that voice, and the horde comes apart at the seams again.",
    reqLevel: 6,
    rewardGold: 550,
    rewardItems: ['warband_cleaver'],
    rewardRenown: 1,
    title: 'Warband-Breaker',
    epilogue: "Three warbands, no chieftain, and a very confused horde left leaderless in the hills. But pull that third crown out of the wreckage and look closer -- it never belonged to any warlord. Whoever it actually came from has a far older claim to settle, and hasn't started collecting yet.",
    stages: [
      { name: 'Scatter the Outriders', flavour: "The outriders always give themselves away -- mismatched armor clattering, torches lit hours before dark, laughing about a raid that hasn't happened yet. Cut them down before they reach camp, and the warband rides in blind.", difficulty: 'normal', duration: 3 * HOUR, goldMultiplier: 1.3 },
      { name: "The Chieftain's Camp", flavour: "The chieftain holds court under three crowns stacked crooked on a head too small for any of them -- trophies, not treasures, each one looted off someone who mattered more than he ever will. He's convinced the wearing makes him a king. He's about to learn exactly how wrong that is, right before the horde scatters without him.", difficulty: 'hard', duration: 5 * HOUR, goldMultiplier: 1.6 },
    ],
  },
  {
    id: 'third_crown',
    requiresChainId: 'goblin_warband',
    name: 'The Third Crown',
    description:
      "One of the goblin king's three crowns didn't come from a warband or a noble house at all -- " +
      "it came off a toll gate on the Blackford road, taken from a lord nobody remembers losing his " +
      "own crown in the first place. He was reported dead that same season. He wasn't. Whoever he " +
      "is now, he's had a very long time to plan what comes next.",
    reqLevel: 7,
    rewardGold: 600,
    rewardItems: ['tollkeepers_signet'],
    rewardRenown: 1,
    title: 'Ridge-Watcher',
    epilogue: "The crown's true owner isn't dead, isn't landless, and isn't finished -- not by a long stretch. Whatever he's quietly building at Blackford Ridge is bigger than one toll gate, and it isn't the guild's job to go scout it a second time. Not yet, anyway.",
    stages: [
      { name: 'The Toll That Should Not Exist', flavour: "A gate has gone up on the Blackford road again, manned by men who were farming their own fields a season ago and now answer to someone who very much wasn't a farmer.", difficulty: 'normal', duration: 3 * HOUR, goldMultiplier: 1.3 },
      { name: 'What the Crown Left Behind', flavour: "The old toll house still keeps records, and one name in them belongs to a lord who lost absolutely everything the same season the goblin king acquired his third crown. He was reported dead. He wasn't -- and whoever's keeping these records knows it too.", difficulty: 'normal', duration: 4 * HOUR, goldMultiplier: 1.5 },
      { name: 'The Company He Kept', flavour: "Eighty men standing in real ranks, a granary stocked with grain it never grew itself, and a chain of command running two officers deep. A dispossessed lord doesn't build an operation like this alone, and he clearly isn't planning on staying dispossessed much longer.", difficulty: 'hard', duration: 5 * HOUR, goldMultiplier: 1.8 },
    ],
  },
  {
    id: 'hollow_choir',
    requiresChainId: 'demon_fortress',
    name: 'The Hollow Choir',
    description:
      "The guild broke a choir just like this one once before, at the demon fortress -- cracked " +
      "its wards, cut down the demon lord keeping it caged, and left the voices behind because " +
      "voices were never the actual job. It didn't stay put for long. Something has settled into " +
      "the old cathedral now, singing like it fully intends to make a home of it. It never once " +
      "pauses to breathe.",
    reqLevel: 26,
    rewardGold: 5200,
    rewardItems: ['choir_mask', 'silenced_bell'],
    rewardRenown: 2,
    title: 'Choir-Silencer',
    epilogue: "The singing has actually stopped this time -- or at least, it's been quiet long enough that most people have stopped flinching every time a cathedral bell rings out unexpectedly. Most people.",
    stages: [
      { name: 'Follow the Hymn', flavour: "It carries for miles and never repeats a single verse, and you've heard the shape of this before -- not the melody, but the wards woven underneath it. Whatever escaped that fortress has found itself a new home in these cathedral walls. Not for much longer.", difficulty: 'hard', duration: 10 * HOUR, goldMultiplier: 1.8 },
      { name: 'The Choir Loft', flavour: "No singers up in the loft -- just one thing, fused into the rafters in wet coils of flesh, dozens of mouths opening and closing in careful sequence so the note never once has to stop. It sings beautifully. That's somehow the most disturbing part of all of it.", difficulty: 'epic', duration: 14 * HOUR, goldMultiplier: 2.2 },
      { name: 'Silence the Chord', flavour: "Whatever this thing has been building toward this whole time, it's nearly finished -- and finished is very much not what the guild came here to let it be.", difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.6 },
    ],
  },
  {
    id: 'world_ender',
    name: "The World-Ender's Vigil",
    description:
      "Every culture that has ever kept records tells some version of this story, though never " +
      "with the same name twice — an ending that waits somewhere past the edge of the maps, not " +
      "born but always waiting, patient in a way patience was never meant to be. Sailors used to " +
      "mark the same blank stretch of open water on a dozen unrelated charts, a century apart, " +
      "with the same warning scrawled beside it: past here, the world stops arguing. Scholars " +
      "called it superstition for three hundred years and stopped calling it that the first time " +
      "someone found the stretch on land instead — because it does not have one location. It has " +
      "never needed one. Wherever it is finally ready to be found, the road, the hills, even the " +
      "sky rearrange themselves around whoever gets close enough to matter, on foot, with nothing " +
      "so practical as a ship or a marching column to bring along the way. The guild's patron for " +
      "this expedition has personally funded five prior attempts. None of them came back, and he " +
      "will not say what he sent them to find — only that this time he isn't sending strangers. " +
      "Five stages. No easy ones. A capstone expedition, for guilds that have already retired a " +
      "hero or two and have nothing left to lose by looking.",
    reqLevel: 34,
    rewardGold: 22000,
    rewardItems: ['voidforged_blade', 'voidforged_crown', 'voidforged_plate', 'voidforged_signet'],
    rewardRenown: 6,
    title: "World's End",
    epilogue: 'It did not have a name when this started, and it does not have one now. What it had, it does not have anymore. That will have to be enough of an ending.',
    stages: [
      { name: 'The Road That Should Not Exist', flavour: "Three nights ago, a caravan guard on the old coast road swore the ground opened under a full moon and closed again by dawn, leaving a road where there hadn't been one — cutting dead straight into hill country no surveyor has ever mapped. By morning, three cartographers in three different towns had drawn the same route onto their charts without comparing notes, each one certain they'd surveyed it before, decades ago, under a different name, before a war that hasn't happened yet. The guild's advance rider stands at its mouth now, torch raised, looking down a road paved in stone too old and too smooth for anyone currently alive to have laid it. It has always been on the ground. It just hadn't been found yet. It did not need a harbor to arrive by, or a column to march down it. It only needed the guild close enough to bother appearing for.", difficulty: 'epic', duration: 16 * HOUR, goldMultiplier: 2.6 },
      { name: 'The Watchers in the Dark Between Stars', flavour: "The road climbs past the treeline and past the sky as anyone has ever charted it — stars in configurations that answer to no constellation, counted aloud in a language built for a mouth nobody here has. Six shapes stand at the road's end, tall as siege engines and thin as famine, unmoving, each one marking something on the empty air that leaves no mark anyone living can see. They do not turn to look as the guild approaches. They have been counting for longer than the road has existed, and whatever number they are working toward, it is close. It is very close. They are not the World-Ender's to command — if anything, the arrangement runs the other way — and this is not the only tally they keep. Whatever debt is being counted down here is one of several, on fronts this guild has never heard of, and, with luck, never will.", difficulty: 'legendary', duration: 20 * HOUR, goldMultiplier: 3.2 },
      { name: 'The Court of the Unmade King', flavour: "Past the Watchers the road stops being a road at all and becomes a hall that isn't holding a shape so much as remembering several — pillars flickering between marble and bone and nothing, a floor that is every battlefield it has ever hosted, layered on top of itself all at once. On a throne assembled from the wreckage of every crown it has ever replaced sits something that at least eight vanished empires once called the first mistake, and stopped teaching children about long before any of them fell. It watches the guild arrive with the patient boredom of a thing that has watched a very great many guilds arrive, and outlasted every one of them.", difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.6 },
      { name: 'The Breaking of the Vigil', flavour: 'Below the throne room, older than the throne room, a wall of pale and thinning light holds a line that has not moved since before "moving" had a word for it — tended by things too exhausted to have kept their faces. Whatever has stood this post does not so much ask for help as simply stop pretending it does not need it anymore. The guild braces the failing wall with whatever thirty-four hard-earned levels can buy, shoulder to shoulder with things that stopped being anything nameable a very long time ago. It is not enough on its own. It has to be enough anyway.', difficulty: 'legendary', duration: 28 * HOUR, goldMultiplier: 4.0 },
      { name: 'The World-Ender', flavour: "Past the breaking vigil there is no more architecture, no more road, no more sky — only a shape the size of a held breath, waiting exactly where it has always waited, patient in precisely the way the old sailors' charts warned about and the scholars refused for three centuries to believe. It does not introduce itself. It has never needed to. Whatever happens next will be the last thing every one of the five expeditions before this one ever saw — or it will be the first thing one of them survived, and there will finally be someone left to write down the difference.", difficulty: 'legendary', duration: 32 * HOUR, goldMultiplier: 5.0 },
    ],
  },
  {
    id: 'last_pilgrimage',
    name: 'The Last Pilgrimage',
    description:
      "Reports keep surfacing along an old road nobody official uses anymore -- travelers who " +
      "took a wrong turn near a waystone shrine, and didn't walk away from it unmarked. Not " +
      "robbed. Not killed, usually. Just claimed, somehow -- made to kneel through rites none of " +
      "them knew and none of them consented to, before whatever was doing it finally let them go. " +
      "The shrine has stood empty on every map anyone's checked for longer than anyone can say. " +
      "Whatever's using it isn't empty at all.",
    reqLevel: 44,
    rewardGold: 30000,
    rewardItems: [],
    rewardRenown: 8,
    title: "Pilgrim's Herald",
    epilogue:
      "There is a name for what the guild found underneath that archive, and it is not a " +
      "monster's name. It is the name of something that used to matter enormously, to people " +
      "who no longer exist to say so -- and it is still down there, waiting for a pilgrimage " +
      "that stopped coming centuries before anyone alive was born to feel guilty about it.",
    stages: [
      {
        name: 'The Waystone',
        flavour:
          "Whatever the survivors describe isn't a monster in the way anything else the guild " +
          "has fought is a monster -- no claws, no roar, nothing that wants to be fought at all. " +
          "Just something old and confused, pressing strangers through the motions of a rite it " +
          "clearly still believes someone is meant to receive. It doesn't attack so much as " +
          "insist. That is somehow worse.",
        difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.7,
      },
      {
        name: "The Scribes' Silence",
        flavour:
          "An order once kept the records here -- every pilgrim's name, every final rite " +
          "performed, generation after generation, until one day nobody wrote another entry and " +
          "nobody ever came back to ask why. The building has stood locked exactly the way its " +
          "last scribe left it. Whatever still moves inside isn't guarding treasure. It's " +
          "guarding an unfinished ledger, the same way the shrine outside is still trying to " +
          "finish a rite.",
        difficulty: 'epic', duration: 20 * HOUR, goldMultiplier: 2.9,
      },
      {
        name: 'What the Archive Remembers',
        flavour:
          "Half the pages have gone to dust, and the half that survived don't agree with each " +
          "other -- names spelled three different ways, dates that contradict, a century of " +
          "scribes each half-finishing what the last one started. Piece it together anyway, and " +
          "a shape finally emerges: not abandonment, not betrayal. Just a custom that quietly " +
          "stopped, the way customs do, one skipped generation at a time, until nobody left " +
          "alive remembered there had ever been a reason to make the walk at all.",
        difficulty: 'legendary', duration: 22 * HOUR, goldMultiplier: 3.4,
      },
      {
        name: 'The Road That Still Opens',
        flavour:
          "Beneath the archive's last sealed room, a second road begins -- the real one, the " +
          "one the shrine outside was only ever an echo of. It doesn't lead anywhere on any " +
          "chart, and it was never going to, not for the pilgrims who stopped coming and not " +
          "for anyone else either -- except it seems to remember exactly one condition for " +
          "opening: someone willing to walk it in their place. The guild didn't come looking to " +
          "volunteer for that. It appears none of that will matter to the road.",
        difficulty: 'legendary', duration: 24 * HOUR, goldMultiplier: 3.6,
      },
    ],
  },
  {
    id: 'hollow_king',
    name: "The Hollow King's Return",
    description:
      "For guilds a run or two into prestige. The barrow-ground that's been stirring quietly for " +
      "months has stopped being quiet at all. The king everyone assumed was safely buried isn't " +
      "staying that way, and whatever's escorting him back out is worse company than he ever was.",
    reqLevel: 45,
    rewardGold: 42000,
    rewardItems: ['empyrean_blade', 'empyrean_halo', 'empyrean_aegis'],
    rewardRenown: 10,
    title: 'Kingslayer Twice Over',
    epilogue: "He's buried again, properly this time, under considerably more stone than the last attempt managed. The court that followed him hasn't been seen since -- which is either genuinely good news, or exactly the kind of quiet that comes right before worse news arrives.",
    stages: [
      { name: 'The Grave Reopens', flavour: 'The seal held for three hundred years, stone unmoved, wards unbroken. It held for exactly one night less than it needed to.', difficulty: 'epic', duration: 18 * HOUR, goldMultiplier: 2.8 },
      { name: 'The Procession of the Dead Court', flavour: 'Every advisor he ever had executed is walking behind him now in perfect procession, and not one of them looks angry about it anymore. That is the part that should worry you.', difficulty: 'legendary', duration: 22 * HOUR, goldMultiplier: 3.4 },
      { name: 'The Bridge of Forgotten Oaths', flavour: 'This bridge only bears the weight of those who never once broke a promise in their lives. Cross very, very carefully.', difficulty: 'legendary', duration: 26 * HOUR, goldMultiplier: 3.8 },
      { name: 'The Second Coronation', flavour: "He's nearly home. The crown still remembers the shape of his head, even if the kingdom underneath it has long since forgotten his name.", difficulty: 'legendary', duration: 30 * HOUR, goldMultiplier: 4.4 },
    ],
  },
];
