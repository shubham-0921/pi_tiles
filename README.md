# Pi Tiles

A full-screen slider for a Raspberry Pi 3B+ (1 GB) running Chromium in kiosk mode. It rotates through a Clock and your own web dashboards, each shown in an iframe. Plain HTML/CSS/ES modules, no build step.

## How it behaves

- **Ambient mode**: auto-advances through widgets (per-widget `durationSeconds`), looping back to the Clock.
- **Interactive mode**: any interaction pauses rotation. After `idleTimeoutSeconds` the slider returns to the Clock and resumes.
- **Bottom bar**: one pill per widget. The active pill has a progress line that freezes while paused; a badge shows the idle countdown. Tap a pill to jump.
- **Edge swipes**: 40 px transparent zones on the left/right edges navigate prev/next. Swipes inside an iframe belong to the site.
- **Memory**: only one iframe exists at a time. It is created after its slide settles and removed (`src=about:blank`, then `remove()`) when the slide leaves.
- **States**: loading skeleton → ready; "Couldn't load X" + Retry after 15 s of silence; "Sign in needed…" on `auth-required` (widget is skipped in rotation until it reports ready, e.g. after a manual visit and Retry).
- **Auto-refresh**: the iframe reloads every `refreshMinutes`, only while it is the active slide and the user is not interacting.
- **Night mode**: a flat translucent layer dims everything between `nightMode.start` and `end`.

## Layout

```
index.html  styles.css
js/rotation-engine.js   pure ambient<->interactive state machine (no DOM, no timers)
js/slider.js            transform-only slide transitions + edge swipe zones
js/widgets.js           clock + iframe widget controllers (lifecycle, states)
js/messaging.js         postMessage bridge with origin checks
js/config.js            widgets.json loader / normaliser
js/night.js             night-window check
js/main.js              wiring + a single 500 ms timer
tests/                  engine tests (Node or browser)
deploy/                 systemd unit + labwc autostart
widgets.example.json    committed template; copy to widgets.json (gitignored)
```

## Develop on desktop Chrome

```sh
cp widgets.example.json widgets.json     # then put your real keys in
python3 -m http.server 8080 --bind 127.0.0.1
# open http://localhost:8080/?cursor&speed=10
```

Dev query params: `?cursor` shows the mouse cursor (hidden by default), `?speed=10` runs all rotation/idle timers 10× faster.

Tests: `npm test` (Node ≥ 18) or open `http://localhost:8080/tests/` for the browser runner.

The page must be served from `http://localhost:*` (not `file://`) because your apps only allow framing from there.

## widgets.json

```json
{
  "idleTimeoutSeconds": 75,
  "nightMode": { "start": "23:00", "end": "07:00" },
  "widgets": [
    { "id": "clock", "name": "Clock", "icon": "🕐", "type": "clock", "durationSeconds": 20, "refreshMinutes": 0, "inRotation": true },
    { "id": "bolkar", "name": "Bolkar", "icon": "🎙", "type": "iframe", "url": "https://…", "durationSeconds": 20, "refreshMinutes": 10, "inRotation": true }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | unique key |
| `name`, `icon` | pill label (emoji) |
| `type` | `"clock"` or `"iframe"` |
| `url` | iframe URL (iframe only) |
| `durationSeconds` | time on screen in ambient mode (default 20) |
| `refreshMinutes` | reload interval; `0` = off |
| `inRotation` | `false` = reachable by tap/swipe only |

The Clock is always slide 0 and always in rotation. If `widgets.json` is missing, the loader falls back to `widgets.example.json`.

**Adding a widget:** add an `iframe` entry, make sure the app allows framing from `http://localhost:8080` (`Content-Security-Policy: frame-ancestors http://localhost:*`, no `X-Frame-Options: DENY`), and add the snippet below to the app.

## App-side messaging

Touches inside an iframe never reach the parent, so apps should tell Pi Tiles what is going on:

