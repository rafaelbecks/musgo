/**
 * Modulable parameter catalog for the Modulation tab.
 * Categories: morphogenesis (shape-specific), shape (extent/segments/radius),
 * texture, noise deformation, rotation.
 */
import { morphParams } from "../morphogenesis/morphParams.js";
import {
  getSectionParams,
  MIDI_SECTION_LABELS,
} from "../midi/morphMidiParams.js";

function num(key, label, min, max, step, extra = {}) {
  return { key, label, type: "number", min, max, step, ...extra };
}

function checkbox(key, label) {
  return { key, label, type: "checkbox" };
}

const SHAPE_COMMON = [
  num("extent", "extent", 0.5, 10, 0.1),
  num("shapeSegments", "segments", 16, 256, 1, { integer: true }),
  num("envelopeRadius", "radius scale", 0.3, 3, 0.05),
];

const ROTATION_PARAMS = [
  num("rotationX", "rotation X", -Math.PI * 2, Math.PI * 2, 0.01),
  num("rotationY", "rotation Y", -Math.PI * 2, Math.PI * 2, 0.01),
  num("rotationZ", "rotation Z", -Math.PI * 2, Math.PI * 2, 0.01),
];

/** Only continuous / toggle targets — skip selects (grammar, family, etc.). */
function modulableOnly(params) {
  return params.filter((p) => p.type === "number" || p.type === "checkbox");
}

export const MOD_CATEGORIES = [
  {
    id: "morphogenesis",
    label: "Morphogenesis",
    getParams: () => {
      const all = getSectionParams("shape", morphParams.shape);
      // Shape common lives in its own category; keep only shape-specific here
      const commonKeys = new Set(SHAPE_COMMON.map((p) => p.key));
      return modulableOnly(all.filter((p) => !commonKeys.has(p.key)));
    },
  },
  {
    id: "shape",
    label: "Shape",
    getParams: () => SHAPE_COMMON,
  },
  {
    id: "texture",
    label: MIDI_SECTION_LABELS.texture,
    getParams: () => modulableOnly(getSectionParams("texture")),
  },
  {
    id: "noise",
    label: MIDI_SECTION_LABELS.noise,
    getParams: () => modulableOnly(getSectionParams("noise")),
  },
  {
    id: "rotation",
    label: "Rotation",
    getParams: () => ROTATION_PARAMS,
  },
];

export function getCategoryOptions() {
  return Object.fromEntries(MOD_CATEGORIES.map((c) => [c.label, c.id]));
}

export function getCategory(categoryId) {
  return MOD_CATEGORIES.find((c) => c.id === categoryId) ?? null;
}

export function getCategoryParams(categoryId) {
  return getCategory(categoryId)?.getParams() ?? [];
}

export function findModParam(categoryId, key) {
  return getCategoryParams(categoryId).find((p) => p.key === key) ?? null;
}

export function getParamOptions(categoryId) {
  const options = { "Select parameter": "" };
  for (const p of getCategoryParams(categoryId)) {
    options[p.label] = p.key;
  }
  return options;
}

/** Resolve a param def for the modulation system apply pass. */
export function resolveModParam(categoryId, key) {
  return findModParam(categoryId, key);
}
