# Guild Idler — Status & Roadmap

Companion to `guild-idler-project-brief.md`, not a replacement. The brief holds
formulas, constants, and "don't re-derive this" findings. This file holds the
bigger picture: what's actually built, what's queued, and what's just an idea
so far. Update it whenever a patch lands or a new direction gets locked in —
stale sections here are worse than no section at all.

---

## Systems in place

**Core loop** — quest board (30-min refresh windows), offline catch-up,
Auto-Chain streaks, burst quests (capped live against the best-unlocked
tier rather than a flat taper). Auto-Chain now stops itself the moment
any quest fails ("as far as you can go") instead of grinding on toward
its target count regardless of outcome, and story chains have their own
independent auto-continue -- see "Auto-queue / chain stepping rework"
below. Each hero now generates and keeps their own contract pool, scaled
to their own level rather than the guild's top hero -- see "Quest Tab
hero-log rework" below.

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
shifted from steps 5/6/7 to 6/7/8 to make room. New `pets` schema (Pets
build) needed zero frontend changes -- confirms the schema-driven editor
generalizes to a genuinely new content type, not just tuning, for free.

**Harvest/Gathering + Crafting** — new `harvest` tab: idle heroes feed 4
material nodes (Quarry/Woodyard/Herb Garden/Fish Weir) via a click-the-
falling-item mechanic, spent on a Warehouse-tab Crafting UI (gear with
player-chosen mods, or fixed consumables) plus a Trade Route for selling
surplus. See its own section below for the full built-status writeup.

**Pets / Hatchery** — new `hatchery` tab (hidden until the one-time intro
chain `the_last_clutch` grants it), unlocked via a spotlight prompt reusing
OnboardingTour. Eggs drop from quests/raids (or the intro chain's own
dedicated grant) into unbounded storage, then get manually equipped into
one of a limited number of Nest slots to start incubating toward a
rarity-based hatch-xp threshold (fed by hero xp earned anywhere in the
guild) -- Nests are genuine equip slots, the same relationship the
equipment stash has to a hero's worn gear, not an auto-start-on-grant
system anymore. Reaching the threshold makes an egg eligible, not hatched
-- it sits marked "Ready to Hatch!" until the player clicks it, at which
point a reveal modal shows the actual pet, with its own separate
persisted prompt nudging the player toward the Hatchery the moment
anything first becomes ready (see the full writeup below for why this
changed from the original auto-hatch behaviour). Equipped pets (1 base
slot, more via the new Companion Bond upgrade) feed their bonus into the
account-wide modifier pool, gain their own xp which grows that bonus over
time, and now render live beside the hero on the desktop companion;
happiness decays lazily and can be restored by feeding raw materials or a
new craftable Pet Treat. Four real animated species (fox/red panda/crow/
hatchery hound) ship with art across all 5 rarity recolors; egg art is
still glyph-only, blocked on sourcing the actual transparent spritesheet.
See its own section below for the full writeup.

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

**Superseded by "Quest Tab hero-log rework" below** -- the single shared
6-slot board this section describes is gone; every hero now generates and
keeps their own contract pool instead. Left in place as a record of the
original shape rather than rewritten in place.

### Quest Tab hero-log rework -- complete
Started from a real scaling complaint: the whole roster shared one 6-slot
contract board, sized around whichever hero happened to be the guild's
current top level (`reqLevel <= topLevel + 2`) -- a large, level-varied
roster meant everyone competed for the same handful of slots, and a
fresh recruit could easily find nothing on the board they actually
qualified for if the window's RNG leaned toward harder tiers. Considered
a smaller UI-only fix first (keep the shared pool, just reorganize the
*view* per hero) but that would have left the actual scaling problem
untouched -- contention gets worse with more heroes, not better -- so
went with the structural version instead.

**Every hero now generates and keeps their own contract pool.** The Quest
tab opens with a row of hero tabs (name, level, questing/injury glyphs);
selecting one shows that hero's own contracts and lets you send them
directly -- no more click-a-quest-then-pick-a-hero flow, since the hero
is chosen first now. `QuestManager.generateBoard` (one shared board) is
replaced by two functions:

- **`generateContractsForHero(state, hero, now)`** -- eligibility and
  burst-reward caps now scale off that specific hero's own level
  (`hero.level + 2 >= reqLevel`), not the guild's top hero. Deterministic
  per `(window, hero.id)`, same reload-survives-refresh guarantee the old
  shared board had. The "guarantee one short Easy offer so a solo player
  always has *something* to send" rule (previously gated on
  `state.heroes.length <= 1`, back when a second hero could just pull
  from the same shared pool) now applies unconditionally to every hero's
  own board, since "no second pair of hands to fall back on" is true of
  each hero individually under this model.
- **`generateChainBoard(state, now)`** -- unchanged in spirit, still one
  shared list. A chain's progress (`ActiveChain.stage`) is tracked once
  per `chainId`, not owned by any specific hero, so every idle hero who
  qualifies still sees the same current stage on their own tab, exactly
  as before.

`GameState.questBoard` (one array) is replaced by `questBoards` (a
`Record<heroId, QuestOffer[]>`) plus a separate `chainBoard`.
`refreshWorld` regenerates every hero's own board on each 30-minute
window rollover, and also fills in a board immediately for any hero who
doesn't have one yet (a brand-new recruit, or a hero reset by Retire --
same id, back to level 1) rather than waiting out the rest of the current
window; boards for heroes removed via Early Retirement are pruned rather
than left orphaned in the save. `SAVE_VERSION` bumped 25 -> 26; the old
shared board can't be salvaged into the new per-hero shape (its offers
were never scoped to one hero), so the migration just drops it and lets
the very next tick regenerate everything fresh, the same "missing data
just regenerates" contract every board refresh already relies on.

Quick-assign now sends whichever hero's tab is open on the best contract
from *their own* board, rather than the first idle hero on the board's
first qualifying contract. The Auto-Chain bounty streak's continuation
call (`tryContinueAutoChain`) used to regenerate the *entire* shared
board just to guarantee a next contract for one streaking hero -- which,
under the old model, could incidentally resurrect offers other heroes
were relying on. It now regenerates only that hero's own board, same
guarantee, correctly scoped.

**A bug caught and fixed during this same pass, before it shipped:**
the first version of `refreshWorld`'s chain-board refresh used
`chainBoard.length === 0` as a "needs regenerating" signal, mirroring the
per-hero board's own fallback -- but an empty chain board is a
legitimate steady state (nothing currently unlocked, or every available
chain completed), not a sign it was never generated. Left as written,
that condition would have re-triggered every single tick once no chains
were available, forcing a save on every tick. Fixed to key off the
window rollover alone (which also correctly covers first-load and
post-migration, since `boardRefreshedAt` starts far behind the real
current window either way).

`npx tsc --noEmit` and `vite build` both pass clean.

### Medium-length quests + board/vendor reroll -- complete
Two independent asks landed together since both touched the quest-offer
generation path.

**Medium quests.** There was a real gap in the duration spread: burst tops
out at 8 minutes, and the normal range starts at a full hour, so there was
nowhere for a genuine "half an hour, check back on your break" contract to
live. `DifficultyConfig` gained a third duration mode -- `mediumChance`/
`mediumMin·MaxDuration`/`mediumMin·MaxGold`/`mediumMin·MaxXp` -- same shape
as burst's existing fields, rolled independently (burst is checked first;
medium only gets a chance if burst didn't hit, so an offer is never both).
Wired onto Easy (35% chance conditional on not-burst, ~19% of all Easy
offers) and Normal (25% conditional, rarer on purpose -- Normal should
still skew toward full-length more than Easy does) tiers, both spanning
20-40 minutes. Hard/Epic/Legendary deliberately left alone -- those are
meant to read as genuine hours-long expeditions, not something with a
quick-turnaround option.

Medium shares burst's existing live per-hour cap rather than getting its
own separate guardrail -- `balance.ts`'s `burstCapsPerHour` renamed to
`fastQuestCapsPerHour` and now applied to both modes, since both exist for
the same reason (an explicit, generous-feeling reward range beats a
proportional slice of the full range, which measured out to 1-2 XP per
offer when burst was first tuned) and so both need the same protection
against becoming the dominant strategy once out-leveled.

Verified at runtime, not just typechecked: 5000 sampled Easy-tier offers
landed ~44.6% burst / ~20% medium / ~35.4% normal (target was 45/19.25/
35.75) with every medium sample's duration falling inside the intended
20-40 minute window, zero outliers.

**Quest board + Vendors reroll.** A new Reroll button on each hero's own
Contracts section (Quest tab) and on the Vendors shop's Stock section --
1 free reroll per day each, independently tracked, then an escalating
gold cost per additional reroll that day (40g base for quests / 60g for
Vendors, both ×1.6 per additional paid reroll -- new `reroll.*` Tuning
entries, 4 total). Two new guild upgrades, **Board Runner** and **Trade
Favor** (3 levels each, +1 free reroll/day/level -- 1 base + 3 = 4 total,
matching the "up to 4" spec), same `UpgradeDef` special-purpose-field
shape `consumableSlotsPerLevel`/`petSlotsPerLevel` already established.
The free/paid count for each system is account-wide, not per-hero --
rerolling three different heroes' boards in one day spends from the same
daily quest-reroll allowance as rerolling one hero's board three times.

