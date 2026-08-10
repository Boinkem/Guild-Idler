import { SkinDef, SKINS } from '../data/progression';
import { PetDef } from '../types';
import { PETS } from '../data/pets';

/**
 * How DLC content actually gets added later without touching this app's
 * own code or shipped data.
 *
 * Steam DLC is NOT a patch in the sense a .patch file is. A code patch is
 * a text diff against existing files -- it's order-dependent and breaks
 * if an earlier one hasn't landed, because it's editing lines that might
 * not be there yet. Steam DLC is the opposite: it's Steam silently
 * copying a handful of brand-new files into the game's existing install
 * folder once the player owns that DLC's own separate App ID. Nothing
 * about the base game's own files is rewritten. If a player doesn't own
 * a given DLC pack, Steam simply never puts those files there -- there's
 * no "partial" or "conflicting" state to worry about, the same way an
 * uninstalled expansion for any other game doesn't corrupt the base
 * install.
 *
 * For that to work here, the base game has to already know WHERE to look
 * for a pack's files, without knowing what's actually in them yet. That's
 * what KNOWN_DLC_PACKS is: a short list of pack ids the base game checks
 * for on startup. Adding a new id to this list *is* an ordinary base-game
 * update (a normal Steam patch to the base app, auto-applied like any
 * other, nothing like manually chaining diffs) that happens once, whenever
 * a new pack is actually released -- not per-player, not something a
 * player can get "out of order." From that point on, EVERY player's copy
 * of the base game checks for that pack id, but only players who own it
 * will ever find real files there.
 *
 * The actual discovery, at startup, for each known pack id:
 *   fetch('./dlc/<packId>/pack.json')
 * -- same fetch-with-graceful-fallback idiom PetSprite.tsx/HeroSprite.tsx
 * already use for their own manifests (`cache: 'no-store'`, `.catch(() =>
 * null)`). If the player owns the pack, Steam already placed pack.json
 * (and whatever sprite files it references) at that exact path before the
 * game ever launched, so the fetch succeeds. If they don't own it, the
 * path simply doesn't exist on their machine -- the fetch 404s, and
 * DlcManager treats that exactly like every other "art not installed
 * yet" case already handled throughout this game (a material with no
 * icon, a hero class with no manifest entry): quietly absent, no error,
 * no broken state.
 *
 * Nothing in this file is wired into the live UI yet -- SKINS/PETS still
 * drive every skin picker and pet roster exactly as they did before this
 * existed. This is the tested mechanism sitting ready; once a real DLC
 * pack exists, call sites switch from `SKINS`/`PETS` to
 * `DlcManager.allSkins()`/`allPets()` to actually include it.
 */

/**
 * Every DLC pack id the base game currently knows to check for. Empty
 * today, on purpose -- no DLC exists yet. Grows by one entry per pack,
 * added here as part of shipping that pack (an ordinary base-game update,
 * not something that needs coordinating with when any individual player
 * happens to update), so every player's client -- whether they end up
 * owning that pack or not -- knows the path to check.
 */
const KNOWN_DLC_PACKS: string[] = [];

export interface DlcPackManifest {
  id: string;
  name: string;
  /** Skins this pack adds, minus `requiresDlc` -- the loader stamps that
   *  on automatically at merge time (see loadInstalledPacks), so a pack's
   *  own pack.json doesn't need to repeat its own id on every entry. */
  skins?: Omit<SkinDef, 'requiresDlc'>[];
  pets?: Omit<PetDef, 'requiresDlc'>[];
}

let installedPacks: Record<string, DlcPackManifest> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function fetchPack(packId: string): Promise<DlcPackManifest | null> {
  try {
    const res = await fetch(`./dlc/${packId}/pack.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const manifest = await res.json() as DlcPackManifest;
    return manifest.id === packId ? manifest : null;
  } catch {
    return null;
  }
}

export const DlcManager = {
  /**
   * Checks every known pack id once, in parallel, and caches the result
   * for the rest of the session -- call this once at startup (same
   * "load once, keep using the cached result" shape the hero/pet sprite
   * manifests already follow). Safe to call more than once; only the
   * first call actually does the fetching.
   */
  async loadInstalledPacks(): Promise<void> {
    if (loaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const results = await Promise.all(KNOWN_DLC_PACKS.map(fetchPack));
      const found: Record<string, DlcPackManifest> = {};
      for (const manifest of results) {
        if (manifest) found[manifest.id] = manifest;
      }
      installedPacks = found;
      loaded = true;
    })();
    return loadPromise;
  },

  /**
   * Whether a given DLC pack is owned/installed -- true for `undefined`
   * (base-game content, per SkinDef.requiresDlc/PetDef.requiresDlc's own
   * "unset means always available" contract). Returns false for a real
   * pack id before loadInstalledPacks has resolved, on purpose -- safe-
   * by-default (never briefly claims ownership of something not yet
   * confirmed) matters more here than avoiding one extra render before
   * the check settles, especially for anything gating what a player can
   * select/equip.
   */
  owns(dlcId: string | undefined): boolean {
    if (dlcId === undefined) return true;
    return dlcId in installedPacks;
  },

  /** Base skins plus whatever any currently-owned DLC pack adds, each
   *  stamped with its own pack's id so the UI can label/gate them. */
  allSkins(): SkinDef[] {
    const extra = Object.values(installedPacks).flatMap(
      (pack) => (pack.skins ?? []).map((s) => ({ ...s, requiresDlc: pack.id })),
    );
    return [...SKINS, ...extra];
  },

  /** Base pets plus whatever any currently-owned DLC pack adds. */
  allPets(): PetDef[] {
    const extra = Object.values(installedPacks).flatMap(
      (pack) => (pack.pets ?? []).map((p) => ({ ...p, requiresDlc: pack.id })),
    );
    return [...PETS, ...extra];
  },

  /** Which packs were actually found this session -- for a Settings/About
   *  panel to list, or for support/debugging ("I bought it but don't see
   *  it" -- did the game even find the files). */
  installedPackIds(): string[] {
    return Object.keys(installedPacks);
  },
};
