// Stock returns from free sources, no API key.
// Primary: Yahoo Finance chart data. Fallback: Stooq daily CSV (US listings only).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function getJSON(url, timeoutMs = 15000) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Returns computed from a list of daily closes plus the close before the year started. */
export function returnsFromCloses(closes, yearStartClose) {
  const c = closes.filter(v => typeof v === 'number' && isFinite(v));
  if (!c.length || !yearStartClose) return null;
  const last = c[c.length - 1];
  const pct = (a, b) => (b ? +(((a / b) - 1) * 100).toFixed(2) : null);
  return {
    price: +last.toFixed(4),
    ytd: pct(last, yearStartClose),
    d1: c.length >= 2 ? pct(last, c[c.length - 2]) : null,
    m1: c.length >= 22 ? pct(last, c[c.length - 22]) : null,
  };
}

export async function fromYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=ytd&interval=1d`;
  const j = await getJSON(url);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`Yahoo: no data for ${symbol}`);
  const closes = r.indicators?.quote?.[0]?.close || [];
  const live = r.meta?.regularMarketPrice;
  const series = typeof live === 'number' ? [...closes.slice(0, -1), live] : closes;
  const out = returnsFromCloses(series, r.meta?.chartPreviousClose);
  if (!out) throw new Error(`Yahoo: incomplete data for ${symbol}`);
  return { ...out, source: 'yahoo' };
}

/** Parse a Stooq CSV (Date,Open,High,Low,Close,Volume) into returns for the given year. */
export function returnsFromStooqCsv(csv, year) {
  const rows = csv.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r.length >= 5);
  const prior = rows.filter(r => r[0] < `${year}-01-01`);
  const thisYear = rows.filter(r => r[0] >= `${year}-01-01`).map(r => parseFloat(r[4]));
  if (!prior.length || !thisYear.length) return null;
  return returnsFromCloses(thisYear, parseFloat(prior[prior.length - 1][4]));
}

export async function fromStooq(symbol, now = new Date()) {
  if (symbol.includes('.')) throw new Error(`Stooq: skipping non-US ${symbol}`);
  const year = now.getUTCFullYear();
  const d = dt => dt.toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d&d1=${year - 1}1215&d2=${d(now)}`;
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Stooq ${res.status}`);
  const out = returnsFromStooqCsv(await res.text(), year);
  if (!out) throw new Error(`Stooq: no data for ${symbol}`);
  return { ...out, source: 'stooq' };
}

export async function getReturns(symbol) {
  try { return await fromYahoo(symbol); }
  catch (e1) {
    try { return await fromStooq(symbol); }
    catch (e2) { throw new Error(`${symbol}: ${e1.message} | ${e2.message}`); }
  }
}
