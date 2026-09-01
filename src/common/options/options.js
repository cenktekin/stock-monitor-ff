/* Stock Monitor — Options page logic
 *
 * Storage contract (shared with background.js / popup.js via utils/storage.js):
 *   - config lives as ONE object under the "config" key in browser.storage.local
 *   - getConfig() / setConfig(patch) from utils/storage.js merge with DEFAULTS
 *   - save() sends {type:"configChanged"} to background, which reloads config,
 *     resets the "refresh" alarm and refreshes data.
 * Setting names match contents/config/main.xml (KDE widget) 1:1.
 */
"use strict";

if (typeof browser === "undefined" && typeof chrome !== "undefined") globalThis.browser = chrome;

/* Form field -> storage key mapping (id === storage key). */
const FIELDS = [
  { id: "isMultiMode", type: "checkbox" },
  { id: "showTwoList", type: "checkbox" },
  { id: "ticker", type: "text" },
  { id: "multiTickers", type: "textarea" },
  { id: "sortAlphabetically", type: "checkbox" },
  { id: "swapNameAndTicker", type: "checkbox" },
  { id: "chartRange", type: "select" },
  { id: "refreshInterval", type: "number" },
  { id: "limitHours", type: "checkbox" },
  { id: "skipWeekendRefresh", type: "checkbox" },
  { id: "startHour", type: "number" },
  { id: "startMinute", type: "number" },
  { id: "endHour", type: "number" },
  { id: "endMinute", type: "number" },
  { id: "hideTimestamps", type: "checkbox" },
  { id: "formatPrices", type: "checkbox" },
  { id: "hideDecimals", type: "checkbox" },
  { id: "hideChangePercentage", type: "checkbox" },
  { id: "showPortfolioMode", type: "checkbox" },
  { id: "positiveColor", type: "text" },
  { id: "negativeColor", type: "text" },
  { id: "tickerColor", type: "text" },
  { id: "priceColor", type: "text" },
  { id: "bgOpacity", type: "range" },
  { id: "tickerOpacity", type: "range" },
  { id: "priceOpacity", type: "range" }
];

const COLOR_FIELDS = ["positiveColor", "negativeColor", "tickerColor", "priceColor"];
const SLIDER_FIELDS = [
  { id: "bgOpacity", label: "bgOpacityLabel" },
  { id: "tickerOpacity", label: "tickerOpacityLabel" },
  { id: "priceOpacity", label: "priceOpacityLabel" }
];

/* Latest known config (portfolioData lives here, not in the form). */
let currentCfg = {};

let saveTimer = null;
let statusTimer = null;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function clampInt(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(value) {
  let v = String(value || "").trim();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  return "#000000";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function showStatus(msg) {
  const el = document.getElementById("statusText");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove("visible"), 2000);
}

/* ------------------------------------------------------------------ */
/* Visibility (mirrors QML `visible:` bindings)                        */
/* ------------------------------------------------------------------ */
function updateVisibility() {
  const multi = document.getElementById("isMultiMode").checked;
  document.getElementById("row-showTwoList").classList.toggle("hidden", !multi);
  document.getElementById("row-multiTickers").classList.toggle("hidden", !multi);
  document.getElementById("row-sortAlphabetically").classList.toggle("hidden", !multi);
  document.getElementById("row-ticker").classList.toggle("hidden", multi);

  const limit = document.getElementById("limitHours").checked;
  document.getElementById("row-startTime").classList.toggle("hidden", !limit);
  document.getElementById("row-endTime").classList.toggle("hidden", !limit);
}

function updateSliderLabels() {
  for (const s of SLIDER_FIELDS) {
    const el = document.getElementById(s.id);
    const label = document.getElementById(s.label);
    if (el && label) label.textContent = el.value + "%";
  }
}

/* ------------------------------------------------------------------ */
/* Load / Save                                                         */
/* ------------------------------------------------------------------ */
async function load() {
  currentCfg = await getConfig();

  for (const f of FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.type === "checkbox") el.checked = !!currentCfg[f.id];
    else el.value = currentCfg[f.id];
  }

  for (const c of COLOR_FIELDS) {
    const picker = document.getElementById(c + "Picker");
    const text = document.getElementById(c);
    if (picker && text) picker.value = normalizeHex(text.value);
  }

  updateSliderLabels();
  updateVisibility();
  renderPortfolio();
}

