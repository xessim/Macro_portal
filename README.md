# MacroDesk — Global Macro Portal

A complete, self-updating macro hedge fund research portal. Push to GitHub, add two free API keys, and your calendar auto-updates every morning before market open — forever, for free.

---

## How the live data pipeline works

```
GitHub Actions (cron: 7am + 1pm UTC, weekdays)
    │
    ├── Finnhub API  →  data/calendar.json          (next 14 days of macro events)
    ├── FRED API     →  data/macro_indicators.json  (yields, CPI, PCE, unemployment, GDP)
    └── Frankfurter  →  data/fx_rates.json          (EUR/USD, GBP/USD, USD/JPY, etc.)
                               │
                        git commit + push
                               │
                        GitHub Pages serves fresh data/*.json
                               │
                    Portal fetches on load → always up to date
```

---

## Setup (10 minutes total)

### 1. Push to GitHub and enable Pages

```bash
git init && git add . && git commit -m "MacroDesk v1"
git remote add origin https://github.com/YOUR_USERNAME/macro-portal.git
git branch -M main && git push -u origin main
```

Then: **Settings → Pages → Deploy from branch → main → / (root) → Save**

Your portal is live at: `https://YOUR_USERNAME.github.io/macro-portal/`

### 2. Get your two free API keys

**Finnhub** (economic calendar):
→ [finnhub.io](https://finnhub.io) → Sign Up → copy API key from dashboard

**FRED** (macro indicators & yields):
→ [fred.stlouisfed.org](https://fred.stlouisfed.org) → My Account → API Keys → Request key

### 3. Add keys to GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|-------|
| `FINNHUB_KEY` | Your Finnhub key |
| `FRED_KEY` | Your FRED key |

### 4. Run first fetch

Repo → **Actions → Fetch Macro Data Daily → Run workflow**

Wait ~30 seconds, then reload your portal URL. Live events appear automatically.

---

## What updates automatically

| Data | Source | Frequency |
|------|--------|-----------|
| Macro calendar events (next 14 days) | Finnhub | 7am + 1pm UTC weekdays |
| Treasury yields (2Y, 10Y, 30Y) | FRED | Same |
| Core CPI, Core PCE, Unemployment, GDP | FRED | Same |
| Fed Funds Rate, Breakeven inflation | FRED | Same |
| FX rates (EUR/USD, GBP/USD, USD/JPY, AUD, CHF, CAD, CNY) | Frankfurter | Same |

---

## Fix: GitHub Actions permission error

If the git push step fails:
Repo → Settings → Actions → General → Workflow permissions → **Read and write permissions** → Save

---

## File structure

```
macro-portal/
├── index.html                        # Portal UI
├── css/style.css                     # Styles
├── js/app.js                         # Static data + page rendering
├── js/live-loader.js                 # Fetches data/*.json on page load
├── data/                             # Auto-updated by GitHub Actions
│   ├── calendar.json                 # Live events
│   ├── macro_indicators.json         # Live FRED data
│   ├── fx_rates.json                 # Live FX
│   └── status.json                   # Last fetch metadata
├── scripts/fetch_data.py             # Python fetcher
└── .github/workflows/
    └── fetch-macro-data.yml          # Cron schedule
```

---

## Cost: $0

GitHub Actions (free for public repos) + FRED (Fed, free) + Finnhub (free tier) + Frankfurter (open source, no key)
