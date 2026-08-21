#!/usr/bin/env node
/**
 * Guild Idler Dev Tool — standalone content editor.
 *
 * A tiny local web server (no dependencies, no build step) that serves a plain
 * HTML/JS page for editing quest templates, equipment, consumables, and events.
 * It reads and writes the same JSON files the game itself loads at build time,
 * so a save here + `npm run dev` restart is all it takes to see the change.
 *
 * This is intentionally separate from the game's own dev server — it has
 * nothing to do with Electron or Vite, and can be run while the game is open
 * or closed.
 *
 * Usage:
 *   node tools/devtool/server.mjs
 *   (or)  npm run devtool
 *
 * Then open http://localhost:5175 in a browser.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'src', 'game', 'data', 'json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Balance Sandbox sim -- see tools/devtool/sim/runSim.ts's own header comment
// for why this runs as a separate tsx child process per variant rather than
// in-process.
const SIM_DIR = path.join(__dirname, 'sim');
const SIM_SCRIPT = path.join(SIM_DIR, 'runSim.ts');
const SIM_PRESETS_PATH = path.join(SIM_DIR, 'presets.json');
// Pixel-art item icons, organised into subfolders by category (weapons,
// armor, shields, etc.) -- lives in the main project's own public/ folder,
// not the devtool's, so the game itself can serve these too later.
const ICONS_DIR = path.join(ROOT, 'public', 'item-icons');
// Chain/raid banner art -- public/lore/ itself (loose backdrop images like
// guild-hall-bg.jpg), plus its subfolders (chains/, raids/, harvest/,
// crafting/), grouped and served the same way ICONS_DIR is below. Kept as
// its own dir constant rather than reusing ICONS_DIR's folder-listing
// output directly, since the two trees are rooted in different places and
// public/lore/ (unlike item-icons/) also has real loose files sitting
// directly in the root instead of only inside subfolders.
const BANNERS_DIR = path.join(ROOT, 'public', 'lore');
// Guild Hall decoration art -- its own tree (public/decor/) rather than
// reusing ICONS_DIR or BANNERS_DIR, same "different root, kept separate"
// reasoning as BANNERS_DIR's own comment just above. Doesn't reuse
// item-icons/ specifically because decoration art needs the DevTool's
// contain-fit placement/scale field (see the 'decorationImage' field type
// below), not the plain no-placement 'icon' picker item-icons/ uses
// everywhere else -- mixing the two conventions in one folder would make
// it unclear at a glance which pieces of art in there support placement
// tuning and which don't. Grouped and served the same loose-root-files-
// plus-subfolders way listBanners/'/lore-art/' already are.
const DECOR_DIR = path.join(ROOT, 'public', 'decor');
// The committed Guild Hall background art -- as of patch 0206, an
// open-ended, one-subfolder-per-theme tree (public/guildhall-customize/
// <themeId>/bg.jpg) rather than the single fixed bg.jpg patch 0205 shipped,
// since "Customizable Guild Hall background" now literally means more than
// one background to choose between. Used two ways: the 'Guild Hall Slot
// Layout' tool renders whichever theme is currently selected there as the
// backdrop behind its drag/resize boxes, and the 'guildhall-themes'
// content type's own `background` field lets a theme's own background be
// picked from whatever's in here (see listGuildhallArt/'/api/guildhall-art'
// further down -- same loose-root-files-plus-subfolders shape
// listBanners/listDecorArt already use). Static-served the same guarded
// way as every other art tree here (see the '/guildhall-art/' route
// further down).
const GUILDHALL_ART_DIR = path.join(ROOT, 'public', 'guildhall-customize');
const PORT = 5175;

// Local-only, gitignored (see .gitignore) — holds the Discord webhook URL for
// the "post a dev update" feature further down. Never committed, never
// served as a static file (lives outside PUBLIC_DIR), only ever read/written
// by the /api/discord/* handlers below.
const DISCORD_CONFIG_PATH = path.join(__dirname, 'discord.config.json');
// The running changelog/backlog doc at the repo root -- read (never written)
// by the patch-summary lookup below, to pull a ready-made Discord blurb for
// whichever patch is selected instead of guessing one from its filename.
const STATUS_MD_PATH = path.join(ROOT, 'guild-idler-status.md');
// Where `npm run package` (electron-builder) actually drops its output --
// see package.json's own build.directories.output. Read by copyLatestBuild
// below to find the newest installer to copy.
const RELEASE_DIR = path.join(ROOT, 'release');
// Local Windows folder targeted by Google Drive's desktop sync -- anything
// copied here becomes shareable automatically, no separate upload step.
// Hardcoded rather than configurable since this is a single-developer local
// tool (same "runs on your machine, not deployed" reasoning DEVTOOL.md's own
// setup instructions already assume for the C:\Little-Knight path itself).
const BUILD_COPY_TARGET = 'C:\\Custom Apps\\GuildBound Executables';

// The 30 physical Guild Hall slots' fixed identity (id/label/slotType) --
// mirrors guildHallSlots.ts's own SLOT_IDENTITY verbatim. Duplicated here
// on purpose, same "SCHEMAS enum options mirror a TS union" tradeoff the
// 'guild-hall-decorations' schema's own `slotType` enum options already
// accept just above -- this plain Node server has no TS import pipeline,
// so it can't read the real source of truth directly. Two jobs: served
// to the DevTool frontend as display-only metadata (labels, so the Slot
// Layout tool can show "L2a" instead of a bare id -- see
// '/api/guildhall-slot-meta' below), and its id list is the allowlist
// `validateArray`'s 'guildhall-slot-layout' special case enforces (below)
// -- every saved layout row's `id` must be one of these 30, since adding
// or removing a slot is a `GuildHallSlotId` (types.ts) code change, not
// something this tool can do. As of patch 0206 that's the only thing
// enforced here (plus no duplicate id *within the same theme*) -- a
// theme is no longer required to use all 30 (a room's furniture may not
// have a Trophy Case at all, say), so "missing" isn't an error the way
// it used to be when there was only one theme.
const GUILDHALL_SLOT_META = [
  { id: 'banner', label: 'Banner', slotType: 'banner' },
  { id: 'wall1', label: 'Wall 1', slotType: 'wallCenterpiece' },
  { id: 'wall2', label: 'Wall 2', slotType: 'wallCenterpiece' },
  { id: 'trophycase', label: 'Trophy Case', slotType: 'trophyCase' },
  { id: 'centerpiece', label: 'Centerpiece', slotType: 'centerpiece' },
  { id: 'floor', label: 'Floor Centerpiece', slotType: 'floorCenterpiece' },
  { id: 'cornerL', label: 'Corner L', slotType: 'corner' },
  { id: 'cornerR', label: 'Corner R', slotType: 'corner' },
  { id: 'left-0-0', label: 'L1', slotType: 'wallTrinket' },
  { id: 'left-0-1', label: 'L1', slotType: 'wallTrinket' },
  { id: 'left-1-0', label: 'L2a', slotType: 'wallTrinket' },
  { id: 'left-1-1', label: 'L2a', slotType: 'wallTrinket' },
  { id: 'left-2-0', label: 'L2b', slotType: 'wallTrinket' },
  { id: 'left-2-1', label: 'L2b', slotType: 'wallTrinket' },
  { id: 'left-3-0', label: 'L3', slotType: 'wallTrinket' },
  { id: 'left-3-1', label: 'L3', slotType: 'wallTrinket' },
  { id: 'right-0-0', label: 'R1', slotType: 'wallTrinket' },
  { id: 'right-0-1', label: 'R1', slotType: 'wallTrinket' },
  { id: 'right-1-0', label: 'R2a', slotType: 'wallTrinket' },
  { id: 'right-1-1', label: 'R2a', slotType: 'wallTrinket' },
  { id: 'right-2-0', label: 'R2b', slotType: 'wallTrinket' },
  { id: 'right-2-1', label: 'R2b', slotType: 'wallTrinket' },
  { id: 'right-3-0', label: 'R3', slotType: 'wallTrinket' },
  { id: 'right-3-1', label: 'R3', slotType: 'wallTrinket' },
  { id: 'center-0-0', label: 'Middle', slotType: 'middleShelf' },
  { id: 'center-0-1', label: 'Middle', slotType: 'middleShelf' },
  { id: 'center-1-0', label: 'LowerA', slotType: 'lowerShelf' },
  { id: 'center-1-1', label: 'LowerA', slotType: 'lowerShelf' },
  { id: 'center-2-0', label: 'LowerB', slotType: 'lowerShelf' },
  { id: 'center-2-1', label: 'LowerB', slotType: 'lowerShelf' },
];
const GUILDHALL_SLOT_IDS = GUILDHALL_SLOT_META.map((s) => s.id);

/* --------------------------------------------------------------- schema --- */
// Required fields per content type. This is the real safety net: TypeScript's
// `as Foo[]` cast on the JSON import does NOT validate structure at compile
// time (confirmed — deleting a required field from the JSON still passes
// `tsc`), so this server is the only thing standing between a bad edit and a
// broken build. Every write is checked against these before it touches disk.

