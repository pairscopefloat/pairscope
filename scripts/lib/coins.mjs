// Builds the "Top coins" list: every Float coin with its trading stats and the paired asset's signals.
import { GRADUATION_FDV } from './score.mjs';

/** Activity label from 24h volume relative to market cap. */
export function activityOf(volume24h, fdv) {
  if (!volume24h) return 'Quiet';
  const turnover = fdv ? volume24h / fdv : 0;
  if (turnover >= 1) return 'Hot';
  if (turnover >= 0.25) return 'Active';
  return 'Slow';
}

/**
 * @param coins  [{ticker, fdv, anchor, graduated, mint}]
 * @param stats  { [mint]: { volume24h, holders, paid7dUsd } }
 * @param assets ranked asset rows (from rankRows), used to attach the paired asset's signals
 */
export function buildCoinRows(coins, stats = {}, assets = [], aliases = { Monero: 'XMR' }) {
  const byTicker = new Map(assets.map(a => [a.ticker, a]));
  return coins
    .filter(c => c.fdv > 0)
    .map(c => {
      const anchor = aliases[c.anchor] || c.anchor;
      const s = (c.mint && stats[c.mint]) || {};
      const a = byTicker.get(anchor);
      const volume24h = Math.round(s.volume24h || 0);
      return {
        ticker: c.ticker,
        mint: c.mint || null,
        fdv: Math.round(c.fdv),
        graduated: !!c.graduated,
        gradPct: c.graduated ? 100 : Math.min(99, Math.round((c.fdv / GRADUATION_FDV) * 100)),
        volume24h,
        holders: s.holders ?? null,
        paid7d: s.paid7dUsd != null ? +Number(s.paid7dUsd).toFixed(2) : null,
        activity: activityOf(volume24h, c.fdv),
        anchor,
        anchorName: a?.name || anchor,
        anchorKind: a?.kind || null,
        anchorYtd: a?.ytd ?? null,
        anchorNews: a?.news?.count24h ?? 0,
        anchorScore: a?.score ?? null,
      };
    })
    .sort((x, y) => y.volume24h - x.volume24h || y.fdv - x.fdv);
}
