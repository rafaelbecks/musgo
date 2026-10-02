import * as THREE from "three";

const _vertex = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _avgNormal = new THREE.Vector3();
const _areaCenter = new THREE.Vector3();
const _drag = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/** SculptGL / three.js Sculptor cubic falloff. */
function falloff(dist) {
  const d2 = dist * dist;
  return 3 * d2 * d2 - 4 * d2 * dist + 1;
}

/**
 * Detail sharpens the brush (higher = more localized). Remeshing from the
 * three.js Sculptor is not ported — this approximates the control.
 */
function detailFalloff(dist, detail = 0.75) {
  const f = falloff(dist);
  if (detail <= 0) return f * f; // softer
  return Math.pow(f, 1 + detail * 2);
}

/**
 * Mirror a local-space point across enabled symmetry axes (up to 8 points).
 */
export function calculateSymmetryPoints(localPoint, symmetryAxes) {
  const points = [localPoint.clone()];
  if (!symmetryAxes?.x && !symmetryAxes?.y && !symmetryAxes?.z) return points;

  const configs = [];
  if (symmetryAxes.x) configs.push({ x: true, y: false, z: false });
  if (symmetryAxes.y) configs.push({ x: false, y: true, z: false });
  if (symmetryAxes.z) configs.push({ x: false, y: false, z: true });
  if (symmetryAxes.x && symmetryAxes.y) configs.push({ x: true, y: true, z: false });
  if (symmetryAxes.x && symmetryAxes.z) configs.push({ x: true, y: false, z: true });
  if (symmetryAxes.y && symmetryAxes.z) configs.push({ x: false, y: true, z: true });
  if (symmetryAxes.x && symmetryAxes.y && symmetryAxes.z) {
    configs.push({ x: true, y: true, z: true });
  }

  for (const config of configs) {
    const mirrorPoint = localPoint.clone();
    if (config.x) mirrorPoint.x = -mirrorPoint.x;
    if (config.y) mirrorPoint.y = -mirrorPoint.y;
    if (config.z) mirrorPoint.z = -mirrorPoint.z;
    points.push(mirrorPoint);
  }
  return points;
}

function mirrorVector(vec, mirrorConfig) {
  if (!mirrorConfig) return vec;
  if (mirrorConfig.x) vec.x = -vec.x;
  if (mirrorConfig.y) vec.y = -vec.y;
  if (mirrorConfig.z) vec.z = -vec.z;
  return vec;
}

function mirrorConfigFor(symPoint, clickPoint) {
  return {
    x: Math.sign(symPoint.x) !== Math.sign(clickPoint.x),
    y: Math.sign(symPoint.y) !== Math.sign(clickPoint.y),
    z: Math.sign(symPoint.z) !== Math.sign(clickPoint.z),
  };
}

/** Indexed adjacency for laplacian smooth (cached on geometry.userData). */
export function getVertexAdjacency(geometry) {
  if (geometry.userData.sculptAdjacency?.version === geometry.id) {
    return geometry.userData.sculptAdjacency.list;
  }
  const pos = geometry.attributes.position;
  const count = pos.count;
  const list = Array.from({ length: count }, () => []);
  const add = (a, b) => {
    if (a === b) return;
    if (!list[a].includes(b)) list[a].push(b);
    if (!list[b].includes(a)) list[b].push(a);
  };

  const index = geometry.index;
  if (index) {
    const arr = index.array;
    for (let i = 0; i < arr.length; i += 3) {
      add(arr[i], arr[i + 1]);
      add(arr[i + 1], arr[i + 2]);
      add(arr[i + 2], arr[i]);
    }
  } else {
    for (let i = 0; i + 2 < count; i += 3) {
      add(i, i + 1);
      add(i + 1, i + 2);
      add(i + 2, i);
    }
  }

  geometry.userData.sculptAdjacency = { version: geometry.id, list };
  return list;
}

function collectBrushVerts(basePositions, symPoint, brushSize) {
  const verts = [];
  const vertexCount = (basePositions.length / 3) | 0;
  const radius2 = brushSize * brushSize;
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3;
    const dx = basePositions[i3] - symPoint.x;
    const dy = basePositions[i3 + 1] - symPoint.y;
    const dz = basePositions[i3 + 2] - symPoint.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= radius2) continue;
    verts.push({ i, i3, dist: Math.sqrt(d2) / brushSize });
  }
  return verts;
}

function averageNormal(basePositions, normals, verts) {
  _avgNormal.set(0, 0, 0);
  if (!normals || !verts.length) {
    _avgNormal.set(0, 1, 0);
    return _avgNormal;
  }
  const nArr = normals.array;
  for (const { i3 } of verts) {
    _avgNormal.x += nArr[i3];
    _avgNormal.y += nArr[i3 + 1];
    _avgNormal.z += nArr[i3 + 2];
  }
  if (_avgNormal.lengthSq() > 0) _avgNormal.normalize();
  else _avgNormal.set(0, 1, 0);
  return _avgNormal;
}

