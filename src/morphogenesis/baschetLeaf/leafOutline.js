/**
 * Baschet-style almond outline (no lobes).
 *
 * Half-width along the vertical parameter v ∈ [0, 1] (bottom tip → top tip):
 *   w(v) = radius · widthScale · sin(πv)^exponent · pinch(v)
 *
 * Mirror across the Y axis for a closed leaf with sharp tips at both ends.
 * Peak width sits slightly above mid-height (Baschet silhouette).
 */

export const DEFAULT_LEAF_OUTLINE = {
  radius: 1,
  heightScale: 1.85,
  widthScale: 0.55,
  exponent: 0.85,
  asymmetry: 0,
  topPinch: 0.08,
  bottomPinch: 0.12,
  skew: 0,
  /** Where max width sits along height (0.5 = center, >0.5 = higher). */
  bulge: 0.58,
  resolution: 64,
  /** Depth of the central-spine fold (sheet curves back toward edges). */
  foldDepth: 0.28,
  /** Cross-section power: 1 ≈ V-fold, >1 rounder wings, <1 sharper crease. */
  foldPower: 1.15,
};

/**
 * Remap v ∈ [0,1] so sin(π·u) peaks at `bulge` instead of 0.5.
 */
function bulgeMap(v, bulge) {
  const peak = Math.min(0.9, Math.max(0.1, bulge));
  if (v <= peak) return 0.5 * (v / peak);
  return 0.5 + 0.5 * ((v - peak) / (1 - peak));
}

/**
 * Half-width of the leaf at normalized height v ∈ [0, 1].
 */
export function leafHalfWidth(v, params = {}) {
  const p = { ...DEFAULT_LEAF_OUTLINE, ...params };
  const exponent = Math.max(0.05, p.exponent);
  const u = bulgeMap(Math.min(1, Math.max(0, v)), p.bulge);
  const profile = Math.sin(Math.PI * u) ** exponent;

  const tipTop = Math.max(0, (v - 0.7) / 0.3);
  const tipBot = Math.max(0, (0.3 - v) / 0.3);
  const pinch = Math.max(
    0.05,
    1 - p.topPinch * tipTop * tipTop - p.bottomPinch * tipBot * tipBot
  );

  return Math.max(0, p.radius * p.widthScale * profile * pinch);
}

/**
 * Height (Y) at normalized v ∈ [0, 1].
 */
export function leafHeightAt(v, params = {}) {
  const p = { ...DEFAULT_LEAF_OUTLINE, ...params };
  return (v - 0.5) * 2 * p.radius * p.heightScale;
}

/**
 * Evaluate a boundary point on the right (+x) or left (−x) edge.
 * side: +1 right, −1 left. v ∈ [0, 1].
 */
export function leafEdgePoint(v, side = 1, params = {}) {
  const p = { ...DEFAULT_LEAF_OUTLINE, ...params };
  const y = leafHeightAt(v, p);
  let x = leafHalfWidth(v, p) * side;
  x *= side >= 0 ? 1 + p.asymmetry : 1 - p.asymmetry;
  x += p.skew * (y / Math.max(1e-6, p.radius * p.heightScale));
  return { x, y };
}

/**
 * Closed outline: bottom tip → right edge → top tip → left edge → bottom.
 */
export function sampleLeafOutline(params = {}) {
  const p = { ...DEFAULT_LEAF_OUTLINE, ...params };
  const resolution = Math.max(8, Math.floor(p.resolution));
  const points = [];

  for (let i = 0; i <= resolution; i++) {
    const v = i / resolution;
    points.push(leafEdgePoint(v, 1, p));
  }
  for (let i = resolution - 1; i >= 1; i--) {
    const v = i / resolution;
    points.push(leafEdgePoint(v, -1, p));
  }

  return points;
}

/** Polygon centroid (area-weighted) for centering the leaf. */
export function outlineCentroid(points) {
  const n = points.length;
  if (n < 3) return { x: 0, y: 0 };

  let area2 = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  if (Math.abs(area2) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const pt of points) {
      sx += pt.x;
      sy += pt.y;
    }
    return { x: sx / n, y: sy / n };
  }

  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}
