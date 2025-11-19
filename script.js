/************************************
 *  FIRESTORE (Firebase v8)
 ************************************/
const db = firebase.firestore();

/************************************
 *  GLOBAL CONSTANTS + STRUCTURES
 ************************************/
const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = ["Allison", "Christian", "Cyril", "Mike", "Ryszard", "SamL", "SamW"];

let milestonesData = { Q1: {}, Q4: {} };
let weeklyPlans = { Q1: {}, Q4: {} };
let dailyLogs = {}; 
let quarterlyResourcing = { Q1: {}, Q4: {} };

/************************************
 *  FIRESTORE HELPERS
 ************************************/
async function loadFS(path, fallback = {}) {
  const ref = db.doc(path);
  const snap = await ref.get();
  return snap.exists ? snap.data() : fallback;
}

async function saveFS(path, data) {
  const ref = db.doc(path);
  return ref.set(data, { merge: true });
}

/************************************
 *  QUARTER HELPERS
 ************************************/
function getCurrentQuarter() {
  return document.getElementById("quarter-select").value;
}

/************************************
 *  LOAD MILESTONES FROM CSV → FS → UI
 ************************************/
async function loadMilestonesCSV() {
  Papa.parse("milestones.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      // Reset
      milestonesData = { Q1: {}, Q4: {} };
      categories.forEach(c => {
        milestonesData.Q1[c] = [];
        milestonesData.Q4[c] = [];
      });

      // Build data structure
      results.data.forEach(row => {
        if (!categories.includes(row.category)) return;

        const milestone = {
          id: row.id,
          title: row.title,
          date: row.date,
          people: row.people,
          progress: parseInt(row.progress) || 0
        };

        if (row.quarter === "Q1") milestonesData.Q1[row.category].push(milestone);
        else milestonesData.Q4[row.category].push(milestone);
      });

      // Save to Firestore
      await saveFS("dashboard/milestones", milestonesData);

      // Render UI
      renderQuarterlyOverview(getCurrentQuarter());
    }
  });
}

/************************************
 *  LOAD ALL DASHBOARD DATA FROM FIRESTORE
 ************************************/
async function loadAllFromFirestore() {
  milestonesData = await loadFS("dashboard/milestones", { Q1: {}, Q4: {} });
  weeklyPlans = await loadFS("dashboard/weeklyPlans", { Q1: {}, Q4: {} });
  dailyLogs = await loadFS("dashboard/dailyLogs", {});
  quarterlyResourcing = await loadFS("dashboard/resourcing", { Q1: {}, Q4: {} });
}

/************************************
 *  RENDER MILESTONES
 ************************************/
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
        Date: ${m.date || "—"}<br>
        Personnel: ${m.people || "—"}<br>
        Progress:
        <input type="number" min="0" max="100" 
               value="${m.progress}"
               data-id="${m.id}" 
               data-quarter="${quarter}"
               data-category="${category}"
               class="progress-input">
      `;
      box.appendChild(entry);
    });
  });
}
/************************************
 *  QUARTERLY RESOURCING (from Firestore)
 ************************************/

// Ensure structure exists for a quarter
function ensureQuarterResourcing(quarter) {
  if (!quarterlyResourcing[quarter]) quarterlyResourcing[quarter] = {};
  categories.forEach(cat => {
    if (!quarterlyResourcing[quarter][cat]) quarterlyResourcing[quarter][cat] = {};
    people.forEach(p => {
      if (quarterlyResourcing[quarter][cat][p] === undefined)
        quarterlyResourcing[quarter][cat][p] = 0;
    });
  });
}

// Render the grid
function renderQuarterlyResourcing(quarter) {
  const container = document.getElementById("resourcing-grid");
  if (!container) return;

  ensureQuarterResourcing(quarter);
  const data = quarterlyResourcing[quarter];

  let html = `
    <table class="resourcing-table">
      <thead><tr><th>Person</th><th>Total Allocation</th></tr></thead>
      <tbody>
  `;

  people.forEach(person => {
    let segments = "";
    let total = 0;

    categories.forEach((cat, i) => {
      const val = data[cat][person] || 0;
      total += val;
      if (val > 0) {
        segments += `
          <div class="res-bar-segment palette-${i + 1}-bg"
               data-person="${person}"
               data-category="${cat}"
               style="width:${val}%;">
               ${val > 8 ? val + "%" : ""}
          </div>`;
      }
    });

    const bar = segments || `
      <div class="res-bar-segment empty-segment"
           data-person="${person}"
           data-category="Materials"
           style="width:100%;text-align:center;background:#eee;color:#555;cursor:pointer;">
           Set Resourcing
      </div>
    `;

    html += `
      <tr>
        <td style="text-align:left;padding-left:10px;font-weight:600">${person}</td>
        <td><div class="res-bar-row">${bar}</div></td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  // Add popup click listeners
  container.querySelectorAll(".res-bar-segment, .empty-segment").forEach(seg => {
    seg.addEventListener("click", e => {
      e.stopPropagation();
      openResourcingPopup(e.target);
    });
  });
}

