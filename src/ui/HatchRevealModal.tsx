import { useState } from 'react';
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
  // Draft rename field (patch 0303, direct request) -- a freshly hatched
  // pet's name defaults to its species name (PetManager.hatch's own
  // `name: def?.name ?? 'Unnamed'`), so every pet of the same species
  // starts out sharing one identical name until renamed. Previously this
  // card offered no way to fix that on the spot; a player had to close
  // it, go find the pet in the Pets tab, and rename it there. Seeded
  // fresh each time a NEW pet hatches (pet?.uid dependency) via useState's
  // lazy initializer, rather than syncing with a useEffect, same "derive
  // once per identity change, not on every render" shape HatcheryPanel's
  // own petCard draft already uses.
  const [draft, setDraft] = useState(pet?.name ?? '');
  const [lastPetUid, setLastPetUid] = useState(pet?.uid);
  if (pet && pet.uid !== lastPetUid) {
    setLastPetUid(pet.uid);
    setDraft(pet.name);
  }
  if (!pet) return null;

  const def = PET_BY_ID[pet.defId];

  // Commits whatever's in the draft field (if it actually differs from
  // the pet's current name) before running the given follow-up action --
  // shared by both Close and Go to Pets so neither one silently discards
  // a name the player already typed but never explicitly confirmed.
  // Renaming to the exact same default name PetManager.rename would
  // reject as empty never fires here since draft is always pet-seeded,
  // never blank, so there's no error path to surface in this card.
  const commitAndThen = (after: () => void) => {
    if (draft.trim() && draft.trim() !== pet.name) engine.renamePet(pet.uid, draft);
    after();
  };

  const goToPets = () => commitAndThen(() => {
    engine.requestTab('hatchery', undefined, 'pets');
    engine.dismissHatchedPet();
  });
  const close = () => commitAndThen(() => engine.dismissHatchedPet());

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>It Hatched!</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          A new {def?.name ?? 'creature'} joins your guild.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
          <PetSprite
            species={def?.spriteFolder ?? pet.defId}
            rarity={pet.rarity}
            animation="idle"
            height={72}
            title={draft || pet.name}
            fallback={<span style={{ fontSize: '2.6rem' }}>{def?.glyph ?? '\u2753'}</span>}
          />
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 4 }}>
          <span className="small">{def?.name ?? 'Unknown species'}</span>
          <RarityPill rarity={pet.rarity} />
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 10 }}>
          <label className="tiny muted" htmlFor="hatch-name-input">Name this pet</label>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
          <input
            id="hatch-name-input"
            type="text"
            value={draft}
            maxLength={24}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') close(); }}
            style={{
              background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
              color: 'var(--parchment)', padding: '4px 8px', textAlign: 'center', width: 180,
            }}
          />
        </div>

        <div className="row end" style={{ marginTop: 14, gap: 8, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={close}>Close</button>
          <button className="btn-primary" onClick={goToPets}>Go to Pets</button>
        </div>
      </div>
    </div>
  );
}
