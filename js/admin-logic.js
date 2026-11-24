/**
 * EXAM GUARDIAN — ADMIN COMMAND LOGIC v3.0
 * Real-time intelligence, student grid, mobile cam, export
 */

// ============================================================
// INIT
// ============================================================
const user      = typeof Auth !== 'undefined' ? Auth.requireAuth('admin') : { name: 'DEMO-ADMIN', id: 'adm001' };
let examId      = localStorage.getItem('current_exam_id');
let examTitle   = localStorage.getItem('current_exam_title') || 'COMMAND_CENTER';
const socket    = io(window.location.origin);

document.addEventListener('DOMContentLoaded', () => {
  if (!examId) {
    // Keep modal hidden, just preset the dates for when they DO open it manually
    const now = new Date();
    document.getElementById('exam-date-input').valueAsDate = now;
    document.getElementById('exam-time-input').value = now.toTimeString().substring(0,5);
  } else {
    updateHeaderWithExam();
  }
});

function updateHeaderWithExam() {
  const titleEl = document.querySelector('header h1 + p');
  if(titleEl) titleEl.textContent = `${examTitle.toUpperCase()} // ${examId}`;
  
  const reportTitle = document.querySelector('#export-modal h3');
  if(reportTitle) reportTitle.textContent = `Intelligence Report — ${examId}`;
}

window.initializeExam = () => {
  const title = document.getElementById('exam-title-input').value.trim() || 'Exam Session';
  const id    = document.getElementById('exam-id-input').value.trim().toUpperCase() || ('EXAM_' + Math.floor(Math.random()*10000));
  const dur   = document.getElementById('exam-duration-input').value.trim() || '90';

  localStorage.setItem('current_exam_id', id);
  localStorage.setItem('current_exam_title', title);
  localStorage.setItem('current_exam_duration', dur);

  // Track total exams created
  const prevCount = parseInt(localStorage.getItem('eg_exam_count') || '0', 10);
  const newCount = prevCount + 1;
  localStorage.setItem('eg_exam_count', newCount);
  const createdEl = document.getElementById('stat-exams-created');
  if (createdEl) createdEl.textContent = newCount;

  // Store this exam in history
  const history = JSON.parse(localStorage.getItem('eg_exam_history') || '[]');
  history.push({ id, title, createdAt: new Date().toISOString(), duration: dur });
  localStorage.setItem('eg_exam_history', JSON.stringify(history));

  examId = id;
  examTitle = title;
  document.getElementById('create-exam-modal').classList.add('hidden');
  updateHeaderWithExam();
  updateDashboardExamLabel();

  socket.emit('admin:join', { examId });
  appendLedger('sys', `Exam Session [${examId}] Live`, 'emerald');

  // Show live dot in sidebar
  const liveDot = document.getElementById('monitoring-live-dot');
  if (liveDot) liveDot.classList.remove('hidden');

  if (typeof renderAdminExamSessions === 'function') {
    renderAdminExamSessions();
  }
  // Auto-switch to Live Monitoring
  if (typeof switchTabById === 'function') switchTabById('monitoring');
};

let activeStudents  = new Map(); // studentId → state
let selectedTarget  = null;
let totalAlerts     = 0;
let sortByRisk      = true;   // toggle: risk desc vs. name asc
let riskChart       = null;
let riskHistory     = {};     // studentId → [scores]
let currentModalTarget = null;

document.getElementById('admin-name').textContent = user.name.toUpperCase();

// Restore exam count from localStorage on load
document.addEventListener('DOMContentLoaded', () => {
  const storedCount = parseInt(localStorage.getItem('eg_exam_count') || '0', 10);
  const createdEl = document.getElementById('stat-exams-created');
  if (createdEl) createdEl.textContent = storedCount;

  renderAdminExamSessions();
});

