// Reads Float's public pages the same way a visitor sees them.
// Float has no public API, so we load the pages in a headless browser and parse the visible text.
// If Float changes its layout, the parse functions below are the only place that needs fixing.

const BASE = 'https://www.floatlaunch.xyz';
const ISSUER_LABELS = ['CRYPTO', 'LEVERAGE', 'XSTOCK', 'TESSERA', 'SUNRISE', 'PRESTOCK', 'BASKET', 'CUSTOM'];

/** Parse the asset picker on /create into [{ticker, issuer, fee, name}]. */
export function parseAssets(text) {
  const start = text.indexOf('Custom');
  const end = text.indexOf('Name your token');
  if (start < 0 || end < 0 || end <= start) throw new Error('Float create page: asset picker not found');
  const lines = text.slice(start + 'Custom'.length, end).split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!ISSUER_LABELS.includes(lines[i])) continue;
    const ticker = lines[i - 1];
    let fee = 0;
    let name = lines[i + 1] ?? ticker;
    const feeMatch = name.match(/^([\d.]+)% transfer fee$/);
    if (feeMatch) { fee = parseFloat(feeMatch[1]); name = lines[i + 2] ?? ticker; }
    out.push({ ticker, issuer: lines[i], fee, name });
  }
  if (out.length < 50) throw new Error(`Float create page: only ${out.length} assets parsed, layout may have changed`);
  return out;
}

const money = s => {
  const m = String(s).match(/\$([\d,.]+)\s*([KMB]?)/);
  if (!m) return 0;
  return parseFloat(m[1].replace(/,/g, '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1);
};

/** Parse the coin list on /tokens into [{ticker, fdv, anchor, graduated}]. */
export function parseCoins(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const coins = [];
  for (let i = 2; i < lines.length - 1; i++) {
    if (lines[i] !== 'Anchored to') continue;
    const ticker = lines[i - 2];
    if (!ticker.startsWith('$')) continue;
    coins.push({
      ticker,
      fdv: money(lines[i - 1]),
      anchor: lines[i + 1],
      graduated: lines[i + 2] === 'Graduated',
    });
  }
  if (coins.length < 20) throw new Error(`Float tokens page: only ${coins.length} coins parsed, layout may have changed`);
  return coins;
}

/**
 * Parse coin cards from /tokens. Each card is a link to /tokens/<mint> whose text reads
 * "$TICKER / $FDV / Anchored to / ASSET / [Graduated]". Returns [{ticker, fdv, anchor, graduated, mint}].
 */
export function parseCards(cards) {
  const out = [];
  const seen = new Set();
  for (const { href, text } of cards) {
    const mint = String(href || '').split('/').filter(Boolean).pop();
    if (!mint || seen.has(mint)) continue;
    const L = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
    const i = L.indexOf('Anchored to');
    if (i < 2 || !L[i - 2].startsWith('$')) continue;
    seen.add(mint);
    out.push({ ticker: L[i - 2], fdv: money(L[i - 1]), anchor: L[i + 1], graduated: L[i + 2] === 'Graduated', mint });
  }
  return out;
}

/** Group coins by the asset they are anchored to. */
export function aggregateCoins(coins, aliases = { Monero: 'XMR' }) {
  const agg = {};
  for (const c of coins) {
    const key = aliases[c.anchor] || c.anchor;
    const a = (agg[key] ||= { coins: 0, graduated: 0, top: '', topFdv: 0 });
    a.coins++;
    if (c.graduated) a.graduated++;
    if (c.fdv > a.topFdv) { a.topFdv = c.fdv; a.top = c.ticker; }
  }
  return agg;
}

/** Load both Float pages in headless Chromium and return their visible text. */
export async function scrapeFloat({ maxShowMore = 80 } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; PairscopeBot/0.1; hourly)' });

    await page.goto(`${BASE}/create`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByText('Pick your pairing asset').waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000);
    const createText = await page.locator('main').innerText();
    const pickerAlts = await page.$$eval('main img[alt]', imgs => imgs.map(i => i.alt).filter(Boolean));

    await page.goto(`${BASE}/tokens`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByText('Anchored to').first().waitFor({ timeout: 30000 });
    for (let i = 0; i < maxShowMore; i++) {
      const more = page.getByRole('button', { name: /show more/i });
      if (!(await more.count())) break;
      await more.first().click();
      await page.waitForTimeout(900);
    }
    const tokensText = await page.locator('main').innerText();
    const cards = await page.$$eval('main a[href^="/tokens/"]', as => as.map(a => ({ href: a.getAttribute('href'), text: a.innerText })));

    // Per-coin holders, 24h volume and rewards paid, from the same feed Float's own page uses. Optional.
    let stats = {};
    try {
      stats = await page.evaluate(async () => {
        const r = await fetch('/api/indexer/coins/stats', { signal: AbortSignal.timeout(20000) });
        return r.ok ? r.json() : {};
      });
    } catch { stats = {}; }

    return { createText, tokensText, pickerAlts, cards, stats };
  } finally {
    await browser.close();
  }
}
