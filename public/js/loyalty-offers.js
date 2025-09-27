(() => {
  const el = (id) => document.getElementById(id);
  const fmt = (n) => new Intl.NumberFormat().format(n);
  const toast = (msg) => {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 2500);
  };

  let program = null;
  let account = null;
  let rank = null;

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
    if (!tag) return;
    tag.textContent = status || '—';
    tag.classList.remove('ok', 'warn', 'err');
    if (status === 'Active') tag.classList.add('ok');
    else if (status === 'Paused') tag.classList.add('warn');
    else if (status === 'Closed') tag.classList.add('err');
  }

  function euro(n) {
    const epp = (program && program.eurPerPoint) || 1;
    return `€${fmt((n || 0) * epp)}`;
  }

  function setMinInfo(minPts) {
    const node = el('minInfo');
    if (node) node.textContent = `Minimum withdrawal: ${fmt(minPts)} pts`;
    const input = el('withdrawPoints');
    if (input) {
      input.min = String(minPts);
      if (parseInt(input.value || '0', 10) < minPts) input.value = String(minPts);
    }
    updateEstimate();
  }

  function updateEstimate() {
    const points = parseInt((el('withdrawPoints')?.value || '0'), 10);
    const eurPerPoint = (program && program.eurPerPoint) || 1;
    const est = el('estimateEUR');
    if (est) est.textContent = `€${fmt(points * eurPerPoint)}`;
    const can =
      account &&
      account.status === 'Active' &&
      (account.points_balance|0) >= points &&
      points >= ((program && program.minWithdrawPoints) || 100) &&
      new Date().toISOString().slice(0, 10) >= (account.eligible_from || '9999-12-31');
    const btn = el('withdrawBtn');
    if (btn) btn.disabled = !can;
  }

  async function loadMe() {
    const data = await api('/api/loyalty/me');
    program = data.program || null;
    account = data.account || null;
    rank = data.rank ?? null;

    const enrollBtn = el('enrollBtn');
    const withdrawCard = el('withdrawCard');
    const historyCard = el('historyCard');

    if (!program) {
      el('pointsBalance').textContent = '—';
      el('eurBalance').textContent = '€—';
      setStatusTag('Unavailable');
      el('dateInfo').textContent = 'Program is not available at this time.';
      if (enrollBtn) enrollBtn.style.display = 'none';
      if (withdrawCard) withdrawCard.style.display = 'none';
      if (historyCard) historyCard.style.display = 'none';
      // Clear KPIs
      ['earnedPts','earnedEur','penaltyPts','penaltyEur','paidPts','paidEur','rankText'].forEach(id => { const n = el(id); if (n) n.textContent = '—'; });
      return;
    }

    setMinInfo(program.minWithdrawPoints || 100);

    if (!account) {
      // Not enrolled yet
      el('pointsBalance').textContent = '—';
      el('eurBalance').textContent = '€—';
      setStatusTag('Not enrolled');
      el('dateInfo').textContent = `Join to start earning. Eligible to withdraw after ${program.withdrawWaitDays || 90} days.`;
      if (enrollBtn) enrollBtn.disabled = false;
      if (withdrawCard) withdrawCard.style.display = 'none';
      if (historyCard) historyCard.style.display = 'none';
      ['earnedPts','earnedEur','penaltyPts','penaltyEur','paidPts','paidEur','rankText'].forEach(id => { const n = el(id); if (n) n.textContent = '—'; });
      return;
    }

    // Enrolled → render KPIs
    if (enrollBtn) enrollBtn.style.display = 'none';
    const epp = program.eurPerPoint || 1;

    el('pointsBalance').textContent = fmt(account.points_balance);
    el('eurBalance').textContent = `€${fmt((account.points_balance || 0) * epp)}`;

    el('earnedPts').textContent = fmt(account.total_earned || 0);
    el('earnedEur').textContent = euro(account.total_earned || 0);

    el('penaltyPts').textContent = fmt(account.total_penalty || 0);
    el('penaltyEur').textContent = euro(account.total_penalty || 0);

    el('paidPts').textContent = fmt(account.total_paid || 0);
    el('paidEur').textContent = euro(account.total_paid || 0);

    setStatusTag(account.status);
    el('dateInfo').textContent = `Start ${account.start_date} • Eligible ${account.eligible_from} • End ${account.end_date}`;

    el('rankText').textContent = (rank == null) ? '—' : `#${fmt(rank)}`;

    if (withdrawCard) withdrawCard.style.display = 'block';
    if (historyCard) historyCard.style.display = 'block';
    await loadWithdrawals();
    updateEstimate();
  }

  async function loadWithdrawals() {
    const data = await api('/api/loyalty/withdrawals');
    const body = el('historyBody');
    if (!body) return;
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
    const btn = el('enrollBtn'); if (btn) btn.disabled = true;
    try {
      const data = await api('/api/loyalty/enroll', { method: 'POST' });
      toast(data.message || 'Enrolled');
      await loadMe();
    } catch (e) {
      toast(`Enroll failed: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function doWithdraw() {
    const points = parseInt((el('withdrawPoints')?.value || '0'), 10);
    const btn = el('withdrawBtn'); if (btn) btn.disabled = true;
    const msg = el('withdrawMsg'); if (msg) msg.textContent = '';
    try {
      const data = await api('/api/loyalty/withdraw', { method: 'POST', body: { points } });
      toast('Withdrawal requested');
      if (el('withdrawPoints')) el('withdrawPoints').value = String(Math.max(points, (program && program.minWithdrawPoints) || 100));
      await loadMe();
      if (msg) msg.textContent = `Request #${data.withdrawal.id} created for ${points} pts (${euro(points)}).`;
    } catch (e) {
      if (msg) msg.textContent = `Error: ${e.message}`;
    } finally {
      if (btn) btn.disabled = false;
      updateEstimate();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    el('enrollBtn')?.addEventListener('click', enroll);
    el('withdrawPoints')?.addEventListener('input', updateEstimate);
    el('withdrawBtn')?.addEventListener('click', doWithdraw);
    loadMe().catch((e) => toast(`Load failed: ${e.message}`));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadMe().catch(() => {});
    });
  });
})();
