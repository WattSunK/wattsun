// public/admin/js/admin-loyalty-settings-modal.js
// Delegated modal controller (safe for dynamically-loaded partials)
// Advanced-only: no duplication with card (Eligible user types / Program active removed)

(() => {
  const $ = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);

  const show = (el) => { if (el) { el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); } };
  const hide = (el) => { if (el) { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); } };

  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok || data.success === false) {
      throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    }
    return data;
  };

  const state = { program: null, account: null };

  // ---------- Helpers for optional fields ----------
  const setIf = (id, value) => { const el = $(id); if (el != null) el.value = value; };
  const num = (v, d=0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const hasEl = (id) => $(id) != null;

  // ---------- Program tab (Advanced-only fields) ----------
  function hydrateProgram(programFlatOrWrapped) {
    const program = (programFlatOrWrapped && programFlatOrWrapped.program) ? programFlatOrWrapped.program : programFlatOrWrapped || {};
    state.program = JSON.parse(JSON.stringify(program || {}));

    // Only advanced fields left in modal:
    setIf('durationMonths',    program.durationMonths ?? 6);
    setIf('withdrawWaitDays',  program.withdrawWaitDays ?? 90);
    setIf('minWithdrawPoints', program.minWithdrawPoints ?? 100);

    // Currency/rate (support either pointsPerKES or eurPerPoint – we hydrate whichever exists)
    if (hasEl('pointsPerKES')) {
      setIf('pointsPerKES', program.pointsPerKES ?? (program.eurPerPoint ?? 1));
    }
    if (hasEl('eurPerPoint')) {
      setIf('eurPerPoint', program.eurPerPoint ?? (program.pointsPerKES ?? 1));
    }

    setIf('signupBonus',       program.signupBonus ?? 100);
    if (hasEl('dailyAccrualPoints')) setIf('dailyAccrualPoints', program.dailyAccrualPoints ?? 5);
    if (hasEl('enableDailyAccrual')) $('enableDailyAccrual').checked = !!program.enableDailyAccrual;
  }

  function buildAdvancedPayload() {
    const payload = {};

    if (hasEl('durationMonths'))    payload.durationMonths    = Math.max(0, num($('durationMonths').value, 6));
    if (hasEl('withdrawWaitDays'))  payload.withdrawWaitDays  = Math.max(0, num($('withdrawWaitDays').value, 90));
    if (hasEl('minWithdrawPoints')) payload.minWithdrawPoints = Math.max(0, num($('minWithdrawPoints').value, 100));

    // Accept either pointsPerKES or eurPerPoint (or both, if present)
    if (hasEl('pointsPerKES')) payload.pointsPerKES = Math.max(0, num($('pointsPerKES').value, 1));
    if (hasEl('eurPerPoint'))  payload.eurPerPoint  = Math.max(0, num($('eurPerPoint').value, 1));

    if (hasEl('signupBonus'))       payload.signupBonus       = Math.max(0, num($('signupBonus').value, 100));
    if (hasEl('dailyAccrualPoints')) payload.dailyAccrualPoints = Math.max(0, num($('dailyAccrualPoints').value, 5));
    if (hasEl('enableDailyAccrual')) payload.enableDailyAccrual = $('enableDailyAccrual').checked ? 1 : 0;

    return payload;
  }

  async function loadProgram() {
    if ($('lsMsg')) $('lsMsg').textContent = 'Loading…';
    try {
      // Backend may return flat or wrapped { program: {...} } – support both.
      const data = await api('/api/admin/loyalty/program');
      const program = data.program ? data.program : data; // tolerate both shapes
      hydrateProgram(program);
      if ($('lsMsg')) $('lsMsg').textContent = 'Loaded.';
    } catch (e) {
      if ($('lsMsg')) $('lsMsg').textContent = 'Error: ' + e.message;
    }
  }

  async function saveProgram() {
    if ($('lsMsg')) $('lsMsg').textContent = 'Saving…';
    try {
      const payload = buildAdvancedPayload();
      const data = await api('/api/admin/loyalty/program', { method: 'PUT', body: payload });
      const program = data.program ? data.program : data;
      hydrateProgram(program || payload);
      if ($('lsMsg')) $('lsMsg').textContent = 'Saved.';
    } catch (e) {
      if ($('lsMsg')) $('lsMsg').textContent = 'Save failed: ' + e.message;
    }
  }

  // ---------- Accounts tab ----------
  function clearAccountUI(message) {
    const panel = $('accPanel');
    if (panel) panel.style.display = 'none';
    const msg = $('accMsg');
    if (msg) msg.textContent = message || '';
    state.account = null;
  }

  function hydrateAccount(acc) {
    state.account = JSON.parse(JSON.stringify(acc || {}));
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v ?? ''; };
    set('accFieldId',       acc.id);
    set('accFieldUserId',   acc.user_id);
    if (q('#accStatus')) q('#accStatus').value = acc.status || 'Active';
    set('accFieldBalance',  acc.points_balance);
    set('accFieldStart',    acc.start_date);
    set('accFieldEligible', acc.eligible_from);
    set('accFieldEnd',      acc.end_date);
    const panel = $('accPanel');
    if (panel) panel.style.display = 'block';
  }

  async function loadAccountById() {
    const idRaw = $('accIdInput')?.value.trim() || '';
    const id = parseInt(idRaw, 10);
    if (!id) { clearAccountUI('Enter a valid Account ID.'); return; }
    if ($('accMsg')) $('accMsg').textContent = 'Loading…';
    try {
      const data = await api(`/api/admin/loyalty/accounts/${id}`);
      if (!data.account) { clearAccountUI('Account not found.'); return; }
      hydrateAccount(data.account);
      if ($('accMsg')) $('accMsg').textContent = 'Loaded.';
    } catch (e) {
      clearAccountUI(`Lookup failed: ${e.message}`);
    }
  }

  async function updateAccountStatus() {
    if (!state.account) { if ($('accMsg')) $('accMsg').textContent = 'No account loaded.'; return; }
    const id = state.account.id;
    const status = q('#accStatus')?.value || 'Active';
    if ($('accMsg')) $('accMsg').textContent = 'Updating…';
    try {
      // If your backend uses POST instead, change method to 'POST'.
      await api(`/api/admin/loyalty/accounts/${id}/status`, { method: 'PATCH', body: { status } });
      state.account.status = status;
      if ($('accMsg')) $('accMsg').textContent = 'Status updated.';
    } catch (e) {
      if ($('accMsg')) $('accMsg').textContent = 'Update failed: ' + e.message;
    }
  }

  // ---------- Tabs / Modal wiring (delegated) ----------
  function switchTab(which) {
  const prog = $('tabProgram');
  const acct = $('tabAccounts');
  const bProg = $('tabProgramBtn');
  const bAcct = $('tabAccountsBtn');

  const setActive = (btn, isOn) => {
    if (!btn) return;
    btn.classList.toggle('is-active', !!isOn);   // golden ring hook
    // keep your ghost style for the inactive one
    btn.classList.toggle('btn--ghost', !isOn);
  };

  if (which === 'accounts') {
    if (prog) prog.style.display = 'none';
    if (acct) acct.style.display = 'block';
    setActive(bProg, false);
    setActive(bAcct, true);
    $('lsSave') && ($('lsSave').style.display = 'none');
    $('lsMsg') && ($('lsMsg').textContent = '');
  } else {
    if (prog) prog.style.display = 'block';
    if (acct) acct.style.display = 'none';
    setActive(bProg, true);
    setActive(bAcct, false);
    $('lsSave') && ($('lsSave').style.display = 'inline-block');
    $('lsMsg') && ($('lsMsg').textContent = '');
  }
}


  async function openModal() {
    const modal = $('lsModal');
    if (!modal) return; // partial not mounted yet
    $('lsMsg') && ($('lsMsg').textContent = 'Loading…');
    clearAccountUI('');
    switchTab('program');
    show(modal);
    await loadProgram();
  }

  // Event delegation (safe for injected partials)
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    if (t.closest('#openSettings'))      { e.preventDefault(); openModal(); return; }
    if (t.closest('#lsClose'))           { e.preventDefault(); hide($('lsModal')); return; }
    if (t.closest('#lsSave'))            { e.preventDefault(); saveProgram(); return; }

    if (t.closest('#tabProgramBtn'))     { e.preventDefault(); switchTab('program'); return; }
    if (t.closest('#tabAccountsBtn'))    { e.preventDefault(); switchTab('accounts'); return; }

    if (t.closest('#accLoadBtn'))        { e.preventDefault(); loadAccountById(); return; }
    if (t.closest('#accUpdateBtn'))      { e.preventDefault(); updateAccountStatus(); return; }
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    const modal = $('lsModal');
    if (!modal || modal.style.display === 'none') return;
    if (e.target === modal) hide(modal);
  });

  // Esc closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('lsModal')?.style.display !== 'none') {
      hide($('lsModal'));
    }
  });
})();
