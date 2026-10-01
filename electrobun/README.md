# Electrobun spike scaffold

See [docs/spike-electrobun/README.md](../docs/spike-electrobun/README.md).

| File | Purpose |
|---|---|
| `electrobun.config.ts` | App id + `bundleCEF` for Chromium |
| `src/contentPacks.js` | Optional pack definitions + CDN base |
| `src/assetResolve.js` | App Support vs web path helper |
| `src/main.stub.js` | Main-process install / window sketch |
| `assets-manifest.example.json` | Remote manifest shape for published zips |

Next implementation step: `npx electrobun init` (or Hutch), point the window at the existing MUSGO UI, then implement `getAssetsRoot` + `installPack` against real Electrobun APIs.
