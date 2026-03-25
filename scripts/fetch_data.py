"""
MacroDesk Data Fetcher
======================
Runs daily via GitHub Actions. Pulls:
  - Economic calendar events (Finnhub free API)
  - Treasury yields + macro indicators (FRED free API)
  - FX rates (Frankfurter — no key required)
  - Writes everything to data/*.json for the portal to consume

API keys stored as GitHub Secrets:
  FINNHUB_KEY  — get free at https://finnhub.io (60 calls/min free)
  FRED_KEY     — get free at https://fred.stlouisfed.org/docs/api/api_key.html
"""

import json
import os
import sys
import time
import requests
from datetime import datetime, timedelta
from dateutil.parser import parse as dateparse

# ── CONFIG ────────────────────────────────────────────────────────────────────
FINNHUB_KEY = os.environ.get("FINNHUB_KEY", "")
FRED_KEY    = os.environ.get("FRED_KEY", "")
DATA_DIR    = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

NOW    = datetime.utcnow()
TODAY  = NOW.strftime("%Y-%m-%d")
AHEAD  = (NOW + timedelta(days=14)).strftime("%Y-%m-%d")

# High-impact event keywords to flag regardless of Finnhub importance score
HIGH_IMPACT_KEYWORDS = [
    "nonfarm", "payroll", "cpi", "pce", "fomc", "federal reserve",
    "ecb", "bank of england", "boe", "bank of japan", "boj",
    "gdp", "inflation", "interest rate", "unemployment", "ism",
    "pmi", "retail sales", "jackson hole", "fed chair", "lagarde",
    "powell", "ueda", "bailey", "caixin"
]

MEDIUM_IMPACT_KEYWORDS = [
    "producer price", "ppi", "housing", "durable goods", "trade balance",
    "current account", "consumer confidence", "industrial production",
    "capacity utilization", "jolts", "claims", "beige book"
]

# FRED series: (series_id, display_label, unit, decimal_places)
FRED_SERIES = [
    ("FEDFUNDS",          "Fed Funds Rate",        "%",   2),
    ("DGS2",              "2Y Treasury Yield",      "%",   2),
    ("DGS10",             "10Y Treasury Yield",     "%",   2),
    ("DGS30",             "30Y Treasury Yield",     "%",   2),
    ("T10Y2Y",            "2s10s Spread",           "bps", 0),
    ("T10YIE",            "10Y Breakeven Inflation","%",   2),
    ("CPILFESL",          "Core CPI YoY",           "%",   1),
    ("PCEPILFE",          "Core PCE YoY",           "%",   1),
    ("UNRATE",            "Unemployment Rate",      "%",   1),
    ("A191RL1Q225SBEA",   "Real GDP Growth QoQ",    "%",   1),
    ("PAYEMS",            "Nonfarm Payrolls MoM",   "K",   0),
]

# FX pairs via Frankfurter (no key needed)
FX_PAIRS = ["EUR", "GBP", "JPY", "AUD", "CHF", "CAD", "CNY"]

# ── HELPERS ───────────────────────────────────────────────────────────────────
def safe_get(url, params=None, retries=3, delay=2):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=15)
            if r.status_code == 429:
                print(f"  Rate limited on {url}, waiting 10s...")
                time.sleep(10)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
    return None

def classify_impact(event_name, finnhub_importance):
    name_lower = event_name.lower()
    if any(k in name_lower for k in HIGH_IMPACT_KEYWORDS):
        return "high"
    if finnhub_importance >= 3:
        return "high"
    if any(k in name_lower for k in MEDIUM_IMPACT_KEYWORDS):
        return "medium"
    if finnhub_importance >= 2:
        return "medium"
    return "low"

def tag_event(event_name, country):
    name_lower = event_name.lower()
    tags = []
    currency_map = {
        "united states": "USD", "euro area": "EUR", "eurozone": "EUR",
        "germany": "EUR", "france": "EUR", "italy": "EUR",
        "united kingdom": "GBP", "japan": "JPY", "australia": "AUD",
        "canada": "CAD", "china": "CNY", "switzerland": "CHF"
    }
    country_lower = (country or "").lower()
    for k, v in currency_map.items():
        if k in country_lower:
            tags.append(v)
            break
    if any(x in name_lower for x in ["yield", "treasury", "bond", "rate decision", "fomc", "ecb", "boe", "boj", "interest rate"]):
        tags.append("RATES")
    if any(x in name_lower for x in ["cpi", "pce", "ppi", "inflation", "deflator"]):
        tags.append("RATES")
    if any(x in name_lower for x in ["gdp", "pmi", "ism", "payroll", "nonfarm", "unemployment", "retail", "industrial"]):
        tags.append("EQUITY")
    return list(set(tags)) or ["MACRO"]

