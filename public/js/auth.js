// public/js/auth.js

// ---------- Modal controls ----------
function openLogin() {
  document.getElementById('loginModal').style.display = 'flex';
}
function closeLogin() {
  document.getElementById('loginModal').style.display = 'none';
}
function openSignup() {
  document.getElementById('signupModal').style.display = 'flex';
}
function closeSignup() {
  document.getElementById('signupModal').style.display = 'none';
}
function openPasswordReset() {
  document.getElementById('resetModal').style.display = 'flex';
}
function closePasswordReset() {
  document.getElementById('resetModal').style.display = 'none';
}

// ---------- Session utility ----------
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('wattsunUser'); // ✅ fixed key
    const parsed = JSON.parse(raw);
    return parsed?.success ? parsed.user : null;
  } catch {
    return null;
  }
}

// ---------- Login handler ----------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.style.display = 'none';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 🔑 ensure cookie is set
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
       if (!res.ok || data.success === false) {
        const msg =
          typeof data.error === "object"
            ? data.error.message || JSON.stringify(data.error)
            : data.error || "Login failed";
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        return;
      }

      localStorage.setItem('wattsunUser', JSON.stringify({ success: true, user: data.user }));
      updateLoginUI();
      closeLogin();
      setTimeout(() => location.reload(), 300);
    } catch (err) {
      errorDiv.textContent = "Login error";
      errorDiv.style.display = 'block';
    }
  });
}

// ---------- Signup handler ----------
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const password = document.getElementById('signupPassword').value;
    const errorDiv = document.getElementById('signupError');
    const successDiv = document.getElementById('signupSuccess');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 🔑 consistency
        body: JSON.stringify({ name, email, phone, password })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        errorDiv.textContent = data.error || "Signup failed";
        errorDiv.style.display = 'block';
        return;
      }
      successDiv.textContent = 'Account created! Please login.';
      successDiv.style.display = 'block';
      setTimeout(() => {
        closeSignup();
        openLogin();
      }, 1200);
    } catch (err) {
      errorDiv.textContent = "Signup error";
      errorDiv.style.display = 'block';
    }
  });
}

// ---------- Password reset handler ----------
const resetForm = document.getElementById('resetForm');
if (resetForm) {
  resetForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = document.getElementById('resetEmail').value;
    const errorDiv = document.getElementById('resetError');
    const successDiv = document.getElementById('resetSuccess');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    try {
      const res = await fetch('/api/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 🔑 add for consistency
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        errorDiv.textContent = data.error || "Failed to send reset email";
        errorDiv.style.display = 'block';
        return;
      }
      successDiv.textContent = "Check your email for reset instructions.";
      successDiv.style.display = 'block';
    } catch (err) {
      errorDiv.textContent = "Error sending reset email";
      errorDiv.style.display = 'block';
    }
  });
}

// ---------- Login/logout UI logic ----------
function updateLoginUI() {
  const user = getCurrentUser();

  const userSpan = document.getElementById('loggedInUser');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    const role = user?.type?.toLowerCase() === 'admin' ? 'admin' : 'user';
    const linkHref = role === 'admin' ? '/dashboard.html' : '/myaccount/userdash.html';
    userSpan.innerHTML = `👤 <a href="${linkHref}" style="color:#000;text-decoration:underline">${user.name} (${user.type})</a>`;
    userSpan.style.display = 'inline-block';
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
  } else {
    userSpan.style.display = 'none';
    loginBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = function () {
    localStorage.removeItem('wattsunUser');
    updateLoginUI();
    location.reload();
  };
}

window.addEventListener('DOMContentLoaded', updateLoginUI);
