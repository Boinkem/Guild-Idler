import type { EquipmentItem } from '../game/types';
import { ATTUNE_AFFIX_BY_ID, describeAttunement } from '../game/data/attunement';

/** Patch 0484 -- a Legendary's Attunement line, under its other bonuses. */
export function AttunementLine({ item }: { item: EquipmentItem }) {
  const a = item.attunement;
  if (!a) return null;
  const signature = ATTUNE_AFFIX_BY_ID[a.affix]?.kind === 'signature';
  return (
    <div className={`tiny attune-line ${signature ? 'signature' : ''}`} title="Attunement -- re-attune at the Enchanter">
      {'✦'} Attuned: {describeAttunement(a)}
    </div>
  );
}
