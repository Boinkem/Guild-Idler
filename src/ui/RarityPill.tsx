import { Rarity } from '../game/types';
import { RARITY_COLOR } from '../game/util';

/**
 * The colored-border pill treatment, now the single default for showing an
 * item's rarity anywhere in the game -- replaces the older "colored ◇ text"
 * convention, which was still lingering in loot previews (QuestResultModal,
 * QuestPanel) after EquipmentPanel's icon-card redesign introduced this
 * version. One shared component so every spot stays visually identical
 * rather than drifting again.
 */
export function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-pill" style={{ color: RARITY_COLOR[rarity], borderColor: RARITY_COLOR[rarity] }}>
      {rarity}
    </span>
  );
}
