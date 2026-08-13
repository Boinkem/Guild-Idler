import { useEngine } from './useEngine';
import { PET_BY_ID } from '../game/data/pets';
import { PetSprite } from './sprites/PetSprite';
import { RarityPill } from './RarityPill';

/**
 * Reads engine.lastHatchedPet directly and renders nothing if null -- same
 * "transient field, read-then-cleared, no local state" shape
 * QuestResultModal uses for engine.lastResult. Set by engine.hatchEgg,
 * called from the Nests tab when the player clicks a ready EggCard.
 */
export function HatchRevealModal() {
  const engine = useEngine();
  const pet = engine.lastHatchedPet;
  if (!pet) return null;

  const def = PET_BY_ID[pet.defId];

  const goToPets = () => {
    engine.requestHatcherySubTab('pets');
    engine.dismissHatchedPet();
  };

  return (
    <div className="overlay" onClick={() => engine.dismissHatchedPet()}>
      <div className="modal" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>It Hatched!</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          The egg hatched into &ldquo;{pet.name}&rdquo;.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
          <PetSprite
            species={def?.spriteFolder ?? pet.defId}
            rarity={pet.rarity}
            animation="idle"
            height={72}
            title={pet.name}
            fallback={<span style={{ fontSize: '2.6rem' }}>{def?.glyph ?? '\u2753'}</span>}
          />
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 4 }}>
          <span className="small">{def?.name ?? 'Unknown species'}</span>
          <RarityPill rarity={pet.rarity} />
        </div>

        <div className="row end" style={{ marginTop: 14, gap: 8, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => engine.dismissHatchedPet()}>Close</button>
          <button className="btn-primary" onClick={goToPets}>Go to Pets</button>
        </div>
      </div>
    </div>
  );
}
