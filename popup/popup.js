/* popup.js - Single/Multi view + chart, port of QML SingleStockView/MultiStockView */
"use strict";

let cfg = null;
let data = null; // { single, list, lastUpdated, nextUpdate }
const els = {};

// ── Canvas drawChart: birebir QML SingleStockView.drawChart portu ──────
function drawChart(ctx, w, h, chartData, prevClose, isPos, drawBackground) {
  ctx.clearRect(0, 0, w, h);
  if (!chartData || chartData.length < 2) return;
  let minVal = Math.min(...chartData), maxVal = Math.max(...chartData);
  let range = maxVal - minVal; if (range === 0) range = 1;
  const padding = range * (drawBackground ? 0.1 : 0.05);
  minVal -= padding; maxVal += padding; range = maxVal - minVal;
  const getY = v => h - ((v - minVal) / range * h);

  const posColor = cfg.positiveColor || "#4cd964";
  const negColor = cfg.negativeColor || "#FF3B30";
  const baseColor = cfg.isLightTheme ? "#e0e0e0" : "#333333";

  if (drawBackground) {
    const prevY = getY(prevClose);
    ctx.beginPath(); ctx.strokeStyle = baseColor; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.moveTo(0, prevY); ctx.lineTo(w, prevY); ctx.stroke(); ctx.setLineDash([]);
  }

  ctx.beginPath();
  const stepX = w / (chartData.length - 1);
  ctx.moveTo(0, getY(chartData[0]));
  for (let i = 1; i < chartData.length; i++) ctx.lineTo(i * stepX, getY(chartData[i]));
  ctx.lineJoin = "round"; ctx.lineWidth = 2;
  ctx.strokeStyle = isPos ? posColor : negColor;
  ctx.stroke();

  if (drawBackground) {
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const bc = isPos ? posColor : negColor;
    grad.addColorStop(0, hexToRgba(bc, 0.3));
    grad.addColorStop(1, hexToRgba(bc, 0));
    ctx.fillStyle = grad; ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
  if (!m) return "rgba(128,128,128," + alpha + ")";
  return "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," +
    parseInt(m[3], 16) + "," + alpha + ")";
}

// ── Theme: isLightTheme → body class + CSS vars (bgColor/chartBaseColor) ──
function applyTheme() {
  document.body.classList.toggle("light", !!cfg.isLightTheme);
  const root = document.documentElement.style;
  root.setProperty("--pos", cfg.positiveColor);
  root.setProperty("--neg", cfg.negativeColor);
  root.setProperty("--bg", cfg.isLightTheme ? "#ffffff" : "#1a1a1a");
  root.setProperty("--card", cfg.isLightTheme ? "#f5f5f5" : "#222");
  root.setProperty("--text", cfg.isLightTheme ? "#111" : "#fff");
  root.setProperty("--muted", cfg.isLightTheme ? "#555" : "#888");
  root.setProperty("--border", cfg.isLightTheme ? "#e0e0e0" : "#333");
}

// ── Single view (SingleStockView port) ──────────────────────────────────
function renderSingle(single) {
  document.getElementById("singleView").classList.remove("hidden");
  document.getElementById("panelBadge").classList.add("hidden");
  document.getElementById("header").classList.remove("hidden");
  document.getElementById("multiList").classList.add("hidden");
  if (!single) return;

  const isPos = single.isPos;
  els.arrow.textContent = isPos ? "\u25B2" : "\u25BC";
  els.arrow.className = "arrow " + (isPos ? "pos" : "neg");

  const displayTicker = single.ticker || cfg.ticker;
  if (cfg.swapNameAndTicker) {
    els.ticker.textContent = single.name || displayTicker;
    els.company.textContent = single.ticker || "";
  } else {
    els.ticker.textContent = displayTicker.toUpperCase();
    els.company.textContent = single.name || "";
  }
  els.company.title = single.name || "";
  els.ticker.style.color = cfg.tickerColor;
  els.ticker.style.opacity = (cfg.tickerOpacity / 100);

  els.pct.textContent = single.pct || "";
  els.pct.className = "pct badge " + (isPos ? "pos" : "neg");
  els.pct.classList.toggle("hidden", !!cfg.hideChangePercentage);
  els.change.textContent = single.change || "";
  els.change.className = "change " + (isPos ? "pos" : "neg");

  els.priceBig.textContent = single.price || "---";
  els.priceBig.style.color = cfg.priceColor;
  els.priceBig.style.opacity = (cfg.priceOpacity / 100);

  const canvas = document.getElementById("chartCanvas");
  const empty = document.getElementById("chartEmpty");
  if (single.chartPoints && single.chartPoints.length > 1) {
    empty.classList.add("hidden");
    canvas.style.display = "block";
    const ctx = canvas.getContext("2d");
    drawChart(ctx, canvas.width, canvas.height, single.chartPoints, single.prevClose, isPos, true);
  } else {
    canvas.style.display = "none";
    empty.classList.remove("hidden");
    empty.textContent = (single.chartPoints && single.chartPoints.length === 0) ? "No chart data" : "Loading chart...";
  }
}

// ── Multi view (MultiStockView port) ────────────────────────────────────
function getPanelTicker(list) {
  const override = cfg.manualPanelTickerOverride;
  if (override && list.some(it => it.ticker === override)) return override;
  return list.length ? list[0].ticker : "";
}

function renderMulti(list) {
  document.getElementById("singleView").classList.add("hidden");
  document.getElementById("header").classList.add("hidden");
  document.getElementById("panelBadge").classList.remove("hidden");
  const wrap = document.getElementById("multiList");
  wrap.innerHTML = "";
  if (!list || list.length === 0) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");

  // Compact panel badge: panel ticker = override or first
  const panelTicker = getPanelTicker(list);
  const panel = list.find(it => it.ticker === panelTicker) || list[0];
  els.panelTicker.textContent = panelTicker.toUpperCase();
  els.panelArrow.textContent = panel.isPos ? "\u25B2" : "\u25BC";
  els.panelArrow.className = "arrow " + (panel.isPos ? "pos" : "neg");
  els.panelPrice.textContent = panel.price || "---";
  els.panelPrice.className = "panel-price " + (panel.isPos ? "pos" : "neg");
  els.panelPct.textContent = panel.pct || "";
  els.panelPct.className = "pct badge " + (panel.isPos ? "pos" : "neg");
  els.panelPct.classList.toggle("hidden", !!cfg.hideChangePercentage);

  list.forEach(item => {
    const row = document.createElement("div");
    row.className = "stock-row";
    const pos = item.isPos;

    const left = document.createElement("div");
    left.className = "stock-left";
    const tickerRow = document.createElement("div");
    tickerRow.className = "stock-ticker";
    const arrow = document.createElement("span");
    arrow.className = "arrow " + (pos ? "pos" : "neg");
    arrow.textContent = pos ? "\u25B2" : "\u25BC";
    const tickerSpan = document.createElement("span");
    tickerSpan.textContent = cfg.swapNameAndTicker ? (item.name || item.ticker) : item.ticker;
    tickerSpan.style.color = cfg.tickerColor;
    tickerSpan.style.opacity = (cfg.tickerOpacity / 100);
    tickerRow.appendChild(arrow);
    tickerRow.appendChild(tickerSpan);
    const name = document.createElement("div");
    name.className = "stock-name";
    name.textContent = cfg.swapNameAndTicker ? item.ticker : (item.name || "");
    left.appendChild(tickerRow);
    left.appendChild(name);

    const right = document.createElement("div");
    right.className = "stock-right";
    const price = document.createElement("div");
    price.className = "stock-price";
    price.textContent = item.price || "---";
    price.style.color = cfg.priceColor;
    price.style.opacity = (cfg.priceOpacity / 100);
    const badge = document.createElement("div");
    badge.className = "stock-badge " + (pos ? "pos" : "neg");
    badge.textContent = (item.change || "") + " (" + (item.pct || "") + ")";
    right.appendChild(price);
    right.appendChild(badge);

    // Star: set as panel ticker (hover-visible)
    const star = document.createElement("button");
    star.className = "star-btn" + (item.ticker === panelTicker ? " active" : "");
    star.title = "Panel ticker yap";
    star.textContent = "\u2605";
    star.addEventListener("click", async (e) => {
      e.stopPropagation();
      await setPanelTickerOverride(item.ticker);
      cfg.manualPanelTickerOverride = item.ticker;
      browser.runtime.sendMessage({ type: "refresh" });
      renderMulti(list);
    });

    row.appendChild(left);
    row.appendChild(right);
    row.appendChild(star);

    // Left click → Yahoo Finance
    row.addEventListener("click", () => {
      browser.tabs.create({ url: "https://finance.yahoo.com/quote/" + encodeURIComponent(item.ticker) });
    });
    // Right click → set as panel ticker (override)
    row.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      await setPanelTickerOverride(item.ticker);
      cfg.manualPanelTickerOverride = item.ticker;
      browser.runtime.sendMessage({ type: "refresh" });
      renderMulti(list);
    });
    // Middle click → refresh
    row.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        browser.runtime.sendMessage({ type: "refresh" });
        row.style.opacity = "0.4";
        setTimeout(() => { row.style.opacity = "1"; }, 300);
      }
    });

    wrap.appendChild(row);
  });
}

