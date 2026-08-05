import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { RaidManager } from '../../game/managers/RaidManager';
import { GuildManager } from '../../game/managers/GuildManager';
import {
  RAIDS, RAID_ENCOUNTER_BY_ID, RAID_DIFFICULTIES, RAID_DIFFICULTY_ORDER, RAID_DIFFICULTY_ICON,
  isRaidUnlocked, parseLootEntry, lootForDifficulty,
} from '../../game/data/raids';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { RaidDifficulty, RaidUpgradeDef } from '../../game/types';
import { RarityPill } from '../RarityPill';
import { MaxFlash, useMaxFlash } from '../maxFlash';
import { RaidRoomSprite, RaidTorchSprite } from '../sprites/RaidRoomSprite';
import { formatDuration, describeMods, formatGold, formatNumber, RARITY_COLOR } from '../../game/util';

const DIFFICULTY_LABEL: Record<RaidDifficulty, string> = { normal: 'N', heroic: 'H', mythic: 'M' };
/** Reuses the existing rarity palette rather than inventing a new colour
 *  scheme -- Normal/Heroic/Mythic roughly parallel uncommon/rare/epic
 *  stakes, so the same visual language already trained elsewhere applies. */
const DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic,
};

/**
 * Banner strip for a raid card and its detail modal. Same "missing file
 * just fails to paint, no broken-image icon" convention as quest chains'
 * own art (public/lore/chains/<id>.jpg) -- this rolls out gradually as art
 * lands in public/lore/raids/<id>.jpg rather than needing every raid's art
 * before any of it shows. A plain fixed-height strip rather than a full
 * background wash (unlike chainCardStyle) -- this is meant to read as an
 * actual header image, not a textured backdrop behind text.
 */
