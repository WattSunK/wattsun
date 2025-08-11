document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/users/active')
    .then(res => res.json())
    .then(users => {
      const tbody = document.getElementById('active-users-body');
      if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No active users</td></tr>`;
        return;
      }

      tbody.innerHTML = '';
      users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${user.id}</td>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>${user.phone}</td>
          <td>${user.type}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("Failed to fetch active users:", err);
      document.getElementById('active-users-body').innerHTML = `<tr><td colspan="5">Error loading users</td></tr>`;
    });
});
