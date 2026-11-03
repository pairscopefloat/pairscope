// Turns Float's raw asset list into one row per ticker, with a type and a market symbol.

const ISSUER_NAMES = {
  XSTOCK: 'xStock', SUNRISE: 'Sunrise', TESSERA: 'Tessera', PRESTOCK: 'PreStock',
  BASKET: 'Basket', CRYPTO: 'Crypto', LEVERAGE: 'Leverage', CUSTOM: 'Custom',
};

export const ETFS = new Set(['SPY', 'QQQ', 'GLD', 'DRAM', 'SQQQ', 'UVXY', 'USO', 'URA', 'COPX', 'EWY', 'EWZ', 'SCHH']);

// Crypto tokens that Sunrise lists next to its stocks.
export const SUNRISE_CRYPTO = new Set(['TAO', 'ARB', 'DOGE', 'LIT', 'PEAQ', 'LINK', 'CHIP', 'INJ', 'PEPE', 'AVAX', 'APE',
  'ENA', 'ZAMA', 'cbLTC', 'Cake', 'cbADA', 'QNT', 'ONDO', 'SHIB', 'VVV', 'WLD', 'ASTER', 'XPL', 'WLFI', 'PONS', 'PSG']);

// Market symbol to look up for each Float ticker. null means no public price (pre-IPO, baskets, private).
export const SYMBOL_OVERRIDES = {
  'BRK.B': 'BRK-B',
  SKHY: '000660.KS',
  SPCX: null,
  STRC: 'STRC',
  BOT: null,
  VIDA: null,
};

const NICE_NAMES = {
  SPY: 'S&P 500 ETF', QQQ: 'Nasdaq-100 ETF', GLD: 'Gold', XMR: 'Monero (wrapped)', META: 'Meta Platforms',
  NVDA: 'Nvidia', SPCX: 'SpaceX', TSLA: 'Tesla', AAPL: 'Apple', AMZN: 'Amazon', GOOGL: 'Alphabet', MSFT: 'Microsoft',
};

export function kindOf(ticker, issuer) {
  if (issuer === 'CRYPTO' || issuer === 'LEVERAGE' || SUNRISE_CRYPTO.has(ticker)) return 'Crypto';
  if (issuer === 'BASKET') return 'Basket';
  if (issuer === 'PRESTOCK' || issuer === 'TESSERA') return 'Pre-IPO';
  if (ETFS.has(ticker)) return 'ETF';
  return 'Stock';
}

/** One row per ticker. Stocks listed by two issuers (xStock and Sunrise) are merged. */
export function buildAssetRows(rawAssets, extraTickers = []) {
  const rows = new Map();
  for (const a of rawAssets) {
    const issuer = ISSUER_NAMES[a.issuer] || a.issuer;
    const existing = rows.get(a.ticker);
    if (existing) {
      if (!existing.issuers.includes(issuer)) existing.issuers.push(issuer);
      existing.fee = Math.min(existing.fee, a.fee);
      continue;
    }
    const kind = kindOf(a.ticker, a.issuer);
    const symbol = a.ticker in SYMBOL_OVERRIDES ? SYMBOL_OVERRIDES[a.ticker]
      : (kind === 'Stock' || kind === 'ETF') ? a.ticker : null;
    rows.set(a.ticker, {
      ticker: a.ticker, name: NICE_NAMES[a.ticker] || a.name, issuers: [issuer], kind, fee: a.fee, symbol,
    });
  }
  // Picker images that the text parse missed (Float sometimes renders a few assets without a label row).
  for (const t of extraTickers) {
    if (!t || rows.has(t) || t.length > 12 || /\s/.test(t)) continue;
    rows.set(t, { ticker: t, name: t, issuers: ['Unknown'], kind: 'Stock', fee: 0, symbol: t });
  }
  return [...rows.values()];
}

/** A short company name for news searches: "Krispy Kreme, Inc. Common Stock" -> "Krispy Kreme". */
export function searchName(row) {
  if (row.kind === 'ETF') return row.ticker;
  return row.name
    .replace(/\(.*?\)/g, '')
    .replace(/,?\s+(Inc|Corp|Corporation|Co|Company|Holdings?|Group|Ltd|N\.V|Oyj|plc|LP|Common Stock|Ordinary Shares|Platforms|Technologies|Technology)\.?(?=[\s,]|$)/gi, '')
    .replace(/^The\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
