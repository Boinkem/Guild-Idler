import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';

/**
 * Blocking, non-dismissible prompt asking the player to name their guild.
 * Gated purely on state.guildName === '' -- this covers a brand-new save,
 * an old save migrated in before guildName existed, and a fresh hardReset()
 * (which recreates initial state, guildName included), so no separate
 * "isNew" plumbing is needed to decide when to show it.
 *
 * Deliberately has no overlay-click-to-dismiss and no close button -- unlike
 * QuestResultModal/OfflineReportModal, this isn't optional information, it's
 * a one-time setup step. App.tsx also holds the other modals back while this
 * is showing so nothing stacks behind it.
 */
export function GuildNamingModal({ onNeedsSpace }: { onNeedsSpace: () => void }) {
  const engine = useEngine();
  const [draft, setDraft] = useState('');
  const unnamed = engine.state.guildName === '';

  // Forces full menu size before this modal has to render at all -- lives
  // here rather than in App.tsx specifically because this component
  // reliably re-renders whenever guildName changes (it's a normal
  // useEngine() consumer reading state directly), which an effect in
  // App.tsx keyed on [engine, changeMode] could not do: engine.hardReset()
  // reassigns state internally without ever changing the engine instance
  // itself, so that effect only ever fired once, on the very first boot.
  // Confirmed as the actual cause of the naming prompt getting trapped,
  // unusable, inside the tiny idle-companion window after a reset.
  useEffect(() => {
    if (unnamed) onNeedsSpace();
  }, [unnamed, onNeedsSpace]);

  if (!unnamed) return null;

  const trimmed = draft.trim();

  const confirm = () => {
    if (!trimmed) return;
    engine.setGuildName(trimmed);
  };

  return (
    <div className="overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/*
          Placeholder for the guild's sprite/seal. A scroll-and-note-taker
          character is planned here -- sized and positioned so dropping the
          real art in later is a one-line swap, same fallback approach
          HeroSprite already uses for missing character art. Nothing else
          in this component needs to change when that lands.
        */}
        <div
          className="guild-naming-sprite-placeholder"
          style={{
            width: 96, height: 96, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed var(--panel3)', borderRadius: 4, fontSize: 40,
          }}
          aria-hidden="true"
        >
          📜
        </div>

        <h3 style={{ textAlign: 'center' }}>What is your guild called?</h3>
        <p className="small muted" style={{ marginTop: 0, textAlign: 'center' }}>
          You can rename it later from the Dashboard.
        </p>

        <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
          <span className="tiny muted">Guild -</span>
          <input
            type="text"
            value={draft}
            placeholder="Ironclad"
            maxLength={24}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
            style={{
              flex: 1, background: 'var(--panel2)', border: '1px solid var(--panel3)',
              color: 'var(--text)', padding: '7px 8px',
            }}
          />
        </div>

        <div className="row end" style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={confirm} disabled={!trimmed}>
            Found the guild
          </button>
        </div>
      </div>
    </div>
  );
}
