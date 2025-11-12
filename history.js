// History page script
const HISTORY_KEYS = {
  WEEKLY: 'weeklyPlans_v1',
  DAILY: 'dailyLogs_v1',
  RESOURCING: 'resourcing_v1'
};
const categories = ["Materials","Fabrication","Durability","ScaleUp","Operations"];
const people = ["Allison","Christian","Cyril","Mike","Ryszard","SamL","SamW"];

function loadFromStorage(key, fallback){ const d = localStorage.getItem(key); return d?JSON.parse(d):fallback; }

function getAvailableWeeks(){
  const weekly = loadFromStorage(HISTORY_KEYS.WEEKLY, {Q4:{},Q1:{}});
  const weeks = new Set();
  ['Q4','Q1'].forEach(q=>{ Object.keys(weekly[q]||{}).forEach(wk=>weeks.add(wk)); });
  const daily = loadFromStorage(HISTORY_KEYS.DAILY, {});
  Object.keys(daily||{}).forEach(wk=>weeks.add(wk));
  return [...weeks].sort();
}

function populateSelectors(){
  const qSel = document.getElementById('history-quarter');
  qSel.innerHTML = '<option value="Q4">Q4</option><option value="Q1">Q1</option>';
  const weeks = getAvailableWeeks();
  const wSel = document.getElementById('history-week');
  wSel.innerHTML = '<option value="">Select week (Monday)</option>' + weeks.map(w=>`<option value="${w}">${w}</option>`).join('');
}

function renderHistory(){
  const quarter = document.getElementById('history-quarter').value;
  const week = document.getElementById('history-week').value;
  renderHistoryWeekly(quarter, week);
  renderHistoryDaily(week);
}

function renderHistoryWeekly(quarter, week){
  const out = document.getElementById('history-weekly');
  out.innerHTML = '';
  if(!week) return out.innerHTML = '<p>Select a week to view tasks</p>';
  const weekly = loadFromStorage(HISTORY_KEYS.WEEKLY, {Q4:{},Q1:{}});
  const data = weekly[quarter] && weekly[quarter][week] ? weekly[quarter][week] : {};
  categories.forEach(c=>{
    const box = document.createElement('div'); box.className='card'; box.innerHTML=`<h3>${c}</h3>`;
    const ul = document.createElement('ul');
    (data[c]||[]).forEach(t=>{
      const li = document.createElement('li');
      li.innerHTML = `<strong>${t.title}</strong> ${t.person?`— ${t.person}`:''} ${t.percent?`(${t.percent}%)`:''}`;
      if(t.subtasks && t.subtasks.length){
        const sub = document.createElement('ul'); sub.className='subtask-list';
        t.subtasks.forEach(s=>{ const sli = document.createElement('li'); sli.textContent = s; sub.appendChild(sli); });
        li.appendChild(sub);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul); out.appendChild(box);
  });
}

function renderHistoryDaily(week){
  const out = document.getElementById('history-daily');
  out.innerHTML = '';
  if(!week) return out.innerHTML = '<p>Select a week to view daily logs</p>';
  const daily = loadFromStorage(HISTORY_KEYS.DAILY, {});
  const wk = daily[week] || {};
  const dates = Object.keys(wk).sort();
  dates.forEach(d=>{
    const card = document.createElement('div'); card.className='card'; card.innerHTML = `<h3>${d}</h3>`;
    people.forEach(p=>{
      const entry = (wk[d] && wk[d][p]) ? (wk[d][p].today||'') : '';
      const pdiv = document.createElement('div'); pdiv.innerHTML = `<strong>${p}</strong>: ${escapeHtml(entry)}`;
      card.appendChild(pdiv);
    });
    out.appendChild(card);
  });
}

function escapeHtml(str){ if(!str) return ''; return (''+str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

document.addEventListener('DOMContentLoaded', ()=>{
  populateSelectors();
  document.getElementById('history-quarter').addEventListener('change', renderHistory);
  document.getElementById('history-week').addEventListener('change', renderHistory);
});