// /public/admin/js/admin-users.js
// Stable build: works standalone or via injected dashboard sections.
// Follows the same robust pattern as myorders.js

(function () {
  const PAGE_SIZE = 10; // adjust as needed

  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: null,
    search: null,
    type: null,
    status: null,
    searchBtn: null,
    clearBtn: null,
    count: null,
    pageNum: null,
    first: null,
    prev: null,
    next: null,
    last: null
  };

  let all = [];
  let filtered = [];
  let page = 1;

  function bindDOM() {
    els.tbody = $('users-table-body');
    els.search = $('user-search-input');
    els.type = $('user-type-filter');
    els.status = $('user-status-filter');
    els.searchBtn = $('user-search-btn');
    els.clearBtn = $('user-clear-btn');
    els.count = $('users-count');
    els.pageNum = $('users-page-num');
    els.first = $('users-first');
    els.prev = $('users-prev');
    els.next = $('users-next');
    els.last = $('users-last');
  }

  async function fetchUsers() {
    if (!els.tbody) return;
    els.tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>`;

    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let users = await res.json();

      all = Array.isArray(users) ? users : [];
      applyFilters();
      render();
    } catch (e) {
      console.error('[admin-users] fetch failed', e);
      if (els.tbody) {
        els.tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;">Error loading users</td></tr>`;
      }
    }
  }

  function applyFilters() {
    const search = (els.search?.value || '').toLowerCase();
    const type = els.type?.value || 'All';
    const status = els.status?.value || 'All';

    filtered = all.filter(u =>
      (!search || [u.name, u.email, u.phone].some(v => v?.toLowerCase().includes(search))) &&
      (type === 'All' || u.type === type) &&
      (status === 'All' || u.status === status)
    );

    page = 1;
  }

  function render() {
    if (!els.tbody) return;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    page = Math.min(page, totalPages);

    const start = (page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);

    els.tbody.innerHTML = rows.map((u, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td>${u.name || '—'}</td>
        <td>${u.email || '—'}</td>
        <td>${u.phone || '—'}</td>
        <td>${u.type || '—'}</td>
        <td>${u.status || '—'}</td>
        <td>${u.createdAt || '—'}</td>
        <td>${u.updatedAt || '—'}</td>
        <td style="text-align:center;">
          <button class="admin-action" data-view="${u.id}">View</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="9" style="text-align:center;">No users found</td></tr>`;

    if (els.count) els.count.textContent = `Showing ${rows.length} of ${total} entries`;
    if (els.pageNum) els.pageNum.textContent = String(page);

    if (els.first) els.first.disabled = page <= 1;
    if (els.prev)  els.prev.disabled  = page <= 1;
    if (els.next)  els.next.disabled  = page >= totalPages;
    if (els.last)  els.last.disabled  = page >= totalPages;
  }

  function bindEvents() {
    els.searchBtn?.addEventListener('click', () => { applyFilters(); render(); });
    els.clearBtn?.addEventListener('click', () => {
      if (els.search) els.search.value = '';
      if (els.type) els.type.value = 'All';
      if (els.status) els.status.value = 'All';
      applyFilters();
      render();
    });
    els.search?.addEventListener('input', () => { applyFilters(); render(); });

    els.first?.addEventListener('click', () => { page = 1; render(); });
    els.prev ?.addEventListener('click', () => { page = Math.max(1, page - 1); render(); });
    els.next ?.addEventListener('click', () => { page = page + 1; render(); });
    els.last ?.addEventListener('click', () => { page = Math.ceil(filtered.length / PAGE_SIZE); render(); });

    els.tbody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      const id = btn.getAttribute('data-view');
      console.log('View user', id);
    });
  }

  // Public entry
  window.initAdminUsers = async function initAdminUsers() {
    bindDOM();
    bindEvents();
    await fetchUsers();
  };

  // Standalone safety for admin-users.html
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('users-table-body') && !window.__adminUsersBooted) {
      window.__adminUsersBooted = true;
      window.initAdminUsers();
    }
  });

})();
