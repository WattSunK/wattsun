// public/admin/js/orders-edit.js
// Opens edit modal, loads drivers, PATCHes, and updates the table row inline.

(function () {
  "use strict";
  if (!window.WattSunAdminData) {
    console.warn("[OrdersEdit] WattSunAdminData missing");
    return;
  }
  const Data = window.WattSunAdminData;

  const SEL = {
    table: "#ordersTable",
    tbody: "#ordersTbody",
    editBtn: ".btn-edit",
  };

  const cache = { drivers: null, dialogLoaded: false };

  async function ensureDialog() {
    if (document.getElementById("orderEditDialog")) return true;
    try {
      const res = await fetch("./partials/orders-modal.html", { cache: "no-store" });
      const html = await res.text();
      const temp = document.createElement("div");
      temp.innerHTML = html;
      const dlg = temp.querySelector("#orderEditDialog");
      if (dlg) document.body.appendChild(dlg);
      cache.dialogLoaded = true;
      return true;
    } catch (e) {
      console.error("[OrdersEdit] Failed to load orders-modal.html", e);
      return false;
    }
  }

  async function getDrivers() {
    if (cache.drivers) return cache.drivers;
    try {
      const { users } = await Data.users.get({ type: "Driver", page: 1, per: 1000 });
      cache.drivers = Array.isArray(users) ? users : [];
    } catch {
      cache.drivers = [];
    }
    return cache.drivers;
  }

  async function openEdit(orderId, currentStatus) {
    const ok = await ensureDialog();
    if (!ok) return;
    const dlg = document.getElementById("orderEditDialog");
    const statusSel = dlg.querySelector("#editStatus");
    const driverSel = dlg.querySelector("#editDriver");
    const notesEl = dlg.querySelector("#editNotes");
    const saveBtn = dlg.querySelector("#editSaveBtn");

    // Prefill
    statusSel.value = currentStatus || "Pending";
    notesEl.value = "";

    // Drivers
    driverSel.innerHTML = `<option value="">— None —</option>`;
    const drivers = await getDrivers();
    drivers.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name || `Driver ${d.id}`;
      driverSel.appendChild(opt);
    });

    // Save handler
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        const payload = {
          status: statusSel.value,
          driverId: driverSel.value ? Number(driverSel.value) : null,
          notes: notesEl.value || "",
        };
        const { success, order } = await Data.orders.patch(orderId, payload);
        if (!success) throw new Error("Save failed");

        // Update the row inline (5th cell is Status in our renderer)
        const row = document.querySelector(`tr[data-id="${orderId}"]`);
        if (row && row.children[4]) row.children[4].textContent = order.status || payload.status;

        // signal customers
        try { localStorage.setItem("wattsun:ordersUpdated", new Date().toISOString()); } catch {}

        dlg.close();
      } catch (e) {
        alert("Failed to save order changes.");
        console.error("[OrdersEdit] Save failed:", e);
      } finally {
        saveBtn.disabled = false;
      }
    };

    try { dlg.showModal(); } catch { dlg.setAttribute("open", "true"); }
  }

  // Listen for Edit clicks
  document.addEventListener("click", (e) => {
    const b = e.target.closest(SEL.editBtn);
    if (!b) return;
    const id = b.getAttribute("data-id");
    const row = b.closest("tr");
    const curStatus = row && row.children[4] ? row.children[4].textContent.trim() : "Pending";
    openEdit(id, curStatus);
  });

  // Re-init if Orders partial is reloaded
  window.addEventListener("admin:partial-loaded", (e) => {
    if (e?.detail?.name !== "orders") return;
    // no-op here; click delegation is global
  });
})();
