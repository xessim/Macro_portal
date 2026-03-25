// ─── APP STATE ───────────────────────────────────────
const App = {
  page: 'calendar',
  calFilter: 'all',
  cotFilter: 'all',
  journalFilter: 'all',
  openEventId: null,
  trades: JSON.parse(localStorage.getItem('macro_trades') || '[]'),
  thesisHistory: JSON.parse(localStorage.getItem('thesis_history') || '[]'),
};

// ─── DATA ────────────────────────────────────────────

const NOW = new Date();
function dh(days, hours) { return new Date(NOW.getTime() + days*86400000 + hours*3600000); }

const EVENTS = [
  { id:1, time: dh(0,3), name:'US CPI (Core)', source:'Bureau of Labor Statistics', impact:'high', tags:['USD','RATES','EQUITY'],
    forecast:'3.1%', prior:'3.2%', actual:null,
    reactions:[{a:'DXY',m:'+0.6%',d:'up'},{a:'2Y UST',m:'+8bps',d:'up'},{a:'SPX',m:'-0.9%',d:'dn'}],
    detail:{ desc:'Core CPI excludes food and energy. Hotter-than-expected prints strengthen the dollar and pressure equities as Fed cut expectations reprice lower.', history:'Last 6 prints: 3.8%, 3.7%, 3.5%, 3.4%, 3.2%, 3.2%. Four consecutive decelerations.', watch:'Shelter (OER) and services ex-shelter — the Fed\'s preferred gauges of sticky inflation.', trade:'Above 3.3%: long USD, short TLT, short gold. Below 3.0%: long gold, long TLT, short USD.' }},
  { id:2, time: dh(0,27), name:'Fed Chair Powell Speech', source:'Jackson Hole Symposium', impact:'high', tags:['USD','RATES','EQUITY'],
    forecast:'—', prior:'—', actual:null,
    reactions:[{a:'DXY',m:'±0.8%',d:'neu'},{a:'10Y',m:'±12bps',d:'neu'},{a:'Gold',m:'-0.7%',d:'dn'}],
    detail:{ desc:'Unscheduled remarks can move markets more than any data release. Jackson Hole speeches historically set the tone for months of policy direction.', history:'2022: signaled aggressive hiking — SPX -3.4% intraday. 2023: "higher for longer" — yields spiked 15bps.', watch:'Forward guidance language, balance sheet commentary, inflation tolerance language. Any hint of "data dependence" is dovish.', trade:'Hawkish surprise: long USD/JPY, short TLT. Dovish pivot language: long gold, long SPX, short DXY.' }},
  { id:3, time: dh(1,13.5), name:'ECB Rate Decision', source:'European Central Bank', impact:'high', tags:['EUR','RATES'],
    forecast:'3.25%', prior:'3.50%', actual:null,
    reactions:[{a:'EUR/USD',m:'-0.5%',d:'dn'},{a:'Bunds',m:'-10bps',d:'dn'},{a:'DAX',m:'+0.8%',d:'up'}],
    detail:{ desc:'ECB expected to cut 25bps. Market focus will be on press conference guidance — particularly whether Lagarde signals further cuts in 2025.', history:'Sept 2024 cut triggered EUR/USD -0.4% initially before recovering. BTP-Bund spread tightened 8bps.', watch:'BTP-Bund spread, EUR/CHF, EUR/GBP for relative value signals across the eurozone periphery.', trade:'Cut + dovish guidance: short EUR/USD, long peripheral bonds. Cut + hawkish pause: fade EUR/USD short.' }},
  { id:4, time: dh(1,8.5), name:'UK CPI', source:'Office for National Statistics', impact:'medium', tags:['GBP','RATES'],
    forecast:'2.8%', prior:'3.0%', actual:null,
    reactions:[{a:'GBP/USD',m:'+0.3%',d:'up'},{a:'Gilts',m:'+5bps',d:'up'}],
    detail:{ desc:'BOE is in a delicate spot — services inflation remains elevated vs EU peers, constraining pace of cuts.', history:'Services CPI has been running above 5% YoY for six consecutive months, far above the EU average.', watch:'Services CPI sub-component is the key variable for BOE forward guidance. Expect Gilt vol around the print.', trade:'Hot print: long GBP/USD, short Gilts. Cool print: short GBP, long Gilts.' }},
  { id:5, time: dh(2,8.5), name:'US Nonfarm Payrolls', source:'Bureau of Labor Statistics', impact:'high', tags:['USD','EQUITY','RATES'],
    forecast:'185K', prior:'227K', actual:null,
    reactions:[{a:'DXY',m:'+0.5%',d:'up'},{a:'2Y UST',m:'+7bps',d:'up'},{a:'SPX',m:'-0.6%',d:'dn'}],
    detail:{ desc:'NFP is the most market-moving US data release. Payroll beats strengthen the dollar and reprice Fed cuts lower; misses trigger rallies in rates.', history:'Last 4 prints: 275K, 256K, 227K, 206K. Three of four beat estimates. Revisions often swing ±30K.', watch:'Unemployment rate and average hourly earnings. Wage growth above 4.0% YoY keeps the Fed cautious on cuts.', trade:'Beat + low UE: long DXY, short gold, short TLT. Miss + rising UE: long TLT, long gold, short USD.' }},
  { id:6, time: dh(2,3), name:'BOJ Summary of Opinions', source:'Bank of Japan', impact:'medium', tags:['JPY','RATES'],
    forecast:'—', prior:'—', actual:null,
    reactions:[{a:'USD/JPY',m:'-0.6%',d:'dn'},{a:'JGB 10Y',m:'+4bps',d:'up'}],
    detail:{ desc:'BOJ minutes closely watched for signals on YCC adjustment and pace of rate normalization. Hawkish language could trigger a sharp JPY rally.', history:'July 2024 YCC tweak caught markets off-guard — USD/JPY fell 2.1% in a single session.', watch:'Any mention of "normalisation timeline", "wage dynamics", or changes to JGB purchase pace or composition.', trade:'Hawkish signal: short USD/JPY, long JGBs. No change: long USD/JPY carry against low-yielding pairs.' }},
  { id:7, time: dh(3,14), name:'US PCE Deflator', source:'Bureau of Economic Analysis', impact:'high', tags:['USD','RATES','EQUITY'],
    forecast:'2.3%', prior:'2.4%', actual:null,
    reactions:[{a:'DXY',m:'+0.4%',d:'up'},{a:'Gold',m:'-0.8%',d:'dn'},{a:'SPX',m:'-0.5%',d:'dn'}],
    detail:{ desc:'The Fed\'s preferred inflation gauge. A cool PCE print has historically been the most reliable green light for rate cut expectations.', history:'When PCE prints below 2.4%, 10Y yields have fallen an average of 8bps on the session.', watch:'Core PCE services ex-housing ("supercore") is what Powell watches most closely. Target is 2.0%.', trade:'Cool print: long TLT, long gold, short DXY. Hot print: fade the bond rally, long DXY.' }},
  { id:8, time: dh(4,9), name:'China PMI (Caixin)', source:'Caixin/S&P Global', impact:'medium', tags:['EQUITY'],
    forecast:'51.2', prior:'51.0', actual:null,
    reactions:[{a:'AUD/USD',m:'+0.4%',d:'up'},{a:'Copper',m:'+1.1%',d:'up'},{a:'CSI 300',m:'+0.7%',d:'up'}],
    detail:{ desc:'China PMI is the primary pulse check on the world\'s second-largest economy. Strong prints lift commodity currencies and EM equities.', history:'Readings above 50 signal expansion. AUD is the most liquid proxy for China growth risk.', watch:'New orders and export orders sub-indices are leading indicators of the broader economy.', trade:'Beat: long AUD/USD, long copper. Miss: short AUD/USD, short EM ETFs, long USD.' }},
];

