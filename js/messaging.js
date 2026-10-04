// postMessage bridge for apps running inside the iframes.
// Apps send { source: "pi-tiles", type: "ready" | "interaction" | "auth-required" }.

const TYPES = new Set(['ready', 'interaction', 'auth-required']);

export function allowedOrigins(widgets) {
  const origins = new Set();
  for (const w of widgets) {
    if (w.type !== 'iframe') continue;
    try {
      origins.add(new URL(w.url).origin);
    } catch {
      // bad URLs are rejected by the config loader
    }
  }
  return origins;
}

// Returns the message type if the event is acceptable, otherwise null.
export function acceptMessage(event, origins) {
  if (!origins.has(event.origin)) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.source !== 'pi-tiles') return null;
  return TYPES.has(data.type) ? data.type : null;
}

// findWidget(sourceWindow) -> widget controller that owns that iframe window, or undefined.
export function attachMessaging({ origins, findWidget, onMessage }) {
  window.addEventListener('message', (event) => {
    const type = acceptMessage(event, origins);
    if (!type) return;
    const widget = findWidget(event.source);
    if (widget) onMessage(widget, type);
  });
}
