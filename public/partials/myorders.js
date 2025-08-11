function initMyOrders() {
  const user = getCurrentUser();
  if (!user?.phone) {
    alert("Please login first.");
    window.location.href = "/index.html";
    return;
  }

  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: user.phone })
  })
  .then(res => res.json())
  .then(orders => {
    const tbody = document.querySelector(".orders-table tbody");
    tbody.innerHTML = "";

    if (!orders.length) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="9" style="text-align:center;">No orders found.</td>`;
      tbody.appendChild(row);
      return;
    }

    orders.forEach((order, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="#" class="order-link">${order.id}</a></td>
        <td>${order.type || ""}</td>
        <td>${order.orderDate || ""}</td>
        <td>${order.deliveryDate || ""}</td>
        <td>${order.address || ""}</td>
        <td>${order.paymentMethod || ""}</td>
        <td>KSh ${order.totalAmount || "0.00"}</td>
        <td><strong>${order.status || "Pending"}</strong></td>
      `;
      tbody.appendChild(row);
    });
  });
}

window.initMyOrders = initMyOrders;