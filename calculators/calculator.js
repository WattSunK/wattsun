
// === Browser-side calculator.js for /web/wattsun/public/calculators ===

// Utility: Get values from form
function getUsageFromForm() {
    const fields = [
        'led_bulb', 'tv', 'fridge', 'laptop', 'phone', 'radio', 'fan', 'pump', 'iron', 'kettle', 'cooker',
        'microwave', 'oven', 'freezer', 'washer', 'heater', 'ac', 'tools', 'borehole', 'cctv'
    ];
    let usage = {};
    fields.forEach(id => {
        const val = parseInt(document.getElementById(id).value, 10) || 0;
        usage[id] = val;
    });
    return usage;
}

function updateCartCount() {
    let count = 0;
    try {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    } catch (e) {}
    const badge = document.getElementById('cart-count-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
    const mobileCount = document.getElementById('cart-count');
    if (mobileCount) mobileCount.textContent = count;
}

// Hamburger nav logic (works for mobile and desktop)
document.addEventListener('DOMContentLoaded', function() {
    // Hamburger menu logic
    const navToggle = document.querySelector('.nav-toggle');
    const header = document.querySelector('header');
    if (navToggle && header) {
        navToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            header.classList.toggle('nav-open');
        });
        document.body.addEventListener('click', function(e) {
            if (
                header.classList.contains('nav-open') &&
                !header.querySelector('nav').contains(e.target) &&
                !navToggle.contains(e.target)
            ) {
                header.classList.remove('nav-open');
            }
        }, true);
    }

    updateCartCount();
    window.addEventListener('storage', updateCartCount);

    // Sizing table toggle logic (optional, if your form uses this)
    const showSizingBtn = document.getElementById('showSizingBtn');
    const sizingPanel = document.getElementById('sizingPanel');
    const sizingOverlay = document.getElementById('sizingOverlay');
    const closeSizingPanel = document.getElementById('closeSizingPanel');
    if (showSizingBtn && sizingPanel && sizingOverlay && closeSizingPanel) {
        showSizingBtn.onclick = function() {
            sizingPanel.style.right = '0';
            sizingOverlay.style.display = 'block';
        };
        closeSizingPanel.onclick = function() {
            sizingPanel.style.right = '-420px';
            sizingOverlay.style.display = 'none';
        };
        sizingOverlay.onclick = closeSizingPanel.onclick;
    }

    // Collapsible sections
    window.toggleSection = function(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.classList.toggle('collapsed');
        }
    };
});

// Calculate button logic
window.calculateKit = async function() {
    const usage = getUsageFromForm();
    // Ignore empty form
    if (Object.values(usage).every(v => v === 0)) {
        showResult('Please enter at least one appliance.');
        return;
    }
    showResult('Calculating...');
    try {
        const response = await fetch('/api/Kitcalculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(usage)
        });
        const data = await response.json();
        if (!data || !data.recommended) {
            showResult('Could not get a kit recommendation.');
            return;
        }
        showResult(
            `<b>Recommended Kit:</b> ${data.recommended}<br/>
             <b>Total Power:</b> ${data.power} W<br/>
             <b>Estimated Price:</b> KES ${Number(data.price).toLocaleString()}<br>
             <button class="loan-btn" id="addToCartBtn">Add to Cart</button>`
        );
        // Add-to-cart button logic
        document.getElementById('addToCartBtn').onclick = function() {
            addKitToCart(data);
            showNotification('Added to cart!');
            updateCartCount();
        };
    } catch (e) {
        showResult('Error calculating kit.');
    }
};

function showResult(html) {
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
        resultDiv.classList.add('result-flash');
        setTimeout(() => resultDiv.classList.remove('result-flash'), 900);
    }
}

function showNotification(msg) {
    const notif = document.getElementById('cart-notification');
    if (!notif) return;
    notif.textContent = msg;
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 1700);
}

function addKitToCart(data) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    // Try to merge if already in cart
    let found = cart.find(item => item.name === data.recommended);
    if (found) {
        found.quantity = (found.quantity || 1) + 1;
        found.price = data.price;
    } else {
        cart.push({
            name: data.recommended,
            price: data.price,
            quantity: 1,
            description: `Recommended kit from calculator (${data.power}W)`
        });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
}
