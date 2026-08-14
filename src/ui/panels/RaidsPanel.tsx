import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { RaidManager } from '../../game/managers/RaidManager';
import { HeroManager } from '../../game/managers/HeroManager';
import { GuildManager } from '../../game/managers/GuildManager';
import {
  RAIDS, RAID_ENCOUNTER_BY_ID, RAID_DIFFICULTIES, RAID_DIFFICULTY_ORDER, RAID_DIFFICULTY_ICON,
  isRaidUnlocked, parseLootEntry, lootForDifficulty,
} from '../../game/data/raids';
import { EQUIPMENT_BY_ID, SET_BY_ID } from '../../game/data/equipment';
import { RaidDifficulty, RaidUpgradeDef, RaidDef, Hero, Role } from '../../game/types';
import { ROLE_BY_ID } from '../../game/data/progression';
import { RoleIcon } from '../RoleIcon';
import { RarityPill } from '../RarityPill';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import { RaidRoomSprite, RaidTorchSprite } from '../sprites/RaidRoomSprite';
import { formatDuration, describeMods, formatGold, formatNumber, RARITY_COLOR } from '../../game/util';

const DIFFICULTY_LABEL: Record<RaidDifficulty, string> = { normal: 'N', heroic: 'H', mythic: 'M' };
/** Reuses the existing rarity palette rather than inventing a new colour
 *  scheme -- Normal/Heroic/Mythic roughly parallel uncommon/rare/epic
 *  stakes, so the same visual language already trained elsewhere applies. */
const DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic,
};

/** Which upgrade unlocks each difficulty tier -- Normal comes from the base
 *  Raid Charter (the same unlock that already gates raids existing at
 *  all); Heroic and Mythic each need their own separate Clearance upgrade,
 *  rather than the old single Charter purchase unlocking every tier at once. */
const DIFFICULTY_UNLOCK: Record<RaidDifficulty, 'raids' | 'raidsHeroic' | 'raidsMythic'> = {
  normal: 'raids', heroic: 'raidsHeroic', mythic: 'raidsMythic',
};
const DIFFICULTY_UNLOCK_LABEL: Record<RaidDifficulty, string> = {
  normal: 'Raid Charter', heroic: 'Heroic Clearance', mythic: 'Mythic Clearance',
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

function raidBannerSrc(raidId: string, banner?: RaidDef['banner']) {
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
 */
function RaidBanner({
  raidId, banner, className,
}: { raidId: string; banner?: RaidDef['banner']; className: string }) {
  const src = raidBannerSrc(raidId, banner);
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: `${banner?.focusX ?? 50}% ${banner?.focusY ?? 50}%`,
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
        const def = EQUIPMENT_BY_ID[parsed.defId];
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

/** Shared across every raid card -- clicking a discovered loot entry opens
 *  this instead of each card managing its own overlay state. */
function RaidUpgradeCard({ def }: { def: RaidUpgradeDef }) {
  const engine = useEngine();
  const state = engine.state;
  const level = GuildManager.raidUpgradeLevel(state, def.id);
  const next = GuildManager.nextRaidUpgradeCost(state, def.id);
  const maxed = next === null;
  const afford = next ? (next.currency === 'gold' ? state.gold >= next.cost : state.renown >= next.cost) : false;
  const { flashes, dismiss } = useMaxFlash([{ id: def.id, name: def.name, level, maxLevel: def.maxLevel }]);
  const flash = flashes[def.id];
  const levelPulses = usePulsesOnChange([{ id: def.id, value: level }]);

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="spread">
        <span className="card-title">{def.name}</span>
        <span className={`small muted ${levelPulses[def.id] ? 'purchase-pulse' : ''}`}>{level}/{def.maxLevel}</span>
      </div>
      <p className="card-flavour">{def.description}</p>
      <div className="stat-row" style={{ marginBottom: 8 }}>
        {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
      </div>
      <button className="btn-yellow" disabled={maxed || !afford} onClick={() => engine.buyRaidUpgrade(def.id)}>
        {maxed
          ? 'Fully upgraded'
          : next!.currency === 'gold'
            ? `Buy · ${formatGold(next!.cost)}`
            : `Buy · ${formatNumber(next!.cost)} renown`}
      </button>
      {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(def.id)} />}
    </div>
  );
}

const RAID_SPEED_ID = 'raid_speed';
const RAID_LOOT_ID = 'raid_loot';
const RAID_RECOVERY_ID = 'raid_recovery';

function roomSpriteLevel(def: RaidUpgradeDef, level: number): number {
  // raid_loot and raid_recovery were built with exactly 3 levels (0-2), so
  // they map onto their 3 images directly. raid_speed predates this visual
  // system and spans up to 10 levels on an existing, tuned curve that isn't
  // worth disturbing just to match 3 images -- it gets banded onto the
  // same 3 states instead, at the same milestone its own cost curve
  // already uses: still in the gold tier, or into/past the Renown tier.
  if (def.id === RAID_SPEED_ID) {
    if (level <= 0) return 0;
    return level < def.goldTierMaxLevel ? 1 : 2;
  }
  return Math.max(0, Math.min(2, level));
}

function RaidQuartermasterDen() {
  // Embedded directly in the Raids tab rather than the general Upgrades
  // panel -- raids have been treated as their own separable system all
  // along (own tab, own background, own resolution engine), and this
  // tree only ever affects raids, so it lives where it matters rather
  // than getting buried among quest-side upgrades. A torch reflects
  // whether the Raid Charter has been bought, and a weapon rack / skull /
  // shelf visibly fill in as their matching upgrade is leveled, rather
  // than a plain progress number doing all the work.
  const engine = useEngine();
  const state = engine.state;
  const raidsUnlocked = ModifierManager.hasUnlock(state, 'raids');
  const defs = GuildManager.raidUpgrades();
  const speedDef = defs.find((d) => d.id === RAID_SPEED_ID);
  const lootDef = defs.find((d) => d.id === RAID_LOOT_ID);
  const recoveryDef = defs.find((d) => d.id === RAID_RECOVERY_ID);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>The Raid Quartermaster's Den</div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Raid-only bonuses -- these never affect regular quests, and quest upgrades never affect raids either.
        Early levels cost gold; deeper levels cost Renown.
      </p>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 10 }}>
        <RaidTorchSprite
          lit={raidsUnlocked}
          height={64}
          title={raidsUnlocked ? 'Raid Charter purchased' : 'Raid Charter not yet purchased'}
        />
      </div>
      <div className="grid two">
        {speedDef && (
          <div>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 6 }}>
              <RaidRoomSprite kind="rack" level={roomSpriteLevel(speedDef, GuildManager.raidUpgradeLevel(state, speedDef.id))} height={56} title={speedDef.name} />
            </div>
            <RaidUpgradeCard def={speedDef} />
          </div>
        )}
        {lootDef && (
          <div>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 6 }}>
              <RaidRoomSprite kind="skull" level={roomSpriteLevel(lootDef, GuildManager.raidUpgradeLevel(state, lootDef.id))} height={56} title={lootDef.name} />
            </div>
            <RaidUpgradeCard def={lootDef} />
          </div>
        )}
        {recoveryDef && (
          <div>
            <div className="row" style={{ justifyContent: 'center', marginBottom: 6 }}>
              <RaidRoomSprite kind="shelf" level={roomSpriteLevel(recoveryDef, GuildManager.raidUpgradeLevel(state, recoveryDef.id))} height={56} title={recoveryDef.name} />
            </div>
            <RaidUpgradeCard def={recoveryDef} />
          </div>
        )}
      </div>
    </div>
  );
}

