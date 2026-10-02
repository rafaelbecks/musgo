/**
 * Content-pack availability for desktop (Application Support) and web/dev probes.
 */

/** @typedef {"examples" | "env" | "glb" | "fotogrametrias"} LibraryKey */

const PACK_BY_LIBRARY = {
  examples: "examples-v1",
  env: "env-v1",
  glb: "glb-v1",
  fotogrametrias: "fotogrametrias-v1",
};

const PROBE_URLS = {
  examples: "./examples/index.json",
  env: "./env/industrial_sunset_02_puresky_1k.hdr",
  glb: "./glb/models.json",
  fotogrametrias: "./fotogrametrias-secta/Modelos/index.json",
};

/** @type {null | {
 *   desktop: boolean,
 *   libraries: Record<LibraryKey, boolean>,
 *   packs: Array<object>,
 * }} */
let cache = null;

/** @type {Set<(state: typeof cache) => void>} */
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn(cache);
    } catch (err) {
      console.warn("[content] listener failed", err);
    }
  }
}

async function probeUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.ok) return true;
    // Some static servers don't support HEAD
    if (res.status === 405 || res.status === 501) {
      const get = await fetch(url, { method: "GET", cache: "no-store" });
      return get.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{
 *   desktop: boolean,
 *   libraries: Record<LibraryKey, boolean>,
 *   packs: Array<object>,
 * }>}
 */
export async function refreshContentAvailability() {
  try {
    const res = await fetch("/__desktop/api/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      /** @type {Record<LibraryKey, boolean>} */
      const libraries = {
        examples: false,
        env: false,
        glb: false,
        fotogrametrias: false,
      };
      for (const [lib, packId] of Object.entries(PACK_BY_LIBRARY)) {
        const pack = (data.packs || []).find((p) => p.id === packId);
        libraries[/** @type {LibraryKey} */ (lib)] = Boolean(
          pack?.available ?? pack?.installed,
        );
      }
      cache = {
        desktop: true,
        libraries,
        packs: data.packs || [],
      };
      notify();
      return cache;
    }
  } catch {
    /* not desktop */
  }

  /** @type {Record<LibraryKey, boolean>} */
  const libraries = {
    examples: await probeUrl(PROBE_URLS.examples),
    env: await probeUrl(PROBE_URLS.env),
    glb: await probeUrl(PROBE_URLS.glb),
    fotogrametrias: await probeUrl(PROBE_URLS.fotogrametrias),
  };

  cache = {
    desktop: false,
    libraries,
    packs: [],
  };
  notify();
  return cache;
}

export function getContentAvailability() {
  return cache;
}

/** @param {LibraryKey} key */
export function isLibraryAvailable(key) {
  if (!cache) return false;
  return Boolean(cache.libraries?.[key]);
}

export function isDesktopContentMode() {
  return Boolean(cache?.desktop);
}

export function anyOptionalLibraryMissing() {
  if (!cache?.desktop) return false;
  return Object.values(cache.libraries).some((ok) => !ok);
}

/** @param {(state: typeof cache) => void} fn */
export function subscribeContentAvailability(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function packIdForLibrary(/** @type {LibraryKey} */ key) {
  return PACK_BY_LIBRARY[key];
}

export { PACK_BY_LIBRARY };
