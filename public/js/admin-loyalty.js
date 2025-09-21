(() => {
  const el = (id) => document.getElementById(id);
  const fmt = (n) => new Intl.NumberFormat().format(n);
  const toast = (msg) => { const t = el('toast'); t.textContent = msg; t.style.display='block'; setTimeout(()=>t.style.display='none', 2600); };
  const api = async (path, opts={}) => {
    const res = await fetch(path, { method:opts.method||'GET', headers:{'Content-Type':'application/json'}, body:opts.body?JSON.stringify(opts.body):undefined, credentials:'include' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok || data.success===false) { throw new Error((data.error&&data.error.message)||`HTTP ${res.status}`); }
    return data;
  };

  function statusPill(s) {
    const map = { Pending:'p', Approved:'a', Rejected:'r', Paid:'pay' };
    return `<span class="pill ${map[s]||''}">${s}</span>`;
  }

  async function loadList() {
    const status = el('statusSel').value;
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await api(`/api/admin/loyalty/withdrawals${q}`);
    const body = el('wdBody');
    body.innerHTML = '';
    const rows = data.withdrawals || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9" class="muted">No rows.</td></tr>`;
      return;
    }
    for (const w of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${w.id}</td>
        <td>${w.user_id}</td>
        <td>${fmt(w.requested_pts)}</td>
        <td>€${fmt(w.requested_eur)}</td>
        <td>${statusPill(w.status)}</td>
        <td>${w.requested_at||''}</td>
        <td>${w.decided_at||''}</td>
        <td>${w.paid_at||''}</td>
        <td class="right">
          ${w.status==='Pending' ? `
            <button data-act="approve" data-id="${w.id}">Approve</button>
            <button data-act="reject" data-id="${w.id}">Reject</button>
          ` : ''}
          ${w.status==='Approved' ? `
            <button data-act="paid" data-id="${w.id}">Mark Paid</button>
          ` : ''}
        </td>
      `;
      body.appendChild(tr);
    }
  }

  async function onAction(evt) {
    const btn = evt.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    try {
      if (act === 'approve') {
        const note = prompt('Approval note (optional):','OK');
        await api(`/api/admin/loyalty/withdrawals/${id}/decision`, { method:'POST', body:{ approve:true, note } });
        toast(`Withdrawal #${id} approved`);
      } else if (act === 'reject') {
        const note = prompt('Reason for rejection:','');
        await api(`/api/admin/loyalty/withdrawals/${id}/decision`, { method:'POST', body:{ approve:false, note } });
        toast(`Withdrawal #${id} rejected`);
      } else if (act === 'paid') {
        const payoutRef = prompt('Payout reference (e.g., SEPA id):','SEPA-');
        await api(`/api/admin/loyalty/withdrawals/${id}/mark-paid`, { method:'POST', body:{ payoutRef } });
        toast(`Withdrawal #${id} marked Paid`);
      }
      await loadList();
    } catch (e) {
      toast(`Action failed: ${e.message}`);
    }
  }

  // Auto-refresh
  let timer = null;
  function setAutoRefresh() {
    if (timer) { clearInterval(timer); timer = null; }
    const secs = parseInt(el('autoRefresh').value||'0',10);
    if (secs>0) timer = setInterval(loadList, secs*1000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    el('refreshBtn').addEventListener('click', loadList);
    el('wdBody').addEventListener('click', onAction);
    el('statusSel').addEventListener('change', loadList);
    el('autoRefresh').addEventListener('change', setAutoRefresh);
    loadList().catch(e => toast(`Load failed: ${e.message}`));
  });
})();
