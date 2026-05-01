// ── Supabase setup ──
const SUPABASE_URL = 'https://wrvntwlbpsvyzfnsiwrr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indydm50d2xicHN2eXpmbnNpd3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjYxNzAsImV4cCI6MjA5MzE0MjE3MH0.QXjw9y3BCp4_TidAfCWmmM28goQL9CTmNUnZ5iLpnks';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── State ──
let colorMode = 'status', typeFilter = 'all', searchQuery = '', oppFilterActive = false;
const entityFilter = { city: true, county: true, district: true };
const notesCache = {};
const oppCache = {};
let selectedId = null, markers = [], map;

// ── Colors ──
const STATUS_COLORS = { Customer: '#4caf7d', Prospect: '#5a6688' };
const SYSTEM_COLORS = {
  'Tyler - Incode': '#e8664a', 'Tyler - Munis': '#e8904a', 'Tyler - Other': '#e8b44a',
  'STW': '#a678e8', 'Caselle': '#4ab4e8', 'New World': '#4ae8c5', 'Superion': '#e84a9b',
  'Springbrook': '#78e848', 'Edmunds': '#e8e44a', 'OpenGov': '#2c5eff',
  'CentralSquare': '#ff8c2c', 'Harris': '#e84a4a', 'Other': '#7a8299', 'Unknown': '#3a3f52'
};
const BUDGET_BANDS = [
  { max: 0, color: '#3a3f52', label: 'No budget data' },
  { max: 20e6, color: '#4a7de8', label: '< $20M' },
  { max: 50e6, color: '#4ab4e8', label: '$20M – $50M' },
  { max: 100e6, color: '#4ae8c5', label: '$50M – $100M' },
  { max: Infinity, color: '#f0c060', label: '$100M+' }
];

const TERRITORY_GEO = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Kansas"},"geometry":{"type":"Polygon","coordinates":[[[-102.05,40.00],[-95.31,40.00],[-94.61,39.11],[-94.61,37.00],[-102.05,37.00],[-102.05,40.00]]]}},{"type":"Feature","properties":{"name":"Missouri"},"geometry":{"type":"Polygon","coordinates":[[[-95.77,40.58],[-91.73,40.61],[-89.42,36.50],[-94.62,36.50],[-94.62,39.11],[-95.77,40.58]]]}},{"type":"Feature","properties":{"name":"Oklahoma"},"geometry":{"type":"Polygon","coordinates":[[[-103.00,37.00],[-94.43,37.00],[-94.43,33.64],[-99.54,34.42],[-100.00,34.56],[-100.00,36.50],[-103.00,36.50],[-103.00,37.00]]]}},{"type":"Feature","properties":{"name":"Texas"},"geometry":{"type":"Polygon","coordinates":[[[-103.00,36.50],[-100.00,36.50],[-100.00,34.56],[-99.54,34.42],[-94.43,33.64],[-93.80,31.00],[-93.80,29.50],[-97.36,25.87],[-106.65,32.00],[-106.65,33.00],[-103.00,33.00],[-103.00,36.50]]]}}]};
const SURROUNDING_GEO = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Nebraska"},"geometry":{"type":"Polygon","coordinates":[[[-104.05,43.00],[-95.31,43.00],[-95.31,40.00],[-102.05,40.00],[-104.05,41.00],[-104.05,43.00]]]}},{"type":"Feature","properties":{"name":"Iowa"},"geometry":{"type":"Polygon","coordinates":[[[-96.50,43.50],[-91.00,43.50],[-91.00,40.38],[-95.77,40.58],[-96.50,43.50]]]}},{"type":"Feature","properties":{"name":"Illinois"},"geometry":{"type":"Polygon","coordinates":[[[-91.50,42.50],[-87.50,42.50],[-87.50,37.00],[-89.42,36.50],[-91.50,40.54],[-91.50,42.50]]]}},{"type":"Feature","properties":{"name":"Arkansas"},"geometry":{"type":"Polygon","coordinates":[[[-94.62,36.50],[-89.42,36.50],[-90.30,33.00],[-94.43,33.00],[-94.43,33.64],[-94.62,36.50]]]}},{"type":"Feature","properties":{"name":"Louisiana"},"geometry":{"type":"Polygon","coordinates":[[[-94.00,33.00],[-90.30,33.00],[-88.80,30.00],[-93.80,29.50],[-93.80,31.00],[-94.00,33.00]]]}},{"type":"Feature","properties":{"name":"New Mexico"},"geometry":{"type":"Polygon","coordinates":[[[-109.00,37.00],[-103.00,37.00],[-103.00,33.00],[-109.00,31.30],[-109.00,37.00]]]}},{"type":"Feature","properties":{"name":"Colorado"},"geometry":{"type":"Polygon","coordinates":[[[-109.00,41.00],[-102.05,40.00],[-102.05,37.00],[-109.00,37.00],[-109.00,41.00]]]}}]};

