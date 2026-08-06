# Dev Tool — editing game content without touching code

A local editor for quest templates, equipment, consumables, and events. Runs
independently of the game itself.

## Running it

```powershell
cd C:\Little-Knight
npm run devtool
```

Then open **http://localhost:5175** in any browser. Leave the PowerShell window
open while you work — closing it stops the server. `Ctrl+C` in that window also
stops it cleanly.

You can run this while the game is open or closed; they don't interact.

## Workflow

1. Pick a tab: Quest Templates, Equipment, Consumables, or Events.
2. **Edit** an existing entry, **Duplicate** one as a starting point for something
   similar, or **+ Add** a new one from scratch.
3. Fill in the form. Required fields are marked with `*`. The tool will not let
   you save something broken — see **What it stops you from doing** below.
4. Save. The status bar in the top right confirms it, or explains what's wrong.
5. Restart the game (`npm run dev`) to see the change. There's no live-reload
   into the running game on purpose — keeps this tool simple and the game
   untouched while you're mid-edit.

## What it stops you from doing

Every save is checked before it touches disk:

- **Missing required fields** — you can't save an item with no `name`.
- **Wrong type in a dropdown field** — `slot` must be one of the seven real
  slots, `rarity` one of the five real rarities, etc.
- **Bad ids** — the `id` field (used internally, e.g. `rusty_sword`) must be
  lowercase with underscores, no spaces or capitals.
- **Duplicate ids** — two equipment pieces can't share an id.
- **Unknown stat/modifier keys** — a typo like `succes` instead of `success` in
  a modifier gets caught immediately rather than silently doing nothing in-game.

If a save is rejected, your edits stay on screen — fix the highlighted problem
and save again. Nothing is lost.

### Why this matters more than it might seem

TypeScript's own type-checking does **not** catch a bad edit here. The game
imports this JSON with a type assertion (`as EquipmentDef[]`), which tells
TypeScript "trust me" rather than actually checking the shape — we confirmed
this directly: deleting a required field from the JSON still passes `npm run
build` cleanly. The dev tool's validation is the only real safety net, so it's
worth using the tool rather than hand-editing the JSON files in a text editor.
If you do edit a JSON file by hand, run the dev tool afterward and just hit
Save on the file you touched — it'll validate on write and tell you if
something's wrong.

## Backups

Every successful save writes a `.bak` copy of the *previous* version in
`src/game/data/json/` before overwriting. One level of undo, independent of
git. These `.bak` files are gitignored — they're a safety net, not something to
commit.

## Applying patches without the command line

The **Patches** tab (first tab, left of Quest Templates) wraps the whole
release workflow from WORKFLOW.md into buttons.

### Dev server

A quick-access panel at the top starts and stops `npm run dev` (Vite +
Electron). **Start** launches it in the background and returns immediately —
this is deliberate, since a dev server doesn't exit the way a build does, so
the page can't wait for it to finish. **Stop** kills the whole process tree,
not just the top process; `npm run dev` chains npm → Vite → Electron as child
processes, and killing only the first would leave the others running
invisibly. Status (🟢 running / ⚪ stopped) is checked on load and after every
start/stop.

### The patch flow: Check → Apply → Commit → Push

Select a `.patch` file sitting in the project root or a `patches/` folder,
then step through **Check** (`git apply --check`, a dry run) → **Apply**
(`git apply`, actually changes files) → **Commit** (`git add -A && git
commit`) → **Push** (`git push`). Each step shows its real output. Nothing
auto-chains — a failed check doesn't try to apply anyway, a successful apply
doesn't auto-commit, a successful commit doesn't auto-push. You press each
button.

Push is a plain `git push` — no remote or branch is typed in, it relies on
the current branch already tracking an upstream (the usual case once a repo
has been pushed once). If it isn't, git says so directly in the output, same
as any other failed step here. Push also isn't tied to having just committed
through this same panel — it sends whatever's already committed, so it's the
right button after committing from the terminal too.

The current git status (branch, clean/dirty, last commit, and the upstream
Push will target) shows at the top and updates after every step. If the
working tree isn't clean, it says so — worth resolving first, but it won't
stop you from proceeding.

### Build, Package, and Tag — the release steps

These three matter more once you're cutting an actual build for playtesters
or Steam, and are separate from the patch flow above — use them any time, not
just right after applying something.

- **Build** (step 6) — `npm run build`. Confirms nothing is broken.
- **Package** (step 7) — `npm run package`. Runs electron-builder and produces
  installers/unpacked builds in `release/` — this is what you'd hand to
  playtesters or upload to Steam. Can take several minutes the first time.
- **Tag a release version** (step 8) — runs `npm version patch/minor/major`,
  which bumps `package.json`, commits, and creates a git tag (`v0.1.10`) in one
  step. **This is deliberately separate from the `000N-name.patch` filenames.**
  A patch filename just identifies one batch of changes between us in this
  conversation; a version tag is the real release number that matters to
  players and to Steam. Do this once you're happy with everything above —
  typically after applying several patches and confirming the build — not
  after every single patch.

This is a convenience wrapper around the same commands, not a replacement for
git — for anything beyond this (branches, resolving a real merge conflict,
history surgery), use the terminal.

## What's editable here vs. not

**In the tool:** quest name templates (verb/subject/flavour), all equipment,
consumables, injuries, random road events, and achievement names/descriptions
— content with no logic attached, just numbers and text.

**Achievements are a special, half-and-half case, worth understanding.** The
*name*, *description*, and *hidden* flag for each achievement live here and
are fully safe to rename or reword — takes effect immediately. But the
*unlock condition* — what actually has to happen for "Living Legend" to pop —
is not data, it's a small check function in
`src/game/managers/AchievementManager.ts`. Adding a brand-new achievement row
here does nothing on its own: the game will show it as permanently locked
forever, since nothing is checking for it. Renaming or re-describing an
*existing* achievement is completely safe; adding a new one needs a matching
code change too. If you want a new achievement, describe the condition and
ask — the code side is usually a couple of lines.

The `id` field for an achievement is Steam's achievement API name and uses
Steam's own UPPER_SNAKE_CASE convention (e.g. `FIRST_LEGENDARY`), unlike every
other id in this project which is lowercase — the tool enforces the right
case for whichever content type you're in.

**Still fully in code**, because logic is wired to them and editing blind is
riskier: hero classes and their stats, guild upgrades, difficulty tuning,
quest chains. Ask if you want any of these opened up next; it's the same
pattern, just with a bit more care around what "valid" means for each.

## If something looks wrong in the game after an edit

1. Check the entry in the dev tool again — did it actually save (status bar
   said "Saved")?
2. Did you restart `npm run dev` after saving?
3. Run `npm run build` — if your edit was somehow still structurally wrong in a
   way the dev tool's validation didn't catch, this is the net that catches it
   before you'd see it live.
