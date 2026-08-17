import { useState } from 'react';
import type { MouseEvent, CSSProperties } from 'react';
import { QUEST_CHAINS, ChainDef } from '../../game/data/quests';
import { GUILD_RANK_TIERS, currentGuildRank, nextGuildRank, powerToNextRank, rankTierForLevel } from '../../game/data/guildRank';
import { outgoingConnections, incomingConnections } from '../../game/data/chainConnections';
import { RAIDS, RAID_ENCOUNTER_BY_ID, isRaidUnlocked } from '../../game/data/raids';
import { EQUIPMENT_BY_ID, ITEM_SETS } from '../../game/data/equipment';
import { describeMods, RARITY_COLOR } from '../../game/util';
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
 * Tier-colour accent for a chain card -- separate from the art now (see
 * ChainBanner below), so this just handles the left-border glow.
 */
function chainCardStyle(chain: ChainDef): CSSProperties {
  const tier = rankTierForLevel(chain.reqLevel);
  return {
    borderLeft: `3px solid ${tier.color}`,
    boxShadow: `0 0 10px ${tier.color}40`,
  };
}

/**
 * Banner strip for a chain card, matching RaidsPanel's RaidBanner exactly.
 * Previously this art lived as a full-card background behind the text,
 * scrimmed to 93-97% opaque specifically because at lower opacity it was
 * washing out the text on top of it -- which worked, but also meant the
 * art itself was reduced to "a faint texture," practically invisible even
 * once placed correctly (confirmed: this is why millers_problem.jpg,
 * correctly placed, didn't visibly appear -- not a loading bug, the scrim
 * was doing exactly what it was tuned to do). A dedicated strip above the
 * text, not behind it, solves the original readability problem through
 * actual separation instead of washing the image down to nothing -- same
 * "missing file just fails to paint" convention as before, still rolls
 * out gradually as art lands in public/lore/chains/<id>.jpg.
 *
 * `banner` is the chain's optional DevTool-assigned override + focus point
 * (ChainDef.banner) -- unset for a chain that hasn't had one assigned, in
 * which case this falls all the way back to the original id-convention
 * path at dead-center focus, exactly as before this existed.
 */
function ChainBanner({ chainId, banner }: { chainId: string; banner?: ChainDef['banner'] }) {
  const src = banner?.path ? `./lore/${banner.path}` : `./lore/chains/${chainId}.jpg`;
  return (
    <div
      aria-hidden="true"
      style={{
        backgroundImage: `url(${src})`,
        // banner?.scale (patch 0164) is an optional 100-300 zoom set via
        // the DevTool's banner picker, independent of the focus point --
        // omitted (or 100) renders the exact same plain 'cover' as before
        // this field existed.
        backgroundSize: banner?.scale && banner.scale !== 100 ? `${banner.scale}%` : 'cover',
        backgroundPosition: `${banner?.focusX ?? 50}% ${banner?.focusY ?? 50}%`,
        height: 90,
        marginBottom: 10,
        borderRadius: 4,
      }}
    />
  );
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
      <ChainBanner chainId={chain.id} banner={chain.banner} />
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
      <ChainBanner chainId={chain.id} banner={chain.banner} />
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
          {raid.title && <p className="tiny muted" style={{ margin: '0 0 8px' }}>Grants the title "{raid.title}" to the whole clearing party</p>}
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
  const undiscovered = RAIDS.filter((r) => !isRaidUnlocked(r.id, state.completedRaids, state.completedChains)).length;

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

/**
 * Moved here from the Inventory tab's old "Collection" section -- item
 * sets and discovery progress are a lore/completionist record of what
 * the guild has found, same category as Story Quests/Story Raids just
 * above, not something that belongs mixed in with day-to-day gear
 * management. Content and logic are unchanged from the original,
 * just relocated.
 */
function CollectionTab() {
  const engine = useEngine();
  const state = engine.state;

  return (
    <>
      <p className="small muted">
        {state.discoveredItems.length} of {Object.keys(EQUIPMENT_BY_ID).length} items discovered.
      </p>
      {ITEM_SETS.map((set) => {
        const found = set.pieces.filter((p) => state.discoveredItems.includes(p));
        return (
          <div key={set.id} className="card">
            <div className="spread">
              <span className="card-title">{set.name}</span>
              <span className="small muted">{found.length}/{set.pieces.length} found</span>
            </div>
            <div className="stat-row" style={{ marginTop: 6 }}>
              {set.pieces.map((pieceId) => (
                <span
                  key={pieceId}
                  style={{ color: state.discoveredItems.includes(pieceId) ? RARITY_COLOR.legendary : undefined }}
                >
                  {EQUIPMENT_BY_ID[pieceId]?.name ?? pieceId}
                </span>
              ))}
            </div>
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {set.bonuses.map((b) => `${b.count}-piece ${b.label}: ${describeMods(b.mods).join(', ')}`).join(' · ')}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function LorePanel() {
  const engine = useEngine();
  const state = engine.state;
  const [subTab, setSubTab] = useState<'quests' | 'raids' | 'collection'>('quests');

  const rank = currentGuildRank(state);
  const next = nextGuildRank(state);
  const powerNeeded = powerToNextRank(state);

  return (
    <>
      <h2>Lore</h2>
      <p className="subtitle">Every contract tells a small story. This is the guild's record of the ones worth remembering.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread">
          <span
            className="card-title"
            title="Your guild's standing among all who work the Reach."
          >
            {state.guildName || 'This guild'} — {rank.name}
          </span>
        </div>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>{rank.blurb}</p>
        {next && powerNeeded !== null && (
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Next: {next.name} — {powerNeeded.toLocaleString()} more Guild Power.
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn-subtab ${subTab === 'quests' ? 'on' : ''}`} onClick={() => setSubTab('quests')}>
          Story Quests
        </button>
        <button className={`btn-subtab ${subTab === 'raids' ? 'on' : ''}`} onClick={() => setSubTab('raids')}>
          Story Raids
        </button>
        <button className={`btn-subtab ${subTab === 'collection' ? 'on' : ''}`} onClick={() => setSubTab('collection')}>
          Collection
        </button>
      </div>

      {subTab === 'quests' && <StoryQuestsTab />}
      {subTab === 'raids' && <StoryRaidsTab />}
      {subTab === 'collection' && <CollectionTab />}
    </>
  );
}
