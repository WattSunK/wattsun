// Loyalty Program Settings — Global (Card)
// Loads/saves only the high-level fields that live on the card.
// Advanced fields are handled by the modal script.

(function () {
  const form = document.getElementById('loyalty-settings-form');
  if (!form) return;

  const statusEl = document.getElementById('loyalty-settings-status');

  const fields = {
    eligibleUserTypes: document.getElementById('eligibleUserTypes'),
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
// Multi-select helpers
async function loadUserTypes() {
  const res = await fetch('/api/admin/loyalty/user-types', { credentials: 'include' });
  const data = await res.json();
  const sel = fields.eligibleUserTypes; // now a <select multiple>
  if (!sel) return;
  sel.innerHTML = '';
  (data.types || []).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
}
function setEligibleSelections(csv) {
  const sel = fields.eligibleUserTypes;
  const chosen = (csv || '').split(',').map(s => s.trim()).filter(Boolean);
  [...sel.options].forEach(o => { o.selected = chosen.includes(o.value); });
}
function getEligibleSelections() {
  const sel = fields.eligibleUserTypes;
  return [...sel.selectedOptions].map(o => o.value);
}

  function coerceBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    return String(v).toLowerCase() === 'true';
  }

 async function fetchSettings() {
  try {
    await loadUserTypes(); // populate options first
    const res = await fetch('/api/admin/loyalty/program', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    setEligibleSelections(data.eligibleUserTypes); // CSV -> selections
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
     eligibleUserTypes: getEligibleSelections(),  // send array; backend accepts CSV or array
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
      setStatus('Saved ✔');
    } catch (err) {
      console.error(err);
      setStatus('Save failed.', false);
    }
  }

  form.addEventListener('submit', saveSettings);

  // Open Advanced modal
  document.getElementById('openSettings')?.addEventListener('click', () => {
    const overlay = document.getElementById('lsModal');
    if (overlay) overlay.style.display = 'block';
  });

  fetchSettings();
})();
