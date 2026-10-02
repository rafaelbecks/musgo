# Spike: MUSGO as an Electrobun desktop app

Branch: `spike/electrobun-desktop`

**Implementation:** desktop server, first-run wizard, and pack installer live in [`electrobun/`](../../electrobun/). Assets: [Musgo Assets v1](https://github.com/rafaelbecks/musgo/releases/tag/v1).

```bash
npm run desktop:dev          # wizard + app (system browser)
npm run desktop:sync         # Electrobun/Hutch SDK (once)
npm run desktop:build:dev    # build MUSGO-dev.app (+ Info.plist fix)
npm run desktop:electrobun   # build + open CEF window

open build/dev-macos-arm64/MUSGO-dev.app
```

## Approach

Electrobun with `bundleCEF: true` for Chromium (WebGL + Web MIDI) without a full Electron stack. Large content stays on the [v1 release](https://github.com/rafaelbecks/musgo/releases/tag/v1) and installs into Application Support.

| Pack | Archive | → Application Support |
|---|---|---|
| Examples | `examples-v1.zip` | `assets/examples/` |
| Models | `glb-v1.zip` | `assets/glb/` |
| Environments | `env-v1.zip` | `assets/env/` |
| Fotogrametrías | `fotogrametrias-v1.zip` | `assets/fotogrametrias-secta/` |

macOS root: `~/Library/Application Support/studio.luminode.musgo/`

The desktop HTTP server overlays those folders onto the existing relative paths (`./examples`, `./glb`, `./env`, `./fotogrametrias-secta`).

## Wizard

`/__desktop/index.html` — select packs, progress bar (NDJSON stream), skip anytime. Re-open: **Archivo → Paquetes de contenido…**
