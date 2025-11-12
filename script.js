const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = [
  "Allison",
  "Christian",
  "Cyril",
  "Mike",
  "Ryszard",
  "SamL",
  "SamW"
];
const STORAGE_KEYS = {
  MILESTONES: "milestonesData",
  WEEKLY: "weeklyPlans",
  DAILY: "dailyLogs",
  RESOURCING: "resourcingData_v1"
};
let milestonesData = { Q4: {}, Q1: {} };
let weeklyPlans = { Q4: {}, Q1: {} };
let dailyLogs = { Q4: {}, Q1: {} };

function getCurrentQuarter() {
  return document.getElementById("quarter-select").value;
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadFromStorage(key, fallback) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
}

// --- Load Milestones from CSV ---
function loadMilestonesCSV() {
  Papa.parse("milestones.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      milestonesData = { Q4: {}, Q1: {} };
      categories.forEach(c => {
        milestonesData.Q4[c] = [];
        milestonesData.Q1[c] = [];
      });

      results.data.forEach(row => {
        const milestone = {
          id: row.id,
          title: row.title,
          date: row.date,
          people: row.people,
          progress: parseInt(row.progress) || 0,
          lead: row.lead || "Allison"
        };
        if (!categories.includes(row.category)) return;

        if (row.quarter === "Q1") milestonesData.Q1[row.category].push(milestone);
        else milestonesData.Q4[row.category].push(milestone);
      });

      saveToStorage("milestonesData", milestonesData);
      renderQuarterlyOverview(getCurrentQuarter());
    }
  });
}

// --- Render Milestones ---
function renderQuarterlyOverview(quarter) {
  categories.forEach(category => {
    const box = document.querySelector(`#${category.toLowerCase()}-box .milestone-entries`);
    if (!box) return;
    box.innerHTML = "";
    const items = milestonesData[quarter]?.[category] || [];
    items.forEach(m => {
      const entry = document.createElement("div");
      entry.className = "milestone-entry";
      entry.innerHTML = `
        <strong>${m.title}</strong><br>
        <em>Lead: ${m.lead}</em><br>
        Date: ${m.date || "—"}<br>
        Personnel: ${m.people || "—"}<br>
        Progress: <input type="number" min="0" max="100" value="${m.progress}" 
          data-id="${m.id}" data-quarter="${quarter}" class="progress-input"> %
      `;
      box.appendChild(entry);
    });
  });
}

// ----- Quarterly resourcing rendering + popup editor -----
// requires: categories[], people[], STORAGE_KEYS.RESOURCING, loadFromStorage, saveToStorage, getCurrentQuarter()

const paletteColors = {
  Materials: 'var(--accent-1)',
  Fabrication: 'var(--accent-2)',
  Durability: 'var(--accent-3)',
  ScaleUp: 'var(--accent-4)',
  Operations: 'var(--accent-5)'
};

// ensure a quarter has a full allocation object (all categories × people initialized to 0)
function ensureResourcingForQuarter(quarter) {
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  if (!all[quarter]) {
    all[quarter] = {};
    categories.forEach(c => {
      all[quarter][c] = {};
      people.forEach(p => all[quarter][c][p] = 0);
    });
    saveToStorage(STORAGE_KEYS.RESOURCING, all);
  } else {
    // ensure all categories & people keys exist (migration safety)
    let changed = false;
    categories.forEach(c => {
      if (!all[quarter][c]) { all[quarter][c] = {}; changed = true; }
      people.forEach(p => {
        if (all[quarter][c][p] === undefined) { all[quarter][c][p] = 0; changed = true; }
      });
    });
    if (changed) saveToStorage(STORAGE_KEYS.RESOURCING, all);
  }
}