const COT_DATA = [
  { asset:'EUR/USD', category:'FX', net:87500, pctile:72, direction:'long', crowd:'long', week_chg:'+3,200' },
  { asset:'GBP/USD', category:'FX', net:42100, pctile:81, direction:'long', crowd:'extreme-long', week_chg:'+8,100' },
  { asset:'USD/JPY', category:'FX', net:-124000, pctile:14, direction:'short', crowd:'extreme-short', week_chg:'-4,400' },
  { asset:'AUD/USD', category:'FX', net:18200, pctile:55, direction:'long', crowd:'neutral', week_chg:'+1,100' },
  { asset:'Gold', category:'Commodities', net:198000, pctile:89, direction:'long', crowd:'extreme-long', week_chg:'+12,300' },
  { asset:'Crude Oil (WTI)', category:'Commodities', net:231000, pctile:62, direction:'long', crowd:'long', week_chg:'+5,600' },
  { asset:'Copper', category:'Commodities', net:45000, pctile:58, direction:'long', crowd:'neutral', week_chg:'+2,900' },
  { asset:'10Y T-Note', category:'Rates', net:-312000, pctile:22, direction:'short', crowd:'short', week_chg:'+18,000' },
  { asset:'2Y T-Note', category:'Rates', net:-189000, pctile:31, direction:'short', crowd:'short', week_chg:'+6,200' },
  { asset:'S&P 500', category:'Equity', net:118000, pctile:77, direction:'long', crowd:'long', week_chg:'+9,400' },
  { asset:'Nasdaq 100', category:'Equity', net:87400, pctile:83, direction:'long', crowd:'extreme-long', week_chg:'+14,200' },
  { asset:'VIX Futures', category:'Equity', net:-68000, pctile:18, direction:'short', crowd:'short', week_chg:'-3,100' },
];

