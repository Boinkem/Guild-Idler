import { ConsumableDef, Injury } from '../types';
import { HOUR, MINUTE } from '../util';

export const CONSUMABLES: ConsumableDef[] = [
  {
    id: 'healing_potion',
    name: 'Healing Potion',
    description: 'Steadies the hands before a fight.',
    cost: 25,
    glyph: '❤',
    effect: { success: 15 },
  },
  {
    id: 'lucky_potion',
    name: 'Lucky Potion',
    description: 'Coins seem to find their way into pockets.',
    cost: 50,
    glyph: '✦',
    effect: { gold: 50 },
  },
  {
    id: 'strength_potion',
    name: 'Strength Potion',
    description: 'A hard swing and a fair price for it.',
    cost: 75,
    glyph: '⚔',
    effect: { success: 10, gold: 25 },
  },
  {
    id: 'protection_charm',
    name: 'Protection Charm',
    description: 'Your knight comes home unhurt, win or lose.',
    cost: 100,
    glyph: '⛨',
    effect: { preventInjury: true },
  },
  {
    id: 'elixir_of_fortune',
    name: 'Elixir of Fortune',
    description: 'Guarantees a favourable event on the road.',
    cost: 250,
    glyph: '☘',
    effect: { guaranteedGoodEvent: true },
  },
  {
    id: 'field_bandage',
    name: 'Field Bandage',
    description: 'Clears one injury immediately.',
    cost: 60,
    glyph: '✚',
    effect: { healInjury: true },
  },
];

export const CONSUMABLE_BY_ID: Record<string, ConsumableDef> = Object.fromEntries(
  CONSUMABLES.map((c) => [c.id, c]),
);

/** Injury templates. `healsAt` is filled in when the injury is applied. */
export interface InjuryDef {
  id: string;
  name: string;
  description: string;
  durationMs: number;
  mods: Injury['mods'];
  treatmentCost: number;
  weight: number;
}

export const INJURIES: InjuryDef[] = [
  {
    id: 'bruised', name: 'Bruised',
    description: 'Sore ribs. Nothing a day of quiet will not fix.',
    durationMs: 2 * HOUR, mods: { success: -5 }, treatmentCost: 40, weight: 34,
  },
  {
    id: 'sprained_ankle', name: 'Sprained Ankle',
    description: 'Every road is longer than it looks.',
    durationMs: 4 * HOUR, mods: { success: -5, speed: -20 }, treatmentCost: 90, weight: 26,
  },
  {
    id: 'exhausted', name: 'Exhausted',
    description: 'Swings land late and rewards land light.',
    durationMs: 3 * HOUR, mods: { success: -8, gold: -20 }, treatmentCost: 70, weight: 24,
  },
  {
    id: 'poisoned', name: 'Poisoned',
    description: 'Slow, green, and unpleasant. Treat it properly.',
    durationMs: 6 * HOUR, mods: { success: -12, gold: -15, speed: -10 }, treatmentCost: 150, weight: 12,
  },
  {
    id: 'cracked_ribs', name: 'Cracked Ribs',
    description: 'Serious. The guild surgeon will want paying.',
    durationMs: 10 * HOUR, mods: { success: -18, speed: -25 }, treatmentCost: 300, weight: 4,
  },
];

export const REST_TICK = 30 * MINUTE;