const SCHEMAS = {
  'tombstone-styles': {
    file: 'tombstone-styles.json',
    label: 'Tombstone Styles',
    group: 'Heroes & Progression',
    idField: 'id',
    // Cosmetic gold-sink list for a Fallen hero's marker (see
    // guild-idler-status.md's Health-related gold sinks entry) -- moved
    // out of a hardcoded array in progression.ts specifically so a new
    // style, or an icon swap on an existing one, doesn't need a code
    // patch. `icon` is a plain filename under public/hero-status/, not
    // the shared item-icons `picker: 'icon'` (that picker/preview is
    // hardcoded to ICONS_DIR below, a different folder) -- type it by
    // hand for now; a dedicated picker rooted at public/hero-status/
    // (same shape bannerImage already has for public/lore/) would be a
    // reasonable follow-up if that folder ever grows past a handful of
    // files, but isn't needed yet for four entries.
    fields: {
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      cost: { type: 'number', required: true, min: 0 },
      icon: { type: 'string', required: true },
    },
  },
  'hero-classes': {
    file: 'hero-classes.json',
    label: 'Hero Classes',
    group: 'Heroes & Progression',
    idField: 'id',
    // The playable hero roster -- previously a hardcoded TS Record, the
    // single largest remaining DevTool coverage gap (see quests.ts's own
    // DIFFICULTIES migration for the precedent this follows). `baseStats`/
    // `growth` reuse the existing generic `stats` field type; `mods`
    // reuses the existing generic `mods` field type -- neither needed any
    // new machinery. `preferred` is the one genuinely new addition here:
    // a list of QuestTags, same shape modKeyList/statKeyList already have
    // for their own key-list fields (see the `questTagList` case in
    // validateEntry below, and app.js's matching support), just validated
    // against QUEST_TAG_KEYS instead.
    //
    // Recruit cost is deliberately NOT a field here -- see the
    // `recruit-costs` schema just below, and progression.ts's own comment
    // on why that stays a separate content type (DlcManager.ts already
    // keeps them split the same way for DLC-added classes).
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      blurb: { type: 'string', required: true },
      baseStats: { type: 'stats', required: true },
      growth: { type: 'stats', required: true },
      mods: { type: 'mods', required: false },
      preferred: { type: 'questTagList', required: true },
      preferredBonus: { type: 'number', required: true },
      unlockTavernLevel: { type: 'number', required: true },
      tier: { type: 'number', required: true },
      names: { type: 'string[]', required: true },
      // Native combat role (Melee/Ranged/Caster) plus per-role display
      // names -- see types.ts's Role and HeroClassDef.role/roleFlavors'
      // own comments in progression.ts for the full reasoning. `role`
      // reuses the existing generic `enum` field type (no new machinery
      // needed there); `roleFlavors` is a genuinely new field type, same
      // shape as `mods`/`stats`'s kv-grid just keyed to the 3 Role values
      // with required text values instead of optional numbers -- see the
      // `roleFlavors` case in validateEntry below.
      role: { type: 'enum', options: ['melee', 'ranged', 'caster'], required: true },
      roleFlavors: { type: 'roleFlavors', required: true },
      // Same required-3-key-text-map shape as roleFlavors just above, but
      // its own 'roleDescriptions' type rather than reusing roleFlavors'
      // -- these hold full sentences (a role's flavour blurb), not a
      // short display name, and sharing roleFlavors' type meant sharing
      // its single-line kv-grid input too, which read/wrote as a cramped
      // one-liner for sentence-length text. Own type -> own (textarea)
      // render in app.js, validated identically to roleFlavors via a
      // shared switch case in validateEntry below.
      roleDescriptions: { type: 'roleDescriptions', required: true },
      // Unset for every base-game class -- see HeroClassDef.requiresDlc's
      // own comment in progression.ts. Editable here mainly so a future
      // DLC pack's own manifest content could, in principle, be authored
      // through the same tooling rather than by hand.
      requiresDlc: { type: 'string', required: false },
    },
  },
  'recruit-costs': {
    file: 'recruit-costs.json',
    label: 'Recruit Costs',
    group: 'Heroes & Progression',
    idField: 'id',
    // Kept separate from `hero-classes` above on purpose -- see that
    // schema's own comment, and progression.ts's RECRUIT_COST comment,
    // for why. Small (9 entries), flat, no reason to fold it into a
    // richer schema.
    fields: {
      id: { type: 'string', required: true, slug: true },
      cost: { type: 'number', required: true },
    },
  },
  'roles': {
    file: 'roles.json',
    label: 'Roles',
    group: 'Heroes & Progression',
    idField: 'id',
    // Exactly 3 fixed entries (melee/ranged/caster) -- name + icon +
    // description, `id` locked to an enum dropdown (not free-slug like
    // most schemas) since Role is a closed 3-value union in code; a
    // free-text id here could produce an entry that doesn't match any
    // real Role value. `icon` reuses the *existing* `picker: 'icon'`
    // machinery equipment/consumables/crafting recipes already have
    // (rooted at public/item-icons/, already supports subfolders) rather
    // than inventing a new picker just for 3 icons -- icons live in
    // public/item-icons/roles/. `description` (patch 0141) is the copy
    // shown on the Hero Training tab's role cards. See types.ts's
    // RoleDef and guild-idler-status.md's hero-roles backlog entry.
    fields: {
      id: { type: 'enum', options: ['melee', 'ranged', 'caster'], required: true },
      name: { type: 'string', required: true },
      icon: { type: 'string', required: false, picker: 'icon' },
      description: { type: 'string', required: false },
    },
  },
  'skins': {
    file: 'skins.json',
    label: 'Hero Skins',
    group: 'Heroes & Progression',
    idField: 'id',
    // Migrated off a hardcoded array in progression.ts (see that file's
    // own comment) -- a new skin, or a swatch/price tweak on an existing
    // one, no longer needs a code patch. `swatch` is a fixed 2-string
    // tuple (two hex colours for the shop UI's small preview dots) --
    // typed as a plain `string[]` here rather than a new 2-tuple field
    // type, since the frontend's existing list-input already handles an
    // arbitrary-length string list and nothing here enforces exactly 2
    // beyond convention (same trust level `names` on hero-classes already
    // gets for its own string list).
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      cost: { type: 'number', required: true, min: 0 },
      swatch: { type: 'string[]', required: true },
    },
  },
  'ascension-ranks': {
    file: 'ascension-ranks.json',
    label: 'Ascension Ranks',
    group: 'Heroes & Progression',
    idField: 'id',
    // Migrated off a hardcoded array in progression.ts. Checked in
    // descending `min` order at runtime (ascensionRank in progression.ts)
    // -- entries here should stay ordered highest-min-first for that
    // "first match wins" logic to keep picking the correct (highest
    // qualifying) rank; not enforced by this schema, same trust level
    // quest-chains' stage ordering already gets.
    fields: {
      min: { type: 'number', required: true, min: 0 },
      name: { type: 'string', required: true },
    },
  },
  'recruit-start-level': {
    file: 'recruit-start-level.json',
    label: 'Recruit Start Levels',
    group: 'Heroes & Progression',
    idField: 'id',
    // Migrated off a hardcoded Record in progression.ts. `tier` is the
    // actual lookup key at runtime (matches HeroClassDef.tier) -- `id` is
    // a separate, purely cosmetic slug the generic id-keyed editor needs
    // to exist, same "id exists only for the editor" shape recruit-costs
    // already has for hero-classes' own tier field.
    fields: {
      tier: { type: 'number', required: true, min: 0 },
      startLevel: { type: 'number', required: true, min: 1 },
    },
  },
  'guide-topics': {
    file: 'guide-topics.json',
    label: 'Guide Topics',
    group: 'Reference & Text',
    idField: 'id',
    // The Guide tab's own "How To" reference entries -- migrated off a
    // hardcoded array in guideTopics.ts. `body` renders as a textarea
    // (same convention description/flavour/blurb already get), since
    // these run a sentence or two each.
    fields: {
      id: { type: 'string', required: true, slug: true },
      title: { type: 'string', required: true },
      body: { type: 'string', required: true },
    },
  },
  'guidance-topics': {
    file: 'guidance-topics.json',
    label: 'Guidance Topics',
    group: 'Reference & Text',
    idField: 'id',
    // The one-time onboarding-toast prose (GuidanceManager.ts) -- prose
    // only, migrated off a hardcoded array there. The actual trigger
    // CONDITION for each topic (whether it fires) stays real code in
    // GuidanceManager.ts's own CHECKS map, not represented here at all --
    // editing/adding an entry through this schema changes what a topic
    // SAYS once it fires, not whether or when it fires. `messages` is a
    // plain `string[]` (1-2 toast lines shown back to back);
    // `targetTab` is the optional "Go to" button destination.
    fields: {
      id: { type: 'string', required: true, slug: true },
      messages: { type: 'string[]', required: true },
      targetTab: { type: 'string', required: false },
    },
  },
  'credits': {
    file: 'credits.json',
    label: 'Credits',
    group: 'Reference & Text',
    idField: 'id',
    // Shown on the Settings tab (new "Credits" section) -- see
    // guild-idler-status.md's "Asset licensing -- confirmed in writing"
    // entry for the license-confirmation pass `licenseSummary` draws on.
    // `packName`/`creator` ship blank on the four base entries pending a
    // specific-marketplace-listing confirmation pass -- see credits.ts's
    // own comment. `creditRequired` is purely informational today (no UI
    // currently branches on it), kept as a real field rather than baked
    // into prose so a future pass could, e.g., sort required-credit
    // entries first without re-parsing licenseSummary text.
    fields: {
      id: { type: 'string', required: true, slug: true },
      category: { type: 'string', required: true },
      packName: { type: 'string', required: false },
      creator: { type: 'string', required: false },
      licenseSummary: { type: 'string', required: true },
      creditRequired: { type: 'boolean', required: false },
    },
  },
  'quest-templates': {
    file: 'quest-templates.json',
    label: 'Quest Templates',
    group: 'Quests',
    idField: null,
    fields: {
      verb: { type: 'string', required: true },
      tag: { type: 'enum', required: true, options: ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'] },
      subjects: { type: 'string[]', required: true },
      flavour: { type: 'string[]', required: true },
      minDifficulty: {
        type: 'enum', required: false,
        options: ['easy', 'normal', 'hard', 'epic', 'legendary'],
      },
    },
  },
  'quest-prefixes': {
    file: 'quest-prefixes.json',
    label: 'Quest Prefixes',
    group: 'Quests',
    idField: 'id',
    // Small flavor list (5 entries) prepended to a quest name at a small
    // random chance -- was a plain JSON array of strings until this schema
    // was added, which the generic id-keyed editor every other content
    // type here uses can't represent directly. Converted to {id, text}
    // objects (quests.ts maps back to a plain string[] at import time) so
    // it fits the same shape as everything else, rather than inventing a
    // one-off "raw string array" field type for a single 5-entry list.
    fields: {
      id: { type: 'string', required: true, slug: true },
      text: { type: 'string', required: true },
    },
  },
  'quest-chains': {
    file: 'quest-chains.json',
    label: 'Quest Chains',
    group: 'Quests',
    idField: 'id',
    // The big one -- migrated from ~450 lines of literal TS specifically
    // so this could exist (see quests.ts's own comment on the migration).
    // `stages` is the reason this needed a genuinely new field type
    // (`chainStages`) rather than reusing an existing one: every other
    // content type here is a flat array of entries, this is the first
    // one where a SINGLE entry itself contains its own repeatable
    // sub-list. See the 'chainStages' case in validateEntry below, and
    // app.js's matching add/remove-row UI.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      reqLevel: { type: 'number', required: true },
      rewardGold: { type: 'number', required: true },
      rewardItems: { type: 'string[]', required: false, picker: 'lootTable' },
      rewardRenown: { type: 'number', required: true },
      title: { type: 'string', required: false },
      epilogue: { type: 'string', required: false },
      // Gates this chain from ever being offered until the referenced
      // chain id appears in a player's completedChains -- free-text
      // rather than a dropdown of known chain ids, since this schema has
      // no cross-entry lookup mechanism (same trade-off dedicatedPetId
      // below accepts).
      requiresChainId: { type: 'string', required: false },
      // True for exactly one chain (the Hatchery's own intro) today, but
      // not restricted to that here -- see ChainDef.grantsHatchery's own
      // comment for why this is deliberately decoupled from rewardEgg.
      grantsHatchery: { type: 'boolean', required: false },
      // Was defined on ChainDef and used by the_man_who_sells_maybe's own
      // JSON entry since Grimsby shipped, but never actually exposed here
      // -- same class of silent gap as the raids schema's own missing
      // requiresChainId, found and fixed in this same pass (see that
      // field's comment further down in this file).
      grantsPeddler: { type: 'boolean', required: false },
      // The Harvest tab's own intro (`the_first_haul`) -- same shape as
      // grantsHatchery/grantsPeddler just above.
      grantsHarvest: { type: 'boolean', required: false },
      // The egg equivalent of rewardItems above -- always granted on
      // completion, not a chance roll. New 'eggReward' field type (see
      // validateEntry below): an object with a required rarity and an
      // optional dedicatedPetId (free-text pet id, same no-cross-entry-
      // lookup trade-off as requiresChainId).
      rewardEgg: { type: 'eggReward', required: false },
      // `defaultFolder` is a frontend-only hint (like `picker` elsewhere in
      // this file) -- which public/lore/ subfolder the banner picker opens
      // to first, and which folder+id.jpg the preview falls back to
      // showing when no explicit path override is chosen yet. Server-side
      // this validates the same as raids.json's own `banner` field below.
      // `previewAspect` (also frontend-only) is a `width/height` hint for
      // the DevTool preview box -- see renderBannerField in app.js. Chains
      // render as a fixed-height strip across a card up to 720px wide
      // (ChainBanner: height 90 in LorePanel.tsx), so 8/1 is the real
      // shape being cropped, not the old generic 420x130 box.
      banner: { type: 'bannerImage', required: false, defaultFolder: 'chains', previewAspect: '8/1' },
      stages: { type: 'chainStages', required: true },
    },
  },
  'quest-tags': {
    file: 'quest-tags.json',
    label: 'Quest Tags',
    group: 'Quests',
    idField: 'id',
    // One entry per QuestTag (combat/escort/explore/arcane/stealth/
    // defense) -- a display name plus the same bannerImage shape quest-
    // chains'/raids' own `banner` field already uses (art override + 0-100
    // focus point), so the faint per-tag backdrop QuestTagBanner shows
    // behind every quest card (see QuestPanel.tsx) gets the same drag-to-
    // focus picker those two already have, rather than a hardcoded center
    // crop. defaultFolder/naming convention: public/lore/quest-tags/<id>.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      // previewAspect -- see quest-chains' own `banner` comment above.
      // Quest-tag art renders as a full-card faint wash (QuestTagBanner,
      // `.quest-tag-banner` in app.css) rather than a fixed strip, so
      // there's no single exact ratio the way chains/raids have; 3/1
      // approximates the typical card shape closely enough to preview
      // meaningfully, which is still far closer than the old generic box.
      banner: { type: 'bannerImage', required: false, defaultFolder: 'quest-tags', previewAspect: '3/1' },
    },
  },
  'difficulties': {
    file: 'difficulties.json',
    label: 'Quest Difficulties',
    group: 'Quests',
    idField: 'id',
    // The big one -- ~100 tunable values across 5 tiers, migrated out of a
    // hardcoded TS Record specifically so this could exist (see
    // quests.ts's own comment on the migration for the full "why now").
    // Only easy/normal actually carry burst*/medium* fields on disk today
    // -- they're optional here, not because every tier COULD have them,
    // but because hard/epic/legendary genuinely don't (see quests.ts's
    // own field-level docs on what burst/medium are for).
    //
    // Duration fields use hours/minutes here (not raw ms) -- same
    // friendly-unit-on-disk convention raid-encounters.json
    // (durationHours) and quest-chains.json (durationMinutes) already
    // established, converted back to ms in quests.ts at import time.
    // Every tier's main range is a whole number of hours and every
    // burst/medium range is a whole number of minutes, so no fractional
    // precision is lost either direction.
    //
    // A 0-valued burstChance/mediumChance is treated identically to the
    // field being absent on the read side (see quests.ts's `> 0` guard)
    // specifically because this devtool's own generic number-field editor
    // always writes an untouched optional number field as 0 rather than
    // omitting it (see app.js's fieldControl/readField) -- so simply
    // opening a non-burst tier like Hard and hitting Save would otherwise
    // plant a spurious burstChance: 0 here. Harmless either way at
    // runtime, but worth knowing if a save ever adds these fields to a
    // tier that didn't have them before.
    fields: {
      id: { type: 'string', required: true, slug: true },
      label: { type: 'string', required: true },
      baseSuccess: { type: 'number', required: true },
      minDurationHours: { type: 'number', required: true },
      maxDurationHours: { type: 'number', required: true },
      xpMultiplier: { type: 'number', required: true },
      lootChance: { type: 'number', required: true },
      // reqLevel -> referenceLevel + rewardMultiplier (patch 0214) --
      // reqLevel no longer gates which difficulty a quest offer can roll
      // at all (see QuestManager.rollReqLevel); referenceLevel survives
      // purely as the "typical level" balance.ts's burst/medium cap
      // heuristic reads, and rewardMultiplier drives the new level-scaled
      // standard-quest gold/xp curve. minGold/maxGold removed -- they
      // only ever fed the standard reward roll, which now reads that same
      // curve instead.
      referenceLevel: { type: 'number', required: true },
      rewardMultiplier: { type: 'number', required: true },
      weight: { type: 'number', required: true },
      color: { type: 'string', required: true },
      burstChance: { type: 'number', required: false },
      burstMinDurationMinutes: { type: 'number', required: false },
      burstMaxDurationMinutes: { type: 'number', required: false },
      burstMinGold: { type: 'number', required: false },
      burstMaxGold: { type: 'number', required: false },
      burstMinXp: { type: 'number', required: false },
      burstMaxXp: { type: 'number', required: false },
      mediumChance: { type: 'number', required: false },
      mediumMinDurationMinutes: { type: 'number', required: false },
      mediumMaxDurationMinutes: { type: 'number', required: false },
      mediumMinGold: { type: 'number', required: false },
      mediumMaxGold: { type: 'number', required: false },
      mediumMinXp: { type: 'number', required: false },
      mediumMaxXp: { type: 'number', required: false },
    },
  },
  'equipment': {
    file: 'equipment.json',
    label: 'Equipment',
    group: 'Items & Crafting',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      slot: { type: 'enum', required: true, options: ['weapon', 'helmet', 'chest', 'shield', 'gloves', 'boots', 'ring', 'amulet', 'cloak'] },
      rarity: { type: 'enum', required: true, options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] },
      reqLevel: { type: 'number', required: true },
      maxDurability: { type: 'number', required: true },
      value: { type: 'number', required: true },
      mods: { type: 'mods', required: false },
      stats: { type: 'stats', required: false },
      setId: { type: 'string', required: false },
      // `picker: 'icon'` is a frontend hint only -- server-side this
      // validates as a plain optional string (a relative path under
      // ICONS_DIR, e.g. "weapons/sword_03.png"), same as setId above.
      icon: { type: 'string', required: false, picker: 'icon' },
      // Both of these existed on disk (raidExclusive since Heroic/Legendary
      // raid loot variants were added, craftable since Crafting) but
      // weren't in this schema -- the editor rebuilds each entry from
      // scratch out of exactly the fields listed here (see openEditor's
      // save handler in app.js), so editing *any* field on an item that
      // had one of these silently dropped it on save. Confirmed the actual
      // cause, not a hypothetical: this is the same class of bug the
      // missing shield slot option was, just quieter, since nothing
      // rejects an entry for losing a field it didn't know about.
      raidExclusive: { type: 'boolean', required: false },
      craftable: { type: 'boolean', required: false },
      // Third of the three pool-exclusivity flags -- see the other two's
      // comment just above. True for an item whose only intended source
      // is a specific Quest Chain's guaranteed rewardItems payout; Shop,
      // Black Market, ordinary quest loot, and Peddler cards all filter
      // this out (see EquipmentDef.chainExclusive's own comment in
      // types.ts for the full writeup, including the direct content
      // review that found 34 items needing this retroactively).
      chainExclusive: { type: 'boolean', required: false },
      // Overrides HeroManager.gearScore's flat per-rarity value for this
      // item specifically -- for content where rarity alone undersells
      // how strong a piece actually is, e.g. a future higher-level raid's
      // "legendary" armour that should read as a bigger jump than an
      // ordinary legendary. Leave unset for the normal flat-rarity score.
      gearScoreOverride: { type: 'number', required: false },
    },
  },
  'consumables': {
    file: 'consumables.json',
    label: 'Consumables',
    group: 'Items & Crafting',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      cost: { type: 'number', required: true },
      glyph: { type: 'string', required: true },
      // Falls back to glyph when unset -- same convention equipment's icon
      // field already uses, same picker.
      icon: { type: 'string', required: false, picker: 'icon' },
      effect: { type: 'effect', required: true },
    },
  },
  'curios': {
    file: 'curios.json',
    label: 'Curios',
    group: 'Items & Crafting',
    idField: 'id',
    // Sellable odds-and-ends -- see CurioDef's own doc comment in
    // types.ts. Open-ended list, same shape as 'consumables' just above
    // (not 'materials' below, which is a fixed 4-entry set with no room
    // to grow) -- add/remove entries freely here.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      sellValue: { type: 'number', required: true },
      glyph: { type: 'string', required: true },
      icon: { type: 'string', required: false, picker: 'icon' },
    },
  },
  'materials': {
    file: 'materials.json',
    label: 'Materials',
    group: 'Items & Crafting',
    idField: 'id',
    // Only 4 entries (one per Harvest/Gathering node) -- migrated from a
    // hardcoded TS array specifically so `icon` below could be set without
    // hand-editing materials.ts directly, same reasoning the quest-chains
    // migration had at a much bigger scale.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      // Sub-tab label -- the node itself ("Quarry"), not the material noun
      // ("Ore"). See MaterialDef.nodeName's own comment.
      nodeName: { type: 'string', required: true },
      description: { type: 'string', required: true },
      glyph: { type: 'string', required: true },
      // Single stable icon for static UI (Crafting's materials-needed
      // list, Warehouse stock, scrap fly-up particles) -- falls back to
      // glyph when unset, same convention/picker as equipment/consumables.
      icon: { type: 'string', required: false, picker: 'icon' },
      // Pool of filenames for the falling-item Harvest animation's own
      // spawn-to-spawn variety -- deliberately separate from `icon` above
      // and NOT under the shared item-icons picker, since these live under
      // public/harvest-icons/ instead. Free-text list rather than a picker
      // for that reason (no cross-folder picker support in this DevTool
      // yet) -- same trade-off requiresChainId/dedicatedPetId elsewhere
      // already accept.
      icons: { type: 'string[]', required: false },
    },
  },
  'guild-rank-tiers': {
    file: 'guild-rank-tiers.json',
    label: 'Guild Rank Tiers',
    group: 'Systems & Balance',
    idField: 'id',
    // 6 fixed tiers, shared by two different threshold scales (a single
    // chain's own reqLevel, and the guild's total Guild Power -- see
    // guildRank.ts's own comment). Editing name/blurb/color here changes
    // both scales at once, since both just index into this same array;
    // there's no separate "chain tier" vs. "guild tier" content, only a
    // different number being measured against the same six labels.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      blurb: { type: 'string', required: true },
      color: { type: 'string', required: true },
    },
  },
  'pets': {
    file: 'pets.json',
    label: 'Pets',
    group: 'World Content',
    idField: 'id',
    // Rarity, bonus type, and bonus magnitude are NOT here on purpose --
    // those are rolled per-instance at hatch (see PetManager.hatch), not
    // authored per-species. This schema is purely "what a species looks
    // like and where it can come from," same split EquipmentDef keeps
    // between the def (fixed) and EquipmentItem (rolled/instance) shapes.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      glyph: { type: 'string', required: true },
      // Not an icon-picker field like equipment/consumables -- a pet has a
      // whole sprite FOLDER (idle.png at minimum, room for more later),
      // not a single icon file, so this is just a plain folder-name string
      // matching public/pets/<spriteFolder>/. Missing folder = pure glyph
      // fallback, same convention as everything else.
      spriteFolder: { type: 'string', required: true },
      // True = only obtainable via a dedicated-reward egg (see
      // EggInstance.dedicatedPetId on the quest/raid loot-assignment side)
      // -- excluded from the general random hatch pool entirely.
      dedicatedOnly: { type: 'boolean', required: false },
    },
  },
  'events': {
    file: 'events.json',
    label: 'Events',
    group: 'World Content',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      kind: { type: 'enum', required: true, options: ['positive', 'neutral', 'negative'] },
      weight: { type: 'number', required: true },
      effects: { type: 'eventEffects', required: false },
      minDifficulty: { type: 'enum', required: false, options: ['easy', 'normal', 'hard', 'epic', 'legendary'] },
    },
  },
  'injuries': {
    file: 'injuries.json',
    label: 'Injuries',
    group: 'World Content',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      durationHours: { type: 'number', required: true },
      mods: { type: 'mods', required: false },
      treatmentCost: { type: 'number', required: true },
      weight: { type: 'number', required: true },
      minDifficulty: { type: 'enum', required: false, options: ['easy', 'normal', 'hard', 'epic', 'legendary'] },
    },
  },
  'raid-encounters': {
    file: 'raid-encounters.json',
    label: 'Raid Encounters',
    group: 'Raids',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      flavour: { type: 'string', required: true },
      baseSuccess: { type: 'number', required: true },
      // Milliseconds under the hood (matches every other duration in this
      // game), but hours is a far more workable unit to type into a form.
      // Same convention injuries.json already uses (durationHours ->
      // durationMs) -- the conversion happens in raids.ts at load time, not
      // in this devtool, so this field is just a plain number here.
      durationHours: { type: 'number', required: true },
      rewardGold: { type: 'number', required: true },
      rewardXp: { type: 'number', required: true },
      // "defId@chance" strings, e.g. "dragon_blade@6" -- reuses the plain
      // string-list editor rather than needing a new field type for a
      // repeatable {defId, chance} shape.
      // "defId@chance" strings, e.g. "dragon_blade@6" -- still the on-disk
      // shape, but the frontend now renders this as a real item picker
      // (browsing /api/data/equipment) instead of a plain text-list editor.
      // See renderLootField in app.js.
      loot: { type: 'string[]', required: false, picker: 'lootTable' },
      // Optional -- an encounter with nothing here just uses `loot` at
      // every difficulty, same as before tiered pools existed. Same
      // picker, so filling these in is exactly as easy as the base list.
      lootHeroic: { type: 'string[]', required: false, picker: 'lootTable' },
      lootLegendary: { type: 'string[]', required: false, picker: 'lootTable' },
      // "<rarity>[:<dedicatedPetId>]@chance" strings, e.g. "rare@1" or
      // "epic:hatchery_hound@0.5" -- same reused string-list shape as loot
      // above, just no browsable picker (eggs aren't an EQUIPMENT id the
      // 'lootTable' picker knows how to query) -- plain text-list editing,
      // same as loot's own original pre-picker form. See
      // parseEggLootEntry in raids.ts for exactly how this is read.
      eggLoot: { type: 'string[]', required: false },
    },
  },
  'peddler-cards': {
    file: 'peddler-cards.json',
    label: 'Peddler Cards',
    group: 'World Content',
    idField: 'id',
    // Grimsby's card outcome pool -- a genuinely separate content type
    // from equipment/loot, not a reuse of the 'lootTable' picker (that
    // picker is built for string[] "defId@chance" LISTS, e.g.
    // raid-encounters' own `loot` field, not a single-item reference).
    // For a single-item reference, `itemId` below follows the exact
    // precedent crafting-recipes' own `resultDefId` already set: a plain
    // free-text string, no picker. Selection is two-level: `tier` is
    // rolled against the Tuning registry's peddler.tierWeight.* knobs
    // (pure balance, lives outside this file entirely), THEN one entry
    // from that tier's own pool here is picked weighted by `weight`
    // (content, tier-probability-free) -- see PeddlerManager.resolveFlip
    // and PeddlerCardDef's own comment in types.ts for the full design.
    fields: {
      id: { type: 'string', required: true, slug: true },
      tier: { type: 'enum', required: true, options: ['bust', 'refund', 'modest', 'good', 'jackpot'] },
      // Relative weight within this entry's OWN tier, not global -- see
      // the schema's own top comment.
      weight: { type: 'number', required: true },
      kind: {
        type: 'enum', required: true,
        options: ['nothing', 'joke', 'goldFlat', 'goldRefund', 'material', 'scrap', 'equipment', 'egg', 'curio'],
      },
      // Grimsby's own line when THIS specific card flips -- sleazy/comic
      // register throughout, even on a good outcome.
      flavorText: { type: 'string', required: true },
      // kind: 'joke' only -- display name on the flipped card ("A Rock").
      // Never a real item id; nothing outside this one field reads it,
      // which is exactly what keeps a joke entry from ever being
      // mistaken for (or leaking into) the real equipment/loot pools.
      jokeItemName: { type: 'string', required: false },
      goldAmount: { type: 'number', required: false }, // kind: goldFlat
      refundPercent: { type: 'number', required: false }, // kind: goldRefund, % of the fee just paid
      materialId: { type: 'enum', required: false, options: ['ore', 'timber', 'herbs', 'fish'] }, // kind: material
      materialAmount: { type: 'number', required: false }, // kind: material
      scrapAmount: { type: 'number', required: false }, // kind: scrap
      // kind: equipment -- two ways to specify what drops (see
      // PeddlerCardDef.itemRarity's own comment in types.ts):
      // itemRarity rolls a random eligible item at that rarity
      // (excludes raidExclusive/craftable/chain-reward items
      // automatically); itemId pins one specific item by id instead,
      // for the rare case that's actually wanted. Prefer itemRarity for
      // new cards -- itemId stays supported for existing/manual use.
      itemRarity: { type: 'enum', required: false, options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] },
      itemId: { type: 'string', required: false }, // kind: equipment -- an equipment.json id, free text (see top comment)
      eggRarity: { type: 'enum', required: false, options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] }, // kind: egg
      dedicatedPetId: { type: 'string', required: false }, // kind: egg, optional
      curioId: { type: 'string', required: false }, // kind: curio -- a curios.json id, free text (see top comment)
      // Single-emoji fallback for the icon-only card display -- used for
      // kind: joke/nothing (no real item to look an icon up from), and
      // as the final fallback for any other kind. Optional.
      glyph: { type: 'string', required: false },
      // Real icon for the generic kinds (nothing/joke/goldFlat/goldRefund/
      // scrap) -- e.g. a sack-of-gold icon for a goldFlat card. Same
      // picker/fallback-to-glyph convention as equipment/consumables/
      // materials' own `icon` fields above. material/equipment/egg/curio
      // kinds still pull their icon from the referenced def instead --
      // this is only useful for kinds that have no def to look one up
      // from.
      icon: { type: 'string', required: false, picker: 'icon' },
    },
  },
  // NOTE: there used to be a 'peddler-config' schema here -- a single
  // DevTool-configurable result-card background image. Removed: replaced
  // by three fixed result-card art files (public/peddler/cards/
  // result_0/1/2.png), chosen at random per reveal the same way the
  // face-down cards' own back_0/1/2.png already work -- see
  // PeddlerCardModal.tsx's own comment on `resultBackIndex`. Those don't
  // have a DevTool entry either, for the same reason.
  'guild-hall-decorations': {
    file: 'guild-hall-decorations.json',
    label: 'Guild Hall Decorations',
    group: 'World Content',
    idField: 'id',
    // Authoring for the content half of the Guild Hall decorations
    // feature -- see GuildHallDecorationDef's own doc comment in types.ts
    // and guildHallDecor.ts's file-level comment for the full picture.
    // The 30 physical slot instances (which pool each one draws from,
    // plus their position/size) are a separate concern -- identity
    // (which 30 slots exist, which pool each is) is code-owned
    // (guildHallSlots.ts), geometry is DevTool-owned (the
    // 'guildhall-slot-layout' schema just below) -- `slotType` here is
    // the POOL an item belongs to (any of the 16 wallTrinket slots,
    // either of the 2 wallCenterpiece slots, etc), not a specific one of
    // the 30 instances.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      slotType: {
        type: 'enum', required: true,
        options: ['banner', 'wallCenterpiece', 'trophyCase', 'centerpiece', 'middleShelf', 'lowerShelf', 'wallTrinket', 'corner', 'floorCenterpiece'],
      },
      // Flat fields, matching GuildHallDecorationDef's own flat
      // acquisitionKind/goldCost/achievementId shape (types.ts) exactly
      // as of patch 0211 -- same "category picks which other fields
      // matter" pattern crafting-recipes' own `category` field uses above
      // (see that schema's top comment): a `gold` entry leaves
      // achievementId empty and vice versa, nothing here enforces the
      // pairing. (Before patch 0211 this type was a nested discriminated
      // union the DevTool never actually wrote -- every decoration
      // authored here landed with no real acquisition data at all, which
      // crashed the in-game picker the instant an unowned one rendered.
      // Flattening the type to match this form, rather than adding a
      // nested-object transform on top of it, closed that gap.)
      acquisitionKind: { type: 'enum', required: true, options: ['gold', 'achievement', 'grimsby'] },
      goldCost: { type: 'number', required: false, min: 0 }, // acquisitionKind: gold
      achievementId: { type: 'string', required: false }, // acquisitionKind: achievement -- an achievements.json id, free text
      // Placement art -- see GuildHallDecorationDef.image's own doc
      // comment in types.ts for why this is a distinct field type from
      // raids/chains' `bannerImage` (contain vs cover). `previewAspect`
      // is left square (1/1) rather than per-slot-type, since a single
      // decoration entry has no one slot instance to size the preview
      // against (its slotType is a whole pool of differently-shaped
      // slots) -- close enough for judging fit; real per-slot sizing is
      // visible in-game in the Guild Hall's own "Customize" mode.
      image: { type: 'decorationImage', required: false, defaultFolder: '', previewAspect: '1/1' },
    },
  },
  // Which background themes exist for the Guild Hall (patch 0206) -- id/
  // display name plus a `background` art reference (picker: 'guildhallBg',
  // browsing GUILDHALL_ART_DIR the same way an icon field browses
  // ICONS_DIR). Deliberately just these three fields -- a theme is purely
  // a background-art choice, not its own bundle of slot geometry (that
  // lives in 'guildhall-slot-layout' below, cross-referenced by this
  // schema's own `id`). Rendered as the ordinary generic table (unlike
  // 'guildhall-slot-layout' just below), since add/edit/delete here is
  // exactly the right shape -- there's no fixed count or closed id set to
  // protect the way there is for slots themselves.
  'guildhall-themes': {
    file: 'guildhall-themes.json',
    label: 'Guild Hall Themes',
    group: 'World Content',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      background: { type: 'string', required: true, picker: 'guildhallBg' },
    },
  },
  // Geometry only (top/left/width/height, % of the background art's own
  // bounding box) -- id/label/slotType (which 30 slots exist at all) is
  // code-owned, see guildHallSlots.ts's own top comment for the full
  // "identity vs geometry" split and why. This schema exists purely so
  // the DevTool's own visual drag/resize tool (renderGuildHallSlotLayout-
  // View in app.js, dispatched on kind exactly like 'tuning' gets its own
  // grouped view) has somewhere real to load from and save back to,
  // reusing the exact same GET/POST /api/data/:kind plumbing every other
  // content type uses -- it is NOT rendered as a generic add/edit/delete
  // table (see the frontend dispatch), since adding or removing a row
  // here would silently desync from the fixed 30-id set `GuildHallSlotId`
  // (types.ts) closes over.
  //
  // As of patch 0206, each row also carries a `themeId` (a
  // 'guildhall-themes' id) -- geometry is per theme now, since different
  // background art puts its furniture in different places, and a theme
  // isn't required to place all 30 (some rooms just won't have every
  // piece of furniture -- see the DevTool's own per-theme show/hide
  // checklist). No `idField` is set on this schema on purpose: the
  // generic table/dupe-check machinery every other schema relies on
  // assumes one flat, globally-unique id, which `id` alone no longer is
  // now that the same slot id legitimately repeats once per theme --
  // `validateArray`'s own special case for this kind (see
  // GUILDHALL_SLOT_IDS below) does its own theme-scoped duplicate/
  // unknown-id checking instead, and the bespoke frontend view never
  // calls the generic add/edit/delete helpers that would have needed
  // `idField` anyway.
  'guildhall-slot-layout': {
    file: 'guildhall-slot-layout.json',
    label: 'Guild Hall Slot Layout',
    group: 'World Content',
    fields: {
      themeId: { type: 'string', required: true },
      id: { type: 'string', required: true },
      top: { type: 'number', required: true, min: 0, max: 100 },
      left: { type: 'number', required: true, min: 0, max: 100 },
      width: { type: 'number', required: true, min: 0, max: 100 },
      height: { type: 'number', required: true, min: 0, max: 100 },
    },
  },
  'raids': {
    file: 'raids.json',
    label: 'Raids',
    group: 'Raids',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      epilogue: { type: 'string', required: true },
      reqLevel: { type: 'number', required: true },
      // Ordered list of raid-encounter ids -- resolved sequentially in the
      // order they're listed here, stopping at the first failed encounter.
      encounterIds: { type: 'string[]', required: true },
      unlocksRaidId: { type: 'string', required: false },
      // Was defined on RaidDef and read by isRaidUnlocked (raids.ts) since
      // what_got_out/requiem_last_god shipped, but never actually exposed
      // here -- both of those raids' chain gate has only ever been
      // editable by hand-editing raids.json directly, not via this tool.
      // Same free-text, no-cross-entry-lookup trade-off as quest-chains'
      // own requiresChainId field above. Found while adding
      // successModifier below; fixed alongside it rather than filed
      // separately.
      requiresChainId: { type: 'string', required: false },
      // Flat percentage points added to every encounter's success chance
      // in this raid, independent of the global Normal/Heroic/Legendary
      // tiers -- see RaidDef.successModifier's own comment in types.ts.
      // Usually a small negative number for "slightly harder than its
      // baseSuccess numbers alone suggest"; optional, defaults to no
      // change.
      successModifier: { type: 'number', required: false },
      // See quest-chains' own `banner` field comment above -- identical
      // shape, just defaulting to the raids/ subfolder and the
      // raids/<id>.jpg naming convention RaidBanner already used.
      // previewAspect 5/1 approximates RaidBanner's most prominent use
      // (the raid-detail-modal strip, capped by .raid-detail-modal's own
      // 460px max-width) -- RaidBanner also renders as a 56x56 square
      // thumbnail (.raid-card-thumb) and a 48px-tall strip
      // (.raid-active-banner) elsewhere, so no single ratio is exact for
      // all three; this is the closest single default and still a large
      // accuracy improvement over the old generic 420x130 box for the
      // context players see most (the detail modal).
      banner: { type: 'bannerImage', required: false, defaultFolder: 'raids', previewAspect: '5/1' },
      // Mirrors quest-chains' own `title` field -- granted to every hero
      // in the clearing party on a full clear, rather than a single
      // hero, since a raid is a party effort. See RaidDef.title's own
      // comment in types.ts and HeroManager.grantTitle for the read/
      // write side.
      title: { type: 'string', required: false },
      // Per-raid configurable role-slot minimums (e.g. { melee: 2 }) --
      // optional, most raids should leave this unset entirely (no
      // requirement, exactly today's behaviour). Same kv-grid shape
      // `materials` already has, just keyed to the 3 Role values instead
      // -- see the `roleRequirements` case in validateEntry above, and
      // RaidDef.requiredRoles' own comment in types.ts.
      requiredRoles: { type: 'roleRequirements', required: false },
    },
  },
  'crafting-recipes': {
    file: 'crafting-recipes.json',
    label: 'Crafting Recipes',
    group: 'Items & Crafting',
    idField: 'id',
    // Three shapes in one schema, same "category picks which other fields
    // matter" pattern the game's own CraftingRecipeDef type uses (see
    // types.ts) -- a `gear` recipe leaves resultConsumableId/statOptions
    // etc empty and vice versa. Nothing here enforces that a `gear`
    // recipe actually fills in resultDefId rather than leaving the whole
    // thing pointless; same level of trust the rest of this tool already
    // extends (e.g. nothing stops a raid-encounters entry from listing
    // loot the shop would never sell). Restart the game after saving to
    // see a new or edited recipe, same as every other content type.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      category: { type: 'enum', required: true, options: ['gear', 'consumable', 'enchant', 'gem'] },
      icon: { type: 'string', required: false, picker: 'icon' },
      materialCost: { type: 'materials', required: true },
      goldCost: { type: 'number', required: true },
      // gem only -- Scrap is its own standalone currency (GameState.scrap),
      // not a MaterialId, so it can't fit into materialCost above.
      scrapCost: { type: 'number', required: false },
      // gear only -- an equipment id, ideally one with craftable: true set
      // on it (see the Equipment tab), so it doesn't also turn up in the
      // shop/black market/loot rolls with none of the mods a real craft
      // would give it.
      resultDefId: { type: 'string', required: false },
      modOptions: { type: 'modKeyList', required: false },
      modsToPick: { type: 'number', required: false },
      modValue: { type: 'number', required: false },
      // consumable only -- a consumables.json id.
      resultConsumableId: { type: 'string', required: false },
      // enchant only.
      statOptions: { type: 'statKeyList', required: false },
      statsToPick: { type: 'number', required: false },
      statValue: { type: 'number', required: false },
      // gem only -- which counter this recipe adds +1 to on craft
      // (GameState.gems or resistGems, for the given element). No
      // "toggle" the way rewardEgg needs (a gem recipe always needs one),
      // so this is always shown for a gem-category entry rather than
      // conditionally revealed.
      resultGem: { type: 'resultGem', required: false },
    },
  },
  'tuning': {
    file: 'tuning.json',
    label: 'Tuning',
    group: 'Systems & Balance',
    idField: 'id',
    // Flat scalar registry (see src/game/tuning.ts) -- fully generic, gets
    // a working editor for free from the same system every other content
    // type uses. Deliberately reuses this rather than building a bespoke
    // tuning UI for the first pass; a denser dedicated view (search,
    // grouped by category, current-vs-default at a glance) is a natural
    // follow-up once the underlying pattern is proven out with real use.
    fields: {
      id: { type: 'string', required: true },
      label: { type: 'string', required: true },
      category: { type: 'string', required: true },
      value: { type: 'number', required: true },
      default: { type: 'number', required: true },
      min: { type: 'number', required: false },
      max: { type: 'number', required: false },
      description: { type: 'string', required: true },
    },
  },
  'bard-tracks': {
    file: 'bard-tracks.json',
    label: 'Bard Tracks',
    group: 'Systems & Balance',
    idField: 'id',
    // Each track is unlocked by a specific achievement now, not bought --
    // see the matching entry's `unlocksTrackId` in the 'achievements'
    // schema just below. List order here is just display order. `path`
    // is relative to public/audio/ and follows the same "missing file
    // just does nothing" convention background-music.mp3 already
    // established in music.ts -- an entry can exist and be selectable in
    // Settings well before its mp3 actually lands on disk.
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      path: { type: 'string', required: true },
      credit: { type: 'string', required: false },
    },
  },
  'achievements': {
    file: 'achievements.json',
    label: 'Achievements',
    group: 'Systems & Balance',
    idField: 'id',
    // Editable here: name, description, hidden, unlocksTrackId. The
    // unlock CONDITION for each achievement id is not data — it's a
    // check function in AchievementManager.ts. Renaming an achievement,
    // rewriting its flavour text, or rewiring which bard track (if any)
    // it grants is fully safe and takes effect immediately; adding a
    // brand new achievement id here does nothing on its own until a
    // matching check is added in code. See DEVTOOL.md.
    fields: {
      id: { type: 'string', required: true, steamId: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      hidden: { type: 'boolean', required: true },
      unlocksTrackId: { type: 'string', required: false },
    },
  },
};

