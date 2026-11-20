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
import { HERO_CLASSES, ROLE_BY_ID } from '../../game/data/progression';
import { raidShardReward } from '../../game/data/shards';
import { heroPortraitSrc, heroPortraitStyle } from './HeroesPanel';
import { RoleIcon } from '../RoleIcon';
import { RarityPill } from '../RarityPill';
import { RaidPartySprites } from '../sprites/RaidPartySprites';
import { HeroSprite } from '../sprites/HeroSprite';
import { fxMs } from '../purchaseFx';
import { useFirstSeen } from '../firstSeen';
import { ambPhase } from '../ambient';
import { at } from '../resultFx';
import { formatDuration, formatGold, describeMods, describeStats, RARITY_COLOR } from '../../game/util';
import { InventoryManager } from '../../game/managers/InventoryManager';
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

/** Patch 0507 -- one difficulty tile on the raid launch screen: icon,
 *  party size, odds penalty, reward multiplier and Shards, with the same
 *  unlock / cleared / first-opening states the old DifficultyCircle had. */
function DifficultyTile({
  difficulty, active, unlocked, cleared, opening = false, onClick,
}: { difficulty: RaidDifficulty; active: boolean; unlocked: boolean; cleared?: boolean; opening?: boolean; onClick: () => void }) {
  const engine = useEngine();
  const color = DIFFICULTY_COLOR[difficulty];
  const cfg = RAID_DIFFICULTIES[difficulty];
  const iconDef = RAID_DIFFICULTY_ICON_DEFS[difficulty];
  const shards = raidShardReward(difficulty);
  return (
    <div className={`rl-diff ${active ? 'on' : ''} ${unlocked ? '' : 'locked'} ${opening ? 'fx-diff-open' : ''}`} style={{ '--rl-c': color } as CSSProperties}>
      <button
        className="rl-diff-btn"
        onClick={onClick}
        disabled={!unlocked}
        aria-pressed={active}
        title={unlocked ? undefined : `Requires the ${DIFFICULTY_UNLOCK_LABEL[difficulty]}${difficulty === 'legendary' ? '' : ' upgrade'}`}
      >
        <span
          className="rl-diff-icon"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${raidDifficultyIconSrc(difficulty)})`,
            backgroundPosition: `${iconDef?.icon?.focusX ?? 50}% ${iconDef?.icon?.focusY ?? 50}%`,
            backgroundSize: iconDef?.icon?.scale && iconDef.icon.scale !== 100 ? `${iconDef.icon.scale}%` : 'cover',
          }}
        >
          {DIFFICULTY_LABEL[difficulty]}
        </span>
        <span className="rl-diff-text">
          <span className="rl-diff-name">{RAID_DIFFICULTY_LABEL[difficulty]}{cleared && unlocked ? <span className="good" aria-label="cleared before"> ✓</span> : null}</span>
          <span className="tiny">{cfg.partySize} heroes · {cfg.successPenalty ? `−${cfg.successPenalty}%` : 'base'} odds</span>
          <span className="tiny muted">×{cfg.rewardMultiplier} rewards{shards ? ` · ${shards} Shard${shards === 1 ? '' : 's'}` : ''}</span>
        </span>
      </button>
      {!unlocked && (difficulty === 'legendary'
        ? <span className="rl-diff-lock tiny">Clear Mythic first</span>
        : (
          <button
            className="rl-diff-lock btn-ghost"
            onClick={() => goToGuildHallPurchase(engine, DIFFICULTY_UNLOCK_ID[difficulty], `${RAID_DIFFICULTY_LABEL[difficulty]} raids`)}
            title={`Go to the Guild Hall -- ${DIFFICULTY_UNLOCK_LABEL[difficulty]}`}
          >
            Unlock →
          </button>
        ))}
    </div>
  );
}

/** Patch 0507 -- the full-clear bar, built up hero by hero. The party's
 *  full-clear chance (picks + suggested fill) is split between the heroes
 *  in proportion to their Power: committed heroes are solid slices,
 *  suggested ones striped. Sum of the solid slices = the headline. */
function RaidBuildBar({ slices }: { slices: { id: string; name: string; share: number; committed: boolean }[] }) {
  const committed = slices.filter((s) => s.committed);
  const ghosts = slices.filter((s) => !s.committed);
  return (
    <div className="rl-build-bar" role="img" aria-label={`Full clear built ${Math.round(committed.reduce((a, s) => a + s.share, 0) * 100)}%`}>
      {[...committed, ...ghosts].map((s, i) => (
        <span
          key={s.id}
          className={`rl-slice ${s.committed ? `c${i % 4}` : 'ghost'}`}
          style={{ width: `${s.share * 100}%` }}
          title={`${s.name}: ${(s.share * 100).toFixed(1)}% of the full clear${s.committed ? '' : ' (suggested)'}`}
        >
          {s.share >= 0.06 ? s.name[0] : ''}
        </span>
      ))}
    </div>
  );
}

/**
 * The full raid detail -- unmounts entirely on close, so difficulty/party
 * selection resets each time it's reopened.
 *
 * Patch 0507 -- rebuilt around running the raid (owner-approved design,
 * "Raid screen redesign" canvas): difficulty tiles up top; party slots and
 * a ranked roster on the left (each hero's Power, the existing
 * heroContribution number, and ▲▼ = the change to the full clear if they
 * join or swap in); on the right the full-clear bar built from 0% hero by
 * hero, one row per fight, every modifier in one list, the charm/flask and
 * the send bar. Story text, set pieces and loot moved behind one toggle.
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
  const difficultyUnlocked = (d: RaidDifficulty) => (d === 'legendary'
    ? state.completedRaidDifficulties.includes('mythic')
    : ModifierManager.hasUnlock(state, DIFFICULTY_UNLOCK[d]));
  const [difficulty, setDifficulty] = useState<RaidDifficulty | null>(initialDifficulty ?? (difficultyUnlocked('normal') ? 'normal' : null));
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [showStory, setShowStory] = useState(false);

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const cfg = difficulty ? RAID_DIFFICULTIES[difficulty] : null;
  // Patch 0465 -- difficulty tiers are guild-wide, so the opening plays
  // in whichever raid's detail is opened first after the unlock.
  const diffSeen = useFirstSeen('raid-diff', RAID_DIFFICULTY_ORDER.filter(difficultyUnlocked));

  // Patch 0505 -- the odds use a time snapshot, not the per-second clock
  // (healing heroes and pets moved every number each second). Refreshed on
  // every pick or difficulty change, and every 30s.
  const [oddsNow, setOddsNow] = useState(now);
  useEffect(() => {
    const t = window.setInterval(() => setOddsNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => structuredClone(state), [oddsNow]);
  const snapHero = (h: Hero) => snap.heroes.find((x) => x.id === h.id) ?? h;

  // Patch 0502 -- saved progress for this raid + difficulty.
  const checkpoint = difficulty ? RaidManager.checkpoint(state, raid.id, difficulty) : null;
  const [startOver, setStartOver] = useState(false);
  const resuming = !!checkpoint && !startOver;
  const startEncounter = resuming ? checkpoint.encountersCleared : 0;
  const retryBonus = resuming ? RaidManager.retryBonus(checkpoint) : 0;
  const nextFightName = checkpoint ? RAID_ENCOUNTER_BY_ID[raid.encounterIds[checkpoint.encountersCleared]]?.name ?? 'the next fight' : '';
  // Patch 0506 -- Mythic raid flask, chosen on this screen now.
  const [flaskPick, setFlaskPick] = useState<string | null>(null);
  const ownedFlasks = RaidManager.ownedFlasks(state);
  const flaskId = flaskPick && ownedFlasks.some((f) => f.id === flaskPick) ? flaskPick : undefined;
  // Patch 0484 -- Raider's Charm, armed on this screen now.
  const [armCharm, setArmCharm] = useState(false);
  const charmsHeld = state.inventory[RAIDERS_CHARM_ID] ?? 0;
  const charmShards = difficulty ? RaidManager.charmShardCost(difficulty) : 0;
  const charmMode = RaidManager.charmMode(state, raid.id);
  const charmMissing = RaidManager.undiscoveredRaidLoot(state, raid.id).length;
  const canArm = charmsHeld > 0 && (state.legendaryShards ?? 0) >= charmShards;
  const charmOn = armCharm && canArm;

  // ---- Odds (patch 0503's model, power-weighted build-up in 0507) -----
  // Always for a full, sendable party: the picks, then the best idle
  // heroes not picked filling any empty slot (suggested). A raid stops at
  // its first lost fight, so full clear = the product of the fights' odds.
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
      id, breakdown: party.length ? RaidManager.encounterBreakdown(snap, party.map(snapHero), raid.id, difficulty, id, oddsNow, resuming, flaskId) : null,
    }));
    const fullClear = full ? fights.reduce((p, f) => p * ((f.breakdown?.chance ?? 0) / 100), 1) : 0;
    // Power-weighted slices: an equal share each, tilted by how far a
    // hero's Power sits above or below the party average (10 Power above
    // average = 1.5x share, 10 below = 0.5x, never under 0.25x). Relative
    // rather than raw Power, so a fresh roster whose Power is all near or
    // below 0 still builds in sensible steps. `built` = committed slices.
    const power = party.map((h) => RaidManager.heroContribution(snap, snapHero(h), raid.id, party.map(snapHero), oddsNow));
    const avgPower = power.reduce((a, b) => a + b, 0) / Math.max(1, power.length);
    const weights = power.map((p) => Math.max(0.25, 1 + (p - avgPower) / 20));
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const slices = party.map((h, i) => ({ id: h.id, name: h.name, share: fullClear * (weights[i] / wSum), committed: picked.includes(h) }));
    const built = slices.filter((s) => s.committed).reduce((a, s) => a + s.share, 0);
    return { picked, suggested, party, full, fights, fullClear, built, slices, power };
  };
  const odds = oddsFor(selectedHeroIds);
  const powerOf = (h: Hero) => RaidManager.heroContribution(snap, snapHero(h), raid.id, (odds?.party ?? []).map(snapHero), oddsNow);
  // Remove if picked, add if there's room, else swap out the lowest pick.
  const pickWith = (heroId: string): string[] => {
    if (selectedHeroIds.includes(heroId)) return selectedHeroIds.filter((id) => id !== heroId);
    if (!cfg || selectedHeroIds.length < cfg.partySize) return [...selectedHeroIds, heroId];
    const weakest = selectedHeroIds
      .map((id) => state.heroes.find((h) => h.id === id))
      .filter((h): h is Hero => !!h)
      .reduce((a, b) => (powerOf(b) < powerOf(a) ? b : a));
    return selectedHeroIds.map((id) => (id === weakest.id ? heroId : id));
  };
  // ▲/▼ pop on the headline -- set by the pick itself (patch 0505).
  const [builtDelta, setBuiltDelta] = useState<number | null>(null);
  const [deltaKey, setDeltaKey] = useState(0);
  const commitPicks = (next: string[]) => {
    const before = odds?.built ?? 0;
    const after = oddsFor(next)?.built ?? 0;
    setSelectedHeroIds(next);
    setOddsNow(Date.now());
    setBuiltDelta(Math.abs(after - before) >= 0.0005 ? after - before : null);
    setDeltaKey((k) => k + 1);
  };
  const toggleHero = (heroId: string) => commitPicks(pickWith(heroId));
  const fillBest = () => { if (odds) commitPicks(odds.party.map((h) => h.id)); };

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

  // Patch 0425 -- the party files into the dungeon one by one, then the
  // raid is committed. Straight through with motion off.
  const [marching, setMarching] = useState(false);
  const marchTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(marchTimer.current), []);
  const commitNow = () => {
    if (!difficulty) return;
    engine.startRaid(raid.id, difficulty, selectedHeroIds, charmOn, resuming, flaskId);
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

  // ---- derived display values --------------------------------------
  const previewIds = odds?.party.map((h) => h.id) ?? [];
  const previewDuration = difficulty && previewIds.length > 0
    ? RaidManager.previewDuration(state, previewIds, raid.id, difficulty, now, startEncounter, flaskId)
    : null;
  const roles = difficulty ? requiredRolesFor(raid, difficulty) : undefined;
  const roleEntries = roles ? (Object.entries(roles) as [Role, number][]).filter(([, n]) => n > 0) : [];
  const roleCounts = RaidManager.partyRoleCounts(odds?.party ?? []);
  const rolePenalty = roles ? RaidManager.roleMismatchPenalty(odds?.party ?? [], roles) : 0;
  const roleMismatch = roles ? RaidManager.hasRoleMismatch(odds?.party ?? [], roles) : false;
  const firstBd = odds?.fights.find((f) => f.breakdown)?.breakdown ?? null;
  const elementalFights = (odds?.fights ?? [])
    .map((f, i) => ({ n: startEncounter + i + 1, v: f.breakdown?.elemental ?? 0 }))
    .filter((f) => f.v !== 0);
  const remainingIds = raid.encounterIds.slice(startEncounter);
  const goldEstimate = cfg ? Math.round(remainingIds.reduce((s, id) => s + (RAID_ENCOUNTER_BY_ID[id]?.rewardGold ?? 0), 0) * cfg.rewardMultiplier) : 0;
  const shardReward = difficulty ? raidShardReward(difficulty) : 0;
  const rareReward = difficulty ? Tuning.get(`raid.rareMaterials.${difficulty}`) : 0;
  const missing = cfg ? cfg.partySize - selectedHeroIds.length : 0;
  const pctText = (v: number) => `${(v * 100).toFixed(v * 100 < 10 && v > 0 ? 1 : 0)}%`;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace(/\.0$/, '')}`;
  const tone = !odds || odds.picked.length === 0 ? '' : odds.fullClear >= 0.5 ? 'good' : odds.fullClear >= 0.25 ? 'gold-text' : 'bad';
  const lowestPicked = odds && odds.picked.length === cfg?.partySize
    ? odds.picked.reduce((a, b) => (powerOf(b) < powerOf(a) ? b : a)) : null;

  type ModRow = { label: string; value: string; good: boolean };
  const mods: ModRow[] = [];
  if (difficulty && cfg && firstBd) {
    mods.push({ label: `${RAID_DIFFICULTY_LABEL[difficulty]} difficulty`, value: cfg.successPenalty ? `−${cfg.successPenalty}% per fight` : '±0', good: !cfg.successPenalty });
    mods.push({ label: `Party Power (average of ${odds?.party.length ?? 0})`, value: `${signed(firstBd.party)} per fight`, good: firstBd.party >= 0 });
    if (roleEntries.length > 0) {
      mods.push(roleMismatch
        ? { label: 'Role mix not covered', value: cfg.roleMismatchCap != null ? `−${rolePenalty}%, capped at ${cfg.roleMismatchCap}%` : `−${rolePenalty}% per fight`, good: false }
        : { label: 'Role mix covered', value: 'met', good: true });
    }
    if (elementalFights.length > 0) {
      const total = elementalFights.reduce((a, f) => a + f.v, 0);
      mods.push({ label: total >= 0 ? 'Elemental match' : 'Elemental mismatch', value: elementalFights.map((f) => `${signed(f.v)} on ${f.n}`).join(', '), good: total >= 0 });
    }
    if (firstBd.modifier) mods.push({ label: 'This raid', value: `${signed(firstBd.modifier)} per fight`, good: firstBd.modifier > 0 });
    if (resuming && retryBonus > 0) mods.push({ label: `Retry bonus on ${nextFightName}`, value: `+${retryBonus}%`, good: true });
    if (cfg.lootBonus) mods.push({ label: 'Loot bonus', value: `+${cfg.lootBonus}% drop chance`, good: true });
    if (flaskId) {
      const fd = InventoryManager.resolveDef(state, flaskId);
      const e = fd?.effect;
      mods.push({ label: fd?.name ?? 'Raid flask', value: e?.raidSuccess ? `+${e.raidSuccess}% per fight` : e?.raidSpeedPct ? `${e.raidSpeedPct}% faster` : 'no gear wear', good: true });
    }
    if (charmOn) mods.push({ label: "Raider's Charm", value: charmMode === 'seek' ? `×${Tuning.get('economy.raidCharmSeekMultiplier')} on unfound items` : `+${Tuning.get('economy.raidCharmBoostPct')}% on every drop`, good: true });
  }

  const setId = RAID_SET_ID[raid.id];
  const set = setId ? SET_BY_ID[setId] : undefined;
  const setFound = set ? set.pieces.filter((p) => state.discoveredItems.includes(p)).length : 0;
  const portraitOf = (h: Hero) => ({ backgroundImage: `url(${heroPortraitSrc(h.heroClass, HERO_CLASSES[h.heroClass]?.portrait)})`, ...heroPortraitStyle(HERO_CLASSES[h.heroClass]?.portrait) });
  const compact = (cfg?.partySize ?? 3) > 3;
  const busyHeroes = state.heroes.filter((h) => h.status === 'questing');
  const rosterHeroes = [...idleHeroes].sort((a, b) => {
    const ea = a.level >= raid.reqLevel ? 0 : 1;
    const eb = b.level >= raid.reqLevel ? 0 : 1;
    return ea - eb || rankOf(b) - rankOf(a);
  });

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div className="modal raid-detail-modal rl" style={difficulty ? ({ '--rl-c': DIFFICULTY_COLOR[difficulty] } as CSSProperties) : undefined} onClick={(e) => e.stopPropagation()}>
          {/* Header: banner strip, name, story toggle */}
          <div className="rl-header">
            <RaidBanner raidId={raid.id} banner={raid.banner} className="rl-header-art" />
            <div className="rl-header-shade" aria-hidden="true" />
            <div className="rl-header-text">
              <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="card-title hero-card-name rl-title">{raid.name}</span>
                <span className="tiny">Lv {raid.reqLevel}+ · {raid.encounterIds.length} fights</span>
                {difficulty && <span className="rl-diff-badge">{RAID_DIFFICULTY_LABEL[difficulty]}</span>}
              </div>
              <button className="rl-link" onClick={() => setShowStory(!showStory)} aria-expanded={showStory}>
                {showStory ? 'Hide story & loot' : `Story, loot & set pieces${set ? ` (${setFound}/${set.pieces.length} found)` : ''}`}
              </button>
            </div>
            <button className="rl-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {showStory && (
            <div className="rl-story">
              <p className="card-flavour" style={{ marginTop: 0 }}>{raid.description}</p>
              {raid.encounterIds.map((id, i) => {
                const enc = RAID_ENCOUNTER_BY_ID[id];
                if (!enc) return null;
                return (
                  <div key={id} className="rl-story-fight">
                    <b>{i + 1}. {enc.name}</b>
                    <p className="tiny muted" style={{ margin: '2px 0 0' }}>{enc.flavour}</p>
                    <LootPreview encounterId={id} difficulty={difficulty} onShowItem={onShowItem} />
                  </div>
                );
              })}
              <SetProgressLine raidId={raid.id} />
            </div>
          )}

          {/* Difficulty tiles */}
          <div className="rl-diffs" role="group" aria-label="Difficulty">
            {RAID_DIFFICULTY_ORDER.map((d) => (
              <DifficultyTile
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

          {!difficulty || !cfg ? (
            <p className="small muted" style={{ padding: '16px 20px' }}>Pick a difficulty to choose a party.</p>
          ) : (
            <div className="rl-body">
              {/* LEFT: party + roster */}
              <div className="rl-left">
                <div className="rl-head-row">
                  <div className="row" style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span className="section-heading rl-h">Party {selectedHeroIds.length}/{cfg.partySize}</span>
                    {roleEntries.length > 0 && (
                      <span className="tiny muted row" style={{ alignItems: 'center', gap: 4 }}>
                        Needs
                        {roleEntries.map(([role, n]) => (
                          <span key={role} className={`rl-role-need ${roleCounts[role] >= n ? 'good' : 'bad'}`} title={`${ROLE_BY_ID[role]?.name ?? role}: ${roleCounts[role]}/${n} in this party`}>
                            <RoleIcon role={role} size={14} /> {n} {ROLE_BY_ID[role]?.name ?? role}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn-ghost rl-small-btn" onClick={fillBest} disabled={!odds || selectedHeroIds.length === cfg.partySize || !odds.full}>Fill best</button>
                    <button className="btn-ghost rl-small-btn" onClick={() => commitPicks([])} disabled={selectedHeroIds.length === 0}>Clear</button>
                  </div>
                </div>

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
                    <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => { setStartOver(!startOver); setOddsNow(Date.now()); }}>
                      {startOver ? 'Keep my progress' : 'Start over'}
                    </button>
                  </div>
                )}

                <div className={`rl-slots ${compact ? 'compact' : ''}`}>
                  {Array.from({ length: cfg.partySize }, (_, i) => {
                    const h = odds?.party[i];
                    if (!h) return <div key={`e${i}`} className="rl-slot empty">Empty slot</div>;
                    const suggested = !selectedHeroIds.includes(h.id);
                    const p = powerOf(h);
                    const lowest = lowestPicked?.id === h.id;
                    return (
                      <button
                        key={h.id}
                        className={`rl-slot ${suggested ? 'suggested' : ''} ${lowest ? 'lowest' : ''}`}
                        onClick={() => toggleHero(h.id)}
                        aria-label={suggested ? `Lock in suggested ${h.name}` : `Remove ${h.name}`}
                      >
                        <span className="rl-portrait" aria-hidden="true" style={portraitOf(h)} />
                        <span className="rl-who">
                          <span className="rl-name">{h.name}</span>
                          <span className="tiny muted rl-meta"><RoleIcon role={HeroManager.activeRole(h)} size={12} /> Lv {h.level}</span>
                        </span>
                        <span className={`rl-power ${p < 0 ? 'bad' : ''}`} title="Raid Power: how far this hero is above a typical hero of this raid's level. The party's average is added to every fight.">Power {p.toFixed(0)}</span>
                        {!compact && (suggested || lowest) && (
                          <span className={`rl-slot-tag tiny ${lowest ? 'bad' : 'muted'}`}>{suggested ? 'Suggested -- tap to lock in' : 'Lowest -- swap to lift the odds'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="rl-head-row" style={{ marginTop: 4 }}>
                  <span className="section-heading rl-h">Available heroes</span>
                  <span className="tiny muted">Best first · Power = raid strength · ▲▼ = change to full clear</span>
                </div>
                {idleHeroes.length === 0 ? (
                  <p className="small muted">Every hero is already out. Nobody's free to send.</p>
                ) : (
                  <div className="rl-roster">
                    {rosterHeroes.map((h) => {
                      const picked = selectedHeroIds.includes(h.id);
                      const eligible = h.level >= raid.reqLevel;
                      let deltaText = '';
                      let deltaCls = 'muted';
                      if (!eligible) deltaText = `needs Lv ${raid.reqLevel}`;
                      else if (picked) { deltaText = 'in party'; deltaCls = 'rl-in'; }
                      else if (odds) {
                        const next = oddsFor(pickWith(h.id));
                        const d = next ? (next.fullClear - odds.fullClear) * 100 : 0;
                        const shown = Math.abs(d) < 10 ? d.toFixed(1) : d.toFixed(0);
                        deltaText = Math.abs(d) < 0.05 ? '±0%' : d > 0 ? `▲ +${shown}%` : `▼ ${shown}%`;
                        deltaCls = Math.abs(d) < 0.05 ? 'muted' : d > 0 ? 'good' : 'bad';
                      }
                      return (
                        <button
                          key={h.id}
                          className={`rl-hero ${picked ? 'on' : ''}`}
                          disabled={!eligible}
                          aria-pressed={picked}
                          onClick={() => toggleHero(h.id)}
                        >
                          <span className="rl-portrait sm" aria-hidden="true" style={portraitOf(h)} />
                          <span className="rl-who">
                            <span className="rl-name"><RoleIcon role={HeroManager.activeRole(h)} size={12} /> {h.name}</span>
                            <span className="tiny muted rl-meta">{HERO_CLASSES[h.heroClass]?.name ?? h.heroClass} · Lv {h.level}</span>
                          </span>
                          <span className="rl-hero-nums">
                            {eligible && <span className="rl-power">Power {powerOf(h).toFixed(0)}</span>}
                            <span className={`tiny rl-delta ${deltaCls}`}>{deltaText}</span>
                          </span>
                        </button>
                      );
                    })}
                    {busyHeroes.map((h) => (
                      <div key={h.id} className="rl-hero busy">
                        <span className="rl-portrait sm" aria-hidden="true" style={portraitOf(h)} />
                        <span className="rl-who">
                          <span className="rl-name">{h.name}</span>
                          <span className="tiny muted rl-meta">Out on a quest</span>
                        </span>
                        <span className="tiny muted">busy</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT: odds, modifiers, extras, send */}
              <div className="rl-right">
                <div className="rl-odds">
                  <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <span className="rl-odds-label">
                      <span className="tiny muted" style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>{resuming ? 'Chance to finish' : 'Full clear'}</span>
                      <span className="tiny muted">{odds && odds.picked.length < cfg.partySize ? `${odds.picked.length} of ${cfg.partySize} heroes picked` : 'Stops at the first lost fight'}</span>
                    </span>
                    {builtDelta !== null && Math.abs(builtDelta) >= 0.0005 && (
                      <span key={deltaKey} className={`raid-odds-delta ${builtDelta > 0 ? 'up' : 'down'}`}>{builtDelta > 0 ? '▲ +' : '▼ −'}{(Math.abs(builtDelta) * 100).toFixed(1)}</span>
                    )}
                    <span className={`rl-odds-value ${tone}`}>{pctText(odds?.built ?? 0)}</span>
                  </div>
                  {odds && <RaidBuildBar slices={odds.slices} />}
                  <span className="tiny muted">
                    {!odds?.full
                      ? 'Not enough idle heroes at this level to fill the party.'
                      : odds.picked.length < cfg.partySize
                        ? `${pctText(odds.built)} locked in · ${pctText(odds.fullClear)} once ${cfg.partySize - odds.picked.length} more join (striped = suggested)`
                        : 'Each slice is one hero -- stronger Power, bigger slice.'}
                  </span>
                  <div className="rl-fights">
                    {raid.encounterIds.map((id, i) => {
                      const enc = RAID_ENCOUNTER_BY_ID[id];
                      if (!enc) return null;
                      const clearedBefore = resuming && i < startEncounter;
                      const bd = !clearedBefore ? odds?.fights.find((f) => f.id === id)?.breakdown ?? null : null;
                      return (
                        <div key={id} className={`rl-fight ${clearedBefore ? 'done' : ''}`}>
                          <span className="tiny muted">{i + 1}</span>
                          <span className="rl-fight-main">
                            <b className="rl-fight-name">{enc.name}</b>
                            <span className="rl-fight-tags"><EncounterElementTags encounter={enc} /></span>
                            {clearedBefore
                              ? <span className="tiny good">✓ Cleared on an earlier run</span>
                              : bd && <FightOddsBar bd={bd} difficultyLabel={RAID_DIFFICULTY_LABEL[difficulty]} />}
                          </span>
                          <span className="tiny muted rl-fight-time">{clearedBefore ? '' : formatDuration(enc.duration * cfg.durationMultiplier)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {mods.length > 0 && (
                  <div className="rl-section">
                    <span className="section-heading rl-h">Modifiers</span>
                    {mods.map((m) => (
                      <div key={m.label} className="rl-mod">
                        <span>{m.label}</span>
                        <b className={m.good ? 'good' : 'bad'}>{m.value}</b>
                      </div>
                    ))}
                  </div>
                )}

                {(charmsHeld > 0 || ownedFlasks.length > 0) && (
                  <div className="rl-section">
                    <span className="section-heading rl-h">Bring along</span>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {charmsHeld > 0 && (
                        <button
                          className={`chip rl-pill ${charmOn ? 'on' : ''}`}
                          disabled={!canArm}
                          aria-pressed={charmOn}
                          onClick={() => setArmCharm(!armCharm)}
                          title={canArm
                            ? (charmMode === 'seek'
                              ? `${charmMissing} item${charmMissing === 1 ? '' : 's'} here you've never found: x${Tuning.get('economy.raidCharmSeekMultiplier')} chance. Used up win or lose.`
                              : `Raid complete: +${Tuning.get('economy.raidCharmBoostPct')}% chance on every drop. Used up win or lose.`)
                            : `Needs ${charmShards} Legendary Shard${charmShards === 1 ? '' : 's'} to arm`}
                        >
                          Raider&apos;s Charm ×{charmsHeld}{charmShards > 0 ? ` · ${charmShards} Shard${charmShards === 1 ? '' : 's'}` : ''}
                        </button>
                      )}
                      {ownedFlasks.length > 0 && (
                        <>
                          <button className={`chip rl-pill ${!flaskId ? 'on' : ''}`} onClick={() => setFlaskPick(null)}>No flask</button>
                          {ownedFlasks.map((f) => (
                            <button
                              key={f.id}
                              className={`chip rl-pill raid-flask-chip ${flaskId === f.id ? 'on' : ''}`}
                              aria-pressed={flaskId === f.id}
                              title={InventoryManager.resolveDef(state, f.id)?.description}
                              onClick={() => setFlaskPick(f.id)}
                            >
                              {f.name} ×{f.count}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="rl-send">
                  <div className="row wrap tiny muted" style={{ gap: 14 }}>
                    {previewDuration !== null && <span>{resuming ? 'Time left' : 'Time'} <b className="rl-strong">{formatDuration(previewDuration)}</b></span>}
                    <span>Pays <b className="gold-text">◆ {formatGold(goldEstimate)}</b></span>
                    {(shardReward > 0 || rareReward > 0) && (
                      <span className="rl-extra">
                        {[shardReward ? `+${shardReward} Shard${shardReward === 1 ? '' : 's'}` : '', rareReward ? `+${rareReward} rare mat${rareReward === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-primary rl-send-btn"
                    disabled={selectedHeroIds.length !== cfg.partySize && !odds?.full}
                    onClick={askToCommit}
                  >
                    {missing > 0 && odds?.full
                      ? `${resuming ? 'Return' : 'Send'} with ${missing} suggested`
                      : resuming ? `Return to ${nextFightName}` : 'Send the guild'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
              {odds ? ` · ${pctText(odds.fullClear)} ${resuming ? 'to finish' : 'full clear'}` : ''}
            </p>
            <div className="row wrap" style={{ gap: 6, margin: '10px 0' }}>
              {selectedHeroIds.map((id) => {
                const h = state.heroes.find((hero) => hero.id === id);
                return h ? <span key={id} className="chip on">{h.name} · Lv {h.level}</span> : null;
              })}
            </div>
            {(charmOn || flaskId) && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                Bringing: {[charmOn ? "Raider's Charm" : '', flaskId ? InventoryManager.resolveDef(state, flaskId)?.name ?? '' : ''].filter(Boolean).join(' and ')} (used up win or lose).
              </p>
            )}
            <p className="small bad" style={{ margin: '0 0 4px' }}>
              The whole party is committed until the raid resolves. There's no early retreat.
            </p>
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
