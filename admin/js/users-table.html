// users-table.js
async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    const info = document.getElementById('pagination-info');
    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">No users found</td></tr>';
      info.textContent = 'Showing 0 of 0 entries';
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
    info.textContent = `Showing ${users.length} of ${users.length} entries`;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9">Failed to load users</td></tr>';
    document.getElementById('pagination-info').textContent = 'Error loading entries';
  }
}
