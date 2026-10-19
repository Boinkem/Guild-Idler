import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { DlcManager } from '../game/managers/DlcManager';
import { PetSprite } from './sprites/PetSprite';
import { RarityPill } from './RarityPill';
import { EggIcon } from './EggIcon';
import { at } from './resultFx';
import { RARITY_COLOR, RARITY_ORDER } from '../game/util';

/** Crack paths drawn across the egg as it wobbles (96px box). */
const CRACKS = ['M48 20 L44 34 L52 42 L46 54', 'M30 46 L40 50 L36 62 L44 70', 'M66 40 L58 50 L64 60 L56 72', 'M22 62 L34 64 L30 76', 'M74 58 L62 66 L70 78'];

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

  const def = DlcManager.petDef(pet.defId);
  // 0 for common/uncommon up to 3 for legendary: longer shake, rays, glints.
  const extra = Math.max(0, RARITY_ORDER.indexOf(pet.rarity) - 1);
  const shake = 1300 + extra * 250;
  const T = { shake, burst: 450 + shake };

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
      <div
        className="modal hfx-reveal"
        style={{ textAlign: 'center', color: RARITY_COLOR[pet.rarity], ...({ '--hfx-shake': `calc(var(--fx-t) * ${T.shake})` } as CSSProperties) }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Patch 0424 -- the hatch moment. The egg drops into its nest and
            wobbles three times, harder each time as cracks spread, then
            bursts in a flash with shell shards and the pet pops up already
            playing its idle animation. Higher rarities shake longer and get
            light rays and glints. One CSS timeline (resultFx.tsx); with
            Reduce motion it lands straight on the final frame. */}
        <div className="hfx-stage" aria-hidden="true">
          {extra > 0 && <span className="hfx-rays" style={at(T.burst)} />}
          <span className="hfx-nest" />
          <span className="hfx-shadow" style={at(T.burst)} />
          <span className="hfx-egg" style={at(150)}>
            <span className="hfx-egg-shake" style={at(450)}>
              <span className="hfx-egg-pop" style={at(T.burst)}>
                <EggIcon rarity={pet.rarity} size={96} />
                <svg className="hfx-cracks" viewBox="0 0 96 96">
                  {CRACKS.slice(0, 3 + Math.min(2, extra)).map((d, i, arr) => (
                    <path key={i} d={d} style={at(450 + T.shake * (0.1 + (i * 0.8) / arr.length))} />
                  ))}
                </svg>
              </span>
            </span>
          </span>
          {Array.from({ length: 8 + extra * 3 }, (_, i) => (
            <span key={i} className={`hfx-shard h${i % 8}`} style={at(T.burst)} />
          ))}
          <span className="hfx-pet" style={at(T.burst + 120)}>
            <PetSprite
              species={def?.spriteFolder ?? pet.defId}
              rarity={pet.rarity}
              animation="idle"
              height={84}
              title={draft || pet.name}
              fallback={<span style={{ fontSize: '2.6rem' }}>{def?.glyph ?? '\u2753'}</span>}
            />
          </span>
          {extra >= 2 && Array.from({ length: 4 + extra * 2 }, (_, i) => (
            <span key={i} className="hfx-glint" style={at(T.burst + 320 + i * 140, { left: `${22 + ((i * 37) % 56)}%`, top: `${14 + ((i * 23) % 50)}%` })} />
          ))}
          <span className="hfx-flash" style={at(T.burst)} />
        </div>

        <h3 className="hfx-title" style={at(T.burst + 450, { marginBottom: 4 })}>It Hatched!</h3>
        <p className="small muted hfx-late" style={at(T.burst + 650, { marginTop: 0 })}>
          A new {def?.name ?? 'creature'} joins your guild.
        </p>

        <div className="row hfx-late" style={at(T.burst + 850, { justifyContent: 'center', gap: 6, marginBottom: 4 })}>
          <span className="small" style={{ color: 'var(--parchment)' }}>{def?.name ?? 'Unknown species'}</span>
          <span className="hfx-pill"><RarityPill rarity={pet.rarity} /></span>
        </div>

        <div className="hfx-late" style={at(T.burst + 1100)}>
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

        </div>

        <div className="row end hfx-late" style={at(T.burst + 1400, { marginTop: 14, gap: 8, justifyContent: 'center' })}>
          <button className="btn-primary" onClick={close}>Close</button>
          <button className="btn-primary" onClick={goToPets}>Go to Pets</button>
        </div>
      </div>
    </div>
  );
}