async function save() {
  const cfg = {};
  for (const f of FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    if (f.type === "checkbox") cfg[f.id] = el.checked;
    else if (f.type === "number") cfg[f.id] = parseInt(el.value, 10) || 0;
    else cfg[f.id] = el.value;
  }

  /* Clamp ranges to match QML SpinBox/Slider bounds. */
  cfg.refreshInterval = clampInt(cfg.refreshInterval, 1, 360);
  cfg.startHour = clampInt(cfg.startHour, 0, 23);
  cfg.startMinute = clampInt(cfg.startMinute, 0, 59);
  cfg.endHour = clampInt(cfg.endHour, 0, 23);
  cfg.endMinute = clampInt(cfg.endMinute, 0, 59);
  cfg.bgOpacity = clampInt(cfg.bgOpacity, 0, 100);
  cfg.tickerOpacity = clampInt(cfg.tickerOpacity, 0, 100);
  cfg.priceOpacity = clampInt(cfg.priceOpacity, 0, 100);

  cfg.portfolioData = currentCfg.portfolioData;
  Object.assign(currentCfg, cfg);

  try {
    await setConfig(cfg);
  } catch (e) {
    console.error("Failed to write storage:", e);
    showStatus("Save failed");
    return;
  }

  notifyChanged();
  showStatus("Saved");
}

function notifyChanged() {
  /* Background reloads config, resets the "refresh" alarm and refreshes data. */
  try {
    browser.runtime.sendMessage({ type: "configChanged" });
  } catch (e) {
    /* background may not be ready yet — ignore */
  }
  /* Defensive: keep the alarm period in sync even if background is asleep. */
  try {
    browser.alarms.create("refresh", { periodInMinutes: currentCfg.refreshInterval });
  } catch (e) {
    /* alarms unavailable in this context — background handles it */
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-section").forEach((sec) => {
    sec.classList.toggle("active", sec.dataset.tab === name);
  });
}

/* ------------------------------------------------------------------ */
/* Search (Yahoo Finance)                                              */
/* ------------------------------------------------------------------ */
async function searchSymbols(query) {
  const help = document.getElementById("searchHelpText");
  const resultsEl = document.getElementById("searchResults");
  resultsEl.innerHTML = "";

  if (!query || query.trim().length < 1) {
    help.textContent = "Enter a search term.";
    return;
  }

  help.textContent = "Searching...";
  try {
    const url = "https://query2.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(query.trim());
    const resp = await fetch(url);
    if (!resp.ok) {
      help.textContent = "Search failed (HTTP " + resp.status + ").";
      return;
    }
    const res = await resp.json();
    const quotes = (res.quotes || []).filter((q) => q && q.symbol);
    if (quotes.length === 0) {
      help.textContent = "No symbols found.";
      return;
    }
    help.textContent = "Suggestions:";
    for (const item of quotes.slice(0, 10)) {
      resultsEl.appendChild(createResultRow(item.symbol, item.shortname || item.longname || item.symbol));
    }
  } catch (e) {
    console.error("Search failed:", e);
    help.textContent = "Error parsing search results.";
  }
}

function createResultRow(symbol, name) {
  const li = document.createElement("li");
  li.className = "search-result";

  const label = document.createElement("span");
  label.className = "result-label";
  label.innerHTML = "<b>" + escapeHtml(symbol) + "</b> - " + escapeHtml(name);

  const actions = document.createElement("span");
  actions.className = "result-actions";

  const ssBtn = document.createElement("button");
  ssBtn.className = "btn small";
  ssBtn.textContent = "SS";
  ssBtn.title = "Add to Single Stock";
  ssBtn.addEventListener("click", () => setSingleStock(symbol));

  const mslBtn = document.createElement("button");
  mslBtn.className = "btn small";
  mslBtn.textContent = "MSL";
  mslBtn.title = "Add to Multi Stock List";
  mslBtn.addEventListener("click", () => addToMultiList(symbol));

  actions.appendChild(ssBtn);
  actions.appendChild(mslBtn);
  li.appendChild(label);
  li.appendChild(actions);
  return li;
}

