export const DEFAULT_ENV = "none";

/** Filter keys for the Environment category select. */
export const ENV_CATEGORIES = {
  Todos: "all",
  HDR: "hdr",
  Lugares: "places",
  Azul: "blue",
  Cálido: "warm",
  Verde: "green",
  Invierno: "winter",
  Neutral: "neutral",
  Agua: "water",
  Interior: "interior",
};

export const HDR_ENVIRONMENTS = {
  none: { label: "Ninguno (luces de estudio)", file: null, category: "all" },
  industrial_sunset: {
    label: "Atardecer industrial",
    file: "industrial_sunset_02_puresky_1k.hdr",
    category: "hdr",
  },
  aristea_wreck: {
    label: "Naufragio Aristea",
    file: "aristea_wreck_puresky_1k.hdr",
    category: "hdr",
  },
  rosendal_park: {
    label: "Parque Rosendal al atardecer",
    file: "rosendal_park_sunset_puresky_1k.hdr",
    category: "hdr",
  },
  qwantani_sunset: {
    label: "Atardecer Qwantani",
    file: "qwantani_sunset_puresky_1k.hdr",
    category: "hdr",
  },
  qwantani_night: {
    label: "Noche Qwantani",
    file: "qwantani_night_puresky_1k.hdr",
    category: "hdr",
  },
  // Street / place EXRs
  exr_1: { label: "Calle (EXR)", file: "exr/1.jpg_env.exr", format: "exr", category: "places" },
  exr_2: { label: "Lámpara (EXR)", file: "exr/2_env.exr", format: "exr", category: "places" },
  exr_3: { label: "Ventana (EXR)", file: "exr/3_env.exr", format: "exr", category: "places" },
  exr_4: { label: "Playa (EXR)", file: "exr/4_env.exr", format: "exr", category: "places" },
  exr_5: { label: "Cielo y edificio (EXR)", file: "exr/5_env.exr", format: "exr", category: "places" },
  exr_6: { label: "Puente nocturno (EXR)", file: "exr/6.jpg_env.exr", format: "exr", category: "places" },
  exr_7: { label: "Árboles borrosos (EXR)", file: "exr/7_env.exr", format: "exr", category: "places" },
  // Blue shades series
  blue_shades_1: { label: "Tonos azules 1", file: "exr/blue_shades_1_env.exr", format: "exr", category: "blue" },
  blue_shades_2: { label: "Tonos azules 2", file: "exr/blue_shades_2_env.exr", format: "exr", category: "blue" },
  blue_shades_3: { label: "Tonos azules 3", file: "exr/blue_shades_3_env.exr", format: "exr", category: "blue" },
  blue_shades_4: { label: "Tonos azules 4", file: "exr/blue_shades_4_env.exr", format: "exr", category: "blue" },
  blue_shades_5: { label: "Tonos azules 5", file: "exr/blue_shades_5_env.exr", format: "exr", category: "blue" },
  blue_shades_6: { label: "Tonos azules 6", file: "exr/blue_shades_6_env.exr", format: "exr", category: "blue" },
  blue_shades_7: { label: "Tonos azules 7", file: "exr/blue_shades_7_env.exr", format: "exr", category: "blue" },
  blue_shades_8: { label: "Tonos azules 8", file: "exr/blue_shades_8_env.exr", format: "exr", category: "blue" },
  blue_shades_9: { label: "Tonos azules 9", file: "exr/blue_shades_9_env.exr", format: "exr", category: "blue" },
  blue_shades_10: { label: "Tonos azules 10", file: "exr/blue_shades_10_env.exr", format: "exr", category: "blue" },
  blue_shades_11: { label: "Tonos azules 11", file: "exr/blue_shades_11_env.exr", format: "exr", category: "blue" },
  blue_shades_12: { label: "Tonos azules 12", file: "exr/blue_shades_12_env.exr", format: "exr", category: "blue" },
  // From env/raw photos/new (named by colour / location / subject)
  blue_ruin_sky: { label: "Cielo azul en ruinas", file: "exr/blue_ruin_sky_env.exr", format: "exr", category: "blue" },
  green_moss_stone: { label: "Musgo verde sobre piedra", file: "exr/green_moss_stone_env.exr", format: "exr", category: "green" },
  green_moss_undergrowth: { label: "Sotobosque de musgo", file: "exr/green_moss_undergrowth_env.exr", format: "exr", category: "green" },
  glass_caustics: { label: "Cáusticas de vidrio", file: "exr/glass_caustics_env.exr", format: "exr", category: "neutral" },
  glass_caustics_2: { label: "Cáusticas de vidrio 2", file: "exr/glass_caustics_2_env.exr", format: "exr", category: "neutral" },
  stockholm_golden_hall: { label: "Salón dorado de Estocolmo", file: "exr/stockholm_golden_hall_env.exr", format: "exr", category: "interior" },
  aland_iridescent_moss: { label: "Musgo iridiscente de Åland", file: "exr/aland_iridescent_moss_env.exr", format: "exr", category: "green" },
  aland_lichen: { label: "Líquenes de Åland", file: "exr/aland_lichen_env.exr", format: "exr", category: "green" },
  blue_snow: { label: "Nieve azul", file: "exr/blue_snow_env.exr", format: "exr", category: "winter" },
  blue_snow_2: { label: "Nieve azul 2", file: "exr/blue_snow_2_env.exr", format: "exr", category: "winter" },
  blue_snow_3: { label: "Nieve azul 3", file: "exr/blue_snow_3_env.exr", format: "exr", category: "winter" },
  mossy_rocks: { label: "Rocas musgosas", file: "exr/mossy_rocks_env.exr", format: "exr", category: "green" },
  yellow_leaf: { label: "Hoja amarilla", file: "exr/yellow_leaf_env.exr", format: "exr", category: "warm" },
  golden_door: { label: "Puerta dorada", file: "exr/golden_door_env.exr", format: "exr", category: "warm" },
  sunlit_foliage: { label: "Follaje al sol", file: "exr/sunlit_foliage_env.exr", format: "exr", category: "green" },
  autumn_canopy: { label: "Dosel otoñal", file: "exr/autumn_canopy_env.exr", format: "exr", category: "warm" },
  silver_ice: { label: "Hielo plateado", file: "exr/silver_ice_env.exr", format: "exr", category: "winter" },
  melting_ice: { label: "Hielo derritiéndose", file: "exr/melting_ice_env.exr", format: "exr", category: "winter" },
  dark_mudflat: { label: "Marisma oscura", file: "exr/dark_mudflat_env.exr", format: "exr", category: "neutral" },
  muddy_shore: { label: "Orilla fangosa", file: "exr/muddy_shore_env.exr", format: "exr", category: "neutral" },
  blue_frost_window: { label: "Ventana con escarcha azul", file: "exr/blue_frost_window_env.exr", format: "exr", category: "winter" },
  frost_rosehips: { label: "Escaramujos helados", file: "exr/frost_rosehips_env.exr", format: "exr", category: "winter" },
  hoar_frost: { label: "Escarcha", file: "exr/hoar_frost_env.exr", format: "exr", category: "winter" },
  cancun_teal_water: { label: "Agua turquesa de Cancún", file: "exr/cancun_teal_water_env.exr", format: "exr", category: "water" },
  teal_orange_abstract: { label: "Abstracto turquesa y naranja", file: "exr/teal_orange_abstract_env.exr", format: "exr", category: "water" },
  stockholm_sunbeams: { label: "Rayos de sol en Estocolmo", file: "exr/stockholm_sunbeams_env.exr", format: "exr", category: "interior" },
  stockholm_god_rays: { label: "Rayos divinos en Estocolmo", file: "exr/stockholm_god_rays_env.exr", format: "exr", category: "interior" },
};

