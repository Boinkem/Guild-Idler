import { useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { GuildManager } from '../../game/managers/GuildManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { HERO_CLASSES, ROLES } from '../../game/data/progression';
import { Hero, Role } from '../../game/types';
import { formatGold } from '../../game/util';
import { HeroSprite } from '../sprites/HeroSprite';
import { RoleIcon } from '../RoleIcon';

/**
 * One role card per Role inside the training modal -- the "richer, card
 * per role with art/description" treatment requested directly, replacing
 * the plain text `skin-chip` row this used to be (see HeroesPanel.tsx,
 * patch 0135 through 0141). Unlike that old row, the class-specific
 * flavour name (e.g. a Melee Wizard's "Arcane Swordster") is printed here
 * as real visible copy, not stuffed into a `title` tooltip -- the whole
 * point of moving this into its own dedicated spot.
 */
function RoleCard({ hero, role, active }: { hero: Hero; role: Role; active: boolean }) {
  const engine = useEngine();
  const state = engine.state;
  const classDef = HERO_CLASSES[hero.heroClass];
  const unlocked = HeroManager.unlockedRoles(hero).includes(role);
  const cost = HeroManager.roleCost(hero, role);
  const flavorName = classDef?.roleFlavors[role] ?? role;
  // Per-class description now, not a generic per-role paragraph shared
  // across every class -- direct request: since the name already varies
  // per class (a Melee Wizard reads as "Arcane Swordster," not "Melee"),
  // the description should too. Falls back to roles.json's own generic
  // per-role text only if a class is somehow missing this (shouldn't
  // happen for any real class -- HeroClassDef.roleDescriptions is
  // required -- but a malformed DLC class def is the same defensive
  // case roleDisplayName's own fallback already guards against).
  const description = classDef?.roleDescriptions[role] ?? ROLE_DESCRIPTION[role];

  return (
    <div
      className="card"
      style={{
        flex: '1 1 170px', minWidth: 170, marginBottom: 0, textAlign: 'center',
        borderColor: active ? 'var(--moss)' : undefined,
      }}
    >
      <RoleIcon role={role} size={56} />
      <div className="card-title" style={{ marginTop: 6 }}>{flavorName}</div>
      <p className="tiny muted" style={{ margin: '2px 0 0' }}>{ROLE_LABEL[role]}</p>
      <p className="tiny" style={{ marginTop: 6, minHeight: '2.4em' }}>
        {description}
      </p>
      {active ? (
        <p className="tiny good" style={{ marginTop: 10, fontWeight: 700 }}>Currently active</p>
      ) : (
        <button
          className="btn-primary"
          style={{ marginTop: 10, width: '100%' }}
          disabled={state.gold < cost}
          onClick={() => engine.trainRole(hero.id, role)}
        >
          {unlocked ? 'Swap' : 'Unlock'} · {formatGold(cost)}
        </button>
      )}
    </div>
  );
}

// Pulled from ROLES/roles.json rather than hardcoded, but indexed here
// once per render pass so RoleCard doesn't re-derive ROLE_BY_ID lookups
// three times over -- roles.json is exactly 3 fixed entries (see its own
// DevTool schema comment), so a plain Record is fine, no need for the
// heavier ROLE_BY_ID machinery RaidsPanel uses for arbitrary raid data.
const ROLE_LABEL: Record<Role, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.name])) as Record<Role, string>;
const ROLE_DESCRIPTION: Record<Role, string> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.description ?? '']),
) as Record<Role, string>;

function TrainingModal({ hero, onClose }: { hero: Hero; onClose: () => void }) {
  const classDef = HERO_CLASSES[hero.heroClass];
  const activeRole = HeroManager.activeRole(hero);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <h3>{hero.name}</h3>
        <p className="tiny muted" style={{ marginTop: 2 }}>
          {classDef?.name ?? hero.heroClass} · Level {hero.level} -- choose a battlefield role for raid parties.
        </p>
        <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
          {ROLES.map((roleDef) => (
            <RoleCard key={roleDef.id} hero={hero} role={roleDef.id} active={activeRole === roleDef.id} />
          ))}
        </div>
        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * A compact roster tile -- portrait, name, and current role at a glance,
 * click to open TrainingModal. Deliberately just a picker into the modal
 * above, not a second full roster view: HeroesPanel stays the one place
 * to actually manage a hero (level, gear, skins, health) per the scope
 * decision this tab was built under -- see guild-idler-status.md.
 */
function HeroTile({ hero, onClick }: { hero: Hero; onClick: () => void }) {
  return (
    <div className="card" role="button" tabIndex={0} style={{ marginBottom: 0, textAlign: 'center', cursor: 'pointer' }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <HeroSprite heroClass={hero.heroClass} skin={hero.skin} height={48} />
      <div className="tiny" style={{ marginTop: 4, fontWeight: 700 }}>{hero.name}</div>
      <div className="tiny muted">
        <RoleIcon role={HeroManager.activeRole(hero)} size={12} /> {HeroManager.roleDisplayName(hero)}
      </div>
    </div>
  );
}

export function TrainingPanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const hasTraining = ModifierManager.hasUnlock(state, 'training');
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const selectedHero = state.heroes.find((h) => h.id === selectedHeroId) ?? null;

  // Same "hidden entirely, not shown-but-locked" gate as Hatchery/
  // Harvest/Grimsby's own nav entries (see MenuWindow.tsx's own filter
  // comment) already keeps this sub-tab's button off HeroesPanel's own
  // sub-tab row before Blackford Keep is cleared (patch 0305 moved this
  // gate from the top-level nav onto that button when Training became a
  // Heroes sub-tab -- see HeroesPanel.tsx's own comment), so reaching
  // this component at all means that condition is already met -- what's
  // left to gate here is purely the Training Grounds purchase.
  if (!hasTraining) {
    const cost = GuildManager.nextUpgradeCost(state, 'training_grounds');
    return (
      <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/training.jpg', settings.backgroundMood)})` }}>
        <div className="tab-scene-content">
        <h2>Training</h2>
        <p className="subtitle">Reassign a hero's battlefield role -- Melee, Ranged, or Caster.</p>
        <div className="card" style={{ marginTop: 12 }}>
          <p className="card-flavour" style={{ fontStyle: 'normal' }}>
            After Blackford Keep, the guild stopped treating a hero's role as fixed at recruitment.
            Fund a Training Grounds to open a dedicated spot for reassigning it -- no more guessing
            from a class name.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 10 }}
            disabled={cost === null || state.gold < cost}
            onClick={() => engine.buyUpgrade('training_grounds')}
          >
            Fund Training · {cost !== null ? formatGold(cost) : 'unavailable'}
          </button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/training.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <h2>Training</h2>
      <p className="subtitle">Click a hero to see their available roles.</p>
      {state.heroes.length === 0 ? (
        <p className="small muted" style={{ marginTop: 8 }}>No heroes recruited yet.</p>
      ) : (
        <div className="grid three" style={{ marginTop: 10 }}>
          {state.heroes.map((hero) => (
            <HeroTile key={hero.id} hero={hero} onClick={() => setSelectedHeroId(hero.id)} />
          ))}
        </div>
      )}
      {selectedHero && <TrainingModal hero={selectedHero} onClose={() => setSelectedHeroId(null)} />}
      </div>
    </div>
  );
}
