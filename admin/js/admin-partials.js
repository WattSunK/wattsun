// admin-partials.js

window.AdminPartials = {

  // DASHBOARD TAB LOGIC (Status Card, inline)
  loadDashboard: function() {
    const detailsDiv = document.getElementById('system-status-details');
    if (!detailsDiv) return;
    detailsDiv.innerHTML = 'Checking...';

    Promise.all([
      fetch('/api/health')
        .then(r => r.ok ? '🟢 Backend API: OK' : '🔴 Backend API: DOWN')
        .catch(() => '🔴 Backend API: DOWN'),
      fetch('/api/tunnel')
        .then(r => r.ok ? '🟢 Cloudflare Tunnel: Connected' : '🔴 Cloudflare Tunnel: Disconnected')
        .catch(() => '🔴 Cloudflare Tunnel: Disconnected')
    ]).then(results => {
      detailsDiv.innerHTML = results.map(line =>
        `<div style="margin-bottom:4px;"><span style="font-weight:600;">${line.split(':')[0]}:</span> ${line.includes('OK') || line.includes('Connected') ? '<span style="color:green;">🟢</span>' : '<span style="color:red;">🔴</span>'} <span>${line.split(':')[1].trim()}</span></div>`
      ).join('');
    });
  },

  // USERS TABLE LOGIC
  loadUsers: async function() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
    try {
      const res = await fetch('/api/users');
      const users = await res.json();
      const info = document.getElementById('pagination-info');
      if (!Array.isArray(users) || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9">No users found</td></tr>';
        if (info) info.textContent = 'Showing 0 of 0 entries';
        return;
      }
      tbody.innerHTML = '';
      users.forEach((user, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${i+1}</td>
          <td class="items-link">${user.name}</td>
          <td>${user.email}</td>
          <td>${user.phone || ''}</td>
          <td>${user.type}</td>
          <td>${user.orders || 0}</td>
          <td><span class="items-status ${user.status && user.status.toLowerCase() === 'active' ? 'active' : ''}">${user.status}</span></td>
          <td>${user.last_active ? (new Date(user.last_active)).toLocaleDateString() : ''}</td>
          <td>
            <button class="items-action-btn view-user-btn" title="View">View</button>
            <button class="items-action-btn edit-user-btn" title="Edit">Edit</button>
            <button class="items-action-btn delete-user-btn" title="Delete">Delete</button>
          </td>
        `;
        tbody.appendChild(row);
      });
      if (info) info.textContent = `Showing ${users.length} of ${users.length} entries`;
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9">Failed to load users</td></tr>';
      const info = document.getElementById('pagination-info');
      if (info) info.textContent = 'Error loading entries';
    }
  },

  // PROFILE TAB LOGIC
  loadProfile: async function() {
    function initials(name) {
      return name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0,2);
    }

    function showProfile(user) {
      document.getElementById('profile-avatar').textContent = initials(user.name || 'User');
      document.getElementById('profile-name').innerHTML = `${user.name} <span class="account-role">${user.type}</span>`;
      document.getElementById('profile-email').textContent = user.email;
      document.getElementById('input-name').value = user.name || '';
      document.getElementById('input-email').value = user.email || '';
      document.getElementById('input-phone').value = user.phone || '';
      let last = user.last_active ? new Date(user.last_active).toLocaleString() : 'Unknown';
      document.getElementById('profile-lastlogin').textContent = 'Last login: ' + last;
    }

    function getLoggedInUser() {
      try {
        return JSON.parse(localStorage.getItem('wattsun_user') || 'null');
      } catch (e) { return null; }
    }

    const user = getLoggedInUser();
    if (!user || !user.id) {
      document.body.innerHTML = '<h3>Please login first.</h3>';
      return;
    }
    try {
      const res = await fetch(`/api/users/${user.id}`);
      if (res.ok) {
        const fresh = await res.json();
        showProfile(fresh);
        window._profileUser = fresh;
      } else {
        showProfile(user);
        window._profileUser = user;
      }
    } catch (e) {
      showProfile(user);
      window._profileUser = user;
    }

    document.getElementById('profile-form').onsubmit = async function(e) {
      e.preventDefault();
      const name = document.getElementById('input-name').value;
      const email = document.getElementById('input-email').value;
      const phone = document.getElementById('input-phone').value;
      const user = window._profileUser;
      const success = document.getElementById('profile-success');
      const error = document.getElementById('profile-error');
      success.style.display = error.style.display = 'none';

      try {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, type: user.type, status: user.status })
        });
        if (res.ok) {
          success.textContent = "Profile updated!";
          success.style.display = 'block';
          localStorage.setItem('wattsun_user', JSON.stringify({...user, name, email, phone }));
          window.AdminPartials.loadProfile();
        } else {
          const d = await res.json();
          error.textContent = d.error || "Failed to update profile.";
          error.style.display = 'block';
        }
      } catch (e) {
        error.textContent = "Failed to update profile.";
        error.style.display = 'block';
      }
    };
  },

  // ORDERS TAB PLACEHOLDER
  loadOrders: function() {
    // If you want real logic later, add it here.
  },

  // DELIVERY ADDRESSES TAB PLACEHOLDER
  loadAddresses: function() {
    // If you want real logic later, add it here.
  },

  // PAYMENTS TAB PLACEHOLDER
  loadPayments: function() {
    // If you want real logic later, add it here.
  },

  // Email settings loader REMOVED—now your partial and initEmailSettings() will show up!
  // Add more loaders if needed.
};
// ----- USER MODAL LOGIC -----

// Utility: Get user ID from row
function getUserIdFromRow(row) {
  return row ? row.getAttribute('data-user-id') : null;
}

// --- Modal Open/Close Utility ---
function showUserModal(mode, user) {
  // mode: 'add', 'edit', 'view'
  const modalBg = document.getElementById('user-modal-bg');
  const modalForm = document.getElementById('user-modal-form');
  const modalView = document.getElementById('user-modal-view');
  const title = document.getElementById('user-modal-title');
  const message = document.getElementById('user-modal-message');
  modalBg.style.display = 'flex';
  message.textContent = '';

  if (mode === 'add') {
    title.textContent = 'Add New User';
    modalForm.style.display = '';
    modalView.style.display = 'none';
    document.getElementById('user-modal-name').value = '';
    document.getElementById('user-modal-email').value = '';
    document.getElementById('user-modal-phone').value = '';
    document.getElementById('user-modal-type').value = 'Customer';
    document.getElementById('user-modal-status').value = 'Active';
    document.getElementById('user-modal-save').textContent = 'Add User';
    modalForm.onsubmit = function(e) {
      e.preventDefault();
      saveUser('add');
    };
  } else if (mode === 'edit') {
    title.textContent = 'Edit User';
    modalForm.style.display = '';
    modalView.style.display = 'none';
    document.getElementById('user-modal-name').value = user.name || '';
    document.getElementById('user-modal-email').value = user.email || '';
    document.getElementById('user-modal-phone').value = user.phone || '';
    document.getElementById('user-modal-type').value = user.type || 'Customer';
    document.getElementById('user-modal-status').value = user.status || 'Active';
    document.getElementById('user-modal-save').textContent = 'Save Changes';
    modalForm.onsubmit = function(e) {
      e.preventDefault();
      saveUser('edit', user.id);
    };
  } else if (mode === 'view') {
    title.textContent = 'User Details';
    modalForm.style.display = 'none';
    modalView.style.display = '';
    document.getElementById('user-view-name').textContent = user.name;
    document.getElementById('user-view-email').textContent = user.email;
    document.getElementById('user-view-phone').textContent = user.phone || '';
    document.getElementById('user-view-type').textContent = user.type;
    document.getElementById('user-view-status').textContent = user.status;
    document.getElementById('user-view-active').textContent = user.last_active ?
      (new Date(user.last_active)).toLocaleString() : '';
  }
}

// Close modal utility
function closeUserModal() {
  document.getElementById('user-modal-bg').style.display = 'none';
}

// Bind modal close buttons (call this once on DOM load)
document.getElementById('user-modal-close').onclick = closeUserModal;
document.getElementById('user-modal-cancel').onclick = closeUserModal;
document.getElementById('user-modal-close-view').onclick = closeUserModal;

// --- Action Button Event Functions ---
function openAddUserModal() {
  showUserModal('add');
}

function openEditUserModal(userId) {
  fetch(`/api/users/${userId}`)
    .then(res => res.json())
    .then(user => showUserModal('edit', user));
}

function openViewUserModal(userId) {
  fetch(`/api/users/${userId}`)
    .then(res => res.json())
    .then(user => showUserModal('view', user));
}

function confirmDeleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user?")) return;
  fetch(`/api/users/${userId}`, { method: 'DELETE' })
    .then(res => {
      if (res.ok) {
        alert("User deleted.");
        window.AdminPartials.loadUsers();
      } else {
        alert("Failed to delete user.");
      }
    });
}

// --- Save/Add User ---
function saveUser(mode, userId) {
  const name = document.getElementById('user-modal-name').value.trim();
  const email = document.getElementById('user-modal-email').value.trim();
  const phone = document.getElementById('user-modal-phone').value.trim();
  const type = document.getElementById('user-modal-type').value;
  const status = document.getElementById('user-modal-status').value;
  const message = document.getElementById('user-modal-message');
  message.style.color = '#b22222';
  if (!name || !email) {
    message.textContent = "Name and Email are required.";
    return;
  }
  const user = { name, email, phone, type, status };
  let url = '/api/users';
  let method = 'POST';
  if (mode === 'edit' && userId) {
    url = `/api/users/${userId}`;
    method = 'PUT';
  }
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  })
  .then(res => res.json().then(data => ({ ok: res.ok, data })))
  .then(({ ok, data }) => {
    if (ok) {
      message.style.color = '#2ca123';
      message.textContent = mode === 'add' ? "User added!" : "User updated!";
      setTimeout(() => {
        closeUserModal();
        window.AdminPartials.loadUsers();
      }, 800);
    } else {
      message.textContent = data.error || "Operation failed.";
    }
  })
  .catch(() => {
    message.textContent = "Could not connect to server.";
  });
}

// ---- Toolbar and Table Events ----

// Toolbar buttons
document.getElementById('add-user-btn').onclick = openAddUserModal;
document.getElementById('user-search-btn').onclick = runUserSearch;
document.getElementById('user-clear-btn').onclick = clearUserSearch;

// Filters
document.getElementById('user-type-filter').onchange = runUserSearch;
document.getElementById('user-status-filter').onchange = runUserSearch;

// Table row action buttons (delegation)
document.getElementById('users-table-body').onclick = function(e) {
  const row = e.target.closest('tr');
  if (!row) return;
  const userId = getUserIdFromRow(row);
  if (e.target.classList.contains('view-user-btn')) openViewUserModal(userId);
  if (e.target.classList.contains('edit-user-btn')) openEditUserModal(userId);
  if (e.target.classList.contains('delete-user-btn')) confirmDeleteUser(userId);
};

// -- Search/filter logic --
function runUserSearch() {
  const search = document.getElementById('user-search-input').value.trim();
  const type = document.getElementById('user-type-filter').value;
  const status = document.getElementById('user-status-filter').value;

  let url = `/api/users?`;
  if (search) url += `search=${encodeURIComponent(search)}&`;
  if (type && type !== 'All') url += `type=${encodeURIComponent(type)}&`;
  if (status && status !== 'All') url += `status=${encodeURIComponent(status)}&`;

  fetch(url)
    .then(res => res.json())
    .then(users => {
      window.AdminPartials.renderUsers(users); // renderUsers must be present in admin-partials.js
    });
}

function clearUserSearch() {
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-type-filter').value = 'All';
  document.getElementById('user-status-filter').value = 'All';
  runUserSearch();
}
