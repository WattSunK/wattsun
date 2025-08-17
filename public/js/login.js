/**
 * public/js/login.js
 *
 * Standalone login handler that:
 *  - POSTs to /api/login (JSON)
 *  - Stores session as { success:true, user:{...} } in localStorage.wattsunUser
 *  - Redirects to ?next=... if provided (e.g., /checkout.html)
 *  - Otherwise: Admin -> /dashboard.html, Everyone else -> /index.html
 */

(function () {
  function setSession(user) {
    try {
      localStorage.setItem('wattsunUser', JSON.stringify({ success: true, user }));
    } catch (e) {
      console.warn('[login] failed to write session', e);
    }
  }

  function getNext() {
    const raw = new URLSearchParams(location.search).get('next');
    // Allow only same-site simple paths
    if (raw && /^\/[A-Za-z0-9._\-\/?=]*$/.test(raw)) return raw;
    return null;
  }

  async function doLogin(email, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.user) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data.user;
  }

  function qs(id) { return document.getElementById(id); }
  function setStatus(msg) { const el = qs('loginStatus'); if (el) el.textContent = msg || ''; }

  document.addEventListener('DOMContentLoaded', () => {
    const form = qs('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = (qs('email')?.value || '').trim();
      const password = (qs('password')?.value || '').trim();

      if (!email || !password) {
        setStatus('Please enter email and password.');
        return;
      }

      try {
        setStatus('Signing in...');
        const user = await doLogin(email, password);
        setSession(user);

        // Priority 1: explicit ?next=
        const next = getNext();
        if (next) {
          window.location.href = next;
          return;
        }

        // Priority 2: role-based default
        const role = String(user.type || user.role || '').toLowerCase();
        if (role === 'admin') {
          window.location.href = '/dashboard.html';
        } else {
          window.location.href = '/index.html';
        }
      } catch (err) {
        console.error('[login] error', err);
        setStatus('Invalid email or password.');
      }
    });
  });
})();
