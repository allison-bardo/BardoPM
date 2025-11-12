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

// Palette mapping for categories -> CSS variable (used when creating inline styles)
const paletteColors = {
  Materials: 'var(--accent-1)',
  Fabrication: 'var(--accent-2)',
  Durability: 'var(--accent-3)',
  ScaleUp: 'var(--accent-4)',
  Operations: 'var(--accent-5)'
};

// Render quarterly resourcing as colored bars with inside labels
function renderQuarterlyResourcing(quarter){
  const container = document.getElementById('resourcing-grid');
  if(!container) return;
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const data = all[quarter] || {};
  // build table header
  let html = '<table class="resourcing-table"><thead><tr><th>Person</th>' + categories.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  people.forEach(p=>{
    html += `<tr><td style="text-align:left;padding-left:10px">${p}</td>`;
    categories.forEach(c=>{
      const v = (data[c] && data[c][p] !== undefined) ? Number(data[c][p]) : 0;
      const safeV = Math.max(0, Math.min(100, Number(v) || 0));
      // add shorthand class for category for fallback coloring
      const catClass = c==='Materials'?'mat':(c==='Fabrication'?'fab':(c==='Durability'?'dur':(c==='ScaleUp'?'scl':'opr')));
      html += `<td class="res-cell" data-person="${p}" data-category="${c}" style="vertical-align:middle">
                 <div class="res-bar ${safeV===0?'zero':''} ${catClass}" role="button" aria-label="${p} ${c} ${safeV} percent"
                      style="width:${safeV}%;background:${paletteColors[c]};">
                   <span class="res-label">${safeV}%</span>
                 </div>
               </td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Open a popup editor positioned below the clicked cell
function openResEditPopupForCell(cell){
  closeResEditPopup();
  const person = cell.dataset.person;
  const category = cell.dataset.category;
  const quarter = getCurrentQuarter();
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const current = (all[quarter] && all[quarter][category] && all[quarter][category][person] !== undefined) ? Number(all[quarter][category][person]) : 0;

  const popup = document.createElement('div');
  popup.className = 'res-edit-popup';
  popup.innerHTML = `
    <label>${person} — ${category}</label>
    <input type="number" min="0" max="100" value="${current}" class="popup-input" />
    <div class="popup-actions">
      <button class="cancel-res">Cancel</button>
      <button class="save-res">Save</button>
    </div>
  `;
  document.body.appendChild(popup);

  // position the popup relative to the cell's bar element
  const bar = cell.querySelector('.res-bar');
  const rect = bar.getBoundingClientRect();
  // default left/top
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  // if popup would overflow right edge, adjust
  const popupRectEstimateWidth = 220;
  if (left + popupRectEstimateWidth > window.scrollX + window.innerWidth) {
    left = window.scrollX + window.innerWidth - popupRectEstimateWidth - 12;
  }
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // handlers
  popup.querySelector('.cancel-res').addEventListener('click', ()=>{ closeResEditPopup(); });
  popup.querySelector('.save-res').addEventListener('click', ()=>{
    const val = parseInt(popup.querySelector('.popup-input').value) || 0;
    updateResourcingValue(person, category, Math.max(0, Math.min(100, val)));
    closeResEditPopup();
    renderQuarterlyResourcing(getCurrentQuarter());
  });
}

// Close any existing popup
function closeResEditPopup(){
  const existing = document.querySelector('.res-edit-popup');
  if(existing) existing.remove();
}

// Update storage with a single cell change
function updateResourcingValue(person, category, val){
  const quarter = getCurrentQuarter();
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  if(!all[quarter]) all[quarter] = {};
  if(!all[quarter][category]) all[quarter][category] = {};
  all[quarter][category][person] = val;
  saveToStorage(STORAGE_KEYS.RESOURCING, all);
}

// Delegate click on res-cell to open popup
document.addEventListener('click', function(e){
  const cell = e.target.closest('.res-cell');
  if(!cell) return;
  // Only open popup when clicking on the bar or cell (not when clicking inside the popup)
  const insidePopup = e.target.closest('.res-edit-popup');
  if(insidePopup) return;
  openResEditPopupForCell(cell);
});

// Close popup on ESC or click outside popup
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeResEditPopup();
});
document.addEventListener('click', function(e){
  const popup = document.querySelector('.res-edit-popup');
  if(!popup) return;
  if(e.target.closest('.res-edit-popup')) return; // clicked inside
  if(e.target.closest('.res-cell')) return; // clicked a cell (handled elsewhere)
  // otherwise close
  popup.remove();
});
