/**
 * User settings — deliberately separate from the game save.
 *
 * Settings are per-device and cosmetic. They must never ride along in the game
 * save, because a player's font size on their laptop has nothing to do with
 * their guild's progress, and because game saves will eventually sync through
 * Steam Cloud across machines where local display preferences shouldn't follow.
 *
 * This module is versioned like the save, with the same forgiving merge, so a
 * settings file from an older build never crashes the UI.
 */

export const SETTINGS_VERSION = 1;

export type ThemeId = 'candlelit' | 'midnight' | 'parchment' | 'forest' | 'high_contrast' | 'daylight';

/**
 * 'adventure' is the original chunky/pixel look (square corners, brass edges).
 * 'modern' is a softer, rounded-pill overlay for people who find the adventure
 * look busy on a desktop — same layout and data, different chrome. Driven
 * entirely by CSS (see [data-style='modern'] in app.css), so it needs no
 * per-component changes.
 */
export type StyleId = 'adventure' | 'modern';

/**
 * 'themed' keeps the pixel display face and monospace body text -- the
 * original tavern look. 'readable' swaps both --font-display and --font-body
 * for a standard system sans-serif via [data-font='readable'] in app.css,
 * for anyone who finds long quest/lore text harder to read in monospace.
 * Independent of styleId on purpose -- style is chrome (corners, pills),
 * this is purely typeface, and the two shouldn't be forced to change
 * together.
 */
export type FontId = 'themed' | 'readable';

/**
 * Optional backing plate behind the whole idle companion -- off by default
 * so nobody's current look changes without opting in. Deliberately a plain
 * background fill with no padding or outset shadow/outline: this is a
 * small floating Electron window likely sized tight to its content, so
 * anything drawn past the existing box risks silently getting clipped by
 * the window bounds. 'subtle' softly lifts the character off a busy
 * desktop; 'strong' is a real bordered panel for guaranteed readability
 * regardless of wallpaper.
 */
export type CompanionBackdropId = 'off' | 'subtle' | 'strong';

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  /** CSS custom properties applied to :root. */
  vars: Record<string, string>;
}

export interface Settings {
  version: number;

  /** Root font size in px; every rem-based measure scales from this. */
  fontScale: number;          // 0.85 – 1.5, 1.35 = default (the old 1 read small on a desktop)
  /** Multiplier on the corner companion and menu hero sprites. */
  spriteScale: number;        // 0.75 – 1.75
  /** Multiplier on the equipped pet's companion sprite -- independent of
   *  spriteScale, since a pet and a hero don't need to grow together. */
  petSpriteScale: number;     // 0.5 – 2
  /** Companion pet's dragged position offset from its default spot, in px
   *  relative to the default anchor -- set by dragging the pet while the
   *  companion is unlocked (see IdleView.tsx), (0,0) is the default
   *  position. Persisted here rather than game state since, like every
   *  other display setting, it's a per-device preference, not guild
   *  progress. */
  petOffsetX: number;
  petOffsetY: number;
  /** Menu density: tightens or loosens padding across cards and panels. */
  density: 'compact' | 'cozy' | 'comfortable';

  theme: ThemeId;
  /** Visual chrome: chunky pixel 'adventure' or rounded-pill 'modern'. */
  styleId: StyleId;
  /** Typeface: pixel/monospace 'themed', or a plain sans-serif 'readable'. */
  fontId: FontId;
  /** Optional backing plate behind the idle companion, for readability over busy wallpaper. */
  companionBackdrop: CompanionBackdropId;
  /**
   * Hides the idle companion's informational text -- the gold/level/name
   * plate, quest-status line, "+N more at the guild" hint, and the away/
   * chain-complete/raid-result/hatch-ready banners -- while the sprite,
   * the "Open guild"/lock/"Hide" action row, and the pet companion all
   * stay exactly as they are. Direct request: a way to declutter the
   * corner companion down to just the sprite and controls, without
   * losing the ability to open the guild, relock/reposition it, or
   * minimize it -- clicking the sprite itself still opens the guild menu
   * either way, same as always.
   */
  hideIdleInfo: boolean;

