(() => {
  const el = (id) => document.getElementById(id);
  const fmt = (n) => new Intl.NumberFormat().format(n);
  const toast = (msg) => {
    const t = el('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 2500);
  };

  let program = null;
  let account = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function setStatusTag(status) {
    const tag = el('statusTag');
    tag.textContent = status || '—';
    tag.classList.remove('ok', 'warn', 'err');
    if (status === 'Active') tag.classList.add('ok');
    else if (status === 'Paused') tag.classList.add('warn');
    else if (status === 'Closed') tag.classList.add('err');
  }

  function setMinInfo(minPts) {
    el('minInfo').textContent = `Minimum withdrawal: ${fmt(minPts)} pts`;
    const input = el('withdrawPoints');
    input.min = String(minPts);
    if (parseInt(input.value || '0', 10) < minPts) input.value = String(minPts);
    updateEstimate();
  }

  function updateEstimate() {
    const points = parseInt(el('withdrawPoints').value || '0', 10);
    const eurPerPoint = (program && program.eurPerPoint) || 1;
    el('estimateEUR').textContent = `€${fmt(points * eurPerPoint)}`;
    const can =
      account &&
      account.status === 'Active' &&
      account.points_balance >= points &&
      points >= ((program && program.minWithdrawPoints) || 100) &&
      new Date().toISOString().slice(0, 10) >= account.eligible_from;
    el('withdrawBtn').disabled = !can;
  }

  async function loadMe() {
    const data = await api('/api/loyalty/me');
    program = data.program || null;
    account = data.account || null;

    const enrollBtn = el('enrollBtn');
    const withdrawCard = el('withdrawCard');
    const historyCard = el('historyCard');

    if (!program) {
      // Program not configured; hide everything but message
      el('pointsBalance').textContent = '—';
      el('eurBalance').textContent = '€—';
      setStatusTag('Unavailable');
      el('dateInfo').textContent = 'Program is not available at this time.';
      enrollBtn.style.display = 'none';
      withdrawCard.style.display = 'none';
      historyCard.style.display = 'none';
      return;
    }

    setMinInfo(program.minWithdrawPoints || 100);

    if (!account) {
      // Not enrolled yet
      el('pointsBalance').textContent = '—';
      el('eurBalance').textContent = '€—';
      setStatusTag('Not enrolled');
      el('dateInfo').textContent = `Join to start earning. Eligible to withdraw after ${program.withdrawWaitDays || 90} days.`;
      enrollBtn.disabled = false;
      withdrawCard.style.display = 'none';
      historyCard.style.display = 'none';
      return;
    }

    // Enrolled
    enrollBtn.style.display = 'none';
    const eurPerPoint = program.eurPerPoint || 1;
    el('pointsBalance').textContent = fmt(account.points_balance);
    el('eurBalance').textContent = `€${fmt((account.points_balance || 0) * eurPerPoint)}`;
    setStatusTag(account.status);
    el('dateInfo').textContent = `Start ${account.start_date} • Eligible ${account.eligible_from} • End ${account.end_date}`;

    withdrawCard.style.display = 'block';
    historyCard.style.display = 'block';
    await loadWithdrawals();
    updateEstimate();
  }

  async function loadWithdrawals() {
    const data = await api('/api/loyalty/withdrawals');
    const body = el('historyBody');
    body.innerHTML = '';
    const rows = data.withdrawals || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted">No withdrawals yet.</td></tr>`;
      return;
    }
    for (const w of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${w.id}</td>
        <td>${fmt(w.requested_pts)} pts / €${fmt(w.requested_eur)}</td>
        <td>${w.status}</td>
        <td>${w.requested_at || ''}</td>
        <td>${w.decided_at || ''}</td>
        <td>${w.paid_at || ''}</td>
        <td class="right">${w.payout_ref || ''}</td>
      `;
      body.appendChild(tr);
    }
  }

  async function enroll() {
    el('enrollBtn').disabled = true;
    try {
      const data = await api('/api/loyalty/enroll', { method: 'POST' });
      toast(data.message || 'Enrolled');
      await loadMe();
    } catch (e) {
      toast(`Enroll failed: ${e.message}`);
    } finally {
      el('enrollBtn').disabled = false;
    }
  }

  async function doWithdraw() {
    const points = parseInt(el('withdrawPoints').value || '0', 10);
    el('withdrawBtn').disabled = true;
    el('withdrawMsg').textContent = '';
    try {
      const data = await api('/api/loyalty/withdraw', { method: 'POST', body: { points } });
      toast('Withdrawal requested');
      el('withdrawPoints').value = String(Math.max(points, (program && program.minWithdrawPoints) || 100));
      await loadMe();
      el('withdrawMsg').textContent = `Request #${data.withdrawal.id} created for ${points} pts (€${points * ((program && program.eurPerPoint) || 1)}).`;
    } catch (e) {
      el('withdrawMsg').textContent = `Error: ${e.message}`;
    } finally {
      el('withdrawBtn').disabled = false;
      updateEstimate();
    }
  }

  // Events
  document.addEventListener('DOMContentLoaded', () => {
    el('enrollBtn').addEventListener('click', enroll);
    el('withdrawPoints').addEventListener('input', updateEstimate);
    el('withdrawBtn').addEventListener('click', doWithdraw);
    loadMe().catch((e) => toast(`Load failed: ${e.message}`));
    // Optional soft refresh on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadMe().catch(() => {});
    });
  });
})();
