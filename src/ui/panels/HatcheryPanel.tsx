import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { PetManager } from '../../game/managers/PetManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { PET_BY_ID, hatchXpThreshold } from '../../game/data/pets';
import { FEEDABLE_MATERIALS } from '../../game/data/materials';
import { EggInstance, MaterialId, Pet } from '../../game/types';
import { RarityPill } from '../RarityPill';
import { formatGold, formatMaterial, RARITY_COLOR } from '../../game/util';
import { isTabUnread } from '../../game/attention';
import { PetSprite } from '../sprites/PetSprite';
import { PetEnlargedModal } from '../PetEnlargedModal';
import { EggIcon } from '../EggIcon';
import { EggSelectModal } from '../EggSelectModal';
import { useReviveFlash, ReviveFlash } from '../reviveFlash';

type SubTab = 'home' | 'pets';

const BONUS_LABEL: Record<string, string> = {
  success: 'Success', gold: 'Gold', xp: 'XP', loot: 'Luck',
};

export function HatcheryPanel() {
  const engine = useEngine();
  const state = engine.state;
  const [subTab, setSubTab] = useState<SubTab>('home');

  // Consumes a pending sub-tab request (see HatchRevealModal's "Go to
  // Pets") the same "read once, on mount or on a fresh request" way
  // MenuWindow already consumes engine.requestedTab -- this is the
  // one-level-deeper version for a panel's own internal tab state.
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested === 'home' || requested === 'pets') setSubTab(requested);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever sub-tab is currently active -- on mount (the
  // default 'home') and again every time the player switches sub-tabs --
  // clearing the nav shimmer for any banner-worthy notification targeting
  // this specific sub-tab (patch 0191). See acknowledgeTab's own comment
  // in engine.ts and isTabUnread in attention.ts.
  useEffect(() => {
    engine.acknowledgeTab('hatchery', subTab);
  }, [engine, subTab]);

  return (
    <>
      <h2>Hatchery</h2>
      <p className="subtitle">
        Eggs incubate as your heroes earn xp anywhere in the guild. Once hatched, a pet can be equipped to
        lend everyone a small bonus -- keep it happy and fed, or that bonus fades.
      </p>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <button
          className={`${subTab === 'home' ? 'btn-primary' : ''} ${isTabUnread(state, 'hatchery', 'home') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('home')}
        >
          Nests
        </button>
        <button
          className={`${subTab === 'pets' ? 'btn-primary' : ''} ${isTabUnread(state, 'hatchery', 'pets') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('pets')}
        >
          Pets {state.pets.length > 0 ? `(${state.pets.length})` : ''}
        </button>
      </div>

      {subTab === 'home' ? <NestsTab /> : <PetsTab />}
    </>
  );
}

function NestsTab() {
  const engine = useEngine();
  const state = engine.state;
  const slots = ModifierManager.incubationSlots(state);
  const [pickerOpen, setPickerOpen] = useState(false);
  useNow(5000); // just enough to keep progress bars visibly live

  // Fixed-count slots, not just a mapped list of whatever's in
  // incubatingEggs -- an empty Nest needs its own clickable card (opens
  // EggSelectModal) the same way an empty gear slot does, not just absence
  // from the grid. See GameState.incubatingEggs's own doc comment: Nests
  // ARE the Hatchery's equip slots, storage is the unequipped pool.
  const nestSlots = Array.from({ length: slots }, (_, i) => state.incubatingEggs[i] ?? null);

  return (
    <>
      <div className="spread" style={{ marginBottom: 10 }}>
        <p className="tiny muted" style={{ margin: 0 }}>
          {state.incubatingEggs.length}/{slots} nests filled. More come from the Nest Expansion upgrade
          in Guild Hall.
        </p>
        <button className="btn-ghost" style={{ minHeight: 26 }} onClick={() => setPickerOpen(true)}>
          Storage ({state.eggStorage.length})
        </button>
      </div>

      <div className="grid two">
        {nestSlots.map((egg, i) => (egg
          ? <EggCard key={egg.uid} egg={egg} onUnequip={() => engine.unequipEgg(egg.uid)} onHatch={() => engine.hatchEgg(egg.uid)} />
          : <EmptyNestCard key={`empty-${i}`} onClick={() => setPickerOpen(true)} />
        ))}
      </div>

      {pickerOpen && <EggSelectModal onClose={() => setPickerOpen(false)} />}
    </>
  );
}

function EmptyNestCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="card egg-empty-nest" onClick={onClick} style={{ marginBottom: 0 }}>
      <span className="card-title">Empty Nest</span>
      <p className="card-flavour">Equip an egg from storage to start it incubating.</p>
    </button>
  );
}

