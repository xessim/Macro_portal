// ─── MACRODESK LIVE DATA LOADER ──────────────────────────────────────────────
// Loads from data/calendar.json, data/macro_indicators.json, data/fx_rates.json
// These files are auto-updated daily by GitHub Actions (scripts/fetch_data.py)
// Falls back gracefully to static data in app.js if files aren't found
// ─────────────────────────────────────────────────────────────────────────────

const LiveLoader = (() => {

  const BASE = './data/';
  let statusBanner = null;

  // ── STATUS BANNER ─────────────────────────────────────────────────────────
  function showBanner(msg, type = 'info') {
    if (!statusBanner) {
      statusBanner = document.createElement('div');
      statusBanner.id = 'live-banner';
      statusBanner.style.cssText = `
        position:fixed; bottom:16px; right:16px; z-index:999;
        padding:10px 16px; border-radius:8px; font-size:12px;
        font-family:var(--font-mono); display:flex; align-items:center; gap:8px;
        border:1px solid; max-width:340px; line-height:1.4;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(statusBanner);
    }
    const styles = {
      info:    'background:rgba(0,212,255,0.08);border-color:rgba(0,212,255,0.25);color:#00d4ff',
      success: 'background:rgba(0,229,160,0.08);border-color:rgba(0,229,160,0.25);color:#00e5a0',
      warning: 'background:rgba(255,184,0,0.08);border-color:rgba(255,184,0,0.2);color:#ffb800',
      error:   'background:rgba(255,77,106,0.08);border-color:rgba(255,77,106,0.2);color:#ff4d6a',
    };
    statusBanner.style.cssText += styles[type] || styles.info;
    statusBanner.textContent = msg;
    statusBanner.style.opacity = '1';
    if (type === 'success') {
      setTimeout(() => { if(statusBanner) statusBanner.style.opacity = '0'; }, 4000);
    }
  }

  function hideBanner() {
    if (statusBanner) statusBanner.style.opacity = '0';
  }

  // ── FETCH HELPER ──────────────────────────────────────────────────────────
  async function fetchJSON(filename) {
    try {
      const r = await fetch(`${BASE}${filename}?_=${Date.now()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch(e) {
      console.warn(`LiveLoader: failed to fetch ${filename}:`, e.message);
      return null;
    }
  }

  // ── FORMAT HELPERS ────────────────────────────────────────────────────────
  function fmtAge(isoString) {
    if (!isoString) return 'unknown';
    const diff = Date.now() - new Date(isoString).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 23) return `${Math.floor(h/24)}d ago`;
    if (h > 0)  return `${h}h ${m}m ago`;
    return `${m}m ago`;
  }

  // ── LOAD CALENDAR ─────────────────────────────────────────────────────────
  async function loadCalendar() {
    const data = await fetchJSON('calendar.json');
    if (!data || !data.events || data.events.length === 0) return false;

    // Merge live events into App.EVENTS (defined in app.js)
    // Convert ISO time strings back to Date objects
    const liveEvents = data.events.map((ev, i) => ({
      ...ev,
      id:   ev.id || (1000 + i),
      time: new Date(ev.time),
    }));

    // Replace the static EVENTS array
    if (typeof EVENTS !== 'undefined') {
      EVENTS.length = 0;
      liveEvents.forEach(e => EVENTS.push(e));
    }

    console.log(`LiveLoader: loaded ${liveEvents.length} calendar events (updated ${fmtAge(data.updated)})`);
    return { count: liveEvents.length, updated: data.updated };
  }

  // ── LOAD FRED INDICATORS ──────────────────────────────────────────────────
  async function loadFRED() {
    const data = await fetchJSON('macro_indicators.json');
    if (!data || !data.indicators) return false;

    const indicators = data.indicators;

    // Update regime gauge scores based on live FRED data
    if (typeof REGIME !== 'undefined') {
      // Growth: based on GDP growth vs threshold
      const gdp = indicators['A191RL1Q225SBEA'];
      if (gdp) {
        const g = parseFloat(gdp.value);
        REGIME.growth.score = Math.max(10, Math.min(90, 50 + g * 5));
        REGIME.growth.label = g > 2.5 ? 'Accelerating' : g > 1.0 ? 'Moderate' : 'Decelerating';
        REGIME.growth.direction = g > 2.0 ? 'up' : 'dn';
        REGIME.growth.color = g > 2.0 ? 'var(--green)' : g > 1.0 ? 'var(--amber)' : 'var(--red)';
        REGIME.growth.desc = `Real GDP growth at ${g}% annualised (QoQ). ${gdp.date}.`;
      }

      // Inflation: based on Core PCE
      const pce = indicators['PCEPILFE'];
      if (pce) {
        const p = parseFloat(pce.value);
        REGIME.inflation.score = Math.max(10, Math.min(90, p * 20));
        REGIME.inflation.label = p > 3.0 ? 'High & Rising' : p > 2.5 ? 'Sticky Elevated' : p > 2.0 ? 'Near Target' : 'Below Target';
        REGIME.inflation.direction = pce.change > 0 ? 'up' : 'dn';
        REGIME.inflation.color = p > 3.0 ? 'var(--red)' : p > 2.5 ? 'var(--amber)' : 'var(--green)';
        REGIME.inflation.desc = `Core PCE at ${p}% YoY (Fed target: 2.0%). ${pce.change > 0 ? 'Rising' : 'Falling'} trend. ${pce.date}.`;
      }
    }

    // Render the live indicators panel
    renderFREDPanel(indicators, data.updated);
    console.log(`LiveLoader: loaded ${Object.keys(indicators).length} FRED indicators`);
    return { count: Object.keys(indicators).length, updated: data.updated };
  }

  // ── RENDER FRED PANEL ─────────────────────────────────────────────────────
  function renderFREDPanel(indicators, updated) {
    const panel = document.getElementById('fred-panel');
    if (!panel) return;

    const groups = {
      'Rates & Yields': ['FEDFUNDS', 'DGS2', 'DGS10', 'DGS30', 'T10Y2Y', 'T10YIE'],
      'Macro Indicators': ['CPILFESL', 'PCEPILFE', 'UNRATE', 'A191RL1Q225SBEA', 'PAYEMS'],
    };

    let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;font-weight:600;">Live FRED data · St. Louis Fed</div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">Updated ${fmtAge(updated)}</div>
    </div>`;

    for (const [groupName, ids] of Object.entries(groups)) {
      html += `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin:12px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border);">${groupName}</div>`;
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:4px;">`;

      for (const id of ids) {
        const ind = indicators[id];
        if (!ind) {
          html += `<div style="padding:12px;background:var(--bg4);border-radius:8px;border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">${id}</div>
            <div style="font-size:13px;color:var(--text3);">No data</div>
          </div>`;
          continue;
        }
        const chg = ind.change;
        const chgColor = chg === null ? 'var(--text3)' : chg > 0 ? 'var(--red)' : chg < 0 ? 'var(--green)' : 'var(--text3)';
        const chgStr = chg === null ? '' : (chg > 0 ? `+${chg}` : `${chg}`) + ind.unit;
        html += `<div style="padding:12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">${ind.label}</div>
          <div style="font-size:18px;font-weight:600;font-family:var(--font-mono);color:var(--text);">${ind.value}<span style="font-size:12px;font-weight:400;color:var(--text3);">${ind.unit}</span></div>
          ${chgStr ? `<div style="font-size:11px;font-family:var(--font-mono);color:${chgColor};margin-top:3px;">${chgStr} vs prior</div>` : ''}
          <div style="font-size:10px;color:var(--text3);margin-top:3px;">${ind.date}</div>
        </div>`;
      }
      html += `</div>`;
    }

    panel.innerHTML = html;
  }

  // ── LOAD FX RATES ─────────────────────────────────────────────────────────
  async function loadFX() {
    const data = await fetchJSON('fx_rates.json');
    if (!data || !data.rates) return false;

    renderFXTicker(data.rates, data.updated || data.date);
    console.log(`LiveLoader: loaded FX rates (${data.date})`);
    return { updated: data.updated };
  }

  // ── FX TICKER BAR ─────────────────────────────────────────────────────────
  function renderFXTicker(rates, updated) {
    const ticker = document.getElementById('fx-ticker');
    if (!ticker) return;

    const pairs = Object.entries(rates).filter(([,v]) => v !== null);
    if (!pairs.length) return;

    let html = pairs.map(([pair, rate]) =>
      `<span style="display:inline-flex;align-items:center;gap:8px;padding:0 16px;border-right:1px solid var(--border);">
        <span style="font-size:11px;color:var(--text3);">${pair}</span>
        <span style="font-size:13px;font-weight:500;font-family:var(--font-mono);color:var(--text);">${rate}</span>
      </span>`
    ).join('');

    html += `<span style="padding:0 12px;font-size:11px;color:var(--text3);font-family:var(--font-mono);">FX via Frankfurter · ${fmtAge(updated)}</span>`;
    ticker.innerHTML = html;
    ticker.parentElement.style.display = 'flex';
  }

  // ── LOAD STATUS ───────────────────────────────────────────────────────────
  async function loadStatus() {
    const data = await fetchJSON('status.json');
    if (!data) return;

    const el = document.getElementById('data-status');
    if (el) {
      const age = fmtAge(data.last_run);
      el.textContent = `Data: ${age}`;
      el.title = `Last fetch: ${data.last_run} · Events: ${data.calendar_count} · FRED series: ${data.fred_count}`;
    }

    // Show setup warning if keys aren't configured
    if (!data.finnhub_active || !data.fred_active) {
      showBanner(
        `API keys not set. See README → GitHub Secrets to enable live data.`,
        'warning'
      );
    }

    return data;
  }


  // ── LOAD COT DATA ─────────────────────────────────────────────────────────
  async function loadCOT() {
    const data = await fetchJSON('cot.json');
    if (!data || !data.instruments || data.instruments.length === 0) return false;

    // Normalise live data to match the shape renderCOT() expects
    const normalised = data.instruments.map(inst => ({
      asset:     inst.asset,
      category:  inst.category,
      tags:      inst.tags || [],
      net:       inst.net,
      pctile:    inst.pctile,
      direction: inst.direction,
      crowd:     inst.crowd,
      week_chg:  inst.week_chg,
      date:      inst.date,
      history:   inst.history || [],
      signal:    inst.signal,
      net_min:   inst.net_min,
      net_max:   inst.net_max,
      longs:     inst.longs,
      shorts:    inst.shorts,
      oi:        inst.oi,
    }));

    // Pass to app.js
    if (typeof mergeLiveCOT === 'function') {
      mergeLiveCOT(normalised);
    }

    // Update COT page header meta
    renderCOTMeta(data);

    console.log(`LiveLoader: loaded ${normalised.length} COT instruments (report date: ${data.report_date})`);
    return { count: normalised.length, report_date: data.report_date, updated: data.updated };
  }

  function renderCOTMeta(data) {
    const el = document.getElementById('cot-meta');
    if (!el || !data.report_date) return;
    el.innerHTML = `
      <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">
        Report date: <strong style="color:var(--text2);">${data.report_date}</strong>
        &nbsp;·&nbsp; Updated: ${fmtAge(data.updated)}
        &nbsp;·&nbsp; Source: CFTC Legacy Futures Only
      </span>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(255,77,106,.1);color:#ff4d6a;border:1px solid rgba(255,77,106,.2);font-family:var(--font-mono);">Extreme Long: ${data.summary?.extreme_long ?? 0}</span>
        <span style="font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(255,184,0,.1);color:#ffb800;border:1px solid rgba(255,184,0,.2);font-family:var(--font-mono);">Crowded Long: ${data.summary?.crowded_long ?? 0}</span>
        <span style="font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(0,229,160,.1);color:#00e5a0;border:1px solid rgba(0,229,160,.2);font-family:var(--font-mono);">Crowded Short: ${data.summary?.crowded_short ?? 0}</span>
        <span style="font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(168,85,247,.1);color:#a855f7;border:1px solid rgba(168,85,247,.2);font-family:var(--font-mono);">Extreme Short: ${data.summary?.extreme_short ?? 0}</span>
      </div>`;
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  async function init() {
    showBanner('Loading live market data...', 'info');

    try {
      const [calResult, fredResult, fxResult, cotResult, statusResult] = await Promise.allSettled([
        loadCalendar(),
        loadFRED(),
        loadFX(),
        loadCOT(),
        loadStatus(),
      ]);

      const calOk  = calResult.status === 'fulfilled' && calResult.value;
      const fredOk = fredResult.status === 'fulfilled' && fredResult.value;
      const fxOk   = fxResult.status === 'fulfilled' && fxResult.value;

      if (calOk || fredOk || fxOk) {
        showBanner('Live data loaded', 'success');
        // Re-render pages with live data
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderRegime   === 'function') renderRegime();
        if (typeof renderDashboard === 'function') renderDashboard();
      } else {
        showBanner('Using static data — run GitHub Action to fetch live data', 'warning');
      }
    } catch (err) {
      console.error('LiveLoader init error:', err);
      hideBanner();
    }
  }

  return { init, loadCalendar, loadFRED, loadFX, loadCOT, loadStatus };
})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LiveLoader.init());
} else {
  LiveLoader.init();
}
