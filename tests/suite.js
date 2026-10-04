// Shared test suite. Runs under Node (tests/run-node.js) or the browser (tests/index.html).
import { createRotationEngine } from '../js/rotation-engine.js';
import { isNight } from '../js/night.js';
import { acceptMessage } from '../js/messaging.js';

const S = 1000;
const widgets = () => [
  { id: 'clock', durationSeconds: 10 },
  { id: 'a', durationSeconds: 20 },
  { id: 'b', durationSeconds: 20 },
];

function setup(list = widgets(), idle = 75) {
  const engine = createRotationEngine({ widgets: list, idleTimeoutSeconds: idle });
  const events = [];
  engine.subscribe((e) => events.push(e));
  return { engine, events };
}

export function register(test, assert) {
  test('starts ambient on the clock', () => {
    const { engine } = setup();
    const s = engine.getState();
    assert.equal(s.mode, 'ambient');
    assert.equal(s.index, 0);
    assert.equal(s.nextIndex, 1);
  });

  test('auto-advances after each duration and loops back to the clock', () => {
    const { engine, events } = setup();
    engine.tick(9 * S);
    assert.equal(engine.getState().index, 0);
    engine.tick(1 * S);
    assert.equal(engine.getState().index, 1);
    engine.tick(20 * S);
    assert.equal(engine.getState().index, 2);
    engine.tick(20 * S);
    assert.equal(engine.getState().index, 0);
    assert.deepEqual(events.map((e) => e.reason), ['auto', 'auto', 'auto']);
    assert.ok(events.every((e) => e.direction === 1));
  });

  test('skips widgets that are not inRotation', () => {
    const list = widgets();
    list[1].inRotation = false;
    const { engine } = setup(list);
    engine.tick(10 * S);
    assert.equal(engine.getState().index, 2);
  });

  test('interaction pauses rotation and freezes progress', () => {
    const { engine } = setup();
    engine.tick(5 * S);
    const before = engine.getState().progress;
    engine.interact();
    engine.tick(60 * S);
    const s = engine.getState();
    assert.equal(s.mode, 'interactive');
    assert.equal(s.index, 0);
    assert.equal(s.progress, before);
  });

  test('idle timeout returns to the clock and resumes ambient', () => {
    const { engine, events } = setup();
    engine.goTo(2);
    engine.tick(74 * S);
    assert.equal(engine.getState().mode, 'interactive');
    assert.equal(engine.getState().index, 2);
    engine.tick(1 * S);
    const s = engine.getState();
    assert.equal(s.mode, 'ambient');
    assert.equal(s.index, 0);
    assert.equal(events.at(-1).reason, 'idle-return');
    // and rotation runs again
    engine.tick(10 * S);
    assert.equal(engine.getState().index, 1);
  });

  test('further interaction resets the idle timer', () => {
    const { engine } = setup();
    engine.interact();
    engine.tick(70 * S);
    engine.interact();
    engine.tick(70 * S);
    assert.equal(engine.getState().mode, 'interactive');
    assert.equal(engine.getState().idleRemainingMs, 5 * S);
  });

  test('idle return while already on the clock emits no slide event', () => {
    const { engine, events } = setup();
    engine.interact();
    engine.tick(75 * S);
    assert.equal(engine.getState().mode, 'ambient');
    assert.ok(!events.some((e) => e.type === 'slide'));
  });

  test('goTo pauses, jumps, and reports direction', () => {
    const { engine, events } = setup();
    engine.goTo(2);
    engine.goTo(1);
    const slides = events.filter((e) => e.type === 'slide');
    assert.equal(engine.getState().mode, 'interactive');
    assert.deepEqual(slides.map((e) => [e.from, e.to, e.direction, e.reason]), [
      [0, 2, 1, 'manual'],
      [2, 1, -1, 'manual'],
    ]);
  });

  test('next/prev wrap around', () => {
    const { engine } = setup();
    engine.prev();
    assert.equal(engine.getState().index, 2);
    engine.next();
    assert.equal(engine.getState().index, 0);
  });

  test('auth-required widgets are skipped until they report ready', () => {
    const { engine } = setup();
    engine.setSkipped('a', true);
    engine.tick(10 * S);
    assert.equal(engine.getState().index, 2);
    assert.equal(engine.getState().nextIndex, 0);
    engine.setSkipped('a', false);
    engine.tick(20 * S);
    engine.tick(10 * S);
    assert.equal(engine.getState().index, 1);
  });

  test('stays on the clock when nothing else is eligible', () => {
    const list = widgets();
    list[1].inRotation = false;
    list[2].inRotation = false;
    const { engine, events } = setup(list);
    engine.tick(100 * S);
    assert.equal(engine.getState().index, 0);
    assert.equal(events.length, 0);
  });

  test('isNight handles windows that wrap midnight', () => {
    const night = { start: '23:00', end: '07:00' };
    const at = (h, m) => new Date(2026, 0, 1, h, m);
    assert.equal(isNight(at(22, 59), night), false);
    assert.equal(isNight(at(23, 0), night), true);
    assert.equal(isNight(at(3, 30), night), true);
    assert.equal(isNight(at(7, 0), night), false);
    assert.equal(isNight(at(12, 0), night), false);
    assert.equal(isNight(at(12, 0), null), false);
  });

  test('acceptMessage enforces origin, source tag and type', () => {
    const origins = new Set(['https://app.example']);
    const msg = (origin, data) => acceptMessage({ origin, data }, origins);
    assert.equal(msg('https://app.example', { source: 'pi-tiles', type: 'ready' }), 'ready');
    assert.equal(msg('https://evil.example', { source: 'pi-tiles', type: 'ready' }), null);
    assert.equal(msg('https://app.example', { source: 'other', type: 'ready' }), null);
    assert.equal(msg('https://app.example', { source: 'pi-tiles', type: 'nope' }), null);
    assert.equal(msg('https://app.example', 'ready'), null);
  });
}
