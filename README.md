# 🛡️ Exam Guardian — AI-Powered Online Proctoring System

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-black?style=for-the-badge&logo=socket.io)
![Firebase](https://img.shields.io/badge/Firebase-Auth-orange?style=for-the-badge&logo=firebase)
![License](https://img.shields.io/badge/license-MIT-purple?style=for-the-badge)

**A real-time, AI-powered online exam proctoring platform built with Node.js, Socket.IO, and MediaPipe.**  
Detects cheating behavior using computer vision and streams live risk scores to administrators.

[🚀 Live Demo](#) · [📖 Documentation](#architecture) · [🐛 Report Bug](../../issues)

</div>

---

## 📸 Screenshots

| Admin Dashboard | Student Exam Portal |
|---|---|
| Live monitoring grid with real-time risk scores | AI face-mesh tracking with telemetry HUD |

---

## ✨ Key Features

- 🤖 **AI Face Mesh Detection** — Uses Google MediaPipe to track gaze vectors, head pose (pitch/yaw), and multiple faces in frame
- ⚡ **Real-Time WebSocket Pipeline** — Sub-100ms event latency via Socket.IO; live video frames streamed at ~16 FPS
- 🎯 **Intelligent Risk Scoring Engine** — Probabilistic cheating detection algorithm combining 5 behavioral signals
- 📱 **Dual-Camera Sync** — Students link their mobile phone as a secondary camera via QR code
- 🔐 **Firebase Authentication** — Email/password + Google OAuth, role-based routing (Admin / Student)
- 🗂️ **Admin Command Center** — Live student grid, violation ledger, real-time Chart.js risk graph, join request approval
- 📊 **Report Export** — JSON exam report with per-student verdict (CLEAR / MODERATE / HIGH_RISK)
- 🔊 **Audio Monitoring** — Web Audio API detects sustained voice activity during exams

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js, Socket.IO |
| **Frontend** | HTML5, Vanilla JavaScript, Tailwind CSS |
| **AI / CV** | MediaPipe Face Mesh (browser-native) |
| **Auth** | Firebase Authentication (Email + Google OAuth) |
| **Real-Time** | WebSocket (Socket.IO rooms) |
| **Camera** | Web Audio API, MediaStream API, Canvas API |
| **QR Code** | qrcode.js (secondary camera linking) |
| **Charts** | Chart.js (live risk velocity graph) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT SIDE                        │
│                                                      │
│  Student Browser          Admin Browser             │
│  ┌─────────────────┐      ┌──────────────────────┐  │
│  │ MediaPipe AI    │      │ Admin Dashboard      │  │
│  │ Face Mesh       │      │ Live Grid + Charts   │  │
│  │ Audio Monitor   │      │ Violation Ledger     │  │
│  │ Tab Detection   │      │ Mobile Cam Feed      │  │
│  └────────┬────────┘      └──────────┬───────────┘  │
│           │ WebSocket                │ WebSocket     │
└───────────┼──────────────────────────┼──────────────┘
            │                          │
┌───────────▼──────────────────────────▼──────────────┐
│                   SERVER (Node.js)                   │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │            Socket.IO Event Router              │ │
│  │  student:join  │  event:trigger  │  admin:join │ │
│  │  primary_cam   │  mobile:frame   │  telemetry  │ │
│  └────────────────────┬───────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼───────────────────────────┐ │
│  │          Risk Scoring Engine                   │ │
│  │  tab_switch (+25) │ face_lost (+30)            │ │
│  │  multi_face (+50) │ gaze_anomaly (+15)         │ │
│  │  voice_detected (+20) + Probability Algorithm  │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  REST API: GET /api/report/:examId                  │
└──────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────┐
│   Mobile Phone (Secondary Cam)   │
│   mobile.html via QR Code link   │
└──────────────────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 16+
- npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Ciradeep/proctorx-ai.git
cd proctorx-ai

# 2. Install dependencies
npm install

# 3. Configure Firebase (optional — works in demo mode without it)
# Edit js/firebase-config.js with your Firebase project credentials

# 4. Start the server
npm start
# Server starts on http://localhost:3000
```

### Demo Credentials (no Firebase needed)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@exam.edu` | `admin123` |
| Student | `arjun@student.edu` | `student123` |

---

## 🎮 How It Works

### Admin Flow
1. Log in → Create an Exam Session with an access code
2. Switch to **Live Monitoring** tab
3. Approve student join requests in real-time
4. Watch live camera feeds, risk scores, and violation events
5. Send warnings to flagged students
6. Export the proctoring report as JSON

### Student Flow
1. Log in → Go to **My Exams** → Click **Begin Exam**
2. Complete pre-exam checks (Camera Init → Proctor Approval → Mobile Sync)
3. Scan QR code on phone to link secondary camera
4. Attempt the MCQ exam — AI monitors throughout
5. Submit → See score breakdown

---

## 📡 Socket.IO Event API

| Event | Direction | Description |
|---|---|---|
| `student:request_access` | Client → Server | Student requests entry to waiting room |
| `admin:approve_access` | Client → Server | Admin approves/denies a student |
| `student:join` | Client → Server | Student officially joins exam room |
| `event:trigger` | Client → Server | Reports a violation event (face_lost, tab_switch, etc.) |
| `telemetry:stream` | Client → Server | Streams head pose data at ~4 FPS |
| `primary_cam:frame` | Client → Server | Streams webcam JPEG frames at ~16 FPS |
| `mobile:frame` | Client → Server | Mobile secondary camera frames |
| `risk:update` | Server → Admin | Updated risk state for a student |
| `alert:live` | Server → Admin | Live violation alert with penalty |
| `admin:broadcast` | Server → Student | Admin warning message |

---

## 📁 Project Structure

```
exam-guardian/
├── server.js                 # Express + Socket.IO backend
├── package.json
├── index.html                # Landing / marketing page
├── login.html                # Authentication page
├── register.html             # Registration page
├── admin-dashboard.html      # Admin command center
├── student-dashboard.html    # Student exam portal
├── mobile.html               # Mobile secondary camera
├── js/
│   ├── auth.js               # Firebase auth + localStorage fallback
│   ├── firebase-config.js    # Firebase project config
│   ├── admin-logic.js        # Admin dashboard logic + Socket handlers
│   └── proctor-engine.js     # AI face tracking + audio monitoring
└── css/
    ├── style.css
    ├── admin.css
    ├── exam.css
    └── theme.css
```

---

## 🧠 Risk Scoring Algorithm

The backend uses a weighted event scoring system combined with a multi-factor probability model:

```
Risk Score (0-100):
  tab_switch     → +25 per event
  face_lost      → +30 per event  
  multi_face     → +50 per event (highest weight)
  gaze_anomaly   → +15 per event
  voice_detected → +20 per event
  Passive decay  → -2 every 5s (if no new events)

Cheating Probability (0-99%):
  Multi-face detected        → +40%
  Tab switches > 2           → +(switches - 2) × 15%
  Voice alerts > 3           → +25%
  Gaze anomalies > 10        → +20%
  Face lost > 5 times        → +30%
  Gaze + Voice correlation   → +35% bonus
```

**Verdict thresholds:** `< 40%` → CLEAR · `40–70%` → MODERATE · `> 70%` → HIGH_RISK

---

## 🚀 Future Enhancements

- [ ] Persistent database (MongoDB) for exam results & history  
- [ ] Admin question builder to create custom MCQ banks  
- [ ] Screen recording / screenshot capture  
- [ ] Object detection (phone, book, second person)  
- [ ] Email notifications for high-risk events  
- [ ] Multi-exam concurrent session support  

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">
  Built with ❤️ using Node.js · Socket.IO · MediaPipe · Firebase
</div>
