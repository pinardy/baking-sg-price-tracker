# 🧁 SG Baking Price Tracker

A personal PWA that tracks the prices of common baking ingredients (flour,
butter, sugar, yeast, …) across Singapore shops, normalizes them to **price
per kg/L/piece** so different pack sizes are comparable, keeps a price
history with charts, and fires alerts when a price drops below your target.

Adapted from `price-tracker-strings`; same architecture, new domain.

## Tracked shops

| Shop | Mechanism | Scraped from |
| --- | --- | --- |
| RedMan (Phoon Huat) | Shopify JSON endpoints on shop.redmanshop.com | CI + local |
| Bake King | WooCommerce Store API | CI + local |
| NTUC FairPrice | Server-rendered `__NEXT_DATA__` JSON | CI + local |
| Bake With Yen | schema.org JSON-LD on product pages | **local only** (Cloudflare blocks datacenter IPs) |

Future work: Sheng Siong needs a headless browser (Meteor SPA behind
Imperva) — the `PriceProvider` interface supports it, nobody has written it yet.

## How it works

- **Products** are canonical ingredients ("Plain Flour"); each has **links**
  to the exact matching listing at each shop, attached once via the built-in
  search UI. No fuzzy matching at fetch time.
- A daily **GitHub Actions cron** re-fetches every link (except
  residential-only shops), commits the SQLite DB, exports flat JSON, and
  deploys the static PWA to GitHub Pages.
- **Pack sizes** are parsed from listing titles ("1KG", "500 g", "10s") or
  FairPrice's structured field, and can be corrected manually per link;
  every price is also shown per kg/L/piece.
- The same React app runs in two modes: the **local app** (Express +
  SQLite, full read/write — add products, attach links, manual refresh) and
  the **static PWA** (read-only, installable, works offline).

## Setup

```bash
npm install
npm run seed          # ~20 common baking staples (products only)
npm run dev           # server :3001 + client :5173
```

Then attach shop listings to each product:

```bash
npm run auto-match    # best-effort: auto-attaches high-confidence matches,
                      # prints the rest for manual review
```

…and attach the remainder (plus all Bake With Yen links — paste product
URLs into the search box) via the product pages in the local app.

Other commands:

```bash
npm run smoke         # one live search + price fetch per shop
npm test              # fixture-based provider tests + pack-size parser tests
npm run refresh       # fetch all providers locally
npm run refresh:push  # fetch all + commit DB + push + trigger Pages rebuild
```

## The hybrid refresh model

- **Daily, automatic:** GitHub Actions (`.github/workflows/pages.yml`,
  06:17 UTC) scrapes RedMan, Bake King, and FairPrice, commits
  `server/data/app.db`, and redeploys the PWA. Bake With Yen is skipped
  there (Cloudflare 403s datacenter IPs) — its chips show a ⏱ staleness
  marker after ~7 days.
- **Whenever you like, locally:** `npm run refresh:push` scrapes *all*
  shops from your home connection and pushes the result. Always use the
  script rather than hand-committing `app.db` (binary file — the script's
  pull-first ordering avoids merge conflicts with the bot's commits).

## GitHub Pages deployment

1. Push this repo to GitHub.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Run the "Fetch prices and deploy Pages" workflow once manually
   (Actions tab → Run workflow).
4. Open `https://<user>.github.io/<repo>/` on your phone → "Add to Home
   Screen". Prices are cached stale-while-revalidate, so the app opens
   offline with the last-seen data.

To preview the static PWA build locally:

```bash
npm run export:static -w server
VITE_STATIC=1 npm run build -w client
npm run preview -w client
```

## Scraping etiquette

Requests are serialized per host with a 1.5 s delay, identify themselves
with a project User-Agent (except Bake With Yen, where Cloudflare requires
a browser UA), honor `Retry-After`, and run once a day. Keep it that way.