/**
 * Display order for the Dev Tool's top-level nav groups (server.mjs's
 * SCHEMAS[kind].group above), sent to the frontend alongside SCHEMAS so
 * group order lives here once rather than being re-decided in app.js.
 * Every `group` value used above must appear exactly once here -- checked
 * at startup just below, not left to silently mis-render if a future
 * content type's group typos or a new group is added to SCHEMAS without
 * updating this list.
 *
 * Ungrouped by design: within-group tab order is still whatever order
 * the content type appears in SCHEMAS (object key order), same as the
 * old flat tab bar used -- only the *grouping* changed, not each group's
 * internal ordering.
 */
const GROUP_ORDER = [
  'Heroes & Progression',
  'Quests',
  'Items & Crafting',
  'World Content',
  'Raids',
  'Systems & Balance',
  'Reference & Text',
];

{
  const declared = new Set(Object.values(SCHEMAS).map((s) => s.group));
  const listed = new Set(GROUP_ORDER);
  const missingFromOrder = [...declared].filter((g) => !listed.has(g));
  const unusedInOrder = [...listed].filter((g) => !declared.has(g));
  if (missingFromOrder.length > 0) {
    throw new Error(`GROUP_ORDER is missing group(s) used in SCHEMAS: ${missingFromOrder.join(', ')}`);
  }
  if (unusedInOrder.length > 0) {
    throw new Error(`GROUP_ORDER lists group(s) no SCHEMAS entry uses: ${unusedInOrder.join(', ')}`);
  }
}


