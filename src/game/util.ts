import { Modifiers, Rarity, Role, Stats, ZERO_MODS } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Diminishing-returns soft cap for a raw additive modifier total --
 * currently used for gold/xp (see QuestManager/RaidManager, and
 * guild-idler-status.md's patch 0214 writeup), which unlike success/speed
 * had no ceiling at all before this. Same shape as QuestManager's own
 * curveInvestment: fully linear (1:1) below `threshold`, then an
 * exponential approach to `threshold + decay` above it, slope exactly 1 at
 * the crossover so there's no discontinuous jump. capExtra and decay are
 * intentionally the same single parameter here (unlike curveInvestment's
 * independently-tunable capExtra/decay) -- that equality is what
 * guarantees the curve never returns MORE than raw for any input (the
 * initial slope capExtra/decay must be <=1 or the "soft cap" would
 * amplify small values instead of damping them). Never soften a negative
 * or zero raw value -- same "penalties pass through unchanged" rule
 * curveInvestment already follows.
 */
export function softCap(raw: number, threshold: number, decay: number): number {
  if (raw <= threshold) return raw;
  const excess = raw - threshold;
  return threshold + decay * (1 - Math.exp(-excess / decay));
}

export function sumMods(...sources: Partial<Modifiers>[]): Modifiers {
  const total: Modifiers = { ...ZERO_MODS };
  for (const source of sources) {
    for (const key of Object.keys(total) as (keyof Modifiers)[]) {
      total[key] += source[key] ?? 0;
    }
  }
  return total;
}

export function scaleMods(mods: Partial<Modifiers> | undefined, factor: number): Partial<Modifiers> {
  const out: Partial<Modifiers> = {};
  if (!mods) return out;
  for (const key of Object.keys(mods) as (keyof Modifiers)[]) {
    out[key] = (mods[key] ?? 0) * factor;
  }
  return out;
}

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b9ad93',
  uncommon: '#79a86b',
  rare: '#5b8fd6',
  epic: '#a874d6',
  legendary: '#d9a441',
};

/** Full-bleed banner art for each rarity tier, shown behind item cards and
 *  their detail modals (see .rarity-banner / .modal-banner in app.css).
 *  Files live in public/rarity-banners/ -- ship all five alongside this. */
export const RARITY_BANNER: Record<Rarity, string> = {
  common: './rarity-banners/common.png',
  uncommon: './rarity-banners/uncommon.png',
  rare: './rarity-banners/rare.png',
  epic: './rarity-banners/epic.png',
  legendary: './rarity-banners/legendary.png',
};

/**
 * Generic large-number abbreviation -- formatGold's own logic was never
 * actually gold-specific. Extracted so Renown (which can genuinely reach
 * 5-6 digits after many retirements) gets the same treatment instead of
 * showing as a big raw number right next to a neatly-abbreviated gold
 * value -- confirmed as a real inconsistency, not a hypothetical one.
 */
