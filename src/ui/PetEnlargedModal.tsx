import { useState } from 'react';
import { Pet } from '../game/types';
import { PET_BY_ID } from '../game/data/pets';
import { PetSprite, PetAnimation } from './sprites/PetSprite';
import { RarityPill } from './RarityPill';

const VIEW_OPTIONS: { key: PetAnimation; label: string }[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'movement', label: 'Movement' },
  { key: 'sleep', label: 'Sleep' },
];

/**
 * Opened by clicking the equipped pet on the desktop companion -- at 40px
 * tall there, a species' actual detail (and whether its animation is
 * playing at all) is hard to make out. Same overlay/modal shell as
 * everywhere else, just a big PetSprite and a row of animation buttons
 * rather than a form. Doesn't assume every species has all three -- an
 * unsupported request just falls back the same way PetSprite always does
 * (see resolveAnimation), the button still highlights what was actually
 * asked for either way.
 */
export function PetEnlargedModal({ pet, onClose }: { pet: Pet; onClose: () => void }) {
  const def = PET_BY_ID[pet.defId];
  const [view, setView] = useState<PetAnimation>('idle');

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="card-title">{pet.name}</span>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 8 }}>
          <span className="tiny muted">{def?.name ?? 'Unknown species'}</span>
          <RarityPill rarity={pet.rarity} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 12px' }}>
          <PetSprite
            species={def?.spriteFolder ?? pet.defId}
            rarity={pet.rarity}
            animation={view}
            height={160}
            title={pet.name}
            fallback={<span style={{ fontSize: '5rem' }}>{def?.glyph ?? '\u2753'}</span>}
          />
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={view === opt.key ? 'btn-primary' : 'btn-ghost'}
              style={{ minHeight: 26, fontSize: '0.75rem' }}
              onClick={() => setView(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
