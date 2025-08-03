// ✅ FINAL FULL VERSION of admin-items.js with UI enhancements

// Format popup layout and use slide toggle for status
// Retains all existing logic and binds Manage Categories

// --- FETCH AND RENDER ---
async function fetchAndRenderItems() {
  const tbody = document.getElementById('items-table-body');
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
  const tbody = document.getElementById('items-table-body');
  if (!tbody) return;
  if (!Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No items found</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  items.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        <img src="${item.image || '/images/products/placeholder.jpg'}"
             class="item-thumb"
             alt="Item"
             onerror="this.onerror=null;this.src='/images/products/placeholder.jpg';">
      </td>
      <td>${item.name || '-'}</td>
      <td>${item.sku || '-'}</td>
      <td>${item.category || '-'}</td>
      <td>${item.stock || 0}</td>
      <td>${item.price || '-'}</td>
      <td>
        <button class="action-btn toggle-active-btn" data-sku="${item.sku}">
          ${item.active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
      <td>
        <button class="action-btn edit-btn edit-item-btn" data-sku="${item.sku}">Edit</button>
        <button class="action-btn delete-btn delete-item-btn" data-sku="${item.sku}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- MODAL MANAGEMENT ---
function closeItemModal() {
  const modalBg = document.getElementById('item-modal-bg');
  const modal = document.getElementById('item-modal');
  if (modalBg) modalBg.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

function setupSlideToggle(input) {
  const wrapper = document.createElement('label');
  wrapper.className = 'switch';
  const replacement = document.createElement('input');
  replacement.type = 'checkbox';
  replacement.id = input.id;
  replacement.checked = input.checked;
  replacement.name = input.name;
  const slider = document.createElement('span');
  slider.className = 'slider round';
  wrapper.appendChild(replacement);
  wrapper.appendChild(slider);
  input.parentElement.replaceChild(wrapper, input);
}

function styleModal() {
  const modal = document.getElementById('item-modal');
  modal.classList.add('admin-modal');
  const inputs = modal.querySelectorAll('input, textarea');
  inputs.forEach(el => el.classList.add('input-field'));
  const save = modal.querySelector('#item-modal-save');
  const cancel = modal.querySelector('#item-modal-cancel');
  const close = modal.querySelector('#item-modal-close');
  [save, cancel, close].forEach(btn => btn.classList.add('button'));
  const checkbox = modal.querySelector('#item-modal-active');
  if (checkbox) setupSlideToggle(checkbox);
}

// --- ADD ---
function openAddItemModal() {
  const modalBg = document.getElementById('item-modal-bg');
  const modal = document.getElementById('item-modal');
  if (!modalBg || !modal) return;
  modal.querySelector('#item-modal-title').innerText = 'Add Item';
  const form = modal.querySelector('#item-modal-form');
  form.reset();
  form.style.display = 'block';
  modal.querySelector('#item-modal-message').innerText = '';
  modalBg.style.display = 'block';
  modal.style.display = 'block';

  const saveBtn = form.querySelector('#item-modal-save');
  const cancelBtn = form.querySelector('#item-modal-cancel');
  const closeBtn = modal.querySelector('#item-modal-close');
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  closeBtn.replaceWith(closeBtn.cloneNode(true));

  const newSave = form.querySelector('#item-modal-save');
  const newCancel = form.querySelector('#item-modal-cancel');
  const newClose = modal.querySelector('#item-modal-close');

  styleModal();

  newSave.onclick = async function (e) {
    e.preventDefault();
    const newItem = {
      sku: form['item-modal-sku'].value,
      name: form['item-modal-name'].value,
      description: form['item-modal-description'].value,
      price: form['item-modal-price'].value,
      warranty: form['item-modal-warranty'].value,
      stock: form['item-modal-stock'].value,
      image: form['item-modal-image'].value,
      category: form['item-modal-category'].value,
      active: form['item-modal-active'].checked
    };
    try {
      const resp = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      if (!resp.ok) throw new Error('Failed to add');
      closeItemModal();
      fetchAndRenderItems();
    } catch (err) {
      modal.querySelector('#item-modal-message').innerText = 'Error: Could not add item.';
    }
  };
  newCancel.onclick = closeItemModal;
  newClose.onclick = closeItemModal;
}

// --- EDIT ---
async function openEditItemModal(sku) {
  try {
    const resp = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    if (!resp.ok) throw new Error('Item not found');
    const item = await resp.json();

    const modalBg = document.getElementById('item-modal-bg');
    const modal = document.getElementById('item-modal');
    if (!modalBg || !modal) return;
    modal.querySelector('#item-modal-title').innerText = 'Edit Item';
    const form = modal.querySelector('#item-modal-form');
    form.style.display = 'block';
    modal.querySelector('#item-modal-message').innerText = '';
    form['item-modal-sku'].value = item.sku || '';
    form['item-modal-name'].value = item.name || '';
    form['item-modal-description'].value = item.description || '';
    form['item-modal-price'].value = item.price || '';
    form['item-modal-warranty'].value = item.warranty || '';
    form['item-modal-stock'].value = item.stock || '';
    form['item-modal-image'].value = item.image || '';
    form['item-modal-category'].value = item.category || '';
    form['item-modal-active'].checked = !!item.active;

    const saveBtn = form.querySelector('#item-modal-save');
    const cancelBtn = form.querySelector('#item-modal-cancel');
    const closeBtn = modal.querySelector('#item-modal-close');
    saveBtn.replaceWith(saveBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    closeBtn.replaceWith(closeBtn.cloneNode(true));

    const newSave = form.querySelector('#item-modal-save');
    const newCancel = form.querySelector('#item-modal-cancel');
    const newClose = modal.querySelector('#item-modal-close');

    styleModal();

    newSave.onclick = async function (e) {
      e.preventDefault();
      const updatedItem = {
        name: form['item-modal-name'].value,
        description: form['item-modal-description'].value,
        price: form['item-modal-price'].value,
        warranty: form['item-modal-warranty'].value,
        stock: form['item-modal-stock'].value,
        image: form['item-modal-image'].value,
        category: form['item-modal-category'].value,
        active: form['item-modal-active'].checked
      };
      try {
        const updateResp = await fetch(`/api/items/${encodeURIComponent(sku)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedItem)
        });
        if (!updateResp.ok) throw new Error('Failed to update');
        closeItemModal();
        fetchAndRenderItems();
      } catch (err) {
        modal.querySelector('#item-modal-message').innerText = 'Error: Could not update item.';
      }
    };
    newCancel.onclick = closeItemModal;
    newClose.onclick = closeItemModal;

    modalBg.style.display = 'block';
    modal.style.display = 'block';
  } catch (e) {
    console.error('Failed to load item:', e);
    alert('Could not load item');
  }
}

// --- DELETE / TOGGLE / CATEGORIES ---
function confirmDeleteItem(sku) {
  if (!confirm('Are you sure you want to delete this item?')) return;
  deleteItem(sku);
}

async function deleteItem(sku) {
  try {
    const resp = await fetch(`/api/items/${encodeURIComponent(sku)}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error('Failed to delete');
    fetchAndRenderItems();
  } catch (err) {
    alert('Could not delete item.');
  }
}

async function toggleItemActive(sku, btn) {
  try {
    const isActive = btn.textContent.trim() === 'Deactivate';
    const resp = await fetch(`/api/items/${encodeURIComponent(sku)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !isActive })
    });
    if (!resp.ok) throw new Error('Failed to update status');
    fetchAndRenderItems();
  } catch (err) {
    alert('Could not update item status.');
  }
}

function openCategoriesModal() {
  const modal = document.getElementById('categoriesModal');
  if (!modal) return;
  modal.style.display = 'block';
  const closeBtn = document.getElementById('closeCategoriesModal');
  if (closeBtn) closeBtn.onclick = () => (modal.style.display = 'none');
}

// --- INIT ENTRYPOINT ---
window.initAdminItems = function () {
  fetchAndRenderItems();

  document.getElementById('add-item-btn')?.addEventListener('click', openAddItemModal);
  document.getElementById('manage-categories-btn')?.addEventListener('click', openCategoriesModal);

  document.getElementById('items-table')?.addEventListener('click', function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const sku = btn.getAttribute('data-sku');
    if (btn.classList.contains('edit-item-btn')) {
      openEditItemModal(sku);
    } else if (btn.classList.contains('delete-item-btn')) {
      confirmDeleteItem(sku);
    } else if (btn.classList.contains('toggle-active-btn')) {
      toggleItemActive(sku, btn);
    }
  });

  document.body.addEventListener('click', function (e) {
    const modalBg = document.getElementById('item-modal-bg');
    if (modalBg && modalBg.style.display !== 'none' && e.target === modalBg) {
      closeItemModal();
    }
    if (e.target.classList.contains('modal-close')) {
      closeItemModal();
    }
  });
};