const REGIME = {
  growth: { label:'Decelerating', score:38, direction:'dn', color:'var(--amber)', desc:'ISM Manufacturing below 50 for 3rd consecutive month. Services resilient but weakening. Leading indicators point to continued softness through Q2.' },
  inflation: { label:'Sticky Elevated', score:62, direction:'up', color:'var(--red)', desc:'Core PCE at 2.4%, above target. Services inflation persistent. Labor market tightness sustaining wage pressures despite commodity disinflation.' },
  dollar: { label:'Bull Cycle', score:70, direction:'up', color:'var(--green)', desc:'DXY up 4.2% YTD. Supported by US growth differential and higher-for-longer Fed. Watch for reversal if Fed turns dovish.' },
  risk: { label:'Risk-Off Lean', score:35, direction:'dn', color:'var(--red)', desc:'VIX elevated at 18. Credit spreads widening marginally. Equity positioning crowded. Geopolitical premium rising in energy.' },
};

const REGIME_MATRIX = [
  { asset:'USD (DXY)',        grow:'sig-mild-short', infl:'sig-strong-long',  dollar:'sig-strong-long',  risk:'sig-mild-long'  },
  { asset:'Gold',            grow:'sig-mild-long',  infl:'sig-strong-long',  dollar:'sig-mild-short',   risk:'sig-strong-long' },
  { asset:'10Y Treasuries',  grow:'sig-strong-long',infl:'sig-strong-short', dollar:'sig-mild-short',   risk:'sig-strong-long' },
  { asset:'S&P 500',         grow:'sig-mild-short', infl:'sig-mild-short',   dollar:'sig-neutral',      risk:'sig-strong-short'},
  { asset:'EUR/USD',         grow:'sig-neutral',    infl:'sig-neutral',      dollar:'sig-strong-short', risk:'sig-mild-short'  },
  { asset:'USD/JPY',         grow:'sig-mild-long',  infl:'sig-mild-long',    dollar:'sig-strong-long',  risk:'sig-mild-long'   },
  { asset:'Crude Oil',       grow:'sig-mild-short', infl:'sig-mild-long',    dollar:'sig-mild-short',   risk:'sig-strong-short'},
  { asset:'Copper/EM',       grow:'sig-strong-short',infl:'sig-neutral',     dollar:'sig-mild-short',   risk:'sig-strong-short'},
];

// ─── NAVIGATION ──────────────────────────────────────
function navigate(page) {
  App.page = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('active', el.id === `page-${page}`);
  });
  const titles = { calendar:'Macro Calendar', cot:'COT Positioning', regime:'Regime Detector', journal:'Trade Journal', thesis:'Thesis Builder' };
  document.getElementById('topbar-title').textContent = titles[page] || page;
}

// ─── HELPERS ─────────────────────────────────────────
function countdown(t) {
  const diff = t - NOW;
  if(diff < 0) return 'passed';
  const h = Math.floor(diff/3600000);
  const d = Math.floor(h/24);
  if(d>0) return `in ${d}d ${h%24}h`;
  if(h>0) return `in ${h}h`;
  return 'soon';
}

function fmtTime(t) {
  return t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
}

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date(NOW.toDateString());
  const diff = Math.round((d-today)/86400000);
  if(diff===0) return 'Today';
  if(diff===1) return 'Tomorrow';
  return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}

