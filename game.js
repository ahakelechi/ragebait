(() => {
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

const banner = document.getElementById('banner');
const settingsPanel = document.getElementById('settingsPanel');
const attemptsEl = document.getElementById('attempts');
const checkpointEl = document.getElementById('checkpoint');
const timerEl = document.getElementById('timer');
const levelEl = document.getElementById('levelIndicator');

// ---------- Audio (tiny WebAudio bleeps, no assets needed) ----------
let actx;
function beep(freq, dur, type='square', vol=0.05) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol * Settings.volume;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch(e) {}
}
const sfx = {
  jump: () => beep(520, 0.1, 'square', 0.04),
  death: () => { beep(180, 0.18, 'sawtooth', 0.06); setTimeout(()=>beep(90,0.25,'sawtooth',0.06),90); },
  troll: () => { beep(300,0.06,'square',0.05); setTimeout(()=>beep(150,0.12,'square',0.05),70); },
  win: () => { [660,880,990,1320].forEach((f,i)=>setTimeout(()=>beep(f,0.15,'square',0.05), i*90)); },
  fake: () => { beep(1000,0.05,'triangle',0.05); setTimeout(()=>beep(220,0.2,'square',0.06),50); },
  checkpoint: () => { beep(700,0.06,'square',0.04); setTimeout(()=>beep(900,0.08,'square',0.04),60); },
  levelComplete: () => { [660,880,1100].forEach((f,i)=>setTimeout(()=>beep(f,0.13,'square',0.05), i*100)); }
};

// ---------- Palette (Neon defaults; theme presets overwrite the world-color
// fields below at runtime, hero-sprite colors stay constant across themes) ----------
const COL = {
  sky1: '#150a35', sky2: '#3a1f68', sky3: '#5c2a7a',
  mountainFar: '#2a1958', mountainNear: '#3f2270',
  castle: '#241448',
  cloud: '#ffffff22',
  ground: '#e0218a', groundDark: '#8c0f57', groundTop: '#ff5cb3',
  brick: '#c41876',
  platform: '#1fc2c9', platformDark: '#0a6b70', platformTop: '#8ff5f9',
  spike: '#ff4a4a', spikeDark: '#9c1f1f',
  skin: '#ffcf9e', skinShade: '#e0a878',
  tunic: '#ffe94a', tunicShade: '#c9a90f',
  cape: '#e0218a', capeShade: '#a10f66',
  boots: '#3a2a6d', hair: '#5c3a21',
  fakeplat: '#7de3ff',
  flag: '#3ee06b', flagPole: '#cfcfcf',
  fakeflag: '#3ee06b',
  text: '#ffffff'
};

function applyTheme(name) {
  const t = THEMES[name] || THEMES.neon;
  Object.assign(COL, t.col);
  for (const k in t.css) {
    document.documentElement.style.setProperty('--col-' + k, t.css[k]);
  }
  Settings.theme = name;
  saveSettings();
}

const deathQuips = [
  "You died. The kingdom thanks you for your donation.",
  "That platform was never your friend.",
  "Skill issue. Also, the game cheated. Both true.",
  "You have been eaten by lore.",
  "Nice jump. Shame about the floor.",
  "The invisible spike was always there. You just didn't believe hard enough.",
  "Achievement unlocked: Trust Issues.",
  "This is fine. Everything is fine.",
  "You pressed the winning button. It was a trap button.",
  "Rage quit detected. Respect.",
  "The platform was moving. You were not.",
  "It counted down. You did not count.",
];

// ---------- Run / level state ----------
let currentLevelIndex = 0;
let solids = LEVELS[currentLevelIndex].solids;
let LEVEL_WIDTH = LEVELS[currentLevelIndex].width;

// ---------- Player ----------
const player = {
  x: 20, y: GROUND_Y - 20, w: 14, h: 20,
  vx: 0, vy: 0,
  onGround: false,
  alive: true,
  reversed: false,
  reverseTimer: 0,
  facing: 1,
  walkPhase: 0,
  squash: 0, // 0 = normal, positive = squashed (landing), negative = stretched (jump)
  bob: 0,
  sprinting: false,
  standingOnMoveplat: null,
  coyoteTimer: 0,
};

let cameraX = 0;
let attempts = 1;
let startTime = performance.now();
let elapsed = 0;
let won = false;
let checkpointX = 20;
let checkpointName = 'START';
let shake = 0;
let bannerTimeout = null;
let vanished = new Set();       // fake/crumble tiles already triggered (per-level)
let crumbleState = new Map();   // crumble tile -> ms remaining before it vanishes
let fakecheckpointsSeen = new Set();
let deathFreeze = false;
let globalTime = 0;
let flashAlpha = 0;
let paused = false;
let practiceMode = false; // runtime-only, never persisted
let usedPractice = false;
let revealedHazard = null; // the specific hidden hazard that just killed you, shown during death freeze

function diffParams() { return DIFFICULTY_PARAMS[Settings.difficulty] || DIFFICULTY_PARAMS.mild; }
function togglespikeOn(t) { return Math.floor(t / diffParams().togglespikePeriod) % 2 === 0; }

// ---------- Particles ----------
let particles = [];
function spawnParticles(x, y, n, color, opts={}) {
  for (let i=0;i<n;i++) {
    particles.push({
      x, y,
      vx: (Math.random()-0.5) * (opts.spread || 1.4),
      vy: -(Math.random()*1.6) - (opts.up || 0.2),
      life: 1,
      decay: 0.025 + Math.random()*0.02,
      color: color,
      size: opts.size || (1 + Math.random()*2)
    });
  }
}
function updateParticles(step) {
  for (const p of particles) {
    p.x += p.vx*step; p.y += p.vy*step;
    p.vy += 0.12*step;
    p.life -= p.decay*step;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ---------- Input ----------
const keys = {};
const touchActions = { left:false, right:false, jump:false, sprint:false };

function computeActions() {
  const kb = Settings.keyBindings;
  return {
    left: keys['arrowleft'] || keys['a'] || keys[kb.left] || touchActions.left,
    right: keys['arrowright'] || keys['d'] || keys[kb.right] || touchActions.right,
    jump: keys['arrowup'] || keys['w'] || keys[' '] || keys[kb.jump] || touchActions.jump,
    sprint: keys['shift'] || keys[kb.sprint] || touchActions.sprint,
  };
}

window.addEventListener('keydown', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (e.key === ' ') e.preventDefault();
  if (!paused && (k === 'r' || k === Settings.keyBindings.restart)) restartLevel(true);
});
window.addEventListener('keyup', e => {
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  keys[e.key.toLowerCase()] = false;
});

// ---------- Responsive scaling ----------
const wrapEl = document.getElementById('wrap');
function fitToViewport() {
  const margin = 16;
  const naturalW = wrapEl.offsetWidth;
  const naturalH = wrapEl.offsetHeight;
  const availW = window.innerWidth - margin*2;
  const availH = window.innerHeight - margin*2;
  let scale = Math.min(availW / naturalW, availH / naturalH);
  if (Settings.scaleMode === 'pixel-perfect') scale = Math.max(1, Math.floor(scale));
  wrapEl.style.transform = 'scale(' + scale + ')';
}
window.addEventListener('resize', fitToViewport);
window.addEventListener('orientationchange', fitToViewport);
document.addEventListener('fullscreenchange', fitToViewport);

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
  else document.exitFullscreen().catch(()=>{});
}

// ---------- Touch controls ----------
if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
  document.body.classList.add('has-touch');
}
function bindTouchButton(el, actionName) {
  const set = v => e => { e.preventDefault(); touchActions[actionName] = v; };
  el.addEventListener('touchstart', set(true), {passive:false});
  el.addEventListener('touchend', set(false), {passive:false});
  el.addEventListener('touchcancel', set(false), {passive:false});
}
bindTouchButton(document.getElementById('btnLeft'), 'left');
bindTouchButton(document.getElementById('btnRight'), 'right');
bindTouchButton(document.getElementById('btnJump'), 'jump');
bindTouchButton(document.getElementById('btnSprint'), 'sprint');
document.getElementById('btnRestart').addEventListener('touchstart', e => {
  e.preventDefault();
  if (!paused) restartLevel(true);
});

