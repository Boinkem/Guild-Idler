import { useState } from 'react';
import { Role } from '../game/types';
import { ROLE_BY_ID } from '../game/data/progression';

/**
 * A small Melee/Ranged/Caster glyph -- pulled out of RaidsPanel's
 * RoleRequirementCircle (patch 0135) so the raid role-requirement circles
 * and each hero's card (patch 0141) read the exact same icon and fall back
 * to the exact same first-letter treatment, rather than two independent
 * onError implementations quietly drifting apart over time. Same
 * img-with-text-fallback-on-error convention every other DevTool-editable
 * icon in this project already uses.
 */
export function RoleIcon({ role, size = 16, title }: { role: Role; size?: number; title?: string }) {
  const def = ROLE_BY_ID[role];
  const [imgFailed, setImgFailed] = useState(false);
  const label = title ?? def?.name ?? role;

  if (def?.icon && !imgFailed) {
    return (
      <img
        src={`./item-icons/${def.icon}`}
        alt={label}
        title={label}
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle' }}
      />
    );
  }
  return (
    <span
      className="tiny"
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, verticalAlign: 'middle',
      }}
    >
      {(def?.name ?? role).slice(0, 1)}
    </span>
  );
}
