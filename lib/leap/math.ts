// Numerical helpers for the LEAP screener. Kept dependency-free so the whole
// engine runs under Node's built-in TypeScript stripping with no install step.

// Abramowitz & Stegun 7.1.26 error function approximation. Max error ~1.5e-7.
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

// Standard normal probability density.
export function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Standard normal cumulative distribution.
export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Lanczos approximation of the natural log of the gamma function.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula for the left half-plane.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }
  const z = x - 1;
  let a = LANCZOS_C[0];
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    a += LANCZOS_C[i] / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Probability density of a standardized Student-t: a Student-t with `nu`
// degrees of freedom rescaled to unit variance (requires nu > 2). Fatter tails
// than the normal for small nu, which is the whole point of the model: it lets
// the engine assume larger moves are more likely than the market's lognormal
// pricing implies.
export function standardizedTPdf(z: number, nu: number): number {
  // A raw Student-t has variance nu/(nu-2). Rescale so our z has unit variance.
  const scale = Math.sqrt(nu / (nu - 2));
  const t = z * scale;
  const logConst =
    logGamma((nu + 1) / 2) -
    logGamma(nu / 2) -
    0.5 * Math.log(nu * Math.PI);
  const logKernel = (-(nu + 1) / 2) * Math.log(1 + (t * t) / nu);
  return Math.exp(logConst + logKernel) * scale;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Map a value onto 0..1 with a floor and ceiling, linearly in between.
export function ramp(x: number, lo: number, hi: number): number {
  if (hi === lo) return x >= hi ? 1 : 0;
  return clamp((x - lo) / (hi - lo), 0, 1);
}
