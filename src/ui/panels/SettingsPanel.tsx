import type { ReactNode } from 'react';
import { useSettings } from '../useSettings';
import { HeroSprite } from '../sprites/HeroSprite';
import { Settings, THEMES } from '../../game/settings';
import { previewSound } from '../../game/sound';

/* ------------------------------ small controls ---------------------------- */

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${value ? 'on' : ''}`}
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    >
      <span className="knob" />
    </button>
  );
}

/* --------------------------------- panel ---------------------------------- */

export function SettingsPanel() {
  const { settings, update, reset } = useSettings();
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => update(key, value);

  return (
    <>
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
            onChange={(e) => update('spriteScale', Number(e.target.value))}
          />
          <div className="sprite-preview">
            <HeroSprite heroClass="adventurer" animation="idle" height={Math.round(80 * settings.spriteScale)} />
          </div>
        </div>
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

      <div className="section-heading">Reset</div>
      <p className="small muted">Restores every setting above to its default. Your guild is untouched.</p>
      <button className="btn-ghost" onClick={reset}>Reset settings to defaults</button>
    </>
  );
}
