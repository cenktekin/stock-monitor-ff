/* Stock Monitor - cross-browser background service worker (Chrome MV3 + Firefox MV3)
 * Port of the KDE Plasma widget (stock-monitor-widget-main) to a WebExtension.
 */

"use strict";

if (typeof browser === "undefined" && typeof chrome !== "undefined") globalThis.browser = chrome;
if (typeof browser !== "undefined") {
  if (!browser.action && browser.browserAction) browser.action = browser.browserAction;
  if (!browser.browserAction && browser.action) browser.browserAction = browser.action;
}

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG - mirrors contents/config/main.xml defaults
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  isLightTheme: false,
  ticker: "AAPL",
  isMultiMode: false,
  showTwoList: false,
  multiTickers: "AAPL, TSLA",
  sortAlphabetically: false,
  swapNameAndTicker: false,
  refreshInterval: 5,
  chartRange: "1D",
  limitHours: false,
  skipWeekendRefresh: true,
  startHour: 9,
  startMinute: 15,
  endHour: 15,
  endMinute: 30,
  tickerColor: "#FFFFFF",
  tickerOpacity: 100,
  priceColor: "#FFFFFF",
  priceOpacity: 100,
  positiveColor: "#4cd964",
  negativeColor: "#FF3B30",
  bgOpacity: 100,
  hideChangePercentage: false,
  hideTimestamps: true,
  formatPrices: true,
  hideDecimals: false,
  portfolioData: "",
  showPortfolioMode: false
};

const CONFIG_KEY = "config";
const DATA_KEY = "data";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let config = Object.assign({}, DEFAULT_CONFIG);
let lastResults = null; // { single: {...}, list: [...] } or null
let lastUpdated = "";
let nextUpdate = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCurrencySymbol(code) {
  // Return empty string if code is missing or literal "null"
  if (!code || code === "null") return "";

  const symbols = {
    "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥",
    "CNY": "¥", "KRW": "₩", "RUB": "₽", "TRY": "₺"
  };
  return symbols[code] || code + " ";
}

// Port of QML formatNumber(amount, isChange)
function formatNumber(amount, isChange) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;

  const isPositive = num >= 0;
  const absNum = Math.abs(num);

  const hideDecs = config.hideDecimals && !isChange;
  let formatted = hideDecs ? Math.round(absNum).toString() : absNum.toFixed(2);

  if (config.formatPrices) {
    const parts = formatted.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    formatted = parts.join(".");
  }

  let sign = "";
  if (isChange && isPositive && num > 0) sign = "+";
  else if (!isPositive) sign = "-";

  return sign + formatted;
}

// Port of QML getApiParams() - Yahoo Finance range/interval mapping
// Fix: 1D now uses range=1d (was 2d) to avoid picking 2-day-old previousClose (BIST XU100.IS showed +219 instead of +66)
function getApiParams(chartRange) {
  switch (chartRange) {
    case "1D":  return "range=1d&interval=2m";
    case "5D":  return "range=5d&interval=15m";
    case "1M":  return "range=1mo&interval=60m";
    case "6M":  return "range=6mo&interval=1d";
    case "YTD": return "range=ytd&interval=1d";
    case "1Y":  return "range=1y&interval=1d";
    case "5Y":  return "range=5y&interval=1wk";
    case "Max": return "range=max&interval=1mo";
    default:    return "range=1d&interval=2m";
  }
}

function formatTimeHHMM(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return h + ":" + m;
}

function updateTimestamps() {
  const now = new Date();
  lastUpdated = formatTimeHHMM(now);
  const next = new Date(now.getTime() + (config.refreshInterval * 60000));
  nextUpdate = formatTimeHHMM(next);
}

// ---------------------------------------------------------------------------
// Time gating - port of QML checkTimeAndRefresh()
// ---------------------------------------------------------------------------
function shouldRefreshNow() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 6=Sat

  // 1. Weekend check (skip for crypto 24/7 - stocks assumed like the widget)
  if (config.skipWeekendRefresh && (day === 0 || day === 6)) {
    return false;
  }

  // 2. Time window check
  if (config.limitHours) {
    const nowHour = d.getHours();
    const nowMin = d.getMinutes();
    const currentTimeVal = nowHour * 60 + nowMin;
    const startTimeVal = config.startHour * 60 + config.startMinute;
    const endTimeVal = config.endHour * 60 + config.endMinute;

    if (currentTimeVal < startTimeVal || currentTimeVal >= endTimeVal) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Fetching - port of fetchSingleStock / fetchMultiStocks (XHR -> fetch)
// ---------------------------------------------------------------------------
async function fetchChart(symbol, range) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) + "?" + getApiParams(range);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " for " + symbol);
  }
  return response.json();
}

