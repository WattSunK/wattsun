// public/admin/js/dispatch-controller.js
// Controller for the Dispatch partial (list, filters, pager, etc.)

(() => {
  const API = "/api/admin/dispatches";

  const state = {
    page: 1,
    per: 10,
    total: 0,
    q: "",
    status: "",
    dispatches: []
  };

  async function fetchDispatches() {
    const params = new URLSearchParams({
      page: state.page,
      per: state.per,
      q: state.q,
      status: state.status
    });
    const res = await fetch(`${API}?${params}`, { credentials: "include" });
    const json = await res.json();
    if (json.success) {
      state.dispatches = json.dispatches || json.rows || [];
      state.total = json.total || 0;
      render();
    } else {
      console.error("Failed to fetch dispatches", json);
    }
  }

  function render() {
    const tbody = document.querySelector("#dispatchTbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const d of state.dispatches) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.id}</td>
        <td>${d.order_id}</td>
        <td>${d.driverName || ""}</td>
        <td>${d.status}</td>
        <td>${d.planned_date || ""}</td>
        <td>${d.notes || ""}</td>
        <td>${d.created_at}</td>
      `;
      tbody.appendChild(tr);
    }

    const pager = document.querySelector("#dispatchPager");
    if (pager) {
      pager.innerHTML = `
        Page ${state.page} of ${Math.ceil(state.total / state.per) || 1}
      `;
    }
  }

  function bindEvents() {
    const search = document.querySelector("#dispatchSearch");
    if (search) {
      search.addEventListener("input", e => {
        state.q = e.target.value;
        state.page = 1;
        fetchDispatches();
      });
    }

    const status = document.querySelector("#dispatchStatus");
    if (status) {
      status.addEventListener("change", e => {
        state.status = e.target.value;
        state.page = 1;
        fetchDispatches();
      });
    }

    const pagerPrev = document.querySelector("#dispatchPagerPrev");
    const pagerNext = document.querySelector("#dispatchPagerNext");
    if (pagerPrev) {
      pagerPrev.addEventListener("click", () => {
        if (state.page > 1) {
          state.page--;
          fetchDispatches();
        }
      });
    }
    if (pagerNext) {
      pagerNext.addEventListener("click", () => {
        if (state.page * state.per < state.total) {
          state.page++;
          fetchDispatches();
        }
      });
    }
  }

  function init() {
    bindEvents();
    fetchDispatches();
  }

  // ensure global hook for admin-dispatch.js shim
  window.initDispatch = init;

  document.addEventListener("admin:partial-loaded", e => {
    if (e.detail === "dispatch") {
      init();
    }
  });
})();