// Kept in sync with the real `Modifiers` interface in types.ts by hand --
// confirmed against it directly (Aug 2026 DevTool clarity pass) after
// finding this list had drifted behind: `health`/`revivalDiscount`/
// `petHealth`/`petRevivalDiscount` all existed on the real type and were
// already being read by live game code, but weren't in this list, so the
// DevTool's generic `mods` editor would reject them outright as "unknown
// modifier" -- the same class of silent-gap bug the equipment schema's
// missing raidExclusive/craftable fields were. If Modifiers ever gains a
// new key, this list (and app.js's own copy, plus MOD_FIELD_INFO/
// EFFECT_FIELD_INFO below) needs updating by hand -- there's no automatic
// sync between the TS type and this plain JS array.
const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability', 'health', 'revivalDiscount', 'petHealth', 'petRevivalDiscount', 'repairDiscount', 'scrapBonus', 'consumableDiscount', 'enchantDiscount', 'blackMarketDiscount'];
// Same 4 elements as ElementType in types.ts -- used by the 'resultGem'
// field type below (Weapon Enchanting / Armour Infusion gem recipes).
const ELEMENT_KEYS = ['fire', 'frost', 'lightning', 'poison'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
// Same "found drifted behind the real type, fixed in the same pass"
// note as MOD_KEYS above -- ConsumableDef.effect (types.ts) has 12 more
// keys than this list had (xp/loot/injuryResist/speed/durability/health/
// restoreHealth/healthDamageReduction/revivalDiscount/petHealth/
// petRevivalDiscount/peddlerCounterReduction), all live on real crafted
// or hand-authored consumables today -- this was the single biggest gap
// found in the whole pass, not a hypothetical one.
const EFFECT_KEYS = [
  'success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability',
  'health', 'restoreHealth', 'healthDamageReduction', 'revivalDiscount',
  'petHealth', 'petRevivalDiscount', 'peddlerCounterReduction',
  'preventInjury', 'guaranteedGoodEvent', 'healInjury',
  // Fortune Charms (patch 0215) -- lootWeightStat is a string key name
  // (a Modifiers or Stats key, e.g. 'gold'/'xp'), not itself a numeric
  // effect value, so it's validated separately below rather than via the
  // generic numeric-field path every other EFFECT_KEYS entry uses.
  'lootWeightStat', 'lootWeightMultiplier',
];
const EVENT_EFFECT_KEYS = ['success', 'goldPct', 'flatGold', 'xpPct', 'loot', 'durability', 'delay', 'injury', 'guaranteedLoot'];
const MATERIAL_KEYS = ['ore', 'timber', 'herbs', 'fish'];
const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const CHAIN_STAGE_TAGS = ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'];
// Same 6 values as CHAIN_STAGE_TAGS above (both are just QuestTag's full
// enum) -- kept as its own named constant rather than reused directly,
// so `questTagList`'s error message reads in terms of what it actually
// validates (hero-classes' `preferred` field) rather than borrowing a
// name that says "chain stage."
const QUEST_TAG_KEYS = ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'];
// The 3 Role values -- see types.ts's Role. Used by `roleFlavors` (a
// required 3-key text map on hero-classes) and `roleRequirements` (an
// optional, partial numeric map on raids).
const ROLE_KEYS = ['melee', 'ranged', 'caster'];
const CHAIN_STAGE_DIFFICULTIES = ['easy', 'normal', 'hard', 'epic', 'legendary'];
// Every field a single stage row needs -- durationMinutes, not duration,
// same human-friendly-unit convention raid-encounters.json's durationHours
// already established (quests.ts converts back to ms on load).
const CHAIN_STAGE_FIELDS = ['name', 'flavour', 'tag', 'difficulty', 'durationMinutes', 'goldMultiplier'];

function validateEntry(schema, entry, index) {
  const errors = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    const value = entry[key];
    const present = value !== undefined && value !== null && value !== '';
    if (spec.required && !present) {
      errors.push(`entry ${index}: "${key}" is required`);
      continue;
    }
    if (!present) continue;
    switch (spec.type) {
      case 'string':
        if (typeof value !== 'string') errors.push(`entry ${index}: "${key}" must be text`);
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`entry ${index}: "${key}" must be a number`);
        break;
      case 'enum':
        if (!spec.options.includes(value)) errors.push(`entry ${index}: "${key}" must be one of ${spec.options.join(', ')}`);
        break;
      case 'string[]':
        // An optional list field (e.g. rewardItems, or raid-encounters'
        // loot/lootHeroic/lootLegendary/eggLoot) legitimately means "nothing
        // to award/drop here" as an empty array -- the_last_clutch's
        // rewardItems is exactly this: [] on purpose, since its guaranteed
        // reward is an egg (rewardEgg), not an item. Only a genuinely
        // required list field (quest-templates' subjects/flavour) should
        // reject being empty; this used to reject both cases identically,
        // which meant any save touching quest-chains.json failed outright
        // the moment it validated the_last_clutch or last_pilgrimage,
        // regardless of what was actually being edited.
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
          errors.push(`entry ${index}: "${key}" must be a list of text`);
        } else if (spec.required && value.length === 0) {
          errors.push(`entry ${index}: "${key}" must be a non-empty list of text`);
        }
        break;
      case 'mods':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!MOD_KEYS.includes(k)) errors.push(`entry ${index}: unknown modifier "${k}"`);
        break;
      case 'stats':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!STAT_KEYS.includes(k)) errors.push(`entry ${index}: unknown stat "${k}"`);
        break;
      case 'effect':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!EFFECT_KEYS.includes(k)) errors.push(`entry ${index}: unknown effect key "${k}"`);
        break;
      case 'eventEffects':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else {
          for (const k of Object.keys(value)) if (!EVENT_EFFECT_KEYS.includes(k)) errors.push(`entry ${index}: unknown effect key "${k}"`);
          // guaranteedLoot is EventDef.effects' one non-numeric,
          // non-boolean key (a Rarity string, not a percentage or a
          // flat amount) -- found rendering as a plain number input in
          // the DevTool's generic kv-grid (same shared editor every
          // other numeric mods/effects/stats field uses), which meant
          // typing anything into it saved a garbage number instead of a
          // real rarity string. Fixed on the frontend (see app.js's
          // kvGrid, now a rarity <select> for this one key
          // specifically) -- this server-side check is the backstop, so
          // a save can't silently accept the old broken shape either.
          if (value.guaranteedLoot !== undefined && !RARITY_KEYS.includes(value.guaranteedLoot)) {
            errors.push(`entry ${index}: "${key}.guaranteedLoot" must be one of ${RARITY_KEYS.join(', ')}`);
          }
        }
        break;
      case 'materials':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!MATERIAL_KEYS.includes(k)) errors.push(`entry ${index}: unknown material "${k}"`);
        break;
      case 'modKeyList':
        if (!Array.isArray(value) || value.some((v) => !MOD_KEYS.includes(v))) {
          errors.push(`entry ${index}: "${key}" must only contain ${MOD_KEYS.join(', ')}`);
        }
        break;
      case 'statKeyList':
        if (!Array.isArray(value) || value.some((v) => !STAT_KEYS.includes(v))) {
          errors.push(`entry ${index}: "${key}" must only contain ${STAT_KEYS.join(', ')}`);
        }
        break;
      case 'questTagList':
        if (!Array.isArray(value) || value.length === 0 || value.some((v) => !QUEST_TAG_KEYS.includes(v))) {
          errors.push(`entry ${index}: "${key}" must be a non-empty list containing only ${QUEST_TAG_KEYS.join(', ')}`);
        }
        break;
      case 'roleFlavors':
      case 'roleDescriptions':
        // Every class needs a name for all 3 roles (the native role's own
        // entry equals its own `name`, the other two are the Training
        // flavour names) -- required and complete, unlike `mods`/`stats`
        // which are legitimately partial. Same rule for roleDescriptions'
        // 3 flavour-text blurbs -- both types share this case since the
        // shape (required, complete, 3 Role keys, text) is identical.
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`entry ${index}: "${key}" must be an object`);
        } else {
          for (const k of ROLE_KEYS) {
            if (typeof value[k] !== 'string' || value[k].trim() === '') {
              errors.push(`entry ${index}: "${key}.${k}" is required and must be text`);
            }
          }
          for (const k of Object.keys(value)) if (!ROLE_KEYS.includes(k)) errors.push(`entry ${index}: unknown role "${k}" in "${key}"`);
        }
        break;
      case 'roleRequirements':
        // Partial on purpose -- most raids have no requirement at all
        // (omit the field entirely), and a raid that does have one
        // rarely wants all 3 roles specified.
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`entry ${index}: "${key}" must be an object`);
        } else {
          for (const k of Object.keys(value)) {
            if (!ROLE_KEYS.includes(k)) errors.push(`entry ${index}: unknown role "${k}" in "${key}"`);
            else if (typeof value[k] !== 'number' || value[k] < 0) errors.push(`entry ${index}: "${key}.${k}" must be a non-negative number`);
          }
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`entry ${index}: "${key}" must be true or false`);
        break;
      case 'eggReward':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`entry ${index}: "${key}" must be an object`);
        } else {
          if (!RARITY_KEYS.includes(value.rarity)) errors.push(`entry ${index}: "${key}.rarity" must be one of ${RARITY_KEYS.join(', ')}`);
          if (value.dedicatedPetId !== undefined && typeof value.dedicatedPetId !== 'string') {
            errors.push(`entry ${index}: "${key}.dedicatedPetId" must be text`);
          }
          for (const k of Object.keys(value)) {
            if (k !== 'rarity' && k !== 'dedicatedPetId') errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
          }
        }
        break;
      case 'bannerImage':
        // Optional -- omitted means "use the folder/id.jpg convention at
        // dead-center focus," same as before this field existed at all
        // (see ChainBanner/RaidBanner's own fallback). When present it's
        // always an object (readField in app.js never emits a bare string
        // or omits it entirely unless there's truly nothing to record).
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`entry ${index}: "${key}" must be an object`);
          break;
        }
        if (value.path !== undefined) {
          // Real files in public/lore/ (and its subfolders) routinely have
          // spaces in their names -- "Ancient Crown.png", "Goblin
          // Warband.png", etc, all currently sitting in public/lore/chains/
          // -- but the old pattern only allowed `[\w.-]` per segment, so
          // picking any of those from the banner picker (which reads real
          // on-disk filenames verbatim, see listBanners/bannerRelPath)
          // produced a path this regex then rejected as invalid, even
          // though the file is exactly where the error message says it
          // should be. Each segment now allows spaces alongside word
          // characters, dots, and hyphens, and must still *start* with a
          // word character -- so a segment can never be `.` or `..` or open
          // with a stray space, which keeps this from also becoming a path-
          // traversal hole while it's being loosened.
          if (typeof value.path !== 'string' || !/^[\w][\w .-]*(\/[\w][\w .-]*)*\.(png|jpg|jpeg|webp|gif)$/i.test(value.path)) {
            errors.push(`entry ${index}: "${key}.path" must be a relative image path under public/lore/ (e.g. "chains/foo.jpg")`);
          }
        }
        for (const axis of ['focusX', 'focusY']) {
          if (value[axis] === undefined) continue;
          if (typeof value[axis] !== 'number' || value[axis] < 0 || value[axis] > 100) {
            errors.push(`entry ${index}: "${key}.${axis}" must be a number between 0 and 100`);
          }
        }
        // Optional zoom, independent of focusX/focusY -- 100 means "no
        // zoom" (backgroundSize stays the existing plain 'cover'), up to
        // 300 for a fairly tight crop. Same "only recorded when it
        // actually differs from the default" convention focusX/focusY
        // use (see readField in app.js), so an untouched field keeps
        // saving identically to before this existed.
        if (value.scale !== undefined) {
          if (typeof value.scale !== 'number' || value.scale < 100 || value.scale > 300) {
            errors.push(`entry ${index}: "${key}.scale" must be a number between 100 and 300`);
          }
        }
        for (const k of Object.keys(value)) {
          if (!['path', 'focusX', 'focusY', 'scale'].includes(k)) errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
        }
        break;
      case 'decorationImage':
        // Same overall shape as bannerImage just above (optional object,
        // path/focusX/focusY/scale), but two real differences: there's no
        // folder/id.jpg fallback convention to omit-and-inherit (a
        // decoration has no "default" art the way a chain/raid does), and
        // `path` is relative to public/decor/ instead of public/lore/. See
        // GuildHallDecorationDef.image's own doc comment in types.ts for
        // why the render semantics (contain, not cover) differ too --
        // that only matters client-side, this validation shape is
        // otherwise identical.
        if (value === undefined) break;
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`entry ${index}: "${key}" must be an object`);
          break;
        }
        if (value.path !== undefined) {
          if (typeof value.path !== 'string' || !/^[\w][\w .-]*(\/[\w][\w .-]*)*\.(png|jpg|jpeg|webp|gif)$/i.test(value.path)) {
            errors.push(`entry ${index}: "${key}.path" must be a relative image path under public/decor/ (e.g. "wallTrinket/foo.png")`);
          }
        }
        for (const axis of ['focusX', 'focusY']) {
          if (value[axis] === undefined) continue;
          if (typeof value[axis] !== 'number' || value[axis] < 0 || value[axis] > 100) {
            errors.push(`entry ${index}: "${key}.${axis}" must be a number between 0 and 100`);
          }
        }
        // Unlike bannerImage's 100-300 zoom-only range, decoration art
        // routinely needs shrinking (a raw item-sheet crop is often much
        // bigger than the slot it's going into) as often as enlarging --
        // see the field's own doc comment in types.ts.
        if (value.scale !== undefined) {
          if (typeof value.scale !== 'number' || value.scale < 25 || value.scale > 300) {
            errors.push(`entry ${index}: "${key}.scale" must be a number between 25 and 300`);
          }
        }
        for (const k of Object.keys(value)) {
          if (!['path', 'focusX', 'focusY', 'scale'].includes(k)) errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
        }
        break;
      case 'resultGem':
        // Only meaningful (and only required) on a `gem`-category recipe --
        // an entry of any other category just leaves this undefined, same
        // "not every field applies to every category" trust level this
        // schema already extends everywhere else (see this schema's own
        // top comment).
        if (value === undefined) break;
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`entry ${index}: "${key}" must be an object`);
        } else {
          if (!['elemental', 'resist'].includes(value.kind)) {
            errors.push(`entry ${index}: "${key}.kind" must be "elemental" or "resist"`);
          }
          if (!ELEMENT_KEYS.includes(value.element)) {
            errors.push(`entry ${index}: "${key}.element" must be one of ${ELEMENT_KEYS.join(', ')}`);
          }
          // GemTier, added patch 0237 ("Tiered Enchanting/Infusion") -- a
          // plain alias of Rarity, reusing RARITY_KEYS rather than a new
          // list, same "Common through Legendary" ladder every other
          // 5-tier field in this schema already validates against.
          if (!RARITY_KEYS.includes(value.tier)) {
            errors.push(`entry ${index}: "${key}.tier" must be one of ${RARITY_KEYS.join(', ')}`);
          }
          for (const k of Object.keys(value)) {
            if (k !== 'kind' && k !== 'element' && k !== 'tier') errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
          }
        }
        break;
      case 'chainStages':
        if (!Array.isArray(value) || value.length === 0) {
          errors.push(`entry ${index}: "${key}" must be a non-empty list of stages`);
          break;
        }
        value.forEach((stage, si) => {
          if (typeof stage !== 'object' || Array.isArray(stage) || stage === null) {
            errors.push(`entry ${index}, stage ${si}: must be an object`);
            return;
          }
          for (const f of CHAIN_STAGE_FIELDS) {
            if (stage[f] === undefined || stage[f] === null || stage[f] === '') {
              errors.push(`entry ${index}, stage ${si}: "${f}" is required`);
            }
          }
          if (stage.tag !== undefined && !CHAIN_STAGE_TAGS.includes(stage.tag)) {
            errors.push(`entry ${index}, stage ${si}: "tag" must be one of ${CHAIN_STAGE_TAGS.join(', ')}`);
          }
          if (stage.difficulty !== undefined && !CHAIN_STAGE_DIFFICULTIES.includes(stage.difficulty)) {
            errors.push(`entry ${index}, stage ${si}: "difficulty" must be one of ${CHAIN_STAGE_DIFFICULTIES.join(', ')}`);
          }
          if (stage.durationMinutes !== undefined && (typeof stage.durationMinutes !== 'number' || stage.durationMinutes <= 0)) {
            errors.push(`entry ${index}, stage ${si}: "durationMinutes" must be a positive number`);
          }
          if (stage.goldMultiplier !== undefined && typeof stage.goldMultiplier !== 'number') {
            errors.push(`entry ${index}, stage ${si}: "goldMultiplier" must be a number`);
          }
          for (const k of Object.keys(stage)) {
            if (!CHAIN_STAGE_FIELDS.includes(k)) errors.push(`entry ${index}, stage ${si}: unknown key "${k}"`);
          }
        });
        break;
    }
    if (spec.slug && typeof value === 'string' && !/^[a-z][a-z0-9_]*$/.test(value)) {
      errors.push(`entry ${index}: "${key}" should be lowercase_with_underscores (got "${value}")`);
    }
    if (spec.steamId && typeof value === 'string' && !/^[A-Z][A-Z0-9_]*$/.test(value)) {
      errors.push(`entry ${index}: "${key}" should be UPPER_SNAKE_CASE, matching Steam's achievement API name convention (got "${value}")`);
    }
  }
  return errors;
}

