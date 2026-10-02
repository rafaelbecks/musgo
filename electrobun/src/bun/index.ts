/**
 * Electrobun main process — local asset server + CEF window.
 * Requires Electrobun SDK via `npx electrobun sync` (imports electrobun/main).
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, ApplicationMenu } from "electrobun/main";
import { startAppServer } from "../shared/appServer.js";
import { resolveMusgoAppRoot } from "../shared/appRoot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolveMusgoAppRoot(__dirname);

async function main() {
  const { origin, close } = await startAppServer({
    appRoot: APP_ROOT,
    port: 9990,
  });

  ApplicationMenu.setApplicationMenu([
    {
      label: "MUSGO",
      submenu: [
        {
          label: "Content packs…",
          click: () => {
            mainWindow?.webview?.executeJavascript?.(
              `window.dispatchEvent(new CustomEvent("musgo:open-content-packs"))`,
            );
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          click: () => mainWindow?.webview?.reload?.(),
        },
        {
          label: "Open DevTools",
          click: () => mainWindow?.webview?.openDevTools?.(),
        },
      ],
    },
  ]);

  // Always open the editor — content packs are on-demand (nudge + menus).
  const startUrl = `${origin}/`;

  const mainWindow = new BrowserWindow({
    title: "MUSGO",
    url: startUrl,
    frame: { width: 1440, height: 900 },
    renderer: "cef",
  });

  // Keep server alive with the process; Electrobun exits on last window when configured.
  void close;
  void mainWindow;
}

main().catch((err) => {
  console.error("[musgo] failed to start", err);
  process.exit(1);
});
