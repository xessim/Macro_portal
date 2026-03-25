"""
MacroDesk COT Fetcher
=====================
Pulls Commitment of Traders data directly from the CFTC's free public API.
No API key required — the CFTC publishes this as open government data.

Source: publicreporting.cftc.gov (Socrata API, no auth needed)
Report: Legacy Futures Only — Non-Commercial (speculative) positions
Released: Every Friday at 3:30pm ET (data as of prior Tuesday)

Computes for each instrument:
  - Net speculative position (non-commercial longs - shorts)
  - 3-year percentile rank (0=max short ever, 100=max long ever)
  - Week-on-week change
  - Crowding signal (extreme-long / long / neutral / short / extreme-short)
  - Contrarian alert flag

Writes to: data/cot.json
"""

import json
import os
import time
import requests
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

NOW = datetime.utcnow()

# ── CFTC API CONFIG ───────────────────────────────────────────────────────────
# Legacy Futures Only — Socrata dataset ID: 6dca-aqww
# No API key required. Rate limit: generous (CFTC is a US govt agency)
CFTC_BASE = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"

# How many weeks of history to pull per instrument (for percentile calc)
HISTORY_WEEKS = 156  # 3 years

# ── INSTRUMENTS WE TRACK ─────────────────────────────────────────────────────
# (CFTC market name substring, display name, category, tags)
INSTRUMENTS = [
    # FX
    ("EURO FX",               "EUR/USD",        "FX",          ["EUR", "FX"]),
    ("BRITISH POUND",         "GBP/USD",        "FX",          ["GBP", "FX"]),
    ("JAPANESE YEN",          "USD/JPY",        "FX",          ["JPY", "FX"]),
    ("AUSTRALIAN DOLLAR",     "AUD/USD",        "FX",          ["AUD", "FX"]),
    ("CANADIAN DOLLAR",       "USD/CAD",        "FX",          ["CAD", "FX"]),
    ("SWISS FRANC",           "USD/CHF",        "FX",          ["CHF", "FX"]),
    # Rates
    ("10-YEAR U.S. TREASURY", "10Y T-Note",     "Rates",       ["RATES", "USD"]),
    ("2-YEAR U.S. TREASURY",  "2Y T-Note",      "Rates",       ["RATES", "USD"]),
    ("30-YEAR TREASURY",      "30Y T-Bond",     "Rates",       ["RATES", "USD"]),
    ("EURODOLLAR",            "Eurodollar",     "Rates",       ["RATES"]),
    # Equity
    ("E-MINI S&P",            "S&P 500",        "Equity",      ["EQUITY", "USD"]),
    ("NASDAQ-100 CONS",       "Nasdaq 100",     "Equity",      ["EQUITY", "USD"]),
    ("DOW JONES",             "Dow Jones",      "Equity",      ["EQUITY", "USD"]),
    ("VIX",                   "VIX Futures",    "Equity",      ["EQUITY"]),
    # Commodities
    ("GOLD",                  "Gold",           "Commodities", ["COMMODITY"]),
    ("SILVER",                "Silver",         "Commodities", ["COMMODITY"]),
    ("CRUDE OIL, LIGHT",      "Crude Oil (WTI)","Commodities", ["COMMODITY"]),
    ("NATURAL GAS",           "Natural Gas",    "Commodities", ["COMMODITY"]),
    ("COPPER",                "Copper",         "Commodities", ["COMMODITY"]),
]

# ── CROWDING THRESHOLDS ───────────────────────────────────────────────────────
def crowding_label(pctile):
    if pctile >= 80:  return "extreme-long"
    if pctile >= 60:  return "long"
    if pctile <= 20:  return "extreme-short"
    if pctile <= 40:  return "short"
    return "neutral"

def contrarian_signal(pctile, direction):
    if pctile >= 80:  return {"type": "SHORT", "strength": "strong",  "color": "red"}
    if pctile >= 70:  return {"type": "SHORT", "strength": "mild",    "color": "amber"}
    if pctile <= 20:  return {"type": "LONG",  "strength": "strong",  "color": "green"}
    if pctile <= 30:  return {"type": "LONG",  "strength": "mild",    "color": "green"}
    return None

