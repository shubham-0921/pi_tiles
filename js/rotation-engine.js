// Rotation state machine: ambient <-> interactive.
// Pure logic: no DOM, no timers. The caller feeds it elapsed time via tick(dtMs).
//
//   ambient     auto-advances after each slide's duration, looping back to slide 0
//   interactive rotation paused; after idleTimeoutSeconds of no interaction,
//               returns to slide 0 and switches back to ambient
//
// Slide 0 is the Clock and is always in rotation.

const DEFAULT_DURATION_S = 20;

export function createRotationEngine({ widgets, idleTimeoutSeconds = 75 }) {
  if (!widgets.length) throw new Error('rotation engine needs at least one widget');

  const slides = widgets.map((w) => ({
    id: w.id,
    durationMs: (w.durationSeconds > 0 ? w.durationSeconds : DEFAULT_DURATION_S) * 1000,
    inRotation: w.inRotation !== false,
  }));
  slides[0].inRotation = true;

  const idleMs = idleTimeoutSeconds * 1000;
  const skipped = new Set(); // ids that reported auth-required
  const listeners = new Set();

  let mode = 'ambient';
  let index = 0;
  let slideElapsed = 0;
  let idleElapsed = 0;

  const emit = (event) => listeners.forEach((fn) => fn(event));
  const eligible = (i) => slides[i].inRotation && !skipped.has(slides[i].id);

  function nextIndex() {
    for (let k = 1; k < slides.length; k++) {
      const j = (index + k) % slides.length;
      if (eligible(j)) return j;
    }
    return index;
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    emit({ type: 'mode', mode });
  }

  function move(to, direction, reason) {
    const from = index;
    index = to;
    slideElapsed = 0;
    if (from !== to) emit({ type: 'slide', from, to, direction, reason });
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    tick(dtMs) {
      if (mode === 'ambient') {
        slideElapsed += dtMs;
        if (slideElapsed >= slides[index].durationMs) move(nextIndex(), 1, 'auto');
      } else {
        idleElapsed += dtMs;
        if (idleElapsed >= idleMs) {
          idleElapsed = 0;
          setMode('ambient');
          move(0, -1, 'idle-return');
        }
      }
    },

    // Any user interaction: pause rotation and restart the idle countdown.
    interact() {
      idleElapsed = 0;
      setMode('interactive');
    },

    // Manual navigation (pill tap, swipe). Counts as interaction.
    goTo(i, direction = i > index ? 1 : -1) {
      this.interact();
      if (i < 0 || i >= slides.length) return;
      move(i, direction, 'manual');
    },
    next() { this.goTo((index + 1) % slides.length, 1); },
    prev() { this.goTo((index - 1 + slides.length) % slides.length, -1); },

    // A widget reporting auth-required is skipped in rotation until it reports ready.
    setSkipped(id, flag) {
      if (flag) skipped.add(id);
      else skipped.delete(id);
    },

    getState() {
      return {
        mode,
        index,
        nextIndex: nextIndex(),
        progress: Math.min(1, slideElapsed / slides[index].durationMs),
        idleRemainingMs: mode === 'interactive' ? Math.max(0, idleMs - idleElapsed) : null,
      };
    },
  };
}
