import { useState } from 'react';
import type { MouseEvent, CSSProperties } from 'react';
import { QUEST_CHAINS, ChainDef } from '../../game/data/quests';
import { GUILD_RANK_TIERS, currentGuildRank, nextGuildRank, rankTierForLevel } from '../../game/data/guildRank';
import { outgoingConnections, incomingConnections } from '../../game/data/chainConnections';
import { RAIDS, RAID_ENCOUNTER_BY_ID, isRaidUnlocked } from '../../game/data/raids';
import { useEngine } from '../useEngine';

/** Shared summary/expand toggle button, matching the Heroes tab pattern. */
function ExpandToggle({ open, onClick }: { open: boolean; onClick: (e: MouseEvent) => void }) {
  return (
    <button className="btn-ghost hero-card-expand" onClick={onClick}>
      {open ? 'Less ▲' : 'More ▼'}
    </button>
  );
}

/**
 * Background art + tier glow, applied inline. A missing background image
 * just fails to paint (no CSS error, no broken-image icon), so this rolls
 * out gradually as art lands in public/lore/chains/<id>.jpg rather than
 * needing all 18 pieces before any of it shows.
 */
function chainCardStyle(chain: ChainDef): CSSProperties {
  const tier = rankTierForLevel(chain.reqLevel);
  return {
    // Scrim pushed much closer to opaque than the original 0.72/0.92 --
    // these cards were reading as visibly more transparent than every other
    // card in the app, which made text harder to read by comparison, not
    // just in isolation. Art is now a faint texture rather than a
    // competing background; still rolls out gracefully if the file is
    // missing, same as before.
    backgroundImage: `linear-gradient(180deg, rgba(20,18,16,0.93), rgba(20,18,16,0.97)), url(./lore/chains/${chain.id}.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderLeft: `3px solid ${tier.color}`,
    boxShadow: `0 0 10px ${tier.color}40`,
  };
}

function ConnectionTags({ chain, completedIds }: { chain: ChainDef; completedIds: Set<string> }) {
  const outgoing = outgoingConnections(chain.id, completedIds);
  const incoming = incomingConnections(chain.id, completedIds);
  if (outgoing.length === 0 && incoming.length === 0) return null;

  const nameOf = (id: string) => QUEST_CHAINS.find((c) => c.id === id)?.name ?? id;

  return (
    <div style={{ margin: '4px 0 0' }}>
      {incoming.map((id) => (
        <p key={`in-${id}`} className="tiny" style={{ color: 'var(--brass)', margin: '2px 0' }}>
          ↳ Continues from "{nameOf(id)}"
        </p>
      ))}
      {outgoing.map((id) => (
        <p key={`out-${id}`} className="tiny" style={{ color: 'var(--brass)', margin: '2px 0' }}>
          ↳ Continues in "{nameOf(id)}"
        </p>
      ))}
    </div>
  );
}

function CompletedEntry({ chain, completedIds }: { chain: ChainDef; completedIds: Set<string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card lore-card lore-completed" style={chainCardStyle(chain)}>
      <div
        className="spread hero-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <span className="card-title hero-card-name">{chain.name}</span>
        <span className="tiny gold-text">Lv {chain.reqLevel}</span>
      </div>
      {!open && chain.title && <p className="tiny muted" style={{ margin: '4px 0 0' }}>Grants the title "{chain.title}"</p>}
      {!open && <ConnectionTags chain={chain} completedIds={completedIds} />}
      {open && (
        <div className="hero-card-details">
          {chain.title && <p className="tiny muted" style={{ margin: '0 0 8px' }}>Grants the title "{chain.title}"</p>}
          <p className="card-flavour">{chain.description}</p>
          <ol className="lore-stage-list">
            {chain.stages.map((s) => (
              <li key={s.name}>
                <b>{s.name}.</b> <span className="muted">{s.flavour}</span>
              </li>
            ))}
          </ol>
          {chain.epilogue && (
            <p
              className="tiny lore-epilogue"
              style={{ fontStyle: 'italic', borderLeft: '2px solid var(--brass)', paddingLeft: 8, margin: '10px 0 0' }}
            >
              {chain.epilogue}
            </p>
          )}
          <ConnectionTags chain={chain} completedIds={completedIds} />
        </div>
      )}
      <ExpandToggle open={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
    </div>
  );
}

function InProgressEntry({ chain, stage }: { chain: ChainDef; stage: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card lore-card lore-in-progress" style={chainCardStyle(chain)}>
      <div
        className="spread hero-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <span className="card-title hero-card-name">{chain.name}</span>
        <span className="tiny muted">{stage}/{chain.stages.length}</span>
      </div>
      {open && (
        <div className="hero-card-details">
          <p className="card-flavour">{chain.description}</p>
          <ol className="lore-stage-list">
            {chain.stages.slice(0, stage).map((s) => (
              <li key={s.name}><b>{s.name}.</b> <span className="muted">{s.flavour}</span></li>
            ))}
            {stage < chain.stages.length && <li className="muted">The story isn't finished yet...</li>}
          </ol>
        </div>
      )}
      <ExpandToggle open={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
    </div>
  );
}

function StoryQuestsTab() {
  const engine = useEngine();
  const state = engine.state;

  const completed = QUEST_CHAINS
    .filter((c) => state.completedChains.includes(c.id))
    .sort((a, b) => a.reqLevel - b.reqLevel);

  const completedIds = new Set(completed.map((c) => c.id));

  const inProgress = state.activeChains
    .map((ac) => ({ active: ac, chain: QUEST_CHAINS.find((c) => c.id === ac.chainId) }))
    .filter((x): x is { active: typeof state.activeChains[number]; chain: ChainDef } => !!x.chain)
    .sort((a, b) => a.chain.reqLevel - b.chain.reqLevel);

  const discoveredIds = new Set([...completed.map((c) => c.id), ...inProgress.map((x) => x.chain.id)]);
  const undiscovered = QUEST_CHAINS.length - discoveredIds.size;

  // Completed chains grouped by the rank tier their own reqLevel falls
  // into, in tier order -- turns the flat list into a timeline of who the
  // guild was at each point, rather than one undifferentiated scroll.
  const groups = GUILD_RANK_TIERS.map((tier) => ({
    tier,
    chains: completed.filter((c) => rankTierForLevel(c.reqLevel).id === tier.id),
  })).filter((g) => g.chains.length > 0);

  return (
    <>
      {inProgress.length > 0 && (
        <>
          <div className="section-heading">Still unfolding</div>
          {inProgress.map(({ active, chain }) => (
            <InProgressEntry key={chain.id} chain={chain} stage={active.stage} />
          ))}
        </>
      )}

      {groups.length === 0 && (
        <>
          <div className="section-heading">Completed</div>
          <p className="small muted">No chapters finished yet. Contracts on the board sometimes lead somewhere bigger — keep an eye out.</p>
        </>
      )}

      {groups.map(({ tier, chains }) => (
        <div key={tier.id}>
          <div className="section-heading" style={{ color: tier.color }}>{tier.name}</div>
          {chains.map((chain) => <CompletedEntry key={chain.id} chain={chain} completedIds={completedIds} />)}
        </div>
      ))}

      {undiscovered > 0 && (
        <p className="tiny muted" style={{ marginTop: 12 }}>
          {undiscovered} more {undiscovered === 1 ? 'story' : 'stories'} out there, waiting to be found.
        </p>
      )}
    </>
  );
}

function RaidCompletedEntry({ raidId }: { raidId: string }) {
  const [open, setOpen] = useState(false);
  const raid = RAIDS.find((r) => r.id === raidId);
  if (!raid) return null;
  return (
    <div className="card lore-card lore-completed">
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
          <ol className="lore-stage-list">
            {raid.encounterIds.map((id) => {
              const enc = RAID_ENCOUNTER_BY_ID[id];
              if (!enc) return null;
              return (
                <li key={id}>
                  <b>{enc.name}.</b> <span className="muted">{enc.flavour}</span>
                </li>
              );
            })}
          </ol>
          {raid.epilogue && (
            <p
              className="tiny lore-epilogue"
              style={{ fontStyle: 'italic', borderLeft: '2px solid var(--brass)', paddingLeft: 8, margin: '10px 0 0' }}
            >
              {raid.epilogue}
            </p>
          )}
        </div>
      )}
      <ExpandToggle open={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
    </div>
  );
}

function RaidInProgressEntry() {
  const engine = useEngine();
  const active = engine.state.activeRaid;
  const [open, setOpen] = useState(false);
  if (!active) return null;
  const raid = RAIDS.find((r) => r.id === active.raidId);
  if (!raid) return null;

  return (
    <div className="card lore-card lore-in-progress">
      <div
        className="spread hero-card-summary"
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <span className="card-title hero-card-name">{raid.name}</span>
        <span className="tiny muted">underway — {active.difficulty}</span>
      </div>
      {open && (
        <div className="hero-card-details">
          <p className="card-flavour">{raid.description}</p>
          <p className="tiny muted">The rest of this one is still being written.</p>
        </div>
      )}
      <ExpandToggle open={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
    </div>
  );
}

function StoryRaidsTab() {
  const engine = useEngine();
  const state = engine.state;

  const completed = RAIDS.filter((r) => state.completedRaids.includes(r.id)).sort((a, b) => a.reqLevel - b.reqLevel);
  const undiscovered = RAIDS.filter((r) => !isRaidUnlocked(r.id, state.completedRaids)).length;

  return (
    <>
      {state.activeRaid && (
        <>
          <div className="section-heading">Underway</div>
          <RaidInProgressEntry />
        </>
      )}

      <div className="section-heading">Completed</div>
      {completed.length === 0 ? (
        <p className="small muted">No raid has been cleared yet. These need the whole guild, not just one hero — see the Raids tab.</p>
      ) : (
        completed.map((r) => <RaidCompletedEntry key={r.id} raidId={r.id} />)
      )}

      {undiscovered > 0 && (
        <p className="tiny muted" style={{ marginTop: 12 }}>
          {undiscovered} more raid{undiscovered === 1 ? '' : 's'} still locked away.
        </p>
      )}
    </>
  );
}

export function LorePanel() {
  const engine = useEngine();
  const state = engine.state;
  const [subTab, setSubTab] = useState<'quests' | 'raids'>('quests');

  const rank = currentGuildRank(state);
  const next = nextGuildRank(state);

  return (
    <>
      <h2>Lore</h2>
      <p className="subtitle">Every contract tells a small story. This is the guild's record of the ones worth remembering.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread">
          <span className="card-title">
            {state.guildName || 'This guild'} — {rank.name}
          </span>
        </div>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>{rank.blurb}</p>
        {next && (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Next: {next.name} — reach level {next.minLevel} or complete a chain at that level.
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={subTab === 'quests' ? 'btn-primary' : ''} onClick={() => setSubTab('quests')}>
          Story Quests
        </button>
        <button className={subTab === 'raids' ? 'btn-primary' : ''} onClick={() => setSubTab('raids')}>
          Story Raids
        </button>
      </div>

      {subTab === 'quests' ? <StoryQuestsTab /> : <StoryRaidsTab />}
    </>
  );
}