// ── Helpers ──
function getColor(acc) {
  if (colorMode === 'status') return STATUS_COLORS[acc.type] || '#5a6688';
  if (colorMode === 'system') return SYSTEM_COLORS[acc.accounting_group] || '#3a3f52';
  const b = acc.budget || 0;
  for (const t of BUDGET_BANDS) if (b <= t.max) return t.color;
  return BUDGET_BANDS[4].color;
}

function makeIcon(acc, sel) {
  const c = getColor(acc), s = sel ? 16 : 11, bw = sel ? 2 : 1.5;
  const bc = sel ? '#fff' : 'rgba(0,0,0,0.6)';
  const hasOpp = !!(oppCache[acc.id] && oppCache[acc.id].active);
  const et = acc.entity_type;
  const dim = s + 4;
  let shape;
  if (et === 'city') {
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><circle cx="${dim/2}" cy="${dim/2}" r="${s/2}" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  } else if (et === 'county') {
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><rect x="2" y="2" width="${s}" height="${s}" rx="2" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  } else {
    const cx = dim/2, r = s/2;
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><polygon points="${cx},${cx-r} ${cx+r},${cx} ${cx},${cx+r} ${cx-r},${cx}" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  }
  const star = hasOpp ? `<div style="position:absolute;top:-6px;right:-6px;font-size:9px;line-height:1;filter:drop-shadow(0 0 2px rgba(0,0,0,.8))">⭐</div>` : '';
  const html = `<div style="position:relative;display:inline-block">${shape}${star}</div>`;
  return L.divIcon({ className: '', html, iconSize: [dim + (hasOpp ? 6 : 0), dim + (hasOpp ? 6 : 0)], iconAnchor: [(dim + (hasOpp ? 6 : 0))/2, (dim + (hasOpp ? 6 : 0))/2] });
}

function fmtBudget(n) {
  if (!n || n <= 0) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  return '$' + (n/1e3).toFixed(0) + 'K';
}

function fv(label, val, cls) {
  const v = val && String(val).trim() && String(val) !== 'nan' ? String(val) : null;
  return `<div class="field-row"><div class="field-label">${label}</div><div class="field-value ${cls||''} ${v?'':'empty'}">${v||'Not available'}</div></div>`;
}

function isVisible(acc) {
  if (!entityFilter[acc.entity_type]) return false;
  if (typeFilter !== 'all' && acc.type !== typeFilter) return false;
  if (oppFilterActive && !(oppCache[acc.id] && oppCache[acc.id].active)) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!acc.name.toLowerCase().includes(q) && !(acc.state||'').toLowerCase().includes(q)) return false;
  }
  return true;
}

function refreshMarkers() {
  let vis = 0, cust = 0, prosp = 0;
  markers.forEach(({ marker, acc }) => {
    const show = isVisible(acc);
    if (show) { vis++; acc.type === 'Customer' ? cust++ : prosp++; }
    marker.setIcon(makeIcon(acc, acc.id === selectedId));
    marker.setOpacity(show ? 1 : 0);
  });
  document.getElementById('st-total').innerHTML = `Showing: <b>${vis}</b>`;
  document.getElementById('st-cust').innerHTML = `Customers: <b>${cust}</b>`;
  document.getElementById('st-prosp').innerHTML = `Prospects: <b>${prosp}</b>`;
}

