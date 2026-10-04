// Pomodoro timer state machine. Pure: time is passed in, nothing runs by itself.
//   status: idle -> running <-> paused -> done
//   mode:   focus | break. Finishing a session offers the other mode.

export function createTimer({ focusMinutes = 25, breakMinutes = 5 } = {}) {
  const dur = { focus: focusMinutes * 60000, break: breakMinutes * 60000 };
  let mode = 'focus';
  let status = 'idle';
  let remaining = dur.focus;
  let endAt = 0;

  const other = () => (mode === 'focus' ? 'break' : 'focus');

  return {
    start(now) {
      if (status === 'running') return;
      if (status === 'done') {
        mode = other();
        remaining = dur[mode];
      }
      endAt = now + remaining;
      status = 'running';
    },
    pause(now) {
      if (status !== 'running') return;
      remaining = Math.max(0, endAt - now);
      status = 'paused';
    },
    reset() {
      status = 'idle';
      remaining = dur[mode];
    },
    setMode(next) {
      mode = next;
      this.reset();
    },
    // Returns 'finish' once, when a running session reaches zero.
    tick(now) {
      if (status === 'running' && now >= endAt) {
        remaining = 0;
        status = 'done';
        return 'finish';
      }
      return null;
    },
    getState(now) {
      const rem = status === 'running' ? Math.max(0, endAt - now) : remaining;
      return {
        mode,
        status,
        nextMode: other(),
        remainingMs: rem,
        progress: dur[mode] ? 1 - rem / dur[mode] : 1,
      };
    },
  };
}

export function formatRemaining(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  return `${String(m).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
