// public/js/admin-loyalty-settings-modal.js
// admin-loyalty-settings-modal.js (delegated version for dynamic partials)
(() => {
  const $ = (id) => document.getElementById(id);
  const sel = (q, root = document) => root.querySelector(q);
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

  // ───────────── Program tab helpers ─────────────
  function hydrateProgram(program) {
    state.program = JSON.parse(JSON.stringify(program || {}));
    const ut = $('eligibleUserTypes'); if (ut) ut.value = (program.eligibleUserTypes || ['Staff']).join(', ');
    const dm = $('durationMonths');    if (dm) dm.value = program.durationMonths ?? 6;
    const ww = $('withdrawWaitDays');  if (ww) ww.value = program.withdrawWaitDays ?? 90;
    const mw = $('minWithdrawPoints'); if (mw) mw.value = program.minWithdrawPoints ?? 100;
    const ep = $('eurPerPoint');       if (ep) ep.value = program.eurPerPoint ?? 1;
    const sb = $('signupBonus');       if (sb) sb.value = program.signupBonus ?? 100;
    const ac = $('active');            if (ac) ac.value = (program.active === false ? 'false' : 'true');
  }

  function payloadProgram() {
    const val = (id, d='') => ($(`${id}`)?.value ?? d);
    const eligible = val('eligibleUserTypes','')
      .split(',').map(s => s.trim()).filter(Boolean);
    return {
      eligibleUserTypes: eligible.length ? eligible : ['Staff'],
      durationMonths:    Math.max(0, parseInt(val('durationMonths',6), 10) || 0),
      withdrawWaitDays:  Math.max(0, parseInt(val('withdrawWaitDays',90), 10) || 0),
      minWithdrawPoints: Math.max(0, parseInt(val('minWithdrawPoints',100), 10) || 0),
      eurPerPoint:       parseFloat(val('eurPerPoint', '1')) || 1,
      signupBonus:       Math.max(0, parseInt(val('signupBonus',100), 10) || 0),
      active:            val('active','true') === 'true'
    };
  }

  async function loadProgram() {
    if ($('lsMsg')) $('lsMsg').textContent = 'Loading…';
    try {
      const data = await api('/api/admin/loyalty/program');
      hydrateProgram(data.program || {});
      if ($('lsMsg')) $('lsMsg').textContent = 'Loaded.';
    } catch (e) {
      if ($('lsMsg')) $('lsMsg').textContent = 'Error: ' + e.message;
    }
  }

  async function saveProgram() {
    if ($('lsMsg')) $('lsMsg').textContent = 'Saving…';
    try {
      const payload = payloadProgram();
      const data = await api('/api/admin/loyalty/program', { method: 'PUT', body: payload });
      hydrateProgram(data.program || payload);
      if ($('lsMsg')) $('lsMsg').textContent = 'Saved.';
    } catch (e) {
      if ($('lsMsg')) $('lsMsg').textContent = 'Save failed: ' + e.message;
    }
  }

  // ───────────── Accounts tab helpers ─────────────
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
    sel('#accStatus') && (sel('#accStatus').value = acc.status || 'Active');
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
    const status = sel('#accStatus')?.value || 'Active';
    if ($('accMsg')) $('accMsg').textContent = 'Updating…';
    try {
      await api(`/api/admin/loyalty/accounts/${id}/status`, { method: 'PATCH', body: { status } });
      state.account.status = status;
      if ($('accMsg')) $('accMsg').textContent = 'Status updated.';
    } catch (e) {
      if ($('accMsg')) $('accMsg').textContent = 'Update failed: ' + e.message;
    }
  }

  // ───────────── Tabs / Modal wiring (delegated) ─────────────
  function switchTab(which) {
    const prog = $('tabProgram');
    const acct = $('tabAccounts');
    const bProg = $('tabProgramBtn');
    const bAcct = $('tabAccountsBtn');
    if (which === 'accounts') {
      if (prog) prog.style.display = 'none';
      if (acct) acct.style.display = 'block';
      bProg && bProg.classList.add('btn--ghost');
      bAcct && bAcct.classList.remove('btn--ghost');
      $('lsSave') && ($('lsSave').style.display = 'none');
      $('lsMsg') && ($('lsMsg').textContent = '');
    } else {
      if (prog) prog.style.display = 'block';
      if (acct) acct.style.display = 'none';
      bProg && bProg.classList.remove('btn--ghost');
      bAcct && bAcct.classList.add('btn--ghost');
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

  // Use event delegation so it works even if the partial is injected later
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    if (t.closest('#openSettings')) {
      // Open Settings modal
      e.preventDefault();
      openModal();
      return;
    }
    if (t.closest('#lsClose')) {
      e.preventDefault();
      hide($('lsModal'));
      return;
    }
    if (t.closest('#lsSave')) {
      e.preventDefault();
      saveProgram();
      return;
    }

    // Tabs
    if (t.closest('#tabProgramBtn')) { e.preventDefault(); switchTab('program'); return; }
    if (t.closest('#tabAccountsBtn')) { e.preventDefault(); switchTab('accounts'); return; }

    // Accounts actions
    if (t.closest('#accLoadBtn'))   { e.preventDefault(); loadAccountById(); return; }
    if (t.closest('#accUpdateBtn')) { e.preventDefault(); updateAccountStatus(); return; }
  });

  // Close on overlay click
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