```js
if (window.parent !== window) {
  const send = (type) =>
    parent.postMessage({ source: 'pi-tiles', type }, 'http://localhost:8080');

  send('ready');                                   // once the UI has rendered
  let last = 0;
  const poke = () => {                             // throttled interaction ping
    const now = Date.now();
    if (now - last > 1000) { last = now; send('interaction'); }
  };
  addEventListener('pointerdown', poke, true);
  addEventListener('scroll', poke, true);
  // when the session is gone:  send('auth-required');
}
```

Pi Tiles only accepts messages whose `event.origin` is the origin of a configured widget URL **and** whose `event.source` is the currently loaded iframe.

Fallback if an app sends nothing: when the parent window `blur`s while an iframe slide is active (a tap gave the iframe focus), Pi Tiles treats it as interaction and hands focus back so the next tap is detected too. This only catches the first tap after focus changes, so apps should still send `interaction` pings for scrolling and long sessions.

## Raspberry Pi setup (Raspberry Pi OS Bookworm 64-bit, with desktop)

1. **Copy the project** to `/home/pi/pi-tiles` (adjust the user/path in the service file if different):
   ```sh
   rsync -av --exclude .git --exclude node_modules ./ pi@raspberrypi.local:/home/pi/pi-tiles/
   ```
   Put your real `widgets.json` there (it is not in git).

2. **Enable zram swap** and drop the SD-card swap file:
   ```sh
   sudo apt update && sudo apt install -y zram-tools
   sudo sed -i 's/^#\?ALGO=.*/ALGO=lz4/; s/^#\?PERCENT=.*/PERCENT=50/' /etc/default/zramswap
   sudo systemctl enable --now zramswap
   sudo systemctl disable --now dphys-swapfile
   swapon --show        # should list /dev/zram0
   ```

3. **Disable screen blanking**:
   ```sh
   sudo raspi-config nonint do_blanking 1      # 1 = blanking off
   ```
   (or `sudo raspi-config` → Display Options → Screen Blanking → No)

4. **Static server as a systemd service** (bound to localhost only, so `widgets.json` isn't exposed to the network):
   ```sh
   sudo cp /home/pi/pi-tiles/deploy/pi-tiles.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now pi-tiles
   curl -sI http://localhost:8080 | head -1     # HTTP/1.0 200 OK
   ```

5. **Chromium kiosk autostart** (labwc):
   ```sh
   mkdir -p ~/.config/labwc
   cat /home/pi/pi-tiles/deploy/labwc-autostart >> ~/.config/labwc/autostart
   ```
   Older images use `chromium-browser` instead of `chromium`; edit the command accordingly. Make sure desktop autologin is on (`raspi-config` → System Options → Boot / Auto Login → Desktop Autologin).

6. **Cursor**: the page hides it with CSS (`cursor: none`), which covers Chromium kiosk. Touch input on Wayland shows no cursor anyway.

7. **Third-party cookies** (the Trace widget needs them): in Chromium open `chrome://settings/cookies` and choose **Allow third-party cookies**. Because the app is framed from `localhost` while living on `vercel.app`, its session cookie must be set with `SameSite=None; Secure`, otherwise Chromium won't send it inside the iframe regardless of the setting.

8. **First-time login** (Google blocks its sign-in page inside iframes; the "Sign in needed" screen has an **Open in browser** button that opens the app in a normal window): before enabling kiosk mode (or after `pkill chromium`), open the Trace URL **directly** in a normal Chromium window, sign in with Google, then close it and start kiosk mode (`reboot`). Do the same for any app that reports `auth-required`.

Reboot and you should land on the Clock.

## Not yet verified on real hardware

The engine is covered by tests, but memory use, the blur-based interaction fallback on a touchscreen, `raspi-config` blanking flag, and zram-tools defaults have not been exercised on a Pi 3B+. Check `free -m` and `chrome://process-internals` after a day of rotation.