  /** Hides the corner companion's hero sprite (and its click-to-open
   *  button/carousel arrows) entirely -- the "Open guild" button in
   *  idle-actions still opens the menu either way, so this doesn't
   *  remove any functionality, just the character art. Independent of
   *  hidePetSprite below -- a player might want the pet showing without
   *  the hero, or vice versa. */
  hideHeroSprite: boolean;
  /** Same idea as hideHeroSprite, for the equipped pet's own companion
   *  button. Doesn't affect petSpriteScale/petOffsetX/Y below -- those
   *  stay as-is so the pet reappears at its last configured size/spot
   *  the moment this is turned back off. */
  hidePetSprite: boolean;
  /**
   * Shows the whole raid party as a row of running sprites on the corner
   * companion for as long as a raid is active, replacing the normal
   * single-hero carousel for the duration (see IdleView.tsx's own
   * showRaidPartyView). On by default -- additive cosmetic flavour, same
   * "opt-out, not opt-in" precedent hideHeroSprite/hidePetSprite already
   * set for sprite toggles in this file, rather than a new feature nobody
   * discovers because it defaulted off. Standard sprite size regardless
   * of party size (3-9 heroes depending on raid difficulty) -- the
   * companion window widens to fit them instead of the sprites shrinking
   * to fit a fixed window, direct design call. No separate scale control
   * for this yet; a follow-up if a 9-wide Legendary party turns out to
   * need one in practice.
   */
  raidPartyView: boolean;

  /**
   * Replaces the per-hero sprite thumbnail on the Heroes roster (Guild
   * Hall) with a compact status-bar row for every hero instead: name,
   * current status (questing/raiding/harvesting/injured/idle), and a
   * progress bar showing percent complete + time remaining. Off by
   * default -- the sprite grid is the existing, familiar view; this is an
   * alternate density/info trade-off, not a strict upgrade for everyone.
   * Independent of hideHeroSprite above, which only affects the corner
   * companion, not the roster.
   */
  heroStatusBars: boolean;
  /**
   * Same status-bar-list treatment as heroStatusBars above, but for the
   * corner companion window instead of the roster: replaces the single
   * cycling hero sprite (and Raid View, if that's also on) with the same
   * sorted status list. Because a plain list needs more room than the
   * companion's normal tiny fixed footprint to be readable without
   * scrolling, turning this on also makes the companion window
   * resizable for as long as it's on (see electron/main.ts's
   * `window:setIdleDisplay` handler) -- dragging it back down small is
   * fine, nothing is lost, the list just becomes more cramped. Off by
   * default, same reasoning as heroStatusBars.
   */
  idleStatusView: boolean;

  /** Animation speed multiplier; 0 disables idle bobbing entirely. */
  animationSpeed: number;     // 0, 0.5, 1, 1.5

  /** Show the "while you were away" modal on launch. */
  offlineReportOnLaunch: boolean;
  /** Pop the quest-result modal when a quest finishes while watching. */
  questResultPopups: boolean;
  /** Require a confirm dialog before retiring a hero. */
  confirmRetire: boolean;
  /** Require a confirm dialog before selling equipment. */
  confirmSell: boolean;
  /** Reduce motion for accessibility (overrides animationSpeed to 0). */
  reduceMotion: boolean;

  /** Master switch for all sound cues. */
  soundEnabled: boolean;
  /** 0 - 1. */
  soundVolume: number;

  /** Master switch for the background music track (separate from
   *  soundEnabled, which only gates the short synthesized SFX cues). */
  musicEnabled: boolean;
  /** 0 - 1. Deliberately quiet by default -- ambience behind the guild
   *  menu, not a soundtrack moment fighting for attention. See
   *  MusicManager.enterGuildMenu's own comment for the fade-in. */
  musicVolume: number;
  /** Off by default: closing the guild menu (back to the idle companion)
   *  cuts the music immediately. Turning this on leaves it playing
   *  uninterrupted instead. */
  musicContinuesWhenMinimized: boolean;
  /**
   * Which track actually plays -- 'default' (the always-free ambient
   * track, same one that's always played until now), 'shuffle' (a new
   * pick once per real day, see music.ts's resolveTrackSrc), or a
   * specific BardTrack id earned as a quest/raid/achievement/Grimsby
   * reward (state.unlockedBardTracks). Purely a playback preference
   * (which of the player's already-earned tracks is currently selected),
   * not save-relevant progress -- lives here alongside musicEnabled/
   * musicVolume rather than in GameState, same reasoning that section's
   * own subtitle already draws. Falls back to 'default' automatically if
   * it ever points at a track the guild doesn't actually have unlocked
   * (see resolveTrackSrc).
   */
  selectedBardTrack: string;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  fontScale: 1.35,
  spriteScale: 1,
  petSpriteScale: 1,
  petOffsetX: 0,
  petOffsetY: 0,
  density: 'compact',
  theme: 'high_contrast',
  styleId: 'adventure',
  fontId: 'readable',
  companionBackdrop: 'off',
  hideIdleInfo: false,
  hideHeroSprite: false,
  hidePetSprite: false,
  raidPartyView: true,
  heroStatusBars: false,
  idleStatusView: false,
  animationSpeed: 1,
  offlineReportOnLaunch: true,
  questResultPopups: true,
  confirmRetire: true,
  confirmSell: false,
  reduceMotion: false,
  soundEnabled: true,
  soundVolume: 0.5,
  musicEnabled: true,
  musicVolume: 0.18,
  musicContinuesWhenMinimized: false,
  selectedBardTrack: 'default',
};

