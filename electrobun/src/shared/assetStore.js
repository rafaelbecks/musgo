/**
 * Application Support layout + pack install state.
 * macOS: ~/Library/Application Support/studio.luminode.musgo/
 */

import { homedir, platform } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  createWriteStream,
} from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import {
  APP_IDENTIFIER,
  CONTENT_PACKS,
  PACK_DIRS,
  packDownloadUrl,
} from "./contentPacks.js";

/**
 * @param {string} [overrideRoot]  for tests / desktop:dev sandbox
 */
export function getSupportRoot(overrideRoot) {
  if (overrideRoot) return overrideRoot;
  const home = homedir();
  const p = platform();
  if (p === "darwin") {
    return join(home, "Library", "Application Support", APP_IDENTIFIER);
  }
  if (p === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, APP_IDENTIFIER);
  }
  return join(home, ".local", "share", APP_IDENTIFIER);
}

export function getAssetsRoot(overrideRoot) {
  return join(getSupportRoot(overrideRoot), "assets");
}

export function getStatePath(overrideRoot) {
  return join(getSupportRoot(overrideRoot), "state.json");
}

/**
 * @typedef {object} MusgoState
 * @property {boolean} [onboardingComplete]
 * @property {string[]} [installedPacks]
 * @property {Record<string, string>} [packSha256]
 */

/** @returns {MusgoState} */
export function readState(overrideRoot) {
  const path = getStatePath(overrideRoot);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/** @param {MusgoState} state */
export function writeState(state, overrideRoot) {
  const root = getSupportRoot(overrideRoot);
  mkdirSync(root, { recursive: true });
  writeFileSync(getStatePath(overrideRoot), JSON.stringify(state, null, 2));
}

export function ensureAssetDirs(overrideRoot) {
  const assets = getAssetsRoot(overrideRoot);
  mkdirSync(assets, { recursive: true });
  for (const dir of Object.values(PACK_DIRS)) {
    mkdirSync(join(assets, dir), { recursive: true });
  }
  return assets;
}

/**
 * @param {import("./contentPacks.js").ContentPack} pack
 */
export function isPackInstalled(pack, overrideRoot) {
  const state = readState(overrideRoot);
  if (state.installedPacks?.includes(pack.id)) {
    const dir = join(getAssetsRoot(overrideRoot), PACK_DIRS[pack.installAs]);
    if (!existsSync(dir)) return false;
    for (const marker of pack.markers || []) {
      if (!existsSync(join(dir, marker))) return false;
    }
    return true;
  }
  // Heuristic: markers present even without state
  const dir = join(getAssetsRoot(overrideRoot), PACK_DIRS[pack.installAs]);
  if (!existsSync(dir)) return false;
  return (pack.markers || []).every((m) => existsSync(join(dir, m)));
}

/**
 * True if the library can be served (App Support install or local/bundled copy).
 * @param {import("./contentPacks.js").ContentPack} pack
 * @param {string} [overrideRoot]
 * @param {string} [appRoot]
 */
export function isLibraryPresent(pack, overrideRoot, appRoot) {
  if (isPackInstalled(pack, overrideRoot)) return true;
  if (!appRoot) return false;
  const dir = join(appRoot, PACK_DIRS[pack.installAs]);
  if (!existsSync(dir)) return false;
  return (pack.markers || []).every((m) => existsSync(join(dir, m)));
}

/** @returns {Record<string, boolean>} */
export function getPackStatusMap(overrideRoot) {
  /** @type {Record<string, boolean>} */
  const map = {};
  for (const pack of CONTENT_PACKS) {
    map[pack.id] = isPackInstalled(pack, overrideRoot);
  }
  return map;
}

/**
 * Fetch SHA256SUMS from the release (best-effort).
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchReleaseChecksums() {
  const url = packDownloadUrl("SHA256SUMS");
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const text = await res.text();
    /** @type {Record<string, string>} */
    const map = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^([a-fA-F0-9]{64})\s+(\S+)$/);
      if (m) map[m[2]] = m[1].toLowerCase();
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * @param {string} packId
 * @param {{
 *   overrideRoot?: string,
 *   onProgress?: (info: { phase: string, received: number, total: number, ratio: number }) => void,
 *   signal?: AbortSignal,
 *   expectedSha256?: string,
 * }} [opts]
 */
