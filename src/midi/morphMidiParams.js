/**
 * Declarative MIDI-mappable morphogenesis parameters.
 * Sections: shape (dynamic per morph shape), noise, texture.
 * Frequency LFO and rotation are intentionally excluded.
 */
import { MORPH_SHAPES, SHAPE_LABELS } from "../morphogenesis/morphParams.js";
import { LSYSTEM_PRESETS } from "../morphogenesis/lsystem/grammars.js";
import {
  DLA_SEED_MODES,
  DLA_LAUNCH_MODES,
  DLA_CONNECTIVITY,
  DLA_ELEMENT_SHAPES,
  NOISE_TARGETS,
} from "../morphogenesis/dla/constants.js";

const GIELIS_FAMILY_OPTIONS = ["superellipse", "superrose", "superspiral"];
const GIELIS_PHI_MODE_OPTIONS = ["latitude", "full"];
const LOPEZ_ROS_MODE_OPTIONS = ["catenoid", "stacked"];
const LSYSTEM_PRESET_OPTIONS = LSYSTEM_PRESETS;
const DLA_SEED_MODE_OPTIONS = DLA_SEED_MODES;
const DLA_LAUNCH_MODE_OPTIONS = DLA_LAUNCH_MODES;
const DLA_CONNECTIVITY_OPTIONS = DLA_CONNECTIVITY;
const DLA_ELEMENT_SHAPE_OPTIONS = DLA_ELEMENT_SHAPES;
const NOISE_TARGET_OPTIONS = NOISE_TARGETS;
const SIDE_OPTIONS = ["outside", "inside", "double"];

function num(key, label, min, max, step) {
  return { key, label, type: "number", min, max, step };
}

function checkbox(key, label) {
  return { key, label, type: "checkbox" };
}

function select(key, label, options) {
  return { key, label, type: "select", options };
}

/** Shared shape controls (always first in the shape section). */
const SHAPE_COMMON = [
  num("extent", "extent", 0.5, 10, 0.1),
  num("shapeSegments", "segments", 16, 256, 1),
  num("envelopeRadius", "radius scale", 0.3, 3, 0.05),
];

