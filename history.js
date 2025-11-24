/********************************************
 *  FIRESTORE (Firebase v8)
 ********************************************/
var db = firebase.firestore();

/********************************************
 *  QUARTER LIST (full-year)
 ********************************************/
const ALL_QUARTERS = [
  "Q125","Q225","Q325","Q425",
  "Q126","Q226","Q326","Q426"
];

/********************************************
 *  HELPERS
 ********************************************/
function el(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

/********************************************
 *  LOAD HISTORY FOR SELECTED QUARTER
 ********************************************/
async function loadQuarterHistory(q) {
  el("milestones-history").innerHTML = "Loading…";
  el("weekly-history").innerHTML = "Loading…";
  el("daily-history").innerHTML = "Loading…";

  try {
    // Load milestones
    const msSnap = await db.doc("dashboard/milestones").get();
    const msData = msSnap.exists ? msSnap.data() : {};

    // Load weekly
    const wpSnap = await db.doc("dashboard/weeklyPlans").get();
    const wpData = wpSnap.exists ? wpSnap.data() : {};

    // Load daily
    const dlSnap = await db.doc("dashboard/dailyLogs").get();
    const dlData = dlSnap.exists ? dlSnap.data() : {};

    // Load quarterly resourcing
    const qrSnap = await db.doc("dashboard/resourcing").get();
    const qrData = qrSnap.exists ? qrSnap.data() : {};

    renderMilestonesHistory(q, msData);
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
  const qdata = data[q];
  if (!qdata) {
    container.innerHTML = "<p>No milestones recorded for this quarter.</p>";
    return;
  }

  let html = "";
  Object.keys(qdata).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    qdata[cat].forEach(m => {
      html += `<li>
        <strong>${escapeHtml(m.title)}</strong><br>
        Date: ${escapeHtml(m.date || "—")}<br>
        Personnel: ${escapeHtml(m.people || "—")}<br>
        Progress: ${m.progress}%
      </li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  WEEKLY HISTORY (SNAPSHOTS)
 ********************************************/
function renderWeeklyHistory(q, data) {
  const container = el("weekly-history");
  const qdata = data[q];
  if (!qdata) {
    container.innerHTML = "<p>No weekly plans saved.</p>";
    return;
  }

  let html = "";
  Object.keys(qdata).forEach(week => {
    html += `<h3>${week}</h3>`;

    const weekObj = qdata[week];
    Object.keys(weekObj).forEach(cat => {
      html += `<h4>${cat}</h4><ul>`;
      weekObj[cat].forEach(t => {
        html += `<li>
          <strong>${escapeHtml(t.title)}</strong> — ${t.person} (${t.percent}%)
          <div style="margin-left:12px">
            ${t.subtasks.map(s => `<div>• ${escapeHtml(s)}</div>`).join("")}
          </div>
        </li>`;
      });
      html += "</ul>";
    });
  });

  container.innerHTML = html;
}

/********************************************
 *  QUARTERLY RESOURCING HISTORY
 ********************************************/
function renderResourcingHistory(q, data) {
  const container = el("resourcing-history");
  const qdata = data[q];
  if (!qdata) {
    container.innerHTML = "<p>No quarterly resourcing saved.</p>";
    return;
  }

  let html = "";

  Object.keys(qdata).forEach(cat => {
    html += `<h3>${cat}</h3><ul>`;
    Object.keys(qdata[cat]).forEach(person => {
      const val = qdata[cat][person];
      html += `<li><strong>${person}:</strong> ${val}%</li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  DAILY HISTORY
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
    const people = dailyData[day];
    Object.keys(people).forEach(name => {
      html += `<li>
        <strong>${name}</strong><br>
        ${escapeHtml(people[name].today || "—")}
      </li>`;
    });
    html += "</ul>";
  });

  container.innerHTML = html;
}

/********************************************
 *  QUARTER SELECT
 ********************************************/
document.getElementById("history-quarter-select").addEventListener("change", e => {
  const q = e.target.value;
  loadQuarterHistory(q);
});

/********************************************
 *  INIT DEFAULT LOAD
 ********************************************/
loadQuarterHistory("Q425");
