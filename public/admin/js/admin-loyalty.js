// public/admin/js/admin-loyalty.js
(() => {
  // ---------- tiny utils ----------
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n === 0 || n ? Number(n).toLocaleString() : "—");

  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok || data.success === false) {
      throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    }
    return data;
  };

  const pill = (status) => {
    const s = String(status || "").toLowerCase();
    const cls =
      s === "approved" ? "pill pill--ok" :
      s === "rejected" ? "pill pill--warn" :
      s === "paid"     ? "pill pill--ok" :
                         "pill";
    return `<span class="${cls}">${status || "—"}</span>`;
  };

  // ---------- state ----------
  let activeTab = "withdrawals";

  // ---------- meta updater ----------
  function updateMeta(count) {
    const meta = $("loyaltyMeta");
    if (meta) meta.textContent = `${count} results`;
  }

  // ---------- loaders ----------
  async function loadAccounts() {
    const body = $("loyaltyAccountsBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="11" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/accounts");
      const rows = data.accounts || [];
      updateMeta(rows.length);
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
    const body = $("loyaltyLedgerBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/ledger");
      const rows = data.ledger || [];
      updateMeta(rows.length);
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
    const body = $("loyaltyNotificationsBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;
    try {
      const data = await api("/api/admin/loyalty/notifications");
      const rows = data.notifications || [];
      updateMeta(rows.length);
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

  async function loadWithdrawals() {
    const body = $("wdBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="9" class="muted">Loading…</td></tr>`;
    const status = $("statusSel")?.value || "";
    const search = $("loyaltySearch")?.value?.trim() || "";
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (search) q.set("q", search);
    try {
      const data = await api(`/api/admin/loyalty/withdrawals${q.toString() ? "?" + q.toString() : ""}`);
      const rows = data.withdrawals || data.items || [];
      updateMeta(rows.length);
      body.innerHTML = "";
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="9" class="muted">(No data yet)</td></tr>`;
        return;
      }
      for (const w of rows) {
        const id = w.id ?? w.withdrawal_id ?? "";
        const user = w.user_email || w.email || w.user_id || "—";
        const pts = w.requested_pts ?? w.points ?? "—";
        const eur = w.requested_eur ?? w.eur ?? null;
        const st = w.status || "Pending";
        const requested = w.requested_at || w.created_at || "";
        const decided = w.decided_at || "";
        const paid = w.paid_at || "";

        const canApprove = st === "Pending";
        const canReject = st === "Pending";
        const canPaid = st === "Approved";

        const actions = [
          canApprove ? `<button class="btn btn--small" data-act="approve" data-id="${id}">Approve</button>` : "",
          canReject  ? `<button class="btn btn--small" data-act="reject" data-id="${id}">Reject</button>`  : "",
          canPaid    ? `<button class="btn btn--small" data-act="paid" data-id="${id}">Mark Paid</button>` : ""
        ].filter(Boolean).join(" ");

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${id}</td>
          <td>${user}</td>
          <td>${fmt(pts)}</td>
          <td>€${fmt(eur)}</td>
          <td>${pill(st)}</td>
          <td>${requested || "—"}</td>
          <td>${decided || "—"}</td>
          <td>${paid || "—"}</td>
          <td style="text-align:center;">${actions || "—"}</td>
        `;
        body.appendChild(tr);
      }
    } catch (e) {
      body.innerHTML = `<tr><td colspan="9" class="muted">Error: ${e.message}</td></tr>`;
    }
  }

  // ---------- actions ----------
  async function doAct(act, id) {
    let path = "";
    let method = "POST";
    let body = { id };
    if (act === "approve") {
      path = `/api/admin/loyalty/withdrawals/${id}/approve`;
    } else if (act === "reject") {
      path = `/api/admin/loyalty/withdrawals/${id}/reject`;
    } else if (act === "paid") {
      path = `/api/admin/loyalty/withdrawals/${id}/paid`;
    } else return;

    try {
      await api(path, { method, body });
      await loadWithdrawals();
    } catch (e) {
      const bodyEl = $("wdBody");
      if (bodyEl) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="9" class="muted">Action failed: ${e.message}</td>`;
        bodyEl.insertBefore(tr, bodyEl.firstChild);
      } else {
        alert(`Action failed: ${e.message}`);
      }
    }
  }

  function bindTableActions() {
    const body = $("wdBody");
    if (!body) return;
    body.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute("data-act");
      const id = t.getAttribute("data-id");
      if (!act || !id) return;
      doAct(act, id);
    });
  }

  // ---------- refresh ----------
  function refreshActiveTab() {
    if (activeTab === "withdrawals") return loadWithdrawals();
    if (activeTab === "accounts") return loadAccounts();
    if (activeTab === "ledger") return loadLedger();
    if (activeTab === "notifs") return loadNotifications();
  }

  // ---------- tab toggler ----------
  function initLoyaltyTabs() {
    const tabs = {
      withdrawals: { btn: $("tabWithdrawalsBtn"), panel: $("loyaltyTabWithdrawals"), load: loadWithdrawals },
      accounts:    { btn: $("tabAccountsBtn"),    panel: $("loyaltyTabAccounts"),    load: loadAccounts },
      ledger:      { btn: $("tabLedgerBtn"),      panel: $("loyaltyTabLedger"),      load: loadLedger },
      notifs:      { btn: $("tabNotifsBtn"),      panel: $("loyaltyTabNotifs"),      load: loadNotifications }
    };

    function showTab(which) {
      activeTab = which;
      Object.entries(tabs).forEach(([key, { btn, panel }]) => {
        if (panel) panel.style.display = key === which ? "block" : "none";
        if (btn) btn.classList.toggle("btn--active", key === which);
      });
      tabs[which]?.load();
    }

    Object.entries(tabs).forEach(([key, { btn }]) => {
      btn?.addEventListener("click", () => showTab(key));
    });

    showTab("withdrawals"); // default
  }

  // ---------- boot ----------
  initLoyaltyTabs();
  $("statusSel")?.addEventListener("change", refreshActiveTab);
  $("loyaltySearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      refreshActiveTab();
    }
  });
  $("loyaltyClearBtn")?.addEventListener("click", () => {
    const search = $("loyaltySearch");
    if (search) search.value = "";
    $("statusSel").value = "";
    refreshActiveTab();
  });
  $("loyaltyRefreshBtn")?.addEventListener("click", refreshActiveTab);
  bindTableActions();

  // ---------- pager (stubbed) ----------
  $("loyaltyPager")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-page]");
    if (!btn) return;
    const page = btn.getAttribute("data-page");
    console.log(`[loyalty] pager clicked: ${page} (not yet wired)`);
    refreshActiveTab();
  });

})();
