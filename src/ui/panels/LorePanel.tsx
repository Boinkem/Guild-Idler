import { useState, useEffect } from 'react';
import { QUEST_CHAINS, ChainDef, DIFFICULTIES } from '../../game/data/quests';
import { GUILD_RANK_TIERS, currentGuildRank, nextGuildRank, powerToNextRank, rankTierForLevel } from '../../game/data/guildRank';
import { outgoingConnections, incomingConnections } from '../../game/data/chainConnections';
import { RAIDS, RAID_ENCOUNTER_BY_ID, isRaidUnlocked } from '../../game/data/raids';
import { RaidBanner } from './RaidsPanel';
import { EQUIPMENT_BY_ID, ITEM_SETS } from '../../game/data/equipment';
import { describeMods, RARITY_COLOR, formatDuration } from '../../game/util';
import { isTabUnread } from '../../game/attention';
import { RarityPill } from '../RarityPill';
import { useEngine } from '../useEngine';

/**
 * Banner strip for a chain card and its detail modal -- same
 * className-driven sizing convention RaidsPanel's own RaidBanner uses
 * (patch 0230, matching this to the real raid cards per direct request),
 * replacing the fixed-size single-purpose version this used to be.
 * `className` picks the surface (.raid-card-thumb for the list row,
 * .raid-detail-banner for the modal) -- sizing/radius/margin all live in
 * that class already, shared with raids rather than duplicated here.
 *
 * `banner` is the chain's optional DevTool-assigned override + focus point
 * (ChainDef.banner) -- unset for a chain that hasn't had one assigned, in
 * which case this falls all the way back to the original id-convention
 * path at dead-center focus, exactly as before this existed. Missing art
 * simply fails to paint, same convention as raids' own banners.
 */
