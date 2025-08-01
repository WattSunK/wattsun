// admin/js/admin-items.js

document.addEventListener('DOMContentLoaded', function () {
  // Initial fetch and render
  fetchAndRenderItems();

  // Toolbar events
  const addItemBtn = document.getElementById('add-item-btn');
  if (addItemBtn) addItemBtn.addEventListener('click', openAddItemModal);

  const manageCategoriesBtn = document.getElementById('manage-categories-btn');
  if (manageCategoriesBtn) manageCategoriesBtn.addEventListener('click', openCategoryManager);

  // You can add search/filter/pagination listeners here as needed
});

// Fetch items from API and render table
async function fetchAndRenderItems() {
  const tbody = document.querySelector('.items-table tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>`;

  try {
    const response = await fetch('/api/items');
    if (!response.ok) throw new Error('Network response was not ok');
    const items = await response.json();
    renderItemsTable(items);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;">Error loading items</td></tr>`;
    console.error('Error fetching items:', error);
  }
}

// Render the items into the table
function renderItemsTable(items) {
  const tbody = document.querySelector('.items-table tbody');
  if (!tbody) return;

  if (!items || !Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No items found</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  items.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <img src="${item.image || '/images/products/default.jpg'}" alt="${item.name || ''}" class="item-thumb" />
      </td>
      <td class="items-link">${item.name || '-'}</td>
      <td>${item.sku || '-'}</td>
      <td>${item.category || '-'}</td>
      <td>${item.stock != null ? item.stock : '-'}</td>
      <td>KSh ${item.price ? Number(item.price).toLocaleString() : '-'}</td>
      <td>
        <span class="items-status ${item.active ? 'active' : 'inactive'}">
          ${item.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="items-action-btn edit-btn" data-id="${item.id}">Edit</button>
        <button class="items-action-btn delete-btn" data-id="${item.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachActionHandlers();
}

// Attach Edit and Delete button handlers
function attachActionHandlers() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const itemId = btn.getAttribute('data-id');
      openEditItemModal(itemId);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const itemId = btn.getAttribute('data-id');
      confirmDeleteItem(itemId);
    });
  });
}

// Placeholder: Open add item modal
function openAddItemModal() {
  // TODO: Implement modal or form for adding an item
  alert('Add Item feature coming soon.');
}

// Placeholder: Open edit item modal
function openEditItemModal(itemId) {
  // TODO: Fetch item details, open modal, populate form, etc.
  alert('Edit Item feature coming soon for item ID: ' + itemId);
}

// Confirm before deleting an item
function confirmDeleteItem(itemId) {
  if (confirm('Are you sure you want to delete this item?')) {
    deleteItem(itemId);
  }
}

// Call backend to delete item, then refresh
async function deleteItem(itemId) {
  try {
    const response = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
    if (response.ok) {
      fetchAndRenderItems(); // Refresh list
    } else {
      alert('Failed to delete item.');
    }
  } catch (error) {
    alert('Error deleting item.');
    console.error(error);
  }
}

// Placeholder: Open manage categories modal/page
function openCategoryManager() {
  // TODO: Show categories manager (modal, tab, or page)
  alert('Manage Categories feature coming soon.');
}