# Historical market reaction playbooks (keyed by keyword match)
REACTION_PLAYBOOKS = {
    "nonfarm payroll": {
        "reactions": [
            {"a": "DXY",    "m": "±0.5%",   "d": "up"},
            {"a": "2Y UST", "m": "±7bps",   "d": "up"},
            {"a": "SPX",    "m": "±0.6%",   "d": "dn"},
        ],
        "watch": "Unemployment rate + average hourly earnings. Wage growth above 4.0% YoY is hawkish for Fed.",
        "trade": "Beat + low UE: long DXY, short gold, short TLT. Miss + rising UE: long TLT, long gold, short USD."
    },
    "cpi": {
        "reactions": [
            {"a": "DXY",    "m": "±0.6%",   "d": "up"},
            {"a": "2Y UST", "m": "±8bps",   "d": "up"},
            {"a": "SPX",    "m": "±0.9%",   "d": "dn"},
        ],
        "watch": "Shelter (OER) and services ex-shelter — the Fed's preferred gauges of sticky inflation.",
        "trade": "Hot print: long USD, short TLT, short gold. Cool print: long gold, long TLT, short USD."
    },
    "pce": {
        "reactions": [
            {"a": "DXY",    "m": "±0.4%",   "d": "up"},
            {"a": "Gold",   "m": "±0.8%",   "d": "dn"},
            {"a": "10Y",    "m": "±8bps",   "d": "up"},
        ],
        "watch": "Core PCE services ex-housing ('supercore') is the Fed's most closely watched sub-component.",
        "trade": "Cool print: long TLT, long gold, short DXY. Hot print: fade bond rally, long DXY."
    },
    "fomc": {
        "reactions": [
            {"a": "DXY",    "m": "±0.8%",   "d": "neu"},
            {"a": "10Y",    "m": "±12bps",  "d": "neu"},
            {"a": "Gold",   "m": "±1.0%",   "d": "neu"},
        ],
        "watch": "Dot plot, forward guidance language, balance sheet commentary. Watch for 'data dependent' phrasing.",
        "trade": "Hawkish: long USD/JPY, short TLT. Dovish pivot: long gold, long SPX, short DXY."
    },
    "ecb": {
        "reactions": [
            {"a": "EUR/USD", "m": "±0.5%",  "d": "dn"},
            {"a": "Bunds",   "m": "±10bps", "d": "dn"},
            {"a": "DAX",     "m": "±0.8%",  "d": "up"},
        ],
        "watch": "BTP-Bund spread for fragmentation risk. Lagarde press conference tone on further cuts.",
        "trade": "Dovish cut: short EUR/USD, long peripheral bonds. Hawkish pause: fade EUR short."
    },
    "bank of england": {
        "reactions": [
            {"a": "GBP/USD", "m": "±0.4%",  "d": "up"},
            {"a": "Gilts",   "m": "±8bps",  "d": "up"},
        ],
        "watch": "Services CPI and wage data — the two key BOE inflation indicators. Watch Bailey tone.",
        "trade": "Hawkish hold: long GBP/USD. Dovish cut: short GBP, long Gilts."
    },
    "bank of japan": {
        "reactions": [
            {"a": "USD/JPY", "m": "±1.0%",  "d": "dn"},
            {"a": "JGB 10Y", "m": "±5bps",  "d": "up"},
        ],
        "watch": "Any mention of YCC adjustment, 'normalisation timeline', or wage dynamics.",
        "trade": "Hawkish signal: short USD/JPY, long JGBs. No change: long USD/JPY carry."
    },
    "gdp": {
        "reactions": [
            {"a": "DXY",    "m": "±0.3%",   "d": "up"},
            {"a": "10Y",    "m": "±5bps",   "d": "up"},
            {"a": "SPX",    "m": "±0.5%",   "d": "up"},
        ],
        "watch": "Consumer spending and business investment components matter more than the headline.",
        "trade": "Beat: long DXY, risk-on. Miss: long TLT, gold, short cyclicals."
    },
    "ism": {
        "reactions": [
            {"a": "DXY",    "m": "±0.3%",   "d": "up"},
            {"a": "SPX",    "m": "±0.6%",   "d": "up"},
        ],
        "watch": "New orders and prices paid sub-indices are leading indicators of growth and inflation.",
        "trade": "Above 50 with rising orders: long risk, long DXY. Below 50: long TLT, short cyclicals."
    },
    "default": {
        "reactions": [
            {"a": "DXY",    "m": "±0.2%",   "d": "neu"},
            {"a": "10Y",    "m": "±3bps",   "d": "neu"},
        ],
        "watch": "Deviation from consensus is the key driver. Watch revision to prior reading.",
        "trade": "Trade the deviation vs. expectations, not the absolute level."
    }
}