// renders the table of bars with inside labels
function renderQuarterlyResourcing(quarter) {
  const container = document.getElementById('resourcing-grid');
  if (!container) return;
  ensureResourcingForQuarter(quarter);

  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const data = all[quarter] || {};

  let html = '<table class="resourcing-table"><thead><tr><th>Person</th>' +
    categories.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';

  people.forEach(person => {
    html += `<tr><td style="text-align:left;padding-left:10px">${person}</td>`;
    categories.forEach(category => {
      const raw = (data[category] && data[category][person] !== undefined) ? Number(data[category][person]) : 0;
      const val = Math.max(0, Math.min(100, Math.round(raw)));
      const catClass = category === 'Materials' ? 'mat' : (category === 'Fabrication' ? 'fab' : (category === 'Durability' ? 'dur' : (category === 'ScaleUp' ? 'scl' : 'opr')));
      const bg = paletteColors[category] || '';
      // cell: res-cell with a bar div inside, accessible label, data attrs
      html += `<td class="res-cell" data-person="${person}" data-category="${category}" style="vertical-align:middle">
                <div class="res-bar ${val === 0 ? 'zero':''} ${catClass}" role="button" aria-label="${person} ${category} ${val} percent"
                     style="width:${val}%;background:${bg};">
                  <span class="res-label">${val}%</span>
                </div>
              </td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// popup editor for single cell
function openResEditPopupForCell(cell) {
  closeResEditPopup(); // remove existing
  const person = cell.dataset.person;
  const category = cell.dataset.category;
  const quarter = getCurrentQuarter();
  ensureResourcingForQuarter(quarter);
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const current = (all[quarter] && all[quarter][category] && all[quarter][category][person] !== undefined) ? Number(all[quarter][category][person]) : 0;

  const popup = document.createElement('div');
  popup.className = 'res-edit-popup';
  popup.innerHTML = `
    <label style="margin-bottom:6px;font-weight:700">${person} — ${category}</label>
    <input type="number" class="popup-input" min="0" max="100" value="${current}" />
    <div class="popup-actions" style="margin-top:6px;display:flex;gap:8px;justify-content:flex-end">
      <button class="cancel-res">Cancel</button>
      <button class="save-res">Save</button>
    </div>
  `;
  document.body.appendChild(popup);

  // position popup under the clicked bar, adjusted for viewport
  const bar = cell.querySelector('.res-bar');
  const rect = bar.getBoundingClientRect();
  const popupWidth = 220;
  let left = rect.left + window.scrollX;
  if (left + popupWidth > window.scrollX + window.innerWidth) left = window.scrollX + window.innerWidth - popupWidth - 12;
  let top = rect.bottom + window.scrollY + 6;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  popup.querySelector('.cancel-res').addEventListener('click', closeResEditPopup);
  popup.querySelector('.save-res').addEventListener('click', () => {
    const val = parseInt(popup.querySelector('.popup-input').value) || 0;
    updateResourcingValue(person, category, Math.max(0, Math.min(100, val)));
    closeResEditPopup();
    renderQuarterlyResourcing(getCurrentQuarter());
  });
}

// remove popup
function closeResEditPopup() {
  const existing = document.querySelector('.res-edit-popup');
  if (existing) existing.remove();
}

// persist one cell
function updateResourcingValue(person, category, value) {
  const quarter = getCurrentQuarter();
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  if (!all[quarter]) all[quarter] = {};
  if (!all[quarter][category]) all[quarter][category] = {};
  all[quarter][category][person] = value;
  saveToStorage(STORAGE_KEYS.RESOURCING, all);
}

// Save All Resourcing - gathers currently rendered values (fallback to stored values) and saves
function saveAllResourcing() {
  const quarter = getCurrentQuarter();
  ensureResourcingForQuarter(quarter);
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  // Read any input values from DOM if you ever add inputs; here we just persist current stored object (safe)
  saveToStorage(STORAGE_KEYS.RESOURCING, all);
  alert('Quarterly resourcing saved for ' + quarter);
}

// delegate clicks to open popup (only when clicking a res-cell)
document.addEventListener('click', function(e) {
  // If clicking inside popup, ignore (other handler closes)
  if (e.target.closest('.res-edit-popup')) return;
  const cell = e.target.closest('.res-cell');
  if (cell) {
    openResEditPopupForCell(cell);
  }
});

// close popup when pressing Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeResEditPopup();
});

// hook Save All button (ensure button exists in DOM)
document.addEventListener('DOMContentLoaded', function() {
  const saveBtn = document.getElementById('save-all-resourcing');
  if (saveBtn) saveBtn.addEventListener('click', saveAllResourcing);
});


// --- Weekly Tasks ---
weeklyPlans = loadFromStorage("weeklyPlans", { Q4: {}, Q1: {} });
function loadWeeklyTasks(quarter, week = "Week 1") {
  categories.forEach(category => {
    const list = document.querySelector(`#weekly-${category.toLowerCase()} .weekly-entries`);
    if (!list) return;
    list.innerHTML = "";
    const tasks = weeklyPlans[quarter]?.[week]?.[category] || [];
    tasks.forEach(task => {
      const li = document.createElement("li");
      li.textContent = task;
      list.appendChild(li);
    });
  });
}

// --- Daily Updates ---
dailyLogs = loadFromStorage("dailyLogs", { Q4: {}, Q1: {} });

function renderDailyUpdateInputs() {
  const container = document.getElementById("daily-person-boxes");
  if (!container) return;
  container.innerHTML = "";
  const people = ["Allison", "Christian", "Cyril", "Mike", "Ryszard", "SamL", "SamW"];
  
  people.forEach(name => {
    const box = document.createElement("div");
    box.className = "person-box";
    box.innerHTML = `
      <h4>${name}</h4>
      <textarea placeholder="Yesterday update..." data-name="${name}" class="yesterday-update"></textarea>
      <textarea placeholder="Today update..." data-name="${name}" class="today-update"></textarea>
    `;
    container.appendChild(box);
  });
}

// --- Event Listeners ---
document.getElementById('quarter-select').addEventListener('change', () => {
  const q = getCurrentQuarter();
  renderQuarterlyOverview(q);
  renderQuarterlyResourcing(q);
  loadWeeklyTasks(q);
});

document.addEventListener("input", e => {
  if (e.target.classList.contains("progress-input")) {
    const quarter = e.target.dataset.quarter;
    const id = e.target.dataset.id;
    const newValue = parseInt(e.target.value) || 0;

    for (const category of categories) {
      const item = milestonesData[quarter]?.[category]?.find(m => m.id === id);
      if (item) {
        item.progress = newValue;
        saveToStorage("milestonesData", milestonesData);
        break;
      }
    }
  }
});

// --- Initialize ---
document.addEventListener("DOMContentLoaded", () => {
  milestonesData = loadFromStorage(STORAGE_KEYS.MILESTONES, { Q4: {}, Q1: {} });
  weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q4: {}, Q1: {} });
  dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
  renderQuarterlyOverview(getCurrentQuarter());
  renderQuarterlyResourcing(getCurrentQuarter());
  loadWeeklyTasks(getCurrentQuarter());
  renderDailyUpdateInputs();
  loadMilestonesCSV();
});