function showBanner(msg, ms=1600) {
  settingsPanel.classList.remove('show');
  banner.textContent = msg;
  banner.classList.add('show');
  banner.style.left = '50%';
  banner.style.top = '40%';
  banner.style.transform = 'translate(-50%, -50%)';
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => banner.classList.remove('show'), ms);
}

function resetPlayerToCheckpoint() {
  player.x = checkpointX;
  player.y = GROUND_Y - 20;
  player.vx = 0; player.vy = 0;
  player.alive = true;
  player.reversed = false;
  player.reverseTimer = 0;
  player.standingOnMoveplat = null;
  vanished.clear();
  crumbleState.clear();
  fakecheckpointsSeen.clear();
  deathFreeze = false;
  revealedHazard = null;
}

function restartLevel(manual) {
  if (won) {
    // finished the game already - this is a fresh full replay
    currentLevelIndex = 0;
    solids = LEVELS[0].solids;
    LEVEL_WIDTH = LEVELS[0].width;
    levelEl.textContent = 'LEVEL: 1/' + LEVELS.length;
    startTime = performance.now();
    won = false;
  }
  checkpointX = 20;
  checkpointName = 'START';
  checkpointEl.textContent = 'CHECKPOINT: START';
  attempts++;
  attemptsEl.textContent = 'ATTEMPT: ' + attempts;
  usedPractice = false;
  resetPlayerToCheckpoint();
  if (manual) showBanner("Fine. Starting over. Again.", 1200);
}

function die(reason, hazard) {
  if (!player.alive || deathFreeze) return;
  if (practiceMode) {
    usedPractice = true;
    sfx.troll();
    showBanner("Would've killed you.\nPractice mode is on.", 700);
    resetPlayerToCheckpoint();
    return;
  }
  player.alive = false;
  deathFreeze = true;
  revealedHazard = hazard || null;
  shake = 14;
  sfx.death();
  spawnParticles(player.x+player.w/2, player.y+player.h/2, 16, '#ff4a4a', {spread:3, up:1, size:2.5});
  if (hazard) {
    spawnParticles(hazard.x+hazard.w/2, hazard.y+hazard.h/2, 14, '#ff4a4a', {spread:2.5, up:0.8, size:2.5});
  }
  attempts++;
  attemptsEl.textContent = 'ATTEMPT: ' + attempts;
  const quip = deathQuips[Math.floor(Math.random()*deathQuips.length)];
  showBanner((reason ? reason + "\n" : "") + quip, 1400);
  setTimeout(() => {
    resetPlayerToCheckpoint();
  }, 900);
}

