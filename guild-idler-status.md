# Guild Idler — Status & Roadmap

Companion to `guild-idler-project-brief.md`, not a replacement. The brief holds
formulas, constants, and "don't re-derive this" findings. This file holds the
bigger picture: what's actually built, what's queued, and what's just an idea
so far. Update it whenever a patch lands or a new direction gets locked in —
stale sections here are worse than no section at all.

---

## Systems in place

**Core loop** — quest board (30-min refresh windows, tier eligibility by
level), offline catch-up, Auto-Chain streaks, burst quests (capped live
against the best-unlocked tier rather than a flat taper). Auto-Chain now
stops itself the moment any quest fails ("as far as you can go") instead
of grinding on toward its target count regardless of outcome, and story
chains have their own independent auto-continue -- see "Auto-queue / chain
stepping rework" below.

**Heroes** — recruiting, leveling, stat allocation, injuries, skins,
ascension/prestige, retirement with streak bonus.

**Equipment** — rarities, set bonuses, repair/refine, shop + black market
rotation, `raidExclusive` flag (Heroic/Mythic tiered variants can no
longer appear in either shop's stock).

**Guild facilities & Permanent Upgrades** — vendor-style upgrade trees,
guild-wide bonuses, gold storage.

**Quest chains** — 19 total. 17 rewritten in the current narrative style
(vivid/scene-painting); `world_ender` and the Last God successor content
match that style natively. Chain prerequisite gating exists
(`requiresChainId`) — 8 confirmed dependencies wired in. Chain info lives
only in the Quest tab (Discovered Quests, board-driven) and the Lore tab
(Story, full history/roadmap) -- `GuildPanel.tsx` had its own leftover
"Quest chains" list from before the Quest Tab rework, listing every chain
by name regardless of discovery state; removed (patch 0105) since it was
both a duplicate and a minor spoiler.

**Raids** — 5 total: Blackford Keep (8) -> The Frozen Wyrmkeep (18) ->
Bonewrought Vault (22) -> What Got Out (26, gated by completing the
`demon_fortress` chain) -> Requiem for the Last God (55, gated by the
`last_pilgrimage` investigation chain). Raid Guild Upgrades tree has three
upgrades (Raid Speed, Raid Loot, Raid Recovery), visualized as a
static-image progression in the Raid Quartermaster's Den (weapon rack /
skull / shelf, plus a torch reflecting the Raid Charter) -- now its own
sub-tab within Raids rather than sharing space with the raid list. Raid
cards are click-to-open-modal rather than inline-expand, with banner art
support (`public/lore/raids/<id>.jpg`). Raid Charter restructured: a cheap
(2500g) Normal-only unlock, with separate Heroic Clearance (20000g) and
Mythic Clearance (60000g) upgrades gating those tiers specifically --
difficulty circles in the raid modal reflect and enforce this directly.
Two raids (Frozen Wyrmkeep, What Got Out) currently ship without unique
loot on most of their encounters -- needs `equipment.json` to fill in
properly. (This used to say "same flagged gap as the Last God raid's
tiered loot" -- that one's done now, see the struck-through Cleanup item;
this note was stale.)

**Renown / Prestige** — retirement, renown perks (two-tier, gold-then-
renown cost curves), prestige streak bonus.

**Achievements** — Steam-stub integration, dedicated unlock popup
(non-blocking, separate from the toast queue), hidden achievements
supported.

**UI shell** — grouped navigation, Guide tab (notification log + How-To
reference), Settings (theme, density, motion, sound, confirmations),
consistent currency feedback across every gold/Renown-spending surface.
Consumables and Crafting Recipes now support an `icon` field (patch
0117), same convention and same DevTool picker equipment's icon already
uses -- falls back to the consumable's own glyph, or a per-category
emoji for a recipe, when unset. Shop's equipment/consumable/black-market
cards show that icon now too, and were converted from "everything visible
at once" to a compact summary that opens a detail modal on click, same
convention RaidCard/RaidDetailModal already established -- consistent
with the general direction of not extending cards inline for detail.
Hover feedback on cards was inconsistent -- quest/lore/hero cards only
tinted a nested name span, not the card itself; item-card (equipment
slots, consumables) had none at all. Both now highlight the whole card
via CSS alone (`:has()` for cards with a nested clickable header,
`[role="button"]:hover` for cards where the whole card is the click
target, like raid cards and the new Shop cards).

**Desktop companion window** — a long-standing, now-resolved bug: a
position saved under one display configuration (e.g. an ultrawide
monitor) could be restored unclamped on a later launch under a different
setup, landing the window fully off-screen with nothing visible or
clickable. Fixed by clamping the restored position to the current
display's work area on initial creation, matching a safety check that
already existed on the return-to-idle path. Also hardened window creation
generally: shows only once Chromium confirms a real first paint
(`ready-to-show`) rather than immediately on creation, and disabled
Chromium's background-throttling heuristic, which doesn't suit an
always-on-top companion window by design. The menu window (not the idle
companion, which stays fixed-size) is now user-resizable, with a 700x480
floor and a remembered size that persists across launches the same way
the companion's position already does.

**DevTools** — tuning registry now covers raid coefficients (raid_speed's
cost curve, heroic/mythic difficulty modifiers), all 5 guild facilities'
cost curves and per-level effect strength (patch 0107), and all of
Harvest/Gathering's own knobs (patch 0111) -- spawn/despawn/bonus rates,
all four tools' and the Warehouse's cost curves. `raid_loot`/
`raid_recovery` are still hardcoded in `raidUpgrades.ts` -- explicitly
deferred there as a small follow-up, not forgotten. Loot picker, icon
assignment tooling also live here. Crafting Recipes (gear/consumable/
enchant, patch 0115) is now its own DevTool tab -- editable the same way
equipment/consumables/raids already are, not code. Equipment's schema
was also missing `raidExclusive`/`craftable` as fields entirely (patch
0115) -- see Known bugs, this was a real, silent data-loss bug, not just
a missing nice-to-have. Patches tab's flow is now Check -> Apply ->
Commit -> **Push** (plain `git push`, relies on the branch's existing
upstream rather than taking a remote/branch as input); Build/Package/Tag
shifted from steps 5/6/7 to 6/7/8 to make room.

**Harvest/Gathering + Crafting** — new `harvest` tab: idle heroes feed 4
material nodes (Quarry/Woodyard/Herb Garden/Fish Weir) via a click-the-
falling-item mechanic, spent on a Warehouse-tab Crafting UI (gear with
player-chosen mods, or fixed consumables) plus a Trade Route for selling
surplus. See its own section below for the full built-status writeup.

**World lore** — `world-lore-pantheon.md` is the source of truth for
gods/pantheon rules. Starved gods can lash out from the starving itself
(confusion, not malice); Minor vs. Major domain framework in place (Major
still unwritten -- would need a different mechanical shape than a straight
raid fight).

---

## Known bugs (not yet fixed)

- ~~Persistent, undismissable guidance message~~ -- resolved. The "Go to"
  button pattern (0086) covers every existing GuidanceManager topic plus
  the vendor level-up message; confirmed the underlying persistence itself
  was working as designed (Notifications is a permanent log on purpose),
  not a bug needing a dismiss.
- ~~Broken rename modal after a hard reset~~ -- resolved.
  Not actually a loading bug: the art was rendering, but scrimmed to
  93-97% opacity as a full-card background (a deliberate earlier
  readability fix), which made it functionally invisible. Replaced with a
  dedicated banner strip above the text, matching the pattern built for
  raid cards -- separates art from text entirely, so it can be fully
  visible with no readability cost.
- ~~Onboarding tour overlaying the guild-naming modal on a fresh save~~ --
  resolved (patch 0104). `OnboardingTour` in `MenuWindow.tsx` was gated
  only on `!seenOnboarding`, with no check for whether the guild had a
  name yet -- so on a brand-new save (or a hard reset) it started the
  same moment `GuildNamingModal` needed to show, and the tour's
  deliberately-very-high z-index (300, meant to sit above any modal a
  panel might open mid-tour) won the visual fight it should never have
  been in. Correct order is Start new -> name guild -> prompts. Both
  `OnboardingTour` and `ChainDiscoveryModal` in `MenuWindow.tsx` now also
  require `guildName !== ''`, matching the guard App.tsx's own modals
  already had.
- ~~Guild-naming modal unresponsive to typing after a hard reset~~ --
  resolved (patch 0105). The modal itself was fine; its input's plain
  `autoFocus` prop was losing a focus race specifically on the reset path.
  "Start a new guild" (StatsPanel) calls `hardReset()` from inside a
  `window.confirm()` handler, and Chromium is still mid-way through
  returning window focus from that just-closed native dialog the instant
  the modal mounts -- a same-tick `.focus()` call (which is all `autoFocus`
  does) loses that race silently, so the input never actually receives
  keyboard focus even though it renders correctly. A genuinely fresh save
  has no preceding `confirm()` call, which is why this only ever showed up
  after a reset. Fixed by focusing explicitly via a ref, one
  `requestAnimationFrame` after mount, landing after the dialog's own
  focus restoration settles.
- ~~Inconsistent card backgrounds -- some fully see-through, some fully
  opaque~~ -- resolved (patch 0106). Not a per-panel styling drift: `.card`
  and `.item-card` used a flat 100%-opaque fill ("hard black" against any
  backdrop), while four specific cards (`.vendor-card`, `.power-card`,
  `.black-market-item`, `.renown-tier2`) had their own accent-gradient
  `background` *replacing* `.card`'s fill outright rather than combining
  with it (equal CSS specificity, later rule in the file wins) -- those
  four had no dark backing at all, just the accent tint, reading as fully
  transparent next to every other card's solid fill. Fixed on both ends:
  `.card`/`.item-card` now use a theme-aware `color-mix(..., 88%,
  transparent)` fill (12% see-through, matching the existing
  `.idle-plate`/`.idle-away-banner` idiom) instead of a flat opaque color,
  and the four gradient-accent cards now layer their tint over that same
  base instead of replacing it -- every card reads consistently now, with
  its own accent on top where one exists.
- ~~Chain/raid banner art stretching unrecognizably on a widened window~~
  -- resolved (patch 0106). `QuestPanel`/`LorePanel`/`RaidsPanel` stack
  cards at full panel width with no grid, and each banner strip is a
  fixed-height box using `backgroundSize: cover` -- past a certain
  width:height ratio, `cover` zooms in far enough to lose the image
  entirely. Added `max-width: 720px` to `.card` (picked to be
  effectively invisible at the default 900px menu window, only engaging
  once resized notably wider) so a wider window adds margin instead of
  stretching the card. Checked `.raid-detail-modal`'s own `RaidBanner`
  too -- already safe, since it inherits the base `.modal`'s
  `max-width: 460px` and renders inside `.overlay`'s flex-centered
  layout, never stretching with window width regardless of this fix.
