// public/admin/js/admin-dispatch.js
// Step 4: UI list only (no create/assign yet).
(function () {
  const API = "/api/admin/dispatches";
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

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
    for (const k of ["q","status","driverId","planned_date","per","page"]) {
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

  async function fetchList(params) {
    const u = new URL(API, location.origin);
    Object.entries(params).forEach(([k, v]) => v && u.searchParams.set(k, v));
    const res = await fetch(u.toString(), { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Contract: { success, page, per, total, dispatches: [] }
    if (!json || json.success !== true || !Array.isArray(json.dispatches)) {
      throw new Error("Bad response");
    }
    return json;
  }

  function renderTable(rows) {
    const tbody = qs("#dispatch-tbody");
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
        <td>${r.id}</td>
        <td>${r.order_id ?? ""}</td>
        <td>${r.status ?? ""}</td>
        <td>${r.driver_id ?? ""}</td>
        <td>${r.planned_date ?? ""}</td>
        <td>${r.updated_at ?? ""}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderPager(total, page, per) {
    qs("#dispatch-total").textContent = String(total);
    qs("#dispatch-page").textContent = String(page);
    const maxPage = Math.max(1, Math.ceil(total / per));
    const prevBtn = qs("#dispatch-prev");
    const nextBtn = qs("#dispatch-next");
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= maxPage;
  }

  async function load(state) {
    const json = await fetchList(state);
    renderTable(json.dispatches);
    renderPager(json.total, json.page, json.per);
  }

  function init() {
    const root = qs("#dispatch-root");
    if (!root) return; // not on this partial

    // Seed filters from URL
    const s = stateFromURL();
    qs("#f-q").value = s.q || "";
    qs("#f-status").value = s.status || "";
    qs("#f-driverId").value = s.driverId || "";
    qs("#f-date").value = s.planned_date || "";
    qs("#f-per").value = s.per || "20";

    // Wire filters submit
    qs("#dispatch-filters").addEventListener("submit", async (e) => {
      e.preventDefault();
      const formState = getFormData(e.currentTarget);
      formState.page = "1";
      pushState(formState);
      await load(formState);
    });

    // Refresh
    qs("#dispatch-refresh").addEventListener("click", async () => {
      const now = stateFromURL();
      await load(now);
    });

    // Pager
    qs("#dispatch-prev").addEventListener("click", async () => {
      const now = stateFromURL();
      const page = Math.max(1, (parseInt(now.page || "1", 10) - 1));
      now.page = String(page);
      pushState(now);
      await load(now);
    });
    qs("#dispatch-next").addEventListener("click", async () => {
      const now = stateFromURL();
      const page = (parseInt(now.page || "1", 10) + 1);
      now.page = String(page);
      pushState(now);
      await load(now);
    });

    // Initial load
    load(s).catch(err => {
      console.error("[dispatch:list] load failed", err);
    });

    // Let dashboard know the partial is ready (matches your pattern)
    try {
      window.dispatchEvent(new CustomEvent("admin:partial-loaded", { detail: { partial: "dispatch" } }));
    } catch {}
  }

  // Init when script loads (partial is already in DOM)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
