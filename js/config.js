// Loads widgets.json (falls back to widgets.example.json) and normalises it.

const DEFAULT_DURATION_S = 20;

export function normalizeConfig(raw) {
  const widgets = [];
  const seen = new Set();

  for (const w of raw.widgets || []) {
    const type = ['clock', 'timer'].includes(w.type) ? w.type : 'iframe';
    if (type === 'iframe') {
      try {
        new URL(w.url);
      } catch {
        console.warn(`[pi-tiles] skipping widget "${w.id}": invalid url`);
        continue;
      }
    }
    let id = String(w.id || w.name || type);
    while (seen.has(id)) id += '_';
    seen.add(id);

    widgets.push({
      id,
      name: w.name || id,
      icon: w.icon || '▫️',
      type,
      url: type === 'iframe' ? w.url : '',
      durationSeconds: w.durationSeconds > 0 ? w.durationSeconds : DEFAULT_DURATION_S,
      refreshMinutes: w.refreshMinutes > 0 ? w.refreshMinutes : 0,
      inRotation: w.inRotation !== false,
      backgroundRefreshMinutes: w.backgroundRefreshMinutes > 0 ? w.backgroundRefreshMinutes : 0,
      focusMinutes: w.focusMinutes > 0 ? w.focusMinutes : 25,
      breakMinutes: w.breakMinutes > 0 ? w.breakMinutes : 5,
    });
  }

  // The Clock is always slide 0.
  const clockAt = widgets.findIndex((w) => w.type === 'clock');
  if (clockAt === -1) {
    widgets.unshift({
      id: 'clock', name: 'Clock', icon: '🕐', type: 'clock', url: '',
      durationSeconds: DEFAULT_DURATION_S, refreshMinutes: 0, inRotation: true,
    });
  } else if (clockAt > 0) {
    widgets.unshift(...widgets.splice(clockAt, 1));
  }
  widgets[0].inRotation = true;

  return {
    idleTimeoutSeconds: raw.idleTimeoutSeconds > 0 ? raw.idleTimeoutSeconds : 75,
    widgets,
  };
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadConfig() {
  let raw;
  try {
    raw = await fetchJson('widgets.json');
  } catch (err) {
    console.warn('[pi-tiles] widgets.json not usable, falling back to widgets.example.json:', err.message);
    raw = await fetchJson('widgets.example.json');
  }
  return normalizeConfig(raw);
}
