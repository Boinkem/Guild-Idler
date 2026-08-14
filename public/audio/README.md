# Background music

Two kinds of file live here, both gitignored (see the comment in
`.gitignore`) since they're licensed audio nobody but you has
redistribution rights to commit. This README stays tracked so the
folder (and the instructions) survive a fresh clone.

## The always-free ambient track

```
public/audio/background-music.mp3
```

Plays regardless of anything the guild has earned -- see
`DEFAULT_TRACK_SRC` in `src/game/music.ts`. Currently intended to be
"Tales by Firelight" from the AlkaKrab Pixel Fantasy 30 Tracks pack (see
this project's `guild-idler-status.md` for the patch that set this up).

## Earned bard tracks

```
public/audio/bard/<id>.mp3
```

One file per `src/game/data/json/bard-tracks.json` entry, named after
that entry's `id`. Unlike the old Music Hall facility, these aren't
bought -- each one unlocks the moment a specific achievement does (a
quest chain, a raid clear, a milestone, a win at Grimsby's table -- see
that achievement's own `unlocksTrackId` in `achievements.json`). The 29
ids currently wired up, straight off the same AlkaKrab pack:

```
dawn_of_blades          echoes_of_the_keep       the_old_tavern
riders_of_the_storm     banners_in_the_wind      whispers_in_the_fog
the_hidden_glade        march_of_iron            legends_of_the_flame
sacred_springs          moonlit_vale             call_of_the_raven
frostbound_path         chant_of_the_fallen      blood_and_honor
lament_of_kings         the_dark_moor            crown_of_thorns
silent_citadel          ballad_of_ashenwood      hymn_of_valor
the_last_watch          the_broken_crown         echoes_of_eternity
tales_of_the_hearth     arcane_whispers          the_forgotten_grove
the_silent_lake         twilight_march
```

mp3 and ogg both play fine in this app's Electron/Chromium runtime; if
your files are a different format, either convert them or edit each
entry's `path` in `bard-tracks.json` (via the DevTool's Bard Tracks tab)
to match.

No files here yet? Nothing breaks -- `MusicManager` fails silently on a
missing/unloadable track, the same "absent art just doesn't render"
convention every other gitignored asset folder in this game already
follows (`public/heroes`, `public/vendors`, `public/pets`). An
achievement still unlocks and still adds its track to the guild's
earned list even with no mp3 on disk yet; it just won't make sound
until the file lands.

**Behaviour, once a file's in place:**
- Silent at app launch and in the small idle-companion window.
- Fades in over ~3 seconds when the guild menu opens.
- Cuts to silence immediately when the guild menu closes — unless
  "Keep playing when minimized" is turned on in Settings → Music, in
  which case it keeps playing behind the idle companion instead.
- Volume, the on/off switch, and that "keep playing" behaviour are all
  live-adjustable from Settings → Music at any time, once at least one
  track's been earned (before that, "Guild Theme" -- the ambient
  default -- is the only option).
