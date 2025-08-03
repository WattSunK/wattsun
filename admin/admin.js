// admin.js for Wattsun Solar Admin Panel
// Robust role checking and debug logging

let currentSection = 'dashboard';

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem('wattsun_user') || 'null');
  } catch (e) {
    return null;
  }
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

function loadLayoutPartials() {
  fetch('partials/sidebar.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('sidebar-container').innerHTML = html;
      updateSidebarUserInfo();

      const user = getLoggedInUser();
      const role = user && typeof user.type === 'string' ? user.type.trim().toLowerCase() : '';
      if (role !== 'admin') {
        document.querySelectorAll('.sidebar .admin-only').forEach(el => el.style.display = 'none');
      }

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

function loadSection(section) {
  const user = getLoggedInUser();
  const role = user && typeof user.type === 'string' ? user.type.trim().toLowerCase() : '';
  currentSection = section;

  if ([
    'users', 'items', 'dispatch', 'settings'
  ].includes(section) && role !== 'admin') {
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

      if (section === 'items' && typeof window.initAdminItems === 'function') {
        window.initAdminItems();
      }

      if (section === 'users' && role === 'admin') {
        ['users-js-script', 'admin-users-js-script'].forEach(id => {
          const oldScript = document.getElementById(id);
          if (oldScript) oldScript.remove();
        });

        const script1 = document.createElement('script');
        script1.src = 'js/users.js';
        script1.id = 'users-js-script';
        script1.onload = () => {
          const script2 = document.createElement('script');
          script2.src = 'js/admin-users.js';
          script2.id = 'admin-users-js-script';
          script2.onload = () => {
            if (typeof initAdminUsers === 'function') initAdminUsers();
          };
          document.body.appendChild(script2);
        };
        document.body.appendChild(script1);
      }
    });

  window.location.hash = section;
}

document.addEventListener('DOMContentLoaded', () => {
  const user = getLoggedInUser();
  const role = user && typeof user.type === 'string' ? user.type.trim().toLowerCase() : '';

  if (!user) {
    window.location.href = '/index.html';
    return;
  }

  loadLayoutPartials();

  let initialSection = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
  if ([
    'users', 'items', 'dispatch', 'settings'
  ].includes(initialSection) && role !== 'admin') {
    initialSection = 'dashboard';
    window.location.hash = 'dashboard';
  }
  loadSection(initialSection);

  document.body.addEventListener('click', (e) => {
    if (e.target.matches('[data-section]')) {
      e.preventDefault();
      const section = e.target.getAttribute('data-section');
      if ([
        'users', 'items', 'dispatch', 'settings'
      ].includes(section) && role !== 'admin') {
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

  window.addEventListener('hashchange', () => {
    let sec = window.location.hash.replace('#', '');
    if ([
      'users', 'items', 'dispatch', 'settings'
    ].includes(sec) && role !== 'admin') {
      alert('Access denied: Admins only');
      window.location.hash = 'dashboard';
      sec = 'dashboard';
    }
    loadSection(sec);
  });
});
