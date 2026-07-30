/**
 * Static reference content for the Guide tab's "How To" section -- not
 * generated from events, unlike the notification log. Same "grows over
 * time, not complete on day one" expectation as GuidanceManager's topics.
 */
export interface GuideTopic {
  id: string;
  title: string;
  body: string;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'stats',
    title: 'Stat Points',
    body: 'Every level grants a stat point. Spend it in the Heroes tab -- Strength and Endurance push success chance, Luck pushes gold and loot, Wisdom pushes XP.',
  },
  {
    id: 'recruiting',
    title: 'Recruiting',
    body: 'New heroes cost gold and a free hero slot. Slots come from Tavern upgrades (Guild Hall) or the Extra Banner Renown perk.',
  },
  {
    id: 'equipment',
    title: 'Equipment',
    body: 'Gear drops from quests and sits in the stash until equipped. Durability wears down with use -- repair it from the Inventory tab before it breaks.',
  },
  {
    id: 'chains',
    title: 'Quest Chains',
    body: "Some contracts are the first stage of a longer story. They show up on the board like any other quest -- finishing one reveals the next stage next time it appears.",
  },
  {
    id: 'raids',
    title: 'Raids',
    body: 'Raids need a full, exact-size party -- Normal needs 3 heroes, Heroic 6, Mythic 9. They pay out per encounter cleared, so a partial run still earns something.',
  },
  {
    id: 'prestige',
    title: 'Prestige',
    body: "Retiring a high-level hero grants Renown -- permanent, account-wide bonuses that carry across every future hero. It's the long-term progression path once levelling alone starts to slow.",
  },
];
