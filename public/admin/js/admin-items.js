// admin-items.js — Items list: fetch, search, per-page, pagination, status toggle, Add/Edit/Delete, categories modal
(function () {
  let PAGE_SIZE = 15;
  let allItems = [];
  let filtered = [];
  let currentPage = 1;
  let totalPages = 1;

  const $  = (id) => document.getElementById(id);
  const qs = (sel, root=document) => root.querySelector(sel);

  function fmtKSH(v){ const n = Number(v||0); return 'KSH ' + n.toLocaleString('en-KE'); }
  function esc(s){ return String(s ?? '').replace(/[&"'<>\n]/g, c => ({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;','\n':'<br>'}[c])); }

  async function fetchJSON(url, opts){
    const r = await fetch(url, opts);
    if(!r.ok) throw new Error(`${opts?.method||'GET'} ${url} → ${r.status}`);
    return r.json();
  }

  // --- Data loads
  async function loadItems(){
    $('items-table-body').innerHTML = `<tr><td colspan="9" class="text-center">Loading...</td></tr>`;
    try {
      // /api/items returns an array per your routes/items.js
      allItems = await fetchJSON('/api/items');
    } catch(e){
      console.error(e);
      allItems = [];
    }
    applyFilters(1);
  }

  async function loadCategoriesIntoSelects(){
    try {
      const cats = await fetchJSON('/api/categories'); // array [{id,name}]
      const names = Array.isArray(cats) ? cats.map(c=>c.name) : (cats.categories||[]).map(c=>c.name);
      // filter select
      const filterSel = $('category-filter');
      if (filterSel){
        filterSel.innerHTML = `<option value="">All Categories</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      // add/edit selects
      const addSel = $('add-category');
      const editSel = $('edit-category');
      if (addSel){
        addSel.innerHTML = `<option value="">Select...</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      if (editSel){
        editSel.innerHTML = `<option value="">(unchanged)</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      // categories modal list
      const ul = $('categories-list');
      if (ul){
        ul.innerHTML = names.length ? names.map(n=>`<li class="list-group-item d-flex justify-content-between align-items-center">${esc(n)}<span class="badge bg-warning text-dark">Active</span></li>`).join('') : '<li class="list-group-item">No categories</li>';
      }
    } catch(e){
      console.warn('Categories load failed', e);
    }
  }

  // --- Filters + pagination
  function applyFilters(page=1){
    const q = ($('search-text')?.value || '').trim().toLowerCase();
    const cat = ($('category-filter')?.value || '').trim();

    filtered = allItems.filter(it => {
      const qmatch = !q || (it.name && it.name.toLowerCase().includes(q)) || (it.sku && it.sku.toLowerCase().includes(q));
      const cmatch = !cat || it.category === cat;
      return qmatch && cmatch;
    });

    totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, page), totalPages);
    renderPage(currentPage);
  }

  function renderPage(page){
    const start = (page-1)*PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    renderTable(pageItems, start);
    renderPager(page, filtered.length);
  }

  function renderTable(items, startIndex){
    const tb = $('items-table-body');
    if(!tb) return;
    if(!items.length){
      tb.innerHTML = `<tr><td colspan="9" class="text-center">No items found</td></tr>`;
      return;
    }
    tb.innerHTML = items.map((it, i) => {
      const img = it.image ? `/images/products/${esc(it.image)}` : '/images/products/placeholder.jpg';
      const checked = it.active ? 'checked' : '';
      return `
        <tr>
          <td>${startIndex + i + 1}</td>
          <td><img src="${img}" alt="Item" onerror="this.onerror=null;this.src='/images/products/placeholder.jpg';" style="max-width:60px;max-height:60px;object-fit:contain"></td>
          <td>${esc(it.name)}</td>
          <td>${esc(it.sku)}</td>
          <td>${esc(it.category || '')}</td>
          <td>${it.stock ?? 0}</td>
          <td>${it.price==null?'-':fmtKSH(it.price)}</td>
          <td>
            <label class="switch" style="display:inline-flex;align-items:center;gap:.5rem;">
              <input type="checkbox" class="inline-status-toggle" data-sku="${esc(it.sku)}" ${checked}>
              <span class="status-label">${it.active ? 'Active' : 'Inactive'}</span>
            </label>
          </td>
          <td>
            <button class="items-action-btn btn btn-sm btn-outline-secondary edit-item-btn" data-sku="${esc(it.sku)}">Edit</button>
            <button class="items-action-btn btn btn-sm btn-outline-danger ms-1 delete-item-btn" data-sku="${esc(it.sku)}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderPager(page, totalItems){
    const info = $('items-table-info');
    const ctrls = $('items-pagination');
    if (!info || !ctrls) return;

    if (totalItems === 0){
      info.textContent = 'Showing 0 to 0 of 0 entries';
      ctrls.innerHTML = '';
      return;
    }
    const start = (page-1)*PAGE_SIZE + 1;
    const end = Math.min(totalItems, page*PAGE_SIZE);
    info.textContent = `Showing ${start} to ${end} of ${totalItems} entries`;

    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    let html = '';
    html += btn(1, 'First', page===1);
    html += btn(Math.max(1, page-1), 'Prev', page===1);
    const windowSize = 7;
    let sp = Math.max(1, page - Math.floor(windowSize/2));
    let ep = Math.min(totalPages, sp + windowSize - 1);
    if (ep - sp + 1 < windowSize) sp = Math.max(1, ep - windowSize + 1);
    for(let p=sp; p<=ep; p++){
      html += `<button data-page="${p}" class="btn btn-sm ${p===page?'btn-warning':'btn-outline-warning'} mx-1">${p}</button>`;
    }
    html += btn(Math.min(totalPages, page+1), 'Next', page===totalPages);
    html += btn(totalPages, 'Last', page===totalPages);
    ctrls.innerHTML = html;

    ctrls.onclick = (e)=>{
      const b = e.target.closest('button[data-page]');
      if (!b) return;
      const p = parseInt(b.dataset.page, 10);
      if (!isNaN(p)) gotoPage(p);
    };

    function btn(p,label,disabled){ return `<button data-page="${p}" class="btn btn-sm btn-outline-warning mx-1" ${disabled?'disabled':''}>${label}</button>`; }
  }

  function gotoPage(p){
    const tp = Math.max(1, Math.min(totalPages, p));
    currentPage = tp;
    renderPage(tp);
    $('items-table')?.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // --- Inline actions
  $('items-table')?.addEventListener('change', async (e)=>{
    const box = e.target.closest('input.inline-status-toggle');
    if (!box) return;
    const sku = box.dataset.sku;
    const active = !!box.checked;
    try{
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}/status`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ active })
      });
      const lbl = box.closest('td')?.querySelector('.status-label');
      if (lbl) lbl.textContent = active ? 'Active' : 'Inactive';
      // refresh row from server for safety
      await loadItems();
    }catch(err){
      alert('Failed to update status'); box.checked = !active;
    }
  });

  $('items-table')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.items-action-btn');
    if (!btn) return;
    const sku = btn.dataset.sku;
    if (btn.classList.contains('edit-item-btn')) openEdit(sku);
    if (btn.classList.contains('delete-item-btn')) delItem(sku);
  });

  // --- Search / Filter / Per-page
  $('search-button')?.addEventListener('click', ()=>applyFilters(1));
  $('clear-button')?.addEventListener('click', ()=>{
    $('search-text').value = '';
    $('category-filter').value = '';
    applyFilters(1);
  });
  $('search-text')?.addEventListener('input', ()=>applyFilters(1));
  $('category-filter')?.addEventListener('change', ()=>applyFilters(1));
  $('items-per-page')?.addEventListener('change', ()=>{
    PAGE_SIZE = parseInt($('items-per-page').value, 10) || 15;
    applyFilters(1);
  });

  // --- Add
  $('btn-add-item')?.addEventListener('click', ()=>{
    $('add-item-form')?.reset();
    $('add-active').checked = true;
    $('add-item-modal-bg').style.display = 'block';
  });

  $('add-item-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const sku = $('add-sku').value.trim();
    const name = $('add-name').value.trim();
    const description = $('add-description').value.trim();
    const price = Number($('add-price').value);
    const category = $('add-category').value.trim();
    const image = $('add-image').value.trim() || null;
    const warranty = $('add-warranty').value ? Number($('add-warranty').value) : null;
    const stock = $('add-stock').value ? Number($('add-stock').value) : 0;
    const active = !!$('add-active').checked;

    if (!sku || !name || !description || !category || isNaN(price)){
      alert('Please fill all required fields'); return;
    }

    try{
      await fetchJSON('/api/items', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sku, name, description, price, category, image, warranty, stock, active })
      });
      $('add-item-modal-bg').style.display = 'none';
      await loadItems();
    }catch(err){
      alert('Failed to create item: ' + err.message);
    }
  });

  // --- Edit
  async function openEdit(sku){
    try{
      const item = await fetchJSON(`/api/items/${encodeURIComponent(sku)}`);
      $('edit-sku').value = item.sku || '';
      $('edit-name').value = item.name || '';
      $('edit-description').value = item.description || '';
      $('edit-price').value = item.price ?? '';
      $('edit-warranty').value = item.warranty ?? '';
      $('edit-stock').value = item.stock ?? '';
      $('edit-image').value = item.image ?? '';
      $('edit-category').value = item.category || '';
      $('edit-status').checked = !!item.active;
      $('edit-item-modal-bg').style.display = 'block';
    }catch(err){
      alert('Failed to load item: ' + err.message);
    }
  }

  $('edit-item-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const sku = $('edit-sku').value.trim();
    const body = {
      name:        $('edit-name').value || undefined,
      description: $('edit-description').value || undefined,
      price:       $('edit-price').value === '' ? undefined : Number($('edit-price').value),
      warranty:    $('edit-warranty').value === '' ? undefined : Number($('edit-warranty').value),
      stock:       $('edit-stock').value === '' ? undefined : Number($('edit-stock').value),
      image:       $('edit-image').value || undefined,
      category:    $('edit-category').value || undefined,
      active:      $('edit-status').checked // note: status saved via /status endpoint below if needed
    };

    try{
      // First save fields (PATCH /api/items/:sku)
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });

      // If active flag changed, ensure status endpoint reflects it (safe to call every time)
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}/status`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ active: !!$('edit-status').checked })
      });

      $('edit-item-modal-bg').style.display = 'none';
      await loadItems();
    }catch(err){
      alert('Failed to update item: ' + err.message);
    }
  });

  // --- Delete
  async function delItem(sku){
    if (!confirm(`Delete item ${sku}?`)) return;
    try{
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}`, { method:'DELETE' });
      await loadItems();
    }catch(err){
      alert('Failed to delete: ' + err.message);
    }
  }

  // --- Manage Categories
  $('btn-manage-categories')?.addEventListener('click', async ()=>{
    await loadCategoriesIntoSelects();
    $('manage-categories-modal').style.display = 'block';
  });

  // --- Close modals
  document.addEventListener('click', (e)=>{
    if (e.target.classList.contains('modal-close')){
      e.target.closest('.modal-bg').style.display = 'none';
    }
    // click outside modal to close
    if (e.target.classList.contains('modal-bg')){
      e.target.style.display = 'none';
    }
  });

  // --- Init
  document.addEventListener('DOMContentLoaded', async ()=>{
    // initial page size
    if ($('items-per-page')) PAGE_SIZE = parseInt($('items-per-page').value,10) || 15;
    await loadCategoriesIntoSelects();
    await loadItems();
  });
})();
