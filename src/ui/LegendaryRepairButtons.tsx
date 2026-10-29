import { useEngine } from './useEngine';
import { EquipmentItem } from '../game/types';
import { EquipmentManager, RepairMode } from '../game/managers/EquipmentManager';
import { shardLabel } from '../game/data/shards';
import { ShardMark } from './icons';
import { formatGold } from '../game/util';

/**
 * Patch 0454 -- the two ways to repair a Legendary, side by side, so the
 * player picks: spend a Legendary Shard (normal gold, no Scrap) or pay
 * the no-Shard markup in gold + Scrap. Used by the hero equipment modal
 * (EquipmentPanel) and the Blacksmith stash card (VendorsPanel). Free
 * repairs keep their own separate button where those already show one.
 */
export function LegendaryRepairButtons({
  item, workshop, repairDiscount, onRepair, compact = false,
}: {
  item: EquipmentItem;
  workshop: number;
  repairDiscount: number;
  onRepair: (mode: RepairMode, el: HTMLElement) => void;
  compact?: boolean;
}) {
  const engine = useEngine();
  const state = engine.state;
  const shard = EquipmentManager.repairQuote(state, item, workshop, repairDiscount, 'shard');
  const standard = EquipmentManager.repairQuote(state, item, workshop, repairDiscount, 'standard');
  if (shard.gold === 0) return null;
  const canShard = EquipmentManager.canAffordRepair(state, shard);
  const canStandard = EquipmentManager.canAffordRepair(state, standard);
  const have = state.legendaryShards ?? 0;
  return (
    <>
      <button
        className="btn-teal"
        disabled={!canShard}
        title={have < shard.shards
          ? `Needs ${shardLabel(shard.shards)} (you have ${have}). Shards drop from Heroic+ raids, Epic/Legendary quests, and scrapping Legendaries.`
          : `Spends ${shardLabel(shard.shards)} -- no Scrap needed`}
        onClick={(e) => onRepair('shard', e.currentTarget)}
      >
        {'⚒'} Repair{compact ? '' : ' with Shard'} · {formatGold(shard.gold)} + {shard.shards} <ShardMark />
      </button>
      <button
        className="btn-primary"
        disabled={!canStandard}
        title="No Shard: gold and Scrap at a markup"
        onClick={(e) => onRepair('standard', e.currentTarget)}
      >
        {'⚒'} Repair{compact ? '' : ' (no Shard)'} · {formatGold(standard.gold)} + {standard.scrap} Scrap
      </button>
    </>
  );
}