function nextLevel() {
  currentLevelIndex++;
  const lvl = LEVELS[currentLevelIndex];
  solids = lvl.solids;
  LEVEL_WIDTH = lvl.width;
  checkpointX = 20;
  checkpointName = 'START';
  checkpointEl.textContent = 'CHECKPOINT: START';
  levelEl.textContent = 'LEVEL: ' + (currentLevelIndex+1) + '/' + LEVELS.length;
  resetPlayerToCheckpoint();
  sfx.levelComplete();
  flashAlpha = 1;
  showBanner('LEVEL ' + currentLevelIndex + ' COMPLETE', 1500);
}

// ---------- Leaderboard ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function boardRowsHtml(rows) {
  if (!rows.length) return '(no scores yet)<br>';
  return rows.map((r,i) => (i+1)+'. '+escapeHtml(r.name)+' — '+r.time.toFixed(1)+'s ('+r.attempts+' att)<br>').join('');
}

const DIFF_TIERS = ['easy', 'mild', 'hard'];
function difficultyTabsHtml(current, idPrefix) {
  return '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:4px;">' +
    DIFF_TIERS.map(d =>
      '<button class="rq-btn" type="button" data-diff="' + d + '" style="margin:0;padding:3px 7px;' +
      (d === current ? 'background:var(--col-active-bg);' : '') + '">' + d.toUpperCase() + '</button>'
    ).join('') + '</div>';
}

// viewed difficulty for the popup/live board - independent of Settings.difficulty
// (which is what you actually PLAY on), so you can browse other tiers' boards
// without changing your own game.
let viewDifficulty = Settings.difficulty;

function openLeaderboardOverlay() {
  settingsPanel.classList.remove('show');
  clearTimeout(bannerTimeout);
  banner.classList.add('show');
  banner.style.left = '50%'; banner.style.top = '40%'; banner.style.transform = 'translate(-50%, -50%)';

  const load = () => {
    const setContent = bodyHtml => {
      banner.innerHTML = difficultyTabsHtml(viewDifficulty) + '<b>TOP 10 (' + viewDifficulty.toUpperCase() + ')</b><br>' + bodyHtml +
        '<button id="closeBoardBtn" class="rq-btn" type="button">CLOSE</button>';
      document.getElementById('closeBoardBtn').onclick = () => banner.classList.remove('show');
      banner.querySelectorAll('button[data-diff]').forEach(btn => {
        btn.onclick = () => { viewDifficulty = btn.getAttribute('data-diff'); load(); };
      });
    };
    setContent('Loading...<br>');
    if (!window.__scores) { setContent('Leaderboard unavailable.<br>'); return; }
    window.__scores.top10(viewDifficulty)
      .then(rows => setContent(boardRowsHtml(rows)))
      .catch(() => setContent('Leaderboard unavailable.<br>'));
  };
  load();
}
document.getElementById('boardLink').addEventListener('click', openLeaderboardOverlay);

// ---------- Docked live leaderboard (periodic refresh, left/right dockable) ----------
const liveBoard = document.getElementById('liveBoard');
let liveBoardInterval = null;

function renderLiveBoardRows(rows) {
  liveBoard.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<b>LIVE TOP 10</b>' +
      '<button id="liveBoardFlip" class="rq-btn" type="button" style="padding:2px 5px;margin:0;">⇄</button>' +
    '</div>' +
    difficultyTabsHtml(viewDifficulty) +
    boardRowsHtml(rows) +
    '<button id="liveBoardClose" class="rq-btn" type="button" style="margin-top:4px;">HIDE</button>';
  document.getElementById('liveBoardFlip').onclick = flipLiveBoardSide;
  document.getElementById('liveBoardClose').onclick = hideLiveBoard;
  liveBoard.querySelectorAll('button[data-diff]').forEach(btn => {
    btn.onclick = () => { viewDifficulty = btn.getAttribute('data-diff'); refreshLiveBoard(); };
  });
}

async function refreshLiveBoard() {
  if (!window.__scores) { liveBoard.textContent = 'Leaderboard unavailable.'; return; }
  try {
    const rows = await window.__scores.top10(viewDifficulty);
    renderLiveBoardRows(rows);
  } catch (e) {
    liveBoard.textContent = 'Leaderboard unavailable.';
  }
}

function showLiveBoard() {
  viewDifficulty = Settings.difficulty;
  liveBoard.classList.add('show');
  liveBoard.classList.toggle('side-left', Settings.leaderboardSide === 'left');
  Settings.leaderboardVisible = true;
  saveSettings();
  refreshLiveBoard();
  if (liveBoardInterval) clearInterval(liveBoardInterval);
  liveBoardInterval = setInterval(refreshLiveBoard, 10000);
  fitToViewport();
}

function hideLiveBoard() {
  liveBoard.classList.remove('show');
  Settings.leaderboardVisible = false;
  saveSettings();
  if (liveBoardInterval) { clearInterval(liveBoardInterval); liveBoardInterval = null; }
  fitToViewport();
}

function flipLiveBoardSide() {
  Settings.leaderboardSide = Settings.leaderboardSide === 'left' ? 'right' : 'left';
  saveSettings();
  liveBoard.classList.toggle('side-left', Settings.leaderboardSide === 'left');
}