Shared day-window and cost-curve math lives in new `data/reroll.ts`
(plain functions, not a manager -- neither system owns state beyond the
two counter fields already on GameState, the same shape burst's own cap
math in `balance.ts` already uses). Day boundaries are plain UTC-epoch-day
division (`Math.floor(now / DAY)`, new `DAY` constant in `util.ts`),
matching every other window-bucketed system in this game (the quest
board's 30-min windows, shop's 4h window) rather than the player's local
midnight.

A reroll needed to actually produce different offers, not just repeat the
same window-seeded board -- `generateContractsForHero` and
`ShopManager.refresh` both gained an optional `salt` parameter (default 0,
fully deterministic per window for reload stability; a reroll passes the
exact reroll moment instead) folded into their RNG seed and offer ids.
Neither reroll touches its system's natural refresh clock
(`boardRefreshedAt` / `state.shop.refreshedAt`) -- confirmed directly, a
reroll doesn't push back the next scheduled automatic refresh for anyone.
Vendors reroll restocks both equipment and consumables at once (`refresh()`
already regenerates both together) but deliberately doesn't touch the
black market, which keeps its own much longer natural window as an
intentionally scarcer system. `SAVE_VERSION` bumped 26 -> 27; migration
backfills all four new counter fields to 0/0 for any existing save, which
is exactly "no rerolls used yet today," not a placeholder needing
correction.

Verified at runtime: the cost curve matches the tuned formula exactly
(0, 40, 64, 102, 163 gold for 5 quest rerolls at the default 40g/1.6x with
no upgrade); a day rollover correctly resets the next reroll to free;
Board Runner at max level correctly grants 4 free rerolls before any cost
appears; the Vendors curve mirrors the same shape independently (0, 60,
96 at its own 60g/1.6x); a reroll's resulting board/shop stock genuinely
differs from what was there before; and a migrated pre-27 save lands on
the correct 0/0 defaults for all four counters.

**Noted, not fixed:** the DevTool's upgrade schema doesn't yet expose any
of the existing special-purpose per-level fields (`consumableSlotsPerLevel`,
`incubationSlotsPerLevel`, `petSlotsPerLevel`) for editing, and Board
Runner/Trade Favor's new `questFreeRerollsPerLevel`/
`vendorFreeRerollsPerLevel` are in the same boat -- a pre-existing gap this
patch didn't introduce (none of Potion Belt/Nest Expansion/Companion Bond
got DevTool support for their own special field either), not something
newly broken. Worth a look if the DevTool ever needs to edit these
upgrades' per-level bonuses directly rather than just their cost curve.

`npx tsc --noEmit` and `vite build` both pass clean.

### Elemental infusion (weapons, armor, quests, raids) -- complete
A weapon can now be infused with an element (fire/frost/lightning/poison);
armor can be infused with resistance to one. Confirmed split: both
infusions happen at the **Blacksmith** (new Infuse button, next to
Enhance); the **Enchanter** crafts the gems that get spent there (new
Gems button). Quests and raid encounters both carry elemental tags now,
scaled by difficulty per the original ask ("the harder the quest... the
more resist modifiers... depending on how many elements").

**Data model.** New `ElementType` (fire/frost/lightning/poison).
`EquipmentItem.elementalDamage` (weapon, single value -- infusing again
*replaces* it, meant to read as changing what the weapon carries, not
stacking multiple damage types onto one blade) and `elementalResist`
(everything else, a value per element that *adds* on repeat infusion,
same "stacks with itself" shape `enchantStats` already established).
`QuestOffer` and `RaidEncounterDef` both gained `vulnerableTo` (weak to --
matches a weapon) and `dealsElement` (attacks with -- matches armor
resist); `RaidEncounterDef` additionally gets `immuneTo` (raid-only,
nullifies the weapon-matching bonus specifically, not armor resist -- "a
fire dragon, immune to fire damage" was the motivating example, and there
is no ordinary-quest equivalent). Quest tags are rolled procedurally at
generation time; raid encounter tags are authored by hand (raid encounters
are a small curated list, not procedurally generated the way board
offers are) -- three encounters tagged as a working example:
`wyrmkeep_frozen_wyrm` (deals frost, immune to frost, vulnerable to fire
-- the actual "immune to its own element" example), `wyrmkeep_hatchling_
brood` (deals frost, vulnerable to fire, no immunity -- the trash-tier
version of the same boss's theme), and `blackford_uncrowned` (deals
poison, vulnerable to lightning, for variety across raids). The other 12
encounters are untagged on purpose -- a full content pass wasn't in scope
for landing the mechanic itself, same "content is a cache, gameplay data
confirms the intent" spirit as every other system's first-pass numbers.

**Tag density**, `elemental.tagRollChancePercent` in the tuning registry:
each candidate element gets an independent chance to appear, checked up
to that tier's own ceiling (Easy/Normal: max 1; Hard/Epic: max 2;
Legendary: max 3). Tuned to 22% after an initial pass at 45% turned out
far denser than intended -- at 45%, Easy/Normal landed a tag on ~91% of
offers (checking up to 4 candidates against a 1-tag cap makes "at least
one hit" likely even at a modest per-candidate rate); verified directly
at 2000 samples per tier rather than assumed from the formula, both before
and after the fix. At the corrected 22%, Easy/Normal land ~37% zero tags
/ 63% one; Hard/Epic/Legendary land ~37% zero / 41% one / 21%
two-or-more.

**Success-chance integration** (`elemental.bonusPerMatchPercent`, 3% by
default): a matching weapon element adds a flat bonus; matching armor
resist adds whatever's actually accumulated on that piece (so a
twice-infused item contributes double) -- both live in a new shared
`elementalBonusForHero` (`data/elements.ts`), used by
`QuestManager.previewSuccess` and by both of `RaidManager`'s success-calc
paths (`previewEncounterSuccess` for the UI preview, and the live
per-encounter `resolve()` loop -- recomputed fresh per encounter, unlike
the party's ordinary `partySuccessBonus`, which is locked in once at raid
start, since different encounters in the same raid can carry entirely
different tags).

