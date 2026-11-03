// Headlines from Google News RSS, free and without an API key.
// The feed format is simple and stable, so it is parsed here without a library.

export function newsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&(amp|lt|gt|quot|#39|apos);/g, m => ENTITIES[m])
  .trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
};

export function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    items.push({ title: tag(b, 'title'), link: tag(b, 'link'), pubDate: tag(b, 'pubDate'), source: tag(b, 'source') });
  }
  return items;
}

/** Keep headlines from the last 24 hours that actually mention the asset. */
export function parseNews(xml, { ticker, name, now = Date.now() }) {
  const nameWord = (name || '').split(' ')[0].toLowerCase();
  const tickerRe = new RegExp(`(^|[^A-Za-z])${ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z]|$)`);
  const relevant = [];
  for (const it of parseRssItems(xml)) {
    const when = Date.parse(it.pubDate);
    if (!isFinite(when) || now - when > 24 * 3600 * 1000) continue;
    const title = it.source && it.title.endsWith(` - ${it.source}`)
      ? it.title.slice(0, -(it.source.length + 3))
      : it.title.replace(/ - [^-]+$/, '');
    if (!(tickerRe.test(title) || (nameWord.length > 2 && title.toLowerCase().includes(nameWord)))) continue;
    relevant.push({ title, source: it.source, url: it.link, at: new Date(when).toISOString() });
  }
  relevant.sort((a, b) => b.at.localeCompare(a.at));
  return { count24h: relevant.length, top: relevant[0] || null };
}

export async function getNews(row, query) {
  const res = await fetch(newsUrl(query), {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; PairscopeBot/0.1)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google News ${res.status} for ${row.ticker}`);
  return parseNews(await res.text(), { ticker: row.ticker, name: query.replace(/"/g, '').replace(/ (stock|ETF)$/, '') });
}
