/**
 * storage.js — shared config/data persistence for Stock Monitor (Firefox).
 * Ported from KDE widget contents/config/main.xml + main.qml.
 *
 * Loaded by popup.html and options.html via <script>, and by background.js
 * via importScripts("utils/storage.js").
 *
 * ── MESSAGE CONTRACT (popup <-> background) ─────────────────────────────
 *   popup -> background: { type: "getData" }
 *     background responds: { single, list, lastUpdated, nextUpdate }
 *   popup -> background: { type: "refresh" }   (force:true bypasses time gate)
 *     background re-fetches from Yahoo and writes storage.data
 *   popup -> background: { type: "getConfig" } / { type: "saveConfig", config }
 *   popup -> background: { type: "configChanged" }  (reload + refresh)
 * ────────────────────────────────────────────────────────────────────────
 *
 * ── STORAGE SHAPE (browser.storage.local) ───────────────────────────────
 *   config: merged DEFAULTS (user overrides win)
 *   data: {
 *     single: { ticker, name, price, rawPrice, change, pct, isPos,
 *               chartPoints, prevClose, currencySym, lastUpdated, nextUpdate },
 *     list:   [ same shape per row ],
 *     lastUpdated: "HH:mm",
 *     nextUpdate: "HH:mm"
 *   }
 *   manualPanelTickerOverride lives inside config ("" = none).
 * ────────────────────────────────────────────────────────────────────────
 */

"use strict";

const DEFAULTS = {
  isLightTheme: false, ticker: "AAPL", isMultiMode: false, showTwoList: false,
  multiTickers: "AAPL, TSLA", sortAlphabetically: false, swapNameAndTicker: false,
  refreshInterval: 5, chartRange: "1D", limitHours: false, skipWeekendRefresh: true,
  startHour: 9, startMinute: 15, endHour: 15, endMinute: 30,
  tickerColor: "#FFFFFF", tickerOpacity: 100, priceColor: "#FFFFFF", priceOpacity: 100,
  positiveColor: "#4cd964", negativeColor: "#FF3B30", bgOpacity: 100,
  hideChangePercentage: false, hideTimestamps: true, formatPrices: true, hideDecimals: false,
  portfolioData: "", showPortfolioMode: false, manualPanelTickerOverride: ""
};
async function getConfig(){
  const res = await browser.storage.local.get("config");
  return Object.assign({}, DEFAULTS, res.config||{});
}
async function setConfig(patch){
  const cur = await getConfig();
  const next = Object.assign({}, cur, patch);
  await browser.storage.local.set({config: next});
  return next;
}
async function getData(){ const r=await browser.storage.local.get("data"); return r.data||null; }
async function setData(d){ await browser.storage.local.set({data:d}); }

/** Panel-ticker override (multi mode). Stored inside config. */
async function getPanelTickerOverride(){
  const cfg = await getConfig();
  return cfg.manualPanelTickerOverride || "";
}
async function setPanelTickerOverride(ticker){
  return setConfig({ manualPanelTickerOverride: ticker || "" });
}
