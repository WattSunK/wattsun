
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

// --- Global glyph sanitizer ---
// Fixes replacement characters (�) that slipped into some content during encoding.
try {
  document.addEventListener('DOMContentLoaded', function () {
    // 1) Footer copyright line
    document.querySelectorAll('footer p').forEach(function (p) {
      var txt = (p.textContent || '').trim();
      if (/All rights reserved\./i.test(txt)) {
        p.textContent = '\u00A9 2025 WattSun Solar. All rights reserved.';
      }
    });

    // 2) Ensure mailto text contains '@' based on href
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
      var mail = (a.getAttribute('href') || '').replace(/^mailto:/i, '');
      if (mail && !a.textContent.includes('@')) a.textContent = mail;
    });

    // 3) Navbar toggle label should be readable
    document.querySelectorAll('.nav-toggle').forEach(function (btn) {
      btn.textContent = 'Menu';
      btn.setAttribute('aria-label', 'Menu');
    });

    // 4) Close buttons inside modals -> ×
    ['[onclick="closeLogin()"]','[onclick="closeSignup()"]','[onclick="closePasswordReset()"]']
      .forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) { el.textContent = '\u00D7'; });
      });

    // 5) Replace stray replacement chars; keep digits-digits as hyphen
    var targets = document.querySelectorAll('td, th, span, div, a, p, h1, h2, h3, h4, h5');
    targets.forEach(function (el) {
      var s = el.textContent;
      if (s && s.indexOf('\uFFFD') !== -1) {
        s = s.replace(/(\d)\uFFFD(\d)/g, '$1-$2') // 1�2 -> 1-2
             .replace(/Buyer\uFFFDTs/gi, "Buyer's")
             .replace(/\uFFFD\uFFFD'/g, '>>')
             .replace(/\uFFFD+/g, '');
        el.textContent = s;
      }
    });

    // 6) Feature icons fallback
    document.querySelectorAll('.feature-icon').forEach(function (el) { el.textContent = '*'; });
  });
} catch (e) {}

// --- Solutions page enhancements: add emojis + en–dash to packages table ---
(function(){
  function headerHas(cols, labels){
    if (!cols || cols.length < labels.length) return false;
    const texts = Array.from(cols).map(c=> (c.textContent||'').trim().toLowerCase());
    return labels.every(l => texts.includes(l.toLowerCase()));
  }
  function enhancePackagesTable(){
    try {
      const tables = document.querySelectorAll('table.styled-table');
      tables.forEach(function(tbl){
        const thead = tbl.querySelector('thead');
        const tbody = tbl.querySelector('tbody');
        if (!thead || !tbody) return;
        const ths = thead.querySelectorAll('th');
        if (!headerHas(ths, ['Capacity','Access (KES)','Suitable For'])) return;

        const map = {
          '1 kw': '💡 1–2 rooms, 📺 TV, 🔋 phone charging',
          '3 kw': '🏠 Small home, 🧊 fridge, 📺 TV, 🌐 internet',
          '6 kw': '🏠 Full house: appliances, entertainment, 💧 water pump',
          '9 kw': '👨‍👩‍👧‍👦 Large family homes, partial A/C',
          '12 kw': '🔋 Premium homes, backup + solar split loads'
        };

        Array.from(tbody.rows).forEach(function(row){
          const capCell = row.cells && row.cells[0];
          const suitCell = row.cells && row.cells[2];
          if (!capCell || !suitCell) return;
          const key = (capCell.textContent||'').trim().toLowerCase();
          if (map[key]) suitCell.textContent = map[key];
          // ensure 1-2 uses en–dash everywhere
          suitCell.textContent = suitCell.textContent.replace(/(\b1)-(2\b)/g, '1–2');
        });
      });
    } catch(e){}
  }
  document.addEventListener('DOMContentLoaded', enhancePackagesTable);
})();
