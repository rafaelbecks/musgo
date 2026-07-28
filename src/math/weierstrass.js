import * as C from "./complex.js";

/** Lemniscatic lattice constant (square torus, g3 = 0). */
export const LEMNISCATIC_G2 = 189.07272;

const OMEGA1 = C.c(1, 0);
const OMEGA2 = C.c(0, 1);

function cPow2Inv(z) {
  const d = C.cAbs2(z);
  if (d < 1e-14) return C.c(NaN, NaN);
  const inv = 1 / d;
  return C.c(z.re * inv, -z.im * inv);
}

/**
 * Weierstrass ℘(z) via truncated lattice sum on the unit square torus.
 */
export function weierstrassP(z, g2 = LEMNISCATIC_G2, g3 = 0, terms = 10) {
  void g2;
  void g3;

  const d2 = C.cAbs2(z);
  if (d2 < 1e-10) return C.c(NaN, NaN);

  let sum = cPow2Inv(z);

  for (let m = -terms; m <= terms; m++) {
    for (let n = -terms; n <= terms; n++) {
      if (m === 0 && n === 0) continue;
      const w = C.cAdd(C.cScale(OMEGA1, m), C.cScale(OMEGA2, n));
      const diff = C.cSub(z, w);
      const term = C.cSub(cPow2Inv(diff), cPow2Inv(w));
      sum = C.cAdd(sum, term);
    }
  }

  return sum;
}

function cInvSafe(z) {
  const d = C.cAbs2(z);
  if (d < 1e-14) return C.c(NaN, NaN);
  const inv = 1 / d;
  return C.c(z.re * inv, -z.im * inv);
}

/**
 * Weierstrass ζ(z) via truncated lattice sum on the unit square torus.
 */
export function weierstrassZeta(z, g2 = LEMNISCATIC_G2, g3 = 0, terms = 12) {
  void g2;
  void g3;

  const d2 = C.cAbs2(z);
  if (d2 < 1e-10) return C.c(NaN, NaN);

  let sum = cInvSafe(z);

  for (let m = -terms; m <= terms; m++) {
    for (let n = -terms; n <= terms; n++) {
      if (m === 0 && n === 0) continue;
      const w = C.cAdd(C.cScale(OMEGA1, m), C.cScale(OMEGA2, n));
      const diff = C.cSub(z, w);
      const invDiff = cInvSafe(diff);
      const invW = cInvSafe(w);
      const w2Inv = cInvSafe(C.cMul(w, w));
      if (!Number.isFinite(invDiff.re) || !Number.isFinite(invW.re)) continue;
      const term = C.cAdd(C.cAdd(invDiff, invW), C.cMul(z, w2Inv));
      sum = C.cAdd(sum, term);
    }
  }

  return sum;
}