- ~~DevTool: any save fails once the shield slot exists~~ -- resolved
  (patch 0110). `EquipSlot` has always had 8 real slots, but the
  DevTool's own `SCHEMAS.equipment.slot` enum only listed 7 -- missing
  `shield` entirely. Since a save re-validates the *whole*
  `equipment.json` array, not just the entry being edited, this broke
  every save the instant it reached one of the 5 existing shield items,
  regardless of what was actually being changed (the report that caught
  this was an unrelated icon edit). Added `shield` to the enum; the
  frontend dropdown renders straight from this same schema, so one fix
  covered the missing option and the validation failure together.
- ~~DevTool: editing a raidExclusive/craftable item silently drops that
  flag on save~~ -- resolved (patch 0115). Found while checking whether
  the DevTool supported the new Harvest/Crafting content, not reported
  first -- a real, silent data-loss bug rather than just a missing
  editing convenience. `raidExclusive` and `craftable` both existed on
  disk (5 shield items aside, dozens of raid-tier loot variants use
  `raidExclusive`; the two craftable gear bases use `craftable`) but
  weren't in `SCHEMAS.equipment.fields` at all. The editor's save handler
  rebuilds each edited entry from scratch out of exactly the fields the
  schema lists (see `openEditor` in app.js) -- so opening *that specific
  item's* editor for any reason at all, even an unrelated icon tweak, and
  saving, would drop the flag it didn't know about. Confirmed precisely
  with a script simulating the exact old field list against a real item
  (`gravewatchers_band_heroic`): flag present before, gone after, under
  the old schema. Added both fields as `boolean` type (already fully
  supported end to end, just never wired to this schema) -- fixed and
  now editable via a checkbox, not just fixed silently.
- ~~Every CSS animation in the game plays instantly, no visible motion at
  all -- root cause still unknown.~~ -- resolved, see "Harvest fall
  animation, background dimming, spawn/yield retune" below for the full
  writeup. Root cause: an unconditional `@media
  (prefers-reduced-motion: reduce)` rule in `app.css` forced
  `animation-duration: 0.001ms !important` on every element whenever the
  *OS* reported that preference, regardless of what the in-game Settings
  > Animation Speed / Reduce Motion controls showed -- exactly matching
  "checked, it's off" while still silently winning. Confirmed as the
  same root cause behind this report and the newer Harvest-specific one.
- ~~A toast notification sometimes never goes away~~ -- resolved (patch
  0116). Real React bug, not a UI/CSS issue: `Toast.tsx`'s auto-dismiss
  effect was keyed on `[message, engine]` -- message text. Two toasts in
  a row with *identical* text (e.g. levelling the same vendor twice
  inside the 3.2s display window -- "The Blacksmith has more to offer
  now." both times) meant the dependency never changed value between
  them, so React never re-ran the effect for the second one, and no timer
  ever got scheduled for it. It wasn't stuck; it just never had a
  dismiss timer running in the first place. `engine.toast` now carries a
  `seq` alongside the message, incremented on every `say()` call, and
  both the effect and the remount key use that instead of the text.
  Verified by simulating the exact duplicate-toast sequence directly
  against the engine (not just reasoned through): confirmed the two
  entries now carry distinct seq numbers, which is what actually
  restores the effect re-firing.

---

## Backlog

### Raids batch -- complete
All five items done: Raid Quartermaster + its own sub-tab, raid card ->
modal conversion (with banner art support, also applied to quest chains'
Lore cards for consistency -- see Known bugs), the Raid Charter
restructure, and two new raids (The Frozen Wyrmkeep, What Got Out).

### Quest Tab rework -- complete
Split into "Available Contracts" (board contracts, sorted by difficulty
tier ascending, with a Quick-assign button gated on owning Auto-Chain) and
"Discovered Quests" (chain-stage offers, with banner art support) --
contracts intentionally shown first. Consumables removed from this tab
entirely, folded into the rework below instead.

### Consumables & equip-slot rework -- complete
Inventory's consumables are now clickable, same detail-expand treatment
the stash already has. New per-hero consumable-equip slots live in the
Equipment tab directly under the gear grid (`Hero.equippedConsumables`,
1 base slot, up to 3 via the new **Potion Belt** upgrade). Quests now
automatically use whatever's equipped on the sent hero rather than a
loadout picked at send time. One follow-up worth a look next time
`HeroManager.ts` is in hand: `create()` should explicitly initialize
`equippedConsumables: []` on new heroes for cleanliness -- not required
(the field is optional and read defensively everywhere), just tidier.

### Auto-queue / chain-stepping rework -- complete
Started from a real complaint: sending a hero on a story chain's first
stage with Auto-Chain active only ever ran that one stage, then fell back
to ordinary board contracts -- because `pickBestQuest` (Auto-Chain's own
quest picker) has always deliberately excluded chain offers, on purpose,
so idle heroes don't independently pile into the same chain. That
exclusion stays -- "auto-queue bounties never includes quest chains" is
still correct -- but chain progression itself needed its own, separate
auto-continue rather than accidentally inheriting the bounty picker's
exclusion.

- **`Hero.autoAdvanceChainId`** (new, optional field, same
  defensive-optional convention as `equippedConsumables` -- no save
  migration needed). Set by `startQuest`'s new `chainSteps` param when a
  chain offer is sent via the quest board's new **Chain Quest Steps**
  button (as opposed to **Send on Quest**, which now only shows as a
  distinct choice when the chain has stages left to run after this one).
  `tryContinueAutoChain` checks this first, independent of whether the
  Auto-Chain upgrade is even owned: on a successful stage it starts the
  next one directly; once the chain's last stage completes, it clears the
  flag and falls through to the ordinary Auto-Chain bounty streak (if the
  hero has one active) to spend whatever budget is left -- "run the whole
  chain, then keep going on contracts," matching the fix as scoped.
- **Stop-on-failure ("as far as you can go")**, applied to *both*
  mechanisms, not just chain-stepping. Previously Auto-Chain kept sending
  a hero at its rolled target count regardless of whether each quest
  succeeded or failed -- a failed stage or contract no longer continues
  either kind of run; it clears the streak/chain state and returns the
  hero to idle for a new manual order instead of grinding on.
- **Recall** -- `GameEngine.recallHero`, a new button on each "On the
  road" card in the Quest tab. Cancels the active quest outright (no
  reward, no failure penalty) and also clears any queued Auto-Chain
  streak or chain-stepping the hero had going, since pulling a hero back
  mid-run is a deliberate "stop everything" action. Confirmed first --
  `confirm('Cancel the current quest and bring the hero home?')`, same
  inline-`confirm()` convention `StatsPanel`'s hard-reset button already
  uses.
- Verified at runtime (not just typechecked): a script drove a real
  `GameEngine` through a full chain via chainSteps end to end (confirms
  it lands in `completedChains` and correctly falls back to an ordinary
  contract afterward), a failed chain stage (confirms both the chain flag
  and the bounty streak clear with no fallback quest started), a failed
  ordinary streak (confirms it also stops rather than continuing to
  target), and a Recall (confirms the quest is cancelled and all
  streak/chain state clears). `npx tsc --noEmit` and `vite build` both
  pass clean.

**Open discussion, not yet acted on this patch:** the report that started
this conversation also flagged a related pacing problem worth its own
pass before changing the underlying logic further -- a brand-new recruit
can inherit a quest board that's scaled to the guild's *best* hero
(`reqLevel <= topLevel + 2`), so a fresh level-1 hire can be the only idle
hero standing next to a board with nothing but Hard/Epic offers on it,
especially a few in-game days into a save. The stop-on-failure fix above
should blunt the worst symptom described (a new hire grinding failure
after failure unattended), but it doesn't address the root cause: nothing
currently stops a *manual* send, Quick-assign, or a fresh Auto-Chain
streak from putting a low-level recruit on a quest they're heavily
favoured to fail in the first place, just because it's the only offer
left once better-equipped heroes have claimed the easier ones. Needs its
own scoping pass -- options range from a per-hero suitability filter on
Quick-assign/Auto-Chain's own picker, to a low-level-hero-specific slice
of the board (mirroring the existing solo-player guaranteed-Easy-offer
rule in `generateBoard`), to just surfacing the risk more clearly in the
UI and leaving the choice to the player. Deliberately not folded into
this patch since it changes board/assignment logic rather than the
auto-continue logic this one was scoped around.

### Quest success anchored to reqLevel, not raw hero level -- complete
Started from a real report: a fresh level 6 hero, zero gear/consumables/
spent stat points, had a ~91-93% success chance on `goblin_warband`'s
first (Normal, baseSuccess 75%) stage -- reqLevel was barely functioning
as a real gate. Root cause was two things stacking, both in
`QuestManager.previewSuccess`:

- The flat `hero.level * 0.4` term and the str/end stat curve inside
  `statMods` both scale off the hero's *raw* level, which keeps growing
  automatically via `HeroManager.grantXp`'s per-level class growth --
  independent of any actually-spent stat point. A hero standing exactly
  at a quest's reqLevel had therefore already banked the full "free"
  value of every level it took to get there, and the tier's own
  baseSuccess never accounted for that.
- Every chain stage is hardcoded to `tag: 'explore'`
  (`QuestManager.chainOffer`), regardless of what the chain is actually
  about -- so Gladiator/Lizardman/Wizard (all `preferred: [...,
  'explore']`) got their full preferred-quest bonus on literally every
  story chain in the game, unconditionally. Confirmed as part of the
  original 93% figure.

**Fix:** `previewSuccess` now subtracts a `baselineOffset` -- exactly what
a bare, zero-investment hero of the same class would carry in those two
level-derived terms if it stood right at `offer.reqLevel` (new
`HeroManager.baselineStats(heroClass, level)`, same automatic-growth math
`create()`/`grantXp` already apply, evaluated directly for an arbitrary
level). `HeroManager.heroMods`/`statMods` themselves are untouched --
they're also read by the Heroes panel's raw stat display and by
`RaidManager`, neither of which has this same "gated by reqLevel" framing
-- so gold/xp/speed/injuryResist and raid math are unaffected; only this
one preview (and `QuestManager.start`, which calls it to lock in
`finalSuccess`) changed. Chain offers also no longer get a preferred-tag
bonus at all, since their tag isn't a real reflection of the story --
ordinary board contracts, whose tags come from their actual template,
are unaffected.