function EggCard({ egg, onUnequip, onHatch }: { egg: EggInstance; onUnequip: () => void; onHatch: () => void }) {
  const threshold = hatchXpThreshold(egg.rarity);
  const pct = Math.min(100, (egg.hatchXp / threshold) * 100);
  const ready = PetManager.isReady(egg);

  return (
    <div
      className={`card ${ready ? 'egg-ready' : ''}`}
      style={{ marginBottom: 0, cursor: ready ? 'pointer' : undefined }}
      onClick={ready ? onHatch : undefined}
      role={ready ? 'button' : undefined}
      tabIndex={ready ? 0 : undefined}
    >
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <EggIcon rarity={egg.rarity} size={40} />
        <div style={{ flex: 1 }}>
          <div className="spread">
            <span className="card-title">Egg</span>
            <RarityPill rarity={egg.rarity} />
          </div>
          <p className="card-flavour">
            {ready
              ? 'It stopped growing a while ago -- click to see what it became.'
              : egg.dedicatedPetId
                ? 'A special clutch -- this one has already decided what it will become.'
                : 'Hatching into something from the general pool.'}
          </p>
        </div>
      </div>
      {ready ? (
        <p className="good" style={{ margin: '8px 0 4px', fontWeight: 600 }}>Ready to Hatch!</p>
      ) : (
        <div className="harvest-stock-bar" style={{ margin: '8px 0 4px' }}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="spread">
        <span className="tiny muted">{formatMaterial(egg.hatchXp)}/{formatMaterial(threshold)} xp</span>
        <button
          className="btn-ghost"
          style={{ minHeight: 22, fontSize: '0.6875rem' }}
          onClick={(e) => { e.stopPropagation(); onUnequip(); }}
        >
          Unequip
        </button>
      </div>
    </div>
  );
}

function PetsTab() {
  const engine = useEngine();
  const state = engine.state;
  const petSlots = ModifierManager.petSlots(state);
  // Batched the same way HeroesPanel's own useReviveFlash call is -- one
  // hook call here at the list level, keyed lookup passed down to each
  // PetCard, rather than a hook call inside the .map() below.
  const { flashes: reviveFlashes, dismiss: dismissReviveFlash } = useReviveFlash(
    state.pets.map((p) => ({ id: p.uid, fallen: PetManager.isFallen(p) })),
  );

  return (
    <>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        {state.heroes.filter((h) => h.equippedPetId).length}/{petSlots} companion slots filled. Pair a pet with a
        hero below -- more slots come from the Companion Bond upgrade in Guild Hall.
      </p>
      {state.pets.length === 0 && (
        <div className="card"><p className="card-flavour">No pets hatched yet -- check the Nests tab.</p></div>
      )}
      <div className="grid two pet-grid">
        {state.pets.map((pet) => (
          <PetCard
            key={pet.uid}
            pet={pet}
            reviveFlash={reviveFlashes[pet.uid]}
            dismissReviveFlash={() => dismissReviveFlash(pet.uid)}
          />
        ))}
      </div>
    </>
  );
}

function PetCard({ pet, reviveFlash, dismissReviveFlash }: {
  pet: Pet;
  reviveFlash?: { key: number };
  dismissReviveFlash: () => void;
}) {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow(5000);
  const def = PET_BY_ID[pet.defId];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pet.name);
  const [feedMaterial, setFeedMaterial] = useState<MaterialId>('herbs');
  const [enlarged, setEnlarged] = useState(false);

  const happiness = PetManager.currentHappiness(pet, now);
  const bonus = PetManager.effectiveBonus(pet, now);
  const level = PetManager.levelForXp(pet.xp);
  // A pet is "equipped" by being paired with a specific hero now (see
  // Hero.equippedPetId) rather than sitting in a guild-wide list --
  // find whichever hero (if any) currently has this exact pet.
  const boundHero = state.heroes.find((h) => h.equippedPetId === pet.uid);
  const fallen = PetManager.isFallen(pet);
  const maxHealth = PetManager.maxHealth(state, pet);
  const currentHealth = PetManager.currentHealth(state, pet);
  const healthRatio = maxHealth > 0 ? currentHealth / maxHealth : 0;
  const treatCount = state.inventory.pet_treat ?? 0;

  const saveName = () => {
    engine.renamePet(pet.uid, draft);
    setEditing(false);
  };

  return (
    <div
      className="card pet-card-hover"
      style={{ marginBottom: 0, '--rarity-color': RARITY_COLOR[pet.rarity] } as CSSProperties}
    >
      {reviveFlash && <ReviveFlash key={reviveFlash.key} onDone={dismissReviveFlash} />}
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: 0, border: 'none', background: 'none', minHeight: 0 }}
          onClick={() => setEnlarged(true)}
          title={`${pet.name}, view enlarged`}
        >
          <PetSprite
            species={def?.spriteFolder ?? pet.defId}
            rarity={pet.rarity}
            animation="idle"
            height={48}
            title={pet.name}
            fallback={<span style={{ fontSize: '1.6rem' }}>{def?.glyph ?? '\u2753'}</span>}
          />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div className="row" style={{ gap: 6 }}>
              <input
                type="text"
                value={draft}
                maxLength={24}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
                style={{ flex: 1, minWidth: 0, background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--parchment)', padding: '4px 6px' }}
              />
              <button onClick={saveName}>Save</button>
            </div>
          ) : (
            <span className="row" style={{ gap: 6, alignItems: 'center', minWidth: 0 }}>
              <span className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {pet.name}
              </span>
              <button
                type="button"
                className="btn-ghost"
                style={{ minHeight: 0, padding: '1px 6px', fontSize: '0.6875rem', color: '#5b8fd6', borderColor: '#5b8fd6', flexShrink: 0 }}
                onClick={() => { setDraft(pet.name); setEditing(true); }}
              >
                Rename
              </button>
            </span>
          )}
          <div className="spread" style={{ marginTop: 2, gap: 6 }}>
            <p className="tiny muted" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {def?.name ?? 'Unknown species'} -- Level {level}
            </p>
            <RarityPill rarity={pet.rarity} />
          </div>
        </div>
      </div>

      <p className="card-flavour">
        +{bonus.toFixed(1)} {BONUS_LABEL[pet.bonusType] ?? pet.bonusType}
        {happiness < 100 && <span className="tiny muted"> (scaled down by happiness)</span>}
      </p>

      <div className="harvest-stock-row" style={{ marginBottom: 8 }}>
        <span className="tiny muted" style={{ width: 70 }}>Happiness</span>
        <div className="harvest-stock-bar">
          <span style={{ width: `${happiness}%` }} />
        </div>
        <span className="tiny muted" style={{ width: 40, textAlign: 'right' }}>{Math.round(happiness)}%</span>
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <select
          value={feedMaterial}
          onChange={(e) => setFeedMaterial(e.target.value as MaterialId)}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--parchment)', padding: '4px 6px' }}
        >
          {FEEDABLE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="btn-ghost" style={{ minHeight: 26 }} onClick={() => engine.feedPetMaterial(pet.uid, feedMaterial)}>
          Feed (5)
        </button>
        <button
          className="btn-ghost"
          style={{ minHeight: 26 }}
          disabled={treatCount < 1}
          onClick={() => engine.feedPetCrafted(pet.uid)}
        >
          Feed Treat ({treatCount})
        </button>
      </div>

      <div className="tiny muted" style={{ marginTop: 8, marginBottom: 3 }}>
        Health {Math.round(currentHealth)}/{maxHealth}
      </div>
      <div className={`bar health ${healthRatio < 0.25 ? 'low' : ''}`}>
        <span style={{ width: `${healthRatio * 100}%` }} />
      </div>

      {fallen ? (
        <div className="spread" style={{ marginTop: 8 }}>
          <span className="small bad">Fallen -- can't be paired until revived</span>
          <button
            onClick={() => engine.revivePet(pet.uid)}
            disabled={state.gold < PetManager.revivalCost(pet, ModifierManager.global(state).petRevivalDiscount ?? 0)}
          >
            Revive · {formatGold(PetManager.revivalCost(pet, ModifierManager.global(state).petRevivalDiscount ?? 0))}
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span className="tiny muted">Paired with:</span>
          <select
            value={boundHero?.id ?? ''}
            onChange={(e) => {
              const heroId = e.target.value;
              if (!heroId) {
                if (boundHero) engine.unequipPet(boundHero.id);
              } else {
                engine.equipPet(heroId, pet.uid);
              }
            }}
            style={{ flex: 1, minWidth: 0, background: 'var(--panel-2)', border: '1px solid var(--panel-3)', color: 'var(--parchment)', padding: '4px 6px' }}
          >
            <option value="">Unassigned</option>
            {state.heroes.map((h) => (
              <option key={h.id} value={h.id} disabled={!!h.equippedPetId && h.equippedPetId !== pet.uid}>
                {h.name}{h.equippedPetId && h.equippedPetId !== pet.uid ? ' (has a companion)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {enlarged && <PetEnlargedModal pet={pet} onClose={() => setEnlarged(false)} />}
    </div>
  );
}
