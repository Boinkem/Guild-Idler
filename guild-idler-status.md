# Guild Idler — Status & Roadmap

Companion to `guild-idler-project-brief.md`, not a replacement. The brief holds
formulas, constants, and "don't re-derive this" findings. This file holds the
bigger picture: what's actually built, what's queued, and what's just an idea
so far. Update it whenever a patch lands or a new direction gets locked in —
stale sections here are worse than no section at all.

---

## Systems in place

**Core loop** — quest board (30-min refresh windows, tier eligibility by
level), offline catch-up, Auto-Chain streaks, burst quests (now capped
live against the best-unlocked tier rather than a flat taper).

**Heroes** — recruiting, leveling, stat allocation, injuries, skins,
ascension/prestige, retirement with streak bonus.

**Equipment** — rarities, set bonuses, repair/refine, shop + black market
rotation, `raidExclusive` flag (Heroic/Mythic tiered variants can no
longer appear in either shop's stock).

**Guild facilities & Permanent Upgrades** — vendor-style upgrade trees,
guild-wide bonuses, gold storage.

**Quest chains** — 19 total. 17 rewritten in the current narrative style
(vivid/scene-painting, not the earlier terse/allusive one); `world_ender`
and `last_god`-successor content match that style natively. Chain
prerequisite gating exists (`requiresChainId`) — 8 confirmed dependencies
wired in, more can be added the same way as new chains reference old ones.

**Raids** — 3 total: Blackford Keep (8) → Bonewrought Vault (22) →
Requiem for the Last God (55, gated by the new `last_pilgrimage` chain
rather than a prior raid). Raid Guild Upgrades tree exists (gold tiers →
Renown tiers) but currently only has one upgrade (Raid Speed) and sits as
a collapsible section rather than a proper card. Raids can now be gated
by a completed chain (`RaidDef.requiresChainId`) as well as by a prior
raid (`unlocksRaidId`) — both mechanisms coexist.

**Renown / Prestige** — retirement, renown perks (two-tier, gold-then-
renown cost curves), prestige streak bonus.

**Achievements** — Steam-stub integration, dedicated unlock popup
(non-blocking, separate from the toast queue), hidden achievements
supported.

**UI shell** — grouped navigation (Dashboard / Guild / Adventure /
Progression / Meta), Guide tab (notification log + How-To reference),
Settings (theme, density, motion, sound, confirmations), consistent
currency feedback (particle bursts, purchase pulses) across every
gold/Renown-spending surface.

**DevTools** — tuning registry exists but only covers raid coefficients
so far (15 entries); loot picker, icon assignment tooling also live here.

**World lore** — `world-lore-pantheon.md` is the source of truth for
gods/pantheon rules. Recent additions: Starved gods can lash out from the
starving itself (not just fade silently) as long as it reads as confusion,
not malice; Minor vs. Major domain framework (a Major-domain True God,
even starved, would still be too much for a mortal guild to fight
directly — that tier needs a different mechanical shape entirely,
unwritten so far).

---

## Backlog

### Raids batch (current priority, in order)
1. **Raid Quartermaster** — dedicated sprite (user has the art; matches
   the existing Vendor pattern visually) and a real card presence for the
   Raid Upgrades tree, replacing the collapsible strip. Same look as a
   Vendor, separate mechanic underneath (the existing gold→Renown cost
   curve stays raid-specific, not folded into the real `VENDORS` system).
2. **Raid card → modal conversion** — Raids, Quest Chains, and Lore
   entries move from inline-expand to click-to-open-modal (narrow scope,
   confirmed — small/frequent cards like Upgrades or Equipment slots stay
   inline). Key art support needed: renders once present, silently absent
   until then, same convention as every other art asset this project uses.
3. **Raid Charter restructure** — cheap early Normal-only unlock, with
   separate upgrades gating Heroic and Mythic specifically.
4. **Demon Fortress Assault raid** — strongest candidate for a
   chain-grown raid; the chain's own text already frames itself as a
   raid-scale event ("gathering every banner it can call on").
5. **Dragon Hunt raid** — ~level 18, three encounters (hatchlings → wyrm
   keepers → the Frozen Dragon).

### Cleanup items
- Heroic/Mythic tiered loot for the Last God raid (shipped without it on
  purpose — needs `equipment.json` to do properly).
- A hidden achievement for clearing the Last God raid, mirroring
  `WORLDS_END`'s treatment of `world_ender`.
- CSS dead-class scan — inconclusive last attempt (only had `ui/panels/`,
  not the full `ui/` tree); worth redoing properly with full scope if it
  still matters.

### Deferred systems (queued before the polish/narrative detour started)
- Pets.
- Off-mission engagement (something for the player to check on
  periodically outside active questing).
- Freeze slot for the quest board (never got a firm yes/no).

### Bigger, still-undecided
- First-five-minutes onboarding beat — flagged early as a UX/telegraphing
  problem, not a numbers problem; needs its own design conversation before
  any building starts.
- Tuning registry expansion beyond raid coefficients.

---

## Brainstorming / not yet committed

- **The Rememberer** — a future Minor-domain god concept (memory/being
  forgotten, fades because written record-keeping replaced an oral
  practice, not because of a "shinier" replacement deity). Explicitly
  parked in favor of reworking the Last God instead — free to build
  whenever a new minor-domain capstone is wanted.
- **A Major-domain True God encounter** — per the new Minor/Major
  framework, this would need a fundamentally different shape than a
  straight raid fight (an artifact, an intermediary, something closer to
  how Old Gods are meant to be approached). No concrete concept yet.
- **Steam leaderboards** — mentioned early as a distinct, larger feature;
  the Guild Rank tooltip in the Lore tab was deliberately worded to become
  literally true if this ever ships, without needing a rewrite.
