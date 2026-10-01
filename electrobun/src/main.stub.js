/**
 * Electrobun main-process sketch for the MUSGO spike.
 * Not wired to Hutch yet — implement against current electrobun/main APIs when scaffolding the build.
 *
 * Responsibilities:
 * - Open CEF BrowserWindow → views:// or file URL to packaged UI
 * - Ensure ~/Library/Application Support/studio.luminode.musgo/assets exists
 * - Download + extract content packs (see contentPacks.js)
 * - Expose asset root + pack flags to the webview (RPC or injected script)
 */

import { ASSET_SUPPORT_DIRNAME, CONTENT_PACKS, ASSET_CDN_BASE } from "./contentPacks.js";

/** @returns {string} Absolute Application Support assets directory (platform-specific). */
export function getAssetsRoot() {
  // Pseudocode — replace with Electrobun / OS path helper once main runtime is chosen:
  // macOS: join(homedir(), "Library/Application Support", ASSET_SUPPORT_DIRNAME, "assets")
  // Windows: join(process.env.APPDATA, ASSET_SUPPORT_DIRNAME, "assets")
  // Linux: join(homedir(), ".local/share", ASSET_SUPPORT_DIRNAME, "assets")
  throw new Error("getAssetsRoot: wire to Electrobun path API in spike implementation");
}

/**
 * @param {string} packId
 * @param {{ onProgress?: (ratio: number) => void }} [opts]
 */
export async function installPack(packId, opts = {}) {
  const pack = CONTENT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  const url = new URL(pack.archive, ASSET_CDN_BASE).href;
  void url;
  void opts;
  // 1. fetch with progress
  // 2. verify sha256 from remote manifest.json
  // 3. extract into getAssetsRoot() / PACK_DIRS[pack.installAs]
  // 4. update state.json
  throw new Error("installPack: not implemented — spike stub");
}

export async function createMainWindow() {
  // import { BrowserWindow } from "electrobun/main";
  // new BrowserWindow({
  //   title: "MUSGO",
  //   url: "views://main/index.html",
  //   renderer: "cef",
  //   frame: { width: 1440, height: 900 },
  // });
  throw new Error("createMainWindow: wire Electrobun BrowserWindow in spike implementation");
}