export function formatNumber(value: number): string {
  const n = Math.floor(value);
  if (n < 10_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/** Alias kept for gold-specific call sites and clarity -- identical
 *  formatting to formatNumber. Renown and any other large currency should
 *  use formatNumber directly rather than calling this on non-gold values. */
export function formatGold(value: number): string {
  return formatNumber(value);
}

/**
 * Material stock display -- whole numbers show as-is, but
 * `harvest.baseYieldPerCatch` can be fractional (0.5 per catch as of the
 * spawn-rate/yield retune), so raw totals can genuinely land on a half-unit.
 * Rounds only for display; the underlying `state.materials` value stays
 * exact so two half-catches still add up to a whole unit with nothing lost.
 */
export function formatMaterial(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return 'ready';
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatPlayTime(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  return `${hours}h ${minutes}m`;
}

export function pct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

export const MOD_LABEL: Record<keyof Modifiers, string> = {
  success: 'Success',
  gold: 'Gold',
  xp: 'Experience',
  loot: 'Rare loot',
  injuryResist: 'Injury resist',
  speed: 'Quest speed',
  durability: 'Gear wear reduction',
  health: 'Max Health',
  revivalDiscount: 'Revival discount',
  petHealth: 'Companion Max Health',
  petRevivalDiscount: 'Companion revival discount',
  repairDiscount: 'Repair discount',
  scrapBonus: 'Scrap bonus',
  consumableDiscount: 'Consumable discount',
  enchantDiscount: 'Enchanting discount',
  blackMarketDiscount: 'Black Market discount',
};

/**
 * Every other Modifiers key is already percentage-flavoured (even
 * injuryResist/loot, which are flat, are flat PERCENTAGE POINTS), so
 * pct() (which appends "%") reads correctly for all of them. `health`
 * is the first key that's a flat point value with no percent meaning at
 * all -- formatted separately here rather than teaching pct() a special
 * case, since every other current and future caller of pct() genuinely
 * is a percentage.
 */
function formatModValue(key: keyof Modifiers, value: number): string {
  if (key === 'health' || key === 'petHealth') return `${value > 0 ? '+' : ''}${value}`;
  return pct(value);
}

export function describeMods(mods: Partial<Modifiers> | undefined): string[] {
  const safe = mods ?? {};
  return (Object.keys(MOD_LABEL) as (keyof Modifiers)[])
    .filter((key) => (safe[key] ?? 0) !== 0)
    .map((key) => `${MOD_LABEL[key]} ${formatModValue(key, safe[key] ?? 0)}`);
}

export const STAT_LABEL: Record<keyof Stats, string> = {
  strength: 'Strength',
  endurance: 'Endurance',
  luck: 'Luck',
  wisdom: 'Wisdom',
};

/**
 * Strength's display name per combat role -- what the stat actually does
 * never changes (still `strength` under the hood, same growth curve, same
 * statMods formula), only how it reads against a hero who isn't a Melee.
 * Only `strength` gets this treatment; endurance/luck/wisdom keep their
 * plain STAT_LABEL everywhere, confirmed scope. Melee's own entry equals
 * STAT_LABEL.strength on purpose, so `ROLE_STAT_LABEL[role]` is always a
 * safe direct substitute with no special-casing needed at the call site.
 */
export const ROLE_STAT_LABEL: Record<Role, string> = {
  melee: 'Strength',
  ranged: 'Agility',
  caster: 'Intellect',
};

/**
 * Hero-card version -- always has one specific hero, so this can commit to
 * the real per-role label. See HeroManager.activeRole for the "trained
 * role, falling back to the class's native one" resolution every caller
 * should use to get `role` in the first place; this function itself takes
 * a plain Role, not a Hero, to stay decoupled from HeroManager.
 */
export function roleAwareStatLabel(key: keyof Stats, role: Role): string {
  return key === 'strength' ? ROLE_STAT_LABEL[role] : STAT_LABEL[key];
}

/**
 * Crafting/Enchanting's version -- deliberately NOT role-aware, even
 * though a targeted item is sometimes equipped (and so sometimes has a
 * resolvable hero/role). Considered resolving a real role there and
 * decided against it: an enchant target's hero is only known when the
 * item happens to already be equipped, so the exact same stat would read
 * "Strength" for an unequipped stash item and "Intellect" for the same
 * item the moment it's equipped on a caster -- inconsistent within the
 * same screen, and confusing in a way a single flat label isn't. "Main
 * Stat" reads correctly regardless of what's equipped where, and the
 * per-role names are still visible everywhere that actually has one
 * committed hero (the hero card, via roleAwareStatLabel above).
 */
export function craftingStatLabel(key: keyof Stats): string {
  return key === 'strength' ? 'Main Stat' : STAT_LABEL[key];
}

/** Hover copy wherever craftingStatLabel's "Main Stat" appears -- kept as
 *  one shared constant so the wording can't drift between Crafting's
 *  stat picker and the "Enchanted: ..." display on an already-enchanted
 *  item, patch 0214/CraftingStation's own settled convention. */
export const MAIN_STAT_TOOLTIP = 'Strength for Melee heroes, Intellect for Casters, Agility for Ranged.';

/** Enchanting's own flat (non-percentage) bonuses -- see EquipmentItem.enchantStats.
 *  `useMainStatLabel`, when true, substitutes craftingStatLabel for strength
 *  instead of the plain STAT_LABEL -- opt-in and defaulted false so every
 *  existing call site (e.g. Replay Memories' loot preview, which isn't part
 *  of the Crafting/Enchanting flow this was built for) keeps its current
 *  literal "Strength" unless it deliberately asks for the Main Stat
 *  treatment. */
export function describeStats(stats: Partial<Stats> | undefined, useMainStatLabel = false): string[] {
  const safe = stats ?? {};
  return (Object.keys(STAT_LABEL) as (keyof Stats)[])
    .filter((key) => (safe[key] ?? 0) !== 0)
    .map((key) => `${useMainStatLabel ? craftingStatLabel(key) : STAT_LABEL[key]} +${safe[key]}`);
}
