import { useState } from 'react';
import { useEngine } from './useEngine';
import { BUILD_VERSION, DEMO_BUILD } from '../game/demo';

/**
 * Patch 0477 -- "Report a bug". A small form reachable from the top bar
 * (the bug icon), Settings, and the demo's wishlist card. Sends the
 * player's words plus a few facts that place the bug (build, demo or
 * full, the tab they were on, guild name, top hero level) -- never the
 * save. Works signed out and in the demo; if the server can't be reached
 * the report waits on this PC and goes with a later sync
 * (engine.sendBugReport / flushBugQueue).
 */

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'bug', label: 'Something is broken' },
  { id: 'crash', label: 'Crash or freeze' },
  { id: 'ui', label: 'Looks wrong / hard to use' },
  { id: 'balance', label: 'Balance or tuning' },
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'other', label: 'Something else' },
];

/** Top-bar icon. `tab` is the tab the player is on, sent with the report. */
export function BugReportButton({ tab }: { tab: string }) {
  const engine = useEngine();
  return (
    <button className="header-notif-icon header-bug-icon" onClick={() => engine.openBugReport(tab)} title="Report a bug">
      🐞
    </button>
  );
}

function BugReportModal() {
  const engine = useEngine();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('bug');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'sent' | 'queued' | null>(null);
  const ready = message.trim().length >= 5 && !busy;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    const outcome = await engine.sendBugReport({ message, category, contact });
    setBusy(false);
    setDone(outcome);
  };

  return (
    <div className="overlay" onClick={() => !busy && engine.closeBugReport()}>
      <div className="modal bugrep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="card-title">🐞 Report a bug</span>
          <button className="btn-ghost" onClick={() => engine.closeBugReport()} disabled={busy}>Close</button>
        </div>
        {done ? (
          <>
            <p className="bugrep-done">
              {done === 'sent'
                ? 'Sent. Thank you, this goes straight to the developer.'
                : "Saved. The server couldn't be reached just now, so it will be sent the next time it can be."}
            </p>
            <div className="row end"><button className="btn-primary" onClick={() => engine.closeBugReport()}>Done</button></div>
          </>
        ) : (
          <>
            <label className="bugrep-label" htmlFor="bugrep-message">What happened?</label>
            <textarea
              id="bugrep-message"
              className="bugrep-text"
              value={message}
              maxLength={4000}
              autoFocus
              placeholder="What you did, what you expected, and what happened instead."
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="bugrep-row">
              <div>
                <label className="bugrep-label" htmlFor="bugrep-category">Kind</label>
                <select id="bugrep-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="bugrep-label" htmlFor="bugrep-contact">Discord name (optional)</label>
                <input id="bugrep-contact" type="text" value={contact} maxLength={64} placeholder="If we may ask a follow-up" onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>
            <p className="bugrep-note">
              Sent with it: build {BUILD_VERSION || 'dev'}{DEMO_BUILD ? ' (demo)' : ''}, the tab you're on, your guild's name and top hero level.
              Your save is not sent.
            </p>
            <div className="row end" style={{ gap: 8 }}>
              <button onClick={() => engine.closeBugReport()} disabled={busy}>Cancel</button>
              <button className="btn-primary" disabled={!ready} onClick={send}>{busy ? 'Sending…' : 'Send report'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Mounted once in App.tsx. Keyed on open, so the form starts clean each time. */
export function BugReportHost({ active }: { active: boolean }) {
  const engine = useEngine();
  if (!active || !engine.bugReportOpen) return null;
  return <BugReportModal />;
}
