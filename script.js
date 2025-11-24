/* script.js — Bardo PM Dashboard
   Firestore v8 (cdn) expected. HTML initializes firebase + var db = firebase.firestore();
   Responsibilities:
   - Load/save milestones (CSV import via PapaParse)
   - Milestone resourcing (popup editor) -> compute quarterly resourcing
   - Weekly tasks saved per ISO week (Monday start) + weekly history snapshot
   - Weekly resourcing viewer (derived from weekly tasks) — independent of quarterly
   - Daily updates (today/yesterday) saved to Firestore

   NOTE: This file assumes PapaParse and firebase are loaded before this script
*/

// ------- Constants & state -------
const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = ["Allison","Christian","Cyril","Mike","Ryszard","SamL","SamW"];
const STORAGE_KEYS = { MILESTONES: "milestonesData", WEEKLY: "weeklyPlans", DAILY: "dailyLogs", RESOURCING: "resourcingData_v1" };
let milestonesData = { Q1: {}, Q4: {} };
let weeklyPlans = { Q1: {}, Q4: {} };
let dailyLogs = {};
let quarterlyResourcing = { Q1: {}, Q4: {} };

// ------- Firestore helpers (v8) -------
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

// ------- Week helper (Monday-start week key) -------
function getWeekKeyForDate(d = new Date()) {
  // compute ISO week with Monday start
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // 1..7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// ------- Milestones CSV loader -------
function loadMilestonesCSV() {
  if (typeof Papa === 'undefined') return;
  Papa.parse('milestones.csv', {
    download: true, header: true, skipEmptyLines: true,
    complete: async function(results) {
      // reset
      milestonesData = { Q1: {}, Q4: {} };
      categories.forEach(c => { milestonesData.Q1[c] = []; milestonesData.Q4[c] = []; });

      results.data.forEach(row => {
        if (!categories.includes(row.category)) return;
        const milestone = {
          id: row.id || `${row.title}-${Math.random().toString(36).slice(2,8)}`,
          title: row.title || '(untitled)',
          date: row.date || '',
          people: row.people || '',
          resourcing: row.resourcing || row.people || '', // allow a dedicated resourcing field
          progress: parseInt(row.progress) || 0
        };
        if (row.quarter === 'Q1') milestonesData.Q1[row.category].push(milestone);
        else milestonesData.Q4[row.category].push(milestone);
      });

      // persist and render
      try { await saveFS('dashboard/milestones', milestonesData); } catch(e){ /* ignore */ }
      saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);

      // compute quarterly resourcing from milestones
      computeQuarterlyFromMilestones(getCurrentQuarter());
      renderQuarterlyOverview(getCurrentQuarter());
    }
  });
}

// ------- Render Milestones (with popup editor for milestone resourcing) -------
function renderQuarterlyOverview(quarter) {
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
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id; const cat = btn.dataset.category; const q = btn.dataset.quarter;
        openMilestoneResourcingPopup(q, cat, id);
      });
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

function computeQuarterlyFromMilestones(quarter) {
  if (!quarterlyResourcing[quarter]) quarterlyResourcing[quarter] = {};
  categories.forEach(c => { if (!quarterlyResourcing[quarter][c]) quarterlyResourcing[quarter][c] = {}; people.forEach(p=> quarterlyResourcing[quarter][c][p]=0); });

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

  // clamp
  categories.forEach(category => { people.forEach(p => {
    quarterlyResourcing[quarter][category][p] = Math.max(0,Math.min(100,Math.round(quarterlyResourcing[quarter][category][p])));
  }); });

  // persist
  try { saveFS('dashboard/resourcing', quarterlyResourcing); } catch(e){ }
}

