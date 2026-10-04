// Widget controllers. Each owns one slide element.
// Iframe widgets keep NO iframe while inactive: it is created on activate() and
// torn down (src=about:blank, then removed) on deactivate().

import { createFlipCard } from './flip.js';

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
    <div class="overlay skeleton" hidden>
      <div class="skel-icon"></div>
      <div class="skel-name"></div>
      <div class="skel-bar"></div><div class="skel-bar short"></div>
    </div>
    <div class="overlay message" hidden>
      <div class="msg-text"></div>
      <div class="msg-actions">
        <button class="open-ext" type="button" hidden>Open in browser</button>
        <button class="retry" type="button">Retry</button>
      </div>
    </div>`;
  const host = el.querySelector('.frame-host');
  const skeleton = el.querySelector('.skeleton');
  const message = el.querySelector('.message');
  const msgText = el.querySelector('.msg-text');
  const openExt = el.querySelector('.open-ext');
  el.querySelector('.skel-icon').textContent = widget.icon;
  el.querySelector('.skel-name').textContent = `Loading ${widget.name}…`;

  let iframe = null;
  let state = 'idle'; // idle | loading | ready | error | auth
  let loadTimer = 0;
  let loadedAt = 0;
  let active = false;

  function setState(next) {
    state = next;
    skeleton.hidden = next !== 'loading';
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

  function load() {
    destroy();
    setState('loading');
    iframe = document.createElement('iframe');
    iframe.title = widget.name;
    iframe.onload = () => {
      if (state === 'loading') markReady(); // fallback when the app sends no "ready"
    };
    iframe.src = widget.url;
    host.appendChild(iframe);
    loadTimer = setTimeout(() => {
      if (state !== 'loading') return;
      destroy();
      setState('error');
    }, LOAD_TIMEOUT_MS);
  }

  el.querySelector('.retry').addEventListener('click', load);
  // Google refuses to render its sign-in page inside an iframe, so log in in a real window.
  openExt.addEventListener('click', () => window.open(widget.url, '_blank'));

  return {
    type: 'iframe',
    id: widget.id,
    activate() {
      active = true;
      load();
    },
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
