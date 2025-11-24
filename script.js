/* script_clean.js — Cleaned Bardo PM Dashboard (Option 2: CSV is sole source for milestones)
   - Dynamic quarters (auto-detect)
   - Milestones load ONLY from CSV (no Firestore milestone read)
   - Firestore used for saving updates (progress, weekly snapshots, resourcing)
   - CSV import guarded to run only once
   - No duplicate declarations, no duplicate loads
   - Quarterly resourcing rendered as per weekly style (one row per person)
*/

// ------- Constants & state -------
const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = ["Allison","Christian","Cyril","Mike","Ryszard","SamL","SamW"];
const STORAGE_KEYS = { MILESTONES: "milestonesData", WEEKLY: "weeklyPlans", DAILY: "dailyLogs", RESOURCING: "resourcingData_v1" };

// state (keyed by quarter strings such as "Q425")
let csvLoaded = false;
let milestonesData = loadFromStorage(STORAGE_KEYS.MILESTONES, {}) || {};
let weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, {}) || {};
let dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {}) || {};
let quarterlyResourcing = loadFromStorage(STORAGE_KEYS.RESOURCING, {}) || {};

// ------- Firestore helpers (v8 expected to be initialized in HTML) -------
async function loadFS(path, fallback = {}) {
  try {
    const ref = db.doc(path);
    const snap = await ref.get();
    return snap.exists ? snap.data() : fallback;
  } catch (err) {
    console.warn('loadFS error', path, err);
    return fallback;
  }
}

async function saveFS(path, data) {
  try {
    const ref = db.doc(path);
    await ref.set(data, { merge: true });
    return true;
  } catch (err) {
    console.error('saveFS error', path, err);
    throw err;
  }
}

function saveToStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function loadFromStorage(key, fallback) { try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; } catch(e){ return fallback; } }

function getCurrentQuarter() {
  const el = document.getElementById("quarter-select");
  return el ? el.value : null;
}

// ------- Week helper (Monday-start week key) -------
function getWeekKeyForDate(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // 1..7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// ------- Utility helpers -------
function el(id) { return document.getElementById(id); }
function escapeHtml(str) { if(!str && str !== 0) return ''; return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function throttle(fn, wait){ let last=0, scheduled=null; return function(...args){ const now=Date.now(); if(now-last>=wait){ last=now; fn.apply(this,args); } else { if(scheduled) clearTimeout(scheduled); scheduled=setTimeout(()=>{ last=Date.now(); fn.apply(this,args); scheduled=null; }, wait-(now-last)); } } }

// ------- Quarter key utilities -------
const QUARTER_REGEX = /^Q\d{3,4}$/;   // matches Q425, Q126, Q227 etc.
function collectQuarterKeys() {
  const keys = new Set();
  const addFiltered = obj => {
    Object.keys(obj || {}).forEach(k => {
      if (QUARTER_REGEX.test(k)) keys.add(k);
    });
  };
  addFiltered(milestonesData);
  addFiltered(weeklyPlans);
  addFiltered(quarterlyResourcing);
  if (keys.size === 0) {
    ["Q425","Q126","Q226","Q326","Q426"].forEach(k => keys.add(k));
  }
  return Array.from(keys).sort();
}

function populateQuarterSelect(selected) {
  const sel = el("quarter-select");
  if (!sel) return;
  const keys = collectQuarterKeys();
  sel.innerHTML = "";
  keys.forEach(k => {
    const opt = document.createElement('option'); opt.value = k; opt.textContent = k;
    sel.appendChild(opt);
  });
  if (selected && keys.includes(selected)) sel.value = selected;
  else sel.value = keys[keys.length - 1];
}

// ------- Milestones CSV loader (CSV is sole source of milestones) -------
function loadMilestonesCSV(csvPath = 'milestones.csv') {
  if (csvLoaded) return;
  csvLoaded = true;
  if (typeof Papa === 'undefined') {
    console.warn('PapaParse required but not found.');
    return;
  }

  Papa.parse(csvPath, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      if (!results || !results.data) {
        console.warn('No CSV data parsed', results);
        return;
      }

      // build fresh structure from CSV (CSV is the source of truth for milestones)
      const fresh = {};
      results.data.forEach(row => {
        const q = String(row.quarter || '').trim();
        const category = String(row.category || '').trim();
        if (!q || !category) return;
        if (!categories.includes(category)) return;

        if (!fresh[q]) {
          fresh[q] = {};
          categories.forEach(c => fresh[q][c] = []);
        }
        if (!fresh[q][category]) fresh[q][category] = [];

        const milestone = {
          id: row.id || `${(row.title||'untitled').slice(0,20)}-${Math.random().toString(36).slice(2,8)}`,
          title: row.title || '(untitled)',
          date: row.date || '',
          people: row.people || '',
          resourcing: row.resourcing || row.people || '',
          progress: parseInt(row.progress) || 0
        };

        // avoid duplicates in CSV parse
        if (!fresh[q][category].some(m => m.id === milestone.id)) {
          fresh[q][category].push(milestone);
        }
      });

      // replace in-memory milestones with CSV-derived fresh data
      milestonesData = fresh;
      saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);

      // ensure quarter resourcing container exists for any new quarters
      Object.keys(milestonesData).forEach(q => { if (!quarterlyResourcing[q]) quarterlyResourcing[q] = {}; });

      // compute for current quarter and render
      const cur = getCurrentQuarter() || Object.keys(milestonesData)[0];
      computeQuarterlyFromMilestones(cur);
      populateQuarterSelect(cur);
      renderQuarterlyOverview(cur);
      renderQuarterlyResourcing(cur);
    },
    error: function(err){ console.error('PapaParse error', err); }
  });
}

