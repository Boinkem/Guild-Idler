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
cost curve, heroic/mythic difficulty modifiers) plus, as of patch 0107,
all 5 guild facilities' cost curves and per-level effect strength
(35 entries total, 3 categories). `raid_loot`/`raid_recovery` are still
hardcoded in `raidUpgrades.ts` -- explicitly deferred there as a small
follow-up, not forgotten. Loot picker, icon assignment tooling also live
here. Patches tab's flow is now Check -> Apply -> Commit -> **Push** (plain
`git push`, relies on the branch's existing upstream rather than taking a
remote/branch as input); Build/Package/Tag shifted from steps 5/6/7 to
6/7/8 to make room.

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

### Harvest/Gathering + Crafting (scoped from discussion -- not yet built)
Started as the one-line "Off-mission engagement" bullet that used to live
above; fleshed out enough across a few conversations that it's got real
shape now. Answers the same original problem (idle heroes doing nothing)
plus doubles as the material source the Crafting brainstorm needed.

**Harvest/Gathering** -- any hero not currently on a quest passively
feeds this in the background; no assignment step, it just happens.
Structure is 4 dedicated node tabs plus a Home tab, same split shape
`RaidsPanel` already uses for Raids vs. the Quartermaster's Den:
- **Quarry** (ore), **Woodyard** (timber), **Herb Garden** (herbs),
  **Fish Weir** (fish) -- each its own sub-tab, own outdoor landscape
  backdrop (same per-tab `backgroundImage` wash `MenuWindow` already does
  for Raids/Guild Hall), own falling-item scene, one material type per
  tab.
- **Home tab = Warehouse** -- stock levels per material, storage cap,
  descriptions. Likely an interior backdrop rather than outdoor,
  mirroring the Quartermaster's Den's static-room feel against the
  Raids tab's outdoor wash. Storage cap is a Warehouse upgrade, same
  `storagePerLevel` shape Treasury already has.
- **Per-node scene mechanic**: on a timer, that node's material spawns
  at a random X at the top, falls, bounces (1-2 decreasing bounces),
  settles, pulses gently for ~8-12s, then despawns if unclicked -- no
  penalty for a miss. Click plays the existing collect-particle/
  floating-text juice already used for gold/xp pickups (`.collect-burst`,
  `floatingText` in `IdleView.tsx`) with a new material-icon particle
  skin, rather than new animation code.
- Flat, predictable yield per catch to start (1:1 baseline); scales later
  purely via upgrades, not a random roll per catch. A rare "bonus" glint
  (bigger pulse, worth 2-3x) adds a little surprise on top.
- **Spawn rate scales with idle hero count** (more idle heroes = shorter
  interval between spawns), soft-capped so the scene stays readable with
  a big roster.
- **Tool upgrade line, one per node** (Pickaxe/Woodaxe/Sickle/Net),
  gold-cost, same tree shape as Raid Upgrades (own file, own tree, not
  folded into the general `UPGRADES` list) -- bumps that node's spawn
  rate/yield/despawn window per level.
- Every numeric knob here (spawn interval, despawn timer, bonus-glint
  chance/multiplier, yield-per-catch, tool-upgrade curves) is a strong
  tuning-registry candidate from day one, not an afterthought -- same
  category shape `guild_facilities` already established.

**Selling materials for gold** -- gated behind a **Trade Route** upgrade
(mirrors Guild Charter/Raid Charter gating a whole feature behind one
purchase). Deliberately not a free faucet -- pairs with:

**Crafting** -- spends materials *and* gold, which is the actual sink for
the above (a new faucet needs a real sink, not just a one-time gate
purchase). Cross-node recipes by category rather than per-item, so
nothing absurd ends up in a recipe (a ring never needs fish):

| Category | Needs |
|---|---|
| Gear | Quarry ore + Woodyard timber |
| Food consumables | Fish Weir fish + Herb Garden herbs |
| Potions/flasks | Herb Garden herbs (+ a rare Quarry mineral dust at higher tiers) |

**The actual reason to craft, not just another way to get gear**: shop,
black-market, and raid loot are all pre-rolled fixed items -- crafting's
whole value proposition should be *choice* instead of RNG. Likely shape:
a crafted piece lets the player allocate a fixed pool of stat points
across a preset set of mod types themselves (or choose N of M available
mod types at fixed strength), rather than hoping a drop rolls the
combination they actually wanted. This is the answer to "why craft
instead of just farming or buying," not a detail to defer -- it needs to
feel meaningfully different from opening the shop, or the whole system is
just gear with extra steps.

**Open, not yet decided**: exact recipe costs and tool-upgrade curves;
Trade Route's own cost and whether it also needs a recurring toll beyond
crafting demand as a sink; how a stat-allocation UI actually presents
(sliders? pick-N-of-M chips?); whether crafted items get their own visual
treatment (a "custom" rarity tier or marker) to read as distinct from
found gear; art sourcing for the four node landscapes plus the Warehouse
interior; whether one shared falling-item scene across all unlocked
materials was considered and rejected in favor of the four-tab version
(it was -- four distinct tabs, art sourcing isn't the blocker it might
seem).

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
