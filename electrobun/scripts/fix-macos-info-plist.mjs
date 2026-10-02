#!/usr/bin/env node
/**
 * Electrobun 2.0.2 writes a minimal macOS Info.plist that is missing
 * CFBundleShortVersionString (and related keys). Launch Services then returns
 * kLSNoExecutableErr for `open`, and AppKit can abort() inside
 * _RegisterApplication when CEF/NSApplication initializes.
 *
 * Wired as scripts.postWrap so every wrap gets a Launch Services–valid plist.
 */
import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const buildRoot = join(projectRoot, "build");

function findAppBundles(root) {
  if (!existsSync(root)) return [];
  const apps = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const platformDir = join(root, entry.name);
    for (const child of readdirSync(platformDir, { withFileTypes: true })) {
      if (child.isDirectory() && child.name.endsWith(".app")) {
        apps.push(join(platformDir, child.name));
      }
    }
  }
  return apps;
}

function readVersion(appPath) {
  const versionJson = join(appPath, "Contents", "Resources", "version.json");
  if (existsSync(versionJson)) {
    try {
      const parsed = JSON.parse(readFileSync(versionJson, "utf8"));
      if (typeof parsed.version === "string" && parsed.version.trim()) {
        return parsed.version.trim();
      }
    } catch {
      // fall through
    }
  }
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    );
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch {
    // fall through
  }
  return "0.1.0";
}

function plistBuddy(plistPath, command) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", command, plistPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function ensureString(plistPath, key, value) {
  try {
    plistBuddy(plistPath, `Set :${key} ${value}`);
  } catch {
    plistBuddy(plistPath, `Add :${key} string ${value}`);
  }
}

function ensureBool(plistPath, key, value) {
  const lit = value ? "true" : "false";
  try {
    plistBuddy(plistPath, `Set :${key} ${lit}`);
  } catch {
    plistBuddy(plistPath, `Add :${key} bool ${lit}`);
  }
}

/** @returns {boolean} whether AppIcon.icns is present after this call */
function ensureAppIcon(appPath) {
  const resources = join(appPath, "Contents", "Resources");
  const icnsPath = join(resources, "AppIcon.icns");
  if (existsSync(icnsPath)) return true;

  const pngCandidates = [
    join(projectRoot, "icons", "resonant512.png"),
    join(projectRoot, "icons", "resonant192.png"),
  ];
  const png = pngCandidates.find((p) => existsSync(p));
  if (!png) return false;

  const iconset = join(resources, "AppIcon.iconset");
  mkdirSync(iconset, { recursive: true });
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of sizes) {
    const dest = join(iconset, name);
    execFileSync("sips", ["-z", String(size), String(size), png, "--out", dest], {
      stdio: "ignore",
    });
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsPath], {
    stdio: "ignore",
  });
  execFileSync("rm", ["-rf", iconset], { stdio: "ignore" });
  return existsSync(icnsPath);
}

function patchApp(appPath) {
  const plistPath = join(appPath, "Contents", "Info.plist");
  if (!existsSync(plistPath)) {
    console.warn(`[fix-macos-info-plist] skip (no Info.plist): ${appPath}`);
    return;
  }

  const version = readVersion(appPath);
  ensureString(plistPath, "CFBundleShortVersionString", version);
  ensureString(plistPath, "CFBundleVersion", version);
  ensureString(plistPath, "CFBundleInfoDictionaryVersion", "6.0");
  ensureString(plistPath, "CFBundlePackageType", "APPL");
  ensureString(plistPath, "CFBundleExecutable", "launcher");
  ensureString(plistPath, "LSMinimumSystemVersion", "11.0");
  ensureBool(plistPath, "NSHighResolutionCapable", true);
  ensureBool(plistPath, "NSSupportsAutomaticGraphicsSwitching", true);

  try {
    const name = execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :CFBundleName", plistPath],
      { encoding: "utf8" },
    ).trim();
    if (name) ensureString(plistPath, "CFBundleDisplayName", name);
  } catch {
    // optional
  }

  if (ensureAppIcon(appPath)) {
    ensureString(plistPath, "CFBundleIconFile", "AppIcon");
  } else {
    try {
      execFileSync(
        "plutil",
        ["-remove", "CFBundleIconFile", plistPath],
        { stdio: "ignore" },
      );
    } catch {
      // already absent
    }
  }

  try {
    execFileSync(
      "codesign",
      ["--force", "--deep", "--sign", "-", appPath],
      { stdio: "ignore" },
    );
  } catch (err) {
    console.warn(
      `[fix-macos-info-plist] codesign warning: ${err?.message || err}`,
    );
  }

  console.log(
    `[fix-macos-info-plist] patched ${appPath} (CFBundleShortVersionString=${version})`,
  );
}

const apps = findAppBundles(buildRoot);
if (apps.length === 0) {
  console.warn(`[fix-macos-info-plist] no .app bundles under ${buildRoot}`);
} else {
  for (const app of apps) {
    patchApp(app);
  }
}

/** Electrobun/Hutch may import hooks and call the default export. */
export default async function fixMacosInfoPlist() {
  const found = findAppBundles(buildRoot);
  for (const app of found) {
    patchApp(app);
  }
}
