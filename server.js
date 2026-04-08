/**
 * EXAM GUARDIAN — INTELLIGENCE ENGINE (BACKEND)
 * Live Risk Scoring, Socket.IO Rooms, Probability AI + Multi-Student Demo Simulator
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- STATE MANAGEMENT ---
const exams = new Map();

function getStudentState(examId, studentId) {
  if (!exams.has(examId)) exams.set(examId, new Map());
  const room = exams.get(examId);
  if (!room.has(studentId)) {
    room.set(studentId, {
      studentId,
      studentName: studentId,
      examId,
      riskScore: 0,
      cheatingProbability: 0,
      eventLog: [],
      stats: { tabSwitches: 0, faceLost: 0, multiFace: 0, gazeAnomalies: 0, voiceAlerts: 0 },
      isOnline: false,
      isApproved: false,
      lastUpdate: Date.now()
    });
  }
  return room.get(studentId);
}

// --- RISK CALCULATION ENGINE ---
function calculateRiskAndProbability(state, eventData) {
  const { event } = eventData;
  state.eventLog.push({ ...eventData, timestamp: Date.now() });

  let penalty = 0;
  switch (event) {
    case 'tab_switch':     penalty = 25; state.stats.tabSwitches++;   break;
    case 'face_lost':      penalty = 30; state.stats.faceLost++;      break;
    case 'multi_face':     penalty = 50; state.stats.multiFace++;     break;
    case 'gaze_anomaly':   penalty = 15; state.stats.gazeAnomalies++; break;
    case 'voice_detected': penalty = 20; state.stats.voiceAlerts++;   break;
  }

  state.riskScore = Math.min(100, state.riskScore + penalty);
  state.lastUpdate = Date.now();

  let prob = 0;
  const s = state.stats;
  if (s.multiFace > 0)                           prob += 40;
  if (s.tabSwitches > 2)                         prob += (s.tabSwitches - 2) * 15;
  if (s.voiceAlerts > 3)                         prob += 25;
  if (s.gazeAnomalies > 10)                      prob += 20;
  if (s.faceLost > 5)                            prob += 30;
  if (s.gazeAnomalies > 5 && s.voiceAlerts > 2)  prob += 35;

  state.cheatingProbability = Math.min(99, Math.round(prob));
  return { penalty, riskScore: state.riskScore, prob: state.cheatingProbability };
}



// REST API: Export Report
app.get('/api/report/:examId', (req, res) => {
  const room = exams.get(req.params.examId);
  if (!room) return res.json({ examId: req.params.examId, students: [] });
  const students = Array.from(room.values()).map(s => ({
    studentId:           s.studentId,
    studentName:         s.studentName,
    riskScore:           s.riskScore,
    cheatingProbability: s.cheatingProbability,
    verdict:             s.cheatingProbability > 70 ? 'HIGH_RISK' : (s.cheatingProbability > 40 ? 'MODERATE' : 'CLEAR'),
    stats:               s.stats,
    isOnline:            s.isOnline,
    eventCount:          s.eventLog.length,
  }));
  res.json({ examId: req.params.examId, generatedAt: new Date().toISOString(), students });
});


// --- WEBSOCKET LAYER ---
io.on('connection', (socket) => {
  console.log(`[SYS] Socket Connected: ${socket.id}`);

  // 0. Student Request Access (Waiting Room)
  socket.on('student:request_access', (data) => {
    const { examId, studentId, studentName } = data;
    socket.join(`waitroom:${studentId}`);
    io.to(`admin:${examId}`).emit('admin:join_request', { examId, studentId, studentName, socketId: socket.id });
    console.log(`[WAITING] ${studentName} requesting access to ${examId}`);
  });

  // 0.5. Admin Approves Access
  socket.on('admin:approve_access', (data) => {
    const { studentId, approved } = data;
    if (approved) {
      io.to(`waitroom:${studentId}`).emit('student:access_granted', { approved: true });
    } else {
      io.to(`waitroom:${studentId}`).emit('student:access_granted', { approved: false });
    }
  });

  // 1. Student Joining
  socket.on('student:join', (data) => {
    const { examId, studentId, studentName } = data;
    socket.join(`exam:${examId}`);
    socket.examId   = examId;
    socket.studentId = studentId;

    const state = getStudentState(examId, studentId);
    state.studentName = studentName;
    state.isOnline    = true;
    state.isApproved  = true;
    state.examId      = examId;

    console.log(`[STUDENT] ${studentName} joined ${examId} (APPROVED)`);
    io.to(`admin:${examId}`).emit('student:status_change', { studentId, studentName, isOnline: true });
    io.to(`admin:${examId}`).emit('risk:update', state);
  });

  // 2. Admin Joining
  socket.on('admin:join', (data) => {
    socket.join(`admin:${data.examId}`);
    socket.adminExamId = data.examId;
    console.log(`[ADMIN] Subscribed to ${data.examId}`);

    const room = exams.get(data.examId);
    const activeStudents = room ? Array.from(room.values()) : [];
    socket.emit('admin:snapshot', activeStudents);
  });

  // 3. Telemetry Stream
  socket.on('telemetry:stream', (data) => {
    if (!socket.examId || !socket.studentId) return;
    io.to(`admin:${socket.examId}`).emit('telemetry:live', {
      studentId: socket.studentId,
      ...data
    });
  });

  // 4. Critical Event / Violation Pipeline
  socket.on('event:trigger', (eventData) => {
    if (!socket.examId || !socket.studentId) return;
    const state = getStudentState(socket.examId, socket.studentId);
    
    if (eventData.event === 'exam_submitted') {
      state.isSubmitted = true;
    }
    
    const analysis = calculateRiskAndProbability(state, eventData);
    console.log(`[ALERT] ${socket.studentId} | ${eventData.event} | +${analysis.penalty} | Prob: ${analysis.prob}%`);

    io.to(`admin:${socket.examId}`).emit('alert:live', {
      studentId:   socket.studentId,
      studentName: state.studentName,
      eventData,
      analysis,
      timestamp:   Date.now()
    });
    io.to(`admin:${socket.examId}`).emit('risk:update', state);
  });

  // 5. Secondary Mobile Camera Stream
  socket.on('mobile:join', (data) => {
    socket.join(`mobile:${data.studentId}`);
    console.log(`[MOBILE_CAM] Link established for ${data.studentId}`);
    io.to(`admin:${data.examId}`).emit('mobile:status', { studentId: data.studentId, active: true });
    io.to(`waitroom:${data.studentId}`).emit('student:mobile_synced');
    io.to(`exam:${data.examId}`).emit('student:mobile_synced');
  });

  socket.on('mobile:frame', (data) => {
    io.to(`admin:${data.examId}`).emit('mobile:stream_frame', {
      studentId: data.studentId,
      image:     data.image
    });
  });

  // 6. Primary Camera Stream
  socket.on('primary_cam:frame', (data) => {
    if (!socket.examId || !socket.studentId) return;
    io.to(`admin:${socket.examId}`).emit('primary_cam:stream_frame', {
      studentId: socket.studentId,
      image:     data.image
    });
  });

  // 7. Admin Warning
  socket.on('admin:send_warning', (data) => {
    io.to(`exam:${data.examId}`).emit('admin:broadcast', {
      studentId: data.studentId,
      message: data.message
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.studentId && socket.examId) {
      const state = getStudentState(socket.examId, socket.studentId);
      state.isOnline = false;
      io.to(`admin:${socket.examId}`).emit('student:status_change', {
        studentId: socket.studentId,
        isOnline:  false
      });
    }

    if (socket.adminExamId) {
      const room = exams.get(socket.adminExamId);
      if (room) {
        // Emit termination events to all students under this session
        room.forEach(state => {
          io.to(`exam:${socket.adminExamId}`).emit('student:terminated', { studentId: state.studentId });
        });
      }
      // Wipe the memory explicitly so next admin login is a pure fresh slate
      exams.delete(socket.adminExamId);
      console.log(`[SYS] Admin disconnected. Core memory completely wiped for ${socket.adminExamId}`);
    }
  });
});

// Periodic Risk Decay
setInterval(() => {
  exams.forEach((room) => {
    room.forEach((state) => {
      if (state.riskScore > 0 && (Date.now() - state.lastUpdate > 5000)) {
        state.riskScore = Math.max(0, state.riskScore - 2);
        if (state.examId) {
          io.to(`admin:${state.examId}`).emit('risk:update', state);
        }
      }
      state.lastUpdate = Date.now();
    });
  });
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[EXAM GUARDIAN] AI Intelligence Server live on port ${PORT}`));
