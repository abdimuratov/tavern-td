// Time for the net code comes only from here, so the lockstep and the session
// run on a virtual clock in tests (docs/versus-design.md §8).

/** Milliseconds, from any origin, never going back. */
export interface Clock {
  now(): number;
  /** Calls `fn` every `ms` until the returned cancel is called. */
  every(ms: number, fn: () => void): () => void;
}

/** The browser's clock: the display frames' own time base, and setInterval. */
export const browserClock: Clock = {
  now: () => performance.now(),
  every(ms, fn) {
    const handle = setInterval(fn, ms);
    return () => clearInterval(handle);
  },
};

/** Calls `fn` once, `ms` from now, unless the returned cancel comes first. */
export function after(clock: Clock, ms: number, fn: () => void): () => void {
  let live = true;
  const cancel = clock.every(ms, () => {
    if (!live) return;
    live = false;
    cancel();
    fn();
  });
  return () => {
    live = false;
    cancel();
  };
}
