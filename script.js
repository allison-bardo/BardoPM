const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = ["Allison", "Christian", "Cyril", "Mike", "Ryszard", "SamL", "SamW"];

// per-category lead map (unchanged from earlier)
const leadByCategory = {
  Materials: "Mike",
  Fabrication: "Allison",
  Durability: "Allison",
  ScaleUp: "Ryszard",
  Operations: "SamL"
};

let milestonesData = { Q4: {}, Q1: {} };
let weeklyPlans = { Q4: {}, Q1: {} };
let dailyLogs = {}; // keyed by ISO date string

const STORAGE_KEYS = {
  MILESTONES: "milestonesData_v1",
  WEEKLY: "weeklyPlans_v1",
  DAILY: "dailyLogs_v1",
  RESOURCING: "resourcing_v1" // per-quarter, per-category allocations
};

function getCurrentQuarter(){ return document.getElementById("quarter-select").value; }
function saveToStorage(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function loadFromStorage(key, fallback){ const data = localStorage.getItem(key); return data ? JSON.parse(data) : fallback; }

// --- Milestones CSV loader ---
function loadMilestonesCSV(){
  if (typeof Papa === "undefined") return;
  Papa.parse("milestones.csv", {
    download: true, header: true, skipEmptyLines: true,
    complete: function(results){
      milestonesData = { Q4: {}, Q1: {} };
      categories.forEach(c => { milestonesData.Q4[c] = []; milestonesData.Q1[c] = []; });
      results.data.forEach(row => {
        const milestone = { id: row.id, title: row.title, date: row.date, people: row.people, progress: parseInt(row.progress) || 0 };
        if (!categories.includes(row.category)) return;
        (row.quarter === "Q1" ? milestonesData.Q1[row.category] : milestonesData.Q4[row.category]).push(milestone);
      });
      saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);
      renderQuarterlyOverview(getCurrentQuarter());
    }
  });
}

// --- Render milestones ---
function renderQuarterlyOverview(quarter){
  // load resourcing allocations for quarter
  const resourcing = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
  categories.forEach(category => {
    const boxContainer = document.querySelector(`#${category.toLowerCase()}-box`);
    if (!boxContainer) return;
    // lead
    const leadDiv = boxContainer.querySelector(".lead");
    if (leadDiv) leadDiv.textContent = `Lead: ${leadByCategory[category]}`;

    // resourcing setup UI
    const rs = boxContainer.querySelector(".resourcing-setup");
    rs.innerHTML = "";
    const catAlloc = (resourcing[quarter] && resourcing[quarter][category]) ? resourcing[quarter][category] : {};
    people.forEach(person => {
      const row = document.createElement("div");
      row.className = "resourcing-row";
      row.innerHTML = `<label>${person}</label><input type="number" min="0" max="100" class="res-person" data-person="${person}" value="${catAlloc[person] || ''}" />`;
      rs.appendChild(row);
    });
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save Resourcing";
    saveBtn.className = "save-resourcing-btn";
    saveBtn.dataset.category = category;
    rs.appendChild(saveBtn);

    // milestones
    const box = boxContainer.querySelector(".milestone-entries");
    box.innerHTML = "";
    const items = milestonesData[quarter]?.[category] || [];
    items.forEach(m => {
      const entry = document.createElement("div");
      entry.className = "milestone-entry";
      entry.innerHTML = `
        <strong>${m.title}</strong><br>
        Personnel: ${m.people || "—"}<br>
        Date: ${m.date || "—"}<br>
        Progress: <input type="number" min="0" max="100" value="${m.progress}" data-id="${m.id}" data-quarter="${quarter}" class="progress-input"> %
      `;
      box.appendChild(entry);
    });
  });
}

