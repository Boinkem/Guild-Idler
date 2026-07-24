# Little Knight

A cozy desktop companion idle game. A small pixel knight stands in the corner of your screen and goes on quests while you work. Contracts run for hours or days, resolve whether or not the app is open, and the guild behind him grows over months.

---

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
| 1 | 3 | 10 |
| 7 | 7 | 54 |
| 30 | 13 | 177 |
| 90 | 24 | 405 |

- Win rate at that risk appetite: ~86%
- Legendary items in 90 days: 0–1
- Second hero slot (Tavern 1): around week 3
- Retirement threshold (level 30): roughly four months

Two numbers were corrected after the first simulation run. Legendary drop chance was derived from an inverse-square-root of rarity weight, which produced 45 legendaries in 90 days; it is now an explicit `RARITY_LOOT_CHANCE` table topping out at 0.4% per roll. The XP exponent dropped from 1.65 to 1.55, which moved first retirement from beyond six months to about four.

Retuning is data-only. `DIFFICULTIES` in `data/quests.ts`, `RARITY_LOOT_CHANCE` in `data/equipment.ts`, and `xpForLevel` in `data/progression.ts` are the three knobs that move almost everything.

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
- *Companion pets or mounts* — would want a new equipment-like slot category rather than reusing `EquipSlot`.

---

## Art

The game supports two sources of sprite art and picks whichever is available.

### 1. The licensed sprite pack (preferred)

Frames are 96x84 in the pack as shipped; `tools/recolor.py` crops them to the
content box (64x46, about a third of the original pixels) and generates one
recoloured variant per hero class.

```bash
python3 tools/recolor.py --src /path/to/knight-pack --out public/heroes
```

That writes `public/heroes/<class>/<animation>.png` for six classes across ten
animations — idle, walk, run, jump, defend, hurt, death and three attacks —
totalling about 210 KB.

**The art is not committed to the repository** (`public/heroes` is gitignored),
because the pack licence permits use within a project but not redistribution of
the files themselves. Anyone cloning the repo runs `recolor.py` against their
own copy of the pack.

#### How the recolouring works

Strict palette swap with lightness preservation. The pack uses only 22 colours
and binary alpha — no anti-aliasing — so every pixel matches one of a few known
ramps exactly. For each colour we replace **hue and saturation only** and leave
**lightness untouched**, which means the artist's shading survives byte for
byte. Nothing is blurred, averaged, or resampled.

Verified on the shipped pack:

- Silhouette and alpha identical across all six variants
- The `knight` variant is byte-identical to the source on every opaque pixel
- No tone collisions: all 6 armour tones and 5 cloth tones stay distinct in
  every class, so no shading step is flattened
- Relative lightness ordering preserved in every ramp

Skin, outline, white highlights and the gold/blue effect colours are held
constant across classes, so the six read as one knight in different livery
rather than six unrelated characters. Adjust the `CLASSES` table at the top of
`recolor.py` to retune; each entry is a hue, a saturation multiplier and a
lightness multiplier for the armour and cloth groups.

### 2. Generated fallback sprites

`src/ui/sprites/PixelSprite.tsx` holds 32x32 character grids rendered to SVG
rects. `HeroSprite` falls back to these automatically when a sheet is missing,
so a fresh clone without the pack still runs and still recolours per class —
installing the pack simply upgrades the visuals.

These grids are authored by `sprite_lab.py` in three passes: draw a flat
silhouette in materials using span helpers, derive each pixel's tone from which
edges of its region it sits on (light from the upper left), then outline.

```bash
python3 sprite_lab.py     # renders a preview PNG to /tmp
```

### Animation mapping

| Game state | Animation |
| --- | --- |
| At the guild | `idle` |
| Leaving on a quest | `run` |
| Away / returning | `walk` |
| Injured | `hurt` |

`defend`, `death`, `jump` and the three attack sheets are loaded and available
in `ANIMATION_FRAMES` but not yet used — obvious hooks for quest-result flourishes.
