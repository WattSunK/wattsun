// /js/profile.js
// SAFE: Does not import from auth.js. Uses global getCurrentUser()/updateLoginUI if available.
// Exports initAdminProfile() for dashboard.js dynamic import.

function $id(id){ return document.getElementById(id); }

function readCurrentUser() {
  try {
    if (typeof getCurrentUser === 'function') {
      return getCurrentUser();
    }
  } catch(_) {}
  try {
    const raw = localStorage.getItem('wattsunUser');
    const obj = raw ? JSON.parse(raw) : null;
    return obj && obj.user ? obj.user : null;
  } catch(_) { return null; }
}

function writeCurrentUser(user) {
  try {
    localStorage.setItem('wattsunUser', JSON.stringify({ success: true, user }));
  } catch(_) {}
  // Nudge any header UI controlled by auth.js to refresh
  try {
    if (typeof updateLoginUI === 'function') updateLoginUI();
  } catch(_) {}
  // Broadcast for other screens
  try {
    window.dispatchEvent(new CustomEvent('user:me-updated', { detail: { id: user && user.id } }));
  } catch(_) {}
}

export async function initAdminProfile() {
  const root = $id('ws-profile-root');
  if (!root) return; // partial not present

  let me = readCurrentUser();
  if (!me) return; // not logged in

  // Header
  const avatar = $id('userAvatar');
  const nameH  = $id('userName');
  const role   = $id('userRole');
  const emailH = $id('userEmail');
  const last   = $id('lastLogin');

  if (avatar) avatar.textContent = (me.name?.[0] || 'U').toUpperCase();
  if (nameH)  nameH.textContent  = me.name || 'User';
  if (role)   role.textContent    = me.type || 'Customer';
  if (emailH) emailH.textContent  = me.email || '—';
  if (last)   last.textContent    = 'Last login: ' + (me.lastLogin || '—');

  // Form fields
  const nameEl  = $id('pf-name');
  const emailEl = $id('pf-email');
  const phoneEl = $id('pf-phone');

  if (nameEl)  nameEl.value  = me.name || '';
  if (emailEl) { emailEl.value = me.email || ''; emailEl.readOnly = true; }
  if (phoneEl) { phoneEl.value = me.phone || ''; phoneEl.readOnly = true; }

  const saveBtn   = $id('btnSave');
  const cancelBtn = $id('btnCancel');
  const deactBtn  = $id('btnDeactivate');

  if (saveBtn) {
    saveBtn.onclick = async () => {
      const nextName = (nameEl?.value || '').trim();
      if (!nextName) return alert('Please enter a valid name.');

      // API-first attempt (optional; harmless if endpoint doesn’t exist)
      let updated = { ...me, name: nextName };
      try {
 // Use canonical endpoint; backend may alias, but this is the contract
    const resp = await fetch(`/api/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: nextName })
    });
        if (resp.ok) {
          const data = await resp.json();
         // Accept either wrapped or plain user shapes
         updated = (data && data.user) ? data.user : data; // unwrap to plain user
        }
      } catch(_) {
        // ignore; fall back to local-only update
      }

      writeCurrentUser(updated);
      me = updated;
      if (nameH) nameH.textContent = updated.name;
      if (avatar) avatar.textContent = (updated.name?.[0] || 'U').toUpperCase();
      alert('Saved.');
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (nameEl)  nameEl.value  = me.name || '';
      if (emailEl) emailEl.value = me.email || '';
      if (phoneEl) phoneEl.value = me.phone || '';
    };
  }

  if (deactBtn) {
    deactBtn.onclick = () => {
      if (confirm('Deactivate this account? This cannot be undone.')) {
        alert('Deactivation flow to be implemented.');
      }
    };
  }

  // If someone else (Users view) updates current user, refresh
  window.addEventListener('user:me-updated', (e) => {
    const id = e?.detail?.id;
    if (!id || id !== me.id) return;
    me = readCurrentUser() || me;
    if (nameEl)  nameEl.value  = me.name || '';
    if (emailEl) emailEl.value = me.email || '';
    if (phoneEl) phoneEl.value = me.phone || '';
    if (nameH)   nameH.textContent = me.name || 'User';
    if (avatar)  avatar.textContent = (me.name?.[0] || 'U').toUpperCase();
  });
}
