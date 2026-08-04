# Guild Idler — Project Brief

Paste this into a Claude **Project's instructions**. It'll auto-load into every
new chat in that project, so you don't need to re-explain the game, re-paste
formulas, or re-upload files each time — just start a fresh chat per patch and
reference this brief plus the file links below.

\---

## What this game is

**Guild Idler** — a desktop-companion idle RPG (Electron/TypeScript). A pixel
hero sits in the corner of the screen, goes on quests/raids, gains gear across
rarities/sets, has multiple hero classes with licensed sprites, prestige
(retire/ascension), a guild-facility economy, quest chains with banner art,
and offline progression. Genre comps: Rusty's Retirement, Desktop Raid,
Cozy Grove, Melvor Idle.

**Content scope:** \~400 quests, quest chains + a LORE tab, raids across 3
difficulties, Steam achievements (leaderboards planned), shops, prestige/reset.
Roughly "half a year" of story content, with plans for post-launch story-chunk
DLC.

**Pricing decided on:** Base game **$6.99**, story-content DLC **$4.99** each
(bundle 2–3 quest chains per DLC drop rather than selling chains individually
— see rationale below).

\---

## Key formulas / constants (confirmed from source, as of this brief)

```
xpForLevel(level) = floor(15 \* level ^ 1.15)
Leveling: hero.xp += reward; while (xp >= xpForLevel(level)) { xp -= xpForLevel(level); level++ }

Starting state: 50 gold, 1 hero (Adventurer, level 1), 1 hero slot
Board refresh window: 30 minutes (seeded by window:topLevel:createdAt)
Tier eligibility on board: reqLevel <= topLevel + 2

Success roll clamp: MIN\_SUCCESS = 5, MAX\_SUCCESS = 95
Modifiers (additive, from sumMods): 
  success -> added directly to baseSuccess (percentage points)
  gold    -> goldMultiplier = 1 + mods.gold/100
  xp      -> xpMultiplier   = 1 + mods.xp/100
  loot    -> added to lootChance

Guild facility / upgrade cost formula:
  cost(level) = floor(baseCost \* costGrowth^level \* earlyTierDiscount(level))
  EARLY\_TIER\_DISCOUNT = \[0.15, 0.35, 0.6, 0.85]  (level 4+ = full price)
```

### Difficulty tiers (as of this brief — check quests.ts for current values)

|Tier|reqLevel|baseSuccess|Duration|Gold range|xpMultiplier|weight|
|-|-|-|-|-|-|-|
|Easy|1|90%|1–2h|8–25|1|30|
|Normal|3|75%|2–4h|25–60|2.4|28|
|Hard|8|60%|4–6h|60–150|5|22|
|Epic|15|40%|6–12h|150–400|11|14|
|Legendary|25|25%|12–24h|500–2000|26|6|

Burst quests (easy tier only currently): 45% chance, 90s–8min duration,
own reward range (6–12 gold, 8–14 xp), guaranteed-forced when heroes.length <= 1.
Base xp range for non-burst quests: 18–30, before tier's xpMultiplier.
Failure payout: 15% of rolled gold, 30% of rolled xp.

### Guild facilities

|Facility|baseCost|growth|maxLevel|Effect/level|
|-|-|-|-|-|
|Barracks|500|1.8|10|+3% success|
|Treasury|400|1.7|12|+4% gold, +5000 storage|
|Workshop|600|1.85|10|+8% durability (no reward effect)|
|Library|550|1.8|10|+12% xp|
|Tavern|750|2.4|5|+1 hero slot, +2% loot|

**Total gold to fully max all 5 facilities: 1,158,883 gold.**

\---

## Design decisions / findings from this conversation (don't re-derive these)

