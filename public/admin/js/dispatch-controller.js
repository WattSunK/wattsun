// public/admin/js/dispatch-controller.js
// Safe, minimal Dispatch controller the admin shell expects.

(function () {
  const API = "/api/admin/dispatches";
  const qs  = (sel, el = document) => el.querySelector(sel);

  // prevent double-bind
  let _bound = false;
  function guardBind() {
    if (_bound) return false;
    _bound = true;
    return true;
  }

  // -------- tolerant backend envelope --------
  function normalize(data) {
    const list  = data.dispatches || data.rows || data.items || [];
    const total = (data.total != null) ? data.total
               : (data.count != null) ? data.count
               : list.length;
    const page  = (data.page != null) ? data.page : 1;
    const per   = (data.per  != null) ? data.per  : (list.length || 20);
    return { list, total, page, per };
  }

  async function fetchList(params) {
    const u = new URL(API, location.origin);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    const res = await fetch(u.toString(), { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.success === false) {
      const msg = json?.error?.message || "Load failed";
      throw new Error(msg);
    }
    return normalize(json);
  }

  // -------- state helpers --------
  function getStateFromForm() {
    const form = qs("#dispatch-filters");
    const s = { page: "1", per: "20" };
    if (!form) return s;

    const q          = form.querySelector("#f-q");
    const status     = form.querySelector("#f-status");
    const driverId   = form.querySelector("#f-driverId");
    const planned    = form.querySelector("#f-date");
    const per        = form.querySelector("#f-per");

    if (q && q.value) s.q = q.value.trim();
    if (status && status.value && status.value !== "Any") s.status = status.value;
    if (driverId && driverId.value) s.driverId = driverId.value.trim();
    if (planned && planned.value) s.planned_date = planned.value.trim();
    if (per && per.value) s.per = per.value;

    return s;
  }

  // -------- renderers --------
  function renderTable(rows) {
    const tbody = qs("#dispatch-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.className = "empty";
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "No dispatches yet.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.id ?? ""}</td>
        <td>${r.order_id ?? r.orderNumber ?? ""}</td>
        <td>${r.status ?? ""}</td>
        <td>${r.driver_id ?? r.driverId ?? r.driverName ?? ""}</td>
        <td>${r.planned_date ?? ""}</td>
        <td>${r.updated_at ?? ""}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderPager(total, page, per) {
    const totalEl = qs("#dispatch-total");
    const pageEl  = qs("#dispatch-page");
    if (totalEl) totalEl.textContent = String(total);
    if (pageEl)  pageEl.textContent  = String(page);

    const maxPage = Math.max(1, Math.ceil(total / per));
    const prevBtn = qs("#dispatch-prev");
    const nextBtn = qs("#dispatch-next");
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= maxPage;

    // Optional skin hooks (no-ops if not present)
    if (window.adminSkin?.enhancePager) {
      try { window.adminSkin.enhancePager("#dispatch-pager"); } catch {}
    }
    const bar = qs("#dispatch-filters") || qs(".dispatch-filters");
    if (bar && window.adminSkin?.enhanceFilterBar) {
      try { window.adminSkin.enhanceFilterBar(bar); } catch {}
    }
  }

  async function loadAndRender(state) {
    const { list, total, page, per } = await fetchList(state);
    renderTable(list);
    renderPager(total, page, per);
  }

  // -------- GLOBAL initializer expected by the shell --------
  async function initDispatch() {
    if (!guardBind()) return;

    // Wire filters submit
    const frm = qs("#dispatch-filters");
    if (frm) {
      frm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await loadAndRender(getStateFromForm()); } catch (err) {
          console.error("[dispatch] submit failed:", err);
        }
      });
    }

    // Wire refresh
    const btn = qs("#dispatch-refresh");
    if (btn) {
      btn.addEventListener("click", async () => {
        try { await loadAndRender(getStateFromForm()); } catch (err) {
          console.error("[dispatch] refresh failed:", err);
        }
      });
    }

    // Wire pager
    const prevBtn = qs("#dispatch-prev");
    const nextBtn = qs("#dispatch-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", async () => {
        const s = getStateFromForm();
        const page = parseInt(s.page || "1", 10);
        s.page = String(Math.max(1, page - 1));
        try { await loadAndRender(s); } catch (err) { console.error(err); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", async () => {
        const s = getStateFromForm();
        const page = parseInt(s.page || "1", 10);
        s.page = String(page + 1);
        try { await loadAndRender(s); } catch (err) { console.error(err); }
      });
    }

    // *** IMPORTANT: do an unconditional first load with only page/per ***
    // This guarantees your existing dispatch row shows immediately.
    try { await loadAndRender({ page: "1", per: "20" }); } catch (err) {
      console.error("[dispatch] initial load failed:", err);
    }
  }

  // expose globally
  window.initDispatch = initDispatch;

  // also run when shell swaps the partial or on direct load
  (function boot() {
    const RUN = () => setTimeout(() => {
      if (typeof window.initDispatch === "function") window.initDispatch();
    }, 0);

    document.addEventListener("admin:partial-loaded", (ev) => {
      const name = ev?.detail?.partial || ev?.detail?.name || ev?.detail;
      if (name === "dispatch" || name === "dispatches") RUN();
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", RUN, { once: true });
    } else {
      RUN();
    }
  })();
})();