def get_playbook(event_name):
    name_lower = event_name.lower()
    for key, data in REACTION_PLAYBOOKS.items():
        if key in name_lower:
            return data
    return REACTION_PLAYBOOKS["default"]

# ── FETCH: ECONOMIC CALENDAR (Finnhub) ───────────────────────────────────────
def fetch_calendar():
    print("Fetching economic calendar from Finnhub...")
    if not FINNHUB_KEY:
        print("  WARNING: No FINNHUB_KEY set — using placeholder data")
        return build_placeholder_calendar()

    url = "https://finnhub.io/api/v1/calendar/economic"
    params = {"token": FINNHUB_KEY}
    data = safe_get(url, params)

    if not data or "economicCalendar" not in data:
        print("  Finnhub calendar fetch failed, using placeholder")
        return build_placeholder_calendar()

    events = []
    for ev in data.get("economicCalendar", []):
        try:
            event_time = ev.get("time", "")
            event_date = ev.get("time", "")[:10]
            if event_date < TODAY or event_date > AHEAD:
                continue

            name        = ev.get("event", "Unknown Event")
            country     = ev.get("country", "")
            importance  = int(ev.get("impact", 1))
            impact      = classify_impact(name, importance)
            playbook    = get_playbook(name)

            events.append({
                "id":        ev.get("id", f"{event_date}-{len(events)}"),
                "time":      event_time,
                "name":      name,
                "source":    country,
                "impact":    impact,
                "tags":      tag_event(name, country),
                "forecast":  str(ev.get("estimate", "—")) if ev.get("estimate") is not None else "—",
                "prior":     str(ev.get("prev", "—"))     if ev.get("prev")     is not None else "—",
                "actual":    str(ev.get("actual", ""))    if ev.get("actual")   is not None else None,
                "unit":      ev.get("unit", ""),
                "reactions": playbook["reactions"],
                "detail": {
                    "desc":    f"Upcoming {name} release for {country}.",
                    "history": "Historical reaction data loaded from playbook library.",
                    "watch":   playbook["watch"],
                    "trade":   playbook["trade"],
                }
            })
        except Exception as e:
            print(f"  Skipping event due to error: {e}")
            continue

    # Sort by time, prioritise high-impact
    events.sort(key=lambda x: (x["time"], {"high": 0, "medium": 1, "low": 2}.get(x["impact"], 3)))

    print(f"  Got {len(events)} events for next 14 days")
    return events

def build_placeholder_calendar():
    """Fallback data when no API key is configured"""
    base = datetime.utcnow().replace(hour=13, minute=30, second=0, microsecond=0)
    def dt(days, h=13.5):
        t = base + timedelta(days=days)
        return t.strftime("%Y-%m-%dT%H:%M:%S")

    return [
        {
            "id": "placeholder-1",
            "time": dt(0),
            "name": "Add your FINNHUB_KEY to GitHub Secrets",
            "source": "MacroDesk Setup",
            "impact": "high",
            "tags": ["USD"],
            "forecast": "—",
            "prior": "—",
            "actual": None,
            "unit": "",
            "reactions": [{"a": "Setup", "m": "Required", "d": "neu"}],
            "detail": {
                "desc": "Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret. Add FINNHUB_KEY (from finnhub.io, free) and FRED_KEY (from fred.stlouisfed.org, free). Then trigger the workflow manually from the Actions tab.",
                "history": "See README.md for full setup instructions.",
                "watch": "After adding your keys, click Actions → Fetch Macro Data Daily → Run workflow",
                "trade": "Once keys are set, real economic events will appear here automatically."
            }
        }
    ]