function toggleLiveBoard() {
  if (liveBoard.classList.contains('show')) hideLiveBoard();
  else showLiveBoard();
}
document.getElementById('liveBoardToggle').addEventListener('click', toggleLiveBoard);

function win() {
  if (won) return;
  won = true;
  sfx.win();
  showWinBanner();
}

function showWinBanner() {
  settingsPanel.classList.remove('show');
  banner.classList.add('show');
  banner.style.left = '50%'; banner.style.top = '40%'; banner.style.transform = 'translate(-50%, -50%)';
  clearTimeout(bannerTimeout);

  const header = '...wait, that was the REAL flag?<br>You actually made it.<br>' +
    'Time: ' + elapsed.toFixed(1) + 's over ' + attempts + ' attempt(s), on ' + Settings.difficulty.toUpperCase() + '.<br><br>';

  if (usedPractice) {
    banner.innerHTML = header + "Practice-mode runs aren't eligible for the leaderboard.";
    return;
  }

  const savedName = localStorage.getItem('rq_name') || '';
  banner.innerHTML = header +
    '<input id="nameInput" class="rq-input" maxlength="12" placeholder="name" value="' + escapeHtml(savedName) + '">' +
    '<button id="submitScoreBtn" class="rq-btn" type="button">SUBMIT</button>' +
    '<div id="scoreMsg" style="font-size:8px;margin-top:6px;min-height:10px;"></div>';

  document.getElementById('submitScoreBtn').onclick = async () => {
    const input = document.getElementById('nameInput');
    const name = (input.value || 'ANON').trim().slice(0,12) || 'ANON';
    localStorage.setItem('rq_name', name);
    const msg = document.getElementById('scoreMsg');
    if (!window.__scores) { msg.textContent = 'Leaderboard unavailable.'; return; }
    msg.textContent = 'Submitting...';
    const diff = Settings.difficulty;
    try {
      await window.__scores.submit(name, elapsed, attempts, diff);
      msg.textContent = 'Submitted!';
      const rows = await window.__scores.top10(diff);
      let html = '<br><b>TOP 10 (' + diff.toUpperCase() + ')</b><br>' + boardRowsHtml(rows);
      const inTop10 = rows.some(r => r.time === elapsed && r.attempts === attempts);
      if (!inTop10) {
        const rank = await window.__scores.rank(elapsed, diff);
        html += 'YOUR RANK: #' + rank + '<br>';
      }
      banner.insertAdjacentHTML('beforeend', html);
    } catch (e) {
      msg.textContent = 'Leaderboard unavailable.';
    }
  };
}

// ---------- Settings panel ----------
function closeSettingsPanel() {
  settingsPanel.classList.remove('show');
  paused = false;
  if (rebindListener) { window.removeEventListener('keydown', rebindListener, true); rebindListener = null; }
}

function keyLabel(k) { return k === ' ' ? 'SPACE' : k.toUpperCase(); }

let rebindListener = null;
function startRebind(action) {
  const span = document.getElementById('kb-' + action);
  span.textContent = 'PRESS A KEY...';
  if (rebindListener) window.removeEventListener('keydown', rebindListener, true);
  rebindListener = e => {
    e.preventDefault();
    e.stopPropagation();
    Settings.keyBindings[action] = e.key.toLowerCase();
    saveSettings();
    window.removeEventListener('keydown', rebindListener, true);
    rebindListener = null;
    renderSettingsPanel();
  };
  window.addEventListener('keydown', rebindListener, true);
}

const ACTION_ROWS = [['left','LEFT'], ['right','RIGHT'], ['jump','JUMP'], ['sprint','SPRINT'], ['restart','RESTART']];

function renderSettingsPanel() {
  const rebindRows = ACTION_ROWS.map(([key,label]) =>
    '<div class="rq-row"><label>' + label + '</label>' +
    '<span id="kb-' + key + '">' + keyLabel(Settings.keyBindings[key]) + '</span>' +
    '<button class="rq-btn" type="button" data-action="' + key + '">REBIND</button></div>'
  ).join('');

  settingsPanel.innerHTML =
    '<b>SETTINGS</b>' +
    '<div class="rq-row"><label>Display</label><button id="fsBtn" class="rq-btn" type="button">FULLSCREEN</button></div>' +
    '<div class="rq-row"><label>Scale mode</label><select id="scaleModeSel" class="rq-select">' +
      '<option value="fit">FIT SCREEN</option><option value="pixel-perfect">PIXEL-PERFECT</option></select></div>' +
    '<div class="rq-row"><label>Theme</label><select id="themeSel" class="rq-select">' +
      '<option value="neon">NEON</option><option value="toxic">TOXIC</option><option value="mono">MONO</option></select></div>' +
    '<div class="rq-row"><label>Difficulty</label><select id="difficultySel" class="rq-select">' +
      '<option value="easy">EASY</option><option value="mild">MILD</option><option value="hard">HARD</option></select></div>' +
    '<div class="rq-row"><label>Volume</label><input id="volSlider" type="range" min="0" max="100" value="' + Math.round(Settings.volume*100) + '"></div>' +
    rebindRows +
    '<div class="rq-row"><label>Practice mode</label><input id="practiceCk" type="checkbox" ' + (practiceMode ? 'checked' : '') + '></div>' +
    '<button id="closeSettingsBtn" class="rq-btn" type="button" style="margin-top:8px;">CLOSE</button>';

  document.getElementById('scaleModeSel').value = Settings.scaleMode;
  document.getElementById('themeSel').value = Settings.theme;
  document.getElementById('difficultySel').value = Settings.difficulty;

  document.getElementById('fsBtn').onclick = toggleFullscreen;
  document.getElementById('scaleModeSel').onchange = e => { Settings.scaleMode = e.target.value; saveSettings(); fitToViewport(); };
  document.getElementById('themeSel').onchange = e => applyTheme(e.target.value);
  document.getElementById('difficultySel').onchange = e => { Settings.difficulty = e.target.value; saveSettings(); };
  document.getElementById('volSlider').oninput = e => { Settings.volume = e.target.value/100; saveSettings(); };
  document.getElementById('practiceCk').onchange = e => { practiceMode = e.target.checked; };
  document.getElementById('closeSettingsBtn').onclick = closeSettingsPanel;
  ACTION_ROWS.forEach(([key]) => {
    settingsPanel.querySelector('button[data-action="'+key+'"]').onclick = () => startRebind(key);
  });
}

