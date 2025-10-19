// public/admin/js/admin-items.js
// Items list: fetch, search, per-page, pagination, status toggle, Add/Edit/Delete, categories modal, PRIORITY save
(function () {
  let PAGE_SIZE = 10;
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

  // ---------- Modal page-scroll lock (SAFE)
  function updateModalOpenState(){
    const ids = ['edit-item-modal-bg','add-item-modal-bg','manage-categories-modal'];
    const isOpen = ids.some(id => {
      const el = $(id);
      return el && getComputedStyle(el).display !== 'none';
    });
    document.body.classList.toggle('modal-open', isOpen);
  }

  // Add backdrop-click + Esc close (scoped)
  function wireModalBasics(){
    ['edit-item-modal-bg','add-item-modal-bg','manage-categories-modal'].forEach(id => {
      const ov = $(id);
      if (!ov || ov.dataset.bound === '1') return;
      ov.dataset.bound = '1';
      ov.addEventListener('click', (e) => {
        // close only when clicking the backdrop, not inside the dialog
        if (e.target === ov) { ov.style.display = 'none'; updateModalOpenState(); }
      });
      // close buttons inside
      ov.querySelectorAll('.modal-close,.modal-footer .btn.modal-close').forEach(btn=>{
        btn.addEventListener('click', ()=>{ ov.style.display='none'; updateModalOpenState(); });
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        ['edit-item-modal-bg','add-item-modal-bg','manage-categories-modal'].forEach(id => {
          const ov = $(id);
          if (ov) ov.style.display = 'none';
        });
        updateModalOpenState();
      }
    }, { passive: true });
  }

  // ---------- Data loads
  async function loadItems() {
    const tbody = $('items-table-body');
    if (!tbody) return; // partial not mounted
    tbody.innerHTML = `<tr><td colspan="10" class="text-center">Loading...</td></tr>`; // colspan +1 for PRIORITY
    try {
      const res = await fetchJSON('/api/items?active=all');
      // backend might return an array or {items:[...]}
      allItems = Array.isArray(res) ? res : (res.items || []);
    } catch(e){
      console.error('loadItems failed:', e);
      allItems = [];
    }
    applyFilters(1);
  }

  async function loadCategoriesIntoSelects(){
    try {
      const res = await fetchJSON('/api/categories');
      const cats = Array.isArray(res) ? res : (res.categories || []);
      const names = cats.map(c=>c.name);

      const filterSel = $('category-filter');
      if (filterSel){
        filterSel.innerHTML = `<option value="">All Categories</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      const addSel = $('add-category');
      if (addSel){
        addSel.innerHTML = `<option value="">Select...</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      const editSel = $('edit-category');
      if (editSel){
        editSel.innerHTML = `<option value="">(unchanged)</option>` + names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      }
      const ul = $('categories-list');
      if (ul){
        ul.innerHTML = names.length
          ? names.map(n=>`<li class="list-group-item d-flex justify-content-between align-items-center">${esc(n)}<span class="badge bg-warning text-dark">Active</span></li>`).join('')
          : '<li class="list-group-item">No categories</li>';
      }
    } catch(e){
      console.warn('Categories load failed', e);
    }
  }

  // ---------- Filters + pagination
  function applyFilters(page=1){
    const q = ($('search-text')?.value || '').trim().toLowerCase();
    const cat = ($('category-filter')?.value || '').trim();

    filtered = allItems.filter(it => {
      const qmatch = !q || (it.name && it.name.toLowerCase().includes(q)) || (it.sku && it.sku.toLowerCase().includes(q));
      const cmatch = !cat || it.category === cat;
      return qmatch && cmatch;
    });

    // Mirror server order to keep UI stable after inline edits
    filtered.sort((a, b) =>
      (Number(b.priority||0) - Number(a.priority||0)) ||
      String(a.name||'').localeCompare(String(b.name||''))
    );

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
      tb.innerHTML = `<tr><td colspan="10" class="text-center">No items found</td></tr>`; // colspan +1
      return;
    }
    tb.innerHTML = items.map((it, i) => {
      const img = it.image ? `/images/products/${esc(it.image)}` : '/images/products/placeholder.jpg';
      const checked = it.active ? 'checked' : '';
      return `
        <tr>
          <td>${startIndex + i + 1}</td>
          <td><img src="${img}" alt="Item" onerror="this.onerror=null;this.src='/images/products/placeholder.jpg';" style="max-width:60px;max-height:60px;object-fit:contain"></td>
          <td><a href="#" class="item-link" data-sku="${esc(it.sku)}">${esc(it.name)}</a></td>
<td>${esc(it.sku)}</td>
          <td>${esc(it.category || '')}</td>
          <td>${it.stock ?? 0}</td>
          <td>${it.price==null?'-':fmtKSH(it.price)}</td>

          <!-- ✅ PRIORITY cell -->
          <td>
            <div class="d-flex align-items-center gap-2">
              <input
                class="form-control form-control-sm prio"
                type="number" min="0" step="1"
                value="${Number(it.priority ?? 0)}"
                data-sku="${esc(it.sku)}"
                style="width:90px"
              />
              <button class="btn btn-outline-secondary btn-sm save-prio"
                      data-sku="${esc(it.sku)}">Save</button>
            </div>
          </td>

          <td>
            <label class="switch" style="display:inline-flex;align-items:center;gap:.5rem;">
              <input type="checkbox" class="inline-status-toggle" data-sku="${esc(it.sku)}" ${checked}>
              <span class="status-label">${it.active ? 'Active' : 'Inactive'}</span>
            </label>
          </td>
          
<td>
  <button class="items-action-btn btn btn-sm btn-outline-secondary edit-item-btn" data-sku="${esc(it.sku)}">Edit</button>
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
    html += `<span class="page-indicator" id="itemsPageNum">Page ${page} / ${totalPages}</span>`;
    const windowSize = 7;
    let sp = Math.max(1, page - Math.floor(windowSize/2));
    let ep = Math.min(totalPages, sp + windowSize - 1);
    if (ep - sp + 1 < windowSize) sp = Math.max(1, ep - windowSize + 1);
    for(let p=sp; p<=ep; p++){
      html += `<button type="button" data-page="${p}" class="btn btn-sm ${p===page?'btn-warning':'btn-outline-warning'} mx-1">${p}</button>`;
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

    function btn(p,label,disabled){ return `<button type="button" data-page="${p}" class="btn btn-sm btn-outline-warning mx-1" ${disabled?'disabled':''}>${label}</button>`; }
  }

  function gotoPage(p){
    const tp = Math.max(1, Math.min(totalPages, p));
    currentPage = tp;
    renderPage(tp);
    $('items-table')?.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // ---------- Delegated inline actions (survive DOM swaps)
  document.addEventListener('change', async (e)=>{
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
      await loadItems();
    }catch(err){
      alert('Failed to update status'); box.checked = !active;
    }
  });

  // Save priority (delegated)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button.save-prio');
    if (!btn) return;
    const sku = btn.dataset.sku;
    const input = btn.closest('tr').querySelector('.prio');
    const priority = parseInt(input.value, 10) || 0;
    try {
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ priority })
      });
      await loadItems(); // refresh to reflect server order
    } catch (err) {
      console.error('save priority error:', err);
      alert('Failed to save priority');
    }
  });

  document.addEventListener('click', (e)=>{
  // Name link → open edit modal
  {
    const a = e.target.closest('a.item-link');
    if (a) { e.preventDefault(); const s = a.dataset.sku; if (s) openEdit(s); return; }
  }

    const btn = e.target.closest('button.items-action-btn');
    if (!btn) return;
    const sku = btn.dataset.sku;
    if (btn.classList.contains('edit-item-btn')) openEdit(sku);});

  // ---------- Search / Filter / Per-page (delegated)
  document.addEventListener('click', (e)=>{
    const id = e.target?.id || '';
    if (id === 'search-button' || id === 'items-search-btn') applyFilters(1);
    if (id === 'clear-button'  || id === 'items-clear-btn'){
      const s = $('search-text'); const c = $('category-filter');
      if (s) s.value = ''; if (c) c.value = '';
      applyFilters(1);
    }
    if (e.target?.id === 'btn-add-item'){
      $('add-item-form')?.reset();
      const a = $('add-active'); if (a) a.checked = true;
      const bg = $('add-item-modal-bg'); if (bg) bg.style.display = 'block';
      updateModalOpenState(); // ✅ lock body scroll when open
    }
    if (e.target?.id === 'btn-manage-categories'){
      loadCategoriesIntoSelects().finally(()=>{
        const m = $('manage-categories-modal'); if (m) m.style.display = 'block';
        updateModalOpenState(); // ✅
      });
    }
    if (e.target.classList?.contains('modal-close')){
      const ov = e.target.closest('.modal-bg');
      if (ov) ov.style.display = 'none';
      updateModalOpenState(); // ✅ unlock if none open
    }
  });

  document.addEventListener('input', (e)=>{
    if (e.target?.id === 'search-text') applyFilters(1);
  });
  document.addEventListener('change', (e)=>{
    if (e.target?.id === 'category-filter') applyFilters(1);
    if (e.target?.id === 'items-per-page'){
      PAGE_SIZE = parseInt(e.target.value, 10) || 15;
      applyFilters(1);
    }
  });

  // ---------- Add
  document.addEventListener('submit', async (e)=>{
    const form = e.target.closest('#add-item-form');
    if (!form) return;
    e.preventDefault();
    const sku = $('add-sku').value.trim();
    const name = $('add-name').value.trim();
    const description = $('add-description').value.trim();
    const price = Number($('add-price').value);
    const category = $('add-category').value.trim();
    const image = $('add-image').value.trim() || null;
    const warranty = $('add-warranty').value ? Number($('add-warranty').value) : null;
    const stock = $('add-stock').value ? Number($('add-stock').value) : 0;
    const priority = $('add-priority').value === '' ? 0 : Number($('add-priority').value); // ✅ include priority
    const active = !!$('add-active').checked;

    if (!sku || !name || !description || !category || isNaN(price)){
      alert('Please fill all required fields'); return;
    }

    try{
      await fetchJSON('/api/items', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ sku, name, description, price, category, image, warranty, stock, active, priority })
      });
      $('add-item-modal-bg').style.display = 'none';
      updateModalOpenState(); // ✅
      await loadItems();
    }catch(err){
      alert('Failed to create item: ' + err.message);
    }
  });

  // ---------- Edit
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
      $('edit-priority').value = Number(item.priority ?? 0); // ✅ include priority
      $('edit-item-modal-bg').style.display = 'block';
      updateModalOpenState(); // ✅
    }catch(err){
      alert('Failed to load item: ' + err.message);
    }
  }

  document.addEventListener('submit', async (e)=>{
    const form = e.target.closest('#edit-item-form');
    if (!form) return;
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
      priority:    $('edit-priority').value === '' ? undefined : Number($('edit-priority').value), // ✅ include priority
      active:      $('edit-status').checked
    };

    try{
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      // status in same call already includes 'active', but keep this legacy status route for safety if needed:
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}/status`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ active: !!$('edit-status').checked })
      });
      $('edit-item-modal-bg').style.display = 'none';
      updateModalOpenState(); // ✅
      await loadItems();
    }catch(err){
      alert('Failed to update item: ' + err.message);
    }
  });

  // ---------- Delete
  async function delItem(sku){
    if (!confirm(`Delete item ${sku}?`)) return;
    try{
      await fetchJSON(`/api/items/${encodeURIComponent(sku)}`, { method:'DELETE' });
      await loadItems();
    }catch(err){
      alert('Failed to delete: ' + err.message);
    }
  }

  // ---------- Mount / re-mount
  async function init(){
    const root = $('items-root');
    if (!root || root.dataset.inited === '1') return;
    root.dataset.inited = '1';

    // initial page size if select exists
    if ($('items-per-page')) PAGE_SIZE = parseInt($('items-per-page').value,10) || 10;

    wireModalBasics(); // ✅ ensure backdrop/Esc close works (once)
    await loadCategoriesIntoSelects();
    await loadItems();
  }

  // Auto-init when the partial appears
  const mo = new MutationObserver(() => {
    if ($('items-root') && $('items-table-body')) init();
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });
  // If the partial is already in the DOM when this script executes (first open), run once.
  if ($('items-root') && $('items-table-body')) {
    // Defer to allow styles/layout settle; then init
    setTimeout(() => init(), 0);
  }

  // Also expose a manual hook for the dashboard loader (optional)
  window.AdminItems = window.AdminItems || {};
  window.AdminItems.init = init;

})();
