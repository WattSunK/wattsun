// public/js/auth.js

// ---------- Modal controls ----------
function openLogin() { document.getElementById("loginModal").style.display = "flex"; }
function closeLogin() { document.getElementById("loginModal").style.display = "none"; }
function openSignup() { document.getElementById("signupModal").style.display = "flex"; }
function closeSignup() { document.getElementById("signupModal").style.display = "none"; }
function openPasswordReset() { document.getElementById("resetModal").style.display = "flex"; }
function closePasswordReset() { document.getElementById("resetModal").style.display = "none"; }

// ---------- Session utility ----------
function getCurrentUser() {
  try {
    const raw = localStorage.getItem("wattsunUser");
    const parsed = JSON.parse(raw);
    return parsed?.success ? parsed.user : null;
  } catch {
    return null;
  }
}

// ---------- Login handler ----------
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errorDiv = document.getElementById("loginError");
    errorDiv.style.display = "none";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const msg =
          data.error?.message ||
          data.message ||
          (typeof data.error === "string" ? data.error : null) ||
          "Login failed";
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
        return;
      }

      localStorage.setItem(
        "wattsunUser",
        JSON.stringify({ success: true, user: data.user })
      );
      updateLoginUI();
      closeLogin();
      // Ensure avatar and drawer render immediately without hard reload
      try { (window.updateLoginUI || window.wsOverrideUpdateLoginUI)?.(); } catch(e){}
      // Avoid full page reload to prevent flicker; UI already updated
    } catch (err) {
      console.error("[login] error:", err);
      errorDiv.textContent = err.message || "Login error";
      errorDiv.style.display = "block";
    }
  });
}

// ---------- Signup handler ----------
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("signupName").value;
    const email = document.getElementById("signupEmail").value;
    const phone = document.getElementById("signupPhone").value;
    const password = document.getElementById("signupPassword").value;
    const errorDiv = document.getElementById("signupError");
    const successDiv = document.getElementById("signupSuccess");
    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, phone, password }),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const msg =
          data.error?.message ||
          data.message ||
          (typeof data.error === "string" ? data.error : null) ||
          "Signup failed";
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
        return;
      }

      successDiv.textContent = "Account created! Please login.";
      successDiv.style.display = "block";
      setTimeout(() => {
        closeSignup();
        openLogin();
      }, 1200);
    } catch (err) {
      console.error("[signup] error:", err);
      errorDiv.textContent = err.message || "Signup error";
      errorDiv.style.display = "block";
    }
  });
}

// ---------- Password reset handler ----------
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  resetForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("resetEmail").value;
    const errorDiv = document.getElementById("resetError");
    const successDiv = document.getElementById("resetSuccess");
    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const res = await fetch("/api/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const msg =
          data.error?.message ||
          data.message ||
          (typeof data.error === "string" ? data.error : null) ||
          "Failed to send reset email";
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
        return;
      }

      successDiv.textContent = "Check your email for reset instructions.";
      successDiv.style.display = "block";
    } catch (err) {
      console.error("[reset] error:", err);
      errorDiv.textContent = err.message || "Error sending reset email";
      errorDiv.style.display = "block";
    }
  });
}

// ---------- Login/logout UI logic ----------
function updateLoginUI() {
  // Delegate to enhanced handler if available to prevent legacy UI showing
  if (typeof window !== 'undefined' && typeof window.wsOverrideUpdateLoginUI === 'function') {
    return window.wsOverrideUpdateLoginUI();
  }
  const user = getCurrentUser();
  const userSpan = document.getElementById("loggedInUser");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (user) {
    const role = user?.type?.toLowerCase() === "admin" ? "admin" : "user";
    const linkHref =
      role === "admin" ? "/dashboard.html" : "/myaccount/userdash.html";
    userSpan.innerHTML = `👤 <a href="${linkHref}" style="color:#000;text-decoration:underline">${user.name} (${user.type})</a>`;
    userSpan.style.display = "inline-block";
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  } else {
    userSpan.style.display = "none";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
  }
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = function () {
    localStorage.removeItem("wattsunUser");
    updateLoginUI();
    // Avoid full page reload to prevent flicker
    try { (window.updateLoginUI || window.wsOverrideUpdateLoginUI)?.(); } catch(e){}
  };
}

window.addEventListener("DOMContentLoaded", updateLoginUI);

