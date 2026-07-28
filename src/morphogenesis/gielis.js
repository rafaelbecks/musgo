import { buildParametricMesh } from "./parametricMesh.js";

/**
 * Johan Gielis superformula in polar form.
 * @see https://en.wikipedia.org/wiki/Superformula
 */
export function superformula(angle, { a, b, m, n1, n2, n3, family = "superellipse" }) {
  const safeA = a === 0 ? 1e-6 : a;
  const safeB = b === 0 ? 1e-6 : b;
  const safeN1 = n1 === 0 ? 1e-6 : n1;

  let envelope = 1;
  if (family === "superrose") envelope = Math.cos(2.5 * angle);
  else if (family === "superspiral") envelope = Math.exp(0.1 * angle);

  const t = (m * angle) / 4;
  const term =
    Math.abs(Math.cos(t) / safeA) ** n2 + Math.abs(Math.sin(t) / safeB) ** n3;
  if (!(term > 0) || !Number.isFinite(term)) return null;

  const r = envelope * term ** (-1 / safeN1);
  return Number.isFinite(r) ? r : null;
}

/** Approximate m = n/d (MATLAB rat) for closing period of the curve. */
function toRational(m, maxDen = 32) {
  const x = Math.abs(m);
  let bestN = Math.round(x);
  let bestD = 1;
  let bestErr = Math.abs(x - bestN);

  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < bestErr - 1e-12 || (Math.abs(err - bestErr) < 1e-12 && d < bestD)) {
      bestN = n;
      bestD = d;
      bestErr = err;
    }
  }
  return { n: Math.abs(bestN) || 0, d: bestD };
}

/**
 * Angle span so the superformula closes (Gielis3d `angolo` logic).
 * Returns upper bound of [0, span].
 */
export function superformulaAngleSpan(a, b, m, n2, n3) {
  const { n, d } = toRational(m);
  if (n % 2 === 0 || (a === b && n2 === n3)) return 2 * d * Math.PI;
  return 4 * d * Math.PI;
}

function gielisScale(extent, params) {
  return extent * (params.envelopeRadius ?? 1) * 0.35;
}

function readSet(params, index) {
  const i = index === 1 ? "1" : "2";
  return {
    a: params[`gielisA${i}`] ?? 1,
    b: params[`gielisB${i}`] ?? 1,
    m: params[`gielisM${i}`] ?? 0,
    n1: params[`gielisN${i}1`] ?? 1,
    n2: params[`gielisN${i}2`] ?? 1,
    n3: params[`gielisN${i}3`] ?? 1,
    family: params[`gielisFamily${i}`] ?? "superellipse",
  };
}

/**
 * 3D Gielis surface via spherical product of two superformulas.
 * x = r1(θ) cos θ · r2(φ) cos φ
 * y = r1(θ) sin θ · r2(φ) cos φ
 * z = r2(φ) sin φ
 */
export function createGielisGeometry(extent, params) {
  const scale = gielisScale(extent, params);
  const set1 = readSet(params, 1);
  const set2 = readSet(params, 2);
  const uSeg = Math.max(24, Math.floor(params.shapeSegments ?? 128));
  const vSeg = Math.max(16, Math.floor(params.gielisVSegments ?? params.shapeSegments * 0.5));
  const phiMode = params.gielisPhiMode ?? "latitude";

  const thetaMax = superformulaAngleSpan(set1.a, set1.b, set1.m, set1.n2, set1.n3);
  let phiMin;
  let phiMax;
  if (phiMode === "full") {
    phiMin = 0;
    phiMax = superformulaAngleSpan(set2.a, set2.b, set2.m, set2.n2, set2.n3);
  } else {
    phiMin = -Math.PI / 2;
    phiMax = Math.PI / 2;
  }

  return buildParametricMesh({
    uSegments: uSeg,
    vSegments: vSeg,
    uMin: 0,
    uMax: thetaMax,
    vMin: phiMin,
    vMax: phiMax,
    evaluate: (theta, phi) => {
      const r1 = superformula(theta, set1);
      const r2 = superformula(phi, set2);
      if (r1 == null || r2 == null) return null;

      const cosPhi = Math.cos(phi);
      const x = scale * r1 * Math.cos(theta) * r2 * cosPhi;
      const y = scale * r1 * Math.sin(theta) * r2 * cosPhi;
      const z = scale * r2 * Math.sin(phi);

      if (![x, y, z].every(Number.isFinite)) return null;
      if (Math.abs(x) > 1e4 || Math.abs(y) > 1e4 || Math.abs(z) > 1e4) return null;
      return { x, y, z };
    },
    shouldSkipVertex: (_u, _v, p) => !p,
  });
}