const SHAPE_SPECIFIC = {
  torus: [num("torusTube", "tube", 0.05, 0.8, 0.01)],
  torusknot: [
    num("torusKnotRadius", "radius", 0.2, 2, 0.05),
    num("torusKnotTube", "tube", 0.05, 0.8, 0.01),
    num("torusKnotTubularSegments", "tubular segs", 16, 512, 1),
    num("torusKnotRadialSegments", "radial segs", 4, 64, 1),
    num("torusKnotP", "p", 1, 12, 1),
    num("torusKnotQ", "q", 1, 12, 1),
  ],
  chenGackstatter: [
    num("minimalVSegments", "v segments", 16, 256, 1),
    num("chenGackstatterRMin", "radius min", 0.05, 0.9, 0.01),
    num("chenGackstatterRMax", "radius max", 0.1, 0.95, 0.01),
    num("chenGackstatterStretchZ", "stretch Z", 0.2, 4, 0.05),
  ],
  lopezros: [
    num("minimalVSegments", "v segments", 16, 256, 1),
    select("lopezRosMode", "mode", LOPEZ_ROS_MODE_OPTIONS),
    num("lopezRosSpan", "catenoid span", 0.4, 2.5, 0.05),
    num("lopezRosDeform", "deform", -0.8, 0.8, 0.01),
    num("lopezRosTwist", "twist", -Math.PI, Math.PI, 0.01),
    num("lopezRosStackCount", "stack count", 2, 7, 1),
    num("lopezRosStackSpacing", "neck span", 0.35, 5, 0.05),
  ],
  gielis: [
    select("gielisPhiMode", "φ range", GIELIS_PHI_MODE_OPTIONS),
    num("gielisVSegments", "φ segments", 16, 256, 1),
    select("gielisFamily1", "θ family", GIELIS_FAMILY_OPTIONS),
    num("gielisA1", "θ a", 0.05, 4, 0.05),
    num("gielisB1", "θ b", 0.05, 4, 0.05),
    num("gielisM1", "θ m", 0, 20, 0.1),
    num("gielisN11", "θ n1", -20, 40, 0.1),
    num("gielisN12", "θ n2", -20, 40, 0.1),
    num("gielisN13", "θ n3", -20, 40, 0.1),
    select("gielisFamily2", "φ family", GIELIS_FAMILY_OPTIONS),
    num("gielisA2", "φ a", 0.05, 4, 0.05),
    num("gielisB2", "φ b", 0.05, 4, 0.05),
    num("gielisM2", "φ m", 0, 20, 0.1),
    num("gielisN21", "φ n1", -20, 40, 0.1),
    num("gielisN22", "φ n2", -20, 40, 0.1),
    num("gielisN23", "φ n3", -20, 40, 0.1),
  ],
  baschetLeaf: [
    num("leafRadius", "radius", 0.1, 3, 0.05),
    num("leafWidthScale", "widthScale", 0.1, 2, 0.05),
    num("leafHeightScale", "heightScale", 0.2, 3, 0.05),
    num("leafExponent", "exponent", 0.1, 5, 0.05),
    num("leafAsymmetry", "asymmetry", -0.8, 0.8, 0.01),
    num("leafTopPinch", "topPinch", 0, 0.9, 0.01),
    num("leafBottomPinch", "bottomPinch", 0, 0.9, 0.01),
    num("leafSkew", "skew", -1, 1, 0.01),
    num("leafBulge", "bulge", 0.2, 0.8, 0.01),
    num("leafFoldDepth", "fold", 0, 1, 0.01),
    num("leafFoldPower", "fold curve", 0.3, 2.5, 0.05),
    num("leafResolution", "resolution", 8, 256, 1),
  ],
  lsystem: [
    select("lsystemPreset", "grammar", LSYSTEM_PRESET_OPTIONS),
    num("lsystemIterations", "iterations", 1, 20, 1),
    num("lsystemSegments", "segments/step", 1, 6, 1),
    num("lsystemAngle", "angle°", 0, 90, 0.5),
    num("lsystemStep", "step", 0.05, 1.2, 0.01),
    num("lsystemTubeRadius", "tube radius", 0.01, 0.2, 0.005),
    num("lsystemBranchTaper", "branch taper", 0.4, 1, 0.01),
    num("lsystemTaper", "radius taper", 0.5, 0.99, 0.01),
    num("lsystemLengthDecay", "length decay", 0.7, 1, 0.01),
    num("lsystemRadialSegments", "radial segs", 3, 16, 1),
    num("lsystemTubularDetail", "tube detail", 1, 6, 1),
  ],
  dla: [
    num("dlaParticleCount", "particles", 50, 8000, 50),
    num("dlaGridSize", "grid size", 32, 128, 4),
    num("dlaSeed", "seed", 0, 99999, 1),
    select("dlaSeedMode", "seed structure", DLA_SEED_MODE_OPTIONS),
    select("dlaLaunchMode", "launch", DLA_LAUNCH_MODE_OPTIONS),
    select("dlaConnectivity", "neighbors", DLA_CONNECTIVITY_OPTIONS),
    num("dlaStickiness", "stickiness", 0.01, 1, 0.01),
    num("dlaMinNeighbors", "min neighbors", 1, 8, 1),
    num("dlaHitsRequired", "hits to stick", 1, 40, 1),
    num("dlaUpBias", "up bias", -1, 1, 0.05),
    num("dlaOutwardBias", "outward bias", -1, 1, 0.05),
    num("dlaNoiseBias", "noise flow", 0, 1, 0.05),
    num("dlaNoiseScale", "noise scale", 0.02, 2, 0.01),
    num("dlaParticleRadius", "blob radius", 0.3, 1.4, 0.05),
    select("dlaElementShape", "element", DLA_ELEMENT_SHAPE_OPTIONS),
    num("dlaOrientRandom", "orient random", 0, 1, 0.05),
    num("dlaMeshDetail", "mesh detail", 0, 2, 1),
  ],
  model: [],
};

