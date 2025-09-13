// public/admin/js/dispatch-actions.js
// Purpose: Minimal inline actions for Dispatch list (Assign/Unassign/Plan/Status/Note).
// Usage: include this script on the Dispatch page. It delegates off #dispatch-root.
// After a successful PATCH, it emits "admin:dispatch:refresh" (your list should listen and refetch).

(function () {
  const ROOT_SELECTOR = '#dispatch-root';
  const ALLOWED_STATUSES = ['Created', 'Assigned', 'InTransit', 'Canceled'];

  function getRoot() {
    return document.querySelector(ROOT_SELECTOR);
  }

  function normalizeJsonOk(data) {
    // Accept either {success:true} or {ok:true}
    return !!(data && (data.success === true || data.ok === true));
  }

  async function patchDispatch(id, payload) {
    const res = await fetch(`/api/admin/dispatches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    let data;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !normalizeJsonOk(data)) {
      const msg = (data && data.error && data.error.message) || `Update failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function promptDate(defaultValue) {
    const v = window.prompt('Planned date (YYYY-MM-DD):', defaultValue || '');
    if (v == null || v === '') return null; // canceled
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      alert('Invalid date. Use YYYY-MM-DD.');
      return null;
    }
    return v;
  }

  function promptStatus() {
    const v = window.prompt('New status: Created | Assigned | InTransit | Canceled', 'Assigned');
    if (v == null || v.trim() === '') return null;
    const s = v.trim();
    if (!ALLOWED_STATUSES.includes(s)) {
      alert('Invalid status. Allowed: ' + ALLOWED_STATUSES.join(', '));
      return null;
    }
    return s;
  }

  async function handleAction(id, action) {
    if (!id) throw new Error('Missing dispatch id');

    if (action === 'assign') {
      const driver = window.prompt('Driver ID to assign (leave blank to cancel):', '');
      if (!driver) return; // canceled
      const planned = window.prompt('Planned date (YYYY-MM-DD), optional:', '') || undefined;
      await patchDispatch(id, {
        driver_id: Number(driver),
        planned_date: planned,
        status: 'Assigned',
        notes: 'Assign via inline action'
      });
      return;
    }

    if (action === 'unassign') {
      await patchDispatch(id, {
        driver_id: null,
        status: 'Created',
        notes: 'Unassign via inline action'
      });
      return;
    }

    if (action === 'planned') {
      const d = promptDate();
      if (!d) return; // canceled or invalid
      await patchDispatch(id, { planned_date: d, notes: 'Planned date set' });
      return;
    }

    if (action === 'status') {
      const s = promptStatus();
      if (!s) return; // canceled or invalid
      await patchDispatch(id, { status: s, notes: `Status -> ${s}` });
      return;
    }

    if (action === 'note') {
      const n = window.prompt('Add note:', '');
      if (!n) return; // canceled
      await patchDispatch(id, { notes: n });
      return;
    }

    // Unknown action: ignore silently
  }

  // Delegated click handler
  function onClick(e) {
    const btn = e.target.closest('[data-action][data-id]');
    if (!btn) return;
    const root = getRoot();
    if (!root || !root.contains(btn)) return;

    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');

    handleAction(id, action)
      .then(() => {
        document.dispatchEvent(new CustomEvent('admin:dispatch:refresh'));
      })
      .catch((err) => {
        alert(err && err.message ? err.message : 'Action failed');
      });
  }

  // Attach once, globally (safe even if dispatch root is re-rendered)
  document.addEventListener('click', onClick);
})();
