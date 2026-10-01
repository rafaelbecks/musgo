/**
 * Electrobun config for the MUSGO desktop spike.
 * Docs: https://framework.blackboard.sh/electrobun/
 *
 * Install (when ready to build):
 *   npx electrobun init   # or: curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
 * Then wire scripts to Hutch / electrobun CLI per current docs.
 */
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "MUSGO",
    identifier: "studio.luminode.musgo",
    version: "0.1.0",
  },
  build: {
    mac: {
      // Chromium for WebGL + Web MIDI; OS WKWebView is the size-optimized default but not our target.
      bundleCEF: true,
      defaultRenderer: "cef",
      createDmg: true,
    },
    win: {
      // Spike: try native WebView2 first (Chromium-based); fall back to CEF if MIDI/WebGL gaps.
      bundleCEF: false,
      defaultRenderer: "native",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
  },
} satisfies ElectrobunConfig;