function renderAdminExamSessions() {
  const history = JSON.parse(localStorage.getItem('eg_exam_history') || '[]');
  const tableBody = document.getElementById('sessions-table-body');
  if (!tableBody) return;
  
  if (history.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-600 text-sm">No exam sessions created yet.</td></tr>';
    return;
  }
  
  tableBody.innerHTML = '';
  // iterate in reverse so newest is on top
  [...history].reverse().forEach(exam => {
    const isCurrent = exam.id === localStorage.getItem('current_exam_id');
    const durHr = exam.duration ? exam.duration + " Min" : "90 Min";
    const statusHtml = isCurrent 
      ? '<span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">Active Protocol</span>' 
      : '<span class="px-2 py-1 rounded bg-slate-500/10 text-slate-400 text-[10px] font-bold">Stored</span>';
      
    const tr = document.createElement('tr');
    tr.className = 'border-b border-white/5 hover:bg-slate-800/30 transition';
    tr.innerHTML = `
      <td class="px-4 py-3 font-semibold text-white tracking-wide">${exam.title}</td>
      <td class="px-4 py-3 text-indigo-400 font-mono text-xs uppercase">${exam.id}</td>
      <td class="px-4 py-3 text-slate-400 text-sm">${durHr}</td>
      <td class="px-4 py-3">${statusHtml}</td>
      <td class="px-4 py-3">
        <button onclick="setGlobalExamId('${exam.id}', '${exam.title}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold transition shadow shadow-indigo-500/20 flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
          Focus &amp; Monitor
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.setGlobalExamId = (id, title) => {
  localStorage.setItem('current_exam_id', id);
  localStorage.setItem('current_exam_title', title);
  examId = id;
  examTitle = title;
  updateHeaderWithExam();
  updateDashboardExamLabel();
  renderAdminExamSessions();

  // Re-join the socket room for this exam
  socket.emit('admin:join', { examId: id });
  appendLedger('sys', `Focused on Exam [${id}]`, 'indigo');

  // Show live dot
  const liveDot = document.getElementById('monitoring-live-dot');
  if (liveDot) liveDot.classList.remove('hidden');

  // Switch to Live Monitoring tab
  if (typeof switchTabById === 'function') switchTabById('monitoring');
};

function updateDashboardExamLabel() {
  const el = document.getElementById('dash-active-exam');
  if (el) el.textContent = examId ? `${examTitle} — ${examId}` : 'No session active';
}

// ============================================================
// CHART INIT
// ============================================================
function initChart() {
  const canvas = document.getElementById('riskChart');
  if (!canvas) return; // view-monitoring may be hidden, retry on tab switch
  if (riskChart) return; // already initialized
  const ctx = canvas.getContext('2d');
  riskChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(30).fill(''),
      datasets: [{
        label: 'Risk',
        data: Array(30).fill(0),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.05)',
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(30,41,59,0.8)' },
          ticks: { color: '#334155', font: { size: 9, family: 'JetBrains Mono' }, stepSize: 25 }
        },
        x: { display: false }
      },
      plugins: { legend: { display: false } }
    }
  });
}
// Init chart lazily when the monitoring tab becomes visible
document.addEventListener('DOMContentLoaded', () => {
  // Try immediately; will succeed if view-monitoring is shown first
  initChart();
});
// Expose so switchTab('monitoring') can call it
window.ensureChartInit = initChart;

// ============================================================
// SOCKET — ADMIN JOIN
// ============================================================
socket.on('connect', () => {
  if (examId) {
    socket.emit('admin:join', { examId });
    appendLedger('sys', 'Connected to Intelligence Engine', 'slate');
  }
});

socket.on('disconnect', () => {
  appendLedger('sys', 'Disconnected from server — attempting reconnect...', 'crimson');
});

// ============================================================
// SOCKET — INCOMING EVENTS
// ============================================================

// Full snapshot on connect
socket.on('admin:snapshot', (students) => {
  students.forEach(s => {
    activeStudents.set(s.studentId, s);
    initRiskHistory(s.studentId);
  });
  rebuildGrid();
  updateStats();
});

// Access request from student waiting room
socket.on('admin:join_request', (req) => {
  // --- Sidebar widget ---
  const container = document.getElementById('approvals-container');
  const list      = document.getElementById('approvals-list');
  if (container) container.classList.remove('hidden');

  const reqId = `req-${req.studentId}`;
  if (document.getElementById(reqId)) return; // already rendered

  list.insertAdjacentHTML('beforeend', `
    <div id="${reqId}" class="flex items-center gap-1.5 bg-slate-950 border border-amber-500/30 px-2 py-1 text-[9px] font-mono text-slate-300">
      <span class="text-amber-400 font-bold">${req.studentName}</span>
      <span class="text-slate-600">${req.studentId}</span>
      <button onclick="approveStudent('${req.studentId}')" class="bg-emerald-700 hover:bg-emerald-600 text-white px-1.5 py-0.5 ml-1 font-bold transition-colors">✓</button>
      <button onclick="denyStudent('${req.studentId}')"   class="bg-red-700 hover:bg-red-600 text-white px-1.5 py-0.5 font-bold transition-colors">✗</button>
    </div>
  `);

  // --- Requests tab table ---
  const tbody = document.getElementById('requests-table-body');
  if (tbody) {
    // Remove empty-state row if present
    const empty = tbody.querySelector('tr td[colspan]');
    if (empty) empty.closest('tr').remove();

    const rowId = `req-row-${req.studentId}`;
    if (!document.getElementById(rowId)) {
      tbody.insertAdjacentHTML('afterbegin', `
        <tr id="${rowId}" class="border-b border-white/5 hover:bg-white/[0.02] transition">
          <td class="px-4 py-3">
            <div class="font-semibold text-white">${req.studentName}</div>
            <div class="text-[11px] text-slate-500 font-mono">${req.studentId}</div>
          </td>
          <td class="px-4 py-3 text-slate-400 text-sm">—</td>
          <td class="px-4 py-3">
            <span class="text-[11px] font-mono text-indigo-400 uppercase bg-indigo-500/10 px-2 py-1 rounded">${req.examId || examId || '—'}</span>
          </td>
          <td class="px-4 py-3">
            <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block"></span>Pending
            </span>
          </td>
          <td class="px-4 py-3 text-right flex justify-end gap-2">
            <button onclick="approveStudent('${req.studentId}')" class="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold transition">✓ Approve</button>
            <button onclick="denyStudent('${req.studentId}')"   class="px-3 py-1.5 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold transition">✗ Deny</button>
          </td>
        </tr>
      `);
    }
  }

  // --- Update pending badge in nav ---
  updateRequestsBadge();

  appendLedger('access', `${req.studentName} (${req.studentId}) requesting entry`, 'amber');
  // Flash title notification
  document.title = '🔔 Access Request — Exam Guardian';
  setTimeout(() => { document.title = 'Exam Guardian — Admin Command Center'; }, 4000);
});

// Risk state update per student
socket.on('risk:update', (state) => {
  const existing = activeStudents.get(state.studentId);
  if (existing && existing.lastPrimaryFrame) {
    state.lastPrimaryFrame = existing.lastPrimaryFrame;
  }
  activeStudents.set(state.studentId, state);
  appendRiskHistory(state.studentId, state.riskScore);
  renderCard(state);
  updateStats();
  if (selectedTarget === state.studentId) {
    renderTargetDetails(state);
    advanceChart(state);
  }
});

// Online/offline status
socket.on('student:status_change', ({ studentId, studentName, isOnline }) => {
  const existing = activeStudents.get(studentId);
  if (existing) {
    existing.isOnline = isOnline;
    if (studentName) existing.studentName = studentName;
    renderCard(existing);
    updateStats();
  }
  appendLedger('conn', `${studentName || studentId} went ${isOnline ? 'ONLINE' : 'OFFLINE'}`, isOnline ? 'emerald' : 'slate');
});

// Live violation alert
socket.on('alert:live', (alert) => {
  totalAlerts++;
  const alertEl = document.getElementById('stat-alerts');
  if (alertEl) alertEl.textContent = totalAlerts;

  const isCrit = alert.analysis.prob > 60 || alert.analysis.penalty >= 30;
  const color  = isCrit ? 'crimson' : 'amber';

  appendLedger(
    alert.eventData.event.replace('_', ' ').toUpperCase(),
    `${alert.studentName || alert.studentId} — ${alert.eventData.details || ''}`,
    color,
    `+${alert.analysis.penalty} risk · ${100 - alert.analysis.prob}% trust`
  );

  // Flash card
  const card = document.getElementById(`card-${alert.studentId}`);
  if (card) card.classList.add('alert-flash');
  setTimeout(() => card && card.classList.remove('alert-flash'), 500);
});

// Live telemetry (head pose for selected target)
socket.on('telemetry:live', (data) => {
  if (selectedTarget !== data.studentId) return;
  const pitchEl = document.getElementById('t-pitch');
  const yawEl   = document.getElementById('t-yaw');
  if (pitchEl) pitchEl.textContent = data.pitch + '°';
  if (yawEl)   yawEl.textContent   = data.yaw   + '°';
});

// Primary camera frame (for all students in grid)
socket.on('primary_cam:stream_frame', (data) => {
  const s = activeStudents.get(data.studentId);
  if (s) {
    s.lastPrimaryFrame = data.image; // cache
  }
  const feedEl      = document.getElementById(`primary-cam-feed-${data.studentId}`);
  const placeholder = document.getElementById(`cam1-placeholder-${data.studentId}`);
  if (feedEl && data.image) {
    feedEl.src = data.image;
    feedEl.classList.remove('hidden');
    if (placeholder) placeholder.style.display = 'none';
  }
});

// Mobile camera frame
socket.on('mobile:stream_frame', (data) => {
  // Update status LED
  const led = document.getElementById('mobile-led');
  const txt = document.getElementById('mobile-status-text');
  if (led) { led.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500'; }
  if (txt) { txt.textContent = `LIVE · ${data.studentId}`; txt.className = 'text-[9px] font-mono text-emerald-400 uppercase'; }

  // Show feed if target is this student OR no target selected
  if (!selectedTarget || selectedTarget === data.studentId) {
    const feedEl      = document.getElementById('mobile-cam-feed');
    const placeholder = document.getElementById('cam2-placeholder');
    if (feedEl && data.image) {
      feedEl.src = data.image;
      feedEl.classList.remove('hidden');
      if (placeholder) placeholder.style.display = 'none';
    }
  }
});

// Mobile status (active/offline)
socket.on('mobile:status', (data) => {
  const led = document.getElementById('mobile-led');
  const txt = document.getElementById('mobile-status-text');
  if (data.active) {
    if (led) led.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 blink';
    if (txt) { txt.textContent = `SYNCING · ${data.studentId}`; txt.className = 'text-[9px] font-mono text-amber-400 uppercase'; }
    appendLedger('mobile', `Mobile cam linked for ${data.studentId}`, 'amber');
  }
});

// ============================================================
// APPROVE / DENY
// ============================================================
window.approveStudent = (studentId) => {
  socket.emit('admin:approve_access', { studentId, approved: true });
  removeApprovalCard(studentId);
  appendLedger('access', `Access GRANTED to ${studentId}`, 'emerald');
};

window.denyStudent = (studentId) => {
  socket.emit('admin:approve_access', { studentId, approved: false });
  removeApprovalCard(studentId);
  appendLedger('access', `Access DENIED for ${studentId}`, 'crimson');
};

function removeApprovalCard(studentId) {
  // Remove from sidebar widget
  const el = document.getElementById(`req-${studentId}`);
  if (el) el.remove();
  const list = document.getElementById('approvals-list');
  if (list && list.children.length === 0) {
    document.getElementById('approvals-container').classList.add('hidden');
  }

  // Remove from requests tab table
  const row = document.getElementById(`req-row-${studentId}`);
  if (row) row.remove();

  // Show empty state if no more rows
  const tbody = document.getElementById('requests-table-body');
  if (tbody && tbody.children.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-slate-600 text-sm">No pending join requests.</td></tr>';
  }

  // Update badge count
  updateRequestsBadge();
}

function updateRequestsBadge() {
  const tbody = document.getElementById('requests-table-body');
  const pendingRows = tbody ? tbody.querySelectorAll('tr[id^="req-row-"]').length : 0;

  // Update the Pending (N) filter button inside the requests view
  const pendingBtn = document.querySelector('#view-requests button');
  if (pendingBtn) pendingBtn.textContent = `Pending (${pendingRows})`;

  // Add a red dot badge on the sidebar "Join Requests" nav link if pending
  const navLink = document.querySelector('#sidebar-nav .nav-link[onclick*="requests"]');
  if (navLink) {
    const existingBadge = navLink.querySelector('.req-badge');
    if (pendingRows > 0) {
      if (!existingBadge) {
        navLink.insertAdjacentHTML('beforeend', `<span class="req-badge ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-[10px] font-bold text-white">${pendingRows}</span>`);
      } else {
        existingBadge.textContent = pendingRows;
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  }
}

// ============================================================
// STUDENT GRID — RENDER
// ============================================================
function rebuildGrid() {
  const grid     = document.getElementById('student-grid');
  const students = Array.from(activeStudents.values());

  if (students.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-24 text-center text-slate-700 font-mono text-xs border border-slate-800 border-dashed" id="grid-empty">
      <div class="text-2xl mb-3 opacity-30">⊡</div>AWAITING WEBSOCKET CONNECTIONS...</div>`;
    return;
  }

  // Remove empty placeholder
  const empty = document.getElementById('grid-empty');
  if (empty) empty.remove();

  students.forEach(s => renderCard(s));
}

function renderCard(s) {
  const grid = document.getElementById('student-grid');
  let card   = document.getElementById(`card-${s.studentId}`);

  // Remove empty placeholder if present
  const empty = document.getElementById('grid-empty');
  if (empty) empty.remove();

  if (!card) {
    card = document.createElement('div');
    card.id        = `card-${s.studentId}`;
    card.className = 'card-enter';
    card.onclick   = () => selectTarget(s.studentId);
    grid.appendChild(card);
  }

  // Risk color theming
  let riskBorder = 'border-slate-800';
  let riskBg     = 'bg-slate-900/60';
  let riskNumCls = 'text-emerald-400';
  let riskBadge  = '';

  if (s.riskScore > 40) {
    riskBorder = 'border-amber-500/40';
    riskBg     = 'bg-amber-950/20';
    riskNumCls = 'text-amber-400';
    riskBadge  = `<span class="text-[8px] font-mono bg-amber-900/50 text-amber-400 border border-amber-700/50 px-1 py-0.5 uppercase">MODERATE</span>`;
  }
  if (s.riskScore > 75) {
    riskBorder = 'border-crimson-500';
    riskBg     = 'bg-crimson-950/40';
    riskNumCls = 'text-crimson-400 blink';
    riskBadge  = `<span class="text-[8px] font-mono bg-crimson-950 text-crimson-400 border border-crimson-700 px-1 py-0.5 uppercase blink">HIGH RISK</span>`;
  }

  const isSelected = selectedTarget === s.studentId ? 'ring-1 ring-indigo-500' : '';

  let overlayHtml = '';
  if (s.isSubmitted) {
    overlayHtml = `<div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
                     <div class="text-emerald-400 font-bold tracking-widest text-[10px]">EXAM SUBMITTED</div>
                     <div class="text-[8px] text-slate-400 font-mono text-center px-4 mt-1">Session finalized.</div>
                   </div>`;
  } else if (!s.isOnline) {
    overlayHtml = `<div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
                     <div class="text-slate-400 font-bold tracking-widest text-[10px]">OFFLINE</div>
                     <div class="text-[8px] text-slate-500 font-mono text-center px-4 mt-1">Connection dropped or window closed.</div>
                   </div>`;
  }

  const camFeedHtml = s.lastPrimaryFrame
    ? `<img id="primary-cam-feed-${s.studentId}" class="w-full h-full object-cover absolute inset-0 block" src="${s.lastPrimaryFrame}" alt="Primary feed">
       <span id="cam1-placeholder-${s.studentId}" style="display:none;" class="text-[9px] text-slate-700 font-mono uppercase tracking-widest">Awaiting Cam...</span>`
    : `<img id="primary-cam-feed-${s.studentId}" class="w-full h-full object-cover absolute inset-0 hidden" src="" alt="Primary feed">
       <span id="cam1-placeholder-${s.studentId}" class="text-[9px] text-slate-700 font-mono uppercase tracking-widest">Awaiting Cam...</span>`;

  card.className = `p-3 border cursor-pointer hover:border-slate-600 transition-all flex flex-col gap-3 ${riskBorder} ${riskBg} ${isSelected}`;
  card.innerHTML = `
    <!-- Header -->
    <div class="flex justify-between items-start">
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold text-slate-100 truncate">${s.studentName || s.studentId}</div>
        <div class="text-[9px] font-mono text-slate-600 mt-0.5">${s.studentId}</div>
      </div>
      <div class="flex flex-col items-end gap-1 ml-2">
        <div class="w-2 h-2 rounded-none ${s.isOnline ? 'bg-emerald-500' : 'bg-slate-700'} status-dot"></div>
        ${riskBadge}
      </div>
    </div>

    <!-- Live Cam -->
    <div class="bg-black border border-slate-800 relative w-full aspect-video flex items-center justify-center overflow-hidden shrink-0 mt-1">
      ${camFeedHtml}
      ${overlayHtml}
    </div>

    <!-- Risk Bar -->
    <div>
      <div class="flex justify-between text-[8px] font-mono mb-1">
        <span class="text-slate-600 uppercase tracking-widest">Risk Score</span>
        <span class="${riskNumCls} font-bold">${String(s.riskScore).padStart(3, '0')}</span>
      </div>
      <div class="h-1 bg-slate-800 w-full overflow-hidden">
        <div class="risk-bar h-full ${s.riskScore > 75 ? 'bg-crimson-500' : (s.riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500')}" style="width:${s.riskScore}%"></div>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="flex justify-between items-end">
      <div>
        <div class="text-[8px] font-mono text-slate-600 uppercase mb-0.5">AI Prob.</div>
        <div class="text-base font-bold font-mono text-slate-300">${s.cheatingProbability}<span class="text-xs text-slate-600">%</span></div>
      </div>
      <div class="text-right">
        <div class="flex gap-1.5 text-[9px] font-mono text-slate-500">
          <span title="Gaze Anomalies">G:${s.stats ? s.stats.gazeAnomalies : 0}</span>
          <span title="Tab switches">T:${s.stats ? s.stats.tabSwitches : 0}</span>
          <span title="Face lost">F:${s.stats ? s.stats.faceLost : 0}</span>
          <span title="Multi-face">M:${s.stats ? s.stats.multiFace : 0}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// TARGET SELECTION & DETAIL PANEL
// ============================================================
function selectTarget(studentId) {
  selectedTarget = studentId;
  const s = activeStudents.get(studentId);
  if (!s) return;

  // Re-render all cards to update selection ring
  activeStudents.forEach(st => renderCard(st));

  document.getElementById('target-id').textContent   = studentId;
  document.getElementById('chart-target-label').textContent = s.studentName || studentId;
  renderTargetDetails(s);

  // Reset & seed chart with history
  if (riskChart && riskHistory[studentId]) {
    const hist = riskHistory[studentId].slice(-30);
    const padded = Array(30 - hist.length).fill(0).concat(hist);
    riskChart.data.datasets[0].data         = padded;
    riskChart.data.datasets[0].borderColor  = s.riskScore > 75 ? '#ef4444' : (s.riskScore > 40 ? '#f59e0b' : '#6366f1');
    riskChart.data.datasets[0].backgroundColor = s.riskScore > 75 ? 'rgba(220,38,38,0.06)' : 'rgba(99,102,241,0.05)';
    riskChart.update('none');
  }
}

function renderTargetDetails(s) {
  if (selectedTarget !== s.studentId) return;

  const probColor = s.cheatingProbability > 70
    ? 'text-crimson-400'
    : (s.cheatingProbability > 40 ? 'text-amber-400' : 'text-emerald-400');

  const verdict = s.cheatingProbability > 70
    ? `<span class="text-crimson-400 font-bold">HIGH RISK — REVIEW REQUIRED</span>`
    : (s.cheatingProbability > 40
      ? `<span class="text-amber-400 font-bold">MODERATE — MONITOR CLOSELY</span>`
      : `<span class="text-emerald-400">CLEAR — LOW SUSPICION</span>`);

  document.getElementById('target-details').innerHTML = `
    <!-- Probability Display -->
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Cheating Probability</div>
        <div class="text-3xl font-mono font-bold ${probColor}">${s.cheatingProbability}<span class="text-sm text-slate-500">%</span></div>
        <div class="text-[9px] font-mono mt-0.5">${verdict}</div>
      </div>
      <div class="text-right">
        <div class="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-0.5">Risk Score</div>
        <div class="text-2xl font-mono font-bold ${s.riskScore > 75 ? 'text-crimson-400 blink' : (s.riskScore > 40 ? 'text-amber-400' : 'text-emerald-400')}">${String(s.riskScore).padStart(3,'0')}</div>
        <div class="text-[9px] font-mono text-slate-700">${s.isOnline ? '● ONLINE' : '○ OFFLINE'}</div>
      </div>
    </div>

    <!-- Stats Matrix -->
    <div class="grid grid-cols-3 gap-1.5 mb-3">
      ${statBox('TAB_SW', s.stats ? s.stats.tabSwitches : 0, s.stats && s.stats.tabSwitches > 2 ? 'amber' : 'slate')}
      ${statBox('FACE_LOST', s.stats ? s.stats.faceLost : 0, s.stats && s.stats.faceLost > 5 ? 'crimson' : 'slate')}
      ${statBox('MULTI_FACE', s.stats ? s.stats.multiFace : 0, s.stats && s.stats.multiFace > 0 ? 'crimson' : 'slate')}
      ${statBox('GAZE_ERR', s.stats ? s.stats.gazeAnomalies : 0, s.stats && s.stats.gazeAnomalies > 10 ? 'amber' : 'slate')}
      ${statBox('AUDIO_ERR', s.stats ? s.stats.voiceAlerts : 0, s.stats && s.stats.voiceAlerts > 3 ? 'amber' : 'slate')}
      ${statBox('EVENTS', s.eventLog ? s.eventLog.length : 0, 'slate')}
    </div>

    <!-- Live Vec -->
    <div class="grid grid-cols-2 gap-1.5 mb-3">
      <div class="bg-slate-950 border border-slate-800 p-2 font-mono text-[9px]">
        <div class="text-slate-600 mb-0.5">PITCH_X</div>
        <div class="text-slate-300 font-bold" id="t-pitch">—</div>
      </div>
      <div class="bg-slate-950 border border-slate-800 p-2 font-mono text-[9px]">
        <div class="text-slate-600 mb-0.5">YAW_Y</div>
        <div class="text-slate-300 font-bold" id="t-yaw">—</div>
      </div>
    </div>

    <!-- Admin Actions -->
    <div class="flex gap-2">
      <button onclick="openMessageModal('${s.studentId}', '${(s.studentName || s.studentId).replace(/'/g, "\\'")} ')" class="flex-1 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/50 hover:border-amber-500 text-amber-400 font-mono text-[9px] py-1.5 uppercase tracking-widest transition-colors">⚠ Warn</button>
      <button onclick="flagForReview('${s.studentId}')" class="flex-1 bg-indigo-900/30 hover:bg-indigo-800/40 border border-indigo-700/50 hover:border-indigo-500 text-indigo-400 font-mono text-[9px] py-1.5 uppercase tracking-widest transition-colors">⊞ Flag</button>
    </div>
  `;
}

function statBox(label, value, color) {
  const colorMap = {
    slate:  'text-slate-400 border-slate-800 bg-slate-950/50',
    amber:  'text-amber-400 border-amber-700/50 bg-amber-950/30',
    crimson:'text-crimson-400 border-crimson-700/50 bg-crimson-950/30'
  };
  return `
    <div class="border p-1.5 font-mono text-[9px] ${colorMap[color] || colorMap.slate}">
      <div class="text-slate-600 mb-0.5">${label}</div>
      <div class="font-bold text-sm">${value}</div>
    </div>`;
}

function advanceChart(s) {
  if (!riskChart) return;
  const d = riskChart.data.datasets[0];
  d.data.shift();
  d.data.push(s.riskScore);
  d.borderColor      = s.riskScore > 75 ? '#ef4444' : (s.riskScore > 40 ? '#f59e0b' : '#6366f1');
  d.backgroundColor  = s.riskScore > 75 ? 'rgba(220,38,38,0.06)' : 'rgba(99,102,241,0.05)';
  riskChart.update('none');
}

// ============================================================
// RISK HISTORY
// ============================================================
function initRiskHistory(studentId) {
  if (!riskHistory[studentId]) riskHistory[studentId] = [];
}

function appendRiskHistory(studentId, score) {
  initRiskHistory(studentId);
  riskHistory[studentId].push(score);
  if (riskHistory[studentId].length > 200) riskHistory[studentId].shift();
}

// ============================================================
// STATS BAR
// ============================================================
function getStudentActivityStatus(s) {
  if (s.isSubmitted) return 'completed';
  if (s.isOnline)    return 'active';
  if (s.isApproved)  return 'offline';
  return 'pending';
}

function updateStats() {
  const students = Array.from(activeStudents.values());
  const active    = students.filter(s => s.isOnline && !s.isSubmitted);
  const completed = students.filter(s => s.isSubmitted);
  const pending   = students.filter(s => !s.isOnline && !s.isSubmitted);

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('stat-total',     students.length);
  setTxt('stat-online',    active.length);
  setTxt('stat-completed', completed.length);
  setTxt('stat-pending',   pending.length);
  setTxt('stat-highrisk',  students.filter(s => s.riskScore > 75).length);

  // Mini pills in activity table header
  setTxt('act-active',    active.length);
  setTxt('act-completed', completed.length);
  setTxt('act-pending',   pending.length);

  renderActivityTable(students);
}

function renderActivityTable(students) {
  const tbody = document.getElementById('activity-table-body');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-slate-600 text-sm">No students connected yet</td></tr>';
    return;
  }

  const statusBadge = (s) => {
    const status = getStudentActivityStatus(s);
    const map = {
      active:    '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>Active</span>',
      completed: '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">✓ Completed</span>',
      offline:   '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold bg-slate-700/50 text-slate-400 border border-slate-600/30">● Offline</span>',
      pending:   '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">⏳ Pending</span>',
    };
    return map[status] || map.pending;
  };

  const riskColor = (r) => r > 75 ? 'text-red-500 font-bold' : (r > 40 ? 'text-amber-400 font-semibold' : 'text-emerald-400');
  const probColor = (p) => p > 70 ? 'text-red-500 font-bold' : (p > 40 ? 'text-amber-400 font-semibold' : 'text-slate-400');

  const sorted = [...students].sort((a, b) => {
    const order = { active: 0, pending: 1, offline: 2, completed: 3 };
    return (order[getStudentActivityStatus(a)] ?? 9) - (order[getStudentActivityStatus(b)] ?? 9);
  });

  tbody.innerHTML = sorted.map(s => `
    <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onclick="selectTarget('${s.studentId}')">
      <td class="px-4 py-3">
        <div class="font-semibold text-white text-sm">${s.studentName || s.studentId}</div>
        <div class="text-[11px] text-slate-500 font-mono">${s.studentId}</div>
      </td>
      <td class="px-4 py-3">${statusBadge(s)}</td>
      <td class="px-4 py-3 font-mono text-sm ${riskColor(s.riskScore)}">${s.riskScore}</td>
      <td class="px-4 py-3 font-mono text-sm ${probColor(s.cheatingProbability)}">${s.cheatingProbability}%</td>
      <td class="px-4 py-3 text-slate-400 text-sm">${s.eventLog ? s.eventLog.length : 0}</td>
      <td class="px-4 py-3 font-mono text-[11px] text-indigo-400">${s.examId || examId || '—'}</td>
    </tr>
  `).join('');
}

// ============================================================
// SEARCH & SORT
// ============================================================
window.filterStudents = (query) => {
  const q = query.toLowerCase();
  activeStudents.forEach((s, id) => {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;
    const match = (s.studentName || '').toLowerCase().includes(q) || id.toLowerCase().includes(q);
    card.style.display = match ? '' : 'none';
  });
};

window.toggleSort = () => {
  sortByRisk = !sortByRisk;
  const labelEl = document.getElementById('grid-sort-label-mon');
  if (labelEl) labelEl.textContent = sortByRisk ? 'Sorted by: Risk ↓' : 'Sorted by: Name A-Z';
  const grid = document.getElementById('student-grid');
  if (!grid) return;
  const students = Array.from(activeStudents.values());
  students.sort((a, b) => sortByRisk
    ? b.riskScore - a.riskScore
    : (a.studentName || a.studentId).localeCompare(b.studentName || b.studentId));
  students.forEach(s => {
    const card = document.getElementById(`card-${s.studentId}`);
    if (card) grid.appendChild(card);
  });
};

// ============================================================
// MESSAGE MODAL
// ============================================================
window.openMessageModal = (studentId, studentName) => {
  currentModalTarget = studentId;
  document.getElementById('modal-target-name').textContent = `${studentName}(${studentId})`;
  document.getElementById('modal-message').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-message').focus();
};

window.closeModal = () => {
  document.getElementById('modal-overlay').classList.add('hidden');
  currentModalTarget = null;
};

window.sendWarning = () => {
  const msg = document.getElementById('modal-message').value.trim();
  if (!msg || !currentModalTarget) return;

  socket.emit('admin:send_warning', {
    studentId: currentModalTarget,
    message: msg,
    examId
  });

  appendLedger('⚠ WARN', `Warning sent to ${currentModalTarget}: "${msg}"`, 'amber');
  closeModal();
};

// ============================================================
// FLAG FOR REVIEW
// ============================================================
window.flagForReview = (studentId) => {
  const s = activeStudents.get(studentId);
  if (!s) return;
  appendLedger('⊞ FLAG', `${s.studentName || studentId} flagged for manual review`, 'indigo');
  // Visual update on card
  const card = document.getElementById(`card-${studentId}`);
  if (card) {
    card.style.boxShadow = '0 0 0 1px #6366f1, 0 0 12px rgba(99,102,241,0.3)';
  }
};

// ============================================================
// LEDGER
// ============================================================
function appendLedger(event, detail, color = 'slate', extra = '') {
  const ledger = document.getElementById('violation-ledger');
  const now    = new Date().toLocaleTimeString('en-US', { hour12: false });

  const colorMap = {
    slate:  'text-slate-500 border-slate-800/50',
    emerald:'text-emerald-400 border-emerald-900/50 bg-emerald-950/20',
    amber:  'text-amber-400 border-amber-900/50 bg-amber-950/20',
    crimson:'text-crimson-400 border-crimson-900/50 bg-crimson-950/30',
    indigo: 'text-indigo-400 border-indigo-900/50 bg-indigo-950/20',
    red:    'text-crimson-400 border-crimson-800/50 bg-crimson-950/20',
  };

  const cls = colorMap[color] || colorMap.slate;

  ledger.insertAdjacentHTML('afterbegin', `
    <div class="px-2 py-1.5 border-b font-mono text-[9px] ${cls} mb-0.5">
      <div class="flex justify-between items-start">
        <span class="font-bold tracking-widest">${event}</span>
        <span class="text-slate-700 ml-2 shrink-0">${now}</span>
      </div>
      <div class="text-slate-400 mt-0.5 leading-relaxed">${detail}</div>
      ${extra ? `<div class="text-slate-600 mt-0.5">${extra}</div>` : ''}
    </div>
  `);
}

window.clearLedger = () => {
  document.getElementById('violation-ledger').innerHTML = '<div class="text-[9px] font-mono text-slate-700 p-2">// Ledger cleared</div>';
};

// ============================================================
// EXPORT REPORT
// ============================================================
window.exportReport = () => {
  const students = Array.from(activeStudents.values());
  const report   = {
    examId,
    generatedAt: new Date().toISOString(),
    totalStudents: students.length,
    onlineStudents: students.filter(s => s.isOnline).length,
    highRisk: students.filter(s => s.riskScore > 75).length,
    students: students.map(s => ({
      studentId: s.studentId,
      studentName: s.studentName,
      riskScore: s.riskScore,
      cheatingProbability: s.cheatingProbability,
      verdict: s.cheatingProbability > 70 ? 'HIGH_RISK' : (s.cheatingProbability > 40 ? 'MODERATE' : 'CLEAR'),
      stats: s.stats,
      isOnline: s.isOnline,
      eventCount: s.eventLog ? s.eventLog.length : 0,
    })).sort((a, b) => b.cheatingProbability - a.cheatingProbability)
  };

  // Render export modal
  const content = document.getElementById('export-content');
  content.innerHTML = `
    <div class="space-y-2 font-mono text-xs">
      <div class="grid grid-cols-4 gap-2 mb-4">
        <div class="bg-black/50 border border-slate-800 p-3">
          <div class="text-[9px] text-slate-600 uppercase mb-1">Total</div>
          <div class="text-lg font-bold text-slate-300">${report.totalStudents}</div>
        </div>
        <div class="bg-black/50 border border-slate-800 p-3">
          <div class="text-[9px] text-slate-600 uppercase mb-1">Online</div>
          <div class="text-lg font-bold text-emerald-400">${report.onlineStudents}</div>
        </div>
        <div class="bg-black/50 border border-slate-800 p-3">
          <div class="text-[9px] text-slate-600 uppercase mb-1">High Risk</div>
          <div class="text-lg font-bold text-crimson-400">${report.highRisk}</div>
        </div>
        <div class="bg-black/50 border border-slate-800 p-3">
          <div class="text-[9px] text-slate-600 uppercase mb-1">Alerts</div>
          <div class="text-lg font-bold text-amber-400">${totalAlerts}</div>
        </div>
      </div>

      <table class="w-full text-[9px]">
        <thead>
          <tr class="border-b border-slate-800 text-slate-600 uppercase tracking-widest">
            <th class="text-left py-1.5 pr-3">Student</th>
            <th class="text-right pr-3">Risk</th>
            <th class="text-right pr-3">Prob.</th>
            <th class="text-right pr-3">Events</th>
            <th class="text-right">Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${report.students.map(s => `
            <tr class="border-b border-slate-900 hover:bg-slate-900/30">
              <td class="py-1.5 pr-3">
                <div class="text-slate-200">${s.studentName || s.studentId}</div>
                <div class="text-slate-700">${s.studentId}</div>
              </td>
              <td class="text-right pr-3 font-bold ${s.riskScore > 75 ? 'text-crimson-400' : (s.riskScore > 40 ? 'text-amber-400' : 'text-emerald-400')}">${s.riskScore}</td>
              <td class="text-right pr-3 font-bold ${s.cheatingProbability > 70 ? 'text-crimson-400' : (s.cheatingProbability > 40 ? 'text-amber-400' : 'text-slate-300')}">${s.cheatingProbability}%</td>
              <td class="text-right pr-3 text-slate-500">${s.eventCount}</td>
              <td class="text-right">
                <span class="px-1 py-0.5 border text-[8px] ${s.verdict === 'HIGH_RISK' ? 'border-crimson-700 text-crimson-400 bg-crimson-950' : (s.verdict === 'MODERATE' ? 'border-amber-700 text-amber-400 bg-amber-950' : 'border-emerald-800 text-emerald-400 bg-emerald-950')}">${s.verdict}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('export-modal').classList.remove('hidden');

  // Cache report for download
  window._cachedReport = report;
};

window.closeExportModal = () => {
  document.getElementById('export-modal').classList.add('hidden');
};

window.downloadReport = () => {
  if (!window._cachedReport) return;
  const blob = new Blob([JSON.stringify(window._cachedReport, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `exam-guardian-report-${examId}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  appendLedger('EXPORT', `Intelligence report downloaded (${Array.from(activeStudents.values()).length} students)`, 'emerald');
};
