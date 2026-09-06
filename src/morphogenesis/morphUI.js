import { morphParams, SHAPE_LABELS, MORPH_SHAPES } from "./morphParams.js";
import { LSYSTEM_PRESET_LABELS } from "./lsystem/index.js";
import {
  DLA_SEED_MODE_LABELS,
  DLA_LAUNCH_MODE_LABELS,
  DLA_CONNECTIVITY_LABELS,
  DLA_ELEMENT_SHAPE_LABELS,
  NOISE_TARGET_LABELS,
} from "./dla/constants.js";
import {
  loadModelCatalog,
  modelsToOptions,
} from "./modelCatalog.js";
import { pickModelFile } from "../ui/modelFilePicker.js";
import {
  saveOrganism,
  pickOrganismFile,
  readOrganismFile,
  adoptLoadedOrganism,
  markOrganismClean,
  syncOrganismDirty,
  installOrganismSaveShortcut,
  applyOrganismMidi,
  createNewOrganism,
  confirmDiscardUnsavedChanges,
  markOrganismBaseline,
  setOrganismModelAssetHooks,
} from "./organismState.js";
import { pickImageFile } from "../ui/imageFilePicker.js";
import * as TweakpaneRotationInputPlugin from "@0b5vr/tweakpane-plugin-rotation";

const SIDE_OPTIONS = { outside: "outside", inside: "inside", double: "double" };

const CUSTOM_TEXTURE_ROLE_OPTIONS = {
  "color map": "color",
  "normal map": "normal",
  "color + normal": "color+normal",
};

const TEXTURE_WRAP_OPTIONS = {
  repeat: "repeat",
  "clamp to edge": "clamp",
};

const SHAPE_OPTIONS = Object.fromEntries(
  MORPH_SHAPES.map((id) => [SHAPE_LABELS[id] ?? id, id])
);

const GIELIS_FAMILY_OPTIONS = {
  superellipse: "superellipse",
  superrose: "superrose",
  superspiral: "superspiral",
};

const CATENOID_MODE_OPTIONS = {
  catenoid: "catenoid",
  "stacked catenoids": "stacked",
};

const GIELIS_PHI_MODE_OPTIONS = {
  "latitude (−π/2…π/2)": "latitude",
  "full period": "full",
};

const LSYSTEM_PRESET_OPTIONS = Object.fromEntries(
  Object.entries(LSYSTEM_PRESET_LABELS).map(([id, label]) => [label, id])
);

const DLA_SEED_MODE_OPTIONS = Object.fromEntries(
  Object.entries(DLA_SEED_MODE_LABELS).map(([id, label]) => [label, id])
);

const DLA_LAUNCH_MODE_OPTIONS = Object.fromEntries(
  Object.entries(DLA_LAUNCH_MODE_LABELS).map(([id, label]) => [label, id])
);

const DLA_CONNECTIVITY_OPTIONS = Object.fromEntries(
  Object.entries(DLA_CONNECTIVITY_LABELS).map(([id, label]) => [label, id])
);

const DLA_ELEMENT_SHAPE_OPTIONS = Object.fromEntries(
  Object.entries(DLA_ELEMENT_SHAPE_LABELS).map(([id, label]) => [label, id])
);

const NOISE_TARGET_OPTIONS = Object.fromEntries(
  Object.entries(NOISE_TARGET_LABELS).map(([id, label]) => [label, id])
);

function bind(folder, obj, key, opts, onChange) {
  const input = folder.addBinding(obj, key, opts);
  input.on("change", () => onChange?.());
  return input;
}

