// admin/js/admin-users.js

// Initialize users tab when loaded
function initAdminUsers() {
  loadFilterState();
  fetchAndRenderUsers();

  document.getElementById('add-user-btn')?.addEventListener('click', openAddUserModal);
  document.getElementById('user-search-input')?.addEventListener('input', handleLiveSearch);
  document.getElementById('user-search-btn')?.addEventListener('click', fetchAndRenderUsers);
  document.getElementById('user-clear-btn')?.addEventListener('click', clearUserSearch);
  document.getElementById('user-type-filter')?.addEventListener('change', fetchAndRenderUsers);
  document.getElementById('user-status-filter')?.addEventListener('change', fetchAndRenderUsers);

  document.getElementById('users-table-body')?.addEventListener('click', async function (e) {
    const btn = e.target.closest('button');
    const toggle = e.target.closest('.inline-status-toggle');
    const id = btn?.dataset.id || toggle?.dataset.id;
    if (!id) return;

    if (btn?.classList.contains('view-user-btn')) return openViewUserModal(id);
    if (btn?.classList.contains('edit-user-btn')) return openEditUserModal(id);
    if (btn?.classList.contains('delete-user-btn')) return confirmDeleteUser(id);

    if (toggle) {
      const newStatus = toggle.checked ? 'Active' : 'Inactive';
      await fetch(`/api/users/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      toggle.closest('td').querySelector('[data-status-label]').textContent = newStatus;
    }
  });
}

function handleLiveSearch() {
  localStorage.setItem('user_search_text', document.getElementById('user-search-input').value);
  fetchAndRenderUsers();
}

function loadFilterState() {
  const saved = localStorage.getItem('user_search_text');
  if (saved) document.getElementById('user-search-input').value = saved;
}

function clearUserSearch() {
  document.getElementById('user-search-input').value = '';
  localStorage.removeItem('user_search_text');
  fetchAndRenderUsers();
}

async function fetchAndRenderUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>`;
  let search = document.getElementById('user-search-input').value.toLowerCase();
  let type = document.getElementById('user-type-filter').value;
  let status = document.getElementById('user-status-filter').value;

  try {
    let users = await fetch('/api/users').then(r => r.json());
    users = users.filter(u =>
      (!search || [u.name, u.email, u.phone].some(v => v?.toLowerCase().includes(search))) &&
      (type === 'All' || u.type === type) &&
      (status === 'All' || u.status === status)
    );
    renderUsersTable(users);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;">Error loading users</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = users.length ? '' : `<tr><td colspan="9" style="text-align:center;">No users found</td></tr>`;
  users.forEach((user, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${user.name || '-'}</td>
      <td>${user.email || '-'}</td>
      <td>${user.phone || '-'}</td>
      <td>${user.type || '-'}</td>
      <td>${user.orders || 0}</td>
      <td>
        <label class="switch">
          <input type="checkbox" class="inline-status-toggle" data-id="${user.id}" ${user.status === 'Active' ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <span class="status-label" data-status-label>${user.status}</span>
      </td>
      <td>${user.last_active || '-'}</td>
      <td>
        <button class="action-btn view-btn view-user-btn" data-id="${user.id}">View</button>
        <button class="action-btn edit-btn edit-user-btn" data-id="${user.id}">Edit</button>
        <button class="action-btn delete-btn delete-user-btn" data-id="${user.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Use existing modal logic from users.js or move modular
// All modal logic (openViewUserModal, openEditUserModal, etc.) assumed available globally