// --- Enhanced: Avatar-only header + side drawer ---
(function(){
  function ensureAccountControls(user, headerBar){
    try{
      if (!document.getElementById('wsAccountStyles')){
        const style = document.createElement('style');
        style.id = 'wsAccountStyles';
        style.textContent = `
          .ws-avatar-btn{ position:absolute; right:56px; top:50%; transform:translateY(-50%); display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:#fadb14; color:#000; font-weight:800; font-size:18px; cursor:pointer; border:none; margin-left:0; box-shadow:0 2px 8px rgba(0,0,0,.08); }
          /* Compact drawer: only as tall/wide as needed */
          #wsAccountPanel{ position:fixed; top:64px; right:12px; width:280px; max-height:calc(100vh - 88px); height:auto; background:#fff; border:1px solid #eee; border-radius:12px; box-shadow:-6px 10px 24px rgba(0,0,0,.14); transform:translateX(16px); opacity:0; pointer-events:none; z-index:2201; display:flex; flex-direction:column; overflow:hidden; transition:transform .18s ease, opacity .18s ease; }
          .ws-open #wsAccountPanel{ transform:none; opacity:1; pointer-events:auto; }
          .ws-drawer-header{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid #eee; font-weight:800; font-size:18px; }
          .ws-drawer-close{ background:none; border:none; font-size:22px; line-height:1; cursor:pointer; color:#777; }
          .ws-drawer-content{ padding:12px 18px; overflow:auto; flex:1; }
          .ws-drawer-item{ display:flex; align-items:center; gap:10px; padding:10px 0; color:#222; text-decoration:none; border-bottom:1px solid #f2f2f2; }
          .ws-drawer-footer{ padding:12px 18px; border-top:1px solid #eee; }
          .ws-drawer-footer button{ width:100%; padding:10px 12px; border-radius:8px; border:1px solid #e9e9ef; background:#fff; cursor:pointer; }
        `;
        document.head.appendChild(style);
      }

      let avatarBtn = document.getElementById('wsAvatarBtn');
      if (!avatarBtn){
        avatarBtn = document.createElement('button');
        avatarBtn.id = 'wsAvatarBtn';
        avatarBtn.className = 'ws-avatar-btn';
        avatarBtn.title = 'My Account';
        const bar = headerBar || document.querySelector('.header-bar');
        if (bar) bar.appendChild(avatarBtn); else document.body.appendChild(avatarBtn);
        avatarBtn.addEventListener('click', openAccountDrawer);
      }
      avatarBtn.textContent = (user?.name?.[0] || 'U').toUpperCase();
      avatarBtn.style.display = 'inline-flex';

      if (!document.getElementById('wsAccountPanel')){
        const panel = document.createElement('aside');
        panel.id = 'wsAccountPanel';
        panel.className = 'ws-drawer';
        panel.innerHTML = `
          <div class="ws-drawer-header">
            <span id="wsDrawerHello">Hello</span>
            <button class="ws-drawer-close" aria-label="Close" id="wsDrawerClose">×</button>
          </div>
          <div class="ws-drawer-content">
            <a class="ws-drawer-item" href="/myaccount/userdash.html?tab=profile">My account</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html?tab=orders">Orders</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html?tab=addresses">Addresses</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html?tab=payments">Payments</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html?tab=offers">Offers</a>
          </div>
          <div class="ws-drawer-footer">
            <button id="wsDrawerSignOut">Sign out</button>
          </div>`;
        document.body.appendChild(panel);
        try{
          const isAdmin = !!user && ((String(user.type||'').toLowerCase()==='admin') || (String(user.role||'').toLowerCase()==='admin'));
          if (isAdmin) {
            const cont = panel.querySelector('.ws-drawer-content');
            if (cont && !cont.querySelector('[data-admin-link]')){
              const a = document.createElement('a');
              a.className = 'ws-drawer-item';
              a.href = '/dashboard.html#system-status';
              a.textContent = 'Admin dashboard';
              a.setAttribute('data-admin-link','1');
              cont.insertBefore(a, cont.firstChild);
            }
          }
        }catch(_){/* no-op */}

        document.getElementById('wsDrawerClose').addEventListener('click', closeAccountDrawer);
        document.getElementById('wsDrawerSignOut').addEventListener('click', function(){
          localStorage.removeItem('wattsunUser');
          closeAccountDrawer();
          wsOverrideUpdateLoginUI();
        });
        document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAccountDrawer(); });

        // Click outside to close
        document.addEventListener('click', (evt)=>{
          const p = document.getElementById('wsAccountPanel');
          const b = document.getElementById('wsAvatarBtn');
          if (!p) return;
          const isInside = p.contains(evt.target) || b?.contains(evt.target);
          const isOpen = document.documentElement.classList.contains('ws-open');
          if (isOpen && !isInside) closeAccountDrawer();
        });
      }

      const hello = document.getElementById('wsDrawerHello');
      if (hello) hello.textContent = 'Hello ' + (user?.name || 'User');
    }catch(err){ console.warn('[auth] ensureAccountControls failed:', err); }
  }

  function openAccountDrawer(){
    document.documentElement.classList.add('ws-open');
    const panel = document.getElementById('wsAccountPanel');
    if (panel) { /* visible via CSS class on html */ }
  }
  function closeAccountDrawer(){
    document.documentElement.classList.remove('ws-open');
    const panel = document.getElementById('wsAccountPanel');
    if (panel) { /* hidden via CSS removal */ }
  }

  function wsOverrideUpdateLoginUI(){
    const user = getCurrentUser();
    const userSpan = document.getElementById("loggedInUser");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const headerBar = document.querySelector('.header-bar');

    if (user){
      if (userSpan) userSpan.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      ensureAccountControls(user, headerBar);
    } else {
      if (userSpan) userSpan.style.display = 'none';
      if (loginBtn) loginBtn.style.display = 'inline-block';
      if (logoutBtn) logoutBtn.style.display = 'none';
      const avatarBtn = document.getElementById('wsAvatarBtn');
      if (avatarBtn) avatarBtn.style.display = 'none';
      closeAccountDrawer();
    }
  }

  // Expose and run
  window.wsOverrideUpdateLoginUI = wsOverrideUpdateLoginUI;
  // Replace original updateLoginUI calls with the enhanced one
  window.updateLoginUI = wsOverrideUpdateLoginUI;
  document.addEventListener('DOMContentLoaded', wsOverrideUpdateLoginUI);
  // Run immediately in case DOM is already ready
  try{ wsOverrideUpdateLoginUI(); }catch{}
})();

