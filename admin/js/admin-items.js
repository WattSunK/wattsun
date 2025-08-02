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
    // Use item.name if available, fallback to SKU
    const itemName = item.name && item.name !== item.sku ? item.name : item.sku;
    const imageUrl = `/images/products/${item.sku}.jpg`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <img src="${imageUrl}" alt="${itemName}" class="item-thumb" 
          onerror="this.onerror=null;this.src='/images/products/fallback.jpg';" />
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

// --- Edit Modal (basic sample, can be replaced by a full modal library) ---
function openEditItemModal(itemId) {
  // Fetch item details from API (optional: pass full item data if you have it already)
  fetch(`/api/items/${encodeURIComponent(itemId)}`)
    .then(res => res.json())
    .then(item => {
      const fields = [
        { label: "Name", key: "name" },
        { label: "SKU", key: "sku", readonly: true },
        { label: "Category", key: "category" },
        { label: "Stock", key: "stock" },
        { label: "Unit Price", key: "price" }
      ];
      let formHtml = fields.map(f => 
        `<label>${f.label}:
          <input type="text" name="${f.key}" value="${item[f.key] || ''}" ${f.readonly ? 'readonly' : ''} />
        </label>`
      ).join('<br>');
      formHtml += `<br><button id="edit-save-btn">Save</button> <button id="edit-cancel-btn">Cancel</button>`;

      showModal(`Edit Item (${itemId})`, formHtml);

      document.getElementById('edit-save-btn').onclick = async () => {
        const modal = document.getElementById('global-modal');
        const formData = {};
        fields.forEach(f => {
          formData[f.key] = modal.querySelector(`[name=${f.key}]`).value;
        });
        // PATCH request to backend
        const resp = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (resp.ok) {
          closeModal();
          fetchAndRenderItems();
        } else {
          alert('Error updating item.');
        }
      };

      document.getElementById('edit-cancel-btn').onclick = closeModal;
    });
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

// Placeholder: Add item/modal
function openAddItemModal() {
  alert('Add Item feature coming soon.');
}

// Placeholder: Open manage categories modal/page
function openCategoryManager() {
  alert('Manage Categories feature coming soon.');
}

// Initialize after DOM load
document.addEventListener('DOMContentLoaded', window.initAdminItems);

/* Optional: Add minimal CSS for modal and switch toggle if not present in your main CSS */