function ChainBanner({
  chainId, banner, className,
}: { chainId: string; banner?: ChainDef['banner']; className: string }) {
  const src = banner?.path ? `./lore/${banner.path}` : `./lore/chains/${chainId}.jpg`;
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: `${banner?.focusX ?? 50}% ${banner?.focusY ?? 50}%`,
        ...(banner?.scale && banner.scale !== 100 ? { backgroundSize: `${banner.scale}%` } : {}),
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

/** Static, party-independent success estimate for a chain stage --
 *  deliberately NOT a live per-hero preview the way raid encounters get
 *  (raids commit a whole party upfront so a real preview makes sense;
 *  chain stages are sent individually with whoever the player picks at
 *  the time, and the Lore tab has no party-selection flow to hang a live
 *  number off of). Reads the stage's own difficulty tier's baseSuccess
 *  straight from DIFFICULTIES -- an honest "typical odds at this
 *  difficulty" figure, same simplification balance.ts's own
 *  expectedRatePerHour already makes elsewhere rather than modeling a
 *  specific hero. */
function stageSuccessEstimate(difficulty: ChainDef['stages'][number]['difficulty']): number {
  return DIFFICULTIES[difficulty].baseSuccess;
}

/**
 * Detail view for a single chain -- opened by clicking a ChainCard below,
 * same "click a raid-card, get a detail modal" shape RaidDetailModal
 * already established, reusing its own CSS (.raid-detail-modal/
 * .raid-detail-banner/.raid-encounter-list/.raid-encounter-item) rather
 * than a parallel set of lore-specific classes.
 *
 * `stage` undefined means completed (reveal every stage); a number means
 * in-progress at that stage -- only stages already reached are shown,
 * same spoiler-avoidance the old InProgressEntry already had ("the story
 * isn't finished yet..." placeholder for the rest).
 *
 * Loot only shows on the FINAL stage -- chains only define a guaranteed
 * reward at chain-completion (ChainDef.rewardItems), not per-stage the
 * way raid encounters each have their own loot table, so there's nothing
 * earlier stages could show even if this wanted to.
 */
function ChainDetailModal({
  chain, stage, completedIds, onClose,
}: { chain: ChainDef; stage?: number; completedIds: Set<string>; onClose: () => void }) {
  const revealCount = stage ?? chain.stages.length;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
        <ChainBanner chainId={chain.id} banner={chain.banner} className="raid-detail-banner" />
        <div className="spread">
          <span className="card-title hero-card-name">{chain.name}</span>
          <span className="tiny gold-text">Lv {chain.reqLevel}</span>
        </div>
        <p className="card-flavour">{chain.description}</p>
        {chain.title && (
          <p className="tiny muted" style={{ margin: '0 0 8px' }}>
            Grants the title "{chain.title}"{stage === undefined ? '' : ' on completion'}
          </p>
        )}

        <div className="section-heading">Stages</div>
        <ol className="raid-encounter-list">
          {chain.stages.slice(0, revealCount).map((s, i) => {
            const isFinal = i === chain.stages.length - 1;
            const success = stageSuccessEstimate(s.difficulty);
            return (
              <li key={s.name} className="raid-encounter-item">
                <details>
                  <summary>
                    <b>{i + 1}. {s.name}</b>
                    <span className="tiny muted" style={{ marginLeft: 8 }}>
                      Typical success <b className={success >= 60 ? 'good' : success >= 35 ? '' : 'bad'}>{success}%</b>
                      {' · '}Time <b>{formatDuration(s.duration)}</b>
                    </span>
                  </summary>
                  <p className="muted" style={{ marginTop: 4 }}>{s.flavour}</p>
                  {isFinal && chain.rewardItems.length > 0 && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                      {chain.rewardItems.map((defId) => {
                        const def = EQUIPMENT_BY_ID[defId];
                        if (!def) return null;
                        return (
                          <div key={defId} className="loot-chip" style={{ cursor: 'default' }}>
                            <span className="tiny" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
                            <RarityPill rarity={def.rarity} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </details>
              </li>
            );
          })}
          {stage !== undefined && stage < chain.stages.length && (
            <li className="tiny muted">The story isn't finished yet...</li>
          )}
        </ol>

        {stage === undefined && (chain.rewardGold > 0 || chain.rewardRenown > 0) && (
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Completion reward: <b className="gold-text">{chain.rewardGold} gold</b>
            {chain.rewardRenown > 0 && <> · <b>{chain.rewardRenown} renown</b></>}
          </p>
        )}

        {stage === undefined && chain.epilogue && (
          <p
            className="tiny lore-epilogue"
            style={{ fontStyle: 'italic', borderLeft: '2px solid var(--brass)', paddingLeft: 8, margin: '10px 0 0' }}
          >
            {chain.epilogue}
          </p>
        )}

        {stage === undefined && <ConnectionTags chain={chain} completedIds={completedIds} />}

        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * List-row shell for a chain -- restyled (patch 0230, direct request) to
 * match RaidsPanel's own RaidCard exactly: thumbnail, name+meta, chevron,
 * click opens a detail modal, instead of the previous full-banner
 * inline-expand card. Handles both completed (`stage` omitted) and
 * in-progress (`stage` set) in one component rather than two near-
 * identical ones, since the shell itself no longer differs between them
 * beyond the meta line.
 */
function ChainCard({
  chain, completedIds, stage,
}: { chain: ChainDef; completedIds: Set<string>; stage?: number }) {
  const [showModal, setShowModal] = useState(false);
  const inProgress = stage !== undefined;
  return (
    <>
      <div
        className="card raid-card"
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <ChainBanner chainId={chain.id} banner={chain.banner} className="raid-card-thumb" />
        <div className="raid-card-body">
          <div className="raid-card-name">{chain.name}</div>
          <div className="raid-card-meta">
            {inProgress
              ? <span className="tiny muted">underway — {stage}/{chain.stages.length}</span>
              : <span className="tiny gold-text">Lv {chain.reqLevel}</span>}
          </div>
          {!inProgress && chain.title && <p className="tiny muted" style={{ margin: '2px 0 0' }}>Grants the title "{chain.title}"</p>}
          {!inProgress && <ConnectionTags chain={chain} completedIds={completedIds} />}
        </div>
        <span className="raid-card-chevron" aria-hidden="true">›</span>
      </div>
      {showModal && (
        <ChainDetailModal chain={chain} stage={stage} completedIds={completedIds} onClose={() => setShowModal(false)} />
      )}
    </>
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
            <ChainCard key={chain.id} chain={chain} completedIds={discoveredIds} stage={active.stage} />
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
          {chains.map((chain) => <ChainCard key={chain.id} chain={chain} completedIds={completedIds} />)}
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

/**
 * Detail view for a completed raid's Lore-tab history entry -- opened by
 * clicking the raid-card row below. Deliberately NOT RaidsPanel's own
 * RaidDetailModal reused wholesale -- that one drives an actual party-
 * picker/launch flow, which makes no sense for a read-only history
 * record of something already cleared. Same content this used to show
 * inline (description, title, per-encounter name+flavour, epilogue),
 * just moved into a modal to match the click-to-open shell every other
 * card in this tab now uses.
 */
function RaidHistoryDetailModal({ raidId, onClose }: { raidId: string; onClose: () => void }) {
  const raid = RAIDS.find((r) => r.id === raidId);
  if (!raid) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal raid-detail-modal" onClick={(e) => e.stopPropagation()}>
        <RaidBanner raidId={raid.id} banner={raid.banner} className="raid-detail-banner" />
        <div className="spread">
          <span className="card-title hero-card-name">{raid.name}</span>
          <span className="tiny gold-text">Lv {raid.reqLevel}</span>
        </div>
        <p className="card-flavour">{raid.description}</p>
        {raid.title && <p className="tiny muted" style={{ margin: '0 0 8px' }}>Grants the title "{raid.title}" to the whole clearing party</p>}
        <div className="section-heading">Encounters</div>
        <ol className="raid-encounter-list">
          {raid.encounterIds.map((id) => {
            const enc = RAID_ENCOUNTER_BY_ID[id];
            if (!enc) return null;
            return (
              <li key={id} className="raid-encounter-item">
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
        <div className="row end" style={{ marginTop: 14 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function RaidCompletedEntry({ raidId }: { raidId: string }) {
  const [showModal, setShowModal] = useState(false);
  const raid = RAIDS.find((r) => r.id === raidId);
  if (!raid) return null;
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
        </div>
        <span className="raid-card-chevron" aria-hidden="true">›</span>
      </div>
      {showModal && <RaidHistoryDetailModal raidId={raidId} onClose={() => setShowModal(false)} />}
    </>
  );
}

function RaidInProgressEntry() {
  const engine = useEngine();
  const active = engine.state.activeRaid;
  const [showModal, setShowModal] = useState(false);
  if (!active) return null;
  const raid = RAIDS.find((r) => r.id === active.raidId);
  if (!raid) return null;

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
            <span className="tiny muted">underway — {active.difficulty}</span>
          </div>
        </div>
        <span className="raid-card-chevron" aria-hidden="true">›</span>
      </div>
      {showModal && <RaidHistoryDetailModal raidId={active.raidId} onClose={() => setShowModal(false)} />}
    </>
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

  // Deep-link support for a notification's "Go to" button targeting a
  // specific Lore sub-tab -- same consume-once shape every other
  // sub-tabbed panel uses.
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested === 'quests' || requested === 'raids' || requested === 'collection') setSubTab(requested);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever sub-tab is currently open -- on mount (the
  // default Story Quests) and again on every switch -- clearing the nav
  // shimmer for a banner-worthy notification targeting this specific
  // sub-tab (patch 0191).
  useEffect(() => {
    engine.acknowledgeTab('lore', subTab);
  }, [engine, subTab]);

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
        <button
          className={`btn-subtab ${subTab === 'quests' ? 'on' : ''} ${isTabUnread(state, 'lore', 'quests') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('quests')}
        >
          Story Quests
        </button>
        <button
          className={`btn-subtab ${subTab === 'raids' ? 'on' : ''} ${isTabUnread(state, 'lore', 'raids') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('raids')}
        >
          Story Raids
        </button>
        <button
          className={`btn-subtab ${subTab === 'collection' ? 'on' : ''} ${isTabUnread(state, 'lore', 'collection') ? 'subtab-unread' : ''}`}
          onClick={() => setSubTab('collection')}
        >
          Collection
        </button>
      </div>

      {subTab === 'quests' && <StoryQuestsTab />}
      {subTab === 'raids' && <StoryRaidsTab />}
      {subTab === 'collection' && <CollectionTab />}
    </>
  );
}
