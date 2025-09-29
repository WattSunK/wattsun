// public/js/loyalty-offers.js
(() => {
  // ---- module scaffold (global, idempotent) ----
  const NS = (window.WS_LOYALTY_OFFERS = window.WS_LOYALTY_OFFERS || {});
  let booted = false;

  // ---- small DOM utils ----
  const el = (id) => document.getElementById(id);
  const qs = (id) => document.getElementById(id);
  const fmt = (n) => new Intl.NumberFormat().format(n);

  const show = (id, mode = 'block') => { const n = qs(id); if (n) n.style.display = mode; };
  const hide = (id) => { const n = qs(id); if (n) n.style.display = 'none'; };

  const toast = (msg) => {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 2500);
  };

  function setLoadState(text) {
    const n = el('loadState');
    if (n) n.textContent = text;
  }

  function startLoading() {
    show('offersSkeleton', 'block');
    hide('offersError');
    hide('offersEmpty');
    hide('accountCard');
    hide('withdrawCard');
    hide('historyCard');
    setLoadState('Loading…');
  }

  function showError(msg) {
    hide('offersSkeleton');
    const m = qs('offersErrorMsg');
    if (m) m.textContent = msg || 'Please try again.';
    show('offersError', 'block');
    setLoadState('Error loading data');
  }

  function showEmpty() {
    hide('offersSkeleton');
    hide('offersError');
    show('offersEmpty', 'block');
    hide('accountCard');
    hide('withdrawCard');
    hide('historyCard');
    setLoadState('No account yet');
    // Explicitly unhide Enroll in empty state
  const b = el('enrollBtn');
  if (b) {
    b.disabled = false;
    b.style.display = 'inline-block';
    b.classList.remove('hidden');
  }
  }

  function showAccount() {
  hide('offersSkeleton');
  hide('offersError');
  hide('offersEmpty');
  show('accountCard', 'block');

  // extra guard: never show Enroll once account exists
  const b = el('enrollBtn');
  if (b) b.style.display = 'none';
}

  // ---- state ----
  let program = null;
  let account = null;
  let rank = null;

  // ---- API helper ----
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include'
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data.success === false) {
      const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---- UI helpers ----
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

    const today = new Date().toISOString().slice(0, 10);
    const minPts = (program && program.minWithdrawPoints) || 100;
    const eligibleFrom = (account && account.eligible_from) || '9999-12-31';

    const can =
      !!account &&
      account.status === 'Active' &&
      (account.points_balance | 0) >= points &&
      points >= minPts &&
      today >= eligibleFrom;

    const btn = el('withdrawBtn');
    if (btn) btn.disabled = !can;
  }

  // ---- core loaders ----
  async function loadMe() {
    const data = await api('/api/loyalty/me');
    program = data.program || null;
    account = data.account || null;
    rank = (data.rank !== undefined) ? data.rank : null;

    const enrollBtn = el('enrollBtn');
    const withdrawCard = el('withdrawCard');
    const historyCard = el('historyCard');

    // 1) Program missing → error
    // 1) Program missing → error
if (!program) {
  showError('Program is currently unavailable.');
  [
    'pointsBalance','eurBalance','earnedPts','earnedEur',
    'penaltyPts','penaltyEur','paidPts','paidEur',
    'rankText','dateInfo'
  ].forEach(id => {
    const n = el(id);
    if (n) n.textContent = (id.includes('Eur') || id === 'eurBalance') ? '€–' : '–';
  });

  // always hide enroll in this case
  const b = el('enrollBtn');
  if (b) b.style.display = 'none';

  if (withdrawCard) withdrawCard.style.display = 'none';
  if (historyCard) historyCard.style.display = 'none';
  return;
}


    // 2) Program ok → set min info
    setMinInfo(program.minWithdrawPoints || 100);

    // 3) No account → empty state
if (!account) {
  showEmpty();

  // allow enroll if button exists
const b = el('enrollBtn');
if (b) {
  b.disabled = false;
  b.style.display = 'inline-block';   // explicit show
  b.classList.remove('hidden');       // safety if CSS uses .hidden
}

  if (withdrawCard) withdrawCard.style.display = 'none';
  if (historyCard) historyCard.style.display = 'none';
  return;
}

    // 4) Account present → render
    const epp = program.eurPerPoint || 1;

    el('pointsBalance') && (el('pointsBalance').textContent = fmt(account.points_balance));
    el('eurBalance') && (el('eurBalance').textContent = `€${fmt((account.points_balance || 0) * epp)}`);

    el('earnedPts') && (el('earnedPts').textContent = fmt(account.total_earned || 0));
    el('earnedEur') && (el('earnedEur').textContent = euro(account.total_earned || 0));

    el('penaltyPts') && (el('penaltyPts').textContent = fmt(account.total_penalty || 0));
    el('penaltyEur') && (el('penaltyEur').textContent = euro(account.total_penalty || 0));

    el('paidPts') && (el('paidPts').textContent = fmt(account.total_paid || 0));
    el('paidEur') && (el('paidEur').textContent = euro(account.total_paid || 0));

    setStatusTag(account.status);
    const di = el('dateInfo');
    if (di) di.textContent = `Start ${account.start_date} • Eligible ${account.eligible_from} • End ${account.end_date}`;
    const rk = el('rankText');
    if (rk) rk.textContent = (rank == null) ? '—' : `#${fmt(rank)}`;

    showAccount(); // reveal KPI card

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

  // ---- actions ----
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
      if (el('withdrawPoints')) {
        const minPts = (program && program.minWithdrawPoints) || 100;
        el('withdrawPoints').value = String(Math.max(points, minPts));
      }
      await loadMe();
      if (msg) msg.textContent = `Request #${data.withdrawal.id} created for ${points} pts (${euro(points)}).`;
    } catch (e) {
      if (msg) msg.textContent = `Error: ${e.message}`;
    } finally {
      if (btn) btn.disabled = false;
      updateEstimate();
    }
  }

  // ---- public init (idempotent) ----
  NS.init = function init() {
    if (booted) return;
    // Only run if the Offers markup is present
    if (!el('paneLoyalty')) return;
    booted = true;

    // Wire events once
    el('enrollBtn')?.addEventListener('click', enroll);
    el('withdrawPoints')?.addEventListener('input', updateEstimate);
    el('withdrawBtn')?.addEventListener('click', doWithdraw);
    qs('offersRetry')?.addEventListener('click', () => {
      startLoading();
      loadMe().catch((e) => showError(e.message));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadMe().catch(() => {});
      }
    });

    // First load
    startLoading();
    loadMe().catch((e) => showError(e.message));
  };

  // ---- auto-init for standalone page ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (el('paneLoyalty')) NS.init();
    });
  } else {
    if (el('paneLoyalty')) NS.init();
  }
})();