# ── FETCH ONE INSTRUMENT ──────────────────────────────────────────────────────
def fetch_instrument(cftc_name, display_name, category, tags):
    print(f"  Fetching {display_name} ({cftc_name})...")

    # Build Socrata query — filter by market name, get last HISTORY_WEEKS rows
    params = {
        "$where":  f"upper(market_and_exchange_names) like '%{cftc_name}%'",
        "$order":  "report_date_as_yyyy_mm_dd DESC",
        "$limit":  str(HISTORY_WEEKS),
        "$select": "report_date_as_yyyy_mm_dd,market_and_exchange_names,"
                   "noncomm_positions_long_all,noncomm_positions_short_all,"
                   "open_interest_all,change_in_noncomm_long_all,"
                   "change_in_noncomm_short_all",
    }

    try:
        r = requests.get(CFTC_BASE, params=params, timeout=20)
        r.raise_for_status()
        rows = r.json()
    except Exception as e:
        print(f"    FAILED: {e}")
        return None

    if not rows:
        print(f"    No data found for {cftc_name}")
        return None

    # Parse into time series of net positions
    series = []
    for row in rows:
        try:
            longs  = int(float(row.get("noncomm_positions_long_all", 0) or 0))
            shorts = int(float(row.get("noncomm_positions_short_all", 0) or 0))
            net    = longs - shorts
            oi     = int(float(row.get("open_interest_all", 0) or 0))
            date   = row.get("report_date_as_yyyy_mm_dd", "")[:10]
            chg_l  = int(float(row.get("change_in_noncomm_long_all", 0) or 0))
            chg_s  = int(float(row.get("change_in_noncomm_short_all", 0) or 0))
            series.append({
                "date":   date,
                "net":    net,
                "longs":  longs,
                "shorts": shorts,
                "oi":     oi,
                "chg_net": chg_l - chg_s,
            })
        except Exception:
            continue

    if not series:
        return None

    # Sort ascending for history chart
    series.sort(key=lambda x: x["date"])

    latest = series[-1]
    prev   = series[-2] if len(series) >= 2 else latest

    # Compute 3-year percentile of net position
    net_values = [s["net"] for s in series]
    net_min    = min(net_values)
    net_max    = max(net_values)
    net_range  = net_max - net_min
    pctile     = round((latest["net"] - net_min) / net_range * 100) if net_range else 50

    direction  = "long" if latest["net"] > 0 else "short"
    crowd      = crowding_label(pctile)
    signal     = contrarian_signal(pctile, direction)
    week_chg   = latest["chg_net"]

    # Build 26-week history for sparkline
    history_26 = [{"date": s["date"], "net": s["net"]} for s in series[-26:]]

    result = {
        "asset":      display_name,
        "cftc_name":  rows[0].get("market_and_exchange_names", cftc_name),
        "category":   category,
        "tags":       tags,
        "date":       latest["date"],
        "net":        latest["net"],
        "longs":      latest["longs"],
        "shorts":     latest["shorts"],
        "oi":         latest["oi"],
        "week_chg":   week_chg,
        "pctile":     pctile,
        "direction":  direction,
        "crowd":      crowd,
        "signal":     signal,
        "net_min":    net_min,
        "net_max":    net_max,
        "history":    history_26,
    }

    print(f"    OK: net={latest['net']:+,}  pctile={pctile}  crowd={crowd}  date={latest['date']}")
    return result

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*60}")
    print(f"MacroDesk COT Fetch — {NOW.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Source: CFTC Public Reporting API (no key required)")
    print(f"{'='*60}\n")

    results = []
    failed  = []

    for cftc_name, display_name, category, tags in INSTRUMENTS:
        result = fetch_instrument(cftc_name, display_name, category, tags)
        if result:
            results.append(result)
        else:
            failed.append(display_name)
        time.sleep(0.4)   # Be polite to CFTC servers

    # Identify extreme signals
    extremes = [r for r in results if r["crowd"] in ("extreme-long", "extreme-short")]

    output = {
        "updated":  NOW.isoformat() + "Z",
        "source":   "CFTC Commitment of Traders — Legacy Futures Only",
        "note":     "Non-commercial (speculative) net positions. Percentile of 3-year range.",
        "report_date": results[0]["date"] if results else None,
        "instruments": results,
        "extremes":    extremes,
        "failed":      failed,
        "summary": {
            "total":         len(results),
            "extreme_long":  sum(1 for r in results if r["crowd"] == "extreme-long"),
            "crowded_long":  sum(1 for r in results if r["crowd"] == "long"),
            "neutral":       sum(1 for r in results if r["crowd"] == "neutral"),
            "crowded_short": sum(1 for r in results if r["crowd"] == "short"),
            "extreme_short": sum(1 for r in results if r["crowd"] == "extreme-short"),
        }
    }

    out_path = os.path.join(DATA_DIR, "cot.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nWrote data/cot.json ({size_kb:.1f} KB)")
    print(f"  {len(results)} instruments  |  {len(extremes)} extremes  |  {len(failed)} failed")
    if failed:
        print(f"  Failed: {', '.join(failed)}")

if __name__ == "__main__":
    main()