// ── Panel ──
async function openPanel(acc) {
  selectedId = acc.id;
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('panel-name').textContent = acc.name;
  const b = document.getElementById('panel-badge');
  b.textContent = acc.type;
  b.className = 'type-badge ' + (acc.type === 'Customer' ? 'customer' : 'prospect');

  document.getElementById('panel-fields').innerHTML = [
    fv('State', acc.state),
    fv('Entity Type', (acc.entity_type||'').charAt(0).toUpperCase() + (acc.entity_type||'').slice(1)),
    fv('Status', acc.type, acc.type === 'Customer' ? 'green' : ''),
    fv('Budget', fmtBudget(acc.budget), 'gold'),
    fv('Last Activity', acc.last_activity),
    fv('OpenGov Products', acc.product_summary),
    fv('Accounting System', acc.accounting_system),
    fv('Budgeting Solution', acc.budgeting_solution),
    fv('Procurement Solution', acc.procurement_solution),
    fv('Permitting Solution', acc.permitting_solution),
    fv('Asset Management', acc.asset_management),
  ].join('');

  // Load notes
  const note = notesCache[acc.id] || '';
  document.getElementById('notes-area').value = note;
  const sb = document.getElementById('save-btn');
  sb.textContent = 'Save Notes'; sb.className = '';

  // Load opportunity
  const opp = oppCache[acc.id] || {};
  const isActive = !!(opp.active);
  const toggle = document.getElementById('opp-toggle');
  const label = document.getElementById('opp-toggle-label');
  const section = document.getElementById('opp-section');
  const urlContent = document.getElementById('opp-url-row-content');
  const linkEl = document.getElementById('opp-project-link');

  toggle.checked = isActive;
  document.getElementById('opp-url-input').value = opp.url || '';
  document.getElementById('opp-save-btn').textContent = 'Save';
  document.getElementById('opp-save-btn').className = '';

  if (isActive) {
    section.classList.add('active');
    label.classList.add('active');
    urlContent.style.display = 'block';
    if (opp.url) { linkEl.href = opp.url; linkEl.classList.remove('hidden'); }
    else { linkEl.classList.add('hidden'); }
  } else {
    section.classList.remove('active');
    label.classList.remove('active');
    urlContent.style.display = 'none';
    linkEl.classList.add('hidden');
  }

  refreshMarkers();
}

function closePanel() {
  selectedId = null;
  document.getElementById('panel').classList.add('hidden');
  refreshMarkers();
}

// ── Notes ──
async function saveNotes() {
  if (selectedId === null) return;
  const note = document.getElementById('notes-area').value;
  notesCache[selectedId] = note;
  const sb = document.getElementById('save-btn');
  sb.textContent = 'Saving...'; sb.className = '';

  const { error } = await sb_upsertNote(selectedId, note);
  if (!error) {
    sb.textContent = '✓ Saved'; sb.className = 'saved';
  } else {
    sb.textContent = 'Error — retry';
  }
  setTimeout(() => { sb.textContent = 'Save Notes'; sb.className = ''; }, 2000);
}

async function sb_upsertNote(id, note) {
  return await sb.from('notes').upsert({ account_id: id, note, updated_at: new Date().toISOString() });
}

// ── Opportunities ──
function onOppToggle() {
  if (selectedId === null) return;
  const isActive = document.getElementById('opp-toggle').checked;
  if (!oppCache[selectedId]) oppCache[selectedId] = {};
  oppCache[selectedId].active = isActive;

  const section = document.getElementById('opp-section');
  const label = document.getElementById('opp-toggle-label');
  const urlContent = document.getElementById('opp-url-row-content');
  const linkEl = document.getElementById('opp-project-link');

  if (isActive) {
    section.classList.add('active'); label.classList.add('active');
    urlContent.style.display = 'block';
  } else {
    section.classList.remove('active'); label.classList.remove('active');
    urlContent.style.display = 'none'; linkEl.classList.add('hidden');
  }

  sb.from('opportunities').upsert({ account_id: selectedId, active: isActive, updated_at: new Date().toISOString() });
  refreshMarkers();
}

async function saveOpportunity() {
  if (selectedId === null) return;
  const url = document.getElementById('opp-url-input').value.trim();
  if (!oppCache[selectedId]) oppCache[selectedId] = {};
  oppCache[selectedId].url = url;

  const linkEl = document.getElementById('opp-project-link');
  if (url) { linkEl.href = url; linkEl.classList.remove('hidden'); }
  else { linkEl.classList.add('hidden'); }

  const btn = document.getElementById('opp-save-btn');
  btn.textContent = 'Saving...';
  await sb.from('opportunities').upsert({
    account_id: selectedId,
    active: !!(oppCache[selectedId].active),
    url,
    updated_at: new Date().toISOString()
  });
  btn.textContent = '✓ Saved'; btn.className = 'saved';
  setTimeout(() => { btn.textContent = 'Save'; btn.className = ''; }, 2000);
}

// ── Filters ──
function setColorMode(m) {
  colorMode = m;
  ['status','system','budget'].forEach(x => document.getElementById('btn-'+x).classList.toggle('active', x === m));
  updateLegend(); refreshMarkers();
}
function setTypeFilter(f) {
  typeFilter = f;
  [['all','all'],['cust','Customer'],['prosp','Prospect']].forEach(([id,v]) => document.getElementById('btn-'+id).classList.toggle('active', v === f));
  refreshMarkers();
}
function onSearch(q) { searchQuery = q; refreshMarkers(); }
function toggleEntity(type) {
  entityFilter[type] = !entityFilter[type];
  document.getElementById('btn-'+type).classList.toggle('active', entityFilter[type]);
  refreshMarkers();
}
function toggleOppFilter() {
  oppFilterActive = !oppFilterActive;
  document.getElementById('btn-opp-only').classList.toggle('active', oppFilterActive);
  refreshMarkers();
}

