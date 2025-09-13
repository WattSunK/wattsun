// public/admin/js/dispatch-controller.js
// Dispatch list controller — safe drop-in.

(function () {
  const API = "/api/admin/dispatches";
  const $  = (sel, el = document) => el.querySelector(sel);

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

  function getStateFromForm() {
    const form = $("#dispatch-filters");
    const s = { page: "1", per: "20" };
    if (!form) return s;

    const q        = form.querySelector("#f-q");
    const status   = form.querySelector("#f-status");
    const driverId = form.querySelector("#f-driverId");
    const planned  = form.querySelector("#f-date");
    const per      = form.querySelector("#f-per");

    if (q && q.value) s.q = q.value.trim();
    if (status && status.value && status.value !== "Any") s.status = status.value;
    if (driverId && driverId.value) s.driverId = driverId.value.trim();
    if (planned && planned.value) s.planned_date = planned.value.trim();
    if (per && per.value) s.per = per.value;
    return s;
  }

  // --- UPDATED: add Actions buttons + colspan=7 when empty
  function renderTable(rows) {
    const tbody = $("#dispatch-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.className = "empty";
      const td = document.createElement("td");
      td.colSpan = 7; // includes the Actions column
      td.textContent = "No dispatches yet.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-id", r.id);

      tr.innerHTML = `
        <td>${r.id ?? ""}</td>
        <td>${r.order_id ?? r.orderNumber ?? ""}</td>
        <td>${r.status ?? ""}</td>
        <td>${r.driver_id ?? r.driverId ?? r.driverName ?? ""}</td>
        <td>${r.planned_date ?? ""}</td>
        <td>${r.updated_at ?? ""}</td>
        <td class="actions">
          <button class="btn" data-action="assign"   data-id="${r.id}">Assign</button>
          <button class="btn" data-action="unassign" data-id="${r.id}">Unassign</button>
          <button class="btn" data-action="planned"  data-id="${r.id}">Set Planned Date</button>
          <button class="btn" data-action="status"   data-id="${r.id}">Update Status</button>
          <button class="btn" data-action="note"     data-id="${r.id}">Add Note</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderPager(total, page, per) {
    const totalEl = $("#dispatch-total");
    const pageEl  = $("#dispatch-page");
    if (totalEl) totalEl.textContent = String(total);
    if (pageEl)  pageEl.textContent  = String(page);

    const maxPage = Math.max(1, Math.ceil(total / per));
    const prevBtn = $("#dispatch-prev");
    const nextBtn = $("#dispatch-next");
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= maxPage;

    // 3-line addition: let skin style the filter row; also add a safe hint class
    const bar = $("#dispatch-filters") || document.querySelector(".dispatch-filters");
    if (bar && window.adminSkin?.enhanceFilterBar) { try { window.adminSkin.enhanceFilterBar(bar); } catch {} }
    if (bar) bar.classList.add("is-ready");
  }

  async function loadAndRender(state) {
    const { list, total, page, per } = await fetchList(state);
    renderTable(list);
    renderPager(total, page, per);
  }

  // -------- GLOBAL initializer expected by shell --------
  async function initDispatch() {
    const frm = $("#dispatch-filters");
    if (frm) {
      frm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await loadAndRender(getStateFromForm()); } catch (err) {
          console.error("[dispatch] submit failed:", err);
        }
      });
    }

    const btn = $("#dispatch-refresh");
    if (btn) btn.addEventListener("click", async () => {
      try { await loadAndRender(getStateFromForm()); } catch (err) {
        console.error("[dispatch] refresh failed:", err);
      }
    });

    const prevBtn = $("#dispatch-prev");
    const nextBtn = $("#dispatch-next");
    if (prevBtn) prevBtn.addEventListener("click", async () => {
      const s = getStateFromForm();
      s.page = String(Math.max(1, parseInt(s.page || "1", 10) - 1));
      try { await loadAndRender(s); } catch (err) { console.error(err); }
    });
    if (nextBtn) nextBtn.addEventListener("click", async () => {
      const s = getStateFromForm();
      s.page = String(parseInt(s.page || "1", 10) + 1);
      try { await loadAndRender(s); } catch (err) { console.error(err); }
    });

    // Initial, filter-free load so your existing row shows
    try { await loadAndRender({ page: "1", per: "20" }); } catch (err) {
      console.error("[dispatch] initial load failed:", err);
    }
  }

  // expose globally (so shell / shim can call it)
  window.initDispatch = initDispatch;

  // When actions PATCH succeed, they emit this event; reload the list.
  document.addEventListener("admin:dispatch:refresh", () => {
    try { loadAndRender(getStateFromForm()); } catch (err) { console.error(err); }
  });

  // boot on both DOM ready and partial swap
  (function boot() {
    const RUN = () => setTimeout(() => { window.initDispatch?.(); }, 0);
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