/************************************
 *  RESOURCING POPUP EDITOR
 ************************************/
function openResourcingPopup(cell) {
  closeResourcingPopup(); // remove existing one

  const person = cell.dataset.person;
  const quarter = getCurrentQuarter();
  ensureQuarterResourcing(quarter);

  const existing = quarterlyResourcing[quarter];
  const popup = document.createElement("div");
  popup.className = "res-edit-popup";

  // Build popup HTML
  let html = `<h4>Edit Resourcing — ${person}</h4>`;

  categories.forEach((cat, i) => {
    const val = existing[cat][person] || 0;
    html += `
      <div class="res-popup-row">
        <div class="popup-label">${cat}</div>
        <input type="range" min="0" max="100" value="${val}"
               class="popup-slider palette-${i + 1}-bg"
               data-cat="${cat}">
        <span class="popup-val">${val}%</span>
      </div>
    `;
  });

  html += `
    <div class="popup-actions">
      <button class="cancel-res">Cancel</button>
      <button class="save-res">Save</button>
    </div>
  `;

  popup.innerHTML = html;
  document.body.appendChild(popup);

  // Position popup
  const rect = cell.getBoundingClientRect();
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top = `${rect.bottom + window.scrollY + 6}px`;

  // Slider live update
  popup.querySelectorAll(".popup-slider").forEach(slider => {
    slider.addEventListener("input", e => {
      e.target
        .closest(".res-popup-row")
        .querySelector(".popup-val").textContent = e.target.value + "%";
    });
  });

  // Cancel
  popup.querySelector(".cancel-res").addEventListener("click", closeResourcingPopup);

  // Save → Firestore
  popup.querySelector(".save-res").addEventListener("click", async () => {
    const updated = {};
    popup.querySelectorAll(".popup-slider").forEach(slider => {
      updated[slider.dataset.cat] = parseInt(slider.value) || 0;
    });

    // Write to memory
    categories.forEach(cat => {
      quarterlyResourcing[quarter][cat][person] = updated[cat];
    });

    // Write to Firestore
    await saveFS("dashboard/resourcing", quarterlyResourcing);

    closeResourcingPopup();
    renderQuarterlyResourcing(quarter);
  });
}

// Close popup if open
function closeResourcingPopup() {
  const old = document.querySelector(".res-edit-popup");
  if (old) old.remove();
}

/************************************
 *  GLOBAL CLICK → CLOSE POPUP
 ************************************/
document.addEventListener("click", e => {
  if (e.target.closest(".res-edit-popup")) return; // inside popup
  closeResourcingPopup();
});
/********************************************
 *  WEEKLY TASKS (stored in Firestore)
 ********************************************/

// weeklyPlans already loaded in Chunk 1
// Structure: weeklyPlans[quarter][week][category] = [taskObj]

