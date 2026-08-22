/** Paths relative to `glb/` without `.glb` — see `glb/models.json`. */
export const FALLBACK_MODELS = [
  "cosos/pututu",
  "cosos/cosos-sin-fisura1",
  "cosos/cosos-sin-fisura2",
  "cosos/engrinchado",
  "cosos/torusknot-noise-2026-07-04T20-22-07",
  "cosos/torusknot-noise-2026-07-04T20-22-28",
  "samples/torus-noise-1",
  "samples/torus-noise-2",
  "samples/torus-noise-3",
  "craneo/craneo",
  "craneo/craneo2",
  "craneo/craneo3",
];

let cachedModels = null;

export function modelLabel(path) {
  return path.replace(/\//g, " / ");
}

export function modelsToOptions(models) {
  return Object.fromEntries(models.map((path) => [modelLabel(path), path]));
}

export async function loadModelCatalog() {
  if (cachedModels) return cachedModels;
  try {
    const res = await fetch("./glb/models.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) throw new Error("empty catalog");
    cachedModels = list.map(String);
  } catch (err) {
    console.warn("[modelCatalog] using fallback list:", err);
    cachedModels = [...FALLBACK_MODELS];
  }
  return cachedModels;
}
