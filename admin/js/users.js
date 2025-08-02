// admin/js/users.js

document.addEventListener('DOMContentLoaded', function () {
  fetchAndRenderUsers();

  document.getElementById('add-user-btn')?.addEventListener('click', openAddUserModal);
  document.getElementById('user-search-btn')?.addEventListener('click', searchUsers);
  document.getElementById('user-clear-btn')?.addEventListener('click', clearUserSearch);
  document.getElementById('user-type-filter')?.addEventListener('change', fetchAndRenderUsers);
  document.getElementById('user-status-filter')?.addEventListener('change', fetchAndRenderUsers);

  // ---- EVENT DELEGATION FOR TABLE ACTION BUTTONS ----
  document.getElementById('users-table-body')?.addEventListener('click', function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const userId = btn.getAttribute('data-id');
    if (btn.classList.contains('view-user-btn')) {
      openViewUserModal(userId);
    } else if (btn.classList.contains('edit-user-btn')) {
      openEditUserModal(userId);
    } else if (btn.classList.contains('delete-user-btn')) {
      confirmDeleteUser(userId);
    }
  });
});

// ----------- REMAINDER OF LOGIC SAME AS BEFORE -----------

async function fetchAndRenderUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>`;

  let search = document.getElementById('user-search-input')?.value?.toLowerCase() || '';
  let type = document.getElementById('user-type-filter')?.value || 'All';
  let status = document.getElementById('user-status-filter')?.value || 'All';

  try {
    const response = await fetch('/api/users');
    if (!response.ok) throw new Error('Network response was not ok');
    let users = await response.json();

    // Filter users
    users = users.filter(u =>
      (!search || [u.name, u.email, u.phone].some(val => (val || '').toLowerCase().includes(search))) &&
      (type === 'All' || u.type === type) &&
      (status === 'All' || u.status === status)
    );

    renderUsersTable(users);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;">Error loading users</td></tr>`;
    console.error('Error fetching users:', error);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  if (!users || !Array.isArray(users) || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No users found</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  users.forEach((user, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${user.name || '-'}</td>
      <td>${user.email || '-'}</td>
      <td>${user.phone || '-'}</td>
      <td>${user.type || '-'}</td>
      <td>${user.orders || 0}</td>
      <td>${user.status || '-'}</td>
      <td>${user.last_active || '-'}</td>
      <td>
        <button class="action-btn view-btn view-user-btn" data-id="${user.id}">View</button>
        <button class="action-btn edit-btn edit-user-btn" data-id="${user.id}">Edit</button>
        <button class="action-btn delete-btn delete-user-btn" data-id="${user.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function searchUsers() { fetchAndRenderUsers(); }
function clearUserSearch() {
  document.getElementById('user-search-input').value = '';
  fetchAndRenderUsers();
}

// ----- MODAL LOGIC -----
function showModal(title, bodyHtml) {
  let modalBg = document.getElementById('user-modal-bg');
  if (!modalBg) return;
  let modal = document.getElementById('user-modal');
  modal.querySelector('#user-modal-title').innerText = title;
  modal.querySelector('#user-modal-message').innerText = '';
  modal.querySelector('#user-modal-form').style.display = 'none';
  modal.querySelector('#user-modal-view').style.display = 'none';
  modalBg.style.display = 'block';
  modal.style.display = 'block';
  // Remove any previous dynamic content
  const viewBox = modal.querySelector('#user-modal-view');
  viewBox && (viewBox.innerHTML = '');
  const formBox = modal.querySelector('#user-modal-form');
  formBox && (formBox.reset && formBox.reset());
}

function closeUserModal() {
  let modalBg = document.getElementById('user-modal-bg');
  let modal = document.getElementById('user-modal');
  if (modalBg) modalBg.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

// ----- VIEW USER -----
async function openViewUserModal(userId) {
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(userId)}`);
    if (!resp.ok) throw new Error('User not found');
    const user = await resp.json();

    let modalBg = document.getElementById('user-modal-bg');
    let modal = document.getElementById('user-modal');
    if (!modalBg || !modal) return;
    modal.querySelector('#user-modal-title').innerText = 'View User';
    modal.querySelector('#user-modal-form').style.display = 'none';

    let view = modal.querySelector('#user-modal-view');
    view.style.display = 'block';
    view.innerHTML = `
      <div style="margin-bottom:12px;"><b>Name:</b> ${user.name || '-'}</div>
      <div style="margin-bottom:12px;"><b>Email:</b> ${user.email || '-'}</div>
      <div style="margin-bottom:12px;"><b>Phone:</b> ${user.phone || '-'}</div>
      <div style="margin-bottom:12px;"><b>Type:</b> ${user.type || '-'}</div>
      <div style="margin-bottom:12px;"><b>Status:</b> ${user.status || '-'}</div>
      <div style="margin-bottom:12px;"><b>Last Active:</b> ${user.last_active || '-'}</div>
      <div class="modal-actions">
        <button type="button" id="user-modal-close-view" class="action-btn">Close</button>
      </div>
    `;
    modalBg.style.display = 'block';
    modal.style.display = 'block';
    view.querySelector('#user-modal-close-view').onclick = closeUserModal;
  } catch (e) {
    alert('Could not load user');
  }
}

// ----- EDIT USER -----
async function openEditUserModal(userId) {
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(userId)}`);
    if (!resp.ok) throw new Error('User not found');
    const user = await resp.json();

    let modalBg = document.getElementById('user-modal-bg');
    let modal = document.getElementById('user-modal');
    if (!modalBg || !modal) return;

    modal.querySelector('#user-modal-title').innerText = 'Edit User';
    let form = modal.querySelector('#user-modal-form');
    form.style.display = 'block';
    modal.querySelector('#user-modal-view').style.display = 'none';

    form['user-modal-name'].value = user.name || '';
    form['user-modal-email'].value = user.email || '';
    form['user-modal-phone'].value = user.phone || '';
    form['user-modal-type'].value = user.type || 'Customer';
    form['user-modal-status'].value = user.status || 'Active';

    document.getElementById('user-modal-save').onclick = async function (e) {
      e.preventDefault();
      // collect form data
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

    modalBg.style.display = 'block';
    modal.style.display = 'block';
  } catch (e) {
    alert('Could not load user');
  }
}

// ----- ADD USER -----
function openAddUserModal() {
  let modalBg = document.getElementById('user-modal-bg');
  let modal = document.getElementById('user-modal');
  if (!modalBg || !modal) return;
  modal.querySelector('#user-modal-title').innerText = 'Add User';
  let form = modal.querySelector('#user-modal-form');
  form.style.display = 'block';
  modal.querySelector('#user-modal-view').style.display = 'none';

  form.reset();

  document.getElementById('user-modal-save').onclick = async function (e) {
    e.preventDefault();
    const newUser = {
      name: form['user-modal-name'].value,
      email: form['user-modal-email'].value,
      phone: form['user-modal-phone'].value,
      type: form['user-modal-type'].value,
      status: form['user-modal-status'].value
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

  modalBg.style.display = 'block';
  modal.style.display = 'block';
}

// ----- DELETE USER -----
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

// ----- Modal close on outside click -----
document.getElementById('user-modal-bg')?.addEventListener('click', function (e) {
  if (e.target === this) closeUserModal();
});
document.getElementById('user-modal-close')?.addEventListener('click', closeUserModal);
