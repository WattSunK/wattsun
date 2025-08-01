let currentSection = 'dashboard';

function loadLayoutPartials() {
  fetch('partials/sidebar.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('sidebar-container').innerHTML = html;
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
  currentSection = section;
  let file = section.startsWith('myaccount/')
    ? `partials/myaccount/${section.split('/')[1]}.html`
    : `partials/${section}.html`;

  fetch(file)
    .then(res => res.text())
    .then(html => {
      document.getElementById('main-content').innerHTML = html;

      if (section === 'myaccount/email-settings') {
        initEmailSettings();
      }
    });

  window.location.hash = section;
}

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

document.addEventListener('DOMContentLoaded', () => {
  loadLayoutPartials();

  let initialSection = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
  loadSection(initialSection);

  document.body.addEventListener('click', (e) => {
    if (e.target.matches('[data-section]')) {
      e.preventDefault();
      document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.remove('active'));
      e.target.classList.add('active');
      loadSection(e.target.getAttribute('data-section'));
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
    if (sec) loadSection(sec);
  });
});