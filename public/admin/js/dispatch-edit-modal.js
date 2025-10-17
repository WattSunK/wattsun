// public/admin/js/dispatch-edit-modal.js
(function () {
  const $ = (s, el = document) => el.querySelector(s);

  const modal = $('#dispatch-edit');
  const form  = $('#dispatch-edit-form');

  const fId    = $('#de-id');
  const fStat  = $('#de-status');
  const fDrv   = $('#de-driver');         // <input list="drivers-list">
  const fUnas  = $('#de-unassign');
  const fDate  = $('#de-date');
  const fClrDt = $('#de-clear-date');
  const fNotes = $('#de-notes');
  const btnCancel = $('#de-cancel');
  const btnDelivered = $('#de-delivered');

  // Track the status when the modal is opened (from the row) so we can gate "Mark Delivered"
  let origStatus = null;
  function updateDeliveredBtn() {
    if (!btnDelivered) return;
    const can = origStatus === 'InTransit';
    btnDelivered.disabled = !can;
    btnDelivered.title = can ? '' : 'Mark Delivered is only available when the current status is InTransit.';
  }

  // ---------- Drivers datalist (single-line "id — name") ----------
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
        const oneLine = `${d.id} — ${label}`;
        return `<option value="${oneLine}"></option>`;
      }).join('');
    }
    return driversCache;
  }

  function show() {
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    try { document.documentElement.classList.add('ws-modal-open'); document.body.classList.add('ws-modal-open'); } catch {}
  }
  function hide() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    fUnas.checked = false;
    fClrDt.checked = false;
    toggleDriverField();
    try { document.documentElement.classList.remove('ws-modal-open'); document.body.classList.remove('ws-modal-open'); } catch {}
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

  // ---------- Prefill ----------
  function prefillFromRow(tr, id) {
    const cells = tr.querySelectorAll('td');
    // columns: ID, Order, Status, Driver, Planned, Updated, Actions
    const status  = cells[2]?.textContent.trim() || 'Created';
    const driver  = cells[3]?.textContent.trim() || '';   // may be name or "Unassigned"
    const planned = cells[4]?.textContent.trim() || '';

    fId.value   = id;
    fStat.value = status;

    // remember original status for gating "Mark Delivered"
    origStatus = status;
    updateDeliveredBtn();

    // If the cell shows a pure numeric id we keep it, otherwise leave blank;
    // after loadDrivers() we try to backfill from the name.
    fDrv.value  = /^\d+$/.test(driver) ? driver : '';

    fDate.value = /^\d{4}-\d{2}-\d{2}$/.test(planned) ? planned : '';
    fNotes.value = '';
    fUnas.checked = false;
    fClrDt.checked = false;
    toggleDriverField();
    // Reset history cache for a new row
    histLoadedFor = null;
    histLimit = HIST_DEFAULT_LIMIT;
  }

  // ---------- Disable/enable driver input when Unassign is checked ----------
  function toggleDriverField() {
    const off = fUnas?.checked;
    if (!fDrv) return;
    fDrv.disabled = !!off;
    if (off) fDrv.value = '';
  }
  fUnas?.addEventListener('change', toggleDriverField);

  // Optional: prevent selecting Delivered in the dropdown unless the row was InTransit
  fStat?.addEventListener('change', () => {
    if (fStat.value === 'Delivered' && origStatus !== 'InTransit') {
      alert('Move the dispatch to InTransit first before marking Delivered.');
      fStat.value = origStatus || 'Created';
    }
  });

  // ---------- Interpret driver input (supports "2", "2 — Name", or typing name/email) ----------
  function resolveDriverId(input) {
    const s = (input || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);        // "2"
    const m = s.match(/^\s*(\d+)\b/);             // "2 — Name"
    if (m) return Number(m[1]);
    if (!driversCache) return null;               // typed name/email
    const low = s.toLowerCase();
    const hit = driversCache.find(d =>
      (d.name && d.name.toLowerCase() === low) ||
      (d.email && d.email.toLowerCase() === low)
    );
    return hit ? Number(hit.id) : null;
  }

  // ---------- History (read-only) ----------
  const histBox = document.querySelector('#de-history');
  const histBtn = document.querySelector('#de-history-btn');
  const histMoreBtn = document.querySelector('#de-history-more');
  const histCsvBtn  = document.querySelector('#de-history-csv');

  const HIST_DEFAULT_LIMIT = 20;
  let histLimit = HIST_DEFAULT_LIMIT;
  let histLoadedFor = null;

  async function fetchHistory(dispatchId, limit) {
    const res = await fetch(`/api/admin/dispatches/${dispatchId}/history?limit=${limit}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !(data.success || data.ok)) {
      const msg = data?.error?.message || `Failed to load history (${res.status})`;
      throw new Error(msg);
    }
    return data.history || [];
  }

  function fmtWhen(s) {
    const v = s?.includes(' ') ? s.replace(' ', 'T') : s;
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleString() : (s || '');
  }

  function renderHistory(items) {
    if (!histBox) return;
    if (!items.length) {
      histBox.innerHTML = `<div class="empty">No history yet.</div>`;
      return;
    }
    histBox.innerHTML = items.map((h, idx) => {
      const who = h.changed_by_name || h.changed_by_email || (h.changed_by != null ? `User ${h.changed_by}` : '—');
      const note = h.note ? `<div class="note">${h.note}</div>` : '';
      return `
        <div class="item ${idx === 0 ? 'first' : ''}">
          <div class="when">${fmtWhen(h.changed_at)}</div>
          <div class="change">
            <span class="badge">${h.old_status ?? '—'}</span>
            <span class="arrow">→</span>
            <span class="badge badge--new">${h.new_status}</span>
          </div>
          <div class="who">by ${who}</div>
          ${note}
        </div>`;
    }).join('');
  }

  histBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!histBox) return;
    const id = fId.value;
    if (!id) return;

    // Toggle open/close
    const showing = histBox.classList.toggle('show');
    histBtn.textContent = showing ? 'Hide history' : 'History';
    if (!showing) return;

    // Reset to default limit whenever opening
    histLimit = HIST_DEFAULT_LIMIT;

    // Load once per id or refresh if different dispatch
    histBox.innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const list = await fetchHistory(id, histLimit);
      renderHistory(list);
      histLoadedFor = id;
    } catch (err) {
      histBox.innerHTML = `<div class="error">${err.message || 'Failed to load history'}</div>`;
    }
  });

  histMoreBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!histBox?.classList.contains('show')) return;
    const id = fId.value;
    if (!id) return;
    histLimit += HIST_DEFAULT_LIMIT; // bump page size
    try {
      const list = await fetchHistory(id, histLimit);
      renderHistory(list);
    } catch (err) {
      console.warn('[history more]', err);
    }
  });

  histCsvBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const id = fId.value;
    if (!id) return;
    // Let the browser download the CSV with session cookie
    window.open(`/api/admin/dispatches/${id}/history.csv?limit=${Math.max(histLimit, HIST_DEFAULT_LIMIT)}`, '_blank');
  });

  // ---------- Mark Delivered quick action ----------
  btnDelivered?.addEventListener('click', (e) => {
    e.preventDefault();
    if (btnDelivered.disabled) {
      alert('Only dispatches currently InTransit can be marked Delivered.');
      return;
    }
    fStat.value = 'Delivered';
    // Delivered implies still assigned; don't force unassign
    fUnas.checked = false;
    toggleDriverField();
    // Submit immediately
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  });

  // ---------- Open modal ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action][data-id]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id     = btn.getAttribute('data-id');
    if (!id) return;

    if (!['assign','unassign','planned','status','note','edit'].includes(action)) return;

    const tr = btn.closest('tr');
    if (tr) prefillFromRow(tr, id);

    // Nudges
    if (action === 'assign') fStat.value = 'Assigned';
    if (action === 'unassign') { fUnas.checked = true; fStat.value = 'Created'; fDrv.value=''; }
    if (action === 'planned') fDate.focus();
    if (action === 'status')  fStat.focus();
    if (action === 'note')    fNotes.focus();

    // Load drivers list, then try to backfill current driver by matching the cell text
    loadDrivers().then(() => {
      if (!fDrv.value && tr) {
        const nameCell = tr.querySelectorAll('td')[3];
        const display = nameCell?.textContent.trim();
        if (display && display.toLowerCase() !== 'unassigned') {
          const hit = driversCache?.find(d =>
            d.name === display || d.email === display
          );
          if (hit) {
            const oneLine = `${hit.id} — ${(hit.name && hit.name.trim()) || hit.email || `Driver ${hit.id}`}`;
            fDrv.value = oneLine;
          }
        }
      }
    }).catch(err => console.warn('[drivers]', err));

    // Close history when switching rows
    if (histBox?.classList.contains('show')) {
      histBox.classList.remove('show');
      histBtn && (histBtn.textContent = 'History');
    }
    histLoadedFor = null;
    histLimit = HIST_DEFAULT_LIMIT;

    toggleDriverField();
    show();
  });

  // ---------- Cancel / Save ----------
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
      const s = fDate.value.trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [dd, mm, yyyy] = s.split('/');
        payload.planned_date = `${yyyy}-${mm}-${dd}`;
      } else {
        payload.planned_date = s;
      }
    }

    // notes
    if (fNotes.value.trim() !== '') {
      payload.notes = fNotes.value.trim();
    }

    try {
      await patch(id, payload);
      hide();
      document.dispatchEvent(new CustomEvent('admin:dispatch:refresh'));

      // If history is visible, refresh it
      if (histBox?.classList.contains('show') && fId.value) {
        try { renderHistory(await fetchHistory(fId.value, histLimit)); } catch {}
      }
    } catch (err) {
      alert(err.message || 'Update failed');
    }
  });

  // ---------- Close on backdrop click ----------
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });
})();
