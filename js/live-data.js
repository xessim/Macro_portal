// ─── MACRODESK LIVE DATA MODULE ──────────────────────────────────────────────
// Sources:
//   FX rates   → Frankfurter API (free, no key) + fawazahmed0 fallback
//   Macro data → FRED API (free key required — see README)
//   Yields     → FRED API (DGS2, DGS10, DGS30, T10YIE, T10Y2Y)
//   Equity ETF proxies → Yahoo Finance via allorigins CORS proxy
// ─────────────────────────────────────────────────────────────────────────────

const LiveData = (() => {

  // ── CONFIG ────────────────────────────────────────────────────────────────
  // Paste your FRED API key here after registering at:
  // https://fred.stlouisfed.org/docs/api/api_key.html (free, instant)
  const FRED_KEY = localStorage.getItem('fred_api_key') || '';

  const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

  // FRED series we pull
  const FRED_SERIES = {
    fed_funds:    { id: 'FEDFUNDS',   label: 'Fed Funds Rate',     unit: '%',   category: 'rates' },
    cpi_core:     { id: 'CPILFESL',   label: 'Core CPI (YoY)',     unit: '%',   category: 'macro' },
    pce_core:     { id: 'PCEPILFE',   label: 'Core PCE (YoY)',     unit: '%',   category: 'macro' },
    unemployment: { id: 'UNRATE',     label: 'Unemployment Rate',  unit: '%',   category: 'macro' },
    gdp_growth:   { id: 'A191RL1Q225SBEA', label: 'Real GDP (QoQ ann.)', unit: '%', category: 'macro' },
    yield_2y:     { id: 'DGS2',       label: '2Y Treasury',        unit: '%',   category: 'rates' },
    yield_10y:    { id: 'DGS10',      label: '10Y Treasury',       unit: '%',   category: 'rates' },
    yield_30y:    { id: 'DGS30',      label: '30Y Treasury',       unit: '%',   category: 'rates' },
    breakeven_10: { id: 'T10YIE',     label: '10Y Breakeven Infl', unit: '%',   category: 'rates' },
    spread_2_10:  { id: 'T10Y2Y',     label: '2s10s Spread',       unit: 'bps', category: 'rates' },
    nfp:          { id: 'PAYEMS',     label: 'Nonfarm Payrolls',   unit: 'K',   category: 'macro' },
    ism_mfg:      { id: 'MANEMP',     label: 'Mfg Employment',     unit: 'K',   category: 'macro' },
  };

  // FX pairs (Frankfurter API — no key needed)
  const FX_PAIRS = [
    { pair: 'EUR/USD', base: 'EUR', quote: 'USD' },
    { pair: 'GBP/USD', base: 'GBP', quote: 'USD' },
    { pair: 'USD/JPY', base: 'USD', quote: 'JPY' },
    { pair: 'AUD/USD', base: 'AUD', quote: 'USD' },
    { pair: 'USD/CHF', base: 'USD', quote: 'CHF' },
    { pair: 'USD/CAD', base: 'USD', quote: 'CAD' },
  ];

  // ── CACHE ─────────────────────────────────────────────────────────────────
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
  const cache = {};

  function getCached(key) {
    const item = cache[key];
    if (!item) return null;
    if (Date.now() - item.ts > CACHE_TTL) return null;
    return item.data;
  }
  function setCache(key, data) {
    cache[key] = { data, ts: Date.now() };
  }

  // ── FRED FETCH ────────────────────────────────────────────────────────────
  async function fetchFRED(seriesId, limit = 5) {
    if (!FRED_KEY) return null;
    const cacheKey = `fred_${seriesId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order