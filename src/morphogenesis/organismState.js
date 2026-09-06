import {
  morphParams,
  MORPH_PARAM_KEYS,
  DEFAULT_MORPH_PARAMS,
  clampMorphParams,
} from "./morphParams.js";
import { params as viewerParams, ORGANISM_PARAM_DEFAULTS } from "../config.js";
import { modulationSystem } from "../modulation/modulationSystem.js";

export const ORGANISM_TYPE = "organism";
export const ORGANISM_VERSION = 1;

/** Settings → Viewer + Environment (not WebMIDI). */
const VIEWER_KEYS = [
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
];

/** Underwater volume + caustics (Settings → Underwater). */
export const UNDERWATER_KEYS = [
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

const DEFAULT_SPECIMEN_LABEL = "specimen: no name";

/** @type {{
 *   serialize: () => object | null,
 *   apply: (midi: object) => void | Promise<void>,
 *   reset?: () => void | Promise<void>,
 * } | null} */
let midiHooks = null;

/** @type {{ getForSave: () => object | null } | null} */
let modelAssetHooks = null;

/**
 * Register MIDI serialize/apply hooks (from tools panel).
 * Lets .organism files store zoom/smoothing/mapping/device prefs.
 */
export function setOrganismMidiHooks(hooks) {
  midiHooks = hooks;
}

/** Register embedded-model serialize hook (from morph system). */
export function setOrganismModelAssetHooks(hooks) {
  modelAssetHooks = hooks;
}

/** Restore morph / viewer / underwater to factory defaults (before file merge). */
function resetOrganismParamsToDefaults() {
  for (const key of MORPH_PARAM_KEYS) {
    morphParams[key] = DEFAULT_MORPH_PARAMS[key];
  }
  for (const key of VIEWER_KEYS) {
    if (key in ORGANISM_PARAM_DEFAULTS) {
      viewerParams[key] = ORGANISM_PARAM_DEFAULTS[key];
    }
  }
  for (const key of UNDERWATER_KEYS) {
    if (key in ORGANISM_PARAM_DEFAULTS) {
      viewerParams[key] = ORGANISM_PARAM_DEFAULTS[key];
    }
  }
}
const ORGANISM_OPEN_OPTS = {
  multiple: false,
  types: [
    {
      description: "Organism",
      accept: {
        "application/json": [".organism", ".json"],
      },
    },
  ],
};

const ORGANISM_SAVE_OPTS = {
  types: [
    {
      description: "Organism",
      accept: {
        "application/json": [".organism"],
      },
    },
  ],
};

/** @type {{
 *   id: string | null,
 *   filename: string | null,
 *   fileHandle: FileSystemFileHandle | null,
 *   cleanFingerprint: string | null,
 *   dirty: boolean,
 * }} */
const session = {
  id: null,
  filename: null,
  fileHandle: null,
  cleanFingerprint: null,
  dirty: false,
};

function shortUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

export function createOrganismId() {
  return shortUuid();
}

export function organismFilename(id = createOrganismId()) {
  return `spec-${id}.organism`;
}

export function supportsFileSystemAccess() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

export function getOrganismSession() {
  return {
    id: session.id,
    filename: session.filename,
    dirty: session.dirty,
    hasFileHandle: !!session.fileHandle,
  };
}

function contentFingerprint() {
  clampMorphParams();
  return JSON.stringify({
    morph: Object.fromEntries(MORPH_PARAM_KEYS.map((k) => [k, morphParams[k]])),
    viewer: Object.fromEntries(VIEWER_KEYS.map((k) => [k, viewerParams[k]])),
    underwater: Object.fromEntries(UNDERWATER_KEYS.map((k) => [k, viewerParams[k]])),
    midi: midiHooks?.serialize?.() ?? null,
    modulation: modulationSystem.serialize(),
  });
}

export function serializeOrganism({ id = session.id ?? createOrganismId() } = {}) {
  clampMorphParams();
  const state = {
    type: ORGANISM_TYPE,
    version: ORGANISM_VERSION,
    id,
    createdAt: new Date().toISOString(),
    morph: Object.fromEntries(MORPH_PARAM_KEYS.map((k) => [k, morphParams[k]])),
    viewer: Object.fromEntries(VIEWER_KEYS.map((k) => [k, viewerParams[k]])),
    underwater: Object.fromEntries(UNDERWATER_KEYS.map((k) => [k, viewerParams[k]])),
    modulation: modulationSystem.serialize(),
  };
  const midi = midiHooks?.serialize?.();
  if (midi) state.midi = midi;
  const modelAsset = modelAssetHooks?.getForSave?.();
  if (modelAsset) state.modelAsset = modelAsset;
  return state;
}

export function applyOrganismState(state) {
  if (!state || state.type !== ORGANISM_TYPE) {
    throw new Error('Invalid organism file (expected type "organism").');
  }

  // Clear previous organism first so omitted keys don't leak (e.g. underwater).
  resetOrganismParamsToDefaults();

  if (state.morph && typeof state.morph === "object") {
    for (const key of MORPH_PARAM_KEYS) {
      if (state.morph[key] !== undefined) {
        morphParams[key] = state.morph[key];
      }
    }
    clampMorphParams();
  }

  if (state.viewer && typeof state.viewer === "object") {
    for (const key of VIEWER_KEYS) {
      if (state.viewer[key] !== undefined) {
        viewerParams[key] = state.viewer[key];
      }
    }
  }

  const underwater = state.underwater;
  if (underwater && typeof underwater === "object") {
    for (const key of UNDERWATER_KEYS) {
      if (underwater[key] !== undefined) {
        viewerParams[key] = underwater[key];
      }
    }
  }

  // Always replace LFOs from file (missing block → clear)
  modulationSystem.loadSerialized(state.modulation ?? null);

  if (morphParams.glassEnabled) {
    viewerParams.wireframe = false;
  }

  return state.id ?? null;
}

/** Apply midi block from a loaded organism (async — device connect). Missing → reset. */
export async function applyOrganismMidi(state) {
  if (!midiHooks) return false;
  const midi = state?.midi;
  if (midi && midiHooks.apply) {
    await midiHooks.apply(midi);
    return true;
  }
  if (midiHooks.reset) {
    await midiHooks.reset();
  }
  return false;
}

function refreshSpecimenLabel() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("specimen-label");
  if (!el) return;

  if (!session.filename) {
    const star = session.dirty ? "*" : "";
    el.textContent = `${DEFAULT_SPECIMEN_LABEL}${star}`;
    el.title = session.dirty
      ? "Unnamed specimen (unsaved changes)"
      : "";
    return;
  }

  const star = session.dirty ? "*" : "";
  el.textContent = `specimen: ${session.filename}${star}`;
  el.title = session.dirty
    ? `${session.filename} (unsaved changes — ⌘S to save)`
    : session.filename;
}

