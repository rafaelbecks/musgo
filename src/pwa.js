/**
 * PWA helpers — File Handling / Launch Queue (installed app associations).
 * Mirrors glow/src/pwa.js for .organism double-click → MUSGO.
 */

export function supportsFileHandling() {
  return typeof window !== "undefined" && "launchQueue" in window;
}

/**
 * Register a consumer for OS-launched files (Chrome/Edge installed PWA).
 * Launches are queued until this is set — call once the UI can open a file.
 * @param {(fileHandle: FileSystemFileHandle) => void | Promise<void>} handler
 */
export function setupLaunchQueue(handler) {
  if (!supportsFileHandling() || typeof handler !== "function") return;

  window.launchQueue.setConsumer((launchParams) => {
    if (!launchParams?.files?.length) return;
    for (const fileHandle of launchParams.files) {
      Promise.resolve(handler(fileHandle)).catch((err) => {
        console.error("[pwa] failed to handle launched file:", err);
      });
    }
  });
}

/**
 * True when a drag event carries files from the OS.
 * @param {DragEvent} e
 */
export function isFileDrag(e) {
  return Boolean(
    e?.dataTransfer &&
      Array.from(e.dataTransfer.types || []).includes("Files")
  );
}

/**
 * Pick the first dropped file, preferring a File System Access handle when available.
 * @param {DragEvent} e
 * @returns {Promise<{ file: File | null, fileHandle: FileSystemFileHandle | null }>}
 */
export async function fileFromDropEvent(e) {
  let file = null;
  let fileHandle = null;

  const items = e.dataTransfer?.items;
  if (items?.length) {
    for (const item of items) {
      if (item.kind !== "file") continue;
      if (typeof item.getAsFileSystemHandle === "function") {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle?.kind === "file") {
            fileHandle = handle;
            file = await handle.getFile();
          }
        } catch {
          file = item.getAsFile();
        }
      } else {
        file = item.getAsFile();
      }
      break;
    }
  }

  if (!file && e.dataTransfer?.files?.length) {
    file = e.dataTransfer.files[0];
  }

  return { file, fileHandle };
}

export function isOrganismFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".organism") || name.endsWith(".json");
}
