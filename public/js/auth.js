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
          .ws-avatar-btn{ display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:#fadb14; color:#000; font-weight:800; cursor:pointer; border:none; margin-left:12px; }
          .ws-drawer-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); opacity:0; pointer-events:none; transition:opacity .18s ease; z-index:2200; }
          .ws-drawer{ position:fixed; top:0; right:-340px; width:320px; height:100vh; background:#fff; box-shadow:-6px 0 22px rgba(0,0,0,.12); transition:right .22s ease; z-index:2201; display:flex; flex-direction:column; }
          .ws-open .ws-drawer-backdrop{ opacity:1; pointer-events:auto; }
          .ws-open #wsAccountPanel{ right:0; }
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
        avatarBtn.title = 'Account';
        const bar = headerBar || document.querySelector('.header-bar');
        if (bar) bar.appendChild(avatarBtn); else document.body.appendChild(avatarBtn);
        avatarBtn.addEventListener('click', openAccountDrawer);
      }
      avatarBtn.textContent = (user?.name?.[0] || 'U').toUpperCase();
      avatarBtn.style.display = 'inline-flex';

      if (!document.getElementById('wsAccountDrawer')){
        const backdrop = document.createElement('div');
        backdrop.id = 'wsAccountDrawer';
        backdrop.className = 'ws-drawer-backdrop';
        const panel = document.createElement('aside');
        panel.id = 'wsAccountPanel';
        panel.className = 'ws-drawer';
        panel.innerHTML = `
          <div class="ws-drawer-header">
            <span id="wsDrawerHello">Hello</span>
            <button class="ws-drawer-close" aria-label="Close" id="wsDrawerClose">×</button>
          </div>
          <div class="ws-drawer-content">
            <a class="ws-drawer-item" href="/myaccount/userdash.html">My account</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html">Orders</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html">Addresses</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html">Payments</a>
            <a class="ws-drawer-item" href="/myaccount/userdash.html">Offers</a>
          </div>
          <div class="ws-drawer-footer">
            <button id="wsDrawerSignOut">Sign out</button>
          </div>`;
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        backdrop.addEventListener('click', closeAccountDrawer);
        document.getElementById('wsDrawerClose').addEventListener('click', closeAccountDrawer);
        document.getElementById('wsDrawerSignOut').addEventListener('click', function(){
          localStorage.removeItem('wattsunUser');
          closeAccountDrawer();
          wsOverrideUpdateLoginUI();
        });
        document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAccountDrawer(); });
      }

      const hello = document.getElementById('wsDrawerHello');
      if (hello) hello.textContent = 'Hello ' + (user?.name || 'User');
    }catch(err){ console.warn('[auth] ensureAccountControls failed:', err); }
  }

  function openAccountDrawer(){
    document.documentElement.classList.add('ws-open');
    const backdrop = document.getElementById('wsAccountDrawer');
    const panel = document.getElementById('wsAccountPanel');
    if (backdrop) backdrop.style.opacity = '1', backdrop.style.pointerEvents = 'auto';
    if (panel) panel.style.right = '0';
  }
  function closeAccountDrawer(){
    document.documentElement.classList.remove('ws-open');
    const backdrop = document.getElementById('wsAccountDrawer');
    const panel = document.getElementById('wsAccountPanel');
    if (backdrop) backdrop.style.opacity = '0', backdrop.style.pointerEvents = 'none';
    if (panel) panel.style.right = '-340px';
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
      const drawer = document.getElementById('wsAccountDrawer');
      if (drawer){ drawer.style.opacity='0'; drawer.style.pointerEvents='none'; }
    }
  }

  // Expose and run
  window.wsOverrideUpdateLoginUI = wsOverrideUpdateLoginUI;
  document.addEventListener('DOMContentLoaded', wsOverrideUpdateLoginUI);
  // Run immediately in case DOM is already ready
  try{ wsOverrideUpdateLoginUI(); }catch{}
})();
