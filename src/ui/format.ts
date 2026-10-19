/**
 * One formatter for every whole number the HUD shows. `toLocaleString` builds
 * a formatter on each call, and the HUD formats dozens of numbers a few times
 * a second, which made it Line Wars' costliest function in a frame.
 */
const WHOLE = new Intl.NumberFormat('en-US');

/** A number as the HUD shows it: thousands separated, at most two decimals for small values. */
export function num(n: number): string {
  if (Number.isInteger(n)) return WHOLE.format(n);
  return n < 10 ? n.toFixed(2).replace(/0$/, '') : n.toFixed(1).replace(/\.0$/, '');
}

/** m:ss, or h:mm:ss past an hour. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "3 min ago", "yesterday": when a Run was saved. */
export function ago(epochMs: number, now = Date.now()): string {
  const min = Math.round((now - epochMs) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