// ------- Render Milestones -------
function renderQuarterlyOverview(quarter) {
  if (!quarter) return;
  if (!milestonesData[quarter]) {
    milestonesData[quarter] = {};
    categories.forEach(c => milestonesData[quarter][c] = []);
  }

  categories.forEach(category => {
    const box = document.querySelector(`#${category.toLowerCase()}-box .milestone-entries`);
    if (!box) return;
    box.innerHTML = '';
    const items = milestonesData[quarter]?.[category] || [];
    items.forEach(m => {
      const entry = document.createElement('div');
      entry.className = 'milestone-entry';
      entry.innerHTML = `\
        <strong>${escapeHtml(m.title)}</strong><br>\
        <em>${escapeHtml(m.date || '')}</em><br>\
        Personnel: ${escapeHtml(m.people || '')}<br>\
        Progress: <input type="number" min="0" max="100" value="${m.progress}" data-id="${m.id}" data-quarter="${quarter}" data-category="${category}" class="progress-input"> %\
        <div style="margin-top:6px"><button class="edit-resourcing" data-id="${m.id}" data-category="${category}" data-quarter="${quarter}">Edit Resourcing</button></div>\
      `;
      box.appendChild(entry);
    });

    // attach click listeners for edit buttons
    box.querySelectorAll('.edit-resourcing').forEach(btn => {
      btn.removeEventListener('click', btn._resListener);
      const handler = (e) => {
        const id = btn.dataset.id; const cat = btn.dataset.category; const q = btn.dataset.quarter;
        openMilestoneResourcingPopup(q, cat, id);
      };
      btn._resListener = handler;
      btn.addEventListener('click', handler);
    });
  });
}

// ------- Milestone resourcing parsing and computing -------
function parseAllocations(raw) {
  if (!raw) return [];
  const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
  const usesPct = parts.some(p => p.includes(':'));
  if (usesPct) {
    return parts.map(p => { const [name,pct] = p.split(':').map(x=>x.trim()); return { person:name, percent: Math.max(0,Math.min(100,parseInt(pct)||0)) }; });
  } else {
    const num = parts.length || 0;
    if (num === 0) return [];
    const per = Math.floor(100/num);
    return parts.map(p => ({ person:p, percent:per }));
  }
}

