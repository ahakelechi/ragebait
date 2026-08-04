// ---------- Themes ----------
// css: CSS custom-property suffixes (--col-<key>) applied to :root.
// col: fields merged into the canvas COL palette (world/env colors only -
// the hero sprite's own colors stay constant across themes so the character
// stays recognizable).
const THEMES = {
  neon: {
    css: {
      bg:'#0d0221', accent:'#ffe94a', accent2:'#e0218a', accent3:'#1fc2c9', subtitle:'#7de3ff',
      'frame-grad-1':'#3a2a6d', 'frame-grad-2':'#1b1140', 'canvas-bg':'#1b1140', 'controls-text':'#9a8cc7',
      glow:'#e0218a99', 'hud-span-bg':'#0d022199', 'hud-span-border':'#ffe94a44', 'banner-bg':'#000000cc',
      'banner-text':'#ffffff', 'active-bg':'#e0218a55', 'input-border':'#ffe94a88'
    },
    col: {
      sky1:'#150a35', sky2:'#3a1f68', sky3:'#5c2a7a', mountainFar:'#2a1958', mountainNear:'#3f2270',
      castle:'#241448', cloud:'#ffffff22', ground:'#e0218a', groundDark:'#8c0f57', groundTop:'#ff5cb3',
      brick:'#c41876', platform:'#1fc2c9', platformDark:'#0a6b70', platformTop:'#8ff5f9',
      spike:'#ff4a4a', spikeDark:'#9c1f1f', flag:'#3ee06b', flagPole:'#cfcfcf', fakeflag:'#3ee06b', text:'#ffffff'
    }
  },
  toxic: {
    css: {
      bg:'#0a0f0a', accent:'#c6ff4a', accent2:'#7a2ee6', accent3:'#39ff9d', subtitle:'#9dffb0',
      'frame-grad-1':'#2a3a1f', 'frame-grad-2':'#0f1b0f', 'canvas-bg':'#0f1b0f', 'controls-text':'#7a9a7a',
      glow:'#7a2ee699', 'hud-span-bg':'#0a0f0a99', 'hud-span-border':'#c6ff4a44', 'banner-bg':'#000000cc',
      'banner-text':'#ffffff', 'active-bg':'#7a2ee655', 'input-border':'#c6ff4a88'
    },
    col: {
      sky1:'#0a1f0a', sky2:'#1f3a1f', sky3:'#2a5c3a', mountainFar:'#18321f', mountainNear:'#224a2a',
      castle:'#142414', cloud:'#ffffff22', ground:'#7a2ee6', groundDark:'#4a1a90', groundTop:'#a35cff',
      brick:'#5c1eb8', platform:'#39ff9d', platformDark:'#0f8a4e', platformTop:'#a8ffcf',
      spike:'#ff4a4a', spikeDark:'#9c1f1f', flag:'#c6ff4a', flagPole:'#cfcfcf', fakeflag:'#c6ff4a', text:'#ffffff'
    }
  },
  mono: {
    css: {
      bg:'#000000', accent:'#ffffff', accent2:'#aaaaaa', accent3:'#ffffff', subtitle:'#cccccc',
      'frame-grad-1':'#333333', 'frame-grad-2':'#111111', 'canvas-bg':'#111111', 'controls-text':'#999999',
      glow:'#ffffff66', 'hud-span-bg':'#00000099', 'hud-span-border':'#ffffff66', 'banner-bg':'#000000ee',
      'banner-text':'#ffffff', 'active-bg':'#ffffff33', 'input-border':'#ffffff88'
    },
    col: {
      sky1:'#050505', sky2:'#1a1a1a', sky3:'#2e2e2e', mountainFar:'#141414', mountainNear:'#222222',
      castle:'#0a0a0a', cloud:'#ffffff22', ground:'#ffffff', groundDark:'#888888', groundTop:'#eeeeee',
      brick:'#bbbbbb', platform:'#cccccc', platformDark:'#666666', platformTop:'#eeeeee',
      spike:'#ff3333', spikeDark:'#881111', flag:'#33ff33', flagPole:'#eeeeee', fakeflag:'#33ff33', text:'#ffffff'
    }
  }
};

// ---------- Difficulty tiers ----------
// 'mild' is exactly today's existing tuned balance (zero change) - 'easy' softens
// it for beginners, 'hard' tightens it further. Each score submission is tagged
// with the difficulty it was played on, and leaderboards are kept separate per tier.
const DIFFICULTY_PARAMS = {
  easy: { hiddenAlpha: 0.35, coyoteMs: 120, togglespikePeriod: 1300, crumbleMs: 550 },
  mild: { hiddenAlpha: 0,    coyoteMs: 0,   togglespikePeriod: 900,  crumbleMs: 400 },
  hard: { hiddenAlpha: 0,    coyoteMs: 0,   togglespikePeriod: 600,  crumbleMs: 250 }
};

// ---------- Persisted settings ----------
// practiceMode is intentionally NOT persisted here - it's runtime-only (see game.js)
// so a forgotten toggle from a past session can never silently block a future
// leaderboard submission.
const DEFAULT_SETTINGS = {
  volume: 0.6,
  scaleMode: 'fit', // 'fit' | 'pixel-perfect'
  theme: 'neon',
  difficulty: 'mild', // 'easy' | 'mild' | 'hard'
  keyBindings: { left: 'arrowleft', right: 'arrowright', jump: ' ', sprint: 'shift', restart: 'r' },
  leaderboardVisible: false,
  leaderboardSide: 'right' // 'left' | 'right'
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('rq_settings');
    if (!raw) throw new Error('none saved');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...(parsed.keyBindings || {}) }
    };
  } catch (e) {
    return { ...DEFAULT_SETTINGS, keyBindings: { ...DEFAULT_SETTINGS.keyBindings } };
  }
}

const Settings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem('rq_settings', JSON.stringify({
      volume: Settings.volume,
      scaleMode: Settings.scaleMode,
      theme: Settings.theme,
      difficulty: Settings.difficulty,
      keyBindings: Settings.keyBindings,
      leaderboardVisible: Settings.leaderboardVisible,
      leaderboardSide: Settings.leaderboardSide
    }));
  } catch (e) {}
}
