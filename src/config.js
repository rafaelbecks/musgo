export const DEFAULT_ENV = "none";

export const HDR_ENVIRONMENTS = {
  none: { label: "None (studio lights)", file: null },
  industrial_sunset: {
    label: "Industrial Sunset",
    file: "industrial_sunset_02_puresky_1k.hdr",
  },
  aristea_wreck: {
    label: "Aristea Wreck",
    file: "aristea_wreck_puresky_1k.hdr",
  },
  rosendal_park: {
    label: "Rosendal Park Sunset",
    file: "rosendal_park_sunset_puresky_1k.hdr",
  },
  qwantani_sunset: {
    label: "Qwantani Sunset",
    file: "qwantani_sunset_puresky_1k.hdr",
  },
  qwantani_night: {
    label: "Qwantani Night",
    file: "qwantani_night_puresky_1k.hdr",
  },
  // From cartografias-imposibles env/exr (1–7)
  exr_1: { label: "Calle (EXR)", file: "exr/1.jpg_env.exr", format: "exr" },
  exr_2: { label: "Lámpara (EXR)", file: "exr/2_env.exr", format: "exr" },
  exr_3: { label: "Ventana (EXR)", file: "exr/3_env.exr", format: "exr" },
  exr_4: { label: "Playa (EXR)", file: "exr/4_env.exr", format: "exr" },
  exr_5: { label: "Cielo y edificio (EXR)", file: "exr/5_env.exr", format: "exr" },
  exr_6: { label: "Puente nocturno (EXR)", file: "exr/6.jpg_env.exr", format: "exr" },
  exr_7: { label: "Árboles borrosos (EXR)", file: "exr/7_env.exr", format: "exr" },
};

export function getEnvOptions() {
  return Object.fromEntries(
    Object.entries(HDR_ENVIRONMENTS).map(([id, { label }]) => [label, id])
  );
}

export function getHdrEnvironmentIds() {
  return Object.keys(HDR_ENVIRONMENTS).filter(
    (id) => id !== "none" && HDR_ENVIRONMENTS[id]?.format !== "exr"
  );
}

export function pickRandomHdrEnvironment(excludeId = null) {
  const ids = getHdrEnvironmentIds().filter((id) => id !== excludeId);
  if (!ids.length) return "industrial_sunset";
  return ids[Math.floor(Math.random() * ids.length)];
}

export function getEnvPath(envId) {
  const env = HDR_ENVIRONMENTS[envId];
  if (!env?.file) return null;
  return `./env/${env.file}`;
}

export function getEnvFormat(envId) {
  const env = HDR_ENVIRONMENTS[envId];
  if (!env?.file) return null;
  if (env.format) return env.format;
  return env.file.endsWith(".exr") ? "exr" : "hdr";
}

export const params = {
  lightIntensity: 1.4,
  ambient: 0.6,
  exposure: 1,
  environment: DEFAULT_ENV,
  bgBlur: 0,
  showGrid: false,
  showAxes: false,
  showChamberGraph: false,
  gridSize: 20,
  gridDivisions: 20,
  moveSpeed: 2,
  fpMove: true,
  autoRotate: false,
  rotateSpeed: 0.4,
  wireframe: true,
  roughness: 0.45,
  metalness: 0.08,
  autoAnalyze: true,
  chamberFocusDistance: 1.15,
  pitchMultiplier: 1,
  playMode: "drone",
  envAttack: 0.02,
  envDecay: 0.1,
  envSustain: 0.75,
  envRelease: 0.45,
  webMidiEnabled: false,

  // Underwater — water volume around organism (no pool walls) + caustics
  uwEnabled: false,
  uwShape: "sphere",
  uwPadding: 1.35,
  uwSegments: 64,
  uwSide: "double",
  uwWaterColor: "#0a3d4a",
  uwSunColor: "#ffffff",
  uwDistortion: 3.2,
  uwWaveSize: 1.2,
  uwWaveSpeed: 0.6,
  uwAlpha: 0.72,
  uwCaustics: true,
  uwCausticStrength: 0.55,
  uwCausticScale: 0.4,
  uwCausticSpeed: 1,
  uwLightFollow: false,
};

export const BRIDGE_DEFAULT_URL = "ws://localhost:57120";
