# Rage Quest: Responsive Display + Global Leaderboard

## Goal

Make the game playable at any viewport size (phone/tablet/desktop) and add a global,
shared leaderboard of fastest win times, without adding a build step — everything
still lives in `index.html` plus one tiny config addition, deployed as-is to GitHub Pages.

## 1. Responsive display

The internal game/draw resolution stays fixed at 480x270 (no changes to `update()`,
collision, or `render()` coordinate math). Responsiveness is purely a presentation
layer on top:

- A `resize()` function computes `scale = min(availableWidth / wrapWidth, availableHeight / wrapHeight)`
  where `wrapWidth`/`wrapHeight` are the natural (unscaled) pixel size of `#wrap`
  (title + HUD + framed canvas + controls text, as laid out today).
- Applies `transform: scale(s)` with `transform-origin: center top` to `#wrap`.
- Recomputed on `resize` and `orientationchange` events.
- Non-integer scale factors may soften the pixel-art slightly on the canvas; accepted
  trade-off (common technique, most touch devices are high-DPI enough it isn't visible).

### Touch controls

- Detected via `('ontouchstart' in window) || navigator.maxTouchPoints > 0`.
- When true, an absolutely-positioned button overlay renders under the canvas inside
  `#wrap`: **LEFT**, **RIGHT**, **JUMP**, **SPRINT** (hold), **RESTART** (tap, maps to `R`).
- Each button's `touchstart`/`touchend` sets/clears the same `keys[...]` flags the
  keyboard handler already uses (`keys['arrowleft']`, `keys['arrowright']`, `keys[' ']`,
  `keys['shift']`) — `update()` needs zero changes, it already reads from `keys`.
- Buttons only render (CSS `display`) on touch-capable devices; desktop is unaffected.

## 2. Global leaderboard

### Data

Firestore collection `scores`, one doc per submission:

```
{ name: string (1-12 chars), time: number (seconds), attempts: number, ts: serverTimestamp }
```

- Submitted **only** on an actual win (real flag), never on fake-flag deaths.
- Ranking metric: lowest `time` wins. `attempts` is shown alongside as a flavor stat,
  not used for ranking (per your answer: fastest win time is the leaderboard metric).

### Client flow

1. On `win()`, the existing banner gains an inline `<input maxlength=12>` + submit button
   asking for a name, pre-filled from `localStorage` if a name was entered before (just
   a convenience default, not a login — resubmission always shows the field so the player
   can change it).
2. Submit writes one doc to `scores` via the Firebase modular SDK (loaded via CDN ES
   module imports directly in `index.html`, no bundler/build step).
3. After submit (or via a "LEADERBOARD" button always visible in the start banner /
   HUD corner), a panel queries `scores` ordered by `time` ascending, `limit(10)`, and
   renders name/time/attempts rows in the existing pixel-art banner style.

### Firebase project

Project `ragebait-high-scores` already created by the user; config values:

```js
const firebaseConfig = {
  apiKey: "AIzaSyBQt0Le1HCyLmwz5cAizDyyzFE3jKYEXB0",
  authDomain: "ragebait-high-scores.firebaseapp.com",
  projectId: "ragebait-high-scores",
  storageBucket: "ragebait-high-scores.firebasestorage.app",
  messagingSenderId: "899908365454",
  appId: "1:899908365454:web:54ead3f26d456e79e1eddf",
  measurementId: "G-98ZM3XGR14"
};
```

These values are meant to be public (client-embedded); access control is entirely via
Firestore security rules, not key secrecy.

### Security rules (already provided to user to paste in console)

- `read`: public.
- `create`: only if the doc has exactly the four expected fields, `name` is a string of
  length 1-12, `time` is a number in `(0, 100000)`, `attempts` is a number >= 1, and `ts`
  equals the server request time (prevents backdating).
- `update`/`delete`: always denied — scores are append-only.

### Accepted trade-off: no anti-cheat

Since this is a static client with no backend of our own, a player can open devtools
and write a fabricated fast time directly to Firestore (the security rules validate
*shape*, not *truth*). Closing this needs Cloud Functions or App Check, which is real
added complexity not justified for a joke rage-platformer. Explicitly accepted, not an
oversight.

## Error handling

- If Firebase fails to initialize or a write/read fails (offline, quota, blocked
  script), the leaderboard panel shows "Leaderboard unavailable" instead of throwing —
  the game itself must remain fully playable with zero dependency on network/Firebase
  being reachable.

## Testing

- Manual only (no test framework in this project): resize the browser window and
  rotate an emulated mobile viewport to confirm scaling/letterboxing; use touch
  emulation to confirm the four buttons drive the player correctly; submit a win and
  confirm the score appears in the Firestore console and in the in-game leaderboard
  panel.

## Out of scope

- User accounts/auth, personal best tracking, pagination beyond top 10, anti-cheat
  server validation, sound/haptic feedback on touch buttons beyond what already exists.