async function fetchSingleStock(symbol, range) {
  const json = await fetchChart(symbol, range);
  return processSingleData(json, symbol);
}

async function fetchMultiStocks(tickers, range) {
  const results = await Promise.all(
    tickers.map(async (symbol) => {
      try {
        const json = await fetchChart(symbol, range);
        return processListRow(symbol, json);
      } catch (e) {
        console.log("Error fetching " + symbol + ": " + e);
        return {
          ticker: symbol,
          name: symbol,
          price: "---",
          change: "",
          pct: "",
          isPos: true,
          chartPoints: [],
          prevClose: 0,
          error: String(e)
        };
      }
    })
  );
  return results;
}

// ---------------------------------------------------------------------------
// Processing - port of processSingleData / processListRow
// ---------------------------------------------------------------------------
function cleanChartData(meta, quotes, timestamps, chartRange) {
  const cleanData = [];
  const startTime = (meta.currentTradingPeriod && meta.currentTradingPeriod.regular)
    ? meta.currentTradingPeriod.regular.start : 0;

  for (let i = 0; i < quotes.length; i++) {
    if (quotes[i] !== null) {
      if (chartRange === "1D" && startTime > 0) {
        if (timestamps[i] >= startTime) {
          cleanData.push(quotes[i]);
        }
      } else {
        cleanData.push(quotes[i]);
      }
    }
  }

  // Fallback: if 1D produced nothing, find the last day gap (>4h) and take from there
  if (chartRange === "1D" && cleanData.length === 0 && timestamps && timestamps.length > 0) {
    let dayStartIndex = 0;
    for (let j = timestamps.length - 1; j > 0; j--) {
      if (timestamps[j] - timestamps[j - 1] > 4 * 3600) {
        dayStartIndex = j;
        break;
      }
    }
    for (let k = dayStartIndex; k < quotes.length; k++) {
      if (quotes[k] !== null) {
        cleanData.push(quotes[k]);
      }
    }
  }

  return cleanData;
}

function resolvePreviousClose(meta, cleanData, chartRange) {
  if (chartRange === "1D") {
    // Fix: Yahoo's chartPreviousClose is stale for BIST indices (e.g. XU100.IS showed -2.88% vs real -0.74%).
    // regularMarketChangePercent is always correct (implied prev 14334.1). Derive prev from it when available.
    const pct = meta.regularMarketChangePercent;
    if (typeof pct === "number" && isFinite(pct) && typeof meta.regularMarketPrice === "number" && isFinite(meta.regularMarketPrice)) {
      if (pct === 0) return meta.regularMarketPrice;
      const impliedPrev = meta.regularMarketPrice / (1 + pct / 100);
      if (isFinite(impliedPrev) && impliedPrev > 0) return impliedPrev;
    }
    return meta.chartPreviousClose || meta.regularMarketPreviousClose || meta.previousClose;
  }
  let prev = meta.chartPreviousClose;
  if (!prev || prev === 0) {
    prev = cleanData.length > 0 ? cleanData[0] : meta.regularMarketPreviousClose;
  }
  return prev;
}

function processSingleData(json, fallbackSymbol) {
  try {
    const result = json.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0].close;
    const timestamps = result.timestamp;

    const companyName = meta.shortName || meta.longName || (fallbackSymbol || config.ticker);
    const currencySym = getCurrencySymbol(meta.currency);
    const currentRawPrice = meta.regularMarketPrice;
    const currentPrice = currencySym + formatNumber(meta.regularMarketPrice, false);

    const cleanData = cleanChartData(meta, quotes, timestamps, config.chartRange);
    const previousClose = resolvePreviousClose(meta, cleanData, config.chartRange);

    const change = meta.regularMarketPrice - previousClose;
    const isPositive = change >= 0;
    const priceChange = formatNumber(change, true);
    const percentChange = formatNumber((change / previousClose) * 100, true) + "%";

    updateTimestamps();

    return {
      ticker: fallbackSymbol || config.ticker,
      name: companyName,
      price: currentPrice,
      rawPrice: currentRawPrice,
      change: priceChange,
      pct: percentChange,
      isPos: isPositive,
      chartPoints: cleanData,
      prevClose: previousClose,
      currencySym: currencySym,
      currency: meta.currency,
      lastUpdated: lastUpdated,
      nextUpdate: nextUpdate
    };
  } catch (e) {
    console.log("Error parsing single: " + e);
    return null;
  }
}

