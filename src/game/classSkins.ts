import type { GameState, HeroClass, RaidDifficulty } from './types';
import { SKINS, SKIN_BY_ID, HERO_CLASSES } from './data/progression';
import { RAID_DIFFICULTY_ORDER, RAID_BY_ID } from './data/raids';

/**
 * Per-class skins (patch 0415, Frost Court) -- a skin whose SkinDef has
 * `perClass` set is owned one hero CLASS at a time rather than once for the
 * whole guild, and each class must first be EARNED (unlockRaidId +
 * unlockMinDifficulty) before it can be bought with gold. Everything else about skins is unchanged:
 * guild-wide liveries still live in state.unlockedSkins exactly as before.
 *
 * Two lists, both keyed `${skinId}:${heroClass}`:
 *  - state.classSkinsEarned -- the unlock condition has been met; the
 *    class's version can now be bought. Never removed.
 *  - state.classSkinsOwned  -- bought; any hero of that class can wear it.
 * Both optional on GameState (undefined on every save from before this
 * patch) and always read through the helpers below with `?? []`, same
 * defensive convention tombstone styles already use -- no migration step.
 */

export const classSkinKey = (skinId: string, heroClass: string) => `${skinId}:${heroClass}`;

export const PER_CLASS_SKINS = SKINS.filter((s) => s.perClass);

export function isClassSkinEarned(state: GameState, skinId: string, heroClass: string): boolean {
  return (state.classSkinsEarned ?? []).includes(classSkinKey(skinId, heroClass));
}

export function isClassSkinOwned(state: GameState, skinId: string, heroClass: string): boolean {
  return (state.classSkinsOwned ?? []).includes(classSkinKey(skinId, heroClass));
}

/** Can a hero of this class wear this skin right now? Covers both kinds. */
export function canWearSkin(state: GameState, skinId: string, heroClass: string): boolean {
  if (skinId === 'original') return true;
  const def = SKIN_BY_ID[skinId];
  if (!def) return false;
  if (def.perClass) return isClassSkinOwned(state, skinId, heroClass);
  return state.unlockedSkins.includes(skinId);
}

/** Player-facing reason a per-class skin is still locked for a class. */
export function classSkinLockReason(skinId: string, heroClass: string): string {
  const def = SKIN_BY_ID[skinId];
  const cls = HERO_CLASSES[heroClass as HeroClass]?.name ?? heroClass;
  if (!def?.unlockRaidId) return 'Not available yet.';
  const raidName = RAID_BY_ID[def.unlockRaidId]?.name ?? 'the raid';
  const min = def.unlockMinDifficulty ?? 'normal';
  const diff = min === 'normal' ? '' : ` on ${cap(min)} or harder`;
  const art = /^[aeiou]/i.test(cls) ? 'an' : 'a';
  return `Clear ${raidName}${diff} with ${art} ${cls} in the party.`;
}

/** Compact version for the small shop cards (full sentence goes in the tooltip). */
export function classSkinLockShort(skinId: string): string {
  const def = SKIN_BY_ID[skinId];
  if (!def?.unlockRaidId) return 'Not available yet.';
  const raidName = (RAID_BY_ID[def.unlockRaidId]?.name ?? 'the raid').replace(/^The /, '');
  const min = def.unlockMinDifficulty ?? 'normal';
  return `${min === 'normal' ? '' : `${cap(min)}+ `}${raidName} with this class`;
}

const rank = (d: RaidDifficulty) => RAID_DIFFICULTY_ORDER.indexOf(d);

/**
 * Called from RaidManager.resolve on a FULL clear. Marks every per-class
 * skin whose classUnlock matches this raid + difficulty as earned for each
 * class in the party. Returns the newly-earned entries (empty on a repeat)
 * so the engine can announce them once.
 */
export function earnFromRaidClear(
  state: GameState, raidId: string, difficulty: RaidDifficulty, heroClasses: string[],
): { skinId: string; heroClass: string }[] {
  const out: { skinId: string; heroClass: string }[] = [];
  for (const def of PER_CLASS_SKINS) {
    if (def.unlockRaidId !== raidId || rank(difficulty) < rank(def.unlockMinDifficulty ?? 'normal')) continue;
    for (const cls of new Set(heroClasses)) {
      const key = classSkinKey(def.id, cls);
      const earned = state.classSkinsEarned ?? [];
      if (earned.includes(key)) continue;
      state.classSkinsEarned = [...earned, key];
      out.push({ skinId: def.id, heroClass: cls });
    }
  }
  return out;
}

/**
 * One-time backfill on load for saves that already cleared the raid before
 * this patch: raidLog keeps the last 30 raids with their heroIds, so any
 * qualifying clear still in that log earns its classes now. Heroes who
 * have since retired can't be resolved to a class and are skipped -- the
 * log is the only record of who was in a party.
 */
export function backfillFromRaidLog(state: GameState): number {
  let n = 0;
  for (const r of state.raidLog ?? []) {
    if (!r.fullClear) continue;
    const classes = r.heroIds
      .map((id) => state.heroes.find((h) => h.id === id)?.heroClass)
      .filter((c): c is HeroClass => !!c);
    n += earnFromRaidClear(state, r.raidId, r.difficulty, classes).length;
  }
  return n;
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
