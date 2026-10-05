// Background refresh for iframe widgets that cache their own data (e.g. Bolkar keeps its last
// response in localStorage). Every backgroundRefreshMinutes, load the page with ?refresh=1 in a
// hidden iframe for a few seconds so the cache is fresh before the user visits the slide.
// Only runs while no iframe slide is on screen, so there is still only one iframe at a time.

const RUN_MS = 15000;
const FIRST_DELAY_MS = 5000;
const RETRY_MS = 30000;

// Pure scheduling, testable without a DOM.
export function createScheduler(widgets, now0, firstDelayMs = FIRST_DELAY_MS) {
  const items = widgets
    .filter((w) => w.type === 'iframe' && w.backgroundRefreshMinutes > 0)
    .map((w) => ({ w, every: w.backgroundRefreshMinutes * 60000, next: now0 + firstDelayMs }));
  const find = (w) => items.find((i) => i.w === w);
  return {
    due(now) {
      const item = items.find((i) => now >= i.next);
      return item ? item.w : null;
    },
    done(w, now) {
      const item = find(w);
      item.next = now + item.every;
    },
    // True (once) if this widget's refresh is due; the caller then does the refresh itself.
    take(w, now) {
      const item = find(w);
      if (!item || now < item.next) return false;
      item.next = now + item.every;
      return true;
    },
    retry(w, now, delayMs = RETRY_MS) {
      find(w).next = now + delayMs;
    },
  };
}

export function createBackgroundRefresher(widgets, { canRun, now = performance.now() }) {
  const scheduler = createScheduler(widgets, now);
  let frame = null;
  let current = null;
  let timer = 0;

  function stop() {
    clearTimeout(timer);
    timer = 0;
    if (!frame) return;
    frame.onload = null;
    frame.src = 'about:blank';
    frame.remove();
    frame = null;
    current = null;
  }

  return {
    busy: () => !!frame,
    takeDue: (w, nowMs) => scheduler.take(w, nowMs),
    tick(nowMs) {
      if (frame || !canRun()) return;
      const widget = scheduler.due(nowMs);
      if (!widget) return;
      scheduler.done(widget, nowMs);
      const url = new URL(widget.url);
      url.searchParams.set('refresh', '1');
      current = widget;
      frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.title = `${widget.name} (background refresh)`;
      frame.src = url.href;
      document.body.appendChild(frame);
      timer = setTimeout(stop, RUN_MS);
    },
    // A visible iframe slide is about to load: drop the background one and try again soon.
    abort(nowMs) {
      if (current) scheduler.retry(current, nowMs);
      stop();
    },
  };
}