/** Recompute dirty flag from current params and update the specimen label. */
export function syncOrganismDirty() {
  if (session.cleanFingerprint == null) {
    session.dirty = false;
    refreshSpecimenLabel();
    return session.dirty;
  }
  const dirty = contentFingerprint() !== session.cleanFingerprint;
  if (dirty !== session.dirty) {
    session.dirty = dirty;
    refreshSpecimenLabel();
  }
  return session.dirty;
}

/** True when the current specimen differs from the last clean baseline. */
export function hasUnsavedOrganismChanges() {
  return syncOrganismDirty();
}

/**
 * Snapshot current params as the clean baseline (saved file or untitled New).
 * Unlike markOrganismClean, works without a filename.
 */
export function markOrganismBaseline() {
  clampMorphParams();
  session.cleanFingerprint = contentFingerprint();
  session.dirty = false;
  refreshSpecimenLabel();
}

function markSessionClean({ id, filename, fileHandle = null } = {}) {
  if (id != null) session.id = id;
  if (filename != null) session.filename = filename;
  if (fileHandle !== undefined) session.fileHandle = fileHandle;
  session.cleanFingerprint = contentFingerprint();
  session.dirty = false;
  refreshSpecimenLabel();
}

/** Snapshot current params as the clean (saved) baseline. */
export function markOrganismClean() {
  if (!session.filename) return;
  markOrganismBaseline();
}

export function setSpecimenLabel(filename) {
  session.filename = filename || null;
  if (!filename) {
    session.id = null;
    session.fileHandle = null;
    session.cleanFingerprint = null;
    session.dirty = false;
  }
  refreshSpecimenLabel();
}

async function ensureWritePermission(fileHandle) {
  const opts = { mode: "readwrite" };
  if ((await fileHandle.queryPermission(opts)) === "granted") return true;
  if ((await fileHandle.requestPermission(opts)) === "granted") return true;
  return false;
}

