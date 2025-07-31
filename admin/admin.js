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
