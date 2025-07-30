// admin.js

// Sidebar navigation logic (show/hide sections)
const navLinks = document.querySelectorAll('.sidebar nav a');
const sections = {
  "Dashboard": document.getElementById('dashboard-section'),
  "Orders": null, // placeholder
  "Items": document.getElementById('items-section'),
  "Customers": null, // placeholder
  "Dispatch": null // placeholder
};
const sectionTitle = document.getElementById('section-title');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    // Hide all sections
    Object.entries(sections).forEach(([key, sec]) => {
      if (sec) sec.style.display = "none";
    });
    // Show chosen section
    let text = link.textContent.trim();
    sectionTitle.textContent = text;
    if(sections[text]) sections[text].style.display = "block";
    // (Optionally) call load functions for that section
    if(text === "Items") loadItems();
  });
});

// Example: Fetch items from API and render table
function loadItems() {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '<tr><td colspan="6">Loading items...</td></tr>';
  fetch('/api/admin/items')
    .then(res => res.ok ? res.json() : Promise.reject('API error'))
    .then(data => {
      if(!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No items found.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.name}</td>
          <td>${item.sku}</td>
          <td>${item.stock}</td>
          <td>KSH ${item.price}</td>
          <td>${item.status || 'Active'}</td>
          <td>
            <button class="action-btn" onclick="editItem('${item.id}')">Edit</button>
            <button class="action-btn" onclick="deleteItem('${item.id}')">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(() => {
      tbody.innerHTML = '<tr><td colspan="6">Failed to load items.</td></tr>';
    });
}

// Placeholder for edit/delete logic (expand later)
function editItem(id) {
  alert('Edit Item: ' + id);
}
function deleteItem(id) {
  if(confirm('Delete this item?')) alert('Item deleted: ' + id);
}

// Load dashboard section by default
sections["Dashboard"].style.display = "block";
