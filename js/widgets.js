// Widget controllers. Each owns one slide element.
// Iframe widgets keep NO iframe while inactive: it is created on activate() and
// torn down (src=about:blank, then removed) on deactivate().

import { createFlipCard } from './flip.js';
import { createTimer, formatRemaining } from './timer.js';

const LOAD_TIMEOUT_MS = 15000;

export function createClockWidget(el) {
  el.innerHTML = `
    <div class="clock">
      <div class="flip-row"></div>
      <div class="clock-day"></div>
      <div class="clock-date"></div>
    </div>`;
  const row = el.querySelector('.flip-row');
  const day = el.querySelector('.clock-day');
  const date = el.querySelector('.clock-date');

  const hours = createFlipCard();
  const minutes = createFlipCard();
  hours.el.classList.add('hours');
  minutes.el.classList.add('minutes');
  const ampm = document.createElement('span');
  ampm.className = 'ampm';
  hours.el.appendChild(ampm);
  row.append(hours.el, minutes.el);

  let active = false; // only animate flips while the slide is on screen

  const set = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    type: 'clock',
    activate() { active = true; },
    deactivate() { active = false; },
    owns: () => false,
    maybeRefresh() {},
    update(now) {
      const h = now.getHours();
      const h12 = String(h % 12 || 12);
      hours.el.classList.toggle('two', h12.length === 2);
      hours.set(h12, active);
      minutes.set(String(now.getMinutes()).padStart(2, '0'), active);
      set(ampm, h < 12 ? 'AM' : 'PM');
      set(day, now.toLocaleDateString([], { weekday: 'long' }));
      set(date, now.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }));
    },
  };
}

// hooks: { onReady(), onAuthRequired() }
export function createIframeWidget(el, widget, hooks) {
  el.innerHTML = `
    <div class="frame-host"></div>
    <div class="overlay message" hidden>
      <div class="msg-text"></div>
      <div class="msg-actions">
        <button class="open-ext" type="button" hidden>Open in browser</button>
        <button class="retry" type="button">Retry</button>
      </div>
    </div>`;
  const host = el.querySelector('.frame-host');
  const message = el.querySelector('.message');
  const msgText = el.querySelector('.msg-text');
  const openExt = el.querySelector('.open-ext');

  let iframe = null;
  let state = 'idle'; // idle | loading | ready | error | auth
  let loadTimer = 0;
  let loadedAt = 0;
  let active = false;

  function setState(next) {
    state = next;
    message.hidden = next !== 'error' && next !== 'auth';
    openExt.hidden = next !== 'auth';
    if (next === 'error') msgText.textContent = `Couldn't load ${widget.name}`;
    if (next === 'auth') {
      msgText.textContent = `Sign in needed. Open ${widget.name} directly in Chromium to log in.`;
    }
  }

  function destroy() {
    clearTimeout(loadTimer);
    if (!iframe) return;
    iframe.onload = null;
    iframe.src = 'about:blank';
    iframe.remove();
    iframe = null;
  }

  function markReady() {
    clearTimeout(loadTimer);
    loadedAt = performance.now();
    setState('ready');
    hooks.onReady();
  }

  // refresh: ask the app to refetch its data (used when a preload doubles as a background refresh)
  function load(refresh = false) {
    destroy();
    setState('loading');
    iframe = document.createElement('iframe');
    iframe.title = widget.name;
    iframe.onload = () => {
      if (state === 'loading') markReady(); // fallback when the app sends no "ready"
    };
    iframe.src = widget.url;
    if (refresh) {
      const u = new URL(widget.url);
      u.searchParams.set('refresh', '1');
      iframe.src = u.href;
    }
    host.appendChild(iframe);
    loadTimer = setTimeout(() => {
      if (state !== 'loading') return;
      destroy();
      setState('error');
    }, LOAD_TIMEOUT_MS);
  }

  el.querySelector('.retry').addEventListener('click', () => load());
  // After signing in via "Open in browser", recheck as soon as the user comes back to this window.
  const recheck = () => {
    if (active && state === 'auth' && !document.hidden) load();
  };
  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('focus', recheck);
  // Google refuses to render its sign-in page inside an iframe, so log in in a real window.
  openExt.addEventListener('click', () => window.open(widget.url, '_blank'));

  return {
    type: 'iframe',
    id: widget.id,
    activate() {
      active = true;
      // A preloaded iframe is already loading or ready: just keep it.
      if (iframe && (state === 'loading' || state === 'ready')) return;
      load();
    },
    // Load while the slide is still off screen so it is ready when it slides in.
    prewarm(refresh = false) {
      if (active || iframe) return;
      load(refresh);
    },
    isLoaded: () => !!iframe,
    deactivate() {
      active = false;
      destroy();
      setState('idle');
    },
    owns: (win) => !!iframe && iframe.contentWindow === win,
    markReady() {
      if (state === 'loading' || state === 'ready') markReady();
    },
    showAuthRequired() {
      destroy();
      setState('auth');
      hooks.onAuthRequired();
    },
    // Auto-refresh: only the active slide, only while not interacting.
    maybeRefresh(nowMs, ambient) {
      if (!active || !ambient || state !== 'ready' || !widget.refreshMinutes) return;
      if (nowMs - loadedAt >= widget.refreshMinutes * 60000) load();
    },
    // Called when the parent window blurred because the iframe took focus.
    releaseFocus() {
      if (iframe) iframe.blur();
    },
    hasFocus: () => !!iframe && document.activeElement === iframe,
  };
}