// ── Legend ──
function updateLegend() {
  const el = document.getElementById('legend');
  let h = '';
  if (colorMode === 'status') {
    h = '<h4>Status</h4>';
    h += '<div class="li"><div class="dot" style="background:#4caf7d"></div>Customer</div>';
    h += '<div class="li"><div class="dot" style="background:#5a6688"></div>Prospect</div>';
  } else if (colorMode === 'system') {
    h = '<h4>Accounting System</h4>';
    Object.entries(SYSTEM_COLORS).forEach(([k,c]) => { h += `<div class="li"><div class="dot" style="background:${c}"></div>${k}</div>`; });
  } else {
    h = '<h4>Budget Size</h4>';
    BUDGET_BANDS.forEach(t => { h += `<div class="li"><div class="dot" style="background:${t.color}"></div>${t.label}</div>`; });
  }
  h += '<hr class="sep"><h4>Entity Type</h4>';
  h += '<div class="li"><div class="dot" style="background:#9ba3bb"></div>City / Town</div>';
  h += '<div class="li"><div class="sq" style="background:#9ba3bb"></div>County</div>';
  h += '<div class="li"><div class="dia" style="background:#9ba3bb"></div>District / Other</div>';
  h += '<hr class="sep"><h4>Opportunities</h4>';
  h += '<div class="li"><span style="font-size:11px">⭐</span>&nbsp;Active opportunity</div>';
  el.innerHTML = h;
}

// ── Load data from Supabase ──
async function loadData() {
  // Load accounts
  const { data: accounts, error: accErr } = await sb.from('accounts').select('*');
  if (accErr || !accounts || accounts.length === 0) {
    // Fall back to bundled data.js
    initMap(ACCOUNTS);
    return;
  }

  // Load notes
  const { data: notes } = await sb.from('notes').select('*');
  if (notes) notes.forEach(n => { notesCache[n.account_id] = n.note; });

  // Load opportunities
  const { data: opps } = await sb.from('opportunities').select('*');
  if (opps) opps.forEach(o => { oppCache[o.account_id] = { active: o.active, url: o.url }; });

  document.getElementById('loading-pill').style.display = 'none';
  initMap(accounts);
}

