import * as THREE from "three";

const _vertex = new THREE.Vector3();
const _symPoint = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _avgNormal = new THREE.Vector3();
const _tempNormal = new THREE.Vector3();
const _drag = new THREE.Vector3();

/**
 * Mirror a local-space point across enabled symmetry axes (up to 8 points).
 * @param {THREE.Vector3} localPoint
 * @param {{ x: boolean, y: boolean, z: boolean }} symmetryAxes
 * @returns {THREE.Vector3[]}
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

function calculateAverageNormal(basePositions, normals, clickPoint, brushSize, vertexCount) {
  _avgNormal.set(0, 0, 0);
  let count = 0;
  const radius = brushSize * 0.5;
  const normArray = normals?.array;

  if (!normArray) {
    _avgNormal.set(0, 1, 0);
    return _avgNormal;
  }

  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3;
    _vertex.set(basePositions[i3], basePositions[i3 + 1], basePositions[i3 + 2]);
    if (_vertex.distanceTo(clickPoint) >= radius) continue;
    _tempNormal.set(normArray[i3], normArray[i3 + 1], normArray[i3 + 2]);
    _avgNormal.add(_tempNormal);
    count += 1;
  }

  if (count > 0) _avgNormal.divideScalar(count).normalize();
  else _avgNormal.set(0, 1, 0);
  return _avgNormal;
}

function directionForTool(tool, avgNormal, clickPoint, previousPoint, mirrorConfig) {
  if (tool === "push") {
    if (!previousPoint) return null;
    _drag.copy(clickPoint).sub(previousPoint);
    if (mirrorConfig) {
      if (mirrorConfig.x) _drag.x = -_drag.x;
      if (mirrorConfig.y) _drag.y = -_drag.y;
      if (mirrorConfig.z) _drag.z = -_drag.z;
    }
    if (_drag.lengthSq() < 1e-6) return null;
    return _direction.copy(_drag).normalize();
  }

  _direction.copy(avgNormal);
  if (mirrorConfig) {
    if (mirrorConfig.x) _direction.x = -_direction.x;
    if (mirrorConfig.y) _direction.y = -_direction.y;
    if (mirrorConfig.z) _direction.z = -_direction.z;
    _direction.normalize();
  }
  return _direction;
}

/**
 * Displace base mesh positions in local space (sculpt-3D falloff model).
 * Callers should refresh live geometry / normals afterward.
 *
 * @param {object} params
 * @param {Float32Array} params.basePositions
 * @param {THREE.BufferAttribute | null} params.normals
 * @param {THREE.Vector3} params.clickPoint local hit on current surface
 * @param {"add"|"subtract"|"push"} params.tool
 * @param {number} params.brushSize local units
 * @param {number} params.brushStrength 0..1
 * @param {{ x: boolean, y: boolean, z: boolean }} params.symmetryAxes
 * @param {THREE.Vector3 | null} [params.previousPoint]
 * @param {boolean} [params.invert]
 * @returns {boolean}
 */
export function applySculptStroke({
  basePositions,
  normals = null,
  clickPoint,
  tool,
  brushSize,
  brushStrength,
  symmetryAxes,
  previousPoint = null,
  invert = false,
}) {
  if (!basePositions?.length) return false;
  const vertexCount = (basePositions.length / 3) | 0;
  const symmetryPoints = calculateSymmetryPoints(clickPoint, symmetryAxes);
  const avgNormal = calculateAverageNormal(
    basePositions,
    normals,
    clickPoint,
    brushSize,
    vertexCount
  ).clone();

  let modified = false;

  for (let symIdx = 0; symIdx < symmetryPoints.length; symIdx++) {
    const symPoint = symmetryPoints[symIdx];
    const isOriginal = symIdx === 0;
    const mirrorConfig = isOriginal
      ? null
      : {
          x: Math.sign(symPoint.x) !== Math.sign(clickPoint.x),
          y: Math.sign(symPoint.y) !== Math.sign(clickPoint.y),
          z: Math.sign(symPoint.z) !== Math.sign(clickPoint.z),
        };

    const direction = directionForTool(
      tool,
      avgNormal,
      clickPoint,
      previousPoint,
      mirrorConfig
    );
    if (!direction) continue;

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      _vertex.set(basePositions[i3], basePositions[i3 + 1], basePositions[i3 + 2]);
      const distance = _vertex.distanceTo(symPoint);
      if (distance >= brushSize) continue;

      const falloff = 1 - distance / brushSize;
      let strength = brushStrength * falloff * falloff * 0.02;

      if (tool === "push") {
        const moveDistance = previousPoint ? clickPoint.distanceTo(previousPoint) : 0;
        strength *= Math.min(moveDistance * 250, 50);
        if (invert) strength = -strength;
      } else {
        if (tool === "subtract") strength = -strength;
        if (invert) strength = -strength;
      }

      _vertex.addScaledVector(direction, strength);
      basePositions[i3] = _vertex.x;
      basePositions[i3 + 1] = _vertex.y;
      basePositions[i3 + 2] = _vertex.z;
      modified = true;
    }
  }

  return modified;
}
