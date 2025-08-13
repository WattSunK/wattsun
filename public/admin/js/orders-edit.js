// public/admin/js/orders-edit.js
// Phase 6.5 — polish: driver live filter, status guard, emit reflection signals

(() => {
  // ---- Constants ----
  const ALLOWED_STATUSES = [
    "Pending",
    "Confirmed",
    "Dispatched",
    "Delivered",
    "Closed",
    "Cancelled",
  ]; // from ADR-001. 

  // ---- State (scoped to the Edit Drawer/Modal) ----
  const EditState = {
    orderId: null,
    currentStatus: null,
    selectedDriver: null, // { id, name, email, phone } or null
    driversCache: [],     // last results
    debounceTimer: null,
  };

  // ---- Elements ----
  const el = {
    drawer: document.getElementById("editOrderDrawer") || document.getElementById("editOrderModal"),
    form: document.getElementById("editOrderForm"),
    status: document.getElementById("editStatus"),
    driverInput: document.getElementById("editDriverInput"),    // <input type="text">
    driverList: document.getElementById("editDriverList"),      // <ul> or <div> suggestions
    notes: document.getElementById("editNotes"),
    saveBtn: document.getElementById("editSaveBtn"),
    closeBtns: document.querySelectorAll("[data-edit-close]"),
  };

  // Guard if edit UI isn’t present on this page
  if (!el.form || !el.status || !el.saveBtn) return;

  // Ensure status options are normalized to ALLOWED_STATUSES
  function ensureStatusOptions() {
    const existing = new Set([...el.status.options].map(o => o.value));
    let changed = false;
    // Add missing
    ALLOWED_STATUSES.forEach(s => {
      if (!existing.has(s)) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        el.status.appendChild(opt);
        changed = true;
      }
    });
    // Remove unknowns (keep current if unknown to avoid blocking legacy)
    [...el.status.options].forEach(o => {
      if (!ALLOWED_STATUSES.includes(o.value)) {
        // If the current selected value is invalid, we’ll warn user instead of removing silently
        if (o.selected) return;
        o.remove();
        changed = true;
      }
    });
    return changed;
  }
  ensureStatusOptions();

  function showDriverSuggestions(list) {
    if (!el.driverList) return;
    el.driverList.innerHTML = "";
    if (!list || !list.length) {
      const li = document.createElement("div");
      li.className = "muted";
      li.textContent = "No drivers found";
      el.driverList.appendChild(li);
      return;
    }
    list.forEach(u => {
      const li = document.createElement("div");
      li.className = "driver-suggestion";
      li.setAttribute("data-driver-id", u.id);
      li.setAttribute("tabindex", "0");
      li.textContent = `${u.name || u.fullName || "Driver"} • ${u.phone || ""}`.trim();
      li.addEventListener("click", () => {
        EditState.selectedDriver = { id: u.id, name: u.name || u.fullName || "Driver", phone: u.phone || "" };
        el.driverInput.value = `${EditState.selectedDriver.name} (${EditState.selectedDriver.phone})`;
        // collapse list
        if (el.driverList) el.driverList.innerHTML = "";
      });
      el.driverList.appendChild(li);
    });
  }

  async function fetchDrivers(q) {
    const url = new URL("/api/admin/users", location.origin);
    url.searchParams.set("type", "Driver"); // API contract. 
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url.toString(), { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    // Accept either {success:true, users:[...]} or a list directly (defensive)
    const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
    EditState.driversCache = users.map(u => ({
      id: u.id || u.userId || u._id,
      name: u.name || u.fullName || u.email || "Driver",
      phone: u.phone || "",
      email: u.email || "",
      type: u.type || u.role || "",
    })).filter(u => u.id);
    showDriverSuggestions(EditState.driversCache);
  }

  // Debounced live filter
  function debouncedFetch() {
    clearTimeout(EditState.debounceTimer);
    EditState.debounceTimer = setTimeout(() => {
      const q = (el.driverInput.value || "").trim();
      fetchDrivers(q).catch(() => showDriverSuggestions([]));
    }, 180);
  }

  el.driverInput?.addEventListener("input", () => {
    EditState.selectedDriver = null; // typing invalidates previous pick
    debouncedFetch();
  });
  el.driverInput?.addEventListener("focus", () => {
    // On focus, if empty, fetch baseline list; else refilter
    const q = (el.driverInput.value || "").trim();
    fetchDrivers(q).catch(() => showDriverSuggestions([]));
  });

  // Exposed entry point: populate the edit drawer with an order row’s data
  window.openEditOrder = function openEditOrder(order) {
    // order: normalized shape from controller with .id, .status, .driverName, .driverId, .notes
    EditState.orderId = order.id || order.orderNumber || null;
    EditState.currentStatus = order.status || "Pending";
    EditState.selectedDriver = order.driverId ? { id: order.driverId, name: order.driverName || "Driver" } : null;

    ensureStatusOptions();
    // Set current values
    if (el.status) {
      // If current status not allowed, keep value but show a warning
      if (!ALLOWED_STATUSES.includes(EditState.currentStatus)) {
        // append a temporary option so it remains visible, but block save later
        let opt = [...el.status.options].find(o => o.value === EditState.currentStatus);
        if (!opt) {
          opt = document.createElement("option");
          opt.value = EditState.currentStatus;
          opt.textContent = `${EditState.currentStatus} (invalid)`;
          el.status.appendChild(opt);
        }
      }
      el.status.value = EditState.currentStatus;
    }
    if (el.notes) el.notes.value = order.notes || "";

    if (el.driverInput) {
      if (EditState.selectedDriver) {
        el.driverInput.value = order.driverName ? `${order.driverName} (${order.driverPhone || ""})` : `Driver #${order.driverId}`;
      } else {
        el.driverInput.value = "";
      }
    }
    if (el.driverList) el.driverList.innerHTML = "";

    // show drawer/modal (CSS hook)
    el.drawer?.classList.add("open");
  };

  // Save handler
  el.form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!EditState.orderId) return;

    const nextStatus = el.status.value;
    const notes = (el.notes?.value || "").trim();
    const driverId = EditState.selectedDriver?.id || null;

    // Block invalid status transitions client-side
    if (!ALLOWED_STATUSES.includes(nextStatus)) {
      alert(`Status "${nextStatus}" is not allowed. Allowed: ${ALLOWED_STATUSES.join(", ")}`);
      return;
    }

    el.saveBtn.disabled = true;
    try {
      // Unify single PATCH surface (controller adapts if server also supports PUT subpaths). 
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(EditState.orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: nextStatus, driverId, notes }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out?.success === false) {
        throw new Error(out?.error?.message || out?.message || `Save failed (${res.status})`);
      }

      // Update inline row in the table (delegate to controller if exposed)
      if (window.AdminOrders && typeof window.AdminOrders.updateRowInline === "function") {
        window.AdminOrders.updateRowInline(EditState.orderId, {
          status: nextStatus,
          driverId,
          driverName: EditState.selectedDriver?.name || null,
          notes,
        });
      }

      // Step 6.4 customer reflection signals (already agreed in 6.4) 
      try {
        localStorage.setItem("ordersUpdatedAt", String(Date.now()));
        window.postMessage({ type: "orders-updated" }, "*");
      } catch {}

      // close drawer
      el.drawer?.classList.remove("open");
    } catch (e) {
      alert(e.message || "Failed to save changes");
    } finally {
      el.saveBtn.disabled = false;
    }
  });

  // Close buttons
  el.closeBtns.forEach(btn => btn.addEventListener("click", () => {
    el.drawer?.classList.remove("open");
  }));
})();
