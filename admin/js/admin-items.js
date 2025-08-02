// admin/js/admin-items.js

window.initAdminItems = function() {
  fetchAndRenderItems();

  // Toolbar event listeners
  document.getElementById('add-item-btn')?.addEventListener('click', openAddItemModal);
  document.getElementById('manage-categories-btn')?.addEventListener('click', openCategoryManager);
};

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

function renderItemsTable(items) {
  const tbody = document.querySelector('.items-table tbody');
  if (!tbody) return;

  if (!items || !Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No items found</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  items.forEach((item, idx) => {
    // Use item.image if present, else show placeholder
    const imageUrl = item.image
      ? `/images/products/${item.image}`
      : '/images/products/placeholder.jpg';

    const itemName = item.name && item.name !== item.sku ? item.name : item.sku;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <img src="${imageUrl}" alt="${itemName}" class="item-thumb"
          onerror="this.onerror=null;this.src='/images/products/placeholder.jpg';" />
      </td>
      <td class="items-link">${itemName || '-'}</td>
      <td>${item.sku || '-'}</td>
      <td>${item.category || '-'}</td>
      <td>${item.stock != null ? item.stock : '-'}</td>
      <td>${item.price || '-'}</td>
      <td>
        <label class="switch">
          <input type="checkbox" class="active-toggle" data-id="${item.sku}" ${item.active ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <span class="items-status ${item.active ? 'active' : 'inactive'}">
          ${item.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="items-action-btn edit-btn" data-id="${item.sku}">Edit</button>
        <button class="items-action-btn delete-btn" data-id="${item.sku}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachActionHandlers();
}

// Handle Edit, Delete, Activate
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

  document.querySelectorAll('.active-toggle').forEach(toggle => {
    toggle.addEventListener('change', async function () {
      const itemId = this.getAttribute('data-id');
      const newStatus = this.checked;
      await updateItemStatus(itemId, newStatus);
      fetchAndRenderItems();
    });
  });
}

// --- Add Item Modal with dynamic category dropdown ---
async function openAddItemModal() {
  // Fetch categories for dropdown
  let categories = [];
  try {
    const resp = await fetch('/api/categories');
    categories = await resp.json();
  } catch (err) {
    alert("Could not load categories. Try again.");
    return;
  }

  // Build form
  const formHtml = `
    <form id="add-item-form">
      <label>SKU:<br><input type="text" name="sku" required></label><br>
      <label>Name:<br><input type="text" name="name" required></label><br>
      <label>Description:<br><textarea name="description" required></textarea></label><br>
      <label>Price:<br><input type="number" name="price" step="0.01" required></label><br>
      <label>Category:<br>
        <select name="category" required>
          <option value="">Select...</option>
          ${categories.map(cat =>
            `<option value="${cat.name}">${cat.name}</option>`
          ).join('')}
        </select>
      </label><br>
      <label>Stock:<br><input type="number" name="stock" min="0" value="0"></label><br>
      <label>Warranty:<br><input type="text" name="warranty"></label><br>
      <label>Image filename (optional):<br><input type="text" name="image" placeholder="e.g. Lithium-battery.png"></label><br>
      <label>
        <input type="checkbox" name="active" checked> Active
      </label><br><br>
      <button type="submit" id="add-save-btn">Add Item</button>
      <button type="button" id="add-cancel-btn">Cancel</button>
    </form>
  `;

  showModal("Add New Item", formHtml);

  document.getElementById('add-cancel-btn').onclick = closeModal;

  document.getElementById('add-item-form').onsubmit = async function(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      sku: form.sku.value.trim(),
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      price: Number(form.price.value),
      category: form.category.value,
      stock: form.stock.value ? Number(form.stock.value) : 0,
      warranty: form.warranty.value,
      image: form.image.value.trim(),
      active: form.active.checked
    };

    // Client-side validation (required fields)
    if (!data.sku || !data.name || !data.description || !data.price || !data.category) {
      alert("SKU, Name, Description, Price, and Category are required.");
      return;
    }

    // POST to backend
    const resp = await fetch('/api/items', {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(data)
    });

    if (resp.ok) {
      closeModal();
      fetchAndRenderItems();
    } else {
      const err = await resp.json();
      alert("Error: " + (err.error || "Failed to add item"));
    }
  };
}

// --- Edit Item Modal with category dropdown ---
async function openEditItemModal(itemId) {
  // Fetch item details
  let item;
  try {
    const resp = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
    item = await resp.json();
    if (!item) throw new Error('Item not found');
  } catch (err) {
    alert("Could not load item details.");
    return;
  }

  // Fetch categories for dropdown
  let categories = [];
  try {
    const resp = await fetch('/api/categories');
    categories = await resp.json();
  } catch (err) {
    alert("Could not load categories. Try again.");
    return;
  }

  // Build form
  const formHtml = `
    <form id="edit-item-form">
      <label>SKU:<br><input type="text" name="sku" value="${item.sku || ''}" readonly></label><br>
      <label>Name:<br><input type="text" name="name" value="${item.name || ''}" required></label><br>
      <label>Description:<br><textarea name="description" required>${item.description || ''}</textarea></label><br>
      <label>Price:<br><input type="number" name="price" value="${item.price || ''}" step="0.01" required></label><br>
      <label>Category:<br>
        <select name="category" required>
          <option value="">Select...</option>
          ${categories.map(cat =>
            `<option value="${cat.name}" ${cat.name === item.category ? "selected" : ""}>${cat.name}</option>`
          ).join('')}
        </select>
      </label><br>
      <label>Stock:<br><input type="number" name="stock" min="0" value="${item.stock != null ? item.stock : 0}"></label><br>
      <label>Warranty:<br><input type="text" name="warranty" value="${item.warranty || ''}"></label><br>
      <label>Image filename (optional):<br><input type="text" name="image" value="${item.image || ''}" placeholder="e.g. Lithium-battery.png"></label><br>
      <label>
        <input type="checkbox" name="active" ${item.active ? 'checked' : ''}> Active
      </label><br><br>
      <button type="submit" id="edit-save-btn">Save</button>
      <button type="button" id="edit-cancel-btn">Cancel</button>
    </form>
  `;

  showModal(`Edit Item (${itemId})`, formHtml);

  document.getElementById('edit-cancel-btn').onclick = closeModal;

  document.getElementById('edit-item-form').onsubmit = async function(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      sku: form.sku.value.trim(),
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      price: Number(form.price.value),
      category: form.category.value,
      stock: form.stock.value ? Number(form.stock.value) : 0,
      warranty: form.warranty.value,
      image: form.image.value.trim(),
      active: form.active.checked
    };

    // Client-side validation
    if (!data.name || !data.description || !data.price || !data.category) {
      alert("Name, Description, Price, and Category are required.");
      return;
    }

    // PATCH request to backend
    const resp = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (resp.ok) {
      closeModal();
      fetchAndRenderItems();
    } else {
      const err = await resp.json();
      alert("Error: " + (err.error || "Failed to update item"));
    }
  };
}

// --- Delete Modal ---
function confirmDeleteItem(itemId) {
  showModal("Delete Item", `
    <div style="margin-bottom:1em;">Are you sure you want to delete this item?</div>
    <button id="delete-confirm-btn">Delete</button>
    <button id="delete-cancel-btn">Cancel</button>
  `);

  document.getElementById('delete-confirm-btn').onclick = async () => {
    closeModal();
    await deleteItem(itemId);
  };
  document.getElementById('delete-cancel-btn').onclick = closeModal;
}

async function deleteItem(itemId) {
  try {
    const response = await fetch(`/api/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    if (response.ok) {
      fetchAndRenderItems();
    } else {
      alert('Failed to delete item.');
    }
  } catch (error) {
    alert('Error deleting item.');
    console.error(error);
  }
}

// --- Activate/Deactivate status ---
async function updateItemStatus(itemId, isActive) {
  try {
    const resp = await fetch(`/api/items/${encodeURIComponent(itemId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: isActive })
    });
    if (!resp.ok) throw new Error('Failed to update status');
  } catch (err) {
    alert('Could not update status');
    console.error(err);
  }
}

// --- Simple modal helper ---
function showModal(title, html) {
  let modal = document.getElementById('global-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-modal';
    modal.innerHTML = `
      <div class="modal-bg"></div>
      <div class="modal-content">
        <h3 class="modal-title"></h3>
        <div class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-bg').onclick = closeModal;
  }
  modal.querySelector('.modal-title').innerText = title;
  modal.querySelector('.modal-body').innerHTML = html;
  modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('global-modal');
  if (modal) modal.style.display = 'none';
}

// Placeholder: Open manage categories modal/page
function openCategoryManager() {
  alert('Manage Categories feature coming soon.');
}

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', window.initAdminItems);
