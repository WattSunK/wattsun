// public/admin/js/admin-dispatch.js
// Step 5: List + stable init + tolerant parsing (no CSS changes here).
(function () {
  const API = "/api/admin/dispatches";
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // --- idempotent init guard -------------------------------------------------
  let __dispatchBound = false;
  function guardBind() {
    if (__dispatchBound) return false;
    __dispatchBound = true;
    return true;
  }

  // --- small utils -----------------------------------------------------------
  function getFormData(form) {
    const data = new FormData(form);
    const obj = {};
    for (const [k, v] of data.entries()) {
      if (v !== "") obj[k] = v;
    }
    return obj;
  }

  function stateFromURL() {
    const u = new URL(location.href);
    const s = {};
    for (const k of ["q", "status", "driverId", "planned_date", "per", "page"]) {
      const v = u.searchParams.get(k);
      if (v) s[k] = v;
    }
    if (!s.per) s.per = "20";
    if (!s.page) s.page = "1";
    return s;
  }

  function pushState(s) {
    const u = new URL(location.href);
    ["q","status","driverId","planned_date","per","page"].forEach(k => {
      if (s[k]) u.searchParams.set(k, s[k]); else u.searchParams.delete(k);
    });
    history.replaceState(null, "", u.toString());
  }

  // --- tolerant backend envelope --------------------------------------------
  function normalizeDispatchResponse(data) {
    // list can be in dispatches|rows|items
    const list = data.dispatches || data.rows || data.items || [];
    // totals can be in total|count
    const total = (data.total != null) ? data.total
                 : (data.count != null) ? data.count
                 : list.length;
    const page  = (data.page != null) ? data.page : 1;
    const per   = (data.per  != null) ? data.per  : (list.length || 20);
    return { list, total, page, per, raw: data };
  }

  async function fetchList(params) {
    const u = new URL(API, location.origin);
    Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
    const res = await fetch(u.toString(), { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.success === false) {
      const msg = json && json.error && json.error.message ? json.error.message : "Bad response";
      throw new Error(msg);
    }
    return normalizeDispatchResponse(json);
  }

  // --- renderers -------------------------------------------------------------
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
  }

  async function load(state) {
    const { list, total, page, per } = await fetchList(state);

    // mark filters as "ready" so admin.css can apply its row styling (no CSS here)
    const bar =
      qs('[data-dispatch-filters]') ||
      qs("#dispatch-filters") ||
      qs(".dispatch-filters");
    if (bar) {
      bar.classList.add("is-ready"); // harmless if CSS doesn't use it
    }

    renderTable(list);
    renderPager(total, page, per);
  }

  // --- controller init -------------------------------------------------------
  async function init() {
    // avoid double-binding if called twice (e.g., direct load + event)
    if (!guardBind()) return;

    const root = qs("#dispatch-root");
    if (!root) {
      __dispatchBound = false; // allow future bind when partial appears
      return;
    }

    // Seed filters from URL
    const s = stateFromURL();
    const fq = qs("#f-q");
    const fs = qs("#f-status");
    const fd = qs("#f-driverId");
    const fp = qs("#f-date");
    const fper = qs("#f-per");

    if (fq)   fq.value   = s.q || "";
    if (fs)   fs.value   = s.status || "";
    if (fd)   fd.value   = s.driverId || "";
    if (fp)   fp.value   = s.planned_date || "";
    if (fper) fper.value = s.per || "20";

    // Filters submit
    const filterForm = qs("#dispatch-filters");
    if (filterForm) {
      filterForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formState = getFormData(e.currentTarget);
        formState.page = "1";
        pushState(formState);
        try { await load(formState); } catch (err) {
          console.error("[dispatch:list] submit load failed", err);
        }
      });
    }

    // Refresh button
    const refreshBtn = qs("#dispatch-refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        const now = stateFromURL();
        try { await load(now); } catch (err) {
          console.error("[dispatch:list] refresh failed", err);
        }
      });
    }

    // Pager buttons
    const prevBtn = qs("#dispatch-prev");
    const nextBtn = qs("#dispatch-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", async () => {
        const now = stateFromURL();
        const page = Math.max(1, (parseInt(now.page || "1", 10) - 1));
        now.page = String(page);
        pushState(now);
        try { await load(now); } catch (err) {
          console.error("[dispatch:list] prev failed", err);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", async () => {
        const now = stateFromURL();
        const page = (parseInt(now.page || "1", 10) + 1);
        now.page = String(page);
        pushState(now);
        try { await load(now); } catch (err) {
          console.error("[dispatch:list] next failed", err);
        }
      });
    }

    // Initial load
    try { await load(s); } catch (err) {
      console.error("[dispatch:list] initial load failed", err);
    }
  }

  // --- boot hooks: run on DOM ready AND when the dispatch partial is swapped in
  (function bootDispatch() {
    const RUN = () => {
      // slight defer to ensure the partial DOM is present
      setTimeout(() => init(), 0);
    };

    // Partial loader event (SPA-style)
    document.addEventListener("admin:partial-loaded", (ev) => {
      const detail = ev.detail || {};
      const name = detail.partial || detail.name || detail;
      // accept "dispatch" or "dispatches"
      if (name === "dispatch" || name === "dispatches") RUN();
    });

    // Direct load (partial already in the DOM)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", RUN, { once: true });
    } else {
      RUN();
    }
  })();
})();
