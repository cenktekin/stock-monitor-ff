/**
 * api.js — shared Yahoo Finance fetch + response processing helpers.
 * Canonical port of main.qml fetchSingleStock / fetchMultiStocks /
 * processSingleData / processListRow / cleanChartData.
 *
 * background.js can load this via importScripts("utils/api.js") to avoid
 * duplicating the parsing logic; popup.js does not need it (it renders
 * pre-processed data from storage).
 *
 * Depends on format.js (getCurrencySymbol, formatNumber, getApiParams).
 */

"use strict";

/** Fetch one symbol's chart JSON from Yahoo Finance. */
async function fetchChart(symbol, chartRange) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) + "?" + getApiParams(chartRange);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " for " + symbol);
  }
  return response.json();
}

/**
 * Filter null quotes and (for 1D) keep only today's session.
 * Port of the cleanData block in processSingleData / processListRow.
 */
function cleanChartData(meta, quotes, timestamps, chartRange) {
  const cleanData = [];
  const startTime = (meta.currentTradingPeriod && meta.currentTradingPeriod.regular)
    ? meta.currentTradingPeriod.regular.start : 0;

  for (let i = 0; i < quotes.length; i++) {
    if (quotes[i] !== null) {
      if (chartRange === "1D" && startTime > 0) {
        if (timestamps[i] >= startTime) cleanData.push(quotes[i]);
      } else {
        cleanData.push(quotes[i]);
      }
    }
  }

  // Fallback: 1D produced nothing → find last day gap (>4h) and take from there
  if (chartRange === "1D" && cleanData.length === 0 && timestamps && timestamps.length > 0) {
    let dayStartIndex = 0;
    for (let j = timestamps.length - 1; j > 0; j--) {
      if (timestamps[j] - timestamps[j - 1] > 4 * 3600) {
        dayStartIndex = j;
        break;
      }
    }
    for (let k = dayStartIndex; k < quotes.length; k++) {
      if (quotes[k] !== null) cleanData.push(quotes[k]);
    }
  }

  return cleanData;
}

function resolvePreviousClose(meta, cleanData, chartRange) {
  if (chartRange === "1D") {
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

/** Port of processSingleData → single-view data object. */
function processSingleData(json, config, fallbackSymbol) {
  const result = json.chart.result[0];
  const meta = result.meta;
  const quotes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;

  const companyName = meta.shortName || meta.longName || (fallbackSymbol || config.ticker);
  const currencySym = getCurrencySymbol(meta.currency);
  const currentRawPrice = meta.regularMarketPrice;
  const currentPrice = currencySym + formatNumber(meta.regularMarketPrice, false, config.hideDecimals, config.formatPrices);

  const cleanData = cleanChartData(meta, quotes, timestamps, config.chartRange);
  const previousClose = resolvePreviousClose(meta, cleanData, config.chartRange);

  const change = meta.regularMarketPrice - previousClose;
  const isPositive = change >= 0;
  const priceChange = formatNumber(change, true, config.hideDecimals, config.formatPrices);
  const pct = previousClose > 0 ? (change / previousClose) * 100 : 0;
  const percentChange = formatNumber(pct, true, config.hideDecimals, config.formatPrices) + "%";

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
    currency: meta.currency
  };
}

/** Port of processListRow → one multi-list row object. */
function processListRow(symbol, json, config) {
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

  return {
    ticker: symbol,
    name: meta.shortName || meta.longName || symbol,
    price: curSym + formatNumber(current, false, config.hideDecimals, config.formatPrices),
    rawPrice: current,
    change: formatNumber(change, true, config.hideDecimals, config.formatPrices),
    pct: formatNumber(pct, true, config.hideDecimals, config.formatPrices) + "%",
    isPos: change >= 0,
    chartPoints: cleanData,
    prevClose: prev,
    currencySym: curSym,
    currency: meta.currency
  };
}