// --- Weekly tasks ---
weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q4: {}, Q1: {} });
function loadWeeklyTasks(quarter, week = "Week 1") {
  categories.forEach(category => {
    const list = document.querySelector(`#weekly-${category.toLowerCase()} .weekly-entries`);
    if (!list) return;
    list.innerHTML = "";

    const tasks = weeklyPlans[quarter]?.[week]?.[category] || [];
    tasks.forEach(taskObj => {
      const li = document.createElement("li");
      let meta = "";
      if (taskObj.person) meta += ` — ${taskObj.person}`;
      if (taskObj.percent) meta += ` (${taskObj.percent}%)`;
      li.innerHTML = `<strong>${taskObj.title}</strong><div class="muted small">${meta}</div>`;
      if (taskObj.subtasks && taskObj.subtasks.length) {
        const ul = document.createElement("ul");
        ul.classList.add("subtask-list");
        taskObj.subtasks.forEach(st => {
          const subLi = document.createElement("li");
          subLi.textContent = st.trim();
          ul.appendChild(subLi);
        });
        li.appendChild(ul);
      }
      list.appendChild(li);
    });
  });

  // after rendering tasks, update resourcing bars
  renderWeeklyResourcing(quarter, week);
}

// --- Add-task buttons (semicolon-separated subtasks + person + percent) ---
document.addEventListener("click", e => {
  if (e.target.classList.contains("add-task-btn")) {
    const parent = e.target.closest(".weekly-category");
    const title = parent.querySelector(".new-task-title").value.trim();
    const subtasksInput = parent.querySelector(".new-task-subtasks").value.trim();
    const person = parent.querySelector(".task-person").value;
    const percent = parseInt(parent.querySelector(".task-percent").value) || 0;

    if (!title) return alert("Task title required");

    let categoryId = parent.id.replace("weekly-", "");
    const category = categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
    const quarter = getCurrentQuarter();
    const week = "Week 1";

    weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q4: {}, Q1: {} });
    if (!weeklyPlans[quarter][week]) weeklyPlans[quarter][week] = {};
    if (!weeklyPlans[quarter][week][category]) weeklyPlans[quarter][week][category] = [];

    const subtasks = subtasksInput ? subtasksInput.split(";").map(s => s.trim()).filter(Boolean) : [];
    const taskObj = { title, subtasks, person: person || "", percent: percent || 0 };
    weeklyPlans[quarter][week][category].push(taskObj);

    saveToStorage(STORAGE_KEYS.WEEKLY, weeklyPlans);
    loadWeeklyTasks(quarter, week);

    parent.querySelector(".new-task-title").value = "";
    parent.querySelector(".new-task-subtasks").value = "";
    parent.querySelector(".task-person").value = "";
    parent.querySelector(".task-percent").value = "";
  }
});

// --- Resourcing: save per-quarter per-category allocations ---
document.addEventListener("click", e => {
  if (e.target.classList.contains("save-resourcing-btn")) {
    const category = e.target.dataset.category;
    const quarter = getCurrentQuarter();
    const container = e.target.parentElement;
    const inputs = container.querySelectorAll(".res-person");
    const res = loadFromStorage(STORAGE_KEYS.RESOURCING, {});
    if (!res[quarter]) res[quarter] = {};
    if (!res[quarter][category]) res[quarter][category] = {};
    inputs.forEach(inp => {
      const person = inp.dataset.person;
      const val = parseInt(inp.value);
      if (!isNaN(val) && val >= 0) res[quarter][category][person] = val;
      else delete res[quarter][category][person];
    });
    saveToStorage(STORAGE_KEYS.RESOURCING, res);
    // re-render bars to reflect allocations + weekly tasks
    const week = "Week 1";
    renderWeeklyResourcing(quarter, week);
    alert("Resourcing saved for " + category + " in " + quarter);
  }
});

