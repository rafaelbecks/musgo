# Spike: MUSGO as an Electrobun desktop app

Branch: `spike/electrobun-desktop`

Goal: ship a small desktop shell that still uses **Chromium** for WebGL + Web MIDI, without bundling a full Electron stack, and without embedding ~1.5 GB of content in the installer.

## Why Electrobun (vs Electron)

| | Electron | Electrobun (this spike) |
|---|---|---|
| UI engine | Bundled Chromium | **Optional CEF** (`bundleCEF: true`) or OS webview |
| Main process | Node | Cottontail / Bun (small) |
| Hello-world size | ~80–150 MB+ | ~1–15 MB **without** CEF; CEF adds Chromium but skips Electron’s Node+Chromium packaging tax |
| Updates | electron-updater etc. | Built-in bsdiff updates from static storage |

**Decision for MUSGO:** use Electrobun with `bundleCEF: true` and `defaultRenderer: "cef"`.

- Keeps Chromium for Three.js / WebGL consistency and **Web MIDI**.
- Avoids shipping the Electron packaging model.
- macOS native WKWebView is *not* a good default here (MIDI / WebGL quirks vs Chrome). Windows WebView2 is Chromium-based and might work without CEF later — spike should A/B MIDI + HDR loading on WebView2 vs CEF.

CEF still costs tens–hundreds of MB. That is acceptable if **content packs** are not in the app binary.

## Current asset reality

Measured in this repo (working tree):

| Pack | Approx size | Role | App without it? |
|---|---|---|---|
| `examples/` | ~152 KB | `.organism` demos | Yes — empty examples UI |
| `textures/` | ~1.4 MB | glass / water normals | Prefer **bundled** (tiny, always needed for materials) |
| `glb/` | ~114 MB | sample / imported models | Yes — procedural shapes still work |
| `env/` (HDR + EXR) | **~1.4 GB** | IBL environments | Yes — studio lights / `none` already exist |
| `fotogrametrias-secta/` | ~331 MB | photogrammetry | Keep **out** of default packs |

**~1.4 GB of `env/` + models is already tracked in git** (no Git LFS). That is the wrong long-term home for binaries this large: clone times, history bloat, and GitHub soft limits.

## Recommended asset strategy

### Do not invent a separate “library” package (unless sharing across apps)

A npm/git submodule “asset library” still forces download at install time and couples app version to content. Prefer **versioned content packs** hosted as static archives.

### Host packs outside the app repo

Put packs on static object storage (best → good enough):

1. **Cloudflare R2 / S3 / Backblaze B2** — cheap, CDN, signed or public URLs
2. **GitHub Releases** — fine for packs under ~2 GB per asset; simple; rate limits / bandwidth less ideal for many users
3. Keep **manifests in git** (`examples/index.json`, `glb/models.json`, `env` catalog in `src/config.js`) so the UI knows what *can* be downloaded

Suggested pack layout (versioned zip/tar.zst):

```
musgo-assets/
  v1/
    examples-v1.zip          (~150 KB)
    models-core-v1.zip       (~114 MB glb)
    env-hdr-v1.zip           (~6 MB — the 1k HDR set only)
    env-exr-v1.zip           (~1.3 GB — optional full EXR library)
  manifest.json              # urls, sizes, sha256, min app version
```

Split **HDR starter** vs **full EXR** so first-run can offer “small / full” without forcing 1.3 GB.

### Install location (macOS)

```
~/Library/Application Support/studio.luminode.musgo/
  assets/
    examples/
    glb/
    env/
  state.json                 # which packs installed, versions, skip-prompt
```

Electrobun main process owns download + extract; webview only sees `file://` or a local `assets://` / HTTP from a tiny main-process static server.

### Runtime resolution

Today paths are relative (`./env/...`, `./glb/...`, `./examples/...`). For desktop:

1. **Dev (browser / `serve`)** — keep current relative paths in the repo.
2. **Packaged** — asset root = Application Support if pack present, else missing → UI shows “Download pack” / disabled option.
3. Always ship **`textures/`** inside the app bundle (~1.4 MB).

Resolver sketch:

```
resolveAsset("env/exr/foo.exr")
  → $APP_SUPPORT/assets/env/exr/foo.exr   if exists
  → ./env/exr/foo.exr                     if unpackaged / web
  → null                                  → show download affordance
```

App is fully usable with packs skipped: torus / Gielis / L-system / DLA + studio lighting.

## First-run UX

On first launch (no `state.json` or `onboardingComplete`):

1. Open editor normally (no blocking splash that forces download).
2. Modal: “Optional content” — checkboxes for Examples / Models / Environments (HDR vs Full EXR).
3. Skip → never required; Settings → “Download content packs…” anytime.
4. Progress + sha256 verify in main process; cancelable.

## Spike checklist

- [ ] Scaffold Electrobun app (`electrobun/` or repo root config) loading existing `index.html` / `src/`
- [ ] `bundleCEF: true` mac build; smoke WebGL + Web MIDI
- [ ] Main-process `Application Support` path + pack install stub
- [ ] Asset URL resolver used by `config.js` / examples / modelCatalog
- [ ] Publish one tiny pack (`examples`) to GitHub Release or R2 and download it end-to-end
- [ ] Compare CEF vs native WebView2 (Windows) for MIDI if targeting Win
- [ ] Plan git migration: stop tracking large `env/exr` + `glb` binaries; leave catalogs + README pointers

## Non-goals for this spike

- Replacing Electrobun with Tauri / Wails
- Bundling SuperCollider / Pd
- Shipping `fotogrametrias-secta` in default packs

## Open questions

1. **CEF download size** for pinned Electrobun CEF on macOS arm64 — measure after first `hutch` build.
2. Prefer **R2** vs **GitHub Releases** for the 1.3 GB EXR pack (bandwidth + resumable downloads).
3. Keep web demo (`musgo.luminode.studio`) on CDN-hosted packs with the same `manifest.json`.
4. Whether HDR-only pack is enough for v1 desktop, with EXR as “pro library”.
