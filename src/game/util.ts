import { Modifiers, Rarity, ZERO_MODS } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

export function scaleMods(mods: Partial<Modifiers>, factor: number): Partial<Modifiers> {
  const out: Partial<Modifiers> = {};
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
};

export function describeMods(mods: Partial<Modifiers>): string[] {
  return (Object.keys(MOD_LABEL) as (keyof Modifiers)[])
    .filter((key) => (mods[key] ?? 0) !== 0)
    .map((key) => `${MOD_LABEL[key]} ${pct(mods[key] ?? 0)}`);
}