export function getEnvOptions(category = "all", includeId = null) {
  return Object.fromEntries(
    Object.entries(HDR_ENVIRONMENTS)
      .filter(([id, env]) => {
        if (id === "none" || category === "all" || id === includeId) return true;
        return env.category === category;
      })
      .map(([id, { label }]) => [label, id])
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
  envCategory: "all",
  customEnvEnabled: false,
  customEnvFileName: "",
  customEnvRotation: 0,
  customEnvIntensity: 1,
  customEnvOffset: 0,
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
  bloomEnabled: false,
  bloomStrength: 0.1,
  bloomRadius: 0.55,
  bloomThreshold: 0.12,
  autoAnalyze: false,
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

/** Viewer + underwater keys restored before applying a .organism file. */
const ORGANISM_PARAM_DEFAULT_KEYS = [
  "wireframe",
  "roughness",
  "metalness",
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "environment",
  "envCategory",
  "customEnvEnabled",
  "customEnvFileName",
  "customEnvRotation",
  "customEnvIntensity",
  "customEnvOffset",
  "exposure",
  "bgBlur",
  "lightIntensity",
  "ambient",
  "showGrid",
  "showAxes",
  "gridSize",
  "chamberFocusDistance",
  "autoRotate",
  "rotateSpeed",
  "fpMove",
  "moveSpeed",
  "uwEnabled",
  "uwShape",
  "uwPadding",
  "uwSegments",
  "uwSide",
  "uwWaterColor",
  "uwSunColor",
  "uwDistortion",
  "uwWaveSize",
  "uwWaveSpeed",
  "uwAlpha",
  "uwCaustics",
  "uwCausticStrength",
  "uwCausticScale",
  "uwCausticSpeed",
  "uwLightFollow",
];

/** Frozen snapshot taken at module load (before any runtime mutation). */
export const ORGANISM_PARAM_DEFAULTS = Object.freeze(
  Object.fromEntries(ORGANISM_PARAM_DEFAULT_KEYS.map((k) => [k, params[k]]))
);

export const BRIDGE_DEFAULT_URL = "ws://localhost:57120";
