import { useState } from 'react';
import { useEngine } from '../useEngine';
import { ModifierManager } from '../../game/managers/ModifierManager';
import {
  RAIDS, RAID_ENCOUNTER_BY_ID, RAID_DIFFICULTIES, RAID_DIFFICULTY_ORDER, RAID_DIFFICULTY_ICON, isRaidUnlocked, parseLootEntry,
} from '../../game/data/raids';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { RaidDifficulty } from '../../game/types';
import { RarityPill } from '../RarityPill';
import { formatDuration, RARITY_COLOR } from '../../game/util';

const DIFFICULTY_LABEL: Record<RaidDifficulty, string> = { normal: 'N', heroic: 'H', mythic: 'M' };
/** Reuses the existing rarity palette rather than inventing a new colour
 *  scheme -- Normal/Heroic/Mythic roughly parallel uncommon/rare/epic
 *  stakes, so the same visual language already trained elsewhere applies. */
const DIFFICULTY_COLOR: Record<RaidDifficulty, string> = {
  normal: RARITY_COLOR.uncommon, heroic: RARITY_COLOR.rare, mythic: RARITY_COLOR.epic,
};

function LootPreview({ encounterId }: { encounterId: string }) {
  const engine = useEngine();
  const encounter = RAID_ENCOUNTER_BY_ID[encounterId];
  if (!encounter || encounter.loot.length === 0) return null;
  return (
    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
      {encounter.loot.map((entry) => {
        const parsed = parseLootEntry(entry);
        if (!parsed) return null;
        const def = EQUIPMENT_BY_ID[parsed.defId];
        const discovered = engine.state.discoveredItems.includes(parsed.defId);
        return (
          <span key={parsed.defId} className="row" style={{ gap: 4, alignItems: 'center' }}>
            <span className="tiny muted">{discovered && def ? def.name : '???'}</span>
            {discovered && def && <RarityPill rarity={def.rarity} />}
          </span>
        );
      })}
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

function RaidCard({ raidId }: { raidId: string }) {
  const engine = useEngine();
  const state = engine.state;
  const raid = RAIDS.find((r) => r.id === raidId)!;
  const unlocked = isRaidUnlocked(raidId, state.completedRaids);
  const [open, setOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<RaidDifficulty | null>(null);
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>([]);

  if (!unlocked) {
    return (
      <div className="card raid-card locked">
        <div className="card-title">???</div>
        <p className="tiny muted">Complete the previous raid to reveal this one.</p>
      </div>
    );
  }

  const idleHeroes = state.heroes.filter((h) => h.status !== 'questing');
  const cfg = difficulty ? RAID_DIFFICULTIES[difficulty] : null;

  const [confirming, setConfirming] = useState(false);

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
    setOpen(false);
    setDifficulty(null);
    setSelectedHeroIds([]);
  };

  return (
    <div className="card raid-card">
      <div
        className="spread hero-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <span className="card-title hero-card-name">{raid.name}</span>
        <span className="tiny gold-text">Lv {raid.reqLevel}</span>
      </div>

      {open && (
        <div className="hero-card-details">
          <p className="card-flavour">{raid.description}</p>

          <div className="section-heading">Encounters</div>
          <ol className="lore-stage-list">
            {raid.encounterIds.map((id) => {
              const enc = RAID_ENCOUNTER_BY_ID[id];
              if (!enc) return null;
              return (
                <li key={id}>
                  <b>{enc.name}.</b> <span className="muted">{enc.flavour}</span>
                  <LootPreview encounterId={id} />
                </li>
              );
            })}
          </ol>

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
        </div>
      )}

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
    </div>
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

      {state.activeRaid && <ActiveRaidCard />}
      {RAIDS.filter((r) => r.id !== state.activeRaid?.raidId).map((r) => <RaidCard key={r.id} raidId={r.id} />)}
    </>
  );
}