// ─── CALENDAR PAGE ────────────────────────────────────
function renderCalendar() {
  const container = document.getElementById('cal-events');
  const filter = App.calFilter;
  const filtered = filter==='all' ? EVENTS : EVENTS.filter(e=>e.tags.includes(filter));

  if(!filtered.length) {
    container.innerHTML = '<div class="empty-state">No events match this filter.</div>';
    return;
  }

  const groups = {};
  filtered.forEach(e => {
    const k = e.time.toDateString();
    if(!groups[k]) groups[k]=[];
    groups[k].push(e);
  });

  let html = '';
  for(const key of Object.keys(groups)) {
    html += `<div class="section-title">${dayLabel(key)}</div>`;
    html += `<div style="display:grid;grid-template-columns:70px 1fr 70px 70px 80px 130px 36px;gap:10px;padding:4px 14px;margin-bottom:4px;">
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Time</span>
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Event</span>
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;text-align:right">Fcst</span>
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;text-align:right">Prior</span>
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Impact</span>
      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Hist. reactions</span>
      <span></span></div>`;
    groups[key].forEach(ev => {
      const rxn = ev.reactions.slice(0,2).map(r => `<span class="rxn-tag rxn-${r.d}">${r.a} ${r.m}</span>`).join('');
      html += `
        <div class="event-item impact-${ev.impact}" id="ev-${ev.id}" onclick="toggleEvent(${ev.id})">
          <div class="event-time">${fmtTime(ev.time)}<div class="event-countdown">${countdown(ev.time)}</div></div>
          <div><div class="event-name">${ev.name}</div><div class="event-source">${ev.source}</div></div>
          <div class="event-num" style="text-align:right">${ev.forecast}</div>
          <div class="event-num" style="text-align:right;color:var(--text3)">${ev.prior}</div>
          <div><span class="badge badge-${ev.impact}">${ev.impact}</span></div>
          <div class="event-reactions">${rxn}</div>
          <button class="expand-btn" id="eb-${ev.id}">+</button>
        </div>
        <div class="event-detail" id="ed-${ev.id}">
          <p style="font-size:12px;color:var(--text2);line-height:1.7;">${ev.detail.desc}</p>
          <div class="detail-3col">
            <div class="detail-block"><div class="lbl">Historical pattern</div><div class="txt">${ev.detail.history}</div></div>
            <div class="detail-block"><div class="lbl">What to watch</div><div class="txt">${ev.detail.watch}</div></div>
            <div class="detail-block"><div class="lbl">Trade playbook</div><div class="trade-txt">${ev.detail.trade}</div></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <button class="ask-claude-btn" onclick="openThesisFromEvent('${ev.name}')">Build full trade thesis ↗</button>
            <div class="tag-row">${ev.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
          </div>
        </div>`;
    });
  }
  container.innerHTML = html;
}

function toggleEvent(id) {
  const detail = document.getElementById(`ed-${id}`);
  const btn = document.getElementById(`eb-${id}`);
  const isOpen = detail.classList.contains('open');
  document.querySelectorAll('.event-detail').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.expand-btn').forEach(b=>b.textContent='+');
  if(!isOpen) { detail.classList.add('open'); btn.textContent='−'; }
}