# ── FETCH: FRED MACRO INDICATORS ─────────────────────────────────────────────
def fetch_fred():
    print("Fetching FRED macro indicators...")
    if not FRED_KEY:
        print("  WARNING: No FRED_KEY set — skipping FRED data")
        return {}

    results = {}
    base_url = "https://api.stlouisfed.org/fred/series/observations"

    for series_id, label, unit, decimals in FRED_SERIES:
        params = {
            "series_id":   series_id,
            "api_key":     FRED_KEY,
            "file_type":   "json",
            "sort_order":  "desc",
            "limit":       5,
        }
        data = safe_get(base_url, params)
        time.sleep(0.2)  # Be polite to FRED

        if not data or "observations" not in data:
            print(f"  Failed to fetch {series_id}")
            continue

        obs = [o for o in data["observations"] if o.get("value") != "."]
        if not obs:
            continue

        latest = obs[0]
        prev   = obs[1] if len(obs) > 1 else None
        val    = float(latest["value"])
        change = round(val - float(prev["value"]), decimals) if prev else None

        # Convert bps for spread
        if unit == "bps":
            val    = round(val * 100, 0)
            change = round(change * 100, 0) if change else None

        results[series_id] = {
            "id":      series_id,
            "label":   label,
            "value":   round(val, decimals),
            "unit":    unit,
            "change":  change,
            "date":    latest["date"],
            "history": [
                {"date": o["date"], "value": round(float(o["value"]), decimals)}
                for o in reversed(obs) if o.get("value") != "."
            ]
        }
        print(f"  {series_id}: {val}{unit} ({latest['date']})")

    return results

# ── FETCH: FX RATES (Frankfurter — no key) ───────────────────────────────────
def fetch_fx():
    print("Fetching FX rates from Frankfurter API...")
    url = "https://api.frankfurter.app/latest"
    params = {"from": "USD", "to": ",".join(FX_PAIRS)}
    data = safe_get(url, params)

    if not data or "rates" not in data:
        print("  Frankfurter failed, trying backup...")
        # Fallback: fawazahmed0 exchange-api on CDN
        backup_url = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
        data2 = safe_get(backup_url)
        if data2 and "usd" in data2:
            rates = data2["usd"]
            return {
                "base": "USD",
                "date": TODAY,
                "rates": {
                    "EUR/USD": round(1 / rates.get("eur", 1), 4),
                    "GBP/USD": round(1 / rates.get("gbp", 1), 4),
                    "USD/JPY": round(rates.get("jpy", 150), 2),
                    "AUD/USD": round(1 / rates.get("aud", 1), 4),
                    "USD/CHF": round(rates.get("chf", 0.9), 4),
                    "USD/CAD": round(rates.get("cad", 1.35), 4),
                    "USD/CNY": round(rates.get("cny", 7.2), 4),
                }
            }
        return {"base": "USD", "date": TODAY, "rates": {}}

    raw = data["rates"]
    fx_out = {
        "base": "USD",
        "date": data.get("date", TODAY),
        "updated": NOW.isoformat() + "Z",
        "rates": {
            "EUR/USD": round(1 / raw["EUR"], 4) if "EUR" in raw else None,
            "GBP/USD": round(1 / raw["GBP"], 4) if "GBP" in raw else None,
            "USD/JPY": round(raw["JPY"], 2)      if "JPY" in raw else None,
            "AUD/USD": round(1 / raw["AUD"], 4) if "AUD" in raw else None,
            "USD/CHF": round(raw["CHF"], 4)      if "CHF" in raw else None,
            "USD/CAD": round(raw["CAD"], 4)      if "CAD" in raw else None,
            "USD/CNY": round(raw["CNY"], 4)      if "CNY" in raw else None,
        }
    }
    print(f"  EUR/USD: {fx_out['rates'].get('EUR/USD')} | USD/JPY: {fx_out['rates'].get('USD/JPY')}")
    return fx_out

# ── WRITE JSON ────────────────────────────────────────────────────────────────
def write_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  Wrote {path} ({os.path.getsize(path):,} bytes)")

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*60}")
    print(f"MacroDesk Data Fetch — {NOW.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*60}\n")

    # Calendar
    calendar_events = fetch_calendar()
    write_json("calendar.json", {
        "updated": NOW.isoformat() + "Z",
        "source":  "Finnhub Economic Calendar API",
        "from":    TODAY,
        "to":      AHEAD,
        "events":  calendar_events,
    })

    # FRED macro indicators
    fred_data = fetch_fred()
    write_json("macro_indicators.json", {
        "updated":    NOW.isoformat() + "Z",
        "source":     "Federal Reserve Economic Data (FRED)",
        "indicators": fred_data,
    })

    # FX rates
    fx_data = fetch_fx()
    write_json("fx_rates.json", fx_data)

    # Meta status file (portal checks this to show last-updated time)
    write_json("status.json", {
        "last_run":       NOW.isoformat() + "Z",
        "calendar_count": len(calendar_events),
        "fred_count":     len(fred_data),
        "fx_ok":          bool(fx_data.get("rates")),
        "finnhub_active": bool(FINNHUB_KEY),
        "fred_active":    bool(FRED_KEY),
    })

    print(f"\nDone. Fetched {len(calendar_events)} events, {len(fred_data)} FRED series.\n")

if __name__ == "__main__":
    main()