function averageCenter(basePositions, verts) {
  _areaCenter.set(0, 0, 0);
  if (!verts.length) return _areaCenter;
  for (const { i3 } of verts) {
    _areaCenter.x += basePositions[i3];
    _areaCenter.y += basePositions[i3 + 1];
    _areaCenter.z += basePositions[i3 + 2];
  }
  _areaCenter.multiplyScalar(1 / verts.length);
  return _areaCenter;
}

function applyBrush(basePositions, verts, normal, strength, brushSize, negative, detail) {
  let deform = strength * brushSize * 0.1;
  if (negative) deform = -deform;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const f = detailFalloff(dist, detail) * deform;
    basePositions[i3] += normal.x * f;
    basePositions[i3 + 1] += normal.y * f;
    basePositions[i3 + 2] += normal.z * f;
  }
}

function applyInflate(basePositions, normals, verts, strength, brushSize, negative, detail) {
  if (!normals) return;
  let deform = strength * brushSize * 0.1;
  if (negative) deform = -deform;
  const nArr = normals.array;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    let f = detailFalloff(dist, detail) * deform;
    _normal.set(nArr[i3], nArr[i3 + 1], nArr[i3 + 2]);
    const len = _normal.length();
    if (len > 0) f /= len;
    basePositions[i3] += nArr[i3] * f;
    basePositions[i3 + 1] += nArr[i3 + 1] * f;
    basePositions[i3 + 2] += nArr[i3 + 2] * f;
  }
}

function applyFlatten(basePositions, verts, planeNormal, planePoint, strength, negative, detail) {
  const comp = negative ? -1 : 1;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const vx = basePositions[i3];
    const vy = basePositions[i3 + 1];
    const vz = basePositions[i3 + 2];
    const distToPlane =
      (vx - planePoint.x) * planeNormal.x +
      (vy - planePoint.y) * planeNormal.y +
      (vz - planePoint.z) * planeNormal.z;
    if (distToPlane * comp > 0) continue;
    const f = detailFalloff(dist, detail) * distToPlane * strength;
    basePositions[i3] -= planeNormal.x * f;
    basePositions[i3 + 1] -= planeNormal.y * f;
    basePositions[i3 + 2] -= planeNormal.z * f;
  }
}

function applyClay(basePositions, verts, planeNormal, planePoint, brushSize, strength, negative, detail) {
  // Clay = flatten toward a plane offset along the normal (Sculptor).
  const offset = brushSize * 0.1 * (negative ? -1 : 1);
  _tmp.copy(planePoint).addScaledVector(planeNormal, offset);
  applyFlatten(basePositions, verts, planeNormal, _tmp, strength, negative, detail);
}

function applySmooth(basePositions, verts, adjacency, strength) {
  const intensity = Math.min(strength, 1);
  if (intensity <= 0 || !verts.length) return;
  const updates = [];
  for (const { i, i3 } of verts) {
    const ring = adjacency?.[i];
    if (!ring?.length) continue;
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const n of ring) {
      const n3 = n * 3;
      ax += basePositions[n3];
      ay += basePositions[n3 + 1];
      az += basePositions[n3 + 2];
    }
    const inv = 1 / ring.length;
    updates.push({
      i3,
      x: basePositions[i3] * (1 - intensity) + ax * inv * intensity,
      y: basePositions[i3 + 1] * (1 - intensity) + ay * inv * intensity,
      z: basePositions[i3 + 2] * (1 - intensity) + az * inv * intensity,
    });
  }
  for (const u of updates) {
    basePositions[u.i3] = u.x;
    basePositions[u.i3 + 1] = u.y;
    basePositions[u.i3 + 2] = u.z;
  }
}

function applyPinch(basePositions, verts, center, strength, negative, detail) {
  let deform = strength * 0.05;
  if (negative) deform = -deform;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const f = detailFalloff(dist, detail) * deform;
    const vx = basePositions[i3];
    const vy = basePositions[i3 + 1];
    const vz = basePositions[i3 + 2];
    basePositions[i3] = vx + (center.x - vx) * f;
    basePositions[i3 + 1] = vy + (center.y - vy) * f;
    basePositions[i3 + 2] = vz + (center.z - vz) * f;
  }
}

function applyCrease(basePositions, verts, normal, center, brushSize, strength, negative, detail) {
  const deform = strength * 0.07;
  let brushFactor = deform * brushSize;
  if (negative) brushFactor = -brushFactor;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const f = detailFalloff(dist, detail);
    const pinchF = f * deform;
    const brushMod = Math.pow(f, 5) * brushFactor;
    const vx = basePositions[i3];
    const vy = basePositions[i3 + 1];
    const vz = basePositions[i3 + 2];
    basePositions[i3] = vx + (center.x - vx) * pinchF + normal.x * brushMod;
    basePositions[i3 + 1] = vy + (center.y - vy) * pinchF + normal.y * brushMod;
    basePositions[i3 + 2] = vz + (center.z - vz) * pinchF + normal.z * brushMod;
  }
}

function applyDrag(basePositions, verts, center, dragDir, detail) {
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const f = detailFalloff(dist, detail);
    basePositions[i3] += dragDir.x * f;
    basePositions[i3 + 1] += dragDir.y * f;
    basePositions[i3 + 2] += dragDir.z * f;
  }
}

