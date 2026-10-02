/**
 * Desktop HTTP API for the content-pack wizard (works in browser + Electrobun CEF).
 */

import {
  getPackStatusMap,
  installPack,
  fetchReleaseChecksums,
  markOnboardingComplete,
  shouldShowWizard,
  readState,
  isLibraryPresent,
} from "./assetStore.js";
import { CONTENT_PACKS, formatBytes } from "./contentPacks.js";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ overrideRoot?: string, appRoot?: string }} ctx
 * @returns {Promise<boolean>} true if handled
 */
export async function handleDesktopApi(req, res, ctx) {
  const url = new URL(req.url || "/", "http://local");
  if (!url.pathname.startsWith("/__desktop/api/")) return false;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  try {
    if (url.pathname === "/__desktop/api/status" && req.method === "GET") {
      const status = getPackStatusMap(ctx.overrideRoot);
      const packs = CONTENT_PACKS.map((p) => {
        const installed = Boolean(status[p.id]);
        const available = isLibraryPresent(p, ctx.overrideRoot, ctx.appRoot);
        return {
          id: p.id,
          label: p.label,
          description: p.description,
          archive: p.archive,
          bytesApprox: p.bytesApprox,
          sizeLabel: formatBytes(p.bytesApprox),
          recommended: p.recommended,
          installed,
          available,
        };
      });
      json(res, {
        packs,
        showWizard: shouldShowWizard(ctx.overrideRoot),
        state: readState(ctx.overrideRoot),
      });
      return true;
    }

    if (url.pathname === "/__desktop/api/skip" && req.method === "POST") {
      markOnboardingComplete(ctx.overrideRoot);
      json(res, { ok: true });
      return true;
    }

    if (url.pathname === "/__desktop/api/complete" && req.method === "POST") {
      markOnboardingComplete(ctx.overrideRoot);
      json(res, { ok: true });
      return true;
    }

    if (url.pathname === "/__desktop/api/install-pack" && req.method === "POST") {
      const body = await readBody(req);
      const packId = body?.packId;
      if (!packId || typeof packId !== "string") {
        json(res, { error: "packId required" }, 400);
        return true;
      }

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const checksums = await fetchReleaseChecksums();
      const pack = CONTENT_PACKS.find((p) => p.id === packId);
      const expected = pack ? checksums[pack.archive] : undefined;

      try {
        await installPack(packId, {
          overrideRoot: ctx.overrideRoot,
          expectedSha256: expected,
          onProgress: (info) => {
            res.write(JSON.stringify({ type: "progress", packId, ...info }) + "\n");
          },
        });
        res.write(JSON.stringify({ type: "done", packId }) + "\n");
      } catch (err) {
        res.write(
          JSON.stringify({
            type: "error",
            packId,
            message: err instanceof Error ? err.message : String(err),
          }) + "\n",
        );
      }
      res.end();
      return true;
    }

    json(res, { error: "Not found" }, 404);
    return true;
  } catch (err) {
    json(
      res,
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
    return true;
  }
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
