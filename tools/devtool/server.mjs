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
const PORT = 5175;

/* --------------------------------------------------------------- schema --- */
// Required fields per content type. This is the real safety net: TypeScript's
// `as Foo[]` cast on the JSON import does NOT validate structure at compile
// time (confirmed — deleting a required field from the JSON still passes
// `tsc`), so this server is the only thing standing between a bad edit and a
// broken build. Every write is checked against these before it touches disk.

const SCHEMAS = {
  'quest-templates': {
    file: 'quest-templates.json',
    label: 'Quest Templates',
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
      banner: { type: 'bannerImage', required: false, defaultFolder: 'chains' },
      stages: { type: 'chainStages', required: true },
    },
  },
  'equipment': {
    file: 'equipment.json',
    label: 'Equipment',
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
      // Both of these existed on disk (raidExclusive since Heroic/Mythic
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
    },
  },
  'consumables': {
    file: 'consumables.json',
    label: 'Consumables',
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
  'materials': {
    file: 'materials.json',
    label: 'Materials',
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
      lootMythic: { type: 'string[]', required: false, picker: 'lootTable' },
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
        options: ['nothing', 'joke', 'goldFlat', 'goldRefund', 'material', 'scrap', 'equipment', 'egg'],
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
      itemId: { type: 'string', required: false }, // kind: equipment -- an equipment.json id, free text (see top comment)
      eggRarity: { type: 'enum', required: false, options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] }, // kind: egg
      dedicatedPetId: { type: 'string', required: false }, // kind: egg, optional
    },
  },
  'raids': {
    file: 'raids.json',
    label: 'Raids',
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
      // See quest-chains' own `banner` field comment above -- identical
      // shape, just defaulting to the raids/ subfolder and the
      // raids/<id>.jpg naming convention RaidBanner already used.
      banner: { type: 'bannerImage', required: false, defaultFolder: 'raids' },
    },
  },
  'crafting-recipes': {
    file: 'crafting-recipes.json',
    label: 'Crafting Recipes',
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
  'achievements': {
    file: 'achievements.json',
    label: 'Achievements',
    idField: 'id',
    // Editable here: name, description, hidden. The unlock CONDITION for
    // each achievement id is not data — it's a check function in
    // AchievementManager.ts. Renaming an achievement or rewriting its
    // flavour text here is fully safe and takes effect immediately; adding
    // a brand new achievement id here does nothing on its own until a
    // matching check is added in code. See DEVTOOL.md.
    fields: {
      id: { type: 'string', required: true, steamId: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      hidden: { type: 'boolean', required: true },
    },
  },
};

const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability'];
// Same 4 elements as ElementType in types.ts -- used by the 'resultGem'
// field type below (Weapon Enchanting / Armour Infusion gem recipes).
const ELEMENT_KEYS = ['fire', 'frost', 'lightning', 'poison'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
const EFFECT_KEYS = ['success', 'gold', 'preventInjury', 'guaranteedGoodEvent', 'healInjury'];
const EVENT_EFFECT_KEYS = ['success', 'goldPct', 'flatGold', 'xpPct', 'loot', 'durability', 'delay', 'injury', 'guaranteedLoot'];
const MATERIAL_KEYS = ['ore', 'timber', 'herbs', 'fish'];
const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const CHAIN_STAGE_TAGS = ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'];
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
        // loot/lootHeroic/lootMythic/eggLoot) legitimately means "nothing
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
        else for (const k of Object.keys(value)) if (!EVENT_EFFECT_KEYS.includes(k)) errors.push(`entry ${index}: unknown effect key "${k}"`);
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
          if (typeof value.path !== 'string' || !/^[\w-]+(\/[\w.-]+)*\.(png|jpg|jpeg|webp|gif)$/i.test(value.path)) {
            errors.push(`entry ${index}: "${key}.path" must be a relative image path under public/lore/ (e.g. "chains/foo.jpg")`);
          }
        }
        for (const axis of ['focusX', 'focusY']) {
          if (value[axis] === undefined) continue;
          if (typeof value[axis] !== 'number' || value[axis] < 0 || value[axis] > 100) {
            errors.push(`entry ${index}: "${key}.${axis}" must be a number between 0 and 100`);
          }
        }
        for (const k of Object.keys(value)) {
          if (!['path', 'focusX', 'focusY'].includes(k)) errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
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
          for (const k of Object.keys(value)) {
            if (k !== 'kind' && k !== 'element') errors.push(`entry ${index}: unknown key "${k}" in "${key}"`);
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
    return json(res, 200, SCHEMAS);
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

  if (url.pathname === '/api/icons' && req.method === 'GET') {
    return json(res, 200, await listIcons());
  }

  if (url.pathname === '/api/banners' && req.method === 'GET') {
    return json(res, 200, await listBanners());
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
