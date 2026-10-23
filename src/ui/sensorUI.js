import { ROTATION_MODES, ROTATION_TARGETS, sensorParams } from "../sensor/sensorConfig.js";
import { syncOrganismDirty } from "../morphogenesis/organismState.js";

const ROTATION_MODE_OPTIONS = {
  Euler: ROTATION_MODES.EULER,
  Quaternion: ROTATION_MODES.QUATERNION,
};

const ROTATION_TARGET_OPTIONS = {
  Camera: ROTATION_TARGETS.CAMERA,
  Model: ROTATION_TARGETS.MODEL,
};

export function setupSensorUI(parent, { pane, sensorClient, sensorController }) {
  const folder = parent.addFolder({ title: "Sensor (Ardeidae)", expanded: false });

  function applyActiveState(active) {
    sensorController.setActive(active);
  }

  function setActive(active) {
    sensorParams.enabled = active;
    applyActiveState(active);
    pane.refresh();
  }

  function markEdited() {
    syncOrganismDirty();
  }

  folder.addBinding(sensorParams, "enabled", { label: "active" }).on("change", (e) => {
    applyActiveState(e.value);
    markEdited();
  });

  folder.addBinding(sensorParams, "url", { label: "websocket" }).on("change", markEdited);

  folder.addBinding(sensorParams, "connected", {
    label: "connected",
    readonly: true,
  });

  folder.addButton({ title: "Connect" }).on("click", () => {
    sensorClient.connect(sensorParams.url);
  });

  folder.addButton({ title: "Disconnect" }).on("click", () => {
    sensorClient.disconnect();
    sensorController.setActive(false);
    sensorParams.enabled = false;
    pane.refresh();
  });

  folder.addButton({ title: "Calibrate (zero pose)" }).on("click", () => {
    sensorController.calibrate(sensorClient.getState());
  });

  folder.addButton({ title: "Reset pose" }).on("click", () => {
    sensorController.resetOrientation();
  });

  const mapping = folder.addFolder({ title: "Mapping", expanded: true });

  mapping.addBinding(sensorParams, "applyRotation", { label: "rotation" }).on("change", markEdited);
  mapping.addBinding(sensorParams, "rotationTarget", {
    label: "rotation target",
    options: ROTATION_TARGET_OPTIONS,
  }).on("change", () => {
    if (sensorParams.enabled) {
      sensorController.calibrate(sensorClient.getState());
    }
    markEdited();
  });
  mapping.addBinding(sensorParams, "rotationMode", {
    label: "rotation mode",
    options: ROTATION_MODE_OPTIONS,
  }).on("change", markEdited);
  mapping.addBinding(sensorParams, "rotationRate", {
    label: "speed",
    min: -1,
    max: 1,
    step: 0.05,
  }).on("change", markEdited);
  mapping.addBinding(sensorParams, "applyPosition", { label: "position (accel)" }).on("change", markEdited);
  mapping.addBinding(sensorParams, "useOffsetAngles", {
    label: "use offset angles",
  }).on("change", markEdited);
  mapping.addBinding(sensorParams, "useGyroAssist", {
    label: "gyro assist",
  }).on("change", markEdited);

  mapping.addBinding(sensorParams, "positionSensitivity", {
    label: "position",
    min: 0,
    max: 0.5,
    step: 0.005,
  }).on("change", markEdited);

  mapping.addBinding(sensorParams, "gyroSensitivity", {
    label: "gyro",
    min: 0,
    max: 0.005,
    step: 0.0001,
  }).on("change", markEdited);

  mapping.addBinding(sensorParams, "smoothing", {
    min: 0.02,
    max: 0.5,
    step: 0.01,
  }).on("change", markEdited);

  const distance = folder.addFolder({ title: "Distance (TF-Luna)", expanded: false });

  distance.addBinding(sensorParams, "distanceZoomEnabled", { label: "zoom" }).on("change", markEdited);

  distance.addBinding(sensorParams, "distanceSensitivity", {
    label: "sensitivity",
    min: 0.1,
    max: 3,
    step: 0.05,
  }).on("change", markEdited);

  distance.addBinding(sensorParams, "distanceThreshold", {
    label: "threshold (cm)",
    min: 0,
    max: 20,
    step: 1,
  }).on("change", markEdited);

  distance.addBinding(sensorParams, "distanceSmoothing", {
    label: "smoothing",
    min: 0.05,
    max: 0.8,
    step: 0.01,
  }).on("change", markEdited);

  const nav = folder.addFolder({ title: "While active", expanded: false });

  nav.addBinding(sensorParams, "disableOrbitWhileActive", { label: "lock orbit" }).on("change", markEdited);
  nav.addBinding(sensorParams, "disableWalkWhileActive", { label: "lock WASD" }).on("change", markEdited);

  return {
    setActive,
    onStatus({ connected }) {
      sensorParams.connected = connected;
      pane.refresh();
    },
  };
}