function ensureQuarterResourcing(quarter) {
  if (!quarterlyResourcing[quarter]) quarterlyResourcing[quarter] = {};
  categories.forEach(c => {
    if (!quarterlyResourcing[quarter][c]) quarterlyResourcing[quarter][c] = {};
    people.forEach(p => {
      if (quarterlyResourcing[quarter][c][p] === undefined) quarterlyResourcing[quarter][c][p] = 0;
    });
  });
}

function computeQuarterlyFromMilestones(quarter) {
  if (!milestonesData[quarter]) milestonesData[quarter] = {};
  if (!quarterlyResourcing[quarter]) quarterlyResourcing[quarter] = {};
  categories.forEach(c => { if (!quarterlyResourcing[quarter][c]) quarterlyResourcing[quarter][c] = {}; people.forEach(p=> quarterlyResourcing[quarter][c][p]=quarterlyResourcing[quarter][c][p]||0); });

  // zero out for this quarter before recomputing
  categories.forEach(category => { people.forEach(p => { quarterlyResourcing[quarter][category][p] = 0; }); });

  categories.forEach(category => {
    const items = milestonesData[quarter]?.[category] || [];
    items.forEach(m => {
      const raw = m.resourcing || m.people || '';
      const allocs = parseAllocations(raw);
      allocs.forEach(a => {
        if (!quarterlyResourcing[quarter][category][a.person]) quarterlyResourcing[quarter][category][a.person] = 0;
        quarterlyResourcing[quarter][category][a.person] += a.percent;
      });
    });
  });

  // clamp and normalize
  categories.forEach(category => { people.forEach(p => {
    quarterlyResourcing[quarter][category][p] = Math.max(0,Math.min(100,Math.round(quarterlyResourcing[quarter][category][p] || 0)));
  }); });

  // persist resourcing (keep whole object)
  try { saveFS('dashboard/resourcing', quarterlyResourcing); } catch(e){}
  saveToStorage(STORAGE_KEYS.RESOURCING, quarterlyResourcing);
}

// ------- Milestone resourcing popup -------
function openMilestoneResourcingPopup(quarter, category, milestoneId) {
  closeResourcingPopup();

  const mil = milestonesData[quarter]?.[category]?.find(x => x.id === milestoneId);
  if (!mil) {
    console.error("Milestone not found:", quarter, category, milestoneId);
    return;
  }

  const popup = document.createElement('div');
  popup.className = 'res-edit-popup-fixed';

  let html = `
    <div class="popup-inner">
      <h3>Edit Resourcing — ${escapeHtml(mil.title)}</h3>
      <div class="popup-people">
  `;

  people.forEach(person => {
    const allocs = parseAllocations(mil.resourcing || mil.people || '');
    const found = allocs.find(a => a.person === person);
    const val = found ? found.percent : 0;

    html += `
      <div class="popup-row">
        <span class="popup-person">${person}</span>
        <input type="number" data-person="${person}" min="0" max="100" value="${val}">
      </div>
    `;
  });

  html += `
      </div>
      <div class="popup-buttons">
        <button class="popup-cancel">Cancel</button>
        <button class="popup-save">Save</button>
      </div>
    </div>
  `;

  popup.innerHTML = html;
  document.body.appendChild(popup);

  // --- Button logic ---
  popup.querySelector('.popup-cancel').onclick = closeResourcingPopup;

  popup.querySelector('.popup-save').onclick = async () => {
    const updated = [];

    popup.querySelectorAll('input[data-person]').forEach(input => {
      const person = input.dataset.person;
      const pct = parseInt(input.value) || 0;
      if (pct > 0) updated.push(`${person}:${pct}`);
    });

    mil.resourcing = updated.join(';');
    saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);
    await saveFS("dashboard/milestones", milestonesData);

    computeQuarterlyFromMilestones(quarter);
    renderQuarterlyResourcing(quarter);
    renderQuarterlyOverview(quarter);

    closeResourcingPopup();
  };
}