async function writeToFileHandle(fileHandle, state) {
  const ok = await ensureWritePermission(fileHandle);
  if (!ok) {
    throw new Error("Write permission denied for organism file.");
  }
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

/** Classic download fallback when File System Access is unavailable. */
export function downloadOrganism(state = serializeOrganism()) {
  const filename = organismFilename(state.id);
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  markSessionClean({ id: state.id, filename, fileHandle: null });
  return { filename, id: state.id };
}

/**
 * Save current organism. Overwrites the open file handle when possible
 * (⌘S / Save). Falls back to save-picker or download.
 */
export async function saveOrganism({ forcePicker = false } = {}) {
  const id = session.id ?? createOrganismId();
  const state = serializeOrganism({ id });

  if (!forcePicker && session.fileHandle && supportsFileSystemAccess()) {
    await writeToFileHandle(session.fileHandle, state);
    markSessionClean({
      id,
      filename: session.filename ?? session.fileHandle.name,
      fileHandle: session.fileHandle,
    });
    return { filename: session.filename, id, method: "handle" };
  }

  if (supportsFileSystemAccess()) {
    const handle = await window.showSaveFilePicker({
      ...ORGANISM_SAVE_OPTS,
      suggestedName: session.filename ?? organismFilename(id),
    });
    await writeToFileHandle(handle, state);
    markSessionClean({ id, filename: handle.name, fileHandle: handle });
    return { filename: handle.name, id, method: "picker" };
  }

  return { ...downloadOrganism(state), method: "download" };
}

/** Parse a File / Blob as an organism document. */
export async function readOrganismFile(file) {
  if (!file) throw new Error("No file selected.");
  const text = await file.text();
  const state = JSON.parse(text);
  if (!state || state.type !== ORGANISM_TYPE) {
    throw new Error('Invalid organism file (expected type "organism").');
  }
  return state;
}

export async function pickOrganismFile() {
  if (supportsFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker(ORGANISM_OPEN_OPTS);
      const file = await handle.getFile();
      const state = await readOrganismFile(file);
      return { state, file, fileHandle: handle };
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error("File picker cancelled.");
      }
      throw err;
    }
  }

  return pickOrganismFileInput();
}

function pickOrganismFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".organism,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      try {
        const state = await readOrganismFile(file);
        resolve({ state, file, fileHandle: null });
      } catch (err) {
        reject(err);
      }
    });

    input.addEventListener("cancel", () => {
      cleanup();
      reject(new Error("File picker cancelled."));
    });

    input.click();
  });
}

/**
 * Apply a loaded organism into the session (keeps file handle for overwrite).
 */
export function adoptLoadedOrganism({ state, file, fileHandle = null }) {
  const id = applyOrganismState(state) ?? state.id ?? createOrganismId();
  markSessionClean({
    id,
    filename: file?.name ?? organismFilename(id),
    fileHandle,
  });
  return id;
}

/**
 * Reset to a blank specimen (factory defaults). Clears file association.
 * Caller should refresh UI / sync morph after this.
 */
export async function createNewOrganism() {
  resetOrganismParamsToDefaults();
  clampMorphParams();
  modulationSystem.loadSerialized(null);
  if (midiHooks?.reset) {
    await midiHooks.reset();
  }
  session.id = null;
  session.filename = null;
  session.fileHandle = null;
  markOrganismBaseline();
}

/**
 * Confirm discarding unsaved work. Returns false if the user cancels.
 */
export function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedOrganismChanges()) return true;
  const name = session.filename ?? "untitled specimen";
  return window.confirm(
    `Discard unsaved changes to “${name}”?\n\nThis cannot be undone.`
  );
}

/** Wire ⌘S / Ctrl+S to overwrite the current organism file. */
export function installOrganismSaveShortcut() {
  const onKeyDown = async (ev) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (!mod || (ev.key !== "s" && ev.key !== "S")) return;
    // Ignore when typing in inputs/textareas (except we still want save globally for this app)
    ev.preventDefault();
    try {
      const result = await saveOrganism();
      console.info(`[organism] saved ${result.filename} (${result.method})`);
    } catch (err) {
      if (err?.name === "AbortError" || err?.message === "File picker cancelled.") return;
      console.error("[organism] save failed", err);
      window.alert(err?.message || "Failed to save organism file.");
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
