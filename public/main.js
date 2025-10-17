
document.addEventListener("DOMContentLoaded", function() {
  // Find all footers and inject WhatsApp icon into the contact block or add new
  var contactFooters = document.querySelectorAll('.footer-contacts');
  if (contactFooters.length === 0) {
    // If no .footer-contacts found, create and append to footers with email
    var footers = document.querySelectorAll('footer');
    footers.forEach(function(footer) {
      // Only add if not present already
      if (!footer.querySelector('.footer-contacts')) {
        var mailto = footer.querySelector('a[href^="mailto"]');
        if (mailto) {
          var div = document.createElement('div');
          div.className = "footer-contacts";
          // Move email link into div
          div.appendChild(mailto.cloneNode(true));
          footer.appendChild(div);
          // Optionally remove old mailto if duplicate
          // mailto.remove();
          contactFooters = document.querySelectorAll('.footer-contacts');
        }
      }
    });
  }
  contactFooters = document.querySelectorAll('.footer-contacts');
  contactFooters.forEach(function(footerContacts) {
    if (!footerContacts.querySelector('.whatsapp-link')) {
      var wa = document.createElement('a');
      wa.href = 'https://wa.me/254722761212';
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.className = 'whatsapp-link';
      wa.title = 'Chat with us on WhatsApp';
      footerContacts.appendChild(wa);
    }
  });
});

// Bootstrap account/avatar widget across pages that include this file.
// This gracefully no-ops if auth.js isn’t loaded on the page.
try {
  document.addEventListener('DOMContentLoaded', function(){
    try {
      (window.wsOverrideUpdateLoginUI || window.updateLoginUI)?.();
    } catch (e) {}
  });
} catch (e) {}

// Global cart badge updater (optional on pages without badge)
function wsUpdateCartBadge() {
  try {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const badge = document.getElementById('cart-count-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {}
}
document.addEventListener('DOMContentLoaded', wsUpdateCartBadge);
window.addEventListener('storage', function (e) {
  if (e.key === 'cart') wsUpdateCartBadge();
});