// Native pomodoro widget. The timer keeps running while the slide is off screen;
// hooks.onFinish() lets the app bring the slide forward.
export function createTimerWidget(el, widget, hooks) {
  el.innerHTML = `
    <div class="timer">
      <div class="timer-tabs">
        <button type="button" data-mode="focus">Focus</button>
        <button type="button" data-mode="break">Break</button>
      </div>
      <div class="timer-time"></div>
      <div class="timer-status"></div>
      <div class="timer-bar"><div class="timer-fill"></div></div>
      <div class="timer-actions">
        <button type="button" class="t-main"></button>
        <button type="button" class="t-reset">Reset</button>
      </div>
    </div>`;
  const root = el.querySelector('.timer');
  const time = el.querySelector('.timer-time');
  const status = el.querySelector('.timer-status');
  const fill = el.querySelector('.timer-fill');
  const main = el.querySelector('.t-main');
  const tabs = [...el.querySelectorAll('.timer-tabs button')];

  const timer = createTimer(widget);
  let last = '';

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach((t) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = 880;
        osc.connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.2);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {
      // no audio device or blocked: the on-screen "Time's up" still shows
    }
  }

  function render(now) {
    const s = timer.getState(now);
    const text = formatRemaining(s.remainingMs);
    const key = `${s.mode}|${s.status}|${text}`;
    if (key === last) return;
    last = key;
    time.textContent = text;
    status.textContent = s.status === 'paused' ? 'Paused' : s.status === 'done' ? "Time's up!" : '';
    root.dataset.status = s.status;
    fill.style.transform = `scaleX(${s.progress})`;
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
    main.textContent = { idle: 'Start', running: 'Pause', paused: 'Resume' }[s.status]
      ?? `Start ${s.nextMode}`;
  }

  main.addEventListener('click', () => {
    const now = Date.now();
    if (timer.getState(now).status === 'running') timer.pause(now);
    else timer.start(now);
    render(now);
  });
  el.querySelector('.t-reset').addEventListener('click', () => { timer.reset(); render(Date.now()); });
  tabs.forEach((b) => b.addEventListener('click', () => { timer.setMode(b.dataset.mode); render(Date.now()); }));

  render(Date.now());

  return {
    type: 'timer',
    activate() { render(Date.now()); },
    deactivate() {},
    owns: () => false,
    maybeRefresh() {},
    // Driven by the app's single timer, also while the slide is hidden.
    tick(now) {
      if (timer.tick(now) === 'finish') {
        beep();
        hooks.onFinish();
      }
      render(now);
    },
    // Shown in the pill while a session is in progress.
    label() {
      const s = timer.getState(Date.now());
      return s.status === 'idle' ? null : formatRemaining(s.remainingMs);
    },
  };
}
