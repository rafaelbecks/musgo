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
  "craneo/craneo-no-plate",
  "craneo/craneo-reconstruct",
  "acuaticos/alcantarilla1",
  "acuaticos/alcantarilla2",
  "acuaticos/alcantarilla3",
  "acuaticos/30_8_2026",
];

let cachedModels = null;

export function modelCategory(path) {
  const slash = String(path).indexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "other";
}

export function modelName(path) {
  const slash = String(path).indexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

export function modelPath(category, name) {
  return `${category}/${name}`;
}

export function modelLabel(path) {
  return path.replace(/\//g, " / ");
}

export function categoryLabel(category) {
  return category;
}

export function listModelCategories(models) {
  const seen = new Set();
  const categories = [];
  for (const path of models) {
    const category = modelCategory(path);
    if (seen.has(category)) continue;
    seen.add(category);
    categories.push(category);
  }
  return categories;
}

export function modelsInCategory(models, category) {
  return models.filter((path) => modelCategory(path) === category);
}

export function categoriesToOptions(categories) {
  return Object.fromEntries(categories.map((cat) => [categoryLabel(cat), cat]));
}

export function modelNamesToOptions(names) {
  return Object.fromEntries(names.map((name) => [name, name]));
}

/** @deprecated Use category + name selectors instead. */
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