function setSingleStock(symbol) {
  document.getElementById("ticker").value = symbol;
  document.getElementById("isMultiMode").checked = false;
  updateVisibility();
  document.getElementById("searchHelpText").textContent = "Set " + symbol + " as Single Stock.";
  scheduleSave();
}

function addToMultiList(symbol) {
  const field = document.getElementById("multiTickers");
  const current = field.value ? field.value.trim() : "";
  if (current === "") {
    field.value = symbol;
  } else {
    const arr = current.split(",").map((s) => s.trim());
    if (arr.indexOf(symbol) === -1) {
      field.value = current + ", " + symbol;
    }
  }
  document.getElementById("isMultiMode").checked = true;
  updateVisibility();
  document.getElementById("searchHelpText").textContent = "Added " + symbol + " to Multi Stock List.";
  scheduleSave();
}

/* ------------------------------------------------------------------ */
/* Portfolio                                                           */
/* ------------------------------------------------------------------ */
function safeParsePortfolio(data) {
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse portfolio data:", e);
    return [];
  }
}

function formatPortfolioList(portfolio) {
  if (!portfolio || portfolio.length === 0) {
    return "No holdings added yet.";
  }
  let str = "Current Holdings:\n";
  for (const item of portfolio) {
    str += "• " + item.ticker + ": " + item.shares + " shares @ " + Number(item.averageCost).toFixed(2) + "\n";
  }
  return str;
}

function escapeCsvField(val) {
  const str = String(val);
  if (str.indexOf(",") >= 0 || str.indexOf('"') >= 0 || str.indexOf("\n") >= 0) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function renderPortfolio() {
  const portfolio = safeParsePortfolio(currentCfg.portfolioData);
  document.getElementById("portfolioListText").textContent = formatPortfolioList(portfolio);
}

function addOrUpdateHolding() {
  const tickerField = document.getElementById("portfolioTicker");
  const sharesField = document.getElementById("portfolioShares");
  const costField = document.getElementById("portfolioCost");

  const ticker = tickerField.value.trim().toUpperCase();
  const shares = parseInt(sharesField.value, 10) || 0;
  if (ticker === "" || shares <= 0) return;

  const portfolio = safeParsePortfolio(currentCfg.portfolioData);
  const cost = parseFloat(costField.value) || 0;
  const found = portfolio.find((item) => item.ticker === ticker);

  if (found) {
    found.shares = shares;
    found.averageCost = cost;
    found.lastModifiedDate = new Date().toISOString();
  } else {
    portfolio.push({
      ticker: ticker,
      shares: shares,
      averageCost: cost,
      addedDate: new Date().toISOString()
    });
  }

  currentCfg.portfolioData = JSON.stringify(portfolio);
  renderPortfolio();
  tickerField.value = "";
  sharesField.value = 0;
  costField.value = "";
  scheduleSave();
}

function removeHolding() {
  const tickerField = document.getElementById("portfolioTicker");
  const ticker = tickerField.value.trim().toUpperCase();
  if (ticker === "") return;

  const portfolio = safeParsePortfolio(currentCfg.portfolioData).filter((item) => item.ticker !== ticker);
  currentCfg.portfolioData = JSON.stringify(portfolio);
  renderPortfolio();
  scheduleSave();
}

function exportCsv() {
  const portfolio = safeParsePortfolio(currentCfg.portfolioData);
  const listEl = document.getElementById("portfolioListText");
  if (portfolio.length === 0) {
    listEl.textContent = "No portfolio data to export.";
    return;
  }
  let csv = "Ticker,Shares,Average Cost,Added Date\n";
  for (const item of portfolio) {
    csv += escapeCsvField(item.ticker) + "," + escapeCsvField(item.shares) + "," +
           escapeCsvField(item.averageCost) + "," + escapeCsvField(item.addedDate) + "\n";
  }
  listEl.textContent = "CSV Content (copy manually):\n" + csv;
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                        */
/* ------------------------------------------------------------------ */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.getElementById("saveBtn").addEventListener("click", () => {
  clearTimeout(saveTimer);
  save();
});

/* Auto-save on any form change (debounced 500ms). */
document.querySelectorAll("input, select, textarea").forEach((el) => {
  if (el.id.endsWith("Picker")) return; /* color pickers handled below */
  const evt = (el.type === "text" || el.type === "range" || el.type === "number") ? "input" : "change";
  el.addEventListener(evt, () => {
    updateVisibility();
    updateSliderLabels();
    scheduleSave();
  });
});

/* Color picker <-> hex text sync. */
for (const c of COLOR_FIELDS) {
  const picker = document.getElementById(c + "Picker");
  const text = document.getElementById(c);
  if (!picker || !text) continue;
  picker.addEventListener("input", () => {
    text.value = picker.value;
    scheduleSave();
  });
  text.addEventListener("input", () => {
    picker.value = normalizeHex(text.value);
    scheduleSave();
  });
}

/* Search. */
document.getElementById("searchBtn").addEventListener("click", () => {
  searchSymbols(document.getElementById("searchField").value);
});
document.getElementById("searchField").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchSymbols(document.getElementById("searchField").value);
  }
});

