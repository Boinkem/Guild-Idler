# Guild Idler

A cozy desktop companion idle game. A small pixel adventurer stands in the corner of your screen and goes on quests while you work. Contracts run for hours or days, resolve whether or not the app is open, and the guild behind him grows over months.

---

## Editing game content

Quest templates, equipment, consumables, and events can be edited without touching code — see [DEVTOOL.md](./DEVTOOL.md). Everything else (classes, upgrades, difficulty tuning) is still in TypeScript.

## Running it

Requires Node 18 or newer.

```bash
npm install
npm run dev      # Vite dev server + Electron with hot reload
```

To build and run the packaged renderer:

```bash
npm start        # tsc --noEmit, vite build, then electron .
```

To produce installers (`.exe`, `.dmg`, `.AppImage`) into `release/`:

```bash
npm run package
```

### Where the save lives

`electron-main` writes to Electron's `userData` directory:

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%/little-knight/little-knight-save.json` |
| macOS | `~/Library/Application Support/little-knight/little-knight-save.json` |
| Linux | `~/.config/little-knight/little-knight-save.json` |

Saves are written atomically: a temp file is written, the previous save is copied to `little-knight-save.backup.json`, then the temp file is renamed into place. If the main save is unreadable on launch, the backup is loaded instead.

The **Statistics** tab has a "Where is my save?" button, plus a reset.

### Running in a plain browser

The renderer degrades gracefully without Electron. `defaultAdapter()` in `SaveManager.ts` falls back to `localStorage` when `window.littleKnight` is absent, and the window-control buttons no-op. `npm run dev` and opening the Vite URL in a browser is the fastest way to iterate on UI.

---

## Project layout

```
electron/
  main.ts              Transparent frameless window, tray, atomic saves, IPC
  preload.ts           contextIsolated bridge — the renderer's only OS surface
src/
  game/
    types.ts           GameState and every shape stored in the save
    rng.ts             Seeded RNG (mulberry32 + FNV-1a hash)
    util.ts            Modifier maths, formatting, rarity colours
    data/
      quests.ts        Difficulty tuning, 10 name templates, 4 quest chains
      items.ts         Consumables and injury definitions
      equipment.ts     30 items across 7 slots, rarities, item sets
      events.ts        16 road events, positive through negative
      progression.ts   Upgrades, guild facilities, renown perks, hero classes
    managers/
      HeroManager        Creation, XP, stats → modifiers, injuries
      EquipmentManager   Equip, durability, repair, refine, sell
      InventoryManager   Consumables and quest loadouts
      QuestManager       Board generation, departure, resolution
      EventManager       Random event rolls
      GuildManager       Facilities, permanent upgrades, recruitment
      ShopManager        Rotating stock
      PrestigeManager    Retirement and renown perks
      ModifierManager    Account-wide bonus aggregation
      SaveManager        Serialisation, versioned migration, adapters
    engine.ts          GameEngine — tick, autosave, offline catch-up, actions
  ui/
    IdleView           The corner companion
    MenuWindow         Nine-tab guild menu
    panels/            Quests, Heroes, Equipment, Inventory, Shop, Upgrades,
                       Guild Hall, Statistics, Prestige
    sprites/           Character-grid pixel art rendered to SVG
  styles/app.css
