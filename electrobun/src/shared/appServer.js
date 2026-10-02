/**
 * Local static server: MUSGO app + Application Support asset overlay.
 * Pack routes (/examples, /glb, /env, /fotogrametrias-secta) prefer App Support.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { ensureAssetDirs } from "./assetStore.js";
import { PACK_DIRS } from "./contentPacks.js";
import { handleDesktopApi } from "./desktopApi.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
  ".organism": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

const PACK_URL_PREFIXES = Object.values(PACK_DIRS).map((d) => `/${d}/`);

/**
 * @param {{
 *   appRoot: string,
 *   overrideRoot?: string,
 *   port?: number,
 *   host?: string,
 * }} opts
 */
export async function startAppServer(opts) {
  const appRoot = opts.appRoot;
  const overrideRoot = opts.overrideRoot;
  const assetsRoot = ensureAssetDirs(overrideRoot);
  const host = opts.host || "127.0.0.1";
  const preferredPort = opts.port ?? 9990;

  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (await handleDesktopApi(req, res, { overrideRoot, appRoot })) return;
        handleRequest(req, res, { appRoot, assetsRoot });
      } catch (err) {
        console.error("[musgo-server]", err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal error");
        }
      }
    })();
  });

  const port = await listen(server, host, preferredPort);
  const origin = `http://${host}:${port}`;
  return {
    server,
    origin,
    port,
    assetsRoot,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function listen(server, host, preferredPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, attemptsLeft) => {
      const onError = (err) => {
        server.off("listening", onListening);
        if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
          tryPort(port + 1, attemptsLeft - 1);
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(/** @type {any} */ (server.address()).port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    };
    tryPort(preferredPort, 20);
  });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ appRoot: string, assetsRoot: string }} ctx
 */
function handleRequest(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://local");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Wizard assets served from electrobun package
  if (pathname.startsWith("/__desktop/")) {
    const rel = pathname.slice("/__desktop/".length);
    const wizardCandidates = [
      join(ctx.appRoot, "electrobun", "src", "wizard"),
      join(ctx.appRoot, "views", "wizard"),
    ];
    let file = null;
    for (const wizardRoot of wizardCandidates) {
      file = safeJoin(wizardRoot, rel);
      if (file && existsSync(file) && statSync(file).isFile()) break;
      file = null;
    }
    if (file) {
      return sendFile(req, res, file);
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const packFile = resolvePackFile(pathname, ctx.assetsRoot, ctx.appRoot);
  if (packFile) {
    return sendFile(req, res, packFile);
  }

  const appFile = safeJoin(ctx.appRoot, pathname.replace(/^\//, ""));
  if (appFile && existsSync(appFile) && statSync(appFile).isFile()) {
    return sendFile(req, res, appFile);
  }

  res.writeHead(404);
  res.end("Not found");
}

/**
 * Prefer Application Support pack, then repo (dev) copy of the same path.
 * @param {string} pathname
 * @param {string} assetsRoot
 * @param {string} appRoot
 */
function resolvePackFile(pathname, assetsRoot, appRoot) {
  const isPack = PACK_URL_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isPack) return null;

  const rel = pathname.replace(/^\//, "");
  const fromSupport = safeJoin(assetsRoot, rel);
  if (fromSupport && existsSync(fromSupport) && statSync(fromSupport).isFile()) {
    return fromSupport;
  }
  const fromApp = safeJoin(appRoot, rel);
  if (fromApp && existsSync(fromApp) && statSync(fromApp).isFile()) {
    return fromApp;
  }
  return null;
}

/** Prevent path traversal. */
function safeJoin(root, rel) {
  const cleaned = normalize(String(rel).replace(/^[/\\]+/, ""));
  if (cleaned.split(/[/\\]/).includes("..")) return null;
  const full = join(root, cleaned);
  const rootResolved = normalize(root);
  const fullResolved = normalize(full);
  if (fullResolved !== rootResolved && !fullResolved.startsWith(rootResolved + sep)) {
    return null;
  }
  return full;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} filePath
 */
function sendFile(req, res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

/** Tiny JSON helper used by desktop:dev API */
export function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