function RaidBanner({ raidId }: { raidId: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        backgroundImage: `url(./lore/raids/${raidId}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: 90,
        marginBottom: 10,
        borderRadius: 4,
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
  // Same purchase-pulse + MaxFlash treatment UpgradesPanel/GuildPanel already
  // have for their own upgrade cards -- this was the one "buy an upgrade"
  // surface in the game missing it entirely.
  const { flashes, dismiss } = useMaxFlash([{ id: def.id, name: def.name, level, maxLevel: def.maxLevel }]);
  const flash = flashes[def.id];

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="spread">
        <span className="card-title">{def.name}</span>
        <span key={level} className="small muted purchase-pulse">{level}/{def.maxLevel}</span>
      </div>
      <p className="card-flavour">{def.description}</p>
      <div className="stat-row" style={{ marginBottom: 8 }}>
        {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
      </div>
      <button className="btn-primary" disabled={maxed || !afford} onClick={() => engine.buyRaidUpgrade(def.id)}>
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

/**
 * Maps a raid upgrade's raw level onto one of the 3 room-sprite states.
 * raid_loot and raid_recovery were built with exactly 3 levels (0-2), so
 * they map onto their 3 images directly. raid_speed predates this visual
 * system and spans up to 10 levels on an existing, tuned curve that isn't
 * worth disturbing just to match 3 images -- it gets banded onto the same
 * 3 states instead, at the same milestone its own cost curve already
 * uses: still in the gold tier, or into/past the Renown tier.
 */
function roomSpriteLevel(def: RaidUpgradeDef, level: number): number {
  if (def.id === RAID_SPEED_ID) {
    if (level <= 0) return 0;
    return level < def.goldTierMaxLevel ? 1 : 2;
  }
  return Math.max(0, Math.min(2, level));
}

/**
 * Embedded directly in the Raids tab rather than the general Upgrades
 * panel -- raids have been treated as their own separable system all
 * along (own tab, own background, own resolution engine), and this tree
 * only ever affects raids, so it lives where it matters rather than
 * getting buried among quest-side upgrades.
 *
 * Replaces the old collapsible "Raid Upgrades" strip with a real room:
 * a torch reflecting whether the Raid Charter has been bought, and a
 * weapon rack / skull / shelf that visibly fill in as their matching
 * upgrade is leveled, rather than a plain progress number doing all the
 * work. Visual state is purely derivative of existing GuildManager reads
 * -- nothing new to save.
 */
function RaidQuartermasterDen() {
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
  difficulty, active, onClick,
}: { difficulty: RaidDifficulty; active: boolean; onClick: () => void }) {
  const color = DIFFICULTY_COLOR[difficulty];
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <button
      className={`raid-diff-circle ${active ? 'active' : ''}`}
      style={{ borderColor: color, color: active ? 'var(--night)' : color, background: active ? color : undefined }}
      onClick={onClick}
      title={`${difficulty[0].toUpperCase()}${difficulty.slice(1)} -- ${RAID_DIFFICULTIES[difficulty].partySize} heroes`}
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
  );
}

/**
 * The full raid detail -- everything that used to live inline inside the
 * expanded card now lives here instead, completely unchanged in behaviour.
 * One real difference from the old inline-expand: this unmounts entirely
 * on close, so difficulty/party selection resets each time it's reopened,
 * matching how every other modal in this app already behaves (none of
 * them preserve transient selection state across a dismissal) rather than
 * the old expand/collapse's incidental persistence.
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

  // Odds/duration need *some* party to preview against before any hero is
  // actually picked -- falls back to the first N idle heroes (matching
  // this tier's exact party size), same "preview against a plausible
  // default, switch to the real selection once one exists" pattern the
  // Quest Board already uses for its own success/duration preview.
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
          <RaidBanner raidId={raid.id} />
          <div className="spread">
            <span className="card-title hero-card-name">{raid.name}</span>
            <span className="tiny gold-text">Lv {raid.reqLevel}</span>
          </div>
          <p className="card-flavour">{raid.description}</p>

          <div className="section-heading">Encounters</div>
          <ol className="lore-stage-list">
            {raid.encounterIds.map((id) => {
              const enc = RAID_ENCOUNTER_BY_ID[id];
              if (!enc) return null;
              const encSuccess = difficulty && previewHeroIds.length > 0
                ? RaidManager.previewEncounterSuccess(state, previewHeroIds, difficulty, id, now)
                : null;
              return (
                <li key={id}>
                  <b>{enc.name}.</b> <span className="muted">{enc.flavour}</span>
                  {encSuccess !== null && (
                    <div className="tiny muted" style={{ marginTop: 2 }}>
                      Success <b className={encSuccess >= 60 ? 'good' : encSuccess >= 35 ? '' : 'bad'}>{Math.round(encSuccess)}%</b>
                      {/* Difficulty-scaled (harder tiers take longer per encounter too),
                          but not party-speed-adjusted -- that adjustment only shows in
                          the aggregate "Total time" below, same as before. */}
                      {' · '}Time <b>{formatDuration(enc.duration * (difficulty ? RAID_DIFFICULTIES[difficulty].durationMultiplier : 1))}</b>
                    </div>
                  )}
                  <LootPreview encounterId={id} difficulty={difficulty} onShowItem={onShowItem} />
                </li>
              );
            })}
          </ol>

          {previewDuration !== null && (
            <p className="tiny muted" style={{ marginTop: 4 }}>
              Total time (this party): <b>{formatDuration(previewDuration)}</b>
            </p>
          )}

          <div className="section-heading">Difficulty</div>
          <div className="row" style={{ gap: 10 }}>
            {RAID_DIFFICULTY_ORDER.map((d) => (
              <DifficultyCircle key={d} difficulty={d} active={difficulty === d} onClick={() => pickDifficulty(d)} />
            ))}
          </div>

          {difficulty && cfg && (
            <div style={{ marginTop: 10 }}>
              <p className="tiny muted">
                Requires exactly {cfg.partySize} heroes at level {raid.reqLevel}+. Rewards ×{cfg.rewardMultiplier},
                {' '}{cfg.successPenalty}% harder odds per encounter than Normal.
              </p>
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
                        {h.name} · Lv {h.level}
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

          <div className="row end" style={{ marginTop: 14 }}>
            <button onClick={onClose}>Close</button>
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
 * expanding inline. Locked raids stay a plain, non-interactive card (no
 * modal needed, there's nothing to configure).
 */
function RaidCard({ raidId, onShowItem }: { raidId: string; onShowItem: (defId: string) => void }) {
  const state = useEngine().state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const unlocked = isRaidUnlocked(raidId, state.completedRaids, state.completedChains);
  const [showModal, setShowModal] = useState(false);

  if (!unlocked) {
    return (
      <div className="card raid-card locked">
        <div className="card-title">???</div>
        <p className="tiny muted">Complete the previous raid to reveal this one.</p>
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
        <RaidBanner raidId={raid.id} />
        <div className="spread">
          <span className="card-title hero-card-name">{raid.name}</span>
          <span className="tiny gold-text">Lv {raid.reqLevel}</span>
        </div>
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
    <div className="card raid-card active" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="card-title">{raid?.name ?? 'A raid'} — {active.difficulty}</div>
      <p className="tiny muted" style={{ margin: '4px 0' }}>{party}</p>
      <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${progress}%` }} /></div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        {formatDuration(Math.max(0, active.endsAt - now))} remaining -- committed, no early retreat.
      </p>
    </div>
  );
}

export function RaidsPanel() {
  const engine = useEngine();
  const state = engine.state;
  const hasRaids = ModifierManager.hasUnlock(state, 'raids');
  const [itemDetail, setItemDetail] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'raids' | 'quartermaster'>('raids');

  if (!hasRaids) {
    return (
      <>
        <h2>Raids</h2>
        <p className="subtitle">Send the whole guild, not just one hero.</p>
        <p className="small muted">
          Requires the Raid Charter upgrade -- check the Upgrades tab once the guild can field a real force.
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
        <button className={subTab === 'raids' ? 'btn-primary' : ''} onClick={() => setSubTab('raids')}>
          Raids
        </button>
        <button className={subTab === 'quartermaster' ? 'btn-primary' : ''} onClick={() => setSubTab('quartermaster')}>
          Quartermaster
        </button>
      </div>

      {subTab === 'raids' ? (
        <>
          {state.activeRaid && <ActiveRaidCard />}
          {RAIDS.filter((r) => r.id !== state.activeRaid?.raidId).map((r) => (
            <RaidCard key={r.id} raidId={r.id} onShowItem={setItemDetail} />
          ))}
        </>
      ) : (
        <RaidQuartermasterDen />
      )}

      {itemDetail && <ItemDetailOverlay defId={itemDetail} onClose={() => setItemDetail(null)} />}
    </>
  );
}