function processListRow(symbol, json) {
  try {
    const result = json.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0].close;
    const timestamps = result.timestamp;

    const current = meta.regularMarketPrice;
    const curSym = getCurrencySymbol(meta.currency);

    const cleanData = cleanChartData(meta, quotes, timestamps, config.chartRange);
    const prev = resolvePreviousClose(meta, cleanData, config.chartRange);

    const change = current - prev;
    const pct = prev > 0 ? (change / prev) * 100 : 0;

    updateTimestamps();

    return {
      ticker: symbol,
      name: meta.shortName || meta.longName || symbol,
      price: curSym + formatNumber(current, false),
      rawPrice: current,
      change: formatNumber(change, true),
      pct: formatNumber(pct, true) + "%",
      isPos: change >= 0,
      chartPoints: cleanData,
      prevClose: prev,
      currencySym: curSym,
      currency: meta.currency,
      lastUpdated: lastUpdated,
      nextUpdate: nextUpdate
    };
  } catch (e) {
    console.log("Error parsing multi: " + e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
function parseTickers(list) {
  const tickers = String(list || "").split(",");
  const target = [];
  tickers.forEach(function (t) {
    const clean = t.trim();
    if (clean !== "") target.push(clean);
  });
  if (config.sortAlphabetically) {
    target.sort(function (a, b) { return a.localeCompare(b); });
  }
  return target;
}

async function refreshData() {
  const range = config.chartRange;
  let single = null;
  let list = [];

  if (config.isMultiMode) {
    const tickers = parseTickers(config.multiTickers);
    list = await fetchMultiStocks(tickers, range);
    // Panel ticker = first in list (mirrors widget's panelTicker default)
    if (list.length > 0 && list[0]) {
      single = list[0];
    }
  } else {
    single = await fetchSingleStock(config.ticker, range);
  }

  lastResults = { single: single, list: list };
  await persistData();
  updateBadge(single);
  return lastResults;
}

async function checkTimeAndRefresh() {
  if (!shouldRefreshNow()) {
    if (!lastResults || !lastResults.single) {
      console.log("Stock Monitor: outside window but no cached data, forcing fetch");
      return refreshData();
    }
    console.log("Stock Monitor: outside refresh window, skipping fetch");
    return null;
  }
  return refreshData();
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
function updateBadge(single) {
  try {
    // hideChangePercentage -> badge'i tamamen kapat (widget panel ayarı ile uyumlu)
    if (config.hideChangePercentage) {
      browser.action.setBadgeText({ text: "" });
      browser.action.setTitle({ title: single ? single.ticker + " " + single.price + " (" + single.pct + ")" : "Stock Monitor" });
      return;
    }
    if (!single || single.pct === undefined || single.pct === "") {
      browser.action.setBadgeText({ text: "" });
      browser.action.setTitle({ title: "Stock Monitor" });
      return;
    }
    // pct = "+2.30%" veya "-12.50%" - badge 4 karakterle sınırlı
    // Kompakt format: <10 ise 1 ondalık (+2.3), >=10 ise tam sayı (+12), >=100 ise 99'a clamp
    let raw = parseFloat(String(single.pct).replace("%","").replace("+",""));
    // sign'ı koru
    const isPos = single.isPos;
    const abs = Math.abs(raw);
    let compact;
    // Badge visually ~3ch max (other extensions show "2.5", "13", "+16" etc.)
    // "+" + "1.2" = 4ch is clipped, so use 3ch: positive without sign (color=green), negative with "-"
    if (raw === 0) compact = "0";
    else if (abs >= 100) compact = (isPos ? "" : "-") + "99";
    else if (abs >= 10) compact = (isPos ? "" : "-") + Math.round(abs).toString();
    else {
      const s = abs.toFixed(1); // "1.2" / "0.5"
      compact = isPos ? s : "-" + s;
      if (compact.length > 3) {
        // "-1.2" (4ch) -> "-1" (2ch) to fit 3ch
        compact = isPos ? s.slice(0,3) : ("-" + Math.round(abs).toString()).slice(0,3);
        if (compact.endsWith(".")) compact = compact.slice(0,-1);
      }
    }
    if (compact.length > 3) compact = compact.slice(0,3);
    browser.action.setBadgeText({ text: compact });
    browser.action.setBadgeBackgroundColor({
      color: isPos ? config.positiveColor : config.negativeColor
    });
    // Tooltip'te tam değer göster
    browser.action.setTitle({ title: single.ticker + " " + single.price + " (" + single.pct + ") • " + (single.name||"") });
  } catch (e) {
    console.log("Badge error: " + e);
  }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
async function persistData() {
  const payload = {
    single: lastResults ? lastResults.single : null,
    list: lastResults ? lastResults.list : [],
    lastUpdated: lastUpdated,
    nextUpdate: nextUpdate
  };
  await browser.storage.local.set({ [DATA_KEY]: payload });
}

async function loadConfig() {
  const stored = await browser.storage.local.get(CONFIG_KEY);
  if (stored && stored[CONFIG_KEY]) {
    config = Object.assign({}, DEFAULT_CONFIG, stored[CONFIG_KEY]);
  }
}

async function saveConfig(newConfig) {
  config = Object.assign({}, DEFAULT_CONFIG, newConfig);
  await browser.storage.local.set({ [CONFIG_KEY]: config });
  await setupAlarm();
  return config;
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------
async function setupAlarm() {
  await browser.alarms.clear("refresh");
  browser.alarms.create("refresh", { periodInMinutes: Math.max(1, config.refreshInterval) });
}

// ---------------------------------------------------------------------------
// Search - query2.finance.yahoo.com/v1/finance/search
// ---------------------------------------------------------------------------
async function searchSymbols(query) {
  const url = "https://query2.finance.yahoo.com/v1/finance/search?q=" +
    encodeURIComponent(query);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("Search HTTP " + response.status);
  }
  const json = await response.json();
  const quotes = json.quotes || [];
  return quotes.map(function (q) {
    return {
      symbol: q.symbol,
      shortname: q.shortname || q.longname || q.symbol,
      exchDisp: q.exchDisp || "",
      typeDisp: q.typeDisp || ""
    };
  });
}

// ---------------------------------------------------------------------------
// Message handling (popup / options)
// ---------------------------------------------------------------------------
browser.storage.onChanged.addListener(async (changes, area)=>{
  if(area==="local" && changes.config){
    config = Object.assign({}, DEFAULT_CONFIG, changes.config.newValue||{});
    await setupAlarm();
    // badge'i anında güncelle (hideChangePercentage toggle için)
    const d = await browser.storage.local.get(DATA_KEY);
    if(d && d[DATA_KEY] && d[DATA_KEY].single) updateBadge(d[DATA_KEY].single);
  }
});

browser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  const handle = async function () {
    const msgType = (message && (message.type || message.action)) || "";
  switch (msgType) {
      case "refresh":
        // If manual refresh, bypass time gate? Keep gate but allow force via forceRefresh
        if(message && message.force) return await refreshData();
        return await checkTimeAndRefresh();
      case "getData":
        {
          const payload = await browser.storage.local.get("data");
          if(payload && payload.data) return payload.data;
          return lastResults ? { single: lastResults.single, list: lastResults.list, lastUpdated, nextUpdate } : { single: null, list: [], lastUpdated:"", nextUpdate:"" };
        }
      case "getConfig":
        return config;
      case "saveConfig":
        return await saveConfig(message.config || {});
      case "search":
        return await searchSymbols(message.query || "");
      case "configChanged":
        await loadConfig();
        await setupAlarm();
        return await checkTimeAndRefresh();
      default:
        return null;
    }
  };

  handle().then(sendResponse).catch(function (err) {
    console.log("Message error: " + err);
    sendResponse({ error: String(err) });
  });

  // Keep the message channel open for async sendResponse
  return true;
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
browser.runtime.onInstalled.addListener(async function (details) {
  console.log("Stock Monitor installed: " + (details.reason || "install"));
  await loadConfig();
  await browser.storage.local.set({ [CONFIG_KEY]: config });
  await setupAlarm();
  await checkTimeAndRefresh();
});

browser.runtime.onStartup.addListener(async function () {
  await loadConfig();
  await setupAlarm();
  await checkTimeAndRefresh();
});

// Initial load (event page wake)
(async function init() {
  try {
    await loadConfig();
    await setupAlarm();
    await checkTimeAndRefresh();
  } catch (e) {
    console.log("Init error: " + e);
  }
})();