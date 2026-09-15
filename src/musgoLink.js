/**
 * Deep link for importing a model into MUSGO (USDZ / GLB / OBJ).
 *
 * Installed PWA (Chrome/Edge) registers `web+musgo` via manifest
 * protocol_handlers. ESPORA (and anyone else) can open:
 *
 *   web+musgo://import?src=<url-encoded http(s) or file URL>
 *
 * If the PWA is not installed, the same payload is accepted on the site:
 *
 *   https://musgo.luminode.studio/?musgo=<url-encoded web+musgo://…>
 *   https://musgo.luminode.studio/?import=usdz
 *   https://musgo.luminode.studio/?import=<http(s) url>
 */

export const MUSGO_PROTOCOL = "web+musgo";
export const MUSGO_WEB_ORIGIN = "https://musgo.luminode.studio/";

/**
 * @param {string} [href]
 * @returns {{
 *   wantsImport: boolean,
 *   src: string | null,
 *   promptPicker: boolean,
 *   protocolURL: URL | null,
 * }}
 */
export function parseMusgoImport(href = window.location.href) {
  const empty = {
    wantsImport: false,
    src: null,
    promptPicker: false,
    protocolURL: null,
  };

  let url;
  try {
    url = new URL(href);
  } catch {
    return empty;
  }

  const fromProtocol = parseProtocolUrl(url);
  if (fromProtocol.wantsImport) return fromProtocol;

  const musgoParam = url.searchParams.get("musgo");
  if (musgoParam) {
    try {
      const nested = parseProtocolUrl(new URL(musgoParam));
      if (nested.wantsImport) return nested;
    } catch {
      // ignore malformed musgo= payload
    }
  }

  const direct = url.searchParams.get("import");
  if (!direct) return empty;

  if (/^https?:\/\//i.test(direct) || /^file:/i.test(direct)) {
    return {
      wantsImport: true,
      src: direct,
      promptPicker: isLocalFileSrc(direct),
      protocolURL: null,
    };
  }

  const token = direct.toLowerCase();
  if (token === "usdz" || token === "1" || token === "true" || token === "model") {
    return {
      wantsImport: true,
      src: null,
      promptPicker: true,
      protocolURL: null,
    };
  }

  return empty;
}

/**
 * @param {URL} url
 */
function parseProtocolUrl(url) {
  const empty = {
    wantsImport: false,
    src: null,
    promptPicker: false,
    protocolURL: null,
  };

  const isMusgoProtocol = url.protocol === `${MUSGO_PROTOCOL}:`;
  if (!isMusgoProtocol) return empty;

  const host = (url.hostname || "").toLowerCase();
  const path = (url.pathname || "").toLowerCase();
  const isImport =
    host === "import" ||
    path === "/import" ||
    path.startsWith("/import/") ||
    path.includes("import");

  if (!isImport) {
    return {
      wantsImport: true,
      src: url.searchParams.get("src"),
      promptPicker: true,
      protocolURL: url,
    };
  }

  const src = url.searchParams.get("src");
  return {
    wantsImport: true,
    src,
    promptPicker: !src || isLocalFileSrc(src),
    protocolURL: url,
  };
}

export function isLocalFileSrc(src) {
  return Boolean(src && /^file:/i.test(src));
}

export function isFetchableSrc(src) {
  return Boolean(src && /^https?:\/\//i.test(src));
}

/**
 * @param {string} src
 * @returns {Promise<File>}
 */
export async function fetchImportSource(src) {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`No se pudo descargar el modelo (${res.status}).`);
  }
  const blob = await res.blob();
  let name = "model.usdz";
  try {
    const path = new URL(src, window.location.href).pathname;
    const leaf = decodeURIComponent(path.split("/").pop() || "");
    if (leaf) name = leaf;
  } catch {
    // keep default name
  }
  const type =
    blob.type ||
    (/\.obj$/i.test(name)
      ? "model/obj"
      : /\.glb$/i.test(name)
        ? "model/gltf-binary"
        : "model/vnd.usdz+zip");
  return new File([blob], name, { type });
}
