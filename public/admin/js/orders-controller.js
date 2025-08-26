// public/admin/js/orders-controller.js (v6.5-fallback)
(function(){
  const tbodySel = "#orders-table tbody, #ordersTbody";
  let page = 1, per = 10, q = "", status = "";

  function renderEmptyRow(tbody, colspan, msg) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colspan; td.className = "empty-state"; td.textContent = msg;
    tr.appendChild(td); tbody.appendChild(tr);
  }

  function fmtTotal(order){
    if (typeof window.formatKES === "function") {
      const cents = ("totalCents" in order) ? order.totalCents : ((order.total||0)*100);
      return window.formatKES(cents);
    }
    return typeof order.total === "number" ? `KES ${order.total.toLocaleString()}` : "KES —";
  }

  async function render(){
    const tbody = document.querySelector(tbodySel);
    if (!tbody) return;
    tbody.innerHTML = "";
    try {
      const data = await (window.AdminData && AdminData.fetchOrders ? AdminData.fetchOrders({page, per, q, status}) : Promise.resolve({success:false}));
      const rows = data?.orders || data?.data || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        renderEmptyRow(tbody, 8, "No orders yet.");
        return;
      }
      for (const o of rows){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${o.orderNumber || o.id || "—"}</td>
          <td>${o.fullName || o.customer || "—"}</td>
          <td>${o.phone || "—"}</td>
          <td>${o.email || "—"}</td>
          <td>${o.status || "—"}</td>
          <td>${o.paymentStatus || "—"}</td>
          <td>${fmtTotal(o)}</td>
          <td><button class="btn btn-sm btn-primary" data-orderid="${o.orderNumber || o.id}">Edit</button></td>
        `;
        tbody.appendChild(tr);
      }
    } catch (e) {
      if (tbody) renderEmptyRow(tbody, 8, "Failed to load.");
      console.error("[Orders] render error", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
