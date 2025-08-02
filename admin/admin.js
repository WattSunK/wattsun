// admin.js for Wattsun Solar Admin Panel
// Robust role checking and debug logging

let currentSection = 'dashboard';

// --- Get logged-in user from localStorage ---
function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem('wattsun_user') || 'null');
  } catch (e) {
    return null;
  }
}

// --- Update sidebar user info ---
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

// --- Load sidebar, header, footer, and attach handlers ---
function loadLayoutPartials() {
  fetch('partials/sidebar.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('sidebar-container').innerHTML = html;

      // Update user info now that sidebar is loaded!
      updateSidebarUserInfo();

      // Hardened admin role logic!
      const user = getLoggedInUser();
      const role = user && typeof user.type === 'string'
        ? user.type.trim().toLowerCase()
        : '';
      console.log('User type (normalized):', role);
      if (role !== 'admin') {
        document.querySelectorAll('.sidebar .admin-only').forEach(el => el.style.display = 'none');
      } else {
        // For debugging: log visible admin-only links
        console.log('Admin-only links:', document.querySelectorAll('.sidebar .admin-only'));
      }

      // Attach logout handler
      const logoutBtn = document.querySelector('.sidebar .logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
          e.preventDefault();
          localStorage.removeItem('wattsun_user');
          window.location.href = "/index.html";
        });
      }
    });

  // Header and footer
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

// --- Section loader with robust role-based access ---
function loadSection(section) {
  const user = getLoggedInUser();
  const role = user && typeof user.type === 'string'
    ? user.type.trim().toLowerCase()
    : '';
  currentSection = section;

  // Admin-only tabs
  if (
    ['users', 'items', 'dispatch', 'settings'].includes(section) &&
    role !== 'admin'
  ) {
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

      // --- Begin dynamic per-section JS logic ---

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
      }

      if (section === 'myaccount/email-settings') {
        initEmailSettings();
      }

      // --- FIX: Explicitly run admin-items.js logic for items tab ---
      if (section === 'items' && typeof window.initAdminItems === 'function') {
        window.initAdminItems();
      }

      // Load users.js only for users tab and only if admin
      if (section === 'users' && role === 'admin') {
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

// --- Initial entrypoint: Check login and load page ---
document.addEventListener('DOMContentLoaded', () => {
  const user = getLoggedInUser();
  const role = user && typeof user.type === 'string'
    ? user.type.trim().toLowerCase()
    : '';

  if (!user) {
    window.location.href = '/index.html'; // Not logged in: go to main site
    return;
  }

  loadLayoutPartials();

  // Don't default to admin-only tab for non-admin users
  let initialSection = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
  if (
    ['users', 'items', 'dispatch', 'settings'].includes(initialSection) &&
    role !== 'admin'
  ) {
    initialSection = 'dashboard';
    window.location.hash = 'dashboard';
  }
  loadSection(initialSection);

  // Handle sidebar and tab navigation
  document.body.addEventListener('click', (e) => {
    if (e.target.matches('[data-section]')) {
      e.preventDefault();
      const section = e.target.getAttribute('data-section');
      // Admin-only guard
      if (
        ['users', 'items', 'dispatch', 'settings'].includes(section) &&
        role !== 'admin'
      ) {
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

  // Handle direct links/hash changes
  window.addEventListener('hashchange', () => {
    let sec = window.location.hash.replace('#', '');
    if (
      ['users', 'items', 'dispatch', 'settings'].includes(sec) &&
      role !== 'admin'
    ) {
      alert('Access denied: Admins only');
      window.location.hash = 'dashboard';
      sec = 'dashboard';
    }
    loadSection(sec);
  });
});
