/**
 * Content packs published at:
 * https://github.com/rafaelbecks/musgo/releases/tag/v1
 */

export const APP_IDENTIFIER = "studio.luminode.musgo";
export const ASSETS_RELEASE_TAG = "v1";
export const ASSETS_RELEASE_BASE =
  "https://github.com/rafaelbecks/musgo/releases/download/v1";

/** @typedef {"examples" | "glb" | "env" | "fotogrametrias"} PackInstallKey */

/**
 * @typedef {object} ContentPack
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {PackInstallKey} installAs
 * @property {string} archive
 * @property {number} bytesApprox  uncompressed / zip size hint for UI
 * @property {boolean} recommended
 * @property {string[]} [markers]  relative paths that mean "installed"
 */

/** Folder name under Application Support …/assets/ */
export const PACK_DIRS = /** @type {Record<PackInstallKey, string>} */ ({
  examples: "examples",
  glb: "glb",
  env: "env",
  fotogrametrias: "fotogrametrias-secta",
});

/** @type {ContentPack[]} */
export const CONTENT_PACKS = [
  {
    id: "examples-v1",
    label: "Examples",
    description: "21 .organism demos for the examples browser",
    installAs: "examples",
    archive: "examples-v1.zip",
    bytesApprox: 35_000,
    recommended: true,
    markers: ["index.json"],
  },
  {
    id: "glb-v1",
    label: "Models",
    description: "Sample / imported GLB library (cosos, craneo, samples…)",
    installAs: "glb",
    archive: "glb-v1.zip",
    bytesApprox: 79_000_000,
    recommended: true,
    markers: ["models.json"],
  },
  {
    id: "env-v1",
    label: "Environments",
    description: "HDR + full EXR IBL library (~1.3 GB download)",
    installAs: "env",
    archive: "env-v1.zip",
    bytesApprox: 1_348_000_000,
    recommended: false,
    markers: ["industrial_sunset_02_puresky_1k.hdr"],
  },
  {
    id: "fotogrametrias-v1",
    label: "Fotogrametrías",
    description: "Photogrammetry models (secta)",
    installAs: "fotogrametrias",
    archive: "fotogrametrias-v1.zip",
    bytesApprox: 326_000_000,
    recommended: false,
    markers: ["Modelos/index.json"],
  },
];

export function packDownloadUrl(archive) {
  return `${ASSETS_RELEASE_BASE}/${archive}`;
}

export function formatBytes(n) {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)} KB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(0)} MB`;
  return `${(n / 1_000_000_000).toFixed(1)} GB`;
}
