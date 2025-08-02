// admin-partials.js

window.AdminPartials = {
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
        row.setAttribute('data-user-id', user.id);
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
  }
};