Verified at runtime across every recruitable class: a hero standing
exactly at a quest's reqLevel with nothing invested now lands close to
that stage's own baseSuccess (Normal ~73%, Hard ~56% -- the few-point gap
below the raw number is the existing, unchanged difficulty-tier penalty,
plus any class-identity success mod like Samurai's or Lizardman's, both
intentional and left alone). Out-leveling the requirement still
meaningfully raises success (73% -> 76% -> 80% -> 86% at level 6/10/16/25
on the same stage) -- the fix re-anchors the floor, it doesn't flatten
the curve. Applies to ordinary board contracts too, not just chains,
since both read from the same `offer.reqLevel`. `npx tsc --noEmit` and
`vite build` both pass clean.

**Not touched, flagged for later:** the same "mods scale off raw level,
not the challenge's own level" architecture likely applies to
`RaidManager`'s success math too (`heroMods` feeds it directly, same as
before) -- raids weren't part of this report and have their own
level/difficulty gating shape, so left alone rather than assumed fixed
by the same change. Confirmed and written up below rather than left as
a guess.

### Chain stages now carry their own real tag -- complete
Follow-up to the reqLevel fix above -- while checking why a Gladiator's
`goblin_warband` number was specifically ~91%+ rather than the ~83%
every other class was landing on, found that `QuestManager.chainOffer`
hardcoded every chain stage in the game to `tag: 'explore'`, regardless
of what the stage was actually about. `ChainStageDef` never had a `tag`
field at all -- `chainOffer` just picked one value and used it
everywhere. Net effect: Gladiator/Lizardman/Wizard (the three classes
with `explore` in their `preferred` list) got their full preferred-quest
success bonus on literally every story chain in the game,
unconditionally, while every other class got none, ever, on any chain,
regardless of what the chain was about.

**Fix:** `ChainStageDef` gained a real `tag: QuestTag` field, and all 61
stages across all 19 chains were individually tagged against their own
flavour text (combat/explore/arcane/defense/stealth -- final
distribution: 26 combat, 19 explore, 10 arcane, 4 defense, 2 stealth;
`escort` wasn't used for any stage since, separately noted below, no
hero class currently prefers it anyway, so tagging a stage `escort`
would never actually grant anyone a bonus). `chainOffer` now reads
`stageDef.tag` instead of the hardcoded literal, and
`QuestManager.previewSuccess` no longer special-cases chain offers out
of the preferred-bonus calculation (that carve-out was only ever a
stopgap for the hardcoded-tag problem, made in the previous patch before
this one existed) -- the same `classDef.preferred.includes(offer.tag)`
check now works correctly for chains and board contracts alike, since
both carry a tag that actually reflects the content.

Verified at runtime: `goblin_warband` stage 1 is now tagged `combat` (it's
an ambush on outriders) -- Adventurer/Knight/Gladiator (all
`combat`-preferring) each get an appropriately-sized bonus off the
reqLevel-anchored baseline (79-81%, varying by class's own
`preferredBonus`), rather than only Gladiator getting a bonus and
everyone else getting none. All 61 stages confirmed to have a valid tag
(no `undefined`s slipping through). `npx tsc --noEmit` and `vite build`
both pass clean.

