import { useEngine, useNow } from './useEngine';
import { RealmThreatManager } from '../game/managers/RealmThreatManager';
import { REALM_MILESTONES, WARD_MINUTES_PER_POINT, RAID_WARD, realmCampaignText, realmTierName } from '../game/data/realmThreat';
import type { RealmEvent, RealmFeedRow } from '../game/auctionHouse';
import { DEMO_BUILD } from '../game/demo';
import { formatDuration, formatNumber } from '../game/util';

/**
 * Realm Threat UI, patch 0477 -- the event slice: a slim banner on the
 * Quest tab, a panel with the shared bar and this guild's part in it, and
 * a one-time reveal when the event ends. Layout and colours follow the
 * design doc's mockups (the violet breach against brass), cut down to
 * what a single-chapter event has. Nothing renders unless the server
 * reports an event this build may take part in.
 */

/** The event to show, or null. Shared by every component here. */
function useRealmEvent(): RealmEvent | null {
  const engine = useEngine();
  const event = engine.realmView.event;
  return event && RealmThreatManager.canContribute(event) ? event : null;
}

function pctOf(event: RealmEvent): number {
  return event.target > 0 ? (event.total / event.target) * 100 : 0;
}

/** Share of the event's run that has passed, 0-100. */
function paceOf(event: RealmEvent, now: number): number {
  const opens = new Date(event.opensAt).getTime();
  const ends = new Date(event.endsAt).getTime();
  if (ends <= opens) return 100;
  return Math.max(0, Math.min(100, ((now - opens) / (ends - opens)) * 100));
}

function statusOf(event: RealmEvent, now: number): { text: string; cls: string } {
  const pct = pctOf(event);
  if (event.phase === 'teaser') return { text: 'Not open yet', cls: 'quiet' };
  if (event.phase === 'tallying') return { text: 'Tallying the last reports', cls: 'quiet' };
  if (event.phase === 'closed') return event.result?.sealed ? { text: 'Sealed', cls: 'good' } : { text: 'Held open', cls: 'warn' };
  if (pct >= 100) return { text: 'Sealed. Keep it shut', cls: 'good' };
  // A little slack, so the first minutes of an event don't read as losing.
  return pct + 2 >= paceOf(event, now) ? { text: 'Holding the line', cls: 'good' } : { text: 'Falling behind', cls: 'warn' };
}

function timeLine(event: RealmEvent, now: number): string {
  if (event.phase === 'teaser') return `Opens in ${formatDuration(new Date(event.opensAt).getTime() - now)}`;
  if (event.phase === 'open') return `Ends in ${formatDuration(new Date(event.endsAt).getTime() - now)}`;
  if (event.phase === 'tallying') return 'Tallying the last reports…';
  return 'Event over';
}

const localTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function ago(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function feedText(row: RealmFeedRow): { text: string; gain: string } {
  if (row.kind === 'milestone') return { text: `The realm reached ${row.points}% of the Ward it needs`, gain: '' };
  if (row.kind === 'reserve') return { text: `${row.guild ?? 'The Crown'} joined the line`, gain: `+${formatNumber(row.points)}` };
  return { text: `${row.guild ?? 'A guild'} sent heroes home`, gain: `+${formatNumber(row.points)}` };
}

/** The slim row at the top of the Quest tab. Opens the panel. */
export function RealmQuestBanner() {
  const engine = useEngine();
  const now = useNow(1000);
  const event = useRealmEvent();
  const state = engine.state;
  // Not during the scripted first contract: one thing at a time.
  if (!event || (state.guidedOnboarding && !state.hasCompletedFirstQuest)) return null;
  const text = realmCampaignText(event.campaignKey);
  const pct = pctOf(event);
  const status = statusOf(event, now);
  const rt = state.realmThreat;
  const mine = rt.points + RealmThreatManager.onItsWay(state);
  return (
    <button type="button" className="realm-banner" onClick={() => engine.openRealmPanel()} title="Open the event">
      <span className="realm-banner-kicker">{text.kicker}</span>
      <span className="realm-banner-name">{text.name}</span>
      {event.phase === 'teaser' ? (
        <span className="realm-banner-time">{timeLine(event, now)}</span>
      ) : (
        <>
          <span className="realm-mini-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, pct)}%` }} />
            {event.phase === 'open' && <b style={{ left: `${paceOf(event, now)}%` }} />}
          </span>
          <span className="realm-banner-pct">{Math.floor(pct)}%</span>
          <span className={`realm-pill ${status.cls}`}>{status.text}</span>
          <span className="realm-banner-mine">
            You: {formatNumber(mine)}{rt.tier > 0 ? ` · ${realmTierName(text, rt.tier - 1)}` : ''}
          </span>
        </>
      )}
      <span className="realm-banner-go" aria-hidden="true">›</span>
    </button>
  );
}

function RealmPanel({ event }: { event: RealmEvent }) {
  const engine = useEngine();
  const now = useNow(1000);
  const state = engine.state;
  const rt = state.realmThreat;
  const text = realmCampaignText(event.campaignKey);
  const pct = pctOf(event);
  const pace = paceOf(event, now);
  const status = statusOf(event, now);
  const view = engine.realmView;
  const onItsWay = RealmThreatManager.onItsWay(state);
  const lastTier = event.tiers[event.tiers.length - 1] || 1;
  const nextIndex = event.tiers.findIndex((t) => rt.points < t);
  const titles = event.rewards.tierTitles ?? [];
  const anyReward = titles.some(Boolean) || !!event.rewards.sealTitle;
  const live = event.phase === 'open' || event.phase === 'tallying';
  const filling = event.phase !== 'teaser';

  return (
    <div className="overlay" onClick={() => engine.closeRealmPanel()}>
      <div className="modal realm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="realm-head">
          <div>
            <div className="realm-kicker">{text.kicker} · {timeLine(event, now)}</div>
            <h2 className="realm-title">{text.name}</h2>
          </div>
          <button className="btn-ghost" onClick={() => engine.closeRealmPanel()}>Close</button>
        </div>

        <div className="realm-strip">
          <div><span>{event.phase === 'teaser' ? 'Opens' : 'Opened'}</span><b>{localTime(event.opensAt)}</b></div>
          <div><span>{event.phase === 'closed' || event.phase === 'tallying' ? 'Ended' : 'Ends'}</span><b>{localTime(event.endsAt)}</b></div>
          <div><span>Guilds defending</span><b>{formatNumber(event.contributors)}</b></div>
          <div>
            <span>Server</span>
            <b className={view.status === 'unreachable' ? 'bad' : 'good'}>{view.status === 'unreachable' ? 'Out of reach' : 'Connected'}</b>
          </div>
        </div>

        <div className="realm-cols">
          <div className="realm-card realm-threat">
            <span className="realm-rift" aria-hidden="true" style={{ transform: `scale(${1 - Math.min(1, pct / 100) * 0.75})`, opacity: 1 - Math.min(1, pct / 100) * 0.6 }} />
            <p className="realm-blurb">
              {event.phase === 'teaser' ? text.teaserBlurb
                : event.phase === 'closed' && event.result ? (event.result.sealed ? text.winText : text.loseText)
                  : text.blurb}
            </p>
            {filling && (
              <>
                <div className="realm-label">Ward raised by the realm</div>
                <div className="realm-total-row">
                  <span className="realm-total">{formatNumber(event.total)}</span>
                  <span className="realm-target">/ {formatNumber(event.target)}</span>
                  <span style={{ flex: 1 }} />
                  <span className={`realm-pill ${status.cls}`}>{status.text}</span>
                </div>
                <div className="realm-bar-wrap">
                  {event.phase === 'open' && pct < 100 && (
                    <span
                      className={`realm-pace ${pace < 15 ? 'from-left' : pace > 85 ? 'from-right' : ''}`}
                      style={{ left: `${pace}%` }}
                    >{text.paceLabel}</span>
                  )}
                  <div className="realm-bar">
                    <i className="realm-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                    {event.phase === 'open' && pct < pace && (
                      <i className="realm-hatch" style={{ left: `${Math.min(100, pct)}%`, width: `${Math.max(0, pace - pct)}%` }} />
                    )}
                    {REALM_MILESTONES.slice(0, -1).map((m) => <b key={m} style={{ left: `${m}%` }} />)}
                  </div>
                  <div className="realm-ticks">
                    {REALM_MILESTONES.map((m) => (
                      <span key={m} className={pct >= m ? 'hit' : ''}>{m}%</span>
                    ))}
                  </div>
                </div>
                <div className="realm-sub">
                  <span>{pct >= 1000 ? Math.floor(pct) : pct.toFixed(1)}% raised</span>
                  {event.phase === 'open' && pct < 100 && <span>Needed by now to stay ahead: {pace.toFixed(1)}%</span>}
                  {event.phase === 'tallying' && <span>Late reports are still being counted</span>}
                </div>
              </>
            )}
            {event.phase === 'teaser' && (
              <div className="realm-teaser">
                <div className="realm-label">The breach opens in</div>
                <div className="realm-total">{formatDuration(new Date(event.opensAt).getTime() - now)}</div>
                <div className="realm-sub"><span>The realm needs {formatNumber(event.target)} Ward to seal it.</span></div>
              </div>
            )}
          </div>

          <div className="realm-side">
            <div className="realm-card">
              <div className="realm-label spread">
                <span>Your Ward</span><span>cap {formatNumber(event.cap)}</span>
              </div>
              <div className="realm-mine-row">
                <span className="realm-mine">{formatNumber(rt.points)}</span>
                <span className="realm-mine-tier">{rt.tier > 0 ? realmTierName(text, rt.tier - 1) : 'No tier yet'}</span>
              </div>
              <div className="realm-track" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (rt.points / lastTier) * 100)}%` }} />
                {event.tiers.map((t, i) => (
                  <b key={t} className={rt.points >= t ? 'hit' : ''} style={{ left: `${(t / lastTier) * 100}%` }} title={`${realmTierName(text, i)} · ${t}`} />
                ))}
              </div>
              <div className="realm-tier-list">
                {event.tiers.map((t, i) => (
                  <div key={t} className={rt.points >= t ? 'hit' : ''}>
                    <span>{rt.points >= t ? '◆' : '◇'} {realmTierName(text, i)} · {formatNumber(t)}</span>
                    <span>{titles[i] ? `Title: ${titles[i]}` : ''}</span>
                  </div>
                ))}
                {event.rewards.sealTitle && (
                  <div className={event.result?.sealed && rt.tier > 0 ? 'hit' : ''}>
                    <span>If the realm seals it</span><span>Title: {event.rewards.sealTitle}</span>
                  </div>
                )}
              </div>
              <p className="realm-note">
                {event.phase === 'teaser' ? 'Ward starts counting the moment it opens.'
                  : nextIndex === -1 ? 'Top tier reached. Every extra Ward still helps the realm.'
                    : `${formatNumber(event.tiers[nextIndex] - rt.points)} more Ward reaches ${realmTierName(text, nextIndex)}.`}
              </p>
              {live && (
                <div className="realm-outbox">
                  <div>
                    <b>On its way: +{formatNumber(onItsWay)} Ward</b>
                    <span>
                      {view.status === 'unreachable' ? 'The server is out of reach. Your Ward is saved and sends when it can.'
                        : view.sendError ? `Not sent yet: ${view.sendError}`
                          : view.note ? view.note
                            : onItsWay > 0 ? 'Sends with your next sync, every few minutes.' : 'Nothing waiting. Finished quests add Ward here.'}
                    </span>
                  </div>
                  <button
                    className="btn-primary"
                    disabled={view.syncing}
                    onClick={() => void engine.manualRealmSync()}
                    title={onItsWay > 0 ? 'Send your waiting Ward now' : 'Check the server for your latest Ward'}
                  >
                    {view.syncing ? (onItsWay > 0 ? 'Sending…' : 'Checking…') : onItsWay > 0 ? 'Send now' : 'Refresh'}
                  </button>
                </div>
              )}
              <p className="realm-note">
                {anyReward
                  ? (DEMO_BUILD ? 'Titles you earn here stay with your guild in the full game.' : 'Titles are added to your guild as you earn them.')
                  : 'No rewards are attached to this event.'}
              </p>
            </div>

            <div className="realm-card">
              <div className="realm-label">How Ward is earned</div>
              <p className="realm-note" style={{ marginTop: 4 }}>
                1 Ward per {WARD_MINUTES_PER_POINT} minutes of quest time a hero completes, so every level earns the same per hour.
                Failed quests earn half. Fast quests earn none. A raid clear earns {RAID_WARD.normal}.
                Quests your heroes finish while you're away count too.
              </p>
            </div>
          </div>
        </div>

        {filling && (
          <div className="realm-card realm-feed">
            <div className="realm-label">Deeds at the breach</div>
            {event.feed.length === 0 && <p className="realm-note">Nothing yet. The first guild home starts the line.</p>}
            {event.feed.map((row, i) => {
              const line = feedText(row);
              return (
                <div key={`${row.at}-${i}`} className="realm-feed-row">
                  <span>{line.text} {line.gain && <b>{line.gain}</b>}</span>
                  <span>{ago(row.at, now)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RealmResult({ event }: { event: RealmEvent }) {
  const engine = useEngine();
  const state = engine.state;
  const text = realmCampaignText(event.campaignKey);
  const result = event.result!;
  const rt = state.realmThreat;
  const possible = [...(event.rewards.tierTitles ?? []), event.rewards.sealTitle].filter((t): t is string => !!t);
  const earned = possible.filter((t) => state.guildTitles.includes(t));
  const pct = Math.round(result.finalPct * 100);
  return (
    <div className="overlay">
      <div className="modal realm-modal realm-result" onClick={(e) => e.stopPropagation()}>
        <div className="realm-kicker">{text.name}</div>
        <h2 className={`realm-title ${result.sealed ? 'good' : 'warn'}`}>{result.sealed ? text.sealedHeadline : text.heldOpenHeadline}</h2>
        <div className="realm-bar-wrap">
          <div className="realm-bar"><i className="realm-fill realm-fill-reveal" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        </div>
        <div className="realm-total-row" style={{ justifyContent: 'center' }}>
          <span className="realm-total">{pct}%</span>
          <span className="realm-target">· {formatNumber(event.total)} Ward from {formatNumber(event.contributors)} guild{event.contributors === 1 ? '' : 's'}</span>
        </div>
        <p className="realm-blurb" style={{ textAlign: 'center', maxWidth: 'none' }}>{result.sealed ? text.winText : text.loseText}</p>
        <div className="realm-card" style={{ textAlign: 'center' }}>
          <div className="realm-label">Your guild</div>
          <div className="realm-mine-row" style={{ justifyContent: 'center' }}>
            <span className="realm-mine">{formatNumber(rt.points)}</span>
            <span className="realm-mine-tier">Ward{rt.tier > 0 ? ` · ${realmTierName(text, rt.tier - 1)}` : ''}</span>
          </div>
          {earned.length > 0 && <p className="realm-note">Titles earned: {earned.join(', ')}{DEMO_BUILD ? '. Kept in the full game.' : '.'}</p>}
        </div>
        <div className="row end" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={() => engine.dismissRealmResult()}>Back to the guild</button>
        </div>
      </div>
    </div>
  );
}

/** Mounted once in App.tsx. `active` = the menu window is showing (the
 *  tiny idle companion never hosts these). */
export function RealmThreatHost({ active }: { active: boolean }) {
  const engine = useEngine();
  const event = useRealmEvent();
  if (!active || !event) return null;
  if (engine.realmResultOpen && event.phase === 'closed' && event.result) return <RealmResult event={event} />;
  if (engine.realmPanelOpen) return <RealmPanel event={event} />;
  return null;
}
