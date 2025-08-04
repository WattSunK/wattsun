// admin/js/admin-orders.js

document.addEventListener("DOMContentLoaded", () => {
  const ordersTableBody = document.querySelector(".orders-table tbody");
  const searchBtn = document.querySelector(".orders-btn");
  const clearBtn = document.querySelector(".orders-btn-clear");
  const orderTypeFilter = document.querySelector("select.orders-input");
  const dateFrom = document.querySelectorAll("input.orders-input")[0];
  const dateTo = document.querySelectorAll("input.orders-input")[1];
  const searchBox = document.querySelector("input.search-box");
  const driverDropdown = document.getElementById("order-driver");

  let ordersData = [];

  async function fetchOrders() {
    try {
      const res = await fetch("/api/orders");
      const rawOrders = await res.json();

      // Transform raw orders into table-compatible format
      ordersData = rawOrders.map((order, index) => {
        const total = (order.cart || []).reduce((sum, item) => {
          const price = parseFloat(item.price) || 0;
          const qty = parseInt(item.quantity || 1);
          return sum + price * qty;
        }, 0);
        const hasFinancing = (order.cart || []).some(item => item.term);
        return {
          id: order.orderNumber || `AUTO-${index + 1}`,
          customerName: order.fullName || "N/A",
          orderType: hasFinancing ? "Financing" : "Outright",
          orderDateTime: order.timestamp || "",
          deliveredDateTime: null,
          deliveryAddress: (order.address || "").replace(/
/g, ", "),
          paymentType: "Deposit",
          netValue: total
        };
      });

      renderOrders(ordersData);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  }

  async function fetchDrivers() {
    try {
      const res = await fetch("/api/orders/drivers/list");
      const drivers = await res.json();
      driverDropdown.innerHTML = '<option value="">-- Select Driver --</option>';
      drivers.forEach(driver => {
        const opt = document.createElement("option");
        opt.value = driver.name;
        opt.textContent = driver.name;
        driverDropdown.appendChild(opt);
      });
    } catch (err) {
      console.error("Error fetching drivers:", err);
    }
  }

  function renderOrders(data) {
    ordersTableBody.innerHTML = "";
    data.forEach((order, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="#" class="order-link" data-id="${order.id}">${order.id}</a></td>
        <td>${order.customerName}</td>
        <td>${order.orderType}</td>
        <td>${order.orderDateTime}</td>
        <td>${order.deliveredDateTime || "-"}</td>
        <td>${order.deliveryAddress}</td>
        <td>${order.paymentType}</td>
        <td>KSh ${Number(order.netValue).toFixed(2)}</td>
        <td>
          <button class="orders-action-btn view" data-id="${order.id}" title="View">👁️</button>
          <button class="orders-action-btn edit" data-id="${order.id}" title="Edit">✏️</button>
          <button class="orders-action-btn delete" data-id="${order.id}" title="Delete">🗑️</button>
        </td>`;
      ordersTableBody.appendChild(row);
    });
  }

  function filterOrders() {
    const type = orderTypeFilter.value;
    const from = new Date(dateFrom.value);
    const to = new Date(dateTo.value);
    const keyword = searchBox.value.toLowerCase();

    const filtered = ordersData.filter(order => {
      const orderDate = new Date(order.orderDateTime);
      return (
        (type === "Select Order Type" || order.orderType === type) &&
        (!dateFrom.value || orderDate >= from) &&
        (!dateTo.value || orderDate <= to) &&
        (!keyword || order.customerName.toLowerCase().includes(keyword) || order.id.includes(keyword))
      );
    });
    renderOrders(filtered);
  }

  function clearFilters() {
    orderTypeFilter.selectedIndex = 0;
    dateFrom.value = "";
    dateTo.value = "";
    searchBox.value = "";
    renderOrders(ordersData);
  }

  async function deleteOrder(id) {
    if (!confirm("Are you sure you want to delete this order?")) return;
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (res.ok) {
        ordersData = ordersData.filter(o => o.id !== id);
        renderOrders(ordersData);
      } else {
        alert("Failed to delete order.");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  }

  function openEditModal(id) {
    console.log("Open edit modal for order:", id);
    fetchDrivers();
    document.getElementById("orderModal").style.display = "block";
  }

  function openViewModal(id) {
    console.log("Open view modal for order:", id);
    document.getElementById("orderModal").style.display = "block";
  }

  // Event Bindings
  ordersTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("delete")) deleteOrder(id);
    if (btn.classList.contains("edit")) openEditModal(id);
    if (btn.classList.contains("view")) openViewModal(id);
  });

  searchBtn.addEventListener("click", filterOrders);
  clearBtn.addEventListener("click", clearFilters);

  fetchOrders();
});