function openSettingsPanel() {
  clearTimeout(bannerTimeout);
  banner.classList.remove('show');
  paused = true;
  renderSettingsPanel();
  settingsPanel.style.left = '50%';
  settingsPanel.style.top = '50%';
  settingsPanel.style.transform = 'translate(-50%, -50%)';
  settingsPanel.classList.add('show');
}
document.getElementById('settingsLink').addEventListener('click', openSettingsPanel);

// ---------- Collision helpers ----------
function aabb(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

const REF_FRAME_MS = 1000/60;

function update(dt) {
  if (paused) return;
  if (won) return;
  if (!player.alive) return; // frozen during death banner

  // step = elapsed time in units of "one reference frame at 60fps". All
  // per-frame velocity/decay constants below were tuned assuming ~60fps, so
  // scaling their application by step keeps real-world speed correct even if
  // the browser is only managing a lower frame rate. Clamped so a stall (tab
  // throttled, GC pause) can't make the player tunnel through a wall in one jump.
  const step = Math.min(dt, 50) / REF_FRAME_MS;

  // moving platforms: advance position, carry the player if they were standing on one
  for (const s of solids) {
    if (s.type !== 'moveplat') continue;
    if (s.axis === 'y') {
      const newY = s.baseY + Math.sin(globalTime * s.speed) * s.range;
      s._dy = newY - s.y; s.y = newY; s._dx = 0;
    } else {
      const newX = s.baseX + Math.sin(globalTime * s.speed) * s.range;
      s._dx = newX - s.x; s.x = newX; s._dy = 0;
    }
  }
  if (player.standingOnMoveplat) {
    player.x += player.standingOnMoveplat._dx;
    player.y += player.standingOnMoveplat._dy;
  }
  player.standingOnMoveplat = null;

  // input
  const act = computeActions();
  let left = act.left;
  let right = act.right;
  let jump = act.jump;
  let sprint = act.sprint;

  if (player.reversed) { const t = left; left = right; right = t; }

  const SPEED = sprint ? 3.0 : 1.6;
  const GRAV = 0.35;
  const JUMP_V = sprint ? -7.1 : -6.6;
  const FRICTION = 0.8;

  if (left) player.vx = -SPEED;
  else if (right) player.vx = SPEED;
  else player.vx *= Math.pow(FRICTION, step);

  if (left) player.facing = -1;
  else if (right) player.facing = 1;
  player.sprinting = sprint && player.onGround && Math.abs(player.vx) > 1.5;

  if (player.sprinting && Math.random() < 0.5) {
    spawnParticles(player.x + (player.facing>0?0:player.w), player.y + player.h - 2, 1, '#ffffff66', {spread:0.3, up:0.1, size:1.5});
  }

  // coyote time: brief grace window to still jump just after walking off an edge
  if (player.onGround) player.coyoteTimer = diffParams().coyoteMs;
  else player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);

  if (jump && (player.onGround || player.coyoteTimer > 0)) {
    player.vy = JUMP_V;
    player.onGround = false;
    player.coyoteTimer = 0;
    player.squash = -3;
    sfx.jump();
    spawnParticles(player.x + player.w/2, player.y + player.h, 5, '#ffffff88', {spread:1.2, up:0.4, size:2});
  }

  player.vy += GRAV * step;
  if (player.vy > 9) player.vy = 9;

  // horizontal move + collide
  player.x += player.vx * step;
  player.onGround = false;

  for (const s of solids) {
    if (!isSolidNow(s)) continue;
    if (aabb(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h)) {
      if (player.vx > 0) player.x = s.x - player.w;
      else if (player.vx < 0) player.x = s.x + s.w;
      player.vx = 0;
    }
  }

  // vertical move + collide
  player.y += player.vy * step;
  for (const s of solids) {
    if (!isSolidNow(s)) continue;
    if (aabb(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h)) {
      if (player.vy > 0) {
        player.y = s.y - player.h;
        player.vy = 0;
        player.onGround = true;
        if (s.type === 'moveplat') player.standingOnMoveplat = s;
        onLand(s);
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
        player.vy = 0;
      }
    }
  }

  // hazards & special zones (non-solid overlap checks)
  for (const s of solids) {
    const overlap = aabb(player.x, player.y, player.w, player.h, s.x, s.y, s.w, s.h);
    if (!overlap) continue;
    if (s.type === 'spike') { die("Spikes. Visible ones. You had one job."); return; }
    if (s.type === 'hiddenspike') { sfx.troll(); die("A hidden spike. The developer is sorry (lying).", s); return; }
    if (s.type === 'togglespike' && togglespikeOn(globalTime)) { sfx.troll(); die("Timed spikes. You watched it happen and still walked in.", s); return; }
    if (s.type === 'fakeflag') { sfx.fake(); die("Fake flag! Classic. The real one is further right.", s); return; }
    if (s.type === 'flag') {
      if (currentLevelIndex < LEVELS.length - 1) { nextLevel(); return; }
      win();
      return;
    }
    if (s.type === 'reverserzone') {
      player.reversed = true;
      player.reverseTimer = 2200;
    }
    if (s.type === 'fakecheckpoint' && !fakecheckpointsSeen.has(s)) {
      fakecheckpointsSeen.add(s);
      sfx.fake();
      showBanner("Nice try. That's not a checkpoint.", 1200);
    }
    if (s.type === 'checkpoint') {
      if (checkpointX !== s.x + 4 && s.name !== checkpointName) {
        checkpointX = s.x + 4;
        checkpointName = s.name;
        checkpointEl.textContent = 'CHECKPOINT: ' + s.name;
        showBanner("Checkpoint: " + s.name, 900);
        sfx.checkpoint();
        spawnParticles(player.x+player.w/2, player.y+player.h/2, 10, COL.tunic, {spread:1.6, up:0.6, size:2});
      }
    }
  }

  // crumbling platforms: tick countdown, vanish when it hits zero
  for (const [s, t] of crumbleState) {
    const nt = t - dt;
    if (nt <= 0) {
      vanished.add(s);
      crumbleState.delete(s);
      sfx.fake();
      shake = Math.max(shake, 6);
      spawnParticles(s.x + s.w/2, s.y + s.h/2, 10, '#ff5cb3', {spread:2, size:2});
    } else {
      crumbleState.set(s, nt);
    }
  }

  if (player.reverseTimer > 0) {
    player.reverseTimer -= dt;
    if (player.reverseTimer <= 0) player.reversed = false;
  }

  // fall death
  if (player.y > H + 60) { die("Gravity wins again."); return; }

  // camera
  cameraX = Math.max(0, Math.min(LEVEL_WIDTH - W, player.x - W/2));

  elapsed = (performance.now() - startTime) / 1000;
  timerEl.textContent = 'TIME: ' + elapsed.toFixed(1) + 's';

  if (shake > 0) shake *= Math.pow(0.85, step);
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt/120);

  // walk cycle + squash/stretch + idle bob
  if (player.onGround && Math.abs(player.vx) > 0.15) {
    player.walkPhase += Math.abs(player.vx) * (player.sprinting ? 0.55 : 0.35) * step;
  } else if (player.onGround) {
    player.bob = Math.sin(globalTime / 220) * 1;
  }
  if (!player.onGround) player.bob = 0;
  player.squash *= Math.pow(0.8, step);
  globalTime += dt;

  updateParticles(step);
}