function closeResourcingPopup() {
  const old1 = document.querySelector('.res-edit-popup');
  const old2 = document.querySelector('.res-edit-popup-fixed');
  if (old1) old1.remove();
  if (old2) old2.remove();
}


// ------- Render quarterly resourcing (one row per person, stacked segments) -------
function renderQuarterlyResourcing(quarter) {
  if (!quarter) return;
  ensureQuarterResourcing(quarter);
  const container = document.getElementById('resourcing-grid'); if (!container) return;
  const data = quarterlyResourcing[quarter] || {};

  let html = '<table class="quarterly-resourcing-table"><thead><tr><th>Person</th><th>Quarterly Allocation</th></tr></thead><tbody>';
  people.forEach(person => {
    let segments = '';
    categories.forEach((cat,i) => {
      const val = data?.[cat]?.[person] || 0;
      if (val > 0) {
        segments += `<div class="quarter-segment palette-${i+1}-bg" data-person="${person}" data-category="${cat}" style="width:${val}%">${val>10?val+'%':''}</div>`;
      }
    });
    if (!segments) segments = `<div class="quarter-segment empty" style="width:100%">0%</div>`;
    html += `<tr><td style="text-align:left;padding-left:10px;font-weight:600">${person}</td><td><div class="quarter-bar">${segments}</div></td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.quarter-segment').forEach(seg => {
    seg.addEventListener('click', (e)=>{
      const cat = seg.dataset.category;
      const q = getCurrentQuarter();
      const first = milestonesData[q]?.[cat]?.[0];
      if (first) openMilestoneResourcingPopup(q, cat, first.id);
    });
  });
}

// ------- Weekly tasks and history (weekKey = Monday-start) -------
function loadWeeklyTasks(quarter, weekKey) {
  if (!weekKey) weekKey = getWeekKeyForDate(new Date());
  categories.forEach(category => {
    const list = document.querySelector(`#weekly-${category.toLowerCase()} .weekly-entries`);
    if (!list) return; list.innerHTML = '';
    const tasks = weeklyPlans[quarter]?.[weekKey]?.[category] || [];
    tasks.forEach(task => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${escapeHtml(task.title)}</strong> — ${escapeHtml(task.person)} (${task.percent}%)<ul style="margin:4px 0 0 14px;padding:0;">${(task.subtasks||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>`;
      list.appendChild(li);
    });
  });
}

async function saveWeeklyAndSnapshot(quarter, weekKey) {
  try { await saveFS('dashboard/weeklyPlans', weeklyPlans); } catch(e){ console.warn('save weekly main failed', e); }
  const historyPath = 'dashboard/history/weeks';
  const existing = await loadFS(historyPath, {});
  existing[weekKey] = { ts: Date.now(), quarter, data: weeklyPlans[quarter]?.[weekKey] || {} };
  await saveFS(historyPath, existing);
}

function initWeeklyTaskInputs() {
  categories.forEach(category => {
    const box = document.getElementById(`weekly-${category.toLowerCase()}`);
    if (!box) return;
    const titleInput = box.querySelector('.new-task-title');
    const subtasksInput = box.querySelector('.new-task-subtasks');
    let personInput = box.querySelector('.new-task-person');
    let percentInput = box.querySelector('.new-task-percent');
    if (!personInput) {
      personInput = document.createElement('select'); personInput.className='new-task-person'; people.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; personInput.appendChild(o); }); subtasksInput.insertAdjacentElement('afterend', personInput);
    }
    if (!percentInput) {
      percentInput = document.createElement('input'); percentInput.type='number'; percentInput.className='new-task-percent'; percentInput.placeholder='%'; percentInput.min=0; percentInput.max=100; personInput.insertAdjacentElement('afterend', percentInput);
    }
    const addBtn = box.querySelector('.add-task-btn');
    addBtn.onclick = async () => {
      const quarter = getCurrentQuarter(); const weekKey = getWeekKeyForDate(new Date());
      const title = titleInput.value.trim(); const subtasks = subtasksInput.value.trim(); const person = personInput.value; const percent = parseInt(percentInput.value)||0;
      if (!title) return; const taskObj = { title, subtasks: subtasks ? subtasks.split(';').map(s=>s.trim()):[], person, percent };
      if (!weeklyPlans[quarter]) weeklyPlans[quarter]={};
      if (!weeklyPlans[quarter][weekKey]) weeklyPlans[quarter][weekKey] = {};
      if (!weeklyPlans[quarter][weekKey][category]) weeklyPlans[quarter][weekKey][category]=[];
      weeklyPlans[quarter][weekKey][category].push(taskObj);
      saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans);
      await saveWeeklyAndSnapshot(quarter, weekKey);
      titleInput.value=''; subtasksInput.value=''; percentInput.value='';
      loadWeeklyTasks(quarter, weekKey); renderWeeklyResourcing(quarter, weekKey);
    };
  });
}

// ------- Weekly resourcing UI -------
function renderWeeklyResourcing(quarter, weekKey) {
  if (!weekKey) weekKey = getWeekKeyForDate(new Date());
  const container = document.getElementById('weekly-resourcing-grid'); if (!container) return;
  const data = weeklyPlans[quarter]?.[weekKey] || {};
  const totals = {}; people.forEach(p => totals[p] = {});
  categories.forEach(cat => { const list = data[cat]||[]; list.forEach(t=>{ if (!totals[t.person][cat]) totals[t.person][cat]=0; totals[t.person][cat]+=t.percent; }); });
  let html = '<table class="weekly-resourcing-table"><thead><tr><th>Person</th><th>Weekly Allocation</th></tr></thead><tbody>';
  people.forEach(person => { let segments=''; categories.forEach((cat,i)=>{ const v = totals[person][cat]||0; if(v>0) segments += `<div class="weekly-resourcing-segment palette-${i+1}-bg" style="width:${v}%;">${v>10?v+'%':''}</div>`; }); const bar = segments||`<div class="weekly-resourcing-segment empty-segment" style="width:100%;background:#eee;color:#666;text-align:center;">0%</div>`; html += `<tr><td style="text-align:left;padding-left:10px">${person}</td><td><div class="weekly-resourcing-row">${bar}</div></td></tr>`; }); html += '</tbody></table>'; container.innerHTML = html; }

// ------- Daily updates (persist to FS) -------
dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
async function saveDailyLogsFS(){ try{ await saveFS('dashboard/dailyLogs', dailyLogs); } catch(e){ console.warn('daily save failed', e);} }

function renderDailyBoxes(){ const container = document.getElementById('daily-row'); if(!container) return; container.innerHTML=''; const todayKey=isoDate(0); const yesterdayKey=isoDate(-1); if(!dailyLogs[todayKey]) dailyLogs[todayKey]={}; people.forEach(name=>{ const yesterdayUpdate = (dailyLogs[yesterdayKey] && dailyLogs[yesterdayKey][name]?.today) || ''; const todayUpdate = (dailyLogs[todayKey] && dailyLogs[todayKey][name]?.today) || ''; const box = document.createElement('div'); box.className = 'person-box'; box.innerHTML = ` <div class="person-header"><h4>${name}</h4><div class="muted small">${todayKey}</div></div><label>Yesterday's Update</label><div class="yesterday">${escapeHtml(yesterdayUpdate)}</div><label>Today's Update</label><textarea class="today" data-name=\"${name}\" placeholder="Write today's update...">${escapeHtml(todayUpdate)}</textarea>`; container.appendChild(box); }); container.querySelectorAll('.today').forEach(el=>{ el.addEventListener('input', throttle(async (e)=>{ const name=e.target.dataset.name; const val=e.target.value; const tKey=isoDate(0); if(!dailyLogs[tKey]) dailyLogs[tKey]={}; if(!dailyLogs[tKey][name]) dailyLogs[tKey][name]={}; dailyLogs[tKey][name].today=val; saveToStorage(STORAGE_KEYS.DAILY, dailyLogs); await saveDailyLogsFS(); },600)); }); }

function isoDate(offset=0){ const d=new Date(); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10); }

// ------- Listeners & Progress save -------
document.addEventListener('input', async (e)=>{ if(e.target.classList.contains('progress-input')){ const quarter=e.target.dataset.quarter; const category=e.target.dataset.category; const id=e.target.dataset.id; const newValue=parseInt(e.target.value)||0; const items = (milestonesData[quarter] && milestonesData[quarter][category]) ? milestonesData[quarter][category] : []; const item = items.find(x=>x.id===id); if(item){ item.progress = newValue; saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData); try{ await saveFS('dashboard/milestones', milestonesData); } catch(e){} } } });

// quarter select handling
const quarterSelectEl = document.getElementById('quarter-select');
if (quarterSelectEl) {
  quarterSelectEl.addEventListener('change', async ()=>{
    const q = getCurrentQuarter();
    // hydrate weekly/resourcing/daily for this quarter (but DO NOT read milestones from Firestore)
    try { const wp = await loadFS('dashboard/weeklyPlans', {}); if (wp && wp[q]) { weeklyPlans[q] = wp[q]; saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans); } } catch(e){}
    try { const rs = await loadFS('dashboard/resourcing', {}); if (rs && rs[q]) { quarterlyResourcing[q] = rs[q]; saveToStorage(STORAGE_KEYS.RESOURCING, quarterlyResourcing); } } catch(e){}
    try { const dl = await loadFS('dashboard/dailyLogs', {}); if (dl && dl[q]) { dailyLogs = Object.assign({}, dailyLogs, dl); saveToStorage(STORAGE_KEYS.DAILY, dailyLogs); } } catch(e){}

    // render new quarter
    renderQuarterlyOverview(q); renderQuarterlyResourcing(q); loadWeeklyTasks(q); renderWeeklyResourcing(q); renderDailyBoxes();
  });
}

// global click to close popups
document.addEventListener('click', (e) => {
  // allow clicks inside either popup style
  if (e.target.closest('.res-edit-popup') || e.target.closest('.res-edit-popup-fixed')) {
    return;
  }
  closeResourcingPopup();
});


// ------- Initialization IIFE -------
(async function initializeDashboard(){
  // hydrate non-milestone data from Firestore (best-effort)
  try{ const wp = await loadFS('dashboard/weeklyPlans', {}); if (wp && Object.keys(wp).length) { weeklyPlans = Object.assign({}, wp, weeklyPlans); saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans); } } catch(e){}
  try{ const dl = await loadFS('dashboard/dailyLogs', {}); if (dl && Object.keys(dl).length) { dailyLogs = Object.assign({}, dl, dailyLogs); saveToStorage(STORAGE_KEYS.DAILY, dailyLogs); } } catch(e){}
  try{ const rs = await loadFS('dashboard/resourcing', {}); if (rs && Object.keys(rs).length) { quarterlyResourcing = Object.assign({}, rs, quarterlyResourcing); saveToStorage(STORAGE_KEYS.RESOURCING, quarterlyResourcing); } } catch(e){}

  // populate select from combined data
  populateQuarterSelect();

  // initial quarter
  const q = getCurrentQuarter() || (collectQuarterKeys()[0]);

  // render initial UI (milestones will come from CSV)
  renderQuarterlyOverview(q);
  renderQuarterlyResourcing(q);
  loadWeeklyTasks(q);
  renderWeeklyResourcing(q);
  initWeeklyTaskInputs();
  renderDailyBoxes();

  // CSV import as sole milestones source (merge into in-memory and localStorage)
  loadMilestonesCSV('milestones.csv');
})();
