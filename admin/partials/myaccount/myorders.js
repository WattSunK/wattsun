// public/myaccount/myorders.js

document.addEventListener("DOMContentLoaded", () => {
  const ordersList = document.getElementById("orders-list");
  const orderTemplate = document.getElementById("order-card-template");
  const btnActive = document.getElementById("btn-active");
  const btnPast = document.getElementById("btn-past");

  let orders = [];

  async function fetchMyOrders() {
    try {
      const res = await fetch("/api/myorders");
      orders = await res.json();
      showActiveOrders();
    } catch (err) {
      console.error("Error loading orders:", err);
    }
  }

  function renderOrders(filtered) {
    ordersList.innerHTML = "";
    filtered.forEach(order => {
      const clone = orderTemplate.content.cloneNode(true);
      clone.querySelector(".order-date-value").textContent = order.orderDateTime;
      clone.querySelector(".order-status").textContent = order.status || "Pending";
      clone.querySelector(".order-title").textContent = order.storeName || "WattSun";
      clone.querySelector(".order-amount").textContent = `KSh ${Number(order.netValue).toFixed(2)}`;
      clone.querySelector(".order-id").textContent = `Order ID: ${order.id}`;
      clone.querySelector(".order-item-count").textContent = order.items?.length || 0;
      ordersList.appendChild(clone);
    });
  }

  function showActiveOrders() {
    const active = orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled");
    renderOrders(active);
    btnActive.classList.add("active");
    btnPast.classList.remove("active");
  }

  function showPastOrders() {
    const past = orders.filter(o => o.status === "Delivered" || o.status === "Cancelled");
    renderOrders(past);
    btnPast.classList.add("active");
    btnActive.classList.remove("active");
  }

  btnActive.addEventListener("click", showActiveOrders);
  btnPast.addEventListener("click", showPastOrders);

  fetchMyOrders();
});