// --- Fallback: Standardize cart icon + provide addToCart if main.js not loaded ---
(function(){
  function standardizeCartLink(){
    try {
      var nav = document.querySelector('header nav');
      if (!nav) return;
      var link = nav.querySelector('a.cart-icon-link') || Array.from(nav.querySelectorAll('a')).find(function(a){
        var href = (a.getAttribute('href')||'');
        return /(^|\/)cart\.html(\?|$)/i.test(href);
      });
      if (!link) return;
      link.classList.add('cart-icon-link');
      var canonical = ''+
        '<span class="cart-icon">'+
          '<svg class="cart-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+
            '<path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a 2 2 0 1 0 .001 3.999A2 2 0 0 0 17 18zM6 6h13l-1.5 7.5H8.2L6.9 4.8 4 4"/>'+
          '</svg>'+ 
          '<span id="cart-count-badge" class="cart-count-badge">0</span>'+ 
        '</span>';
      link.innerHTML = canonical;
      // Update immediately
      try { if (typeof wsUpdateCartBadge === 'function') wsUpdateCartBadge(); } catch(e){}
    } catch(e){}
  }
  document.addEventListener('DOMContentLoaded', standardizeCartLink);
})();

if (typeof window.addToCart !== 'function') {
  window.addToCart = function(name, price, depositInputId, description){
    try {
      var p = Number(price) || 0;
      var depEl = document.getElementById(depositInputId);
      var dep = depEl ? parseInt(String(depEl.value||'').replace(/[^\d]/g,''),10) || 0 : 0;
      var minDep = Math.ceil(p * 0.5);
      if (dep < minDep) {
        try {
          var t = document.getElementById('toast');
          if (t) { t.textContent = 'Minimum deposit is KES ' + minDep.toLocaleString('en-KE'); t.style.display='block'; setTimeout(function(){ t.style.display='none'; }, 1800); }
          else alert('Minimum deposit is KES ' + minDep.toLocaleString('en-KE'));
        } catch(e){ alert('Minimum deposit is KES ' + minDep.toLocaleString('en-KE')); }
        depEl && depEl.focus();
        return;
      }
      var cart = [];
      try { cart = JSON.parse(localStorage.getItem('cart')) || []; } catch(e){}
      cart.push({ name: name, description: description || '', quantity: 1, price: p, deposit: dep });
      localStorage.setItem('cart', JSON.stringify(cart));
      try { if (typeof wsUpdateCartBadge === 'function') wsUpdateCartBadge(); else updateCartBadgeFallback(); } catch(e){ updateCartBadgeFallback(); }
      try {
        var t2 = document.getElementById('toast');
        if (t2) { t2.textContent = 'Added to cart!'; t2.style.display='block'; setTimeout(function(){ t2.style.display='none'; }, 1500); }
        else alert('Added to cart!');
      } catch(e){ alert('Added to cart!'); }
    } catch(e) { console.error('addToCart failed', e); }
  };
  function updateCartBadgeFallback(){
    try {
      var cart = JSON.parse(localStorage.getItem('cart')) || [];
      var count = cart.reduce(function(sum, item){ return sum + (item.quantity||1); }, 0);
      var badge = document.getElementById('cart-count-badge');
      if (badge){ badge.textContent = count; badge.style.display = count>0 ? 'flex' : 'none'; }
      var mobile = document.getElementById('cart-count');
      if (mobile){ mobile.textContent = count; }
    } catch(e){}
  }
}
