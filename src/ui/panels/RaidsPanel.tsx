import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { RaidManager, RAIDERS_CHARM_ID } from '../../game/managers/RaidManager';
import { Tuning } from '../../game/data/tuning';
import { HeroManager } from '../../game/managers/HeroManager';
import {
  RAIDS, RAID_ENCOUNTER_BY_ID, RAID_DIFFICULTIES, RAID_DIFFICULTY_ORDER, RAID_DIFFICULTY_ICON_DEFS, raidDifficultyIconSrc, RAID_DIFFICULTY_LABEL,
  isRaidUnlocked, raidLockReason, parseLootEntry, lootForDifficulty, requiredRolesFor,
} from '../../game/data/raids';
import { EQUIPMENT_BY_ID, SET_BY_ID, itemDef, rarityRaiseFor } from '../../game/data/equipment';
import { ELEMENT_GLYPH, ELEMENT_LABEL } from '../../game/data/elements';
import { RaidDifficulty, RaidEncounterDef, RaidDef, ElementType, Hero, Role } from '../../game/types';
import { ROLE_BY_ID } from '../../game/data/progression';
import { RoleIcon } from '../RoleIcon';
import { RarityPill } from '../RarityPill';
import { RaidPartySprites } from '../sprites/RaidPartySprites';
import { HeroSprite } from '../sprites/HeroSprite';
import { fxMs } from '../purchaseFx';
import { useFirstSeen } from '../firstSeen';
import { ambPhase } from '../ambient';
import { at } from '../resultFx';
import { formatDuration, describeMods, describeStats, RARITY_COLOR } from '../../game/util';
import { goToGuildHallPurchase } from '../PrereqLink';

// Single-letter fallback badge (used only if the icon art at
// public/raid-icons/<difficulty>.png is missing).
const DIFFICULTY_LABEL: Record<RaidDifficulty, string> = { normal: 'N', heroic: 'H', mythic: 'M', legendary: 'L' };
/** Reuses the existing rarity palette rather than inventing a new colour
 *  scheme -- Normal/Heroic/Mythic/Legendary roughly parallel uncommon/
 *  rare/epic/legendary stakes, so the same visual language already
 *  trained elsewhere applies. Patch 0317: Legendary (the new top tier)
 *  moved up to RARITY_COLOR.legendary; Mythic (the renamed old top tier)
 *  took over RARITY_COLOR.epic, its old slot. */
const DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic, legendary: RARITY_COLOR.legendary,
};

/** Which upgrade unlocks each difficulty tier -- Normal comes from the base
 *  Raid Charter (the same unlock that already gates raids existing at
 *  all); Heroic and Mythic each need their own separate Clearance
 *  upgrade. Legendary (patch 0317's new top tier) deliberately has NO
 *  upgrade-based unlock at all -- it auto-unlocks once Mythic is cleared
 *  once (see RaidManager.canStart) -- so it's left out of this map and
 *  handled as a special case everywhere this map is read. */
const DIFFICULTY_UNLOCK: Record<Exclude<RaidDifficulty, 'legendary'>, 'raids' | 'raidsHeroic' | 'raidsMythic'> = {
  normal: 'raids', heroic: 'raidsHeroic', mythic: 'raidsMythic',
};
const DIFFICULTY_UNLOCK_LABEL: Record<RaidDifficulty, string> = {
  normal: 'Raid Charter', heroic: 'Heroic Clearance', mythic: 'Mythic Clearance', legendary: 'Mythic difficulty cleared',
};
/** The actual GuildPanel upgrade `def.id` behind each difficulty gate --
 *  same as DIFFICULTY_UNLOCK_LABEL above names for Normal/Heroic/Mythic
 *  (raid_charter/raid_heroic_clearance/raid_mythic_clearance, see
 *  progression.ts's UPGRADES list), kept as its own map rather than
 *  reused off DIFFICULTY_UNLOCK because that one holds the `unlocks`
 *  field's value ('raids'/'raidsHeroic'/'raidsMythic'), not the
 *  upgrade's own id -- two different strings that happen to describe the
 *  same upgrade. Used to drive engine.requestTab('guild', id) below, so
 *  a locked difficulty can jump straight to (and highlight) the exact
 *  Guild Hall card that unlocks it. Legendary has no such card -- see
 *  DIFFICULTY_UNLOCK's own comment -- so its "Unlock →" jump link is
 *  hidden entirely rather than pointing this map at an empty string. */
const DIFFICULTY_UNLOCK_ID: Record<Exclude<RaidDifficulty, 'legendary'>, string> = {
  normal: 'raid_charter', heroic: 'raid_heroic_clearance', mythic: 'raid_mythic_clearance',
};

/**
 * Which ITEM_SETS entry (equipment.ts) is "this raid's set" -- every raid
 * has exactly one, assembled entirely from that raid's own drop pool (see
 * ITEM_SETS' own comment in equipment.ts for the full list and reasoning).
 * There's no field linking a RaidDef to a set id directly in the data
 * itself, so this is a small explicit map rather than trying to infer it
 * by scanning loot pools -- a raid's encounters can drop pieces that
 * belong to an unrelated chain-reward set too (dragon_slayer pieces drop
 * in both Bonewrought Vault and Frozen Wyrmkeep, deliberately not
 * counted as either raid's "own" set -- see that same comment), so
 * inference would need this exact same judgement call encoded anyway.
 */
const RAID_SET_ID: Partial<Record<string, string>> = {
  blackford_keep: 'blackford',
  bonewrought_vault: 'bonewrought',
  frozen_wyrmkeep: 'wyrmkeep',
  what_got_out: 'what_got_out',
  black_dragon_nest: 'cinderfang',
  house_of_bones: 'grimward',
  silence_the_loom: 'loom',
  requiem_last_god: 'requiem',
};

export function raidBannerSrc(raidId: string, banner?: RaidDef['banner']) {
  return banner?.path ? `./lore/${banner.path}` : `./lore/raids/${raidId}.jpg`;
}

/**
 * Banner strip for a raid card and its detail modal. Same "missing file
 * just fails to paint, no broken-image icon" convention as quest chains'
 * own art (public/lore/chains/<id>.jpg) -- this rolls out gradually as art
 * lands in public/lore/raids/<id>.jpg rather than needing every raid's art
 * before any of it shows.
 *
 * `className` picks the surface this banner is rendered into
 * (.raid-card-thumb for the collapsed list row, .raid-active-banner for
 * the in-progress card, .raid-detail-banner for the modal) -- sizing,
 * radius and margin all live in that class now instead of inline styles,
 * so the same component works at three very different sizes.
 *
 * `banner` is the raid's optional DevTool-assigned override + focus point
 * (RaidDef.banner) -- unset falls all the way back to the original
 * id-convention path at dead-center focus, exactly as before this existed.
 *
 * `icon`/`useIcon` (patch 0270) -- when `useIcon` is true AND the raid has
 * a real `icon.path` assigned, this renders that dedicated icon instead of
 * cropping `banner`. `useIcon` true with no `icon.path` set falls straight
 * back to the exact same `banner`-crop behavior as before this existed --
 * see RaidDef.icon's own comment in types.ts for why there's no further
 * guessed-convention fallback. Only ever passed `true` at the collapsed
 * `.raid-card-thumb` call sites; every other usage (modal, active-raid
 * strip) omits it and keeps showing the full banner exactly as always.
 */
export function RaidBanner({
  raidId, banner, icon, useIcon, className,
}: { raidId: string; banner?: RaidDef['banner']; icon?: RaidDef['icon']; useIcon?: boolean; className: string }) {
  const showIcon = !!(useIcon && icon?.path);
  const src = showIcon ? `./lore/${icon!.path}` : raidBannerSrc(raidId, banner);
  const active = showIcon ? icon : banner;
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: `${active?.focusX ?? 50}% ${active?.focusY ?? 50}%`,
        // Every className this renders with (.raid-card-thumb,
        // .raid-active-banner, and the plain-strip detail-modal usage)
        // already sets `background-size: cover` in app.css -- only
        // overridden inline when an actual zoom (patch 0164) has been set
        // via the DevTool, same pattern as QuestTagBanner in QuestPanel.tsx.
        ...(active?.scale && active.scale !== 100 ? { backgroundSize: `${active.scale}%` } : {}),
      }}
    />
  );
}