function setCalFilter(f, el) {
  App.calFilter = f;
  document.querySelectorAll('#cal-filters .filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderCalendar();
}

// ─── COT PAGE ─────────────────────────────────────────
function renderCOT() {
  const container = document.getElementById('cot-rows');
  const filter = App.cotFilter;
  const cotData = getActiveCOTData();
  const filtered = filter==='all' ? cotData : cotData.filter(r=>r.category===filter);

  const crowdMap = {
    'extreme-long': ['crowd-extreme-long','Extreme Long'],
    'long': ['crowd-long','Crowded Long'],
    'neutral': ['crowd-neutral','Neutral'],
    'short': ['crowd-short','Crowded Short'],
    'extreme-short': ['crowd-extreme-short','Extreme Short'],
  };

  let html = `<div style="display:grid;grid-template-columns:110px 1fr 80px 80px 70px 90px;gap:10px;padding:4px 14px;margin-bottom:4px;">
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Asset</span>
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Net speculative positioning (percentile of 3-year range)</span>
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;text-align:right">Net contracts</span>
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;text-align:right">Wk change</span>
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">Signal</span>
    <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">26w trend</span>
  </div>`;

  filtered.forEach(r => {
    const [cls, label] = crowdMap[r.crowd] || ['crowd-neutral','Neutral'];
    const pct = r.pctile;
    const isLong = r.direction==='long';
    const barColor = pct > 75 ? 'var(--red)' : pct > 55 ? 'var(--amber)' : pct < 25 ? 'var(--purple)' : pct < 45 ? 'var(--green)' : 'var(--text3)';
    const wkRaw = r.week_chg;
    const wkNum = typeof wkRaw === 'number' ? wkRaw : parseInt((String(wkRaw)||'0').replace(/[^0-9-]/g,'')) || 0;
    const wkColor = wkNum >= 0 ? 'var(--green)' : 'var(--red)';
    const wkStr = typeof wkRaw === 'number' ? (wkNum >= 0 ? '+' : '') + wkNum.toLocaleString() : (wkRaw || '—');
    const netColor = r.net > 0 ? 'var(--green)' : 'var(--red)';
    const spark = buildSparkline(r.history || []);
    const rowId = 'cot-' + r.asset.replace(/[^a-zA-Z0-9]/g,'_');
    html += `<div class="cot-row" style="grid-template-columns:110px 1fr 80px 80px 70px 90px;cursor:pointer;" onclick="toggleCOTDetail('${rowId}')">
      <div><div class="cot-asset">${r.asset}</div><div class="cot-category" style="font-size:10px;color:var(--text3);margin-top:2px;">${r.category}</div></div>
      <div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${barColor};"></div>
          <div class="bar-center"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:3px;">
          <span style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">Max Short</span>
          <span style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">${pct}th pctile</span>
          <span style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">Max Long</span>
        </div>
      </div>
      <div style="font-family:var(--font-mono);font-size:12px;text-align:right;color:${netColor};">${r.net > 0 ? '+':''} ${r.net.toLocaleString()}</div>
      <div style="font-family:var(--font-mono);font-size:12px;text-align:right;color:${wkColor};">${wkStr}</div>
      <div><span class="crowd-badge ${cls}">${label}</span></div>
      <div style="display:flex;align-items:center;">${spark}</div>
    </div>
    <div id="${rowId}-detail" style="display:none;background:var(--bg4);border:1px solid var(--border2);border-top:none;border-radius:0 0 8px 8px;padding:14px 16px;margin-top:-6px;margin-bottom:6px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
        <div style="background:var(--bg2);border-radius:8px;padding:10px;border:1px solid var(--border);">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;">Longs</div>
          <div style="font-size:15px;font-weight:500;font-family:var(--font-mono);color:var(--green);">${(r.longs||0).toLocaleString()}</div>
        </div>
        <div style="background:var(--bg2);border-radius:8px;padding:10px;border:1px solid var(--border);">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;">Shorts</div>
          <div style="font-size:15px;font-weight:500;font-family:var(--font-mono);color:var(--red);">${(r.shorts||0).toLocaleString()}</div>
        </div>
        <div style="background:var(--bg2);border-radius:8px;padding:10px;border:1px solid var(--border);">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;">Open Interest</div>
          <div style="font-size:15px;font-weight:500;font-family:var(--font-mono);color:var(--text2);">${(r.oi||0).toLocaleString()}</div>
        </div>
        <div style="background:var(--bg2);border-radius:8px;padding:10px;border:1px solid var(--border);">
          <div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;">3Y Range</div>
          <div style="font-size:13px;font-family:var(--font-mono);color:var(--text2);">${(r.net_min||0).toLocaleString()} → ${(r.net_max||0).toLocaleString()}</div>
        </div>
      </div>
      ${r.signal ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.2);border-radius:8px;font-size:12px;font-family:var(--font-mono);color:var(--accent);">Contrarian signal: ${r.signal.strength.toUpperCase()} ${r.signal.type} — positioning at ${pct}th percentile of 3-year range.</div>` : ''}
      <button class="ask-claude-btn" style="margin-top:10px;" onclick="event.stopPropagation();sendCOTThesis('${r.asset}',${pct},'${r.crowd}',${r.net})">Build contrarian thesis for ${r.asset} ↗</button>
    </div>`;
  });

  container.innerHTML = html;

  // Key signals
  const extreme = getActiveCOTData().filter(r=>r.crowd.includes('extreme'));
  let sigHtml = '';
  extreme.forEach(r => {
    const isExtLong = r.crowd === 'extreme-long';
    const signal = isExtLong ? 'Contrarian SHORT signal' : 'Contrarian LONG signal';
    const sigColor = isExtLong ? 'var(--red)' : 'var(--green)';
    sigHtml += `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${sigColor};flex-shrink:0;"></div>
      <div style="flex:1;font-size:13px;color:var(--text);font-weight:500;">${r.asset}</div>
      <div style="font-size:12px;font-family:var(--font-mono);color:${sigColor};">${signal}</div>
      <div style="font-size:11px;color:var(--text3);">${r.pctile}th percentile · ${r.net.toLocaleString()} contracts</div>
    </div>`;
  });
  document.getElementById('cot-signals').innerHTML = sigHtml || '<div class="empty-state">No extreme positioning signals at this time.</div>';
}

function toggleCOTDetail(rowId) {
  const el = document.getElementById(rowId + '-detail');
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  // Close all
  document.querySelectorAll('[id$="-detail"]').forEach(d => {
    if (d.id.startsWith('cot-')) d.style.display = 'none';
  });
  if (!isOpen) el.style.display = 'block';
}

function sendCOTThesis(asset, pctile, crowd, net) {
  navigate('thesis');
  document.getElementById('thesis-input').value =
    'Build a contrarian macro trade thesis for ' + asset + '. ' +
    'Net speculative positioning is ' + (net > 0 ? 'long' : 'short') + ' at ' + pctile + 'th percentile of its 3-year range (crowding: ' + crowd + '). ' +
    'Include: directional view, instrument expression, entry/stop/target, sizing guidance, and the key risk that would invalidate the contrarian thesis.';
  window.scrollTo(0, 0);
}

function setCOTFilter(f, el) {
  App.cotFilter = f;
  document.querySelectorAll('#cot-filters .filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderCOT();
}

// ─── REGIME PAGE ──────────────────────────────────────
function renderRegime() {
  const grid = document.getElementById('regime-cards');
  const labels = { growth:'Growth', inflation:'Inflation', dollar:'Dollar Cycle', risk:'Risk Appetite' };
  let html = '';
  for(const [key, r] of Object.entries(REGIME)) {
    const arrow = r.direction === 'up' ? '↑' : '↓';
    html += `<div class="regime-card">
      <div class="regime-name">${labels[key]}</div>
      <div class="regime-status" style="color:${r.color}"><span class="regime-arrow">${arrow}</span>${r.label}</div>
      <div class="regime-desc">${r.desc}</div>
      <div class="gauge-wrap">
        <div class="gauge-track"><div class="gauge-fill" style="width:${r.score}%;background:${r.color};"></div></div>
        <div class="gauge-labels"><span>Bearish</span><span>${r.score}/100</span><span>Bullish</span></div>
      </div>
    </div>`;
  }
  grid.innerHTML = html;

  // Matrix
  const matrix = document.getElementById('regime-matrix');
  const sigLabel = { 'sig-strong-long':'●●', 'sig-mild-long':'●', 'sig-neutral':'○', 'sig-mild-short':'▼', 'sig-strong-short':'▼▼' };
  let mHtml = `<table class="asset-matrix">
    <thead><tr><th style="text-align:left">Asset</th><th>Growth ↓</th><th>Inflation ↑</th><th>USD Bull</th><th>Risk-Off</th></tr></thead><tbody>`;
  REGIME_MATRIX.forEach(row => {
    mHtml += `<tr>
      <td>${row.asset}</td>
      <td><span class="signal-dot ${row.grow}"></span></td>
      <td><span class="signal-dot ${row.infl}"></span></td>
      <td><span class="signal-dot ${row.dollar}"></span></td>
      <td><span class="signal-dot ${row.risk}"></span></td>
    </tr>`;
  });
  mHtml += '</tbody></table>';
  matrix.innerHTML = mHtml;
}

// ─── TRADE JOURNAL ────────────────────────────────────
function renderJournal() {
  const container = document.getElementById('journal-rows');
  const trades = App.trades;

  if(!trades.length) {
    container.innerHTML = '<div class="empty-state">No trades logged yet. Add your first trade above.</div>';
    updateJournalStats();
    return;
  }

  let html = `<div style="display:grid;grid-template-columns:90px 120px 80px 80px 80px 80px 90px 90px;gap:8px;padding:4px 14px;margin-bottom:4px;">
    ${['Date','Instrument','Direction','Entry','Current/Exit','Size','P&L','Status'].map(h=>`<span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">${h}</span>`).join('')}
  </div>`;

  trades.slice().reverse().forEach(t => {
    const pnlNum = parseFloat(t.pnl) || 0;
    const pnlClass = pnlNum >= 0 ? 'pnl-positive' : 'pnl-negative';
    const pnlStr = pnlNum >= 0 ? `+${t.pnl}` : t.pnl;
    const statusClass = t.status === 'Open' ? 'status-open' : 'status-closed';
    html += `<div class="trade-row" onclick="openTradeDetail('${t.id}')">
      <div style="color:var(--text2);font-size:12px;">${t.date}</div>
      <div class="trade-instrument">${t.instrument}</div>
      <div style="color:${t.direction==='Long'?'var(--green)':'var(--red)'};font-weight:500;">${t.direction}</div>
      <div class="mono" style="color:var(--text2)">${t.entry}</div>
      <div class="mono" style="color:var(--text2)">${t.current || '—'}</div>
      <div style="color:var(--text2)">${t.size}</div>
      <div class="${pnlClass}">${t.pnl ? pnlStr : '—'}</div>
      <div class="${statusClass}">${t.status}</div>
    </div>`;
  });

  container.innerHTML = html;
  updateJournalStats();
}

function updateJournalStats() {
  const trades = App.trades;
  const closed = trades.filter(t=>t.status==='Closed');
  const open = trades.filter(t=>t.status==='Open');
  const winners = closed.filter(t=>parseFloat(t.pnl)>0);
  const totalPnl = closed.reduce((s,t)=>s+(parseFloat(t.pnl)||0),0);
  const wr = closed.length ? Math.round(winners.length/closed.length*100) : 0;

  document.getElementById('stat-open').textContent = open.length;
  document.getElementById('stat-closed').textContent = closed.length;
  document.getElementById('stat-wr').textContent = closed.length ? `${wr}%` : '—';
  document.getElementById('stat-pnl').textContent = totalPnl ? `${totalPnl > 0 ? '+':''} ${totalPnl.toFixed(1)}%` : '—';
  document.getElementById('stat-pnl').className = `metric-val ${totalPnl >= 0 ? 'up' : 'dn'}`;
}

function openAddTrade() {
  document.getElementById('trade-modal').classList.add('open');
}

function closeAddTrade() {
  document.getElementById('trade-modal').classList.remove('open');
  document.getElementById('trade-form').reset();
}

function saveTrade() {
  const f = document.getElementById('trade-form');
  const trade = {
    id: Date.now().toString(),
    date: document.getElementById('t-date').value,
    instrument: document.getElementById('t-instrument').value,
    direction: document.getElementById('t-direction').value,
    entry: document.getElementById('t-entry').value,
    current: document.getElementById('t-current').value,
    size: document.getElementById('t-size').value,
    pnl: document.getElementById('t-pnl').value,
    status: document.getElementById('t-status').value,
    thesis: document.getElementById('t-thesis').value,
    strategy: document.getElementById('t-strategy').value,
    stopLoss: document.getElementById('t-stop').value,
    target: document.getElementById('t-target').value,
  };
  if(!trade.instrument || !trade.date) { alert('Please fill in required fields.'); return; }
  App.trades.push(trade);
  localStorage.setItem('macro_trades', JSON.stringify(App.trades));
  closeAddTrade();
  renderJournal();
}

function openTradeDetail(id) {
  const t = App.trades.find(x=>x.id===id);
  if(!t) return;
  const pnlNum = parseFloat(t.pnl)||0;
  document.getElementById('detail-modal').classList.add('open');
  document.getElementById('detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div style="background:var(--bg4);border-radius:8px;padding:14px;"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Instrument</div><div style="font-size:22px;font-weight:600;font-family:var(--font-mono);color:var(--text)">${t.instrument}</div></div>
      <div style="background:var(--bg4);border-radius:8px;padding:14px;"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">P&amp;L</div><div style="font-size:22px;font-weight:600;font-family:var(--font-mono);color:${pnlNum>=0?'var(--green)':'var(--red)'}">${t.pnl ? (pnlNum>=0?'+':'')+t.pnl : '—'}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
      ${[['Direction',t.direction],['Entry',t.entry],['Current/Exit',t.current||'—'],['Stop Loss',t.stopLoss||'—'],['Target',t.target||'—'],['Status',t.status]].map(([l,v])=>`<div style="background:var(--bg4);border-radius:8px;padding:12px;"><div style="font-size:10px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;">${l}</div><div style="font-size:14px;font-family:var(--font-mono);color:var(--text2);">${v}</div></div>`).join('')}
    </div>
    ${t.thesis ? `<div style="background:var(--bg4);border-radius:8px;padding:14px;"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Trade Thesis</div><div style="font-size:13px;color:var(--text2);line-height:1.7;">${t.thesis}</div></div>` : ''}
  `;
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.remove('open');
}

// ─── THESIS BUILDER ───────────────────────────────────
function openThesisFromEvent(name) {
  navigate('thesis');
  document.getElementById('thesis-input').value = `Upcoming ${name} release — build a complete trade thesis including directional view, best instrument expression, entry level, stop loss, position sizing guidance, and bull/bear/base scenarios.`;
}

async function buildThesis() {
  const input = document.getElementById('thesis-input').value.trim();
  if(!input) return;
  const btn = document.getElementById('thesis-btn');
  const output = document.getElementById('thesis-output');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Building thesis...';
  output.classList.add('visible');
  output.classList.add('typing-cursor');
  output.textContent = '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        system:`You are a senior global macro portfolio manager at a multi-billion dollar hedge fund. When given a macro view or event, produce a structured trade thesis in the following format:

MACRO THESIS: [2-3 sentence summary of the macro view]

DIRECTIONAL VIEW: [Bull/Bear/Neutral with conviction level]

INSTRUMENT EXPRESSION:
- Primary: [specific instrument with rationale]  
- Alternative: [backup instrument]
- Why not [other options]: [brief rationale]

ENTRY & LEVELS:
- Entry: [specific level or trigger]
- Stop Loss: [level and rationale]
- Target: [level and time horizon]
- Risk/Reward: [ratio]

POSITION SIZING: [% of NAV recommendation and VaR guidance]

SCENARIOS:
BASE CASE (50%): [outcome and trade P&L]
BULL CASE (25%): [outcome and trade P&L]
BEAR CASE (25%): [outcome and exit plan]

WHAT KILLS THE TRADE: [specific risk factors and triggers to exit]

Be specific with levels, not vague. Use real market terminology. Keep total length under 400 words.`,
        messages:[{ role:'user', content: input }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'Error generating thesis.';
    output.classList.remove('typing-cursor');
    output.textContent = text;

    // Save to history
    App.thesisHistory.unshift({ id: Date.now(), input, output: text, date: new Date().toLocaleDateString() });
    if(App.thesisHistory.length > 20) App.thesisHistory.pop();
    localStorage.setItem('thesis_history', JSON.stringify(App.thesisHistory));
    renderThesisHistory();
  } catch(err) {
    output.classList.remove('typing-cursor');
    output.textContent = 'Error connecting to Claude API. Make sure you are running this from the Claude.ai interface.';
  }
  btn.disabled = false;
  btn.innerHTML = 'Build Thesis ↗';
}

function renderThesisHistory() {
  const container = document.getElementById('thesis-history');
  if(!App.thesisHistory.length) { container.innerHTML = ''; return; }
  let html = '<div class="section-title" style="margin-top:20px;">Recent theses</div>';
  App.thesisHistory.slice(0,5).forEach(t => {
    html += `<div style="padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;" onclick="loadThesis(${t.id})">
      <div style="font-size:12px;color:var(--text);font-weight:500;margin-bottom:2px;">${t.input.slice(0,80)}${t.input.length>80?'...':''}</div>
      <div style="font-size:11px;color:var(--text3);">${t.date}</div>
    </div>`;
  });
  container.innerHTML = html;
}

function loadThesis(id) {
  const t = App.thesisHistory.find(x=>x.id===id);
  if(!t) return;
  document.getElementById('thesis-input').value = t.input;
  const output = document.getElementById('thesis-output');
  output.classList.add('visible');
  output.textContent = t.output;
}

// ─── DASHBOARD SUMMARY ────────────────────────────────
function renderDashboard() {
  // Next event countdown
  const nextEv = EVENTS.find(e => e.time > NOW);
  if(nextEv) {
    document.getElementById('dash-next-event').textContent = nextEv.name;
    document.getElementById('dash-next-time').textContent = countdown(nextEv.time);
  }
  // Extreme positioning count
  const extremes = COT_DATA.filter(r=>r.crowd.includes('extreme'));
  document.getElementById('dash-extremes').textContent = extremes.length;

  // Regime summary
  const regime = REGIME;
  const regimeSummary = `${regime.growth.label} growth · ${regime.inflation.label} inflation · ${regime.dollar.label} · ${regime.risk.label}`;
  document.getElementById('dash-regime').textContent = regimeSummary;

  // Open trades
  document.getElementById('dash-open-trades').textContent = App.trades.filter(t=>t.status==='Open').length;
}

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  navigate('calendar');
  renderCalendar();
  renderCOT();
  renderRegime();
  renderJournal();
  renderThesisHistory();
  renderDashboard();

  // Live clock
  setInterval(() => {
    const now = new Date();
    const el = document.getElementById('topbar-time');
    if(el) el.textContent = now.toUTCString().slice(17,25) + ' UTC';
  }, 1000);
});
