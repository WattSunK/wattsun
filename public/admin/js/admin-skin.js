/* WattSun Admin — Single Partial Loader */
(() => {
  const VERSION = (window.__ADMIN_VERSION__ || "0");
  const contentEl = document.getElementById("admin-content");
  const navLinks = Array.from(document.querySelectorAll(".admin-nav .nav-link"));
  const hardRefreshBtn = document.getElementById("hard-refresh");

  function setActive(link) {
    navLinks.forEach(a => a.classList.toggle("is-active", a === link));
  }

  async function loadPartial(id, url) {
    if (!contentEl) return;
    contentEl.setAttribute("aria-busy", "true");
    contentEl.innerHTML = `<div class="loading"><span class="spinner"></span><span>Loading…</span></div>`;
    const bust = url.includes("?") ? `&v=${VERSION}` : `?v=${VERSION}`;
    const finalUrl = `${url}${bust}`;
    try {
      const res = await fetch(finalUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      contentEl.innerHTML = html;
      contentEl.removeAttribute("aria-busy");
      const evt = new CustomEvent('admin:partial-loaded', { detail: { id } });
      window.dispatchEvent(evt);
    } catch (err) {
      console.error("[admin-skin] failed to load partial", id, err);
      contentEl.innerHTML = `<div class="card"><div class="card-header">Failed to load</div><div class="card-body"><p>Could not load <code>${id}</code>. Please check the Network tab.</p><pre style="white-space:pre-wrap;color:#b91c1c;">${String(err)}</pre></div></div>`;
      contentEl.removeAttribute("aria-busy");
    }
  }

  window.AdminSkin = { loadPartial };

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('data-partial');
      const url = link.getAttribute('data-url');
      setActive(link);
      loadPartial(id, url);
      history.replaceState({ id }, "", `#${id}`);
    });
  });

  if (hardRefreshBtn) {
    hardRefreshBtn.addEventListener('click', () => {
      const active = document.querySelector('.admin-nav .nav-link.is-active');
      const id = active?.getAttribute('data-partial') || 'system-status';
      const url = active?.getAttribute('data-url') || '/public/partials/system-status.html';
      loadPartial(id, url);
    });
  }

  const initialId = location.hash?.slice(1) || document.querySelector('.admin-nav .nav-link.is-active')?.getAttribute('data-partial') || 'system-status';
  const initialLink = navLinks.find(a => a.getAttribute('data-partial') === initialId) || navLinks[0];
  if (initialLink) {
    setActive(initialLink);
    loadPartial(initialLink.getAttribute('data-partial'), initialLink.getAttribute('data-url'));
  }
})();