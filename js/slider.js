// Horizontal slider. Only transform is animated; hidden slides are visibility:hidden
// so they cost no paint. Swipe zones on the screen edges drive prev/next.

const TRANSITION_MS = 350;

export function createSlider(stage, slideEls) {
  let current = 0;
  let timer = 0;

  function place(el, x, visible) {
    el.style.transition = 'none';
    el.style.transform = `translate3d(${x}%,0,0)`;
    el.style.visibility = visible ? 'visible' : 'hidden';
  }

  slideEls.forEach((el, i) => {
    el.classList.add('slide');
    stage.appendChild(el);
    place(el, 100, false);
  });
  place(slideEls[0], 0, true);

  return {
    // direction: 1 = new slide enters from the right, -1 = from the left.
    // done() runs once the transition has settled (or immediately if there is none).
    show(to, direction, done) {
      clearTimeout(timer);
      const from = current;
      current = to;
      if (from === to) return done && done();

      slideEls.forEach((el, i) => {
        if (i !== from && i !== to) place(el, 100, false);
      });
      place(slideEls[to], direction * 100, true);
      void slideEls[to].offsetWidth; // commit start position before animating

      for (const [el, x] of [[slideEls[from], -direction * 100], [slideEls[to], 0]]) {
        el.style.willChange = 'transform';
        el.style.transition = `transform ${TRANSITION_MS}ms ease-out`;
        el.style.transform = `translate3d(${x}%,0,0)`;
      }

      timer = setTimeout(() => {
        place(slideEls[from], 100, false);
        slideEls[from].style.willChange = '';
        slideEls[to].style.willChange = '';
        if (done) done();
      }, TRANSITION_MS + 30);
    },
  };
}

// Transparent edge zones: swipes inside an iframe belong to the site, so only the
// outer ~40px are ours.
export function attachSwipeZones(zones, { onPrev, onNext }) {
  const MIN_DX = 40;
  for (const zone of zones) {
    let startX = 0;
    let startY = 0;
    zone.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointerup', (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrev();
    });
  }
}