// ── Footer: lastUpdated • nextUpdate ────────────────────────────────────
function renderFooter() {
  if (cfg.hideTimestamps || !data || !data.lastUpdated) {
    els.timestamps.textContent = "";
  } else {
    els.timestamps.textContent = "Updated: " + data.lastUpdated + " \u2022 Next: " + data.nextUpdate;
  }
}

// ── Load + render ───────────────────────────────────────────────────────
async function loadAndRender() {
  cfg = await getConfig();
  applyTheme();

  document.querySelectorAll("#rangeBar [data-range]").forEach(b => {
    b.classList.toggle("active", b.dataset.range === cfg.chartRange);
  });

  try {
    const res = await browser.runtime.sendMessage({ type: "getData" });
    data = res;
  } catch (e) {
    data = await getData();
  }

  if (!data || (!data.single && (!data.list || data.list.length === 0))) {
    els.company.textContent = "No data yet - refreshing...";
    browser.runtime.sendMessage({ type: "refresh" });
    renderFooter();
    return;
  }

  if (cfg.isMultiMode) {
    renderMulti(data.list || []);
  } else {
    renderSingle(data.single);
  }
  renderFooter();
}

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  els.arrow = document.getElementById("arrow");
  els.ticker = document.getElementById("ticker");
  els.company = document.getElementById("company");
  els.pct = document.getElementById("pct");
  els.change = document.getElementById("change");
  els.priceBig = document.getElementById("priceBig");
  els.timestamps = document.getElementById("timestamps");
  els.panelTicker = document.getElementById("panelTicker");
  els.panelArrow = document.getElementById("panelArrow");
  els.panelPrice = document.getElementById("panelPrice");
  els.panelPct = document.getElementById("panelPct");

  document.getElementById("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });

  // Refresh button → background "refresh"
  document.getElementById("refreshBtn").addEventListener("click", () => {
    browser.runtime.sendMessage({ type: "refresh" });
    els.priceBig.style.opacity = "0.3";
    setTimeout(() => { els.priceBig.style.opacity = (cfg.priceOpacity / 100); }, 300);
  });

  // Range switch → persist + refresh
  document.querySelectorAll("#rangeBar [data-range]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = btn.dataset.range;
      await setConfig({ chartRange: r });
      cfg.chartRange = r;
      document.querySelectorAll("#rangeBar [data-range]").forEach(b => b.classList.toggle("active", b === btn));
      browser.runtime.sendMessage({ type: "refresh" });
    });
  });

  // Header click → Yahoo Finance (tick click); middle click → refresh
  document.getElementById("header").addEventListener("click", () => {
    const t = (data && data.single && data.single.ticker) || cfg.ticker;
    browser.tabs.create({ url: "https://finance.yahoo.com/quote/" + encodeURIComponent(t) });
  });
  document.getElementById("header").addEventListener("auxclick", (e) => {
    if (e.button === 1) { e.preventDefault(); browser.runtime.sendMessage({ type: "refresh" }); }
  });

  await loadAndRender();

  // Auto-refresh: re-render when background updates data/config
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.data || changes.config)) loadAndRender();
  });
});