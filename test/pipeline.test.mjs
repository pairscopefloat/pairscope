import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAssets, parseCoins, aggregateCoins } from '../scripts/lib/float.mjs';
import { buildAssetRows, searchName, kindOf } from '../scripts/lib/classify.mjs';
import { returnsFromCloses, returnsFromStooqCsv } from '../scripts/lib/prices.mjs';
import { parseNews } from '../scripts/lib/news.mjs';
import { scoreRow, rankRows } from '../scripts/lib/score.mjs';

const createText = readFileSync(new URL('./fixtures/create.txt', import.meta.url), 'utf8');
const tokensText = readFileSync(new URL('./fixtures/tokens.txt', import.meta.url), 'utf8');

test('parses Float asset picker, including transfer fees', () => {
  const a = parseAssets(createText);
  assert.ok(a.length > 200);
  assert.deepEqual(a.find(x => x.ticker === 'ANTHROPIC'), { ticker: 'ANTHROPIC', issuer: 'PRESTOCK', fee: 1, name: 'Anthropic' });
  assert.equal(a.find(x => x.ticker === 'tOpenAI').fee, 0.2);
  assert.equal(a.find(x => x.ticker === 'MU').issuer, 'SUNRISE');
});

test('parses coins and groups them by anchor, folding Monero into XMR', () => {
  const coins = parseCoins(tokensText);
  assert.equal(coins.length, 21);
  assert.deepEqual(coins[0], { ticker: '$CAPY', fdv: 664250, anchor: 'SOL', graduated: true });
  const agg = aggregateCoins(coins);
  assert.equal(agg.SOL.coins, 3);
  assert.equal(agg.SOL.graduated, 2);
  assert.equal(agg.TTWO.coins, 3);
  assert.equal(agg.XMR.coins, 2);
  assert.equal(agg.XMR.top, '$XDG2');
  assert.equal(agg.XMR.topFdv, 1.2e6);
  assert.equal(agg.Monero, undefined);
});

test('merges stocks listed by two issuers and assigns types', () => {
  const rows = buildAssetRows(parseAssets(createText), ['NEWTKR', 'MU']);
  const tsla = rows.filter(r => r.ticker === 'TSLA');
  assert.equal(tsla.length, 1);
  assert.deepEqual(tsla[0].issuers, ['xStock', 'Sunrise']);
  assert.equal(rows.find(r => r.ticker === 'SPY').kind, 'ETF');
  assert.equal(rows.find(r => r.ticker === 'DOGE').kind, 'Crypto');
  assert.equal(rows.find(r => r.ticker === 'KALSHI').kind, 'Pre-IPO');
  assert.equal(rows.find(r => r.ticker === 'BRK.B').symbol, 'BRK-B');
  assert.equal(rows.find(r => r.ticker === 'ANTHROPIC').symbol, null);
  assert.equal(rows.find(r => r.ticker === 'NEWTKR').issuers[0], 'Unknown');
  assert.equal(kindOf('FRONTIER', 'BASKET'), 'Basket');
});

test('builds clean news search names', () => {
  assert.equal(searchName({ kind: 'Stock', name: 'Krispy Kreme, Inc. Common Stock' }), 'Krispy Kreme');
  assert.equal(searchName({ kind: 'Stock', name: 'The Boeing Company' }), 'Boeing');
  assert.equal(searchName({ kind: 'Stock', name: 'Cheesecake Factory (The)' }), 'Cheesecake Factory');
  assert.equal(searchName({ kind: 'ETF', ticker: 'USO', name: 'United States Oil Fund, LP' }), 'USO');
});

test('computes returns from closes and from a Stooq CSV', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const r = returnsFromCloses(closes, 50);
  assert.equal(r.price, 129);
  assert.equal(r.ytd, 158);
  assert.equal(r.d1, +((129 / 128 - 1) * 100).toFixed(2));
  assert.equal(r.m1, +((129 / 108 - 1) * 100).toFixed(2));
  const csv = 'Date,Open,High,Low,Close,Volume\n2025-12-30,1,1,1,40,1\n2025-12-31,1,1,1,50,1\n2026-01-02,1,1,1,55,1\n2026-01-05,1,1,1,60,1\n';
  assert.equal(returnsFromStooqCsv(csv, 2026).ytd, 20);
  assert.equal(returnsFromStooqCsv('Date,Open,High,Low,Close,Volume\n', 2026), null);
});