function validateArray(kind, data) {
  const schema = SCHEMAS[kind];
  if (!Array.isArray(data)) return [`${schema.label}: data must be a list`];
  const errors = [];
  data.forEach((entry, i) => errors.push(...validateEntry(schema, entry, i)));
  if (schema.idField) {
    const ids = data.map((e) => e[schema.idField]).filter(Boolean);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`duplicate id(s): ${[...new Set(dupes)].join(', ')}`);
  }
  // 'guildhall-slot-layout' is geometry for a fixed, code-owned set of 30
  // slot ids (see guildHallSlots.ts / GUILDHALL_SLOT_META's own comments)
  // -- the per-field checks above already confirm every entry HAS a
  // themeId/id/top/left/width/height, but say nothing about which ids are
  // actually allowed, or about uniqueness (this schema deliberately has
  // no `idField`, see its own comment, since the same slot id legitimately
  // repeats once per theme). Checked per theme, not as one flat list, so
  // two different themes both placing a slot called "banner" is correct,
  // not a collision. As of patch 0206 a theme is no longer required to
  // use all 30 (see the DevTool's own per-theme show/hide checklist) --
  // only "no unknown ids" and "no id repeated within the same theme" are
  // actually enforced; a theme with fewer than 30 rows is just a theme
  // that hides some furniture, not an error.
  if (kind === 'guildhall-slot-layout') {
    const byTheme = new Map();
    for (const e of data) {
      if (!e.themeId || !e.id) continue;
      if (!byTheme.has(e.themeId)) byTheme.set(e.themeId, []);
      byTheme.get(e.themeId).push(e.id);
    }
    for (const [themeId, ids] of byTheme) {
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length) errors.push(`theme "${themeId}": duplicate slot id(s): ${[...new Set(dupes)].join(', ')}`);
      const unknown = ids.filter((id) => !GUILDHALL_SLOT_IDS.includes(id));
      if (unknown.length) errors.push(`theme "${themeId}": unknown slot id(s), not one of the fixed 30: ${[...new Set(unknown)].join(', ')}`);
    }
  }
  return errors;
}

