// File: public/js/myorders.js

document.addEventListener('DOMContentLoaded', () => {
  const user = getLoggedInUser();
  if (!user || !user.phone) {
    alert('Please login first.');
    window.location.href = '/index.html';
    return;
  }

  const phone = user.phone;
  const ordersList = document.getElementById('orders-list');
  const orderTemplate = document.getElementById('order-card-template');
  const activeBtn = document.getElementById('btn-active');
  const pastBtn = document.getElementById('btn-past');

  fetch(`/api/track?phone=${encodeURIComponent(phone)}`)
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data)) {
        alert('No orders found');
        return;
      }
      displayOrders(data, 'active');

      activeBtn.addEventListener('click', () => displayOrders(data, 'active'));
      pastBtn.addEventListener('click', () => displayOrders(data, 'past'));
    });

  function displayOrders(orders, type) {
    ordersList.innerHTML = '';

    const filtered = orders.filter(order => {
      const status = (order.status || '').toLowerCase();
      return type === 'active'
        ? !['delivered', 'cancelled'].includes(status)
        : ['delivered', 'cancelled'].includes(status);
    });

    filtered.forEach(order => {
      const clone = orderTemplate.content.cloneNode(true);
      clone.querySelector('.order-date-value').textContent = order.date || '';
      clone.querySelector('.order-status').textContent = order.status;
      clone.querySelector('.order-title').textContent = order.name;
      clone.querySelector('.order-amount').textContent = order.totalAmount;
      clone.querySelector('.order-id').textContent = `Order ID: ${order.id}`;
      clone.querySelector('.order-item-count').textContent = order.items?.length || 0;
      ordersList.appendChild(clone);
    });

    activeBtn.classList.toggle('active', type === 'active');
    pastBtn.classList.toggle('active', type === 'past');
  }

  function getLoggedInUser() {
    try {
      const parsed = JSON.parse(localStorage.getItem('wattsun_user') || 'null');
      return parsed?.user ?? null;
    } catch {
      return null;
    }
  }
});
