/* /js/myaccount.js
   Profile tab bootstrapper used by /myaccount/profile.html (and userdash.html)
   - Prefills from localStorage
   - Email/phone are read-only here (admin edits via Users)
   - Saves name to backend if possible, otherwise persists to localStorage
*/

(function () {
  // ---------- storage helpers ----------
  function readStored() {
    try {
      const raw = localStorage.getItem('wattsunUser') || localStorage.getItem('wattsun_user');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj?.user || obj || null;
    } catch {
      return null;
    }
  }

  function writeStored(nextUser) {
    // preserve wrapper shape if present
    try {
      const rawA = localStorage.getItem('wattsunUser');
      const rawB = localStorage.getItem('wattsun_user');

      if (rawA) {
        const obj = JSON.parse(rawA);
        const toSave = obj && typeof obj === 'object' && 'user' in obj
          ? { ...obj, user: nextUser }
          : { user: nextUser };
        localStorage.setItem('wattsunUser', JSON.stringify(toSave));
      } else if (rawB) {
        const obj = JSON.parse(rawB);
        const toSave = obj && typeof obj === 'object' && 'user' in obj
          ? { ...obj, user: nextUser }
          : { user: nextUser };
        localStorage.setItem('wattsun_user', JSON.stringify(toSave));
      } else {
        // default wrapper
        localStorage.setItem('wattsunUser', JSON.stringify({ user: nextUser }));
      }
    } catch {
      // last resort: store raw user
      localStorage.setItem('wattsunUser', JSON.stringify({ user: nextUser }));
    }
  }

  // ---------- token + fetch helpers ----------
  function getAuthToken() {
    // Be liberal with token keys to avoid regressions
    return (
      localStorage.getItem('wattsun_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('access_token') ||
      ''
    );
  }

  async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });
    return res;
  }

  async function tryUpdateRemote(user, payload) {
    // 1) Try /api/profile (PATCH)
    try {
      const r1 = await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      if (r1.ok) return await r1.json();
    } catch { /* ignore */ }

    // 2) Try /api/users/:id (PUT/PATCH)
    if (user?.id || user?._id) {
      const id = user.id || user._id;
      const url = `/api/users/${encodeURIComponent(id)}`;
      try {
        const r2 = await apiFetch(url, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        if (r2.ok) return await r2.json();
      } catch { /* ignore */ }
    }

    // If both fail, return null so we can fall back to localStorage
    return null;
  }

  // ---------- UI wiring ----------
  function $(id) { return document.getElementById(id); }

  function hydrateForm(user) {
    if (!user) return;
    if ($('pf-name')) $('pf-name').value = user.name || '';
    if ($('pf-email')) {
      $('pf-email').value = user.email || '';
      $('pf-email').readOnly = true;
      $('pf-email').title = 'Email can only be changed by an admin.';
    }
    if ($('pf-phone')) {
      $('pf-phone').value = user.phone || '';
      $('pf-phone').readOnly = true;
      $('pf-phone').title = 'Phone can only be changed by an admin.';
    }
  }

  function refreshHeader(user) {
    // If the surrounding page has a header card, update it
    const nameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (avatarEl) avatarEl.textContent = (user.name?.[0] || 'U').toUpperCase();
  }

  function bindProfileHandlers() {
    const saveBtn   = $('btnSave')    || document.querySelector('[data-role="save-profile"]');
    const cancelBtn = $('btnCancel')  || document.querySelector('[data-role="cancel-profile"]');
    const deactBtn  = $('btnDeactivate') || document.querySelector('[data-role="deactivate-account"]');

    // avoid double-binding
    if (saveBtn && saveBtn.dataset.bound === '1') return;
    if (saveBtn) saveBtn.dataset.bound = '1';

    const originalUser = readStored() || {};

    // Cancel => revert
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        hydrateForm(originalUser);
      });
    }

    // Save => update name (email/phone are read-only here)
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = $('pf-name') ? $('pf-name').value.trim() : originalUser.name || '';
        if (!name) {
          alert('Please enter your name.');
          return;
        }

        saveBtn.disabled = true;
        const payload = { name };

        let updated = null;
        try {
          updated = await tryUpdateRemote(originalUser, payload);
        } catch { /* ignore */ }

        // Unify the "updated user" shape
        if (updated && updated.user) updated = updated.user;

        const nextUser = { ...originalUser, name };
        // If server returned a full user, prefer that
        const finalUser = updated ? { ...originalUser, ...updated } : nextUser;

        // Persist locally regardless (prevents UI regressions if backend is offline)
        writeStored(finalUser);

        // Update header card
        refreshHeader(finalUser);

        alert(updated ? 'Profile saved.' : 'Saved locally (offline). It will stay until your backend is available.');
        saveBtn.disabled = false;
      });
    }

    // Deactivate (stub; only runs if backend exposes it)
    if (deactBtn) {
      deactBtn.addEventListener('click', async () => {
        if (!confirm('Deactivate your account? This cannot be undone.')) return;
        try {
          const user = readStored();
          const res = await apiFetch('/api/profile/deactivate', { method: 'POST' });
          if (!res.ok && (user?.id || user?._id)) {
            // fallback endpoint
            await apiFetch(`/api/users/${encodeURIComponent(user.id || user._id)}`, { method: 'DELETE' });
          }
          alert('Account deactivation initiated.');
          localStorage.removeItem('wattsunUser');
          localStorage.removeItem('wattsun_user');
          window.location.href = '/';
        } catch {
          alert('Could not deactivate right now. Please try again later.');
        }
      });
    }
  }

  // ---------- public entry ----------
  window.initMyAccountProfile = function initMyAccountProfile() {
    const user = readStored();
    if (!user) {
      // not logged in – bounce to home/login
      window.location.href = '/';
      return;
    }
    hydrateForm(user);
    bindProfileHandlers();
  };
})();
