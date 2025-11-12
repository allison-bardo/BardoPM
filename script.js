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

function renderQuarterlyResourcing(quarter) {
  const container = document.getElementById('resourcing-grid');
  if (!container) return;

  ensureResourcingForQuarter(quarter);
  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const data = all[quarter] || {};

  let html = `
    <table class="resourcing-table">
      <thead>
        <tr><th>Person</th><th>Total Allocation</th></tr>
      </thead>
      <tbody>`;

  people.forEach(person => {
    let total = 0;
    let segments = "";

    // build each colored segment
    categories.forEach((category, i) => {
      const val = data[category]?.[person] || 0;
      total += val;
      const paletteClass = `palette-${i + 1}-bg`;
      if (val > 0) {
        segments += `
          <div class="res-bar-segment ${paletteClass}" 
               data-person="${person}" data-category="${category}"
               style="width:${val}%;"
               title="${category}: ${val}%">
               ${val > 8 ? val + "%" : ""}
          </div>`;
      }
    });

    total = Math.min(100, total); // visually cap to 100%

    // fallback if no segments
    const barHTML =
      segments ||
      `<div class="res-bar-segment empty-segment" 
            data-person="${person}" 
            data-category="Materials"
            style="width:100%;background:rgba(0,0,0,0.05);color:#777;cursor:pointer;text-align:center;">
            Set Resourcing
        </div>`;

    html += `
      <tr>
        <td style="text-align:left;padding-left:10px;font-weight:600">${person}</td>
        <td><div class="res-bar-row">${barHTML}</div></td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  // enable click popups
  container.querySelectorAll(".res-bar-segment, .empty-segment").forEach(seg => {
    seg.addEventListener("click", e => {
      e.stopPropagation();
      openResEditPopupForCell(e.target);
    });
  });
}


  // keep your popup editing logic functional
  container.querySelectorAll(".res-bar-segment").forEach(seg => {
    seg.addEventListener("click", e => openResEditPopupForCell(e.target));
  });
}


function openResEditPopupForCell(cell) {
  console.log("Popup triggered for", cell.dataset.person, cell.dataset.category); // 👈 debug
  closeResEditPopup(); // remove any existing one
  const person = cell.dataset.person;
  const quarter = getCurrentQuarter();
  ensureResourcingForQuarter(quarter);

  const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  const data = all[quarter] || {};
  const currentAllocations = {};

  categories.forEach(cat => {
    currentAllocations[cat] = data[cat]?.[person] || 0;
  });

  const popup = document.createElement("div");
  popup.className = "res-edit-popup";

  // Popup title
  let html = `<h4 style="margin:0 0 8px 0;">Edit Resourcing — ${person}</h4>`;

  // One input row per category
  categories.forEach((cat, i) => {
    const paletteClass = `palette-${i + 1}-bg`;
    html += `
      <div class="res-popup-row" style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div style="width:90px;font-weight:600;">${cat}</div>
        <input type="range" min="0" max="100" value="${currentAllocations[cat]}" 
               data-cat="${cat}" class="popup-slider ${paletteClass}" style="flex:1;">
        <span class="popup-val" style="width:40px;text-align:right;">${currentAllocations[cat]}%</span>
      </div>`;
  });

  html += `
    <div class="popup-actions" style="margin-top:8px;text-align:right;">
      <button class="cancel-res">Cancel</button>
      <button class="save-res">Save</button>
    </div>`;

  popup.innerHTML = html;
  document.body.appendChild(popup);

  // Position popup below clicked element
  const rect = cell.getBoundingClientRect();
  const popupWidth = 320;
  let left = rect.left + window.scrollX;
  if (left + popupWidth > window.scrollX + window.innerWidth)
    left = window.scrollX + window.innerWidth - popupWidth - 12;
  let top = rect.bottom + window.scrollY + 6;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.width = popupWidth + "px";

  // Slider listeners to show % values live
  popup.querySelectorAll(".popup-slider").forEach(slider => {
    slider.addEventListener("input", e => {
      e.target.closest(".res-popup-row").querySelector(".popup-val").textContent =
        e.target.value + "%";
    });
  });

  // Cancel button
  popup.querySelector(".cancel-res").addEventListener("click", closeResEditPopup);

  // Save button
  popup.querySelector(".save-res").addEventListener("click", () => {
    const updated = {};
    popup.querySelectorAll(".popup-slider").forEach(slider => {
      updated[slider.dataset.cat] = parseInt(slider.value) || 0;
    });

    const quarter = getCurrentQuarter();
    const all = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
    if (!all[quarter]) all[quarter] = {};
    categories.forEach(cat => {
      if (!all[quarter][cat]) all[quarter][cat] = {};
      all[quarter][cat][person] = updated[cat];
    });

    saveToStorage(STORAGE_KEYS.RESOURCING, all);
    closeResEditPopup();
    renderQuarterlyResourcing(quarter);
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

function renderDailyBoxes() {
  const container = document.getElementById("daily-row");
  if (!container) return;
  container.innerHTML = "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (!dailyLogs[todayKey]) dailyLogs[todayKey] = {};

  people.forEach(name => {
    const yesterdayUpdate =
      (dailyLogs[yesterdayKey] && dailyLogs[yesterdayKey][name]?.today) || "";
    const todayUpdate =
      (dailyLogs[todayKey] && dailyLogs[todayKey][name]?.today) || "";

    const box = document.createElement("div");
    box.className = "person-box";
    box.innerHTML = `
      <div class="person-header">
        <h4>${name}</h4>
        <div class="muted small">${todayKey}</div>
      </div>
      <label>Yesterday's Update</label>
      <div class="yesterday">${yesterdayUpdate}</div>
      <label>Today's Update</label>
      <textarea class="today" data-name="${name}" placeholder="Write today's update...">${todayUpdate}</textarea>
    `;
    container.appendChild(box);
  });

  // Save today's updates live
  container.querySelectorAll(".today").forEach(el => {
    el.addEventListener("input", e => {
      const name = e.target.dataset.name;
      const val = e.target.value;
      if (!dailyLogs[todayKey]) dailyLogs[todayKey] = {};
      if (!dailyLogs[todayKey][name]) dailyLogs[todayKey][name] = {};
      dailyLogs[todayKey][name].today = val;
      saveToStorage(STORAGE_KEYS.DAILY, dailyLogs);
    });
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

// --- Handle clicks on resourcing bar segments ---
document.addEventListener("click", e => {
  // Ignore clicks inside the popup (so it doesn’t close instantly)
  if (e.target.closest(".res-edit-popup")) return;

  // When clicking a colored segment, open the popup
  const segment = e.target.closest(".res-bar-segment");
  if (segment) {
    e.stopPropagation(); // stop bubbling so it doesn't trigger close
    openResEditPopupForCell(segment);
    return;
  }

  // If click is outside bars and popups, close any open popup
  closeResEditPopup();
});


// --- Initialize ---
document.addEventListener("DOMContentLoaded", () => {
  milestonesData = loadFromStorage(STORAGE_KEYS.MILESTONES, { Q4: {}, Q1: {} });
  weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q4: {}, Q1: {} });
  dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
  renderQuarterlyOverview(getCurrentQuarter());
  renderQuarterlyResourcing(getCurrentQuarter());
  loadWeeklyTasks(getCurrentQuarter());
  renderDailyBoxes();
  loadMilestonesCSV();
});










