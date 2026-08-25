# Working on Guildbound — the day-to-day guide

This is the practical loop for making changes, testing them, and handing builds
to playtesters. No prior git knowledge assumed.

---

## One-time setup

Git is already initialised in this folder with a first commit. You only need to
tell git who you are (once, on your machine):

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Optionally connect a remote (GitHub, GitLab) so your history is backed up and I
can hand you changes as pull requests:

```powershell
git remote add origin https://github.com/you/guildbound.git
git push -u origin main
```

Note the sprite art lives in `public/heroes` and is **not** tracked by git — the
licence allows use but not redistribution of the files. Keep your original pack
somewhere safe; regenerate the art any time with:

```powershell
python3 tools/recolor.py --src <your pack folder> --out public/heroes
```

---

## The everyday loop

### 1. See what you're changing

```powershell
git status              # which files changed
git diff                # exactly what changed, line by line
```

### 2. Make a change and test it live

```powershell
npm run dev             # or dev:web for the browser version
```

Vite hot-reloads, so most edits appear without restarting. No rebuild needed
just to try something.

### 3. Save the change to history

```powershell
git add -A
git commit -m "Add a green theme and larger sprite option"
```

A commit is a checkpoint. Commit whenever something works — small and often is
better than huge and rare. If a later change breaks things, you can always get
back to a good commit.

### 4. Undo when something goes wrong

```powershell
git checkout -- src/ui/panels/SettingsPanel.tsx   # discard changes to one file
git reset --hard HEAD                              # discard ALL uncommitted changes
git log --oneline                                  # list past checkpoints
git checkout <commit-id>                           # look at an old state
git checkout main                                  # come back to the present
```

`git reset --hard` is the "put everything back the way it was at my last commit"
button. It only touches tracked files, so your art in `public/heroes` is safe.

---

## Applying a change I send you

When I hand you a change, it'll be a **patch file** (`something.patch`). This is
the real version of "get patch, apply to the right areas" — git places every
line in the right file for you.

```powershell
git apply --check some-change.patch    # dry run: does it apply cleanly?
git apply some-change.patch            # actually apply it
npm run dev                            # test
git add -A
git commit -m "Apply: <description>"
```

If `--check` reports a conflict, your code and the patch disagree somewhere —
send me your current state and I'll rebuild the patch against it.

To make a patch of your *own* changes to send to me:

```powershell
git diff > my-changes.patch
```

---

## Cutting a build for playtesters

**Preferred: the devtool.** `npm run devtool` → Patches tab → step 7 (Tag a
release version) → step 6 (Package). Same commands as below, run for you with
their output shown, no terminal needed.

**Or by hand:**

```powershell
# 1. make sure the art is present (a fresh clone won't have it)
python3 tools/import_characters.py --src <packs> --out public/heroes

# 2. bump the version — this drives the installer name and future auto-update
npm version patch          # 0.1.0 -> 0.1.1, commits and tags automatically

# 3. build installers
npm run package            # lands in release/

# 4. hand out release/Guildbound Setup 0.1.1.exe
```

Two steps people forget, both with silent consequences:

- **Skipping `npm version patch`** — every build reports the same version, and
  auto-update (when you add it) never triggers.
- **Skipping the recolor step on a clean clone** — the installer builds fine but
  ships with the plain generated sprites instead of your pack, with no error.

Art import isn't in the devtool (it needs the original source packs on disk,
which vary in location), so that one step still needs the terminal even if you
do everything else through the devtool.

`release/` is gitignored, so installers never bloat the repo.

---

## The one trap that costs player progress

When a change adds a field to the **game save** (anything in `GameState`),
players who have been running for weeks load an old save on update. Handle it:

1. Bump `SAVE_VERSION` in `src/game/types.ts`.
2. Add a migration in `src/game/managers/SaveManager.ts` that fills the new field.

**Settings changes do not need this** — settings are stored separately from the
save and merge forgivingly, so adding a new toggle never risks anyone's guild.
That separation is deliberate. When you're unsure whether a change touches the
save, ask, and I'll confirm whether a migration is needed.

---

## Cheat sheet

| I want to… | Devtool | Or by hand |
| --- | --- | --- |
| Try a change | Patches tab → Start (dev server) | `npm run dev` |
| See what changed | Patches tab shows git status | `git diff` |
| Save a checkpoint | Patches tab → Commit | `git add -A` then `git commit -m "..."` |
| Undo all uncommitted changes | — | `git reset --hard HEAD` |
| List checkpoints | — | `git log --oneline` |
| Apply a patch from me | Patches tab → select it → Check → Apply | `git apply file.patch` |
| Make a patch for me | — | `git diff > my-changes.patch` |
| Confirm nothing's broken | Patches tab → Run build | `npm run build` |
| Build for testers | Patches tab → Tag a version → Run package | `npm version patch` then `npm run package` |
| Regenerate sprites | — | `python3 tools/import_characters.py --src <packs> --out public/heroes` |
