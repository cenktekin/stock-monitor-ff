# Stock Monitor — Architecture & Build Guide (post-2026-09-01)

> Previous layout was flat: `manifest.json`, `background.js`, `popup/`, `options/`, `utils/` at repo root. No separation between Firefox and Chrome, duplicate code, and Yahoo Finance BIST bug.

## Why the change

1. **Single source of truth** — `background.js` + `popup/` + `options/` + `utils/` existed twice (FF vs Chrome mental copy). Any fix (e.g. BIST `XU100.IS` -2.93% bug) had to be applied in two places and was missed.
2. **Yahoo Finance BIST bug** — `v8/chart` with `range=1d` returns stale `chartPreviousClose` for BIST indices (`14641.6` = Friday close, not yesterday `14334.1`). The extension calculated `price - chartPreviousClose` → `-429 (-2.93%)` while Google showed `-0.85%`. `regularMarketChangePercent` is always correct; we now derive `prevClose = price / (1 + pct/100)`.
3. **Dual-store publishing** — Firefox (AMO, `browser_specific_settings.gecko`, `background.scripts`) and Chrome (Web Store, `background.service_worker`) need different manifests. A single `manifest.json` at root could not serve both without manual edits.

## What changed (2026-09-01)

```
Before:
  stock-monitor-ff/
  ├── manifest.json              (Firefox-only, gecko)
  ├── background.js
  ├── popup/
  ├── options/
  ├── utils/
  └── icons/

After:
  stock-monitor-ff/
  ├── src/
  │   ├── common/                ← SSOT (all shared code)
  │   │   ├── background.js
  │   │   ├── popup/
  │   │   ├── options/
  │   │   ├── utils/ (storage, format, api)
  │   │   └── icons/
  │   ├── firefox/manifest.json  ← gecko.id, background.scripts
  │   └── chrome/manifest.json   ← no gecko, background.service_worker
  ├── dist/
  │   ├── firefox/               ← generated (gitignored)
  │   └── chrome/                ← generated (gitignored)
  ├── scripts/build.js           ← src/common + src/{platform}/manifest → dist/{platform}
  ├── package.json               ← build/lint/start scripts
  └── docs/ARCHITECTURE.md       ← this file
```

* `git mv` used so history is preserved (`R` renames).
* Root `manifest.json`, `background.js`, `popup/`, `options/`, `utils/` removed (were copied to `src/common/` and `src/firefox/manifest.json`). `icons/icon.png` kept at root for README preview, canonical is `src/common/icons/`.
* `scripts/build.js` is CommonJS, copies `src/common/*` to `dist/{target}/` then overlays `src/{target}/manifest.json`.
* `package.json` added (was missing).

## Future workflow

Always edit `src/common/` and `src/{firefox,chrome}/manifest.json`. Never edit `dist/` (generated).

```bash
npm install

# Build
npm run build              # both targets → dist/
npm run build:firefox
npm run build:chrome

# Develop
npm run start:firefox      # build + web-ext run Firefox (loads dist/firefox/manifest.json)
npm run start:chrome       # build + web-ext run Chrome --target=chromium
npm run lint:firefox       # web-ext lint dist/firefox  (expect 0 errors, 4 icon warnings)
npm run lint:chrome        # web-ext lint dist/chrome
npm run lint               # alias for lint:firefox

# Release
npm run zip:firefox        # web-ext build dist/firefox → web-ext-artifacts/stock_monitor-*.zip (AMO)
# Chrome: dist/chrome/ → zip manually or npm run zip:chrome
```

**Legacy `web-ext run --source-dir .` no longer works** (no manifest at root). Use `dist/firefox`.

## References

* Yahoo `v8/chart` `regularMarketChangePercent` always correct; `chartPreviousClose` stale for `.IS` indices. Fix in `src/common/background.js` `resolvePreviousClose()` and `src/common/utils/api.js`.
* Firefox MV2→MV3 migration: `background.scripts` (Firefox) vs `background.service_worker` (Chrome). `browser_specific_settings.gecko.strict_min_version: 142.0`.