const NOISE_PARAMS = [
  checkbox("noiseEnabled", "enabled"),
  select("noiseTarget", "target", NOISE_TARGET_OPTIONS),
  num("noiseAmplitude", "amplitude", 0, 1, 0.01),
  num("noiseScale", "frequency", 0.1, 5, 0.05),
  num("noiseSeed", "seed", 0, 9999, 1),
  num("noiseOctaves", "octaves", 1, 5, 1),
  num("noiseMorphSpeed", "morph speed", 0.5, 10, 0.1),
  checkbox("animateNoise", "animate freq"),
];

const TEXTURE_PARAMS = [
  checkbox("glassEnabled", "material texture"),
  num("glassMetalness", "metalness", 0, 1, 0.01),
  num("glassRoughness", "roughness", 0, 1, 0.01),
  num("glassTransmission", "transmission", 0, 1, 0.01),
  num("glassIor", "index of reflection", 1, 2.33, 0.01),
  num("glassThickness", "thickness", 0, 5, 0.1),
  num("glassEnvMapIntensity", "env intensity", 0, 3, 0.1),
  num("glassClearcoat", "clearcoat", 0, 1, 0.01),
  num("glassClearcoatRoughness", "clearcoat rough", 0, 1, 0.01),
  num("glassNormalScale", "normal scale", 0, 5, 0.01),
  num("glassClearcoatNormalScale", "coat normal", 0, 5, 0.01),
  num("glassNormalRepeat", "normal repeat", 1, 8, 1),
  select("side", "side", SIDE_OPTIONS),
];

export const MIDI_SECTIONS = ["shape", "noise", "texture"];

export const MIDI_SECTION_LABELS = {
  shape: "shape",
  noise: "noise deformation",
  texture: "texture",
};

export function getSelectableShapes() {
  return MORPH_SHAPES.filter((id) => id !== "model");
}

export function getShapeLabel(shapeId) {
  return SHAPE_LABELS[shapeId] ?? shapeId;
}

/** Longest shape-specific list (Gielis) — use for sizing CC ranges. */
export function getMaxShapeParamCount() {
  let max = 0;
  for (const shape of MORPH_SHAPES) {
    const n = SHAPE_COMMON.length + (SHAPE_SPECIFIC[shape]?.length ?? 0);
    if (n > max) max = n;
  }
  return Math.max(max, NOISE_PARAMS.length, TEXTURE_PARAMS.length);
}

/**
 * @param {"shape"|"noise"|"texture"} section
 * @param {string} [shapeId] current morph shape (required for shape section)
 */
export function getSectionParams(section, shapeId = "torus") {
  if (section === "noise") return NOISE_PARAMS;
  if (section === "texture") return TEXTURE_PARAMS;
  if (section === "shape") {
    const specific = SHAPE_SPECIFIC[shapeId] ?? [];
    return [...SHAPE_COMMON, ...specific];
  }
  return [];
}

/**
 * Map a MIDI CC value (0–127) onto a param definition.
 */
export function mapCcToParamValue(param, value) {
  const normalized = value / 127;

  if (param.type === "checkbox") {
    return normalized > 0.5;
  }

  if (param.type === "select") {
    const options = param.options ?? [];
    if (!options.length) return undefined;
    const index = Math.floor(normalized * options.length);
    return options[Math.min(index, options.length - 1)];
  }

  // number
  const { min, max, step } = param;
  if (step != null && step > 0) {
    const steps = (max - min) / step;
    const stepIndex = Math.round(normalized * steps);
    return min + stepIndex * step;
  }
  return min + normalized * (max - min);
}
