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
(`requiresChainId`) — 8 confirmed dependencies wired in.

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
properly, same flagged gap as the Last God raid's tiered loot.

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
always-on-top companion window by design.

**DevTools** — tuning registry exists but only covers raid coefficients
so far (15 entries); loot picker, icon assignment tooling also live here.

**World lore** — `world-lore-pantheon.md` is the source of truth for
gods/pantheon rules. Starved gods can lash out from the starving itself
(confusion, not malice); Minor vs. Major domain framework in place (Major
still unwritten -- would need a different mechanical shape than a straight
raid fight).

---

## Known bugs (not yet fixed)

- **Persistent, undismissable guidance message** -- "the blacksmith has
  more to offer now" (and presumably other similar prompts) has no way to
  close it. Needs an X to dismiss, and ideally a "Go to" button routing to
  the relevant tab/vendor -- this should be the general pattern for any
  guidance message tied to a specific place in the game, not a one-off
  fix just for this message.
- **Broken rename modal after a hard reset** -- after resetting a guild,
  the rename-guild modal opens but doesn't accept text input and can't be
  closed, effectively softlocking that modal permanently (the menu behind
  it still functions if you don't click the modal itself, and naming the
  guild via some other path makes it go away, but this is unintended).
- ~~Quest chain banner art not rendering in the Lore tab~~ -- resolved.
  Not actually a loading bug: the art was rendering, but scrimmed to
  93-97% opacity as a full-card background (a deliberate earlier
  readability fix), which made it functionally invisible. Replaced with a
  dedicated banner strip above the text, matching the pattern built for
  raid cards -- separates art from text entirely, so it can be fully
  visible with no readability cost.

---

## Backlog

### Raids batch -- complete
All five items done: Raid Quartermaster + its own sub-tab, raid card ->
modal conversion (with banner art support, also applied to quest chains'
Lore cards for consistency -- see Known bugs), the Raid Charter
restructure, and two new raids (The Frozen Wyrmkeep, What Got Out).

### Quest Tab rework (new)
- Split "Available Contracts" into two clearly distinct sections --
  discovered/active quest **chains** vs. actual board **contracts** --
  since they're different things currently sharing one list and one label.
- Once split, chain entries can show their key art (same asset the Lore
  tab uses) directly on the card.
- An auto-assign / quick-start button, gated on having bought the
  Auto-Chain upgrade -- one click, send an idle hero on the next eligible
  bounty.
- Sort/group board contracts by rarity, ascending.

### Consumables & equip-slot rework (new)
- Remove consumables from the Quest Tab display entirely.
- Inventory's consumables get the same clickable-detail treatment the
  stash already has (view what it does, not just a bare count).
- New per-hero consumable-equip slots (separate from gear slots, next to
  Amulet) -- 1 slot baseline, up to 3 via upgrade.
- New upgrade: **Potion Belt** -- increases a hero's consumable-slot count.

### Cleanup items
- Heroic/Mythic tiered loot for the Last God raid (needs `equipment.json`).
- A hidden achievement for clearing the Last God raid, mirroring
  `WORLDS_END`'s treatment of `world_ender`.
- CSS dead-class scan -- inconclusive last attempt (only had `ui/panels/`,
  not the full `ui/` tree); worth redoing with full scope if it still matters.

### Deferred systems (queued before the polish/narrative detour started)
- Pets.
- Off-mission engagement (something to check on periodically outside
  active questing).
- Freeze slot for the quest board (never got a firm yes/no).

### Bigger, still-undecided
- First-five-minutes onboarding beat -- needs its own design conversation
  before any building starts.
- Tuning registry expansion beyond raid coefficients.

### Platform / distribution
- **Steam Cloud saves** -- no code work needed yet. Saves already live at
  `app.getPath('userData')`, a stable path suitable for Steam's Auto-Cloud
  file sync, which is configured entirely in the Steamworks partner
  backend once a real App ID exists -- not an SDK integration the way
  achievements are. Revisit when actually setting up the Steam page.

---

## Brainstorming / not yet committed

- **The Rememberer** -- a future Minor-domain god concept (memory/being
  forgotten, fades because written record-keeping replaced an oral
  practice). Parked in favor of reworking the Last God instead.
- **A Major-domain True God encounter** -- would need a fundamentally
  different shape than a straight raid fight. No concrete concept yet.
- **Steam leaderboards** -- mentioned early as a distinct, larger feature;
  the Guild Rank tooltip in the Lore tab was deliberately worded to become
  literally true if this ever ships, without needing a rewrite.
