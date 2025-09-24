// Loyalty Program Settings — Global (Card)
// Loads/saves only the high-level fields that live on the card.
// Advanced fields are handled by the modal script.

(function () {
  const form = document.getElementById('loyalty-settings-form');
  if (!form) return;

  const statusEl = document.getElementById('loyalty-settings-status');

  const fields = {
    // NOTE: we render a checkbox grid into this container
    eligibleUserTypesBox: document.getElementById('eligibleUserTypesBox'),
    programActive: document.getElementById('programActive'),
    digestDay: document.getElementById('digestDay'),
    referralBonus: document.getElementById('referralBonus'),
  };

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('error', 'ok');
    statusEl.classList.add(ok ? 'ok' : 'error');
  }

  // Build checkbox grid from /user-types
  async function loadUserTypes() {
    try {
      const res = await fetch('/api/admin/loyalty/user-types', { credentials: 'include' });
      const data = await res.json();
      const box = fields.eligibleUserTypesBox;
      if (!box) return;

      box.innerHTML = '';
      (data.types || []).forEach(t => {
        const id = 'ut_' + t.toLowerCase().replace(/\W+/g, '_');
        const wrap = document.createElement('label');
        wrap.className = 'item';
        wrap.setAttribute('for', id);

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.value = t;
        cb.name = 'eligibleUserTypes';

        const txt = document.createElement('span');
        txt.textContent = t;

        wrap.appendChild(cb);
        wrap.appendChild(txt);
        box.appendChild(wrap);
      });
    } catch {
      // leave empty; form still works even if list fails to load
    }
  }

  // CSV from GET -> check the right boxes
  function setEligibleSelections(csv) {
    const box = fields.eligibleUserTypesBox;
    if (!box) return;
    const chosen = new Set((csv || '').split(',').map(s => s.trim()).filter(Boolean));
    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = chosen.has(cb.value);
    });
  }

  // Read selected values -> array for PUT
  function getEligibleSelections() {
    const box = fields.eligibleUserTypesBox;
    if (!box) return [];
    return Array.from(box.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
  }

  function coerceBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    return String(v).toLowerCase() === 'true';
  }

  async function fetchSettings() {
    try {
      // 1) populate options
      await loadUserTypes();

      // 2) hydrate current values
      const res = await fetch('/api/admin/loyalty/program', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setEligibleSelections(data.eligibleUserTypes); // CSV -> checkboxes
      fields.programActive.value = coerceBool(data.active ?? data.programActive) ? 'true' : 'false';
      fields.digestDay.value = data.digestDay ?? 'Mon';
      fields.referralBonus.value = Number(data.referralBonus ?? 0);

      setStatus('Loaded.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to load settings.', false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setStatus('Saving…');

    const payload = {
      eligibleUserTypes: getEligibleSelections(),     // send array; backend accepts CSV or array
      active: fields.programActive.value === 'true' ? 1 : 0,
      digestDay: fields.digestDay.value,
      referralBonus: Number(fields.referralBonus.value || 0),
    };

    try {
      const res = await fetch('/api/admin/loyalty/program', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Optional: rehydrate after save
      const data = await res.json();
      const program = data.program || data;
      setEligibleSelections(program.eligibleUserTypes);

      setStatus('Saved ✔');
    } catch (err) {
      console.error(err);
      setStatus('Save failed.', false);
    }
  }

  form.addEventListener('submit', saveSettings);

  // (Optional) if you have a separate "Advanced…" opener without inline onclick
  document.getElementById('openSettings')?.addEventListener('click', () => {
    const overlay = document.getElementById('lsModal');
    if (overlay) overlay.style.display = 'block';
  });

  fetchSettings();
})();