/* --------------------------------- themes --------------------------------- */

export const THEMES: Theme[] = [
  {
    id: 'candlelit',
    name: 'Candlelit Hall',
    description: 'The default. Deep plum shadow, oiled parchment, brass.',
    vars: {
      '--night': '#171320', '--panel': '#221c2e', '--panel-2': '#2b2338',
      '--panel-3': '#362c46', '--edge': '#0e0b14', '--parchment': '#f3e6c8',
      '--muted': '#a294b5', '--brass': '#d9a441', '--brass-dim': '#8c6a2a',
      '--moss': '#79a86b', '--blood': '#a33a3a', '--sky': '#5b8fd6', '--violet': '#a874d6',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Watch',
    description: 'Cooler and darker. Easy on the eyes at 2am.',
    vars: {
      '--night': '#0d1017', '--panel': '#151a24', '--panel-2': '#1c2330',
      '--panel-3': '#27303f', '--edge': '#070a0f', '--parchment': '#dbe4f0',
      '--muted': '#7e8aa0', '--brass': '#6ea8d8', '--brass-dim': '#3a6a92',
      '--moss': '#5fa88f', '--blood': '#c85c6a', '--sky': '#6ea8d8', '--violet': '#9a8fd6',
    },
  },
  {
    id: 'parchment',
    name: 'Old Parchment',
    description: 'A light theme. Ink on aged paper.',
    vars: {
      '--night': '#e8dcc0', '--panel': '#f1e7cf', '--panel-2': '#e6d9ba',
      '--panel-3': '#d8c8a2', '--edge': '#b7a172', '--parchment': '#3a2f22',
      '--muted': '#7a6a4e', '--brass': '#9a6b1e', '--brass-dim': '#c9a350',
      '--moss': '#5a7d3e', '--blood': '#9a3226', '--sky': '#3f6ea8', '--violet': '#7a4fa0',
    },
  },
  {
    id: 'forest',
    name: 'Deep Forest',
    description: 'Mossy greens and warm lantern light.',
    vars: {
      '--night': '#12180f', '--panel': '#1b2416', '--panel-2': '#232f1c',
      '--panel-3': '#2f3d26', '--edge': '#0a0e08', '--parchment': '#ece6cf',
      '--muted': '#9aa585', '--brass': '#d9a441', '--brass-dim': '#8c6a2a',
      '--moss': '#8fbf6f', '--blood': '#c0603a', '--sky': '#6fa8b0', '--violet': '#b088c0',
    },
  },
  {
    id: 'high_contrast',
    name: 'High Contrast',
    description: 'Maximum legibility, near-black. Doubles as a clean dark mode.',
    vars: {
      '--night': '#000000', '--panel': '#101014', '--panel-2': '#18181f',
      '--panel-3': '#26262f', '--edge': '#000000', '--parchment': '#ffffff',
      '--muted': '#c0c0cc', '--brass': '#ffcc44', '--brass-dim': '#c99a1e',
      '--moss': '#66d466', '--blood': '#ff6b6b', '--sky': '#66b8ff', '--violet': '#c88fff',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Near-white and neutral, closer to a stock desktop app than a tavern.',
    vars: {
      '--night': '#f4f5f7', '--panel': '#ffffff', '--panel-2': '#f0f1f4',
      '--panel-3': '#e2e4e9', '--edge': '#c7cad1', '--parchment': '#20232a',
      '--muted': '#5b616e', '--brass': '#a5670f', '--brass-dim': '#8a5510',
      '--moss': '#2f7d4f', '--blood': '#c22f3d', '--sky': '#1f6fc9', '--violet': '#7346c7',
    },
  },
];

export const THEME_BY_ID: Record<ThemeId, Theme> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
) as Record<ThemeId, Theme>;

export const DENSITY_PADDING: Record<Settings['density'], string> = {
  compact: '6px 8px',
  cozy: '10px 12px',
  comfortable: '14px 18px',
};

/** Numeric multiplier for gaps, button padding, and section spacing — density
 * used to only touch .card padding, which was too narrow to actually notice. */
export const DENSITY_SCALE: Record<Settings['density'], number> = {
  compact: 0.7,
  cozy: 1,
  comfortable: 1.35,
};

/* ------------------------------- persistence ------------------------------ */

/**
 * Patch 0266: renamed alongside the app.setName('little-knight') ->
 * 'guildbound' change in electron/main.ts, for consistency. Unlike the
 * actual save file (see that file's migrateLegacySaveFolder(), which
 * copies a real JSON file across userData folders on disk), there is no
 * equivalent migration here: this is Chromium's own localStorage, backed
 * by a leveldb store physically scoped to the OLD userData folder, not a
 * plain file this codebase can just fs.copyFile() into the new one. The
 * practical result, accepted rather than solved: an existing player's
 * cosmetic UI prefs (theme, density, font scale, reduce-motion) reset to
 * default the first time they launch a post-0266 build, the same one time
 * their game save does NOT reset, since that path has real migration.
 * Cosmetic-only and one-time, not worth the complexity of hand-reading a
 * second-origin leveldb store to avoid.
 */
const KEY = 'guildbound-settings';

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2 would go here when the shape next changes.
};

