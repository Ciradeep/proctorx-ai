/* ============================================================
   EXAM GUARDIAN — AUTH MODULE v4.0
   Firebase Authentication backend
   Falls back to localStorage simulation if Firebase not configured
   ============================================================ */

const Auth = {

  // ── Role detection by email domain ──────────────────────────────
  detectRole(email) {
    if (!email) return 'student';
    if (email.endsWith('@exam.edu') || email.endsWith('@admin.edu')) return 'admin';
    return 'student';
  },

  // ── Build a session object from Firebase user ───────────────────
  buildSession(firebaseUser, role, displayName) {
    // Strip role tag if present in displayName
    let name = displayName || firebaseUser.displayName || firebaseUser.email.split('@')[0];
    if (name.includes(':[[')) name = name.split(':[[')[0];

    const user = {
      id:     firebaseUser.uid,
      name,
      email:  firebaseUser.email,
      role,
      avatar: firebaseUser.photoURL || null,
      rollNo: firebaseUser.uid.slice(0,8).toUpperCase(),
      dept:   role === 'admin' ? 'Admin' : 'General'
    };
    const session = { token: firebaseUser.uid, user };
    sessionStorage.setItem('eg_session', JSON.stringify(session));
    return { success: true, user, role };
  },

  // ── Check if Firebase is ready ─────────────────────────────────
  get firebaseReady() {
    return typeof firebase !== 'undefined' &&
           typeof EG_FIREBASE_CONFIGURED !== 'undefined' &&
           EG_FIREBASE_CONFIGURED;
  },

  // ── Google Sign-In / Sign-Up (Firebase Redirect) ──────────────────
  async loginWithGoogle() {
    if (!this.firebaseReady) {
      return { success: false, error: 'Firebase not configured. Fill in js/firebase-config.js.' };
    }
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithRedirect(provider);
      // Process halts here as page redirects
      return { success: true, pendingRedirect: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Handle Return from Google Redirect ───────────────────────────
  async checkRedirectResult() {
    if (!this.firebaseReady) return null;
    try {
      const result = await firebase.auth().getRedirectResult();
      if (result && result.user) {
        const fu = result.user;
        const role = this.detectRole(fu.email);
        return this.buildSession(fu, role, fu.displayName);
      }
      return null;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // ── Email + Password Sign-In ───────────────────────────────────
  async loginWithEmail(email, password, requestedRole) {
    if (!this.firebaseReady) {
      // Fallback to localStorage simulation
      return this._localLogin(email, password, requestedRole);
    }
    try {
      const result = await firebase.auth().signInWithEmailAndPassword(email, password);
      const fu     = result.user;
      
      // Determine stored role from displayName
      let storedRole = 'student'; // default
      let actualName = fu.displayName || fu.email.split('@')[0];
      
      if (actualName.includes(':[[')) {
        storedRole = actualName.split(':[[')[1].replace(']]', '');
        actualName = actualName.split(':[[')[0];
      }

      if (storedRole !== requestedRole) {
        // Sign back out if mismatch
        await firebase.auth().signOut();
        return { success: false, error: `Account mismatch. You registered as a ${storedRole}, but tried to sign in as ${requestedRole}.` };
      }

      return this.buildSession(fu, storedRole, actualName);
    } catch (err) {
      const msg = {
        'auth/invalid-credential': 'No account found, or incorrect password.',
        'auth/invalid-email':   'Invalid email address.',
        'auth/too-many-requests': 'Too many attempts. Try again later.'
      };
      return { success: false, error: msg[err.code] || err.message };
    }
  },

  // ── Register with Email + Password ────────────────────────────
  async registerWithEmail(name, email, password, role) {
    // Enforce real public email domains, block demo/fake domains
    const lowerEmail = email.toLowerCase();
    const allowedDomains = ['@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com', '@icloud.com'];
    const isAllowed = allowedDomains.some(domain => lowerEmail.endsWith(domain));
    
    if (lowerEmail.endsWith('@exam.edu') || lowerEmail.endsWith('@student.edu') || !isAllowed) {
      return { success: false, error: 'Please use a real personal email address (like @gmail.com or @yahoo.com).' };
    }

    if (!this.firebaseReady) {
      return this._localRegister(name, email, password, role);
    }
    try {
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const fu     = result.user;
      // Save display name AND append the role tag for persistence
      await fu.updateProfile({ displayName: `${name}:[[${role}]]` });
      return this.buildSession(fu, role, name);
    } catch (err) {
      const msg = {
        'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
        'auth/weak-password':        'Password must be at least 6 characters.',
        'auth/invalid-email':        'Invalid email address.'
      };
      return { success: false, error: msg[err.code] || err.message };
    }
  },

  // ── Logout ───────────────────────────────────────────────────
  async logout() {
    sessionStorage.removeItem('eg_session');
    sessionStorage.removeItem('student_exam_id');
    localStorage.removeItem('current_exam_id');
    localStorage.removeItem('current_exam_title');
    localStorage.removeItem('current_exam_duration');
    if (this.firebaseReady) {
      try { await firebase.auth().signOut(); } catch(e) {}
    }
    window.location.href = 'login.html';
  },

  // ── Get current session (sync, from sessionStorage) ────────────
  getSession() {
    try {
      const raw = sessionStorage.getItem('eg_session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  getUser() {
    const session = this.getSession();
    return session ? session.user : null;
  },

  // ── Require auth (sync check, then Firebase listener verify) ───
  requireAuth(requiredRole = null) {
    const session = this.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    if (requiredRole && session.user.role !== requiredRole) {
      window.location.href = session.user.role === 'admin'
        ? 'admin-dashboard.html'
        : 'student-dashboard.html';
      return null;
    }

    // Secondary async check via Firebase (refreshes session if needed)
    if (this.firebaseReady) {
      firebase.auth().onAuthStateChanged((fu) => {
        if (!fu) {
          sessionStorage.removeItem('eg_session');
          window.location.href = 'login.html';
        }
      });
    }

    return session.user;
  },

  // ── Legacy compat: login() used by existing demo buttons ───────
  login(email, password) {
    // Sync wrapper — pages that call Auth.login() get a Promise back
    // Handle both sync (localStorage) and async (Firebase) modes
    if (!this.firebaseReady) {
      return this._localLogin(email, password);
    }
    // Return a promise for async Firebase mode
    return this.loginWithEmail(email, password);
  },

  register(name, email, password, role) {
    if (!this.firebaseReady) {
      return this._localRegister(name, email, password, role);
    }
    return this.registerWithEmail(name, email, password, role);
  },

  getAllStudents() {
    // Only works in localStorage mode; in Firebase mode returns empty
    try {
      const stored = localStorage.getItem('eg_users');
      const users = stored ? JSON.parse(stored) : _defaultUsers();
      return users.filter(u => u.role === 'student');
    } catch { return []; }
  },

  // ── LOCAL FALLBACK (when Firebase not configured) ──────────────
  get _localUsers() {
    const stored = localStorage.getItem('eg_users');
    if (stored) return JSON.parse(stored);
    const def = _defaultUsers();
    localStorage.setItem('eg_users', JSON.stringify(def));
    return def;
  },

  _localLogin(email, password, requestedRole = null) {
    const user = this._localUsers.find(u => u.email === email && u.password === password);
    if (!user) return { success: false, error: 'No account found. Please register first.' };
    
    if (requestedRole && user.role !== requestedRole) {
      return { success: false, error: `Account mismatch. You registered as a ${user.role}, but tried to sign in as ${requestedRole}.` };
    }

    const session = { token: user.id + Date.now(), user: { id: user.id, name: user.name, email: user.email, role: user.role, rollNo: user.rollNo, dept: user.dept } };
    sessionStorage.setItem('eg_session', JSON.stringify(session));
    return { success: true, user: session.user, role: user.role };
  },

  _localRegister(name, email, password, role) {
    const users = this._localUsers;
    if (users.find(u => u.email === email)) return { success: false, error: 'Email already registered.' };
    const id = (role === 'admin' ? 'adm' : 'std') + String(Date.now()).slice(-4);
    const nu = { id, name, email, password, role, rollNo: id.toUpperCase(), dept: role === 'admin' ? 'Admin' : 'General' };
    users.push(nu);
    localStorage.setItem('eg_users', JSON.stringify(users));
    return this._localLogin(email, password);
  }
};

function _defaultUsers() {
  return [
    { id: 'std001', name: 'Arjun Sharma',     email: 'arjun@student.edu',   password: 'student123', role: 'student', rollNo: '21EC020', dept: 'ECE' },
    { id: 'std002', name: 'Priya Nair',        email: 'priya@student.edu',   password: 'student123', role: 'student', rollNo: '21EC045', dept: 'ECE' },
    { id: 'std003', name: 'Rohan Mehta',       email: 'rohan@student.edu',   password: 'student123', role: 'student', rollNo: '21CS012', dept: 'CSE' },
    { id: 'adm001', name: 'Dr. Ramesh Kumar',  email: 'admin@exam.edu',      password: 'admin123',   role: 'admin',   rollNo: 'ADM001',  dept: 'Admin' },
    { id: 'adm002', name: 'Prof. Lakshmi S',   email: 'prof@exam.edu',       password: 'prof123',    role: 'admin',   rollNo: 'ADM002',  dept: 'Admin' },
  ];
}

// Auto-redirect if already logged in (for login/register pages)
function redirectIfLoggedIn() {
  const session = Auth.getSession();
  if (session) {
    window.location.href = session.user.role === 'admin' ? 'admin-dashboard.html' : 'student-dashboard.html';
  }
}