/* Portfolio. */
document.getElementById("portfolioAddBtn").addEventListener("click", addOrUpdateHolding);
document.getElementById("portfolioRemoveBtn").addEventListener("click", removeHolding);
document.getElementById("portfolioExportBtn").addEventListener("click", exportCsv);

/* Backup Import/Export */
document.getElementById("exportBtn")?.addEventListener("click", async ()=>{
  const cfg2 = await getConfig();
  const raw = await browser.storage.local.get(null);
  const payload = {
    _meta: {app:"stock-monitor-ff", version:"2.2", exportedAt: new Date().toISOString()},
    config: cfg2,
    data: raw.data || null
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="stock-monitor-backup-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  const st=document.getElementById("backupStatus");
  if(st){ st.style.display="block"; st.textContent="✓ Export edildi: "+Object.keys(cfg2).length+" ayar"; setTimeout(()=>st.style.display="none",2500); }
});
document.getElementById("importBtn")?.addEventListener("click", ()=> document.getElementById("importFile").click());
document.getElementById("importFile")?.addEventListener("change", async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  const st=document.getElementById("backupStatus");
  try{
    const text=await f.text();
    const j=JSON.parse(text);
    const cfgJ=j.config || j;
    // Robust: take everything from file's config, plus ensure defaults for missing keys
    const next = {...DEFAULTS, ...cfgJ};
    // Remove any _meta noise if present at top level
    delete next._meta;
    // Persist via helper to ensure correct shape
    await setConfig(next);
    if(j.data) await browser.storage.local.set({data: j.data});
    try{ await browser.runtime.sendMessage({type:"configChanged"}); }catch(_){}
    if(st){ st.style.display="block"; st.textContent="✓ Import edildi ("+f.name+"): ticker="+next.ticker+" interval="+next.refreshInterval+" activeHours="+(next.limitHours?"✓":"✗")+" "+next.startHour+":"+String(next.startMinute).padStart(2,"0")+"-"+next.endHour+":"+String(next.endMinute).padStart(2,"0"); }
    setTimeout(()=> location.reload(), 900);
  }catch(err){
    console.error("Import failed", err);
    if(st){ st.style.display="block"; st.textContent="✗ Import hatası: "+err.message; }
  } finally { e.target.value=""; }
});
document.getElementById("exportPortfolioBtn2")?.addEventListener("click", ()=>{
  const pf=safeParsePortfolio(currentCfg.portfolioData);
  if(pf.length===0){ const st=document.getElementById("backupStatus"); st.style.display="block"; st.textContent="Portfolio boş"; return; }
  let csv="Ticker,Shares,Average Cost,Added Date\n";
  for(const p of pf) csv+=escapeCsvField(p.ticker)+","+escapeCsvField(p.shares)+","+escapeCsvField(p.averageCost)+","+escapeCsvField(p.addedDate||"")+"\n";
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="portfolio-"+new Date().toISOString().slice(0,10)+".csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

/* Init. */
load();