function loadWeeklyTasks(quarter, week = "Week 1") {
  categories.forEach(category => {
    const list = document.querySelector(
      `#weekly-${category.toLowerCase()} .weekly-entries`
    );
    if (!list) return;

    list.innerHTML = "";
    const tasks = weeklyPlans[quarter]?.[week]?.[category] || [];

    tasks.forEach(task => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${task.title}</strong> — ${task.person} (${task.percent}%)
        <ul style="margin:4px 0 0 14px; padding:0;">
          ${task.subtasks.map(s => `<li>${s}</li>`).join("")}
        </ul>
      `;
      list.appendChild(li);
    });
  });
}

function initWeeklyTaskInputs() {
  categories.forEach(category => {
    const box = document.getElementById(`weekly-${category.toLowerCase()}`);
    if (!box) return;

    const titleInput = box.querySelector(".new-task-title");
    const subtasksInput = box.querySelector(".new-task-subtasks");

    let personInput = box.querySelector(".new-task-person");
    let percentInput = box.querySelector(".new-task-percent");

    // Inject dropdown of people
    if (!personInput) {
      personInput = document.createElement("select");
      personInput.className = "new-task-person";
      people.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        personInput.appendChild(opt);
      });
      subtasksInput.insertAdjacentElement("afterend", personInput);
    }

    // % Input
    if (!percentInput) {
      percentInput = document.createElement("input");
      percentInput.type = "number";
      percentInput.className = "new-task-percent";
      percentInput.placeholder = "%";
      percentInput.min = 0;
      percentInput.max = 100;
      personInput.insertAdjacentElement("afterend", percentInput);
    }

    // Add Task Button
    const addBtn = box.querySelector(".add-task-btn");
    addBtn.onclick = async () => {
      const quarter = getCurrentQuarter();
      const week = "Week 1";

      const title = titleInput.value.trim();
      const subtasks = subtasksInput.value.trim();
      const person = personInput.value;
      const percent = parseInt(percentInput.value) || 0;

      if (!title) return;

      const taskObj = {
        title,
        subtasks: subtasks ? subtasks.split(";").map(s => s.trim()) : [],
        person,
        percent
      };

      // Insert into structure
      if (!weeklyPlans[quarter]) weeklyPlans[quarter] = {};
      if (!weeklyPlans[quarter][week]) weeklyPlans[quarter][week] = {};
      if (!weeklyPlans[quarter][week][category]) weeklyPlans[quarter][week][category] = [];

      weeklyPlans[quarter][week][category].push(taskObj);

      // SAVE TO FIRESTORE
      await saveFS("dashboard/weeklyPlans", weeklyPlans);

      // Clear inputs
      titleInput.value = "";
      subtasksInput.value = "";
      percentInput.value = "";

      // Reload UI
      loadWeeklyTasks(quarter);
      renderWeeklyResourcing(quarter);
    };
  });
}

/********************************************
 *  WEEKLY RESOURCING (auto-calculated)
 ********************************************/
function renderWeeklyResourcing(quarter, week = "Week 1") {
  const container = document.getElementById("weekly-resourcing-grid");
  if (!container) return;

  const data = weeklyPlans[quarter]?.[week] || {};
  const totals = {};
  people.forEach(p => (totals[p] = {}));

  // Sum percentages: person → category → %
  categories.forEach(cat => {
    const list = data[cat] || [];
    list.forEach(task => {
      if (!totals[task.person][cat]) totals[task.person][cat] = 0;
      totals[task.person][cat] += task.percent;
    });
  });

  // Build table
  let html = `
    <table class="weekly-resourcing-table">
      <thead><tr><th>Person</th><th>Weekly Allocation</th></tr></thead>
      <tbody>
  `;

  people.forEach(person => {
    let segments = "";

    categories.forEach((cat, i) => {
      const val = totals[person][cat] || 0;
      if (val > 0) {
        segments += `
          <div class="weekly-resourcing-segment palette-${i + 1}-bg"
               style="width:${val}%;">
               ${val > 10 ? val + "%" : ""}
          </div>`;
      }
    });

    const bar =
      segments ||
      `<div class="weekly-resourcing-segment empty-segment"
            style="width:100%;background:#eee;color:#666;text-align:center;">
            0%
        </div>`;

    html += `
      <tr>
        <td style="text-align:left;padding-left:10px;">${person}</td>
        <td><div class="weekly-resourcing-row">${bar}</div></td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  container.innerHTML = html;
}
/********************************************
 *  DAILY LOGS (UI + Firestore)
 ********************************************/
async function saveDailyLogsFS() {
  // persist dailyLogs object to Firestore
  await saveFS("dashboard/dailyLogs", dailyLogs);
}

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
      <div class="yesterday">${escapeHtml(yesterdayUpdate)}</div>
      <label>Today's Update</label>
      <textarea class="today" data-name="${name}" placeholder="Write today's update...">${escapeHtml(todayUpdate)}</textarea>
    `;
    container.appendChild(box);
  });

  // live-save today's updates to local object + Firestore
  container.querySelectorAll(".today").forEach(el => {
    el.addEventListener("input", throttle(async (e) => {
      const name = e.target.dataset.name;
      const val = e.target.value;
      const todayKeyInner = new Date().toISOString().slice(0, 10);
      if (!dailyLogs[todayKeyInner]) dailyLogs[todayKeyInner] = {};
      if (!dailyLogs[todayKeyInner][name]) dailyLogs[todayKeyInner][name] = {};
      dailyLogs[todayKeyInner][name].today = val;
      // save locally and remotely (debounced/throttled)
      saveToStorage("dailyLogs", dailyLogs);
      await saveDailyLogsFS();
    }, 600));
  });
}

/********************************************
 *  SMALL HELPERS
 ********************************************/
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// simple throttle for input save
function throttle(fn, wait) {
  let last = 0;
  let scheduled = null;
  return function(...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    } else {
      if (scheduled) clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
        scheduled = null;
      }, wait - (now - last));
    }
  };
}

/********************************************
 *  PROGRESS INPUT LISTENER (MILESTONES)
 ********************************************/
document.addEventListener("input", async (e) => {
  if (e.target.classList.contains("progress-input")) {
    const quarter = e.target.dataset.quarter;
    const category = e.target.dataset.category;
    const id = e.target.dataset.id;
    const newValue = parseInt(e.target.value) || 0;
    // update in-memory and Firestore
    await updateMilestoneProgress(quarter, category, id, newValue);
    // also persist locally for snappy UI
    saveToStorage("milestonesData", milestonesData);
  }
});

/********************************************
 *  GLOBAL QUARTER SWITCH
 ********************************************/
document.getElementById('quarter-select').addEventListener('change', async () => {
  const q = getCurrentQuarter();

  // try to hydrate this quarter's data from Firestore (non-blocking)
  try {
    const fsMilestones = await loadFS("dashboard/milestones", { Q1: {}, Q4: {} });
    if (fsMilestones && fsMilestones[q]) milestonesData[q] = fsMilestones[q];
  } catch (err) { /* ignore */ }

  try {
    const fsWeekly = await loadFS("dashboard/weeklyPlans", { Q1: {}, Q4: {} });
    if (fsWeekly && fsWeekly[q]) weeklyPlans[q] = fsWeekly[q];
  } catch (err) { /* ignore */ }

  try {
    const fsRes = await loadFS("dashboard/resourcing", { Q1: {}, Q4: {} });
    if (fsRes && fsRes[q]) quarterlyResourcing[q] = fsRes[q];
  } catch (err) { /* ignore */ }

  renderQuarterlyOverview(q);
  renderQuarterlyResourcing(q);
  loadWeeklyTasks(q);
  renderWeeklyResourcing(q);
  renderDailyBoxes();
});

/********************************************
 *  INITIALIZATION: load Firestore & render UI
 ********************************************/
(async function initializeDashboard() {
  // Attempt to load everything from Firestore (best-effort).
  // If Firestore responds slowly/unavailable, fall back to localStorage data already present.
  try {
    const fsAll = await loadFS("dashboard/all", null);
    if (fsAll) {
      // If you prefer a single doc 'dashboard/all' you can use it; but keep compatibility:
      // fallback to the individual collections if fsAll is null.
    }
  } catch (err) {
    // ignore
  }

  // Load per-collection data (non-blocking pattern)
  (async () => {
    try {
      const ms = await loadFS("dashboard/milestones", { Q1: {}, Q4: {} });
      if (ms && Object.keys(ms).length) milestonesData = ms;
      saveToStorage("milestonesData", milestonesData);
    } catch (err) { /* ignore */ }

    try {
      const wp = await loadFS("dashboard/weeklyPlans", { Q1: {}, Q4: {} });
      if (wp && Object.keys(wp).length) weeklyPlans = wp;
      saveToStorage("weeklyPlans", weeklyPlans);
    } catch (err) { /* ignore */ }

    try {
      const dl = await loadFS("dashboard/dailyLogs", {});
      if (dl && Object.keys(dl).length) dailyLogs = dl;
      saveToStorage("dailyLogs", dailyLogs);
    } catch (err) { /* ignore */ }

    try {
      const rs = await loadFS("dashboard/resourcing", { Q1: {}, Q4: {} });
      if (rs && Object.keys(rs).length) quarterlyResourcing = rs;
      saveToStorage("resourcingData_v1", quarterlyResourcing);
    } catch (err) { /* ignore */ }

    // final render
    const q = getCurrentQuarter();
    renderQuarterlyOverview(q);
    renderQuarterlyResourcing(q);
    loadWeeklyTasks(q);
    renderWeeklyResourcing(q);
    initWeeklyTaskInputs();
    renderDailyBoxes();
  })();

  // immediate render from whatever local data exists for snappiness
  const q = getCurrentQuarter();
  renderQuarterlyOverview(q);
  renderQuarterlyResourcing(q);
  loadWeeklyTasks(q);
  renderWeeklyResourcing(q);
  initWeeklyTaskInputs();
  renderDailyBoxes();

  // try loading CSV (optional)
  loadMilestonesCSV();
})();