export async function installPack(packId, opts = {}) {
  const pack = CONTENT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown pack: ${packId}`);

  const overrideRoot = opts.overrideRoot;
  const assetsRoot = ensureAssetDirs(overrideRoot);
  const downloads = join(getSupportRoot(overrideRoot), "downloads");
  mkdirSync(downloads, { recursive: true });

  const zipPath = join(downloads, pack.archive);
  const url = packDownloadUrl(pack.archive);

  opts.onProgress?.({ phase: "download", received: 0, total: 0, ratio: 0 });

  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  const total = Number(res.headers.get("content-length") || 0);
  const hash = createHash("sha256");

  if (!res.body) throw new Error("No response body");

  // Node/Bun: write with progress
  const nodeStream = Readable.fromWeb(/** @type {any} */ (res.body));
  let received = 0;
  nodeStream.on("data", (chunk) => {
    received += chunk.length;
    hash.update(chunk);
    const ratio = total > 0 ? Math.min(1, received / total) : 0;
    opts.onProgress?.({
      phase: "download",
      received,
      total,
      ratio: ratio * 0.9,
    });
  });

  await pipeline(nodeStream, createWriteStream(zipPath));
  const digest = hash.digest("hex");

  if (opts.expectedSha256 && digest !== opts.expectedSha256.toLowerCase()) {
    rmSync(zipPath, { force: true });
    throw new Error(
      `Checksum mismatch for ${pack.archive}: expected ${opts.expectedSha256}, got ${digest}`,
    );
  }

  opts.onProgress?.({
    phase: "extract",
    received,
    total: total || received,
    ratio: 0.92,
  });

  // Zips contain a top-level folder (examples/, glb/, env/, fotogrametrias-secta/)
  const extractTmp = join(downloads, `extract-${pack.id}`);
  rmSync(extractTmp, { recursive: true, force: true });
  mkdirSync(extractTmp, { recursive: true });

  await unzipTo(zipPath, extractTmp);

  const installDirName = PACK_DIRS[pack.installAs];
  const extractedFolder = join(extractTmp, installDirName);
  const target = join(assetsRoot, installDirName);

  if (!existsSync(extractedFolder)) {
    // Some zips might flatten; accept extractTmp contents if marker found
    throw new Error(
      `Zip did not contain expected folder "${installDirName}/"`,
    );
  }

  rmSync(target, { recursive: true, force: true });
  renameSync(extractedFolder, target);
  rmSync(extractTmp, { recursive: true, force: true });
  rmSync(zipPath, { force: true });

  const state = readState(overrideRoot);
  const installed = new Set(state.installedPacks || []);
  installed.add(pack.id);
  state.installedPacks = [...installed];
  state.packSha256 = { ...(state.packSha256 || {}), [pack.id]: digest };
  writeState(state, overrideRoot);

  opts.onProgress?.({
    phase: "done",
    received,
    total: total || received,
    ratio: 1,
  });

  return { packId, digest, target };
}

/** @param {string} zipPath @param {string} destDir */
function unzipTo(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-o", "-q", zipPath, "-d", destDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip failed (${code}): ${err || zipPath}`));
    });
  });
}

/**
 * @param {string[]} packIds
 * @param {{
 *   overrideRoot?: string,
 *   onPackProgress?: (packId: string, info: object) => void,
 *   signal?: AbortSignal,
 * }} [opts]
 */
export async function installPacks(packIds, opts = {}) {
  const checksums = await fetchReleaseChecksums();
  const results = [];
  for (const id of packIds) {
    const pack = CONTENT_PACKS.find((p) => p.id === id);
    const expected = pack ? checksums[pack.archive] : undefined;
    const result = await installPack(id, {
      overrideRoot: opts.overrideRoot,
      signal: opts.signal,
      expectedSha256: expected,
      onProgress: (info) => opts.onPackProgress?.(id, info),
    });
    results.push(result);
  }
  return results;
}

export function markOnboardingComplete(overrideRoot) {
  const state = readState(overrideRoot);
  state.onboardingComplete = true;
  writeState(state, overrideRoot);
}

export function shouldShowWizard(overrideRoot) {
  const state = readState(overrideRoot);
  if (state.onboardingComplete) return false;
  // Show if any recommended pack is missing
  return CONTENT_PACKS.some((p) => p.recommended && !isPackInstalled(p, overrideRoot));
}
