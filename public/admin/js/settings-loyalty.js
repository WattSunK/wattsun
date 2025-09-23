// Loyalty Program Settings – Admin
// Wires the form in public/partials/settings.html to the backend

(function () {
  const form = document.getElementById('loyalty-settings-form');
  if (!form) return;

  const statusEl = document.getElementById('loyalty-settings-status');

  const fields = {
    dailyAccrualPoints: document.getElementById('dailyAccrualPoints'),
    signupBonus: document.getElementById('signupBonus'),
    referralBonus: document.getElementById('referralBonus'),
    minWithdrawalPoints: document.getElementById('minWithdrawalPoints'),
    pointsPerKES: document.getElementById('pointsPerKES'),
    digestDay: document.getElementById('digestDay'),
    enableDailyAccrual: document.getElementById('enableDailyAccrual'),
  };

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove('error', 'ok');
    statusEl.classList.add(ok ? 'ok' : 'error');
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/loyalty/program', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Populate with defaults if missing
      fields.dailyAccrualPoints.value = +data.dailyAccrualPoints ?? 0;
      fields.signupBonus.value       = +data.signupBonus ?? 0;
      fields.referralBonus.value     = +data.referralBonus ?? 0;
      fields.minWithdrawalPoints.value = +data.minWithdrawalPoints ?? 0;
      fields.pointsPerKES.value      = data.pointsPerKES ?? 1;
      fields.digestDay.value         = data.digestDay ?? 'Mon';
      fields.enableDailyAccrual.checked = !!(data.enableDailyAccrual === true || data.enableDailyAccrual === 'true' || data.enableDailyAccrual === 1);

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
      dailyAccrualPoints: Number(fields.dailyAccrualPoints.value || 0),
      signupBonus: Number(fields.signupBonus.value || 0),
      referralBonus: Number(fields.referralBonus.value || 0),
      minWithdrawalPoints: Number(fields.minWithdrawalPoints.value || 0),
      pointsPerKES: Number(fields.pointsPerKES.value || 1),
      digestDay: fields.digestDay.value,
      enableDailyAccrual: fields.enableDailyAccrual.checked ? 1 : 0,
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
  fetchSettings();
})();
