import type { ElectrobunConfig } from "electrobun";

/**
 * MUSGO Electrobun build — Chromium (CEF) shell + optional content packs.
 * @see https://github.com/rafaelbecks/musgo/releases/tag/v1
 * @see docs/spike-electrobun/README.md
 */
export default {
  app: {
    name: "MUSGO",
    identifier: "studio.luminode.musgo",
    version: "0.1.0",
    description:
      "Morfogénesis de Unidades y Sistemas Generativos Orgánicos",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "electrobun/src/bun/index.ts",
    },
    // UI is served by the main-process HTTP server from the app root.
    // Keep a minimal packaged view as CEF bootstrap fallback.
    copy: {
      // MUSGO static app (served by main-process HTTP server from Resources/app).
      "index.html": "index.html",
      "styles.css": "styles.css",
      "manifest.json": "manifest.json",
      "sw.js": "sw.js",
      "header.png": "header.png",
      "src": "src",
      "icons": "icons",
      "fonts": "fonts",
      "assets": "assets",
      "textures": "textures",
      "midi-mappings": "midi-mappings",
      // Optional packs (examples/env/glb/fotogrametrías) stay on the assets release
      "electrobun/src/wizard": "electrobun/src/wizard",
    },
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
      createDmg: true,
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  scripts: {
    // Electrobun 2.0.2 emits a minimal Info.plist without
    // CFBundleShortVersionString; Launch Services then fails open with
    // kLSNoExecutableErr and AppKit can abort in _RegisterApplication.
    // Paths are imported as modules (not shell commands). Hook both stages —
    // postWrap is skipped on some incremental/dev rebuilds.
    postWrap: "electrobun/scripts/fix-macos-info-plist.mjs",
    postBuild: "electrobun/scripts/fix-macos-info-plist.mjs",
  },
} satisfies ElectrobunConfig;