// ── Map init ──
function initMap(accounts) {
  document.getElementById('loading-pill').style.display = 'none';

  map = L.map('map', { center: [35.5, -98.0], zoom: 5, zoomControl: true, preferCanvas: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  L.geoJSON(SURROUNDING_GEO, {
    style: { color: '#334', weight: 0.5, fillColor: '#1a1e2a', fillOpacity: 0.45 }
  }).addTo(map);

  L.geoJSON(TERRITORY_GEO, {
    style: { color: '#2c5eff', weight: 2.5, fillColor: '#1a2a50', fillOpacity: 0.12 }
  }).addTo(map);

  // State labels
  const labels = { Kansas:[38.5,-98.4], Missouri:[38.45,-92.6], Oklahoma:[35.55,-97.6], Texas:[31.0,-99.5] };
  Object.entries(labels).forEach(([name,[lat,lng]]) => {
    L.marker([lat,lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="font-size:14px;font-weight:700;color:#2c5eff;opacity:0.45;letter-spacing:4px;text-transform:uppercase;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.8)">${name.toUpperCase()}</div>`,
        iconAnchor: [30,10]
      }),
      interactive: false, zIndexOffset: -200
    }).addTo(map);
  });

  // Add markers
  accounts.forEach(acc => {
    if (!acc.lat || !acc.lng) return;
    const m = L.marker([acc.lat, acc.lng], { icon: makeIcon(acc, false) });
    m.on('click', () => openPanel(acc));
    m.bindTooltip(acc.name, { direction: 'top', offset: [0,-8] });
    m.addTo(map);
    markers.push({ marker: m, acc });
  });

  updateLegend();
  refreshMarkers();
}

// ── Boot ──
// ── Supabase setup ──
const SUPABASE_URL = 'https://wrvntwlbpsvyzfnsiwrr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indydm50d2xicHN2eXpmbnNpd3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjYxNzAsImV4cCI6MjA5MzE0MjE3MH0.QXjw9y3BCp4_TidAfCWmmM28goQL9CTmNUnZ5iLpnks';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── State ──
let colorMode = 'status', typeFilter = 'all', searchQuery = '', oppFilterActive = false;
const entityFilter = { city: true, county: true, district: true };
const notesCache = {};
const oppCache = {};
let selectedId = null, markers = [], map;

// ── Colors ──
const STATUS_COLORS = { Customer: '#4caf7d', Prospect: '#5a6688' };
const SYSTEM_COLORS = {
  'Tyler - Incode': '#e8664a', 'Tyler - Munis': '#e8904a', 'Tyler - Other': '#e8b44a',
  'STW': '#a678e8', 'Caselle': '#4ab4e8', 'New World': '#4ae8c5', 'Superion': '#e84a9b',
  'Springbrook': '#78e848', 'Edmunds': '#e8e44a', 'OpenGov': '#2c5eff',
  'CentralSquare': '#ff8c2c', 'Harris': '#e84a4a', 'Other': '#7a8299', 'Unknown': '#3a3f52'
};
const BUDGET_BANDS = [
  { max: 0, color: '#3a3f52', label: 'No budget data' },
  { max: 20e6, color: '#4a7de8', label: '< $20M' },
  { max: 50e6, color: '#4ab4e8', label: '$20M – $50M' },
  { max: 100e6, color: '#4ae8c5', label: '$50M – $100M' },
  { max: Infinity, color: '#f0c060', label: '$100M+' }
];

const TERRITORY_GEO = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Kansas"},"geometry":{"type":"Polygon","coordinates":[[[-102.05,40.00],[-95.31,40.00],[-94.61,39.11],[-94.61,37.00],[-102.05,37.00],[-102.05,40.00]]]}},{"type":"Feature","properties":{"name":"Missouri"},"geometry":{"type":"Polygon","coordinates":[[[-95.77,40.58],[-91.73,40.61],[-89.42,36.50],[-94.62,36.50],[-94.62,39.11],[-95.77,40.58]]]}},{"type":"Feature","properties":{"name":"Oklahoma"},"geometry":{"type":"Polygon","coordinates":[[[-103.00,37.00],[-94.43,37.00],[-94.43,33.64],[-99.54,34.42],[-100.00,34.56],[-100.00,36.50],[-103.00,36.50],[-103.00,37.00]]]}},{"type":"Feature","properties":{"name":"Texas"},"geometry":{"type":"Polygon","coordinates":[[[-103.00,36.50],[-100.00,36.50],[-100.00,34.56],[-99.54,34.42],[-94.43,33.64],[-93.80,31.00],[-93.80,29.50],[-97.36,25.87],[-106.65,32.00],[-106.65,33.00],[-103.00,33.00],[-103.00,36.50]]]}}]};
const SURROUNDING_GEO = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Nebraska"},"geometry":{"type":"Polygon","coordinates":[[[-104.05,43.00],[-95.31,43.00],[-95.31,40.00],[-102.05,40.00],[-104.05,41.00],[-104.05,43.00]]]}},{"type":"Feature","properties":{"name":"Iowa"},"geometry":{"type":"Polygon","coordinates":[[[-96.50,43.50],[-91.00,43.50],[-91.00,40.38],[-95.77,40.58],[-96.50,43.50]]]}},{"type":"Feature","properties":{"name":"Illinois"},"geometry":{"type":"Polygon","coordinates":[[[-91.50,42.50],[-87.50,42.50],[-87.50,37.00],[-89.42,36.50],[-91.50,40.54],[-91.50,42.50]]]}},{"type":"Feature","properties":{"name":"Arkansas"},"geometry":{"type":"Polygon","coordinates":[[[-94.62,36.50],[-89.42,36.50],[-90.30,33.00],[-94.43,33.00],[-94.43,33.64],[-94.62,36.50]]]}},{"type":"Feature","properties":{"name":"Louisiana"},"geometry":{"type":"Polygon","coordinates":[[[-94.00,33.00],[-90.30,33.00],[-88.80,30.00],[-93.80,29.50],[-93.80,31.00],[-94.00,33.00]]]}},{"type":"Feature","properties":{"name":"New Mexico"},"geometry":{"type":"Polygon","coordinates":[[[-109.00,37.00],[-103.00,37.00],[-103.00,33.00],[-109.00,31.30],[-109.00,37.00]]]}},{"type":"Feature","properties":{"name":"Colorado"},"geometry":{"type":"Polygon","coordinates":[[[-109.00,41.00],[-102.05,40.00],[-102.05,37.00],[-109.00,37.00],[-109.00,41.00]]]}}]};

// ── Helpers ──
function getColor(acc) {
  if (colorMode === 'status') return STATUS_COLORS[acc.type] || '#5a6688';
  if (colorMode === 'system') return SYSTEM_COLORS[acc.accounting_group] || '#3a3f52';
  const b = acc.budget || 0;
  for (const t of BUDGET_BANDS) if (b <= t.max) return t.color;
  return BUDGET_BANDS[4].color;
}

function makeIcon(acc, sel) {
  const c = getColor(acc), s = sel ? 16 : 11, bw = sel ? 2 : 1.5;
  const bc = sel ? '#fff' : 'rgba(0,0,0,0.6)';
  const hasOpp = !!(oppCache[acc.id] && oppCache[acc.id].active);
  const et = acc.entity_type;
  const dim = s + 4;
  let shape;
  if (et === 'city') {
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><circle cx="${dim/2}" cy="${dim/2}" r="${s/2}" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  } else if (et === 'county') {
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><rect x="2" y="2" width="${s}" height="${s}" rx="2" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  } else {
    const cx = dim/2, r = s/2;
    shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}"><polygon points="${cx},${cx-r} ${cx+r},${cx} ${cx},${cx+r} ${cx-r},${cx}" fill="${c}" stroke="${bc}" stroke-width="${bw}"/></svg>`;
  }
  const star = hasOpp ? `<div style="position:absolute;top:-6px;right:-6px;font-size:9px;line-height:1;filter:drop-shadow(0 0 2px rgba(0,0,0,.8))">⭐</div>` : '';
  const html = `<div style="position:relative;display:inline-block">${shape}${star}</div>`;
  return L.divIcon({ className: '', html, iconSize: [dim + (hasOpp ? 6 : 0), dim + (hasOpp ? 6 : 0)], iconAnchor: [(dim + (hasOpp ? 6 : 0))/2, (dim + (hasOpp ? 6 : 0))/2] });
}

function fmtBudget(n) {
  if (!n || n <= 0) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  return '$' + (n/1e3).toFixed(0) + 'K';
}

function fv(label, val, cls) {
  const v = val && String(val).trim() && String(val) !== 'nan' ? String(val) : null;
  return `<div class="field-row"><div class="field-label">${label}</div><div class="field-value ${cls||''} ${v?'':'empty'}">${v||'Not available'}</div></div>`;
}

function isVisible(acc) {
  if (!entityFilter[acc.entity_type]) return false;
  if (typeFilter !== 'all' && acc.type !== typeFilter) return false;
  if (oppFilterActive && !(oppCache[acc.id] && oppCache[acc.id].active)) return false;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!acc.name.toLowerCase().includes(q) && !(acc.state||'').toLowerCase().includes(q)) return false;
  }
  return true;
}

function refreshMarkers() {
  let vis = 0, cust = 0, prosp = 0;
  markers.forEach(({ marker, acc }) => {
    const show = isVisible(acc);
    if (show) { vis++; acc.type === 'Customer' ? cust++ : prosp++; }
    marker.setIcon(makeIcon(acc, acc.id === selectedId));
    marker.setOpacity(show ? 1 : 0);
  });
  document.getElementById('st-total').innerHTML = `Showing: <b>${vis}</b>`;
  document.getElementById('st-cust').innerHTML = `Customers: <b>${cust}</b>`;
  document.getElementById('st-prosp').innerHTML = `Prospects: <b>${prosp}</b>`;
}

// ── Panel ──
async function openPanel(acc) {
  selectedId = acc.id;
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('panel-name').textContent = acc.name;
  const b = document.getElementById('panel-badge');
  b.textContent = acc.type;
  b.className = 'type-badge ' + (acc.type === 'Customer' ? 'customer' : 'prospect');

  document.getElementById('panel-fields').innerHTML = [
    fv('State', acc.state),
    fv('Entity Type', (acc.entity_type||'').charAt(0).toUpperCase() + (acc.entity_type||'').slice(1)),
    fv('Status', acc.type, acc.type === 'Customer' ? 'green' : ''),
    fv('Budget', fmtBudget(acc.budget), 'gold'),
    fv('Last Activity', acc.last_activity),
    fv('OpenGov Products', acc.product_summary),
    fv('Accounting System', acc.accounting_system),
    fv('Budgeting Solution', acc.budgeting_solution),
    fv('Procurement Solution', acc.procurement_solution),
    fv('Permitting Solution', acc.permitting_solution),
    fv('Asset Management', acc.asset_management),
  ].join('');

  // Load notes
  const note = notesCache[acc.id] || '';
  document.getElementById('notes-area').value = note;
  const sb = document.getElementById('save-btn');
  sb.textContent = 'Save Notes'; sb.className = '';

  // Load opportunity
  const opp = oppCache[acc.id] || {};
  const isActive = !!(opp.active);
  const toggle = document.getElementById('opp-toggle');
  const label = document.getElementById('opp-toggle-label');
  const section = document.getElementById('opp-section');
  const urlContent = document.getElementById('opp-url-row-content');
  const linkEl = document.getElementById('opp-project-link');

  toggle.checked = isActive;
  document.getElementById('opp-url-input').value = opp.url || '';
  document.getElementById('opp-save-btn').textContent = 'Save';
  document.getElementById('opp-save-btn').className = '';

  if (isActive) {
    section.classList.add('active');
    label.classList.add('active');
    urlContent.style.display = 'block';
    if (opp.url) { linkEl.href = opp.url; linkEl.classList.remove('hidden'); }
    else { linkEl.classList.add('hidden'); }
  } else {
    section.classList.remove('active');
    label.classList.remove('active');
    urlContent.style.display = 'none';
    linkEl.classList.add('hidden');
  }

  refreshMarkers();
}

function closePanel() {
  selectedId = null;
  document.getElementById('panel').classList.add('hidden');
  refreshMarkers();
}

// ── Notes ──
async function saveNotes() {
  if (selectedId === null) return;
  const note = document.getElementById('notes-area').value;
  notesCache[selectedId] = note;
  const sb = document.getElementById('save-btn');
  sb.textContent = 'Saving...'; sb.className = '';

  const { error } = await sb_upsertNote(selectedId, note);
  if (!error) {
    sb.textContent = '✓ Saved'; sb.className = 'saved';
  } else {
    sb.textContent = 'Error — retry';
  }
  setTimeout(() => { sb.textContent = 'Save Notes'; sb.className = ''; }, 2000);
}

async function sb_upsertNote(id, note) {
  return await sb.from('notes').upsert({ account_id: id, note, updated_at: new Date().toISOString() });
}

// ── Opportunities ──
function onOppToggle() {
  if (selectedId === null) return;
  const isActive = document.getElementById('opp-toggle').checked;
  if (!oppCache[selectedId]) oppCache[selectedId] = {};
  oppCache[selectedId].active = isActive;

  const section = document.getElementById('opp-section');
  const label = document.getElementById('opp-toggle-label');
  const urlContent = document.getElementById('opp-url-row-content');
  const linkEl = document.getElementById('opp-project-link');

  if (isActive) {
    section.classList.add('active'); label.classList.add('active');
    urlContent.style.display = 'block';
  } else {
    section.classList.remove('active'); label.classList.remove('active');
    urlContent.style.display = 'none'; linkEl.classList.add('hidden');
  }

  sb.from('opportunities').upsert({ account_id: selectedId, active: isActive, updated_at: new Date().toISOString() });
  refreshMarkers();
}

async function saveOpportunity() {
  if (selectedId === null) return;
  const url = document.getElementById('opp-url-input').value.trim();
  if (!oppCache[selectedId]) oppCache[selectedId] = {};
  oppCache[selectedId].url = url;

  const linkEl = document.getElementById('opp-project-link');
  if (url) { linkEl.href = url; linkEl.classList.remove('hidden'); }
  else { linkEl.classList.add('hidden'); }

  const btn = document.getElementById('opp-save-btn');
  btn.textContent = 'Saving...';
  await sb.from('opportunities').upsert({
    account_id: selectedId,
    active: !!(oppCache[selectedId].active),
    url,
    updated_at: new Date().toISOString()
  });
  btn.textContent = '✓ Saved'; btn.className = 'saved';
  setTimeout(() => { btn.textContent = 'Save'; btn.className = ''; }, 2000);
}

// ── Filters ──
function setColorMode(m) {
  colorMode = m;
  ['status','system','budget'].forEach(x => document.getElementById('btn-'+x).classList.toggle('active', x === m));
  updateLegend(); refreshMarkers();
}
function setTypeFilter(f) {
  typeFilter = f;
  [['all','all'],['cust','Customer'],['prosp','Prospect']].forEach(([id,v]) => document.getElementById('btn-'+id).classList.toggle('active', v === f));
  refreshMarkers();
}
function onSearch(q) { searchQuery = q; refreshMarkers(); }
function toggleEntity(type) {
  entityFilter[type] = !entityFilter[type];
  document.getElementById('btn-'+type).classList.toggle('active', entityFilter[type]);
  refreshMarkers();
}
function toggleOppFilter() {
  oppFilterActive = !oppFilterActive;
  document.getElementById('btn-opp-only').classList.toggle('active', oppFilterActive);
  refreshMarkers();
}

// ── Legend ──
function updateLegend() {
  const el = document.getElementById('legend');
  let h = '';
  if (colorMode === 'status') {
    h = '<h4>Status</h4>';
    h += '<div class="li"><div class="dot" style="background:#4caf7d"></div>Customer</div>';
    h += '<div class="li"><div class="dot" style="background:#5a6688"></div>Prospect</div>';
  } else if (colorMode === 'system') {
    h = '<h4>Accounting System</h4>';
    Object.entries(SYSTEM_COLORS).forEach(([k,c]) => { h += `<div class="li"><div class="dot" style="background:${c}"></div>${k}</div>`; });
  } else {
    h = '<h4>Budget Size</h4>';
    BUDGET_BANDS.forEach(t => { h += `<div class="li"><div class="dot" style="background:${t.color}"></div>${t.label}</div>`; });
  }
  h += '<hr class="sep"><h4>Entity Type</h4>';
  h += '<div class="li"><div class="dot" style="background:#9ba3bb"></div>City / Town</div>';
  h += '<div class="li"><div class="sq" style="background:#9ba3bb"></div>County</div>';
  h += '<div class="li"><div class="dia" style="background:#9ba3bb"></div>District / Other</div>';
  h += '<hr class="sep"><h4>Opportunities</h4>';
  h += '<div class="li"><span style="font-size:11px">⭐</span>&nbsp;Active opportunity</div>';
  el.innerHTML = h;
}

// ── Load data from Supabase ──
async function loadData() {
  // Load accounts
  const { data: accounts, error: accErr } = await sb.from('accounts').select('*');
  if (accErr || !accounts || accounts.length === 0) {
    // Fall back to bundled data.js
    initMap(ACCOUNTS);
    return;
  }

  // Load notes
  const { data: notes } = await sb.from('notes').select('*');
  if (notes) notes.forEach(n => { notesCache[n.account_id] = n.note; });

  // Load opportunities
  const { data: opps } = await sb.from('opportunities').select('*');
  if (opps) opps.forEach(o => { oppCache[o.account_id] = { active: o.active, url: o.url }; });

  document.getElementById('loading-pill').style.display = 'none';
  initMap(accounts);
}

// ── Map init ──
function initMap(accounts) {
  document.getElementById('loading-pill').style.display = 'none';

  map = L.map('map', { center: [35.5, -98.0], zoom: 5, zoomControl: true, preferCanvas: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  L.geoJSON(SURROUNDING_GEO, {
    style: { color: '#334', weight: 0.5, fillColor: '#1a1e2a', fillOpacity: 0.45 }
  }).addTo(map);

  L.geoJSON(TERRITORY_GEO, {
    style: { color: '#2c5eff', weight: 2.5, fillColor: '#1a2a50', fillOpacity: 0.12 }
  }).addTo(map);

  // State labels
  const labels = { Kansas:[38.5,-98.4], Missouri:[38.45,-92.6], Oklahoma:[35.55,-97.6], Texas:[31.0,-99.5] };
  Object.entries(labels).forEach(([name,[lat,lng]]) => {
    L.marker([lat,lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="font-size:14px;font-weight:700;color:#2c5eff;opacity:0.45;letter-spacing:4px;text-transform:uppercase;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.8)">${name.toUpperCase()}</div>`,
        iconAnchor: [30,10]
      }),
      interactive: false, zIndexOffset: -200
    }).addTo(map);
  });

  // Add markers
  accounts.forEach(acc => {
    if (!acc.lat || !acc.lng) return;
    const m = L.marker([acc.lat, acc.lng], { icon: makeIcon(acc, false) });
    m.on('click', () => openPanel(acc));
    m.bindTooltip(acc.name, { direction: 'top', offset: [0,-8] });
    m.addTo(map);
    markers.push({ marker: m, acc });
  });

  updateLegend();
  refreshMarkers();
}

// ── Boot ──
window.addEventListener('DOMContentLoaded', () => {
  // Load all data from Supabase
  Promise.all([
    sb.from('accounts').select('*'),
    sb.from('notes').select('*'),
    sb.from('opportunities').select('*')
  ]).then(([accountsRes, notesRes, oppsRes]) => {
    if (notesRes.data) notesRes.data.forEach(n => { notesCache[n.account_id] = n.note; });
    if (oppsRes.data) oppsRes.data.forEach(o => { oppCache[o.account_id] = { active: o.active, url: o.url }; });
    document.getElementById('loading-pill').style.display = 'none';
    if (accountsRes.data && accountsRes.data.length > 0) {
      initMap(accountsRes.data);
    } else {
      document.getElementById('loading-pill').textContent = '⚠ Could not load accounts';
      document.getElementById('loading-pill').style.display = 'block';
    }
  }).catch(err => {
    console.error('Failed to load data:', err);
    document.getElementById('loading-pill').textContent = '⚠ Connection error';
    document.getElementById('loading-pill').style.display = 'block';
  });
});
