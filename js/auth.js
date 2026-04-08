/* ==========================================
   EXAM GUARDIAN — AUTH MODULE
   JWT simulation via localStorage
   ========================================== */

const Auth = {
  // Simulated user database
  users: [
    { id: 'std001', name: 'Arjun Sharma',    email: 'arjun@student.edu',   password: 'student123', role: 'student', rollNo: '21EC020', dept: 'ECE' },
    { id: 'std002', name: 'Priya Nair',      email: 'priya@student.edu',   password: 'student123', role: 'student', rollNo: '21EC045', dept: 'ECE' },
    { id: 'std003', name: 'Rohan Mehta',     email: 'rohan@student.edu',   password: 'student123', role: 'student', rollNo: '21CS012', dept: 'CSE' },
    { id: 'std004', name: 'Sneha Pillai',    email: 'sneha@student.edu',   password: 'student123', role: 'student', rollNo: '21CS034', dept: 'CSE' },
    { id: 'std005', name: 'Karthik Rajan',   email: 'karthik@student.edu', password: 'student123', role: 'student', rollNo: '21ME008', dept: 'MECH' },
    { id: 'adm001', name: 'Dr. Ramesh Kumar', email: 'admin@exam.edu',     password: 'admin123',   role: 'admin',   dept: 'Admin' },
    { id: 'adm002', name: 'Prof. Lakshmi S', email: 'prof@exam.edu',       password: 'prof123',    role: 'admin',   dept: 'Admin' },
  ],

  // Generate a fake JWT
  generateToken(user) {
    const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      iat: Date.now(),
      exp: Date.now() + 8 * 60 * 60 * 1000 // 8 hours
    }));
    const sig = btoa(user.id + user.role + Date.now());
    return `${header}.${payload}.${sig}`;
  },

  // Login
  login(email, password) {
    const user = this.users.find(u => u.email === email && u.password === password);
    if (!user) {
      if (email.includes('@')) {
        return this.register(email.split('@')[0], email, password, 'student');
      }
      return { success: false, error: 'Invalid email or password' };
    }

    const token = this.generateToken(user);
    const session = { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, rollNo: user.rollNo, dept: user.dept } };
    sessionStorage.setItem('eg_session', JSON.stringify(session));
    return { success: true, user: session.user, role: user.role };
  },

  // Register (simulation — adds to runtime array only)
  register(name, email, password, role) {
    if (this.users.find(u => u.email === email)) {
      return { success: false, error: 'Email already registered' };
    }
    const id = (role === 'admin' ? 'adm' : 'std') + String(Date.now()).slice(-4);
    const newUser = { id, name, email, password, role, rollNo: id.toUpperCase(), dept: 'New' };
    this.users.push(newUser);
    return this.login(email, password);
  },

  // Get current session
  getSession() {
    try {
      const raw = sessionStorage.getItem('eg_session');
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Check expiry from JWT payload
      const payload = JSON.parse(atob(session.token.split('.')[1]));
      if (payload.exp < Date.now()) { this.logout(); return null; }
      return session;
    } catch { return null; }
  },

  // Get current user
  getUser() {
    const session = this.getSession();
    return session ? session.user : null;
  },

  // Logout
  logout() {
    sessionStorage.removeItem('eg_session');
    window.location.href = 'login.html';
  },

  // Require auth — redirect if not logged in
  requireAuth(requiredRole = null) {
    const session = this.getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    if (requiredRole && session.user.role !== requiredRole) {
      window.location.href = session.user.role === 'admin' ? 'admin-dashboard.html' : 'index.html';
      return null;
    }
    return session.user;
  },

  // Get all students (for admin)
  getAllStudents() {
    return this.users.filter(u => u.role === 'student');
  }
};

// Auto-redirect if already logged in (for login page)
function redirectIfLoggedIn() {
  const session = Auth.getSession();
  if (session) {
    window.location.href = session.user.role === 'admin' ? 'admin-dashboard.html' : 'index.html';
  }
}
