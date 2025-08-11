// File: admin/js/admin-orders.js

let ordersData = [];

function initAdminOrders() {
  fetch('/api/orders')
    .then((res) => res.json())
    .then((data) => {
      ordersData = data;
      renderOrdersTable();
    });

  document.getElementById('updateOrderStatusBtn')?.addEventListener('click', () => {
    const orderId = document.getElementById('modal-order-id').textContent;
    const newStatus = document.getElementById('modal-status').value;

    fetch('/api/update-order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, newStatus }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          const index = ordersData.findIndex((o) => o.id == orderId);
          if (index !== -1) ordersData[index].status = newStatus;
          renderOrdersTable();
          alert('Status updated successfully');
          document.getElementById('orderDetailsModal').style.display = 'none';
        } else {
          alert('Failed to update status');
        }
      });
  });

  document.getElementById('closeOrderModalBtn')?.addEventListener('click', () => {
    document.getElementById('orderDetailsModal').style.display = 'none';
  });

  document.getElementById('closeOrderModal')?.addEventListener('click', () => {
    document.getElementById('orderDetailsModal').style.display = 'none';
  });

  document.getElementById('view-orders-table-btn')?.addEventListener('click', () => {
    fetch('/partials/orders-table.html')
      .then(res => res.text())
      .then(html => {
        document.getElementById('admin-content').innerHTML = html;
        initAdminOrders(); // Reload listeners for new content
      });
  });
}

function renderOrdersTable() {
  const container = document.getElementById('orders-table');
  if (!container) return;

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${ordersData
          .map(
            (order) => `
          <tr>
            <td>${order.id}</td>
            <td>${order.name}</td>
            <td>${order.phone}</td>
            <td>${order.email}</td>
            <td>${order.status}</td>
            <td><button class="view-order-btn" data-id="${order.id}">View</button></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('.view-order-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const orderId = e.target.getAttribute('data-id');
      const order = ordersData.find((o) => o.id == orderId);
      if (order) showOrderModal(order);
    });
  });
}

function showOrderModal(order) {
  document.getElementById('modal-order-id').textContent = order.id;
  document.getElementById('modal-customer-name').textContent = order.name;
  document.getElementById('modal-phone').textContent = order.phone;
  document.getElementById('modal-email').textContent = order.email;
  document.getElementById('modal-payment-method').textContent = order.paymentMethod;
  document.getElementById('modal-amount').textContent = order.totalAmount;
  document.getElementById('modal-deposit').textContent = order.deposit;
  document.getElementById('modal-status').value = order.status;

  const itemsList = document.getElementById('modal-items-list');
  itemsList.innerHTML = '';
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.name} x ${item.quantity}`;
      itemsList.appendChild(li);
    });
  }

  document.getElementById('orderDetailsModal').style.display = 'block';
}

// Make init function globally accessible
window.initAdminOrders = initAdminOrders;