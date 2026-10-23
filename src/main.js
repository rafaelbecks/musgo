import { bootApp } from "./app.js";
import { attachMusgoLink } from "./program-link.js";
import { createSplashScreen } from "./splash/splashScreen.js";
import {
  setupLaunchQueue,
  isFileDrag,
  fileFromDropEvent,
  isOrganismFile,
} from "./pwa.js";
import { isModelFile } from "./ui/modelFilePicker.js";
import { isSrtFile } from "./ui/srtFilePicker.js";
import {
  parseMusgoImport,
  isFetchableSrc,
  fetchImportSource,
} from "./musgoLink.js";

const outputSurface =
  new URLSearchParams(location.search).get("surface") === "output";
if (outputSurface) document.body.classList.add("is-output");

const isLocalDev =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname === "[::1]";

/** @type {{ openOrganismExternal: Function, importModelExternal: Function, loadSrtExternal: Function } | null} */
let appApi = null;
/** @type {{ enter: Function } | null} */
let splashApi = null;
let fileDragDepth = 0;

async function purgeServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((reg) => reg.unregister()));

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  } catch (err) {
    console.warn("Service worker registration failed:", err);
  }
}

if (isLocalDev) {
  purgeServiceWorker().catch((err) => {
    console.warn("Service worker purge failed:", err);
  });
} else {
  registerServiceWorker();
}

/**
 * @param {{
 *   file?: File | null,
 *   fileHandle?: FileSystemFileHandle | null,
 *   kind?: "organism" | "model" | "srt",
 *   importSrc?: string | null,
 *   promptImport?: boolean,
 * }} payload
 */
async function deliverExternal(payload) {
  const kind = payload.kind || inferKind(payload.file);
  if (kind === "srt") {
    if (!payload.file) return;
    if (appApi) {
      await appApi.loadSrtExternal(payload.file);
      return;
    }
    if (splashApi?.enter) {
      await splashApi.enter({
        file: payload.file,
        fileHandle: payload.fileHandle ?? null,
        kind: "srt",
      });
    }
    return;
  }

  if (appApi) {
    if (kind === "model") {
      if (payload.file) {
        await appApi.importModelExternal(payload.file);
        return;
      }
      if (payload.importSrc || payload.promptImport) {
        await appApi.importModelExternal(null, {
          src: payload.importSrc || null,
          promptPicker: payload.promptImport || !payload.file,
        });
        return;
      }
    }
    if (payload.file) {
      await appApi.openOrganismExternal(payload.file, payload.fileHandle ?? null);
    }
    return;
  }

  if (splashApi?.enter) {
    await splashApi.enter({
      file: payload.file ?? null,
      fileHandle: payload.fileHandle ?? null,
      kind,
      importSrc: payload.importSrc ?? null,
      promptImport: payload.promptImport ?? false,
    });
  }
}

function inferKind(file) {
  if (file && isModelFile(file)) return "model";
  if (file && isSrtFile(file)) return "srt";
  return "organism";
}

async function openExternalFile(file, fileHandle = null) {
  if (!file) return;

  if (isModelFile(file)) {
    await deliverExternal({ file, fileHandle, kind: "model" });
    return;
  }

  if (isSrtFile(file)) {
    await deliverExternal({ file, fileHandle, kind: "srt" });
    return;
  }

  if (isOrganismFile(file)) {
    await deliverExternal({ file, fileHandle, kind: "organism" });
    return;
  }

  window.alert("Open a .organism, .usdz, .glb, .obj, .stl or .srt file.");
}

async function handleImportHref(href) {
  const parsed = parseMusgoImport(href);
  if (!parsed.wantsImport) return false;

  let file = null;
  if (parsed.src && isFetchableSrc(parsed.src)) {
    try {
      file = await fetchImportSource(parsed.src);
    } catch (err) {
      console.error("[import] fetch failed", err);
      window.alert(err?.message || "No se pudo descargar el modelo.");
      return true;
    }
  }

  await deliverExternal({
    file,
    kind: "model",
    importSrc: parsed.src,
    promptImport: parsed.promptPicker && !file,
  });
  return true;
}

function setupFileDrop() {
  window.addEventListener("dragenter", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    fileDragDepth += 1;
    document.body.classList.add("musgo-file-dragover");
  });

  window.addEventListener("dragover", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  window.addEventListener("dragleave", (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    if (fileDragDepth === 0) {
      document.body.classList.remove("musgo-file-dragover");
    }
  });

  window.addEventListener("drop", (e) => {
    const wasFileDrag = isFileDrag(e);
    fileDragDepth = 0;
    document.body.classList.remove("musgo-file-dragover");
    if (!wasFileDrag) return;
    e.preventDefault();
    fileFromDropEvent(e)
      .then(({ file, fileHandle }) => openExternalFile(file, fileHandle))
      .catch((err) => {
        console.error("[drop] failed to open file", err);
        window.alert(err?.message || "Failed to open dropped file.");
      });
  });
}

async function enterApp({
  file = null,
  fileHandle = null,
  kind = null,
  importSrc = null,
  promptImport = false,
} = {}) {
  const resolvedKind = kind || inferKind(file);
  appApi = await bootApp({
    pendingOrganismFile: resolvedKind === "organism" ? file ?? null : null,
    pendingOrganismHandle:
      resolvedKind === "organism" ? fileHandle ?? null : null,
    pendingModelFile: resolvedKind === "model" ? file ?? null : null,
    pendingImportSrc: importSrc,
    pendingImportPrompt: promptImport,
    pendingSrtFile: resolvedKind === "srt" ? file ?? null : null,
  });
  document.getElementById("app")?.removeAttribute("hidden");
  attachMusgoLink(appApi);
  splashApi = null;
}

if (outputSurface) {
  enterApp().catch((err) => {
    console.error("Failed to boot MUSGO output:", err);
    document.getElementById("app")?.removeAttribute("hidden");
  });
} else {
  splashApi = createSplashScreen({
    onEnter: (payload) =>
      enterApp(payload).catch((err) => {
        console.error("Failed to boot MUSGO:", err);
        document.getElementById("app")?.removeAttribute("hidden");
      }),
  });
}

setupFileDrop();

setupLaunchQueue(async ({ fileHandle = null, targetURL = null } = {}) => {
  try {
    if (fileHandle && fileHandle.kind === "file") {
      const file = await fileHandle.getFile();
      await openExternalFile(file, fileHandle);
      return;
    }
    if (targetURL) {
      await handleImportHref(targetURL);
    }
  } catch (err) {
    console.error("[pwa] launch open failed", err);
    window.alert(err?.message || "Failed to open file from the system.");
  }
});

const initialImport = parseMusgoImport();
if (initialImport.wantsImport) {
  handleImportHref(window.location.href).catch((err) => {
    console.error("[import] deep link failed", err);
  });
}
