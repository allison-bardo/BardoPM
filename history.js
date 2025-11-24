// ========== History.js with ApexCharts Resourcing Comparison ==========

// ---------------- Firestore ----------------
const db = firebase.firestore();

// --------- Utility ---------
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sortWeeks(weeks) {
  return weeks.sort((a,b) => (a > b ? -1 : 1));
}

// --------- Chart Globals ---------
const CATEGORY_COLORS = {
  Materials:   "#4b8df8",
  Fabrication: "#d84bf8",
  Durability:  "#50c878",
  ScaleUp:     "#f4b400",
  Operations:  "#ff6f61"
};

const categories = ["Materials", "Fabrication", "Durability", "ScaleUp", "Operations"];
const people = ["Allison","Christian","Cyril","Mike","Ryszard","SamL","SamW"];

let quarterChart = null;
let weeklyChart = null;

// --------- Quarter Keys ---------
async function loadQuarterKeys() {
  const snap = await db.doc("dashboard/weeklyPlans").get();
  if (!snap.exists) return [];
  return Object.keys(snap.data() || {});
}

async function loadWeekKeys(quarter) {
  const snap = await db.doc("dashboard/weeklyPlans").get();
  if (!snap.exists) return [];
  const data = snap.data()[quarter] || {};
  return sortWeeks(Object.keys(data));
}

// --------- Dropdowns ---------
async function populateDropdowns() {
  const qSel = document.getElementById("history-quarter-select");
  const wSel = document.getElementById("history-week-select");

  const quarters = await loadQuarterKeys();
  qSel.innerHTML = quarters.map(q => `<option>${q}</option>`).join("");

  const firstQ = quarters[quarters.length - 1];
  const weeks = await loadWeekKeys(firstQ);
  wSel.innerHTML = weeks.map(w => `<option>${w}</option>`).join("");
}

// --------- HISTORY SECTIONS ---------

// ---- Milestones History ----
async function loadMilestoneHistory(quarter, weekKey) {
  const out = document.getElementById("milestones-history");
  out.innerHTML = "Loading…";

  const histSnap = await db.doc("dashboard/history/weeks").get();
  if (!histSnap.exists) {
    out.innerHTML = "No milestone history found.";
    return;
  }

  const hist = histSnap.data() || {};
  const weekObj = hist[weekKey];
  if (!weekObj || !weekObj.data) {
    out.innerHTML = "No milestone entries for this week.";
    return;
  }

  let html = "";
  const data = weekObj.data;

  Object.keys(data).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    (data[cat] || []).forEach(m => {
      html += `<li><strong>${escapeHtml(m.title)}</strong> — ${escapeHtml(m.person || "")}</li>`;
    });
    html += "</ul>";
  });

  out.innerHTML = html || "No data.";
}

// ---- Weekly Tasks ----
async function loadWeeklyHistory(quarter, weekKey) {
  const out = document.getElementById("weekly-history");
  out.innerHTML = "Loading…";

  const snap = await db.doc("dashboard/weeklyPlans").get();
  if (!snap.exists) {
    out.innerHTML = "No weekly data found.";
    return;
  }

  const data = snap.data()[quarter]?.[weekKey] || {};
  let html = "";

  Object.keys(data).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    data[cat].forEach(task => {
      html += `<li><strong>${escapeHtml(task.title)}</strong> — ${escapeHtml(task.person || "")} (${task.percent}%)</li>`;
    });
    html += "</ul>";
  });

  out.innerHTML = html || "No weekly tasks.";
}

// ---- Quarterly Resourcing Chart ----
function buildQuarterlyChart(resourcingData) {
  if (!resourcingData) resourcingData = {};

  const series = categories.map(cat => ({
    name: cat,
    data: people.map(p => resourcingData?.[cat]?.[p] || 0),
    color: CATEGORY_COLORS[cat]
  }));

  const options = {
    chart: { type: 'bar', height: 380, stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
    series,
    xaxis: { categories: people },
    legend: { position: 'bottom' }
  };

  if (quarterChart) quarterChart.destroy();

  quarterChart = new ApexCharts(
    document.querySelector("#quarterly-resourcing-chart"),
    options
  );

  quarterChart.render();
}

// ---- Weekly Resourcing Aggregation ----
function computeWeeklyResourcing(weekData) {
  const totals = {};
  people.forEach(p => totals[p] = {
    Materials:0, Fabrication:0, Durability:0, ScaleUp:0, Operations:0
  });

  if (!weekData) return totals;

  Object.keys(weekData).forEach(cat => {
    weekData[cat].forEach(task => {
      const p = task.person;
      const percent = task.percent || 0;
      if (totals[p]) totals[p][cat] += percent;
    });
  });

  return totals;
}

// ---- Weekly Chart ----
function buildWeeklyChart(weeklyData) {
  const data = computeWeeklyResourcing(weeklyData);

  const series = categories.map(cat => ({
    name: cat,
    data: people.map(p => data[p][cat] || 0),
    color: CATEGORY_COLORS[cat]
  }));

  const options = {
    chart: { type: 'bar', height: 380, stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
    series,
    xaxis: { categories: people },
    legend: { position: 'bottom' }
  };

  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new ApexCharts(
    document.querySelector("#weekly-resourcing-chart"),
    options
  );

  weeklyChart.render();
}

// ---- Quarterly Resourcing Text History ----
async function loadResourcingHistory(quarter) {
  const out = document.getElementById("resourcing-history");
  out.innerHTML = "Loading…";

  const snap = await db.doc("dashboard/resourcing").get();
  if (!snap.exists) {
    out.innerHTML = "No resourcing data.";
    return;
  }

  const data = snap.data()[quarter] || {};
  let html = "";

  Object.keys(data).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    Object.keys(data[cat] || {}).forEach(person => {
      const amt = data[cat][person];
      if (amt > 0) html += `<li>${person}: ${amt}%</li>`;
    });
    html += "</ul>";
  });

  out.innerHTML = html || "No resourcing.";
}

// ---- Daily Logs ----
async function loadDailyHistory(quarter) {
  const out = document.getElementById("daily-history");
  out.innerHTML = "Loading…";

  const snap = await db.doc("dashboard/dailyLogs").get();
  if (!snap.exists) {
    out.innerHTML = "No daily logs.";
    return;
  }

  const logs = snap.data() || {};
  let html = "";

  Object.keys(logs).forEach(date => {
    html += `<h3>${date}</h3><ul>`;
    Object.keys(logs[date] || {}).forEach(person => {
      const entry = logs[date][person];
      if (!entry) return;
      html += `<li><strong>${escapeHtml(person)}</strong>: ${escapeHtml(entry)}</li>`;
    });
    html += `</ul>`;
  });

  out.innerHTML = html || "No daily logs.";
}.forEach(date => {
    html += `<h3>${date}</h3><ul>`;
    Object.keys(logs[date]).
