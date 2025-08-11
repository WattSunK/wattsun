// admin/js/admin-users.js

// Full logic with modal, profile link, filters, status toggle, and actions

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
      <td><a href="#myaccount/profile?id=${user.id}" class="table-link">${user.name}</a></td>
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

async function openViewUserModal(userId) {
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(userId)}`);
    if (!resp.ok) throw new Error('User not found');
    const user = await resp.json();

    const modal = document.getElementById('user-modal');
    const modalBg = document.getElementById('user-modal-bg');
    modal.querySelector('#user-modal-title').innerText = 'View User';
    modal.querySelector('#user-modal-form').style.display = 'none';
    const view = modal.querySelector('#user-modal-view');
    view.innerHTML = `
      <div><b>Name:</b> ${user.name || '-'}</div>
      <div><b>Email:</b> ${user.email || '-'}</div>
      <div><b>Phone:</b> ${user.phone || '-'}</div>
      <div><b>Type:</b> ${user.type || '-'}</div>
      <div><b>Status:</b> ${user.status || '-'}</div>
      <div><b>Last Active:</b> ${user.last_active || '-'}</div>
      <div class="modal-actions"><button type="button" id="user-modal-close-view" class="action-btn button">Close</button></div>
    `;
    view.style.display = 'block';
    modalBg.style.display = 'block';
    modal.style.display = 'block';
    view.querySelector('#user-modal-close-view').onclick = closeUserModal;
  } catch (e) {
    alert('Could not load user');
  }
}

async function openEditUserModal(userId) {
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(userId)}`);
    if (!resp.ok) throw new Error('User not found');
    const user = await resp.json();

    const modal = document.getElementById('user-modal');
    const modalBg = document.getElementById('user-modal-bg');
    const form = modal.querySelector('#user-modal-form');
    form['user-modal-name'].value = user.name || '';
    form['user-modal-email'].value = user.email || '';
    form['user-modal-phone'].value = user.phone || '';
    form['user-modal-type'].value = user.type || 'Customer';
    form['user-modal-status'].value = user.status || 'Active';

    ['user-modal-save', 'user-modal-cancel', 'user-modal-close'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });

    document.getElementById('user-modal-save').onclick = async function (e) {
      e.preventDefault();
      const updatedUser = {
        name: form['user-modal-name'].value,
        email: form['user-modal-email'].value,
        phone: form['user-modal-phone'].value,
        type: form['user-modal-type'].value,
        status: form['user-modal-status'].value
      };
      try {
        const updateResp = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedUser)
        });
        if (!updateResp.ok) throw new Error('Failed to update');
        closeUserModal();
        fetchAndRenderUsers();
      } catch (err) {
        modal.querySelector('#user-modal-message').innerText = "Error: Could not update user.";
      }
    };

    document.getElementById('user-modal-cancel').onclick = closeUserModal;
    document.getElementById('user-modal-close').onclick = closeUserModal;

    modal.querySelector('#user-modal-form').style.display = 'block';
    modal.querySelector('#user-modal-view').style.display = 'none';
    modalBg.style.display = 'block';
    modal.style.display = 'block';
  } catch (e) {
    alert('Could not load user');
  }
}

function openAddUserModal() {
  const modal = document.getElementById('user-modal');
  const modalBg = document.getElementById('user-modal-bg');
  const form = modal.querySelector('#user-modal-form');
  form.reset();

  ['user-modal-save', 'user-modal-cancel', 'user-modal-close'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.replaceWith(el.cloneNode(true));
  });

  document.getElementById('user-modal-save').onclick = async function (e) {
    e.preventDefault();
    const newUser = {
      name: form['user-modal-name'].value,
      email: form['user-modal-email'].value,
      phone: form['user-modal-phone'].value,
      type: form['user-modal-type'].value,
      status: form['user-modal-status'].value,
      password: 'changeme'
    };
    try {
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (!resp.ok) throw new Error('Failed to add');
      closeUserModal();
      fetchAndRenderUsers();
    } catch (err) {
      modal.querySelector('#user-modal-message').innerText = "Error: Could not add user.";
    }
  };

  document.getElementById('user-modal-cancel').onclick = closeUserModal;
  document.getElementById('user-modal-close').onclick = closeUserModal;

  modal.querySelector('#user-modal-title').innerText = 'Add User';
  modal.querySelector('#user-modal-form').style.display = 'block';
  modal.querySelector('#user-modal-view').style.display = 'none';
  modalBg.style.display = 'block';
  modal.style.display = 'block';
}

function confirmDeleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  deleteUser(userId);
}

async function deleteUser(userId) {
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Failed to delete');
    fetchAndRenderUsers();
  } catch (err) {
    alert('Could not delete user.');
  }
}

function closeUserModal() {
  document.getElementById('user-modal-bg').style.display = 'none';
  document.getElementById('user-modal').style.display = 'none';
}
