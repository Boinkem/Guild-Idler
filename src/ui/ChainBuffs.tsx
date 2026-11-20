import { useEngine } from './useEngine';
import { Hero, QuestOffer } from '../game/types';
import { CHAIN_BY_ID, QuestManager } from '../game/managers/QuestManager';
import { InventoryManager } from '../game/managers/InventoryManager';
import { ConsumableIcon } from './icons';

/**
 * Patch 0506 -- chain-lasting consumables ("Long Road" line and the chain
 * Mythics) a hero is carrying on a chain they're partway through. Shown
 * under the hero's Consumable Slots (EquipmentPanel). These stay active for
 * every later stage of that chain the same hero runs, and use their slot on
 * those stages only.
 */
export function ChainBuffList({ hero }: { hero: Hero }) {
  const engine = useEngine();
  const state = engine.state;
  const entries = Object.entries(hero.chainBuffs ?? {}).filter(([, ids]) => ids.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="chain-buff-list">
      <div className="section-heading" style={{ marginBottom: 4 }}>Chain buffs</div>
      <p className="tiny muted subtitle" style={{ marginTop: 0, marginBottom: 6 }}>
        Active for every remaining stage of the chain {hero.name} runs. They use a consumable slot on those stages only.
      </p>
      {entries.map(([key, ids]) => {
        const [chainId, replay] = key.split('::');
        const chainName = CHAIN_BY_ID[chainId]?.name ?? chainId;
        return (
          <div key={key} className="chain-buff-row">
            <span className="chain-buff-chain">{chainName}{replay ? ` (${replay} replay)` : ''}</span>
            <span className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
              {ids.map((id, i) => {
                const def = InventoryManager.resolveDef(state, id);
                if (!def) return null;
                return (
                  <span key={`${id}-${i}`} className={`chain-buff-chip ${def.mythic ? 'mythic' : ''}`} title={def.description}>
                    <ConsumableIcon icon={def.icon} glyph={def.glyph} size={18} />
                    {def.name}
                  </span>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Names of the chain buffs a hero would carry onto this offer (empty if
 *  none, or the offer isn't a chain stage) -- for the quest card badge. */
export function chainBuffNamesFor(hero: Hero, offer: QuestOffer, resolve: (id: string) => string | undefined): string[] {
  if (!offer.chain) return [];
  const ids = hero.chainBuffs?.[QuestManager.chainBuffKey(offer.chain)] ?? [];
  return ids.map(resolve).filter((n): n is string => !!n);
}
