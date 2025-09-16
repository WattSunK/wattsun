// public/admin/js/admin-users.js
// Controller for Admin → Users list

(function () {
  let State = {
    root: null,
    tbody: null,
    pager: null,
    attached: false,
  };

  function findRoot() {
    return document.querySelector("#users-root");
  }

  function findControls(root) {
    return {
      tbody: root.querySelector("tbody"),
      pager: root.querySelector(".pager"),
      search: root.querySelector("#usersSearch"),
      status: root.querySelector("#usersStatus"),
      per: root.querySelector("#usersPer"),
    };
  }

  async function load() {
    if (!State.tbody) return;
    State.tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;
    try {
      const res = await fetch("/api/admin/users");
      const j = await res.json();
      if (!j.success) throw new Error(j.error?.message || "API error");
      render(j.users || []);
    } catch (err) {
      State.tbody.innerHTML = `<tr><td colspan="5">Error loading users</td></tr>`;
      console.error("[users] load failed", err);
    }
  }

  function render(users) {
    if (!State.tbody) return;
    if (!users.length) {
      State.tbody.innerHTML = `<tr><td colspan="5">(no users)</td></tr>`;
      return;
    }
    State.tbody.innerHTML = users
      .map(
        (u) => `
        <tr>
          <td>${u.id}</td>
          <td>${u.name || "-"}</td>
          <td>${u.email || "-"}</td>
          <td>${u.phone || "-"}</td>
          <td>${u.type || "-"}</td>
        </tr>`
      )
      .join("");
  }

  function wire() {
    // Add listeners here if needed (search/filter)
  }

  function init() {
    const root = findRoot();
    if (!root) return;
    const c = findControls(root);
    State = { root, ...c, attached: true };
    wire();
    load();
  }

  // ---- Activation ----
  document.addEventListener("admin:partial-loaded", (e) => {
    const name =
      (e && e.detail && (e.detail.name || e.detail))?.toString().toLowerCase() ||
      "";
    if (name === "users") {
      // reset so we can reattach after every partial swap
      State.attached = false;
      init();
    }
  });

  // Also run on first page load if Users is visible
  if (location.hash === "#users") {
    window.addEventListener("DOMContentLoaded", init);
  }

  // Expose for debug
  window.UsersController = { reload: load };
})();
