import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Repo root in dev; `Resources/app` when the main process is bundled under `app/bun/`.
 * @param {string} mainDir - directory of the main-process entry (e.g. electrobun/src/bun).
 */
export function resolveMusgoAppRoot(mainDir) {
  const packagedRoot = join(mainDir, "..");
  if (existsSync(join(packagedRoot, "index.html"))) {
    return packagedRoot;
  }
  return join(mainDir, "../../..");
}
