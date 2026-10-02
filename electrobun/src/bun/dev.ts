/**
 * Bun / Node desktop:dev — same server + wizard without Electrobun window.
 * Opens the system browser. Useful while Hutch/CEF sync is being set up.
 *
 *   bun electrobun/src/bun/dev.ts
 *   # or
 *   npm run desktop:dev
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { startAppServer } from "../shared/appServer.js";
import { resolveMusgoAppRoot } from "../shared/appRoot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolveMusgoAppRoot(__dirname);

/** Optional: MUSGO_SUPPORT_ROOT=/path for a sandbox Application Support */
const overrideRoot = process.env.MUSGO_SUPPORT_ROOT || undefined;

const { origin } = await startAppServer({
  appRoot: APP_ROOT,
  overrideRoot,
  port: Number(process.env.PORT) || 9990,
});

// Always open the editor — packs are on-demand.
const startUrl = `${origin}/`;

console.log(`[musgo desktop:dev] ${startUrl}`);
if (overrideRoot) console.log(`[musgo desktop:dev] support root: ${overrideRoot}`);

openBrowser(startUrl);

function openBrowser(url) {
  const p = platform();
  if (p === "darwin") spawn("open", [url], { stdio: "ignore", detached: true });
  else if (p === "win32") spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
  else spawn("xdg-open", [url], { stdio: "ignore", detached: true });
}
