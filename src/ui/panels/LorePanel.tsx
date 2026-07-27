import { useState } from 'react';
import type { MouseEvent } from 'react';
import { QUEST_CHAINS, ChainDef } from '../../game/data/quests';
import { useEngine } from '../useEngine';

/** Shared summary/expand toggle button, matching the Heroes tab pattern. */
function ExpandToggle({ open, onClick }: { open: boolean; onClick: (e: MouseEvent) => void }) {
  return (
    <button className="btn-ghost hero-card-expand" onClick={onClick}>
      {open ? 'Less ▲' : 'More ▼'}
    </button>
  );
}

function CompletedEntry({ chain }: { chain: ChainDef }) {
  const [open, setOpen] = useState(false);
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
        <span className="card-title hero-card-name">{chain.name}</span>
        <span className="tiny gold-text">Lv {chain.reqLevel}</span>
      </div>
      {!open && chain.title && <p className="tiny muted" style={{ margin: '4px 0 0' }}>Grants the title "{chain.title}"</p>}
      {open && (
        <div className="hero-card-details">
          {chain.title && <p className="tiny muted" style={{ margin: '0 0 8px' }}>Grants the title "{chain.title}"</p>}
          <p className="card-flavour">{chain.epilogue ?? chain.description}</p>
          <ol className="lore-stage-list">
            {chain.stages.map((s) => (
              <li key={s.name}>
                <b>{s.name}.</b> <span className="muted">{s.flavour}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <ExpandToggle open={open} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} />
    </div>
  );
}

function InProgressEntry({ chain, stage }: { chain: ChainDef; stage: number }) {
  const [open, setOpen] = useState(false);
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

export function LorePanel() {
  const engine = useEngine();
  const state = engine.state;

  const completed = QUEST_CHAINS
    .filter((c) => state.completedChains.includes(c.id))
    .sort((a, b) => a.reqLevel - b.reqLevel);

  const inProgress = state.activeChains
    .map((ac) => ({ active: ac, chain: QUEST_CHAINS.find((c) => c.id === ac.chainId) }))
    .filter((x): x is { active: typeof state.activeChains[number]; chain: ChainDef } => !!x.chain)
    .sort((a, b) => a.chain.reqLevel - b.chain.reqLevel);

  const discoveredIds = new Set([...completed.map((c) => c.id), ...inProgress.map((x) => x.chain.id)]);
  const undiscovered = QUEST_CHAINS.length - discoveredIds.size;

  return (
    <>
      <h2>Lore</h2>
      <p className="subtitle">Every contract tells a small story. This is the guild's record of the ones worth remembering.</p>

      {inProgress.length > 0 && (
        <>
          <div className="section-heading">Still unfolding</div>
          {inProgress.map(({ active, chain }) => (
            <InProgressEntry key={chain.id} chain={chain} stage={active.stage} />
          ))}
        </>
      )}

      <div className="section-heading">Completed</div>
      {completed.length === 0 && (
        <p className="small muted">No chapters finished yet. Contracts on the board sometimes lead somewhere bigger — keep an eye out.</p>
      )}
      {completed.map((chain) => <CompletedEntry key={chain.id} chain={chain} />)}

      {undiscovered > 0 && (
        <p className="tiny muted" style={{ marginTop: 12 }}>
          {undiscovered} more {undiscovered === 1 ? 'story' : 'stories'} out there, waiting to be found.
        </p>
      )}
    </>
  );
}