```

---

## How the pieces fit

### One mutable state, one mutation path

`GameEngine` owns the only `GameState` object. React never mutates it; components call engine actions and re-render on `notify()`. Offline catch-up runs the exact same `QuestManager.resolve` that the live tick does, so there is no second code path that can drift out of sync with the first.

### Deterministic quest outcomes

Every quest seeds its RNG from its own id:

```ts
const rng = createRng(quest.id);
```

A quest that finishes at 3am while the app is closed resolves to exactly the result it would have produced live. Closing and reopening the app cannot reroll a bad outcome, and the offline report can be generated confidently at launch.

### Seeded world windows

The quest board and shop stock are generated from `floor(now / refreshInterval)` rather than stored:

```ts
const rng = createRng(`board:${window}:${topLevel}:${state.createdAt}`);
```

The board survives a restart without being persisted, and relaunching mid-window cannot reroll it. Each guild gets a different sequence because `createdAt` is mixed into the seed.

### Modifiers

Every numeric bonus in the game — class traits, stats, gear, set bonuses, injuries, consumables, permanent upgrades, guild facilities, renown perks — reduces to the same seven-key `Modifiers` record and is combined with `sumMods`. Adding a new bonus source anywhere means writing one `Partial<Modifiers>` and including it in a sum; nothing else needs to change.

### Multiple heroes from day one

`activeQuests` is an array keyed by `heroId`, never a single slot. Unlocking the Squire, Archer, Rogue, Mage and Paladin required no structural change — only data in `progression.ts` and a Tavern level check.

### Save versioning

`MIGRATIONS` maps version N to a function returning version N+1, applied in sequence. After migrating, the result is merged over a fresh `createInitialState()`, so a save missing a field added in a later release fills in rather than crashing the UI.

---

## Balance

The tuning below comes from a 90-day simulation (`~400 quests`) of a player who checks in hourly, always takes the highest-paying contract at 50% odds or better, repairs before it breaks, and reinvests everything:

| Day | Level | Quests run |
| --- | --- | --- |
| 1 | 3 | 11 |
| 7 | 7 | 52 |
| 30 | 14 | 165 |
| 90 | 26 | 405 |

- Win rate at that risk appetite: ~86%
- Legendary items in 90 days: 0–1
- Second hero slot (Tavern 1): around week 3
- Retirement threshold (level 30): roughly four months

Two numbers were corrected after the first simulation run. Legendary drop chance was derived from an inverse-square-root of rarity weight, which produced 45 legendaries in 90 days; it is now an explicit `RARITY_LOOT_CHANCE` table topping out at 0.4% per roll. The XP exponent dropped from 1.65 to 1.55, which moved first retirement from beyond six months to about four.

Retuning is data-only. `DIFFICULTIES` in `data/quests.ts`, `RARITY_LOOT_CHANCE` in `data/equipment.ts`, and `xpForLevel` in `data/progression.ts` are the three knobs that move almost everything.

### Fast-start pacing

Easy quests have a `burstChance` (45%) of rolling a short 90s–8min contract
with its own explicit, generous reward range instead of the normal 1–2h
range — something to click every other minute in the first few sessions,
tapering naturally into the slower/idle-friendly pace as normal/hard tiers
open up. A strict proportional slice of the full reward range was tried
first and measured directly: it rounded to 1–2 XP per burst quest, which is
mathematically fair but reads as insulting rather than the "numbers going
up" feeling it's meant to deliver — burst rewards are deliberately generous
rather than strictly proportional. Verified this doesn't disturb the
established mid/late curve above: a 90-day simulation with bursts active
lands within 1-2 levels of the original baseline at every checkpoint, with
day-90 quest count matching almost exactly.

---

## Verified behaviour

Checks run against the compiled game logic:

- Identical quest resolves identically from two independent state copies
- Board generation is stable across calls inside one refresh window
- Save serialise → migrate round-trips without loss
- A synthetic v1 save migrates to v3 with new fields populated
- Base64 export/import round-trips

`tsc --noEmit` passes on `src/game/**` under `strict`, `noUnusedLocals` and `noUnusedParameters`.

---

## Future expansion

**Ready to build on now.** The seams are already in place for these:

- *More hero classes* — add an entry to `HERO_CLASSES` and `RECRUIT_COST`. Nothing else.
- *More gear and sets* — append to `EQUIPMENT` and `ITEM_SETS`. Loot tables, shop stock, and the collection screen pick them up automatically.
- *More quest chains* — append to `QUEST_CHAINS`. Stage advancement, offline resolution, and the Guild Hall progress display are generic.
- *New event types* — append to `EVENTS`; the effect keys are already wired through resolution.

**Needs a small amount of new code:**

- *Hero-specific quest affinity beyond tags* — currently a flat bonus on preferred tags; per-hero quest history could feed a familiarity bonus.
- *Crafting* — `ShopManager` already stocks "upgrade materials" conceptually; a `CraftingManager` reading a recipe table would slot alongside the existing managers.
- *Notifications* — Electron's `Notification` API on quest completion, gated behind a setting. The engine already knows the exact moment each quest resolves.
- *Cosmetics* — `PixelSprite` takes a palette override; renown-purchased palettes and alternate frame sets need only a data table and a picker.

**Larger projects:**

- *Cloud save* — `SaveAdapter` is already an interface with two implementations; a third talking to a server would not touch game logic.
- *Guild vs guild leaderboards* — statistics are already tracked comprehensively.

---

## Art

Eight playable classes, each a distinct character pack from the same artist:
adventurer (the starter), knight, dwarf warrior, gladiator, samurai, witch, lizardman, pyromancer, wizard.
Each ships in its original colours plus four themed recolour **skins** (Necrotic,
Holy, Infernal, Frost) used as a cosmetic gold sink.

### Importing the packs

```bash
python3 tools/import_characters.py --src <folder with the extracted character packs> --out public/heroes
```

Packs shipped as individual numbered frame files rather than sheets (the
Adventurer pack is like this) need `tools/assemble_strips.py` run first to
build strips — see that file's docstring.

This normalises the differently-nested packs, crops each character to its own
tight frame box, and writes `public/heroes/<class>/<skin>/<animation>.png` plus
a `manifest.json` the game reads at runtime for per-character frame sizes and
animation counts. Around 260 files, 1.7 MB.

**None of it is committed** (`public/heroes` is gitignored) — the licence allows
use inside a project but not redistribution of the files. It permits commercial
use and modification, which is what makes the recolours legal. Keep your
original packs safe and regenerate any time.

#### Recolour skins

Same lightness-preserving palette swap as before: binary alpha and low colour
counts mean texture survives exactly. Each theme remaps saturated "identity"
pixels toward a primary/secondary hue pair while leaving neutrals (outlines,
steel, bone, eyes) untouched, so a two-tone character keeps its internal
contrast in the new livery. Verified across all seven imported characters: 100%
of tones stay distinct, lightness range 0.60–0.93 (well above the muddiness
floor). Retune the four themes in the `SKINS` table in `import_characters.py`.

#### Per-character frames

Frame sizes differ (gladiator 40×38 after cropping, lizardman 101×85, etc), so
`HeroSprite` sizes each character from the manifest and takes a target `height`
rather than an integer scale. Animation sets differ too — the samurai has ten
including jump/defend/throw, most others have the core five. `HeroSprite`
resolves a requested animation to the nearest one the character actually has
(missing run → walk, missing attack → its first attack, missing defend → idle).

### Generated fallback sprites

`src/ui/sprites/PixelSprite.tsx` still holds the 32×32 SVG-grid knight from
before. It is no longer wired into the main views but remains as a reference
implementation and a safety net; `HeroSprite` shows a labelled placeholder if a
character's art is absent, so a fresh clone without the packs still runs.

### Animation mapping

| Game state | Animation |
| --- | --- |
| At the guild | `idle` |
| Leaving on a quest | `run` (falls back to `walk`) |
| Away / returning | `walk` |
| Injured | `hurt` |

The `attack`, `defend`, `jump`, `throw` and `death` sheets are imported and in
the manifest, ready for quest-result flourishes.

### Pets

Three species so far, each a licensed sprite sheet from a different artist:
Ember Kit (fox), Rooftail (red panda), Ashwing (crow). Same gitignored,
regenerate-locally convention as the hero packs.

```bash
python3 tools/import_pets.py --src <folder with the raw uploaded sheets> --out public/pets
```

Unlike the hero packs, there's no per-character metadata for these (no
aseprite JSON, bar the Red Panda's) -- `tools/import_pets.py`'s `ROWS`
mappings are hand-confirmed against the actual art, not derived. Recolours
use the exact same lightness-preserving HLS palette swap as
`tools/recolor.py`, just applied per `Rarity` tier instead of per hero
class: Common is the pack's own original colouring; Uncommon through
Legendary each rotate further around the hue wheel and saturate a little
harder. A pet's rarity IS its recolour tier -- there's no separate skin
system the way heroes have. Applied to whichever colours a species flags
as its "fur" group in the script; outlines and neutral highlights stay
fixed across every tier so the shading structure never degrades. The crow
is almost entirely black and has no real hue to rotate on its main body
colour, so only its one near-black shading tone (which does carry a faint
hue) moves -- the effect reads as an iridescent sheen on higher rarities
rather than a colour swap, which happens to match how real corvid feathers
actually catch light.

`PetSprite.tsx` mirrors `HeroSprite.tsx` almost exactly: one shared
`public/pets/manifest.json` (frame size + animation frame counts per
species), animations as separate per-tier PNG strips
(`public/pets/<species>/<rarity>/<animation>.png`), same graceful
placeholder-then-glyph fallback when art is absent.

