// public/admin/js/dispatch-edit-modal.js
(function () {
  const rootSel = '#dispatch-root';
  const $ = (s, el = document) => el.querySelector(s);

  const modal = $('#dispatch-edit');
  const form  = $('#dispatch-edit-form');

  const fId    = $('#de-id');
  const fStat  = $('#de-status');
  const fDrv   = $('#de-driver');
  const fUnas  = $('#de-unassign');
  const fDate  = $('#de-date');
  const fClrDt = $('#de-clear-date');
  const fNotes = $('#de-notes');
  const btnCancel = $('#de-cancel');

  // --- NEW: drivers datalist cache + loader (3a) ---------------------------
  const fList = document.querySelector('#drivers-list');
  let driversCache = null;

  async function loadDrivers() {
    if (driversCache) return driversCache;
    const res = await fetch('/api/admin/dispatches/drivers?active=1', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data.success || data.ok)) {
      const msg = data?.error?.message || `Failed to load drivers (${res.status})`;
      throw new Error(msg);
    }
    driversCache = data.drivers || [];
    if (fList) {
      fList.innerHTML = driversCache.map(d => {
        const label = (d.name && d.name.trim()) || d.email || `Driver ${d.id}`;
        return `<option value="${d.id}">${label}</option>`;
      }).join('');
    }
    return driversCache;
  }

  function show() { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
  function hide() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    fUnas.checked = false;
    fClrDt.checked = false;
    toggleDriverField();
  }

  async function patch(id, payload) {
    const res = await fetch(`/api/admin/dispatches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data.success || data.ok)) {
      const msg = data?.error?.message || `Update failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  // Fill modal from the table row cells
  function prefillFromRow(tr, id) {
    const cells = tr.querySelectorAll('td');
    // columns: ID, Order, Status, Driver, Planned, Updated, Actions
    const status = cells[2]?.textContent.trim() || 'Created';
    const driver = cells[3]?.textContent.trim() || '';
    const planned= cells[4]?.textContent.trim() || '';

    fId.value   = id;
    fStat.value = status;
    fDrv.value  = /^\d+$/.test(driver) ? driver : '';
    fDate.value = /^\d{4}-\d{2}-\d{2}$/.test(planned) ? planned : '';
    fNotes.value = '';
    fUnas.checked = false;
    fClrDt.checked = false;
    toggleDriverField();
  }

  // --- NEW: disable/enable driver input when Unassign is checked (3c) -----
  function toggleDriverField() {
    const off = fUnas?.checked;
    if (!fDrv) return;
    fDrv.disabled = !!off;
    if (off) fDrv.value = '';
  }
  fUnas?.addEventListener('change', toggleDriverField);

  // --- Helper: interpret driver input (id or name/email typed) ------------
  function resolveDriverId(input) {
    const s = (input || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    if (!driversCache) return null;
    const low = s.toLowerCase();
    const hit = driversCache.find(d =>
      (d.name && d.name.toLowerCase() === low) ||
      (d.email && d.email.toLowerCase() === low)
    );
    return hit ? Number(hit.id) : null;
  }

  // Open modal on any action or an explicit "edit" button
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action][data-id]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id     = btn.getAttribute('data-id');
    if (!id) return;

    // Limit to our actions, but keep compatible with existing buttons
    if (!['assign','unassign','planned','status','note','edit'].includes(action)) return;

    const tr = btn.closest('tr');
    if (tr) prefillFromRow(tr, id);

    // Nudge defaults depending on which button was clicked
    if (action === 'assign') fStat.value = 'Assigned';
    if (action === 'unassign') { fUnas.checked = true; fStat.value = 'Created'; fDrv.value=''; }
    if (action === 'planned') fDate.focus();
    if (action === 'status')  fStat.focus();
    if (action === 'note')    fNotes.focus();

    // --- NEW: load drivers list when opening (3b)
    loadDrivers().catch(err => console.warn('[drivers]', err));
    toggleDriverField();
    show();
  });

  btnCancel?.addEventListener('click', (e) => { e.preventDefault(); hide(); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = fId.value;
    const payload = {};
    // status
    if (fStat.value) payload.status = fStat.value;

    // driver
    if (fUnas.checked) {
      payload.driver_id = null;
    } else if (fDrv.value.trim() !== '') {
      const drvId = resolveDriverId(fDrv.value);
      if (drvId != null) payload.driver_id = drvId;
    }
    // date
    if (fClrDt.checked) {
      payload.planned_date = null;
    } else if (fDate.value.trim() !== '') {
      payload.planned_date = fDate.value.trim();
    }
    // notes
    if (fNotes.value.trim() !== '') {
      payload.notes = fNotes.value.trim();
    }

    try {
      await patch(id, payload);
      hide();
      document.dispatchEvent(new CustomEvent('admin:dispatch:refresh'));
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  });

  // Close on backdrop click
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });
})();
