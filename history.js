/********************************************
 *  FIRESTORE INIT
 ********************************************/
var db = firebase.firestore();

/********************************************
 *  HELPERS
 ********************************************/
const el = id => document.getElementById(id);

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/********************************************
 *  FETCH and RENDER
 ********************************************/
async function getAllSourceQuarters() {
  const quarters = new Set();
  try {
    const msSnap = await db.doc("dashboard/milestones").get();
    if (msSnap.exists) Object.keys(msSnap.data()).forEach(k=>quarters.add(k));
  } catch(e){}
  try {
    const wpSnap = await db.doc("dashboard/weeklyPlans").get();
    if (wpSnap.exists) Object.keys(wpSnap.data()).forEach(k=>quarters.add(k));
  } catch(e){}
  try {
    const rsSnap = await db.doc("dashboard/resourcing").get();
    if (rsSnap.exists) Object.keys(rsSnap.data()).forEach(k=>quarters.add(k));
  } catch(e){}
  if (quarters.size === 0) { ["Q425","Q126","Q226","Q326","Q426"].forEach(q=>quarters.add(q)); }
  return Array.from(quarters).sort();
}

async function loadHistoryForQuarter(q) {
  el("milestones-history").innerHTML = "Loading…";
  el("weekly-history").innerHTML = "Loading…";
  el("resourcing-history").innerHTML = "Loading…";
  el("daily-history").innerHTML = "Loading…";

  try {
    const [msSnap, wpSnap, dlSnap, qrSnap] = await Promise.all([
      db.doc("dashboard/milestones").get(),
      db.doc("dashboard/weeklyPlans").get(),
      db.doc("dashboard/dailyLogs").get(),
      db.doc("dashboard/resourcing").get()
    ]);
    const msData = msSnap.exists ? msSnap.data() : {};
    const wpData = wpSnap.exists ? wpSnap.data() : {};
    const dlData = dlSnap.exists ? dlSnap.data() : {};
    const qrData = qrSnap.exists ? qrSnap.data() : {};

    renderMilestonesHistory(q, msData);
    renderWeeklyDropdown(q, wpData);
    renderWeeklyHistory(q, wpData);
    renderResourcingHistory(q, qrData);
    renderDailyHistory(dlData);

  } catch (err) {
    console.error(err);
    el("milestones-history").innerHTML = "Error loading history.";
  }
}

/********************************************
 *  MILESTONES HISTORY
 ********************************************/
function renderMilestonesHistory(q, data) {
  const container = el("milestones-history");
  const qdata = data[q] || {};

  if (!qdata || Object.keys(qdata).length === 0) {
    container.innerHTML = "<p>No milestones recorded for this quarter.</p>";
    return;
  }

  let html = "";
  Object.keys(qdata).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    (qdata[cat] || []).forEach(m => {
      html += `<li>
        <strong>${escapeHtml(m.title)}</strong><br>
        Date: ${escapeHtml(m.date || "—")}<br>
        Personnel: ${escapeHtml(m.people || "—")}<br>
        Progress: ${m.progress || 0}%
      </li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  WEEKLY — POPULATE WEEK DROPDOWN
 ********************************************/
function renderWeeklyDropdown(q, data) {
  const weekSelect = el("history-week-select");
  weekSelect.innerHTML = "";

  const qdata = data[q] || {};
  const weeks = Object.keys(qdata).sort();

  weeks.forEach(w => {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = w;
    weekSelect.appendChild(opt);
  });

  if (weeks.length > 0) {
    weekSelect.value = weeks[weeks.length - 1]; // latest week default
  }
}

/********************************************
 *  WEEKLY HISTORY
 ********************************************/
function renderWeeklyHistory(q, data) {
  const container = el("weekly-history");
  const weekSelect = el("history-week-select");
  const selectedWeek = weekSelect.value;

  const qdata = data[q] || {};
  if (!qdata || !qdata[selectedWeek]) {
    container.innerHTML = "<p>No weekly plans saved for this week.</p>";
    return;
  }

  const weekObj = qdata[selectedWeek];
  let html = `<h3>${selectedWeek}</h3>`;

  Object.keys(weekObj).forEach(cat => {
    html += `<h4>${cat}</h4><ul>`;
    (weekObj[cat] || []).forEach(t => {
      html += `<li>
        <strong>${escapeHtml(t.title)}</strong> — ${escapeHtml(t.person)} (${t.percent}%)
        <div style="margin-left:12px">
          ${ (t.subtasks||[]).map(s => `<div>• ${escapeHtml(s)}</div>`).join("") }
        </div>
      </li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  QUARTERLY RESOURCING HISTORY
 ********************************************/
function renderResourcingHistory(q, data) {
  const container = el("resourcing-history");
  const qdata = data[q] || {};

  if (!qdata || Object.keys(qdata).length === 0) {
    container.innerHTML = "<p>No resourcing saved.</p>";
    return;
  }

  let html = "";
  Object.keys(qdata).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    Object.keys(qdata[cat] || {}).forEach(person => {
      html += `<li><strong>${person}:</strong> ${qdata[cat][person]}%</li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  DAILY LOG HISTORY
 ********************************************/
function renderDailyHistory(dailyData) {
  const container = el("daily-history");

  if (!dailyData || Object.keys(dailyData).length === 0) {
    container.innerHTML = "<p>No daily logs saved.</p>";
    return;
  }

  let html = "";

  Object.keys(dailyData).sort().forEach(day => {
    html += `<h3>${day}</h3><ul>`;
    const people = dailyData[day] || {};
    Object.keys(people).forEach(name => {
      html += `<li>
        <strong>${name}</strong><br>
        ${escapeHtml((people[name] && people[name].today) || "—")}
      </li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  QUARTER SELECT (auto-populate) + listeners
 ********************************************/
async function initQuarterSelect() {
  const qsel = el("history-quarter-select");
  qsel.innerHTML = "";

  const quarters = await getAllSourceQuarters();
  quarters.forEach(q => {
    const opt = document.createElement("option");
    opt.value = q;
    opt.textContent = q;
    qsel.appendChild(opt);
  });

  qsel.value = quarters[quarters.length - 1];

  qsel.addEventListener('change', (e) => {
    loadHistoryForQuarter(e.target.value);
  });

  // hook week select change
  el("history-week-select").addEventListener("change", () => {
    const q = el("history-quarter-select").value;
    loadHistoryForQuarter(q);
  });

  // initial load
  loadHistoryForQuarter(qsel.value);
}

/********************************************
 *  INIT
 ********************************************/
initQuarterSelect();
