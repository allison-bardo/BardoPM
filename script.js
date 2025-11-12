// Main dashboard script with inline editing, Monday-based weeks, resourcing grid, history support
const categories = ["Materials","Fabrication","Durability","ScaleUp","Operations"];
const people = ["Allison","Christian","Cyril","Mike","Ryszard","SamL","SamW"];

const STORAGE_KEYS = {
  MILESTONES: 'milestonesData_v1',
  WEEKLY: 'weeklyPlans_v1',
  DAILY: 'dailyLogs_v1',
  RESOURCING: 'resourcing_v1'
};

// Helpers
function saveToStorage(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
function loadFromStorage(key, fallback){ const d = localStorage.getItem(key); return d?JSON.parse(d):fallback; }

function getCurrentQuarter(){ return document.getElementById('quarter-select').value; }

// Monday of week helper (ISO yyyy-mm-dd)
function getMonday(date = new Date()){
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun - 6 Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0,10);
}

// Cache-busted CSV loader
function loadMilestonesCSV(){
  if (typeof Papa === 'undefined') return;
  Papa.parse(`milestones.csv?nocache=${Date.now()}`, { download:true, header:true, skipEmptyLines:true,
    complete(results){
      const md = { Q4:{}, Q1:{} };
      categories.forEach(c=>{ md.Q4[c]=[]; md.Q1[c]=[]; });
      results.data.forEach(row=>{
        if(!categories.includes(row.category)) return;
        const m = { id: row.id, title: row.title, date: row.date, people: row.people, progress: parseInt(row.progress)||0 };
        if(row.quarter === 'Q1') md.Q1[row.category].push(m); else md.Q4[row.category].push(m);
      });
      saveToStorage(STORAGE_KEYS.MILESTONES, md);
      renderQuarterlyOverview(getCurrentQuarter());
    }
  });
}

// Render milestone boxes
function renderQuarterlyOverview(quarter){
  const container = document.getElementById('milestones');
  container.innerHTML = '';
  const md = loadFromStorage(STORAGE_KEYS.MILESTONES, {Q4:{},Q1:{}});
  categories.forEach(cat=>{
    const box = document.createElement('div'); box.className='milestone-box'; box.id = `${cat.toLowerCase()}-box`;
    box.innerHTML = `<h3>${cat}</h3><div class="lead">Lead: ${cat === 'Materials' ? 'Allison' : (cat==='Fabrication'?'Christian':(cat==='Durability'?'Cyril':(cat==='ScaleUp'?'Ryszard':'SamW')))}</div><div class="milestone-entries"></div>`;
    const entries = box.querySelector('.milestone-entries');
    const items = md[quarter]?.[cat]||[];
    items.forEach(m=>{
      const div = document.createElement('div'); div.className='milestone-entry';
      div.innerHTML = `<strong>${m.title}</strong><div class="muted small">Personnel: ${m.people||'—'} • ${m.date||'—'}</div>
        Progress: <input type="number" min="0" max="100" value="${m.progress}" data-id="${m.id}" data-quarter="${quarter}" class="progress-input"> %`;
      entries.appendChild(div);
    });
    container.appendChild(box);
  });
  // render the quarterly resourcing grid after boxes
  renderQuarterlyResourcing(quarter);
}

