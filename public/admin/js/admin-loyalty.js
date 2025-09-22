// public/admin/js/admin-loyalty.js
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n === 0 || n ? Number(n).toLocaleString() : '—');

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

  const pill = (status) => {
    const s = String(status || '').toLowerCase();
    const cls =
      s === 'approved' ? 'pill pill--ok' :
      s === 'rejected' ? 'pill pill--warn' :
      s === 'paid'     ? 'pill pill--ok' :
                         'pill';
    return `<span class="${cls}">${status || '—'}</span>`;
  };

  // ----- Loaders -----
  async function loadAccounts() {
    const body = document.getElementById("loyaltyAccountsBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="11" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/accounts");
      const rows = data.accounts || [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="11" class="muted">(No data yet)</td></tr>`;
        return;
      }
      body.innerHTML = "";
      for (const a of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${a.id}</td>
          <td>${a.user_id}</td>
          <td>${a.email || "—"}</td>
          <td>${a.status}</td>
          <td>${a.start_date || "—"}</td>
          <td>${a.end_date || "—"}</td>
          <td>${fmt(a.duration_months)}</td>
          <td>${fmt(a.points_balance)}</td>
          <td>${fmt(a.total_earned)}</td>
          <td>${fmt(a.total_penalty)}</td>
          <td>${fmt(a.total_paid)}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="11" class="muted">Error: ${e.message}</td></tr>`;
    }
  }

  async function loadLedger() {
    const body = document.getElementById("loyaltyLedgerBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/ledger");
      const rows = data.ledger || [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="6" class="muted">(No data yet)</td></tr>`;
        return;
      }
      body.innerHTML = "";
      for (const l of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${l.id}</td>
          <td>${l.account_id}</td>
          <td>${l.kind}</td>
          <td>${fmt(l.points_delta)}</td>
          <td>${l.note || "—"}</td>
          <td>${l.created_at}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="6" class="muted">Error: ${e.message}</td></tr>`;
    }
  }

  async function loadNotifications() {
    const body = document.getElementById("loyaltyNotificationsBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/notifications");
      const rows = data.notifications || [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="5" class="muted">(No data yet)</td></tr>`;
        return;
      }
      body.innerHTML = "";
      for (const n of rows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${n.id}</td>
          <td>${n.kind}</td>
          <td>${n.email}</td>
          <td>${n.status}</td>
          <td>${n.created_at}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="5" class="muted">Error: ${e.message}</td></tr>`;
    }
  }

  async function loadList() {
    const body = $('wdBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="9" class="muted">(No data yet)</td></tr>`;

    const status = $('statusSel')?.value || '';
    const q = status ? `?status=${encodeURIComponent(status)}` : '';

    try {
      const data = await api(`/api/admin/loyalty/withdrawals${q}`);
      const rows = data.withdrawals || data.items || [];
      body.innerHTML = '';
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="9" class="muted">(No data yet)</td></tr>`;
        return;
      }

      for (const w of rows) {
        const id = w.id ?? w.withdrawal_id ?? '';
        const user = w.user_email || w.email || w.user_id || '—';
        const pts = w.requested_pts ?? w.points ?? '—';
        const eur = (w.requested_eur ?? (w.eur ?? null));
        const st  = w.status || 'Pending';
        const requested = w.requested_at || w.created_at || '';
        const decided   = w.decided_at   || '';
        const paid      = w.paid_at      || '';

        const canApprove = st === 'Pending';
        const canReject  = st === 'Pending';
        const canPaid    = st === 'Approved';

        const actions = [
          canApprove ? `<button class="btn btn--small" data-act="approve" data-id="${id}">Approve</button>` : '',
          canReject  ? `<button class="btn btn--small" data-act="reject"  data-id="${id}">Reject</button>`  : '',
          canPaid    ? `<button class="btn btn--small" data-act="paid"    data-id="${id}">Mark Paid</button>` : ''
        ].filter(Boolean).join(' ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${id}</td>
          <td>${user}</td>
          <td>${fmt(pts)}</td>
          <td>€${fmt(eur)}</td>
          <td>${pill(st)}</td>
          <td>${requested || '—'}</td>
          <td>${decided   || '—'}</td>
          <td>${paid      || '—'}</td>
          <td style="text-align:center;">${actions || '—'}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="9" class="muted">Error: ${e.message}</td></tr>`;
    }
  }

  // ----- Actions -----
  async function doAct(act, id) {
    let path = '';
    let method = 'POST';
    let body = { id };

    if (act === 'approve') {
      path = `/api/admin/loyalty/withdrawals/${id}/approve`;
    } else if (act === 'reject') {
      path = `/api/admin/loyalty/withdrawals/${id}/reject`;
    } else if (act === 'paid') {
      path = `/api/admin/loyalty/withdrawals/${id}/paid`;
    } else {
      return;
    }

    try {
      await api(path, { method, body });
      await loadList();
    } catch (e) {
      const bodyEl = $('wdBody');
      if (bodyEl) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="9" class="muted">Action failed: ${e.message}</td></tr>`;
        bodyEl.insertBefore(tr, bodyEl.firstChild);
      } else {
        alert(`Action failed: ${e.message}`);
      }
    }
  }

  function bindTableActions() {
    const body = $('wdBody');
    if (!body) return;
    body.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      const id  = t.getAttribute('data-id');
      if (!act || !id) return;
      doAct(act, id);
    });
  }

  // ----- Auto refresh (withdrawals only) -----
  let refreshTimer = null;
  function setAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    const val = Number($('autoRefresh')?.value || 0);
    if (val > 0) {
      refreshTimer = setInterval(() => {
        const active = document.querySelector('.btn--active');
        if (active && active.id === "tabWithdrawalsBtn") {
          loadList();
        }
      }, val * 1000);
    }
  }

  // ----- Tab toggler -----
  function initLoyaltyTabs() {
    const btns = {
      withdrawals: $("tabWithdrawalsBtn"),
      accounts: $("tabAccountsBtn"),
      ledger: $("tabLedgerBtn"),
      notifs: $("tabNotifsBtn")
    };

    const tabs = {
      withdrawals: $("loyaltyTabWithdrawals"),
      accounts: $("loyaltyTabAccounts"),
      ledger: $("loyaltyTabLedger"),
      notifs: $("loyaltyTabNotifs")
    };

    function showTab(which) {
      Object.keys(tabs).forEach(k => {
        tabs[k].style.display = (k === which) ? "block" : "none";
        btns[k]?.classList.toggle("btn--active", k === which);
      });
      if (which === "withdrawals") loadList();
      if (which === "accounts") loadAccounts();
      if (which === "ledger") loadLedger();
      if (which === "notifs") loadNotifications();
    }

    btns.withdrawals?.addEventListener("click", () => showTab("withdrawals"));
    btns.accounts?.addEventListener("click", () => showTab("accounts"));
    btns.ledger?.addEventListener("click", () => showTab("ledger"));
    btns.notifs?.addEventListener("click", () => showTab("notifs"));

    showTab("withdrawals"); // default
  }

  // ----- Boot -----
  initLoyaltyTabs();
  $("statusSel")?.addEventListener("change", loadList);
  $("autoRefresh")?.addEventListener("change", setAutoRefresh);
  $("loyaltyRefreshBtn")?.addEventListener("click", () => {
    refreshAll();
  });

  bindTableActions();
  setAutoRefresh();

  // ----- RefreshAll (refreshes only active tab) -----
  async function refreshAll() {
    const active = document.querySelector('.btn--active');
    if (!active) return;
    if (active.id === "tabWithdrawalsBtn") await loadList();
    if (active.id === "tabAccountsBtn") await loadAccounts();
    if (active.id === "tabLedgerBtn") await loadLedger();
    if (active.id === "tabNotifsBtn") await loadNotifications();
  }

  window.refreshAll = refreshAll;
})();
