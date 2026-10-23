/** Ardeidae IMU over WebSocket — same stream as cartografias-imposibles. */
export const ROTATION_MODES = {
  EULER: "euler",
  QUATERNION: "quaternion",
};

export const ROTATION_TARGETS = {
  CAMERA: "camera",
  MODEL: "model",
};

export const sensorParams = {
  enabled: false,
  url: "ws://127.0.0.1:8080",
  connected: false,
  applyRotation: true,
  rotationTarget: ROTATION_TARGETS.CAMERA,
  applyPosition: true,
  rotationMode: ROTATION_MODES.QUATERNION,
  useOffsetAngles: true,
  useGyroAssist: true,
  /** 0 keeps today's rotation feel. Negative is slower, positive is faster. */
  rotationRate: 0,
  rotationSensitivity: 1.2,
  positionSensitivity: 0.315,
  gyroSensitivity: 0.0004,
  smoothing: 0.02,
  distanceZoomEnabled: true,
  distanceSensitivity: 2.3,
  distanceThreshold: 2,
  distanceSmoothing: 0.12,
  disableOrbitWhileActive: false,
  disableWalkWhileActive: false,
};

export const DEG = Math.PI / 180;

/** Sensitivity at rotationRate 0 — the previous default of 1.2. */
export const ROTATION_RATE_BASE = 1.2;

const SENSOR_PERSIST_KEYS = [
  "enabled",
  "url",
  "applyRotation",
  "rotationTarget",
  "applyPosition",
  "rotationMode",
  "useOffsetAngles",
  "useGyroAssist",
  "rotationRate",
  "positionSensitivity",
  "gyroSensitivity",
  "smoothing",
  "distanceZoomEnabled",
  "distanceSensitivity",
  "distanceThreshold",
  "distanceSmoothing",
  "disableOrbitWhileActive",
  "disableWalkWhileActive",
];

const SENSOR_DEFAULTS = Object.fromEntries(
  SENSOR_PERSIST_KEYS.map((key) => [key, sensorParams[key]])
);

/** Half speed at -1, the current feel at 0, double speed at +1. */
export function effectiveRotationSensitivity(rate = sensorParams.rotationRate) {
  const clamped = Number.isFinite(rate) ? Math.min(1, Math.max(-1, rate)) : 0;
  return ROTATION_RATE_BASE * 2 ** clamped;
}

export function serializeSensorSettings() {
  return Object.fromEntries(SENSOR_PERSIST_KEYS.map((key) => [key, sensorParams[key]]));
}

export function applySensorSettings(saved) {
  const source = saved && typeof saved === "object" ? saved : SENSOR_DEFAULTS;
  for (const key of SENSOR_PERSIST_KEYS) {
    if (source[key] !== undefined) sensorParams[key] = source[key];
  }
  if (!Number.isFinite(sensorParams.rotationRate)) sensorParams.rotationRate = 0;
  sensorParams.rotationRate = Math.min(1, Math.max(-1, sensorParams.rotationRate));
}

export function resetSensorSettings() {
  applySensorSettings(SENSOR_DEFAULTS);
}