/**
 * Reads the OS/browser's `prefers-reduced-motion` accessibility preference,
 * used only to pick a sensible *default* for a brand-new save's
 * `reduceMotion` setting -- never checked again after that. This used to
 * also be enforced directly and unconditionally in CSS
 * (`@media (prefers-reduced-motion: reduce) { *, *::before, *::after {
 * animation-duration: 0.001ms !important; ... } }`), which was a real bug,
 * not a redundant safety net: that rule applied regardless of what the
 * in-game Animation Speed / Reduce Motion controls were set to, so a player
 * on a system reporting this preference (a genuinely common default on
 * some platforms, and not always chosen for a reason that has anything to
 * do with wanting *this* game's cosmetic animations suppressed) would see
 * every animation in the app -- Harvest's fall-in, the quest-completion
 * particle burst, all of it -- collapse to near-zero duration no matter
 * what Settings actually showed, with no way to turn it back on from
 * inside the game. That's likely the real explanation for the
 * long-standing "animations play instantly, root cause unknown" issue.
 * Respecting the OS preference as the *starting point* for a new player,
 * while leaving the in-game setting as the one actual source of truth from
 * then on (see `apply` below, which is now the only place motion gets
 * turned off), keeps the accessibility intent without permanently
 * overriding an explicit in-game choice to turn animations back on.
 */
function prefersReducedMotionByDefault(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export const SettingsStore = {
  load(): Settings {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT_SETTINGS, reduceMotion: prefersReducedMotionByDefault() };
      let parsed = JSON.parse(raw) as Record<string, unknown>;
      let version = typeof parsed.version === 'number' ? parsed.version : 1;
      while (version < SETTINGS_VERSION && MIGRATIONS[version]) {
        parsed = MIGRATIONS[version](parsed);
        version = typeof parsed.version === 'number' ? parsed.version : version + 1;
      }
      // Merge over defaults so a missing key never yields undefined.
      return { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>), version: SETTINGS_VERSION };
    } catch {
      return { ...DEFAULT_SETTINGS, reduceMotion: prefersReducedMotionByDefault() };
    }
  },

  save(settings: Settings): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage full or unavailable: settings simply won't persist */
    }
  },

  /**
   * Applies settings to the document root as CSS variables and data-attributes.
   * The stylesheet reads these, so nothing else in the app needs to know about
   * fonts, themes, or density.
   */
  apply(settings: Settings): void {
    const root = document.documentElement;
    const theme = THEME_BY_ID[settings.theme] ?? THEME_BY_ID.high_contrast;
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value);
    }
    root.style.setProperty('--font-scale', String(settings.fontScale));
    root.style.setProperty('--sprite-scale', String(settings.spriteScale));
    root.style.setProperty('--card-pad', DENSITY_PADDING[settings.density]);
    root.style.setProperty('--density-scale', String(DENSITY_SCALE[settings.density]));

    const motion = settings.reduceMotion ? 0 : settings.animationSpeed;
    root.style.setProperty('--anim-speed', String(motion));
    // A base font-size on the root makes every rem unit scale at once.
    root.style.fontSize = `${16 * settings.fontScale}px`;
    root.dataset.theme = settings.theme;
    root.dataset.style = settings.styleId;
    root.dataset.font = settings.fontId;
    root.dataset.companionBackdrop = settings.companionBackdrop;
    root.dataset.motion = motion === 0 ? 'off' : 'on';
  },
};
