// admin/js/admin-orders.js

document.addEventListener("DOMContentLoaded", () => {
  const ordersTableBody = document.querySelector(".orders-table tbody");
  const searchBtn = document.querySelector(".orders-btn");
  const clearBtn = document.querySelector(".orders-btn-clear");
  const orderTypeFilter = document.querySelector("select.orders-input");
  const dateFrom = document.querySelectorAll("input.orders-input")[0];
  const dateTo = document.querySelectorAll("input.orders-input")[1];
  const searchBox = document.querySelector("input.search-box");

  let ordersData = [];

  async function fetchOrders() {
    try {
      const res = await fetch("/api/orders");
      ordersData = await res.json();
      renderOrders(ordersData);
    } catch (err) {
      console.error("Error fetching orders:", err);
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
    // Logic to open modal and populate data by ID
    console.log("Open edit modal for order:", id);
  }

  function openViewModal(id) {
    // Logic to open readonly view modal
    console.log("Open view modal for order:", id);
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
