import type { ReactNode } from 'react';
import { useEngine } from '../useEngine';
import { useSettings } from '../useSettings';
import { HeroSprite } from '../sprites/HeroSprite';
import { PetSprite } from '../sprites/PetSprite';
import { Settings, THEMES, backgroundSrc } from '../../game/settings';
import { previewSound } from '../../game/sound';
import { BARD_TRACKS } from '../../game/data/bard';
import { CREDITS } from '../../game/data/credits';

/* ------------------------------ small controls ---------------------------- */

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <div>{label}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={opt.value === value ? 'seg on' : 'seg'}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      className={`toggle ${value ? 'on' : ''}`}
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
    >
      <span className="knob" />
    </button>
  );
}

/* --------------------------------- panel ---------------------------------- */

export function SettingsPanel() {
  const engine = useEngine();
  const { settings, update, reset } = useSettings();
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => update(key, value);
  const unlockedTrackIds = engine.state.unlockedBardTracks;
  const unlockedTracks = BARD_TRACKS.filter((t) => unlockedTrackIds.includes(t.id));

  return (
    <div className="tab-scene" style={{ backgroundImage: `url(${backgroundSrc('./lore/panels/settings.jpg', settings.backgroundMood)})` }}>
      <div className="tab-scene-content">
      <h2>Settings</h2>
      <p className="subtitle">Everything here is per-device and saved instantly. It never touches your guild's progress.</p>

      <div className="section-heading">Appearance</div>

      <Row label="Style" hint="Adventure is the original chunky look. Modern swaps in rounded pills and softer cards.">
        <Segmented
          value={settings.styleId}
          onChange={set('styleId')}
          options={[
            { label: 'Adventure', value: 'adventure' },
            { label: 'Modern', value: 'modern' },
          ]}
        />
      </Row>

      <Row label="Font" hint="Themed is pixel headings and monospace text. Readable swaps in a plain sans-serif for long descriptions.">
        <Segmented
          value={settings.fontId}
          onChange={set('fontId')}
          options={[
            { label: 'Themed', value: 'themed' },
            { label: 'Readable', value: 'readable' },
          ]}
        />
      </Row>

      {/* Guild's Mood (patch 0305, direct request) -- same Segmented shape
       *  as Style/Font just above, also asked once during first-time setup
       *  (GuildNamingModal) but revisitable anytime here, same as every
       *  other cosmetic choice on this panel. Swaps which art folder every
       *  tab/vendor/menu background reads from (see BackgroundMoodId's own
       *  comment) -- a tab with no Bright counterpart yet just keeps
       *  showing its dim image, so toggling this is always safe even while
       *  the Bright set is still being filled in. 'System' (patch 0309)
       *  picks Moody/Bright automatically off the player's own clock,
       *  6am-6pm counting as day -- resolveBackgroundMood/backgroundSrc
       *  in settings.ts do the actual resolution, this is just the third
       *  option that lets the raw setting be 'system' in the first
       *  place. */}
      <Row label="Guild's Mood" hint="Moody is candlelit halls and torchlit chambers. Bright swaps in sunlit daytime art for the same rooms. System switches automatically between the two, 6am-6pm counting as day.">
        <Segmented
          value={settings.backgroundMood}
          onChange={set('backgroundMood')}
          options={[
            { label: 'Moody', value: 'dim' },
            { label: 'Bright', value: 'bright' },
            { label: 'System', value: 'system' },
          ]}
        />
      </Row>

      <Row label="Theme" hint="Recolours the entire guild menu.">
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-swatch ${settings.theme === theme.id ? 'on' : ''}`}
              onClick={() => update('theme', theme.id)}
              title={theme.description}
            >
              <span className="theme-dots">
                <span style={{ background: theme.vars['--panel'] }} />
                <span style={{ background: theme.vars['--brass'] }} />
                <span style={{ background: theme.vars['--parchment'] }} />
                <span style={{ background: theme.vars['--moss'] }} />
              </span>
              {theme.name}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Text size" hint={`${Math.round(settings.fontScale * 100)}% of default`}>
        <input
          type="range" min={0.85} max={1.4} step={0.05}
          value={settings.fontScale}
          onChange={(e) => update('fontScale', Number(e.target.value))}
        />
      </Row>

      <Row label="Menu density" hint="How much breathing room cards get.">
        <Segmented
          value={settings.density}
          onChange={set('density')}
          options={[
            { label: 'Compact', value: 'compact' },
            { label: 'Cozy', value: 'cozy' },
            { label: 'Comfortable', value: 'comfortable' },
          ]}
        />
      </Row>

      <div className="section-heading">Knight</div>

      <Row label="Sprite size" hint={`${Math.round(settings.spriteScale * 100)}%`}>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <input
            type="range" min={0.75} max={1.75} step={0.05}
            value={settings.spriteScale}
            disabled={settings.hideHeroSprite}
            onChange={(e) => update('spriteScale', Number(e.target.value))}
          />
          <div className="sprite-preview">
            <HeroSprite heroClass="adventurer" animation="idle" height={Math.round(80 * settings.spriteScale)} />
          </div>
        </div>
      </Row>

      <Row label="Hero sprite" hint="Turns off the hero character on the corner companion. 'Open guild' still works either way.">
        <Toggle value={!settings.hideHeroSprite} onChange={(v) => set('hideHeroSprite')(!v)} />
      </Row>

      <Row label="Raid party view" hint="While a raid is active, shows the whole party running side by side on the corner companion instead of cycling through one hero at a time. The companion window widens to fit them.">
        <Toggle value={settings.raidPartyView} onChange={set('raidPartyView')} />
      </Row>

      <Row label="Status bars (roster)" hint="Replaces the Heroes tab's per-hero sprite cards with a compact list: name, status, and a progress bar for everyone at once, sorted soonest-finishing first.">
        <Toggle value={settings.heroStatusBars} onChange={set('heroStatusBars')} />
      </Row>

      <Row label="Status bars (corner companion)" hint="Replaces the corner companion's cycling hero sprite with the same sorted status list. Makes the companion window resizable while this is on, so the full roster can fit without scrolling.">
        <Toggle value={settings.idleStatusView} onChange={set('idleStatusView')} />
      </Row>

      <Row label="Pet size" hint={`${Math.round(settings.petSpriteScale * 100)}% -- affects the companion pet only, not the hero above`}>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <input
            type="range" min={0.5} max={2} step={0.05}
            value={settings.petSpriteScale}
            disabled={settings.hidePetSprite}
            onChange={(e) => update('petSpriteScale', Number(e.target.value))}
          />
          <div className="sprite-preview">
            <PetSprite species="ember_kit" animation="idle" height={Math.round(48 * settings.petSpriteScale)} fallback={<span>🦊</span>} />
          </div>
        </div>
      </Row>

      <Row label="Pet sprite" hint="Turns off the equipped pet's companion sprite on the corner companion.">
        <Toggle value={!settings.hidePetSprite} onChange={(v) => set('hidePetSprite')(!v)} />
      </Row>

      <Row label="Pet position" hint="Unlock the companion and drag the pet to move it. Resets it to the default spot beside the hero.">
        <button onClick={() => { update('petOffsetX', 0); update('petOffsetY', 0); }}>
          Reset pet position
        </button>
      </Row>

      <Row label="Hide companion info" hint="Hides the gold/level/name line, quest status, and away/raid/hatch banners under the corner sprite. The sprite, pet, and Open guild/lock/Hide buttons all stay -- click the sprite to open the guild the same as always.">
        <Toggle value={settings.hideIdleInfo} onChange={set('hideIdleInfo')} />
      </Row>

      <Row label="Animation speed" hint="Applies to the corner companion.">
        <Segmented
          value={settings.reduceMotion ? 0 : settings.animationSpeed}
          onChange={(v) => { update('reduceMotion', v === 0); if (v !== 0) update('animationSpeed', v); }}
          options={[
            { label: 'Off', value: 0 },
            { label: 'Slow', value: 0.5 },
            { label: 'Normal', value: 1 },
            { label: 'Fast', value: 1.5 },
          ]}
        />
      </Row>

      <Row label="Reduce motion" hint="Stops idle bobbing and transitions. Overrides animation speed.">
        <Toggle value={settings.reduceMotion} onChange={set('reduceMotion')} />
      </Row>

      <div className="section-heading">Sound</div>

      <Row label="Sound effects" hint="Quest outcomes, level-ups, drops, purchases.">
        <Toggle value={settings.soundEnabled} onChange={set('soundEnabled')} />
      </Row>

      <Row label="Volume" hint={`${Math.round(settings.soundVolume * 100)}%`}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <input
            type="range" min={0} max={1} step={0.05}
            value={settings.soundVolume}
            disabled={!settings.soundEnabled}
            onChange={(e) => update('soundVolume', Number(e.target.value))}
          />
          <button
            className="btn-ghost"
            disabled={!settings.soundEnabled}
            onClick={() => previewSound()}
            style={{ minHeight: 26, padding: '4px 10px' }}
          >
            Test
          </button>
        </div>
      </Row>

      <div className="section-heading">Music</div>

      <Row label="Background music" hint="Ambient track behind the guild menu -- fades in when you open it.">
        <Toggle value={settings.musicEnabled} onChange={set('musicEnabled')} />
      </Row>

      <Row label="Music volume" hint={`${Math.round(settings.musicVolume * 100)}%`}>
        <input
          type="range" min={0} max={1} step={0.05}
          value={settings.musicVolume}
          disabled={!settings.musicEnabled}
          onChange={(e) => update('musicVolume', Number(e.target.value))}
        />
      </Row>

      <Row label="Keep playing when minimized" hint="Off cuts the music the moment you close the guild menu. On leaves it running behind the idle companion.">
        <Toggle
          value={settings.musicContinuesWhenMinimized}
          onChange={set('musicContinuesWhenMinimized')}
          disabled={!settings.musicEnabled}
        />
      </Row>

      {/* Only shown once at least one bard track has actually been earned
          (a quest chain, a raid clear, an achievement, a win at Grimsby's
          table -- see achievements.json's unlocksTrackId) -- before that,
          "Guild Theme" is the only option there is, so a picker with
          nothing to pick between would just be clutter. */}
      {unlockedTracks.length > 0 && (
        <Row
          label="Track"
          hint={
            settings.selectedBardTrack === 'shuffle'
              ? 'A different unlocked track plays each day.'
              : 'Pick a specific track, or let the guild bard rotate through everything you\u2019ve unlocked.'
          }
        >
          <select
            value={settings.selectedBardTrack}
            disabled={!settings.musicEnabled}
            onChange={(e) => update('selectedBardTrack', e.target.value)}
          >
            <option value="default">Guild Theme</option>
            {unlockedTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="shuffle">Shuffle (daily)</option>
          </select>
        </Row>
      )}

      <div className="section-heading">Quality of life</div>

      <Row label="Offline summary on launch" hint="Show what happened while the app was closed.">
        <Toggle value={settings.offlineReportOnLaunch} onChange={set('offlineReportOnLaunch')} />
      </Row>

      <Row label="Quest result pop-ups" hint="Interrupt with a summary when a quest finishes.">
        <Toggle value={settings.questResultPopups} onChange={set('questResultPopups')} />
      </Row>

      <Row label="Confirm before retiring" hint="Retirement is permanent, so this is on by default.">
        <Toggle value={settings.confirmRetire} onChange={set('confirmRetire')} />
      </Row>

      <Row label="Confirm before selling gear">
        <Toggle value={settings.confirmSell} onChange={set('confirmSell')} />
      </Row>

      <div className="section-heading">Credits</div>
      <p className="small muted subtitle">
        Guildbound uses licensed art from a few outside creators. None of the terms below require
        credit, but it's given anyway.
      </p>
      <div className="credits-list">
        {CREDITS.map((c) => (
          <div key={c.id} className="card credits-entry">
            <div className="card-title">{c.category}</div>
            <div className="tiny muted">
              {c.packName || c.creator
                ? `${c.packName || 'Pack name pending'} \u2014 ${c.creator || 'creator pending'}`
                : 'Pack and creator name pending confirmation.'}
            </div>
            <p className="tiny muted" style={{ margin: '6px 0 0' }}>{c.licenseSummary}</p>
          </div>
        ))}
      </div>

      <div className="section-heading">Reset</div>
      <p className="small muted subtitle">Restores every setting above to its default. Your guild is untouched.</p>
      <button className="btn-ghost" onClick={reset}>Reset settings to defaults</button>
      </div>
    </div>
  );
}
