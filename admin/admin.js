// admin.js - dynamic loader for sidebar, header, footer, and all sections

function loadPartial(path, target) {
  fetch(path)
    .then(res => res.text())
    .then(html => { document.getElementById(target).innerHTML = html; });
}

// Initial load of layout
loadPartial('partials/sidebar.html', 'sidebar-container');
loadPartial('partials/header.html', 'header-container');
loadPartial('partials/footer.html', 'footer-container');

// Section loader
let currentSection = 'dashboard';
function loadSection(section) {
  currentSection = section;
  let file = section.startsWith('myaccount/')
    ? `partials/myaccount/${section.split('/')[1]}.html`
    : `partials/${section}.html`;
  loadPartial(file, 'main-content');
  window.location.hash = section;
}

// Navigation event handling
document.addEventListener('DOMContentLoaded', function() {
  loadSection('dashboard');
  document.body.addEventListener('click', function(e) {
    // Sidebar/main nav
    if (e.target.matches('[data-section]')) {
      e.preventDefault();
      document.querySelectorAll('.sidebar nav a').forEach(link => link.classList.remove('active'));
      e.target.classList.add('active');
      loadSection(e.target.getAttribute('data-section'));
    }
    // MyAccount sub-tabs
    if (e.target.matches('[data-myaccount]')) {
      e.preventDefault();
      document.querySelectorAll('.myaccount-tab-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      loadSection('myaccount/' + e.target.getAttribute('data-myaccount'));
    }
  });
  // Handle back/forward navigation
  window.addEventListener('hashchange', () => {
    let sec = window.location.hash.replace('#', '');
    if (sec) loadSection(sec);
  });
});

// --- THEME SWITCHER LOGIC ---
function setTheme(theme) {
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

// On page load, set theme from storage or default to light
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

// Wait for main content to load, then wire up the theme selector
document.addEventListener('DOMContentLoaded', function() {
  function bindThemeSelector() {
    const themeSelect = document.querySelector('select[name="theme"]');
    if (themeSelect) {
      themeSelect.value = localStorage.getItem('theme') || 'light';
      themeSelect.addEventListener('change', e => setTheme(e.target.value));
    }
  }
  // Re-bind on main-content change (because partials are loaded dynamically)
  const mainContent = document.getElementById('main-content');
  const observer = new MutationObserver(bindThemeSelector);
  observer.observe(mainContent, { childList: true, subtree: true });
  bindThemeSelector();
});