/* ---------------------------------------------------------------- patches --- */
// Applying a patch, committing, and building are the same handful of commands
// every time — this wraps them behind buttons instead of copy-pasted shell
// lines. It only ever runs a small, fixed set of git/npm subcommands, and the
// one piece of user input that reaches a shell (the patch filename) is always
// checked against the real directory listing first, never passed through raw.

const GIT_TIMEOUT_MS = 20_000;
const BUILD_TIMEOUT_MS = 5 * 60_000;
const PACKAGE_TIMEOUT_MS = 10 * 60_000;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function run(cmd, args, timeout, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: ROOT, timeout, maxBuffer: 20 * 1024 * 1024, ...opts,
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
    // execFile rejects on non-zero exit; that's a normal outcome here (e.g. a
    // failed `git apply --check`), not a tool malfunction, so it's reported
    // back as data rather than re-thrown.
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : -1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err.message ?? err),
      timedOut: !!err.killed && err.signal === 'SIGTERM',
    };
  }
}

/**
 * npm on Windows is npm.cmd, a shell shim rather than a real executable —
 * execFile can't run it directly and fails with `spawn EINVAL` (a well-known
 * Node/Windows gotcha, not specific to this project). shell:true routes it
 * through cmd.exe instead. Git commands don't need this — git.exe is a real
 * binary on every platform — so this is deliberately npm-only rather than a
 * blanket shell:true on every command here, which would also make the
 * commit-message path (arbitrary user text) harder to reason about safely.
 */
async function runNpm(args, timeout) {
  return run(NPM_BIN, args, timeout, { shell: process.platform === 'win32' });
}

/**
 * Copies the most-recently-modified installer out of release/ (produced by
 * `npm run package`, see the /api/patches/package handler) into
 * BUILD_COPY_TARGET -- see that constant's own comment for why that
 * particular folder. Deliberately manual, not chained onto the Package step
 * automatically: a dev might run Package several times while iterating
 * before the result is actually the one worth sharing, and a copy step that
 * fires on every single build would silently overwrite whatever's already
 * sitting in the Drive folder each time, even a half-broken interim build.
 * Windows-only, matching the target path itself -- reported back as data
 * (not thrown) on any other platform, same "expected outcome, not a tool
 * malfunction" reasoning run() uses for a failed git/npm command.
 */
async function copyLatestBuild() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      stdout: '',
      stderr: `${BUILD_COPY_TARGET} is a Windows path -- this button only works when the DevTool itself is running on Windows. Copy the file from ${RELEASE_DIR} by hand on this platform.`,
    };
  }
  let entries;
  try {
    entries = await fs.readdir(RELEASE_DIR, { withFileTypes: true });
  } catch {
    return { ok: false, stdout: '', stderr: `No ${RELEASE_DIR} folder yet -- run Package (step 7) first.` };
  }
  const candidates = [];
  for (const entry of entries) {
    // NSIS (the configured Windows target) drops the real installer as a
    // loose .exe directly in release/, alongside a win-unpacked/ folder and
    // some non-installer housekeeping files (.blockmap, latest.yml) that
    // aren't what anyone actually wants copied to a share folder.
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.exe') continue;
    const full = path.join(RELEASE_DIR, entry.name);
    const stat = await fs.stat(full);
    candidates.push({ full, name: entry.name, mtimeMs: stat.mtimeMs });
  }
  if (candidates.length === 0) {
    return { ok: false, stdout: '', stderr: `No .exe installer found in ${RELEASE_DIR} -- run Package (step 7) first.` };
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  try {
    await fs.mkdir(BUILD_COPY_TARGET, { recursive: true });
    const destPath = path.join(BUILD_COPY_TARGET, latest.name);
    await fs.copyFile(latest.full, destPath);
    return { ok: true, stdout: `Copied ${latest.name} -> ${destPath}`, stderr: '' };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err.message ?? String(err) };
  }
}

/* --------------------------------------------------------------- sim --- */
// Sandbox sim runner. execFile (used by run()/runNpm() above) has no way to
// pipe data to a child's stdin, and the sim worker needs a JSON payload on
// stdin (see runSim.ts) rather than argv -- argv has practical length limits
// and would mean shell-escaping an arbitrary tuning-overrides object, stdin
// avoids both. So this gets its own spawn-based helper instead of reusing
// run().
const SIM_TIMEOUT_MS = 5 * 60_000; // a multi-year sim can be a lot of ticks; give it real headroom
const TSX_BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