1. **Burst-quest exploit identified:** the shared taper (`BURST\_TAPER\_FLOOR=0.2`,
`BURST\_TAPER\_LEVELS=30`) let burst-spamming stay the mathematically dominant
gold/xp strategy from level 1 to \~level 25–30, for both currencies — i.e.
almost the whole game.
2. **Chosen fix (not yet implemented in source as of this brief):** replace
the flat taper with a **live, tier-relative cap** — burst's effective
gold/hr and xp/hr get clamped to \~80–85% of whatever the best
currently-unlocked difficulty tier pays, computed from `DIFFICULTIES`
live rather than a fixed decay curve. Separate caps for gold and XP
(they don't move together — legendary is gold-heavy/xp-light, so a
shared curve under-corrects one or the other). Levels 1–4 stay untouched
(onboarding hook, confirmed fine by sim).
Full spec: see the "burst-taper-fix-prompt.md" artifact from this
conversation if you still have it, or ask Claude to regenerate it from
this brief.
3. **XP curve also had its own bug, independent of burst:** Epic and
Legendary tiers pay *less* xp/hr than Hard does (17.0 and 16.5 vs
Hard's 17.3) — progression should never get worse per hour as it gets
harder. Fix: bump `epic.xpMultiplier` from 11 to \~12, and
`legendary.xpMultiplier` from 26 to \~30, so xp/hr keeps climbing
tier-over-tier. Gold already climbs fine tier-over-tier, no fix needed
there.
4. **First-five-minutes pacing (already being patched by you):** balance
sim shows an actively-engaged player reaches Tavern-affordable (\~38min),
Knight-recruit-affordable (\~1hr), and level 3–5 well within the first
session — the mechanical pacing is fine, it's a telegraphing/UX problem,
not a numbers problem.
5. **Guild-facility completion timeline (with facility bonuses compounding
back into quest rewards + modest gear estimate):** \~109 real days with a
full 6-hero roster, \~163–216 days with 4, well over a year solo. This is
*intentionally* a longer-tail completionist goal that can outlast the
\~6-month story — consistent with genre norms (Melvor's mastery grind is
the same shape). Prestige/retire does NOT reset guild facilities —
confirmed from `PrestigeManager.ts`: retiring wipes hero level/xp/gear
only; facilities, upgrades, discovered items, and renown perks are
permanent. The genuinely infinite loop in this game is renown/ascension,
not guild facilities — that distinction matters for future balance
questions.
6. **Comp pricing research used:** Melvor Idle ($9.99 base / $4.99 DLC),
Cozy Grove ($6.99 base / $6.99 "New Neighbears" story DLC), Rusty's
Retirement ($6.99 base / $3.99 cosmetic-only supporter pack), Desktop
Raid ($8.99, \~17.7K copies sold).

\---

## Perma-links for file recall

Fill this in with GitHub **blob** URLs (not `tree` URLs — Claude can fetch
individual file pages but not directory listings via search-restricted
fetch). Use the `main`-branch permalink format so it always resolves to
whatever is currently pushed:

```
https://github.com/Boinkem/Guild-Idler/blob/main/<path>
```

As long as you `git push` to `main` before asking, Claude will pull the live
version from these links each time (no upload needed).

|File|Link|
|-|-|
|Repo root|https://github.com/Boinkem/Guild-Idler|
|quests.ts (difficulty tiers, burst config)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/quests.ts|
|progression.ts (xp curve, facilities, upgrades, recruit costs)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/progression.ts|
|QuestManager.ts (offer generation, resolve, taper)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/QuestManager.ts|
|HeroManager.ts (leveling, xp application)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/HeroManager.ts|
|PrestigeManager.ts (retire/ascension logic)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/PrestigeManager.ts|
|GuildManager.ts (recruiting, facility purchase)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/GuildManager.ts|
|util.ts (modifier math, formatting)|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/util.ts|
|EquipmentJson|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/equipment.json*|
|EquipmentManager|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/EquipmentManager.ts*|
|RaidManager.ts|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/RaidManager.ts*|
|AchievementManager.ts|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/AchievementManager.ts*|
|Achievements.Json|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/achievements.json*|
|GuidanceManager.ts (onboarding prompts/guide)|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/GuidanceManager.ts*|
|ModifierManager.ts|*https://github.com/Boinkem/Guild-Idler/blob/main/src/game/managers/ModifierManager.ts*|
|App.tsx|https://github.com/Boinkem/Guild-Idler/blob/main/src/App.tsx|
|*Achievement.ts*|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/achievements.ts|
|*main.tsx*|https://github.com/Boinkem/Guild-Idler/blob/main/src/main.tsx|
|*Items.ts*|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/items.ts|
|*ChainConnections.ts*|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/chainConnections.ts|
|*Consumables.json*|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/consumables.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/events.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/injuries.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/quest-prefixes.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/quest-templates.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/raid-encounters.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/raids.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/json/tuning.json|
|GuildRank|https://github.com/Boinkem/Guild-Idler/blob/main/src/game/data/guildRank.ts|
||https://github.com/Boinkem/Guild-Idler/blob/main/index.html|
||https://github.com/Boinkem/Guild-Idler/blob/main/package.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/package-lock.json|
||https://github.com/Boinkem/Guild-Idler/blob/main/README.md|
|DevTool|https://github.com/Boinkem/Guild-Idler/blob/main/DEVTOOL.md|
|QuestChains|https://github.com/Boinkem/Guild-Idler/blob/main/QUEST-CHAINS.md|
|devtool servermjs|https://github.com/Boinkem/Guild-Idler/blob/main/tools/devtool/server.mjs|
||https://github.com/Boinkem/Guild-Idler/blob/main/tools/devtool/public/app.js|
||https://github.com/Boinkem/Guild-Idler/blob/main/tools/devtool/public/index.html|
||https://github.com/Boinkem/Guild-Idler/blob/main/tools/devtool/public/style.css|
|||





\---

## How to use this brief going forward

* New patch/question → new chat inside this project → paste/confirm the
relevant file links from the table above (or ask Claude to fetch them
directly, since it can pull public GitHub blob URLs on request).
* Update this brief's "Design decisions" section yourself whenever a fix
actually lands in the source, so future chats don't propose re-fixing
something already done, or re-simulate a taper that's already changed.
* If a formula in the tables above ever drifts from the live source (you
changed a number and forgot to update this doc), tell Claude to re-fetch
and correct it — the doc is a cache, the repo is the source of truth.