test('keeps only recent, relevant headlines from RSS', () => {
  const now = Date.parse('2026-11-03T15:00:00Z');
  const item = (title, src, when) => `<item><title>${title} - ${src}</title><link>https://example.com/${encodeURIComponent(title)}</link><pubDate>${new Date(when).toUTCString()}</pubDate><source url="https://x">${src}</source></item>`;
  const xml = `<rss><channel>
    ${item('Micron &amp; SK Hynix rally as memory prices climb', 'Reuters', now - 3600e3)}
    ${item('MU shares hit record', 'CNBC', now - 7200e3)}
    ${item('Old Micron story', 'Old', now - 30 * 3600e3)}
    ${item('Unrelated chip headline', 'Blog', now - 600e3)}
  </channel></rss>`;
  const n = parseNews(xml, { ticker: 'MU', name: 'Micron', now });
  assert.equal(n.count24h, 2);
  assert.equal(n.top.title, 'Micron & SK Hynix rally as memory prices climb');
  assert.equal(n.top.source, 'Reuters');
});

test('scores rows and ranks open, rising, newsy assets first', () => {
  const hot = scoreRow({ kind: 'Stock', ytd: 210, coins: 0, news: { count24h: 12 }, topFdv: 0, fee: 0 });
  assert.equal(hot.score, 90);
  const crowded = scoreRow({ kind: 'Stock', ytd: -20, coins: 40, news: null, topFdv: 20000, fee: 0 });
  assert.equal(crowded.score, 0);
  const preipo = scoreRow({ kind: 'Pre-IPO', ytd: null, coins: 0, news: { count24h: 4 }, topFdv: 0, fee: 1 });
  assert.deepEqual(preipo.pts, { momentum: 10, open: 30, news: 10, demand: 0, fee: -10 });
  const ranked = rankRows([{ ticker: 'A', kind: 'Stock', ytd: 5, coins: 30, fee: 0 }, { ticker: 'B', kind: 'Stock', ytd: 150, coins: 0, fee: 0 }]);
  assert.equal(ranked[0].ticker, 'B');
});

test('parses a real Google News feed (Micron, Nov 3 2026)', () => {
  const xml = readFileSync(new URL('./fixtures/news-micron.xml', import.meta.url), 'utf8');
  const n = parseNews(xml, { ticker: 'MU', name: 'Micron', now: Date.parse('2026-11-03T15:00:00Z') });
  assert.equal(n.count24h, 9);
  assert.match(n.top.title, /^Micron or Nvidia/);
  assert.equal(n.top.source, 'Yahoo Finance');
});

test('matches the real Yahoo numbers for Micron (Nov 3 2026)', () => {
  const r = returnsFromCloses([833.59, 861.05], 285.41);
  assert.equal(r.ytd, 201.69);
});

import { parseCards } from '../scripts/lib/float.mjs';
import { buildCoinRows, activityOf } from '../scripts/lib/coins.mjs';

test('parses coin cards with addresses and skips duplicates', () => {
  const cards = JSON.parse(readFileSync(new URL('./fixtures/cards.json', import.meta.url), 'utf8'));
  const coins = parseCards(cards);
  assert.equal(coins.length, 30);
  assert.deepEqual(coins[0], { ticker: '$CAPY', fdv: 692760, anchor: 'SOL', graduated: true, mint: 'DBPTU2oKLDHXQjAEJ3rZi8bUGmt2uxUbipgg6xmXoMqr' });
  assert.equal(coins.find(c => c.ticker === '$BEACHBALL').graduated, false);
});

test('builds coin rows with stats, graduation progress and paired-asset signals', () => {
  const cards = JSON.parse(readFileSync(new URL('./fixtures/cards.json', import.meta.url), 'utf8'));
  const stats = JSON.parse(readFileSync(new URL('./fixtures/stats.json', import.meta.url), 'utf8'));
  const assets = [{ ticker: 'SOL', name: 'Solana', kind: 'Crypto', ytd: null, news: null, score: 10 },
                  { ticker: 'HIMS', name: 'Hims & Hers Health', kind: 'Stock', ytd: 12.5, news: { count24h: 4 }, score: 30 }];
  const rows = buildCoinRows(parseCards(cards), stats, assets);
  assert.equal(rows[0].ticker, '$CAPY');               // highest 24h volume first
  const chad = rows.find(r => r.ticker === '$CHAD');
  assert.equal(chad.holders, 1231);
  assert.equal(chad.gradPct, 100);
  assert.equal(chad.anchorYtd, 12.5);
  assert.equal(chad.anchorNews, 4);
  const beach = rows.find(r => r.ticker === '$BEACHBALL');
  assert.equal(beach.gradPct, Math.round(95530 / 150000 * 100));
  assert.equal(beach.activity, 'Hot');                 // 401K volume on a 96K coin
  assert.equal(activityOf(0, 20000), 'Quiet');
  assert.equal(activityOf(6000, 20000), 'Active');
  assert.equal(activityOf(1000, 20000), 'Slow');
});
