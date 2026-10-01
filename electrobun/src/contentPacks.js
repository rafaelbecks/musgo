/**
 * Packaged content packs — manifests live in-repo; binaries live on object storage / Releases.
 * App Support root (macOS): ~/Library/Application Support/studio.luminode.musgo/assets/
 */
export const ASSET_SUPPORT_DIRNAME = "studio.luminode.musgo";

/** Relative folders under Application Support /assets */
export const PACK_DIRS = {
  examples: "examples",
  models: "glb",
  env: "env",
};

/**
 * Replace baseUrl with your R2/S3/GitHub Releases URL when packs are published.
 * Example: https://assets.luminode.studio/musgo/v1/
 */
export const ASSET_CDN_BASE =
  process.env.MUSGO_ASSET_CDN ?? "https://example.invalid/musgo-assets/v1/";

/**
 * @typedef {object} ContentPack
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {keyof typeof PACK_DIRS} installAs
 * @property {string} archive   filename under ASSET_CDN_BASE
 * @property {number} bytesApprox
 * @property {boolean} recommended
 * @property {boolean} required  always false for MUSGO — app runs without packs
 */

/** @type {ContentPack[]} */
export const CONTENT_PACKS = [
  {
    id: "examples-v1",
    label: "Examples",
    description: ".organism demos for the examples browser",
    installAs: "examples",
    archive: "examples-v1.zip",
    bytesApprox: 160_000,
    recommended: true,
    required: false,
  },
  {
    id: "models-core-v1",
    label: "Models",
    description: "Sample / imported GLB library",
    installAs: "models",
    archive: "models-core-v1.zip",
    bytesApprox: 120_000_000,
    recommended: true,
    required: false,
  },
  {
    id: "env-hdr-v1",
    label: "Environments (HDR)",
    description: "Small 1k HDR set — enough for most IBL",
    installAs: "env",
    archive: "env-hdr-v1.zip",
    bytesApprox: 6_000_000,
    recommended: true,
    required: false,
  },
  {
    id: "env-exr-v1",
    label: "Environments (full EXR)",
    description: "Full EXR library (~1.3 GB). Optional.",
    installAs: "env",
    archive: "env-exr-v1.zip",
    bytesApprox: 1_300_000_000,
    recommended: false,
    required: false,
  },
];

/** Always ship inside the app bundle — not optional packs. */
export const BUNDLED_ALWAYS = ["textures/", "fonts/", "icons/", "src/", "index.html", "styles.css"];