async function readSimPresets() {
  const raw = await fs.readFile(SIM_PRESETS_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Runs exactly one variant (preset + a single overrides object) in its own
 *  fresh tsx process. Never throws -- failures come back as {ok:false} data,
 *  same convention run() above uses, so a bad override or a sim crash shows
 *  up in the Sandbox tab's result panel rather than as a 500. */
function runSimVariant(payload) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(TSX_BIN, [SIM_SCRIPT], { cwd: ROOT, timeout: SIM_TIMEOUT_MS });
    } catch (err) {
      resolve({ ok: false, error: String(err.message ?? err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      // ENOENT here almost always means `npm install` hasn't picked up the
      // new tsx devDependency yet -- worth saying plainly rather than
      // surfacing a raw spawn error.
      const hint = err.code === 'ENOENT' ? ' (tsx not found -- run `npm install`, it was added as a devDependency for this feature.)' : '';
      resolve({ ok: false, error: String(err.message ?? err) + hint });
    });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        resolve({
          ok: false,
          error: stderr.trim() || `sim process exited with code ${code}`,
          timedOut: signal === 'SIGTERM',
        });
        return;
      }
      try {
        resolve({ ok: true, result: JSON.parse(stdout) });
      } catch (err) {
        resolve({ ok: false, error: `Could not parse sim output: ${err.message}`, raw: stdout.slice(0, 2000) });
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function listPatchFiles() {
  const found = [];
  const dirs = [ROOT, path.join(ROOT, 'patches')];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.patch')) {
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full);
        found.push({
          name: entry.name,
          dir: path.relative(ROOT, dir) || '.',
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found;
}

/** Resolves a client-supplied filename to a real, whitelisted patch path. Never trusts the client's path directly. */
async function resolvePatchPath(name) {
  const files = await listPatchFiles();
  const match = files.find((f) => f.name === name);
  if (!match) return null;
  return path.join(ROOT, match.dir, match.name);
}

async function gitStatus() {
  const status = await run('git', ['status', '--porcelain'], GIT_TIMEOUT_MS);
  const log = await run('git', ['log', '-1', '--oneline'], GIT_TIMEOUT_MS);
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_TIMEOUT_MS);
  // No upstream configured is a normal outcome (e.g. a brand-new branch),
  // not a tool malfunction, so a failure here just means null rather than
  // getting surfaced as an error -- the Push button's own result block is
  // where a real "no upstream" failure gets shown, from git itself.
  const upstream = await run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], GIT_TIMEOUT_MS);
  return {
    clean: status.ok && status.stdout.trim() === '',
    statusText: status.stdout,
    lastCommit: log.stdout.trim(),
    branch: branch.stdout.trim(),
    upstream: upstream.ok ? upstream.stdout.trim() : null,
  };
}

async function readPackageVersion() {
  try {
    const raw = await fs.readFile(path.join(ROOT, 'package.json'), 'utf8');
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

async function listGitTags() {
  const result = await run('git', ['tag', '--list', '--sort=-creatordate'], GIT_TIMEOUT_MS);
  return result.ok ? result.stdout.split('\n').filter(Boolean).slice(0, 10) : [];
}

/* -------------------------------------------------------------- icons --- */
// Icons are just files on disk, grouped by whatever subfolder they sit in
// under public/item-icons/ -- no manifest to keep in sync, drop a file in a
// folder and it shows up in the picker on next open. Only real image
// extensions are listed, so stray .gitkeep placeholders (used to make the
// empty category folders exist in git, which doesn't track empty dirs) or
// any other clutter never shows up as a broken thumbnail.
const ICON_EXTENSIONS = /\.(png|jpg|jpeg|webp|gif)$/i;

async function listIcons() {
  let topEntries;
  try {
    topEntries = await fs.readdir(ICONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(ICONS_DIR, entry.name);
    let files;
    try {
      files = (await fs.readdir(folderPath)).filter((f) => ICON_EXTENSIONS.test(f));
    } catch {
      continue;
    }
    if (files.length > 0) folders.push({ name: entry.name, files: files.sort() });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return folders;
}

// Same shape as listIcons's output ({name, files}[]), but public/lore/ also
// has real loose images sitting directly in its root (guild-hall-bg.jpg,
// raids-bg.jpg, etc) rather than only inside subfolders -- those get
// grouped under a synthetic "(general)" entry rather than being dropped,
// since a banner override is free to point at any of them, not just the
// chains/ or raids/ subfolder its own content type defaults to.
const GENERAL_BANNER_FOLDER = '(general)';

async function listBanners() {
  let topEntries;
  try {
    topEntries = await fs.readdir(BANNERS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  const rootFiles = topEntries
    .filter((e) => e.isFile() && ICON_EXTENSIONS.test(e.name))
    .map((e) => e.name)
    .sort();
  if (rootFiles.length > 0) folders.push({ name: GENERAL_BANNER_FOLDER, files: rootFiles });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(BANNERS_DIR, entry.name);
    let files;
    try {
      files = (await fs.readdir(folderPath)).filter((f) => ICON_EXTENSIONS.test(f));
    } catch {
      continue;
    }
    if (files.length > 0) folders.push({ name: entry.name, files: files.sort() });
  }
  // "(general)" first (it's the loose-file catch-all, not a real category),
  // everything else alphabetical after it.
  folders.sort((a, b) => {
    if (a.name === GENERAL_BANNER_FOLDER) return -1;
    if (b.name === GENERAL_BANNER_FOLDER) return 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

// Same loose-root-files-plus-subfolders shape as listBanners, rooted at
// DECOR_DIR instead -- decoration art has no fixed category set yet (the
// content type is brand new, patch 0202), so this supports organizing by
// slot type (public/decor/wallTrinket/, public/decor/banner/, etc) once
// there's enough art to want that, without forcing subfolders from day
// one the way ICONS_DIR's listIcons does.
const GENERAL_DECOR_FOLDER = '(general)';

async function listDecorArt() {
  let topEntries;
  try {
    topEntries = await fs.readdir(DECOR_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  const rootFiles = topEntries
    .filter((e) => e.isFile() && ICON_EXTENSIONS.test(e.name))
    .map((e) => e.name)
    .sort();
  if (rootFiles.length > 0) folders.push({ name: GENERAL_DECOR_FOLDER, files: rootFiles });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(DECOR_DIR, entry.name);
    let files;
    try {
      files = (await fs.readdir(folderPath)).filter((f) => ICON_EXTENSIONS.test(f));
    } catch {
      continue;
    }
    if (files.length > 0) folders.push({ name: entry.name, files: files.sort() });
  }
  folders.sort((a, b) => {
    if (a.name === GENERAL_DECOR_FOLDER) return -1;
    if (b.name === GENERAL_DECOR_FOLDER) return 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

// Same loose-root-files-plus-subfolders shape again, rooted at
// GUILDHALL_ART_DIR -- patch 0206's 'guildhall-themes' content type uses
// this to let a theme's `background` field pick from whatever's actually
// in public/guildhall-customize/, same as decor/banner art. The
// established convention (each theme gets its own subfolder, e.g.
// guild_hall/bg.jpg) means most real usage will show up under real
// per-theme folder names rather than the "(general)" bucket, but loose
// root files are still supported for anything not yet organized that way.
const GENERAL_GUILDHALL_FOLDER = '(general)';

async function listGuildhallArt() {
  let topEntries;
  try {
    topEntries = await fs.readdir(GUILDHALL_ART_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  const rootFiles = topEntries
    .filter((e) => e.isFile() && ICON_EXTENSIONS.test(e.name))
    .map((e) => e.name)
    .sort();
  if (rootFiles.length > 0) folders.push({ name: GENERAL_GUILDHALL_FOLDER, files: rootFiles });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(GUILDHALL_ART_DIR, entry.name);
    let files;
    try {
      files = (await fs.readdir(folderPath)).filter((f) => ICON_EXTENSIONS.test(f));
    } catch {
      continue;
    }
    if (files.length > 0) folders.push({ name: entry.name, files: files.sort() });
  }
  folders.sort((a, b) => {
    if (a.name === GENERAL_GUILDHALL_FOLDER) return -1;
    if (b.name === GENERAL_GUILDHALL_FOLDER) return 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

/* ------------------------------- dev server -------------------------------- */
// `npm run dev` doesn't exit — it starts Vite and Electron and runs until
// stopped. That's a different shape from check/apply/commit/build (which run
// to completion and report a result), so it gets its own start/stop/status
// trio instead of reusing run(): started detached and unref'd so it outlives
// this request, tracked by PID, and stopped by killing the whole process
// tree — killing just the top process would leave Vite/Electron orphaned,
// since npm spawns them as children of the shell it runs under.


let devProcess = null; // { pid, startedAt }

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killProcessTree(pid) {
  if (process.platform === 'win32') {
    await run('taskkill', ['/pid', String(pid), '/T', '/F'], GIT_TIMEOUT_MS);
  } else {
    try {
      process.kill(-pid, 'SIGTERM'); // negative pid = whole process group (see detached below)
    } catch {
      /* already gone */
    }
  }
}

function startDevServer() {
  if (devProcess && isPidAlive(devProcess.pid)) {
    return { ok: false, error: 'Dev server already running.' };
  }
  const child = spawn(NPM_BIN, ['run', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  devProcess = { pid: child.pid, startedAt: Date.now() };
  return { ok: true, pid: child.pid };
}

async function stopDevServer() {
  if (!devProcess || !isPidAlive(devProcess.pid)) {
    devProcess = null;
    return { ok: false, error: 'Dev server is not running.' };
  }
  await killProcessTree(devProcess.pid);
  devProcess = null;
  return { ok: true };
}

function devServerStatus() {
  if (devProcess && isPidAlive(devProcess.pid)) return { running: true, ...devProcess };
  return { running: false };
}

/* -------------------------------------------------------------- discord --- */
// Posts dev updates / patch notes to a Discord channel via an incoming
// webhook. Nothing here needs a bot, a token, or any dependency beyond the
// `fetch` that's been global in Node since 18 (already the project's stated
// minimum — see README). The webhook URL itself is treated as a secret: it
// lives only in DISCORD_CONFIG_PATH (gitignored) and is never echoed back to
// the client in full, only as a masked preview, so a screen-share of the dev
// tool doesn't leak it.

async function readDiscordConfig() {
  try {
    const raw = await fs.readFile(DISCORD_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { webhookUrl: typeof parsed.webhookUrl === 'string' ? parsed.webhookUrl : '' };
  } catch {
    return { webhookUrl: '' };
  }
}

async function writeDiscordConfig(webhookUrl) {
  await fs.writeFile(DISCORD_CONFIG_PATH, JSON.stringify({ webhookUrl }, null, 2) + '\n', 'utf8');
}

function maskWebhookUrl(url) {
  if (!url) return '';
  // Discord webhook URLs are .../webhooks/<id>/<token> — keep enough to
  // recognise which one is configured without exposing the token in full.
  const tail = url.slice(-6);
  return `configured (…${tail})`;
}

/** Very loose shape check — Discord itself is the real validator, this just
 * catches an obviously-wrong paste (e.g. the channel URL instead of a
 * webhook URL) before making a network call. */
function looksLikeDiscordWebhook(url) {
  return typeof url === 'string' && /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url);
}

async function postDiscordUpdate(title, message) {
  const { webhookUrl } = await readDiscordConfig();
  if (!webhookUrl) return { ok: false, error: 'No Discord webhook URL configured yet.' };
  if (!looksLikeDiscordWebhook(webhookUrl)) {
    return { ok: false, error: 'Configured URL does not look like a Discord webhook URL.' };
  }
  const embed = {
    title: title && title.trim() ? title.trim() : 'Guild Idler dev update',
    description: (message ?? '').slice(0, 4000),
    color: 0xb08d57, // brass, matching the dev tool's own accent colour
    timestamp: new Date().toISOString(),
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Discord returned ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}` };
    }
    return { ok: true };
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { ok: false, error: timedOut ? 'Request to Discord timed out after 10s.' : `Request to Discord failed: ${err.message}` };
  }
}

/**
 * Pulls a ready-made Discord blurb for a given patch out of
 * guild-idler-status.md, instead of the "Fill from selected patch" button
 * just reformatting the patch's filename.
 *
 * Convention this depends on: every patch-log entry's heading reads
 * `### <title> -- built (patch NNNN)`, and is immediately followed (once
 * the short prose intro, if any, is done) by a fenced ```discord-update
 * block containing the actual blurb, e.g.:
 *
 *   ```discord-update
 *   Dev Update | Feature Name
 *
 *   - Added the new thing
 *   - Fixed the other thing
 *   ```
 *
 * Older entries written before this convention existed simply won't have
 * a block to find -- `found: false` lets the frontend fall back to its old
 * filename-based fill instead of erroring.
 *
 * Also reports a lightweight continuity check: the highest patch number
 * logged *before* this one, and whether this patch is exactly one more
 * than that -- a numbering gap here almost always means a patch was
 * built against a stale local copy of the repo (see patch 0136's own
 * postmortem) rather than an intentional skip.
 */
/**
 * Pulls the patch number out of a `.patch` filename -- deliberately
 * tolerant, since real patch files in this repo have never actually
 * settled on one naming scheme: `NNNN-description.patch` (leading
 * digits), `patch-NNNN-description.patch` / `patch_NNNN.patch` ("patch"
 * then digits, with or without a separator), and `Guild-Idler-patch-
 * NNNN.patch` (digits anywhere after the word "patch") have all shipped
 * for real, confirmed by checking every *.patch file actually sitting in
 * this repo -- none of them matched the original `/^(\d+)-/`-only check,
 * which meant "Fill from selected patch" silently fell back to the
 * filename-only default for every single one, patch 0221's own report
 * being the one that actually got noticed and reported. Tries the
 * leading-digits form first (most specific), then falls back to
 * "patch" immediately followed by 3-4 digits anywhere in the name.
 * Returns the number zero-padded to 4 digits (matching the `(patch
 * NNNN)` heading convention exactly), or null if neither pattern hits --
 * a filename with no recognizable patch number (e.g.
 * `backlog-guild-hall-customization.patch`) is expected to miss and
 * fall back, not something this needs to force a match for.
 */
function extractPatchNumber(patchFilename) {
  const name = patchFilename || '';
  const leading = /^(\d{3,4})-/.exec(name);
  if (leading) return leading[1].padStart(4, '0');
  const afterWord = /patch[-_]?(\d{3,4})/i.exec(name);
  if (afterWord) return afterWord[1].padStart(4, '0');
  return null;
}

async function findPatchSummary(patchFilename) {
  const patchNumber = extractPatchNumber(patchFilename);
  if (!patchNumber) return { found: false, patchNumber: null, text: null, latestPriorPatch: null, continuityOk: null };
  const patchNum = parseInt(patchNumber, 10);

  let markdown;
  try {
    markdown = await fs.readFile(STATUS_MD_PATH, 'utf8');
  } catch {
    return { found: false, patchNumber, text: null, latestPriorPatch: null, continuityOk: null };
  }

  const headingRe = /^###.*\(patch (\d+)\)\s*$/gm;
  const headings = [];
  let m;
  while ((m = headingRe.exec(markdown)) !== null) {
    headings.push({ num: parseInt(m[1], 10), index: m.index });
  }

  const priorNums = headings.map((h) => h.num).filter((n) => n < patchNum);
  const latestPriorPatch = priorNums.length ? String(Math.max(...priorNums)).padStart(4, '0') : null;
  const continuityOk = latestPriorPatch === null ? true : patchNum - parseInt(latestPriorPatch, 10) === 1;

  const match = headings.find((h) => h.num === patchNum);
  if (!match) return { found: false, patchNumber, text: null, latestPriorPatch, continuityOk };

  const nextIndex = headings.find((h) => h.index > match.index)?.index ?? markdown.length;
  const section = markdown.slice(match.index, nextIndex);

  const fenceStart = section.indexOf('```discord-update');
  if (fenceStart === -1) return { found: false, patchNumber, text: null, latestPriorPatch, continuityOk };
  const afterFenceStart = fenceStart + '```discord-update'.length;
  const fenceEnd = section.indexOf('```', afterFenceStart);
  if (fenceEnd === -1) return { found: false, patchNumber, text: null, latestPriorPatch, continuityOk };

  const text = section.slice(afterFenceStart, fenceEnd).trim();
  return { found: true, patchNumber, text, latestPriorPatch, continuityOk };
}

/* ------------------------------------------------------------------ http --- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function serveStatic(req, res) {
  let rel = req.url === '/' ? '/index.html' : req.url;
  rel = rel.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => { chunks += c; });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/schema') {
    // groupOrder rides alongside the schema map itself (rather than a
    // second endpoint) since the frontend always needs both together to
    // render the nav -- one round trip on load instead of two.
    return json(res, 200, { schemas: SCHEMAS, groupOrder: GROUP_ORDER });
  }

  if (url.pathname === '/api/patches/list' && req.method === 'GET') {
    const files = await listPatchFiles();
    const status = await gitStatus();
    return json(res, 200, { files, status });
  }

  if (url.pathname === '/api/patches/status' && req.method === 'GET') {
    return json(res, 200, await gitStatus());
  }

  if (url.pathname === '/api/patches/check' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const resolved = await resolvePatchPath(body.name);
    if (!resolved) return json(res, 404, { error: 'Unknown patch file.' });
    const result = await run('git', ['apply', '--check', resolved], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/apply' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const resolved = await resolvePatchPath(body.name);
    if (!resolved) return json(res, 404, { error: 'Unknown patch file.' });
    const result = await run('git', ['apply', resolved], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/commit' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'Apply patch';
    const add = await run('git', ['add', '-A'], GIT_TIMEOUT_MS);
    if (!add.ok) return json(res, 200, add);
    // The commit message is passed as a single execFile argument, never
    // through a shell, so it can't be used to inject additional commands
    // regardless of what characters it contains.
    const commit = await run('git', ['commit', '-m', message], GIT_TIMEOUT_MS);
    return json(res, 200, commit);
  }

  if (url.pathname === '/api/patches/push' && req.method === 'POST') {
    // Plain `git push`, no remote/branch args -- same "trust git's own
    // defaults" approach as commit above. Relies on the current branch
    // already tracking an upstream; if it doesn't, git's own error message
    // explains that clearly and shows up in the result block same as any
    // other failed step here, rather than this tool trying to guess a
    // remote/branch on the user's behalf.
    const result = await run('git', ['push'], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/build' && req.method === 'POST') {
    const result = await runNpm(['run', 'build'], BUILD_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/package' && req.method === 'POST') {
    const result = await runNpm(['run', 'package'], PACKAGE_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/copy-build' && req.method === 'POST') {
    return json(res, 200, await copyLatestBuild());
  }

  if (url.pathname === '/api/sim/presets' && req.method === 'GET') {
    try {
      return json(res, 200, { presets: await readSimPresets() });
    } catch (err) {
      return json(res, 500, { error: `Could not read sim presets: ${err.message}` });
    }
  }

  if (url.pathname === '/api/sim/run' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: 'Malformed JSON in request body.' });
    }
    let presets;
    try {
      presets = await readSimPresets();
    } catch (err) {
      return json(res, 500, { error: `Could not read sim presets: ${err.message}` });
    }
    const presetIds = Array.isArray(body.presetIds) ? body.presetIds : [];
    const selected = presets.filter((p) => presetIds.includes(p.id));
    if (selected.length === 0) return json(res, 400, { error: 'No valid presetIds given.' });

    const overrides = body.overrides && typeof body.overrides === 'object' && !Array.isArray(body.overrides)
      ? body.overrides : {};
    const maxDays = Number.isFinite(body.maxDays) && body.maxDays > 0 ? body.maxDays : 1095;
    const sampleEveryDays = Number.isFinite(body.sampleEveryDays) && body.sampleEveryDays > 0 ? body.sampleEveryDays : 14;
    const heroCountOverride = Number.isFinite(body.heroCountOverride) ? body.heroCountOverride : undefined;

    // Baseline (empty overrides) and modified (the proposed draft) are two
    // fully separate process spawns per preset -- see runSim.ts's own header
    // comment on why that isolation is required, not just convenient.
    const results = {};
    await Promise.all(selected.map(async (preset) => {
      const [baseline, modified] = await Promise.all([
        runSimVariant({ preset, heroCountOverride, overrides: {}, maxDays, sampleEveryDays }),
        runSimVariant({ preset, heroCountOverride, overrides, maxDays, sampleEveryDays }),
      ]);
      results[preset.id] = { baseline, modified };
    }));
    return json(res, 200, { results });
  }

  if (url.pathname === '/api/version' && req.method === 'GET') {
    const version = await readPackageVersion();
    const tags = await listGitTags();
    return json(res, 200, { version, tags });
  }

  if (url.pathname === '/api/version/bump' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const level = ['patch', 'minor', 'major'].includes(body.level) ? body.level : null;
    if (!level) return json(res, 400, { error: 'level must be patch, minor, or major.' });
    // npm version bumps package.json, commits, and tags (e.g. v0.1.10) in one
    // step — this is the real release version, distinct from the 000N patch
    // filenames, which are just this-session-to-that-session identifiers.
    const result = await runNpm(['version', level], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/dev/start' && req.method === 'POST') {
    return json(res, 200, startDevServer());
  }

  if (url.pathname === '/api/dev/stop' && req.method === 'POST') {
    return json(res, 200, await stopDevServer());
  }

  if (url.pathname === '/api/dev/status' && req.method === 'GET') {
    return json(res, 200, devServerStatus());
  }

  if (url.pathname === '/api/discord/config' && req.method === 'GET') {
    const { webhookUrl } = await readDiscordConfig();
    return json(res, 200, { configured: !!webhookUrl, preview: maskWebhookUrl(webhookUrl) });
  }

  if (url.pathname === '/api/discord/config' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    if (webhookUrl && !looksLikeDiscordWebhook(webhookUrl)) {
      return json(res, 400, { error: 'That does not look like a Discord webhook URL (expected https://discord.com/api/webhooks/...).' });
    }
    await writeDiscordConfig(webhookUrl);
    return json(res, 200, { ok: true, configured: !!webhookUrl, preview: maskWebhookUrl(webhookUrl) });
  }

  if (url.pathname === '/api/discord/post' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const result = await postDiscordUpdate(body.title, body.message);
    return json(res, result.ok ? 200 : 400, result);
  }

  if (url.pathname === '/api/discord/patch-summary' && req.method === 'GET') {
    const patch = url.searchParams.get('patch') || '';
    return json(res, 200, await findPatchSummary(patch));
  }

  if (url.pathname === '/api/icons' && req.method === 'GET') {
    return json(res, 200, await listIcons());
  }

  if (url.pathname === '/api/banners' && req.method === 'GET') {
    return json(res, 200, await listBanners());
  }

  if (url.pathname === '/api/decor-art' && req.method === 'GET') {
    return json(res, 200, await listDecorArt());
  }

  // Display-only metadata for the Guild Hall Slot Layout tool -- labels
  // and pools for the 30 fixed slot ids, so it can show "L2a" on a box
  // instead of a bare id. See GUILDHALL_SLOT_META's own comment.
  if (url.pathname === '/api/guildhall-slot-meta' && req.method === 'GET') {
    return json(res, 200, GUILDHALL_SLOT_META);
  }

  // Folder listing for the 'guildhall-themes' content type's `background`
  // field picker -- same shape/job as '/api/decor-art' just above, rooted
  // at GUILDHALL_ART_DIR instead. See listGuildhallArt's own comment.
  if (url.pathname === '/api/guildhall-art' && req.method === 'GET') {
    return json(res, 200, await listGuildhallArt());
  }

  // Serves the actual icon image bytes for <img> previews in the picker and
  // table thumbnails. Same path-traversal guard as serveStatic below, just
  // rooted at ICONS_DIR instead of PUBLIC_DIR since these live outside the
  // devtool's own public/ folder.
  if (url.pathname.startsWith('/item-icons/')) {
    const rel = decodeURIComponent(url.pathname.slice('/item-icons/'.length)).split('?')[0];
    const filePath = path.join(ICONS_DIR, rel);
    if (!filePath.startsWith(ICONS_DIR)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext]
        ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Same idea, rooted at BANNERS_DIR (public/lore/) for the banner picker's
  // thumbnails and the live focus-point preview -- '(general)' entries
  // (see listBanners) are loose root files, so their "rel" path has no
  // folder prefix at all, same as any other file under this root.
  if (url.pathname.startsWith('/lore-art/')) {
    const rel = decodeURIComponent(url.pathname.slice('/lore-art/'.length)).split('?')[0];
    const filePath = path.join(BANNERS_DIR, rel);
    if (!filePath.startsWith(BANNERS_DIR)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext]
        ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Same idea again, rooted at DECOR_DIR (public/decor/) for the
  // decoration picker's thumbnails and the live placement/scale preview.
  if (url.pathname.startsWith('/decor-art/')) {
    const rel = decodeURIComponent(url.pathname.slice('/decor-art/'.length)).split('?')[0];
    const filePath = path.join(DECOR_DIR, rel);
    if (!filePath.startsWith(DECOR_DIR)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext]
        ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Same idea a third time, rooted at GUILDHALL_ART_DIR (public/
  // guildhall-customize/) -- as of patch 0206 a real folder tree (one
  // subfolder per theme) rather than a single fixed file, served the same
  // guarded way as every other art tree here; `rel` already carries
  // whatever subfolder path the caller asked for (e.g. "guild_hall/
  // bg.jpg"), so no change was needed here to support that.
  if (url.pathname.startsWith('/guildhall-art/')) {
    const rel = decodeURIComponent(url.pathname.slice('/guildhall-art/'.length)).split('?')[0];
    const filePath = path.join(GUILDHALL_ART_DIR, rel);
    if (!filePath.startsWith(GUILDHALL_ART_DIR)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext]
        ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  const match = url.pathname.match(/^\/api\/data\/([\w-]+)$/);
  if (match) {
    const kind = match[1];
    const schema = SCHEMAS[kind];
    if (!schema) return json(res, 404, { error: `Unknown content type "${kind}"` });
    const filePath = path.join(DATA_DIR, schema.file);

    if (req.method === 'GET') {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        return json(res, 200, { data: JSON.parse(raw) });
      } catch (err) {
        return json(res, 500, { error: `Could not read ${schema.file}: ${err.message}` });
      }
    }

    if (req.method === 'POST') {
      let data;
      try {
        data = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'Malformed JSON in request body.' });
      }
      const errors = validateArray(kind, data);
      if (errors.length) return json(res, 400, { error: 'Validation failed.', details: errors });

      try {
        const previous = await fs.readFile(filePath, 'utf8').catch(() => null);
        if (previous) await fs.writeFile(filePath + '.bak', previous, 'utf8');
        await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      } catch (err) {
        return json(res, 500, { error: `Could not write ${schema.file}: ${err.message}` });
      }
      return json(res, 200, { ok: true, count: data.length });
    }

    res.writeHead(405);
    return res.end();
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Guild Idler Dev Tool running at http://localhost:${PORT}`);
  console.log(`Editing JSON files in ${path.relative(ROOT, DATA_DIR)}`);
  console.log('Save in the tool, then restart `npm run dev` to see changes in the game.');
  console.log('Press Ctrl+C to stop.');
});
