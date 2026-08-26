function getCurrencySymbol(code){
  if(!code || code==="null") return "";
  const m={USD:"$",EUR:"\u20AC",GBP:"\u00A3",INR:"\u20B9",JPY:"\u00A5",CNY:"\u00A5",KRW:"\u20A9",RUB:"\u20BD",TRY:"\u20BA"};
  return m[code] || code+" ";
}
function formatNumber(amount,isChange,hideDecimals,formatPrices){
  const num=parseFloat(amount); if(isNaN(num)) return String(amount);
  const isPos=num>=0, abs=Math.abs(num);
  let f=hideDecimals && !isChange ? Math.round(abs).toString() : abs.toFixed(2);
  if(formatPrices){ const p=f.split("."); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,","); f=p.join("."); }
  let s=""; if(isChange && isPos && num>0) s="+"; else if(!isPos) s="-";
  return s+f;
}
function getApiParams(r){
  switch(r){
    case "1D": return "range=2d&interval=2m";
    case "5D": return "range=5d&interval=15m";
    case "1M": return "range=1mo&interval=60m";
    case "6M": return "range=6mo&interval=1d";
    case "YTD": return "range=ytd&interval=1d";
    case "1Y": return "range=1y&interval=1d";
    case "5Y": return "range=5y&interval=1wk";
    case "Max": return "range=max&interval=1mo";
    default: return "range=1d&interval=2m";
  }
}
