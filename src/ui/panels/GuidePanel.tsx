import { useEffect, useState } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { backgroundSrc } from '../../game/settings';
import { GUIDE_TOPICS } from '../../game/data/guideTopics';
import { TAB_LABELS } from '../tabLabels';

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

  // Marks the whole log seen the moment this tab is actually being looked
  // at, and again live if a new notification arrives while it's still
  // open -- someone reading the Notifications list has, by definition,
  // seen whatever's in it, the same "looking at it counts as
  // acknowledging it" idea the header icon/banner both use their own way.
  useEffect(() => {
    engine.markNotificationsSeen();
  }, [engine, notifications[0]?.id]);

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
                onClick={() => engine.requestTab(n.targetTab!, undefined, n.targetSubTab)}
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
  const { settings } = useSettings();
  const [subTab, setSubTab] = useState<'notifications' | 'howto'>('notifications');

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/lore-and-guide.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
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
      </div>
    </div>
  );
}