// ------- Milestone resourcing popup (Option B) -------
function openMilestoneResourcingPopup(quarter, category, milestoneId) {
  closeResourcingPopup();
  const mil = (milestonesData[quarter] && milestonesData[quarter][category]) ? milestonesData[quarter][category].find(x => x.id === milestoneId) : null;
  if (!mil) return alert('Milestone not found');

  const popup = document.createElement('div'); popup.className = 'res-edit-popup';
  let html = `<h4>Edit Resourcing — ${escapeHtml(mil.title)}</h4><div style="display:flex;flex-direction:column;gap:8px;">`;
  categories.forEach((cat,i)=>{}); // keep lint

  // render inputs for people
  people.forEach(p => {
    // find existing percent for person in mil.resourcing
    const allocs = parseAllocations(mil.resourcing || mil.people || '');
    const found = allocs.find(a=>a.person===p);
    const val = found ? found.percent : 0;
    html += `\
      <div style="display:flex;align-items:center;gap:8px;">\
        <div style="width:120px;font-weight:600">${escapeHtml(p)}</div>\
        <input type=number min=0 max=100 value="${val}" data-person="${escapeHtml(p)}" class="popup-num" style="width:80px;padding:6px;border-radius:6px;border:1px solid rgba(0,0,0,0.08)">\
      </div>`;
  });

  html += `</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">\
           <button class="cancel-res">Cancel</button>\
           <button class="save-res">Save</button>\
           </div>`;

  popup.innerHTML = html; document.body.appendChild(popup);

  // position near the category box header if possible
  const box = document.getElementById(`${category.toLowerCase()}-box`);
  if (box) {
    const rect = box.getBoundingClientRect();
    popup.style.left = Math.min(rect.left + window.scrollX + 10, window.innerWidth - 340) + 'px';
    popup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    popup.style.width = '320px';
  }

  popup.querySelector('.cancel-res').addEventListener('click', closeResourcingPopup);
  popup.querySelector('.save-res').addEventListener('click', async () => {
    // collect values
    const updated = [];
    popup.querySelectorAll('.popup-num').forEach(inp => {
      const person = inp.dataset.person;
      const pct = parseInt(inp.value) || 0;
      if (pct > 0) updated.push(`${person}:${pct}`);
    });

    // write back into milestone.resourcing as semicolon separated
    mil.resourcing = updated.join(';');

    // persist to Firestore: update milestones doc fully
    try {
      await saveFS('dashboard/milestones', milestonesData);
      saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);
    } catch(e) { console.warn('save milestone failed', e); }

    // recompute quarterly
    computeQuarterlyFromMilestones(quarter);
    renderQuarterlyResourcing(quarter);
    renderQuarterlyOverview(quarter);
    closeResourcingPopup();
  });
}

function closeResourcingPopup(){ const old = document.querySelector('.res-edit-popup'); if (old) old.remove(); }

