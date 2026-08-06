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
against the best-unlocked tier rather than a flat taper).

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
- **Every CSS animation in the game plays instantly, no visible motion at
  all -- root cause still unknown.** First noticed via Harvest's
  fall-in/collect-particle effects (patches 0112/0113 chased two real but
  ultimately unrelated leads there: a hardcoded duration not respecting
  `--anim-speed`, and an off-screen animation start -- both legitimate
  fixes, neither was the actual cause). Confirmed NOT specific to Harvest:
  the pre-existing quest-completion gold/XP particle burst
  (`QuestResultModal`, `collect-fly`) does the exact same thing --
  appears/vanishes instantly instead of flying and fading. Confirmed NOT
  the in-game Settings > Reduce Motion toggle (checked, it's off) and the
  player doesn't believe a Windows power-saving mode is active. Since
  every animation-duration in the app funnels through one global
  mechanism (`@media (prefers-reduced-motion: reduce)` and/or
  `:root[data-motion='off']`, both forcing `animation-duration: 0.001ms
  !important` in `app.css`), whatever's triggering this is almost
  certainly one of those two matching when it shouldn't -- worth checking
  Windows' Ease of Access > Visual effects > "Show animations" setting
  specifically (a different toggle from power mode), and/or actually
  inspecting the live DOM's `:root` for `data-motion`/computed
  `prefers-reduced-motion` state via DevTools next time this comes up.
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
- Pets.
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
- New `harvest` tab (Guild group) -- a Warehouse home sub-tab plus one
  sub-tab per node (Quarry/Woodyard/Herb Garden/Fish Weir), each with its
  own falling-item scene (`.harvest-scene` in app.css). Any hero not
  currently on a quest feeds every node's spawn timer -- no assignment
  step, and not gated on which sub-tab happens to be open, same as the
  quest board and shop already tick regardless of which panel you're on.
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
- **Crafting**, in the Warehouse tab -- gear recipes (Guildmade Blade:
  ore+timber; Guildmade Band: ore+timber) let the player pick 2 of 4
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
- **Art.** `public/lore/harvest/<nodeId>.jpg` (4 files) and a Warehouse
  interior don't exist yet -- same "missing file just fails to paint, no
  broken-icon" convention as every other banner in this game, so the
  mechanic works today and art can land whenever it's sourced, same
  rollout shape quest-chain banners already used.
- **Quests still exist to fill the same original gap.** Nothing was
  changed about how a hero coming back from a quest also being available
  to gather at the same time -- worth a look eventually, but not a blocker.
- Recipe costs, tool-upgrade curves, and yields are first-pass numbers,
  not a balance pass -- same "content is a cache, gameplay data confirms
  the intent" spirit as every other system's initial numbers before
  actual playtesting.

### Bigger, still-undecided
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