function ItemDetailOverlay({ defId, onClose }: { defId: string; onClose: () => void }) {
  const def = EQUIPMENT_BY_ID[defId];
  if (!def) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{def.name}</h3>
        <RarityPill rarity={def.rarity} />
        <p className="tiny muted" style={{ marginTop: 8 }}>{def.slot} · requires level {def.reqLevel}</p>
        <p className="small" style={{ marginTop: 8 }}>{describeMods(def.mods).join(' · ') || 'No bonuses'}</p>
        <div className="row end" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DifficultyCircle({
  difficulty, active, unlocked, onClick,
}: { difficulty: RaidDifficulty; active: boolean; unlocked: boolean; onClick: () => void }) {
  const color = DIFFICULTY_COLOR[difficulty];
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="raid-diff-circle-wrap">
      <button
        className={`raid-diff-circle ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
        style={{
          borderColor: color, color: active ? 'var(--night)' : color, background: active ? color : undefined,
          opacity: unlocked ? 1 : 0.4,
        }}
        onClick={onClick}
        disabled={!unlocked}
        title={unlocked
          ? `${difficulty[0].toUpperCase()}${difficulty.slice(1)} -- ${RAID_DIFFICULTIES[difficulty].partySize} heroes`
          : `Requires the ${DIFFICULTY_UNLOCK_LABEL[difficulty]} upgrade`}
      >
        {!imgFailed ? (
          <img
            src={RAID_DIFFICULTY_ICON[difficulty]}
            alt=""
            onError={() => setImgFailed(true)}
            style={{ width: '70%', height: '70%', objectFit: 'contain' }}
          />
        ) : (
          DIFFICULTY_LABEL[difficulty]
        )}
      </button>
      {/* Name printed below the circle rather than only living in its
       *  title tooltip -- direct request: a player shouldn't have to
       *  hover each circle to know which tier is which. */}
      <span className="tiny" style={{ color: unlocked ? color : 'var(--muted)', fontWeight: 700 }}>
        {difficulty[0].toUpperCase()}{difficulty.slice(1)}
      </span>
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
  raidId, onClose, onShowItem,
}: { raidId: string; onClose: () => void; onShowItem: (defId: string) => void }) {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const [difficulty, setDifficulty] = useState<RaidDifficulty | null>(null);
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const cfg = difficulty ? RAID_DIFFICULTIES[difficulty] : null;

  const previewHeroIds = selectedHeroIds.length > 0
    ? selectedHeroIds
    : idleHeroes.slice(0, cfg?.partySize ?? 0).map((h) => h.id);
  const previewDuration = difficulty && previewHeroIds.length > 0
    ? RaidManager.previewDuration(state, previewHeroIds, raid.id, difficulty, now)
    : null;

  const toggleHero = (heroId: string) => {
    setSelectedHeroIds((current) => {
      if (current.includes(heroId)) return current.filter((id) => id !== heroId);
      if (cfg && current.length >= cfg.partySize) return current;
      return [...current, heroId];
    });
  };

  const pickDifficulty = (d: RaidDifficulty) => {
    setDifficulty(d);
    setSelectedHeroIds([]);
  };

  const askToCommit = () => {
    if (!difficulty || !cfg || selectedHeroIds.length !== cfg.partySize) return;
    setConfirming(true);
  };

  const confirmCommit = () => {
    if (!difficulty) return;
    engine.startRaid(raid.id, difficulty, selectedHeroIds);
    setConfirming(false);
    onClose();
  };

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
                  const encSuccess = difficulty && previewHeroIds.length > 0
                    ? RaidManager.previewEncounterSuccess(state, previewHeroIds, raid.id, difficulty, id, now)
                    : null;
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
                          <b>{i + 1}. {enc.name}</b>
                          {encSuccess !== null && (
                            <span className="tiny muted" style={{ marginLeft: 8 }}>
                              Success <b className={encSuccess >= 60 ? 'good' : encSuccess >= 35 ? '' : 'bad'}>{Math.round(encSuccess)}%</b>
                              {' · '}Time <b>{formatDuration(enc.duration * (difficulty ? RAID_DIFFICULTIES[difficulty].durationMultiplier : 1))}</b>
                            </span>
                          )}
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
                  Total time (this party): <b>{formatDuration(previewDuration)}</b>
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
                    unlocked={ModifierManager.hasUnlock(state, DIFFICULTY_UNLOCK[d])}
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
                  {raid.requiredRoles && Object.keys(raid.requiredRoles).length > 0 && (() => {
                    // Deliberately reads the REAL selection (selectedHeroIds),
                    // not previewHeroIds -- see patch 0144 note: a
                    // requirement circle is a concrete met/unmet fact about
                    // the party actually about to be sent, not a guess.
                    const selectedHeroes = selectedHeroIds
                      .map((id) => state.heroes.find((h) => h.id === id))
                      .filter((h): h is Hero => !!h);
                    const counts = RaidManager.partyRoleCounts(selectedHeroes);
                    const penalty = RaidManager.roleMismatchPenalty(selectedHeroes, raid.requiredRoles);
                    const mismatched = RaidManager.hasRoleMismatch(selectedHeroes, raid.requiredRoles);
                    const cap = cfg.roleMismatchCap;
                    const metCount = (Object.entries(raid.requiredRoles) as [Role, number][])
                      .filter(([role, needed]) => counts[role] >= needed).length;
                    const totalRoles = Object.keys(raid.requiredRoles).length;
                    return (
                      <div style={{ marginTop: 6, marginBottom: 6 }}>
                        <div className="section-heading" style={{ margin: '10px 0 6px' }}>Roles Required</div>
                        <p className="tiny muted" style={{ margin: '0 0 6px' }}>
                          {metCount}/{totalRoles} met
                        </p>
                        <div className="row" style={{ gap: 8 }}>
                          {(Object.entries(raid.requiredRoles) as [Role, number][]).map(([role, needed]) => (
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
                            Success can't rise above {cap}% at {difficulty[0].toUpperCase()}{difficulty.slice(1)} while unmet, no matter how strong the party is.
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
                            title={eligible ? undefined : `Requires level ${raid.reqLevel}`}
                          >
                            <RoleIcon role={HeroManager.activeRole(h)} size={12} /> {h.name} · Lv {h.level}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="row end" style={{ marginTop: 10, gap: 8 }}>
                    <span className="tiny muted" style={{ marginRight: 'auto' }}>
                      {selectedHeroIds.length}/{cfg.partySize} selected
                    </span>
                    <button className="btn-primary" disabled={selectedHeroIds.length !== cfg.partySize} onClick={askToCommit}>
                      Send the guild
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
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Send the guild?</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              {raid.name} — {difficulty[0].toUpperCase()}{difficulty.slice(1)}
            </p>
            <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
              {selectedHeroIds.map((id) => {
                const h = state.heroes.find((hero) => hero.id === id);
                return h ? <span key={id} className="chip on">{h.name} · Lv {h.level}</span> : null;
              })}
            </div>
            <p className="small bad" style={{ margin: '0 0 4px' }}>
              The whole party is committed until the raid resolves — there's no early retreat.
            </p>
            <div className="row end" style={{ marginTop: 14, gap: 8 }}>
              <button onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn-primary" onClick={confirmCommit}>Send them</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Collapsed summary only -- clicking opens RaidDetailModal rather than
 * expanding inline. Locked raids stay a plain, non-interactive card.
 */
function RaidCard({ raidId, onShowItem }: { raidId: string; onShowItem: (defId: string) => void }) {
  const state = useEngine().state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const unlocked = isRaidUnlocked(raidId, state.completedRaids, state.completedChains);
  const [showModal, setShowModal] = useState(false);

  if (!unlocked) {
    return (
      <div className="card raid-card locked">
        <div className="raid-card-thumb" />
        <div className="raid-card-body">
          <div className="raid-card-name">???</div>
          <p className="tiny muted" style={{ margin: '2px 0 0' }}>Complete the previous raid to reveal this one.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="card raid-card"
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <RaidBanner raidId={raid.id} banner={raid.banner} className="raid-card-thumb" />
        <div className="raid-card-body">
          <div className="raid-card-name">{raid.name}</div>
          <div className="raid-card-meta">
            <span className="tiny gold-text">Lv {raid.reqLevel}</span>
          </div>
          <SetProgressLine raidId={raid.id} compact />
        </div>
        <span className="raid-card-chevron" aria-hidden="true">›</span>
      </div>
      {showModal && (
        <RaidDetailModal raidId={raidId} onClose={() => setShowModal(false)} onShowItem={onShowItem} />
      )}
    </>
  );
}

function ActiveRaidCard() {
  const engine = useEngine();
  const state = engine.state;
  const active = state.activeRaid;
  if (!active) return null;
  const raid = RAIDS.find((r) => r.id === active.raidId);
  const now = Date.now();
  const total = active.endsAt - active.startedAt;
  const progress = Math.min(100, ((now - active.startedAt) / Math.max(1, total)) * 100);
  const party = active.heroIds
    .map((id) => state.heroes.find((h) => h.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const color = DIFFICULTY_COLOR[active.difficulty];

  return (
    <div className="card raid-active-card" style={{ borderLeft: `3px solid ${color}` }}>
      <RaidBanner raidId={active.raidId} banner={raid?.banner} className="raid-active-banner" />
      <div className="raid-active-header">
        <span className="card-title">{raid?.name ?? 'A raid'} — {active.difficulty}</span>
      </div>
      <p className="raid-active-party">{party}</p>
      <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${progress}%` }} /></div>
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
  const hasRaids = ModifierManager.hasUnlock(state, 'raids');
  const [itemDetail, setItemDetail] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'raids' | 'quartermaster'>('raids');
  const setTotals = useRaidSetTotals(state);

  if (!hasRaids) {
    return (
      <>
        <h2>Raids</h2>
        <p className="subtitle">Send the whole guild, not just one hero.</p>
        <p className="small muted">
          Requires the Raid Charter upgrade -- check the Guild Hall tab once the guild can field a real force.
        </p>
      </>
    );
  }

  return (
    <>
      <h2>Raids</h2>
      <p className="subtitle">
        Multi-hero expeditions. Big rewards, long odds, and everyone comes home a little worse for wear -- win or lose.
      </p>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn-subtab ${subTab === 'raids' ? 'on' : ''}`} onClick={() => setSubTab('raids')}>
          Raids
        </button>
        <button className={`btn-subtab ${subTab === 'quartermaster' ? 'on' : ''}`} onClick={() => setSubTab('quartermaster')}>
          Quartermaster
        </button>
      </div>

      {subTab === 'raids' ? (
        <>
          <p className="raid-sets-summary">
            Raid sets discovered: <b>{setTotals.setsComplete}/{setTotals.setsTotal}</b> complete
            {' · '}<b>{setTotals.piecesFound}/{setTotals.piecesTotal}</b> pieces
          </p>
          <div className="raid-list">
            {state.activeRaid && <ActiveRaidCard />}
            {RAIDS.filter((r) => r.id !== state.activeRaid?.raidId).map((r) => (
              <RaidCard key={r.id} raidId={r.id} onShowItem={setItemDetail} />
            ))}
          </div>
        </>
      ) : (
        <RaidQuartermasterDen />
      )}

      {itemDetail && <ItemDetailOverlay defId={itemDetail} onClose={() => setItemDetail(null)} />}
    </>
  );
}
