/**
 * Resolve optional content under Application Support, with web/dev fallbacks.
 * Main process should set globalThis.__MUSGO_ASSET_ROOT__ to the Support assets dir
 * (or inject via RPC). Browser / `npm start` leaves it unset → relative ./ paths.
 */

const WEB_FALLBACK = {
  examples: "./examples",
  glb: "./glb",
  env: "./env",
  textures: "./textures",
};

/**
 * @param {"examples" | "glb" | "env" | "textures"} kind
 * @param {string} relativePath  path under that kind, no leading slash
 * @returns {string | null} URL usable by fetch / THREE loaders, or null if missing in desktop mode
 */
export function assetUrl(kind, relativePath = "") {
  const rel = String(relativePath).replace(/^\.\//, "").replace(/^\/+/, "");
  const root = globalThis.__MUSGO_ASSET_ROOT__;

  if (kind === "textures") {
    // Bundled with the app in desktop builds; relative in web.
    return rel ? `./textures/${rel}` : "./textures";
  }

  if (typeof root === "string" && root.length) {
    const base = `${root.replace(/\/$/, "")}/${kind}`;
    return rel ? `${base}/${rel}` : base;
  }

  const webBase = WEB_FALLBACK[kind] ?? `./${kind}`;
  return rel ? `${webBase}/${rel}` : webBase;
}

/**
 * Desktop: main process should answer whether a pack folder exists.
 * Web: always true (repo ships assets next to the app).
 * @param {"examples" | "glb" | "env"} kind
 */
export function isPackAvailable(kind) {
  if (!globalThis.__MUSGO_ASSET_ROOT__) return true;
  const flags = globalThis.__MUSGO_PACKS__;
  if (flags && typeof flags === "object") return Boolean(flags[kind]);
  return false;
}
