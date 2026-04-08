/**
 * EXAM GUARDIAN — REAL-TIME PROCTOR ENGINE (FRONTEND) v3.0
 * Face Detection, Audio Analysis, Tab Switching, True WebSockets
 * NOTE: index.html sets up socket, user, examId, logLocal() — we use them here.
 */

const videoElement  = document.getElementById('videoElement');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx     = canvasElement.getContext('2d');
const startBtn      = document.getElementById('start-btn');

// --- CONNECT TO BACKEND & REQUEST ACCESS ---
startBtn.addEventListener('click', () => {
  if (startBtn._bound) return; // prevent double-bind
  startBtn._bound = true;
  startBtn.disabled = true;
  startBtn.textContent = 'AWAITING ADMIN APPROVAL...';
  socket.emit('student:request_access', {
    examId,
    studentId: user.id,
    studentName: user.name
  });
  markStep('step-access', 'pending');
  markStep('step-access-num', 'pending');
  document.getElementById('step-access-status').textContent = 'Waiting for proctor to grant access...';
  logLocal('Access request sent to proctor', 'amber');
});

// --- AUDIO MONITORING (WEB AUDIO API) ---
let audioContext, analyser, microphone;
let isVoiceAlertActive = false;

async function startAudioMonitoring() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 256;
    microphone.connect(analyser);

    const volumes = new Uint8Array(analyser.frequencyBinCount);

    setInterval(() => {
      if (!examActive) return;
      analyser.getByteFrequencyData(volumes);
      let sum = 0;
      for (const a of volumes) sum += a;
      const avg = sum / volumes.length;

      if (avg > 40 && !isVoiceAlertActive) {
        isVoiceAlertActive = true;
        socket.emit('event:trigger', {
          event: 'voice_detected',
          details: `High audio detected (avg: ${avg.toFixed(0)} dB)`,
          confidence: (avg / 100).toFixed(2)
        });
        logLocal(`Audio alert: ${avg.toFixed(0)}dB detected`, 'amber');
        setTimeout(() => isVoiceAlertActive = false, 4000);
      }
    }, 1000);
  } catch (err) {
    console.warn('[PROCTOR] Audio monitoring denied.', err);
    logLocal('Audio access denied — mic monitoring offline', 'red');
  }
}

// --- VISIBILITY API (TAB SWITCHING) ---
document.addEventListener('visibilitychange', () => {
  if (!examActive) return;
  if (document.hidden) {
    socket.emit('event:trigger', {
      event: 'tab_switch',
      details: 'User navigated away from exam browser context'
    });
    logLocal('Tab switch detected!', 'red');
  }
});