**Scrap** -- a new standalone currency (`GameState.scrap`), deliberately
NOT folded into the existing `MaterialId`/Harvest system despite the
"materials" framing, since scrap comes from breaking down owned equipment
(new Scrap button next to Sell, Blacksmith's stash list) rather than a
Harvest node -- adding it to `MaterialId` would have meant awkward
exceptions everywhere that type is used for per-node Harvest state
(`harvestNodes`/`harvestTools`), which scrap has no relationship to.
Yield scales with rarity via 5 new tuning entries (`elemental.scrapValue.
<rarity>`, 2/4/8/16/32 -- doubling per tier, matching "the rarer the item,
the more materials" directly), deliberately NOT scaled by condition/plus
the way `sellValue` is -- scrapping is the "I don't want this but it's
still worth its rarity" option, not a second gold-adjacent economy to
min-max.

**Gems** -- 8 new Enchanter recipes (`craft_elemental_gem_<element>` /
`craft_resistance_gem_<element>`, one pair per element), a new `'gem'`
`CraftingRecipeDef` category with no player choice at craft time (unlike
gear/enchant) since each recipe is already authored for a specific
element/kind via the new `resultGem` field -- `CraftingManager.craftGem`
just checks affordability and adds +1 to the right counter
(`GameState.gems` or `resistGems`). `CraftingRecipeDef` also gained a
`scrapCost` field, since Scrap is its own currency rather than a
`MaterialId` and so can't fit into the existing `materialCost` map.
`CraftingStation.tsx` picked up `'gem'` as a fourth category -- the
simplest of the four, a single top slot (choose a recipe) with no bottom
slots at all, since there's nothing else to pick.

**Infuse station** (`InfuseStation.tsx`) -- mirrors `EnhanceStation.tsx`'s
click-select-confirm pattern, but only one slot on the frame (item), not
two -- the commissioned art (`infuse.jpg`) only painted one cutout, unlike
gear/consumable/enchant's three-slot scenes, so gem choice is a row of
labelled chip buttons below the frame instead of a second floating slot.
Which gem pool an item draws from (`gems` vs `resistGems`) is still
decided entirely by the item's own slot (weapon vs everything else) -- no
separate "kind" choice for the player to make.

**Scrap** also became its own dedicated station (`ScrapStation.tsx`,
new file) rather than staying as a per-item button in the Vendors stash
list -- moved for the same reason Enhance moved off the Inventory tab
before it, and because real background art (`scrap.png`) arrived for it
specifically. Confirms with a "+N Scrap" collect-burst on the item's own
slot -- reuses the exact `collect-burst`/`collect-particle` convention
Harvest catches and quest/raid reward bursts already established, with a
new `.collect-particle.scrap` colour variant and a 5-icon pool
(`SCRAP_ICONS` in `data/elements.ts`, reusing existing
`crafting/Crafting_74-78.png` icons rather than needing new art) picked
per-event the same deterministic-sine-seed way `harvestIconFor` already
picks a Harvest icon. One real bug caught before it shipped: the burst
was originally nested inside `.craft-scene`, which has `overflow: hidden`
to keep the background art cleanly cropped -- that would have clipped
the particles' upward flight. Fixed by making the burst a sibling of
`.craft-scene` instead of a child, both wrapped in a shared
`position: relative` container.

Both stations' slot rects were hand-measured programmatically (largest
contiguous dark region near the image's center, via a Python connected-
components pass against each PNG/JPEG) rather than eyeballed, then
cross-checked against `EnhanceStation`'s own already-correct rect for
sanity -- both new measurements landed close to it, as expected since all
of these scenes share the same underlying 1402x1122 template.

**Known gaps, deliberately not blocking this patch:**
- **Gem crafting scene** (Enchanter's `'gem'` CraftingStation category)
  still has no commissioned background (`./lore/crafting/gem.jpg`) --
  same "missing file just fails to paint" convention as everywhere else,
  and its single top-slot rect is still a placeholder (reused from the
  `consumable` category's own rect) pending real art to measure against,
  unlike Infuse/Scrap above, which now both have real art and real
  measured rects.
- **Icons.** New gem recipes ship with no `icon` field set (falls back to
  a plain 💎 glyph via `CATEGORY_FALLBACK['gem']`) -- deliberately, rather
  than guessing at specific `crafting/Crafting_NN.png` filenames. Already
  confirmed the right assets exist in the icon library; assign them via
  the DevTool's Icon Library the same gradual way every other item's icon
  gets filled in.
- **12 of 15 raid encounters carry no elemental tags at all** -- see the
  content-pass note above.
- **Chain-stage offers don't roll elemental tags** -- chain stages are
  hand-authored content (specific named bosses), not procedural filler
  like board contracts, so they were left out of the roll rather than
  retrofitted; nothing stops a future chain from hand-authoring
  `vulnerableTo`/`dealsElement` directly on a stage the same way raid
  encounters do, if a specific stage calls for it.
- **DevTool schema** doesn't yet expose `elementalDamage`/
  `elementalResist` on equipment, `vulnerableTo`/`dealsElement`/
  `immuneTo` on raid encounters, or the new `'gem'`/`scrapCost`/
  `resultGem` fields on crafting recipes -- same "noted, not fixed"
  situation as Board Runner/Trade Favor's fields last patch; the 3
  hand-tagged raid encounters and 8 gem recipes above were edited
  directly in the JSON, not through the DevTool.

Verified at runtime throughout, not just typechecked: tag-roll
distribution at 2000 samples per tier (both before and after the density
fix), the full craft-gem -> infuse-weapon -> matching-success-bonus
pipeline end to end, armor resist correctly stacking across two
infusions (2x the per-infusion bonus, confirmed exactly), immunity
correctly zeroing the weapon-side bonus while leaving armor resist
untouched, raid encounter tags loading as authored, a pre-28 save
migrating to the correct 0/empty defaults for scrap/gems/resistGems, and
(this pass) the scrap icon pool resolving deterministically per event
while still covering all 5 icons across repeated calls.
`npx tsc --noEmit` and `vite build` both pass clean.

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

**Update -- real art landed.** `public/harvest-icons/` now has real
16x16 pixel art for all 12 pool entries across the 4 materials. Two
filename lists needed correcting to match what was actually delivered,
rather than the placeholder names this section was scaffolded with
before any art existed: Herbs went from a 2-icon `['herb1.png',
'herb2.png']` placeholder to the real 3-icon `['Herb1.png', 'Herb2.png',
'Herb3.png']` (note the case change too -- lowercase was a guess, the
real files are capitalized); Food's placeholder `['Food1.png', ...,
'Food4.png']` (4 entries, guessed ahead of the fish->food generalization
landing) is replaced by the real `['Fish1.png', 'Fish2.png',
'fish3.png']` (3 entries -- the icon filenames were never required to
match the material's display name, same as ore/timber/herbs' own icons
only coincidentally spell out their material). `fish3.png`'s lowercase
`f` is kept exactly as delivered rather than normalized to match its two
siblings -- the array entry has to match the real filename on disk
byte-for-byte on a case-sensitive deploy target, even though a typical
Windows dev machine won't notice a mismatch locally. Ore and Timber's
filenames already matched what was scaffolded, no changes needed there.

Also doubled the falling icons' on-screen size per direct request, which
surfaced a real layout gap while doing it: `.harvest-item` never had an
explicit `width`/`height` at all -- `HarvestGlyph`'s `<img>` sizes itself
to 100%/100% of its parent, which only ever "worked" because no icon had
ever actually loaded before now (the folder didn't exist, so every spawn
was showing its glyph fallback, sized purely by `font-size`, never the
image path). Added an explicit `72px` box (doubled from the glyph's own
implicit ~36px footprint) so the real `<img>` has something concrete to
fill. That same change also exposed a second pre-existing quirk: `left:
X%` (from `spawnPositionPercent`) was always the button's *left edge*,
not its center -- a small, easy-to-miss offset at the old shrink-to-fit
size, much more noticeable at 72px. Fixed alongside the sizing change
with `transform: translateX(-50%)`, which also had to be folded into
every step of both `harvest-fall` and `harvest-pulse`'s keyframes (a
running CSS animation's `transform` *replaces* the element's base
transform rather than composing with it, so leaving the base transform
on its own would only have centered the icon for the instant before
either animation class attaches).

`npx tsc --noEmit` and `vite build` both pass clean.

### Burst/medium reward review + daily first-burst bonus -- complete
Started from a direct player report: some short quests were paying
"1 gold and 1 xp," which is worthless for the time spent. Reviewed via
direct simulation against the real game formulas (not sampling and
eyeballing) rather than assumed -- full methodology and data in this
conversation's own history, summarized here.

**Root cause, confirmed.** Burst/medium's live per-hour cap
(`fastQuestCapsPerHour`, ~82.5% of whatever the player's best-unlocked
tier pays) is sound in principle, but at a very short duration (minutes,
not hours), a real per-hour rate multiplied out and rounded produces a
tiny number -- and the `Math.max(1, ...)` safety floor that stops it from
showing literally "0" then dominates the result. At level 5 (the moment
the cap switches on), Easy-tier burst's minimum reward fell from 6g/8xp
to 1g/0xp -- a hard cliff, not a gradual scale-down, and it stayed there
through the whole rest of the game (checked to level 55). XP had no floor
at all and could show a bare 0. Medium mode showed the same cliff shape
(20-45g/48-76xp down to 3-5g/3-7xp at the same transition), though at a
less visually dramatic scale.

**A second, more serious problem found along the way, in the ALREADY-
SHIPPED cap, not anything proposed as a fix.** Swept the worst-case
effective gold/hour across burst's *entire* duration range (not just
sampled points) and compared against the true, unreduced rate of the
player's actual best-unlocked tier. Found the current cap's `Math.max(1,
...)` floor lets the shortest end of burst's range imply a **higher**
effective rate than real tier content -- 40 gold/hr from "1 gold ÷ 90
seconds," against a real tier rate of 9-28 gold/hr depending on level.
This isn't a rare edge case: at level 13, **50% of burst's entire
duration range** produces a capped reward that, per hour, out-earns
actually doing Hard-tier content. This is the same class of problem that
motivated building the cap system in the first place (the old flat taper
being "the mathematically dominant strategy... to level 25-30") --
smaller in absolute stakes, but a real, previously-unverified gap in the
current live formula.

**Why a naive floor doesn't work, proven before building anything.**
First candidate (a floor set to a fraction of the offer's own *uncapped*
reward, e.g. 20-30%) was rejected by simulation before implementation --
it made the dominance problem measurably worse (worst-case rate rose to
60-80 gold/hr). A second candidate (anchor the floor to the offer's own
tier's real, unreduced rate -- provably safe, since every tier's own rate
is by construction no higher than any harder tier's) was implemented, and
directly confirmed a hard mathematical ceiling: **any per-hour rate,
applied to a duration measured in minutes, rounds down to a value too
small to move the needle.** Even the tier's full 100% rate (~8 g/hr for
Easy), applied across burst's entire 2-8 minute window, never once
produced more than 1-2 gold at the levels tested -- confirmed directly
against the shipped code, not assumed from the formula. Making this
airtight at every level would require raising burst's minimum duration to
roughly 6.5 minutes, which doesn't fix burst, it deletes "fast" as a
category.

**What actually shipped, as a result -- three complementary pieces, not
one:**

1. **Burst's minimum duration raised from 90 seconds to 2 minutes**
   (`quests.ts`). Doesn't close the gap, meaningfully shrinks it: worst-
   case rate down from a flat 40 gold/hr at every level to ~30 gold/hr,
   and the frequency of hitting the exact "1 gold" floor drops from 100%
   at level 5 to ~14-15% by level 30+ (the cap's own absolute value grows
   as higher tiers unlock, so this improves with level even though the
   floor mechanism itself doesn't change).
2. **A tier-rate-anchored floor** (`balance.ts`'s new
   `fastQuestFloorPerHour`, wired into `QuestManager.generateOffer`
   alongside the existing cap). Provably safe (anchored to the offer's own
   tier, never the player's current best tier, so it can never let a
   fast-mode offer out-earn real content) but modest in absolute effect
   for burst specifically, for the mathematical reason above. Its real,
   unambiguous win: **XP can no longer show 0** -- confirmed at 0/1300+
   samples across every tested level, versus ~45-50% of rolls landing at
   0 XP before this patch. Gold's typical value also improved measurably
   at higher levels (level 30+: ~14% of rolls land at exactly 1 gold,
   versus persisting throughout at low-mid levels) even though the
   absolute worst case doesn't move much.
3. **A once-per-day guaranteed minimum, per hero** (`Hero.
   lastBurstBonusDay`, new) -- the actual effective lever for "make it
   feel meaningful," precisely because a once-daily event isn't
   constrained by the per-hour-rate safety math at all: repeating it
   doesn't get you more of it, so it can be flatly generous without
   reopening any dominance question. The first burst-mode quest a hero
   *resolves* each calendar day is guaranteed at least
   `quest.dailyBurstBonusGold`/`quest.dailyBurstBonusXp` (8/8 by default),
   regardless of success/failure or how badly the cap crushed the
   underlying roll. Applied at resolution time (not generation/offer
   time), so it can't be seen and chased in advance -- it's a pleasant
   surprise on whichever burst the player happens to send first that day,
   not a specific offer to hunt for. `QuestResultModal.tsx` shows a small
   "✨ First burst of the day" callout when it fires.

   **A real bug caught and fixed before it shipped, by testing the
   mechanic end-to-end rather than trusting the design on paper:** the
   first implementation used a ×3 multiplier instead of a guaranteed
   minimum. A failed quest's payout can legitimately be 0 gold after the
   15% failure-payout reduction -- and multiplying 0 by anything is still
   0, so a failed first burst wasted the entire daily bonus on nothing,
   defeating the actual purpose. Fixed by switching to a flat
   `Math.max(gold, guaranteedMinimum)` floor instead, which doesn't care
   what the underlying roll or outcome was. Verified directly: a forced-
   failure first burst now correctly pays the guaranteed 8/8 rather than
   0/0; a second burst the same day correctly does NOT get boosted; a
   burst on the following day correctly gets boosted again.

**Explicitly not fully closed, and won't be without deleting "burst" as a
concept.** The absolute worst-case scenario (a player who specifically
hunts for and only accepts the shortest-looking burst offers, repeatedly,
every single day) can still theoretically out-earn real tier content by a
modest margin (~30 vs ~9-28 gold/hr, narrowing at higher levels) --
smaller and shallower than the original bug this cap system exists to
prevent, but not literally zero. Recorded here rather than re-litigated
if it comes up again: this is a confirmed, accepted, bounded tradeoff,
not an oversight -- the alternative (~6.5 minute minimum burst duration)
was rejected as disproportionate to the actual risk.

Medium mode needed none of this -- confirmed by the same sweep that it
never exceeds real tier rates at any level, 0% of its duration range,
under the old formula already. Left untouched apart from picking up the
same tier-anchored floor as burst (harmless there, since medium's cap-
derived values were already above what the floor would produce).

`npx tsc --noEmit` and `vite build` both pass clean.

### Weapon Enchanting / Armour Infusion split -- complete
Restructured the elemental infusion UI per direct request, on top of the
mechanic itself (unchanged): the old single "Infuse" station (Blacksmith,
handled both weapons and armor) is gone, split into two, both now living
at the **Enchanter**:

- **Weapon Enchanting** (`WeaponEnchantStation.tsx`, replaces
  `InfuseStation.tsx`) -- weapons only. Same single-slot `infuse.jpg`
  layout as before, item picker now filtered to the weapon slot.
- **Armour Infusion** (`ArmourInfusionStation.tsx`, new file) -- armor
  only, replaces what used to be a plain "Gems" recipe-crafting screen
  with no item selection at all. Real two-slot art this time
  (`armor-infusion.jpg`, gear top / gem bottom) -- both slot rects
  hand-measured the same programmatic way as every other station's real
  art (largest dark region near each cutout, cross-checked visually
  before use).

**The bigger change is underneath, not just the relabeling.** Both
stations used to require a separate trip to a "Gems" crafting screen
first (craft a gem, spend scrap+gold, then separately visit Infuse to
apply it) -- collapsed into one action per the "function like crafting"
request: pick gear, pick an element, Infuse. `CraftingManager.
craftAndInfuse` (new) uses an already-owned gem if one exists in
inventory (`state.gems`/`resistGems`, whichever pool the item's own slot
points at), otherwise crafts one fresh via the same underlying recipe
first, then applies it -- both in the same click, same atomic state
update. `CraftingManager.gemCost` (new) previews this per element so
each option in the UI reads "Ready" (already own one, free) or the live
scrap+gold cost (will craft fresh). The standalone "Gems" crafting screen
is gone from the UI entirely -- `CraftingStation.tsx`'s `'gem'` category
code path still exists underneath (used internally by `craftGem`/
`craftAndInfuse`) but nothing renders `<CraftingStation category="gem">`
as a standalone screen anymore; left in place rather than ripped out
since it's harmless dead UI code, not a functional risk.

Verified at runtime: fresh-craft path charges the correct scrap+gold and
fully consumes the crafted gem (0 leftover); re-infusing a weapon with a
different element correctly replaces rather than stacks; a pre-owned gem
is correctly detected and used for free (0 gold/scrap spent); armor
resist correctly stacks across two infusions of the same element (exact
2x); and an insufficient-funds attempt is correctly blocked with the
right error.

**DevTool: the icon-picker request needed no new code.** `picker: 'icon'`
already works generically for any schema field, and `crafting-recipes`
already had it on `icon` -- it just couldn't reach `gem`-category
recipes because the category enum didn't include `'gem'` at all (added
now, alongside `scrapCost` and a new `resultGem` field type covering
which counter a gem recipe adds to and which element). A real bug caught
and fixed before it shipped: `resultGem`'s first pass had no way to read
as "not set" (a `<select>` always has *some* value, unlike a blank text
input) -- since every schema field renders and gets collected on save
regardless of the entry's own category, saving any ordinary gear/
consumable/enchant recipe would have silently attached a stray
`resultGem: {kind:'elemental', element:'fire'}` default to it. Fixed
with the same enabled-checkbox toggle `eggReward` (chain rewards) already
established for exactly this problem, defaulting unchecked/omitted for
anything that didn't already have a value. Verified directly against the
running DevTool server (not just read through): the schema endpoint
reflects all three additions, an existing gem recipe's `resultGem`
round-trips correctly through the data endpoint, a valid new gem recipe
saves successfully, and an invalid element value is correctly rejected
with a clear per-field error message -- test data cleaned up afterward,
not left in the real content file.

`npx tsc --noEmit` and `vite build` both pass clean; DevTool JS/CSS
verified via `node --check` (syntax) and live requests against the
running server (behavior), since there's no compiler for that side to
catch mistakes automatically.

**Follow-up bugfix, same patch series: `PickerModal` truncation.**
Reported directly from screenshots -- Armour Infusion's "Choose a
resistance gem" list showed each option collapsed to almost nothing
("Fire" as "F…", "Lightning" as "L…"), while every other picker on the
same screen (including Armour Infusion's own "Choose armor" list, right
next to it) rendered fine. Root cause: `.craft-picker-row` is a 3-column
CSS grid (`40px 1fr auto` -- icon / text / checkmark). `PickerOption.icon`
is optional, and when a caller omits it, React renders nothing at all for
that slot -- no placeholder, no empty node. CSS Grid then auto-places the
remaining children starting from column 1, shoving the text span into the
40px icon column instead of the intended 1fr text column. The gem picker
was the only caller that omitted an icon (it had embedded the element
glyph directly in the label string instead, e.g. `"🔥 Fire Resistance
Gem"`), which is exactly why it alone showed the bug.

Fixed in two parts: `PickerModal` (`CraftingStation.tsx`) now always
renders a stable placeholder in the icon slot (`opt.icon ?? <span
aria-hidden="true" />`) so the grid can never collapse regardless of what
a future caller passes, and the gem picker's options were also cleaned up
to use a real `icon` field (the element glyph, properly sized) instead of
embedding it in the label text. Every other existing `PickerModal` caller
was checked and already supplies a real icon (`EggSelectModal`,
`EnhanceStation`, `ScrapStation`, `WeaponEnchantStation`'s own item
picker) -- this was specifically an Armour Infusion gem-picker gap, not a
systemic one, though the `PickerModal` fix itself protects every current
and future caller regardless.

Verified visually, not just reasoned through: built a minimal HTML repro
of the exact CSS rules and rendered it with the actual Chromium binary
available in this environment (the same engine Electron ships) -- the
"before" version reproduced the reported bug almost exactly
(`"🔥 Fi…"`/`"⚡ Li…"`, matching the real screenshots' `"F…"`/`"L…"`
pattern), and the "after" version confirmed both the placeholder fix and
the real-icon cleanup render correctly. (A first attempt at this repro
used `wkhtmltoimage`, which is available in this environment but uses an
old WebKitGTK engine with unreliable CSS Grid support -- it failed to
reproduce the bug at all, which would have been a false negative if
trusted; re-ran with real Chrome instead once that mismatch was caught.)

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
- ~~Pets~~ -- built. See "Pets / Hatchery -- built" below for the full writeup.
- Freeze slot for the quest board (never got a firm yes/no).
- ~~Quest chains in the DevTool, editable like raids are.~~ -- done. See
  "Quest chains in the DevTool -- built" below for the full writeup.
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

### Pets / Hatchery -- built
The full spec below shipped essentially as designed, with a few decisions
made concrete along the way (each noted where it resolves an open question
from the spec pass).

**Acquisition**
- One-time, non-repeatable intro chain `the_last_clutch` (reqLevel 5, no
  `requiresChainId`) grants the Hatchery tab and one starter egg on
  completion via new `ChainDef.grantsHatchery` -- handled in
  `QuestManager.resolve`'s existing chain-completion block, right next to
  the ordinary rewardGold/rewardItems grant. The starter egg is a
  dedicated-pool egg guaranteed to hatch into `hatchery_hound` (Common
  rarity), giving the dedicated-pool mechanism (see below) a concrete,
  flavourful payoff rather than shipping unused.
- Ordinary eggs are meant to drop from quest/raid loot the same way
  equipment does -- the drop-table wiring itself (a chance entry on
  `QuestOffer`/`RaidEncounterDef` pointing at `PetManager.grantEgg`) is
  the one acquisition piece **not yet connected**; every mechanism it
  needs (rarity, dedicated-pool flagging, slot-capacity check) is built
  and ready, see Known gaps below.
- Hatchery tab visibility is a runtime filter in `MenuWindow.tsx`
  (`state.hatcheryUnlocked`), not a build-time list -- the one nav tab
  with a visibility condition at all, everything else always shows.
  Unlock triggers a one-step reuse of `OnboardingTour` itself (new
  `pendingHatcherySpotlight` flag, same "standalone moment, not a toast"
  treatment `pendingChainDiscovery` already gets) rather than a polled
  `GuidanceManager` topic -- the trigger is deterministic (this exact
  chain completing), so there was nothing to poll for.

**Eggs & hatching**
- Eggs carry `Rarity` (reuses the existing equipment tiers) via
  `EggInstance`. Hatch progress (`hatchXp`) is driven by hero XP earned
  anywhere in the guild, added to every incubating egg at once from
  `QuestManager.resolve` (same call site as `HeroManager.grantXp`) --
  **resolves the "account-wide vs per-hero" open question as
  account-wide**, confirmed simplest and avoids needing an egg-carry slot
  pre-hatch.
- Incubation is slot-limited (`pets.baseIncubationSlots` = 2, tuning-set),
  expandable via the new **Nest Expansion** upgrade
  (`incubationSlotsPerLevel`, 3 levels -> 5 total) -- same
  `UpgradeDef`-special-field shape Potion Belt already established.
  `ModifierManager.incubationSlots` reads it the same way
  `consumableSlots` does.
- On hatch (`PetManager.hatch`), species rolls from `GENERAL_PET_POOL`
  (every `PetDef` not flagged `dedicatedOnly`) unless the egg carries a
  `dedicatedPetId`, in which case that exact species is guaranteed --
  mirrors the loot system's own two-pool split.
- A egg beyond capacity is simply not granted (`PetManager.grantEgg`
  returns false, no queue) -- same trade-off `HarvestManager.catch`
  already accepts for an overflowing Warehouse, not treated as a bug.

**Pets**
- `Pet` instances are nameable (24-char cap, same as guild naming),
  carry the hatching egg's `rarity` as a cosmetic tag only -- confirmed
  not power-relevant, per the "cosmetic-only for now" decision. The rare-
  variant-with-its-own-bonus idea stays parked, unbuilt.
- `PetBonusType` is a 4-key subset of `Modifiers` (`success` / `gold` /
  `xp` / `loot`) rather than the full set -- `loot` stands in for what the
  design pass called "luck," since rare-find chance is the closest
  existing lever to that idea.
- `baseBonusValue` rolls once at hatch (`pets.baseBonusValueMin/Max`,
  tuning-set). Post-hatch pet xp grows a flat level via
  `PetManager.levelForXp` (a simple `xp / pets.xpPerLevel`, deliberately
  NOT the hero's exponential curve -- pet leveling is meant to read as
  slow background progress, not something to optimize), adding
  `pets.bonusGrowthPerLevel` per level on top of the base roll --
  **resolves "what does post-hatch xp do" exactly as decided: grows
  bonus magnitude, no cosmetic leveling yet.**
- Only currently-**equipped** pets gain xp at all
  (`PetManager.grantEquippedXp`, `pets.xpShareOfQuestXpPercent` of each
  quest's raw xp reward, split evenly across every equipped pet) -- this
  is the actual mechanical reason to equip one rather than leaving every
  hatched pet in a drawer, not spelled out explicitly in the original spec
  but a natural extension of "equipped pets feed the bonus."

**Equip & adventuring**
- 1 equipped pet slot base, expandable via new **Companion Bond** upgrade
  (`petSlotsPerLevel`, 2 levels -> 3 total) -- same shape as Potion Belt,
  read via new `ModifierManager.petSlots`.
- Equipped pets' combined bonus feeds into `ModifierManager.global()` via
  new `petMods` (built directly from each equipped pet's own rolled
  `bonusType`/effective value, not a flat `modsPerLevel` table the way
  every other mod source works, since each pet rolled its own type at
  hatch).
- **Not yet built:** the equipped pet's sprite trailing the hero sprite on
  the desktop companion / hero-sprite renders. `Pet.defId` and
  `spriteFolder` exist and are ready to be read from there; the actual
  companion-window rendering hook is the one adventuring-facing piece
  still open. Tracked in Known gaps below.

**Happiness & feeding**
- Happiness is stored lazily -- `Pet.happiness` is the value AS OF
  `happinessUpdatedAt`, decayed on read via `PetManager.currentHappiness`
  rather than ticked every second. Same "absolute timestamp, compute on
  read" approach `Injury.healsAt` already uses, and correct across
  offline gaps for free with no dedicated tick loop needed (resolves the
  spec's "needs a tick, like Harvest's spawn timer" note -- turned out not
  to need one at all).
- `effectiveBonus` scales the grown bonus by `max(happinessFloorPercent,
  happiness) / 100` -- confirmed a starved pet keeps contributing at least
  `pets.happinessFloorPercent` (25% by default) rather than hard-zeroing,
  per the spec's explicit floor-not-cutoff requirement.
- Two feed paths, both live: `feedMaterial` (5 units of a chosen raw
  Harvest material for `pets.feedMaterialHappinessGain`) and `feedCrafted`
  (1 new **Pet Treat** consumable, craftable via a new
  `craft_pet_treat` recipe -- fish+herbs+gold, same shape Trail Rations
  already uses -- for `pets.feedCraftedHappinessGain`, a bigger gain) --
  matches the "feed raw material or craft pet food for more happiness"
  decision exactly.

**Content & DevTool**
- Pet species live in `json/pets.json` (devtool-editable, new `pets`
  schema in `server.mjs` -- id/name/description/glyph/spriteFolder/
  dedicatedOnly, deliberately NOT including rarity/bonus/name-per-instance
  since those are rolled, not authored). The devtool's schema system is
  fully generic/JSON-driven, so this needed zero frontend changes.
- New tuning registry category `pets` (17 entries) covers every numeric
  knob mentioned in the spec: hatch-xp thresholds per rarity, base
  incubation slots, bonus roll range, xp-per-level, bonus growth per
  level, xp-share percent, happiness decay rate, happiness floor, and
  both feed gains -- all devtool-editable from day one, same as Harvest's
  own tuning batch.
- Egg/pet sprites follow the "missing file just fails to paint" rule via
  a new `PetGlyph` component (same pattern `HarvestGlyph` established) --
  reads `public/pets/<spriteFolder>/idle.png`, falls back to `PetDef.glyph`
  on a 404. No real sprite files exist yet; every pet currently renders as
  its glyph. `public/lore/hatchery-bg.jpg` is the Hatchery tab's own
  background art path -- also not present yet, same convention either way.
- `SAVE_VERSION` bumped 22 -> 23; migration backfills
  `hatcheryUnlocked`/`pendingHatcherySpotlight`/`incubatingEggs`/`pets`/
  `equippedPetIds` for any pre-existing save. `QuestResult.hatchedPets` is
  optional rather than migrated, since old log entries predate it entirely
  and every read already treats a missing value as "nothing hatched."
  Bumped again 23 -> 24 for the eggStorage/equip-slot change below --
  existing mid-incubation eggs are left exactly where they are, they just
  now also have an (initially empty) storage pool alongside them.

**Known gaps, deliberately not blocking this patch:**
- ~~Quest/raid egg-drop wiring~~ -- done, alongside a real design change to
  how eggs work. **Eggs no longer auto-incubate on grant.** `PetManager.
  grantEgg` now always adds to a new `state.eggStorage` pool (unbounded,
  same shape as `state.stash`) instead of dropping straight into a Nest --
  Nests are now explicitly the Hatchery's own equip slots, exactly the
  same relationship `state.stash` has to a hero's worn gear. New
  `PetManager.equipEgg`/`unequipEgg` move an `EggInstance` between the two
  (unequipping keeps `hatchXp` earned so far, doesn't reset it). This
  changed on purpose, not as a side effect of drop wiring: with real drops
  now landing far more often than the one-off intro-chain grant, silently
  losing an egg to a full Hatchery (the old behaviour) stopped being an
  edge case and started being a real cost.
  - Ordinary quests roll an egg drop independently of equipment loot, on
    success only -- flat % per difficulty tier (`pets.questEggDropChance.
    *`, 5 new tuning entries), rarity fixed per tier rather than randomised
    (Easy grants Uncommon, Legendary grants Legendary -- see the tuning
    descriptions for why Easy doesn't grant Common).
  - Raid encounters get a new devtool-editable `eggLoot` field on
    `RaidEncounterDef` -- same reused "string-list, token@chance" shape
    `loot`/`lootHeroic`/`lootMythic` already use, just a `"<rarity>[:
    <dedicatedPetId>]@chance"` token instead of a defId, parsed by new
    `parseEggLootEntry` in `raids.ts`. No `lootTable`-style browsable
    picker (that picker specifically queries the equipment defId pool,
    which eggs aren't part of) -- plain text-list editing, same as `loot`
    itself before that picker existed. This is the actual "assign eggs as
    loot, like gear" devtool support the original spec asked for.
  - `QuestResult.eggDropped`/`RaidResult.eggsFound` (both optional, not
    backfilled by migration -- old log entries predate them, every read
    already treats a missing value as "nothing found") surface an ordinary
    drop for a toast in `engine.ts`.
- **Egg selection UI -- built, using the new modal background art.**
  `EggSelectModal.tsx` reuses `CraftingStation.tsx`'s `SlotBox`/
  `PickerModal`/`Rect` machinery directly rather than duplicating it --
  same pattern `EnhanceStation.tsx` already established for reusing that
  file's exports. One hand-measured slot rect (`public/lore/
  hatchery-select-bg.jpg`'s own painted window, 42.6%/37.3%/14.1%/19.2% of
  its 1448x1086 canvas) opens a `PickerModal` listing `state.eggStorage`.
  The Nests tab itself now renders a fixed-count grid (one card per
  `ModifierManager.incubationSlots(state)`, not just a mapped list of
  whatever's currently incubating) -- an empty Nest is its own dashed-
  border clickable card that opens the same modal, a filled one shows
  progress + an Unequip button. New `EggIcon.tsx` is the static (non-
  animated) per-rarity icon for storage/selection display specifically --
  deliberately NOT the `PetSprite` manifest/animation pipeline, since only
  the one egg actually mid-hatch should ever animate, not every egg
  sitting in storage. Reads `public/pets/egg/<rarity>/icon.png`, same
  glyph-fallback convention as everywhere else -- no real icon art yet.
- **Hatching is now explicit and player-triggered, not automatic.**
  Caught almost immediately after the egg-drop-wiring patch landed:
  hatching used to happen the instant an egg's `hatchXp` crossed its
  threshold, inside the same call that adds xp -- so a busy player would
  see an egg vanish from its Nest straight into the Pets tab with nothing
  more than an easy-to-miss toast, no real moment to it. Reworked:
  - `PetManager.addHatchXp` no longer calls `hatch()` at all. Crossing the
    threshold just makes an egg eligible (`PetManager.isReady`, a pure
    `hatchXp >= hatchXpThreshold(rarity)` check, nothing stored) -- it
    stays in its Nest, incubating in place, until the player opens it.
  - A ready `EggCard` swaps its progress bar for bold green "Ready to
    Hatch!" text and a soft moss glow, and becomes clickable. Clicking
    calls new `engine.hatchEgg`, which does the actual hatch
    (`PetManager.hatchReadyEgg` -- rolls species/bonus, creates the `Pet`,
    removes the egg) and stores the result in a new transient
    `engine.lastHatchedPet` (same read-then-cleared shape as
    `lastResult`/`lastRaidResult`).
  - New `HatchRevealModal.tsx` reads `lastHatchedPet` directly (renders
    nothing if null, same convention `QuestResultModal` uses for
    `lastResult`) -- "It Hatched! / The egg hatched into 'xx'" with the
    pet's live `PetSprite`, Close, and a "Go to Pets" button. That button
    needed a genuine sub-tab deep link, not just "open the Hatchery tab" --
    new `engine.requestHatcherySubTab`/`consumeRequestedHatcherySubTab`,
    one level deeper than the existing `requestTab` (which only knows
    about MenuWindow's top-level tabs, not a panel's own internal
    `useState`). Hatchery-specific for now rather than a generic
    sub-tab system, until a second panel actually needs one.
  - The "you have something to check on" half is its own new
    `state.pendingHatchReadyNotice` flag, set the moment any egg *first*
    crosses its threshold (`QuestManager.resolve`, alongside the
    `addHatchXp` call) -- persisted, not transient, so it survives a
    reload unacknowledged. Surfaced via new `HatchReadyModal.tsx`
    ("An Egg is Ready! ... Go to Hatchery") using the exact same
    active-gated-modal-plus-idle-banner treatment
    `ChainCompleteModal`/`RaidResultModal` already established, since a
    quest resolving mid-away just as easily lands while the player's
    looking at the idle companion as the full menu. Deliberately doesn't
    say which egg or how many -- the Nests tab marks each ready card on
    its own once they actually get there.
  - `QuestResult.hatchedPets` and its toast are gone entirely (removed,
    not deprecated) -- nothing hatches automatically anymore, so a field
    describing what "just hatched" during a quest resolution stopped
    describing anything real.
  - `SAVE_VERSION` bumped 24 -> 25 for `pendingHatchReadyNotice`.
- ~~Companion sprite on the desktop window~~ -- done. `IdleView` renders
  the first equipped pet beside the hero via the same `PetSprite`
  component the Hatchery uses, requesting the generic `idle`/`movement`
  verbs (now resolved symmetrically regardless of species vocabulary --
  see `PetSprite.tsx`'s `resolveAnimation`) plus a brief `damage` flash on
  a failed quest return, mirroring the existing floating-reward-text
  tracking pattern. Deliberately does NOT track the hero's own
  depart/arrive translateX keyframes -- the pet stays in place through a
  departure rather than walking off-screen in sync, a scope cut rather
  than an oversight, still animating its own loop the whole time so it
  doesn't read as frozen.
- **Two real bugs found in the wild, both fixed.** Reported as "the hound
  never shows its real sprite" after its art was added and pushed --
  turned out to be two separate things stacked on top of each other:
  1. `PetSprite.tsx`'s manifest fetch cached itself in a module-level
     variable for the rest of the running session, with no way to ever
     refresh -- fetched once, kept forever, including a genuinely empty
     `{}` result on a failed/404 fetch, which the cache check treated as
     "already loaded" just as readily as a real one (an empty object is
     still truthy). A pet equipped/viewed before its art existed (or a
     session that started before `manifest.json` did) would poison the
     cache for that entire session, and even a real update afterward
     never got picked up. Fixed on both ends: the fetch itself now uses
     `cache: 'no-store'` (rules out an ordinary HTTP-level staleness
     layer too, not just the in-memory one), a genuinely empty result is
     never cached, and `useManifest` now takes the specific species being
     rendered and triggers a background re-fetch if THAT species isn't in
     an already-cached manifest -- self-healing the moment new art
     actually lands, no app restart required.
  2. Separately, `IdleView`'s own `<PetSprite>` call for the desktop
     companion never passed a `fallback` prop at all -- so instead of at
     least showing the species' glyph the way every other `PetSprite`
     caller does, a pet with no art yet (or hitting bug #1 above) rendered
     as a literal empty box, not even an emoji. Fixed by passing the same
     `PetDef.glyph` fallback every other caller already uses.
- **New: pet can be dragged to a custom spot, scaled independently of the
  hero, both persisted.** Same lock/unlock state the companion window
  already uses to become draggable at all -- not a separate toggle, per
  how this was actually asked for. Reusing that state meant the pet
  needed its OWN drag handling rather than opting into the window's
  existing OS-level `-webkit-app-region: drag`, which would otherwise
  move the whole companion instead of just the pet: real mousedown/
  mousemove/mouseup tracking on `.pet-companion-button`
  (`handlePetMouseDown` etc., `IdleView.tsx`), with a 3px-of-movement
  threshold before it counts as a drag rather than a click, and a
  `petJustDraggedRef` flag consumed in the click handler so a completed
  drag doesn't also fire "open guild" the moment the mouse releases (the
  same click-vs-drag problem `.knight-button`'s own comment already
  documents solving for the window-level case, solved the same way here
  since this needed its own answer). The offset itself
  (`settings.petOffsetX/Y`, persisted like every other display setting,
  not game state) is applied via CSS custom properties
  (`--pet-drag-x/-y`) added on top of the existing default-position
  `calc()` rather than a `transform`, since the `bob` keyframe animation
  already animates `transform` and a second source fighting it every
  frame would have caused visible jitter -- confirmed via the same
  rendered-mockup approach as the positioning fixes above, simulating a
  dragged offset and checking it composes correctly with the grounded
  default position, not just reasoned through. New "Reset pet position"
  button in Settings for undoing a bad drag. Also added a dedicated "Pet
  size" slider (`settings.petSpriteScale`), independent of the hero's own
  `spriteScale` -- a pet and hero don't need to grow together, and
  neither `Settings` field needed a version bump to add since the
  existing load path already spreads new fields over `DEFAULT_SETTINGS`
  automatically.
- **Click the desktop companion pet to view it enlarged -- moved after a
  real conflict was reported.** `PetEnlargedModal.tsx` (a big 160px
  `PetSprite` with Idle/Movement/Sleep buttons, falling back the same way
  `PetSprite` always does for a species missing one of those) originally
  opened from clicking the companion pet itself. Reported directly: since
  the pet sits deliberately overlapping the hero (see the positioning
  writeup below), that made the hero underneath hard to click at all --
  the pet's button, on top, ate the click every time. Companion pet click
  now does exactly what the hero's own click already does (`onOpenMenu`,
  same handler, same behaviour) instead of opening the enlarge modal.
  The modal itself wasn't deleted, just re-homed to a click target that
  doesn't conflict with anything: the Hatchery's own Pets tab, where each
  `PetCard`'s sprite is now the clickable target (previously inert)
  instead of the desktop companion.
- **Second batch: layout bugs, a real pre-existing CSS variable typo, egg
  drops tuned down, and a guaranteed egg-reward mechanism for chains.**
  - **Pet cards were overflowing their own borders.** Header restructured
    -- the rarity pill moved off the crowded name+Rename row and down to
    pair with the species/level line instead, where there's more room; the
    name itself now truncates with an ellipsis rather than forcing width;
    `min-width: 0` added throughout (the classic missing piece that lets
    a flex/grid child actually shrink instead of overflowing). New
    `.pet-grid` (260px min column) scoped to just the Pets tab rather than
    widening the shared `.grid.two` class, which 11 other panels also use.
  - **The feed dropdown was white-on-white -- root cause was a real,
    pre-existing bug, not new.** `var(--panel2)`/`var(--panel3)`/
    `var(--text)` don't exist as CSS variables (the real names are
    `--panel-2`/`--panel-3`/`--parchment`) -- silently falling back to
    nothing, which happened to leave the closed dropdown box readable by
    accident while the open `<option>` list rendered with the browser's
    native (white) popup styling. Found the same exact typo already
    sitting in `DashboardPanel.tsx` and `GuildNamingModal.tsx` too, not
    just the Hatchery -- fixed all three. Also added a global `select`/
    `select option` CSS rule as a safety net so the same typo can't
    silently reintroduce this for a future dropdown.
  - **Ordinary quest egg-drop chances lowered.** Was 1-3% flat per
    difficulty tier; now 0.15-0.5% -- a genuine rare find, not a routine
    drop, per how this was actually asked for ("very very low").
  - **New: a guaranteed egg reward for quest chains, the actual egg
    equivalent of `rewardItems`.** New `ChainDef.rewardEgg?: { rarity,
    dedicatedPetId? }`, granted in `QuestManager`'s chain-completion block
    exactly alongside the existing `rewardItems` loop -- same "always
    granted on completion, not a chance roll" contract. `the_last_clutch`
    refactored to use this generic field instead of a chain-specific
    hardcoded grant call it used to have inline -- `grantsHatchery` is now
    ONLY about the tab's own unlock+spotlight, decoupled from the egg
    grant itself, so a future chain can carry its own `rewardEgg` without
    needing anything hatchery-unlock-specific. Also surfaced in the
    Quest tab's existing "Guaranteed on completion" preview
    (`chainCompletionPreview`), alongside gold/renown/items.
  - **DevTool note (now resolved by a later pass the same session):**
    at the time this landed, `rewardEgg` lived on `ChainDef` and quest
    chains weren't DevTool-editable at all yet. That's since been fixed
    -- see "Quest chains in the DevTool -- built" below, which covers
    `rewardEgg` along with everything else on a chain.
- **A batch of real reported issues + the egg art, all fixed/landed
  together.**
  - **Egg icons -- the actual blocker is resolved.** The uploaded
    `Eggs_32x32.png`/`.aseprite` turned out to be the real thing this
    time: genuine alpha transparency, not another promo composite. On
    inspection it's a 10-column x 16-row grid of egg DESIGNS x COLOURS
    (each row one solid colour in 10 surface-pattern variants, plus a
    "shell cracked open" pose in the last column), not an animation strip
    -- confirmed before writing any import logic, not assumed. New
    `tools/import_eggs.py` crops exactly 5 static icons (one column,
    reused across 5 rows) straight to `public/pets/egg/<rarity>/icon.png`
    -- no recolouring needed, unlike the pet species tool, since this
    sheet already ships each rarity as a genuinely different colour.
    Row-per-rarity and the one column used were both picked by matching,
    not eyeballed: row colours were averaged and compared against the
    game's actual `RARITY_COLOR` hex values (`src/game/util.ts`) for the
    closest fit per tier, and column 7 (a smooth single-tone gradient,
    no speckle/spot/stripe) was picked as the one design that stays
    readable at small icon sizes across every row -- column 9 (the
    cracked-open pose) was deliberately excluded, these depict a whole
    unhatched egg sitting in storage. `EggIcon.tsx` already pointed at
    this exact path convention from when it was first built, so no code
    change was needed there at all -- only the art was missing. The
    animated hatch-card moment from the original spec is still separate,
    unbuilt work; this covers exactly what was asked for, the static
    storage/inventory views.
  - **"Choose an item" picker was visibly overlapping -- root cause
    found, not just patched around.** Every picker list (Enhance's item
    picker, Crafting's recipe pickers) was reusing the same 64px icon
    size built for the big slot display in the main crafting scene --
    correct there, way too large for a compact list row. Confirmed via
    `grep` that none of the 4 call sites feeding a `PickerModal` also fed
    a `SlotBox` (those use their own, separate 88px), so this was safe to
    shrink in isolation: all 4 dropped to 40px, `ItemIcon`'s own already-
    established default. `.craft-picker-row` also switched from flex to
    CSS grid (`40px 1fr auto` -- icon, text, checkmark) for genuinely
    consistent table-like column alignment down the list, plus text
    truncation on long names/sublabels that could previously push the
    checkmark column around. Verified via a rendered mockup, not just
    reasoned through -- clean, no overlap, columns line up.
  - **Testing panel: add eggs/pets directly.** New `engine.testAddEgg`/
    `testAddPet`/`testUnlockHatchery`, all auto-unlocking the Hatchery so
    testing pets doesn't mean playing through `the_last_clutch` first
    every single time. `testAddPet` reuses `PetManager.hatch` with a
    throwaway `EggInstance` rather than duplicating its bonus-roll logic.
    Buttons for all 5 rarities and every current species in
    `TestingPanel.tsx`.
  - **Feed dropdown offered Ore and Timber -- removed.** New
    `FEEDABLE_MATERIALS` in `materials.ts` (Herbs + Food/fish only --
    Ore/Timber are construction resources with no "a pet would eat this"
    reading), plus the dropdown's own default state fixed from `'ore'` to
    `'herbs'` (nothing had actually caught that the default itself was
    one of the two being removed).
  - **Rename was a genuinely hidden interaction -- now a visible
    button.** Clicking the pet's own name to rename it had no affordance
    at all pointing at that being possible. Added an explicit blue
    "Rename" button next to the name; the click-to-edit behaviour on the
    name itself stays as a bonus shortcut, not the only way in anymore.
  - **No hover feedback anywhere on pet cards -- added, using each pet's
    own rarity colour.** New `.pet-card-hover` (border + glow on
    `:hover`, reading `--rarity-color` set inline per-card straight from
    `RARITY_COLOR` -- the exact same hex every `RarityPill` already uses,
    so a card's hover state always matches its own pill with zero drift
    between the two).
  - **Nests now start at 1, not 2.** `pets.baseIncubationSlots` tuning
    default changed 2 -> 1 -- the 2nd nest is meant to be Nest
    Expansion's own first purchase, not something every player starts
    with for free. Nest Expansion's own definition (3 levels,
    `incubationSlotsPerLevel: 1`) is unchanged, so the effective range is
    now 1-4 nests instead of 2-5.
  - **Guild menu tab tooltips.** Every tab across all 5 groups
    (Dashboard/Guild/Adventure/Progression/Meta, 15 tabs including the
    testing-only one) now has a one-line `title` attribute -- a plain
    native browser tooltip, not a custom component, added directly to
    each tab's own definition object rather than a separate lookup table
    that could drift out of sync with the tab list.
- **Companion pet was too small and floating in the wrong spot -- fixed,
  verified against an actual rendered mockup rather than hand-computed
  CSS.** Reported directly: sitting off to the side at the old 40px size
  read as a stray icon, not a companion. Two changes: size roughly
  doubled (40px -> 90px, `IdleView.tsx`), and positioning switched from
  `bottom`-anchoring (relative to the WHOLE `.idle-stage`, which also
  contains the gold/level plate and status text below the hero+shadow --
  this was the actual bug, not just a bad offset: a `bottom` value tuned
  to sit near the hero's feet instead anchored near the bottom of all
  that extra content) to `top`-anchoring, using `.hero-carousel`'s own
  fixed `margin-top: 26px` plus the hero's fixed 120px base height as
  reliable constants. Landed on `top: 56px; left: calc(50% - 30px)`
  (z-index bumped 1 -> 2, so the pet draws in front of the hero, on
  purpose) -- confirmed by rendering an actual standalone mockup of the
  real `.idle-stage` markup and CSS with Playwright/headless Chromium
  (a placeholder hero silhouette in place of the real gitignored art,
  the real `ember_kit` sprite for the pet) and reading back precise
  bounding-box coordinates rather than eyeballing a screenshot: the pet's
  bottom-left corner lands exactly on the hero's bottom-left corner at
  the default `spriteScale`. Any visual offset beyond that exact corner
  match is the fox art's own internal frame padding, not a CSS error.
  Like the original fixed offset this replaced, this is tuned for a
  typical hero width, not the exact width of every class -- hero sprite
  width isn't available to pure CSS the way its height is.
- **Follow-up: the "internal frame padding" caveat above turned out to be
  real and fixable, not just a caveat.** Reported directly: the hound
  specifically still read as hovering above the floor even with the
  corner-accurate positioning above. Measured it rather than guessing
  again -- every single frame of every one of the hound's three
  animations carried exactly 35px of fully-transparent empty canvas below
  the dog, out of a 100px frame (zero variance across all 25 frames
  checked). Fox and Red Panda already sit at 0px padding natively
  (already correct); the Crow varies 9-17px frame-to-frame since a bird's
  legs genuinely move during a wing-flap, which is real motion, not
  padding to remove.
  `tools/import_pets.py` now auto-grounds every species: for each one, it
  measures the bottom padding on every frame of every animation and crops
  the MINIMUM shared amount off the bottom of every frame uniformly
  (`ground_trim_for`) -- using the minimum rather than a per-animation or
  per-frame value on purpose, so a pose that's genuinely higher up
  mid-motion (a pounce, a wingbeat) keeps that travel intact; only the
  padding empty in literally every frame gets removed. Confirmed safe
  against all four current species before shipping: Fox/Red Panda trim to
  0 (no-op, pixel-identical output), Crow trims 9px (48px -> 39px frame
  height, verified visually afterward that no part of the bird itself got
  clipped), Hound trims the full 35px (100px -> 65px). `extra_*` sprites
  (the Crow's crumbs/fish icons) are deliberately excluded from this --
  they're separate small objects, not the creature's own body, and
  measuring their padding against the creature's frames would be
  meaningless. One real side effect worth knowing: since the trim is
  vertical-only, a species that gets trimmed now renders WIDER relative
  to its height than before at the same `height` prop (frameW is
  unchanged, frameH shrank) -- confirmed this doesn't break the
  `left`-edge-anchored positioning above, since anchoring the left edge
  (not centering) means the extra width just extends further right, over
  the hero, which was already the accepted "being over the hero is fine"
  behaviour.
- **Art -- five assets done, egg sprite sheet still blocked.** Ember Kit
  (fox), Rooftail (red panda), Ashwing (crow), and Hatchery Hound (Saint
  Bernard) all have real animated sprites, recoloured across all 5 rarity
  tiers via `tools/import_pets.py` (same lightness-preserving HLS
  palette-swap technique `tools/recolor.py` already established for
  heroes, applied per-`Rarity` instead of per-skin). The Hound's pack
  shipped as three already-cut per-animation strip files rather than one
  row-grid sheet -- `PetSpec` now takes either shape (`sheet_file`+`rows`
  to slice, or `anim_files` for pre-cut strips just needing a recolour
  pass), only `idle`/`movement`/`sleep` for this one (no `idle2`/`catch`/
  `damage` -- fine, `PetSprite.resolveAnimation` already falls back to
  idle for anything a species doesn't have). Found and fixed a real bug
  while adding it: `--only <species>` was writing a wholly fresh
  `manifest.json` instead of merging, so regenerating just the Hound
  silently wiped the other three species' entries -- confirmed by
  actually triggering it, not just reasoned through; fixed by loading and
  merging onto whatever's already on disk. `public/lore/
  hatchery-select-bg.jpg` (the egg-equip modal's background) and
  `hatchery-bg.jpg` (the Hatchery tab's own, see the background-placement
  note below) are both real now too. The egg SPRITE sheet is still
  blocked -- two uploads so far have both turned out to be the asset
  pack's promo/preview composite (opaque flat background baked in, no
  real alpha channel), not the actual redistributable spritesheet.png.
  Needs the real transparent file before the animated hatch-card moment
  from the original spec can be built; the static per-rarity `EggIcon`
  (storage/selection display) is unaffected by this and just needs
  `public/pets/egg/<rarity>/icon.png` whenever that's sourced separately.
- **Hatchery background moved to the tab-level treatment, not an in-panel
  banner.** Was using the same aspect-ratio-locked banner-strip approach
  Harvest's Fields scene uses, sitting inside the panel content -- moved
  instead to the same mechanism the Raids tab already uses to override
  MenuWindow's default `guild-hall-bg.jpg`: one shared full-`menu-root`
  backdrop layer, chosen per-tab, faded to the same 0.35 opacity every
  other tab's backdrop uses. `HatcheryPanel.tsx`'s own `.hatchery-scene`
  div and its CSS rule are both removed -- `hatchery-bg.jpg` itself is
  unchanged, just displayed differently now.
- Bonus roll ranges, hatch-xp thresholds, and feed gains are first-pass
  numbers, not a balance pass -- same "content is a cache, gameplay data
  confirms the intent" spirit as every other system's initial numbers.
- The parked "rare pet variants with their own bonus, plus a universal
  refine/upgrade path" idea from the spec pass is still just an idea --
  untouched by this build.

### Quest chains in the DevTool -- built
Closed out the long-standing backlog item, done in the two pieces its own
description called for.

**Migration.** `QUEST_CHAINS` (20 chains, ~450 lines of literal TS) moved
to `src/game/data/json/quest-chains.json`; `quests.ts` imports and
re-types it, same pattern `raids.ts` already established for its own
JSON (`durationMinutes` on disk, converted to `duration` ms on load --
same human-friendly-unit convention `raid-encounters.json`'s
`durationHours` uses). The JSON itself was generated programmatically --
a one-off `tsx` script dumped the live `QUEST_CHAINS` export straight out
of the running module, rather than hand-transcribing 20 chains' worth of
prose -- and the result was deep-equality-verified byte-for-byte
identical to the original array before anything was deleted, not just
typechecked (`tsc` alone doesn't catch a dropped field on a JSON import,
confirmed by deliberately introducing one during development: a leftover
`durationMinutes` key that should have been consumed and dropped instead
sat alongside the new `duration` field until the equality check caught
it).

**The new field type.** `stages` is the reason this was ever "bigger than
it sounds": every other DevTool content type is a flat array of entries,
this is the first one where a single entry contains its own repeatable
sub-list. New `chainStages` field type, both halves:
- `server.mjs`: validates every stage's `name`/`flavour`/`tag`/
  `difficulty`/`durationMinutes`/`goldMultiplier`, rejects unknown keys,
  requires at least one stage. Unit-tested directly (extracted the
  validation logic into a standalone script rather than relying on live
  HTTP requests, which this sandbox's network policy turned out to block
  even for localhost) against all 20 real migrated chains (zero errors)
  plus deliberately-broken cases (missing field, bad enum value, empty
  stage list) -- all caught correctly.
- `app.js`: a real repeatable sub-form. Each stage renders as its own
  bordered mini-form (name/flavour/tag/difficulty/duration/gold, plus a
  remove button); "+ add stage" inserts a fresh blank row using the same
  template; `wireStagesInput` mirrors `wireListInput`'s exact add/remove
  wiring shape, just for a 6-field row instead of a single text input.
  Removing a stage is blocked once only one remains (`chainStages` is
  required and non-empty), rather than letting the save fail later with a
  less obvious error.

**`rewardEgg` got the same treatment**, as its own new `eggReward` field
type: a checkbox ("grants an egg reward") that shows/hides a rarity
dropdown + optional dedicated-pet-id text field together, rather than a
rarity picker that's always present with no way to represent "no reward
at all." Fields stay in the DOM when hidden (not removed), so toggling
off and back on doesn't lose whatever was already typed.

Both new field types share the same styling conventions as the rest of
the editor (`style.css`'s existing `--panel2`/`--panel3`/`--text`
variables -- the DevTool's own separate stylesheet, unrelated to the
game's own `app.css` typo fixed elsewhere this session).

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

- **Melee/Ranged/Caster hero roles** -- scoping discussion started, no
  code yet. Concrete shape proposed so far: a role (Melee/Ranged/Caster)
  sits alongside a hero's existing class, with quest offers carrying a
  role-affinity modifier the same general shape the existing preferred-tag
  bonus already uses (match the offer's role for a bonus, mismatch for a
  penalty); raids would additionally be able to require a specific role
  mix in the party (e.g. "at least one of each"). Each class's actual role
  is meant to be fixed (a Knight is always Melee, a Wizard always Caster)
  but a hero should be able to retrain into their class's role via some
  mechanism (framed as "training") -- open question whether a class only
  ever has one valid role or can offer a choice between two. Naming is
  meant to be flavoured per class+role pairing rather than a flat
  "Melee/Ranged/Caster" label everywhere (a melee Wizard reading as
  "Arcane Warrior," a caster Knight as "Rune Knight," etc.), which means a
  full naming pass across every existing class before this could ship, not
  just the mechanical wiring. Needs its own dedicated scoping pass before
  any implementation starts -- open questions include: does every class
  get exactly one native role or a short list of valid retrains; is
  training a gold cost, a quest chain, a vendor unlock, or something else;
  does the role mechanic apply to ordinary board contracts too or only
  chain/raid content; and how "mismatch" penalties interact with the
  existing preferred-tag bonus so the two don't double-count or fight each
  other.
- **Hero talent trees** -- explicitly parked for a later discussion,
  raised alongside the roles scoping above but deliberately not folded
  into it. Concept: a talent point every 5-10 levels, spent into a small,
  flavoured tree scoped to the hero's selected role (so the tree itself
  would need the roles system above to exist first) -- individual talents
  are simple (e.g. "+1% Endurance," "+1% Strength") but reworded per class
  the same way role names would be ("Gritted Teeth" for a Melee Knight,
  etc.). Proposed gating: either a strict prerequisite chain (need talent
  N to unlock talent N+1) or a "up to 2 points in one talent before being
  allowed to move to the next" alternative -- not decided which. Blocked
  on the roles system landing first, since talents are described as being
  scoped per-role.
- **The Rememberer** -- a future Minor-domain god concept (memory/being
  forgotten, fades because written record-keeping replaced an oral
  practice). Parked in favor of reworking the Last God instead.
- **A Major-domain True God encounter** -- would need a fundamentally
  different shape than a straight raid fight. No concrete concept yet.
- **Steam leaderboards** -- mentioned early as a distinct, larger feature;
  the Guild Rank tooltip in the Lore tab was deliberately worded to become
  literally true if this ever ships, without needing a rewrite.
