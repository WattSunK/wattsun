// public/js/admin-loyalty-settings-modal.js
(() => {
  const $ = (id) => document.getElementById(id);
  const show = (el) => { el.style.display = 'flex'; el.setAttribute('aria-hidden','false'); };
  const hide = (el) => { el.style.display = 'none'; el.setAttribute('aria-hidden','true'); };

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
    $('eligibleUserTypes').value = (program.eligibleUserTypes || ['Staff']).join(', ');
    $('durationMonths').value = program.durationMonths ?? 6;
    $('withdrawWaitDays').value = program.withdrawWaitDays ?? 90;
    $('minWithdrawPoints').value = program.minWithdrawPoints ?? 100;
    $('eurPerPoint').value = program.eurPerPoint ?? 1;
    $('signupBonus').value = program.signupBonus ?? 100;
    $('active').value = (program.active === false ? 'false' : 'true');
  }

  function payloadProgram() {
    const eligible = $('eligibleUserTypes').value
      .split(',')
      .map(s => s.trim()).filter(Boolean);
    return {
      eligibleUserTypes: eligible.length ? eligible : ['Staff'],
      durationMonths: Math.max(0, parseInt($('durationMonths').value || 6, 10)),
      withdrawWaitDays: Math.max(0, parseInt($('withdrawWaitDays').value || 90, 10)),
      minWithdrawPoints: Math.max(0, parseInt($('minWithdrawPoints').value || 100, 10)),
      eurPerPoint: parseFloat($('eurPerPoint').value || '1') || 1,
      signupBonus: Math.max(0, parseInt($('signupBonus').value || 100, 10)),
      active: $('active').value === 'true'
    };
  }

  async function loadProgram() {
    $('lsMsg').textContent = 'Loading…';
    try {
      const data = await api('/api/admin/loyalty/program');
      hydrateProgram(data.program || {});
      $('lsMsg').textContent = 'Loaded.';
    } catch (e) {
      $('lsMsg').textContent = 'Error: ' + e.message;
    }
  }

  async function saveProgram() {
    $('lsMsg').textContent = 'Saving…';
    try {
      const payload = payloadProgram();
      const data = await api('/api/admin/loyalty/program', { method: 'PUT', body: payload });
      hydrateProgram(data.program || payload);
      $('lsMsg').textContent = 'Saved.';
    } catch (e) {
      $('lsMsg').textContent = 'Save failed: ' + e.message;
    }
  }

  // ───────────── Accounts tab helpers ─────────────
  function clearAccountUI(message) {
    $('accPanel').style.display = 'none';
    $('accMsg').textContent = message || '';
    state.account = null;
  }

  function hydrateAccount(acc) {
    state.account = JSON.parse(JSON.stringify(acc || {}));
    $('accFieldId').textContent = acc.id ?? '';
    $('accFieldUserId').textContent = acc.user_id ?? '';
    $('accStatus').value = acc.status || 'Active';
    $('accFieldBalance').textContent = acc.points_balance ?? '';
    $('accFieldStart').textContent = acc.start_date ?? '';
    $('accFieldEligible').textContent = acc.eligible_from ?? '';
    $('accFieldEnd').textContent = acc.end_date ?? '';
    $('accPanel').style.display = 'block';
  }

  async function loadAccountById() {
    const idRaw = $('accIdInput').value.trim();
    const id = parseInt(idRaw, 10);
    if (!id) { clearAccountUI('Enter a valid Account ID.'); return; }
    $('accMsg').textContent = 'Loading…';
    try {
      // This GET endpoint should return: { success:true, account:{ id, user_id, status, start_date, eligible_from, end_date, points_balance } }
      const data = await api(`/api/admin/loyalty/accounts/${id}`);
      if (!data.account) {
        clearAccountUI('Account not found.');
        return;
      }
      hydrateAccount(data.account);
      $('accMsg').textContent = 'Loaded.';
    } catch (e) {
      // Handle missing endpoint gracefully
      clearAccountUI(`Lookup failed: ${e.message}`);
    }
  }

  async function updateAccountStatus() {
    if (!state.account) { $('accMsg').textContent = 'No account loaded.'; return; }
    const id = state.account.id;
    const status = $('accStatus').value;
    $('accMsg').textContent = 'Updating…';
    try {
      await api(`/api/admin/loyalty/accounts/${id}/status`, {
        method: 'PATCH',
        body: { status }
      });
      // reflect change locally
      state.account.status = status;
      $('accMsg').textContent = 'Status updated.';
    } catch (e) {
      $('accMsg').textContent = 'Update failed: ' + e.message;
    }
  }

  // ───────────── Tabs / Modal wiring ─────────────
  function switchTab(which) {
    const prog = $('tabProgram');
    const acct = $('tabAccounts');
    const bProg = $('tabProgramBtn');
    const bAcct = $('tabAccountsBtn');
    if (which === 'accounts') {
      prog.style.display = 'none';
      acct.style.display = 'block';
      bProg.classList.add('btn--ghost');
      bAcct.classList.remove('btn--ghost');
      $('lsSave').style.display = 'none'; // hide Save (Program) on Accounts tab
      $('lsMsg').textContent = '';
    } else {
      prog.style.display = 'block';
      acct.style.display = 'none';
      bProg.classList.remove('btn--ghost');
      bAcct.classList.add('btn--ghost');
      $('lsSave').style.display = 'inline-block';
      $('lsMsg').textContent = '';
    }
  }

  async function openModal() {
    $('lsMsg').textContent = 'Loading…';
    clearAccountUI('');
    switchTab('program');
    show($('lsModal'));
    await loadProgram();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Modal open/close
    $('openSettings')?.addEventListener('click', openModal);
    $('lsClose')?.addEventListener('click', () => hide($('lsModal')));
    $('lsModal')?.addEventListener('click', (e) => { if (e.target === $('lsModal')) hide($('lsModal')); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('lsModal')?.style.display !== 'none') hide($('lsModal')); });

    // Save (Program)
    $('lsSave')?.addEventListener('click', saveProgram);

    // Tabs
    $('tabProgramBtn')?.addEventListener('click', () => switchTab('program'));
    $('tabAccountsBtn')?.addEventListener('click', () => switchTab('accounts'));

    // Accounts
    $('accLoadBtn')?.addEventListener('click', loadAccountById);
    $('accUpdateBtn')?.addEventListener('click', updateAccountStatus);
  });
})();