// --- Weekly resourcing calculation and rendering ---
function renderWeeklyResourcing(quarter, week = "Week 1") {
  const container = document.getElementById("resourcing-bars");
  if (!container) return;
  container.innerHTML = "";

  // start totals from 0
  const totals = {}; people.forEach(p => totals[p] = 0);

  // add allocations from weekly tasks
  const weekData = weeklyPlans[quarter]?.[week];
  if (weekData) {
    Object.values(weekData).forEach(catTasks => {
      catTasks.forEach(task => {
        if (task.person && task.percent) totals[task.person] = (totals[task.person] || 0) + Number(task.percent);
      });
    });
  }

  people.forEach(name => {
    const val = Math.round(totals[name] || 0);
    const wrapper = document.createElement("div");
    wrapper.className = "resourcing-bar-wrapper";
    const label = document.createElement("span");
    label.textContent = `${name}: ${val}%`;
    const bar = document.createElement("div");
    bar.className = "resourcing-bar";
    if (val > 100) bar.classList.add("over");
    bar.style.width = Math.min(val, 100) + "%";
    wrapper.appendChild(label);
    wrapper.appendChild(bar);
    container.appendChild(wrapper);
  });
}

// --- Daily updates ---
dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
function isoDate(offsetDays = 0) { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); }

function renderDailyBoxes() {
  const container = document.getElementById("daily-row");
  container.innerHTML = "";
  const todayKey = isoDate(0);
  const yesterdayKey = isoDate(-1);
  if (!dailyLogs[todayKey]) dailyLogs[todayKey] = {};
  people.forEach(name => { if (!dailyLogs[todayKey][name]) dailyLogs[todayKey][name] = { today: "" }; });

  people.forEach(name => {
    const box = document.createElement("div"); box.className = "person-box";
    const yesterdayText = (dailyLogs[yesterdayKey] && dailyLogs[yesterdayKey][name] && dailyLogs[yesterdayKey][name].today) ? dailyLogs[yesterdayKey][name].today : "";
    const todayText = (dailyLogs[todayKey] && dailyLogs[todayKey][name] && dailyLogs[todayKey][name].today) ? dailyLogs[todayKey][name].today : "";
    box.innerHTML = `
      <div class="person-header"><h4>${name}</h4><div class="muted small">${todayKey}</div></div>
      <label>Yesterday's update</label>
      <div class="yesterday" data-name="${name}" aria-readonly="true">${escapeHtml(yesterdayText)}</div>
      <label>Today's update</label>
      <textarea class="today" data-name="${name}" placeholder="Write today's update...">${escapeHtml(todayText)}</textarea>
    `;
    container.appendChild(box);
  });

  container.querySelectorAll(".today").forEach(el => {
    el.addEventListener("input", e => {
      const name = e.target.dataset.name;
      const val = e.target.value;
      const key = isoDate(0);
      if (!dailyLogs[key]) dailyLogs[key] = {};
      if (!dailyLogs[key][name]) dailyLogs[key][name] = {};
      dailyLogs[key][name].today = val;
      saveToStorage(STORAGE_KEYS.DAILY, dailyLogs);
    });
  });
}

function escapeHtml(str) { if (!str) return ""; return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }

// populate person selects in weekly task boxes
function populatePersonSelectors() {
  document.querySelectorAll(".task-person").forEach(sel => {
    sel.innerHTML = '<option value="">Assign to...</option>';
    people.forEach(p => {
      const opt = document.createElement("option"); opt.value = p; opt.textContent = p; sel.appendChild(opt);
    });
  });
}

document.getElementById("quarter-select").addEventListener("change", () => {
  const quarter = getCurrentQuarter();
  renderQuarterlyOverview(quarter);
  loadWeeklyTasks(quarter);
  populatePersonSelectors();
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
        saveToStorage(STORAGE_KEYS.MILESTONES, milestonesData);
        break;
      }
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  milestonesData = loadFromStorage(STORAGE_KEYS.MILESTONES, { Q4: {}, Q1: {} });
  weeklyPlans = loadFromStorage(STORAGE_KEYS.WEEKLY, { Q4: {}, Q1: {} });
  dailyLogs = loadFromStorage(STORAGE_KEYS.DAILY, {});
  renderQuarterlyOverview(getCurrentQuarter());
  loadWeeklyTasks(getCurrentQuarter());
  renderDailyBoxes();
  populatePersonSelectors();
  loadMilestonesCSV();
});
