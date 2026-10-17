// Engine-independent replacements for Math.pow and friends (ADR-0002). Only
// + − × ÷ with fixed iteration counts, so every JS engine gets the same bits.

/** base^exp for base > 0 and exp ≥ 0: square-and-multiply for the whole part, series for the fraction. */
export function powDet(base: number, exp: number): number {
  let whole = Math.floor(exp);
  const frac = exp - whole;
  let result = 1;
  let b = base;
  while (whole > 0) {
    if (whole % 2 === 1) result *= b;
    b *= b;
    whole = Math.floor(whole / 2);
  }
  return frac > 0 ? result * expDet(frac * lnDet(base)) : result;
}

/** Natural log for x > 0: halve or double into [0.5, 2], then 2·atanh((x−1)/(x+1)). */
export function lnDet(x: number): number {
  let shift = 0;
  let m = x;
  while (m > 2) {
    m /= 2;
    shift++;
  }
  while (m < 0.5) {
    m *= 2;
    shift--;
  }
  const z = (m - 1) / (m + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let k = 1; k < 64; k += 2) {
    sum += term / k;
    term *= z2;
  }
  return 2 * sum + shift * Math.LN2;
}

/** e^y by Taylor series after halving y into [−0.5, 0.5] and squaring back. */
export function expDet(y: number): number {
  let halvings = 0;
  let r = y;
  while (r > 0.5 || r < -0.5) {
    r /= 2;
    halvings++;
  }
  let term = 1;
  let sum = 1;
  for (let k = 1; k < 24; k++) {
    term *= r / k;
    sum += term;
  }
  for (let i = 0; i < halvings; i++) sum *= sum;
  return sum;
}
