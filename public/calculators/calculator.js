/* Cart Badge Logic */
function updateCartCountBadge() {
  let count = 0;
  try {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  } catch(e) {}
  const badgeEl = document.getElementById('cart-count-badge');
  if (badgeEl) {
    if (count > 0) {
      badgeEl.textContent = count;
      badgeEl.style.display = 'flex';
    } else {
      badgeEl.style.display = 'none';
    }
  }
  const mobileEl = document.getElementById('cart-count');
  if (mobileEl) {
    mobileEl.textContent = count;
  }
}
document.addEventListener('DOMContentLoaded', updateCartCountBadge);
window.addEventListener('storage', updateCartCountBadge);

/* Navigation Toggle */
function toggleNav() {
  document.querySelector('header').classList.toggle('nav-open');
}

/* Section Collapse */
function toggleSection(sectionId) {
  const sec = document.getElementById(sectionId);
  if (sec) sec.classList.toggle('collapsed');
}

/* Input Sanitization */
function sanitizeInput(input) {
  let val = input.value.replace(/^0+/, '');
  val = val.replace(/[^0-9]/g, '');
  input.value = val === '' ? '0' : String(Number(val));
}

/* Kit Descriptions from Shop */
const kitDescriptions = {
  "1kW Kit": "Best for bedsitters, small homes or shops. Runs lights, TV, phone/laptop charging, and a small fridge for basic backup.",
  "3kW Kit": "For medium homes, small offices, kiosks or shops. Handles lighting, TV, freezer, up to 2 fridges, iron, microwave, and essential business loads.",
  "6kW Kit": "Large homes, small businesses, restaurants. Runs multiple kitchen devices (fridge, freezer, microwave, fryer), computers, CCTV, Wi-Fi, lighting.",
  "9kW Kit": "Large home or mid-sized business, partial kitchen for fast food. All of above plus 3 kitchen devices at once: commercial freezer, fryer, coffee machine.",
  "12kW Kit": "Full backup for large businesses, supermarkets, or fast food. Runs all above plus several fryers/ovens/fridges, AC, IT loads, coffee and more."
};

/* Kit Data for Calculator */
const kits = [
  { name: '1kW Kit', maxW: 1000, price: 120000, description: kitDescriptions['1kW Kit'] },
  { name: '3kW Kit', maxW: 3000, price: 320000, description: kitDescriptions['3kW Kit'] },
  { name: '6kW Kit', maxW: 6000, price: 590000, description: kitDescriptions['6kW Kit'] },
  { name: '9kW Kit', maxW: 9000, price: 850000, description: kitDescriptions['9kW Kit'] },
  { name: '12kW Kit', maxW: 12000, price: 1150000, description: kitDescriptions['12kW Kit'] }
];

/* Appliance Watt Ratings */
const applianceWatts = {
  led_bulb: 10, tv: 60, fridge: 150, laptop: 60, phone: 5, radio: 15,
  fan: 40, pump: 250, iron: 1000, kettle: 1500, cooker: 1500,
  microwave: 1200, oven: 2500, freezer: 300, washer: 1200,
  heater: 2000, ac: 1500, tools: 1200, borehole: 2000, cctv: 150
};

/* Calculate Kit Recommendation */
function calculateKit() {
  let totalWatt = 0;
  const form = document.getElementById('solarForm');
  Object.keys(applianceWatts).forEach(key => {
    const qty = parseInt(form[key]?.value) || 0;
    totalWatt += qty * applianceWatts[key];
  });
  let kit = kits.find(k => totalWatt <= k.maxW) || kits[kits.length - 1];
  const resultBox = document.getElementById('result');
  resultBox.style.display = 'block';
  setTimeout(() => {
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resultBox.classList.add('result-flash');
    setTimeout(() => resultBox.classList.remove('result-flash'), 1000);
  }, 100);
  if (totalWatt === 0) {
    resultBox.innerHTML = `<span style="color:#cf4c0a"><b>No appliances selected.</b><br>Select appliances to get your kit recommendation.</span>`;
    return;
  }
  resultBox.innerHTML = `
    <div style="margin:0 auto;max-width:350px;">
      <b>Recommended Kit:</b> <span style="color:#0a7c48">${kit.name}</span><br>
      <b>Total Estimated Power:</b> ${totalWatt} W<br>
      <b>Estimated Price:</b> KES ${kit.price.toLocaleString()}<br><br>
      <div class="calc-btn-row">
        <button type="button" class="buy-now-btn" data-kit="${kit.name}">Buy Now</button>
        <a href="solutions.html" class="secondary">Back to Solutions</a>
      </div>
    </div>
  `;
}

/* Add to Cart from Calculator */
function addToCartFromCalculator(itemName, price) {
  const cart = JSON.parse(localStorage.getItem("cart")) || [];
  const kitInfo = kits.find(k => k.name === itemName);
  const description = kitInfo ? kitInfo.description : '';
  const idx = cart.findIndex(prod => prod.name === itemName);
  if (idx !== -1) {
    cart[idx].quantity = (cart[idx].quantity || 1) + 1;
  } else {
    cart.push({ name: itemName, price: price, deposit: 0, quantity: 1, description: description });
  }
  localStorage.setItem("cart", JSON.stringify(cart));
  showCartNotification(itemName + ' added to cart!');
  updateCartCountBadge();
}

/* Show Notification */
function showCartNotification(message) {
  const notif = document.getElementById('cart-notification');
  notif.textContent = message;
  notif.classList.add('show');
  notif.style.display = 'block';
  clearTimeout(notif._timer);
  notif._timer = setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => { notif.style.display = 'none'; }, 400);
  }, 1600);
}

/* Delegate Buy Now button clicks */
document.addEventListener('click', event => {
  if (event.target.classList.contains('buy-now-btn')) {
    const kitName = event.target.getAttribute('data-kit');
    const kitInfo = kits.find(k => k.name === kitName);
    if (kitInfo) {
      addToCartFromCalculator(kitInfo.name, kitInfo.price);
    }
  }
});

/* Sizing Table Side Panel Logic */
const showBtn = document.getElementById('showSizingBtn');
const sizingPanel = document.getElementById('sizingPanel');
const sizingOverlay = document.getElementById('sizingOverlay');
const closeBtn = document.getElementById('closeSizingPanel');
function openSizingPanel() {
  sizingPanel.style.right = '0';
  sizingOverlay.style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeSizingPanel() {
  sizingPanel.style.right = '-420px';
  sizingOverlay.style.display = 'none';
  document.body.style.overflow = '';
}
showBtn.onclick = openSizingPanel;
sizingOverlay.onclick = closeSizingPanel;
closeBtn.onclick = closeSizingPanel;

/* Close nav on outside click */
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', e => {
    const header = document.querySelector('header');
    if (!header) return;
    const nav = header.querySelector('nav');
    const navToggle = header.querySelector('.nav-toggle');
    if (
      header.classList.contains('nav-open') &&
      !nav.contains(e.target) &&
      !navToggle.contains(e.target)
    ) {
      header.classList.remove('nav-open');
    }
  }, true);
});