// Quarterly resourcing grid
function renderQuarterlyResourcing(quarter){
  const container = document.getElementById('resourcing-grid');
  if(!container) return;
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const data = all[quarter] || {};
  let html = '<table class="resourcing-table"><thead><tr><th>Person</th>' + categories.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  people.forEach(p=>{
    html += `<tr><td>${p}</td>`;
    categories.forEach(c=>{
      const v = (data[c] && data[c][p] !== undefined) ? data[c][p] : '';
      html += `<td><input class="res-input" data-person="${p}" data-category="${c}" type="number" min="0" max="100" value="${v}"></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Save all resourcing handler
function saveAllResourcing(){
  const quarter = getCurrentQuarter();
  const inputs = document.querySelectorAll('.res-input');
  const out = {};
  inputs.forEach(inp=>{
    const p = inp.dataset.person, c = inp.dataset.category;
    const v = parseInt(inp.value);
    if(!out[c]) out[c]={};
    if(!isNaN(v)) out[c][p]=v;
  });
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  all[quarter] = out;
  saveToStorage(STORAGE_KEYS.RESOURCING, all);
  alert('Quarterly resourcing saved for '+quarter);
}

// --- Weekly tasks and week-key handling ---
function getWeekKey(date = new Date()){ return getMonday(date); } // monday ISO

// render weekly columns
function populateWeeklyColumns(){ populatePersonSelectors(); }

// load weekly tasks for quarter & weekKey
function loadWeeklyTasks(quarter, weekKey = getWeekKey()){
  const weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, {Q4:{},Q1:{}});
  categories.forEach(cat=>{
    const list = document.querySelector(`#weekly-${cat.toLowerCase()} .weekly-entries`);
    if(!list) return;
    list.innerHTML='';
    const tasks = weeklyPlans[quarter]?.[weekKey]?.[cat] || [];
    tasks.forEach((t, idx)=>{
      const li = document.createElement('li');
      li.dataset.index = idx;
      li.dataset.category = cat;
      let meta = '';
      if(t.person) meta += ` — ${t.person}`;
      if(t.percent) meta += ` (${t.percent}%)`;
      li.innerHTML = `<div class="task-display"><strong class="task-title">${escapeHtml(t.title)}</strong><div class="muted small">${meta}</div></div>`;
      li._task = t;
      list.appendChild(li);
    });
  });
  renderWeeklyResourcing(quarter, weekKey);
}

// add task handler (uses semicolon-separated subtasks)
document.addEventListener('click', e=>{
  if(e.target.classList.contains('add-task-btn')){
    const parent = e.target.closest('.weekly-category');
    const title = parent.querySelector('.new-task-title').value.trim();
    const subtasksInput = parent.querySelector('.new-task-subtasks').value.trim();
    const person = parent.querySelector('.task-person').value;
    const percent = parseInt(parent.querySelector('.task-percent').value) || 0;
    if(!title) return alert('Task title required');
    const categoryId = parent.id.replace('weekly-','');
    const category = categoryId.charAt(0).toUpperCase()+categoryId.slice(1);
    const quarter = getCurrentQuarter();
    const weekKey = getWeekKey();
    const weekly = loadFromStorage(STORAGE_KEYS.WEEKLY, {Q4:{},Q1:{}});
    if(!weekly[quarter][weekKey]) weekly[quarter][weekKey] = {};
    if(!weekly[quarter][weekKey][category]) weekly[quarter][weekKey][category] = [];
    const subtasks = subtasksInput ? subtasksInput.split(';').map(s=>s.trim()).filter(Boolean):[];
    const taskObj = { title, subtasks, person: person||'', percent: percent||0 };
    weekly[quarter][weekKey][category].push(taskObj);
    saveToStorage(STORAGE_KEYS.WEEKLY, weekly);
    parent.querySelector('.new-task-title').value='';
    parent.querySelector('.new-task-subtasks').value='';
    parent.querySelector('.task-person').value='';
    parent.querySelector('.task-percent').value='';
    loadWeeklyTasks(quarter, weekKey);
  }
});

// Inline edit by double-click
document.addEventListener('dblclick', e=>{
  const li = e.target.closest('.weekly-entries li');
  if(!li) return;
  enterInlineEdit(li);
});

function enterInlineEdit(li){
  const quarter = getCurrentQuarter();
  const weekKey = getWeekKey();
  const idx = parseInt(li.dataset.index);
  const category = li.dataset.category;
  const data = loadFromStorage(STORAGE_KEYS.WEEKLY, {Q4:{},Q1:{}});
  const task = data[quarter]?.[weekKey]?.[category]?.[idx];
  if(!task) return;
  const editor = document.createElement('div'); editor.className='task-editor';
  editor.innerHTML = `
    <input class="edit-title" value="${escapeHtml(task.title)}" />
    <input class="edit-subtasks" value="${escapeHtml((task.subtasks||[]).join('; '))}" />
    <select class="edit-person"></select>
    <input type="number" class="edit-percent" min="0" max="100" value="${task.percent||0}" />
    <button class="save-edit">Save</button>
    <button class="cancel-edit">Cancel</button>
    <button class="delete-edit">Delete</button>
  `;
  people.forEach(p=>{ const opt = document.createElement('option'); opt.value=p; opt.textContent=p; if(p===task.person) opt.selected=true; editor.querySelector('.edit-person').appendChild(opt); });
  li.innerHTML = ''; li.appendChild(editor);
  editor.querySelector('.cancel-edit').addEventListener('click', ()=>{ loadWeeklyTasks(quarter, weekKey); });
  editor.querySelector('.save-edit').addEventListener('click', ()=>{
    const newTitle = editor.querySelector('.edit-title').value.trim();
    const newSubs = editor.querySelector('.edit-subtasks').value.trim();
    const newPerson = editor.querySelector('.edit-person').value;
    const newPercent = parseInt(editor.querySelector('.edit-percent').value) || 0;
    if(!newTitle) return alert('Title required');
    data[quarter][weekKey][category][idx] = { title:newTitle, subtasks: newSubs?newSubs.split(';').map(s=>s.trim()).filter(Boolean):[], person:newPerson, percent:newPercent };
    saveToStorage(STORAGE_KEYS.WEEKLY, data);
    loadWeeklyTasks(quarter, weekKey);
  });
  editor.querySelector('.delete-edit').addEventListener('click', ()=>{
    if(!confirm('Delete this task?')) return;
    data[quarter][weekKey][category].splice(idx,1);
    saveToStorage(STORAGE_KEYS.WEEKLY, data);
    loadWeeklyTasks(quarter, weekKey);
  });
}

// populate person selectors
function populatePersonSelectors(){
  document.querySelectorAll('.task-person').forEach(sel=>{
    sel.innerHTML = '<option value="">Assign to...</option>';
    people.forEach(p=>{ const opt = document.createElement('option'); opt.value = p; opt.textContent = p; sel.appendChild(opt); });
  });
}

// Weekly resourcing bars
function renderWeeklyResourcing(quarter, weekKey = getWeekKey()){
  const container = document.getElementById('resourcing-bars');
  if(!container) return;
  container.innerHTML='';
  const weekly = loadFromStorage(STORAGE_KEYS.WEEKLY, {Q4:{},Q1:{}});
  const totals = {}; people.forEach(p=>totals[p]=0);
  const weekData = weekly[quarter]?.[weekKey];
  if(weekData){
    Object.values(weekData).forEach(catTasks=>{
      catTasks.forEach(t=>{ if(t.person && t.percent) totals[t.person] += Number(t.percent); });
    });
  }
  people.forEach(p=>{
    const val = Math.round(totals[p]||0);
    const wrap = document.createElement('div'); wrap.className='resourcing-bar-wrapper';
    const label = document.createElement('span'); label.textContent = `${p}: ${val}%`;
    const bar = document.createElement('div'); bar.className='resourcing-bar'; if(val>100) bar.classList.add('over');
    bar.style.width = Math.min(val,100) + '%';
    wrap.appendChild(label); wrap.appendChild(bar); container.appendChild(wrap);
  });
}

// Daily updates handling (store by weekKey and date)
function renderDailyBoxes(){
  const container = document.getElementById('daily-row');
  container.innerHTML='';
  const today = new Date();
  const weekKey = getWeekKey(today);
  const dateKey = today.toISOString().slice(0,10);
  const daily = loadFromStorage(STORAGE_KEYS.DAILY, {});
  if(!daily[weekKey]) daily[weekKey] = {};
  if(!daily[weekKey][dateKey]) daily[weekKey][dateKey] = {};
  people.forEach(p=>{ if(!daily[weekKey][dateKey][p]) daily[weekKey][dateKey][p] = { today: '' }; });
  people.forEach(p=>{
    const box = document.createElement('div'); box.className='person-box';
    const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate()-1);
    const yesterdayKey = yesterdayDate.toISOString().slice(0,10);
    const yesterdayText = (daily[weekKey] && daily[weekKey][yesterdayKey] && daily[weekKey][yesterdayKey][p]) ? (daily[weekKey][yesterdayKey][p].today || '') : '';
    const todayText = (daily[weekKey] && daily[weekKey][dateKey] && daily[weekKey][dateKey][p]) ? (daily[weekKey][dateKey][p].today || '') : '';
    box.innerHTML = `<div class="person-header"><h4>${p}</h4><div class="muted small">${dateKey}</div></div>
      <label>Yesterday's update</label>
      <div class="yesterday" data-name="${p}">${escapeHtml(yesterdayText)}</div>
      <label>Today's update</label>
      <textarea class="today" data-name="${p}" placeholder="Write today's update...">${escapeHtml(todayText)}</textarea>`;
    container.appendChild(box);
  });
  container.querySelectorAll('.today').forEach(el=>{
    el.addEventListener('input', e=>{
      const name = e.target.dataset.name;
      const val = e.target.value;
      const today = new Date(); const weekKey = getWeekKey(today); const dateKey = today.toISOString().slice(0,10);
      const daily = loadFromStorage(STORAGE_KEYS.DAILY, {});
      if(!daily[weekKey]) daily[weekKey] = {};
      if(!daily[weekKey][dateKey]) daily[weekKey][dateKey] = {};
      if(!daily[weekKey][dateKey][name]) daily[weekKey][dateKey][name] = {};
      daily[weekKey][dateKey][name].today = val;
      saveToStorage(STORAGE_KEYS.DAILY, daily);
    });
  });
}

// escape helper
function escapeHtml(str){ if(!str) return ''; return (''+str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// progress input save
document.addEventListener('input', e=>{
  if(e.target.classList.contains('progress-input')){
    const quarter = e.target.dataset.quarter;
    const id = e.target.dataset.id;
    const newValue = parseInt(e.target.value) || 0;
    const md = loadFromStorage(STORAGE_KEYS.MILESTONES, {Q4:{},Q1:{}});
    for(const c of categories){
      const item = md[quarter]?.[c]?.find(m=>m.id===id);
      if(item){ item.progress = newValue; saveToStorage(STORAGE_KEYS.MILESTONES, md); break; }
    }
  }
});

// save all resourcing btn
document.getElementById('save-all-resourcing').addEventListener('click', saveAllResourcing);

// quarter change
document.getElementById('quarter-select').addEventListener('change', ()=>{
  const q = getCurrentQuarter();
  renderQuarterlyOverview(q);
  loadWeeklyTasks(q, getWeekKey());
  populatePersonSelectors();
});

// initial load
document.addEventListener('DOMContentLoaded', ()=>{
  const stored = loadFromStorage(STORAGE_KEYS.MILESTONES, null);
  if(!stored) loadMilestonesCSV();
  else renderQuarterlyOverview(getCurrentQuarter());
  populateWeeklyColumns();
  loadWeeklyTasks(getCurrentQuarter(), getWeekKey());
  renderDailyBoxes();
  populatePersonSelectors();
});