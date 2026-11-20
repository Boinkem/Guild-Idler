import { Rarity } from '../game/types';
import { MYTHIC_COLOR, RARITY_COLOR } from '../game/util';

/**
 * The colored-border pill treatment, now the single default for showing an
 * item's rarity anywhere in the game -- replaces the older "colored ◇ text"
 * convention, which was still lingering in loot previews (QuestResultModal,
 * QuestPanel) after EquipmentPanel's icon-card redesign introduced this
 * version. One shared component so every spot stays visually identical
 * rather than drifting again.
 */
export function RarityPill({ rarity, mythic }: { rarity: Rarity; mythic?: boolean }) {
  // Patch 0506 -- a Mythic consumable shows "mythic" in its own colour
  // instead of its underlying legendary rarity.
  if (mythic) {
    return (
      <span className="rarity-pill rarity-pill-mythic" style={{ color: MYTHIC_COLOR, borderColor: MYTHIC_COLOR }}>
        mythic
      </span>
    );
  }
  return (
    <span className="rarity-pill" style={{ color: RARITY_COLOR[rarity], borderColor: RARITY_COLOR[rarity] }}>
      {rarity}
    </span>
  );
}
