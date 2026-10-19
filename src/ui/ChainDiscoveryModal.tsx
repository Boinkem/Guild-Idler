import { useEngine } from './useEngine';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { chainBannerSrc, chainIconSrc } from './panels/QuestPanel';
import { at } from './resultFx';

/** Stage nodes drawn on the trail before the rest fold into "+N". */
const MAX_NODES = 5;

/**
 * The scripted tour's actual finale, even though it isn't one of its fixed
 * steps -- this fires whenever the board first rolls a quest chain, which
 * could be immediately or much later depending on what the board happens
 * to generate. Kept as a plain standalone modal rather than another
 * spotlight step: the target (a specific quest-board card) is dynamic and
 * might not even be rendered if the player isn't currently on the Quests
 * tab, unlike the tour's fixed nav-tab targets.
 *
 * Patch 0424 -- rebuilt as a sealed scroll: it drops in, the wax seal
 * cracks apart, and the scroll unrolls to show the chain the board just
 * rolled (its banner, icon and name, read from state.chainBoard), then a
 * dashed trail draws out to every stage. Stage 1 is live and pulses; the
 * rest stay "???" until reached. Falls back to generic copy if the chain
 * can't be resolved.
 */
export function ChainDiscoveryModal({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  const engine = useEngine();
  const chainId = engine.state.chainBoard.find((o) => o.chain)?.chain?.chainId;
  const chain = chainId ? CHAIN_BY_ID[chainId] : undefined;
  const stages = chain?.stages ?? [];
  const shown = stages.slice(0, MAX_NODES);
  const T_NODES = 2900;
  const T_HINT = T_NODES + shown.length * 220 + 100;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="cfx-scroll" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="A quest chain awaits">
        <div className="cfx-rod" />
        <span className="cfx-seal" style={at(450)} aria-hidden="true">
          <span className="cfx-half l" style={at(450)}>✦</span>
          <span className="cfx-half r" style={at(450)}>✦</span>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`cfx-crumb c${i}`} style={at(560)} />)}
        </span>
        <div className="cfx-sheet" style={at(700)}>
          <div className="cfx-inner">
            {chain && (
              <div className="cfx-banner" style={at(1100, { backgroundImage: `url(${chainBannerSrc(chain.id, chain.banner)})` })}>
                <span className="cfx-icon" style={at(1500, { backgroundImage: `url(${chainIconSrc(chain.id, chain.icon, chain.banner)})` })} />
              </div>
            )}
            <div className="cfx-kick" style={at(1500)}>A quest chain awaits</div>
            <div className="cfx-name" style={at(1750)}>{chain?.name ?? 'A Quest Chain'}</div>
            <p className="cfx-desc" style={at(2300)}>
              {stages.length > 0
                ? `A story that unfolds across ${stages.length} stages, right on the Quest Board. Complete one stage and the next appears.`
                : 'A story that unfolds across several stages, right on the Quest Board. Complete one stage and the next becomes available.'}
            </p>
            {shown.length > 0 && (
              <div className="cfx-path">
                <span className="cfx-trail" style={at(2700)} />
                {shown.map((st, i) => (
                  <div key={i} className={`cfx-node ${i === 0 ? 'live' : ''}`} style={at(T_NODES + i * 220)}>
                    <div className="cfx-dot">
                      {i === 0 ? (
                        <svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 2 L12 7 L3 12z" /></svg>
                      ) : (
                        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="6.5" width="8" height="6" rx="1" /><path d="M5 6.5V4.5a2 2 0 0 1 4 0v2" /></svg>
                      )}
                    </div>
                    <div>Stage {i + 1}</div>
                    <div className="cfx-q">{i === 0 ? st.name : i === shown.length - 1 && stages.length > shown.length ? `+${stages.length - shown.length} more` : '???'}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="cfx-hint" style={at(T_HINT)}>Stage 1 is waiting on the Quest Board now.</div>
            <div className="row end cfx-acts" style={at(T_HINT + 250, { marginTop: 14, gap: 8 })}>
              <button className="btn-ghost cfx-close" onClick={onClose}>Close</button>
              <button className="btn-primary" onClick={onView}>View on Quest Board</button>
            </div>
          </div>
        </div>
        <div className="cfx-rod" />
      </div>
    </div>
  );
}
