// users.js

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

// Bind modal close buttons (run after DOM is ready)
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
        if (window.AdminPartials && typeof window.AdminPartials.loadUsers === 'function') {
          window.AdminPartials.loadUsers();
        }
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
        if (window.AdminPartials && typeof window.AdminPartials.loadUsers === 'function') {
          window.AdminPartials.loadUsers();
        }
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

document.getElementById('add-user-btn').onclick = openAddUserModal;
document.getElementById('user-search-btn').onclick = runUserSearch;
document.getElementById('user-clear-btn').onclick = clearUserSearch;

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
      if (window.AdminPartials && typeof window.AdminPartials.renderUsers === 'function') {
        window.AdminPartials.renderUsers(users);
      }
    });
}

function clearUserSearch() {
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-type-filter').value = 'All';
  document.getElementById('user-status-filter').value = 'All';
  runUserSearch();
}