function applyScale(basePositions, verts, center, scaleDelta, detail) {
  const scale = scaleDelta * 0.01;
  for (const { i3, dist } of verts) {
    if (dist >= 1) continue;
    const f = detailFalloff(dist, detail) * scale;
    const vx = basePositions[i3];
    const vy = basePositions[i3 + 1];
    const vz = basePositions[i3 + 2];
    basePositions[i3] = vx + (vx - center.x) * f;
    basePositions[i3 + 1] = vy + (vy - center.y) * f;
    basePositions[i3 + 2] = vz + (vz - center.z) * f;
  }
}

/**
 * Apply a sculpt stroke (three.js Sculptor / SculptGL brush model + symmetry).
 *
 * @param {object} params
 * @param {Float32Array} params.basePositions
 * @param {THREE.BufferAttribute | null} [params.normals]
 * @param {THREE.BufferGeometry | null} [params.geometry] needed for smooth adjacency
 * @param {THREE.Vector3} params.clickPoint
 * @param {string} params.tool
 * @param {number} params.brushSize
 * @param {number} params.brushStrength
 * @param {number} [params.detail]
 * @param {{ x: boolean, y: boolean, z: boolean }} params.symmetryAxes
 * @param {THREE.Vector3 | null} [params.previousPoint]
 * @param {number} [params.scaleDelta] pointer delta for scale tool
 * @param {boolean} [params.invert]
 * @returns {boolean}
 */
export function applySculptStroke({
  basePositions,
  normals = null,
  geometry = null,
  clickPoint,
  tool,
  brushSize,
  brushStrength,
  detail = 0.75,
  symmetryAxes,
  previousPoint = null,
  scaleDelta = 0,
  invert = false,
}) {
  if (!basePositions?.length || brushSize <= 0) return false;

  // Legacy aliases from earlier toolbar
  let resolved = tool;
  if (tool === "add") resolved = "inflate";
  if (tool === "subtract") {
    resolved = "inflate";
    invert = !invert;
  }
  if (tool === "push") resolved = "drag";

  const needsMotion = resolved === "drag" || resolved === "scale";
  if (needsMotion && !previousPoint && resolved === "drag") return false;
  if (resolved === "scale" && scaleDelta === 0) return false;

  const symmetryPoints = calculateSymmetryPoints(clickPoint, symmetryAxes);
  const adjacency = resolved === "smooth" && geometry ? getVertexAdjacency(geometry) : null;
  let modified = false;

  for (let symIdx = 0; symIdx < symmetryPoints.length; symIdx++) {
    const symPoint = symmetryPoints[symIdx];
    const isOriginal = symIdx === 0;
    const mirrorConfig = isOriginal ? null : mirrorConfigFor(symPoint, clickPoint);
    const verts = collectBrushVerts(basePositions, symPoint, brushSize);
    if (!verts.length) continue;

    const n = averageNormal(basePositions, normals, verts).clone();
    mirrorVector(n, mirrorConfig);
    const c = averageCenter(basePositions, verts).clone();
    // Keep mirrored clay plane / centers on the mirrored side
    if (mirrorConfig) {
      // center already from mirrored verts
    }

    switch (resolved) {
      case "clay":
        applyClay(basePositions, verts, n, c, brushSize, brushStrength, invert, detail);
        break;
      case "brush":
        applyBrush(basePositions, verts, n, brushStrength, brushSize, invert, detail);
        break;
      case "inflate":
        applyInflate(basePositions, normals, verts, brushStrength, brushSize, invert, detail);
        break;
      case "smooth":
        applySmooth(basePositions, verts, adjacency, brushStrength);
        break;
      case "flatten":
        applyFlatten(basePositions, verts, n, c, brushStrength, invert, detail);
        break;
      case "pinch":
        applyPinch(basePositions, verts, symPoint, brushStrength, invert, detail);
        break;
      case "crease":
        applyCrease(basePositions, verts, n, symPoint, brushSize, brushStrength, invert, detail);
        break;
      case "drag": {
        if (!previousPoint) break;
        _drag.copy(clickPoint).sub(previousPoint);
        mirrorVector(_drag, mirrorConfig);
        applyDrag(basePositions, verts, symPoint, _drag, detail);
        break;
      }
      case "scale": {
        let delta = scaleDelta;
        if (mirrorConfig && (mirrorConfig.x || mirrorConfig.y || mirrorConfig.z)) {
          // keep uniform scale sign
        }
        applyScale(basePositions, verts, symPoint, delta, detail);
        break;
      }
      default:
        applyBrush(basePositions, verts, n, brushStrength, brushSize, invert, detail);
        break;
    }
    modified = true;
  }

  return modified;
}

/** Tools that ignore strength (movement-driven). */
export function toolUsesStrength(tool) {
  return tool !== "drag" && tool !== "scale" && tool !== "select";
}

/** Tools that support Shift = negative. */
export function toolUsesNegative(tool) {
  return toolUsesStrength(tool) && tool !== "smooth";
}
