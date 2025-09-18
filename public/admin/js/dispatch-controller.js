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
        <td>${r.driverName ?? (r.driver_id != null ? r.driver_id : "Unassigned")}</td>
        <td>${r.planned_date ?? "—"}</td>
        <td>${r.updated_at ?? ""}</td>
      
    <td class="actions">
      <button class="btn" data-action="edit" data-id="${r.id}">Edit</button>
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

// ---------- Create modal helpers ----------
function openDialog(dlg) {
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  else if (dlg) dlg.setAttribute("open", "");
}
function closeDialog(dlg) {
  if (dlg && typeof dlg.close === "function") dlg.close();
  else if (dlg) dlg.removeAttribute("open");
}
function setBusy(btn, yes) {
  if (!btn) return;
  btn.disabled = !!yes;
  btn.classList.toggle("is-busy", !!yes);
}
function showCreateError(msg) {
  const el = document.getElementById("dc-error");
  if (!el) return;
  el.textContent = msg || "An error occurred.";
  el.style.display = "";
}
function hideCreateError() {
  const el = document.getElementById("dc-error");
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}
function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}
function clearCreateForm() {
  ["dc-order-id","dc-driver-id","dc-planned-date","dc-notes"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") el.selectedIndex = 0;
    else el.value = "";
  });
  hideCreateError();
}
function collectCreatePayload() {
  const order_id      = _val("dc-order-id");
  const driver_id_raw = _val("dc-driver-id");
  const planned_date  = _val("dc-planned-date");
  const notes         = _val("dc-notes");

  const payload = { order_id, notes: notes || undefined };
  if (driver_id_raw) {
    const n = Number(driver_id_raw);
    if (Number.isFinite(n)) payload.driver_id = n;
  }
  if (planned_date) payload.planned_date = planned_date;
  return payload;
}
async function populateDriversForCreate() {
  const sel = document.getElementById("dc-driver-id");
  if (!sel) return;
  // keep placeholder, clear the rest
  for (let i = sel.options.length - 1; i >= 1; i--) sel.remove(i);

  try {
    let res = await fetch("/api/admin/users?type=Driver", { credentials: "include" });
    let data = [];
    if (res.ok) {
      data = await res.json();
    } else if (res.status === 404) {
      const all = await fetch("/api/admin/users", { credentials: "include" });
      data = all.ok ? await all.json() : [];
      data = Array.isArray(data) ? data.filter(u => (u.type || u.role || "").toLowerCase() === "driver") : [];
    }
    if (Array.isArray(data)) {
      for (const u of data) {
        const opt = document.createElement("option");
        opt.value = String(u.id ?? "");
        opt.textContent = u.name ? `${u.name} (ID ${u.id})` : `Driver #${u.id}`;
        sel.appendChild(opt);
      }
    }
  } catch {
    // silent; user can still create unassigned
  }
}
async function handleCreateError(res) {
  let msg = `Error ${res.status}`;
  try {
    const j = await res.json();
    if (j?.error) msg = j.error.message || j.error;
    else if (j?.message) msg = j.message;
  } catch { /* ignore */ }

  switch (res.status) {
    case 400: showCreateError(msg || "Bad request. Check the fields and try again."); break;
    case 401:
    case 403: showCreateError(msg || "Not authorized."); break;
    case 404: showCreateError(msg || "Order not found."); break;
    case 409: showCreateError(msg || "Duplicate dispatch for this order already exists."); break;
    default:  showCreateError(msg || "Unexpected error.");
  }
}

// --- fetch + paint ---
async function loadAndRender(state) {
  // defaults + sanitize
  const s = Object.assign({ page: "1", per: "20" }, state || {});
  // coerce to integers for backend
  const params = {
    q: s.q,
    status: s.status,
    driverId: s.driverId,
    planned_date: s.planned_date,
    page: parseInt(s.page || "1", 10),
    per:  parseInt(s.per  || "20", 10),
  };

  const { list, total, page, per } = await fetchList(params);
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

// ---- Create Dispatch (modal) wiring ----
if (!window.__dispatchCreateWired) {
  const btnCreate  = $("#btnCreateDispatch");
  const dlg        = document.getElementById("dispatchCreateModal");
  const form       = document.getElementById("dispatchCreateForm");
  const btnCancel  = document.getElementById("dc-cancel");
  const btnSubmit  = document.getElementById("dc-submit");
  const err        = document.getElementById("dc-error");

  if (btnCreate && dlg && form && btnCancel && btnSubmit && err) {
    btnCreate.addEventListener("click", async () => {
      clearCreateForm();
      await populateDriversForCreate();
      openDialog(dlg);
    });

    btnCancel.addEventListener("click", () => closeDialog(dlg));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideCreateError();

      const payload = collectCreatePayload();
      if (!payload.order_id || String(payload.order_id).trim().length < 8) {
        showCreateError("Please enter a valid Order ID.");
        return;
      }

      try {
        setBusy(btnSubmit, true);
        const res = await fetch("/api/admin/dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          await handleCreateError(res);
          return;
        }

        closeDialog(dlg);
        // refresh the table (align with your existing event name)
        document.dispatchEvent(new CustomEvent("admin:dispatch:refresh"));
      } catch {
        showCreateError("Network error. Please try again.");
      } finally {
        setBusy(btnSubmit, false);
      }
    });

    window.__dispatchCreateWired = true;
  }
}

    // Initial, filter-free load so your existing row shows
    try { await loadAndRender({ page: "1", per: "20" }); } catch (err) {
      console.error("[dispatch] initial load failed:", err);
    }
  }

  // expose globally (so shell / shim can call it)
  window.initDispatch = initDispatch;

  // Refresh when the modal says it updated something
document.addEventListener('admin:dispatch:refresh', async () => {
  try { await loadAndRender(getStateFromForm()); }
  catch (err) { console.error('[dispatch] refresh event failed:', err); }
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
