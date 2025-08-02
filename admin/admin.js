// admin.js for Wattsun Solar Admin Panel
// Unified authentication, role-based access, best practice version

let currentSection = 'dashboard';

// --- Universal Auth Check on Admin Panel Load ---
function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem('wattsun_user') || 'null');
  } catch (e) {
    return null;
  }
}

// --- Main Entry: Check Auth First! ---
document.addEventListener('DOMContentLoaded', () => {
  const user = getLoggedInUser();

  if (!user) {
    // Not logged in – redirect to main site for login
    window.location.href = '/index.html';
    return;
  }

  // Load UI and restrict features by user type
  loadLayoutPartials();

  // Choose initial section: non-admins never see users tab first!
  let initialSection = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
  if (initialSection === 'users' && user.type !== 'admin') {
    initialSection = 'dashboard';
    window.location.hash = 'dashboard';
  }
  loadSection(initialSection);

  // Handle sidebar/tab navigation
  document.body.addEventListener('click', (e) => {
    if (e.target.matches('[data-section]')) {
      e.preventDefault();
      // Admin-only guard
      const section = e.target.getAttribute('data-section');
      if (section === 'users' && user.type !== 'admin') {
        alert('Access denied: Admins only');
        return;
      }
      document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.remove('active'));
      e.target.classList.add('active');
      loadSection(section);
    }

    if (e.target.matches('[data-myaccount]')) {
      e.preventDefault();
      document.querySelectorAll('.myaccount-tab-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      loadSection('myaccount/' + e.target.getAttribute('data-myaccount'));
    }
  });

  // Handle hash changes for direct links
  window.addEventListener('hashchange', () => {
    let sec = window.location.hash.replace('#', '');
    // Block admin-only tab if not admin
    if (sec === 'users' && user.type !== 'admin') {
      alert('Access denied: Admins only');
      window.location.hash = 'dashboard';
      sec = 'dashboard';
    }
    loadSection(sec);
  });
});

// --- Sidebar/Header/Footer and Logout ---
function loadLayoutPartials() {
  fetch('partials/sidebar.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('sidebar-container').innerHTML = html;

      updateSidebarUserInfo();

      // Hide admin-only links for non-admin users
      const user = getLoggedInUser();
      if (user && user.type !== 'admin') {
        document.querySelectorAll('.sidebar .admin-only').forEach(el => el.style.display = 'none');
      }

      // Attach logout
      const logoutBtn = document.querySelector('.sidebar .logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
          e.preventDefault();
          localStorage.removeItem('wattsun_user');
          window.location.href = "/index.html";
        });
      }
    });

  fetch('partials/header.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('header-container').innerHTML = html;
    });

  fetch('partials/footer.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('footer-container').innerHTML = html;
    });
}

function updateSidebarUserInfo() {
  const user = getLoggedInUser();
  const userDiv = document.getElementById('sidebar-user-info');
  if (userDiv) {
    if (user && user.name) {
      userDiv.innerHTML = `<strong>${user.name}</strong><br>${user.email || ''}<br><span style="color:#555;font-size:0.96em;">${user.type || ''}</span>`;
    } else {
      userDiv.innerHTML = `<span style="color:#b22222">No user info</span>`;
    }
  }
}

// --- Section Loader (with role check for admin-only tabs) ---
function loadSection(section) {
  const user = getLoggedInUser();
  currentSection = section;

  // Admin-only tabs
  if (section === 'users' && user.type !== 'admin') {
    alert('Access denied: Admins only');
    window.location.hash = 'dashboard';
    section = 'dashboard';
  }

  let file = section.startsWith('myaccount/')
    ? `partials/myaccount/${section.split('/')[1]}.html`
    : `partials/${section}.html`;

  fetch(file)
    .then(res => res.text())
    .then(html => {
      document.getElementById('main-content').innerHTML = html;

      // Call the correct loader
      if (window.AdminPartials) {
        if (section === 'dashboard' && typeof window.AdminPartials.loadDashboard === 'function') {
          window.AdminPartials.loadDashboard();
        }
        if (section === 'users' && typeof window.AdminPartials.loadUsers === 'function') {
          window.AdminPartials.loadUsers();
        }
        if (section === 'myaccount/profile' && typeof window.AdminPartials.loadProfile === 'function') {
          window.AdminPartials.loadProfile();
        }
        if (section === 'myaccount/orders' && typeof window.AdminPartials.loadOrders === 'function') {
          window.AdminPartials.loadOrders();
        }
        if (section === 'myaccount/addresses' && typeof window.AdminPartials.loadAddresses === 'function') {
          window.AdminPartials.loadAddresses();
        }
        if (section === 'myaccount/payments' && typeof window.AdminPartials.loadPayments === 'function') {
          window.AdminPartials.loadPayments();
        }
        if (section === 'myaccount/email-settings' && typeof window.AdminPartials.loadEmailSettings === 'function') {
          window.AdminPartials.loadEmailSettings();
        }
        // Add more as needed
      }

      if (section === 'myaccount/email-settings') {
        initEmailSettings();
      }

      // Dynamically load users.js for users tab (admin only)
      if (section === 'users' && user.type === 'admin') {
        var oldScript = document.getElementById('users-js-script');
        if (oldScript) oldScript.remove();
        var script = document.createElement('script');
        script.src = 'js/users.js';
        script.id = 'users-js-script';
        document.body.appendChild(script);
      }
    });

  window.location.hash = section;
}

// --- Email settings helper (unchanged) ---
function initEmailSettings() {
  async function fetchAdminEmail() {
    try {
      const res = await fetch('/api/admin/email');
      if (!res.ok) throw new Error('Failed to fetch admin email');
      const data = await res.json();
      document.getElementById('adminEmailInput').value = data.email || '';
    } catch (err) {
      console.error(err);
      const msg = document.getElementById('emailSettingsMessage');
      if (msg) {
        msg.style.color = '#b22222';
        msg.textContent = 'Could not load admin email.';
      }
    }
  }

  async function updateAdminEmail(email) {
    try {
      const res = await fetch('/api/admin/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to update email');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  const form = document.getElementById('emailSettingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('adminEmailInput');
    const messageDiv = document.getElementById('emailSettingsMessage');
    const email = emailInput.value.trim();

    if (!email || !email.includes('@')) {
      messageDiv.style.color = '#b22222';
      messageDiv.textContent = 'Please enter a valid email address.';
      return;
    }

    const success = await updateAdminEmail(email);
    if (success) {
      messageDiv.style.color = '#2ca123';
      messageDiv.textContent = 'Admin email updated successfully.';
      setTimeout(() => {
        messageDiv.textContent = '';
      }, 3000);
    } else {
      messageDiv.style.color = '#b22222';
      messageDiv.textContent = 'Failed to update admin email.';
    }
  });

  fetchAdminEmail();
}
