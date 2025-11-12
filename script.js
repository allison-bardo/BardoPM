const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
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
document.getElementById("quarter-select").addEventListener("change", () => {
  const quarter = getCurrentQuarter();
  renderQuarterlyOverview(quarter);
  renderDailyUpdateInputs();
  loadWeeklyTasks(quarter);
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
  milestonesData = loadFromStorage("milestonesData", { Q4: {}, Q1: {} });
  renderQuarterlyOverview(getCurrentQuarter());
  renderDailyUpdateInputs();
  loadWeeklyTasks(getCurrentQuarter());
  loadMilestonesCSV();
});