// ------- Render quarterly resourcing grid (bars aggregated across categories per person in a row) -------
function renderQuarterlyResourcing(quarter) {
  const container = document.getElementById('resourcing-grid'); if (!container) return;
  ensureQuarterResourcing(quarter);
  const data = quarterlyResourcing[quarter] || {};

  let html = '<table class="resourcing-table"><thead><tr><th>Person</th>' + categories.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  people.forEach(person => {
    html += `<tr><td style="text-align:left;padding-left:10px;font-weight:600">${person}</td>`;
    categories.forEach((cat,i) => {
      const val = data[cat] && data[cat][person] ? data[cat][person] : 0;
      const paletteClass = `palette-${i+1}-bg`;
      html += `<td class="res-cell"><div class="res-bar" style="width:100%;background:rgba(0,0,0,0.04);padding:2px;border-radius:6px;">`;
      if (val>0) html += `<div class="res-bar-segment ${paletteClass}" data-person="${person}" data-category="${cat}" style="width:${val}%;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;">${val}%</div>`;
      else html += `<div class="res-bar-segment empty-segment" data-person="${person}" data-category="${cat}" style="width:100%;height:22px;background:#f2f2f2;color:#666;display:flex;align-items:center;justify-content:center;cursor:pointer">Set Resourcing</div>`;
      html += `</div></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;

  // click to edit any segment (open any milestone editor for that category) — choose first milestone in that category as entry point
  container.querySelectorAll('.res-bar-segment, .empty-segment').forEach(seg => {
    seg.addEventListener('click', (e)=>{
      e.stopPropagation();
      const person = seg.dataset.person; const category = seg.dataset.category; const quarterCur = getCurrentQuarter();
      // open a general category-level popup to edit all milestones in that category? For now open popup for first milestone in that category
      const firstMil = (milestonesData[quarterCur] && milestonesData[quarterCur][category] && milestonesData[quarterCur][category][0]);
      if (firstMil) openMilestoneResourcingPopup(quarterCur, category, firstMil.id);
      else alert('No milestones in this category to edit. Add a milestone first.');
    });
  });
}

function ensureQuarterResourcing(quarter) { if (!quarterlyResourcing[quarter]) quarterlyResourcing[quarter] = {}; categories.forEach(c=>{ if(!quarterlyResourcing[quarter][c]) quarterlyResourcing[quarter][c]={}; people.forEach(p=>{ if(quarterlyResourcing[quarter][c][p]===undefined) quarterlyResourcing[quarter][c][p]=0; }); }); }

// ------- Weekly tasks and history (weekKey = Monday-start) -------
weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q1:{}, Q4:{} });

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
  try {
    await saveFS('dashboard/weeklyPlans', weeklyPlans);
  } catch(e){ console.warn('save weekly main failed', e); }
  // snapshot under history/weeks doc field
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
      if (!weeklyPlans[quarter]) weeklyPlans[quarter]={}; if (!weeklyPlans[quarter][weekKey]) weeklyPlans[quarter][weekKey] = {}; if (!weeklyPlans[quarter][weekKey][category]) weeklyPlans[quarter][weekKey][category]=[];
      weeklyPlans[quarter][weekKey][category].push(taskObj);
      saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans);
      await saveWeeklyAndSnapshot(quarter, weekKey);
      titleInput.value=''; subtasksInput.value=''; percentInput.value='';
      loadWeeklyTasks(quarter, weekKey); renderWeeklyResourcing(quarter, weekKey);
    };
  });
}

// ------- Weekly resourcing UI (derived from weekly tasks, independent of quarterly) -------
function renderWeeklyResourcing(quarter, weekKey) {
  if (!weekKey) weekKey = getWeekKeyForDate(new Date());
  const container = document.getElementById('weekly-resourcing-grid'); if (!container) return;
  const data = weeklyPlans[quarter]?.[weekKey] || {};
  const totals = {}; people.forEach(p => totals[p] = {});
  categories.forEach(cat => { const list = data[cat]||[]; list.forEach(t=>{ if (!totals[t.person][cat]) totals[t.person][cat]=0; totals[t.person][cat]+=t.percent; }); });
  let html = '<table class="weekly-resourcing-table"><thead><tr><th>Person</th><th>Weekly Allocation</th></tr></thead><tbody>';
  people.forEach(person => { let segments=''; categories.forEach((cat,i)=>{ const v = totals[person][cat]||0; if(v>0) segments += `<div class="weekly-resourcing-segment palette-${i+1}-bg" style="width:${v}%;">${v>10?v+'%':''}</div>`; }); const bar = segments||`<div class="weekly-resourcing-segment empty-segment" style="width:100%;background:#eee;color:#666;text-align:center;">0%</div>`; html += `<tr><td style="text-align:left;padding-left:10px">${person}</td><td><div class="weekly-resourcing-row">${bar}</div></td></tr>`; }); html += '</tbody></table>'; container.innerHTML = html; }

// ------- Daily updates (persist to FS) -------
function isoDate(offset=0){ const d=new Date(); d.setDate(d.getDate()+offset); return d.toISOString().slice(0,10); }

dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
async function saveDailyLogsFS(){ try{ await saveFS('dashboard/dailyLogs', dailyLogs); } catch(e){ console.warn('daily save failed', e);} }

function renderDailyBoxes(){ const container = document.getElementById('daily-row'); if(!container) return; container.innerHTML=''; const todayKey=isoDate(0); const yesterdayKey=isoDate(-1); if(!dailyLogs[todayKey]) dailyLogs[todayKey]={}; people.forEach(name=>{ const yesterdayUpdate = (dailyLogs[yesterdayKey] && dailyLogs[yesterdayKey][name]?.today) || ''; const todayUpdate = (dailyLogs[todayKey] && dailyLogs[todayKey][name]?.today) || ''; const box = document.createElement('div'); box.className='person-box'; box.innerHTML = ` <div class="person-header"><h4>${name}</h4><div class="muted small">${todayKey}</div></div><label>Yesterday's Update</label><div class="yesterday">${escapeHtml(yesterdayUpdate)}</div><label>Today's Update</label><textarea class="today" data-name="${name}" placeholder="Write today's update...">${escapeHtml(todayUpdate)}</textarea>`; container.appendChild(box); }); container.querySelectorAll('.today').forEach(el=>{ el.addEventListener('input', throttle(async (e)=>{ const name=e.target.dataset.name; const val=e.target.value; const tKey=isoDate(0); if(!dailyLogs[tKey]) dailyLogs[tKey]={}; if(!dailyLogs[tKey][name]) dailyLogs[tKey][name]={}; dailyLogs[tKey][name].today=val; saveToStorage(STORAGE_KEYS.DAILY, dailyLogs); await saveDailyLogsFS(); },600)); }); }

// ------- Utility & listeners -------
function escapeHtml(str){ if(!str) return ''; return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function throttle(fn, wait){ let last=0, scheduled=null; return function(...args){ const now=Date.now(); if(now-last>=wait){ last=now; fn.apply(this,args); } else { if(scheduled) clearTimeout(scheduled); scheduled=setTimeout(()=>{ last=Date.now(); fn.apply(this,args); scheduled=null; }, wait-(now-last)); } } }

// milestone progress input listener
document.addEventListener('input', async (e)=>{ if(e.target.classList.contains('progress-input')){ const quarter=e.target.dataset.quarter; const category=e.target.dataset.category; const id=e.target.dataset.id; const newValue=parseInt(e.target.value)||0; const items = milestonesData[quarter]?.[category] || []; const item = items.find(x=>x.id===id); if(item){ item.progress = newValue; saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData); try{ await saveFS('dashboard/milestones', milestonesData); } catch(e){} } } });

// quarter switch
const quarterSelect = document.getElementById('quarter-select'); if(quarterSelect) quarterSelect.addEventListener('change', async ()=>{ const q = getCurrentQuarter(); // hydrate FS for freshness
  try{ const fsMilestones = await loadFS('dashboard/milestones', {Q1:{},Q4:{}}); if(fsMilestones && fsMilestones[q]) milestonesData[q] = fsMilestones[q]; }catch(e){}
  try{ const fsWeekly = await loadFS('dashboard/weeklyPlans', {Q1:{},Q4:{}}); if(fsWeekly && fsWeekly[q]) weeklyPlans[q]=fsWeekly[q]; }catch(e){}
  try{ const fsRes = await loadFS('dashboard/resourcing', {Q1:{},Q4:{}}); if(fsRes && fsRes[q]) quarterlyResourcing[q]=fsRes[q]; }catch(e){}
  renderQuarterlyOverview(q); renderQuarterlyResourcing(q); loadWeeklyTasks(q); renderWeeklyResourcing(q); renderDailyBoxes(); });

// global click to close popups
document.addEventListener('click',(e)=>{ if(e.target.closest('.res-edit-popup')) return; closeResourcingPopup(); });

// ------- Initialization IIFE -------
(async function initializeDashboard(){
  // load local caches first
  try{ milestonesData = loadFromStorage(STORAGE_KEYS.MILESTONES, milestonesData) || milestonesData; weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, weeklyPlans) || weeklyPlans; dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, dailyLogs) || dailyLogs; quarterlyResourcing = loadFromStorage(STORAGE_KEYS.RESOURCING, quarterlyResourcing) || quarterlyResourcing; }catch(e){}

  // attempt to hydrate from Firestore (best-effort)
  (async ()=>{
    try{ const ms = await loadFS('dashboard/milestones',{Q1:{},Q4:{}}); if(ms && Object.keys(ms).length) { milestonesData = ms; saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData); } }catch(e){}
    try{ const wp = await loadFS('dashboard/weeklyPlans',{Q1:{},Q4:{}}); if(wp && Object.keys(wp).length){ weeklyPlans = wp; saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans); } }catch(e){}
    try{ const dl = await loadFS('dashboard/dailyLogs',{}); if(dl && Object.keys(dl).length){ dailyLogs = dl; saveToStorage(STORAGE_KEYS.DAILY, dailyLogs); } }catch(e){}
    try{ const rs = await loadFS('dashboard/resourcing',{Q1:{},Q4:{}}); if(rs && Object.keys(rs).length){ quarterlyResourcing = rs; saveToStorage(STORAGE_KEYS.RESOURCING, quarterlyResourcing); } }catch(e){}

    // compute quarterly from milestones if present
    try{ computeQuarterlyFromMilestones(getCurrentQuarter()); }catch(e){}

    const q = getCurrentQuarter(); renderQuarterlyOverview(q); renderQuarterlyResourcing(q); loadWeeklyTasks(q); renderWeeklyResourcing(q); initWeeklyTaskInputs(); renderDailyBoxes();
  })();

  // immediate render for snappiness
  const q = getCurrentQuarter(); renderQuarterlyOverview(q); renderQuarterlyResourcing(q); loadWeeklyTasks(q); renderWeeklyResourcing(q); initWeeklyTaskInputs(); renderDailyBoxes();

  // optional CSV import
  loadMilestonesCSV();

})();
