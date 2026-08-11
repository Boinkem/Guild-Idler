# Background music

Drop your track here as:

```
public/audio/background-music.mp3
```

That's the only file this folder expects — see `src/game/music.ts`
(`MUSIC_SRC`) for exactly where it's referenced. mp3 and ogg both play
fine in this app's Electron/Chromium runtime; if your file is a
different format, either convert it or change `MUSIC_SRC` in
`src/game/music.ts` to match your file's extension.

No file here yet? Nothing breaks — `MusicManager` fails silently on a
missing/unloadable track, the same "absent art just doesn't render"
convention every other gitignored asset folder in this game already
follows (`public/heroes`, `public/vendors`, `public/pets`).

**Behaviour, once a file's in place:**
- Silent at app launch and in the small idle-companion window.
- Fades in over ~3 seconds when the guild menu opens.
- Cuts to silence immediately when the guild menu closes — unless
  "Keep playing when minimized" is turned on in Settings → Music, in
  which case it keeps playing behind the idle companion instead.
- Volume, the on/off switch, and that "keep playing" behaviour are all
  live-adjustable from Settings → Music at any time.

This file itself (`background-music.mp3`) is gitignored — see the
comment in `.gitignore` — since it's almost certainly licensed audio
you don't have redistribution rights to commit. This README stays
tracked so the folder (and the instructions) survive a fresh clone.
