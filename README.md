# Pairscope

Pairscope ranks every asset you can pair a coin with on [Float](https://www.floatlaunch.xyz), so you can find the open lane before you launch, and lists every Float coin for traders. It collects:

- **Coin counts** from Float's public create and tokens pages: which assets already have coins, how many, and the best one on each.
- **Stock returns** from Yahoo Finance (2026 so far, last month, last day), with Stooq as a backup.
- **Headlines** from Google News for the last 24 hours.

It then gives each asset an opportunity score from 0 to 100 and publishes a static website.

**Everything runs on free services.** GitHub Actions runs the refresh job, GitHub Pages hosts the site, and none of the data sources needs an API key. The only thing you pay for is a domain name, and that's optional.

---

## How it fits together

```
GitHub Actions: fast run every 10 min (Float only), full run every hour at :33 (Float + prices + news)
  └─ scripts/refresh.mjs
       ├─ scripts/lib/float.mjs     loads Float's pages in headless Chromium and parses them
       ├─ scripts/lib/prices.mjs    Yahoo Finance chart data, Stooq fallback
       ├─ scripts/lib/news.mjs      Google News RSS
       ├─ scripts/lib/score.mjs     the 0–100 score
       └─ writes docs/data/pairscope.json
The same job publishes docs/ to GitHub Pages; a copy of the data is committed every 6 hours.
Visitors' pages re-check data/pairscope.json every 3 minutes.
```

If a source fails, the job keeps the last good value and marks it stale. If Float itself can't be read, the job stops without touching the data, so the site never goes blank.

---

## Setup (about 15 minutes, no coding)

### 1. Create the repository
1. Sign in at [github.com](https://github.com). Creating an account is free.
2. Click **New repository** and name it `pairscope`.
3. Choose **Public**. Free GitHub Pages needs a public repository, and public repositories get unlimited free Actions minutes.
4. Click **Create repository**.

### 2. Upload the files
1. On the new repository page, click **uploading an existing file**.
2. Drag in **everything inside** the unzipped `pairscope` folder, including the hidden `.github` folder. On a Mac, press **Cmd + Shift + .** in Finder to show hidden folders. On Windows, turn on **View → Show → Hidden items**.
3. Click **Commit changes**.
4. Check that `.github/workflows/refresh.yml` appears in the repository. Without it, nothing runs.

### 3. Let the job save its data
**Settings → Actions → General → Workflow permissions →** select **Read and write permissions**, then click **Save**.

### 4. Run it once by hand
**Actions** tab → click **Refresh Pairscope data** → **Run workflow**. The first run takes 2–4 minutes because it installs a browser. The log ends with lines like:

```
Float: 246 assets, 830 coins
Prices: 98/100 ok
News: 110/112 ok
Wrote 246 rows in 61.3s. Top 5: SNDK 90, MU 90, ...
```

After that, it runs by itself: Float data every 10 minutes, prices and news every hour.

### 5. Turn on the website
**Settings → Pages →** under **Build and deployment**, set **Source** to **GitHub Actions**. There is nothing else to pick: the refresh job publishes the site itself after every run. Run the job once more (step 4) so the first deploy happens.

After a minute, the site is live at `https://YOUR-USERNAME.github.io/pairscope/`.

### 6. Use your own domain (optional)
1. Buy a domain from any registrar.
2. In **Settings → Pages → Custom domain**, enter it (for example `pairscope.xyz`) and save.
3. At your registrar, add the DNS records that GitHub's [custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) lists:
   - Four `A` records for the bare domain, pointing to GitHub's Pages IP addresses.
   - A `CNAME` record for `www` pointing to `YOUR-USERNAME.github.io`.
4. Once the DNS check passes, tick **Enforce HTTPS**.

---

## Running it on your own computer (optional)

```bash
npm install
npx playwright install chromium
npm test          # 9 tests for the parsers and the score
npm run refresh   # one full refresh into docs/data/pairscope.json
npm run serve     # open http://localhost:8080
```

Useful switches: `PRICES=0` or `NEWS=0` skips that step and keeps the previous values. `FIXTURES=1` uses the saved Float pages in `test/fixtures` instead of loading the live site.

---

## The score

| Part | Points |
|---|---|
| Momentum (2026 return) | 100%+ → 40, 50%+ → 30, 20%+ → 20, any gain → 10. Crypto, baskets and assets without a price get 10. |
| Open lane | no coins → 30, 1–2 coins → 20, 3–9 coins → 10 |
| In the news | 10+ headlines in 24h → 20, 3+ → 10 |
| Proven demand | a coin on this asset has reached $50K → 10 |
| Transfer fee | 1% → −10, 0.2% → −3 |

To change the weights, edit `scripts/lib/score.mjs`. The website reads the score from the data file, so nothing else needs to change.

## Things to adjust
- **Asset types:** the lists of ETFs and of crypto tokens sold by Sunrise are in `scripts/lib/classify.mjs`.
- **Price symbols:** `SYMBOL_OVERRIDES` in the same file. For example, `BRK.B` is looked up as `BRK-B`, and SK Hynix uses its Korean listing. Set an asset to `null` to skip its price.
- **Schedule:** the two `cron` lines in `.github/workflows/refresh.yml` (times are UTC). GitHub won't run a schedule more often than every 5 minutes, and runs can start a few minutes late when GitHub is busy.

## How often it refreshes, and why

| Data | How often | Why this speed |
|---|---|---|
| Float coins, pairings, market caps, holders, volume, rewards | every 10 minutes | Float changes fastest. One run is about the same traffic as one person opening two pages and clicking "Show more", and Float serves those pages and its stats feed from Vercel's cache. |
| Stock returns (Yahoo, Stooq) | every hour | About 100 requests per run against a free, unofficial source. Year-to-date returns barely move in an hour. |
| Headlines (Google News) | every hour | About 110 searches per run. More often risks being rate-limited by Google. |

Float publishes no robots.txt, no rate-limit headers and nothing in its terms about automated access (checked Nov 3, 2026), so there is no published "safe" number. Ten minutes is a deliberately conservative choice: going to 5 minutes would double the traffic for little gain, and runs that take a few minutes could start overlapping.

---

## Know before you rely on it

- **Float has no public API.** Pairscope reads Float's public pages the same way a visitor does, once an hour. If Float changes its page layout, the run fails with a message like `layout may have changed`. The fix goes in the two parse functions in `scripts/lib/float.mjs`, which are covered by tests. Read Float's terms of use, and be ready to switch to a different method if Float asks.
- **Yahoo Finance's chart data is free but unofficial.** It can rate-limit or change without notice. Stooq is the automatic backup for US listings.
- **GitHub may delay scheduled runs** by several minutes when it's busy.
- **GitHub pauses scheduled workflows** in public repositories after 60 days without repository activity. The job saves a copy of the data to the repository every 6 hours, which counts as activity, but if the job ever stops, re-enable it on the **Actions** tab.
- **The first version of the site shows a seed snapshot** from Nov 2–3, 2026, labeled "Seed snapshot." The first successful run replaces it with live data.
- **Not affiliated with Float.** Pairscope is an independent tool and is not affiliated with or endorsed by Float. The site footer says so too.
- **Not financial advice.** Most launched coins lose value, and a strong stock can reverse quickly.
