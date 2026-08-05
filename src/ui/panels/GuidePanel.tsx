import { useState } from 'react';
import { useEngine } from '../useEngine';
import { GUIDE_TOPICS } from '../../game/data/guideTopics';

/** Display labels for the tab ids notifications can point at -- kept local
 *  and small rather than importing MenuWindow's own tab structure, which
 *  isn't exported and shouldn't need to be just for this. */
const TAB_LABELS: Record<string, string> = {
  dashboard: 'the Guild', heroes: 'Heroes', equipment: 'Inventory', shop: 'Shop',
  guild: 'Guild Hall', quests: 'Quests', raids: 'Raids', lore: 'Lore', guide: 'Guide',
  upgrades: 'Upgrades', prestige: 'Prestige', stats: 'Statistics', settings: 'Settings',
};

function timeAgo(ts: number, now: number): string {
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationsTab() {
  const engine = useEngine();
  const notifications = engine.state.notifications;
  const now = Date.now();

  if (notifications.length === 0) {
    return <p className="small muted">Nothing yet. Everything that happens in the guild gets logged here.</p>;
  }

  return (
    <div className="notif-list">
      {notifications.map((n) => (
        <div key={n.id} className="notif-row">
          <span className="tiny">{n.message}</span>
          <span className="row" style={{ gap: 6, alignItems: 'center' }}>
            {n.targetTab && (
              <button
                className="btn-ghost"
                style={{ minHeight: 20, padding: '2px 8px', fontSize: '0.625rem' }}
                onClick={() => engine.requestTab(n.targetTab!)}
              >
                Go to {TAB_LABELS[n.targetTab] ?? n.targetTab}
              </button>
            )}
            <span className="tiny muted">{timeAgo(n.timestamp, now)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function HowToTab() {
  return (
    <>
      {GUIDE_TOPICS.map((topic) => (
        <div key={topic.id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-title">{topic.title}</div>
          <p className="small muted" style={{ marginTop: 4 }}>{topic.body}</p>
        </div>
      ))}
    </>
  );
}

export function GuidePanel() {
  const [subTab, setSubTab] = useState<'notifications' | 'howto'>('notifications');

  return (
    <>
      <h2>Guide</h2>
      <p className="subtitle">A running log of what's happened, and a quick reference for how everything works.</p>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className={subTab === 'notifications' ? 'btn-primary' : ''} onClick={() => setSubTab('notifications')}>
          Notifications
        </button>
        <button className={subTab === 'howto' ? 'btn-primary' : ''} onClick={() => setSubTab('howto')}>
          How To
        </button>
      </div>

      {subTab === 'notifications' ? <NotificationsTab /> : <HowToTab />}
    </>
  );
}
