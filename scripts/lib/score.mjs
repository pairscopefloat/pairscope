// The opportunity score, 0 to 100. Shared by the refresh job and shown on the site.

export const GRADUATION_FDV = 150000;

export function scoreRow(r) {
  const pts = {};
  const y = r.ytd;
  if (r.kind === 'Crypto' || r.kind === 'Basket' || y == null) pts.momentum = 10;
  else if (y >= 100) pts.momentum = 40;
  else if (y >= 50) pts.momentum = 30;
  else if (y >= 20) pts.momentum = 20;
  else if (y >= 0) pts.momentum = 10;
  else pts.momentum = 0;

  const n = r.coins || 0;
  pts.open = n === 0 ? 30 : n <= 2 ? 20 : n <= 9 ? 10 : 0;

  const c = r.news?.count24h || 0;
  pts.news = c >= 10 ? 20 : c >= 3 ? 10 : 0;

  pts.demand = (r.topFdv || 0) >= 50000 ? 10 : 0;
  pts.fee = r.fee >= 1 ? -10 : r.fee > 0 ? -3 : 0;

  const total = Object.values(pts).reduce((a, b) => a + b, 0);
  return { score: Math.max(0, Math.min(100, total)), pts };
}

export function rankRows(rows) {
  return rows
    .map(r => ({ ...r, ...scoreRow(r) }))
    .sort((a, b) => b.score - a.score || (b.ytd ?? -1e9) - (a.ytd ?? -1e9));
}
