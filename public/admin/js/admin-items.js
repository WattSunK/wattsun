// admin-items.js — UPDATED: client-side pagination (15 items per page)
// Keeps most of original behavior (add/edit/delete/status) and adds pagination.
// Drop-in replacement for existing admin-items.js

(function () {
  // Config
  const PAGE_SIZE = 15;

  // State
  let allItemsCache = [];      // full array returned from /api/items
  let filteredItems = [];      // after applying search/category
  let currentPage = 1;
  let totalPages = 1;

  // Utility: safe selectors with fallbacks
  const $ = id => document.getElementById(id);
  function qsel(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  // --- API fetch + cache ---
  async function fetchItemsFromApi() {
    const tbody = $('items-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>`;
    try {
      const resp = await fetch('/api/items');
      if (!resp.ok) throw new Error('Network response not ok');
      const json = await resp.json();
      allItemsCache = Array.isArray(json) ? json : [];
    } catch (err) {
      console.error('Error fetching items:', err);
      allItemsCache = [];
    }
    // apply existing filters and render page 1
    applyFiltersAndRender(1);
  }

  // --- Filtering & pagination logic ---
  function applyFiltersAndRender(page = 1) {
    const searchEl = qsel('item-search-input', 'search-text', 'search-input');
    const categoryEl = qsel('item-category-filter', 'category-filter');

    const query = (searchEl?.value || '').trim().toLowerCase();
    const cat = (categoryEl?.value || '').trim();

    try {
      localStorage.setItem('itemSearchQuery', query);
      localStorage.setItem('itemCategory', cat);
    } catch (e) {}

    filteredItems = allItemsCache.filter(item => {
      const qMatch = !query || (item.name && item.name.toLowerCase().includes(query)) || (item.sku && item.sku.toLowerCase().includes(query));
      const cMatch = !cat || cat === 'All' || item.category === cat;
      return qMatch && cMatch;
    });

    totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);
    renderPage(currentPage);
  }

  function renderPage(page) {
    const startIndex = (page - 1) * PAGE_SIZE;
    const pageItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);
    renderItemsTable(pageItems, startIndex);
    renderPaginationControls(page, totalPages, filteredItems.length);
  }

  // --- Rendering table rows (keeps original cell layout / classes) ---
  function renderItemsTable(items, startIndex = 0) {
    const tbody = $('items-table-body');
    if (!tbody) return;
    if (!Array.isArray(items) || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">No items found</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    items.forEach((item, idx) => {
      const tr = document.createElement('tr');

      const sr = startIndex + idx + 1;
      const imgSrc = item.image ? `/images/products/${item.image}` : '/images/products/placeholder.jpg';

      // keep same row structure that your original admin-items.js expects
      tr.innerHTML = `
        <td>${sr}</td>
        <td>
          <img src="${imgSrc}"
               class="item-thumb"
               alt="Item"
               onerror="this.onerror=null;this.src='/images/products/placeholder.jpg';"
               style="max-width:60px;max-height:60px;object-fit:contain">
        </td>
        <td>${item.name || '-'}</td>
        <td>${item.sku || '-'}</td>
        <td>${item.category || '-'}</td>
        <td>${item.stock ?? 0}</td>
        <td>${item.price || '-'}</td>
        <td>
          <label class="switch">
            <input type="checkbox" class="inline-status-toggle" data-sku="${escapeHtml(item.sku)}" ${item.active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <span class="status-label" data-status-label>${item.active ? 'Active' : 'Inactive'}</span>
        </td>
        <td>
          <button class="items-action-btn edit-item-btn" data-sku="${escapeHtml(item.sku)}">Edit</button>
          <button class="items-action-btn delete-item-btn" data-sku="${escapeHtml(item.sku)}">Delete</button>
        </td>
      `.trim();

      tbody.appendChild(tr);
    });
  }

  // Basic escape for attribute insertion
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Pagination UI ---
  function ensurePaginationContainer() {
    if ($('items-pagination')) return;
    const table = $('items-table');
    if (!table) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'items-pagination';
    wrapper.className = 'items-pagination';
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'space-between';
    wrapper.style.alignItems = 'center';
    wrapper.style.marginTop = '10px';
    wrapper.innerHTML = `
      <div id="items-pagination-info">Showing 0 to 0 of 0 entries</div>
      <div id="items-pagination-controls"></div>
    `;
    table.parentElement.appendChild(wrapper);

    // delegate clicks on pagination controls
    wrapper.querySelector('#items-pagination-controls').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-page]');
      if (!btn) return;
      const p = parseInt(btn.dataset.page, 10);
      if (!isNaN(p)) gotoPage(p);
    });
  }

  function renderPaginationControls(page, total, totalItems) {
    ensurePaginationContainer();
    const info = $('items-pagination-info');
    const controls = $('items-pagination-controls');
    if (!info || !controls) return;

    if (totalItems === 0) {
      info.textContent = 'Showing 0 to 0 of 0 entries';
      controls.innerHTML = '';
      return;
    }

    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(totalItems, page * PAGE_SIZE);
    info.textContent = `Showing ${start} to ${end} of ${totalItems} entries`;

    // construct controls: First Prev [pages] Next Last
    let html = '';
    html += `<button data-page="1" class="items-page-btn" ${page === 1 ? 'disabled' : ''}>First</button>`;
    html += `<button data-page="${Math.max(1, page - 1)}" class="items-page-btn" ${page === 1 ? 'disabled' : ''}>Prev</button>`;

    // numeric pages window (max 7)
    const maxButtons = 7;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(total, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) startPage = Math.max(1, endPage - maxButtons + 1);

    for (let p = startPage; p <= endPage; p++) {
      html += `<button data-page="${p}" class="items-page-btn" ${p === page ? 'disabled' : ''}>${p}</button>`;
    }

    html += `<button data-page="${Math.min(total, page + 1)}" class="items-page-btn" ${page === total ? 'disabled' : ''}>Next</button>`;
    html += `<button data-page="${total}" class="items-page-btn" ${page === total ? 'disabled' : ''}>Last</button>`;

    controls.innerHTML = html;
  }

  function gotoPage(p) {
    if (!p || isNaN(p)) return;
    p = Math.max(1, Math.min(totalPages, p));
    currentPage = p;
    renderPage(p);
    // scroll a bit to table top for better UX
    const table = $('items-table');
    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Existing admin action helpers (kept lean) ---
  async function toggleItemStatusDirect(sku, active) {
    try {
      const resp = await fetch(`/api/items/${encodeURIComponent(sku)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      if (!resp.ok) throw new Error('Failed to update');
      // refresh cache from server for consistency
      await fetchItemsFromApi();
    } catch (err) {
      alert('Could not update status.');
    }
  }

  function confirmDeleteItem(sku) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    deleteItem(sku);
  }

  async function deleteItem(sku) {
    try {
      const resp = await fetch(`/api/items/${encodeURIComponent(sku)}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete');
      await fetchItemsFromApi();
    } catch (err) {
      alert('Could not delete item.');
    }
  }

  // --- Modal open/edit/delete functions — keep existing behaviour but ensure cache refresh ---
  // NOTE: These functions assume the modal markup & IDs expected by your original JS are present.
  // If your modal IDs differ, the openEditItemModal / openAddItemModal functions may not find them.
  async function openEditItemModal(sku) {
    try {
      const resp = await fetch(`/api/items/${encodeURIComponent(sku)}`);
      if (!resp.ok) throw new Error('Item not found');
      const item = await resp.json();

      // Modal elements - trying to be compatible with multiple naming variants
      const modalBg = qsel('item-modal-bg', 'item-modal-bg', 'modal-bg');
      const modal = qsel('item-modal', 'edit-item-modal', 'add-item-modal', 'modal');

      // If your modal element structure uses the "item-modal" naming, this will populate it.
      // We attempt to find a form and set values adaptively (fallbacks included).
      const form = modal?.querySelector('form') || document.getElementById('edit-item-form') || document.getElementById('item-modal-form');

      if (form) {
        // try a bunch of common input namings
        const setVal = (q, v) => {
          const el = form.querySelector(q) || document.getElementById(q);
          if (el) {
            if (el.type === 'checkbox') el.checked = !!v;
            else el.value = v ?? '';
          }
        };

        setVal('#item-modal-sku', item.sku || '');
        setVal('#edit-sku', item.sku || '');
        setVal('#item-modal-name', item.name || '');
        setVal('#edit-name', item.name || '');
        setVal('#item-modal-description', item.description || '');
        setVal('#edit-description', item.description || '');
        setVal('#item-modal-price', item.price || '');
        setVal('#edit-price', item.price || '');
        setVal('#item-modal-warranty', item.warranty || '');
        setVal('#edit-warranty', item.warranty || '');
        setVal('#item-modal-stock', item.stock || 0);
        setVal('#edit-stock', item.stock || 0);
        setVal('#item-modal-image', item.image || '');
        setVal('#edit-image', item.image || '');
        setVal('#item-modal-category', item.category || '');
        setVal('#edit-category', item.category || '');
        setVal('#item-modal-active', !!item.active);
        setVal('#edit-status', !!item.active);
      }

      if (modalBg) modalBg.style.display = 'block';
      if (modal) modal.style.display = 'block';
    } catch (e) {
      console.error('Failed to load item:', e);
      alert('Could not load item');
    }
  }

  function openAddItemModal() {
    // attempt to find add modal and show it.
    const modalBg = qsel('item-modal-bg', 'add-item-modal', 'modal-bg');
    const modal = qsel('item-modal', 'add-item-modal', 'modal');
    const form = modal?.querySelector('form') || document.getElementById('add-item-form') || document.getElementById('item-modal-form');
    if (form) form.reset();
    if (modalBg) modalBg.style.display = 'block';
    if (modal) modal.style.display = 'block';
  }

  // Called by external code that wires Save/Cancel inside modal.
  // But ensure that after saving we refresh cache:
  async function afterItemSaved() {
    await fetchItemsFromApi();
  }

  // --- Initialization entrypoint (wired from dashboard loader) ---
  window.initAdminItems = function () {
    // Wire search/filter controls
    const searchInput = qsel('item-search-input', 'search-text', 'search-input', 'ws-admin-input');
    const categoryFilter = qsel('item-category-filter', 'category-filter');

    // Fallback for saved values
    try {
      const savedQuery = localStorage.getItem('itemSearchQuery');
      const savedCategory = localStorage.getItem('itemCategory');
      if (savedQuery && searchInput) searchInput.value = savedQuery;
      if (savedCategory && categoryFilter) categoryFilter.value = savedCategory;
    } catch (e) {}

    // Apply filters on input/change
    if (searchInput) {
      searchInput.addEventListener('input', () => applyFiltersAndRender(1));
    }
    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => applyFiltersAndRender(1));
    }

    // Search/Clear buttons (support both names)
    const btnSearch = qsel('search-btn', 'item-search-btn', 'search-button', 'search-button');
    const btnClear = qsel('clear-btn', 'item-clear-btn', 'clear-button', 'clear-btn');

    if (btnSearch) btnSearch.addEventListener('click', () => applyFiltersAndRender(1));
    if (btnClear) btnClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categoryFilter) categoryFilter.selectedIndex = 0;
      try {
        localStorage.removeItem('itemSearchQuery');
        localStorage.removeItem('itemCategory');
      } catch (e) {}
      applyFiltersAndRender(1);
    });

    // Table delegated handlers for inline toggle and action buttons
    const itemsTable = $('items-table');
    itemsTable?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('input.inline-status-toggle');
      if (!checkbox) return;
      const sku = checkbox.getAttribute('data-sku');
      const active = checkbox.checked;
      toggleItemStatusDirect(sku, active);
      // optimistic label update
      const label = checkbox.closest('td')?.querySelector('[data-status-label]');
      if (label) label.innerText = active ? 'Active' : 'Inactive';
    });

    itemsTable?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const sku = btn.getAttribute('data-sku');
      if (btn.classList.contains('edit-item-btn')) {
        openEditItemModal(sku);
      } else if (btn.classList.contains('delete-item-btn')) {
        confirmDeleteItem(sku);
      }
    });

    // Add / Manage Categories buttons
    const addBtn = qsel('add-item-btn', 'btn-add-item');
    if (addBtn) addBtn.addEventListener('click', openAddItemModal);
    const manageBtn = qsel('manage-categories-btn', 'btn-manage-categories');
    if (manageBtn) manageBtn.addEventListener('click', () => {
      const modal = qsel('manage-categories-modal', 'categoriesModal', 'categories-modal');
      if (modal) modal.style.display = 'block';
    });

    // Close modals when clicking the modal-bg (if present)
    document.body.addEventListener('click', (e) => {
      const modalBg = qsel('item-modal-bg', 'add-item-modal', 'manage-categories-modal', 'modal-bg');
      if (modalBg && modalBg.style.display !== 'none' && e.target === modalBg) {
        modalBg.style.display = 'none';
      }
      if (e.target.classList.contains('modal-close')) {
        const m = e.target.closest('.modal-bg') || e.target.closest('.modal');
        if (m) m.style.display = 'none';
      }
    });

    // initial load
    fetchItemsFromApi();
  };

  // Expose helper for other modules if needed
  window.adminItems = {
    refresh: fetchItemsFromApi,
    afterItemSaved
  };
})();
