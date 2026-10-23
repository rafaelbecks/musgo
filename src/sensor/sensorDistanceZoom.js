import * as THREE from "three";

const SENSOR_RANGE = 200;
const FALLBACK_MIN_DISTANCE = 0.15;
const FALLBACK_MAX_DISTANCE = 12;

function smoothFactor(rate, delta) {
  return 1 - Math.exp(-rate * delta * 60);
}

/**
 * Map TF-Luna distance (0 = close, 200 = far) to orbit camera distance.
 * Returns a stateful applier so target distance eases continuously frame to frame.
 */
export function createDistanceZoom() {
  let easedTarget = null;
  const offset = new THREE.Vector3();

  return function applyDistanceZoom({
    camera,
    controls,
    sensorDistance,
    delta,
    sensitivity,
    smoothing,
  }) {
    let minDist = controls.minDistance ?? 0;
    let maxDist = controls.maxDistance ?? Infinity;
    if (!Number.isFinite(maxDist) || maxDist - minDist < 1e-6) {
      minDist = FALLBACK_MIN_DISTANCE;
      maxDist = FALLBACK_MAX_DISTANCE;
    }
    const range = maxDist - minDist;
    if (range < 1e-6) return;

    const normalized = THREE.MathUtils.clamp(sensorDistance / SENSOR_RANGE, 0, 1);
    const t = THREE.MathUtils.clamp(normalized * sensitivity, 0, 1);
    const mappedTarget = minDist + t * range;

    offset.subVectors(camera.position, controls.target);
    const currentDistance = offset.length();
    if (currentDistance < 1e-6) return;

    if (easedTarget === null) easedTarget = mappedTarget;

    const targetBlend = smoothFactor(smoothing * 1.6, delta);
    easedTarget += (mappedTarget - easedTarget) * targetBlend;

    const cameraBlend = smoothFactor(smoothing, delta);
    const newDistance = THREE.MathUtils.clamp(
      currentDistance + (easedTarget - currentDistance) * cameraBlend,
      minDist,
      maxDist
    );

    offset.setLength(newDistance);
    camera.position.copy(controls.target).add(offset);
  };
}
