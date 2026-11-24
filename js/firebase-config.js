/**
 * EXAM GUARDIAN — FIREBASE CONFIG
 * Paste your Firebase config from console.firebase.google.com
 * Project Settings → General → Your apps → Firebase SDK snippet → Config
 */

// ─── PASTE YOUR FIREBASE CONFIG HERE ────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAPxoyLbNadcoDRVn8YgveBOIM5sTo3t7s",
  authDomain: "exam-guardian-a99e9.web.app",
  projectId: "exam-guardian-a99e9",
  storageBucket: "exam-guardian-a99e9.firebasestorage.app",
  messagingSenderId: "581921889555",
  appId: "1:581921889555:web:cc76aec134e85109dd8ee6",
  measurementId: "G-09L1ZP69VK"
};
// ─────────────────────────────────────────────────────────────────────────────

// Initialize Firebase (using compat SDK loaded via CDN)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

const EG_FIREBASE_CONFIGURED =
  FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY' &&
  FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT_ID';
