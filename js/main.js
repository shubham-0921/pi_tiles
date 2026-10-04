import { loadConfig } from './config.js';
import { createRotationEngine } from './rotation-engine.js';
import { createSlider, attachSwipeZones } from './slider.js';
import { createClockWidget, createIframeWidget } from './widgets.js';
import { allowedOrigins, attachMessaging } from './messaging.js';
import { isNight } from './night.js';

const TICK_MS = 500;
const params = new URLSearchParams(location.search);
const SPEED = Number(params.get('speed')) || 1; // ?speed=10 fast-forwards timers (desktop testing)
if (params.has('cursor')) document.body.classList.add('show-cursor');

const $ = (sel) => document.querySelector(sel);

async function boot() {
  const config = await loadConfig();
  const { widgets } = config;
  const engine = createRotationEngine({
    widgets,
    idleTimeoutSeconds: config.idleTimeoutSeconds,
  });

  // --- slides + widget controllers
  const slideEls = widgets.map(() => document.createElement('section'));
  const controllers = widgets.map((w, i) =>
    w.type === 'clock'
      ? createClockWidget(slideEls[i])
      : createIframeWidget(slideEls[i], w, {
          onReady: () => engine.setSkipped(w.id, false),
          onAuthRequired: () => engine.setSkipped(w.id, true),
        }),
  );
  const slider = createSlider($('#stage'), slideEls);
  const clock = controllers[0];
  controllers[0].activate();

  // --- pill bar
  const pills = widgets.map((w, i) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill';
    pill.innerHTML = '<span class="pill-icon"></span><span class="pill-name"></span><span class="fill"></span>';
    pill.querySelector('.pill-icon').textContent = w.icon;
    pill.querySelector('.pill-name').textContent = w.name;
    pill.addEventListener('click', () => engine.goTo(i));
    $('#bar').appendChild(pill);
    return { el: pill, fill: pill.querySelector('.fill') };
  });

  // Fullscreen toggle (hidden once fullscreen, and on the Pi where kiosk is already full screen)
  const fs = document.createElement('button');
  fs.type = 'button';
  fs.id = 'fs';
  fs.setAttribute('aria-label', 'Full screen');
  fs.textContent = '⛶';
  fs.addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => {}));
  $('#bar').appendChild(fs);
  const syncFs = () => {
    const full = !!document.fullscreenElement || window.innerHeight >= screen.height - 1;
    fs.hidden = full || !document.fullscreenEnabled;
  };
  document.addEventListener('fullscreenchange', syncFs);
  window.addEventListener('resize', syncFs);
  syncFs();

  const badge = $('#pause-badge');
  const dim = $('#dim');
  let activePill = -1;

  function render() {
    const s = engine.getState();
    if (s.index !== activePill) {
      if (activePill >= 0) pills[activePill].el.classList.remove('active');
      pills[s.index].el.classList.add('active');
      activePill = s.index;
    }
    const next = widgets[s.nextIndex];
    clock.setNext(s.nextIndex === s.index ? '' : `up next: ${next.icon} ${next.name}`);
    pills[s.index].fill.style.transform = `scaleX(${s.progress})`;

    if (s.mode === 'interactive') {
      badge.hidden = false;
      badge.textContent = `⏸ ${Math.ceil(s.idleRemainingMs / 1000)}s`;
    } else {
      badge.hidden = true;
    }
  }

  // --- engine events -> slider + widget lifecycle
  engine.subscribe((e) => {
    if (e.type === 'mode') render();
    if (e.type !== 'slide') return;
    controllers[e.from].deactivate();
    slider.show(e.to, e.direction, () => {
      // Create the iframe only after the slide has settled, and only if still current.
      if (engine.getState().index === e.to) controllers[e.to].activate();
    });
    render();
  });

  // --- interaction sources
  const interact = () => engine.interact();
  document.addEventListener('pointerdown', interact, true);
  document.addEventListener('keydown', interact, true);
  document.addEventListener('wheel', interact, { capture: true, passive: true });

  attachSwipeZones(document.querySelectorAll('.swipe-zone'), {
    onPrev: () => engine.prev(),
    onNext: () => engine.next(),
  });

  // postMessage from apps inside iframes
  attachMessaging({
    origins: allowedOrigins(widgets),
    findWidget: (win) => controllers.find((c) => c.owns(win)),
    onMessage(widget, type) {
      if (type === 'interaction') engine.interact();
      else if (type === 'ready') widget.markReady();
      else if (type === 'auth-required') widget.showAuthRequired();
    },
  });

  // Fallback: a tap inside an iframe gives it focus, which blurs the parent window.
  // Hand focus back so the next tap blurs (and is detected) again.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const c = controllers[engine.getState().index];
      if (c.hasFocus && c.hasFocus()) {
        engine.interact();
        c.releaseFocus();
      }
    }, 0);
  });

  // --- single timer drives everything
  let last = performance.now();
  let night = null;
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(now - last, 5000) * SPEED;
    last = now;

    engine.tick(dt);
    render();

    const date = new Date();
    clock.update(date);
    const ambient = engine.getState().mode === 'ambient';
    controllers.forEach((c) => c.maybeRefresh(now, ambient));

    const n = isNight(date, config.nightMode);
    if (n !== night) {
      night = n;
      dim.classList.toggle('on', n);
    }
  }, TICK_MS);

  clock.update(new Date());
  render();
}

boot().catch((err) => {
  console.error('[pi-tiles] boot failed', err);
  document.body.textContent = `Pi Tiles failed to start: ${err.message}`;
});
