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

The **Patches** tab (first tab, left of Quest Templates) wraps the git workflow
from WORKFLOW.md into buttons: select a `.patch` file sitting in the project
root or a `patches/` folder, then step through Check → Apply → Commit → Build.

Each step is a real command run for you — `git apply --check`, `git apply`,
`git add -A && git commit`, `npm run build` — shown with its actual output, and
nothing auto-chains. A failed check just tells you it failed; it doesn't try
to apply anyway. A successful apply doesn't auto-commit. You press each button.

The current git status (branch, clean/dirty, last commit) shows at the top and
updates after every step, so you always know where you stand. If the working
tree isn't clean, it says so — worth resolving that first, but it won't stop
you from proceeding.

This is a convenience wrapper around the same commands, not a replacement for
git — for anything beyond apply-commit-build (branches, resolving a real merge
conflict, history surgery), use the terminal.

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