function isSolidNow(s) {
  if (s.type === 'ground' || s.type === 'plat' || s.type === 'moveplat') return true;
  if (s.type === 'bounce') return true;
  if (s.type === 'fake' || s.type === 'crumble') return !vanished.has(s);
  return false;
}

function onLand(s) {
  if (s.type === 'fake' && !vanished.has(s)) {
    vanished.add(s);
    sfx.fake();
    shake = 6;
    spawnParticles(player.x+player.w/2, player.y+player.h, 10, '#ff5cb3', {spread:2, size:2});
  }
  if (s.type === 'crumble' && !vanished.has(s) && !crumbleState.has(s)) {
    crumbleState.set(s, diffParams().crumbleMs);
    shake = Math.max(shake, 3);
  }
  if (s.type === 'bounce') {
    player.vy = -11;
    player.squash = -4;
    sfx.jump();
    spawnParticles(player.x+player.w/2, player.y+player.h, 8, '#8ff5f9', {spread:1.6, size:2});
  }
  if (player.vy === 0 && s.type !== 'fake' && s.type !== 'bounce' && s.type !== 'crumble') {
    player.squash = 2.5;
    if (Math.abs(player.vx) < 3) spawnParticles(player.x+player.w/2, player.y+player.h, 3, '#ffffff55', {spread:0.8, size:1.5});
  }
}

