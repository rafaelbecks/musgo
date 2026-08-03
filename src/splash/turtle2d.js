/**
 * Planar turtle interpreter for splash L-systems.
 * Same command subset as the 3D turtle (F + − [ ]), projected to 2D.
 *
 * @param {string} product
 * @param {object} opts
 * @param {number} opts.angleDeg
 * @param {number} [opts.step=1]
 * @param {number} [opts.heading=Math.PI/2]  start heading (+Y / up)
 * @returns {{ segs: Float32Array, bounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } }}
 */
export function interpretTurtle2d(product, opts = {}) {
  const step = Math.max(1e-6, opts.step ?? 1);
  const angle = ((opts.angleDeg ?? 25) * Math.PI) / 180;
  let heading = opts.heading ?? Math.PI / 2;
  let x = 0;
  let y = 0;

  const s = product ?? "";
  // Pre-count F so we allocate once (avoids grow+copy on large products)
  let fCount = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 70) fCount++; // 'F'
  }

  const segs = new Float32Array(fCount * 4);
  let len = 0;
  const stack = new Float64Array(256 * 3);
  let sp = 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function touch(px, py) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  touch(0, 0);

  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    // F=70 f=102 +=43 -=45 [=91 ]=93 |=124
    if (ch === 70) {
      const nx = x + Math.cos(heading) * step;
      const ny = y + Math.sin(heading) * step;
      segs[len++] = x;
      segs[len++] = y;
      segs[len++] = nx;
      segs[len++] = ny;
      x = nx;
      y = ny;
      touch(x, y);
    } else if (ch === 102) {
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      touch(x, y);
    } else if (ch === 43) {
      heading += angle;
    } else if (ch === 45) {
      heading -= angle;
    } else if (ch === 124) {
      heading += Math.PI;
    } else if (ch === 91) {
      if (sp + 3 > stack.length) continue;
      stack[sp++] = x;
      stack[sp++] = y;
      stack[sp++] = heading;
    } else if (ch === 93) {
      if (sp < 3) continue;
      heading = stack[--sp];
      y = stack[--sp];
      x = stack[--sp];
    }
  }

  if (!Number.isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }

  return {
    segs: len === segs.length ? segs : segs.subarray(0, len),
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}