function LootPreview({
  encounterId, difficulty, onShowItem,
}: { encounterId: string; difficulty: RaidDifficulty | null; onShowItem: (defId: string) => void }) {
  const engine = useEngine();
  const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
  if (!encounter) return null;
  // Falls back to Normal's pool for the preview before a difficulty is even
  // picked -- lootForDifficulty is the same helper the actual roll uses, so
  // what's shown here always matches what that tier can actually drop.
  const pool = lootForDifficulty(encounter, difficulty ?? 'normal');
  if (pool.length === 0) return null;
  return (
    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
      {pool.map((entryStr) => {
        const parsed = parseLootEntry(entryStr);
        if (!parsed) return null;
        // Patch 0488 -- shown at the rarity it would actually drop at on the
        // picked difficulty (Heroic and up raise anything below Epic), via
        // the same rarityRaiseFor/itemDef pair the real drop uses.
        const def = itemDef({
          defId: parsed.defId,
          rarity: rarityRaiseFor(EQUIPMENT_BY_ID[parsed.defId], RAID_DIFFICULTIES[difficulty ?? 'normal'].rarityFloor),
        });
        const discovered = engine.state.discoveredItems.includes(parsed.defId);
        return (
          <button
            key={parsed.defId}
            type="button"
            className="loot-chip"
            onClick={(e) => {
              e.stopPropagation();
              if (discovered && def) onShowItem(parsed.defId);
              else engine.showToast('Discover this item first.');
            }}
          >
            <span className={`tiny ${discovered && def ? '' : 'muted'}`} style={{ color: discovered && def ? RARITY_COLOR[def.rarity] : undefined }}>
              {discovered && def ? def.name : '???'}
            </span>
            {discovered && def && <RarityPill rarity={def.rarity} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The encounter's own elemental tags (RaidEncounterDef.vulnerableTo /
 * dealsElement / immuneTo) -- these already drive a real success-chance
 * bonus (RaidManager.elementalBonus, folded into both
 * previewEncounterSuccess and the live resolve() roll), but had no
 * display anywhere in this panel: a boss's weakness/attack-type/immunity
 * was invisible to the player, so there was no way to tell the elemental
 * system was doing anything, let alone plan a party or infusion around
 * it. Shown in the encounter summary row itself (not gated behind the
 * `<details>` expand) so a player can see what a boss wants before
 * picking a party, same reasoning name/success/time already show
 * unconditionally there.
 */
function EncounterElementTags({ encounter }: { encounter: RaidEncounterDef }) {
  const deals = encounter.dealsElement ?? [];
  const vulnerable = encounter.vulnerableTo ?? [];
  const immune = encounter.immuneTo ?? [];
  if (deals.length === 0 && vulnerable.length === 0 && immune.length === 0) return null;
  const glyphs = (els: ElementType[]) => els.map((el) => (
    <span key={el} title={ELEMENT_LABEL[el]}>{ELEMENT_GLYPH[el]}</span>
  ));
  return (
    <span className="tiny muted" style={{ marginLeft: 8 }}>
      {deals.length > 0 && (
        <span title={`Attacks with ${deals.map((el) => ELEMENT_LABEL[el]).join('/')} -- matching armor resist adds success`}>
          Deals {glyphs(deals)}
        </span>
      )}
      {vulnerable.length > 0 && (
        <span style={{ marginLeft: deals.length > 0 ? 6 : 0 }} title={`Vulnerable to ${vulnerable.map((el) => ELEMENT_LABEL[el]).join('/')} weapons -- a matching infusion adds success`}>
          Weak to {glyphs(vulnerable)}
        </span>
      )}
      {immune.length > 0 && (
        <span style={{ marginLeft: (deals.length > 0 || vulnerable.length > 0) ? 6 : 0 }} className="bad" title={`Immune to ${immune.map((el) => ELEMENT_LABEL[el]).join('/')} -- a matching weapon infusion is nullified here`}>
          Immune {glyphs(immune)}
        </span>
      )}
    </span>
  );
}

/** Shared across every raid card -- clicking a discovered loot entry opens
 *  this instead of each card managing its own overlay state. */
function ItemDetailOverlay({ defId, onClose }: { defId: string; onClose: () => void }) {
  const def = EQUIPMENT_BY_ID[defId];
  if (!def) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{def.name}</h3>
        <RarityPill rarity={def.rarity} />
        <p className="tiny muted" style={{ marginTop: 8 }}>{def.slot} · requires level {def.reqLevel}</p>
        <p className="small" style={{ marginTop: 8 }}>
          {/* patch 0381 bug fix: a hand-authored item's own def.stats (e.g.
              every Leather Set piece) was missing from this preview -- only
              def.mods showed, same gap as the equipped-item modals. */}
          {[...describeMods(def.mods), ...describeStats(def.stats, true)].join(' · ') || 'No bonuses'}
        </p>
        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DifficultyCircle({
  difficulty, active, unlocked, cleared, opening = false, onClick,
}: { difficulty: RaidDifficulty; active: boolean; unlocked: boolean; cleared?: boolean; opening?: boolean; onClick: () => void }) {
  const engine = useEngine();
  const color = DIFFICULTY_COLOR[difficulty];
  const [imgFailed, setImgFailed] = useState(false);
  const iconDef = RAID_DIFFICULTY_ICON_DEFS[difficulty];
  return (
    <div
      className={`raid-diff-circle-wrap ${opening ? 'fx-diff-open' : ''}`}
      style={opening ? ({ '--rdo-c': color } as CSSProperties) : undefined}
    >
      {/* Own position:relative wrapper, not the shared .raid-diff-circle-wrap
       *  (that also holds the label/unlock-link below, which shouldn't be
       *  where an edge-anchored badge measures from) -- same reasoning
       *  the checkmark below needs the button's own overflow:hidden
       *  circle out of its way, so it lives as this box's sibling, not
       *  the button's child. */}
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <button
          className={`raid-diff-circle ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
          style={{
            borderColor: color, color: active ? 'var(--night)' : color, background: active ? color : undefined,
            opacity: unlocked ? 1 : 0.4,
          }}
          onClick={onClick}
          disabled={!unlocked}
          title={unlocked
            ? `${RAID_DIFFICULTY_LABEL[difficulty]} -- ${RAID_DIFFICULTIES[difficulty].partySize} heroes${cleared ? ' -- cleared before' : ''}`
            : `Requires the ${DIFFICULTY_UNLOCK_LABEL[difficulty]} upgrade`}
        >
        {!imgFailed ? (
          // Patch 0302: was <img object-fit:contain> at 70% -- a square
          // source PNG shown whole (letterboxed) inside a round button
          // reads as "the square is showing through the circle," the
          // exact bug reported. background-image + cover fills the full
          // circle and lets the button's own border-radius:50% clip it,
          // same "crop to fill, focus point picks what's centered" shape
          // RaidBanner (just above in this file) already uses for
          // raid banners/icons -- focusX/focusY/scale default to
          // 50/50/100 (dead-center, no zoom) so this looks like a
          // reasonable center-crop even before anyone touches the new
          // DevTool adjuster.
          <div
            aria-hidden="true"
            style={{
              width: '100%', height: '100%', borderRadius: '50%',
              backgroundImage: `url(${raidDifficultyIconSrc(difficulty)})`,
              backgroundPosition: `${iconDef?.icon?.focusX ?? 50}% ${iconDef?.icon?.focusY ?? 50}%`,
              backgroundSize: iconDef?.icon?.scale && iconDef.icon.scale !== 100 ? `${iconDef.icon.scale}%` : 'cover',
            }}
          >
            {/* A background-image never fires onError, unlike <img> --
                a 1x1 transparent img sharing the exact same src is the
                simplest way to keep the existing "fall back to the
                letter label if the file's missing" behavior working. */}
            <img
              src={raidDifficultyIconSrc(difficulty)}
              alt=""
              onError={() => setImgFailed(true)}
              style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
            />
          </div>
        ) : (
          DIFFICULTY_LABEL[difficulty]
        )}
        </button>
        {/* Patch 0465 -- first view after this tier became available:
         *  the padlock rattles and pops off, the ring ignites in the
         *  tier's colour and sparks fly. See .fx-diff-open in app.css. */}
        {opening && (
          <span className="rdo-fx" aria-hidden="true">
            <span className="rdo-halo" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="rdo-spark" style={{ transform: `rotate(${i * 60}deg)` }}><i /></span>
            ))}
            <span className="rdo-lock"><span className="rdo-shackle" /><span className="rdo-body" /></span>
          </span>
        )}
        {/* Cleared-before tracker (patch 0303) -- same green check
         *  overlay treatment RoleRequirementCircle uses for "this slot is
         *  met," answering a different question here: has this raid been
         *  full-cleared at this exact difficulty at least once. Only
         *  shown while unlocked -- a locked tier can't have been cleared. */}
        {unlocked && cleared && (
          <span
            className="good"
            style={{ position: 'absolute', top: -2, right: -2, fontSize: '0.8rem', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}
            aria-hidden="true"
          >✓</span>
        )}
      </div>
      {/* Name printed below the circle rather than only living in its
       *  title tooltip -- direct request: a player shouldn't have to
       *  hover each circle to know which tier is which. */}
      <span className="tiny" style={{ color: unlocked ? color : 'var(--muted)', fontWeight: 700 }}>
        {RAID_DIFFICULTY_LABEL[difficulty]}
      </span>
      {/* The circle itself is disabled while locked, so a player can't
       *  discover "which upgrade" beyond the title tooltip on hover --
       *  this link jumps straight to the Guild Hall and spotlights the
       *  exact upgrade card, same "jump to and highlight the requirement"
       *  treatment HeroesPanel's locked recruit cards already got
       *  (patch 0179). */}
      {!unlocked && difficulty !== 'legendary' && (
        <button
          className="btn-ghost"
          style={{ fontSize: '0.5625rem', padding: '1px 4px', minHeight: 0 }}
          onClick={() => goToGuildHallPurchase(engine, DIFFICULTY_UNLOCK_ID[difficulty], `${RAID_DIFFICULTY_LABEL[difficulty]} raids`)}
          title={`Go to the Guild Hall -- ${DIFFICULTY_UNLOCK_LABEL[difficulty]}`}
        >
          Unlock →
        </button>
      )}
    </div>
  );
}

/**
 * One per role present in a raid's requiredRoles -- same bordered-icon-
 * button shape as DifficultyCircle above, plus a green check overlay once
 * the *currently selected* party meets that slot. Icon rendering itself
 * delegates to the shared RoleIcon component (patch 0141) rather than its
 * own onError logic, so this and each hero's card badge always agree on
 * what "the melee icon" actually is. Doesn't block committing if unmet --
 * raids don't hard-gate on anything else today either, this is a warning
 * (paired with the mismatch-penalty note next to it) not a lock, same
 * reasoning as the rest of the "Raid role requirements" section of
 * guild-idler-status.md's hero-roles backlog entry.
 */
function RoleRequirementCircle({ role, needed, have }: { role: Role; needed: number; have: number }) {
  const def = ROLE_BY_ID[role];
  const met = have >= needed;
  return (
    <div
      className="raid-diff-circle"
      style={{ borderColor: met ? 'var(--moss)' : 'var(--brass)', color: 'var(--brass)', position: 'relative' }}
      title={`${def?.name ?? role} ×${needed} -- ${have}/${needed} in the current selection${met ? ' (met)' : ' (missing)'}`}
    >
      <RoleIcon role={role} size={40} />
      <span className="tiny" style={{ position: 'absolute', bottom: -2, right: -2 }}>×{needed}</span>
      {met && (
        <span
          className="good"
          style={{ position: 'absolute', top: -4, left: -4, fontSize: '0.7rem', lineHeight: 1 }}
          aria-hidden="true"
        >✓</span>
      )}
    </div>
  );
}

/**
 * The raid's own equipment set (see RAID_SET_ID) and how much of it the
 * player has discovered so far -- "how many the player has unlocked so
 * they can see the chase," direct request. `compact` (used on the
 * collapsed RaidCard, a quick at-a-glance count) omits the per-piece
 * name breakdown that the full detail modal shows; both read
 * `state.discoveredItems` the exact same way LorePanel's own Collection
 * tab already does (set.pieces.filter(p => discoveredItems.includes(p))),
 * so a piece counts here the moment it's counted there -- no separate
 * tracking, no chance of the two disagreeing.
 */
function SetProgressLine({ raidId, compact = false }: { raidId: string; compact?: boolean }) {
  const state = useEngine().state;
  const setId = RAID_SET_ID[raidId];
  const set = setId ? SET_BY_ID[setId] : undefined;
  if (!set) return null;
  const found = set.pieces.filter((p) => state.discoveredItems.includes(p));

  if (compact) {
    return (
      <p className="tiny muted" style={{ margin: '2px 0 0' }}>
        {set.name}: {found.length}/{set.pieces.length} found
      </p>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="spread">
        <span className="card-title">{set.name}</span>
        <span className="small muted">{found.length}/{set.pieces.length} found</span>
      </div>
      <div className="stat-row" style={{ marginTop: 4 }}>
        {set.pieces.map((pieceId) => (
          <span
            key={pieceId}
            className="tiny"
            style={{ color: state.discoveredItems.includes(pieceId) ? RARITY_COLOR.legendary : undefined }}
          >
            {EQUIPMENT_BY_ID[pieceId]?.name ?? pieceId}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The full raid detail -- unmounts entirely on close, so difficulty/party
 * selection resets each time it's reopened.
 */
function RaidDetailModal({
  raidId, onClose, onShowItem, initialDifficulty = null,
}: {
  raidId: string; onClose: () => void; onShowItem: (defId: string) => void;
  /** Patch 0502 -- opened from a raid result's "Return" button. */
  initialDifficulty?: RaidDifficulty | null;
}) {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const [difficulty, setDifficulty] = useState<RaidDifficulty | null>(initialDifficulty);
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const cfg = difficulty ? RAID_DIFFICULTIES[difficulty] : null;
  const difficultyUnlocked = (d: RaidDifficulty) => (d === 'legendary'
    ? state.completedRaidDifficulties.includes('mythic')
    : ModifierManager.hasUnlock(state, DIFFICULTY_UNLOCK[d]));
  // Patch 0465 -- difficulty tiers are guild-wide, so the opening plays
  // in whichever raid's detail is opened first after the unlock.
  const diffSeen = useFirstSeen('raid-diff', RAID_DIFFICULTY_ORDER.filter(difficultyUnlocked));

  // Patch 0505 -- the odds use a time snapshot, not the per-second clock.
  // A hero's raid bonus includes their health (and pet bonuses move with
  // time), so idle heroes healing made every number creep each second and
  // the ▲/▼ pop fire on its own. The snapshot refreshes on every pick or
  // difficulty change, and every 30s so healing still shows.
  const [oddsNow, setOddsNow] = useState(now);
  useEffect(() => {
    const t = window.setInterval(() => setOddsNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // Healing writes hero.health directly every tick, so the snapshot has to
  // hold the heroes (and pets) as they were at oddsNow, not just the time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => structuredClone(state), [oddsNow]);
  const snapHero = (h: Hero) => snap.heroes.find((x) => x.id === h.id) ?? h;
  // Patch 0503 -- picks + suggested best idle heroes (see oddsFor below);
  // was the first N idle heroes in roster order until something was picked.
  const previewHeroIds = (() => {
    if (!cfg) return [];
    const picked = selectedHeroIds.slice(0, cfg.partySize);
    const fill = idleHeroes
      .filter((h) => h.level >= raid.reqLevel && !picked.includes(h.id))
      .sort((a, b) => RaidManager.heroContribution(snap, snapHero(b), raid.id, [], oddsNow) - RaidManager.heroContribution(snap, snapHero(a), raid.id, [], oddsNow))
      .slice(0, Math.max(0, cfg.partySize - picked.length))
      .map((h) => h.id);
    return [...picked, ...fill];
  })();
  // Resolved once here rather than re-deriving per encounter below --
  // RaidManager.elementalBonus takes actual Hero objects, not ids, same
  // as the pre-existing `selectedHeroes` derivation further down this
  // component for the role-requirement check.
  // Patch 0502 -- saved progress for this raid + difficulty. While one
  // exists the default action is to return to it; "Start over" runs the
  // whole raid again and drops it.
  const checkpoint = difficulty ? RaidManager.checkpoint(state, raid.id, difficulty) : null;
  const [startOver, setStartOver] = useState(false);
  const resuming = !!checkpoint && !startOver;
  const startEncounter = resuming ? checkpoint.encountersCleared : 0;
  const retryBonus = resuming ? RaidManager.retryBonus(checkpoint) : 0;
  const nextFightName = checkpoint ? RAID_ENCOUNTER_BY_ID[raid.encounterIds[checkpoint.encountersCleared]]?.name ?? 'the next fight' : '';
  const previewDuration = difficulty && previewHeroIds.length > 0
    ? RaidManager.previewDuration(state, previewHeroIds, raid.id, difficulty, now, startEncounter)
    : null;

  // ---- Patch 0503 -- odds feedback ----------------------------------
  // The odds are always for a full, sendable party: your picks, then the
  // best idle heroes you haven't picked filling any empty slot (shown as
  // suggestions). The headline builds from 0%: each committed hero fills
  // their share of the bar (full clear x picked / party size), the
  // suggested heroes' share shows as a ghost. A raid stops at its first
  // lost fight, so full clear = the product of the remaining fights' odds.
  const eligibleIdle = idleHeroes.filter((h) => h.level >= raid.reqLevel);
  const rankOf = (h: Hero) => RaidManager.heroContribution(snap, snapHero(h), raid.id, [], oddsNow);
  const oddsFor = (pickedIds: string[]) => {
    if (!difficulty || !cfg) return null;
    const picked = pickedIds.map((id) => state.heroes.find((h) => h.id === id)).filter((h): h is Hero => !!h).slice(0, cfg.partySize);
    const suggested = eligibleIdle
      .filter((h) => !pickedIds.includes(h.id))
      .sort((a, b) => rankOf(b) - rankOf(a))
      .slice(0, Math.max(0, cfg.partySize - picked.length));
    const party = [...picked, ...suggested];
    const full = party.length === cfg.partySize;
    const fights = raid.encounterIds.slice(startEncounter).map((id) => ({
      id, breakdown: party.length ? RaidManager.encounterBreakdown(snap, party.map(snapHero), raid.id, difficulty, id, oddsNow, resuming) : null,
    }));
    const fullClear = full ? fights.reduce((p, f) => p * ((f.breakdown?.chance ?? 0) / 100), 1) : 0;
    return { picked, suggested, party, full, fights, fullClear, built: fullClear * (picked.length / cfg.partySize) };
  };
  const odds = oddsFor(selectedHeroIds);
  const contributionOf = (h: Hero) => RaidManager.heroContribution(snap, snapHero(h), raid.id, (odds?.party ?? []).map(snapHero), oddsNow);
  const [hoverHeroId, setHoverHeroId] = useState<string | null>(null);
  // The "what would this change" target for a hero: remove if picked, add
  // if there's room, else swap out the lowest-contribution pick.
  const pickWith = (heroId: string): string[] => {
    if (selectedHeroIds.includes(heroId)) return selectedHeroIds.filter((id) => id !== heroId);
    if (!cfg || selectedHeroIds.length < cfg.partySize) return [...selectedHeroIds, heroId];
    const weakest = selectedHeroIds
      .map((id) => state.heroes.find((h) => h.id === id))
      .filter((h): h is Hero => !!h)
      .reduce((a, b) => (contributionOf(b) < contributionOf(a) ? b : a));
    return selectedHeroIds.map((id) => (id === weakest.id ? heroId : id));
  };
  // ▲/▼ change after each pick -- set by the pick itself (patch 0505),
  // never by time passing. `deltaKey` replays the pop animation.
  const [builtDelta, setBuiltDelta] = useState<number | null>(null);
  const [deltaKey, setDeltaKey] = useState(0);

  const toggleHero = (heroId: string) => {
    const next = pickWith(heroId);
    const before = odds?.built ?? 0;
    const after = oddsFor(next)?.built ?? 0;
    setSelectedHeroIds(next);
    setOddsNow(Date.now());
    setBuiltDelta(Math.abs(after - before) >= 0.0005 ? after - before : null);
    setDeltaKey((k) => k + 1);
  };

  const pickDifficulty = (d: RaidDifficulty) => {
    setDifficulty(d);
    setSelectedHeroIds([]);
    setStartOver(false);
    setBuiltDelta(null);
    setOddsNow(Date.now());
  };

  const askToCommit = () => {
    if (!difficulty || !cfg) return;
    // Patch 0503 -- "Send with N suggested" fills the empty slots first.
    if (selectedHeroIds.length !== cfg.partySize) {
      if (!odds?.full) return;
      setSelectedHeroIds(odds.party.map((h) => h.id));
    }
    setConfirming(true);
  };

  // Patch 0425 -- the party files into the dungeon one by one, the
  // portcullis slams down behind them, and only then is the raid
  // committed. Straight through with motion off.
  const [marching, setMarching] = useState(false);
  // Patch 0484 -- Raider's Charm, armed from the confirm screen.
  const [armCharm, setArmCharm] = useState(false);
  const charmsHeld = state.inventory[RAIDERS_CHARM_ID] ?? 0;
  const charmShards = difficulty ? RaidManager.charmShardCost(difficulty) : 0;
  const charmMode = RaidManager.charmMode(state, raid.id);
  const charmMissing = RaidManager.undiscoveredRaidLoot(state, raid.id).length;
  const canArm = charmsHeld > 0 && (state.legendaryShards ?? 0) >= charmShards;
  const marchTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(marchTimer.current), []);
  const commitNow = () => {
    if (!difficulty) return;
    engine.startRaid(raid.id, difficulty, selectedHeroIds, armCharm && canArm, resuming);
    if (fxMs(1)) lastRaidCommitAt = Date.now();
    setConfirming(false);
    onClose();
  };
  const confirmCommit = () => {
    if (!difficulty || marching) return;
    const wait = fxMs(2500 + selectedHeroIds.length * 140);
    if (!wait) { commitNow(); return; }
    setMarching(true);
    marchTimer.current = window.setTimeout(commitNow, wait);
  };
  const gateAt = 1150 + selectedHeroIds.length * 140;

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
          <RaidBanner raidId={raid.id} banner={raid.banner} className="raid-detail-banner" />
          <div className="spread">
            <span className="card-title hero-card-name">{raid.name}</span>
            <span className="tiny gold-text">Lv {raid.reqLevel}</span>
          </div>
          <p className="card-flavour">{raid.description}</p>

          <div className="raid-detail-columns">
            <div>
              <div className="section-heading">Encounters</div>
              <ol className="raid-encounter-list">
                {raid.encounterIds.map((id, i) => {
                  const enc = RAID_ENCOUNTER_BY_ID[id];
                  if (!enc) return null;
                  // Patch 0502 -- fights already won on a saved run aren't fought again.
                  const clearedBefore = resuming && i < startEncounter;
                  // Patch 0503 -- the fight's odds as parts (stacked bar below).
                  const bd = !clearedBefore ? odds?.fights.find((f) => f.id === id)?.breakdown ?? null : null;
                  const encSuccess = bd ? bd.chance : null;
                  const elemental = bd ? bd.elemental : 0;
                  return (
                    <li key={id} className="raid-encounter-item">
                      {/* Collapsed by default (native <details>, no extra
                       *  state to manage) -- the encounter list was the
                       *  single biggest contributor to this modal needing
                       *  to scroll by default. Name + odds/time stay
                       *  visible in the summary row either way; flavour
                       *  text and loot only show once expanded. */}
                      <details>
                        <summary>
                          <b className={clearedBefore ? 'muted' : undefined}>{i + 1}. {enc.name}</b>
                          <EncounterElementTags encounter={enc} />
                          {clearedBefore && <span className="tiny good" style={{ marginLeft: 8 }}>✓ Cleared on an earlier run</span>}
                          {resuming && i === startEncounter && retryBonus > 0 && (
                            <span className="tiny raid-retry-chip" style={{ marginLeft: 8 }}>+{retryBonus}% retry bonus</span>
                          )}
                          {encSuccess !== null && (
                            <span className="tiny muted" style={{ marginLeft: 8 }}>
                              {elemental !== 0 && (
                                <span className={elemental > 0 ? 'good' : 'bad'}>
                                  {elemental > 0 ? '+' : ''}{elemental.toFixed(1)}% elemental ·{' '}
                                </span>
                              )}
                              Time <b>{formatDuration(enc.duration * (difficulty ? RAID_DIFFICULTIES[difficulty].durationMultiplier : 1))}</b>
                            </span>
                          )}
                          {bd && <FightOddsBar bd={bd} difficultyLabel={difficulty ? RAID_DIFFICULTY_LABEL[difficulty] : ''} />}
                        </summary>
                        <p className="muted" style={{ marginTop: 4 }}>{enc.flavour}</p>
                        <LootPreview encounterId={id} difficulty={difficulty} onShowItem={onShowItem} />
                      </details>
                    </li>
                  );
                })}
              </ol>

              {previewDuration !== null && (
                <p className="tiny muted" style={{ marginTop: 8 }}>
                  {resuming ? 'Time for the remaining fights' : 'Total time'} (this party): <b>{formatDuration(previewDuration)}</b>
                </p>
              )}

              {/* Moved here from directly under the description -- reads
               *  as part of "what this run gets you" alongside encounters
               *  and total time, rather than competing with the raid's
               *  flavour text for the same spot at the top. */}
              <SetProgressLine raidId={raid.id} />
            </div>

            <div>
              <div className="section-heading">Difficulty</div>
              <div className="row" style={{ gap: 10 }}>
                {RAID_DIFFICULTY_ORDER.map((d) => (
                  <DifficultyCircle
                    key={d}
                    difficulty={d}
                    active={difficulty === d}
                    unlocked={difficultyUnlocked(d)}
                    cleared={(state.raidClearsByDifficulty[raid.id] ?? []).includes(d)}
                    opening={diffSeen.fresh(d)}
                    onClick={() => pickDifficulty(d)}
                  />
                ))}
              </div>

              {difficulty && cfg && (
                <div style={{ marginTop: 10 }}>
                  <p className="tiny muted">
                    Requires exactly {cfg.partySize} heroes at level {raid.reqLevel}+. Rewards ×{cfg.rewardMultiplier},
                    {' '}{cfg.successPenalty}% harder odds per encounter than Normal.
                  </p>
                  {checkpoint && (
                    <div className={`raid-checkpoint-note ${startOver ? 'off' : ''}`}>
                      {startOver ? (
                        <span className="small">Starting over from the first fight. The saved progress ({checkpoint.encountersCleared} of {raid.encounterIds.length} cleared) will be lost when you send the party.</span>
                      ) : (
                        <span className="small">
                          <b>Progress saved:</b> {checkpoint.encountersCleared} of {raid.encounterIds.length} cleared. The party returns to <b>{nextFightName}</b>
                          {retryBonus > 0 ? <> with a <b>+{retryBonus}%</b> retry bonus</> : null}. Any heroes can go.
                        </span>
                      )}
                      <button className="btn-ghost" style={{ padding: "3px 10px", fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setStartOver(!startOver)}>
                        {startOver ? 'Keep my progress' : 'Start over'}
                      </button>
                    </div>
                  )}
                  {odds && (
                    <RaidOddsHeadline
                      built={odds.built}
                      fullClear={odds.fullClear}
                      full={odds.full}
                      pickedCount={odds.picked.length}
                      partySize={cfg.partySize}
                      delta={builtDelta}
                      deltaKey={deltaKey}
                      resuming={resuming}
                    />
                  )}
                  {odds && odds.party.length > 0 && (
                    <div className="raid-party-slots">
                      {odds.party.map((h) => {
                        const c = contributionOf(h);
                        const lowest = Math.min(...odds.party.map(contributionOf));
                        const isSuggested = odds.suggested.includes(h);
                        const isLowest = c === lowest && odds.party.length > 1;
                        return (
                          <div key={h.id} className={`raid-party-slot ${isSuggested ? 'suggested' : ''} ${isLowest && !isSuggested ? 'lowest' : ''}`}>
                            <RoleIcon role={HeroManager.activeRole(h)} size={12} />
                            <span className="raid-party-who">
                              <span className="raid-party-name">{h.name}</span>
                              <span className="raid-party-note">
                                {isSuggested ? 'Suggested' : isLowest ? 'Lowest: gear up first' : `Lv ${h.level}`}
                              </span>
                            </span>
                            <span className="raid-party-meter"><span style={{ width: `${Math.max(0, Math.min(100, (c / 30) * 100))}%` }} /></span>
                            <b className={c < 0 ? 'bad' : 'gold-text'}>{c >= 0 ? '+' : ''}{c.toFixed(1)}</b>
                          </div>
                        );
                      })}
                      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
                        Each hero adds their bonus to the party average, so strong heroes carry weaker ones. Swap out the lowest to lift everyone.
                      </p>
                    </div>
                  )}
                  {(() => {
                    // Patch 0501 -- role needs scaled to this difficulty's party
                    // size (requiredRolesFor), e.g. Requiem's Normal asks 1/1/1.
                    const roles = requiredRolesFor(raid, difficulty);
                    if (!roles || Object.keys(roles).length === 0) return null;
                    // Patch 0503 -- reads the party about to be sent: the
                    // picks plus the suggested heroes that "Send with N
                    // suggested" adds (was the picks alone, patch 0144),
                    // so it always agrees with the odds shown above.
                    const selectedHeroes = odds?.party ?? [];
                    const counts = RaidManager.partyRoleCounts(selectedHeroes);
                    const penalty = RaidManager.roleMismatchPenalty(selectedHeroes, roles);
                    const mismatched = RaidManager.hasRoleMismatch(selectedHeroes, roles);
                    const cap = cfg.roleMismatchCap;
                    const metCount = (Object.entries(roles) as [Role, number][])
                      .filter(([role, needed]) => counts[role] >= needed).length;
                    const totalRoles = Object.keys(roles).length;
                    return (
                      <div style={{ marginTop: 6, marginBottom: 6 }}>
                        <div className="section-heading" style={{ margin: '10px 0 6px' }}>Roles Required</div>
                        <p className="tiny muted" style={{ margin: '0 0 6px' }}>
                          {metCount}/{totalRoles} met
                        </p>
                        <div className="row" style={{ gap: 8 }}>
                          {(Object.entries(roles) as [Role, number][]).map(([role, needed]) => (
                            <RoleRequirementCircle key={role} role={role} needed={needed} have={counts[role]} />
                          ))}
                        </div>
                        {penalty > 0 && (
                          <p className="tiny bad" style={{ marginTop: 4 }}>
                            Role mix unmet -- {'-'}{penalty}% success this run until it's covered.
                          </p>
                        )}
                        {mismatched && cap != null && (
                          <p className="tiny bad" style={{ marginTop: 2 }}>
                            Success can't rise above {cap}% at {RAID_DIFFICULTY_LABEL[difficulty]} while unmet, no matter how strong the party is.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {idleHeroes.length === 0 ? (
                    <p className="small muted">Every hero is already out. Nobody's free to send.</p>
                  ) : (
                    <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                      {idleHeroes.map((h) => {
                        const selected = selectedHeroIds.includes(h.id);
                        const eligible = h.level >= raid.reqLevel;
                        return (
                          <button
                            key={h.id}
                            className={`chip ${selected ? 'on' : ''}`}
                            disabled={!eligible}
                            onClick={() => toggleHero(h.id)}
                            onMouseEnter={() => setHoverHeroId(h.id)}
                            onMouseLeave={() => setHoverHeroId(null)}
                            onFocus={() => setHoverHeroId(h.id)}
                            onBlur={() => setHoverHeroId(null)}
                            title={eligible ? undefined : `Requires level ${raid.reqLevel}`}
                          >
                            <RoleIcon role={HeroManager.activeRole(h)} size={12} /> {h.name} · Lv {h.level}
                            {eligible && <span className="tiny raid-chip-bonus">{(() => { const c = contributionOf(h); return `${c >= 0 ? '+' : ''}${c.toFixed(1)}`; })()}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <RaidWhatIf
                    text={(() => {
                      if (!hoverHeroId || !odds) return null;
                      const h = state.heroes.find((x) => x.id === hoverHeroId);
                      if (!h || h.level < raid.reqLevel) return null;
                      const next = oddsFor(pickWith(h.id));
                      if (!next) return null;
                      const verb = selectedHeroIds.includes(h.id) ? `Remove ${h.name}`
                        : selectedHeroIds.length < cfg.partySize ? `Add ${h.name}`
                          : `Swap in ${h.name}`;
                      return { verb, from: odds.built, to: next.built };
                    })()}
                  />
                  <div className="row end" style={{ marginTop: 10, gap: 8 }}>
                    <span className="tiny muted" style={{ marginRight: 'auto' }}>
                      {selectedHeroIds.length}/{cfg.partySize} selected
                    </span>
                    <button
                      className="btn-primary"
                      disabled={selectedHeroIds.length !== cfg.partySize && !odds?.full}
                      onClick={askToCommit}
                    >
                      {selectedHeroIds.length < cfg.partySize && odds?.full
                        ? `${resuming ? 'Return' : 'Send'} with ${cfg.partySize - selectedHeroIds.length} suggested`
                        : resuming ? `Return to ${nextFightName}` : 'Send the guild'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="row end" style={{ marginTop: 14 }}>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {confirming && cfg && difficulty && (
        <div className="overlay" onClick={marching ? undefined : () => setConfirming(false)}>
          <div className={`modal ${marching ? 'rsx-go' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className={`rsx-stage ${marching ? 'fx-march' : ''}`}>
              <RaidBanner raidId={raid.id} banner={raid.banner} className="raid-detail-banner" />
              <div className="rsx-party" aria-hidden="true">
                {selectedHeroIds.map((id, i) => {
                  const h = state.heroes.find((hero) => hero.id === id);
                  return h ? (
                    <span key={id} className="rsx-member" style={marching ? at(150 + i * 140) : undefined}>
                      <HeroSprite heroClass={h.heroClass} skin={h.skin} animation={marching ? 'walk' : 'idle'} height={selectedHeroIds.length > 3 ? 40 : 56} framePhase={i * 0.37} />
                    </span>
                  ) : null;
                })}
              </div>
              {marching && (
                <>
                  <svg className="rsx-gate" style={at(gateAt)} viewBox="0 0 440 90" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="0" y="0" width="440" height="10" />
                    {Array.from({ length: 10 }, (_, i) => <rect key={i} x={18 + i * 44} y="0" width="8" height="90" />)}
                    <rect x="0" y="32" width="440" height="6" /><rect x="0" y="62" width="440" height="6" />
                  </svg>
                  <div className="rsx-sealed" style={at(gateAt + 380)}>The gate is sealed</div>
                </>
              )}
            </div>
            <h3>{resuming ? `Return to ${nextFightName}?` : 'Send the guild?'}</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              {raid.name}, {RAID_DIFFICULTY_LABEL[difficulty]}
              {resuming ? ` · fight ${startEncounter + 1} of ${raid.encounterIds.length}${retryBonus > 0 ? ` · +${retryBonus}% retry bonus` : ''}` : ''}
              {!resuming && checkpoint ? ' · starting over' : ''}
            </p>
            <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
              {selectedHeroIds.map((id) => {
                const h = state.heroes.find((hero) => hero.id === id);
                return h ? <span key={id} className="chip on">{h.name} · Lv {h.level}</span> : null;
              })}
            </div>
            <p className="small bad" style={{ margin: '0 0 4px' }}>
              The whole party is committed until the raid resolves. There's no early retreat.
            </p>
            {/* Patch 0484 -- Raider's Charm. Shown whenever the guild holds
                one; the line says which way it would work on this raid. */}
            {charmsHeld > 0 && (
              <label className={`raid-charm-row ${armCharm && canArm ? 'on' : ''}`} title={canArm ? undefined : `Needs ${charmShards} Legendary Shard${charmShards === 1 ? '' : 's'} to arm`}>
                <input type="checkbox" checked={armCharm && canArm} disabled={!canArm || marching} onChange={(e) => setArmCharm(e.target.checked)} />
                <span>
                  <b>Arm a Raider&apos;s Charm</b> <span className="tiny muted">({charmsHeld} held{charmShards > 0 ? ` · costs ${charmShards} Shard${charmShards === 1 ? '' : 's'}` : ''})</span>
                  <br />
                  <span className="tiny">
                    {charmMode === 'seek'
                      ? `${charmMissing} item${charmMissing === 1 ? '' : 's'} here you've never found: x${Tuning.get('economy.raidCharmSeekMultiplier')} chance on ${charmMissing === 1 ? 'it' : 'those'}.`
                      : `Raid complete: +${Tuning.get('economy.raidCharmBoostPct')}% chance on every drop.`}
                    {' '}Used up win or lose.
                  </span>
                </span>
              </label>
            )}
            <div className="row end" style={{ marginTop: 14, gap: 8 }}>
              <button onClick={() => setConfirming(false)} disabled={marching}>Cancel</button>
              <button className="btn-primary" onClick={confirmCommit} disabled={marching}>Send them</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------ odds feedback ------------------------------ */
// Patch 0503 -- the raid screen's odds visuals (mockup: design canvas "Raid
// Screen: Odds Feedback"). Every number comes from RaidManager.encounterBreakdown.

type FightBreakdown = NonNullable<ReturnType<typeof RaidManager.encounterBreakdown>>;

/** One fight's odds as a stacked bar: the fight's own odds (base -
 *  difficulty + raid modifier), the party, elemental, the retry bonus,
 *  and a striped tail for what missing roles or the role cap take away. */
function FightOddsBar({ bd, difficultyLabel }: { bd: FightBreakdown; difficultyLabel: string }) {
  const clamp95 = (v: number) => Math.max(0, Math.min(95, v));
  const own = clamp95(bd.base - bd.penalty + bd.modifier);
  const withParty = clamp95(own + bd.party);
  const withElem = clamp95(withParty + bd.elemental);
  const withRetry = clamp95(withElem + bd.retry);
  const end = bd.chance;
  const seg = (from: number, to: number) => ({ left: `${Math.min(from, end)}%`, width: `${Math.max(0, Math.min(to, end) - Math.min(from, end))}%` });
  const lostFrom = Math.min(end, withRetry);
  const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace(/\.0$/, '')}`;
  return (
    <span className="raid-fight-odds" title={`Fight ${bd.base} · ${difficultyLabel} −${bd.penalty} · party ${fmt(bd.party)}${bd.elemental ? ` · elemental ${fmt(bd.elemental)}` : ''}${bd.modifier ? ` · raid ${fmt(bd.modifier)}` : ''}${bd.retry ? ` · retry ${fmt(bd.retry)}` : ''}${bd.roleMismatch ? ` · missing roles −${bd.roleMismatch}` : ''}${bd.cap != null ? ` · capped at ${bd.cap}%` : ''}`}>
      <span className="raid-fight-bar">
        <span className="seg own" style={seg(0, own)} />
        <span className="seg party" style={seg(own, withParty)} />
        <span className="seg elem" style={seg(withParty, withElem)} />
        <span className="seg retry" style={seg(withElem, withRetry)} />
        {withRetry > end && <span className="seg lost" style={{ left: `${lostFrom}%`, width: `${withRetry - lostFrom}%` }} />}
        {bd.cap != null && <span className="cap" style={{ left: `${bd.cap}%` }} />}
      </span>
      <b className={bd.chance >= 60 ? 'good' : bd.chance >= 35 ? '' : 'bad'}>{Math.round(bd.chance)}%</b>
    </span>
  );
}

/** The headline: full-clear chance building from 0% as heroes are picked. */
function RaidOddsHeadline({ built, fullClear, full, pickedCount, partySize, delta, deltaKey, resuming }: {
  built: number; fullClear: number; full: boolean; pickedCount: number; partySize: number; delta: number | null; deltaKey: number; resuming: boolean;
}) {
  const pct = (v: number) => `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`;
  const runs = fullClear > 0 ? 1 / fullClear : Infinity;
  const tone = pickedCount === 0 ? 'muted' : fullClear >= 0.5 ? 'good' : fullClear >= 0.25 ? 'gold-text' : 'bad';
  return (
    <div className="raid-odds-headline">
      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
        <span className="tiny muted raid-odds-label">{resuming ? 'Chance to finish the raid' : 'Full clear chance'}</span>
        {delta !== null && Math.abs(delta) >= 0.0005 && (
          <span key={deltaKey} className={`raid-odds-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '▲ +' : '▼ −'}{(Math.abs(delta) * 100).toFixed(1)}</span>
        )}
        <span style={{ marginLeft: 'auto' }} className={`raid-odds-value ${tone}`}>{pct(built)}</span>
      </div>
      <div className="raid-odds-bar" aria-hidden="true">
        <span className="solid" style={{ width: `${built * 100}%` }} />
        <span className="ghost" style={{ left: `${built * 100}%`, width: `${Math.max(0, fullClear - built) * 100}%` }} />
        {Array.from({ length: partySize - 1 }, (_, i) => <span key={i} className="tick" style={{ left: `${((i + 1) / partySize) * 100}%` }} />)}
      </div>
      <div className="tiny muted">
        {!full
          ? 'Not enough idle heroes at this level to fill the party.'
          : pickedCount < partySize
            ? `${pickedCount}/${partySize} heroes picked. With the suggested heroes: ${pct(fullClear)}.`
            : Number.isFinite(runs)
              ? `About ${runs < 10 ? runs.toFixed(1) : Math.round(runs)} runs to a first clear. Fights you win still pay out, and a loss saves your progress.`
              : 'Out of reach with this party.'}
      </div>
    </div>
  );
}

/** Hover a hero: what picking (or dropping) them would do. */
function RaidWhatIf({ text }: { text: { verb: string; from: number; to: number } | null }) {
  if (!text) return <p className="tiny muted raid-whatif">Hover a hero to see what they would change.</p>;
  const d = (text.to - text.from) * 100;
  return (
    <p className={`tiny raid-whatif ${d >= 0 ? 'good' : 'bad'}`}>
      {text.verb}: {(text.from * 100).toFixed(0)}% → <b>{(text.to * 100).toFixed(0)}%</b> ({d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)})
    </p>
  );
}

/**
 * Collapsed summary only -- clicking opens RaidDetailModal rather than
 * expanding inline. Locked raids stay a plain, non-interactive card.
 */
function RaidCard({
  raidId, onShowItem, opening = -1, isNew = false, onOpened, freshClears = [], autoOpen = null,
}: {
  raidId: string; onShowItem: (defId: string) => void;
  /** Patch 0502 -- open this raid's detail at this difficulty on mount
   *  (a raid result's "Return" button). */
  autoOpen?: RaidDifficulty | null;
  /** Patch 0465 -- stagger slot of this card's first-seen opening, -1 for none. */
  opening?: number; isNew?: boolean; onOpened?: () => void; freshClears?: RaidDifficulty[];
}) {
  const state = useEngine().state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const unlocked = isRaidUnlocked(raidId, state.completedRaids, state.completedChains);
  const [showModal, setShowModal] = useState(!!autoOpen);
  const checkpoints = RaidManager.checkpointsForRaid(state, raidId);

  if (!unlocked) {
    const lockReason = raidLockReason(raidId, state.completedRaids, state.completedChains)
      ?? 'Complete the previous raid to reveal this one.';
    return (
      <div className="card raid-card locked" title={lockReason}>
        <RaidBanner raidId={raid.id} banner={raid.banner} icon={raid.icon} useIcon className="raid-card-thumb" />
        <div className="raid-card-body">
          <div className="raid-card-name">{raid.name}</div>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>
            {lockReason}
          </p>
        </div>
      </div>
    );
  }

  const open = () => { setShowModal(true); onOpened?.(); };
  const opens = opening >= 0;
  // Patch 0466 -- ambient: an open raid's art drifts with a few embers
  // rising; one you could start right now (no raid running, enough idle
  // heroes at its level for a Normal party) also breathes its border.
  const ready = !state.activeRaid && state.heroes.filter((h) => h.status === 'idle' && h.level >= raid.reqLevel).length
    >= RAID_DIFFICULTIES.normal.partySize;
  return (
    <>
      <div
        className={`card raid-card amb-raid ${ready && !opens ? 'amb-raid-ready' : ''} ${opens ? 'fx-raid-open' : ''} ${isNew ? 'rfo-new' : ''}`}
        style={opens ? ({ '--rfo-d': `calc(var(--fx-t) * ${opening * 700})` } as CSSProperties) : ambPhase(raid.id, 9)}
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      >
        {/* Patch 0465 -- the first time this raid shows as open: the
         *  padlock rattles and drops, the chains snap, iron doors slide
         *  apart and the art floods with colour. See .fx-raid-open. */}
        <span className="rfo-thumb">
          <RaidBanner raidId={raid.id} banner={raid.banner} icon={raid.icon} useIcon className="raid-card-thumb" />
          {!opens && (
            <span className="amb-embers" aria-hidden="true"><i /><i /><i /></span>
          )}
          {opens && (
            <span className="rfo-gate" aria-hidden="true">
              <span className="rfo-door l" /><span className="rfo-door r" />
              <span className="rfo-chain a" /><span className="rfo-chain b" />
              <span className="rfo-lock"><span className="rfo-shackle" /><span className="rfo-body" /></span>
              <span className="rfo-sweep" />
            </span>
          )}
        </span>
        <div className="raid-card-body">
          <div className="raid-card-name">{raid.name}</div>
          <div className="raid-card-meta">
            <span className="tiny gold-text">Lv {raid.reqLevel}</span>
            <RaidClearBadges raidId={raid.id} fresh={freshClears} />
            {checkpoints.map((cp) => (
              <span key={cp.difficulty} className="tiny raid-checkpoint-badge" title="Progress saved: return to the next fight from the raid's detail">
                {RAID_DIFFICULTY_LABEL[cp.difficulty]} {cp.encountersCleared}/{raid.encounterIds.length} saved
              </span>
            ))}
          </div>
          <SetProgressLine raidId={raid.id} compact />
        </div>
        <span className="raid-card-chevron" aria-hidden="true">›</span>
        {isNew && <span className="rfo-ribbon">New raid</span>}
      </div>
      {showModal && (
        <RaidDetailModal raidId={raidId} onClose={() => setShowModal(false)} onShowItem={onShowItem} initialDifficulty={autoOpen} />
      )}
    </>
  );
}

/**
 * Compact "cleared before" summary for the collapsed RaidCard (patch
 * 0303) -- one small letter per difficulty (N/H/L), lit in that
 * difficulty's own colour once state.raidClearsByDifficulty shows this
 * raid cleared there, dim/muted otherwise. Deliberately just the three
 * letters, not full DifficultyCircle instances -- this sits inline next
 * to the level tag in a card that's otherwise a single compact row, so
 * it needs to read at a glance rather than repeat the detail modal's own
 * full circles.
 */
function RaidClearBadges({ raidId, fresh = [] }: { raidId: string; fresh?: RaidDifficulty[] }) {
  const state = useEngine().state;
  const cleared = state.raidClearsByDifficulty[raidId] ?? [];
  if (cleared.length === 0) return null;
  return (
    <span className="row" style={{ gap: 3, marginLeft: 6 }} title="Cleared before">
      {RAID_DIFFICULTY_ORDER.map((d) => (
        <span
          key={d}
          // Patch 0465 -- a first full clear at this difficulty stamps in.
          className={`tiny ${fresh.includes(d) ? 'fx-clear-stamp' : ''}`}
          style={{
            fontWeight: 700,
            color: cleared.includes(d) ? DIFFICULTY_COLOR[d] : 'var(--muted)',
            opacity: cleared.includes(d) ? 1 : 0.35,
          }}
        >
          {DIFFICULTY_LABEL[d]}
        </span>
      ))}
    </span>
  );
}

/** Patch 0425 -- set when a raid is committed with motion on, so the
 *  in-progress card that replaces the detail view drops in once. */
let lastRaidCommitAt = 0;

function ActiveRaidCard() {
  const [fresh] = useState(() => Date.now() - lastRaidCommitAt < 1500);
  const engine = useEngine();
  const state = engine.state;
  const active = state.activeRaid;
  if (!active) return null;
  const raid = RAIDS.find((r) => r.id === active.raidId);
  const now = Date.now();
  const total = active.endsAt - active.startedAt;
  const progress = Math.min(100, ((now - active.startedAt) / Math.max(1, total)) * 100);
  const partyHeroes = active.heroIds
    .map((id) => state.heroes.find((h) => h.id === id))
    .filter((h): h is Hero => !!h);
  const party = partyHeroes.map((h) => h.name).join(', ');
  const color = DIFFICULTY_COLOR[active.difficulty];

  return (
    <div className={`card raid-active-card ${fresh ? 'qsx-drop' : ''}`} style={{ borderLeft: `3px solid ${color}` }}>
      <RaidBanner raidId={active.raidId} banner={raid?.banner} className="raid-active-banner" />
      <div className="raid-active-header">
        <span className="card-title">{raid?.name ?? 'A raid'}, {active.difficulty}</span>
      </div>
      {/* Same shared component as the corner companion's own Raid View
          (IdleView.tsx) -- "the party is out on a raid" reads the same
          way in both places rather than two separate implementations.
          No window-widening concerns here (unlike the companion, this is
          a plain card in normal page flow), so the row just wraps like
          any other flex content if a Legendary-sized party runs wide. */}
      <RaidPartySprites heroes={partyHeroes} height={56} className="raid-active-party-sprites" />
      <p className="raid-active-party">{party}</p>
      <div className="bar amb-sheen-bar" style={{ marginTop: 6 }}><span style={{ width: `${progress}%` }} /></div>
      <p className="raid-active-eta">
        {formatDuration(Math.max(0, active.endsAt - now))} remaining -- committed, no early retreat.
      </p>
    </div>
  );
}

/** Aggregate across every raid's own set (see RAID_SET_ID/SetProgressLine)
 *  -- a single "how much of the raid loot chase is done" line above the
 *  list, distinct from each raid's own per-set line on its card/modal. */
function useRaidSetTotals(state: ReturnType<typeof useEngine>['state']) {
  let piecesFound = 0;
  let piecesTotal = 0;
  let setsComplete = 0;
  let setsTotal = 0;
  for (const raid of RAIDS) {
    const setId = RAID_SET_ID[raid.id];
    const set = setId ? SET_BY_ID[setId] : undefined;
    if (!set) continue;
    setsTotal += 1;
    const found = set.pieces.filter((p) => state.discoveredItems.includes(p)).length;
    piecesFound += found;
    piecesTotal += set.pieces.length;
    if (found === set.pieces.length) setsComplete += 1;
  }
  return { piecesFound, piecesTotal, setsComplete, setsTotal };
}

export function RaidsPanel() {
  const engine = useEngine();
  const state = engine.state;
  const { settings } = useSettings();
  const hasRaids = ModifierManager.hasUnlock(state, 'raids');
  const [itemDetail, setItemDetail] = useState<string | null>(null);
  // Patch 0502 -- a raid result's "Return" button asks for this tab with a
  // 'raid:<raidId>:<difficulty>' highlight: open that raid's detail at that
  // difficulty. Read in the initialiser, consumed in an effect (StrictMode-safe).
  const [returnTo] = useState<{ raidId: string; difficulty: RaidDifficulty } | null>(() => {
    const id = engine.requestedHighlightId;
    if (!id?.startsWith('raid:')) return null;
    const [, raidId, difficulty] = id.split(':');
    return RAID_DIFFICULTY_ORDER.includes(difficulty as RaidDifficulty) ? { raidId, difficulty: difficulty as RaidDifficulty } : null;
  });
  useEffect(() => { if (returnTo) engine.consumeRequestedHighlight(); }, [engine, returnTo]);
  const setTotals = useRaidSetTotals(state);
  // Patch 0465 -- first-seen moments for the list. Nothing counts as
  // "seen" until the Raid Charter's bought and the list actually shows.
  const unlockedRaidIds = hasRaids
    ? RAIDS.filter((r) => isRaidUnlocked(r.id, state.completedRaids, state.completedChains)).map((r) => r.id)
    : [];
  const raidSeen = useFirstSeen('raid-unlock', unlockedRaidIds);
  const clearSeen = useFirstSeen('raid-clear', hasRaids
    ? RAIDS.flatMap((r) => (state.raidClearsByDifficulty[r.id] ?? []).map((d) => `${r.id}|${d}`))
    : []);

  // Acknowledges the tab on mount -- clears the nav shimmer for a
  // banner-worthy notification targeting Raids (patch 0191). Simplified
  // to a single bare-tab acknowledgement (patch 0351) now that Raids no
  // longer has its own sub-tab switcher -- the Quartermaster's Den (and
  // its 'quartermaster' sub-tab id) retired along with it, its 3
  // upgrades folded into the Guild Hall's own unified list instead. See
  // TAB_SUBTABS in attention.ts, updated the same patch.
  useEffect(() => {
    engine.acknowledgeTab('raids');
  }, [engine]);

  if (!hasRaids) {
    return (
      <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/raids-bg.jpg', settings.backgroundMood)})` }}>
        <div className="tab-scene-content">
        <h2>Raids</h2>
        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            Send the whole guild, not just one hero.
          </p>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Requires the Raid Charter upgrade -- check the Guild Hall tab once the guild can field a real force.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => goToGuildHallPurchase(engine, DIFFICULTY_UNLOCK_ID.normal, 'raids')}
        >
          Go to Guild Hall →
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/raids-bg.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <h2>Raids</h2>
      <div className="card">
        <p className="small muted" style={{ margin: 0 }}>
          Multi-hero expeditions. Big rewards, long odds, and everyone comes home a little worse for wear -- win or lose.
        </p>
      </div>

      <p className="raid-sets-summary">
        Raid sets discovered: <b>{setTotals.setsComplete}/{setTotals.setsTotal}</b> complete
        {' · '}<b>{setTotals.piecesFound}/{setTotals.piecesTotal}</b> pieces
      </p>
      <div className="raid-list">
        {state.activeRaid && <ActiveRaidCard />}
        {RAIDS.filter((r) => r.id !== state.activeRaid?.raidId).map((r) => (
          <RaidCard
            key={r.id}
            raidId={r.id}
            onShowItem={setItemDetail}
            opening={raidSeen.order(r.id)}
            isNew={raidSeen.isNew(r.id)}
            onOpened={() => raidSeen.open(r.id)}
            freshClears={RAID_DIFFICULTY_ORDER.filter((d) => clearSeen.fresh(`${r.id}|${d}`))}
            autoOpen={returnTo?.raidId === r.id ? returnTo.difficulty : null}
          />
        ))}
      </div>

      {itemDetail && <ItemDetailOverlay defId={itemDetail} onClose={() => setItemDetail(null)} />}
      </div>
    </div>
  );
}