// --- MEDIAPIPE FACE MESH PIPELINE ---
const faceMesh = new FaceMesh({
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({ maxNumFaces: 2, refineLandmarks: true, minDetectionConfidence: 0.7 });
faceMesh.onResults(onFaceMeshResults);

const camera = new Camera(videoElement, {
  onFrame: async () => { await faceMesh.send({ image: videoElement }); },
  width: 640, height: 480
});

camera.start().then(() => {
  startBtn.disabled = false;
  startBtn.textContent = 'REQUEST EXAM ACCESS →';
  videoElement.style.opacity = '1';
  document.getElementById('cam-loading').style.display = 'none';
  markStep('step-camera', 'done');
  markStep('step-camera-num', 'done');
  document.getElementById('step-camera-status').textContent = '✓ Neural mesh active — face tracking online';
  markStep('step-access', 'pending');
  document.getElementById('step-access-status').textContent = 'Ready — click button below to request access';
  logLocal('Camera initialized successfully', 'emerald');
}).catch(err => {
  document.getElementById('cam-loading').textContent = 'CAM ERROR';
  document.getElementById('step-camera-status').textContent = '✗ Camera failed: ' + err.message;
  logLocal('Camera init failed: ' + err.message, 'red');
  // Still allow demo access without camera
  startBtn.disabled = false;
  startBtn.textContent = 'REQUEST ACCESS (CAM UNAVAIL)';
});

// --- AI EVALUATION LOGIC ---
let framesLost = 0;
let gazeAnomalies = 0;
let lastGazeTrigger = 0;
let lastTelemetryTime = 0;

function onFaceMeshResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    framesLost = 0;

    // Multiple faces
    if (results.multiFaceLandmarks.length > 1 && examActive) {
      socket.emit('event:trigger', {
        event: 'multi_face',
        details: `Secondary facial structure detected (${results.multiFaceLandmarks.length} faces)`
      });
      logLocal('ALERT: Multiple faces detected!', 'red');
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Draw mesh
    if (typeof drawConnectors !== 'undefined' && typeof FACEMESH_TESSELATION !== 'undefined') {
      drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: 'rgba(52,211,153,0.08)', lineWidth: 0.5 });
      drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: 'rgba(99,102,241,0.5)', lineWidth: 1 });
      drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: 'rgba(99,102,241,0.5)', lineWidth: 1 });
    }

    // 3D Pose estimation
    const top   = landmarks[10];
    const bot   = landmarks[152];
    const left  = landmarks[234];
    const right = landmarks[454];

    const pitch = Math.atan2(bot.y - top.y,   bot.z  - top.z)   * (180 / Math.PI) - 90;
    const yaw   = Math.atan2(right.x - left.x, right.z - left.z) * (180 / Math.PI) - 90;

    const gazeDeviation = Math.abs(yaw) > 25 || Math.abs(pitch) > 20;

    // Update local HUD
    document.getElementById('val-pitch').textContent = pitch.toFixed(1) + '°';
    document.getElementById('val-yaw').textContent   = yaw.toFixed(1) + '°';
    document.getElementById('hud-risk') && updateRiskHUD();

    // Throttled telemetry stream to admin (approx 4 FPS)
    if (examActive && Date.now() - lastTelemetryTime > 250) {
      lastTelemetryTime = Date.now();
      socket.emit('telemetry:stream', { pitch: pitch.toFixed(1), yaw: yaw.toFixed(1), gazeDeviation });
    }

    // Gaze monitoring
    if (gazeDeviation) {
      gazeAnomalies++;
      document.getElementById('val-gaze').textContent  = 'DEVIATION';
      document.getElementById('val-gaze').className    = 'text-amber-500 font-bold';

      if (gazeAnomalies > 15 && Date.now() - lastGazeTrigger > 3000 && examActive) {
        socket.emit('event:trigger', {
          event: 'gaze_anomaly',
          details: `Sustained gaze deviation — yaw:${yaw.toFixed(0)}° pitch:${pitch.toFixed(0)}°`
        });
        logLocal(`Gaze anomaly: yaw=${yaw.toFixed(0)}°`, 'amber');
        lastGazeTrigger = Date.now();
        gazeAnomalies = 0;
      }
    } else {
      gazeAnomalies = Math.max(0, gazeAnomalies - 1);
      document.getElementById('val-gaze').textContent = 'CENTERED';
      document.getElementById('val-gaze').className   = 'text-emerald-400 font-bold';
    }

    document.getElementById('val-face').textContent = `${results.multiFaceLandmarks.length} FOUND`;
    document.getElementById('val-face').className   = results.multiFaceLandmarks.length > 1
      ? 'text-crimson-400 font-bold blink'
      : 'text-emerald-400 font-bold';

  } else {
    // No face detected
    framesLost++;
    document.getElementById('val-face').textContent = 'LOST';
    document.getElementById('val-face').className   = 'text-crimson-400 font-bold blink';
    document.getElementById('val-gaze').textContent = '---';
    document.getElementById('val-pitch').textContent = '---';
    document.getElementById('val-yaw').textContent   = '---';

    if (framesLost > 10 && framesLost % 10 === 0 && examActive) {
      socket.emit('event:trigger', {
        event: 'face_lost',
        details: `Primary face ID lost from frame (${Math.floor(framesLost / 10)}s)`
      });
      logLocal('Face lost from camera frame', 'red');
    }
  }

  canvasCtx.restore();
}

function updateRiskHUD() {
  // We don't have the risk score locally, but we can show face status
}

// --- HIGH-SPEED CAMERA STREAMING PIPELINE ---
const streamCanvas = document.createElement('canvas');
streamCanvas.width = 320;
streamCanvas.height = 240;
const streamCtx = streamCanvas.getContext('2d', { alpha: false });

setInterval(() => {
  if (!examActive || !videoElement.videoWidth) return;
  // Draw scaled down video frame for blazing fast encoding
  streamCtx.save();
  streamCtx.translate(streamCanvas.width, 0);
  streamCtx.scale(-1, 1);
  streamCtx.drawImage(videoElement, 0, 0, streamCanvas.width, streamCanvas.height);
  streamCtx.restore();
  
  // Highly compressed sub-sampled JPEG (Super light over WebSocket)
  const frameData = streamCanvas.toDataURL('image/jpeg', 0.25);
  socket.emit('primary_cam:frame', { image: frameData });
}, 60); // ~16 FPS for extremely low-latency feeling without killing CPU
