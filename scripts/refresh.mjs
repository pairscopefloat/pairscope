// Hourly refresh: Float coin counts + stock returns + news -> docs/data/pairscope.json
// Run locally with:  npm run refresh
// Options (env):  FIXTURES=1 use saved Float pages in test/fixtures instead of scraping
//                 PRICES=0 / NEWS=0 skip that step and keep the previous values
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { scrapeFloat, parseAssets, parseCoins, parseCards, aggregateCoins } from './lib/float.mjs';
import { buildCoinRows } from './lib/coins.mjs';
import { buildAssetRows, searchName } from './lib/classify.mjs';
import { getReturns } from './lib/prices.mjs';
import { getNews } from './lib/news.mjs';
import { rankRows } from './lib/score.mjs';

const OUT = new URL('../docs/data/pairscope.json', import.meta.url);
const env = process.env;

async function readPrevious() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return null; }
}

/** Run fn over items with a small worker pool and a pause between calls, so free sources are not hammered. */
async function pool(items, size, pauseMs, fn) {
  const results = new Map();
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try { results.set(item, { ok: true, value: await fn(item) }); }
      catch (e) { results.set(item, { ok: false, error: e.message }); }
      await new Promise(r => setTimeout(r, pauseMs));
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

async function main() {
  const started = Date.now();
  const prev = await readPrevious();
  const prevBy = new Map((prev?.assets || []).map(a => [a.ticker, a]));

  // 1. Float
  let createText, tokensText, pickerAlts = [], cards = [], stats = {};
  if (env.FIXTURES === '1') {
    const fx = name => readFile(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');
    createText = await fx('create.txt');
    tokensText = await fx('tokens.txt');
    cards = JSON.parse(await fx('cards.json'));
    stats = JSON.parse(await fx('stats.json'));
  } else {
    ({ createText, tokensText, pickerAlts, cards, stats } = await scrapeFloat());
  }
  const rows = buildAssetRows(parseAssets(createText), pickerAlts);
  // Prefer the card links (they carry each coin's address); fall back to the page text.
  const fromCards = parseCards(cards || []);
  const coins = fromCards.length >= 20 ? fromCards : parseCoins(tokensText);
  console.log(`Float stats feed: ${Object.keys(stats || {}).length} coins`);
  const agg = aggregateCoins(coins);
  for (const r of rows) {
    const a = agg[r.ticker] || { coins: 0, graduated: 0, top: '', topFdv: 0 };
    Object.assign(r, a);
  }
  console.log(`Float: ${rows.length} assets, ${coins.length} coins`);

  // 2. Prices
  const priced = rows.filter(r => r.symbol);
  let priceFails = [];
  if (env.PRICES !== '0') {
    const res = await pool(priced, 4, 250, r => getReturns(r.symbol));
    for (const r of priced) {
      const got = res.get(r);
      if (got.ok) Object.assign(r, { ytd: got.value.ytd, m1: got.value.m1, d1: got.value.d1, price: got.value.price, priceAt: new Date().toISOString(), priceStale: false });
      else { priceFails.push(r.ticker); keepOld(r, prevBy.get(r.ticker), ['ytd', 'm1', 'd1', 'price', 'priceAt']); r.priceStale = true; }
    }
  } else {
    for (const r of priced) { keepOld(r, prevBy.get(r.ticker), ['ytd', 'm1', 'd1', 'price', 'priceAt']); r.priceStale = true; }
  }
  console.log(env.PRICES === '0' ? 'Prices: skipped, kept previous values'
    : `Prices: ${priced.length - priceFails.length}/${priced.length} ok${priceFails.length ? ` (failed: ${priceFails.join(', ')})` : ''}`);

  // 3. News
  const newsRows = rows.filter(r => r.kind === 'Stock' || r.kind === 'ETF' || r.kind === 'Pre-IPO');
  let newsFails = [];
  if (env.NEWS !== '0') {
    const query = r => r.kind === 'ETF' ? `${r.ticker} ETF` : r.kind === 'Pre-IPO' ? `"${searchName(r)}"` : `"${searchName(r)}" stock`;
    const res = await pool(newsRows, 3, 400, r => getNews(r, query(r)));
    for (const r of newsRows) {
      const got = res.get(r);
      if (got.ok) r.news = got.value;
      else { newsFails.push(r.ticker); r.news = prevBy.get(r.ticker)?.news || null; }
    }
  } else {
    for (const r of newsRows) r.news = prevBy.get(r.ticker)?.news || null;
  }
  console.log(env.NEWS === '0' ? 'News: skipped, kept previous values'
    : `News: ${newsRows.length - newsFails.length}/${newsRows.length} ok${newsFails.length ? ` (failed: ${newsFails.join(', ')})` : ''}`);

  // 4. Score and write
  const ranked = rankRows(rows);
  const coinRows = buildCoinRows(coins, stats || {}, ranked);
  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      float: { assets: rows.length, coins: coins.length, from: env.FIXTURES === '1' ? 'fixtures' : 'floatlaunch.xyz' },
      prices: { ok: priced.length - priceFails.length, failed: priceFails.length, from: 'Yahoo Finance, Stooq fallback' },
      news: { ok: newsRows.length - newsFails.length, failed: newsFails.length, from: 'Google News RSS' },
    },
    stats: {
      assets: rows.length,
      open: rows.filter(r => !r.coins).length,
      coins: coins.length,
      withGraduated: rows.filter(r => r.graduated > 0).length,
      graduatedCoins: coins.filter(c => c.graduated).length,
      activeCoins: coinRows.filter(c => c.volume24h > 0).length,
    },
    assets: ranked,
    coins: coinRows,
  };
  await mkdir(dirname(OUT.pathname), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`Wrote ${ranked.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s. Top 5: ${ranked.slice(0, 5).map(r => `${r.ticker} ${r.score}`).join(', ')}`);
}

function keepOld(row, old, keys) {
  if (!old) return;
  for (const k of keys) if (old[k] !== undefined) row[k] = old[k];
}

main().catch(err => {
  console.error('Refresh failed, previous data left in place:', err.message);
  process.exit(1);
});
