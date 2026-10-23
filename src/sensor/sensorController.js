import * as THREE from "three";
import {
  DEG,
  ROTATION_MODES,
  ROTATION_TARGETS,
  effectiveRotationSensitivity,
  sensorParams,
} from "./sensorConfig.js";
import { createDistanceZoom } from "./sensorDistanceZoom.js";

function smoothFactor(rate, delta) {
  return 1 - Math.exp(-rate * delta * 60);
}

export function createSensorController({
  getModel,
  controls,
  input,
  setExternalTransform,
  onReleaseModel,
}) {
  const camera = controls.object;
  const applyDistanceZoom = createDistanceZoom();
  const targetRotation = new THREE.Euler(0, 0, 0, "YXZ");
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const homeRotation = new THREE.Euler();
  const homePosition = new THREE.Vector3();
  const homeQuaternion = new THREE.Quaternion();
  const homeOffset = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const orbitEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const orbitQuat = new THREE.Quaternion();
  const baselineQuat = new THREE.Quaternion();
  const sensorQuat = new THREE.Quaternion();
  const deltaQuat = new THREE.Quaternion();
  const scaledDeltaQuat = new THREE.Quaternion();
  const deltaAxis = new THREE.Vector3();

  let baseline = null;
  let calibrated = false;
  let savedOrbitEnabled = true;
  let lastState = null;
  let smoothedDistance = null;
  let boundModel = null;
  let externalRotation = false;
  let externalPosition = false;

  function getAngles(state) {
    if (sensorParams.useOffsetAngles) {
      return { x: state.offsetx, y: state.offsety, z: state.offsetz };
    }
    return { x: state.angx, y: state.angy, z: state.angz };
  }

  function getSensorQuaternion(state) {
    sensorQuat.set(state.qx, state.qy, state.qz, state.qw);
    if (sensorQuat.lengthSq() < 1e-8) {
      sensorQuat.set(0, 0, 0, 1);
    }
    sensorQuat.normalize();
    return sensorQuat;
  }

  function scaleQuaternionDelta(source, factor) {
    if (factor <= 0) return scaledDeltaQuat.identity();

    const angle = 2 * Math.acos(THREE.MathUtils.clamp(source.w, -1, 1));
    if (angle < 1e-6) return scaledDeltaQuat.identity();

    deltaAxis.set(source.x, source.y, source.z);
    if (deltaAxis.lengthSq() < 1e-8) return scaledDeltaQuat.identity();
    deltaAxis.normalize();

    return scaledDeltaQuat.setFromAxisAngle(deltaAxis, angle * factor);
  }

  function captureHomePose() {
    const model = getModel();
    boundModel = model ?? null;
    if (model) {
      homeRotation.copy(model.rotation);
      homePosition.copy(model.position);
      homeQuaternion.copy(model.quaternion);
      targetRotation.copy(homeRotation);
      targetPosition.copy(homePosition);
      targetQuaternion.copy(homeQuaternion);
    }

    homeOffset.subVectors(camera.position, controls.target);
    if (homeOffset.lengthSq() < 1e-8) {
      homeOffset.set(0, 0, 1);
    }
  }

  function calibrate(state) {
    if (!state) return;
    const angles = getAngles(state);
    baseline = { x: angles.x, y: angles.y, z: angles.z };
    baselineQuat.copy(getSensorQuaternion(state));
    calibrated = true;
    captureHomePose();
  }

  function setNavigationLocked(locked) {
    if (sensorParams.disableOrbitWhileActive) {
      if (locked) savedOrbitEnabled = controls.enabled;
      controls.enabled = locked ? false : savedOrbitEnabled;
    }
    if (sensorParams.disableWalkWhileActive && input?.setWalkEnabled) {
      input.setWalkEnabled(!locked);
    }
  }

  function ownsModel() {
    return (
      sensorParams.enabled &&
      sensorParams.rotationTarget === ROTATION_TARGETS.MODEL
    );
  }

  function syncExternalTransform() {
    const rotation = ownsModel() && sensorParams.applyRotation;
    const position = ownsModel() && sensorParams.applyPosition;
    const releaseRotation = externalRotation && !rotation;
    const releasePosition = externalPosition && !position;
    externalRotation = rotation;
    externalPosition = position;
    setExternalTransform?.({ rotation, position });
    if (releaseRotation || releasePosition) onReleaseModel?.();
  }

  function setActive(active) {
    sensorParams.enabled = active;
    if (!active) {
      calibrated = false;
      baseline = null;
      smoothedDistance = null;
      setNavigationLocked(false);
    } else {
      setNavigationLocked(true);
    }
    syncExternalTransform();
  }

  function computeEulerTargets(state, delta) {
    const angles = getAngles(state);
    const rot = effectiveRotationSensitivity() * DEG;
    const pitch = (angles.y - baseline.y) * rot;
    const roll = (angles.x - baseline.x) * rot;
    const yaw = (angles.z - baseline.z) * rot;

    targetRotation.set(
      homeRotation.x + pitch,
      homeRotation.y + yaw,
      homeRotation.z + roll
    );

    orbitEuler.set(pitch, yaw, roll);

    if (sensorParams.useGyroAssist) {
      const g = sensorParams.gyroSensitivity * delta;
      targetRotation.x += state.gy * g;
      targetRotation.y += state.gz * g;
      targetRotation.z += state.gx * g;
      orbitEuler.x += state.gy * g;
      orbitEuler.y += state.gz * g;
      orbitEuler.z += state.gx * g;
    }
  }

  function computeQuaternionTargets(state) {
    deltaQuat.copy(baselineQuat).invert().multiply(getSensorQuaternion(state));
    if (deltaQuat.w < 0) {
      deltaQuat.set(-deltaQuat.x, -deltaQuat.y, -deltaQuat.z, -deltaQuat.w);
    }
    const scaled = scaleQuaternionDelta(deltaQuat, effectiveRotationSensitivity());
    targetQuaternion.copy(homeQuaternion).multiply(scaled);
    orbitQuat.copy(scaled);
  }

  function computePositionTargets(state) {
    if (sensorParams.applyPosition) {
      const p = sensorParams.positionSensitivity;
      targetPosition.set(
        homePosition.x + state.ay * p,
        homePosition.y + (state.az - 1) * p * 2,
        homePosition.z - state.ax * p
      );
    } else {
      targetPosition.copy(homePosition);
    }
  }

  function computeTargets(state, delta) {
    if (!baseline) return;

    if (sensorParams.rotationMode === ROTATION_MODES.QUATERNION) {
      computeQuaternionTargets(state);
    } else {
      computeEulerTargets(state, delta);
    }

    computePositionTargets(state);
  }

  function applyCameraOrbitRotation(t) {
    orbitOffset.copy(homeOffset);

    if (sensorParams.rotationMode === ROTATION_MODES.QUATERNION) {
      orbitOffset.applyQuaternion(orbitQuat);
    } else {
      scaledDeltaQuat.setFromEuler(orbitEuler);
      orbitOffset.applyQuaternion(scaledDeltaQuat);
    }

    cameraOffset.subVectors(camera.position, controls.target);
    const currentDist = cameraOffset.length();
    const desiredDist = orbitOffset.length();
    const keepDist = currentDist > 1e-6 ? currentDist : desiredDist;
    if (keepDist < 1e-6 || orbitOffset.lengthSq() < 1e-8) return;

    orbitOffset.setLength(keepDist);
    if (cameraOffset.lengthSq() < 1e-8) cameraOffset.copy(orbitOffset);
    else cameraOffset.lerp(orbitOffset, t).setLength(keepDist);

    camera.position.copy(controls.target).add(cameraOffset);
    camera.lookAt(controls.target);
  }

  function applyModelRotation(model, t) {
    if (sensorParams.rotationMode === ROTATION_MODES.QUATERNION) {
      model.quaternion.slerp(targetQuaternion, t);
    } else {
      model.rotation.x += (targetRotation.x - model.rotation.x) * t;
      model.rotation.y += (targetRotation.y - model.rotation.y) * t;
      model.rotation.z += (targetRotation.z - model.rotation.z) * t;
    }
  }

  function filterSensorDistance(raw, delta) {
    if (smoothedDistance === null) return raw;

    const deadzone = sensorParams.distanceThreshold;
    const deltaCm = raw - smoothedDistance;
    const target = Math.abs(deltaCm) < deadzone ? smoothedDistance : raw;
    const blend = smoothFactor(sensorParams.distanceSmoothing * 1.4, delta);
    return smoothedDistance + (target - smoothedDistance) * blend;
  }

  function handleDistanceZoom(state, delta) {
    if (!sensorParams.distanceZoomEnabled || state.distance == null) return;

    smoothedDistance = filterSensorDistance(state.distance, delta);

    applyDistanceZoom({
      camera,
      controls,
      sensorDistance: smoothedDistance,
      delta,
      sensitivity: sensorParams.distanceSensitivity,
      smoothing: sensorParams.distanceSmoothing,
    });
  }

  function handleState(state) {
    lastState = state;
  }

  function update(delta) {
    syncExternalTransform();
    if (!sensorParams.enabled) return;

    const model = getModel();
    if (!model) return;
    if (model !== boundModel) captureHomePose();

    const state = lastState;

    if (state?.distanceAt) {
      handleDistanceZoom(state, delta);
    }

    if (!state?.updatedAt) return;

    if (!calibrated) {
      calibrate(state);
      return;
    }

    computeTargets(state, delta);

    const t = smoothFactor(sensorParams.smoothing * 4, delta);

    if (sensorParams.applyRotation) {
      if (sensorParams.rotationTarget === ROTATION_TARGETS.CAMERA) {
        applyCameraOrbitRotation(t);
      } else {
        applyModelRotation(model, t);
      }
    }

    if (sensorParams.applyPosition && sensorParams.rotationTarget === ROTATION_TARGETS.MODEL) {
      model.position.x += (targetPosition.x - model.position.x) * t;
      model.position.y += (targetPosition.y - model.position.y) * t;
      model.position.z += (targetPosition.z - model.position.z) * t;
    }
  }

  function resetOrientation() {
    const model = getModel();
    if (!model) return;

    model.rotation.copy(homeRotation);
    model.quaternion.copy(homeQuaternion);
    model.position.copy(homePosition);
    targetRotation.copy(homeRotation);
    targetQuaternion.copy(homeQuaternion);
    targetPosition.copy(homePosition);

    camera.position.copy(controls.target).add(homeOffset);
    camera.lookAt(controls.target);

    calibrated = false;
    baseline = null;
    smoothedDistance = null;
  }

  return {
    setActive,
    handleState,
    update,
    calibrate,
    resetOrientation,
    setNavigationLocked,
  };
}