export async function setupMorphUI(
  container,
  morphSystem,
  onChange,
  { onGlassEnable, onOrganismLoaded, refreshPane, pane } = {}
) {
  const folder = container;
  if (pane) {
    pane.registerPlugin(TweakpaneRotationInputPlugin);
    pane.on("change", () => {
      syncOrganismDirty();
    });
  }
  installOrganismSaveShortcut();
  setOrganismModelAssetHooks({
    getForSave: () => morphSystem.getModelAssetForSave?.() ?? null,
  });
  const models = await loadModelCatalog();
  const importedModels = [];
  let modelFolder = null;
  let modelInput = null;
  let modelImportButton = null;
  let segmentsInput = null;
  let noiseTargetInput = null;
  let syncModelTextureFolder = () => {};

  function allModels() {
    const extra = importedModels.filter((path) => !models.includes(path));
    return [...models, ...extra];
  }

  function disposeModelControls() {
    modelInput?.dispose();
    modelImportButton?.dispose();
    modelInput = null;
    modelImportButton = null;
  }

  function buildModelControls() {
    disposeModelControls();
    if (!modelFolder) return;

    if (
      morphParams.modelFile?.startsWith("imported/") &&
      !importedModels.includes(morphParams.modelFile)
    ) {
      importedModels.push(morphParams.modelFile);
    }
    if (!allModels().includes(morphParams.modelFile)) {
      morphParams.modelFile = models[0];
    }

    modelInput = modelFolder.addBinding(morphParams, "modelFile", {
      label: "model",
      options: modelsToOptions(allModels()),
    });
    modelInput.on("change", async () => {
      await onChange?.();
      morphSystem.preferTexturedModelView();
      syncModelTextureFolder?.();
    });

    modelImportButton = modelFolder.addButton({ title: "Import GLB / OBJ / USDZ…" });
    modelImportButton.on("click", async () => {
      try {
        await importModelFile();
      } catch (err) {
        if (err?.message !== "File picker cancelled.") {
          console.error("[morph] failed to import model", err);
          window.alert(err?.message || "Failed to import model.");
        }
      }
    });
  }

  async function importModelFile(file = null) {
    const picked = file ?? (await pickModelFile());
    const { modelFile } = await morphSystem.loadModelFromFile(picked);
    if (!importedModels.includes(modelFile)) {
      importedModels.push(modelFile);
    }
    morphParams.shape = "model";
    morphParams.modelFile = modelFile;
    shapeInput.refresh();
    buildModelControls();
    syncShapeFolders();
    await onChange?.();
    morphSystem.preferTexturedModelView();
    syncModelTextureFolder?.();
    syncOrganismDirty();
    return modelFile;
  }

  const shapeFolders = {};

  function syncShapeFolders() {
    const shape = morphParams.shape;
    const isModel = shape === "model";
    shapeFolders.torus.hidden = shape !== "torus";
    shapeFolders.knot.hidden = shape !== "torusknot";
    shapeFolders.catenoids.hidden = shape !== "catenoids";
    shapeFolders.gielis.hidden = shape !== "gielis";
    shapeFolders.leaf.hidden = shape !== "baschetLeaf";
    shapeFolders.lsystem.hidden = shape !== "lsystem";
    shapeFolders.lsystemSegments.hidden =
      shape !== "lsystem" || morphParams.lsystemPreset !== "shrimp";
    shapeFolders.dla.hidden = shape !== "dla";
    const stacked = morphParams.catenoidMode === "stacked";
    shapeFolders.catenoidStackCount.hidden = !stacked;
    shapeFolders.catenoidStackSpacing.hidden = !stacked;
    if (modelFolder) modelFolder.hidden = !isModel;
    if (segmentsInput) {
      segmentsInput.hidden = isModel || shape === "lsystem" || shape === "dla";
    }
    if (noiseTargetInput) noiseTargetInput.hidden = shape !== "dla";
    syncModelTextureFolder?.();
  }

  const shapeInput = folder.addBinding(morphParams, "shape", {
    label: "shape",
    options: SHAPE_OPTIONS,
  });
  shapeInput.on("change", async () => {
    syncShapeFolders();
    await onChange?.();
    if (morphParams.shape === "model") {
      morphSystem.preferTexturedModelView();
      syncModelTextureFolder?.();
    }
  });

  modelFolder = folder.addFolder({ title: "Model collection", expanded: true });
  buildModelControls();

  bind(folder, morphParams, "extent", { label: "extent", min: 0.5, max: 10, step: 0.1 }, onChange);

  segmentsInput = bind(
    folder,
    morphParams,
    "shapeSegments",
    { label: "segments", min: 16, max: 256, step: 1 },
    onChange
  );

  bind(
    folder,
    morphParams,
    "envelopeRadius",
    { label: "radius scale", min: 0.3, max: 3, step: 0.05 },
    onChange
  );

  shapeFolders.torus = folder.addFolder({ title: "Torus", expanded: true });
  bind(
    shapeFolders.torus,
    morphParams,
    "torusTube",
    { label: "tube", min: 0.05, max: 0.8, step: 0.01 },
    onChange
  );

  shapeFolders.knot = folder.addFolder({ title: "Torus knot", expanded: true });
  bind(
    shapeFolders.knot,
    morphParams,
    "torusKnotRadius",
    { label: "radius", min: 0.2, max: 2, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.knot,
    morphParams,
    "torusKnotTube",
    { label: "tube", min: 0.05, max: 0.8, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.knot,
    morphParams,
    "torusKnotTubularSegments",
    { label: "tubular segs", min: 16, max: 512, step: 1 },
    onChange
  );
  bind(
    shapeFolders.knot,
    morphParams,
    "torusKnotRadialSegments",
    { label: "radial segs", min: 4, max: 64, step: 1 },
    onChange
  );
  bind(shapeFolders.knot, morphParams, "torusKnotP", { label: "p", min: 1, max: 12, step: 1 }, onChange);
  bind(shapeFolders.knot, morphParams, "torusKnotQ", { label: "q", min: 1, max: 12, step: 1 }, onChange);

  shapeFolders.catenoids = folder.addFolder({ title: "Catenoids", expanded: true });
  bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidVSegments",
    { label: "v segments", min: 16, max: 256, step: 1 },
    onChange
  );
  bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidMode",
    { label: "mode", options: CATENOID_MODE_OPTIONS },
    (ev) => {
      syncShapeFolders();
      onChange?.(ev);
    }
  );
  bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidSpan",
    { label: "span", min: 0.4, max: 2.5, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidDeform",
    { label: "deform", min: -0.8, max: 0.8, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidTwist",
    { label: "twist", min: -Math.PI, max: Math.PI, step: 0.01 },
    onChange
  );
  shapeFolders.catenoidStackCount = bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidStackCount",
    { label: "stack count", min: 2, max: 7, step: 1 },
    onChange
  );
  shapeFolders.catenoidStackSpacing = bind(
    shapeFolders.catenoids,
    morphParams,
    "catenoidStackSpacing",
    { label: "neck span", min: 0.35, max: 5, step: 0.05 },
    onChange
  );

  shapeFolders.gielis = folder.addFolder({ title: "Gielis superformula", expanded: true });
  bind(
    shapeFolders.gielis,
    morphParams,
    "gielisPhiMode",
    { label: "φ range", options: GIELIS_PHI_MODE_OPTIONS },
    onChange
  );
  bind(
    shapeFolders.gielis,
    morphParams,
    "gielisVSegments",
    { label: "φ segments", min: 16, max: 256, step: 1 },
    onChange
  );

  const gielisTheta = shapeFolders.gielis.addFolder({ title: "θ set (longitude)", expanded: true });
  bind(gielisTheta, morphParams, "gielisFamily1", { label: "family", options: GIELIS_FAMILY_OPTIONS }, onChange);
  bind(gielisTheta, morphParams, "gielisA1", { label: "a", min: 0.05, max: 4, step: 0.05 }, onChange);
  bind(gielisTheta, morphParams, "gielisB1", { label: "b", min: 0.05, max: 4, step: 0.05 }, onChange);
  bind(gielisTheta, morphParams, "gielisM1", { label: "m", min: 0, max: 20, step: 0.1 }, onChange);
  bind(gielisTheta, morphParams, "gielisN11", { label: "n1", min: -20, max: 40, step: 0.1 }, onChange);
  bind(gielisTheta, morphParams, "gielisN12", { label: "n2", min: -20, max: 40, step: 0.1 }, onChange);
  bind(gielisTheta, morphParams, "gielisN13", { label: "n3", min: -20, max: 40, step: 0.1 }, onChange);

  const gielisPhi = shapeFolders.gielis.addFolder({ title: "φ set (latitude)", expanded: true });
  bind(gielisPhi, morphParams, "gielisFamily2", { label: "family", options: GIELIS_FAMILY_OPTIONS }, onChange);
  bind(gielisPhi, morphParams, "gielisA2", { label: "a", min: 0.05, max: 4, step: 0.05 }, onChange);
  bind(gielisPhi, morphParams, "gielisB2", { label: "b", min: 0.05, max: 4, step: 0.05 }, onChange);
  bind(gielisPhi, morphParams, "gielisM2", { label: "m", min: 0, max: 20, step: 0.1 }, onChange);
  bind(gielisPhi, morphParams, "gielisN21", { label: "n1", min: -20, max: 40, step: 0.1 }, onChange);
  bind(gielisPhi, morphParams, "gielisN22", { label: "n2", min: -20, max: 40, step: 0.1 }, onChange);
  bind(gielisPhi, morphParams, "gielisN23", { label: "n3", min: -20, max: 40, step: 0.1 }, onChange);

  shapeFolders.leaf = folder.addFolder({ title: "Leaf", expanded: true });
  bind(shapeFolders.leaf, morphParams, "leafRadius", { label: "radius", min: 0.1, max: 3, step: 0.05 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafWidthScale", { label: "widthScale", min: 0.1, max: 2, step: 0.05 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafHeightScale", { label: "heightScale", min: 0.2, max: 3, step: 0.05 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafExponent", { label: "exponent", min: 0.1, max: 5, step: 0.05 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafAsymmetry", { label: "asymmetry", min: -0.8, max: 0.8, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafTopPinch", { label: "topPinch", min: 0, max: 0.9, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafBottomPinch", { label: "bottomPinch", min: 0, max: 0.9, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafSkew", { label: "skew", min: -1, max: 1, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafBulge", { label: "bulge", min: 0.2, max: 0.8, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafFoldDepth", { label: "fold", min: 0, max: 1, step: 0.01 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafFoldPower", { label: "fold curve", min: 0.3, max: 2.5, step: 0.05 }, onChange);
  bind(shapeFolders.leaf, morphParams, "leafResolution", { label: "resolution", min: 8, max: 256, step: 1 }, onChange);

  shapeFolders.lsystem = folder.addFolder({ title: "L-system organism", expanded: true });
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemPreset",
    { label: "grammar", options: LSYSTEM_PRESET_OPTIONS },
    (ev) => {
      syncShapeFolders();
      onChange?.(ev);
    }
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemIterations",
    { label: "iterations", min: 1, max: 20, step: 1 },
    onChange
  );
  shapeFolders.lsystemSegments = bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemSegments",
    { label: "segments/step", min: 1, max: 6, step: 1 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemAngle",
    { label: "angle° (0=auto)", min: 0, max: 90, step: 0.5 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemStep",
    { label: "step", min: 0.05, max: 1.2, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemTubeRadius",
    { label: "tube radius", min: 0.01, max: 0.2, step: 0.005 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemBranchTaper",
    { label: "branch taper", min: 0.4, max: 1, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemTaper",
    { label: "radius taper (!)", min: 0.5, max: 0.99, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemLengthDecay",
    { label: "length decay", min: 0.7, max: 1, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemRadialSegments",
    { label: "radial segs", min: 3, max: 16, step: 1 },
    onChange
  );
  bind(
    shapeFolders.lsystem,
    morphParams,
    "lsystemTubularDetail",
    { label: "tube detail", min: 1, max: 6, step: 1 },
    onChange
  );

  shapeFolders.dla = folder.addFolder({ title: "DLA (moss / coral)", expanded: true });
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaParticleCount",
    { label: "particles", min: 50, max: 8000, step: 50 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaGridSize",
    { label: "grid size", min: 32, max: 128, step: 4 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaSeed",
    { label: "seed", min: 0, max: 99999, step: 1 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaSeedMode",
    { label: "seed structure", options: DLA_SEED_MODE_OPTIONS },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaLaunchMode",
    { label: "launch", options: DLA_LAUNCH_MODE_OPTIONS },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaConnectivity",
    { label: "neighbors", options: DLA_CONNECTIVITY_OPTIONS },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaStickiness",
    { label: "stickiness", min: 0.01, max: 1, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaMinNeighbors",
    { label: "min neighbors", min: 1, max: 8, step: 1 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaHitsRequired",
    { label: "hits to stick", min: 1, max: 40, step: 1 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaUpBias",
    { label: "up bias", min: -1, max: 1, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaOutwardBias",
    { label: "outward bias", min: -1, max: 1, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaNoiseBias",
    { label: "noise flow", min: 0, max: 1, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaNoiseScale",
    { label: "noise scale", min: 0.02, max: 2, step: 0.01 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaParticleRadius",
    { label: "blob radius", min: 0.3, max: 1.4, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaElementShape",
    { label: "element", options: DLA_ELEMENT_SHAPE_OPTIONS },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaOrientRandom",
    { label: "orient random", min: 0, max: 1, step: 0.05 },
    onChange
  );
  bind(
    shapeFolders.dla,
    morphParams,
    "dlaMeshDetail",
    { label: "mesh detail", min: 0, max: 2, step: 1 },
    onChange
  );

  const rotFolder = folder.addFolder({ title: "Rotation", expanded: true });

  const modelRotation = {
    euler: {
      x: morphParams.rotationX,
      y: morphParams.rotationY,
      z: morphParams.rotationZ,
    },
  };

  function syncRotationBinding() {
    modelRotation.euler.x = morphParams.rotationX;
    modelRotation.euler.y = morphParams.rotationY;
    modelRotation.euler.z = morphParams.rotationZ;
    rotationInput?.refresh();
  }

  const rotationInput = rotFolder.addBinding(modelRotation, "euler", {
    label: "model",
    view: "rotation",
    rotationMode: "euler",
    order: "XYZ",
    unit: "rad",
    picker: "inline",
    expanded: true,
  });
  rotationInput.on("change", () => {
    morphParams.rotationX = modelRotation.euler.x;
    morphParams.rotationY = modelRotation.euler.y;
    morphParams.rotationZ = modelRotation.euler.z;
    onChange?.();
  });

  bind(folder, morphParams, "side", { label: "side", options: SIDE_OPTIONS }, onChange);
  bind(folder, morphParams, "color", { label: "color" }, onChange);

  const textureFolder = folder.addFolder({ title: "Texture", expanded: true });

  const glassFolder = textureFolder.addFolder({ title: "Material texture", expanded: false });
  const glassBindings = [];
  let syncGlassFolder = null;

  const glassEnabledInput = glassFolder.addBinding(morphParams, "glassEnabled", {
    label: "material texture",
  });
  glassEnabledInput.on("change", () => {
    if (morphParams.glassEnabled) {
      onGlassEnable?.();
    }
    syncGlassFolder?.();
    onChange?.();
  });

  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassMetalness",
      { label: "metalness", min: 0, max: 1, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassRoughness",
      { label: "roughness", min: 0, max: 1, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassTransmission",
      { label: "transmission", min: 0, max: 1, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassIor",
      { label: "index of reflection", min: 1, max: 2.33, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassThickness",
      { label: "thickness", min: 0, max: 5, step: 0.1 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassEnvMapIntensity",
      { label: "env intensity", min: 0, max: 3, step: 0.1 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassClearcoat",
      { label: "clearcoat", min: 0, max: 1, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassClearcoatRoughness",
      { label: "clearcoat rough", min: 0, max: 1, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassNormalScale",
      { label: "normal scale", min: 0, max: 5, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassClearcoatNormalScale",
      { label: "coat normal", min: 0, max: 5, step: 0.01 },
      onChange
    )
  );
  glassBindings.push(
    bind(
      glassFolder,
      morphParams,
      "glassNormalRepeat",
      { label: "normal repeat", min: 1, max: 8, step: 1 },
      onChange
    )
  );

  syncGlassFolder = () => {
    const show = morphParams.glassEnabled;
    for (const binding of glassBindings) {
      binding.hidden = !show;
    }
  };
  syncGlassFolder();

  const modelTexFolder = textureFolder.addFolder({
    title: "Model texture",
    expanded: false,
  });
  const modelTexBindings = [];
  const modelTexInfo = { labels: "" };

  modelTexBindings.push(
    bind(
      modelTexFolder,
      morphParams,
      "modelUseOriginalTexture",
      { label: "original texture" },
      () => {
        morphSystem.preferTexturedModelView();
        syncModelTextureFolder();
        morphSystem.applyMaterial();
        onChange?.();
      }
    )
  );
  modelTexBindings.push(
    bind(
      modelTexFolder,
      morphParams,
      "modelTextureIntensity",
      { label: "surface mix", min: 0, max: 1, step: 0.01 },
      () => {
        morphSystem.applyMaterial();
        onChange?.();
      }
    )
  );
  const modelTexLabelsBinding = modelTexFolder.addBinding(modelTexInfo, "labels", {
    label: "materials",
    readonly: true,
  });
  modelTexBindings.push(modelTexLabelsBinding);

  syncModelTextureFolder = () => {
    const isModel = morphParams.shape === "model";
    const hasTexture = morphSystem.hasModelTexture();
    const labels = morphSystem.getModelTextureLabels?.() ?? [];
    modelTexInfo.labels =
      labels.length > 1
        ? `${labels.length} slots: ${labels.join(", ")}`
        : labels[0] ?? "";
    modelTexLabelsBinding.refresh();
    modelTexFolder.hidden = !isModel || !hasTexture;
    for (const binding of modelTexBindings) {
      if (binding === modelTexBindings[0]) {
        binding.hidden = !isModel || !hasTexture;
      } else if (binding === modelTexLabelsBinding) {
        binding.hidden = !isModel || !hasTexture || labels.length < 2;
      } else {
        binding.hidden = !isModel || !hasTexture || !morphParams.modelUseOriginalTexture;
      }
    }
  };

  const customTexFolder = textureFolder.addFolder({
    title: "Image texture",
    expanded: false,
  });
  const customTexBindings = [];
  let customTexFileBinding = null;

  customTexFolder.addButton({ title: "Load image…" }).on("click", async () => {
    try {
      const file = await pickImageFile();
      await morphSystem.loadCustomTexture(file);
      morphParams.customTextureRole = "color";
      morphSystem.refreshCustomTexture();
      customTexFileBinding?.refresh();
      syncCustomTexFolder();
      refreshPane?.();
      onChange?.();
    } catch (err) {
      if (err?.message !== "File picker cancelled.") {
        console.error(err);
      }
    }
  });

  customTexFolder.addButton({ title: "Clear image" }).on("click", () => {
    morphSystem.clearCustomTexture();
    customTexFileBinding?.refresh();
    syncCustomTexFolder();
    refreshPane?.();
    onChange?.();
  });

  customTexFileBinding = customTexFolder.addBinding(morphParams, "customTextureFileName", {
    label: "file",
    readonly: true,
  });

  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureIntensity",
      { label: "surface mix", min: 0, max: 1, step: 0.01 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureRole",
      { label: "role", options: CUSTOM_TEXTURE_ROLE_OPTIONS },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureRepeatU",
      { label: "repeat U", min: 0.01, max: 32, step: 0.01 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureRepeatV",
      { label: "repeat V", min: 0.01, max: 32, step: 0.01 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureOffsetU",
      { label: "offset U", min: -1, max: 1, step: 0.01 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureOffsetV",
      { label: "offset V", min: -1, max: 1, step: 0.01 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureRotation",
      { label: "rotation °", min: 0, max: 360, step: 1 },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );
  customTexBindings.push(
    bind(
      customTexFolder,
      morphParams,
      "customTextureWrap",
      { label: "wrap", options: TEXTURE_WRAP_OPTIONS },
      () => {
        morphSystem.refreshCustomTexture();
        onChange?.();
      }
    )
  );

  const syncCustomTexFolder = () => {
    const show = morphParams.customTextureEnabled;
    for (const binding of customTexBindings) {
      binding.hidden = !show;
    }
    customTexFileBinding.hidden = !show;
  };
  syncCustomTexFolder();

  const noiseFolder = folder.addFolder({ title: "Noise deformation", expanded: true });
  bind(noiseFolder, morphParams, "noiseEnabled", { label: "enabled" }, onChange);
  noiseTargetInput = bind(
    noiseFolder,
    morphParams,
    "noiseTarget",
    { label: "target", options: NOISE_TARGET_OPTIONS },
    onChange
  );
  bind(
    noiseFolder,
    morphParams,
    "noiseAmplitude",
    { label: "amplitude", min: 0, max: 1, step: 0.01 },
    onChange
  );
  bind(
    noiseFolder,
    morphParams,
    "noiseScale",
    { label: "frequency", min: 0.1, max: 5, step: 0.05 },
    onChange
  );
  bind(noiseFolder, morphParams, "noiseSeed", { label: "seed", min: 0, max: 9999, step: 1 }, onChange);
  bind(noiseFolder, morphParams, "noiseOctaves", { label: "octaves", min: 1, max: 5, step: 1 }, onChange);
  bind(
    noiseFolder,
    morphParams,
    "noiseMorphSpeed",
    { label: "morph speed", min: 0.5, max: 10, step: 0.1 },
    onChange
  );
  bind(noiseFolder, morphParams, "animateNoise", { label: "animate freq" }, onChange);

  const modFolder = noiseFolder.addFolder({ title: "Frequency LFO", expanded: false });
  bind(modFolder, morphParams, "noiseScaleModEnabled", { label: "enabled" }, onChange);
  bind(
    modFolder,
    morphParams,
    "noiseScaleModRate",
    { label: "rate Hz", min: 0.01, max: 2, step: 0.01 },
    onChange
  );
  bind(
    modFolder,
    morphParams,
    "noiseScaleModAmount",
    { label: "depth", min: 0, max: 2, step: 0.05 },
    onChange
  );

  async function applyLoadedOrganism({ state, file, fileHandle = null }) {
    adoptLoadedOrganism({ state, file, fileHandle });

    if (state.modelAsset) {
      try {
        const { modelFile } = await morphSystem.loadModelAssetFromOrganism(
          state.modelAsset
        );
        if (!importedModels.includes(modelFile)) {
          importedModels.push(modelFile);
        }
        morphParams.modelFile = modelFile;
        morphParams.shape = "model";
      } catch (err) {
        console.error("[organism] failed to load embedded model", err);
        window.alert(err?.message || "Failed to load embedded model from organism.");
      }
    }

    buildModelControls();
    syncShapeFolders();
    syncGlassFolder();
    syncCustomTexFolder();
    syncModelTextureFolder();
    syncRotationBinding();
    refreshPane?.();
    await applyOrganismMidi(state);
    await onOrganismLoaded?.(state);
    onChange?.();
    // Re-baseline after async env/pane side-effects so we don't stay dirty
    markOrganismClean();
    console.info(`[organism] loaded ${file?.name ?? state.id}`);
  }

  async function openOrganism() {
    if (!confirmDiscardUnsavedChanges()) return;
    const { state, file, fileHandle } = await pickOrganismFile();
    await applyLoadedOrganism({ state, file, fileHandle });
  }

  async function newOrganism() {
    if (!confirmDiscardUnsavedChanges()) return;
    await createNewOrganism();
    buildModelControls();
    syncShapeFolders();
    syncGlassFolder();
    syncCustomTexFolder();
    syncModelTextureFolder();
    syncRotationBinding();
    refreshPane?.();
    await onOrganismLoaded?.(null);
    await onChange?.();
    markOrganismBaseline();
    console.info("[organism] new specimen");
  }

  async function saveOrganismFile({ forcePicker = false } = {}) {
    const result = await saveOrganism({ forcePicker });
    console.info(`[organism] saved ${result.filename} (${result.method})`);
    return result;
  }

  syncShapeFolders();

  return {
    setGlassEnabled(enabled) {
      morphParams.glassEnabled = enabled;
      glassEnabledInput.refresh();
      syncGlassFolder();
    },
    refreshLocal() {
      buildModelControls();
      syncShapeFolders();
      syncGlassFolder();
      syncModelTextureFolder();
      syncRotationBinding();
      syncOrganismDirty();
    },
    refreshModelTexture: () => syncModelTextureFolder(),
    openOrganism,
    newOrganism,
    saveOrganism: () => saveOrganismFile(),
    saveOrganismAs: () => saveOrganismFile({ forcePicker: true }),
    importModel: (file = null) => importModelFile(file),
    async loadOrganismFile(file, { fileHandle = null, confirmDiscard = false } = {}) {
      if (confirmDiscard && !confirmDiscardUnsavedChanges()) {
        throw new Error("Cancelled.");
      }
      const state = await readOrganismFile(file);
      await applyLoadedOrganism({ state, file, fileHandle });
      return state;
    },
  };
}
