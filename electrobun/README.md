# MUSGO desktop (Electrobun)

Chromium (CEF) shell via [Electrobun](https://framework.blackboard.sh/electrobun/), with optional content packs from [Assets v1](https://github.com/rafaelbecks/musgo/releases/tag/v1).

## Quick start (app + on-demand packs)

```bash
npm run desktop:dev
```

Opens the editor immediately. Optional packs (examples / models / envs / fotogrametrías) download on demand:

- Bottom-left nudge: **Descargar contenidos extra** (dismiss once → localStorage)
- Menus / “Descargar entornos…” when content is missing
- Compact in-app modal with the same loading-bar look as MUSGO

Packs install to `~/Library/Application Support/studio.luminode.musgo/assets/`.

## Electrobun / CEF window

```bash
npm run desktop:sync      # download Electrobun SDK + toolchains (needs network)
npm run desktop:electrobun
# release:
npm run desktop:build
```

Config: [`electrobun.config.ts`](../electrobun.config.ts) (`bundleCEF: true`).

## Layout

| Path | Role |
|---|---|
| `src/shared/contentPacks.js` | Pack ids matching release `v1` zips |
| `src/shared/assetStore.js` | Download, SHA-256, unzip → Application Support |
| `src/shared/appServer.js` | Serves app + overlays pack folders |
| `src/shared/desktopApi.js` | Wizard HTTP API + NDJSON progress |
| `src/wizard/` | First-run pack picker UI |
| `src/bun/index.ts` | Electrobun main (CEF window) |
| `src/bun/dev.ts` | Browser-based desktop:dev |

## Re-open wizard

- Menu (Electrobun): **MUSGO → Content packs…**
- Or visit `/__desktop/index.html?next=/`
