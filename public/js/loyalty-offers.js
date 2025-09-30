// public/js/loyalty-offers.js
// - Optimistic insert → reconcile with server row, then loadMe()
// - Tolerant account totals mapping (paid/earned/penalty/balance)
// - NEW: 'Paid' fallback computed as earned - penalty - balance when the API omits a paid field
// - NEW: Note below the history table if admin-initiated payouts exist but aren't listed by the customer endpoint

(() => {
  const NS = (window.WS_LOYALTY_OFFERS = window.WS_LOYALTY_OFFERS || {});
  let booted = false;

  const el   = (id) => document.getElementById(id);
  const show = (id, mode = "block") => { const n = el(id); if (n) n.style.display = mode; };
  const hide = (id) => { const n = el(id); if (n) n.style.display = "none"; };
  const fmt  = (n) => new Intl.NumberFormat().format(n);

  const toast = (msg) => {
    const t = el("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 2500);
  };

  function setLoadState(text) {
    const n = el("loadState");
    if (n) n.textContent = text;
  }

  function startLoading() {
    show("offersSkeleton", "block");
    hide("offersError");
    hide("offersEmpty");
    hide("accountCard");
    hide("withdrawCard");
    hide("historyCard");
    setLoadState("Loading…");
  }

  function showError(msg) {
    hide("offersSkeleton");
    const m = el("offersErrorMsg");
    if (m) m.textContent = msg || "Please try again.";
    show("offersError", "block");
    setLoadState("Error loading data");
  }

  function showEmpty() {
    hide("offersSkeleton");
    hide("offersError");
    show("offersEmpty", "block");
    hide("accountCard");
    hide("withdrawCard");
    hide("historyCard");
    setLoadState("No account yet");

    const b = el("enrollBtn");
    if (b) {
      b.disabled = false;
      b.style.display = "inline-block";
      b.classList?.remove("hidden");
    }
  }

  function showAccount() {
    hide("offersSkeleton");
    hide("offersError");
    hide("offersEmpty");
    show("accountCard", "block");
    const b = el("enrollBtn");
    if (b) b.style.display = "none";
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
    });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok || data.success === false) {
      const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // state
  let program = null;
  let account = null;
  let rank = null;

  const euro = (pts) => {
    const epp = (program && program.eurPerPoint) || 1;
    return `€${fmt((pts || 0) * epp)}`;
  };

  function setStatusTag(status) {
    const tag = el("statusTag");
    if (!tag) return;
    tag.textContent = status || "—";
    tag.classList.remove("ok", "warn", "err");
    if (status === "Active") tag.classList.add("ok");
    else if (status === "Paused") tag.classList.add("warn");
    else if (status === "Closed") tag.classList.add("err");
  }

  function setMinInfo(minPts) {
    el("minInfo") && (el("minInfo").textContent = `Minimum withdrawal: ${fmt(minPts)} pts`);
    const input = el("withdrawPoints");
    if (input) {
      input.min = String(minPts);
      if (parseInt(input.value || "0", 10) < minPts) input.value = String(minPts);
    }
    updateEstimate();
  }

  function updateEstimate() {
    const input  = el("withdrawPoints");
    const points = parseInt((input && input.value) || "0", 10);

    const epp = (program && program.eurPerPoint) || 1;
    el("estimateEUR") && (el("estimateEUR").textContent = `€${fmt(points * epp)}`);

    const today        = new Date().toISOString().slice(0, 10);
    const minPts       = (program && program.minWithdrawPoints) || 100;
    const eligibleFrom = (account && account.eligible_from) || "9999-12-31";

    const can =
      !!account &&
      account.status === "Active" &&
      (account.points_balance | 0) >= points &&
      points >= minPts &&
      today >= eligibleFrom;

    const btn = el("withdrawBtn");
    if (btn) btn.disabled = !can;

    const hint = el("withdrawHint");
    if (hint) {
      let reason = "";
      if (!account || account.status !== "Active") {
        reason = "Account not active.";
      } else if ((account.points_balance | 0) < points) {
        reason = `You only have ${fmt(account.points_balance | 0)} pts.`;
      } else if (points < minPts) {
        reason = `Minimum withdrawal: ${fmt(minPts)} pts.`;
      } else if (today < eligibleFrom) {
        reason = `Not eligible until ${eligibleFrom}.`;
      }
      hint.textContent = can ? "" : reason;
    }
  }

  async function loadMe() {
    const data = await api("/api/loyalty/me");
    program = data.program || null;
    account = data.account || null;
    rank    = (data.rank !== undefined) ? data.rank : null;

    const withdrawCard = el("withdrawCard");
    const historyCard  = el("historyCard");

    if (!program) {
      showError("Program is currently unavailable.");

      ["pointsBalance","earnedPts","penaltyPts","paidPts","rankText","dateInfo"]
        .forEach((id) => { const n = el(id); if (n) n.textContent = "—"; });
      el("eurBalance") && (el("eurBalance").textContent = "€—");
      ["earnedEur","penaltyEur","paidEur"].forEach((id) => {
        const n = el(id); if (n) n.textContent = "€—";
      });

      const b = el("enrollBtn"); if (b) b.style.display = "none";
      if (withdrawCard) withdrawCard.style.display = "none";
      if (historyCard) historyCard.style.display = "none";
      return;
    }

    setMinInfo(program.minWithdrawPoints || 100);

    if (!account) {
      showEmpty();
      const b = el("enrollBtn");
      if (b) {
        b.disabled = false;
        b.style.display = "inline-block";
        b.classList?.remove("hidden");
      }
      if (withdrawCard) withdrawCard.style.display = "none";
      if (historyCard) historyCard.style.display = "none";
      return;
    }

    // --- tolerant mapping for account totals
    const ptsBalance = (account.points_balance ?? account.balance_pts ?? 0);
    const earned     = (account.earned_total  ?? account.total_earned  ?? 0);
    const penalty    = (account.penalty_total ?? account.total_penalty ?? 0);

    // Paid can be named differently depending on server build; accept several aliases
    const paidAliases = [
      account.paid_total,
      account.total_paid,
      account.paid,
      account.totalPaid,
      account.withdraw_paid_total,
      account.withdrawn_total
    ];
    let paid = 0;
    for (const v of paidAliases) {
      if (v !== undefined && v !== null && !Number.isNaN(Number(v))) { paid = Number(v); break; }
    }

    // Fallback: if server doesn't provide "paid", derive it from other totals (authoritative for display)
    const computedPaid = Math.max(0, (Number(earned) || 0) - (Number(penalty) || 0) - (Number(ptsBalance) || 0));
    if (paid <= 0 && computedPaid > 0) paid = computedPaid;

    // expose totals for the history reconciliation note
    NS._paidTotalPts = paid;

    // KPIs
    el("pointsBalance") && (el("pointsBalance").textContent = fmt(ptsBalance));
    el("eurBalance")    && (el("eurBalance").textContent    = euro(ptsBalance));

    el("earnedPts") && (el("earnedPts").textContent = fmt(earned));
    el("earnedEur") && (el("earnedEur").textContent = euro(earned));

    el("penaltyPts") && (el("penaltyPts").textContent = fmt(penalty));
    el("penaltyEur") && (el("penaltyEur").textContent = euro(penalty));

    el("paidPts") && (el("paidPts").textContent = fmt(paid));
    el("paidEur") && (el("paidEur").textContent = euro(paid));

    setStatusTag(account.status);
    el("dateInfo") && (el("dateInfo").textContent =
      `Start ${account.start_date} • Eligible ${account.eligible_from} • End ${account.end_date}`);
    el("rankText") && (el("rankText").textContent = (rank == null) ? "—" : `#${fmt(rank)}`);

    showAccount();
    if (withdrawCard) withdrawCard.style.display = "block";
    if (historyCard)  historyCard.style.display  = "block";

    await loadWithdrawals();
    updateEstimate();
  }

  async function loadWithdrawals() {
    const tbody = el("historyBody");
    const historyCard = el("historyCard");
    const infoId = "historyInfoNote";

    // clean previous info note
    const prev = document.getElementById(infoId);
    if (prev) prev.remove();

    if (!tbody) return;
    tbody.innerHTML = "";

    try {
      const data = await api("/api/loyalty/withdrawals");
      const rows = data.withdrawals || data.items || [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="muted">No withdrawals yet.</td></tr>`;
      } else {
        let paidInList = 0;
        for (const w of rows) {
          const pts = Number(w.points ?? w.requested_pts ?? 0) || 0;
          const status = String(w.status || "").toLowerCase();
          if (status === "paid") paidInList += Math.abs(pts);

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${w.id}</td>
            <td>${fmt(pts)} pts / ${euro(pts)}</td>
            <td>${w.status || ""}</td>
            <td>${w.requested_at || w.request_date || ""}</td>
            <td>${w.decided_at || ""}</td>
            <td>${w.paid_at || ""}</td>
            <td class="right">${w.payout_ref || ""}</td>
          `;
          tbody.appendChild(tr);
        }

        // If admin-triggered payouts exist but the customer endpoint didn't list them,
        // show a tiny explanatory note so the totals vs table don't look contradictory.
        const totalPaid = Number(NS._paidTotalPts || 0);
        if (historyCard && totalPaid > paidInList) {
          const note = document.createElement("div");
          note.id = infoId;
          note.style.marginTop = "6px";
          note.style.fontSize = "12px";
          note.style.color = "#666";
          note.textContent = "Note: Some payouts may have been processed by the admin and might not appear in this list. Totals above include all payouts.";
          historyCard.appendChild(note);
        }
      }
    } catch (_) {
      // leave table empty on error
    }
  }

  async function enroll() {
    const btn = el("enrollBtn"); if (btn) btn.disabled = true;
    try {
      const data = await api("/api/loyalty/enroll", { method: "POST" });
      toast(data.message || "Enrolled");
      await loadMe();
    } catch (e) {
      toast(`Enroll failed: ${e.message}`);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function doWithdraw() {
    const input = el("withdrawPoints");
    const points = parseInt((input && input.value) || "0", 10);
    const btn = el("withdrawBtn"); if (btn) btn.disabled = true;
    const msg = el("withdrawMsg"); if (msg) msg.textContent = "";

    // Optimistic row
    const tbody = el("historyBody");
    const tempId = `temp-${Date.now()}`;
    let tempTr = null;
    if (tbody) {
      tempTr = document.createElement("tr");
      tempTr.dataset.temp = "true";
      tempTr.id = `wd-${tempId}`;
      const now = new Date().toISOString().slice(0,19).replace("T"," ");
      tempTr.innerHTML = `
        <td>—</td>
        <td>${fmt(points)} pts / ${euro(points)}</td>
        <td>Pending</td>
        <td>${now}</td>
        <td></td>
        <td></td>
        <td class="right"></td>
      `;
      if (tbody.firstChild) tbody.insertBefore(tempTr, tbody.firstChild);
      else tbody.appendChild(tempTr);
    }

    try {
      const data = await api("/api/loyalty/withdraw", { method: "POST", body: { points } });
      toast("Withdrawal requested");

      // Reconcile optimistic row with server row
      if (tempTr && data && data.withdrawal) {
        const tds = tempTr.querySelectorAll("td");
        if (tds[0]) tds[0].textContent = data.withdrawal.id ?? "—";
        if (tds[2]) tds[2].textContent = data.withdrawal.status || "Pending";
        tempTr.dataset.temp = "false";
      }

      // Reset input up to min
      if (input) {
        const minPts = (program && program.minWithdrawPoints) || 100;
        input.value = String(Math.max(points, minPts));
      }

      // Full reload ensures cards (Balance/Paid) are canonical
      await loadMe();

      if (msg && data && data.withdrawal && data.withdrawal.id) {
        msg.textContent = `Request #${data.withdrawal.id} created for ${points} pts (${euro(points)}).`;
      }
    } catch (e) {
      const tb = el("historyBody");
      if (tb) {
        const doomed = tb.querySelector('tr[data-temp="true"]');
        if (doomed) doomed.remove();
      }
      if (msg) msg.textContent = `Error: ${e.message}`;
    } finally {
      if (btn) btn.disabled = false;
      updateEstimate();
    }
  }

  NS.init = () => {
    if (booted) return;
    if (!el("paneLoyalty")) return;
    booted = true;

    el("enrollBtn")?.addEventListener("click", enroll);
    el("withdrawBtn")?.addEventListener("click", doWithdraw);
    el("withdrawPoints")?.addEventListener("input", updateEstimate);
    el("offersRetry")?.addEventListener("click", () => {
      startLoading();
      loadMe().catch((e) => showError(e.message));
    });

    startLoading();
    loadMe().catch((e) => showError(e.message));
  };

  const bootIfReady = () => { if (el("paneLoyalty")) NS.init(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootIfReady);
  } else {
    bootIfReady();
  }
})();
