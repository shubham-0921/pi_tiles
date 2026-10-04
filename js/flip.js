// Split-flap card. The top half folds down to reveal the next value.
// Transform-only animation (two short flips), and only runs when the value changes.

const HALF_MS = 220;

export function createFlipCard(initial = '') {
  const el = document.createElement('div');
  el.className = 'flip';
  el.innerHTML = `
    <div class="half s-top"><span></span></div>
    <div class="half s-bot"><span></span></div>
    <div class="flap f-top"><span></span></div>
    <div class="flap f-bot"><span></span></div>`;
  const q = (sel) => el.querySelector(sel);
  const sTop = q('.s-top span');
  const sBot = q('.s-bot span');
  const fTopEl = q('.f-top');
  const fBotEl = q('.f-bot');
  const fTop = q('.f-top span');
  const fBot = q('.f-bot span');

  let value = '';
  let anims = [];

  const fill = (spans, text) => spans.forEach((s) => { s.textContent = text; });

  function settle() {
    anims.forEach((a) => a.cancel());
    anims = [];
    el.classList.remove('run');
  }

  function set(next, animate = false) {
    if (next === value) return;
    const old = value;
    value = next;
    settle();
    if (!animate || !old) {
      fill([sTop, sBot, fTop, fBot], next);
      return;
    }
    fill([sTop, fBot], next); // revealed under the falling flap / lands on the bottom
    fill([fTop], old);
    el.classList.add('run');
    const fall = fTopEl.animate(
      [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }],
      { duration: HALF_MS, easing: 'ease-in', fill: 'forwards' },
    );
    anims = [fall];
    fall.onfinish = () => {
      const land = fBotEl.animate(
        [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }],
        { duration: HALF_MS, easing: 'ease-out', fill: 'forwards' },
      );
      anims.push(land);
      land.onfinish = () => {
        fill([sBot], next);
        settle();
      };
    };
  }

  set(initial);
  return { el, set };
}
