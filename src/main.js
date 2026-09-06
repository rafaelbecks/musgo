import { bootApp } from "./app.js";
import { createSplashScreen } from "./splash/splashScreen.js";
import {
  setupLaunchQueue,
  isFileDrag,
  fileFromDropEvent,
  isOrganismFile,
} from "./pwa.js";

const isLocalDev =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1" ||
  location.hostname === "[::1]";

/** @type {{ openOrganismExternal: Function } | null} */
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

async function openOrganismExternal(file, fileHandle = null) {
  if (!isOrganismFile(file)) {
    window.alert("Open a .organism file.");
    return;
  }

  if (appApi?.openOrganismExternal) {
    await appApi.openOrganismExternal(file, fileHandle);
    return;
  }

  if (splashApi?.enter) {
    await splashApi.enter({ file, fileHandle });
  }
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
      .then(({ file, fileHandle }) => openOrganismExternal(file, fileHandle))
      .catch((err) => {
        console.error("[drop] failed to open file", err);
        window.alert(err?.message || "Failed to open dropped file.");
      });
  });
}

splashApi = createSplashScreen({
  onEnter: async ({ file = null, fileHandle = null } = {}) => {
    try {
      appApi = await bootApp({
        pendingOrganismFile: file ?? null,
        pendingOrganismHandle: fileHandle ?? null,
      });
      document.getElementById("app")?.removeAttribute("hidden");
    } catch (err) {
      console.error("Failed to boot MUSGO:", err);
      document.getElementById("app")?.removeAttribute("hidden");
    } finally {
      splashApi = null;
    }
  },
});

setupFileDrop();

setupLaunchQueue(async (fileHandle) => {
  if (!fileHandle || fileHandle.kind !== "file") return;
  try {
    const file = await fileHandle.getFile();
    await openOrganismExternal(file, fileHandle);
  } catch (err) {
    console.error("[pwa] launch open failed", err);
    window.alert(err?.message || "Failed to open organism from the system.");
  }
});