// ---------- Rendering ----------
function drawSpikes(x,y,w,h,color,dark) {
  const n = Math.max(1, Math.floor(w / 10));
  const sw = w / n;
  ctx.fillStyle = dark;
  for (let i=0;i<n;i++) {
    ctx.beginPath();
    ctx.moveTo(x + i*sw, y+h);
    ctx.lineTo(x + i*sw + sw/2, y);
    ctx.lineTo(x + i*sw + sw, y+h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  for (let i=0;i<n;i++) {
    ctx.beginPath();
    ctx.moveTo(x + i*sw+2, y+h);
    ctx.lineTo(x + i*sw + sw/2, y+3);
    ctx.lineTo(x + i*sw + sw-2, y+h);
    ctx.closePath();
    ctx.fill();
  }
}

function roundedCloud(x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x, y, w*0.5, h, 0, 0, Math.PI*2);
  ctx.ellipse(x-w*0.3, y+h*0.3, w*0.3, h*0.7, 0, 0, Math.PI*2);
  ctx.ellipse(x+w*0.3, y+h*0.3, w*0.35, h*0.7, 0, 0, Math.PI*2);
  ctx.fill();
}

function drawMountainRow(offset, baseY, peakW, peakH, seed) {
  const startI = Math.floor(offset / peakW) - 1;
  for (let i = startI; i < startI + Math.ceil(W/peakW) + 3; i++) {
    const h = peakH * (0.6 + 0.4 * Math.abs(Math.sin(i*12.9898*seed)));
    const x = i*peakW - (offset % peakW);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + peakW/2, baseY - h);
    ctx.lineTo(x + peakW, baseY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCastle(offset, baseY) {
  const x0 = -(offset % 900) - 900;
  for (let base = x0; base < W + 900; base += 900) {
    const bx = base + 900*0;
    for (let t=0; t<3; t++) {
      const tx = bx + 60 + t*70;
      const th = 45 + (t%2)*20;
      ctx.fillRect(tx, baseY - th, 22, th);
      for (let c=0;c<3;c++) ctx.fillRect(tx + c*8, baseY - th - 6, 5, 6);
    }
    ctx.fillRect(bx + 40, baseY - 30, 170, 30);
  }
}

function drawGroundTile(s) {
  ctx.fillStyle = COL.groundDark;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = COL.groundTop;
  ctx.fillRect(s.x, s.y, s.w, 5);
  ctx.fillStyle = COL.brick;
  const bw = 16, bh = 8;
  for (let row = 0; row * bh < s.h - 5; row++) {
    const offset = (row % 2 === 0) ? 0 : bw/2;
    for (let bx = -offset; bx < s.w; bx += bw) {
      const rx = s.x + bx, ry = s.y + 6 + row*bh;
      if (rx + bw < s.x || rx > s.x + s.w) continue;
      const cx = Math.max(rx, s.x), cw = Math.min(rx+bw-2, s.x+s.w) - cx;
      if (cw > 0 && ry + bh - 2 < s.y + s.h) ctx.fillRect(cx, ry, cw, bh-2);
    }
  }
}

function drawPlatTile(s) {
  ctx.fillStyle = COL.platformDark;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = COL.platformTop;
  ctx.fillRect(s.x, s.y, s.w, 3);
  ctx.fillStyle = COL.platform;
  ctx.fillRect(s.x, s.y+3, s.w, s.h-3);
  ctx.fillStyle = COL.platformDark;
  for (let rx = s.x+4; rx < s.x+s.w-2; rx += 12) ctx.fillRect(rx, s.y+s.h-4, 2, 2);
}

function drawCheckpointFlag(x, y) {
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(x, y-22, 2, 22);
  const wave = Math.sin(globalTime/180) * 2;
  ctx.fillStyle = '#ffe94a';
  ctx.beginPath();
  ctx.moveTo(x+2, y-22);
  ctx.lineTo(x+14+wave, y-18);
  ctx.lineTo(x+2, y-13);
  ctx.closePath();
  ctx.fill();
}

function render() {
  ctx.save();
  const sx = (Math.random()-0.5) * shake;
  const sy = (Math.random()-0.5) * shake;
  ctx.clearRect(0,0,W,H);

  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, COL.sky1);
  g.addColorStop(0.6, COL.sky2);
  g.addColorStop(1, COL.sky3);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  for (let i=0;i<50;i++) {
    const px = ((i*97) - cameraX*0.05) % (W+40);
    const py = (i*41) % (H*0.55);
    const tw = 0.3 + 0.3 * Math.abs(Math.sin(globalTime/500 + i));
    ctx.fillStyle = `rgba(255,255,255,${tw})`;
    ctx.fillRect(((px+W+40)%(W+40)), py, 1.5, 1.5);
  }

  ctx.fillStyle = COL.cloud;
  for (let i=0;i<8;i++) {
    const cw = 40 + (i%3)*14;
    const px = ((i*260 + globalTime*0.01) - cameraX*0.15) % (W+cw*2) - cw;
    const py = 20 + (i*37)%70;
    roundedCloud(px, py, cw, 10);
  }

  ctx.fillStyle = COL.mountainFar;
  drawMountainRow(cameraX*0.25, 150, 90, 55, 1);

  ctx.fillStyle = COL.castle;
  drawCastle(cameraX*0.4, 178);

  ctx.fillStyle = COL.mountainNear;
  drawMountainRow(cameraX*0.5, 175, 70, 40, 2);

  ctx.translate(-cameraX + sx, sy);

  for (const s of solids) {
    switch (s.type) {
      case 'ground':
        drawGroundTile(s);
        if (s.checkpoint) drawCheckpointFlag(s.x+6, s.y);
        break;
      case 'fake':
        if (!vanished.has(s)) drawGroundTile(s);
        break;
      case 'crumble':
        if (!vanished.has(s)) drawPlatTile(s);
        break;
      case 'moveplat':
        drawPlatTile(s);
        break;
      case 'plat':
        drawPlatTile(s);
        if (s.checkpoint) drawCheckpointFlag(s.x+6, s.y);
        break;
      case 'bounce':
        ctx.fillStyle = '#3ee06b';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#1f8a45';
        ctx.fillRect(s.x, s.y+s.h-3, s.w, 3);
        break;
      case 'spike':
        drawSpikes(s.x, s.y, s.w, s.h, COL.spike, COL.spikeDark);
        break;
      case 'hiddenspike': {
        // invisible until it's the one that just killed you - then it reveals itself
        // so death always has visible proof, never an unexplained "you just died".
        // On Easy, a faint telegraph outline is always shown (beginner mercy).
        const ha = diffParams().hiddenAlpha;
        if (s === revealedHazard) {
          drawSpikes(s.x, s.y, s.w, s.h, COL.spike, COL.spikeDark);
        } else if (ha > 0) {
          ctx.globalAlpha = ha;
          drawSpikes(s.x, s.y, s.w, s.h, COL.spike, COL.spikeDark);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'togglespike':
        ctx.globalAlpha = togglespikeOn(globalTime) ? 1 : 0.25;
        drawSpikes(s.x, s.y, s.w, s.h, COL.spike, COL.spikeDark);
        ctx.globalAlpha = 1;
        break;
      case 'fakecheckpoint':
        drawCheckpointFlag(s.x, s.y);
        break;
      case 'reverserzone':
        ctx.fillStyle = '#e0218a55';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#ffe94a';
        ctx.font = '7px monospace';
        ctx.fillText('?', s.x+6, s.y+14);
        break;
      case 'flag':
        ctx.fillStyle = COL.flagPole;
        ctx.fillRect(s.x, s.y, 3, s.h);
        ctx.fillStyle = COL.flag;
        ctx.beginPath();
        ctx.moveTo(s.x+3, s.y+4);
        ctx.lineTo(s.x+22, s.y+10);
        ctx.lineTo(s.x+3, s.y+16);
        ctx.closePath();
        ctx.fill();
        break;
      case 'fakeflag':
        ctx.fillStyle = COL.flagPole;
        ctx.fillRect(s.x, s.y, 3, s.h);
        ctx.fillStyle = COL.fakeflag;
        ctx.beginPath();
        ctx.moveTo(s.x+3, s.y+4);
        ctx.lineTo(s.x+22, s.y+10);
        ctx.lineTo(s.x+3, s.y+16);
        ctx.closePath();
        ctx.fill();
        break;
      default: break; // 'gap' renders nothing (that's the pit)
    }
  }

  drawParticles();
  if (player.alive) drawHero();

  ctx.restore();

  if (flashAlpha > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + flashAlpha + ')';
    ctx.fillRect(0,0,W,H);
  }
}

function drawHero() {
  const cx = player.x + player.w/2;
  const groundY = player.y + player.h;

  if (player.sprinting) {
    ctx.strokeStyle = '#ffe94a99';
    ctx.lineWidth = 1.5;
    for (let i=0;i<3;i++) {
      const ly = player.y + 4 + i*6;
      const lx = player.facing > 0 ? player.x - 2 - i*3 : player.x + player.w + 2 + i*3;
      const len = 5 + i*2;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx - player.facing*len, ly);
      ctx.stroke();
    }
  }

  ctx.save();
  const stretch = player.squash;
  const scaleY = 1 - stretch*0.04;
  const scaleX = 1 + stretch*0.04;
  const bob = player.bob;

  ctx.translate(cx, groundY + bob);
  ctx.scale(player.facing * scaleX, scaleY);

  const legSwing = player.onGround ? Math.sin(player.walkPhase) * 3.2 : 0;
  const airTuck = !player.onGround ? -2 : 0;

  const capeFlap = Math.sin(globalTime/120) * 2 + (player.onGround ? 0 : 3);
  ctx.fillStyle = COL.capeShade;
  ctx.beginPath();
  ctx.moveTo(-3, -18);
  ctx.lineTo(-7 - capeFlap, -6);
  ctx.lineTo(-6 - capeFlap*0.6, -1);
  ctx.lineTo(-3, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COL.boots;
  ctx.fillRect(-3, -8 + airTuck, 4, 8 - legSwing*0.5);
  ctx.fillRect(1, -8 + airTuck, 4, 8 + legSwing*0.5);

  ctx.fillStyle = COL.tunicShade;
  ctx.fillRect(-5, -19, 10, 12);
  ctx.fillStyle = COL.tunic;
  ctx.fillRect(-5, -19, 10, 8);
  ctx.fillStyle = COL.boots;
  ctx.fillRect(-5, -10, 10, 2);

  ctx.fillStyle = COL.skinShade;
  const armSwing = player.onGround ? -legSwing : (player.vy < 0 ? -4 : 2);
  ctx.fillRect(4, -17, 3, 7 + armSwing*0.3);
  ctx.fillStyle = COL.skin;
  ctx.fillRect(-6, -17, 3, 7 - armSwing*0.3);

  ctx.fillStyle = COL.skin;
  ctx.fillRect(-5, -27, 10, 9);
  ctx.fillStyle = COL.hair;
  ctx.fillRect(-5, -28, 10, 3);
  ctx.fillRect(-6, -26, 2, 5);
  ctx.fillStyle = '#1b1140';
  ctx.fillRect(2, -23, 2, 2);

  ctx.restore();
}

let last = performance.now();
function loop(now) {
  const dt = now - last;
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

applyTheme(Settings.theme);
levelEl.textContent = 'LEVEL: 1/' + LEVELS.length;
resetPlayerToCheckpoint();
showBanner("Good luck. You'll need it.\n(Press R to give up gracefully.)", 2200);
if (Settings.leaderboardVisible) showLiveBoard();
fitToViewport();
requestAnimationFrame(loop);
})();