**Noted, not acted on:** no hero class currently lists `escort` in its
`preferred` tags (`combat`: Adventurer/Knight/Gladiator/Samurai/
Lizardman, `defense`: Adventurer/Knight/Dwarf, `explore`: Gladiator/
Lizardman/Wizard, `arcane`: Witch/Pyromancer/Wizard, `stealth`: Witch --
`escort` has zero). Not a bug exactly (board contracts using that tag
still work, they just never trigger anyone's preferred bonus), but worth
a look eventually -- either give a class an escort affinity or fold the
tag into another one.

### Quest & raid difficulty retune -- complete
Follow-up to the reqLevel-anchoring fix -- that patch made reqLevel a
real gate again, but left the actual target numbers wherever the old
formula happened to net out (~73%/56% for Normal/Hard quests, and raids
still using their pre-existing per-encounter baseSuccess values, which
were never authored with an anchored baseline in mind). This pass sets
explicit targets and tunes both systems to hit them.

**Quests -- `DIFFICULTIES[tier].baseSuccess` retuned directly:**

| Tier | Old | New (= target, at reqLevel, no gear) |
|---|---|---|
| Easy | 90 | 70 |
| Normal | 75 | 60 |
| Hard | 60 | 50 |
| Epic | 40 | 40 (unchanged) |
| Legendary | 25 | 30 |

The flat `-(tierIndex * 2)` difficulty penalty in `previewSuccess` is
gone too -- once `baselineOffset` (from the reqLevel-anchoring patch)
already zeroes the level/stat-derived terms at reqLevel, that penalty
was only ever subtracting an extra, unexplained amount on top of a
baseSuccess that already fully encodes the tier. Removing it means
`baseSuccess` above **is** the actual number a bare hero gets at
reqLevel, not baseSuccess-minus-something -- one less thing to hold in
your head when re-tuning later. Verified at runtime: a fresh Adventurer
exactly at each tier's own reqLevel, zero gear, lands within a couple
points of 70/60/50/40/30 (the only variance is the same pre-existing
preferred-tag template bonus ordinary board contracts have always had --
not new, not a bug). A deliberately large stat investment (+60 effective
Strength, simulating spent points and gear together) raised a Normal-tier
hero from 60% to 68.6%, confirming investment still moves the needle from
the new floor rather than being swamped by it.

**Raids -- two changes together, since neither alone would hit the ask:**

1. `RaidManager.partySuccessBonus` now takes the raid's own `reqLevel`
   and, per hero, subtracts that hero's own class-appropriate
   `baselineOffset` (same mechanism `QuestManager.previewSuccess`
   introduced) before applying the existing weakest-link-plus-20%-of-rest
   formula. `previewEncounterSuccess` gained a `raidId` param to find
   this reqLevel (its one caller, `RaidsPanel.tsx`, already had `raid.id`
   in scope); `start()` reads it from `RAID_BY_ID` directly. This is the
   same fix quests got -- without it, retuning baseSuccess values alone
   would have just shifted the target without fixing why a fresh
   at-reqLevel party wasn't landing near it in the first place.
2. Every raid's three encounter `baseSuccess` values retuned to a
   uniform **70 / 60 / 50** spread (opening encounter easiest, final
   boss hardest -- same shape every raid already had, just recentered).
   All five raids' encounters happened to already be spaced by exactly
   10 points internally, so recentering their own middle encounter to 60
   landed every raid on the identical 70/60/50 pattern -- not a
   coincidence forced into place, just how the existing spread lined up
   once shifted.

Verified at runtime: a fresh, zero-gear party standing exactly at
reqLevel now lands on *exactly* 70% / 60% / 50% for all three encounters,
on Normal, for all five raids without exception (`bonus` computes to
0.0 in every case) -- averaging the requested ~60%, with the escalating
in-raid structure intact. A stat-invested party (+20 effective
Strength/Endurance per hero) raised the bonus from 0 to +6, confirming
gear/investment still moves a raid party's odds the same way it does for
quests.

**Heroic/Mythic `successPenalty` left exactly as specified (-20/-50,
unchanged)** -- per instruction. Combined with the newly-anchored bonus,
this now produces a clean, *consistent* curve across every raid rather
than the old "gets relatively easier at higher reqLevel" drift: Heroic
lands 50/40/30% and Mythic lands 20/10/5% for a fresh at-reqLevel party,
identically, on all five raids checked (Blackford Keep through Requiem
for the Last God). Mythic hitting the 5% floor on a raid's final boss
for a zero-investment party is a real, intended consequence of keeping
those penalties as-is on top of a now-lower baseline -- Mythic still
reads as "bring a genuinely built party," which matches the existing
design comments calling that difficulty deliberately brutal. Flagging
plainly in case that reads as too harsh once played rather than
simulated -- an easy follow-up (soften Mythic's penalty, or leave Heroic
alone and only touch Mythic) if so, but not changed here since it wasn't
part of what was asked.

`npx tsc --noEmit` and `vite build` both pass clean.

### Crafting/Supplies/Enchanting overlay rework -- complete
Replaced the plain "list of recipe cards" modal (`RecipeCard` in
`HarvestPanel.tsx`, opened from each vendor's Crafting button) with a new
`CraftingStation` component (`src/ui/CraftingStation.tsx`) built around
three commissioned background scenes -- one per vendor/category, each
painted with its own three slot frames baked directly into the art.
Clicking Crafting now opens that vendor's own scene instead of a generic
modal, and each painted frame is a real click target:

- **Crafting (gear, Blacksmith)** -- top slot picks which recipe
  (Guildmade Blade or Band); the two bottom slots each pick one bonus,
  independently, and can't both land on the same bonus (picking the same
  one in the second slot simply isn't offered).
- **Supplies (consumable, Alchemist)** -- top slot picks the recipe
  (Trail Rations or Herbal Tonic); one bottom slot per *distinct*
  material that recipe actually needs -- Herbal Tonic (herbs only) shows
  one active slot, Trail Rations (herbs + fish) shows both. Clicking a
  material slot opens a small picker naming the required material and
  whether the guild has enough, and confirming it fills that slot --
  built as a real picker (not an auto-fill) so a future recipe with
  genuine material alternatives drops in without another UI pass, even
  though every recipe today only ever offers the one required material.
- **Enchanting (Enchanter)** -- top slot picks the item to enchant
  (stash or equipped, same scope as repair already uses); bottom-left
  picks the sigil (currently just Minor Sigil); bottom-right picks a
  stat, populated from whichever sigil is selected and disabled until
  one is.

Every slot shows a plain "+" until filled, and Craft/Enchant only enables
once everything that recipe actually needs is chosen and affordable --
same underlying `CraftingManager`/`CraftingRecipeDef` data model as
before, this only replaces how the choices are made, not what gets sent
to the engine.

**Art & positioning:** the three scenes live at
`public/lore/crafting/{gear,consumable,enchant}.jpg` (converted from the
supplied PNGs to match every other background's jpg convention --
~880KB total instead of ~6MB losslessly). Unlike the gitignored-licensed
`public/vendors/` art, these are committed real assets, so there's no
"missing file" fallback needed the way `VendorSprite` has one. Each
scene's three slot positions are hand-measured percentages
(`SLOT_RECTS` in `CraftingStation.tsx`) against the source images' exact
1402x1122 canvas; the `.craft-scene` container is locked to that same
aspect ratio via CSS so the percentages stay aligned with the painted
frames at any window width, rather than drifting the way `cover`-sized
art would. Verified by rendering each rect back onto its own source
image and inspecting the result directly, not just computed and trusted
-- caught and corrected the Enchanting scene's rects on the first pass
(the other two were on-target immediately).

`RecipeCard` (and its now-orphaned imports in `HarvestPanel.tsx`) removed
entirely rather than left as dead code, since `VendorsPanel.tsx` was its
only caller. `npx tsc --noEmit` and `vite build` both pass clean.

### Crafting station polish + Harvest scene sizing -- complete
Follow-up pass, two unrelated fixes landed together since both touched
adjacent code:

- **Slot/picker icons doubled.** Every `ItemIcon`/`RecipeIcon` size in
  `CraftingStation.tsx` doubled (top-slot filled icon 44->88, picker-row
  icons 32->64, the enchant sigil slot 40->80). `.craft-slot`'s own
  padding trimmed 4%->2% to give the bigger icons room inside the same
  painted frames rather than crowding them -- `.item-icon img`'s existing
  `width/height: 70%` scales off its container automatically, so this
  was a sizing-only change, no new icon-rendering path needed.
- **Enchant's stat picker now supports real multi-select.** Previously
  every picker (including this one) closed itself immediately after any
  pick -- fine for a single choice, but a sigil with `statsToPick > 1`
  meant picking the first stat closed the popup, forcing a full reopen
  to pick the second. `PickerModal` gained `closeOnPick` (default true,
  unchanged behavior everywhere else) and `selectedKeys` (drives a
  checkmark + highlighted row). The stat picker is the one caller that
  passes `closeOnPick={statsToPick <= 1}` -- stays open across multiple
  picks exactly when a sigil actually offers more than one, closes
  immediately (old behavior, untouched) for today's single-stat Minor
  Sigil. Already-picked rows stay clickable to toggle back off, same
  logic `toggleStat` always had, just now visible while the popup is
  still open instead of only inferable from the slot afterward.

**Harvest's Fields scene was cropping hard on anything wider than a
fairly narrow window** -- `.harvest-scene` was a fixed 280px height with
`background-size: cover` against `public/lore/harvest/fields.jpg`'s own
1672x941 (i.e. much wider-than-280px-tall) canvas. `cover` has to scale
the image up to fill the panel's full width, and past roughly 500px wide
that scaled height exceeds 280px, so cover silently crops the excess off
the top and bottom -- and the wider the panel gets, the worse the crop,
which is exactly the "too wide and thin" complaint (confirmed against
the actual currently-used background art, not a guess -- the player
supplied it directly and it matched the repo's own file byte-for-byte).
Same fix already used for `CraftingStation`'s scenes: `aspect-ratio: 1672
/ 941` on the container plus `background-size: 100% 100%` instead of
`cover`, so the full image always shows, fully proportioned, at any
panel width -- no crop, ever, and it gets taller (not just wider) as the
window does, which is the "more vertical space" the report asked for.
The per-node falling-item positioning (`top: 62%` etc.) is already
percentage-based, so it needed no changes to keep lining up.

The material stock line (`Ore: X/Y`, etc.) moved from below the scene to
above it, per direct request -- purely a JSX reorder in `FieldsTab`, no
logic change.

`npx tsc --noEmit` and `vite build` both pass clean.

### Harvest fall animation: two real bugs, plus a persistent glow -- complete
Report: falling items "barely floated down at all... moved a few pixels
and stopped." Traced to `NodeLane` in `HarvestPanel.tsx`, not the CSS
sizing work above -- two genuine, independent bugs in how the `fresh`
(falling) vs `settled` (landed, idle-pulsing) class got decided:

1. **The JS-side "still falling" window was a hardcoded 1200ms, out of
   sync with the CSS animation's real, `--anim-speed`-scaled duration**
   (`.harvest-item.fresh`'s `harvest-fall`:
   `calc(900ms / max(var(--anim-speed, 1), 0.001))`). At the default 1x
   speed that's 900ms -- comfortably inside the 1200ms window, so this
   never showed up in normal play. At Settings > Appearance > Animation
   speed "Slow" (0.5x, a real labeled option), the CSS duration
   stretches to 1800ms -- 600ms *longer* than the JS window -- so the
   class flipped from `fresh` to `settled` while the fall was still
   mid-flight, yanking the animation off and snapping the item to its
   settled resting spot early. Confirmed directly from the two formulas
   side by side, not a guess.
2. **A one-frame render race on every spawn.** `isFresh` lived in its
   own `useState`, set by a `useEffect` keyed on `pending.spawnedAt` --
   so on the very first render where a new `pending` appeared, the
   effect hadn't run yet and `isFresh` was still `false`, meaning the
   item's *first paint* used the `settled` class (already at rest,
   mid-pulse) before flipping to `fresh` (and restarting at the top) a
   moment later. Combined with bug 1, this made the fall read as barely
   happening at all in the reported case.

**Fix:** replaced the separate effect+`setTimeout` state with a direct
computation off the `now` clock `NodeLane` already ticks every 400ms --
`isFresh = (now - pending.spawnedAt) < fallDurationMs + 300`, where
`fallDurationMs` mirrors the CSS's own formula exactly (reading
`settings.animationSpeed`/`reduceMotion` via `useSettings`, the same
source `SettingsStore.apply` writes `--anim-speed` from). This can't
fall out of sync with the CSS ever again since it's the same formula,
and it's correct on the very first render since there's no longer a
separate piece of state that needs a follow-up render to catch up.

**Also added: a persistent golden glow**, per direct request -- previously
the only visual cue that a spawn was clickable was the generic
`button:hover` rule (a plain panel-colored square, invisible until the
cursor was already on top of it). `.harvest-item` now carries an
always-on golden `box-shadow` circle (`border-radius: 50%` so the shadow
reads as a ring rather than hugging the glyph's own rough bounding box),
brightening further on hover; the rare bonus glint's existing stronger
glow is unchanged and still reads as the bigger deal. The generic
`button:hover` background needed an explicit `button.harvest-item:hover`
override to actually win (same specificity as the generic rule once the
element type is included, and later in the stylesheet) rather than
fighting the new glow.

`npx tsc --noEmit` and `vite build` both pass clean. Not verified
against a real Chromium render in this environment (no browser available
to drive here) -- the box-shadow mechanic itself was confirmed visually
via a minimal standalone render, and the timing fix was verified by
direct comparison of the two duration formulas rather than by eye;
worth a real in-app look to confirm both land the way they're intended
to before calling this fully closed.

### Harvest: real root cause found, background dimmed, spawn/yield retuned -- complete
Follow-up report: falling items still weren't visibly falling even with
the previous patch's timing fix in place, and "settings are all default,
animations turned on" -- ruling out both bugs fixed in that patch (which
only mattered at a non-default Animation Speed). That detail was the
actual clue: something was overriding the animation *independent of*
what Settings showed.

**Found it.** `app.css` had an unconditional
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after {
animation-duration: 0.001ms !important; ... } }` rule -- reacting to the
*operating system's* accessibility preference, completely separate from
the in-game Settings > Animation Speed / Reduce Motion controls. On any
system where the OS reports that preference (a genuinely common default
on some platforms, not always chosen with this specific game's cosmetic
animations in mind), every animation in the app -- Harvest's fall,
the quest-completion particle burst, all of it -- collapsed to
0.001ms regardless of what the in-game toggle showed, with no way to
turn it back on from inside the game. This lines up exactly with the
long-standing "animations play instantly, root cause unknown" entry in
Known Bugs above (now resolved, cross-referencing here) -- "checked, the
in-game toggle is off" was true and irrelevant, since the OS-level media
query was winning regardless.

**Fix:** removed the blanket media query. `:root[data-motion='off']`
(driven entirely by the in-game setting via `SettingsStore.apply`) is
now the only place motion gets suppressed. The OS preference isn't
ignored, though -- a new `prefersReducedMotionByDefault()` in
`settings.ts` seeds `reduceMotion` from `window.matchMedia` *once*, only
for a brand-new save with no stored settings yet, so a new player on a
reduced-motion system still gets sensible accessibility defaults; from
that point on the in-game control is the single source of truth and can
actually be changed. Verified the settings-load logic directly (fresh
load with OS preference true -> `reduceMotion: true`; fresh load with it
false -> `reduceMotion: false`), since there's no browser here to check
the media query itself against.

**Background dimmed**, per direct request -- the Fields scene's
background art now renders on its own `.harvest-scene-bg` layer at
`opacity: 0.7` instead of directly on the same element the interactive
items are drawn on, so dimming the art doesn't dim the falling items or
their glow along with it (same "fade via a separate layer" approach
`MenuWindow.tsx`'s guild-hall background already uses, just a lighter
touch -- 0.7 rather than 0.35 -- since this art is the actual content
being interacted with, not a decorative backdrop sitting behind opaque
cards). Player's mentioned they'll likely swap this background for
something simpler later; the dimming layer works with whatever image
ends up there.

**Spawn rate doubled, yield per catch halved**, per direct request:
`harvest.baseSpawnIntervalMs` 90s->45s, `harvest.minSpawnIntervalMs`
20s->10s, `harvest.baseYieldPerCatch` 1->0.5 (`default`/`min` updated to
match in `tuning.json`, so a DevTool "reset to default" lands on the new
baseline, not the old one). Twice the clicks, half the yield each --
per-hour totals land close to where they were, the loop just asks for
more engagement rather than being a straight buff or nerf. Tool
upgrades' own `yieldBonusPerLevel` deliberately left untouched, so
invested tool levels now matter *more* relative to the smaller base than
they used to.

Yield can now be genuinely fractional (0.5 per catch at the base tier).
Verified this accumulates exactly rather than losing anything to
rounding -- two 0.5 catches sum to precisely 1 in `state.materials`, not
0 or 1 from a naive floor. Only the *display* rounds, via a new
`formatMaterial()` in `util.ts` (whole numbers show as-is, anything
fractional shows one decimal), used everywhere a material count renders
-- the Fields stock line, the Warehouse stock rows, and the
collect-burst "+0.5 Ore" particle text.

`npx tsc --noEmit` and `vite build` both pass clean.

### UX/economy batch -- complete
A round of smaller, independent fixes and additions, grouped into one
patch since none needed its own dedicated pass. Three larger asks from
the same conversation -- consumable stats/mods, a full equipment-set
expansion (leather/steel/thief + a new cloak slot + per-raid sets), and
generalizing Harvest's fish node into a broader food category -- were
deliberately **not** attempted here and are queued as their own
follow-ups instead; each is real content/schema design work in its own
right; rushing them into the same patch as everything below risked
either quality or actually finishing what's here.

- **High Contrast is now the default theme** for any brand-new install
  (`DEFAULT_SETTINGS.theme`, plus the corrupt-settings fallback in
  `SettingsStore.apply`). Existing players' own saved theme choice is
  untouched either way -- this only affects what a save with no settings
  yet resolves to.
- **Quest/lore/hero card hover fixed.** The existing `.card:has
  (.hero-card-summary:hover)` rule only matched while the cursor was
  inside that exact nested title row -- `:has()`'s argument doesn't
  benefit from the normal ancestor-hover bubbling the way a plain
  `.card:hover` would, so hovering anywhere else on the same visual card
  (stats, description, buttons) did nothing. Fixed by moving `:hover`
  onto the card itself and using `:has()` only to scope *which* cards
  get the treatment (`.card:has(.hero-card-summary):hover`) -- same
  intent, now hovering anywhere on the card highlights it.
- **Empty consumable slot no longer looks inert.** It was using the exact
  same `.item-card.empty` styling as a genuinely non-clickable empty gear
  slot (`cursor: default`, no hover feedback at all), despite actually
  being a real click target (opens the equip picker). Added a
  `clickable` modifier class, used only by the consumable slot, that
  layers real hover/cursor affordance back on top of the shared "empty"
  visual treatment.
- **Idle-hero-count ring added to the Warehouse tab** -- reused
  `DashboardPanel`'s existing `Ring` component (now exported) rather than
  building a second circular-progress implementation. Fill fraction is
  idle heroes / total roster size, with the raw count shown inside and
  as the hover title; existing "N idle heroes feeding every node" text
  elsewhere in Harvest is unchanged, this is a second, glanceable
  presentation of the same number, not a replacement.
- **Onboarding tour's step descriptions were stale.** `harvest` had *no*
  entry at all -- the tour would spotlight that tab with a blank
  description, since Harvest didn't exist yet when this map was last
  written. `shop` was a leftover from before the Vendors restructure (the
  real tab id has been `vendors` since patch 0118) and `upgrades` no
  longer matches any tab at all (fully absorbed into Guild Hall / each
  vendor's own page, same restructure). Added the missing `harvest`
  entry, renamed `shop`->`vendors` with an updated description, dropped
  the dead `upgrades` entry, and refreshed `guild`'s description to
  mention it now also covers the general upgrades that used to live on
  their own tab. The tour's *step list itself* (`ALL_TABS` in
  `MenuWindow.tsx`) was already generated dynamically from the live tab
  set, so it was never actually out of sync on steps/order -- only the
  hardcoded description lookup table had drifted.
- **Adventurer recruit cost 0g -> 150g, plus a new Early Retirement
  option.** A free recruit sounds generous but was a real trap: normal
  Retire requires level 30, so filling a slot with a free Adventurer left
  no way to ever get that slot back except levelling that specific hero
  all the way up, even on immediate regret. `PrestigeManager.earlyRetire`
  (new) removes a hero from the roster outright at *any* level, for *no*
  reward at all -- no renown, no ascension, no streak credit, deliberately
  worse than a real Retire, existing purely to un-stick the trap. Unlike
  Retire (which resets the hero in place, same slot/id), this actually
  shrinks `state.heroes`, freeing the slot for a different recruit.
  `PrestigePanel` shows an "Early Retire" button next to the normal one,
  but only while a hero hasn't yet qualified for the real thing (once
  eligible, early retirement is strictly worse, so there's nothing left
  for it to usefully offer). Verified at runtime: a level-5 hero can
  early-retire and is removed from the roster with renown unchanged, a
  questing hero is refused, and equipped gear still returns to the
  stash either way.
- **`stat-conversion-table.md`** (new, repo root, alongside the other
  project docs) -- answers "how much does +1 Strength actually turn
  into?" directly from the live formulas in `HeroManager.statMods`/
  `personalLootBonus`, not estimated. Every stat curve in this game is
  sqrt- or power-based (diminishing returns), so there's no single fixed
  ratio -- the table gives the real marginal value of the *next* point at
  a spread of benchmark levels (5 through 200) instead. Also documents
  which modifiers are additive percentage-points (Success/Gold%/XP%/
  Speed%/InjuryResist) versus Luck's Loot% specifically, which is a
  separate *multiplicative* stage and isn't directly comparable to the
  others at face value -- worth a careful read before using the raw
  numbers for balance decisions.

`npx tsc --noEmit` and `vite build` both pass clean across the whole
batch.

### "Enhance" station moved to the Blacksmith -- complete (corrected)
Per direct request: a per-item button used to live buried in each
equipped item's expanded card on the Inventory tab. Removed from there
and rebuilt as a dedicated station on the Blacksmith's own Vendors page,
next to Crafting -- same single-click-select-confirm shape as
Crafting/Enchanting, with commissioned art (`public/lore/crafting/
enhance.jpg`, converted from the supplied JPG). New `src/ui/
EnhanceStation.tsx`: one slot (this scene only has one painted frame,
unlike Crafting/Enchanting's three) -- click it, pick any item (stash or
equipped, across every hero, same `EquipmentManager.allItems` lookup
Enchant's own item picker already uses), confirm. `PickerModal`/
`SlotBox`/`Rect` exported from `CraftingStation.tsx` so this didn't need
to duplicate that popup code.

**Correction, same conversation:** the first pass wired this to plain
durability *repair* (`engine.repair` -- restores current durability back
up to whatever the cap already was, no cap change), based on a literal
reading of "enhance its durability." What was actually meant was the
existing **"Refine" (+N)** mechanic (`EquipmentManager.upgrade`/
`engine.upgradeItem`), which *raises the durability cap itself*
(`maxDurability` scales with `item.plus`) and tops the item off to that
new, higher cap as part of the same action -- matching "enhance
[increases] durability limits" exactly once it was spelled out. Swapped
the station over to call `upgradeItem` instead, gated on `item.plus <
MAX_PLUS` rather than repair cost, with a preview line showing the
plus level and durability-cap change (e.g. "+0 -> +1 (durability cap 40
-> 44)"). Plain repair moved *back* to the Inventory tab's per-item card
-- it was never the button being asked to move, and un-removing it was
the other half of this correction.

**Craft/Enchant/Enhance buttons are still purple**, per direct request --
`.btn-purple` class built on `--violet` (the game's one existing purple
accent, already defined per-theme including High Contrast, rather than
introducing a new one-off color). Applied to both the vendor-page
trigger buttons (Crafting, Enhance) and the submit buttons inside each
overlay, unaffected by the repair/refine correction above.

Verified at runtime, both before and after the correction: a damaged
test item is found via the same lookup the UI relies on; after the
correction, calling the station's action on a fresh item confirmed
`plus` increases by exactly 1, the durability *cap* itself genuinely
increases (not just current durability), and the item tops off to that
new, higher cap. The single slot's position was hand-measured against
the actual supplied image and confirmed by drawing the rect back onto
the source art, same process used for the other three crafting scenes.
`npx tsc --noEmit` and `vite build` both pass clean throughout.

### Harvest icon randomization -- logic prepped, waiting on real art
The player described a specific icon-pool naming convention (Ore1-3,
Wood1-3, herb1-2, Food1-4 -- Food rather than Fish, prepped ahead of the
planned fish -> broader food-node generalization so it won't need
renaming again once that lands) for replacing the current text-glyph
placeholders. Wired the selection logic now rather than waiting for the
files themselves:

- `MaterialDef` gained an optional `icons?: string[]` pool, populated
  with exactly the filenames specified (matching their exact casing --
  `herb1.png`/`herb2.png` lowercase, the rest capitalized, since
  filesystems can be case-sensitive and it's easier to rename two files
  than debug a silent case mismatch later).
- New `harvestIconFor(materialId, spawnedAt)` in `materials.ts` --
  deterministic pick from the pool, seeded on the spawn's own timestamp
  (same seeding approach `spawnPositionPercent` already uses), so a given
  spawn shows the same icon across every re-render rather than flickering
  between pool entries on each 400ms tick, while still varying spawn to
  spawn. Returns `null` (glyph fallback) for an empty pool -- always safe
  to call, no special-casing needed before real files exist.
- New `HarvestGlyph` component in `HarvestPanel.tsx` renders the picked
  icon from `public/harvest-icons/<filename>` with an `onError` handler
  falling back to the plain glyph -- covers both "no pool configured"
  and "pool configured but that specific file hasn't actually been
  dropped in yet" (a real 404) with the same graceful fallback, so
  nothing breaks or shows a broken-image icon in the meantime. Wired into
  both the falling item itself and its catch-burst particles, sharing
  the same resolved icon (captured once at catch time) so the icon that
  fell is the same one that bursts away, not a second independent roll.

Verified directly: every pool matches the specified filenames exactly;
the picker is stable for a repeated `(materialId, spawnedAt)` pair
(doesn't re-roll on re-render) but varies across different spawns (500
draws each sampled well more than one distinct file per pool); every
picked filename is confirmed to actually belong to that material's own
pool; and an explicit empty-pool case returns `null` without throwing.

**Not done yet, intentionally:** `public/harvest-icons/` doesn't contain
any real files -- this patch is the selection logic only, so the folder
is empty (git doesn't track empty directories; it'll appear once real
files land there). Drop the actual art in at that path, matching the
filenames listed above, and it'll pick up automatically with no further
code changes.

### Consumables can now carry crafted stat/mod bonuses -- complete
Per direct request: extend consumable crafting to support the same
"pick a bonus" flow gear crafting already has. This was flagged as a
genuine architecture decision in an earlier pass rather than a quick UI
add-on, and it was -- consumables were tracked as flat counts against a
*static* registry (`CONSUMABLE_BY_ID`, built once from consumables.json),
unlike equipment, which has individual instanced items that can each
carry their own `customMods`. A crafted consumable with a chosen bonus
needed to behave like a genuinely different item from the plain version
-- stacking separately, carrying its own name and effect -- without
becoming a whole new per-unit-instance system the way equipment is.

**The approach:** a *runtime-registered variant*, not a per-unit
instance. `GameState.customConsumables: Record<string, ConsumableDef>`
(new, `SAVE_VERSION` 21->22 with a migration) holds crafted variants,
keyed by a stable id derived from the base consumable + the exact mod
combo chosen (`baseId::sortedMods`) -- so re-crafting the same combo
stacks onto the same registered entry instead of spawning a duplicate
every time, and `state.inventory` keeps working exactly as before (a
flat count keyed by id, the variant's id is just a longer string than
usual). `InventoryManager.resolveDef(state, id)` is the one place a
consumable id actually gets resolved -- checks `customConsumables`
before falling back to the static table -- and every function that used
to read `CONSUMABLE_BY_ID` directly now goes through it instead:
`owned()` (so a crafted variant actually shows up in the equip picker,
not just accumulates silently in `state.inventory`), `useOnHero()`,
`loadoutEffects()` (now aggregates the *full* modifier set --
xp/loot/injuryResist/speed, not just success/gold like before -- since
`ConsumableDef.effect` gained those fields too, matching `Modifiers`
completely except deliberately excluding `speed` as a valid recipe
option: `QuestManager.previewDuration` doesn't consult the consumable
loadout at all, a pre-existing gap this patch didn't introduce, so a
"speed" bonus would silently do nothing until that's separately wired
up), plus the two UI spots that display a consumable by id
(`EquipmentPanel`'s equipped-slot card, `QuestPanel`'s "Used X" line on
a quest's log entry).

**`CraftingStation.tsx`'s consumable flow redesigned** to fit an extra
choice into the same three-slot scene: the old two-boxes-one-per-
material layout became a single combined "confirm all materials" slot
(materials picked up priority in the two boxes before; this scales to
any number of materials instead of being hardcoded to at most two), and
the second box now shows a "bonus" picker -- but only when the selected
recipe actually has `modsToPick > 0`, staying hidden entirely for a
recipe with none (Trail Rations, Herbal Tonic are completely unaffected,
still exactly as simple as before). The bonus picker reuses the same
multi-select popup pattern the Enchant stat picker already established
(stays open across multiple picks when more than one is allowed, closes
immediately for the common single-pick case).

**Found and fixed real dormant scaffolding while implementing this:**
`craft_trail_meal` ("Meal On The Go") already had `modOptions:
["injuryResist"]` and a `modValue` sitting in crafting-recipes.json, but
`modsToPick` was `0` -- meaning the mod choice was defined but could
never actually be picked, silently inert. Set to `1`; this is now the
first real, working example of a mod-bearing consumable recipe.

Verified with two separate runtime scripts, not just typechecked: (1) a
plain craft with no mods behaves identically to before (adds straight to
the base stack, registers nothing); (2) crafting with a chosen mod
registers a distinct variant with the correct name and effect value,
crafting the *same* combo again stacks onto that same entry rather than
duplicating, `owned()` surfaces it with the right count, and
`loadoutEffects()` resolves its bonus correctly; (3) a full craft ->
equip -> send-on-quest -> resolve cycle confirms the crafted bonus
actually lands on the quest's own locked-in `injuryResist` value, not
just in isolated unit checks. `npx tsc --noEmit` and `vite build` both
pass clean.

### Quests above a hero's own level are now attemptable, at a cost -- complete
Player-reported: running out of same-level quests between board refreshes
(especially likely right after a couple of short burst quests clear)
left a hero simply idle with nothing to send. Rather than only re-tuning
board supply/refresh timing, the fix landed on was to let a hero attempt
a quest *above* their own level instead of being hard-blocked from it --
"you get an offer, it might be a bad idea, but it's your call."

`QuestManager.start` no longer returns an error for
`hero.level < offer.reqLevel` -- that hard gate is gone. Instead,
`previewSuccess` now applies a per-level penalty when a hero is under a
quest's reqLevel: `quest.overLevelPenaltyPercent` (new tuning entry,
default 10) success points per level of gap, stacked on top of
everything else, still passing through the existing MIN_SUCCESS/
MAX_SUCCESS (5-95) clamp -- so reaching three levels above your station
costs roughly 30 points, but it's never literally 0% or refused outright.
`QuestPanel`'s hero picker reflects this directly: an under-level hero's
chip is no longer disabled, just flagged (a red "risky" chip style, plus
a tooltip stating the exact level gap and that success will be reduced)
-- previously-blocking "Requires level X" copy replaced with an accurate
"reduced success" framing throughout.

**Deliberately not touched:** both `pickBestQuest` (the Auto-Chain bounty
streak's own picker) and `QuestPanel`'s Quick-assign button still only
ever pick a quest a hero already qualifies for outright. Reaching above
your level is meant to be an explicit, opt-in trade a player makes on
purpose -- automation gambling with a hero's odds without being asked
would be a real regression, not a feature, so neither of those picks up
over-level offers on its own.

Verified at runtime: a hero well under a Hard-tier quest's reqLevel can
now actually be sent (previously a hard error); `previewSuccess`'s drop
between an at-level and a 3-levels-under attempt on the same offer lines
up with the tuned penalty; the result still respects the 5% floor rather
than going negative or unsendable; and `pickBestQuest` continues to
ignore over-level offers entirely even when they're the only thing on
the board. `npx tsc --noEmit` and `vite build` both pass clean.

### Equipment pool expansion: new cloak slot, 3 material-tier sets, 4 raid sets -- complete
The equipment pool below rare tier was confirmed genuinely thin (one
leather_cap, no set, nothing else) and none of the four earlier raids
(Requiem for the Last God was the one exception) had any set bonus
attached to their own themed loot despite dropping real, distinctive
items for years of play. Two separate pieces of work landed together
since the second built directly on the first:

**New `cloak` equipment slot.** Added to `EquipSlot` in types.ts, which
is what actually caught every place it needed to be added -- TypeScript
won't compile `icons.tsx`'s `SLOT_FALLBACK` (a `Record<EquipSlot,
string>`) without every slot having a fallback glyph, so that one's
compiler-enforced, not just remembered. `EquipmentPanel.tsx`'s rendered
`SLOTS` array needed a manual add (not type-checked, since it's just an
array literal). The DevTool's own slot enum in `server.mjs` was the
other must-fix -- this is the *exact* spot that caused the earlier
"any save fails once the shield slot exists" bug (see Known Bugs
history), so it was updated proactively this time rather than found the
hard way again.

**Three full 9-piece material-tier sets** -- Leather (common,
reqLevel 1), Steel (uncommon, reqLevel 5), Cutpurse's "Thief" (rare,
reqLevel 10) -- each covering every slot including the new cloak, 24
new items total. Three pre-existing orphaned items that already fit a
set perfectly (`leather_cap`, `gauntlets` "Steel Gauntlets",
`thief_wraps` "Cutpurse's Wraps") were folded in via `setId` rather than
duplicated. Stat/mod magnitudes calibrated directly against existing
items at each rarity tier, not invented from scratch. Icons picked from
confirmed-unused files in the existing `item-icons/` pool.

**Four new raid sets**, assembled entirely from each raid's own already-
existing drop table -- no new items needed here, just grouping loot that
was always distinctive but never had a `setId` or bonus attached:
Blackford Garrison (Blackford Keep, 6pc), Bonewrought Vault (3pc),
Frozen Wyrmkeep (4pc), What Got Out (4pc). `setId` was applied to a
piece's Normal *and* Heroic *and* Mythic id alike, not just the base --
confirmed the set-bonus counting logic in `HeroManager.equipmentMods`
only cares which slot is filled and what `setId` that specific item
carries, never which exact difficulty-tier id, so a Heroic ring paired
with a Normal-tier helmet correctly still counts as 2 pieces toward the
same set (verified directly, not assumed). `dragon_helm` drops in both
Bonewrought Vault and Frozen Wyrmkeep but was deliberately left alone --
it already belongs to the `dragon_slayer` chain-reward set, and pulling
it into either raid set would have quietly stolen a piece from that one.

**A real bug during this patch, caught before it shipped:** the first
attempt at adding `setId` to existing items anchored the text insertion
on "the next `icon:` field after this item's id" -- which silently
inserted into the *wrong* item whenever the target item had no `icon`
field of its own (58 items in the pool don't, mostly Heroic/Mythic raid
variants that inherit their base item's icon). Caught by re-parsing the
file and checking the actual resulting `setId` on the specific items
touched, rather than trusting "the script ran without error." Rewrote
the insertion as a proper bracket-matching function (finds each item's
exact object span by counting `{`/`}` depth, inserts before that
object's own closing brace, independent of which fields happen to be
present) and redid the edit from a clean revert.

Verified thoroughly at runtime, not just typechecked: every set has the
right piece count covering the right slots exactly once; every piece
(and its Heroic/Mythic siblings, for the raid sets) resolves to a real
item whose `setId` round-trips correctly after a fresh JSON re-parse;
the cloak slot actually equips on a hero end-to-end; a fully-equipped
set's top bonus tier genuinely shows up in aggregated mods; the
mixed-Normal/Heroic/Mythic set-counting claim for raid sets specifically
verified with a live example (Bonewrought's 2pc bonus firing off a
Heroic ring + Normal helmet); `dragon_helm` confirmed untouched; no id
collisions anywhere in the pool; none of the new items are accidentally
`raidExclusive`/`craftable`-flagged. `npx tsc --noEmit` and `vite build`
both pass clean.

**Noted, not fixed (pre-existing, unrelated to this patch):** the same
verification pass turned up 13 icon-file collisions already in the
equipment pool before any of this started (e.g. `voidforged_crown` and
`requiem_crown` sharing the same icon file) -- confirmed none involve
anything touched here, flagged as a real but separate cleanup item.

### Fish Weir generalized to a broader Food/Provisions theme -- complete
Per direct request: "fish" as the harvest node's identity was too narrow
to build recipe variety around -- a berry-foraging or red-meat-themed
recipe shouldn't have to pretend it's made of fish just because that's
the only food-type material in the game.

**The underlying `MaterialId` value stays `'fish'`, deliberately.**
Renaming it would mean migrating every existing save's `materials.fish`,
`harvestNodes.fish`, and `harvestTools.fish` keys for a change that's
purely cosmetic -- not worth the risk for something the display layer
can handle on its own. Everything that actually changed lives in the
*display* fields: `name` "Fish" -> "Food", `nodeName` "Fish Weir" ->
"Provisions Dock", `description` broadened from "the day's catch...
salted for the road" to cover the catch, salted meat, and foraged
berries alike, and the glyph fallback changed from a fishing pole to a
basket. The harvest tool's own name stays "Net" on purpose -- the dock
scene in the shared `fields.jpg` background still visually shows fishing
nets specifically (redrawing that art wasn't in scope here), so the tool
name still matches what's actually on screen even though the material
it produces is framed more broadly now. DevTool-facing tuning labels
("Net (Fish Weir): ...") updated to match the new node name for
consistency in that UI.

**New recipe, `craft_foragers_bundle`** ("Forager's Bundle") -- a
genuinely non-fish demonstration that the generalization is real and
usable, not just a documentation change: berries-themed flavor text,
crafts into Minor Lucky Potion with a chosen gold bonus (reusing the
consumable custom-mod system from the previous patch), while still
drawing from the same underlying `fish` material key under the hood.
`craft_trail_meal` ("Meal On The Go") already had non-fish flavor text
("Hearty, Meat n Veg stew") despite consuming the same material -- that
was a good sign this generalization was overdue, not a loose end to
clean up.

Verified at runtime: the material id is confirmed unchanged (so an
existing save's `materials.fish` value keeps working exactly as
before); the new recipe's flavor text contains no mention of fish at
all while still correctly consuming and deducting from the same
underlying material pool; crafting it with a chosen mod produces a
correctly-named, correctly-stacked variant via the existing custom-mod
crafting pipeline. `npx tsc --noEmit` and `vite build` both pass clean.

### Cleanup items
- ~~Heroic/Mythic tiered loot for the Last God raid~~ -- done. Every raid
  encounter with loot now has all three difficulty tiers.
- ~~A hidden achievement for clearing the Last God raid~~ -- done
  (`LAST_GOD_DEFEATED`, "The Last Mile"). Mirrors `WORLDS_END`'s exact
  treatment, checking `completedRaids` instead of `completedChains` since
  the Last God moved from a chain to a raid in its own earlier restructure.
- ~~CSS dead-class scan~~ -- resolved (patch 0102), redone against the full
  `ui/` tree plus `app.css`, cross-checked against the live repo rather than
  just the uploaded files. Only one real dead spot found: `.slot`,
  `.slot-grid`, and their two descendant rules (`.slot .slot-name`,
  `.slot.empty`) in `app.css` -- leftover from before the equipment panel's
  item-card redesign; gear slots have used `.item-card` / `.item-card-grid`
  for a while and nothing still renders the old classes. Removed. Everything
  else that looked dead on a naive scan turned out to be a class applied
  dynamically from a variable rather than a literal string --
  difficulty-tier classes (`easy`/`normal`/`hard`/`epic`/`legendary`, from
  `offer.difficulty`) on quest/raid cards, and the knight's animation-state
  classes (`walking`/`departing`/`returning`) on the desktop companion --
  plus `.loading`, which lives in `App.tsx` outside the `ui/` tree entirely
  (the pre-mount "Waking the knight…" screen). None of those are actually
  unused; a scan that only grep for literal strings will always flag them
  and should not delete them.

### Deferred systems (queued before the polish/narrative detour started)
- Pets -- spec'd, not yet built. See dedicated section below.
- Freeze slot for the quest board (never got a firm yes/no).
- **Quest chains in the DevTool, editable like raids are.** Bigger than
  it sounds -- raids.json/raid-encounters.json are already small, flat,
  JSON-driven data the DevTool edits directly, but `QUEST_CHAINS` in
  `quests.ts` is still ~420 lines of literal TS objects, 19 chains, each
  with an embedded `stages` array of nested objects (name/flavour/
  difficulty/duration/goldMultiplier per stage) -- not a separate
  reusable pool the way raid encounters are, and not something the
  DevTool's current field types (`string[]`, `mods`, `stats`, `effect`,
  `eventEffects`) already know how to render. Needs: (1) migrating
  `QUEST_CHAINS` out to `quest-chains.json` (mechanical, scriptable --
  should convert losslessly, not be hand-retyped, given how much prose
  is riding on it), with `quests.ts` importing and re-typing it the same
  way `raids.ts` already does for its own JSON; (2) a new `chainStages`
  field type in the DevTool (both `server.mjs` validation and an
  `app.js` repeatable sub-form, add/remove rows) -- structurally its own
  small feature, not a tweak to an existing one. Worth doing, but sizable
  enough to want its own dedicated pass rather than folding into
  whatever else is in flight.
- ~~Shop -> Vendors restructure~~ -- done (patch 0118). Shop renamed to
  Vendors; its three sections split one per vendor (Blacksmith sells
  armour, Alchemist sells supplies, Enchanter sells black market); the
  old Upgrades tab's General upgrades moved into Guild Hall, its three
  vendor sections (Blacksmith/Alchemist/Enchanter permanent stat
  upgrades) moved onto each vendor's own page -- the Upgrades tab itself
  is gone, fully absorbed into the two. Each vendor page is
  sprite+Level Up on top, a new Crafting button next to Level Up
  (opens an overlay filtered to that vendor's own category -- gear for
  Blacksmith, potions/food for Alchemist, enchanting for Enchanter),
  that vendor's own upgrades beneath (locked-card treatment for
  untrained tiers, same as before), that vendor's store items below
  that. Crafting is out of the Harvest tab entirely now, which was the
  specific complaint that started this ("very much hidden away").
  Caught and fixed two real, pre-existing mismatches while moving this,
  not just relocating the same bugs: the Trade Route unlock toast was
  pointing its "Go to" button at the (now-removed) Upgrades tab when it
  should always have pointed at Harvest, where Trade Route actually
  lives; and the Black Market unlock hint referenced "the Upgrades tab"
  when Black Market Contact is a General upgrade, now correctly pointing
  at Guild Hall. Verified vendor/upgrade groupings and the actual
  buy/level-up flow against the real engine at runtime, not just
  typechecked.

### Harvest/Gathering + Crafting -- built (patch 0111, Enchanting added 0114)
Started as the one-line "Off-mission engagement" bullet, scoped across a
few conversations, then built end to end: types, data, both managers,
engine wiring, save migration, and a real UI. `npx tsc --noEmit` and a
full `vite build` both pass clean; the actual spawn/catch/craft/sell loop
was exercised at runtime (not just typechecked) before calling this done,
including migrating a save that predates all of this entirely.

**What's live:**
- New `harvest` tab (Guild group) -- a Warehouse sub-tab (stock, capacity,
  Trade Route, Tools) and a combined Fields sub-tab (patch 0119 -- see
  below for what changed there). Any hero not currently on a quest feeds
  every node's spawn timer -- no assignment step, and not gated on which
  sub-tab happens to be open, same as the quest board and shop already
  tick regardless of which panel you're on.
- **Per-node mechanic**: on a timer (`HarvestManager.ensureSpawns`,
  ticked from `GameEngine.refreshWorld`), a material spawns at a random
  X, falls and settles (`@keyframes harvest-fall`), pulses for ~12s
  (`harvest.despawnWindowMs`), then despawns unclicked -- no penalty for
  a miss. Catching it reuses the existing `.collect-burst`/
  `.collect-particle` juice with a new `material` particle skin, not new
  animation code. ~12% chance (`harvest.bonusChancePercent`) of a bigger
  "bonus" glint worth 3x.
- **Spawn rate** scales with idle hero count and each node's tool level,
  floored at a minimum (`harvest.minSpawnIntervalMs`) so a big roster
  can't turn a scene into chaos.
- **Tool upgrade line** -- Pickaxe/Woodaxe/Sickle/Net, one per node,
  gold-cost, own file (`data/harvestUpgrades.ts`), same "own tree, not
  folded into the general list" shape as Raid Upgrades. Warehouse
  (shared storage cap across all four materials, same `storagePerLevel`
  shape Treasury already has) lives in the same file.
- **Trade Route** -- one-time gold upgrade, unlocks selling materials
  for flat gold per unit.
- **Crafting** -- lives on each vendor's own page in Vendors as of patch
  0118, not in Harvest. Gear recipes (Guildmade Blade: ore+timber;
  Guildmade Band: ore+timber) let the player pick 2 of 4
  eligible mod types at a fixed value each, stored on the item itself as
  `EquipmentItem.customMods` rather than the def's own `mods` (which
  stays empty on any `craftable: true` def -- see that flag's comment in
  types.ts). This is the actual reason to craft instead of farming or
  buying: choice instead of a random roll. Consumable recipes (Trail
  Rations: fish+herbs; Herbal Tonic: herbs) are simpler on purpose --
  materials+gold for an existing potion, no customization, since "choose
  your own stat spread" only makes sense for something you keep.
  Crafting always succeeds (no roll) and costs gold *and* materials --
  the real sink for Trade Route's gold faucet, not a separate mechanism.
- **Enchanting**, added alongside Crafting rather than as a separate
  feature -- a third recipe category (`CraftingRecipeDef.category ===
  'enchant'`) that modifies an item the player already owns instead of
  producing a new one. One recipe so far, Minor Sigil (herbs+ore+300g):
  pick 1 of strength/endurance/luck/wisdom at +3, additive on
  `EquipmentItem.enchantStats` -- stacks with itself (a second enchant on
  the same stat adds rather than overwrites) and with the item's own base
  `stats`, unlike a gear recipe's `customMods` which replaces the def's
  `mods` outright. `HeroManager.equipmentStats` folds this in
  automatically. Item search (stash or equipped) reuses
  `EquipmentManager.allItems`, the same scope `repair()` already uses.
- **Crafting's UI is now grouped by vendor** -- Blacksmith (gear),
  Alchemist (consumables), Enchanter (enchanting), each with its own
  `VendorSprite` header pulled from the existing vendor art system
  (`public/vendors/`, gitignored/licensed -- renders nothing rather than
  a broken image if that art isn't present locally, same convention as
  everywhere else). These are the same three vendors Guild Upgrades
  already has its own separate relationship with (permanent stat
  upgrades, gold-only) -- Crafting doesn't touch that vendor-leveling
  system at all, just borrows their sprites and names for its own,
  unrelated recipes.
- Every numeric knob (spawn interval, despawn window, bonus odds/
  multiplier, yield, sell price, all four tools' and the Warehouse's cost
  curves) reads from the tuning registry from day one -- 34 new entries,
  2 new categories (`harvest`, `harvest_tools`).
- `guildmade_blade`/`guildmade_band` (the two craftable bases) are
  filtered out of the shop, black market, and quest loot pools the same
  way `raidExclusive` items already are, just in the opposite direction
  -- see `EquipmentDef.craftable`'s comment in types.ts.
- `EquipmentPanel` shows a "Crafted" badge next to the rarity pill on any
  item with `customMods` set, and both its mod-list displays now read
  `item.customMods ?? def.mods`.
- `SAVE_VERSION` bumped 20 -> 21; migration fills in empty materials/
  tools/warehouse/trade-route state for any save from before this
  existed, verified against an actual pre-migration save object at
  runtime, not just written and assumed correct.

**Known gaps, deliberately not blocking this patch:**
- **Art.** ~~`public/lore/harvest/<nodeId>.jpg` (4 files)~~ -- superseded
  by patch 0119's Fields consolidation below: now just one shared image,
  `public/lore/harvest/fields.jpg`. A Warehouse interior still doesn't
  exist. Same "missing file just fails to paint, no broken-icon"
  convention as every other banner in this game either way.
- **Quests still exist to fill the same original gap.** Nothing was
  changed about how a hero coming back from a quest also being available
  to gather at the same time -- worth a look eventually, but not a blocker.
- Recipe costs, tool-upgrade curves, and yields are first-pass numbers,
  not a balance pass -- same "content is a cache, gameplay data confirms
  the intent" spirit as every other system's initial numbers before
  actual playtesting.

### Harvest Fields consolidation -- done (patch 0119)
The 4 separate per-node sub-tabs (Quarry/Woodyard/Herb Garden/Fish Weir)
collapsed into one combined **Fields** sub-tab, replacing them alongside
the existing **Warehouse** sub-tab (so Harvest is 2 sub-tabs now, not 5).
One shared scene, one shared background image, sourced as a single image
pre-split into 4 even vertical blocks rather than 4 separate files --
**`public/lore/harvest/fields.jpg`** is the exact path and filename the
game looks for; same "missing file just fails to paint" convention as
every other banner, so nothing breaks if it isn't there yet. Left to
right, in `NODE_ORDER`: ore (Quarry), timber (Woodyard), herbs (Herb
Garden), fish (Fish Weir) -- each node's falling item spawns only inside
its own 25%-wide lane (`spawnPositionPercent` remapped from a full-width
random spot to `laneStart + padding` within that node's slice), verified
at runtime across 20 samples per node that none ever crossed into a
neighboring lane. All four nodes' spawn/catch/burst logic is still fully
independent under the hood (`NodeLane`, one instance per node) -- only
the *display* is shared now, not the mechanic itself.

Tool upgrades (Pickaxe/Woodaxe/Sickle/Net) moved out of each node's own
view and into the Warehouse sub-tab, under a new "Tools" section --
consistent with everything else Warehouse-related (capacity, Trade
Route) living in one administrative spot rather than scattered across
the tab.

### Pets -- spec'd (not yet built)
Fleshed out in a design pass; nothing coded yet. Leans on existing
patterns throughout rather than inventing new mechanisms where an old one
already fits.

**Acquisition**
- Eggs drop from quests/raids: a low base chance on any completion, or as
  a guaranteed/dedicated reward on specific encounters -- DevTool-
  assignable per quest/raid, same shape as `raidExclusive` loot flagging.
- A one-time, non-repeatable intro chain ("save the hatchery") grants a
  starter egg and unlocks the Hatchery tab as its completion reward.
- Hatchery tab unlock triggers a spotlight/highlight prompt, reusing the
  existing `OnboardingTour` pattern plus a new `GuidanceManager` topic
  (e.g. `hatchery_unlocked`) rather than new tour code.

**Eggs & hatching**
- Eggs carry rarity (reuses the existing equipment rarity tiers).
- Hatch progress is driven by hero XP earned while incubating -- higher
  rarity needs more XP, so rarer eggs take longer. *(Open question: does
  XP from any hero count account-wide, or only a hero the egg is
  "carried" by? Assumed account-wide for now -- simpler, no extra
  equip-slot needed pre-hatch.)*
- Incubation is slot-limited, expandable via upgrade -- same shape as the
  Potion Belt (1 base, more via a paid unlock).
- On hatch, rolls a pet from either the general random pool or, if the
  egg came from a dedicated-reward source, a secondary reward-specific
  pool -- same two-pool split the loot system already uses elsewhere.
- Hatchery home sub-tab shows all currently-incubating eggs with progress
  bars, sprite per egg.

**Pets**
- Second sub-tab shows owned/active pets -- idle animation, plus any
  secondary animations if the art provides them. Renders nothing if the
  sprite file is missing, same convention as every other art asset here.
- Nameable. Rarity is cosmetic-only for now (recolor/"shiny" tier), not
  power -- bonus magnitude is a separate random roll on hatch, independent
  of rarity.
- Bonus is a modifier (xp/gold/luck/success -- the same types facilities
  already use) and feeds into the existing additive `sumMods` system.
- Pets gain XP post-hatch; for now that XP grows the bonus's magnitude
  over time (no cosmetic leveling yet).
- **Parked, not committed:** rare color variants of the same pet that
  carry an added modifier on top of the normal roll, paired with a
  resource+gold refine/upgrade path (mirroring gear repair/refine) so
  non-rare pets have their own route to a stronger bonus too, rather than
  rarity being the only lever. Revisit once the base system is live.

**Equip & adventuring**
- 1 equipped pet slot base, more via an upgrade -- same shape as Potion
  Belt.
- Equipped pet's sprite trails/accompanies the hero sprite wherever the
  hero sprite renders (desktop companion included).

**Happiness & feeding**
- Each pet has its own happiness bar that decays over time (needs a tick,
  similar in shape to Harvest's spawn timer).
- Happiness scales how much of the pet's bonus actually applies -- exact
  curve TBD, but 0% happiness should not fully zero the bonus out
  (needs a floor, not a hard cutoff, to avoid a pet feeling "off").
- Feeding accepts either raw Harvest materials (smaller happiness gain)
  or crafted pet food (larger gain) -- same farm-or-craft choice Crafting
  already offers for gear.

**Content & DevTool**
- Egg/pet sprites follow the existing "missing file just fails to paint"
  convention -- no broken-image state, renders once art lands at whatever
  path convention gets picked (e.g. `public/lore/pets/<petId>`).
- Hatchery gets its own background image, same banner-art convention as
  every other tab.
- New DevTool Pets section: pet defs (name, recolor tier, bonus type/
  range, sprite path) and egg defs (rarity, hatch-XP threshold, pool
  reference), plus pet/egg assignment on quest/raid loot tables using the
  existing loot-picker UI and `raidExclusive`-style dedicated-pool
  flagging.
- New tuning registry category (`pets`) for hatch-XP thresholds per
  rarity, happiness decay rate, happiness->bonus curve, and feed-happiness
  values per resource type.

**Still open**
- Exact happiness decay rate and happiness->bonus curve.
- Whether hatch-XP is account-wide or tied to a specific hero.
- Whether rarity ever becomes bonus-relevant (see "parked" note above) --
  explicitly not committed.

### Bigger, still-undecided
- **Queued from the same conversation as the UX/economy batch above:**
  - ~~Consumable stats/mods~~ -- done, see "Consumables can now carry
    crafted stat/mod bonuses" above for the full writeup.
  - ~~Equipment pool expansion~~ -- done, see "Equipment pool expansion:
    new cloak slot, 3 material-tier sets, 4 raid sets" above for the
    full writeup. One raid (Requiem for the Last God) already had a set;
    the new cloak slot fills out every one of the material-tier sets
    listed there, not every pre-existing set retroactively -- the older
    chain-reward sets (Dragon Slayer, Ashen Hand, Voidforged, Empyrean,
    Requiem) were left exactly as they were, since retrofitting a cloak
    piece into each would mean inventing new lore-specific items for
    chains that already shipped, a separate ask from what was scoped
    here.
  - ~~Harvest fish -> food generalization~~ -- done, see "Fish Weir
    generalized to a broader Food/Provisions theme" above for the full
    writeup.
- ~~Harvest icon randomization, prepped but not wired to real files
  yet~~ -- selection logic done, see "Harvest icon randomization" above
  for the full writeup. Still waiting on the actual art files in
  `public/harvest-icons/` -- everything picks up automatically once
  those land, no further code changes needed.
- ~~First-five-minutes onboarding beat~~ -- done. A scripted, one-time tour
  on a genuinely fresh save: a spotlight box over each real nav tab in
  turn (dimming everything else via one oversized box-shadow, no separate
  overlay layer), Skip available from step one. Finale is a standalone
  modal triggered by GuidanceManager's existing `first_chain_seen` topic
  (rerouted from the toast queue to a proper modal specifically for this),
  since a chain's actual discovery timing depends on board RNG, not a
  fixed step count. Existing saves are migrated straight past it --
  never retrofitted onto anyone already playing.
- ~~Tuning registry expansion beyond raid coefficients~~ -- first batch
  done (patch 0107): all 5 guild facilities' `baseCost`/`costGrowth`/
  `maxLevel` and their single `modsPerLevel` effect strength now read
  from the registry (`guild_facility.<id>.*`, category `guild_facilities`,
  20 new entries) instead of being literals in `progression.ts` -- same
  mechanical pattern `raid_speed` already established in
  `raidUpgrades.ts`. `storagePerLevel`/`heroSlotsPerLevel` deliberately
  stay hardcoded (structural, not a balance knob). Verified the resolved
  values are byte-identical to the old literals before this landed.
  Not yet migrated, if there's appetite for another batch: `UPGRADES`
  (vendor upgrades) and `RENOWN_PERKS` in the same file, and
  `raid_loot`/`raid_recovery` in `raidUpgrades.ts` (already flagged
  there as deferred, same shape as `raid_speed`).

### Platform / distribution
- **Steam Cloud saves** -- no code work needed yet. Saves already live at
  `app.getPath('userData')`, a stable path suitable for Steam's Auto-Cloud
  file sync, which is configured entirely in the Steamworks partner
  backend once a real App ID exists -- not an SDK integration the way
  achievements are. Revisit when actually setting up the Steam page.

---

## Brainstorming / not yet committed

- **Class/role based heroes** -- giving hero classes actual mechanical
  roles (tank/support/dps-style differentiation, or similar) rather than
  today's flat stat-and-preferred-quest-type distinction. No concrete
  design yet -- needs its own scoping conversation before anything else
  (what "role" actually means mechanically here, whether it affects
  quests/raids/both, whether existing classes get reworked or new ones
  get added).
- **The Rememberer** -- a future Minor-domain god concept (memory/being
  forgotten, fades because written record-keeping replaced an oral
  practice). Parked in favor of reworking the Last God instead.
- **A Major-domain True God encounter** -- would need a fundamentally
  different shape than a straight raid fight. No concrete concept yet.
- **Steam leaderboards** -- mentioned early as a distinct, larger feature;
  the Guild Rank tooltip in the Lore tab was deliberately worded to become
  literally true if this ever ships, without needing a rewrite.
